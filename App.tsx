
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  LayoutDashboard, Package, ShoppingCart, Tag, Users, Truck, 
  HandCoins, Wallet, BarChart3, Settings as SettingsIcon, Menu, X, UserCheck, Camera, ChefHat, Fingerprint,
  ArrowLeft
} from 'lucide-react';
import { AppTab, CompanyInfo, AppSettings, Product, Customer, Supplier, Sale, Purchase, Seller, User, Promotion, CustomerPromotion } from './types';
import { dbService } from './db';
import { isBiometricConfigured, authenticateWithBiometrics } from './biometricHelper';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { TextZoom } from '@capacitor/text-zoom';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Sales from './components/Sales';
import Purchases from './components/Purchases';
import Contacts from './components/Contacts';
import Accounts from './components/Accounts';
import Expenses from './components/Expenses';
import Reports from './components/Reports';
import Settings from './components/Settings';
import Splash from './components/Splash';
import ExchangeRateModal from './components/ExchangeRateModal';
import { fetchBcvRate } from './services/bcvService';
import { getTodayDateString } from './utils';
import Auth from './components/Auth';
import Manufacturing from './components/Manufacturing';
import Promotions from './components/Promotions';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const savedUser = localStorage.getItem('user_data');
      const savedToken = localStorage.getItem('auth_token');
      if (savedUser && savedToken) {
        dbService.setToken(savedToken);
        return { ...JSON.parse(savedUser), token: savedToken };
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  });
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    const saved = localStorage.getItem('active_tab');
    return (saved as AppTab) || AppTab.DASHBOARD;
  });
  const [tabHistory, setTabHistory] = useState<AppTab[]>([]);
  const [exitNotice, setExitNotice] = useState<string | null>(null);
  const exitNoticeTimerRef = useRef<any>(null);
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    const savedToken = localStorage.getItem('auth_token');
    const splashShown = sessionStorage.getItem('splash_shown');
    if (!savedToken || splashShown) {
      return false;
    }
    sessionStorage.setItem('splash_shown', 'true');
    return true;
  });
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [showPermissionNudge, setShowPermissionNudge] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isBiometricLocked, setIsBiometricLocked] = useState<boolean>(() => {
    const hasUser = !!localStorage.getItem('user_data');
    return hasUser && isBiometricConfigured();
  });

  const handleUnlockBiometric = useCallback(async () => {
    const res = await authenticateWithBiometrics("Toca el sensor de huella para acceder a Gestor Pro");
    if (res.success) {
      setIsBiometricLocked(false);
    }
  }, []);

  useEffect(() => {
    if (isBiometricLocked && user) {
      const timer = setTimeout(() => {
        handleUnlockBiometric();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isBiometricLocked, user, handleUnlockBiometric]);

  // Efecto para controlar la duración mínima del Splash
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isDataLoaded || !user) {
        setShowSplash(false);
      }
    }, 400); // Carga rápida y fluida (400ms)

    // Timeout de seguridad: desaparecer tras 3 segundos pase lo que pase
    const safetyTimer = setTimeout(() => {
      setShowSplash(false);
    }, 3000);

    return () => {
      clearTimeout(timer);
      clearTimeout(safetyTimer);
    };
  }, [isDataLoaded, user]);

  // Si los datos se cargan, y ya pasó el tiempo mínimo, quitamos el splash
  useEffect(() => {
    if (isDataLoaded && !showSplash) {
      localStorage.setItem('last_active_time', Date.now().toString());
    }
  }, [isDataLoaded, showSplash]);

  // Asegurar que el tamaño y escala en la APK coincidan exactamente con la versión web de Termux
  useEffect(() => {
    const lockScale = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          await TextZoom.set({ value: 1.0 });
        }
      } catch (err) {
        console.warn('TextZoom no disponible:', err);
      }
    };
    lockScale();
  }, []);

  const [company, setCompany] = useState<CompanyInfo>({
    name: "D'DANEZ DISTRIBUCIONES",
    rif: "J-00000000-0",
    address: "Calle Principal",
    phone: "0412-0000000"
  });

  const navigateToTab = useCallback((newTab: AppTab) => {
    setActiveTab(current => {
      if (current !== newTab) {
        setTabHistory(prev => {
          const filtered = prev.filter(t => t !== current);
          return [...filtered, current].slice(-20);
        });
        localStorage.setItem('active_tab', newTab);
        return newTab;
      }
      return current;
    });
    setIsSidebarOpen(false);
  }, []);

  const handleGoBack = useCallback(() => {
    // 1. Si el menú lateral está abierto, cerrarlo
    if (isSidebarOpen) {
      setIsSidebarOpen(false);
      return;
    }

    // 2. Si hay aviso de permiso de cámara abierto, cerrarlo y no volver a mostrarlo
    if (showPermissionNudge) {
      setShowPermissionNudge(false);
      localStorage.setItem('camera_permission_prompted', 'true');
      return;
    }

    // 3. Si hay modal de tasa de cambio abierto, cerrarlo
    if (showExchangeModal) {
      setShowExchangeModal(false);
      return;
    }

    // 3. Notificar a componentes hijos por si tienen modales abiertos
    const backEvent = new CustomEvent('app:backbutton', { cancelable: true });
    window.dispatchEvent(backEvent);
    if (backEvent.defaultPrevented) {
      return;
    }

    // 4. Si hay historial de pestañas anteriores, ir a la última pestaña visitada
    if (tabHistory.length > 0) {
      const previousTab = tabHistory[tabHistory.length - 1];
      setTabHistory(prev => prev.slice(0, -1));
      setActiveTab(previousTab);
      localStorage.setItem('active_tab', previousTab);
      return;
    }

    // 5. Si no hay historial pero estamos fuera de DASHBOARD, volver a DASHBOARD
    if (activeTab !== AppTab.DASHBOARD) {
      setActiveTab(AppTab.DASHBOARD);
      localStorage.setItem('active_tab', AppTab.DASHBOARD);
      return;
    }

    // 6. Ya estamos en el Dashboard y sin historial previo: NO salir de la aplicación
    // Se sale únicamente cuando el usuario lo indique en el menú lateral ("Salir del Sistema")
    setExitNotice("Para salir, utiliza la opción 'Salir del Sistema' en el menú lateral");
    if (exitNoticeTimerRef.current) {
      clearTimeout(exitNoticeTimerRef.current);
    }
    exitNoticeTimerRef.current = setTimeout(() => {
      setExitNotice(null);
    }, 2800);
  }, [isSidebarOpen, showExchangeModal, tabHistory, activeTab]);

  const handleGoBackRef = useRef(handleGoBack);
  useEffect(() => {
    handleGoBackRef.current = handleGoBack;
  }, [handleGoBack]);
  
  const [settings, setSettings] = useState<AppSettings>({
    exchangeRate: 45.5,
    lastRateUpdate: '',
    darkMode: true,
    showLogoOnTicket: true,
    showIvaOnTicket: true,
    includeQr: false,
    ticketFooter: "¡Gracias por su compra!\nNo se aceptan devoluciones sin factura."
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [customerPromotions, setCustomerPromotions] = useState<CustomerPromotion[]>([]);

  const lastDataLoadRef = useRef<number>(0);

  const loadData = useCallback(async (force = false) => {
    if (!user) return;
    try {
      dbService.setToken(user.token || null);
      lastDataLoadRef.current = Date.now();

      // Intento 1: Bootstrap de alto rendimiento (1 sola llamada ultrarrápida)
      const bootData = await dbService.bootstrap();

      let p: Product[] = [];
      let c: Customer[] = [];
      let s: Supplier[] = [];
      let sa: Sale[] = [];
      let pu: Purchase[] = [];
      let st: any[] = [];
      let sel: Seller[] = [];
      let pay: any[] = [];
      let ex: any[] = [];
      let mov: any[] = [];
      let pro: Promotion[] = [];
      let cpro: CustomerPromotion[] = [];

      if (bootData) {
        p = bootData.products || [];
        c = bootData.customers || [];
        s = bootData.suppliers || [];
        sa = bootData.sales || [];
        pu = bootData.purchases || [];
        st = bootData.settings || [];
        sel = bootData.sellers || [];
        pay = bootData.payments || [];
        ex = bootData.expenses || [];
        mov = bootData.movements || [];
        pro = bootData.promotions || [];
        cpro = bootData.customer_promotions || [];
      } else {
        // Fallback: Si no hay bootstrap disponible
        await dbService.init();
        [p, c, s, sa, pu, st, sel, pay, ex, mov, pro, cpro] = await Promise.all([
          dbService.getAll<Product>('products'),
          dbService.getAll<Customer>('customers'),
          dbService.getAll<Supplier>('suppliers'),
          dbService.getAll<Sale>('sales'),
          dbService.getAll<Purchase>('purchases'),
          dbService.getAll<any>('settings'),
          dbService.getAll<Seller>('sellers'),
          dbService.getAll<any>('payments'),
          dbService.getAll<any>('expenses'),
          dbService.getAll<any>('movements'),
          dbService.getAll<any>('promotions'),
          dbService.getAll<any>('customer_promotions')
        ]);
      }

      setProducts(p || []);
      setCustomers(c || []);
      setSuppliers(s || []);
      setSellers(sel || []);
      setSales((sa || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setPurchases((pu || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setPayments((pay || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setExpenses((ex || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setMovements((mov || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setPromotions(pro || []);
      setCustomerPromotions(cpro || []);

      const savedSettings = st.find((s: any) => s.id === 'app_settings');
      const savedCompany = st.find((s: any) => s.id === 'company_info');

      if (savedSettings) setSettings(savedSettings);
      if (savedCompany) setCompany(savedCompany);

      const today = getTodayDateString();
      const storedLastCheck = localStorage.getItem('bcv_rate_checked_date');
      const alreadyCheckedToday = (storedLastCheck === today) || (savedSettings && savedSettings.lastAutoRateCheckDate === today);
      const shouldAutoUpdate = !savedSettings || savedSettings.autoUpdateExchangeRate !== false;
      
      // La actualización automática SOLO se ejecuta una vez al día con el primer inicio de la app
      if (!alreadyCheckedToday) {
        // Registrar hoy de inmediato para evitar que inicios o reloads posteriores en el mismo día vuelvan a consultar
        localStorage.setItem('bcv_rate_checked_date', today);

        if (shouldAutoUpdate) {
          fetchBcvRate().then(async (bcvRes) => {
            if (bcvRes.success && bcvRes.rate > 0) {
              const currentSt = savedSettings || { ...settings };
              // Si el usuario ya estableció una tasa manual para hoy, respetarla y no sobreescribirla
              if (currentSt.manualRateDate === today) {
                console.log("Tasa manual configurada por el usuario para hoy; no se sobreescribe.");
                return;
              }
              const updated = {
                ...currentSt,
                exchangeRate: bcvRes.rate,
                lastRateUpdate: today,
                lastAutoRateCheckDate: today,
                exchangeRateSource: bcvRes.source,
                isManualRate: false
              };
              setSettings(updated);
              await dbService.put('settings', { ...updated, id: 'app_settings' });
              setExitNotice(`⚡ Tasa BCV actualizada: ${bcvRes.rate.toFixed(2)} Bs/$`);
              setTimeout(() => setExitNotice(null), 5000);
            } else {
              if (!savedSettings || !savedSettings.exchangeRate || savedSettings.exchangeRate <= 0) {
                setShowExchangeModal(true);
              }
            }
          }).catch(() => {
            if (!savedSettings || !savedSettings.exchangeRate || savedSettings.exchangeRate <= 0) {
              setShowExchangeModal(true);
            }
          });
        } else {
          if (!savedSettings || !savedSettings.exchangeRate || savedSettings.exchangeRate <= 0) {
            setShowExchangeModal(true);
          }
        }
      }
    } catch (err) {
      console.error("Error al cargar datos:", err);
    } finally {
      setIsDataLoaded(true);
    }
  }, [user]);

  // Comprobación de permiso de cámara: ÚNICAMENTE en el primer inicio de la app
  useEffect(() => {
    if (!user) return;
    const hasPrompted = localStorage.getItem('camera_permission_prompted');
    if (hasPrompted) return;

    // Se marca inmediatamente para garantizar que NUNCA vuelva a salir en inicios posteriores
    localStorage.setItem('camera_permission_prompted', 'true');

    const checkInitialCameraPermission = async () => {
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
          if (status.state === 'prompt') {
            setShowPermissionNudge(true);
          }
        } else {
          setShowPermissionNudge(true);
        }
      } catch (e) {
        console.warn("Permissions API no disponible para cámara");
      }
    };

    const timer = setTimeout(checkInitialCameraPermission, 1200);
    return () => clearTimeout(timer);
  }, [user]);

  const forceLogout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('active_tab');
    setUser(null);
    dbService.setToken(null);
  }, []);

  useEffect(() => {
    dbService.setOnSessionExpired(() => {
      forceLogout();
    });
  }, [forceLogout]);

  useEffect(() => {
    const savedUser = localStorage.getItem('user_data');
    const savedToken = localStorage.getItem('auth_token');
    if (savedUser && savedToken) {
      setUser({ ...JSON.parse(savedUser), token: savedToken });
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('active_tab', activeTab);
    }
  }, [activeTab, user]);

  // Manejo del botón atrás (Android Nativo con Capacitor + Navegador Web) y ciclo de vida
  useEffect(() => {
    if (!user) return;

    // 1. Listener nativo de Capacitor para Android (botón atrás físico o gesto)
    let backHandle: any = null;
    CapacitorApp.addListener('backButton', () => {
      handleGoBackRef.current();
    }).then(handle => {
      backHandle = handle;
    }).catch(err => {
      console.warn("Capacitor backButton no disponible en este entorno:", err);
    });

    // 2. Listener para navegador web y PWA
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState({ app: 'gestor-pro' }, '', window.location.pathname);
      handleGoBackRef.current();
    };

    window.history.pushState({ app: 'gestor-pro' }, '', window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    
    // Escuchar cuando la app vuelve a primer plano
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        window.history.pushState({ app: 'gestor-pro' }, '', window.location.pathname);
        localStorage.setItem('last_active_time', Date.now().toString());
        // Solo refrescar si han pasado más de 10 minutos de inactividad
        const elapsed = Date.now() - lastDataLoadRef.current;
        if (elapsed > 600000) {
          loadData();
        }
      }
    };
    window.document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleUnload = () => {
      localStorage.setItem('last_active_time', Date.now().toString());
    };
    window.addEventListener('unload', handleUnload);

    // Actualizar el tiempo de actividad periódicamente
    const activityInterval = setInterval(() => {
      localStorage.setItem('last_active_time', Date.now().toString());
    }, 60000); // Cada minuto

    return () => {
      if (backHandle) {
        backHandle.remove?.();
      }
      window.removeEventListener('popstate', handlePopState);
      window.document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('unload', handleUnload);
      clearInterval(activityInterval);
    };
  }, [user, loadData]);

  const handleLogout = async () => {
    if (!confirm('¿ESTÁ SEGURO QUE DESEA SALIR DE LA APLICACIÓN?')) return;
    forceLogout();
    if (Capacitor.isNativePlatform()) {
      try {
        await CapacitorApp.exitApp();
      } catch (e) {
        console.error("Error al salir de la aplicación nativa:", e);
      }
    }
  };

  const handleUpdateExchangeRate = async (rate: number, source?: string) => {
    const today = getTodayDateString();
    localStorage.setItem('bcv_rate_checked_date', today);

    const isManual = source ? source.toLowerCase().includes('manual') : true;
    const newSettings: AppSettings = { 
      ...settings, 
      exchangeRate: rate, 
      lastRateUpdate: today,
      lastAutoRateCheckDate: today,
      manualRateDate: isManual ? today : settings.manualRateDate,
      isManualRate: isManual,
      exchangeRateSource: source || 'Manual'
    };
    setSettings(newSettings);
    await dbService.put('settings', { ...newSettings, id: 'app_settings' });
    setShowExchangeModal(false);
  };

  const navItems = [
    { id: AppTab.DASHBOARD, label: 'DASHBOARD', icon: LayoutDashboard, roles: ['admin', 'seller'] },
    { id: AppTab.INVENTORY, label: 'INVENTARIO', icon: Package, roles: ['admin'] },
    { id: AppTab.SALES, label: 'VENTAS POS', icon: Tag, roles: ['admin', 'seller'] },
    { id: AppTab.PURCHASES, label: 'COMPRAS', icon: ShoppingCart, roles: ['admin'] },
    { id: AppTab.EXPENSES, label: 'GASTOS', icon: Wallet, roles: ['admin'] },
    { id: AppTab.CUSTOMERS, label: 'CLIENTES', icon: Users, roles: ['admin', 'seller'] },
    { id: AppTab.SUPPLIERS, label: 'PROVEEDORES', icon: Truck, roles: ['admin'] },
    { id: AppTab.MANUFACTURING, label: 'MANUFACTURA', icon: ChefHat, roles: ['admin'] },
    { id: AppTab.PROMOTIONS, label: 'PROMOCIONES', icon: Tag, roles: ['admin', 'seller'] },
    { id: AppTab.CXC, label: 'CXC (DEUDAS)', icon: HandCoins, roles: ['admin', 'seller'] },
    { id: AppTab.CXP, label: 'CXP (PAGOS)', icon: Wallet, roles: ['admin'] },
    { id: AppTab.REPORTS, label: 'REPORTES', icon: BarChart3, roles: ['admin'] },
    { id: AppTab.SETTINGS, label: 'AJUSTES', icon: SettingsIcon, roles: ['admin'] },
  ];

  const filteredNavItems = useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') return navItems;

    // Si es vendedor y tiene privilegios asignados específicamente por el admin
    if (user.permissions && user.permissions.length > 0) {
      return navItems.filter(item => 
        item.id !== AppTab.SETTINGS && user.permissions!.includes(item.id)
      );
    }

    // Por defecto para vendedores sin permisos explícitos
    return navItems.filter(item => item.roles.includes('seller'));
  }, [user]);

  // Si la pestaña activa no está permitida para este usuario, redirigir a la primera permitida
  useEffect(() => {
    if (user && filteredNavItems.length > 0) {
      const isCurrentAllowed = filteredNavItems.some(item => item.id === activeTab);
      if (!isCurrentAllowed) {
        setActiveTab(filteredNavItems[0].id);
      }
    }
  }, [user, filteredNavItems, activeTab]);

  const currentTabLabel = navItems.find(item => item.id === activeTab)?.label || 'GESTIÓN';

  const requestCameraPermission = async () => {
    localStorage.setItem('camera_permission_prompted', 'true');
    setShowPermissionNudge(false);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (err) {
      console.warn("Permiso de cámara no concedido o no disponible:", err);
    }
  };

  const dismissCameraPermission = () => {
    localStorage.setItem('camera_permission_prompted', 'true');
    setShowPermissionNudge(false);
  };

  const cxcPendingItems = useMemo(() => sales.filter(s => s.status === 'pending'), [sales]);
  const cxpPendingItems = useMemo(() => purchases.filter(p => p.status === 'pending'), [purchases]);

  if (!user) return <Auth onLogin={setUser} />;

  if (isBiometricLocked) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 select-none">
        <div className="max-w-xs w-full bg-[#1e293b] border border-slate-700/80 p-8 rounded-[2.5rem] shadow-2xl text-center space-y-6 animate-in zoom-in-95">
          <div className="w-20 h-20 bg-orange-500/10 text-orange-500 rounded-3xl flex items-center justify-center mx-auto border border-orange-500/20 shadow-lg shadow-orange-500/10">
            <Fingerprint size={44} className="animate-pulse" />
          </div>
          
          <div className="space-y-1">
            <h2 className="text-xl font-black text-white uppercase tracking-tight">Acceso Biométrico</h2>
            <p className="text-orange-400 text-xs font-bold uppercase tracking-wider">
              {user.name || user.username}
            </p>
            <p className="text-slate-400 text-[10px] leading-relaxed">
              Toca el sensor de huella digital de tu teléfono para ingresar a Gestor Pro
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={handleUnlockBiometric}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-black py-4 px-4 rounded-2xl shadow-xl shadow-orange-500/25 uppercase text-xs tracking-wider flex items-center justify-center gap-2.5 active:scale-95 transition-all border border-orange-400/30 touch-manipulation"
            >
              <Fingerprint size={20} />
              <span>Desbloquear con Huella</span>
            </button>

            <button
              onClick={() => {
                setIsBiometricLocked(false);
                forceLogout();
              }}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-bold py-3 px-4 rounded-xl text-[10px] uppercase tracking-wider transition-all touch-manipulation"
            >
              Usar Contraseña / Salir
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showSplash) return <Splash company={company} />;

  return (
    <div className={`min-h-screen ${settings.darkMode ? 'bg-[#0f172a] text-white' : 'bg-slate-50 text-slate-900'} flex flex-col md:flex-row`}>
      {/* Aviso de Permisos: ÚNICAMENTE al primer inicio */}
      {showPermissionNudge && (
        <div className="fixed inset-0 z-[1000] bg-[#0f172a]/95 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-[#1e293b] border border-slate-700 p-8 rounded-[3rem] max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 relative">
            <button
              type="button"
              onClick={dismissCameraPermission}
              className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors touch-manipulation"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
            <div className="w-20 h-20 bg-orange-500/10 text-orange-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Camera size={40} />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tighter mb-4 text-white">Acceso a Cámara</h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed font-bold uppercase tracking-tight">
              ESTA APLICACIÓN REQUIERE ACCESO A SU CÁMARA PARA PERMITIR EL ESCANEO DE CÓDIGOS DE BARRAS EN VENTAS E INVENTARIO.
            </p>
            <div className="space-y-3">
              <button 
                type="button"
                onClick={requestCameraPermission}
                className="w-full bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-orange-500/20 uppercase text-[10px] tracking-[0.2em] touch-manipulation"
              >
                PERMITIR ACCESO
              </button>
              <button 
                type="button"
                onClick={dismissCameraPermission}
                className="w-full bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-400 hover:text-white font-bold py-3.5 rounded-2xl transition-all uppercase text-[10px] tracking-wider touch-manipulation border border-slate-700/60"
              >
                AHORA NO / CONTINUAR
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="md:hidden flex items-center justify-between p-4 bg-[#1e293b] border-b border-slate-700 sticky top-0 z-50 h-14">
        <div className="flex items-center gap-1">
          <button 
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            className="p-2.5 text-slate-200 active:scale-90 transition-transform touch-manipulation focus:outline-none"
            aria-label="Menú principal"
          >
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          {activeTab !== AppTab.DASHBOARD && (
            <button
              type="button"
              onClick={handleGoBack}
              className="p-1.5 px-2.5 text-orange-400 hover:text-orange-300 active:scale-90 transition-transform flex items-center gap-1 rounded-xl bg-slate-800/80 border border-slate-700/60 ml-1"
              aria-label="Atrás"
              title="Volver a la pantalla anterior"
            >
              <ArrowLeft size={16} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Atrás</span>
            </button>
          )}
        </div>
        <span className="font-black text-[10px] truncate uppercase tracking-widest text-orange-500">{currentTabLabel}</span>
        <div className="w-8"></div>
      </div>

      <aside className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:sticky top-0 inset-y-0 left-0 z-50 w-64 bg-[#1e293b] border-r border-slate-700 transition-transform duration-300 ease-in-out flex flex-col h-screen`}>
        <div className="p-6 border-b border-slate-700/50 flex items-center gap-3">
           <div className="w-8 h-8 bg-orange-500 rounded-xl flex items-center justify-center text-white shadow-lg">
              <Package size={18} />
           </div>
           <span className="font-black text-xs tracking-tighter uppercase italic">Gestor<span className="text-orange-500">PRO</span></span>
        </div>
        <nav className="px-3 space-y-1 flex-1 overflow-y-auto py-4">
          {filteredNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { navigateToTab(item.id); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all touch-manipulation active:scale-[0.98] ${activeTab === item.id ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700/50">
          <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-2xl mb-3">
            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white font-black text-xs uppercase">
              {user.name.slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-white truncate uppercase tracking-tighter">{user.name}</p>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{user.role}</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={handleLogout}
            className="w-full py-3 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 touch-manipulation active:scale-95"
          >
            <X size={14} /> Salir del Sistema
          </button>
        </div>
      </aside>

      {isSidebarOpen && <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setIsSidebarOpen(false)} />}

      <main className="flex-1 overflow-y-auto bg-[#0f172a]">
        <div className="max-w-6xl mx-auto p-4 md:p-8 pb-24 md:pb-8">
          {activeTab === AppTab.DASHBOARD && <Dashboard sales={sales} purchases={purchases} expenses={expenses} products={products} settings={settings} movements={movements} />}
          {activeTab === AppTab.INVENTORY && <Inventory products={products} setProducts={setProducts} settings={settings} customers={customers} />}
          {activeTab === AppTab.SALES && <Sales sales={sales} setSales={setSales} customers={customers} setCustomers={setCustomers} products={products} setProducts={setProducts} sellers={sellers} settings={settings} company={company} />}
          {activeTab === AppTab.PURCHASES && <Purchases purchases={purchases} setPurchases={setPurchases} suppliers={suppliers} setSuppliers={setSuppliers} products={products} setProducts={setProducts} settings={settings} />}
          {activeTab === AppTab.EXPENSES && <Expenses expenses={expenses} setExpenses={setExpenses} settings={settings} />}
          {activeTab === AppTab.CUSTOMERS && <Contacts type="customers" items={customers} setItems={setCustomers} relatedData={sales} payments={payments} settings={settings} />}
          {activeTab === AppTab.SUPPLIERS && <Contacts type="suppliers" items={suppliers} setItems={setSuppliers} relatedData={purchases} payments={payments} settings={settings} />}
          { activeTab === AppTab.MANUFACTURING && <Manufacturing settings={settings} /> }
          { activeTab === AppTab.PROMOTIONS && <Promotions settings={settings} company={company} customers={customers} products={products} setProducts={setProducts} /> }
          {activeTab === AppTab.CXC && <Accounts type="cxc" items={cxcPendingItems} settings={settings} company={company} onUpdate={loadData} customers={customers} suppliers={suppliers} />}
          {activeTab === AppTab.CXP && <Accounts type="cxp" items={cxpPendingItems} settings={settings} company={company} onUpdate={loadData} customers={customers} suppliers={suppliers} />}
          {activeTab === AppTab.REPORTS && <Reports sales={sales} purchases={purchases} expenses={expenses} products={products} customers={customers} suppliers={suppliers} settings={settings} movements={movements} promotions={promotions} customerPromotions={customerPromotions} />}
          {activeTab === AppTab.SETTINGS && <Settings company={company} setCompany={setCompany} settings={settings} setSettings={setSettings} user={user} onCurrentUserUpdated={setUser} />}
        </div>
      </main>

      {showExchangeModal && (
        <ExchangeRateModal 
          onSave={handleUpdateExchangeRate} 
          currentRate={settings.exchangeRate} 
          onClose={() => setShowExchangeModal(false)}
        />
      )}

      {exitNotice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] bg-slate-900/95 text-slate-200 border border-orange-500/50 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-black animate-in fade-in slide-in-from-bottom-3 duration-200 backdrop-blur-md max-w-sm text-center tracking-tight uppercase">
          <span className="text-orange-500 text-sm">ℹ️</span>
          <span>{exitNotice}</span>
        </div>
      )}
    </div>
  );
};

export default App;
