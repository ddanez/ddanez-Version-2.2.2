import http from 'http';

function request(options: http.RequestOptions, body?: any): Promise<{ status: number; data: any; headers: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data: any = text;
        try {
          data = JSON.parse(text);
        } catch (e) {}
        resolve({ status: res.statusCode || 0, data, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log("=== INICIANDO SUITE DE PRUEBAS DE SEGURIDAD Y AUDITORÍA ===");
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
    }
  }

  // 1. Health check
  try {
    const res = await request({ hostname: '127.0.0.1', port: 3000, path: '/api/health', method: 'GET' });
    assert(res.status === 200 && res.data.status === 'ok', 'Endpoint de salud /api/health responde 200 OK');
  } catch (e: any) {
    assert(false, 'Endpoint de salud /api/health disponible', e.message);
  }

  // 2. Setup status
  try {
    const res = await request({ hostname: '127.0.0.1', port: 3000, path: '/api/auth/setup-status', method: 'GET' });
    assert(res.status === 200 && typeof res.data.initialized === 'boolean', 'Endpoint /api/auth/setup-status retorna estado');
  } catch (e: any) {
    assert(false, 'Endpoint /api/auth/setup-status', e.message);
  }

  // 3. Intento de acceso a endpoints protegidos sin token (Debe fallar con 401)
  try {
    const res = await request({ hostname: '127.0.0.1', port: 3000, path: '/api/products', method: 'GET' });
    assert(res.status === 401, 'Acceso sin token a /api/products es rechazado con 401');
  } catch (e: any) {
    assert(false, 'Acceso sin token a /api/products', e.message);
  }

  try {
    const res = await request({ hostname: '127.0.0.1', port: 3000, path: '/api/settings', method: 'GET' });
    assert(res.status === 401, 'Acceso sin token a /api/settings es rechazado con 401');
  } catch (e: any) {
    assert(false, 'Acceso sin token a /api/settings', e.message);
  }

  try {
    const res = await request({ hostname: '127.0.0.1', port: 3000, path: '/api/system/reset', method: 'POST' });
    assert(res.status === 401, 'Acceso sin token a /api/system/reset es rechazado con 401');
  } catch (e: any) {
    assert(false, 'Acceso sin token a /api/system/reset', e.message);
  }

  // 4. Intento de login con credenciales erróneas (Debe fallar con 401)
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { username: 'usuario_inexistente_xyz', password: 'password123' });
    assert(res.status === 401, 'Login con usuario inexistente responde 401');
  } catch (e: any) {
    assert(false, 'Login erróneo', e.message);
  }

  // 5. Intento de registro sin token cuando ya existen administradores (Debe fallar con 401/403)
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { username: 'hacker_admin', password: 'password123', role: 'admin', name: 'Hacker' });
    assert(res.status === 401 || res.status === 403, 'Registro no autorizado rechazado con 401/403');
  } catch (e: any) {
    assert(false, 'Registro no autorizado', e.message);
  }

  // 6. Prueba de creación y autorización de vendedor vs administrador
  // Intentar login de admin existente en BD
  let adminToken = '';
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { username: 'admin', password: 'admin123' });
    
    if (res.status === 200 && res.data.token) {
      adminToken = res.data.token;
      assert(true, 'Login de administrador completado y token recibido');
      assert(res.data.user.role === 'admin', 'El rol del usuario autenticado es admin');
    } else {
      console.log("Aviso: el admin no usa password por defecto o no existe. Estado:", res.status);
    }
  } catch (e: any) {
    console.log("Aviso en login admin:", e.message);
  }

  if (adminToken) {
    // 7. Admin registra un vendedor con permisos limitados a ventas
    const sellerUsername = `vendedor_test_${Date.now()}`;
    let sellerToken = '';

    try {
      const regRes = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/auth/register',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        }
      }, {
        username: sellerUsername,
        password: 'passwordVendedor123',
        role: 'seller',
        name: 'Vendedor Prueba',
        permissions: ['sales', 'customers']
      });

      assert(regRes.status === 200, 'Administrador registra exitosamente nuevo usuario vendedor');

      // Login del vendedor
      const loginSeller = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { username: sellerUsername, password: 'passwordVendedor123' });

      assert(loginSeller.status === 200 && loginSeller.data.token, 'Login del vendedor exitoso con token 7d');
      sellerToken = loginSeller.data.token;

      // 8. Control de acceso RBAC: Vendedor NO debe poder eliminar productos o acceder a usuarios
      const userListRes = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/users',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${sellerToken}` }
      });
      assert(userListRes.status === 403, 'Vendedor recibe 403 Forbidden al intentar consultar /api/users');

      // Vendedor NO debe poder modificar settings
      const settingsPostRes = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/settings',
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sellerToken}` 
        }
      }, { id: 'app_settings', data: 'malicious' });
      assert(settingsPostRes.status === 403, 'Vendedor recibe 403 Forbidden al intentar modificar /api/settings');

      // Vendedor NO debe ver claves API en settings
      const settingsGetRes = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/settings',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${sellerToken}` }
      });
      assert(settingsGetRes.status === 200, 'Vendedor puede consultar settings permitidas');
      if (Array.isArray(settingsGetRes.data) && settingsGetRes.data.length > 0) {
        const s = settingsGetRes.data[0];
        assert(!s.geminiApiKey && !s.deepseekApiKey && !s.openaiApiKey, 'Claves API sensibles NO son enviadas al vendedor');
      }

      // Vendedor SÍ puede acceder a su módulo autorizado (sales)
      const salesGetRes = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/sales',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${sellerToken}` }
      });
      assert(salesGetRes.status === 200, 'Vendedor tiene acceso autorizado a /api/sales');

    } catch (e: any) {
      assert(false, 'Prueba de RBAC vendedor', e.message);
    }
  }

  console.log(`\n=== RESULTADO: ${passed}/${total} PRUEBAS SUPERADAS EXITOSAMENTE ===\n`);
  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Error fatal en pruebas:", err);
  process.exit(1);
});
