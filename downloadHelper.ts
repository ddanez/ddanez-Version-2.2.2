import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export interface ExportFileOptions {
  fileName: string;
  title: string;
  content?: string; // Contenido en texto plano (ej. JSON)
  dataUrl?: string; // base64 data: URL
  blob?: Blob;
  mimeType: string;
  dialogTitle?: string;
  preferShare?: boolean;
  action?: 'download' | 'share' | 'auto'; // 'download': fuerza descarga, 'share': fuerza compartir, 'auto': según preferShare
}

/**
 * Convierte un Data URL (base64) a Blob
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/pdf';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Convierte un Blob a base64 string (sin prefijo data:)
 */
export async function blobToBase64Data(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const res = reader.result as string;
      const base64 = res.split(',')[1] || res;
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Dispara la descarga directa de un archivo en el navegador
 */
export function triggerBrowserDownload(blobOrUrl: Blob | string, fileName: string): boolean {
  try {
    let url: string;
    let shouldRevoke = false;

    if (typeof blobOrUrl === 'string') {
      url = blobOrUrl;
    } else {
      url = URL.createObjectURL(blobOrUrl);
      shouldRevoke = true;
    }

    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    link.download = fileName;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      if (shouldRevoke) {
        URL.revokeObjectURL(url);
      }
    }, 2000);

    return true;
  } catch (err) {
    console.error("Error al descargar archivo en navegador:", err);
    return false;
  }
}

/**
 * Guarda o comparte un archivo (imagen, PDF, JSON, etc.) de forma 100% compatible
 * tanto con navegadores web como con la app nativa APK Android.
 */
export async function downloadOrShareFile(options: ExportFileOptions): Promise<boolean> {
  const { fileName, title, content, dataUrl, mimeType, dialogTitle, preferShare, action } = options;
  let blob = options.blob;

  // Si se envió texto plano y no hay blob, crearlo
  if (content && !blob) {
    blob = new Blob([content], { type: mimeType });
  }

  let base64Pure = '';
  if (dataUrl) {
    if (!blob) {
      blob = dataUrlToBlob(dataUrl);
    }
    const parts = dataUrl.split(',');
    base64Pure = parts[1] || '';
  } else if (blob && !content) {
    base64Pure = await blobToBase64Data(blob);
  }

  const isNative = Capacitor.isNativePlatform();
  const shouldShare = action === 'share' || (action !== 'download' && preferShare);

  // 1. Si estamos en APK nativo (Capacitor Android)
  if (isNative) {
    try {
      let fileUri = '';

      // Si es contenido de texto (JSON)
      if (content) {
        const writeResult = await Filesystem.writeFile({
          path: fileName,
          data: content,
          directory: Directory.Cache,
          encoding: Encoding.UTF8
        });
        fileUri = writeResult.uri;

        try {
          await Filesystem.writeFile({
            path: fileName,
            data: content,
            directory: Directory.Documents,
            encoding: Encoding.UTF8
          });
        } catch (docErr) {
          console.warn("No se pudo escribir en Documents:", docErr);
        }
      } else {
        // Si es binario / base64 (imágenes, PDF)
        const writeResult = await Filesystem.writeFile({
          path: fileName,
          data: base64Pure,
          directory: Directory.Cache
        });
        fileUri = writeResult.uri;

        // Intentar guardar también en Documents para persistencia
        try {
          await Filesystem.writeFile({
            path: fileName,
            data: base64Pure,
            directory: Directory.Documents
          });
        } catch (docErr) {
          console.warn("No se pudo guardar en Documents:", docErr);
        }
      }

      // Si se desea compartir (o si estamos en Android y se requiere acceso externo)
      if (shouldShare) {
        // CRÍTICO PARA ANDROID:
        // 1. NUNCA enviar 'url: fileUri' si se envía 'files: [fileUri]'.
        // 2. NO enviar 'text' si se comparte un archivo binario (PDF/Imagen) para no degradar el MIME type a text/plain.
        await Share.share({
          title: title || fileName,
          files: [fileUri],
          dialogTitle: dialogTitle || `Guardar o Compartir ${fileName}`
        });
      } else {
        // Si el usuario eligió específicamente "Descargar" en la app nativa:
        // Ofrecer el menú de compartir con título específico para Guardar en Dispositivo/Drive/Descargas
        await Share.share({
          title: title || fileName,
          files: [fileUri],
          dialogTitle: dialogTitle || `Guardar ${fileName} en su dispositivo`
        });
      }

      return true;
    } catch (err: any) {
      console.warn("Capacitor Filesystem/Share:", err);
      if (err.message && (err.message.includes('canceled') || err.message.includes('dismissed') || err.message.includes('abort'))) {
        return true;
      }
    }
  }

  // 2. Si se solicitó compartir y estamos en navegador web compatible con Web Share API
  if (shouldShare && blob && typeof navigator !== 'undefined' && navigator.canShare && typeof File !== 'undefined') {
    try {
      const file = new File([blob], fileName, { type: mimeType });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: title || fileName,
          text: title
        });
        return true;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return true;
      console.warn("navigator.share no pudo compartir archivos directamente, procediendo a descarga:", err);
    }
  }

  // 3. Descarga directa en navegador web
  if (blob) {
    return triggerBrowserDownload(blob, fileName);
  } else if (dataUrl) {
    return triggerBrowserDownload(dataUrl, fileName);
  }

  return false;
}

