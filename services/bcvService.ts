/**
 * Servicio para consultar y actualizar la tasa oficial del Banco Central de Venezuela (BCV)
 * Soporta tanto el entorno nativo móvil (APK Capacitor) como el entorno Web.
 */

export interface BcvRateResult {
  success: boolean;
  rate: number;
  date: string;
  source: string;
  error?: string;
}

export async function fetchBcvRate(): Promise<BcvRateResult> {
  // 1. Intentar consulta directa a ve.dolarapi.com (rápida, pública, con soporte CORS)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const num = parseFloat(data.promedio);
      if (!isNaN(num) && num > 0) {
        return {
          success: true,
          rate: Number(num.toFixed(2)),
          date: data.fechaActualizacion ? data.fechaActualizacion.split('T')[0] : new Date().toISOString().split('T')[0],
          source: 'Banco Central de Venezuela (Oficial)'
        };
      }
    }
  } catch (directErr) {
    console.warn('Consulta directa a DolarApi falló, intentando servidor proxy:', directErr);
  }

  // 2. Intentar a través del backend local /api/exchange-rate/bcv
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/exchange-rate/bcv', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.rate > 0) {
        return {
          success: true,
          rate: Number(data.rate),
          date: data.date ? data.date.split('T')[0] : new Date().toISOString().split('T')[0],
          source: data.source || 'BCV Oficial'
        };
      }
    }
  } catch (proxyErr) {
    console.warn('Consulta a proxy /api/exchange-rate/bcv falló:', proxyErr);
  }

  // 3. Respaldo secundario: pydolarvenezuela API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar?page=bcv', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const num = parseFloat(data?.monitors?.usd?.price);
      if (!isNaN(num) && num > 0) {
        return {
          success: true,
          rate: Number(num.toFixed(2)),
          date: new Date().toISOString().split('T')[0],
          source: 'BCV Oficial (Secundario)'
        };
      }
    }
  } catch (thirdErr) {
    console.warn('Consulta a respaldo pydolarvenezuela falló:', thirdErr);
  }

  return {
    success: false,
    rate: 0,
    date: new Date().toISOString().split('T')[0],
    source: 'N/A',
    error: 'No fue posible contactar los servidores de cotización oficial. Verifica tu conexión a internet.'
  };
}
