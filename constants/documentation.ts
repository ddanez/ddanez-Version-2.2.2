
export const TECHNICAL_DESCRIPTION = `
================================================================================
D'DANEZ GESTOR PRO - ESPECIFICACIONES TÉCNICAS Y ARQUITECTURA DEL SISTEMA
Versión: 2.5.0 Professional Edition
================================================================================

1. DESCRIPCIÓN GENERAL
D'Danez Gestor Pro es una plataforma integral de planificación de recursos empresariales
(ERP) y punto de venta móvil (mPOS) diseñada para operar con alto rendimiento tanto en
entornos web como en dispositivos móviles Android (APK nativo vía Capacitor), ofreciendo
resiliencia total offline-first y soporte multi-moneda en tiempo real (USD y Bolívares).

2. ARQUITECTURA TECNOLÓGICA (STACK COMPLETO)

2.1. Capa de Presentación (Frontend)
- Núcleo: React 18.x con TypeScript estricto.
- Build Tool & Bundler: Vite optimizado con minificación y tree-shaking para cargas ultra-rápidas.
- Estilos & UI: Tailwind CSS v4 con arquitectura de tokens de color refinados en modo oscuro/claro.
- Iconografía: Lucide React (vectorial escalable, cero dependencias pesadas).
- Animaciones & Feedback: Motion (Framer Motion) para transiciones fluidas de vista y retroalimentación táctil.

2.2. Capa Móvil Nativa (Android / Capacitor)
- Runtime: Capacitor v7 (@capacitor/core, @capacitor/android).
- Acceso al Sistema de Archivos: @capacitor/filesystem con manejo de directorios Cache y Documents.
- Hoja de Compartir Nativa: @capacitor/share para exportar reportes, tickets y respaldos a WhatsApp, Drive, Gmail o impresoras térmicas Bluetooth/WiFi.
- Biometría Nativa: @aparajita/capacitor-biometric-auth con fallback web WebAuthn/CredentialManager.
- Manejo de Ciclo de Vida y Navegación: @capacitor/app para interceptar hardware back button, evitando salidas accidentales del sistema.

2.3. Persistencia de Datos Híbrida & Offline-First
- Almacenamiento Local Primario: IndexedDB estructurado en el navegador/WebView mediante Dexie/idb para disponibilidad 100% desconectada.
- Capa de Abstracción dbService: Manejador singleton que orquesta operaciones atómicas CRUD con validaciones de integridad referencial.
- Respaldo & Restauración JSON: Exportación e importación segura con verificación de integridad de esquemas.

2.4. Inteligencia Artificial Multi-Proveedor
- Google Gemini API: Soporte para Gemini 2.5 Flash, 1.5 Pro y 2.0 Flash con análisis predictivo y visión.
- DeepSeek API: Integración con modelos DeepSeek Chat y Coder para diagnósticos de ventas y márgenes de ganancia.
- OpenAI API: Compatibilidad con GPT-4o y GPT-4o-mini para consultas ejecutivas en lenguaje natural.

3. MÓDULOS FUNCIONALES DEL SISTEMA

3.1. Dashboard Ejecutivo en Tiempo Real
- Métricas clave: Ingresos brutos, ventas cobradas, cuentas por cobrar activas, balance de caja y valor de inventario.
- Gráficos interactivos de evolución diaria, semanal y mensual.
- Tasa de cambio oficial del día con conversión automática instantánea entre USD y Bs.

3.2. Inventario y Control de Existencias
- Control de stock por SKU, código de barras o búsqueda fonética rápida.
- Gestión de merma y desperdicios con recálculo automático del costo promedio ponderado.
- Alertas visuales de stock mínimo y agotado.
- Historial detallado de movimientos (Kardex) por producto.

3.3. Punto de Venta (POS) & Ventas
- Carrito de compra ágil con soporte para lectores de código de barras por cámara o teclado.
- Modos de pago combinados: Contado, Crédito, Abonos parciales y uso de Saldos a Favor.
- Descuentos porcentuales o en monto fijo con autorización.
- Generación instantánea de tickets térmicos formateados en 58mm y 80mm con código QR de verificación fiscal/comercial.

3.4. Compras y Abastecimiento
- Registro de compras de mercancía a proveedores con cálculo automático de costo unitario y actualización inmediata de existencias.
- Control de créditos de compras y calendario de pagos pendientes.

3.5. Manufactura y Producción (Escandallo de Recetas)
- Registro y costeo de materias primas/ingredientes base por unidad de medida (kg, g, lt, ml, unidad).
- Creación de recetas compuestas con cálculo dinámico del costo de elaboración por porción.
- Descarga automática de ingredientes del stock al ejecutar órdenes de producción terminadas.

3.6. Cuentas por Cobrar (CxC) y Cuentas por Pagar (CxP)
- Estados de cuenta individuales y globales por cliente o proveedor.
- Registro cronológico de abonos con emisión automática de recibos de pago.
- Gestión de saldos a favor por devoluciones o pagos en exceso.
- Clasificación de cartera por antigüedad de saldos.

3.7. Promociones y Fidelización de Clientes
- Sistema de cupones, tarjetas de sellos digitales y recompensas acumulables por volumen de compra.
- Reportes específicos de redención y efectividad publicitaria.

3.8. Seguridad, Roles y Biometría
- Autenticación multifactor con validación biométrica por huella dactilar o reconocimiento facial.
- Control de acceso basado en roles (RBAC) con permisos granulares por pantalla.
- Sesión segura con bloqueo por inactividad y cierre controlado.

================================================================================
D'Danez Gestor Pro © 2026 - Soluciones Tecnológicas de Alto Impacto
================================================================================
`;

export const PROMOTIONAL_DESCRIPTION = `
================================================================================
D'DANEZ GESTOR PRO - LA PLATAFORMA DEFINITIVA PARA TU NEGOCIO
Impulsa tu empresa con tecnología de punta, rapidez absoluta y control total
================================================================================

¿QUÉ ES D'DANEZ GESTOR PRO?
D'Danez Gestor Pro es la solución definitiva de punto de venta, inventario y administración
financiera creada específicamente para empresarios, comerciantes y emprendedores que
necesitan velocidad, precisión y movilidad sin depender de complicados sistemas tradicionales.

Disponible tanto en la web como en aplicación móvil nativa para teléfonos y tablets Android,
Gestor Pro te permite gestionar tu empresa con total soltura, ya sea desde el mostrador, el
almacén o mientras visitas a tus clientes.

--------------------------------------------------------------------------------
¿POR QUÉ D'DANEZ GESTOR PRO TRANSFORMARÁ TU NEGOCIO?
--------------------------------------------------------------------------------

1. OPERA SIEMPRE: 100% FUNCIONAL INCLUSO SIN INTERNET
No te detengas si se corta la conexión. Gestor Pro almacena tus datos de forma segura en tu
dispositivo y continúa registrando ventas, emitiendo tickets y controlando tu mercancía sin
interrupciones.

2. MULTI-MONEDA INTELIGENTE EN TIEMPO REAL (USD Y BOLÍVARES)
Actualiza la tasa del día con un solo toque. Todos tus precios, tickets de venta, compras y
reportes de deudas se recalculan al instante con exactitud matemática, eliminando errores de
cálculo manual y discusiones con tus clientes.

3. ACCESO RÁPIDO Y ULTRA SEGURO CON HUELLA DIGITAL
Olvídate de contraseñas complicadas que tus empleados puedan olvidar. Vincula el sensor de huella
de tu teléfono Android para ingresar al sistema en menos de un segundo con máxima seguridad.

4. TICKETS PROFESIONALES LISTOS PARA IMPRIMIR Y COMPARTIR
Genera tickets impecables en formato estándar de impresora térmica (58mm y 80mm) con el logo de tu
empresa, desglose fiscal e incluso código QR. Compártelos al instante por WhatsApp, correo o guárdalos
en tu teléfono con un clic.

5. ASISTENCIA EJECUTIVA CON INTELIGENCIA ARTIFICIAL
Aprovecha el poder de los modelos de IA líderes del mercado (Google Gemini, DeepSeek y OpenAI).
Obtén análisis automáticos de cuáles son tus productos estrella, qué días vendes más y sugerencias
inteligentes para optimizar tus precios y reponer inventario antes de que se agote.

6. CONTROL RIGUROSO DE CRÉDITOS Y COBRANZAS
¿Cansado de no saber quién te debe o a quién debes pagar? Consulta estados de cuenta claros y
organizados en segundos, registra abonos parciales y envía recordatorios profesionales a tus
clientes para mantener tu flujo de caja siempre saludable.

7. MÓDULO DE RECETAS Y PRODUCCIÓN PARA MANUFACTURA
Si fabricas tus propios productos (alimentos, panadería, artesanías o manufactura), define los
ingredientes de cada producto y conoce exactamente cuánto te cuesta producir cada unidad,
descontando automáticamente las materias primas al producir.

8. CONTROL DE ROLES Y PRIVACIDAD TOTAL
Define qué puede ver cada usuario de tu equipo: permite que los cajeros solo vendan sin ver
tus ganancias netas ni los costos de tus proveedores, manteniendo la confidencialidad de tu negocio.

--------------------------------------------------------------------------------
¡TOMA HOY EL CONTROL ABSOLUTO DE TU EMPRESA!
D'Danez Gestor Pro es el socio tecnológico que te da libertad, orden y rentabilidad.
--------------------------------------------------------------------------------
`;
