
import React, { useState, useEffect } from 'react';
import { parseNumber, getTodayDateString } from '../utils';
import { 
  Building2, 
  Save, 
  Download, 
  Upload, 
  Image as ImageIcon, 
  Trash2, 
  Database, 
  AlertTriangle, 
  Loader2,
  TrendingUp,
  Wallet,
  User,
  Lock,
  UserPlus,
  Fingerprint,
  Share2,
  Cloud,
  Sparkles,
  Brain,
  Key,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import { fetchBcvRate } from '../services/bcvService';
import { CompanyInfo, AppSettings, User as UserType } from '../types';
import { dbService } from '../db';

import { jsPDF } from 'jspdf';
import { TECHNICAL_DESCRIPTION, PROMOTIONAL_DESCRIPTION } from '../constants/documentation';
import { 
  checkBiometricAvailability, 
  authenticateWithBiometrics, 
  setBiometricEnabled, 
  isBiometricConfigured, 
  getBiometricConfiguredUser,
  BiometricStatus 
} from '../biometricHelper';
import { Capacitor } from '@capacitor/core';
import { downloadOrShareFile } from '../downloadHelper';
import { UserManagement } from './UserManagement';

interface Props {
  company: CompanyInfo;
  setCompany: React.Dispatch<React.SetStateAction<CompanyInfo>>;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  user: UserType;
  onCurrentUserUpdated?: (updatedUser: UserType) => void;
}

const Settings: React.FC<Props> = ({ company, setCompany, settings, setSettings, user, onCurrentUserUpdated }) => {
  const [isResetting, setIsResetting] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSharingCloud, setIsSharingCloud] = useState(false);
  const [backupStatusMessage, setBackupStatusMessage] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus>({
    isAvailable: false,
    biometryType: 'none',
    hasEnrolled: false,
    message: 'Verificando hardware...'
  });
  const [isBiometricActiveForUser, setIsBiometricActiveForUser] = useState(false);
  const [systemStatus, setSystemStatus] = useState({
    biometrics: 'checking',
    share: 'checking',
    secure: window.isSecureContext
  });

  const [isExportingDoc, setIsExportingDoc] = useState<string | null>(null);
  const [exchangeRateValue, setExchangeRateValue] = useState<string>(settings.exchangeRate > 0 ? settings.exchangeRate.toString() : '');
  const [autoUpdateRate, setAutoUpdateRate] = useState<boolean>(settings.autoUpdateExchangeRate !== false);
  const [isFetchingBcv, setIsFetchingBcv] = useState(false);
  const [bcvFeedback, setBcvFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

  const handleQueryBcvNow = async () => {
    setIsFetchingBcv(true);
    setBcvFeedback(null);
    try {
      const res = await fetchBcvRate();
      if (res.success && res.rate > 0) {
        const today = getTodayDateString();
        localStorage.setItem('bcv_rate_checked_date', today);
        setExchangeRateValue(res.rate.toString());
        const updated = {
          ...settings,
          exchangeRate: res.rate,
          lastRateUpdate: today,
          lastAutoRateCheckDate: today,
          exchangeRateSource: res.source,
          isManualRate: false
        };
        setSettings(updated);
        await dbService.put('settings', { ...updated, id: 'app_settings' });
        setBcvFeedback({
          message: `Tasa BCV oficial aplicada: ${res.rate.toFixed(2)} Bs/$ (${res.date})`,
          isError: false
        });
      } else {
        setBcvFeedback({
          message: res.error || 'No se pudo consultar el BCV.',
          isError: true
        });
      }
    } catch (e: any) {
      setBcvFeedback({
        message: 'Error al conectar con el servicio oficial.',
        isError: true
      });
    } finally {
      setIsFetchingBcv(false);
    }
  };

  const downloadPDF = async (title: string, content: string, filename: string) => {
    try {
      setIsExportingDoc(filename);
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const maxLineWidth = pageWidth - (margin * 2);
      let currentY = 20;

      // Encabezado Principal
      doc.setFillColor(30, 41, 59); // Slate-800
      doc.rect(0, 0, pageWidth, 28, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(title, margin, 14);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      doc.text(`Generado: ${new Date().toLocaleDateString('es-VE')} | D'Danez Gestor Pro`, margin, 21);

      currentY = 38;

      // Dividir el texto en párrafos/líneas
      const rawLines = content.trim().split('\n');

      for (const line of rawLines) {
        const trimmed = line.trim();

        // Línea vacía
        if (!trimmed) {
          currentY += 4;
          continue;
        }

        // Separadores
        if (trimmed.startsWith('==') || trimmed.startsWith('--')) {
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.3);
          doc.line(margin, currentY, pageWidth - margin, currentY);
          currentY += 5;
          continue;
        }

        // Títulos principales (ej. 1. DESCRIPCIÓN..., ¿QUÉ ES...)
        const isHeading = /^[0-9]\.\s+[A-ZÁÉÍÓÚÑ]/.test(trimmed) || trimmed.startsWith('¿') || trimmed.endsWith('?') || /^[A-ZÁÉÍÓÚÑ\s]{4,}$/.test(trimmed);
        const isSubheading = /^[0-9]\.[0-9]/.test(trimmed) || /^[0-9]\.\s/.test(trimmed);

        if (isHeading) {
          if (currentY + 12 > pageHeight - margin) {
            doc.addPage();
            currentY = margin;
          }
          currentY += 3;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(234, 88, 12); // Orange-600
          doc.text(trimmed, margin, currentY);
          currentY += 6;
        } else if (isSubheading) {
          if (currentY + 10 > pageHeight - margin) {
            doc.addPage();
            currentY = margin;
          }
          currentY += 2;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(30, 41, 59);
          doc.text(trimmed, margin, currentY);
          currentY += 5;
        } else {
          // Texto regular
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(51, 65, 85); // Slate-700

          const wrappedLines = doc.splitTextToSize(trimmed, maxLineWidth);
          for (const wLine of wrappedLines) {
            if (currentY + 5 > pageHeight - margin) {
              doc.addPage();
              currentY = margin;
            }
            doc.text(wLine, margin, currentY);
            currentY += 4.5;
          }
        }
      }

      // Pie de página en todas las hojas
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Página ${i} de ${totalPages} - D'Danez Gestor Pro`,
          pageWidth / 2,
          pageHeight - 8,
          { align: 'center' }
        );
      }

      // Convertir a blob y dataUrl para máxima compatibilidad con downloadOrShareFile
      const pdfBlob = doc.output('blob');
      const pdfDataUri = doc.output('datauristring');

      const success = await downloadOrShareFile({
        fileName: filename,
        title: title,
        blob: pdfBlob,
        dataUrl: pdfDataUri,
        mimeType: 'application/pdf',
        dialogTitle: `Guardar o Compartir ${filename}`,
        preferShare: true
      });

      if (!success) {
        doc.save(filename);
      }
    } catch (error) {
      console.error('Error al generar o descargar PDF de documentación:', error);
      alert('Hubo un inconveniente al generar el documento. Por favor intente nuevamente.');
    } finally {
      setIsExportingDoc(null);
    }
  };

  useEffect(() => {
    const checkCapabilities = async () => {
      const status = { ...systemStatus };
      
      // Check Native Biometrics
      try {
        const bio = await checkBiometricAvailability();
        setBiometricStatus(bio);
        if (bio.isAvailable) {
          status.biometrics = 'available';
        } else if (!Capacitor.isNativePlatform()) {
          status.biometrics = 'web-mode';
        } else {
          status.biometrics = 'not-enrolled';
        }
      } catch {
        status.biometrics = 'not-supported';
      }

      // Check Share
      if (!navigator.share && !Capacitor.isNativePlatform()) {
        status.share = 'not-supported';
      } else {
        status.share = 'available';
      }

      setSystemStatus(status);
    };

    checkCapabilities();
    setIsBiometricActiveForUser(isBiometricConfigured() && getBiometricConfiguredUser()?.toLowerCase() === (user.username || '').toLowerCase());
  }, [user.username]);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const saveSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    // Guardar datos de empresa incluyendo nuevos campos
    const newCompany: CompanyInfo = { 
      ...company, 
      name: formData.get('name') as string, 
      slogan: formData.get('slogan') as string,
      rif: formData.get('rif') as string,
      phone: formData.get('phone') as string,
      email: formData.get('email') as string,
      address: formData.get('address') as string,
      bank: formData.get('bank') as string,
      dni: formData.get('dni') as string,
      mobilePhone: formData.get('mobilePhone') as string,
      accountNumber: formData.get('accountNumber') as string,
    };
    
    const enteredRate = parseNumber(exchangeRateValue);
    const today = getTodayDateString();
    const isRateChanged = enteredRate > 0 && enteredRate !== settings.exchangeRate;

    if (enteredRate > 0) {
      localStorage.setItem('bcv_rate_checked_date', today);
    }

    // Guardar tasa de cambio y llave de Gemini
    const newSettings: AppSettings = {
      ...settings,
      exchangeRate: enteredRate || settings.exchangeRate,
      lastRateUpdate: (isRateChanged || !settings.lastRateUpdate) ? today : settings.lastRateUpdate,
      lastAutoRateCheckDate: today,
      manualRateDate: enteredRate > 0 ? today : settings.manualRateDate,
      isManualRate: isRateChanged ? true : (settings.isManualRate ?? true),
      exchangeRateSource: isRateChanged ? 'Manual' : (settings.exchangeRateSource || 'Manual'),
      autoUpdateExchangeRate: autoUpdateRate,
      aiProvider: formData.get('aiProvider') as 'gemini' | 'deepseek' | 'openai',
      geminiApiKey: formData.get('geminiApiKey') as string,
      geminiModel: formData.get('geminiModel') as string,
      deepseekApiKey: formData.get('deepseekApiKey') as string,
      deepseekModel: formData.get('deepseekModel') as string,
      openaiApiKey: formData.get('openaiApiKey') as string,
      openaiModel: formData.get('openaiModel') as string
    };

    setCompany(newCompany);
    setSettings(newSettings);
    
    try {
      await dbService.put('settings', { ...newCompany, id: 'company_info' });
      await dbService.put('settings', { ...newSettings, id: 'app_settings' });
      alert('Configuración guardada correctamente.');
    } catch (err: any) {
      if (err.message !== "SESSION_EXPIRED") {
        alert('Configuración guardada localmente. Error al sincronizar con el servidor.');
      }
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const newCompany = { ...company, logo: base64 };
        setCompany(newCompany);
        await dbService.put('settings', { ...newCompany, id: 'company_info' });

        // Enviar al servidor para regenerar los iconos nativos de Android y PWA con el logo original
        try {
          const token = localStorage.getItem('auth_token');
          await fetch('/api/settings/upload-logo', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify({ imageBase64: base64 })
          });
        } catch (serverErr) {
          console.warn("No se pudo sincronizar logo con el servidor nativo:", serverErr);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setBackupStatusMessage("Generando archivo de respaldo...");
      const backupJson = await dbService.exportBackup();
      const summary = await dbService.getBackupSummary();
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `Respaldo_GestorPro_${dateStr}.json`;

      const success = await downloadOrShareFile({
        fileName,
        title: 'Copia de Seguridad - Gestor Pro',
        content: backupJson,
        mimeType: 'application/json',
        dialogTitle: 'Guardar Respaldo en su Dispositivo o Nube',
        preferShare: false
      });

      if (success) {
        setBackupStatusMessage(`✅ Respaldo generado con éxito (${summary.totalRecords} registros).`);
        setTimeout(() => setBackupStatusMessage(null), 6000);
      } else {
        alert("No se pudo completar el guardado del archivo de respaldo.");
        setBackupStatusMessage(null);
      }
    } catch (err: any) {
      console.error("Error al exportar:", err);
      alert("Error al generar el respaldo: " + (err.message || 'Error desconocido'));
      setBackupStatusMessage(null);
    } finally {
      setIsExporting(false);
    }
  };

  const handleShareCloud = async () => {
    try {
      setIsSharingCloud(true);
      setBackupStatusMessage("Preparando para compartir en la nube...");
      const backupJson = await dbService.exportBackup();
      const summary = await dbService.getBackupSummary();
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `Respaldo_GestorPro_${dateStr}.json`;

      const success = await downloadOrShareFile({
        fileName,
        title: 'Copia de Seguridad - Gestor Pro',
        content: backupJson,
        mimeType: 'application/json',
        dialogTitle: 'Subir Respaldo a la Nube (Google Drive, WhatsApp, Gmail, etc.)',
        preferShare: true
      });

      if (success) {
        setBackupStatusMessage(`☁️ Respaldo preparado (${summary.totalRecords} registros). Elija su nube.`);
        setTimeout(() => setBackupStatusMessage(null), 6000);
      } else {
        setBackupStatusMessage("Respaldo descargado para almacenamiento manual.");
        const openDrive = confirm(`Respaldo generado y descargado (${summary.totalRecords} registros).\n\n¿Desea abrir Google Drive en una nueva pestaña para guardar su archivo?`);
        if (openDrive) {
          window.open('https://drive.google.com/drive/my-drive', '_blank');
        }
      }
    } catch (err: any) {
      console.error("Error al compartir en la nube:", err);
      alert("Error al compartir el archivo de respaldo: " + (err.message || 'Error desconocido'));
      setBackupStatusMessage(null);
    } finally {
      setIsSharingCloud(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("⚠️ Se sobrescribirán los datos locales con el archivo seleccionado. ¿Desea continuar con la restauración?")) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = event.target?.result as string;
        const result = await dbService.importBackup(json);
        alert(`✅ Restauración completa. Se recuperaron ${result.totalRestored} registros exitosamente.`);
        window.location.reload();
      } catch (err: any) {
        console.error("Error en restauración:", err);
        alert("Error: El archivo no contiene un formato de respaldo válido.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRegisterBiometric = async () => {
    if (!Capacitor.isNativePlatform()) {
      alert("⚠️ ACCESO POR HUELLA:\n\nEl sensor de huella dactilar nativo está diseñado para la aplicación instalada (APK) en tu teléfono Android.");
      return;
    }

    if (!biometricStatus.isAvailable) {
      alert(biometricStatus.message || "Tu dispositivo no tiene una huella dactilar registrada. Configura una huella en los Ajustes de Seguridad de Android.");
      return;
    }

    try {
      const res = await authenticateWithBiometrics("Toca el sensor de huella para habilitar tu acceso rápido a Gestor Pro");
      if (res.success) {
        setBiometricEnabled(user.username, true);
        setIsBiometricActiveForUser(true);
        alert(`✅ ¡Huella dactilar activada correctamente para "${user.username}"!\n\nAhora podrás iniciar sesión instantáneamente tocando el sensor de huella en la pantalla de acceso.`);
      } else if (res.error) {
        alert("Aviso de huella: " + res.error);
      }
    } catch (err: any) {
      alert("Error con el sensor biométrico: " + (err.message || 'Intente de nuevo.'));
    }
  };

  const handleDisableBiometric = () => {
    if (confirm("¿Deseas desactivar el acceso por huella para este usuario?")) {
      setBiometricEnabled(user.username, false);
      setIsBiometricActiveForUser(false);
      alert("Acceso por huella desactivado.");
    }
  };

  const handleReset = async () => {
    console.log("🔘 Botón de reset presionado");
    if (!confirm("¡ADVERTENCIA!\n\nSe eliminarán todos los registros.\n\n¿Desea continuar?")) {
      console.log("❌ Reset cancelado por el usuario (confirm)");
      return;
    }
    const check = prompt("Escriba ELIMINAR para confirmar:");
    if (check !== "ELIMINAR") {
      console.log("❌ Reset cancelado: palabra de confirmación incorrecta");
      return;
    }

    try {
      console.log("🚀 Iniciando proceso de reset...");
      setIsResetting(true);
      await dbService.clearAllData();
      console.log("🧹 Limpiando almacenamiento local...");
      localStorage.clear();
      sessionStorage.clear();
      console.log("🔄 Reiniciando aplicación...");
      setTimeout(() => {
        window.location.replace(window.location.origin);
      }, 1000);
    } catch (error) {
      console.error("❌ Error durante el reset:", error);
      alert("Error al limpiar datos.");
      setIsResetting(false);
    }
  };

  const handleChangePassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!passwordForm.current || !passwordForm.new || !passwordForm.confirm) {
      setPasswordError('Todos los campos de contraseña son requeridos');
      return;
    }

    if (passwordForm.new !== passwordForm.confirm) {
      setPasswordError('Las contraseñas nuevas no coinciden');
      return;
    }

    setIsChangingPassword(true);
    try {
      // 1. Manejo local de contraseñas (garantiza funcionamiento en APK y modo sin servidor)
      let localUsers: any[] = [];
      const saved = localStorage.getItem('local_users');
      if (saved) {
        try {
          localUsers = JSON.parse(saved);
        } catch {
          localUsers = [];
        }
      }

      const currentUsername = (user.username || 'admin').toLowerCase();
      let matchedIdx = localUsers.findIndex(
        (u: any) => u.username?.toLowerCase() === currentUsername
      );

      // Si no existe el usuario en local_users, crearlo con el usuario actual
      if (matchedIdx === -1) {
        const defaultAdmin = {
          id: user.id || 'admin-local',
          username: user.username || 'admin',
          password: 'admin123',
          name: user.name || 'Administrador',
          role: user.role || 'admin',
          permissions: user.permissions || []
        };
        localUsers.push(defaultAdmin);
        matchedIdx = localUsers.length - 1;
      }

      const targetUser = localUsers[matchedIdx];
      // Verificar contraseña actual
      if (targetUser.password && targetUser.password !== passwordForm.current) {
        throw new Error('La contraseña actual no es correcta.');
      }

      // Actualizar contraseña localmente
      targetUser.password = passwordForm.new;
      localUsers[matchedIdx] = targetUser;
      localStorage.setItem('local_users', JSON.stringify(localUsers));

      // Actualizar objeto de usuario en sesión
      try {
        const savedUserStr = localStorage.getItem('user_data');
        if (savedUserStr) {
          const uData = JSON.parse(savedUserStr);
          localStorage.setItem('user_data', JSON.stringify({ ...uData, password: passwordForm.new }));
        }
      } catch (e) {
        console.warn('Error al actualizar user_data en sesión:', e);
      }

      // 2. Si hay servidor remoto configurado o en línea, intentar sincronizar en segundo plano
      const baseUrl = dbService.getBaseUrl();
      if (baseUrl || (user.token && user.token !== 'local-offline-token')) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);
          await fetch(`${baseUrl}/api/auth/change-password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({
              currentPassword: passwordForm.current,
              newPassword: passwordForm.new
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
        } catch (serverErr) {
          console.warn("Nota: Contraseña actualizada localmente. El servidor remoto no respondió:", serverErr);
        }
      }

      setPasswordSuccess('¡Contraseña actualizada correctamente!');
      setPasswordForm({ current: '', new: '', confirm: '' });
    } catch (err: any) {
      setPasswordError(err.message || 'Error al cambiar contraseña');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500 pb-12 space-y-6">
      {isResetting && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-3xl z-[9999] flex flex-col items-center justify-center text-white text-center">
           <Loader2 size={64} className="text-orange-500 animate-spin mb-6" />
           <h2 className="text-3xl font-black uppercase tracking-[0.4em] mb-4">Limpiando Sistema</h2>
        </div>
      )}

      {/* Gestión de Usuarios y Privilegios (Solo Administrador) */}
      {user.role === 'admin' && (
        <UserManagement currentUser={user} onCurrentUserUpdated={onCurrentUserUpdated} />
      )}

      <form onSubmit={saveSettings} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          {/* Datos de Empresa */}
          <section className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-slate-700 shadow-xl space-y-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-orange-500 flex items-center gap-2">
              <Building2 size={16} /> Perfil Jurídico y Fiscal
            </h2>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Nombre Comercial</label>
                <input name="name" defaultValue={company.name} className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-xs font-bold outline-none focus:border-orange-500/50" required />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Eslogan / Lema</label>
                <input name="slogan" defaultValue={company.slogan} placeholder="Ej: Calidad al mejor precio" className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-xs font-bold outline-none italic text-slate-300" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-500 uppercase ml-2">RIF</label>
                  <input name="rif" defaultValue={company.rif} className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-xs font-bold outline-none" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Teléfono</label>
                  <input name="phone" defaultValue={company.phone} className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-xs font-bold outline-none" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Dirección</label>
                <input name="address" defaultValue={company.address} className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-xs font-bold outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Email</label>
                <input name="email" type="email" defaultValue={company.email} className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-xs font-bold outline-none" />
              </div>
            </div>
          </section>

          {/* Información de Pago Móvil */}
          <section className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-slate-700 shadow-xl space-y-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-indigo-400 flex items-center gap-2">
              <Wallet size={16} /> Información de Pago Móvil
            </h2>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Banco</label>
                <input name="bank" defaultValue={company.bank} placeholder="Ej: Banco de Venezuela" className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-xs font-bold outline-none focus:border-indigo-500/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Cédula de Identidad</label>
                  <input name="dni" defaultValue={company.dni} placeholder="V-00.000.000" className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-xs font-bold outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Número de Celular</label>
                  <input name="mobilePhone" defaultValue={company.mobilePhone} placeholder="0412-0000000" className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-xs font-bold outline-none" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Número de Cuenta Bancaria (20 dígitos)</label>
                <input 
                  name="accountNumber" 
                  defaultValue={company.accountNumber} 
                  maxLength={24}
                  placeholder="0102-0000-00-0000000000" 
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-xs font-bold outline-none focus:border-indigo-500/50 font-mono tracking-wider" 
                />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-4">
           {/* Logo Section */}
            <section className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-slate-700 shadow-xl flex flex-col items-center justify-center gap-5 text-center">
              <h2 className="text-xs font-black uppercase tracking-widest text-indigo-400">Logotipo</h2>
              <div className="w-36 h-36 bg-slate-900 rounded-[2.5rem] flex items-center justify-center overflow-hidden relative border-2 border-dashed border-slate-700 group shadow-inner">
                 {company.logo ? <img src={company.logo} className="w-full h-full object-contain p-2" alt="Logo" /> : <ImageIcon className="text-slate-700" size={40} />}
                 <label className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 backdrop-blur-sm">
                    <Upload size={24} className="text-white mb-1" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                 </label>
              </div>
              
              {/* Configuración de Moneda y Tasa Oficial BCV */}
              <div className="w-full space-y-3 text-left px-2">
                 <div className="flex items-center justify-between">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Tasa de Cambio (Bs/$)</label>
                   <div className="flex items-center gap-1.5">
                     {settings.exchangeRateSource && (
                       <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 uppercase tracking-wider">
                         {settings.exchangeRateSource}
                       </span>
                     )}
                     {settings.lastRateUpdate && (
                       <span className="text-[8px] font-bold text-slate-500 uppercase">
                         {settings.lastRateUpdate}
                       </span>
                     )}
                   </div>
                 </div>

                 <div className="relative">
                   <input 
                     name="exchangeRate" 
                     type="number" 
                     step="0.01" 
                     lang="en-US"
                     value={exchangeRateValue}
                     onChange={(e) => setExchangeRateValue(e.target.value)}
                     placeholder="0.00"
                     className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-2xl font-black text-orange-500 outline-none focus:border-orange-500/50" 
                   />
                   <TrendingUp className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-700" size={20} />
                 </div>

                 {/* Botón Consultar Tasa Oficial BCV */}
                 <button
                   type="button"
                   onClick={handleQueryBcvNow}
                   disabled={isFetchingBcv}
                   className="w-full bg-slate-800 hover:bg-slate-700 border border-emerald-500/30 text-emerald-400 font-black py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 text-[10px] uppercase tracking-wider transition-all active:scale-95"
                 >
                   <RefreshCw size={14} className={isFetchingBcv ? 'animate-spin text-emerald-400' : 'text-emerald-400'} />
                   <span>{isFetchingBcv ? 'Consultando BCV...' : 'Consultar Tasa Oficial BCV'}</span>
                 </button>

                 {bcvFeedback && (
                   <div className={`p-2.5 rounded-xl text-[10px] font-bold flex items-center gap-2 ${bcvFeedback.isError ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'}`}>
                     {bcvFeedback.isError ? <AlertTriangle size={14} className="shrink-0" /> : <CheckCircle2 size={14} className="shrink-0" />}
                     <span>{bcvFeedback.message}</span>
                   </div>
                 )}

                 {/* Opción de actualización automática */}
                 <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer">
                   <input
                     type="checkbox"
                     checked={autoUpdateRate}
                     onChange={(e) => setAutoUpdateRate(e.target.checked)}
                     className="mt-0.5 rounded text-orange-500 focus:ring-orange-500 bg-slate-800 border-slate-700 w-4 h-4"
                   />
                   <div className="space-y-0.5">
                     <p className="text-[10px] font-black text-slate-300 uppercase tracking-tight">
                       Actualizar tasa automáticamente con BCV (1 vez al día)
                     </p>
                     <p className="text-[9px] text-slate-500 leading-tight">
                       Se actualiza automáticamente sólo una vez al día con el primer inicio. Si ajustas la tasa manualmente (ej. para el día lunes o fin de semana), tu tasa manual se respeta y no se sobreescribe durante el día.
                     </p>
                   </div>
                 </label>
              </div>

              <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl transition-all text-xs uppercase tracking-widest mt-2">
                 <Save size={18} /> GUARDAR CAMBIOS
              </button>
            </section>

            {/* Inteligencia Artificial (Gemini & DeepSeek) */}
            <section className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-slate-700 shadow-xl space-y-5">
              <h2 className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center gap-2">
                <Sparkles size={16} /> Inteligencia Artificial
              </h2>
              
              <div className="space-y-6">
                <p className="text-[9px] font-bold text-slate-400 uppercase leading-relaxed tracking-tight">
                  CONFIGURA TU PROPIA LLAVE DE API PARA QUE EL ANÁLISIS INTELIGENTE FUNCIONE FUERA DE AI STUDIO.
                </p>

                <div className="space-y-2">
                  <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Proveedor de IA Activo</label>
                  <select 
                    name="aiProvider" 
                    defaultValue={settings.aiProvider || "gemini"}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-xs font-bold outline-none focus:border-amber-500/50 text-white"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="deepseek">DeepSeek AI</option>
                    <option value="openai">OpenAI (ChatGPT)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Gemini Config */}
                  <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-700/50 space-y-4">
                    <h3 className="text-[10px] font-black text-blue-400 uppercase flex items-center gap-2">
                      <Brain size={14} /> Google Gemini
                    </h3>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Gemini API Key</label>
                      <input 
                        name="geminiApiKey" 
                        type="password"
                        defaultValue={settings.geminiApiKey} 
                        placeholder="Pega tu llave aquí..."
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-500/50" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Modelo</label>
                      <select 
                        name="geminiModel" 
                        defaultValue={settings.geminiModel || "gemini-3-flash-preview"}
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-500/50 text-white"
                      >
                        <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                        <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                      </select>
                    </div>
                  </div>

                  {/* DeepSeek Config */}
                  <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-700/50 space-y-4">
                    <h3 className="text-[10px] font-black text-slate-200 uppercase flex items-center gap-2">
                      <Brain size={14} /> DeepSeek AI
                    </h3>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-500 uppercase ml-2">DeepSeek API Key</label>
                      <input 
                        name="deepseekApiKey" 
                        type="password"
                        defaultValue={settings.deepseekApiKey} 
                        placeholder="sk-..."
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-slate-400/50" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Modelo</label>
                      <select 
                        name="deepseekModel" 
                        defaultValue={settings.deepseekModel || "deepseek-chat"}
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-slate-400/50 text-white"
                      >
                        <option value="deepseek-chat">DeepSeek Chat (V3)</option>
                        <option value="deepseek-reasoner">DeepSeek Reasoner (R1)</option>
                      </select>
                    </div>
                  </div>

                  {/* OpenAI Config */}
                  <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-700/50 space-y-4">
                    <h3 className="text-[10px] font-black text-emerald-400 uppercase flex items-center gap-2">
                      <Brain size={14} /> OpenAI
                    </h3>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-500 uppercase ml-2">OpenAI API Key</label>
                      <input 
                        name="openaiApiKey" 
                        type="password"
                        defaultValue={settings.openaiApiKey} 
                        placeholder="sk-..."
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-emerald-500/50" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Modelo</label>
                      <select 
                        name="openaiModel" 
                        defaultValue={settings.openaiModel || "gpt-4o-mini"}
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-emerald-500/50 text-white"
                      >
                        <option value="gpt-4o-mini">GPT-4o Mini (Recomendado)</option>
                        <option value="gpt-4o">GPT-4o (Potente)</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[8px] font-black text-blue-500 hover:text-blue-400 uppercase tracking-widest underline"
                  >
                    Obtener Gemini Key Gratis
                  </a>
                  <a 
                    href="https://platform.deepseek.com/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[8px] font-black text-slate-400 hover:text-slate-300 uppercase tracking-widest underline"
                  >
                    Obtener DeepSeek Key
                  </a>
                  <a 
                    href="https://platform.openai.com/api-keys" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[8px] font-black text-emerald-500 hover:text-emerald-400 uppercase tracking-widest underline"
                  >
                    Obtener OpenAI Key
                  </a>
                </div>
              </div>
            </section>

            {/* Gestión de Usuario / Perfil */}
            <section className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-slate-700 shadow-xl space-y-5">
              <h2 className="text-xs font-black uppercase tracking-widest text-orange-500 flex items-center gap-2">
                <User size={16} /> Mi Perfil de Acceso
              </h2>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-slate-900 rounded-2xl border border-slate-700">
                  <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center text-white font-black text-lg uppercase">
                    {user.name.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-xs font-black text-white uppercase tracking-tighter">{user.name}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Usuario: {user.username} | Rol: {user.role}</p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2">Cambiar Contraseña</p>
                  
                  {passwordError && <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest ml-2">{passwordError}</p>}
                  {passwordSuccess && <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest ml-2">{passwordSuccess}</p>}

                  <div className="space-y-1">
                    <input 
                      type="password" 
                      placeholder="Contraseña Actual" 
                      className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-xs font-bold outline-none focus:border-orange-500/50"
                      value={passwordForm.current}
                      onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input 
                      type="password" 
                      placeholder="Nueva Contraseña" 
                      className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-xs font-bold outline-none focus:border-orange-500/50"
                      value={passwordForm.new}
                      onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                    />
                    <input 
                      type="password" 
                      placeholder="Confirmar Nueva" 
                      className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-xs font-bold outline-none focus:border-orange-500/50"
                      value={passwordForm.confirm}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                    />
                  </div>
                  <button 
                    type="button" 
                    onClick={() => handleChangePassword()}
                    disabled={isChangingPassword}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 transition-all text-[9px] uppercase tracking-widest"
                  >
                    {isChangingPassword ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                    ACTUALIZAR CONTRASEÑA
                  </button>
                </div>
              </div>
            </section>

            {/* Biometric Access Info */}
            <section className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-slate-700 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-widest text-indigo-400 flex items-center gap-2">
                  <Fingerprint size={16} /> Acceso por Huella Digital
                </h2>
                <div className={`px-2.5 py-1 rounded-md text-[8px] font-bold uppercase tracking-tighter ${
                  isBiometricActiveForUser ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 
                  biometricStatus.isAvailable ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-slate-700/50 text-slate-400'
                }`}>
                  {isBiometricActiveForUser ? 'ACTIVA' : 
                   biometricStatus.isAvailable ? 'DISPONIBLE' : 
                   Capacitor.isNativePlatform() ? 'SIN HUELLA' : 'EN APK MÓVIL'}
                </div>
              </div>
              <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl space-y-3">
                <p className="text-[10px] font-bold text-slate-300 uppercase leading-relaxed tracking-tight">
                  {isBiometricActiveForUser
                    ? `La huella dactilar está vinculada al usuario (${user.username}). Puedes iniciar sesión instantáneamente desde la pantalla de bienvenida.`
                    : 'Vincula el sensor de huella de tu teléfono para iniciar sesión de forma rápida y segura sin escribir la contraseña.'}
                </p>

                {biometricStatus.message && !isBiometricActiveForUser && (
                  <p className="text-[9px] text-slate-400 font-semibold italic">
                    ℹ️ {biometricStatus.message}
                  </p>
                )}

                {isBiometricActiveForUser ? (
                  <div className="flex gap-2 pt-1">
                    <button 
                      type="button"
                      onClick={handleRegisterBiometric}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-md active:scale-95"
                    >
                      <Fingerprint size={14} /> Probar Huella
                    </button>
                    <button 
                      type="button"
                      onClick={handleDisableBiometric}
                      className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
                    >
                      Desactivar
                    </button>
                  </div>
                ) : (
                  <button 
                    type="button"
                    onClick={handleRegisterBiometric}
                    className="mt-2 w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-95"
                  >
                    <Fingerprint size={16} /> CONFIGURAR HUELLA DIGITAL
                  </button>
                )}
              </div>
            </section>

            {/* Documentation Section */}
            <section className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-slate-700 shadow-xl space-y-5">
              <h2 className="text-xs font-black uppercase tracking-widest text-blue-400 flex items-center gap-2">
                <Cloud size={16} /> Documentación del Sistema
              </h2>
              <p className="text-[9px] font-bold text-slate-400 uppercase leading-relaxed tracking-tight">
                DESCARGA LAS DESCRIPCIONES OFICIALES DE LA APLICACIÓN PARA USO TÉCNICO O COMERCIAL.
              </p>
              <div className="grid grid-cols-1 gap-3">
                <button 
                  type="button" 
                  disabled={isExportingDoc !== null}
                  onClick={() => downloadPDF("DESCRIPCIÓN TÉCNICA - D'DANEZ GESTOR PRO", TECHNICAL_DESCRIPTION, 'DDanez_GestorPro_Tecnico.pdf')}
                  className="w-full bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white border border-blue-600/30 p-4 rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 active:scale-98"
                >
                  {isExportingDoc === 'DDanez_GestorPro_Tecnico.pdf' ? (
                    <>
                      <Loader2 size={16} className="animate-spin text-blue-400" />
                      <span>GENERANDO DOCUMENTO TÉCNICO...</span>
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      <span>DESCARGAR / COMPARTIR DESCRIPCIÓN TÉCNICA (PDF)</span>
                    </>
                  )}
                </button>
                <button 
                  type="button" 
                  disabled={isExportingDoc !== null}
                  onClick={() => downloadPDF("DESCRIPCIÓN PROMOCIONAL - D'DANEZ GESTOR PRO", PROMOTIONAL_DESCRIPTION, 'DDanez_GestorPro_Promocional.pdf')}
                  className="w-full bg-indigo-600/10 hover:bg-indigo-600 text-indigo-500 hover:text-white border border-indigo-600/30 p-4 rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 active:scale-98"
                >
                  {isExportingDoc === 'DDanez_GestorPro_Promocional.pdf' ? (
                    <>
                      <Loader2 size={16} className="animate-spin text-indigo-400" />
                      <span>GENERANDO DOCUMENTO PROMOCIONAL...</span>
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      <span>DESCARGAR / COMPARTIR DESCRIPCIÓN PROMOCIONAL (PDF)</span>
                    </>
                  )}
                </button>
              </div>
            </section>

            {/* Maintenance Section */}
           <section className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-slate-700 shadow-xl space-y-5">
             <h2 className="text-xs font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">
               <Database size={16} /> Mantenimiento de Datos
             </h2>
             <div className="grid grid-cols-2 gap-4">
                <button 
                  type="button" 
                  onClick={handleExport} 
                  disabled={isExporting || isSharingCloud}
                  className="bg-slate-900 hover:bg-slate-800 text-slate-300 p-4 rounded-2xl border border-slate-700 flex flex-col items-center gap-2 transition-all active:scale-95 shadow-lg disabled:opacity-50"
                >
                   {isExporting ? <Loader2 size={22} className="text-emerald-500 animate-spin" /> : <Download size={22} className="text-emerald-500" />}
                   <span className="text-[10px] font-black uppercase tracking-widest">
                     {isExporting ? 'Respaldando...' : 'Respaldar'}
                   </span>
                </button>
                <button 
                  type="button" 
                  onClick={handleShareCloud} 
                  disabled={isExporting || isSharingCloud}
                  className="bg-slate-900 hover:bg-slate-800 text-slate-300 p-4 rounded-2xl border border-slate-700 flex flex-col items-center gap-2 transition-all active:scale-95 shadow-lg disabled:opacity-50"
                >
                   {isSharingCloud ? <Loader2 size={22} className="text-indigo-400 animate-spin" /> : <Cloud size={22} className="text-indigo-400" />}
                   <span className="text-[10px] font-black uppercase tracking-widest">
                     {isSharingCloud ? 'Conectando...' : 'Subir a Nube'}
                   </span>
                </button>
             </div>
             {backupStatusMessage && (
               <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-semibold text-center">
                 {backupStatusMessage}
               </div>
             )}
             <div className="grid grid-cols-1 gap-4">
                <label className="bg-slate-900 hover:bg-slate-800 text-slate-300 p-4 rounded-2xl border border-slate-700 flex flex-col items-center gap-2 transition-all active:scale-95 shadow-lg cursor-pointer text-center">
                   <Upload size={22} className="text-orange-500 mx-auto" />
                   <span className="text-[10px] font-black uppercase tracking-widest">Restaurar desde Archivo</span>
                   <input type="file" accept=".json" className="hidden" onChange={handleImport} />
                </label>
             </div>
             <button type="button" onClick={handleReset} className="w-full bg-rose-600/10 hover:bg-rose-600 text-rose-500 hover:text-white border border-rose-600/30 p-4 rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest">
                LIMPIAR TODA LA BASE DE DATOS
             </button>
           </section>
        </div>
      </form>
    </div>
  );
};

export default Settings;
