import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();

// Posibles rutas del logo original del usuario (prioridad estricta al archivo original sin modificaciones)
const LOGO_CANDIDATES = [
  path.join(ROOT_DIR, 'logo_ddanez_transparente.png'),
  path.join(ROOT_DIR, 'public', 'logo_ddanez_transparente.png'),
  path.join(ROOT_DIR, 'public', 'logo.png')
];

let sourceLogo = null;
for (const cand of LOGO_CANDIDATES) {
  if (fs.existsSync(cand)) {
    sourceLogo = cand;
    break;
  }
}

if (!sourceLogo) {
  console.error("❌ No se encontró ningún archivo de logo para generar los iconos.");
  process.exit(1);
}

console.log(`✨ Usando logo original exacto: ${sourceLogo}`);

// Asegurar carpeta public y copiar logo ahí sin alterar ningún color ni transparencia
const publicDir = path.join(ROOT_DIR, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

const targetPublicLogo = path.join(publicDir, 'logo.png');
const targetPublicLogoTransparent = path.join(publicDir, 'logo_ddanez_transparente.png');

if (sourceLogo !== targetPublicLogo) {
  fs.copyFileSync(sourceLogo, targetPublicLogo);
}
if (sourceLogo !== targetPublicLogoTransparent) {
  fs.copyFileSync(sourceLogo, targetPublicLogoTransparent);
}

// Generar favicon e iconos PWA preservando exactamente la transparencia y diseño original
try {
  execSync(`convert "${targetPublicLogo}" -resize 64x64 -background none "${path.join(publicDir, 'favicon.ico')}"`);
  execSync(`convert "${targetPublicLogo}" -resize 192x192 -background none "${path.join(publicDir, 'icon-192.png')}"`);
  execSync(`convert "${targetPublicLogo}" -resize 512x512 -background none "${path.join(publicDir, 'icon-512.png')}"`);
  console.log(`✅ Favicon e iconos PWA generados a partir del logo original`);
} catch (e) {
  console.warn("Aviso al generar favicons:", e.message);
}

const RES_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'res');

if (!fs.existsSync(RES_DIR)) {
  console.log("ℹ️ Directorio android no existe todavía, omitiendo generación de mipmaps nativos.");
  process.exit(0);
}

const MIPMAP_CONFIG = [
  { dir: 'mipmap-mdpi', iconSize: 48, fgCanvas: 108, fgIcon: 76 },
  { dir: 'mipmap-hdpi', iconSize: 72, fgCanvas: 162, fgIcon: 114 },
  { dir: 'mipmap-xhdpi', iconSize: 96, fgCanvas: 216, fgIcon: 152 },
  { dir: 'mipmap-xxhdpi', iconSize: 144, fgCanvas: 324, fgIcon: 228 },
  { dir: 'mipmap-xxxhdpi', iconSize: 192, fgCanvas: 432, fgIcon: 304 }
];

console.log("📱 Generando iconos Mipmap de Android con el logo original...");
for (const conf of MIPMAP_CONFIG) {
  const folder = path.join(RES_DIR, conf.dir);
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

  // 1. Icono normal (placa blanca redondeada para que destaque en cualquier fondo de pantalla)
  const innerLogo = Math.round(conf.iconSize * 0.82);
  const cornerRad = Math.round(conf.iconSize * 0.22);
  execSync(`convert -size ${conf.iconSize}x${conf.iconSize} xc:none -fill "#FFFFFF" -draw "roundrectangle 0,0,${conf.iconSize-1},${conf.iconSize-1},${cornerRad},${cornerRad}" \\( "${targetPublicLogo}" -resize ${innerLogo}x${innerLogo} \\) -gravity center -composite "${path.join(folder, 'ic_launcher.png')}"`);

  // 2. Icono redondo (placa blanca circular limpia con el logo centrado)
  const half = conf.iconSize / 2;
  execSync(`convert -size ${conf.iconSize}x${conf.iconSize} xc:none -fill "#FFFFFF" -draw "circle ${half},${half} ${half},1" \\( "${targetPublicLogo}" -resize ${innerLogo}x${innerLogo} \\) -gravity center -composite "${path.join(folder, 'ic_launcher_round.png')}"`);

  // 3. Icono adaptativo foreground (centrado en lienzo transparente dentro de la zona segura de Android)
  execSync(`convert "${targetPublicLogo}" -resize ${conf.fgIcon}x${conf.fgIcon} -background none -gravity center -extent ${conf.fgCanvas}x${conf.fgCanvas} "${path.join(folder, 'ic_launcher_foreground.png')}"`);

  console.log(`  ✓ ${conf.dir} completado (${conf.iconSize}px / fg: ${conf.fgCanvas}px)`);
}

// Splash screens - Usar arquitectura nativa Layer-List XML sin deformación
// Esto garantiza que en CUALQUIER resolución o pantalla de teléfono (16:9, 18:9, 20:9, tablets)
// el logo permanezca 100% circular, nítido y centrado, sin estirarse jamás en un óvalo.
const SPLASH_LOGO_CONFIG = [
  { folder: 'drawable', size: 320 },
  { folder: 'drawable-mdpi', size: 160 },
  { folder: 'drawable-hdpi', size: 240 },
  { folder: 'drawable-xhdpi', size: 320 },
  { folder: 'drawable-xxhdpi', size: 480 },
  { folder: 'drawable-xxxhdpi', size: 640 }
];

// 1. Eliminar cualquier archivo bitmap legacy splash.png que cause deformación
try {
  const allDrawables = fs.readdirSync(RES_DIR);
  for (const d of allDrawables) {
    if (d.startsWith('drawable')) {
      const oldSplashPng = path.join(RES_DIR, d, 'splash.png');
      if (fs.existsSync(oldSplashPng)) {
        fs.unlinkSync(oldSplashPng);
      }
    }
  }
} catch (e) {
  console.warn("Aviso al limpiar splash.png antiguos:", e.message);
}

// 2. Generar el logo centrado en formato cuadrado transparente para cada densidad
console.log("🎨 Generando splash_logo para Android con el logo original 1:1 circular...");
for (const s of SPLASH_LOGO_CONFIG) {
  const folder = path.join(RES_DIR, s.folder);
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

  const logoOut = path.join(folder, 'splash_logo.png');
  // Redimensionar preservando exactamente el ratio 1:1 (cuadrado/círculo perfecto) con fondo transparente
  execSync(`convert "${targetPublicLogo}" -resize ${s.size}x${s.size} -background none -gravity center -extent ${s.size}x${s.size} "${logoOut}"`);
}

// 3. Crear el splash.xml nativo con layer-list para centrar el bitmap sobre fondo blanco puro
const splashXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@android:color/white" />
    <item>
        <bitmap
            android:gravity="center"
            android:src="@drawable/splash_logo" />
    </item>
</layer-list>
`;

const SPLASH_XML_FOLDERS = ['drawable', 'drawable-port', 'drawable-land'];
for (const f of SPLASH_XML_FOLDERS) {
  const xmlFolder = path.join(RES_DIR, f);
  if (!fs.existsSync(xmlFolder)) fs.mkdirSync(xmlFolder, { recursive: true });
  fs.writeFileSync(path.join(xmlFolder, 'splash.xml'), splashXmlContent, 'utf8');
}

console.log("🎉 ¡Todos los iconos y splash screens nativos fueron generados fielmente a partir del logo original sin deformación!");
