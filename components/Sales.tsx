
import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Tag, UserPlus, ShoppingCart, Trash2, X, CheckCircle2, MessageCircle, UserPlus2, PackageSearch, CreditCard, Loader2, Edit2, AlertTriangle, Filter, Calendar, User as UserIcon, History, Wallet } from 'lucide-react';
import { Sale, Customer, Product, AppSettings, SaleItem, CompanyInfo, Seller, Promotion, CustomerPromotion } from '../types';
import { dbService } from '../db';
import { parseNumber, searchMatch, calculateBS } from '../utils';
import { TicketModal } from './TicketModal';
import { CelebrationModal } from './CelebrationModal';

interface Props {
  sales: Sale[];
  setSales: React.Dispatch<React.SetStateAction<Sale[]>>;
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  sellers: Seller[];
  settings: AppSettings;
  company: CompanyInfo;
}

const CATEGORIES = ['Todos', 'Víveres', 'Charcutería', 'Lácteos', 'Limpieza', 'Bebidas', 'Snacks'];

const Sales: React.FC<Props> = ({ sales, setSales, customers, setCustomers, products, setProducts, sellers, settings, company }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [posProductSearch, setPosProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [ticketData, setTicketData] = useState<Sale | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'catalog' | 'cart'>('catalog');
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [mermaQueue, setMermaQueue] = useState<{ productId: string, diff: number, originalQty: number }[]>([]);
  const [showMermaPrompt, setShowMermaPrompt] = useState<{ productId: string, diff: number, originalQty: number } | null>(null);
  const [mermasAcumuladas, setMermasAcumuladas] = useState<Record<string, number>>({});
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');

  // Estados para celebración
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState({ customerName: '', promotionName: '' });

  // Estados para filtros
  const [filterType, setFilterType] = useState<'last' | 'date' | 'customer'>('last');
  const [filterDate, setFilterDate] = useState('');
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  // Estados para condiciones comerciales
  const [isCredit, setIsCredit] = useState(false);
  const [useCredit, setUseCredit] = useState(false);
  const [isDiscount, setIsDiscount] = useState(false);
  const [discountVal, setDiscountVal] = useState(0);
  const [initialPayment, setInitialPayment] = useState(0);
  const [saleType, setSaleType] = useState<'venta' | 'obsequio' | 'consumo'>('venta');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 16));

  const getLocalISO = (dateStr?: string) => {
    const d = dateStr ? new Date(dateStr) : new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
  };

  // Optimización: Memoizar cálculos para evitar lag al escribir o filtrar
  const { subtotal, finalTotal } = useMemo(() => {
    const sub = cart.reduce((sum, item) => sum + ((item.quantity || 0) * (item.priceUSD || 0)), 0);
    return { subtotal: sub, finalTotal: sub - (isDiscount ? discountVal : 0) };
  }, [cart, isDiscount, discountVal]);

  // Manejar retroceso de modales con la flecha atrás de Android
  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (ticketData) {
        e.preventDefault();
        setTicketData(null);
        return;
      }
      if (showCelebration) {
        e.preventDefault();
        setShowCelebration(false);
        return;
      }
      if (isNewCustomerModalOpen) {
        e.preventDefault();
        setIsNewCustomerModalOpen(false);
        return;
      }
      if (showMermaPrompt) {
        e.preventDefault();
        setShowMermaPrompt(null);
        return;
      }
      if (isFilterMenuOpen) {
        e.preventDefault();
        setIsFilterMenuOpen(false);
        return;
      }
      if (isModalOpen) {
        e.preventDefault();
        setIsModalOpen(false);
        setEditingSale(null);
        return;
      }
    };
    window.addEventListener('app:backbutton', handleBackButton);
    return () => window.removeEventListener('app:backbutton', handleBackButton);
  }, [ticketData, showCelebration, isNewCustomerModalOpen, showMermaPrompt, isFilterMenuOpen, isModalOpen]);

  const addToCart = (product: Product) => {
    if ((product.stock || 0) <= 0) return alert('Sin existencias');
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= (product.stock || 0)) return prev;
        return prev.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { productId: product.id, name: product.name, quantity: 1, priceUSD: product.priceUSD || 0 }];
    });
    setPosProductSearch('');
  };

  const removeFromCart = (productId: string) => setCart(prev => prev.filter(item => item.productId !== productId));
  
  const updateQuantity = (productId: string, newQty: number) => {
    const product = products.find(p => p.id === productId);
    if (!product || newQty < 0) return;
    
    if (!editingSale && newQty > (product.stock || 0)) return;
    setCart(prev => prev.map(item => item.productId === productId ? { ...item, quantity: newQty } : item));
  };

  const updatePrice = (productId: string, newPrice: number) => {
    if (newPrice < 0) return;
    setCart(prev => prev.map(item => item.productId === productId ? { ...item, priceUSD: newPrice } : item));
  };

  const finishSale = async () => {
    if (!selectedCustomerId) return alert('Seleccione un cliente');
    if (cart.length === 0) return alert('Carrito vacío');

    // Si es edición, verificar si hay reducciones de cantidad para el prompt de merma
    if (editingSale) {
      const reductions: { productId: string, diff: number, originalQty: number }[] = [];
      for (const originalItem of editingSale.items) {
        const currentItem = cart.find(i => i.productId === originalItem.productId);
        // Si el item fue eliminado del carrito o su cantidad es menor
        const currentQty = currentItem ? currentItem.quantity : 0;
        if (currentQty < originalItem.quantity) {
          reductions.push({
            productId: originalItem.productId,
            diff: originalItem.quantity - currentQty,
            originalQty: originalItem.quantity
          });
        }
      }

      if (reductions.length > 0) {
        setMermaQueue(reductions);
        setShowMermaPrompt(reductions[0]);
        return;
      }
    }

    await executeSaleSave();
  };

  const executeSaleSave = async (mermas: Record<string, number> = {}) => {
    setIsSaving(true);
    try {
      const customer = customers.find(c => c.id === selectedCustomerId);
      
      // Deduct from credit balance if used
      if (useCredit && customer && (customer.creditBalanceUSD || 0) > 0) {
        const creditUsed = Math.min(customer.creditBalanceUSD || 0, finalTotal);
        const updatedCustomer = {
          ...customer,
          creditBalanceUSD: (customer.creditBalanceUSD || 0) - creditUsed
        };
        await dbService.put('customers', updatedCustomer);
        setCustomers(prev => prev.map(c => c.id === customer.id ? updatedCustomer : c));
      }

      // If overpaid, add to credit balance
      if (!isCredit && initialPayment > finalTotal) {
        const surplus = initialPayment - finalTotal;
        if (customer) {
          const updatedCustomer = {
            ...customer,
            creditBalanceUSD: (customer.creditBalanceUSD || 0) + surplus
          };
          await dbService.put('customers', updatedCustomer);
          setCustomers(prev => prev.map(c => c.id === customer.id ? updatedCustomer : c));
        }
      }

      const newSale: Sale = {
        id: editingSale?.id || crypto.randomUUID(),
        date: new Date(saleDate).toISOString(),
        customerId: selectedCustomerId,
        customerName: customer?.name || 'Venta Rápida',
        items: cart,
        totalUSD: finalTotal,
        totalBS: calculateBS(finalTotal, isCredit ? 'pending' : 'paid', editingSale?.exchangeRate || settings.exchangeRate, settings.exchangeRate),
        exchangeRate: (editingSale && editingSale.status === 'paid') ? editingSale.exchangeRate : (settings.exchangeRate || 0),
        status: isCredit ? 'pending' : 'paid',
        type: saleType,
        discountUSD: isDiscount ? discountVal : 0,
        initialPaymentUSD: isCredit ? initialPayment : finalTotal,
        paidAmountUSD: isCredit ? initialPayment : (useCredit ? Math.min(finalTotal, (customer?.creditBalanceUSD || 0) + initialPayment) : finalTotal),
      };

      // Obtener productos frescos de la DB para evitar problemas de estado asíncrono
      const freshProducts = await dbService.getAll<Product>('products');
      let currentProducts = [...freshProducts];
      const productsToUpdateMap = new Map<string, Product>();
      const movementsToSave: any[] = [];
      
      // Si es una edición, primero restauramos el stock original en nuestra copia local
      if (editingSale) {
        for (const item of editingSale.items) {
          const pIndex = currentProducts.findIndex(prod => prod.id === item.productId);
          if (pIndex !== -1) {
            // Si parte de este item fue marcado como merma, NO lo devolvemos al stock
            const mermaQty = mermas[item.productId] || 0;
            const qtyToRestore = (item.quantity || 0) - mermaQty;

            currentProducts[pIndex] = {
              ...currentProducts[pIndex],
              stock: (currentProducts[pIndex].stock || 0) + qtyToRestore,
              mermaTotal: (currentProducts[pIndex].mermaTotal || 0) + mermaQty
            };
            productsToUpdateMap.set(currentProducts[pIndex].id, currentProducts[pIndex]);

            // Registrar restauración (solo si hubo algo que restaurar)
            if (qtyToRestore > 0) {
              movementsToSave.push({
                id: crypto.randomUUID(),
                date: newSale.date,
                productId: item.productId,
                productName: item.name,
                type: 'restoration',
                quantity: qtyToRestore,
                stockAfter: currentProducts[pIndex].stock,
                relatedId: editingSale.id
              });
            }
          }
        }
      }

      // Ahora restamos el nuevo stock usando la lista ya restaurada
      for (const item of cart) {
        const pIndex = currentProducts.findIndex(prod => prod.id === item.productId);
        if (pIndex !== -1) {
          currentProducts[pIndex] = {
            ...currentProducts[pIndex],
            stock: (currentProducts[pIndex].stock || 0) - (item.quantity || 0)
          };
          productsToUpdateMap.set(currentProducts[pIndex].id, currentProducts[pIndex]);

          // Registrar venta
          movementsToSave.push({
            id: crypto.randomUUID(),
            date: newSale.date,
            productId: item.productId,
            productName: item.name,
            type: 'sale',
            quantity: -(item.quantity || 0),
            stockAfter: currentProducts[pIndex].stock,
            relatedId: newSale.id
          });
        }
      }

      // Guardado por lotes ultrarrápido (1 sola transacción para productos y movimientos)
      if (productsToUpdateMap.size > 0) {
        await dbService.putMany('products', Array.from(productsToUpdateMap.values()));
      }
      if (movementsToSave.length > 0) {
        await dbService.putMany('movements', movementsToSave);
      }

      await dbService.put('sales', newSale);

      // LOGICA DE PROMOCIONES
      if (newSale.type === 'venta' && selectedCustomerId) {
        try {
          const allPromos = await dbService.getAll<Promotion>('promotions');
          const activePromos = (allPromos || []).filter(p => p.isActive);
          const customerPromos = await dbService.getAll<CustomerPromotion>('customer_promotions') || [];
          let completedPromotion: { customerName: string, promotionName: string } | null = null;
          
          // 1. Revertir cantidades de la venta anterior si estamos editando
          if (editingSale && editingSale.type === 'venta' && editingSale.customerId === selectedCustomerId) {
            for (const item of editingSale.items) {
              // Buscar todas las promociones que aplicaban a este item
              const applicablePromos = activePromos.filter(p => p.productId === item.productId || !p.productId);
              for (const promo of applicablePromos) {
                const cp = customerPromos.find(x => x.customerId === selectedCustomerId && x.promotionId === promo.id);
                if (cp) {
                  cp.currentCount = Math.max(0, cp.currentCount - (item.quantity || 0));
                  await dbService.put('customer_promotions', cp);
                }
              }
            }
          }

          // 2. Aplicar cantidades de la nueva venta
          for (const item of cart) {
            // Buscar todas las promociones que aplican a este item
            const applicablePromos = activePromos.filter(p => p.productId === item.productId || !p.productId);
            
            for (const promo of applicablePromos) {
              const enrollmentType = promo.enrollmentType || 'manual';
              let cp = customerPromos.find(x => x.customerId === selectedCustomerId && x.promotionId === promo.id);
              
              // Verificar exclusiones (si el cliente ya está en una promoción excluida)
              if (promo.excludedPromotionIds && promo.excludedPromotionIds.length > 0) {
                const hasConflict = customerPromos.some(x => 
                  x.customerId === selectedCustomerId && 
                  x.currentCount > 0 && 
                  promo.excludedPromotionIds?.includes(x.promotionId) &&
                  x.promotionId !== promo.id
                );
                if (hasConflict) continue;
              }

              if (cp) {
                // Si ya existe, actualizamos
                const oldCount = cp.currentCount;
                cp.currentCount += (item.quantity || 0);
                cp.lastUpdate = new Date().toISOString();
                await dbService.put('customer_promotions', cp);

                // Verificar si completó la meta en esta venta
                if (oldCount < promo.requiredQuantity && cp.currentCount >= promo.requiredQuantity) {
                  completedPromotion = {
                    customerName: customer?.name || 'Cliente',
                    promotionName: promo.name
                  };
                }
              } else if (enrollmentType === 'all') {
                // Si no existe pero la promo es para TODOS, creamos el registro
                const newCp: CustomerPromotion = {
                  id: crypto.randomUUID(),
                  customerId: selectedCustomerId,
                  promotionId: promo.id,
                  currentCount: item.quantity || 0,
                  totalRedeemed: 0,
                  lastUpdate: new Date().toISOString()
                };
                await dbService.put('customer_promotions', newCp);
                customerPromos.push(newCp); // Añadir al array local para siguientes items

                // Verificar si completó la meta al crear
                if (newCp.currentCount >= promo.requiredQuantity) {
                  completedPromotion = {
                    customerName: customer?.name || 'Cliente',
                    promotionName: promo.name
                  };
                }
              }
            }
          }

          if (completedPromotion) {
            setCelebrationData(completedPromotion);
            setShowCelebration(true);
          }
        } catch (promoErr) {
          console.error("Error al procesar promociones:", promoErr);
          // No bloqueamos la venta por un error en promociones
        }
      }

      // Registrar o actualizar el pago
      if (newSale.paidAmountUSD && newSale.paidAmountUSD > 0) {
        const existingPayments = await dbService.getAll<any>('payments');
        const salePayment = existingPayments.find(p => p.relatedId === newSale.id);
        
        await dbService.put('payments', {
          id: salePayment?.id || crypto.randomUUID(),
          date: newSale.date,
          relatedId: newSale.id,
          entityId: newSale.customerId,
          amountUSD: newSale.paidAmountUSD,
          exchangeRate: newSale.exchangeRate,
          type: 'cxc'
        });
      }

      if (editingSale) {
        setSales(prev => prev.map(s => s.id === newSale.id ? newSale : s));
      } else {
        setSales(prev => [newSale, ...prev]);
      }
      
      setProducts(currentProducts);
      setTicketData(newSale);
      setIsModalOpen(false);
      setEditingSale(null);
      setCart([]);
      setSelectedCustomerId('');
      setIsCredit(false);
      setIsDiscount(false);
      setDiscountVal(0);
      setInitialPayment(0);
    } catch (err) {
      alert("Error al procesar venta");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const combined = `${p.name} ${p.sku || ''}`.toLowerCase();
      const matchesSearch = searchMatch(combined, searchTerm);
      const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const filteredSales = useMemo(() => {
    let result = [...sales];

    if (filterType === 'date' && filterDate) {
      result = result.filter(s => s.date.startsWith(filterDate));
    } else if (filterType === 'customer' && filterCustomerId) {
      result = result.filter(s => s.customerId === filterCustomerId);
    }

    // "Últimos movimientos" es el orden natural (descendente por fecha)
    // que ya viene de App.tsx, pero nos aseguramos aquí.
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, filterType, filterDate, filterCustomerId]);

  const sortedAndFilteredCustomers = useMemo(() => {
    return [...customers]
      .filter(c => searchMatch(c.name, customerSearchTerm))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, customerSearchTerm]);

  // Auto-seleccionar si solo hay un resultado al filtrar
  React.useEffect(() => {
    if (customerSearchTerm && sortedAndFilteredCustomers.length === 1) {
      setSelectedCustomerId(sortedAndFilteredCustomers[0].id);
    }
  }, [customerSearchTerm, sortedAndFilteredCustomers]);

  const sortedCustomers = useMemo(() => {
    return [...customers].sort((a, b) => a.name.localeCompare(b.name));
  }, [customers]);

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-20">
      {/* Botón Flotante */}
      <button 
        onClick={() => {
          setIsModalOpen(true);
          setCustomerSearchTerm('');
          setSaleDate(getLocalISO());
        }} 
        className="fixed bottom-8 right-6 z-[100] bg-gradient-to-r from-orange-500 to-orange-600 hover:scale-110 text-white p-5 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center group border-2 border-white/10"
      >
        <Plus size={28} />
        <span className="absolute right-full mr-3 bg-[#1e293b] text-white text-[10px] font-black py-2 px-4 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-slate-700 shadow-xl uppercase tracking-widest pointer-events-none">
          Iniciar Facturación
        </span>
      </button>

      <div className="flex justify-between items-center">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Historial de Ventas</h2>
        <div className="relative">
          <button 
            onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all text-[10px] font-black uppercase tracking-widest ${isFilterMenuOpen || filterType !== 'last' ? 'bg-orange-500 border-orange-400 text-white shadow-lg' : 'bg-[#1e293b] border-slate-700 text-slate-400 hover:border-slate-500'}`}
          >
            <Filter size={14} />
            <span>Filtrar</span>
          </button>

          {isFilterMenuOpen && (
            <>
              <div className="fixed inset-0 z-[110]" onClick={() => setIsFilterMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-64 bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl z-[120] p-4 animate-in zoom-in-95 origin-top-right">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Opciones de Filtro</p>
                <div className="space-y-2">
                  <button 
                    onClick={() => { setFilterType('last'); setIsFilterMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'last' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                  >
                    <History size={14} />
                    Últimos Movimientos
                  </button>
                  
                  <div className="space-y-1">
                    <button 
                      onClick={() => setFilterType('date')}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'date' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                      <Calendar size={14} />
                      Por Fecha
                    </button>
                    {filterType === 'date' && (
                      <input 
                        type="date" 
                        value={filterDate} 
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-2 text-[10px] font-black text-white outline-none mt-1"
                      />
                    )}
                  </div>

                  <div className="space-y-1">
                    <button 
                      onClick={() => setFilterType('customer')}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'customer' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                      <UserIcon size={14} />
                      Por Cliente
                    </button>
                    {filterType === 'customer' && (
                      <select 
                        value={filterCustomerId} 
                        onChange={(e) => setFilterCustomerId(e.target.value)}
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-2 text-[10px] font-black text-white outline-none mt-1"
                      >
                        <option value="">Seleccionar Cliente...</option>
                        {sortedCustomers.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filteredSales.length === 0 ? (
          <div className="py-20 text-center opacity-30">
            <History size={48} className="mx-auto text-slate-500 mb-3" />
            <p className="text-[10px] font-black uppercase tracking-widest">No se encontraron ventas</p>
          </div>
        ) : filteredSales.map(sale => (
          <div key={sale.id} className="bg-[#1e293b] p-4 rounded-2xl border border-slate-700 shadow-lg flex justify-between items-center gap-4 hover:border-orange-500/30 transition-all">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${sale.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                <Tag size={20} />
              </div>
              <div>
                <p className="font-black text-xs text-white leading-tight uppercase">{sale.customerName}</p>
                <p className="text-[8px] text-slate-500 font-bold uppercase">{new Date(sale.date).toLocaleDateString()} • {sale.status === 'paid' ? 'Contado' : 'Crédito'}</p>
              </div>
            </div>
            <div className="text-right flex-1">
              <p className="text-sm font-black text-white">${(sale.totalUSD || 0).toFixed(2)}</p>
              <p className="text-[8px] font-bold text-orange-500">{calculateBS(sale.totalUSD || 0, sale.status, sale.exchangeRate, settings.exchangeRate).toLocaleString()} Bs</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => {
                setEditingSale(JSON.parse(JSON.stringify(sale)));
                setCart([...sale.items]);
                setSelectedCustomerId(sale.customerId);
                setIsCredit(sale.status === 'pending');
                setIsDiscount((sale.discountUSD || 0) > 0);
                setDiscountVal(sale.discountUSD || 0);
                setInitialPayment(sale.initialPaymentUSD || 0);
                setSaleType(sale.type || 'venta');
                setCustomerSearchTerm('');
                setSaleDate(getLocalISO(sale.date));
                setIsModalOpen(true);
              }} className="p-2 bg-slate-800 rounded-lg border border-slate-700 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white">
                <Edit2 size={16}/>
              </button>
              <button onClick={() => setTicketData(sale)} className="p-2 bg-slate-800 rounded-lg border border-slate-700 text-orange-500 transition-colors hover:bg-slate-700">
                <MessageCircle size={16}/>
              </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-[#0f172a] z-[200] flex flex-col animate-in fade-in duration-300">
          <div className="p-3 border-b border-slate-700 flex justify-between items-center bg-[#1e293b] sticky top-0 z-[210]">
             <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500 rounded-xl text-white shadow-lg"><ShoppingCart size={20} /></div>
                <h2 className="text-sm font-black uppercase tracking-widest text-white">Punto de Venta</h2>
             </div>
             <button onClick={() => {
               setIsModalOpen(false);
               setEditingSale(null);
               setCart([]);
               setSelectedCustomerId('');
               setIsCredit(false);
               setIsDiscount(false);
               setDiscountVal(0);
               setInitialPayment(0);
             }} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"><X size={24}/></button>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
            {/* Tabs para Móvil */}
            <div className="md:hidden flex bg-[#1e293b] border-b border-slate-700 p-1">
               <button 
                onClick={() => setActiveTab('catalog')} 
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'catalog' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-500'}`}
               >
                 Productos
               </button>
               <button 
                onClick={() => setActiveTab('cart')} 
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all relative ${activeTab === 'cart' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-500'}`}
               >
                 Carrito
                 {cart.length > 0 && (
                   <span className="absolute top-2 right-4 bg-white text-orange-500 text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                     {cart.length}
                   </span>
                 )}
               </button>
            </div>

            {/* Catálogo */}
            <div className={`flex-1 p-4 overflow-y-auto space-y-4 bg-[#0f172a] ${activeTab === 'catalog' ? 'flex flex-col' : 'hidden md:flex md:flex-col'}`}>
               <div className="flex flex-col md:flex-row gap-3">
                 <select className="bg-[#1e293b] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
                 <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input type="text" placeholder="Buscar producto..." className="w-full bg-[#1e293b] border border-slate-700 rounded-xl p-3 pl-10 text-xs font-bold text-white outline-none focus:border-orange-500 transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                 </div>
               </div>

               <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredProducts.length === 0 ? (
                    <div className="col-span-full py-20 text-center space-y-3 opacity-30">
                       <PackageSearch size={48} className="mx-auto text-slate-500" />
                       <p className="text-xs font-black uppercase tracking-widest">No hay productos</p>
                    </div>
                  ) : filteredProducts.map(p => (
                    <button key={p.id} onClick={() => addToCart(p)} disabled={(p.stock || 0) <= 0} className={`p-4 bg-[#1e293b] border border-slate-700 rounded-2xl text-left hover:border-orange-500 transition-all ${(p.stock || 0) <= 0 ? 'opacity-40 grayscale' : 'hover:scale-[1.02]'}`}>
                       <p className="font-black text-[10px] text-white line-clamp-2 h-7 mb-1 leading-tight uppercase">{p.name}</p>
                       <div className="flex flex-col items-start">
                          <p className="text-xs font-black text-emerald-400">${(p.priceUSD || 0).toFixed(2)}</p>
                          <p className="text-[8px] font-bold text-slate-400">{((p.priceUSD || 0) * settings.exchangeRate).toFixed(2)} Bs</p>
                          <p className="text-[7px] font-black uppercase text-slate-500 mt-1">Stock: {(p.stock || 0) % 1 === 0 ? (p.stock || 0) : (p.stock || 0).toFixed(1)}</p>
                       </div>
                    </button>
                  ))}
               </div>
            </div>

            {/* Carrito y Cobro */}
            <div className={`w-full md:w-96 bg-[#1e293b] border-l border-slate-700 p-6 shadow-2xl overflow-y-auto ${activeTab === 'cart' ? 'flex flex-col' : 'hidden md:flex md:flex-col'}`}>
               <div className="space-y-4 mb-6 shrink-0">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-500 uppercase ml-1 tracking-widest">Tipo de Operación</label>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                       {(['venta', 'obsequio', 'consumo'] as const).map(t => (
                         <button 
                           key={t}
                           onClick={() => setSaleType(t)}
                           className={`py-2 text-[8px] font-black uppercase tracking-widest rounded-xl border transition-all ${saleType === t ? 'bg-orange-500 border-orange-400 text-white shadow-lg' : 'bg-[#0f172a] border-slate-700 text-slate-500 hover:border-slate-500'}`}
                         >
                           {t}
                         </button>
                       ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-500 uppercase ml-1 tracking-widest">Fecha y Hora de Venta</label>
                    <div className="relative mb-2">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                      <input 
                        type="datetime-local" 
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-2 pl-9 text-[10px] font-bold text-white outline-none focus:border-orange-500 transition-all" 
                        value={saleDate} 
                        onChange={(e) => setSaleDate(e.target.value)} 
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-500 uppercase ml-1 tracking-widest">Cliente</label>
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                      <input 
                        type="text" 
                        placeholder="Filtrar cliente..." 
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-2 pl-9 text-[10px] font-bold text-white outline-none focus:border-orange-500 transition-all" 
                        value={customerSearchTerm} 
                        onChange={(e) => setCustomerSearchTerm(e.target.value)} 
                      />
                    </div>
                    <div className="flex gap-2">
                       <select className="flex-1 bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none" value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
                          <option value="">ELIJA CLIENTE...</option>
                          {sortedAndFilteredCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                       </select>
                       <button onClick={() => setIsNewCustomerModalOpen(true)} className="p-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors"><UserPlus2 size={18} /></button>
                    </div>
                  </div>
                  
                  <div className="relative">
                     <PackageSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                     <input 
                      type="text" 
                      placeholder="Nombre o SKU..." 
                      className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 pl-10 text-xs font-bold text-white outline-none focus:border-orange-500" 
                      value={posProductSearch} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setPosProductSearch(val);
                        if (val.length >= 2) {
                           // Buscar coincidencia exacta por SKU o nombre completo
                           const p = products.find(x => 
                             (x.sku && x.sku.toLowerCase() === val.toLowerCase()) || 
                             (x.name && x.name.toLowerCase() === val.toLowerCase())
                           );
                           if (p) {
                             addToCart(p);
                             setPosProductSearch(''); // Limpiar después de agregar
                           }
                        }
                      }}
                      list="pos-datalist"
                     />
                     <datalist id="pos-datalist">
                        {products.filter(p => searchMatch(`${p.name} ${p.sku || ''}`, posProductSearch)).slice(0, 10).map(p => (
                           <option key={p.id} value={p.name}>{p.sku}</option>
                        ))}
                     </datalist>
                  </div>
                  {posProductSearch.length >= 2 && products.filter(p => searchMatch(`${p.name} ${p.sku || ''}`, posProductSearch)).length === 0 && (
                    <p className="text-[10px] font-bold text-rose-400 mt-2 uppercase animate-pulse">Producto no encontrado</p>
                  )}
               </div>

               {/* Items del Carrito */}
               <div className="flex-1 overflow-y-auto space-y-2 mb-6 pr-1 min-h-[150px]">
                  {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50 space-y-2"><ShoppingCart size={40} /><p className="text-[10px] font-black uppercase">Carrito Vacío</p></div>
                  ) : cart.map(item => (
                    <div key={item.productId} className="bg-[#0f172a] p-3 rounded-xl border border-slate-700/50 group">
                       <div className="flex justify-between items-start mb-1"><p className="text-[9px] font-black text-white leading-tight uppercase truncate flex-1">{item.name}</p><button onClick={() => removeFromCart(item.productId)} className="text-rose-500 hover:bg-rose-500/10 p-1 rounded transition-colors ml-2"><Trash2 size={12} /></button></div>
                       <div className="flex justify-between items-center">
                          <div className="flex flex-col">
                             <div className="flex items-center gap-2">
                                <span className="text-[8px] text-slate-500 font-bold uppercase">Cant:</span>
                                <input 
                                  type="number" step="any" lang="en-US" 
                                  value={item.quantity} 
                                  onChange={(e) => updateQuantity(item.productId, parseNumber(e.target.value) || 0)} 
                                  className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] font-black text-orange-500 outline-none"
                                />
                             </div>
                             <div className="flex items-center gap-2 mt-1">
                                <span className="text-[8px] text-slate-500 font-bold uppercase">Precio $:</span>
                                <input 
                                  type="number" step="0.01" lang="en-US" 
                                  value={item.priceUSD} 
                                  onChange={(e) => updatePrice(item.productId, parseNumber(e.target.value) || 0)} 
                                  className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] font-black text-emerald-500 outline-none"
                                />
                             </div>
                             <span className="text-[8px] font-bold text-slate-500 mt-1">{calculateBS(item.priceUSD || 0, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</span>
                          </div>
                          <div className="text-right">
                             <p className="font-black text-[11px] text-white">${((item.quantity || 0) * (item.priceUSD || 0)).toFixed(2)}</p>
                             <p className="font-bold text-[8px] text-orange-500">{calculateBS((item.quantity || 0) * (item.priceUSD || 0), 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</p>
                          </div>
                       </div>
                    </div>
                  ))}
               </div>

               {/* Condiciones Comerciales - Iguales a Compras */}
               <div className="space-y-4 border-t border-slate-700 pt-4 mb-6">
                  <div className="grid grid-cols-1 gap-3">
                     {/* Descuento primero */}
                     <div className="bg-[#0f172a] p-3 rounded-2xl border border-slate-700/50">
                        <div className="flex items-center justify-between mb-2">
                           <div className="flex items-center gap-2">
                              <Tag size={16} className={isDiscount ? "text-emerald-500" : "text-slate-500"} />
                              <span className="text-[10px] font-black text-white uppercase tracking-widest">Descuento</span>
                           </div>
                           <button onClick={() => setIsDiscount(!isDiscount)} className={`w-10 h-5 rounded-full relative transition-all ${isDiscount ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isDiscount ? 'left-6' : 'left-1'}`} />
                           </button>
                        </div>
                        {isDiscount && (
                           <div className="animate-in zoom-in-95">
                              <input type="number" step="0.01" lang="en-US" value={discountVal} onChange={(e) => setDiscountVal(parseNumber(e.target.value) || 0)} className="w-full bg-[#1e293b] border border-slate-700 rounded-xl p-2 text-xs font-black text-emerald-500 outline-none" placeholder="Monto $" />
                              <p className="text-[9px] font-bold text-emerald-500 mt-1">{calculateBS(discountVal, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</p>
                           </div>
                        )}
                     </div>
                     
                     {/* Crédito segundo */}
                     <div className="bg-[#0f172a] p-3 rounded-2xl border border-slate-700/50">
                        <div className="flex items-center justify-between mb-2">
                           <div className="flex items-center gap-2">
                              <CreditCard size={16} className={isCredit ? "text-rose-500" : "text-slate-500"} />
                              <span className="text-[10px] font-black text-white uppercase tracking-widest">Venta Crédito</span>
                           </div>
                           <button onClick={() => setIsCredit(!isCredit)} className={`w-10 h-5 rounded-full relative transition-all ${isCredit ? 'bg-rose-500' : 'bg-slate-700'}`}>
                              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isCredit ? 'left-6' : 'left-1'}`} />
                           </button>
                        </div>
                        {isCredit && (
                           <div className="animate-in zoom-in-95">
                              <input type="number" step="0.01" lang="en-US" value={initialPayment} onChange={(e) => setInitialPayment(parseNumber(e.target.value) || 0)} className="w-full bg-[#1e293b] border border-slate-700 rounded-xl p-2 text-xs font-black text-white outline-none" placeholder="Abono $" />
                              <p className="text-[9px] font-bold text-orange-500 mt-1">{calculateBS(initialPayment, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</p>
                           </div>
                        )}
                     </div>

                     {/* Saldo a Favor */}
                     {selectedCustomerId && (customers.find(c => c.id === selectedCustomerId)?.creditBalanceUSD || 0) > 0 && (
                       <div className="bg-[#0f172a] p-3 rounded-2xl border border-slate-700/50">
                          <div className="flex items-center justify-between mb-2">
                             <div className="flex items-center gap-2">
                                <Wallet size={16} className={useCredit ? "text-emerald-500" : "text-slate-500"} />
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-black text-white uppercase tracking-widest">Usar Saldo a Favor</span>
                                  <span className="text-[8px] font-black text-emerald-500 uppercase">Disponible: ${customers.find(c => c.id === selectedCustomerId)?.creditBalanceUSD?.toFixed(2)}</span>
                                </div>
                             </div>
                             <button onClick={() => setUseCredit(!useCredit)} className={`w-10 h-5 rounded-full relative transition-all ${useCredit ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${useCredit ? 'left-6' : 'left-1'}`} />
                             </button>
                          </div>
                       </div>
                     )}
                  </div>
               </div>

               {/* Footer POS Reducido */}
               <div className="pt-4 border-t border-slate-700 flex items-center justify-between h-20 shrink-0">
                  <div className="flex flex-col">
                     <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Total Factura</span>
                     <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-white tracking-tighter leading-none">${(finalTotal || 0).toFixed(2)}</span>
                        <span className="text-[10px] font-black text-orange-500 uppercase">{calculateBS(finalTotal, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</span>
                     </div>
                  </div>
                  <button onClick={finishSale} disabled={cart.length === 0 || !selectedCustomerId || isSaving} className="bg-orange-500 hover:bg-orange-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl shadow-orange-500/20 active:scale-95 transition-all disabled:opacity-50">
                     {isSaving ? <Loader2 size={24} className="animate-spin" /> : <CheckCircle2 size={30} />}
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVO CLIENTE */}
      {isNewCustomerModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[300] flex items-center justify-center p-4">
          <div className="bg-[#1e293b] w-full max-w-sm rounded-[2.5rem] p-8 border border-slate-700 shadow-2xl animate-in zoom-in-95">
            <h2 className="text-lg font-black text-orange-500 mb-6 uppercase tracking-tighter">Nuevo Cliente</h2>
            <form onSubmit={async (e) => {
               e.preventDefault();
               const formData = new FormData(e.currentTarget);
               const newCustomer: Customer = { id: crypto.randomUUID(), name: formData.get('name') as string, rif: formData.get('rif') as string, phone: formData.get('phone') as string, email: formData.get('email') as string };
               await dbService.put('customers', newCustomer);
               setCustomers(prev => [...prev, newCustomer]);
               setSelectedCustomerId(newCustomer.id);
               setIsNewCustomerModalOpen(false);
            }} className="space-y-4">
               <input name="name" placeholder="Nombre / Razón Social" className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-4 text-xs font-bold text-white outline-none focus:border-orange-500" required />
               <div className="grid grid-cols-2 gap-3">
                  <input name="rif" placeholder="RIF / C.I." className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-4 text-xs font-bold text-white outline-none focus:border-orange-500" />
                  <input name="phone" placeholder="Teléfono" className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-4 text-xs font-bold text-white outline-none focus:border-orange-500" required />
               </div>
               <input name="email" type="email" placeholder="Email" className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-4 text-xs font-bold text-white outline-none focus:border-orange-500" />
               <div className="flex gap-3 pt-4">
                 <button type="button" onClick={() => setIsNewCustomerModalOpen(false)} className="flex-1 text-slate-500 font-black uppercase text-[10px]">Cancelar</button>
                 <button type="submit" className="flex-[2] bg-orange-500 text-white p-4 rounded-xl font-black uppercase text-[10px] shadow-lg shadow-orange-500/20 active:scale-95 transition-transform">Guardar</button>
               </div>
            </form>
          </div>
        </div>
      )}
      <TicketModal isOpen={!!ticketData} onClose={() => setTicketData(null)} data={ticketData} company={company} settings={settings} />
      
      <CelebrationModal 
        isOpen={showCelebration} 
        onClose={() => setShowCelebration(false)}
        customerName={celebrationData.customerName}
        promotionName={celebrationData.promotionName}
      />

      {/* PROMPT DE MERMA */}
      {showMermaPrompt && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[400] flex items-center justify-center p-4">
          <div className="bg-[#1e293b] w-full max-w-sm rounded-[2.5rem] p-8 border border-slate-700 shadow-2xl animate-in zoom-in-95">
            <div className="w-16 h-16 bg-orange-500/10 text-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-lg font-black text-white mb-2 uppercase tracking-tighter text-center">Ajuste de Cantidad</h2>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-tight text-center mb-8">
              HAS REDUCIDO LA CANTIDAD EN <span className="text-white">{showMermaPrompt.diff.toFixed(2)}</span> UNIDADES. ¿QUÉ DESEAS HACER CON ESTA DIFERENCIA?
            </p>
            <div className="space-y-3">
              <button 
                onClick={async () => {
                  // Retornar a Inventario
                  const nextQueue = mermaQueue.slice(1);
                  setMermaQueue(nextQueue);
                  if (nextQueue.length > 0) {
                    setShowMermaPrompt(nextQueue[0]);
                  } else {
                    setShowMermaPrompt(null);
                    await executeSaleSave(mermasAcumuladas);
                    setMermasAcumuladas({});
                  }
                }}
                className="w-full bg-emerald-500 text-white font-black py-4 rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
              >
                RETORNAR A INVENTARIO
              </button>
              <button 
                onClick={async () => {
                  // Registrar como Merma
                  const product = products.find(p => p.id === showMermaPrompt.productId);
                  if (product) {
                    const updatedProduct = {
                      ...product,
                      mermaTotal: (product.mermaTotal || 0) + showMermaPrompt.diff
                    };
                    await dbService.put('products', updatedProduct);
                    
                    // Registrar movimiento de merma
                    const cust = customers.find(c => c.id === selectedCustomerId) || 
                      (editingSale?.customerId ? customers.find(c => c.id === editingSale.customerId) : undefined);
                    const custId = cust?.id || selectedCustomerId || editingSale?.customerId || undefined;
                    const custName = cust?.name || editingSale?.customerName || 'Cliente';

                    await dbService.put('movements', {
                      id: crypto.randomUUID(),
                      date: new Date(saleDate).toISOString(),
                      productId: product.id,
                      productName: product.name,
                      type: 'merma',
                      quantity: -showMermaPrompt.diff,
                      stockAfter: (product.stock || 0) - showMermaPrompt.diff,
                      relatedId: editingSale?.id,
                      customerId: custId,
                      customerName: custName,
                      reason: 'Reducción en Factura de Venta'
                    });

                    // Acumular para que executeSaleSave sepa que no debe restaurar esto al stock
                    setMermasAcumuladas(prev => ({
                      ...prev,
                      [product.id]: (prev[product.id] || 0) + showMermaPrompt.diff
                    }));
                  }
                  
                  const nextQueue = mermaQueue.slice(1);
                  setMermaQueue(nextQueue);
                  if (nextQueue.length > 0) {
                    setShowMermaPrompt(nextQueue[0]);
                  } else {
                    const finalMermas = { ...mermasAcumuladas, [showMermaPrompt.productId]: (mermasAcumuladas[showMermaPrompt.productId] || 0) + showMermaPrompt.diff };
                    setShowMermaPrompt(null);
                    await executeSaleSave(finalMermas);
                    setMermasAcumuladas({});
                  }
                }}
                className="w-full bg-rose-500 text-white font-black py-4 rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
              >
                REGISTRAR COMO MERMA
              </button>
              <button 
                onClick={() => {
                  setShowMermaPrompt(null);
                  setMermaQueue([]);
                  setMermasAcumuladas({});
                }}
                className="w-full py-3 text-slate-500 font-black uppercase text-[9px] tracking-widest"
              >
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sales;
