
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  User, Lock, Loader2, LogIn, ShieldCheck, ShieldAlert, Smartphone, 
  Fingerprint, HelpCircle, KeyRound, CheckCircle2, X, Info, 
  ArrowRight, Users
} from 'lucide-react';
import { User as UserType, AppTab } from '../types';
import { dbService } from '../db';
import { 
  checkBiometricAvailability, 
  authenticateWithBiometrics, 
  getBiometricConfiguredUser, 
  setBiometricEnabled, 
  isBiometricAutoPromptEnabled 
} from '../biometricHelper';
import { Capacitor } from '@capacitor/core';

// Utilidad para hashing criptográfico seguro en el navegador (Web Crypto API)
async function hashPasswordWithSalt(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${password}`);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface AuthProps {
  onLogin: (user: UserType) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [isBiometricPrompting, setIsBiometricPrompting] = useState(false);
  const hasAutoPromptedRef = useRef(false);

  // Modo de configuración inicial segura si no existe ningún administrador
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [setupData, setSetupData] = useState({
    name: '',
    username: '',
    password: '',
    confirmPassword: ''
  });
  
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });

  // Verificar estado de inicialización al cargar
  useEffect(() => {
    let isMounted = true;
    const checkInit = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch('/api/auth/setup-status', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.requiresSetup) {
            setIsSetupMode(true);
            return;
          }
        }
      } catch (e) {
        // En modo offline, verificar si hay usuarios guardados en este dispositivo
        const saved = localStorage.getItem('local_users');
        if (!saved || JSON.parse(saved).length === 0) {
          if (isMounted) setIsSetupMode(true);
        }
      }
    };
    checkInit();
    return () => { isMounted = false; };
  }, []);

  // Estado para Modal de Asistencia y Recuperación de Credenciales
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryTab, setRecoveryTab] = useState<'seller' | 'admin'>('seller');
  const [knownUsers, setKnownUsers] = useState<Array<{ username: string; name: string; role: string }>>([]);

  const openRecoveryModal = () => {
    let localUsers: any[] = [];
    const saved = localStorage.getItem('local_users');
    if (saved) {
      try { localUsers = JSON.parse(saved); } catch { localUsers = []; }
    }
    const cleanList = localUsers.map((u: any) => ({
      username: u.username || '',
      name: u.name || u.username || '',
      role: u.role || 'seller'
    })).filter(u => u.username);
    setKnownUsers(cleanList);
    setShowRecoveryModal(true);
  };

  const handleBiometricAuth = useCallback(async (isAuto = false) => {
    if (isBiometricPrompting) return;
    setIsBiometricPrompting(true);
    setError('');

    try {
      const res = await authenticateWithBiometrics("Toca el sensor de huella digital para ingresar a Gestor Pro");
      if (res.success) {
        // Encontrar el usuario para iniciar sesión
        let targetUser: UserType | null = null;
        
        let localUsers: any[] = [];
        const saved = localStorage.getItem('local_users');
        if (saved) {
          try {
            localUsers = JSON.parse(saved);
          } catch {
            localUsers = [];
          }
        }

        const bioUser = getBiometricConfiguredUser();
        if (bioUser) {
          const matched = localUsers.find(u => u.username?.toLowerCase() === bioUser.toLowerCase());
          if (matched) targetUser = matched;
        }

        if (!targetUser) {
          const savedUserStr = localStorage.getItem('user_data');
          if (savedUserStr) {
            try {
              const parsed = JSON.parse(savedUserStr);
              const matched = localUsers.find(u => u.username?.toLowerCase() === parsed.username?.toLowerCase());
              if (matched) targetUser = matched;
              else targetUser = parsed;
            } catch {}
          }
        }

        if (!targetUser && localUsers.length > 0) {
          targetUser = localUsers[0];
        }

        if (!targetUser) {
          setError('No hay ningún usuario vinculado a la huella digital en este equipo.');
          return;
        }

        const { password, passwordHash, salt, ...safeUser } = (targetUser as any);
        const token = (targetUser as any).token || localStorage.getItem('auth_token') || 'local-offline-token';
        const userWithToken: UserType = { ...safeUser, token };

        localStorage.setItem('auth_token', token);
        localStorage.setItem('user_data', JSON.stringify(safeUser));
        setBiometricEnabled(safeUser.username, true);
        dbService.setToken(token);
        onLogin(userWithToken);
      } else if (res.error && !res.error.toLowerCase().includes('cancel') && !isAuto) {
        setError(res.error);
      }
    } catch (err: any) {
      console.warn("Error en autenticación biométrica:", err);
      if (!isAuto) {
        setError("Error con el sensor de huella. Intente de nuevo o use contraseña.");
      }
    } finally {
      setIsBiometricPrompting(false);
    }
  }, [isBiometricPrompting, onLogin]);

  useEffect(() => {
    let isMounted = true;
    const initBiometrics = async () => {
      try {
        const bio = await checkBiometricAvailability();
        const isNative = Capacitor.isNativePlatform();
        if (!isMounted) return;

        if (bio.isAvailable || isNative) {
          setBiometricAvailable(true);

          // Disparar automáticamente la solicitud de huella al abrir la app si está en modo login
          if (!hasAutoPromptedRef.current && isBiometricAutoPromptEnabled() && !isSetupMode) {
            hasAutoPromptedRef.current = true;
            setTimeout(() => {
              if (isMounted) {
                handleBiometricAuth(true);
              }
            }, 350);
          }
        }
      } catch (err) {
        console.warn("Error verificando biometría:", err);
      }
    };

    initBiometrics();
    return () => { isMounted = false; };
  }, [handleBiometricAuth, isSetupMode]);

  // Autenticación local segura (usando hash SHA-256 con salt, nunca contraseñas en texto plano)
  const handleLocalAuth = async () => {
    try {
      let localUsers: any[] = [];
      const saved = localStorage.getItem('local_users');
      if (saved) {
        try {
          localUsers = JSON.parse(saved);
        } catch (e) {
          localUsers = [];
        }
      }

      if (localUsers.length === 0) {
        setError('No hay usuarios configurados en este dispositivo. Configure el Administrador Inicial.');
        setIsSetupMode(true);
        return false;
      }

      const inputUser = formData.username.trim().toLowerCase();
      const matched = localUsers.find(
        u => (u.username || '').toLowerCase() === inputUser
      );

      if (!matched) {
        setError('Credenciales inválidas');
        return false;
      }

      let isValid = false;

      // 1. Verificación segura con hash y salt
      if (matched.passwordHash && matched.salt) {
        const inputHash = await hashPasswordWithSalt(formData.password, matched.salt);
        isValid = (inputHash === matched.passwordHash);
      } 
      // 2. Migración transparente de usuarios antiguos con texto plano (se convierte de inmediato a hash con salt)
      else if (matched.password && matched.password === formData.password) {
        isValid = true;
        const newSalt = window.crypto.randomUUID();
        matched.passwordHash = await hashPasswordWithSalt(formData.password, newSalt);
        matched.salt = newSalt;
        delete matched.password; // Eliminar texto plano para siempre
        localStorage.setItem('local_users', JSON.stringify(localUsers));
      }

      if (isValid) {
        const { password, passwordHash, salt, ...safeUser } = matched;
        const userWithToken: UserType = { ...safeUser, token: 'local-offline-token' };
        localStorage.setItem('auth_token', 'local-offline-token');
        localStorage.setItem('user_data', JSON.stringify(safeUser));
        dbService.setToken('local-offline-token');
        onLogin(userWithToken);
        return true;
      } else {
        setError('Credenciales inválidas');
        return false;
      }
    } catch (e: any) {
      setError(e.message || 'Error en autenticación local');
      return false;
    }
  };

  // Manejo de la configuración inicial del Administrador
  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!setupData.name.trim() || !setupData.username.trim() || !setupData.password) {
      setError('Todos los campos son obligatorios');
      return;
    }

    if (setupData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (setupData.password !== setupData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Intentar registrar en el servidor
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch('/api/auth/setup-initial-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: setupData.name.trim(),
          username: setupData.username.trim().toLowerCase(),
          password: setupData.password
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      let token = 'local-offline-token';
      let userObj: UserType;

      if (response.ok) {
        const data = await response.json();
        token = data.token;
        userObj = data.user;
      } else {
        // Si el servidor ya tenía admin o rechazó
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al configurar en el servidor');
      }

      // Guardar perfil offline seguro con hash y salt
      const salt = window.crypto.randomUUID();
      const passwordHash = await hashPasswordWithSalt(setupData.password, salt);
      const localUser = {
        ...userObj,
        salt,
        passwordHash
      };

      localStorage.setItem('local_users', JSON.stringify([localUser]));
      localStorage.setItem('auth_token', token);
      localStorage.setItem('user_data', JSON.stringify(userObj));
      dbService.setToken(token);
      onLogin(userObj);
    } catch (err: any) {
      // Si el servidor no está disponible (modo APK autónomo sin servidor Termux encendido)
      if (err.name === 'AbortError' || (err.message && err.message.includes('fetch'))) {
        const salt = window.crypto.randomUUID();
        const passwordHash = await hashPasswordWithSalt(setupData.password, salt);
        const allPerms = Object.values(AppTab);
        const localAdmin: UserType & { salt: string; passwordHash: string } = {
          id: window.crypto.randomUUID(),
          name: setupData.name.trim(),
          username: setupData.username.trim().toLowerCase(),
          role: 'admin',
          permissions: allPerms,
          token: 'local-offline-token',
          salt,
          passwordHash
        };

        const { salt: s, passwordHash: ph, ...safeAdmin } = localAdmin;
        localStorage.setItem('local_users', JSON.stringify([localAdmin]));
        localStorage.setItem('auth_token', 'local-offline-token');
        localStorage.setItem('user_data', JSON.stringify(safeAdmin));
        dbService.setToken('local-offline-token');
        onLogin(safeAdmin);
      } else {
        setError(err.message || 'Error al crear la cuenta de administrador');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const endpoint = '/api/auth/login';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    let isServerUnreachable = false;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await response.json();

        // Si el servidor respondió con error de credenciales (401, 403, 429), MOSTRAR ERROR DIRECTO Y NO HACER FALLBACK LOCAL
        if (!response.ok) {
          setError(data.message || 'Usuario o contraseña incorrectos');
          setIsLoading(false);
          return;
        }

        const userWithToken = { ...data.user, token: data.token };
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user_data', JSON.stringify(data.user));
        
        // Guardar copia local segura con hash y salt (NUNCA contraseña en texto plano)
        try {
          const salt = window.crypto.randomUUID();
          const passwordHash = await hashPasswordWithSalt(formData.password, salt);
          const saved = localStorage.getItem('local_users');
          let localUsers = saved ? JSON.parse(saved) : [];
          const idx = localUsers.findIndex((u: any) => (u.username || '').toLowerCase() === data.user.username.toLowerCase());
          const toSave = { 
            id: data.user.id,
            username: data.user.username,
            name: data.user.name,
            role: data.user.role,
            permissions: data.user.permissions,
            salt,
            passwordHash 
          };
          if (idx >= 0) localUsers[idx] = toSave;
          else localUsers.push(toSave);
          localStorage.setItem('local_users', JSON.stringify(localUsers));
        } catch (e) {}

        dbService.setToken(data.token);
        onLogin(userWithToken);
        return;
      } else {
        isServerUnreachable = true;
      }
    } catch (err: any) {
      // ÚNICAMENTE si hay error de red o timeout se recurre al almacenamiento offline
      isServerUnreachable = true;
    }

    if (isServerUnreachable) {
      console.warn("Servidor no accesible, utilizando autenticación local segura...");
      await handleLocalAuth();
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1e293b] rounded-[2.5rem] p-8 border border-slate-700 shadow-2xl animate-in zoom-in-95 duration-500">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20 mb-4">
            <ShieldCheck size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
            {isSetupMode ? 'Configuración Inicial' : 'GestorPro Auth'}
          </h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1 text-center">
            {isSetupMode 
              ? 'Crea tu Administrador principal para comenzar' 
              : 'Inicia sesión para continuar'}
          </p>
        </div>

        {!isSetupMode && (
          <div className="mb-6 space-y-3">
            <button
              type="button"
              onClick={() => handleBiometricAuth(false)}
              disabled={isBiometricPrompting}
              className="w-full relative overflow-hidden group bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 text-white font-black py-4 px-4 rounded-2xl shadow-xl shadow-orange-500/25 flex items-center justify-center gap-3.5 transition-all active:scale-[0.98] border border-orange-400/40 touch-manipulation"
            >
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm shadow-inner shrink-0">
                <Fingerprint size={24} className={`text-white ${isBiometricPrompting ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
              </div>
              <div className="text-left flex-1 min-w-0">
                <div className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                  {isBiometricPrompting ? 'Sensor Activo...' : 'Ingresar con Huella Digital'}
                </div>
                <div className="text-[10px] text-white/90 font-semibold normal-case truncate">
                  {isBiometricPrompting ? 'Toca el sensor de tu teléfono' : 'Acceso instantáneo con tu sensor'}
                </div>
              </div>
            </button>

            <div className="relative flex items-center justify-center pt-1">
              <div className="border-t border-slate-700/80 w-full"></div>
              <span className="bg-[#1e293b] px-3 text-[8px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
                o ingresa con tu contraseña
              </span>
              <div className="border-t border-slate-700/80 w-full"></div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-bold p-3 rounded-xl mb-6 text-center uppercase tracking-wider">
            {error}
          </div>
        )}

        {isSetupMode ? (
          <form onSubmit={handleSetupSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase ml-2">Nombre Completo</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  type="text" 
                  required 
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-xs font-bold text-white outline-none focus:border-orange-500/50 transition-all"
                  placeholder="Ej: Administrador Principal"
                  value={setupData.name}
                  onChange={(e) => setSetupData({ ...setupData, name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase ml-2">Nombre de Usuario</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  type="text" 
                  required 
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-xs font-bold text-white outline-none focus:border-orange-500/50 transition-all"
                  placeholder="usuario_admin"
                  value={setupData.username}
                  onChange={(e) => setSetupData({ ...setupData, username: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase ml-2">Contraseña (Mínimo 6 caracteres)</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  type="password" 
                  required 
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-xs font-bold text-white outline-none focus:border-orange-500/50 transition-all"
                  placeholder="••••••••"
                  value={setupData.password}
                  onChange={(e) => setSetupData({ ...setupData, password: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase ml-2">Confirmar Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  type="password" 
                  required 
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-xs font-bold text-white outline-none focus:border-orange-500/50 transition-all"
                  placeholder="••••••••"
                  value={setupData.confirmPassword}
                  onChange={(e) => setSetupData({ ...setupData, confirmPassword: e.target.value })}
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl shadow-lg uppercase text-[10px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 mt-4"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <ShieldCheck size={18} />
                  <span>Crear Cuenta de Administrador</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase ml-2">Usuario</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  type="text" 
                  required 
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-xs font-bold text-white outline-none focus:border-orange-500/50 transition-all"
                  placeholder="nombre_usuario"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase ml-2">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  type="password" 
                  required 
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-xs font-bold text-white outline-none focus:border-orange-500/50 transition-all"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl shadow-lg uppercase text-[10px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 mt-4"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <LogIn size={18} />
                  <span>Iniciar Sesión</span>
                </>
              )}
            </button>
          </form>
        )}

        {!isSetupMode && (
          <div className="mt-4 flex flex-col items-center gap-2 text-center">
            <button
              type="button"
              onClick={openRecoveryModal}
              className="inline-flex items-center gap-1.5 text-[9px] font-bold text-amber-400/90 hover:text-amber-300 uppercase tracking-wider transition-colors py-1 px-3 rounded-lg hover:bg-slate-800"
            >
              <HelpCircle size={13} className="text-amber-400" />
              ¿Olvidaste tu contraseña o usuario?
            </button>
          </div>
        )}
      </div>

      {/* MODAL: Solución a Usuario o Contraseña Olvidada */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-[2000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#1e293b] border border-slate-700 rounded-[2.5rem] w-full max-w-lg p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 my-8 space-y-5">
            {/* Encabezado */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-700/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Recuperación de Acceso
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    Solución para usuarios y contraseñas olvidadas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRecoveryModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Selector de Pestañas: Vendedor vs Administrador */}
            <div className="grid grid-cols-2 p-1 bg-slate-900 rounded-2xl border border-slate-800">
              <button
                type="button"
                onClick={() => setRecoveryTab('seller')}
                className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                  recoveryTab === 'seller'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users size={14} />
                <span>Soy Vendedor</span>
              </button>

              <button
                type="button"
                onClick={() => setRecoveryTab('admin')}
                className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                  recoveryTab === 'admin'
                    ? 'bg-orange-500 text-white shadow-lg'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ShieldCheck size={14} />
                <span>Soy Administrador</span>
              </button>
            </div>

            {/* Contenido Pestaña: Vendedor */}
            {recoveryTab === 'seller' && (
              <div className="space-y-4">
                <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-700/80 space-y-2.5">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase">
                    <ShieldAlert size={16} />
                    <span>Control Centralizado de Seguridad</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Por políticas de seguridad, las cuentas de vendedor y sus privilegios están bajo el control de tu <strong>Administrador</strong>.
                  </p>
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-[11px] text-slate-300 space-y-1.5">
                    <p className="font-bold text-white uppercase text-[9px] tracking-wider">
                      ¿Cómo restablecer tu contraseña?
                    </p>
                    <p>
                      1. Contacta al Administrador de tu negocio.
                    </p>
                    <p>
                      2. El Administrador ingresará a <strong>Ajustes &gt; Gestión de Usuarios y Privilegios</strong>.
                    </p>
                    <p>
                      3. Presionará el botón <strong>&quot;Contraseña&quot;</strong> junto a tu nombre y te asignará una nueva clave al instante.
                    </p>
                  </div>
                </div>

                {/* Si olvidó el nombre de usuario exacto, listar los usuarios registrados */}
                <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                    ¿No recuerdas tu nombre de usuario exacto? Usuarios en este equipo:
                  </span>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {knownUsers.length > 0 ? (
                      knownUsers.map((u, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, username: u.username }));
                            setShowRecoveryModal(false);
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-left text-[10px] font-bold text-slate-300 hover:text-white transition-all flex items-center gap-1.5 active:scale-95"
                          title="Haz clic para autocompletar este usuario"
                        >
                          <span className="text-orange-400">@{u.username}</span>
                          <span className="text-[8px] text-slate-500 uppercase">({u.name})</span>
                          <ArrowRight size={10} className="text-slate-500" />
                        </button>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">
                        No hay otros usuarios registrados en este equipo además del admin.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Contenido Pestaña: Administrador */}
            {recoveryTab === 'admin' && (
              <div className="space-y-4">
                <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-700/80 space-y-3">
                  <div className="flex items-center gap-2 text-orange-400 text-xs font-black uppercase">
                    <ShieldCheck size={16} />
                    <span>Recuperación de Administrador</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Si olvidaste la contraseña del Administrador principal, consulta las siguientes opciones de acceso autorizadas:
                  </p>

                  <div className="space-y-3">
                    {/* Opción 1: Huella digital */}
                    {biometricAvailable && (
                      <div className="p-3.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20 flex items-start gap-3">
                        <Fingerprint size={20} className="text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[11px] font-black text-indigo-300 uppercase tracking-wider">
                            Ingreso Biométrico (Huella Digital)
                          </p>
                          <p className="text-[10px] text-slate-300 leading-relaxed mt-0.5">
                            Si vinculaste tu huella dactilar para el Administrador en este dispositivo, cierra este diálogo y presiona el botón principal <strong>&quot;Ingresar con Huella Digital&quot;</strong>.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Aviso de Seguridad: No permitido restablecimiento público */}
                    <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700 flex items-start gap-3">
                      <ShieldAlert size={20} className="text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-[11px] font-black text-amber-300 uppercase tracking-wider">
                          Protocolo de Seguridad Activo
                        </p>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          Por estrictas políticas de protección de datos, la cuenta de Administrador no puede restablecerse públicamente desde esta pantalla sin autorización previa.
                        </p>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          Si no recuerdas la contraseña y no dispones de huella dactilar, contacta directamente con el soporte técnico o restaura tu base de datos desde una copia de respaldo segura.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pie del modal */}
            <div className="pt-2 border-t border-slate-700/80 flex justify-end">
              <button
                type="button"
                onClick={() => setShowRecoveryModal(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Auth;
