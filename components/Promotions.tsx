
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Tag, Plus, Search, Trash2, UserCheck, Gift, ChevronRight, 
  CheckCircle2, Clock, AlertCircle, UserPlus, Package, Phone, X, Edit2, FileText, Settings2
} from 'lucide-react';
import { CompanyInfo, AppSettings, Customer, Product, Promotion, CustomerPromotion } from '../types';
import { dbService } from '../db';
import { CelebrationModal } from './CelebrationModal';
import { PromotionReportModal } from './PromotionReportModal';

interface PromotionsProps {
  settings: AppSettings;
  company: CompanyInfo;
  customers: Customer[];
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
}

const Promotions: React.FC<PromotionsProps> = ({ settings, company, customers, products, setProducts }) => {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [customerPromotions, setCustomerPromotions] = useState<CustomerPromotion[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState<Promotion | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Estados para celebración
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState({ customerName: '', promotionName: '' });

  // Manejar retroceso de modales con la flecha atrás de Android
  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (showCelebration) {
        e.preventDefault();
        setShowCelebration(false);
        return;
      }
      if (showReportModal) {
        e.preventDefault();
        setShowReportModal(false);
        return;
      }
      if (showRedeemModal) {
        e.preventDefault();
        setShowRedeemModal(false);
        return;
      }
      if (showPromoModal) {
        e.preventDefault();
        setShowPromoModal(false);
        return;
      }
    };
    window.addEventListener('app:backbutton', handleBackButton);
    return () => window.removeEventListener('app:backbutton', handleBackButton);
  }, [showCelebration, showReportModal, showRedeemModal, showPromoModal]);

  const [newPromo, setNewPromo] = useState<Partial<Promotion>>({
    name: '',
    description: '',
    type: 'docena_13',
    enrollmentType: 'manual',
    requiredQuantity: 12,
    rewardQuantity: 1,
    isActive: true,
    excludedPromotionIds: []
  });

  const loadData = useCallback(async () => {
    try {
      const [p, cp] = await Promise.all([
        dbService.getAll<Promotion>('promotions'),
        dbService.getAll<CustomerPromotion>('customer_promotions')
      ]);

      const rawPromos = p || [];
      const rawCustomerPromos = cp || [];

      // Identificar si hay customer_promotions dentro de promotions
      const validPromos: Promotion[] = [];
      const extraCustomerPromos: CustomerPromotion[] = [];

      for (const item of rawPromos as any[]) {
        if (item && item.customerId && item.promotionId) {
          extraCustomerPromos.push({
            id: item.id || crypto.randomUUID(),
            customerId: item.customerId,
            promotionId: item.promotionId,
            currentCount: Number(item.currentCount) || 0,
            totalRedeemed: Number(item.totalRedeemed) || 0,
            lastUpdate: item.lastUpdate || new Date().toISOString()
          });
        } else if (item) {
          validPromos.push({
            ...item,
            name: item.name || 'Promoción',
            description: item.description || '',
            enrollmentType: item.enrollmentType || 'manual'
          });
        }
      }

      const combinedCustomerPromos = [...rawCustomerPromos, ...extraCustomerPromos];

      // Auto-generar campaña visible si hay clientes acumulando puntos de una promoción sin cabecera
      for (const cpItem of combinedCustomerPromos) {
        if (cpItem && cpItem.promotionId && !validPromos.some(vp => vp.id === cpItem.promotionId)) {
          const recoveredPromo: Promotion = {
            id: cpItem.promotionId,
            name: 'Promoción Recuperada',
            description: 'Restaurada automáticamente con el historial de clientes',
            type: 'docena_13',
            enrollmentType: 'manual',
            requiredQuantity: 12,
            rewardQuantity: 1,
            isActive: true,
            excludedPromotionIds: []
          };
          validPromos.push(recoveredPromo);
          dbService.put('promotions', recoveredPromo).catch(console.error);
        }
      }

      setPromotions(validPromos);
      setCustomerPromotions(combinedCustomerPromos);
    } catch (err) {
      console.error("Error al cargar promociones:", err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSavePromo = async () => {
    if (!newPromo.name?.trim()) {
      alert('EL NOMBRE ES REQUERIDO');
      return;
    }

    try {
      const promo: Promotion = {
        id: (newPromo as Promotion).id || crypto.randomUUID(),
        name: newPromo.name.trim(),
        description: newPromo.description || '',
        type: newPromo.type as any,
        enrollmentType: (newPromo.enrollmentType as any) || 'manual',
        productId: newPromo.productId,
        requiredQuantity: Number(newPromo.requiredQuantity) || 12,
        rewardQuantity: Number(newPromo.rewardQuantity) || 1,
        isActive: newPromo.isActive ?? true,
        excludedPromotionIds: newPromo.excludedPromotionIds || []
      };

      await dbService.put('promotions', promo);
      setShowPromoModal(false);
      setNewPromo({
        name: '',
        description: '',
        type: 'docena_13',
        enrollmentType: 'manual',
        requiredQuantity: 12,
        rewardQuantity: 1,
        isActive: true,
        excludedPromotionIds: []
      });
      loadData();
    } catch (err) {
      console.error("Error al guardar promoción:", err);
      alert('ERROR AL GUARDAR LA PROMOCIÓN');
    }
  };

  const handleEnroll = async (customerId: string, promoId: string) => {
    try {
      const existing = customerPromotions.find(cp => cp.customerId === customerId && cp.promotionId === promoId);
      if (existing) return existing;

      const updated: CustomerPromotion = {
        id: crypto.randomUUID(),
        customerId,
        promotionId: promoId,
        currentCount: 0,
        totalRedeemed: 0,
        lastUpdate: new Date().toISOString()
      };

      await dbService.put('customer_promotions', updated);
      loadData();
      return updated;
    } catch (err) {
      console.error("Error al inscribir cliente:", err);
      return undefined;
    }
  };

  const handleAddPurchase = async (customerId: string, promoId: string) => {
    setIsSaving(true);
    try {
      const existing = customerPromotions.find(cp => cp.customerId === customerId && cp.promotionId === promoId);
      const promo = promotions.find(p => p.id === promoId);
      
      if (!promo) return;

      // 0. Verificar excepciones (si el cliente ya está en una promoción excluida)
      if (promo.excludedPromotionIds && promo.excludedPromotionIds.length > 0) {
        const activePromosForCustomer = customerPromotions.filter(cp => cp.customerId === customerId && cp.currentCount > 0);
        const hasConflict = activePromosForCustomer.some(cp => promo.excludedPromotionIds?.includes(cp.promotionId));
        
        if (hasConflict) {
          const conflictingPromo = promotions.find(p => activePromosForCustomer.some(cp => cp.promotionId === p.id && promo.excludedPromotionIds?.includes(p.id)));
          alert(`EL CLIENTE YA TIENE UNA PROMOCIÓN ACTIVA INCOMPATIBLE: ${conflictingPromo?.name || 'OTRA PROMO'}`);
          return;
        }
      }

      // 1. Descontar stock si hay un producto vinculado
      if (promo.productId) {
        const product = products.find(p => p.id === promo.productId);
        if (product) {
          if (product.stock <= 0) {
            alert('SIN EXISTENCIAS EN INVENTARIO');
            return;
          }

          const updatedProduct = { ...product, stock: product.stock - 1 };
          await dbService.put('products', updatedProduct);
          setProducts(prev => prev.map(p => p.id === product.id ? updatedProduct : p));

          // Registrar movimiento
          await dbService.put('movements', {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            productId: product.id,
            productName: product.name,
            type: 'sale',
            quantity: -1,
            stockAfter: updatedProduct.stock,
            relatedId: promo.id
          });
        }
      }

      // 2. Actualizar contador de promoción
      let updated: CustomerPromotion;
      const customer = customers.find(c => c.id === customerId);
      
      if (existing) {
        const oldCount = existing.currentCount;
        updated = {
          ...existing,
          currentCount: existing.currentCount + 1,
          lastUpdate: new Date().toISOString()
        };

        // Verificar si completó la meta
        if (oldCount < promo.requiredQuantity && updated.currentCount >= promo.requiredQuantity) {
          setCelebrationData({
            customerName: customer?.name || 'Cliente',
            promotionName: promo.name
          });
          setShowCelebration(true);
        }
      } else {
        updated = {
          id: crypto.randomUUID(),
          customerId,
          promotionId: promoId,
          currentCount: 1,
          totalRedeemed: 0,
          lastUpdate: new Date().toISOString()
        };

        // Verificar si completó la meta (si requiredQuantity es 1)
        if (updated.currentCount >= promo.requiredQuantity) {
          setCelebrationData({
            customerName: customer?.name || 'Cliente',
            promotionName: promo.name
          });
          setShowCelebration(true);
        }
      }

      await dbService.put('customer_promotions', updated);
      loadData();
    } catch (err) {
      console.error("Error al registrar compra:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualAdjustment = async (cpId: string) => {
    const cp = customerPromotions.find(x => x.id === cpId);
    if (!cp) return;

    const newValue = prompt(`AJUSTE MANUAL: INGRESE EL NUEVO CONTEO PARA ESTE CLIENTE (ACTUAL: ${cp.currentCount})`, cp.currentCount.toString());
    
    if (newValue === null) return;
    
    const parsed = parseInt(newValue);
    if (isNaN(parsed) || parsed < 0) {
      alert('VALOR INVÁLIDO');
      return;
    }

    setIsSaving(true);
    try {
      const updated: CustomerPromotion = {
        ...cp,
        currentCount: parsed,
        lastUpdate: new Date().toISOString()
      };

      await dbService.put('customer_promotions', updated);
      
      // Verificar si completó la meta con el ajuste
      const promo = promotions.find(p => p.id === cp.promotionId);
      if (promo && cp.currentCount < promo.requiredQuantity && parsed >= promo.requiredQuantity) {
        const customer = customers.find(c => c.id === cp.customerId);
        setCelebrationData({
          customerName: customer?.name || 'Cliente',
          promotionName: promo.name
        });
        setShowCelebration(true);
      }

      loadData();
    } catch (err) {
      console.error("Error al ajustar conteo:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRedeem = async (cpId: string) => {
    setIsSaving(true);
    try {
      const cp = customerPromotions.find(item => item.id === cpId);
      const promo = promotions.find(p => p.id === cp?.promotionId);
      
      if (!cp || !promo) return;

      if (cp.currentCount < promo.requiredQuantity) {
        alert('EL CLIENTE AÚN NO HA COMPLETADO EL REQUERIMIENTO');
        return;
      }

      // 1. Descontar stock del obsequio si hay un producto vinculado y registrar movimiento
      let deliveredProductName = promo.name;
      let deliveredProductId = 'promo_reward';
      let remainingStock = 0;

      if (promo.productId) {
        const product = products.find(p => p.id === promo.productId);
        if (product) {
          if (product.stock <= 0) {
            alert('SIN EXISTENCIAS PARA EL OBSEQUIO');
            return;
          }

          const updatedProduct = { ...product, stock: product.stock - 1 };
          await dbService.put('products', updatedProduct);
          setProducts(prev => prev.map(p => p.id === product.id ? updatedProduct : p));
          deliveredProductName = product.name;
          deliveredProductId = product.id;
          remainingStock = updatedProduct.stock;
        }
      }

      const customer = customers.find(c => c.id === cp.customerId);

      // Registrar movimiento como obsequio con metadatos completos para auditoría y reportes
      await dbService.put('movements', {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        productId: deliveredProductId,
        productName: deliveredProductName,
        type: 'obsequio',
        quantity: -(promo.rewardQuantity || 1),
        stockAfter: remainingStock,
        relatedId: promo.id,
        customerId: customer?.id || cp.customerId,
        customerName: customer?.name || 'Cliente',
        promotionId: promo.id,
        promotionName: promo.name
      });

      // 2. Actualizar contador
      const updated: CustomerPromotion = {
        ...cp,
        currentCount: cp.currentCount - promo.requiredQuantity,
        totalRedeemed: cp.totalRedeemed + 1,
        lastUpdate: new Date().toISOString()
      };

      await dbService.put('customer_promotions', updated);
      loadData();
    } catch (err) {
      console.error("Error al canjear promoción:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePromo = async (id: string) => {
    if (!confirm('¿ESTÁ SEGURO DE ELIMINAR ESTA PROMOCIÓN?')) return;
    try {
      await dbService.delete('promotions', id);
      loadData();
    } catch (err) {
      console.error("Error al eliminar promoción:", err);
    }
  };

  const handleDeleteCustomerFromPromo = async (cpId: string) => {
    if (!confirm('¿ESTÁ SEGURO DE ELIMINAR A ESTE CLIENTE DE LA PROMOCIÓN?')) return;
    try {
      await dbService.delete('customer_promotions', cpId);
      loadData();
    } catch (err) {
      console.error("Error al eliminar cliente de la promoción:", err);
    }
  };

  const filteredPromos = promotions.filter(p => 
    (p?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p?.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic">
            PROMOCIONES <span className="text-orange-500">& FIDELIDAD</span>
          </h1>
          <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-1">
            GESTIONA TUS CAMPAÑAS Y PREMIA A TUS CLIENTES
          </p>
        </div>
        <button 
          onClick={() => setShowPromoModal(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2"
        >
          <Plus size={18} /> NUEVA CAMPAÑA
        </button>
      </div>

      {/* Search & Filters */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input 
          type="text" 
          placeholder="BUSCAR PROMOCIÓN O CAMPAÑA..."
          className="w-full bg-[#1e293b] border border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-xs font-bold text-white outline-none focus:border-orange-500 transition-all uppercase tracking-widest"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Promotions List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredPromos.length === 0 ? (
          <div className="col-span-full py-20 text-center space-y-4 opacity-30">
            <Tag size={64} className="mx-auto text-slate-500" />
            <p className="text-sm font-black uppercase tracking-widest">No hay promociones activas</p>
          </div>
        ) : filteredPromos.map(promo => (
          <div key={promo.id} className="bg-[#1e293b] rounded-[2.5rem] border border-slate-700 overflow-hidden group hover:border-orange-500/50 transition-all">
            <div className="p-8 flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-orange-500/10 text-orange-500 rounded-3xl flex items-center justify-center">
                  <Gift size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter text-white">{promo.name}</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{promo.description}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    setSelectedPromo(promo);
                    setShowReportModal(true);
                  }}
                  className="p-3 text-slate-500 hover:text-emerald-500 transition-colors"
                  title="Generar Reporte PDF"
                >
                  <FileText size={20} />
                </button>
                <button 
                  onClick={() => {
                    setNewPromo(promo);
                    setShowPromoModal(true);
                  }}
                  className="p-3 text-slate-500 hover:text-orange-500 transition-colors"
                >
                  <Edit2 size={20} />
                </button>
                <button 
                  onClick={() => handleDeletePromo(promo.id)}
                  className="p-3 text-slate-500 hover:text-rose-500 transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>

            <div className="px-8 pb-8 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-800/50 p-4 rounded-2xl text-center">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">REQUERIDO</p>
                  <p className="text-xl font-black text-white">{promo.requiredQuantity}</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-2xl text-center">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">PREMIO</p>
                  <p className="text-xl font-black text-orange-500">{promo.rewardQuantity}</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-2xl text-center">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">ACCESO</p>
                  <p className="text-[10px] font-black text-white uppercase">{promo.enrollmentType === 'all' ? 'TODOS' : 'MANUAL'}</p>
                </div>
              </div>

              {/* Customer Progress in this Promo */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">CLIENTES EN CAMPAÑA</h4>
                  <button 
                    onClick={() => {
                      setSelectedPromo(promo);
                      setShowRedeemModal(true);
                    }}
                    className="text-[10px] font-black text-orange-500 uppercase tracking-widest hover:underline"
                  >
                    INSCRIBIR / REGISTRAR
                  </button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {customerPromotions.filter(cp => cp.promotionId === promo.id).length === 0 ? (
                    <p className="text-[10px] font-bold text-slate-600 uppercase text-center py-4 italic">Sin actividad reciente</p>
                  ) : customerPromotions.filter(cp => cp.promotionId === promo.id).sort((a, b) => b.currentCount - a.currentCount).map(cp => {
                    const customer = customers.find(c => c.id === cp.customerId);
                    const progress = (cp.currentCount / promo.requiredQuantity) * 100;
                    const isReady = cp.currentCount >= promo.requiredQuantity;

                    return (
                      <div key={cp.id} className="bg-slate-800/30 p-4 rounded-2xl border border-slate-700/50 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black ${isReady ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                              {customer?.name.slice(0, 1) || '?'}
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-white uppercase">{customer?.name || 'Cliente Desconocido'}</p>
                              <p className="text-[8px] font-bold text-slate-500 uppercase">{Number((cp.currentCount || 0).toFixed(2))} / {promo.requiredQuantity}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {isReady ? (
                              <div className="flex gap-1">
                                <button 
                                  disabled={isSaving}
                                  onClick={() => handleRedeem(cp.id)}
                                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-1 disabled:opacity-50"
                                >
                                  <Gift size={12} /> CANJEAR
                                </button>
                                <button 
                                  disabled={isSaving}
                                  onClick={() => handleDeleteCustomerFromPromo(cp.id)}
                                  className="bg-slate-700/50 hover:bg-rose-500/20 hover:text-rose-500 text-slate-400 p-2 rounded-lg transition-all disabled:opacity-50"
                                  title="Eliminar de la promoción"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-1">
                                <button 
                                  disabled={isSaving}
                                  onClick={() => handleManualAdjustment(cp.id)}
                                  className="bg-slate-700/50 hover:bg-slate-700 text-slate-400 p-2 rounded-lg transition-all disabled:opacity-50"
                                  title="Ajuste Manual (No afecta stock)"
                                >
                                  <Settings2 size={14} />
                                </button>
                                <button 
                                  disabled={isSaving}
                                  onClick={() => handleAddPurchase(cp.customerId, promo.id)}
                                  className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded-lg transition-all disabled:opacity-50"
                                  title="Registrar Compra (+1 y descuento stock)"
                                >
                                  <Plus size={14} />
                                </button>
                                <button 
                                  disabled={isSaving}
                                  onClick={() => handleDeleteCustomerFromPromo(cp.id)}
                                  className="bg-slate-700/50 hover:bg-rose-500/20 hover:text-rose-500 text-slate-400 p-2 rounded-lg transition-all disabled:opacity-50"
                                  title="Eliminar de la promoción"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${isReady ? 'bg-emerald-500' : 'bg-orange-500'}`}
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <CelebrationModal 
        isOpen={showCelebration} 
        onClose={() => setShowCelebration(false)}
        customerName={celebrationData.customerName}
        promotionName={celebrationData.promotionName}
      />

      {selectedPromo && (
        <PromotionReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          promotion={selectedPromo}
          customerPromotions={customerPromotions}
          customers={customers}
          company={company}
          settings={settings}
        />
      )}

      {/* New Promo Modal */}
      {showPromoModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1e293b] w-full max-w-md rounded-[2.5rem] border border-slate-700 shadow-2xl animate-in zoom-in-95 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-8 border-b border-slate-700 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-black uppercase tracking-tighter">{newPromo.id ? 'Editar Campaña' : 'Nueva Campaña'}</h3>
              <button onClick={() => {
                setShowPromoModal(false);
                setNewPromo({
                  name: '',
                  description: '',
                  type: 'docena_13',
                  enrollmentType: 'manual',
                  requiredQuantity: 12,
                  rewardQuantity: 1,
                  isActive: true,
                  excludedPromotionIds: []
                });
              }} className="text-slate-500 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre de la Campaña</label>
                <input 
                  type="text" 
                  placeholder="EJ: DOCENA DE 13"
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-orange-500 transition-all"
                  value={newPromo.name}
                  onChange={(e) => setNewPromo({...newPromo, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Descripción</label>
                <textarea 
                  placeholder="DETALLES DE LA PROMOCIÓN..."
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-orange-500 transition-all h-24 resize-none"
                  value={newPromo.description}
                  onChange={(e) => setNewPromo({...newPromo, description: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Tipo de Inscripción</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setNewPromo({...newPromo, enrollmentType: 'manual'})}
                    className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${newPromo.enrollmentType === 'manual' ? 'bg-orange-500 border-orange-400 text-white' : 'bg-[#0f172a] border-slate-700 text-slate-500'}`}
                  >
                    Manual (Solo Invitados)
                  </button>
                  <button 
                    onClick={() => setNewPromo({...newPromo, enrollmentType: 'all'})}
                    className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${newPromo.enrollmentType === 'all' ? 'bg-orange-500 border-orange-400 text-white' : 'bg-[#0f172a] border-slate-700 text-slate-500'}`}
                  >
                    Automática (Todos)
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Requerido (Compras)</label>
                  <input 
                    type="number" 
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-orange-500 transition-all"
                    value={newPromo.requiredQuantity}
                    onChange={(e) => setNewPromo({...newPromo, requiredQuantity: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Premio (Unidades)</label>
                  <input 
                    type="number" 
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-orange-500 transition-all"
                    value={newPromo.rewardQuantity}
                    onChange={(e) => setNewPromo({...newPromo, rewardQuantity: Number(e.target.value)})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Producto (Opcional)</label>
                <select 
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-orange-500 transition-all uppercase"
                  value={newPromo.productId || ''}
                  onChange={(e) => setNewPromo({...newPromo, productId: e.target.value || undefined})}
                >
                  <option value="">TODOS LOS PRODUCTOS</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Excepciones (Exclusiones) */}
              <div className="space-y-3 pt-4 border-t border-slate-700">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Excepciones (Incompatible con:)</label>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                  {promotions.filter(p => p.id !== newPromo.id).length === 0 ? (
                    <p className="text-[10px] font-bold text-slate-600 uppercase italic">No hay otras promociones para excluir</p>
                  ) : promotions.filter(p => p.id !== newPromo.id).map(p => (
                    <label key={p.id} className="flex items-center gap-3 p-3 bg-[#0f172a] rounded-xl border border-slate-700 cursor-pointer hover:border-orange-500/50 transition-all">
                      <input 
                        type="checkbox"
                        className="w-4 h-4 accent-orange-500"
                        checked={newPromo.excludedPromotionIds?.includes(p.id)}
                        onChange={(e) => {
                          const current = newPromo.excludedPromotionIds || [];
                          if (e.target.checked) {
                            setNewPromo({...newPromo, excludedPromotionIds: [...current, p.id]});
                          } else {
                            setNewPromo({...newPromo, excludedPromotionIds: current.filter(id => id !== p.id)});
                          }
                        }}
                      />
                      <span className="text-[10px] font-black text-white uppercase">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button 
                onClick={handleSavePromo}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-orange-500/20 uppercase text-[10px] tracking-[0.2em] shrink-0"
              >
                {newPromo.id ? 'GUARDAR CAMBIOS' : 'CREAR CAMPAÑA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Redeem / Register Purchase Modal */}
      {showRedeemModal && selectedPromo && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1e293b] w-full max-w-md rounded-[2.5rem] border border-slate-700 shadow-2xl animate-in zoom-in-95 overflow-hidden">
            <div className="p-8 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">Registrar Actividad</h3>
              <button onClick={() => setShowRedeemModal(false)} className="text-slate-500 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Seleccionar Cliente</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input 
                    type="text" 
                    placeholder="BUSCAR POR NOMBRE O TELÉFONO..."
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-white outline-none focus:border-orange-500 transition-all uppercase tracking-widest"
                    onChange={(e) => {
                      const term = e.target.value.toLowerCase();
                      const found = customers.find(c => 
                        c.name.toLowerCase().includes(term) || 
                        c.phone.includes(term)
                      );
                      if (found) setSelectedCustomer(found);
                    }}
                  />
                </div>
                {selectedCustomer && (
                  <div className="mt-4 p-4 bg-orange-500/10 border border-orange-500/30 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-white uppercase">{selectedCustomer.name}</p>
                      <p className="text-[10px] font-bold text-slate-500">{selectedCustomer.phone}</p>
                    </div>
                    <CheckCircle2 className="text-orange-500" size={20} />
                  </div>
                )}
              </div>

              <div className="bg-slate-800/50 p-6 rounded-3xl space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-orange-500/10 text-orange-500 rounded-2xl flex items-center justify-center">
                    <Tag size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Campaña Activa</p>
                    <p className="text-sm font-black text-white uppercase">{selectedPromo.name}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-700 flex justify-between items-center">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Estado Actual</p>
                  <p className="text-xs font-black text-white">
                    {customerPromotions.find(cp => cp.customerId === selectedCustomer?.id && cp.promotionId === selectedPromo.id)?.currentCount || 0} / {selectedPromo.requiredQuantity}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  disabled={!selectedCustomer || isSaving}
                  onClick={() => {
                    if (selectedCustomer) {
                      handleEnroll(selectedCustomer.id, selectedPromo.id);
                      setShowRedeemModal(false);
                      setSelectedCustomer(null);
                    }
                  }}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-black py-4 rounded-xl transition-all uppercase text-[8px] tracking-widest border border-slate-700"
                >
                  SOLO INSCRIBIR (0)
                </button>
                <button 
                  disabled={!selectedCustomer || isSaving}
                  onClick={() => {
                    if (selectedCustomer) {
                      handleAddPurchase(selectedCustomer.id, selectedPromo.id);
                      setShowRedeemModal(false);
                      setSelectedCustomer(null);
                    }
                  }}
                  className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-orange-500/20 uppercase text-[8px] tracking-widest"
                >
                  REGISTRAR COMPRA (+1)
                </button>
              </div>

              <button 
                disabled={!selectedCustomer || isSaving}
                onClick={async () => {
                  if (selectedCustomer) {
                    let cp = customerPromotions.find(x => x.customerId === selectedCustomer.id && x.promotionId === selectedPromo.id);
                    if (!cp) {
                      // Si no está inscrito, lo inscribimos primero
                      cp = await handleEnroll(selectedCustomer.id, selectedPromo.id);
                    }
                    
                    if (cp) {
                      handleManualAdjustment(cp.id);
                    }
                    
                    setShowRedeemModal(false);
                    setSelectedCustomer(null);
                  }
                }}
                className="w-full bg-slate-700/50 hover:bg-slate-700 text-slate-300 font-black py-4 rounded-xl transition-all uppercase text-[8px] tracking-widest border border-slate-600 flex items-center justify-center gap-2"
              >
                <Settings2 size={14} /> AJUSTE MANUAL (CORREGIR CONTEO)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Promotions;
