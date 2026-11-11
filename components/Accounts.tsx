
import React, { useState, useMemo, useEffect } from 'react';
import { CheckCircle2, DollarSign, Calendar, User, Truck, MessageCircle, Wallet, ChevronDown, ChevronUp, ArrowRight, Search, Printer, X, Trash2, FileText } from 'lucide-react';
import { AppSettings, Sale, Purchase, CompanyInfo, Customer, Supplier } from '../types';
import { dbService } from '../db';
import { parseNumber, calculateBS } from '../utils';
import { TicketModal } from './TicketModal';
import { DebtReportModal } from './DebtReportModal';
import { GlobalAccountsReportModal } from './GlobalAccountsReportModal';

interface Props {
  type: 'cxc' | 'cxp';
  items: (Sale | Purchase)[];
  settings: AppSettings;
  company: CompanyInfo;
  onUpdate: () => void;
  customers: Customer[];
  suppliers: Supplier[];
}

const Accounts: React.FC<Props> = ({ type, items, settings, company, onUpdate, customers, suppliers }) => {
  const [ticketData, setTicketData] = useState<any>(null);
  const [paymentModal, setPaymentModal] = useState<{ entityId: string, name: string, invoiceId?: string, balance: number } | null>(null);
  const [amountToPay, setAmountToPay] = useState<number>(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grouped' | 'chronological'>('grouped');
  const [searchTerm, setSearchTerm] = useState('');
  const [printReportData, setPrintReportData] = useState<any>(null);
  const [showGlobalReport, setShowGlobalReport] = useState(false);

  // Manejar retroceso de modales con la flecha atrás de Android
  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (ticketData) {
        e.preventDefault();
        setTicketData(null);
        return;
      }
      if (paymentModal) {
        e.preventDefault();
        setPaymentModal(null);
        return;
      }
      if (printReportData) {
        e.preventDefault();
        setPrintReportData(null);
        return;
      }
      if (showGlobalReport) {
        e.preventDefault();
        setShowGlobalReport(false);
        return;
      }
    };
    window.addEventListener('app:backbutton', handleBackButton);
    return () => window.removeEventListener('app:backbutton', handleBackButton);
  }, [ticketData, paymentModal, printReportData, showGlobalReport]);

  const chronologicalItems = useMemo(() => {
    let filtered = [...items];
    if (searchTerm) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(item => {
        const name = type === 'cxc' ? (item as Sale).customerName : (item as Purchase).supplierName;
        return name.toLowerCase().includes(term);
      });
    }
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [items, searchTerm, type]);

  const grouped = useMemo(() => {
    const acc: Record<string, { groupKey: string, id: string, name: string, totalPending: number, invoices: (Sale | Purchase)[], creditBalance: number }> = {};
    
    items.forEach(item => {
      const entityId = type === 'cxc' ? (item as Sale).customerId : (item as Purchase).supplierId;
      const entityName = type === 'cxc' ? (item as Sale).customerName : (item as Purchase).supplierName;
      
      const hasValidId = entityId && entityId !== 'N/A' && entityId !== 'import' && entityId !== 'undefined';
      const entity = hasValidId 
        ? (type === 'cxc' ? customers.find(c => c.id === entityId) : suppliers.find(s => s.id === entityId))
        : null;

      const currentName = entity ? entity.name : entityName;

      // Filter by search term if present
      if (searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        const matchesCurrentName = currentName.toLowerCase().includes(term);
        const matchesOriginalName = entityName.toLowerCase().includes(term);
        if (!matchesCurrentName && !matchesOriginalName) {
          return;
        }
      }

      // Group key is the customer's ID if found, otherwise normalized name
      const groupKey = entity 
        ? entity.id 
        : entityName.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
            .replace(/[^a-z0-9]/g, '') // Quitar caracteres especiales
            .trim();
      
      if (!acc[groupKey]) {
        acc[groupKey] = {
          groupKey,
          id: entity ? entity.id : (entityId || groupKey),
          name: currentName,
          totalPending: 0,
          invoices: [],
          creditBalance: entity?.creditBalanceUSD || 0
        };
      }
      
      const balance = (item.totalUSD || 0) - (item.paidAmountUSD || 0);
      acc[groupKey].totalPending += balance;
      acc[groupKey].invoices.push(item);
    });
    
    // Add entities with credit balance even if no pending invoices
    const allEntities = type === 'cxc' ? customers : suppliers;
    allEntities.forEach(entity => {
      const groupKey = entity.id;
      
      // Filter by search term if present
      if (searchTerm && !entity.name.toLowerCase().includes(searchTerm.toLowerCase().trim())) {
        return;
      }

      if ((entity.creditBalanceUSD || 0) > 0 && !acc[groupKey]) {
        acc[groupKey] = {
          groupKey,
          id: entity.id,
          name: entity.name,
          totalPending: 0,
          invoices: [],
          creditBalance: entity.creditBalanceUSD || 0
        };
      }
    });

    return Object.values(acc).sort((a, b) => b.totalPending - a.totalPending);
  }, [items, type, customers, suppliers, searchTerm]);

  const handleProcessPayment = async () => {
    if (!paymentModal) return;
    
    const { entityId, invoiceId, name } = paymentModal;
    let remaining = amountToPay;
    
    // Buscar el grupo por ID o por nombre exacto para ser más robustos
    const entityGroup = grouped.find(g => g.id === entityId) || grouped.find(g => g.name === name);
    if (!entityGroup) return;

    let invoicesToUpdate: (Sale | Purchase)[] = [];
    
    if (invoiceId) {
      const targetInv = entityGroup.invoices.find(i => i.id === invoiceId);
      if (targetInv) {
        invoicesToUpdate = [targetInv];
      }
    } else {
      invoicesToUpdate = [...entityGroup.invoices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    if (invoicesToUpdate.length === 0 && !invoiceId) {
      // Si no hay facturas pero hay monto, podría ser un abono a cuenta general
    }

    for (const inv of invoicesToUpdate) {
      if (remaining <= 0) break;
      const balance = (inv.totalUSD || 0) - (inv.paidAmountUSD || 0);
      const paymentForThis = Math.min(remaining, balance);
      
      const newPaid = (inv.paidAmountUSD || 0) + paymentForThis;
      const isFullyPaid = newPaid >= (inv.totalUSD || 0);
      
      const updatedInv = { 
        ...inv, 
        status: (isFullyPaid ? 'paid' : 'pending') as 'paid' | 'pending', 
        paidAmountUSD: newPaid 
      };
      await dbService.put(type === 'cxc' ? 'sales' : 'purchases', updatedInv);
      
      remaining -= paymentForThis;
    }
    
    // Surplus goes to credit balance
    if (remaining > 0) {
      const entity = type === 'cxc' 
        ? customers.find(c => c.id === entityId || c.name === paymentModal.name) 
        : suppliers.find(s => s.id === entityId || s.name === paymentModal.name);
        
      if (entity) {
        const updatedEntity = {
          ...entity,
          creditBalanceUSD: (entity.creditBalanceUSD || 0) + remaining
        };
        await dbService.put(type === 'cxc' ? 'customers' : 'suppliers', updatedEntity);
      }
    }
    
    // Record payment
    const paymentRecord = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      relatedId: invoiceId || 'multiple',
      entityId,
      amountUSD: amountToPay,
      exchangeRate: settings.exchangeRate,
      type: type
    };
    await dbService.put('payments', paymentRecord);
    
    setTicketData({ 
      id: crypto.randomUUID(),
      customerName: paymentModal.name,
      supplierName: paymentModal.name,
      totalUSD: amountToPay, 
      totalBS: amountToPay * settings.exchangeRate, 
      date: new Date().toISOString(),
      items: [{ name: invoiceId ? `Abono a Factura ${invoiceId.slice(-6)}` : 'Abono a Cuenta', quantity: 1, priceUSD: amountToPay }]
    });
    
    setPaymentModal(null);
    setAmountToPay(0);
    onUpdate();
  };

  const handleDeleteInvoice = async (id: string) => {
    if (!confirm('¿ESTÁ SEGURO DE ELIMINAR ESTA DEUDA? ESTA ACCIÓN NO SE PUEDE DESHACER.')) return;
    try {
      await dbService.delete(type === 'cxc' ? 'sales' : 'purchases', id);
      onUpdate();
    } catch (err) {
      console.error("Error al eliminar deuda:", err);
      alert("Error al eliminar la deuda.");
    }
  };

  const totalPending = grouped.reduce((sum, g) => sum + g.totalPending, 0);
  const totalCredit = grouped.reduce((sum, g) => sum + g.creditBalance, 0);

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {type === 'cxc' && (
        <div className="flex justify-end pr-2">
          <button 
            onClick={() => setShowGlobalReport(true)}
            className="flex items-center gap-2 bg-[#1e293b] hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-lg border border-slate-700"
          >
            <FileText size={14} className="text-orange-500" />
            Reporte General
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1e293b] p-4 rounded-2xl border border-slate-700 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
            <DollarSign size={40} className="text-rose-500" />
          </div>
          <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest leading-none mb-1">Total Pendiente</p>
          <p className="text-xl font-black text-white leading-none tracking-tighter">${(totalPending || 0).toFixed(2)}</p>
          <p className="text-[9px] font-black text-slate-400 mt-1.5 uppercase leading-none">{calculateBS(totalPending, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</p>
        </div>
        <div className="bg-[#1e293b] p-4 rounded-2xl border border-slate-700 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wallet size={40} className="text-emerald-500" />
          </div>
          <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest leading-none mb-1" title="Saldos anticipados o abonos excedentes de clientes">Saldo a Favor</p>
          <p className="text-xl font-black text-white leading-none tracking-tighter">${(totalCredit || 0).toFixed(2)}</p>
          <p className="text-[9px] font-black text-slate-400 mt-1.5 uppercase leading-none">{calculateBS(totalCredit, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
        <input 
          type="text" 
          placeholder={`BUSCAR ${type === 'cxc' ? 'CLIENTE' : 'PROVEEDOR'}...`}
          className="w-full bg-[#1e293b] border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-[10px] font-black text-white outline-none focus:border-orange-500 transition-all uppercase tracking-widest"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="flex bg-[#1e293b] p-1 rounded-xl border border-slate-700">
        <button 
          onClick={() => setViewMode('grouped')}
          className={`flex-1 py-2 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${viewMode === 'grouped' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Por Cliente
        </button>
        <button 
          onClick={() => setViewMode('chronological')}
          className={`flex-1 py-2 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${viewMode === 'chronological' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Cronológico
        </button>
      </div>

      <div className="space-y-3">
        {viewMode === 'grouped' ? (
          grouped.map(group => {
            const isExpanded = expandedId === group.id;
            return (
              <div key={group.groupKey} className="bg-[#1e293b] rounded-2xl border border-slate-700 overflow-hidden transition-all shadow-md active:scale-[0.99] duration-200">
                <div 
                  className="p-4 cursor-pointer hover:bg-slate-800/30"
                  onClick={() => setExpandedId(isExpanded ? null : group.id)}
                >
                  <div className="flex flex-col gap-3">
                    {/* Top Row: Icon + Name + Chevron */}
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                          {type === 'cxc' ? <User size={18} /> : <Truck size={18} />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-[13px] text-white leading-tight uppercase break-words">{group.name}</p>
                          <div className="flex flex-wrap gap-x-3 mt-1.5 pt-1.5 border-t border-slate-700/50">
                            {group.totalPending > 0 && (
                              <div className="flex flex-col">
                                <p className="text-[7.5px] text-rose-500/70 font-black uppercase tracking-tighter">Deuda Total</p>
                                <p className="text-[10px] text-rose-500 font-black uppercase tracking-tight">${group.totalPending.toFixed(2)}</p>
                              </div>
                            )}
                            {group.creditBalance > 0 && (
                              <div className="flex flex-col">
                                <p className="text-[7.5px] text-emerald-500/70 font-black uppercase tracking-tighter">Saldo a Favor</p>
                                <p className="text-[10px] text-emerald-500 font-black uppercase tracking-tight">${group.creditBalance.toFixed(2)}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 pt-2">
                        {isExpanded ? <ChevronUp size={20} className="text-slate-500 transition-transform duration-300" /> : <ChevronDown size={20} className="text-slate-500 transition-transform duration-300" />}
                      </div>
                    </div>

                    {/* Bottom Row: Action Buttons */}
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-700/30">
                      {type === 'cxc' && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const entity = customers?.find(c => c.id === group.id || c.name.toLowerCase() === group.name.toLowerCase());
                            const netPending = Math.max(0, group.totalPending - group.creditBalance);
                            const totalBs = settings.exchangeRate > 0 
                              ? `${calculateBS(netPending, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`
                              : '';
                            let message = `Hola *${group.name}*, le saludamos de *${company.name || "D'Danez Distribuciones"}*.\n`;
                            message += `Le recordamos que presenta un saldo pendiente de *US$ ${netPending.toFixed(2).replace('.', ',')}*${totalBs ? ` (≈ ${totalBs})` : ''} correspondiente a ${group.invoices.length} documento(s).\n`;
                            message += `\nPuede solicitar su estado de cuenta detallado o coordinar su pago respondiendo a este mensaje. ¡Muchas gracias!`;
                            let cleanPhone = (entity?.phone || '').replace(/[^0-9]/g, '');
                            if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
                              cleanPhone = '58' + cleanPhone.slice(1);
                            } else if (!cleanPhone.startsWith('58') && cleanPhone.length === 10) {
                              cleanPhone = '58' + cleanPhone;
                            }
                            const waUrl = cleanPhone 
                              ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`
                              : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
                            window.open(waUrl, '_blank');
                          }}
                          className="p-2.5 bg-emerald-500/10 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-xl transition-all flex items-center gap-1.5 text-[9px] font-bold uppercase"
                          title="Enviar recordatorio por WhatsApp"
                        >
                          <MessageCircle size={14} />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </button>
                      )}

                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const entity = type === 'cxc' 
                            ? customers?.find(c => c.id === group.id || c.name.toLowerCase() === group.name.toLowerCase())
                            : suppliers?.find(s => s.id === group.id || s.name.toLowerCase() === group.name.toLowerCase());

                          setPrintReportData({
                            entityName: group.name,
                            entityPhone: entity?.phone || '',
                            invoices: group.invoices,
                            totalPending: group.totalPending,
                            creditBalance: group.creditBalance
                          });
                        }}
                        className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all flex items-center gap-1.5 text-[9px] font-bold uppercase"
                        title="Ver / Descargar / Compartir Estado de Cuenta PDF"
                      >
                        <FileText size={14} className="text-orange-400" />
                        <span className="hidden sm:inline">Estado de Cuenta</span>
                      </button>
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`¿ESTÁ SEGURO DE ELIMINAR TODAS LAS DEUDAS DE ${group.name.toUpperCase()}? ESTA ACCIÓN NO SE PUEDE DESHACER.`)) return;
                          try {
                            for (const inv of group.invoices) {
                              await dbService.delete(type === 'cxc' ? 'sales' : 'purchases', inv.id);
                            }
                            onUpdate();
                          } catch (err) {
                            console.error("Error al eliminar deudas del grupo:", err);
                          }
                        }}
                        className="p-2.5 bg-rose-500/5 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl transition-all"
                        title="Eliminar todas las deudas"
                      >
                        <Trash2 size={14} />
                      </button>
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation();
                          setPaymentModal({ entityId: group.id, name: group.name, balance: group.totalPending }); 
                          setAmountToPay(group.totalPending); 
                        }}
                        className="flex-1 max-w-[120px] bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-md active:scale-95"
                      >
                        ABONAR
                      </button>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2 border-t border-slate-700/50 pt-3 bg-slate-900/30">
                    <div className="flex justify-between items-center mb-2 px-1">
                      <p className="text-[8px] font-black text-slate-500 uppercase">Detalle de Transacciones</p>
                      <button 
                        onClick={() => { 
                          setPaymentModal({ entityId: group.id, name: group.name, balance: group.totalPending }); 
                          setAmountToPay(group.totalPending); 
                        }}
                        className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 px-3 py-1.5 rounded-lg font-black text-[7px] uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
                      >
                        <Wallet size={10} />
                        Agregar Pago
                      </button>
                    </div>
                    {group.invoices.length === 0 && (
                      <p className="text-[8px] text-slate-500 uppercase font-black text-center py-2">No hay facturas pendientes</p>
                    )}
                    {group.invoices.map(inv => {
                      const invBalance = (inv.totalUSD || 0) - (inv.paidAmountUSD || 0);
                      return (
                        <div key={inv.id} className="flex justify-between items-center p-3 bg-slate-800/40 rounded-xl border border-slate-700/50">
                          <div className="flex items-center gap-3">
                            <Calendar size={12} className="text-slate-500" />
                            <div>
                              <p className="text-[9px] font-black text-white uppercase">Factura #{inv.id.slice(-6)}</p>
                              <p className="text-[7px] text-slate-500 font-bold uppercase">{new Date(inv.date).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-[9px] font-black text-rose-500">${invBalance.toFixed(2)}</p>
                              <p className="text-[7px] text-slate-400 font-black uppercase">{calculateBS(invBalance, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</p>
                              <p className="text-[7px] text-slate-500 font-bold uppercase">Original: ${inv.totalUSD.toFixed(2)}</p>
                            </div>
                            <div className="flex gap-1">
                              <button 
                                onClick={() => { 
                                  setPaymentModal({ entityId: group.id, name: group.name, invoiceId: inv.id, balance: invBalance }); 
                                  setAmountToPay(invBalance); 
                                }}
                                className="p-1.5 bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-lg transition-all"
                                title="Abonar a esta factura"
                              >
                                <ArrowRight size={12} />
                              </button>
                              <button 
                                onClick={() => handleDeleteInvoice(inv.id)}
                                className="p-1.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg transition-all"
                                title="Eliminar deuda"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          chronologicalItems.map(inv => {
            const invBalance = (inv.totalUSD || 0) - (inv.paidAmountUSD || 0);
            const entityId = type === 'cxc' ? (inv as Sale).customerId : (inv as Purchase).supplierId;
            const entityName = type === 'cxc' ? (inv as Sale).customerName : (inv as Purchase).supplierName;
            
            return (
              <div key={inv.id} className="bg-[#1e293b] p-4 rounded-2xl border border-slate-700 flex justify-between items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-slate-800 text-slate-400 rounded-xl flex items-center justify-center shrink-0">
                    <Calendar size={18} />
                  </div>
                  <div className="truncate">
                    <p className="font-black text-xs text-white leading-tight uppercase truncate">{entityName}</p>
                    <p className="text-[8px] text-slate-500 font-black uppercase mt-0.5">Factura #{inv.id.slice(-6)} • {new Date(inv.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[9px] font-black text-rose-500">${invBalance.toFixed(2)}</p>
                    <p className="text-[7px] text-slate-400 font-black uppercase">{calculateBS(invBalance, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</p>
                  </div>
                  <button 
                    onClick={() => { 
                      setPaymentModal({ entityId, name: entityName, invoiceId: inv.id, balance: invBalance }); 
                      setAmountToPay(invBalance); 
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl transition-all shadow-md"
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {paymentModal && (
        <div className="fixed inset-0 bg-black/95 z-[250] flex items-center justify-center p-4">
          <div className="bg-[#1e293b] w-full max-w-sm rounded-[2.5rem] p-8 border border-slate-700 animate-in zoom-in-95">
            <h3 className="text-lg font-black text-emerald-500 mb-2 uppercase tracking-tighter">Registrar Abono</h3>
            <p className="text-[8px] font-black text-slate-400 uppercase mb-6 tracking-widest">{paymentModal.name}</p>
            
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Monto USD</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={amountToPay} 
                  onChange={(e) => setAmountToPay(parseNumber(e.target.value) || 0)} 
                  className="w-full bg-[#0a0f1d] border border-slate-700 rounded-xl p-4 text-xl font-black text-white outline-none" 
                  autoFocus 
                />
              </div>

              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[8px] font-black text-slate-500 uppercase">Tasa Actual</span>
                  <span className="text-[10px] font-black text-white">{settings.exchangeRate.toFixed(2)} Bs/$</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[8px] font-black text-slate-500 uppercase">Total en Bolívares</span>
                  <span className="text-lg font-black text-emerald-400">{(amountToPay * settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</span>
                </div>
              </div>

              {amountToPay > paymentModal.balance && (
                <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                  <p className="text-[8px] font-black text-amber-500 uppercase text-center">
                    El excedente de ${(amountToPay - paymentModal.balance).toFixed(2)} se guardará como saldo a favor.
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button onClick={() => setPaymentModal(null)} className="flex-1 py-3 font-black text-slate-500 uppercase text-[9px]">Cancelar</button>
                <button onClick={handleProcessPayment} className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-black uppercase text-[9px] shadow-lg">Confirmar Pago</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <TicketModal isOpen={!!ticketData} onClose={() => setTicketData(null)} data={ticketData} company={company} settings={settings} />
      
      {printReportData && (
        <DebtReportModal 
          isOpen={!!printReportData}
          onClose={() => setPrintReportData(null)}
          entityName={printReportData.entityName}
          entityPhone={printReportData.entityPhone}
          invoices={printReportData.invoices}
          totalPending={printReportData.totalPending}
          creditBalance={printReportData.creditBalance}
          company={company}
          settings={settings}
          type={type}
        />
      )}

      {showGlobalReport && (
        <GlobalAccountsReportModal
          isOpen={showGlobalReport}
          onClose={() => setShowGlobalReport(false)}
          data={grouped}
          company={company}
          settings={settings}
          type={type}
        />
      )}
    </div>
  );
};

export default Accounts;
