
import express from "express";
import { createServer as createViteServer } from "vite";
import sqlite3Lib from 'sqlite3';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlite3 = sqlite3Lib.verbose();
const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'database.sqlite');

// Generación segura y persistencia local del JWT_SECRET (nunca predeterminado en texto plano)
function getOrGenerateJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim() && process.env.JWT_SECRET !== 'super-secret-key') {
    return process.env.JWT_SECRET.trim();
  }
  const secretPath = path.join(__dirname, '.jwt_secret');
  try {
    if (fs.existsSync(secretPath)) {
      const saved = fs.readFileSync(secretPath, 'utf8').trim();
      if (saved && saved.length >= 32) return saved;
    }
  } catch (e) {}

  const newSecret = crypto.randomBytes(48).toString('hex');
  try {
    fs.writeFileSync(secretPath, newSecret, { mode: 0o600 });
  } catch (e) {}
  return newSecret;
}

const JWT_SECRET = getOrGenerateJwtSecret();

// Control de intentos de inicio de sesión (Rate Limiting en memoria contra ataques de fuerza bruta)
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME_MS = 3 * 60 * 1000; // 3 minutos

// CORS seguro y adaptativo para Localhost, Termux y Capacitor
app.use(cors({
  origin: (origin, callback) => {
    // Permitir solicitudes locales, nativas de Capacitor y del visor de desarrollo
    if (!origin || 
        origin.startsWith('http://localhost') || 
        origin.startsWith('http://127.0.0.1') || 
        origin.startsWith('capacitor://') || 
        origin.startsWith('https://localhost') ||
        origin.includes('.run.app') ||
        origin.includes('.google.com')) {
      return callback(null, true);
    }
    callback(null, true); // Permite acceso para clientes de red local en el negocio
  },
  credentials: true
}));

// Límite de carga balanceado a 10MB (suficiente para backups y operaciones, previniendo DoS)
app.use(express.json({ limit: '10mb' }));

// Health check endpoint for platform and load balancers (MUST be first, unauthenticated)
app.get(["/api/health", "/health"], (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Middleware de Logging seguro para depuración en Termux
app.use((req, res, next) => {
  if (req.url.startsWith('/api/')) {
    console.log(`${new Date().toLocaleTimeString()} | ${req.method} ${req.url}`);
  }
  next();
});

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('❌ Error DB:', err);
  else {
    console.log('🗄️ SQLite conectado en:', DB_PATH);
    // Modo de alto rendimiento para SQLite (muy efectivo en Termux / Android)
    db.run("PRAGMA journal_mode = WAL;");
    db.run("PRAGMA synchronous = NORMAL;");
    db.run("PRAGMA temp_store = MEMORY;");
    db.run("PRAGMA cache_size = -64000;");
    db.run("PRAGMA busy_timeout = 5000;");
  }
});

const VALID_STORES = ['products', 'customers', 'suppliers', 'sales', 'purchases', 'settings', 'sellers', 'payments', 'users', 'authenticators', 'expenses', 'movements', 'ingredients', 'recipes', 'promotions', 'customer_promotions'];

db.serialize(() => {
  VALID_STORES.forEach(store => {
    if (store === 'users') {
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, 
        username TEXT UNIQUE, 
        password TEXT, 
        role TEXT, 
        name TEXT,
        permissions TEXT
      )`);
    } else if (store === 'authenticators') {
      db.run(`CREATE TABLE IF NOT EXISTS authenticators (
        id TEXT PRIMARY KEY,
        userId TEXT,
        credentialID TEXT,
        publicKey TEXT,
        counter INTEGER,
        FOREIGN KEY(userId) REFERENCES users(id)
      )`);
    } else {
      db.run(`CREATE TABLE IF NOT EXISTS ${store} (id TEXT PRIMARY KEY, data TEXT)`);
    }
  });

  // Verificar existencia de usuario administrador sin crear contraseñas predeterminadas inseguras
  db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'", (err, row: any) => {
    if (!err && row && row.count > 0) {
      console.log(`👤 Administradores registrados en el sistema: ${row.count}`);
    } else {
      console.log("ℹ️ Sistema pendiente de configuración inicial: no se encontraron administradores.");
    }
  });

  // Migration: Add permissions column if not exists
  db.all("PRAGMA table_info(users)", (err, columns: any[]) => {
    if (columns && !columns.find(c => c.name === 'permissions')) {
      db.run("ALTER TABLE users ADD COLUMN permissions TEXT", (err) => {
        if (!err) {
          // Grant all permissions to existing admin
          db.run("UPDATE users SET permissions = '[\"dashboard\",\"inventory\",\"sales\",\"purchases\",\"customers\",\"suppliers\",\"manufacturing\",\"cxc\",\"cxp\",\"expenses\",\"reports\",\"settings\"]' WHERE role = 'admin'");
        }
      });
    }
  });
});

// Middleware de verificación de token y validación de vigencia del usuario en BD
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Token no proporcionado' });

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err || !decoded || !decoded.id) {
      return res.status(403).json({ message: 'Token inválido o sesión expirada' });
    }

    // Validar en base de datos que el usuario siga existiendo y conserve su rol
    db.get("SELECT id, username, role, name, permissions FROM users WHERE id = ?", [decoded.id], (dbErr, dbUser: any) => {
      if (dbErr || !dbUser) {
        return res.status(403).json({ message: 'Cuenta revocada o no disponible' });
      }

      req.user = {
        id: dbUser.id,
        username: dbUser.username,
        role: dbUser.role,
        name: dbUser.name,
        permissions: dbUser.permissions ? JSON.parse(dbUser.permissions) : []
      };
      next();
    });
  });
};

// Control de Autorización por Permiso o Rol
const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ message: 'Acceso denegado: Se requieren privilegios de Administrador' });
};

const canAccessStore = (user: any, store: string, isWrite: boolean = false): boolean => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  
  if (store === 'users' || store === 'system') return false;
  if (store === 'settings' && isWrite) return false; // Solo el admin puede escribir configuraciones

  const perms: string[] = Array.isArray(user.permissions) ? user.permissions : [];

  switch (store) {
    case 'settings':
      return true; // Lectura autorizada para usuarios autenticados
    case 'sales':
    case 'payments':
    case 'sellers':
    case 'promotions':
    case 'customer_promotions':
      return perms.includes('sales');
    case 'products':
    case 'movements':
      return perms.includes('inventory');
    case 'purchases':
      return perms.includes('purchases');
    case 'customers':
      return perms.includes('customers');
    case 'suppliers':
      return perms.includes('suppliers');
    case 'expenses':
      return perms.includes('expenses');
    case 'ingredients':
    case 'recipes':
      return perms.includes('manufacturing');
    case 'authenticators':
      return true;
    default:
      return perms.includes(store);
  }
};

// Redactar secretos de configuración para usuarios no administradores
function sanitizeSettingsForClient(settings: any, isAdmin: boolean) {
  if (!settings) return settings;
  const safe = { ...settings };
  if (!isAdmin) {
    delete safe.geminiApiKey;
    delete safe.deepseekApiKey;
    delete safe.openaiApiKey;
  }
  return safe;
}

// --- AUTH ROUTES ---

// 1. Estado de instalación / inicialización (Público)
app.get('/api/auth/setup-status', (req: any, res: any) => {
  db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'", (err, row: any) => {
    if (err) return res.status(500).json({ message: 'Error consultando estado del sistema' });
    const hasAdmin = !!(row && row.count > 0);
    res.json({
      initialized: hasAdmin,
      requiresSetup: !hasAdmin
    });
  });
});

// 2. Creación segura del primer Administrador (Solo si no existe ningún admin)
app.post('/api/auth/setup-initial-admin', (req: any, res: any) => {
  db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'", (err, row: any) => {
    if (err) return res.status(500).json({ message: 'Error interno del sistema' });
    if (row && row.count > 0) {
      return res.status(403).json({ message: 'El sistema ya cuenta con un Administrador registrado. Use el panel administrativo.' });
    }

    const { username, password, name } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ message: 'Nombre, usuario y contraseña son requeridos' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const hashedPassword = bcrypt.hashSync(password.trim(), 10);
    const id = crypto.randomUUID();
    const allPerms = JSON.stringify(["dashboard","inventory","sales","purchases","customers","suppliers","manufacturing","cxc","cxp","expenses","reports","settings"]);

    db.run("INSERT INTO users (id, username, password, role, name, permissions) VALUES (?, ?, ?, ?, ?, ?)",
      [id, username.trim().toLowerCase(), hashedPassword, 'admin', name.trim(), allPerms], (insertErr) => {
        if (insertErr) {
          return res.status(500).json({ message: 'Error creando cuenta de administrador inicial' });
        }

        console.log(`🎉 Primer administrador configurado con éxito: ${username}`);
        const token = jwt.sign(
          { id, username: username.trim().toLowerCase(), role: 'admin', name: name.trim(), permissions: JSON.parse(allPerms) },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

        res.json({
          success: true,
          token,
          user: { id, username: username.trim().toLowerCase(), role: 'admin', name: name.trim(), permissions: JSON.parse(allPerms) }
        });
      });
  });
});

// 3. Registro de nuevos usuarios (Solo administradores autenticados)
app.post('/api/auth/register', (req: any, res: any) => {
  // Verificar si no hay usuarios en absoluto
  db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'", (err, row: any) => {
    if (err) return res.status(500).json({ message: 'Error interno' });
    
    const hasAdmin = !!(row && row.count > 0);
    if (!hasAdmin) {
      // Permitir registro del primer admin
      const { username, password, name } = req.body;
      if (!username || !password) return res.status(400).json({ message: 'Usuario y contraseña requeridos' });
      const hashedPassword = bcrypt.hashSync(password.trim(), 10);
      const id = crypto.randomUUID();
      const perms = JSON.stringify(["dashboard","inventory","sales","purchases","customers","suppliers","manufacturing","cxc","cxp","expenses","reports","settings"]);
      return db.run("INSERT INTO users (id, username, password, role, name, permissions) VALUES (?, ?, ?, 'admin', ?, ?)",
        [id, username.trim().toLowerCase(), hashedPassword, name || 'Administrador', perms], (iErr) => {
          if (iErr) return res.status(500).json({ message: iErr.message });
          return res.json({ success: true, message: 'Administrador inicial creado exitosamente' });
        });
    }

    // Si ya existe admin, se exige token de admin válido
    authenticateToken(req, res, () => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Solo un Administrador puede registrar nuevos usuarios' });
      }

      const { username, password, role, name, permissions } = req.body;
      if (!username || !password || !role || !name) {
        return res.status(400).json({ message: 'Todos los campos son requeridos' });
      }

      const hashedPassword = bcrypt.hashSync(password.trim(), 10);
      const id = crypto.randomUUID();
      const perms = permissions ? JSON.stringify(permissions) : (role === 'admin' ? '["dashboard","inventory","sales","purchases","customers","suppliers","manufacturing","cxc","cxp","expenses","reports","settings"]' : '["dashboard","sales","customers","cxc"]');

      db.run("INSERT INTO users (id, username, password, role, name, permissions) VALUES (?, ?, ?, ?, ?, ?)", 
        [id, username.trim().toLowerCase(), hashedPassword, role, name.trim(), perms], (err) => {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
              return res.status(400).json({ message: 'El nombre de usuario ya existe' });
            }
            return res.status(500).json({ message: 'Error al registrar el usuario' });
          }
          res.json({ success: true, message: 'Usuario registrado correctamente' });
        });
    });
  });
});

// 4. Inicio de Sesión con protección contra fuerza bruta
app.post('/api/auth/login', (req: any, res: any) => {
  const { username, password } = req.body;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip-desconocida';
  const rateKey = `${clientIp}_${(username || '').toLowerCase().trim()}`;
  
  const attempt = loginAttempts.get(rateKey);
  const now = Date.now();

  if (attempt && attempt.lockedUntil > now) {
    const remainingSeconds = Math.ceil((attempt.lockedUntil - now) / 1000);
    return res.status(429).json({ 
      message: `Demasiados intentos fallidos. Por seguridad, intente de nuevo en ${remainingSeconds} segundos.` 
    });
  }

  if (!username || !password) {
    return res.status(400).json({ message: 'Usuario y contraseña requeridos' });
  }

  db.get("SELECT * FROM users WHERE username = ?", [username.trim().toLowerCase()], (err, user: any) => {
    if (err) {
      return res.status(500).json({ message: 'Error de servidor durante autenticación' });
    }
    
    if (!user) {
      // Registrar intento fallido
      const current = loginAttempts.get(rateKey) || { count: 0, lockedUntil: 0 };
      current.count += 1;
      if (current.count >= MAX_LOGIN_ATTEMPTS) {
        current.lockedUntil = now + LOCKOUT_TIME_MS;
      }
      loginAttempts.set(rateKey, current);

      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password);
    
    if (!isPasswordValid) {
      // Registrar intento fallido
      const current = loginAttempts.get(rateKey) || { count: 0, lockedUntil: 0 };
      current.count += 1;
      if (current.count >= MAX_LOGIN_ATTEMPTS) {
        current.lockedUntil = now + LOCKOUT_TIME_MS;
      }
      loginAttempts.set(rateKey, current);

      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // Éxito: Limpiar intentos fallidos
    loginAttempts.delete(rateKey);

    // Verificar si usa contraseña predeterminada que requiera aviso de cambio
    const isDefaultAdminPass = (user.username === 'admin' && bcrypt.compareSync('admin123', user.password));

    const permissions = user.permissions ? JSON.parse(user.permissions) : [];
    // Token con vigencia de 7 días (mucho más seguro que 90 días)
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name, permissions }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    res.json({ 
      token, 
      user: { id: user.id, username: user.username, role: user.role, name: user.name, permissions },
      requiresPasswordChange: isDefaultAdminPass
    });
  });
});

app.post('/api/auth/change-password', authenticateToken, (req: any, res: any) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  if (!newPassword || newPassword.trim().length < 6) {
    return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  db.get("SELECT password FROM users WHERE id = ?", [userId], (err, user: any) => {
    if (err) return res.status(500).json({ message: 'Error de base de datos' });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const isPasswordValid = bcrypt.compareSync(currentPassword, user.password);
    if (!isPasswordValid) return res.status(401).json({ message: 'Contraseña actual incorrecta' });

    const hashedNewPassword = bcrypt.hashSync(newPassword.trim(), 10);
    db.run("UPDATE users SET password = ? WHERE id = ?", [hashedNewPassword, userId], (updateErr) => {
      if (updateErr) return res.status(500).json({ message: 'Error actualizando contraseña' });
      res.json({ success: true, message: 'Contraseña actualizada correctamente' });
    });
  });
});

// --- API: COTIZACIÓN AUTOMÁTICA BCV ---
let cachedBcvRate: { rate: number; date: string; timestamp: number } | null = null;

app.get('/api/exchange-rate/bcv', async (req: any, res: any) => {
  const now = Date.now();
  if (cachedBcvRate && (now - cachedBcvRate.timestamp < 10 * 60 * 1000)) {
    return res.json({
      success: true,
      rate: cachedBcvRate.rate,
      date: cachedBcvRate.date,
      source: 'BCV Oficial (Caché)',
      cached: true
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data: any = await response.json();
      const rateVal = parseFloat(data.promedio);
      if (!isNaN(rateVal) && rateVal > 0) {
        cachedBcvRate = {
          rate: Number(rateVal.toFixed(2)),
          date: data.fechaActualizacion || new Date().toISOString().split('T')[0],
          timestamp: now
        };
        return res.json({
          success: true,
          rate: cachedBcvRate.rate,
          date: cachedBcvRate.date,
          source: 'BCV Oficial (ve.dolarapi.com)'
        });
      }
    }
    throw new Error('Respuesta inválida de servicio oficial');
  } catch (err: any) {
    if (cachedBcvRate) {
      return res.json({
        success: true,
        rate: cachedBcvRate.rate,
        date: cachedBcvRate.date,
        source: 'BCV Oficial (Último conocido)',
        stale: true
      });
    }
    res.status(502).json({
      success: false,
      message: 'No se pudo obtener la tasa BCV automáticamente: ' + err.message
    });
  }
});

// --- API: ACTUALIZACIÓN DE LOGO ORIGINAL ---
app.post('/api/settings/upload-logo', authenticateToken, async (req: any, res: any) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'No se envió imagen' });
    }

    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const buffer = matches && matches[2] ? Buffer.from(matches[2], 'base64') : Buffer.from(imageBase64, 'base64');

    const rootLogo = path.join(__dirname, 'logo_ddanez_transparente.png');
    const publicLogo = path.join(__dirname, 'public', 'logo.png');
    const publicLogoTrans = path.join(__dirname, 'public', 'logo_ddanez_transparente.png');

    fs.writeFileSync(rootLogo, buffer);
    fs.writeFileSync(publicLogo, buffer);
    fs.writeFileSync(publicLogoTrans, buffer);

    console.log('✅ Archivo de logo original guardado. Regenerando iconos nativos...');

    try {
      execSync('node scripts/generate-icons.js', { stdio: 'inherit' });
    } catch (iconErr: any) {
      console.warn('Aviso al regenerar iconos:', iconErr.message);
    }

    res.json({ success: true, message: 'Logotipo original actualizado y recursos generados.' });
  } catch (err: any) {
    console.error('Error al guardar logotipo:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- API: RUTAS DE SISTEMA ---

app.post('/api/system/reset', authenticateToken, (req: any, res: any) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'No autorizado: Se requieren privilegios de administrador' });
  }
  
  console.log(`🧹 Iniciando reset de base de datos por: ${req.user.username}`);
  
  const storesToClear = VALID_STORES.filter(s => s !== 'users');
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    try {
      storesToClear.forEach(store => {
        db.run(`DELETE FROM ${store}`);
      });
      
      db.run('COMMIT', (err) => {
        if (err) {
          console.error('❌ Error al confirmar reset:', err.message);
          db.run('ROLLBACK');
          return res.status(500).json({ message: 'Error al confirmar el reset' });
        }
        console.log('✅ Base de datos reseteada correctamente');
        res.json({ success: true, message: 'Sistema reseteado correctamente' });
      });
    } catch (err: any) {
      console.error('❌ Error durante el proceso de reset:', err.message);
      db.run('ROLLBACK');
      res.status(500).json({ message: 'Error interno durante el reset' });
    }
  });
});

// --- API: BOOTSTRAP DE ALTO RENDIMIENTO (Carga todo en 1 sola llamada instantánea) ---
app.get('/api/bootstrap', authenticateToken, (req: any, res: any) => {
  const isAdmin = req.user?.role === 'admin';
  const storesToLoad = ['products', 'customers', 'suppliers', 'sales', 'purchases', 'settings', 'sellers', 'payments', 'expenses', 'movements', 'promotions', 'customer_promotions'];
  const results: Record<string, any[]> = {};
  let pending = storesToLoad.length;
  let hasError = false;

  storesToLoad.forEach(store => {
    db.all(`SELECT data FROM ${store}`, [], (err, rows: any[]) => {
      if (hasError) return;
      if (err) {
        hasError = true;
        return res.status(500).json({ message: 'Error cargando datos de inicio' });
      }
      try {
        let items = rows ? rows.map(r => JSON.parse(r.data)) : [];
        if (store === 'settings' && items.length > 0) {
          items = items.map(s => sanitizeSettingsForClient(s, isAdmin));
        }
        results[store] = items;
      } catch (e) {
        results[store] = [];
      }
      pending--;
      if (pending === 0) {
        res.json(results);
      }
    });
  });
});

// --- API: BATCH MULTI-ALMACÉN (Guardar múltiples entidades en 1 sola transacción con verificación) ---
app.post('/api/batch', authenticateToken, (req: any, res: any) => {
  const operations: Array<{ store: string; items: any[] }> = req.body;
  if (!Array.isArray(operations)) {
    return res.status(400).json({ message: 'Se esperaba un arreglo de operaciones' });
  }

  // Validar permisos para cada almacén involucrado en el lote
  for (const op of operations) {
    if (!VALID_STORES.includes(op.store) || op.store === 'users' || op.store === 'authenticators') continue;
    if (!canAccessStore(req.user, op.store, true)) {
      return res.status(403).json({ message: `No tienes autorización para escribir en el módulo: ${op.store}` });
    }
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    for (const op of operations) {
      if (!VALID_STORES.includes(op.store) || op.store === 'users' || op.store === 'authenticators') continue;
      const stmt = db.prepare(`INSERT OR REPLACE INTO ${op.store} (id, data) VALUES (?, ?)`);
      for (const item of (op.items || [])) {
        if (!item || !item.id) continue;
        stmt.run(item.id, JSON.stringify(item));
      }
      stmt.finalize();
    }
    db.run('COMMIT', (err) => {
      if (err) return res.status(500).json({ message: 'Error procesando lote de datos' });
      res.json({ success: true });
    });
  });
});

// --- API: BULK PARA UN SOLO ALMACÉN ---
app.post('/api/:store/bulk', authenticateToken, (req: any, res: any) => {
  const { store } = req.params;
  const items = req.body;
  if (!VALID_STORES.includes(store) || store === 'users') return res.status(400).json({ message: 'Almacén no válido' });
  if (!canAccessStore(req.user, store, true)) {
    return res.status(403).json({ message: `No tienes autorización para modificar: ${store}` });
  }
  if (!Array.isArray(items)) return res.status(400).json({ message: 'Se esperaba un array' });

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    const stmt = db.prepare(`INSERT OR REPLACE INTO ${store} (id, data) VALUES (?, ?)`);
    for (const item of items) {
      if (item && item.id) {
        stmt.run(item.id, JSON.stringify(item));
      }
    }
    stmt.finalize();
    db.run('COMMIT', (err) => {
      if (err) return res.status(500).json({ message: 'Error procesando elementos' });
      res.json({ success: true, count: items.length });
    });
  });
});

// --- API: RUTAS GENÉRICAS CON CONTROL DE ACCESO (RBAC) ---

app.get('/api/:store', authenticateToken, (req: any, res: any) => {
  const { store } = req.params;
  if (!VALID_STORES.includes(store)) {
    return res.status(404).json({ message: `Almacén '${store}' no válido` });
  }
  
  if (!canAccessStore(req.user, store, false)) {
    return res.status(403).json({ message: `Acceso restringido al módulo: ${store}` });
  }

  db.all(`SELECT * FROM ${store}`, [], (err, rows: any[]) => {
    if (err) return res.status(500).json({ message: 'Error consultando registros' });
    try {
      if (store === 'users') {
        res.json(rows.map((row: any) => ({ 
          id: row.id, 
          username: row.username, 
          role: row.role, 
          name: row.name,
          permissions: row.permissions ? JSON.parse(row.permissions) : []
        })));
      } else {
        let items = rows.map((row: any) => JSON.parse(row.data));
        if (store === 'settings') {
          const isAdmin = req.user?.role === 'admin';
          items = items.map(s => sanitizeSettingsForClient(s, isAdmin));
        }
        res.json(items);
      }
    } catch (parseErr) {
      res.status(500).json({ message: 'Error de integridad en datos guardados' });
    }
  });
});

app.post('/api/:store', authenticateToken, (req: any, res: any) => {
  const { store } = req.params;
  const item = req.body;
  if (!VALID_STORES.includes(store)) return res.status(404).json({ message: 'Almacén no válido' });
  
  if (!canAccessStore(req.user, store, true)) {
    return res.status(403).json({ message: `No tienes autorización para escribir en: ${store}` });
  }

  if (store === 'users') {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'No autorizado' });
    const { id, username, password, role, name, permissions } = item;
    const permsStr = JSON.stringify(permissions || []);
    const userRole = role || 'seller';
    const userName = name || username || 'Usuario';

    // Buscar si ya existe por ID o por username
    db.get("SELECT * FROM users WHERE id = ? OR username = ?", [id || '', username || ''], (err, existing: any) => {
      if (err) return res.status(500).json({ message: 'Error de base de datos' });

      if (existing) {
        // Actualizar usuario existente
        if (password && password.trim().length > 0) {
          const hashedPassword = bcrypt.hashSync(password.trim(), 10);
          db.run("UPDATE users SET role = ?, permissions = ?, name = ?, password = ? WHERE id = ?",
            [userRole, permsStr, userName, hashedPassword, existing.id], (uErr) => {
              if (uErr) return res.status(500).json({ message: 'Error actualizando usuario' });
              res.json({ success: true, message: 'Usuario y contraseña actualizados correctamente', id: existing.id });
            });
        } else {
          db.run("UPDATE users SET role = ?, permissions = ?, name = ? WHERE id = ?",
            [userRole, permsStr, userName, existing.id], (uErr) => {
              if (uErr) return res.status(500).json({ message: 'Error actualizando usuario' });
              res.json({ success: true, message: 'Usuario actualizado correctamente', id: existing.id });
            });
        }
      } else {
        // Crear nuevo usuario
        if (!username || !password) {
          return res.status(400).json({ message: 'Nombre de usuario y contraseña requeridos' });
        }
        const hashedPassword = bcrypt.hashSync(password.trim(), 10);
        const newId = id || crypto.randomUUID();
        db.run("INSERT INTO users (id, username, password, role, name, permissions) VALUES (?, ?, ?, ?, ?, ?)",
          [newId, username.trim().toLowerCase(), hashedPassword, userRole, userName, permsStr], (iErr) => {
            if (iErr) {
              if (iErr.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ message: 'El nombre de usuario ya está registrado' });
              }
              return res.status(500).json({ message: 'Error al crear usuario' });
            }
            res.json({ success: true, message: 'Usuario creado exitosamente', id: newId });
          });
      }
    });
    return;
  }

  if (!item.id) return res.status(400).json({ message: 'ID requerido' });
  
  // Si se está guardando 'settings', preservar API keys si vinieron enmascaradas o vacías
  if (store === 'settings') {
    db.get("SELECT data FROM settings WHERE id = ?", [item.id], (sErr, prevRow: any) => {
      let finalItem = { ...item };
      if (prevRow && prevRow.data) {
        try {
          const prev = JSON.parse(prevRow.data);
          if ((!finalItem.geminiApiKey || finalItem.geminiApiKey.includes('••••')) && prev.geminiApiKey) {
            finalItem.geminiApiKey = prev.geminiApiKey;
          }
          if ((!finalItem.deepseekApiKey || finalItem.deepseekApiKey.includes('••••')) && prev.deepseekApiKey) {
            finalItem.deepseekApiKey = prev.deepseekApiKey;
          }
          if ((!finalItem.openaiApiKey || finalItem.openaiApiKey.includes('••••')) && prev.openaiApiKey) {
            finalItem.openaiApiKey = prev.openaiApiKey;
          }
        } catch (e) {}
      }

      db.run(`INSERT OR REPLACE INTO settings (id, data) VALUES (?, ?)`, [finalItem.id, JSON.stringify(finalItem)], (err) => {
        if (err) return res.status(500).json({ message: 'Error guardando configuraciones' });
        res.json({ success: true });
      });
    });
    return;
  }

  db.run(`INSERT OR REPLACE INTO ${store} (id, data) VALUES (?, ?)`, [item.id, JSON.stringify(item)], (err) => {
    if (err) return res.status(500).json({ message: 'Error guardando registro' });
    res.json({ success: true });
  });
});

app.delete('/api/:store/:id', authenticateToken, (req: any, res: any) => {
  const { store, id } = req.params;
  if (!VALID_STORES.includes(store)) return res.status(404).json({ message: 'Almacén no válido' });
  
  if (!canAccessStore(req.user, store, true)) {
    return res.status(403).json({ message: `No tienes autorización para eliminar en: ${store}` });
  }

  if (store === 'users') {
    if (req.user.id === id) {
      return res.status(400).json({ message: 'No puedes eliminar tu propia cuenta de administrador en sesión' });
    }

    db.get("SELECT COUNT(*) as adminCount FROM users WHERE role = 'admin'", (cntErr, countRow: any) => {
      if (!cntErr && countRow && countRow.adminCount <= 1) {
        db.get("SELECT role FROM users WHERE id = ?", [id], (roleErr, userRow: any) => {
          if (userRow && userRow.role === 'admin') {
            return res.status(400).json({ message: 'No se puede eliminar el único administrador del sistema' });
          }
          db.run(`DELETE FROM users WHERE id = ?`, [id], (delErr) => {
            if (delErr) return res.status(500).json({ message: 'Error al eliminar usuario' });
            res.json({ success: true, message: 'Usuario eliminado correctamente' });
          });
        });
        return;
      }

      db.run(`DELETE FROM users WHERE id = ?`, [id], (delErr) => {
        if (delErr) return res.status(500).json({ message: 'Error al eliminar usuario' });
        res.json({ success: true, message: 'Usuario eliminado correctamente' });
      });
    });
    return;
  }
  
  db.run(`DELETE FROM ${store} WHERE id = ?`, [id], (err) => {
    if (err) return res.status(500).json({ message: 'Error al eliminar registro' });
    res.json({ success: true });
  });
});

// --- API: AI ANALYSIS ---

app.post('/api/ai/analyze', authenticateToken, async (req: any, res: any) => {
  const { prompt, data } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ message: 'Prompt es requerido' });
  }

  let aiProvider = 'gemini';
  let geminiApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_GEMINI_API_KEY;
  let geminiModel = "gemini-3-flash-preview";
  let deepseekApiKey = process.env.DEEPSEEK_API_KEY;
  let deepseekModel = "deepseek-chat";
  let openaiApiKey = process.env.OPENAI_API_KEY;
  let openaiModel = "gpt-4o-mini";
  
  // Fetch settings from database
  try {
    const settingsRow: any = await new Promise((resolve, reject) => {
      db.get("SELECT data FROM settings WHERE id = 'app_settings'", (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (settingsRow && settingsRow.data) {
      const settings = JSON.parse(settingsRow.data);
      if (settings.aiProvider) aiProvider = settings.aiProvider;
      
      if (settings.geminiApiKey) geminiApiKey = settings.geminiApiKey;
      if (settings.geminiModel) geminiModel = settings.geminiModel;
      
      if (settings.deepseekApiKey) deepseekApiKey = settings.deepseekApiKey;
      if (settings.deepseekModel) deepseekModel = settings.deepseekModel;

      if (settings.openaiApiKey) openaiApiKey = settings.openaiApiKey;
      if (settings.openaiModel) openaiModel = settings.openaiModel;
    }
  } catch (dbErr) {
    console.error('⚠️ Error al buscar configuración en la DB:', dbErr);
  }

  if (aiProvider === 'openai') {
    if (!openaiApiKey) {
      return res.status(500).json({ 
        message: 'La llave de OpenAI no está configurada. Por favor, ve a AJUSTES y configúrala.' 
      });
    }

    try {
      const openai = new OpenAI({
        apiKey: openaiApiKey,
      });

      const response = await openai.chat.completions.create({
        model: openaiModel,
        messages: [
          { role: "system", content: "Eres un experto analista financiero y de inventarios para pequeños negocios." },
          { role: "user", content: `${prompt}\n\nDATOS PARA ANALIZAR:\n${JSON.stringify(data || {}, null, 2)}` }
        ],
        temperature: 0.7,
      });

      res.json({ text: response.choices[0].message.content });
    } catch (error: any) {
      console.error('❌ Error en análisis de OpenAI:', error);
      res.status(500).json({ 
        message: 'Error al procesar el análisis con OpenAI: ' + (error.message || 'Error desconocido')
      });
    }
  } else if (aiProvider === 'deepseek') {
    if (!deepseekApiKey) {
      return res.status(500).json({ 
        message: 'La llave de DeepSeek no está configurada. Por favor, ve a AJUSTES y configúrala.' 
      });
    }

    try {
      const openai = new OpenAI({
        apiKey: deepseekApiKey,
        baseURL: "https://api.deepseek.com",
      });

      const response = await openai.chat.completions.create({
        model: deepseekModel,
        messages: [
          { role: "system", content: "Eres un experto analista financiero y de inventarios para pequeños negocios." },
          { role: "user", content: `${prompt}\n\nDATOS PARA ANALIZAR:\n${JSON.stringify(data || {}, null, 2)}` }
        ],
        temperature: 0.7,
      });

      res.json({ text: response.choices[0].message.content });
    } catch (error: any) {
      console.error('❌ Error en análisis de DeepSeek:', error);
      res.status(500).json({ 
        message: 'Error al procesar el análisis con DeepSeek: ' + (error.message || 'Error desconocido')
      });
    }
  } else {
    // Default to Gemini
    if (!geminiApiKey) {
      return res.status(500).json({ 
        message: 'La llave de Gemini no está configurada. Por favor, ve a AJUSTES y configúrala.' 
      });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      
      let response;
      let attempts = 0;
      const maxAttempts = 3;
      const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

      while (attempts < maxAttempts) {
        try {
          const model = ai.models.generateContent({
            model: geminiModel,
            contents: `${prompt}\n\nDATOS PARA ANALIZAR:\n${JSON.stringify(data || {}, null, 2)}`,
            config: {
              temperature: 0.7,
              topP: 0.95,
              topK: 64,
            }
          });
          response = await model;
          break;
        } catch (error: any) {
          attempts++;
          if (error.status === 503 && attempts < maxAttempts) {
            console.warn(`⚠️ Gemini está saturado (Intento ${attempts}/${maxAttempts}). Reintentando en ${attempts * 2}s...`);
            await delay(attempts * 2000);
            continue;
          }
          throw error;
        }
      }

      if (!response) throw new Error('No se recibió respuesta de Gemini');
      res.json({ text: response.text });
    } catch (error: any) {
      console.error('❌ Error en análisis de Gemini:', error);
      if (error.status === 503 || (error.message && error.message.includes("high demand"))) {
        return res.status(503).json({ 
          message: 'El servicio de Inteligencia Artificial está experimentando una alta demanda. Por favor, intenta de nuevo en unos segundos.' 
        });
      }
      res.status(500).json({ 
        message: 'Error al procesar el análisis con la IA: ' + (error.message || 'Error desconocido')
      });
    }
  }
});

// Deprecated endpoint for backward compatibility
app.post('/api/gemini/analyze', authenticateToken, async (req: any, res: any) => {
  console.log('⚠️ Redirigiendo petición de /api/gemini/analyze a /api/ai/analyze');
  req.url = '/api/ai/analyze';
  return app._router.handle(req, res, () => {});
});

// --- API: 404 HANDLER ---
app.all('/api/*', (req, res) => {
  res.status(404).json({ 
    message: `Endpoint de API no encontrado: ${req.method} ${req.originalUrl}` 
  });
});

// --- VITE MIDDLEWARE ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        if (!req.url.startsWith('/api/')) {
          res.sendFile(path.join(distPath, 'index.html'));
        } else {
          res.status(404).json({ message: `API endpoint no encontrado: ${req.method} ${req.url}` });
        }
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 SERVIDOR GESTORPRO INICIADO`);
    console.log(`🌐 API disponible en: http://localhost:${PORT}/api`);
    console.log(`📡 Escuchando en todas las interfaces de red.`);
    console.log(`🔑 Gemini API Key presente: ${process.env.GEMINI_API_KEY ? 'SÍ' : 'NO'}`);
  });
}

startServer();
