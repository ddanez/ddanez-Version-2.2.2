
import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Edit2, Tag, Box, AlertTriangle, Layers, History, ArrowUpRight, ArrowDownLeft, X, Trash2, Calendar, UserCheck } from 'lucide-react';
import { Product, AppSettings, Movement, Customer } from '../types';
import { dbService } from '../db';
import { parseNumber, searchMatch, calculateBS } from '../utils';

interface Props {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  settings: AppSettings;
  customers?: Customer[];
}

const CATEGORIES = ['Víveres', 'Charcutería', 'Lácteos', 'Limpieza', 'Bebidas', 'Snacks', 'Otros'];
const MERMA_REASONS = [
  'Vencimiento / Caducidad',
  'Producto Roto / Dañado',
  'Devolución de Cliente (Avería)',
  'Avería en Transporte',
  'Defecto de Fábrica',
  'Otro'
];

const Inventory: React.FC<Props> = ({ products, setProducts, settings, customers = [] }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showKardex, setShowKardex] = useState<Product | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);

  // Modal dedicado de registro de Merma
  const [isMermaModalOpen, setIsMermaModalOpen] = useState(false);
  const [mermaTargetProduct, setMermaTargetProduct] = useState<Product | null>(null);
  const [mermaQuantity, setMermaQuantity] = useState<string>('');
  const [mermaCustomerId, setMermaCustomerId] = useState<string>('');
  const [mermaReason, setMermaReason] = useState<string>(MERMA_REASONS[0]);
  const [mermaDate, setMermaDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [isSavingMerma, setIsSavingMerma] = useState(false);

  useEffect(() => {
    if (showKardex) {
      dbService.getAll<Movement>('movements').then(all => {
        setMovements(all.filter(m => m.productId === showKardex.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      });
    }
  }, [showKardex]);

  // Manejar retroceso de modales con la flecha atrás de Android
  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (isMermaModalOpen) {
        e.preventDefault();
        setIsMermaModalOpen(false);
        setMermaTargetProduct(null);
        return;
      }
      if (showKardex) {
        e.preventDefault();
        setShowKardex(null);
        return;
      }
      if (isModalOpen) {
        e.preventDefault();
        setIsModalOpen(false);
        setEditingProduct(null);
        return;
      }
    };
    window.addEventListener('app:backbutton', handleBackButton);
    return () => window.removeEventListener('app:backbutton', handleBackButton);
  }, [showKardex, isModalOpen, isMermaModalOpen]);

  // Optimización: Memoizar filtrado para evitar lag
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const combined = `${p.name} ${p.sku || ''} ${p.category || ''}`.toLowerCase();
      return searchMatch(combined, searchTerm);
    });
  }, [products, searchTerm]);

  // Función robusta para aplicar merma y descontar unidades del stock
  const handleApplyMerma = async (
    targetProduct: Product,
    qty: number,
    customerId?: string,
    reason?: string,
    dateStr?: string
  ) => {
    if (!targetProduct) return false;
    if (qty <= 0) {
      alert('Ingrese una cantidad válida mayor a 0');
      return false;
    }
    const currentStock = targetProduct.stock || 0;
    if (qty > currentStock) {
      alert(`La cantidad de merma (${qty}) no puede ser superior al stock disponible (${currentStock})`);
      return false;
    }

    setIsSavingMerma(true);
    try {
      const newStock = Math.max(0, currentStock - qty);
      const newMermaTotal = (targetProduct.mermaTotal || 0) + qty;

      const updatedProduct: Product = {
        ...targetProduct,
        stock: newStock,
        mermaTotal: newMermaTotal
      };

      // 1. Guardar en base de datos el producto con el stock descontado
      await dbService.put('products', updatedProduct);

      // 2. Determinar datos del cliente asociado
      const selectedCust = customers.find(c => c.id === customerId);
      const customerName = selectedCust ? selectedCust.name : 'Merma Interna / Almacén';

      // 3. Registrar el movimiento de merma en movements
      const movDate = dateStr ? new Date(dateStr + 'T12:00:00').toISOString() : new Date().toISOString();
      await dbService.put('movements', {
        id: crypto.randomUUID(),
        date: movDate,
        productId: updatedProduct.id,
        productName: updatedProduct.name,
        type: 'merma',
        quantity: -qty,
        stockAfter: newStock,
        customerId: customerId || undefined,
        customerName: customerName,
        reason: reason || 'Merma Registrada'
      });

      // 4. Actualizar estado de productos en React
      setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));

      // 5. Si el modal de edición de producto está abierto para este producto, sincronizar
      if (editingProduct && editingProduct.id === updatedProduct.id) {
        setEditingProduct(updatedProduct);
        const stockInput = document.querySelector('input[name="stock"]') as HTMLInputElement;
        if (stockInput) {
          stockInput.value = newStock.toString();
        }
      }

      return true;
    } catch (err) {
      console.error('Error aplicando merma:', err);
      alert('Ocurrió un error al procesar la merma');
      return false;
    } finally {
      setIsSavingMerma(false);
    }
  };

  const saveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const formStock = parseNumber(formData.get('stock') as string) || 0;
    
    // Obtener el producto actual para no perder el mermaTotal ni descontar incorrectamente
    const currentProd = editingProduct ? products.find(p => p.id === editingProduct.id) || editingProduct : null;
    
    const newProduct: Product = {
      id: currentProd?.id || crypto.randomUUID(),
      name: formData.get('name') as string,
      sku: formData.get('sku') as string,
      category: formData.get('category') as string || 'Otros',
      priceUSD: parseNumber(formData.get('priceUSD') as string) || 0,
      costUSD: parseNumber(formData.get('costUSD') as string) || 0,
      stock: formStock,
      minStock: parseNumber(formData.get('minStock') as string) || 0,
      mermaTotal: currentProd?.mermaTotal || 0
    };

    // La diferencia se calcula con respecto al stock actual en base de datos/estado
    const previousStock = currentProd?.stock || 0;
    const diff = newProduct.stock - previousStock;
    
    await dbService.put('products', newProduct);

    if (diff !== 0) {
      await dbService.put('movements', {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        productId: newProduct.id,
        productName: newProduct.name,
        type: diff > 0 ? 'purchase' : 'adjustment',
        quantity: diff,
        stockAfter: newProduct.stock
      });
    }

    setProducts(prev => {
      const filtered = prev.filter(p => p.id !== newProduct.id);
      return [...filtered, newProduct].sort((a,b) => (a.name || '').localeCompare(b.name || ''));
    });
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="flex gap-2 sm:gap-3 items-center">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-orange-500 transition-colors" size={18} />
          <input 
            type="text" placeholder="Producto, SKU o Categoría..." 
            className="w-full bg-[#1e293b] border border-slate-700 rounded-2xl py-3 pl-12 pr-4 text-xs focus:ring-2 focus:ring-orange-500/50 outline-none font-bold transition-all text-white"
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Botón rápido para registrar Merma */}
        <button 
          onClick={() => {
            setMermaTargetProduct(products[0] || null);
            setMermaQuantity('');
            setMermaCustomerId('');
            setMermaReason(MERMA_REASONS[0]);
            setMermaDate(new Date().toISOString().split('T')[0]);
            setIsMermaModalOpen(true);
          }}
          className="bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500 text-rose-400 hover:text-white font-black px-4 py-3 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center gap-2 text-xs uppercase tracking-wider"
          title="Registrar Merma o Pérdida de Unidades"
        >
          <AlertTriangle size={18} />
          <span className="hidden sm:inline">Registrar Merma</span>
        </button>

        <button 
          onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} 
          className="bg-orange-500 hover:bg-orange-600 text-white font-black p-3 rounded-2xl shadow-lg active:scale-95 transition-all"
          title="Nuevo Producto"
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="bg-[#1e293b] rounded-[1.5rem] border border-slate-700 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#0f172a]/50 text-slate-500">
                <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest">Producto</th>
                <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-center">Stock</th>
                <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest">Precio</th>
                <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filteredProducts.map(p => (
                <tr key={p.id} onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} className="hover:bg-slate-800/40 cursor-pointer transition-colors group">
                  <td className="px-5 py-3">
                    <p className="font-bold text-xs text-white leading-tight uppercase">{p.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[7px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-black tracking-widest uppercase">{p.sku}</span>
                      <span className="text-[7px] text-orange-400 font-bold uppercase">{p.category || 'Otros'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black inline-block ${(p.stock || 0) <= (p.minStock || 0) ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                      {(p.stock || 0) % 1 === 0 ? (p.stock || 0) : (p.stock || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-xs font-black text-white">${(p.priceUSD || 0).toFixed(2)}</p>
                    <p className="text-[8px] text-orange-500 font-bold">{calculateBS(p.priceUSD || 0, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</p>
                    {p.mermaTotal && p.mermaTotal > 0 ? (
                      <p className="text-[7px] text-rose-400 font-bold uppercase mt-1">Merma: {p.mermaTotal % 1 === 0 ? p.mermaTotal : p.mermaTotal.toFixed(2)}</p>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {/* Botón de Merma Directa para este producto */}
                      <button 
                        onClick={() => {
                          setMermaTargetProduct(p);
                          setMermaQuantity('');
                          setMermaCustomerId('');
                          setMermaReason(MERMA_REASONS[0]);
                          setMermaDate(new Date().toISOString().split('T')[0]);
                          setIsMermaModalOpen(true);
                        }}
                        className="p-2 hover:bg-rose-500/20 rounded-lg text-slate-400 hover:text-rose-400 transition-colors"
                        title="Registrar Merma para este producto"
                      >
                        <AlertTriangle size={14} />
                      </button>

                      <button 
                        onClick={() => setShowKardex(p)}
                        className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors"
                        title="Ver Historial (Kardex)"
                      >
                        <History size={14} />
                      </button>

                      <button 
                        onClick={() => { setEditingProduct(p); setIsModalOpen(true); }}
                        className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-orange-400 transition-colors"
                        title="Editar Producto"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showKardex && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-[#1e293b] w-full max-w-2xl rounded-[2.5rem] p-8 border border-slate-700 flex flex-col max-h-[90vh] animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tighter text-indigo-400 flex items-center gap-2">
                  <History size={24} /> Historial de Inventario
                </h2>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{showKardex.name}</p>
              </div>
              <button onClick={() => setShowKardex(null)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400"><X size={24}/></button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {movements.length === 0 ? (
                <div className="text-center py-12 text-slate-600 font-black uppercase text-xs tracking-widest">No hay movimientos registrados</div>
              ) : (
                movements.map(m => (
                  <div key={m.id} className="bg-[#0f172a] p-4 rounded-2xl border border-slate-700/50 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-xl ${m.quantity > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                        {m.quantity > 0 ? <ArrowUpRight size={18}/> : <ArrowDownLeft size={18}/>}
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-white uppercase tracking-tight">
                          {m.type === 'sale' ? 'Venta' : 
                           m.type === 'purchase' ? 'Compra / Entrada' : 
                           m.type === 'merma' ? 'Merma / Pérdida' : 
                           m.type === 'restoration' ? 'Restauración (Edición)' : 'Ajuste Manual'}
                        </p>
                        <p className="text-[8px] text-slate-500 font-bold uppercase">{new Date(m.date).toLocaleString()}</p>
                        {m.customerName && (
                          <p className="text-[7px] text-orange-400/80 font-black uppercase">Cliente: {m.customerName}</p>
                        )}
                        {m.reason && (
                          <p className="text-[7px] text-rose-400/80 font-medium italic">{m.reason}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-black ${m.quantity > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity % 1 === 0 ? m.quantity : m.quantity.toFixed(2)}
                      </p>
                      <p className="text-[8px] font-black text-slate-600 uppercase">Stock: {m.stockAfter % 1 === 0 ? m.stockAfter : m.stockAfter.toFixed(2)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Dedicado para Registro de Merma */}
      {isMermaModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[210] flex items-center justify-center p-4">
          <div className="bg-[#1e293b] w-full max-w-md rounded-[2.5rem] p-6 sm:p-8 border border-rose-500/30 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-rose-500/10 text-rose-500 rounded-2xl border border-rose-500/20">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-white">Registrar Merma</h2>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Descuento de Unidades</p>
                </div>
              </div>
              <button 
                onClick={() => { setIsMermaModalOpen(false); setMermaTargetProduct(null); }}
                className="p-2 hover:bg-slate-800 rounded-full text-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Selector de Producto */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">Producto</label>
                <select
                  value={mermaTargetProduct?.id || ''}
                  onChange={(e) => {
                    const found = products.find(p => p.id === e.target.value);
                    setMermaTargetProduct(found || null);
                  }}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-rose-500"
                >
                  <option value="">Seleccione un producto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Stock: {p.stock || 0}) - ${(p.priceUSD || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Indicador de Stock Actual */}
              {mermaTargetProduct && (
                <div className="bg-[#0f172a] border border-slate-700/60 p-3 rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <span className="text-[8px] font-black uppercase text-slate-500 block">Stock Actual Disponible</span>
                    <span className="text-sm font-black text-emerald-400">
                      {mermaTargetProduct.stock || 0} unidades
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[8px] font-black uppercase text-slate-500 block">Costo Unitario</span>
                    <span className="text-xs font-black text-white">${(mermaTargetProduct.costUSD || 0).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Cantidad a Descontar */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-rose-400 uppercase tracking-wider ml-1">Cantidad a Descontar (Merma)</label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  max={mermaTargetProduct?.stock || 0}
                  placeholder="Ej: 5"
                  value={mermaQuantity}
                  onChange={(e) => setMermaQuantity(e.target.value)}
                  className="w-full bg-[#0f172a] border border-rose-500/40 rounded-xl p-3 text-sm font-black text-white outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30"
                />
              </div>

              {/* Cliente Asociado (Opcional) */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">Cliente Asociado (Opcional)</label>
                <select
                  value={mermaCustomerId}
                  onChange={(e) => setMermaCustomerId(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-rose-500"
                >
                  <option value="">Merma Interna / Almacén (Sin Cliente)</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.rif ? `(${c.rif})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[8px] text-slate-500 font-bold uppercase ml-1">
                  Si fue una devolución o avería de un cliente, selecciónelo para que aparezca en el reporte por clientes.
                </p>
              </div>

              {/* Motivo de la Merma */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">Motivo / Causa</label>
                <select
                  value={mermaReason}
                  onChange={(e) => setMermaReason(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-rose-500"
                >
                  {MERMA_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Fecha */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">Fecha de Registro</label>
                <input
                  type="date"
                  value={mermaDate}
                  onChange={(e) => setMermaDate(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-rose-500"
                />
              </div>

              {/* Resumen del Descuento */}
              {mermaTargetProduct && parseNumber(mermaQuantity) > 0 && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center space-y-1">
                  <p className="text-[9px] font-black text-slate-300 uppercase">
                    Nuevo Stock Resultante: <span className="text-emerald-400 font-black">{Math.max(0, (mermaTargetProduct.stock || 0) - parseNumber(mermaQuantity))}</span>
                  </p>
                  <p className="text-[9px] font-black text-rose-400 uppercase">
                    Costo Total de Merma: ${(parseNumber(mermaQuantity) * (mermaTargetProduct.costUSD || 0)).toFixed(2)} USD
                  </p>
                </div>
              )}

              {/* Botones de Acción */}
              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => { setIsMermaModalOpen(false); setMermaTargetProduct(null); }}
                  className="flex-1 py-3 text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-widest rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSavingMerma || !mermaTargetProduct || parseNumber(mermaQuantity) <= 0}
                  onClick={async () => {
                    if (!mermaTargetProduct) return;
                    const val = parseNumber(mermaQuantity);
                    const ok = await handleApplyMerma(
                      mermaTargetProduct,
                      val,
                      mermaCustomerId || undefined,
                      mermaReason,
                      mermaDate
                    );
                    if (ok) {
                      setIsMermaModalOpen(false);
                      setMermaTargetProduct(null);
                      setMermaQuantity('');
                      alert(`Merma registrada: Se descontaron ${val} unidades de "${mermaTargetProduct.name}" exitosamente.`);
                    }
                  }}
                  className="flex-[2] bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-black py-3 rounded-xl shadow-lg uppercase tracking-widest text-[10px] transition-all active:scale-95"
                >
                  {isSavingMerma ? 'Procesando...' : 'Confirmar y Descontar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[150] flex items-center justify-center p-4">
          <div className="bg-[#1e293b] w-full max-w-lg rounded-[2.5rem] p-8 border border-slate-700 animate-in zoom-in-95">
            <h2 className="text-xl font-black mb-6 uppercase tracking-tighter text-orange-500 flex items-center gap-2">
              <Box size={24} /> {editingProduct ? 'Editar' : 'Nuevo'} Producto
            </h2>
            <form onSubmit={saveProduct} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase ml-2">Descripción</label>
                  <input name="name" defaultValue={editingProduct?.name} className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-orange-500" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase ml-2">Categoría</label>
                  <select name="category" defaultValue={editingProduct?.category || 'Otros'} className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-orange-500">
                    {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                   <label className="text-[9px] font-black text-slate-500 uppercase ml-2">SKU / Código</label>
                   <input name="sku" defaultValue={editingProduct?.sku} className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-orange-500" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase ml-2">PVP ($)</label>
                  <input name="priceUSD" type="number" step="0.01" lang="en-US" defaultValue={editingProduct?.priceUSD} className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-black text-emerald-400 outline-none focus:border-orange-500" required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase ml-2">Existencia</label>
                  <input name="stock" type="number" step="any" lang="en-US" defaultValue={editingProduct?.stock || 0} className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-orange-500" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase ml-2">Costo ($)</label>
                  <input name="costUSD" type="number" step="0.01" lang="en-US" defaultValue={editingProduct?.costUSD} className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-orange-500" required />
                </div>
              </div>

              {editingProduct && (
                <div className="bg-rose-500/5 border border-rose-500/20 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between text-rose-500">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Registrar Merma / Pérdida</span>
                    </div>
                    {editingProduct.mermaTotal ? (
                      <span className="text-[8px] font-black text-rose-400 uppercase">
                        Acumulado: {editingProduct.mermaTotal}
                      </span>
                    ) : null}
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input 
                      id="mermaInlineInput"
                      type="number" 
                      step="any" 
                      placeholder="Cantidad a rebajar..." 
                      className="bg-[#0f172a] border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none focus:border-rose-500" 
                    />
                    <select
                      id="mermaInlineCustomer"
                      className="bg-[#0f172a] border border-slate-700 rounded-xl p-2.5 text-[11px] font-bold text-white outline-none focus:border-rose-500"
                    >
                      <option value="">Merma Almacén</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-between items-center gap-2">
                    <p className="text-[8px] text-slate-500 font-bold uppercase italic">Resta del stock disponible y se suma al reporte de merma.</p>
                    <button 
                      type="button"
                      onClick={async () => {
                        const input = document.getElementById('mermaInlineInput') as HTMLInputElement;
                        const custSelect = document.getElementById('mermaInlineCustomer') as HTMLSelectElement;
                        const val = parseNumber(input?.value) || 0;
                        const custId = custSelect?.value || undefined;
                        
                        if (val <= 0) return alert('Ingrese una cantidad válida mayor a 0');
                        if (val > (editingProduct.stock || 0)) return alert(`La merma (${val}) no puede ser mayor al stock (${editingProduct.stock || 0})`);

                        const ok = await handleApplyMerma(
                          editingProduct,
                          val,
                          custId,
                          'Merma desde Edición de Producto'
                        );
                        if (ok) {
                          if (input) input.value = '';
                          alert(`Se descontaron ${val} unidades de merma exitosamente.`);
                        }
                      }}
                      className="bg-rose-500 hover:bg-rose-600 text-white font-black px-4 py-2.5 rounded-xl text-[9px] uppercase tracking-widest transition-all whitespace-nowrap"
                    >
                      Aplicar Merma
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { setIsModalOpen(false); setEditingProduct(null); }} className="flex-1 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Cerrar</button>
                <button type="submit" className="flex-[2] bg-orange-500 text-white font-black py-3 rounded-xl shadow-lg uppercase tracking-widest text-[10px]">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
