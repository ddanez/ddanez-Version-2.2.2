
import React, { useState, useMemo, useEffect } from 'react';
import { Plus, ShoppingCart, Truck, Search, Trash2, ArrowLeft, CheckCircle2, PlusCircle, Edit3, Loader2, UserPlus, Box, X, CreditCard, Tag, Calculator } from 'lucide-react';
import { Purchase, Supplier, Product, AppSettings, PurchaseItem } from '../types';
import { dbService } from '../db';
import { parseNumber, searchMatch, calculateBS } from '../utils';

interface ExtendedPurchaseItem extends PurchaseItem {
  newSalePriceUSD: number;
}

interface Props {
  purchases: Purchase[];
  setPurchases: React.Dispatch<React.SetStateAction<Purchase[]>>;
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  settings: AppSettings;
}

const CATEGORIES = ['Víveres', 'Charcutería', 'Lácteos', 'Limpieza', 'Bebidas', 'Snacks', 'Otros'];

const Purchases: React.FC<Props> = ({ purchases, setPurchases, suppliers, setSuppliers, products, setProducts, settings }) => {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [cart, setCart] = useState<ExtendedPurchaseItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const [isCredit, setIsCredit] = useState(false);
  const [isDiscount, setIsDiscount] = useState(false);
  const [discountVal, setDiscountVal] = useState(0);
  const [initialPayment, setInitialPayment] = useState(0);

  // Optimización: Memoizar cálculos para evitar lag al escribir
  const { subtotal, finalTotal } = useMemo(() => {
    const sub = cart.reduce((sum, item) => sum + ((item.quantity || 0) * (item.costUSD || 0)), 0);
    return { subtotal: sub, finalTotal: sub - (isDiscount ? discountVal : 0) };
  }, [cart, isDiscount, discountVal]);

  // Manejar retroceso de modales con la flecha atrás de Android
  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (isSupplierModalOpen) {
        e.preventDefault();
        setIsSupplierModalOpen(false);
        return;
      }
      if (isProductModalOpen) {
        e.preventDefault();
        setIsProductModalOpen(false);
        return;
      }
      if (isRegisterMode) {
        e.preventDefault();
        setIsRegisterMode(false);
        setCart([]);
        return;
      }
    };
    window.addEventListener('app:backbutton', handleBackButton);
    return () => window.removeEventListener('app:backbutton', handleBackButton);
  }, [isSupplierModalOpen, isProductModalOpen, isRegisterMode]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      if (prev.find(item => item.productId === product.id)) return prev;
      return [...prev, { 
        productId: product.id, 
        name: product.name, 
        quantity: 1, 
        costUSD: product.costUSD || 0, 
        newSalePriceUSD: product.priceUSD || 0 
      }];
    });
    setProductSearch('');
  };

  const updateCartItem = (productId: string, field: keyof ExtendedPurchaseItem, value: any) => {
    setCart(prev => prev.map(item => item.productId === productId ? { ...item, [field]: value } : item));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const finishPurchase = async () => {
    if (!selectedSupplierId || cart.length === 0) return alert('Complete los datos');
    setIsSaving(true);
    try {
      const supplier = suppliers.find(s => s.id === selectedSupplierId);
      
      const newPurchase: Purchase = {
        id: editingPurchase?.id || crypto.randomUUID(),
        date: editingPurchase?.date || new Date().toISOString(),
        supplierId: selectedSupplierId,
        supplierName: supplier?.name || 'Proveedor',
        items: cart.map(({ newSalePriceUSD, ...rest }) => rest),
        totalUSD: finalTotal,
        totalBS: calculateBS(finalTotal, isCredit ? 'pending' : 'paid', editingPurchase?.exchangeRate || settings.exchangeRate, settings.exchangeRate),
        exchangeRate: (editingPurchase && editingPurchase.status === 'paid') ? editingPurchase.exchangeRate : (settings.exchangeRate || 0),
        status: isCredit ? 'pending' : 'paid',
        discountUSD: isDiscount ? discountVal : 0,
        initialPaymentUSD: isCredit ? initialPayment : finalTotal,
        paidAmountUSD: isCredit ? initialPayment : finalTotal
      };

      const freshProducts = await dbService.getAll<Product>('products');
      let currentProducts = [...freshProducts];
      const productsToUpdateMap = new Map<string, Product>();
      const movementsToSave: any[] = [];
      
      // Si es una edición, primero restauramos el stock original en nuestra copia local
      if (editingPurchase) {
        for (const item of editingPurchase.items) {
          const pIndex = currentProducts.findIndex(prod => prod.id === item.productId);
          if (pIndex !== -1) {
            currentProducts[pIndex] = {
              ...currentProducts[pIndex],
              stock: (currentProducts[pIndex].stock || 0) - (item.quantity || 0)
            };
            productsToUpdateMap.set(currentProducts[pIndex].id, currentProducts[pIndex]);
            
            // Registrar restauración
            movementsToSave.push({
              id: crypto.randomUUID(),
              date: new Date().toISOString(),
              productId: item.productId,
              productName: item.name,
              type: 'restoration',
              quantity: -(item.quantity || 0),
              stockAfter: currentProducts[pIndex].stock,
              relatedId: editingPurchase.id
            });
          }
        }
      }

      // Ahora sumamos el nuevo stock usando la lista ya restaurada
      for (const item of cart) {
        const pIndex = currentProducts.findIndex(prod => prod.id === item.productId);
        if (pIndex !== -1) {
          currentProducts[pIndex] = {
            ...currentProducts[pIndex],
            stock: (currentProducts[pIndex].stock || 0) + (item.quantity || 0),
            costUSD: item.costUSD || currentProducts[pIndex].costUSD,
            priceUSD: item.newSalePriceUSD || currentProducts[pIndex].priceUSD
          };
          productsToUpdateMap.set(currentProducts[pIndex].id, currentProducts[pIndex]);

          // Registrar compra
          movementsToSave.push({
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            productId: item.productId,
            productName: item.name,
            type: 'purchase',
            quantity: item.quantity || 0,
            stockAfter: currentProducts[pIndex].stock,
            relatedId: newPurchase.id
          });
        }
      }

      // Guardado en lote ultrarrápido
      if (productsToUpdateMap.size > 0) {
        await dbService.putMany('products', Array.from(productsToUpdateMap.values()));
      }
      if (movementsToSave.length > 0) {
        await dbService.putMany('movements', movementsToSave);
      }

      await dbService.put('purchases', newPurchase);

      // Registrar el pago inicial
      if (newPurchase.paidAmountUSD && newPurchase.paidAmountUSD > 0) {
        await dbService.put('payments', {
          id: crypto.randomUUID(),
          date: newPurchase.date,
          relatedId: newPurchase.id,
          entityId: newPurchase.supplierId,
          amountUSD: newPurchase.paidAmountUSD,
          exchangeRate: newPurchase.exchangeRate,
          type: 'cxp'
        });
      }

      setPurchases(prev => {
         const filtered = prev.filter(p => p.id !== newPurchase.id);
         return [newPurchase, ...filtered].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      });
      setProducts(currentProducts);
      setIsRegisterMode(false);
      setEditingPurchase(null);
      setCart([]);
      setSelectedSupplierId('');
      setIsCredit(false);
      setIsDiscount(false);
      setDiscountVal(0);
      setInitialPayment(0);
    } catch (err) {
      alert("Error al procesar compra");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isRegisterMode) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex justify-between items-center">
          <div>
             <h1 className="text-2xl font-black uppercase text-white">Compras</h1>
             <p className="text-slate-400 text-sm font-medium tracking-tight uppercase">Abastecimiento de Stock</p>
          </div>
          <button onClick={() => { 
             setEditingPurchase(null); 
             setIsRegisterMode(true); 
             setIsCredit(false);
             setIsDiscount(false);
             setDiscountVal(0);
             setInitialPayment(0);
             setCart([]);
             setSelectedSupplierId('');
          }} className="bg-orange-500 hover:bg-orange-600 text-white font-black py-4 px-8 rounded-2xl flex items-center gap-2 shadow-lg active:scale-95 transition-all text-xs tracking-widest uppercase">
            <Plus size={20} /> NUEVA COMPRA
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4">
           {purchases.map(p => (
             <div key={p.id} className="bg-[#1e293b] p-5 rounded-[2.5rem] border border-slate-700 flex flex-col md:flex-row justify-between items-center gap-4 hover:border-slate-500 transition-all">
                <div className="flex items-center gap-4 flex-1">
                   <div className={`p-4 rounded-2xl ${p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}><Truck size={24} /></div>
                   <div>
                      <p className="font-black text-sm text-white leading-tight uppercase">{p.supplierName}</p>
                      <p className="text-[9px] text-slate-500 font-black uppercase mt-1">
                        {new Date(p.date).toLocaleDateString()} • {p.status === 'paid' ? 'Pagado' : 'Pendiente'}
                      </p>
                   </div>
                </div>
                <div className="text-right px-8">
                   <p className="text-xl font-black text-white leading-none">${(p.totalUSD || 0).toFixed(2)}</p>
                   <p className="text-[10px] font-bold text-orange-500 mt-1">{calculateBS(p.totalUSD || 0, p.status, p.exchangeRate, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</p>
                </div>
                <button onClick={() => {
                  setEditingPurchase(p);
                  setSelectedSupplierId(p.supplierId);
                  setCart(p.items.map(i => {
                     const prod = products.find(x => x.id === i.productId);
                     return { ...i, newSalePriceUSD: prod?.priceUSD || (i.costUSD * 1.3) };
                  }));
                  setIsDiscount((p.discountUSD || 0) > 0);
                  setDiscountVal(p.discountUSD || 0);
                  setIsCredit(p.status === 'pending');
                  setInitialPayment(p.initialPaymentUSD || 0);
                  setIsRegisterMode(true);
                }} className="p-3 bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"><Edit3 size={18}/></button>
             </div>
           ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0f172a] z-[120] flex flex-col animate-in slide-in-from-right duration-300">
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="p-3 border-b border-slate-700 bg-[#1e293b] flex justify-between items-center sticky top-0 z-[130] shadow-xl">
           <div className="flex items-center gap-4">
              <button onClick={() => setIsRegisterMode(false)} className="p-2 hover:bg-slate-700 rounded-full text-white transition-colors"><ArrowLeft size={24}/></button>
              <h2 className="text-lg font-black uppercase text-white tracking-tighter">Registrar Compra</h2>
           </div>
           <div className="text-right">
              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest leading-none">Cambio Hoy</p>
              <p className="text-[10px] font-black text-orange-500">{settings.exchangeRate} Bs/$</p>
           </div>
        </div>

        <div className="max-w-6xl mx-auto p-4 space-y-4">
           {/* Selector de Proveedor y Producto */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#1e293b] p-5 rounded-[2rem] border border-slate-700 shadow-lg">
              <div className="space-y-1">
                 <label className="text-[9px] font-black text-slate-500 uppercase ml-1 tracking-widest">Proveedor</label>
                 <div className="flex gap-2 items-center">
                    <select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)} className="flex-1 bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none">
                       <option value="">ELIJA PROVEEDOR...</option>
                       {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button onClick={() => setIsSupplierModalOpen(true)} className="p-3 bg-orange-500 text-white rounded-xl"><UserPlus size={18} /></button>
                 </div>
              </div>
              <div className="space-y-1">
                 <label className="text-[9px] font-black text-slate-500 uppercase ml-1 tracking-widest">Producto (Mín. 2 caracteres)</label>
                 <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                       <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                       <input 
                        type="text" 
                        placeholder="Buscar producto..." 
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 pl-10 text-xs font-bold text-white outline-none focus:border-orange-500" 
                        value={productSearch} 
                        onChange={(e) => {
                          const val = e.target.value;
                          setProductSearch(val);
                          if (val.length >= 2) {
                             // Buscar coincidencia exacta por SKU o nombre completo
                             const f = products.find(x => 
                               (x.sku && x.sku.toLowerCase() === val.toLowerCase()) || 
                               (x.name && x.name.toLowerCase() === val.toLowerCase())
                             );
                             if (f) {
                               addToCart(f);
                               setProductSearch(''); // Limpiar después de agregar
                             }
                          }
                       }} list="purch-datalist" />
                       <datalist id="purch-datalist">
                          {products.filter(p => searchMatch(`${p.name} ${p.sku || ''}`, productSearch)).slice(0, 10).map(p => (
                             <option key={p.id} value={p.name}>{p.sku}</option>
                          ))}
                       </datalist>
                    </div>
                    <button onClick={() => setIsProductModalOpen(true)} className="p-3 bg-emerald-500 text-white rounded-xl"><PlusCircle size={18} /></button>
                 </div>
                 {productSearch.length >= 2 && products.filter(p => searchMatch(`${p.name} ${p.sku || ''}`, productSearch)).length === 0 && (
                   <p className="text-[10px] font-bold text-rose-400 mt-2 uppercase animate-pulse">Producto no encontrado</p>
                 )}
              </div>
           </div>

           {/* Carrito Optimizado */}
           <div className="space-y-2">
              {cart.map(item => (
                <div key={item.productId} className="bg-[#1e293b] p-3 rounded-2xl border border-slate-700 shadow-md group">
                   <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-center px-1">
                        <h4 className="font-black text-white text-[11px] uppercase truncate flex-1">{item.name}</h4>
                        <button onClick={() => removeFromCart(item.productId)} className="text-rose-500 hover:bg-rose-500/10 p-1 rounded-lg transition-colors ml-2"><Trash2 size={16}/></button>
                      </div>
                      
                      <div className="grid grid-cols-4 items-end gap-2 px-1">
                        <div className="space-y-1">
                          <label className="text-[7px] font-black text-slate-500 uppercase block text-center">Cant.</label>
                          <input type="number" step="any" lang="en-US" value={item.quantity} onChange={(e) => updateCartItem(item.productId, 'quantity', parseNumber(e.target.value) || 0)} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2 text-center text-[10px] font-black text-orange-500 outline-none"/>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[7px] font-black text-slate-500 uppercase block text-center">Costo $</label>
                          <input type="number" step="0.01" lang="en-US" value={item.costUSD} onChange={(e) => updateCartItem(item.productId, 'costUSD', parseNumber(e.target.value) || 0)} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2 text-center text-[10px] font-black text-white outline-none"/>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[7px] font-black text-slate-500 uppercase block text-center">PVP $</label>
                          <input type="number" step="0.01" lang="en-US" value={item.newSalePriceUSD} onChange={(e) => updateCartItem(item.productId, 'newSalePriceUSD', parseNumber(e.target.value) || 0)} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2 text-center text-[10px] font-black text-emerald-500 outline-none"/>
                        </div>
                        <div className="space-y-1 flex flex-col items-center">
                          <label className="text-[7px] font-black text-slate-500 uppercase block text-center">Subtotal $</label>
                          <div className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-[10px] font-black text-indigo-400">
                             ${((item.quantity || 0) * (item.costUSD || 0)).toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div className="px-1 text-right">
                         <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{calculateBS((item.quantity || 0) * (item.costUSD || 0), 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</p>
                      </div>
                   </div>
                </div>
              ))}
           </div>

           {/* Condiciones Comerciales - Invertidas */}
           {cart.length > 0 && (
             <div className="bg-[#1e293b] p-4 rounded-3xl border border-slate-700 shadow-lg space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {/* Descuento primero */}
                   <div className="bg-[#0f172a] p-4 rounded-2xl border border-slate-700/50">
                      <div className="flex items-center justify-between mb-2">
                         <div className="flex items-center gap-2">
                            <Tag size={16} className={isDiscount ? "text-emerald-500" : "text-slate-500"} />
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Aplicar Descuento</span>
                         </div>
                         <button onClick={() => setIsDiscount(!isDiscount)} className={`w-10 h-5 rounded-full relative transition-all ${isDiscount ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isDiscount ? 'left-6' : 'left-1'}`} />
                         </button>
                      </div>
                      {isDiscount && (
                         <div className="animate-in zoom-in-95 mt-3">
                            <label className="text-[8px] font-black text-slate-500 uppercase block mb-1">Monto Descuento ($)</label>
                            <input type="number" lang="en-US" value={discountVal} onChange={(e) => setDiscountVal(parseNumber(e.target.value) || 0)} className="w-full bg-[#1e293b] border border-slate-700 rounded-xl p-3 text-sm font-black text-emerald-500 outline-none" />
                            <p className="text-[9px] font-bold text-emerald-500 mt-1">{calculateBS(discountVal, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</p>
                         </div>
                      )}
                   </div>
                   
                   {/* Crédito segundo */}
                   <div className="bg-[#0f172a] p-4 rounded-2xl border border-slate-700/50">
                      <div className="flex items-center justify-between mb-2">
                         <div className="flex items-center gap-2">
                            <CreditCard size={16} className={isCredit ? "text-rose-500" : "text-slate-500"} />
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Compra a Crédito</span>
                         </div>
                         <button onClick={() => setIsCredit(!isCredit)} className={`w-10 h-5 rounded-full relative transition-all ${isCredit ? 'bg-rose-500' : 'bg-slate-700'}`}>
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isCredit ? 'left-6' : 'left-1'}`} />
                         </button>
                      </div>
                      {isCredit && (
                         <div className="animate-in zoom-in-95 mt-3">
                            <label className="text-[8px] font-black text-slate-500 uppercase block mb-1">Abono Inicial ($)</label>
                            <input type="number" lang="en-US" value={initialPayment} onChange={(e) => setInitialPayment(parseNumber(e.target.value) || 0)} className="w-full bg-[#1e293b] border border-slate-700 rounded-xl p-3 text-sm font-black text-white outline-none" />
                            <p className="text-[9px] font-bold text-orange-500 mt-1">{calculateBS(initialPayment, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</p>
                         </div>
                      )}
                   </div>
                </div>
             </div>
           )}
        </div>
      </div>

      {/* Footer Compacto y Botón Cuadrado */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#1e293b] border-t border-slate-700 p-2 md:px-12 flex items-center justify-between h-20 z-[140] shadow-2xl">
         <div className="flex gap-3 md:gap-8 items-center flex-1 min-w-0">
            <div className="flex flex-col md:flex-row md:gap-8 items-start md:items-center shrink-0">
               <div className="text-left">
                  <p className="text-[7px] md:text-[8px] font-black text-slate-500 uppercase leading-none">Subtotal</p>
                  <p className="text-xs md:text-sm font-black text-white leading-none mt-1">${(subtotal || 0).toFixed(2)}</p>
               </div>
               {isDiscount && (
                  <div className="text-emerald-500 mt-1 md:mt-0">
                     <p className="text-[7px] md:text-[8px] font-black uppercase leading-none">Desc.</p>
                     <p className="text-xs md:text-sm font-black leading-none mt-1">-${(discountVal || 0).toFixed(2)}</p>
                  </div>
               )}
            </div>
            <div className="border-l border-slate-700 pl-3 md:pl-8 flex-1 min-w-0">
               <p className="text-[7px] md:text-[8px] font-black text-orange-500 uppercase leading-none tracking-widest">Inversión Total</p>
               <div className="flex flex-col md:flex-row md:items-baseline md:gap-3 mt-1 overflow-hidden">
                  <p className="text-lg md:text-2xl font-black text-white tracking-tighter leading-none truncate">${(finalTotal || 0).toFixed(2)}</p>
                  <p className="text-[9px] md:text-[11px] font-black text-orange-500 truncate">{calculateBS(finalTotal, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</p>
               </div>
            </div>
         </div>
         <button onClick={finishPurchase} disabled={cart.length === 0 || !selectedSupplierId || isSaving} className="bg-orange-500 hover:bg-orange-600 text-white w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center shadow-xl shadow-orange-500/20 active:scale-95 transition-all shrink-0 ml-2 md:ml-4">
            {isSaving ? <Loader2 size={24} className="animate-spin" /> : <CheckCircle2 size={28} />}
         </button>
      </div>

      {/* MODAL PROVEEDOR */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[300] flex items-center justify-center p-4">
          <div className="bg-[#1e293b] w-full max-w-sm rounded-[2.5rem] p-8 border border-slate-700 shadow-2xl">
            <h2 className="text-lg font-black text-orange-500 mb-6 uppercase tracking-tighter">Nuevo Proveedor</h2>
            <form onSubmit={async (e) => {
               e.preventDefault();
               const formData = new FormData(e.currentTarget);
               const newS = { id: crypto.randomUUID(), name: formData.get('name') as string, rif: formData.get('rif') as string, phone: formData.get('phone') as string };
               await dbService.put('suppliers', newS);
               setSuppliers(prev => [...prev, newS]);
               setSelectedSupplierId(newS.id);
               setIsSupplierModalOpen(false);
            }} className="space-y-4">
               <input name="name" placeholder="Nombre Comercial" className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-4 text-xs font-bold text-white outline-none" required />
               <input name="rif" placeholder="RIF (J-0000000)" className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-4 text-xs font-bold text-white outline-none" />
               <input name="phone" placeholder="Teléfono" className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-4 text-xs font-bold text-white outline-none" required />
               <div className="flex gap-3 pt-2">
                 <button type="button" onClick={() => setIsSupplierModalOpen(false)} className="flex-1 text-slate-500 font-black uppercase text-[10px]">Cerrar</button>
                 <button type="submit" className="flex-1 bg-orange-500 text-white p-4 rounded-xl font-black uppercase text-[10px] shadow-lg">Guardar</button>
               </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PRODUCTO */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[300] flex items-center justify-center p-4">
          <div className="bg-[#1e293b] w-full max-w-sm rounded-[2.5rem] p-8 border border-slate-700 shadow-2xl">
            <h2 className="text-lg font-black text-emerald-500 mb-6 uppercase tracking-tighter">Nuevo Producto</h2>
            <form onSubmit={async (e) => {
               e.preventDefault();
               const formData = new FormData(e.currentTarget);
               const newP = {
                 id: crypto.randomUUID(),
                 name: formData.get('name') as string,
                 sku: formData.get('sku') as string,
                 category: formData.get('category') as string,
                 costUSD: parseNumber(formData.get('costUSD') as string) || 0,
                 priceUSD: parseNumber(formData.get('priceUSD') as string) || 0,
                 stock: 0,
                 minStock: 5
               };
               await dbService.put('products', newP);
               setProducts(prev => [...prev, newP]);
               addToCart(newP);
               setIsProductModalOpen(false);
            }} className="space-y-4">
               <input name="name" placeholder="Descripción del Producto" className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-4 text-xs font-bold text-white outline-none" required />
               <input name="sku" placeholder="Código / SKU" className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-4 text-xs font-bold text-white outline-none" required />
               <select name="category" className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-4 text-xs font-bold text-white outline-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
               <div className="grid grid-cols-2 gap-3">
                  <input name="costUSD" type="number" step="0.01" lang="en-US" placeholder="Costo $" className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-4 text-xs font-black text-white outline-none" required />
                  <input name="priceUSD" type="number" step="0.01" lang="en-US" placeholder="PVP $" className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-4 text-xs font-black text-emerald-400 outline-none" required />
               </div>
               <div className="flex gap-3 pt-2">
                 <button type="button" onClick={() => setIsProductModalOpen(false)} className="flex-1 text-slate-500 font-black uppercase text-[10px]">Cerrar</button>
                 <button type="submit" className="flex-1 bg-emerald-500 text-white p-4 rounded-xl font-black uppercase text-[10px] shadow-lg">Crear</button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Purchases;
