
# D'Danez Gestor - Sistema de Gestión Empresarial

Un sistema de gestión de ventas e inventario moderno, rápido y funcional diseñado para negocios que requieren control multimoneda (USD/Bs) y funcionamiento offline.

## 🚀 Características Principales

- **Gestión de Inventario**: Control de stock, costos y precios de venta. Alertas de stock bajo.
- **Módulo de Ventas**: Facturación rápida con selección de clientes, control de crédito/contado y cálculo automático en Bolívares según la tasa del día.
- **Módulo de Compras**: Recepción de mercancía que actualiza automáticamente el inventario, costos y precios sugeridos.
- **Cuentas por Cobrar/Pagar**: Seguimiento de deudas de clientes y pagos pendientes a proveedores.
- **Dashboard e Informes**: Visualización de rendimiento mediante gráficos interactivos (Recharts).
- **Funcionamiento Offline**: Utiliza **IndexedDB** para almacenar todos los datos localmente en el navegador.
- **PWA (Progressive Web App)**: Instalable en dispositivos móviles y escritorio sin necesidad de tiendas de aplicaciones.

## 🛠️ Tecnologías

- **React 18** + **TypeScript**
- **Tailwind CSS** (Diseño responsivo y modo oscuro)
- **Lucide React** (Iconografía)
- **Recharts** (Gráficos estadísticos)
- **IndexedDB** (Base de datos local persistente)
- **Vite** (Herramienta de construcción rápida)

## 📦 Instalación y Desarrollo Local

1. Clona el repositorio:
   ```bash
   git clone https://github.com/tu-usuario/nombre-repo.git
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```

4. Para construir la versión de producción:
   ```bash
   npm run build
   ```

## 🔒 Privacidad y Datos

La aplicación es **"Local-First"**. Esto significa que tus datos nunca salen de tu dispositivo a menos que decidas exportarlos manualmente desde el módulo de **Configuración**.

---
Desarrollado con ❤️ para la gestión eficiente de negocios.
