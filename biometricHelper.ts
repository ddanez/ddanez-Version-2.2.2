import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';
import { Capacitor } from '@capacitor/core';

export interface BiometricStatus {
  isAvailable: boolean;
  biometryType: string;
  hasEnrolled: boolean;
  message: string;
}

const BIOMETRIC_ENABLED_KEY = 'biometric_auth_enabled';
const BIOMETRIC_USERNAME_KEY = 'biometric_auth_username';
const BIOMETRIC_AUTO_PROMPT_KEY = 'biometric_auto_prompt_enabled';

/**
 * Verifica si el dispositivo soporta y tiene configurada la autenticación biométrica (huella/rostro)
 */
export async function checkBiometricAvailability(): Promise<BiometricStatus> {
  // En entorno web tradicional fuera de Capacitor
  if (!Capacitor.isNativePlatform()) {
    return {
      isAvailable: false,
      biometryType: 'none',
      hasEnrolled: false,
      message: 'La autenticación por huella dactilar está optimizada para la aplicación móvil (APK en Android).'
    };
  }

  try {
    const info = await BiometricAuth.checkBiometry();
    
    let typeName = 'Huella Dactilar';
    if (info.biometryType === BiometryType.faceAuthentication || info.biometryType === BiometryType.faceId) {
      typeName = 'Reconocimiento Facial';
    } else if (info.biometryType === BiometryType.irisAuthentication) {
      typeName = 'Escáner de Iris';
    }

    const available = info.isAvailable || info.deviceIsSecure || (info.biometryTypes && info.biometryTypes.length > 0);

    return {
      isAvailable: available,
      biometryType: typeName,
      hasEnrolled: info.isAvailable,
      message: available ? `Disponible (${typeName})` : (info.reason || 'Hardware presente en dispositivo')
    };
  } catch (err: any) {
    console.warn('Error al verificar biometría:', err);
    // En plataforma nativa Android, permitimos invocar el sensor directamente
    return {
      isAvailable: true,
      biometryType: 'Huella Dactilar',
      hasEnrolled: true,
      message: 'Hardware biométrico disponible en Android.'
    };
  }
}

/**
 * Solicita autenticación mediante huella digital del dispositivo
 */
export async function authenticateWithBiometrics(reason: string = 'Toca el sensor de huella digital para acceder'): Promise<{ success: boolean; error?: string }> {
  try {
    if (!Capacitor.isNativePlatform()) {
      return {
        success: false,
        error: 'El sensor de huella nativo requiere ejecutar la aplicación instalada (APK).'
      };
    }

    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Usar Contraseña',
      allowDeviceCredential: true,
      androidTitle: 'Gestor Pro',
      androidSubtitle: 'Acceso con Huella Digital',
      androidConfirmationRequired: false
    });

    return { success: true };
  } catch (err: any) {
    console.warn('Error durante autenticación biométrica:', err);
    const msg = err.message || '';
    if (msg.includes('userCancel') || msg.includes('cancel') || err.code === 'userCancel') {
      return { success: false, error: 'Cancelado por el usuario.' };
    }
    return { 
      success: false, 
      error: err.message || 'No se pudo verificar la huella digital.' 
    };
  }
}

/**
 * Activa la huella para un usuario específico
 */
export function setBiometricEnabled(username: string, enabled: boolean) {
  if (enabled) {
    localStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
    localStorage.setItem(BIOMETRIC_USERNAME_KEY, username.trim());
  } else {
    localStorage.removeItem(BIOMETRIC_ENABLED_KEY);
    localStorage.removeItem(BIOMETRIC_USERNAME_KEY);
  }
}

/**
 * Retorna si la huella está habilitada en este dispositivo
 */
export function isBiometricConfigured(): boolean {
  return localStorage.getItem(BIOMETRIC_ENABLED_KEY) === 'true';
}

/**
 * Obtiene el nombre de usuario asociado a la huella
 */
export function getBiometricConfiguredUser(): string | null {
  return localStorage.getItem(BIOMETRIC_USERNAME_KEY);
}

/**
 * Control de apertura automática del sensor al abrir la app
 */
export function isBiometricAutoPromptEnabled(): boolean {
  const val = localStorage.getItem(BIOMETRIC_AUTO_PROMPT_KEY);
  return val === null ? true : val === 'true'; // Por defecto activo
}

export function setBiometricAutoPromptEnabled(enabled: boolean) {
  localStorage.setItem(BIOMETRIC_AUTO_PROMPT_KEY, enabled ? 'true' : 'false');
}
