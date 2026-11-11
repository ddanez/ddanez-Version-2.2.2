
import React, { useRef, useState, useMemo } from 'react';
import { X, Printer, Download, CheckCircle2, Share2 } from 'lucide-react';
import { CompanyInfo, AppSettings, Sale, Purchase } from '../types';
import * as htmlToImage from 'html-to-image';
import { downloadOrShareFile } from '../downloadHelper';
import { Capacitor } from '@capacitor/core';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: any;
  company: CompanyInfo;
  settings: AppSettings;
  title?: string;
}

export const TicketModal: React.FC<Props> = ({ isOpen, onClose, data, company, settings, title = "Comprobante" }) => {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Determinar si es una compra basándose en los datos o en la identidad del objeto
  const isPurchase = useMemo(() => {
    if (!data) return false;
    return 'supplierName' in data || 'supplierId' in data;
  }, [data]);

  // Si es un abono, el objeto `items` suele estar vacío o no existir. 
  // Detectar si el comprobante es por el pago total o un abono puntual.
  const isOnlyAbono = useMemo(() => !data?.items || data.items.length === 0, [data]);

  if (!isOpen || !data) return null;

  // Cálculos contables precisos para el desglose del ticket
  const itemsSubtotal = (data.items || []).reduce((acc: number, item: any) => {
    const price = isPurchase ? (item.costUSD || 0) : (item.priceUSD || 0);
    return acc + ((item.quantity || 0) * price);
  }, 0);

  const discount = data.discountUSD || 0;
  const totalOperacion = isOnlyAbono ? (data.totalUSD || 0) : (itemsSubtotal - discount);
  const abonosRecibidos = data.paidAmountUSD || 0;
  
  // Saldo deudor: Total operación menos lo que ya se ha pagado acumulado
  const saldoDeudor = isOnlyAbono ? 0 : Math.max(0, totalOperacion - abonosRecibidos);

  const handlePrint = () => {
    if (Capacitor.isNativePlatform()) {
      handleDownloadImage();
    } else {
      window.print();
    }
  };

  const handleDownloadImage = async () => {
    if (!ticketRef.current) return;
    setIsGenerating(true);
    
    try {
      const dataUrl = await htmlToImage.toPng(ticketRef.current, {
        backgroundColor: '#fff',
        pixelRatio: 3,
        cacheBust: true,
        includeQueryParams: true,
      });

      const fileName = isPurchase ? 'Compra' : 'Venta';
      const fileFullName = `Ticket_${fileName}_${(data.id || '0000').slice(0,6).toUpperCase()}.png`;
      const success = await downloadOrShareFile({
        fileName: fileFullName,
        title: `Ticket de ${fileName} - ${entityName}`,
        dataUrl,
        mimeType: 'image/png'
      });

      if (!success) {
        alert('No se pudo guardar la imagen automáticamente. Intente tomar una captura de pantalla.');
      }
    } catch (err) {
      console.error('Error al generar imagen:', err);
      try {
        const fallbackUrl = await htmlToImage.toPng(ticketRef.current as HTMLElement, {
           backgroundColor: '#fff',
           pixelRatio: 2,
           skipFonts: true
        });
        const fileName = isPurchase ? 'Compra' : 'Venta';
        const fileFullName = `Ticket_${fileName}_${(data.id || '0000').slice(0,6).toUpperCase()}.png`;
        await downloadOrShareFile({
          fileName: fileFullName,
          title: `Ticket de ${fileName} - ${entityName}`,
          dataUrl: fallbackUrl,
          mimeType: 'image/png'
        });
      } catch (secondErr) {
        alert('No se pudo generar la imagen. Intente tomar una captura de pantalla.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Determinar el nombre a mostrar (Proveedor o Cliente)
  const entityName = isPurchase 
    ? (data.supplierName || 'PROVEEDOR') 
    : (data.customerName || 'CONTADO');

  return (
    <div className="fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-2 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white">
      <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 print:shadow-none print:rounded-none">
        
        <div className="bg-slate-900 p-3 flex justify-between items-center print:hidden">
           <span className="text-white text-[10px] font-black uppercase tracking-widest">
              {isOnlyAbono ? "RECIBO DE ABONO" : (isPurchase ? "COMPROBANTE COMPRA" : title)}
           </span>
           <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
             <X size={20} />
           </button>
        </div>

        <div 
          ref={ticketRef} 
          className="p-5 text-black bg-white font-mono text-[11px] leading-tight print-content"
          style={{ width: '100%', minHeight: 'auto' }}
        >
           {settings.showLogoOnTicket && company.logo && (
             <div className="flex justify-center mb-4 w-full">
               <img 
                 src={company.logo} 
                 alt="Logo Empresa" 
                 className="w-40 h-auto max-h-28 object-contain block mx-auto" 
               />
             </div>
           )}

           <div className="text-center space-y-0.5 mb-4">
              <h2 className="text-[16px] font-black uppercase leading-none tracking-tighter">{company.name}</h2>
              {company.slogan && <p className="text-[9px] italic font-bold uppercase text-slate-600 mb-1">{company.slogan}</p>}
              <div className="text-[9px] font-bold space-y-0.5 mt-1 border-t border-slate-100 pt-1">
                <p>RIF: {company.rif}</p>
                {company.phone && <p>TELF: {company.phone}</p>}
                {company.email && <p>EMAIL: {company.email}</p>}
                {company.address && <p className="uppercase leading-tight">{company.address}</p>}
              </div>
           </div>

           <div className="border-t border-black mb-3"></div>

           <div className="space-y-1 mb-4">
              <div className="flex items-baseline justify-between">
                 <span className="font-bold uppercase text-[9px]">{isPurchase ? 'PROVEEDOR:' : 'CLIENTE:'}</span>
                 <span className="uppercase font-black text-[13px] text-right">{entityName}</span>
              </div>
              
              <div className="border-t border-black pt-2 mt-2 space-y-1">
                 <div className="flex justify-between items-center">
                    <span className="font-bold uppercase text-[9px]">FOLIO:</span>
                    <span className="font-black text-[11px]">{(data.id || '').slice(-6).toUpperCase()}</span>
                 </div>
                 <div className="flex justify-between items-center whitespace-nowrap overflow-hidden">
                    <span className="font-bold uppercase text-[9px]">FECHA:</span>
                    <span className="font-bold text-[10px] text-right truncate ml-2">
                      {new Date(data.date || new Date()).toLocaleDateString('es-VE')} {new Date(data.date || new Date()).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </span>
                 </div>
                 {!isOnlyAbono && (
                   <div className="flex justify-between items-center">
                      <span className="font-bold uppercase text-[9px]">STATUS:</span>
                      <span className="font-black uppercase bg-black text-white px-2 py-0.5 text-[9px]">
                        {data.status === 'paid' ? 'PAGADO' : 'PENDIENTE'}
                      </span>
                   </div>
                 )}
              </div>
           </div>

           <div className="border-t border-black mb-1"></div>

           {data.items && data.items.length > 0 && (
             <div className="mb-4">
                <div className="flex justify-between font-black text-[9px] uppercase border-b border-black pb-1 mb-1">
                   <span className="w-1/4 text-left">CANT</span>
                   <span className="w-1/4 text-center">PRECIO</span>
                   <span className="w-1/2 text-right">TOTAL</span>
                </div>

                <div className="divide-y divide-dotted divide-slate-400">
                   {data.items.map((item: any, i: number) => {
                     const price = isPurchase ? (item.costUSD || 0) : (item.priceUSD || 0);
                     return (
                       <div key={i} className="py-2">
                          <div className="uppercase font-black text-[11px] leading-tight mb-1">{item.name}</div>
                          <div className="flex justify-between text-[12px] items-baseline">
                             <span className="w-1/4 font-bold text-left">{(item.quantity || 0).toFixed(2).replace('.', ',')}</span>
                             <span className="w-1/4 text-center">{(price).toFixed(2).replace('.', ',')}</span>
                             <span className="w-1/2 text-right font-black">{((item.quantity || 0) * price).toFixed(2).replace('.', ',')}</span>
                          </div>
                       </div>
                     );
                   })}
                </div>
             </div>
           )}

           <div className="border-t border-black pt-3 space-y-1 mb-5">
              {!isOnlyAbono ? (
                <>
                  <div className="flex justify-between text-[12px]">
                     <span className="font-bold uppercase">SUBTOTAL</span>
                     <span className="font-black">US${(itemsSubtotal || 0).toFixed(2).replace('.', ',')}</span>
                  </div>
                  
                  {discount > 0 && (
                    <div className="flex justify-between text-[12px]">
                       <span className="font-bold uppercase">DESCUENTO</span>
                       <span className="font-black">- US${(discount || 0).toFixed(2).replace('.', ',')}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-[12px] border-t border-slate-300 pt-1">
                     <span className="font-bold uppercase">TOTAL OPERACIÓN</span>
                     <span className="font-black">US${(totalOperacion || 0).toFixed(2).replace('.', ',')}</span>
                  </div>

                  <div className="flex justify-between text-[12px]">
                     <span className="font-bold uppercase">ABONOS REALIZADOS</span>
                     <span className="font-black">- US${(abonosRecibidos || 0).toFixed(2).replace('.', ',')}</span>
                  </div>

                  <div className="flex justify-between text-[16px] font-black border-t-2 border-double border-black pt-2 mt-1">
                     <span className="uppercase">SALDO DEUDOR</span>
                     {/* Fix: changed saldoDeuda to saldoDeudor */}
                     <span className="text-right">US${(saldoDeudor || 0).toFixed(2).replace('.', ',')}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-[16px] font-black border-t-2 border-double border-black pt-2">
                     <span className="uppercase">MONTO ABONADO</span>
                     <span className="text-right">US${(totalOperacion || 0).toFixed(2).replace('.', ',')}</span>
                  </div>
                </>
              )}
           </div>

           <div className="border-t border-black pt-5 mb-5">
              <div className="border border-dotted border-black p-3 text-center bg-slate-50">
                 <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 leading-none">Datos para Pago Móvil</p>
                 <div className="space-y-1">
                    <p className="uppercase font-black text-[12px] leading-none">{company.bank || 'BANCO DE VENEZUELA'}</p>
                    <p className="font-black text-[14px] leading-none">{company.mobilePhone || 'N/A'}</p>
                    <p className="font-black text-[12px] leading-none">V-{(company.dni || '').replace(/\D/g, '')}</p>
                    {company.accountNumber && (
                      <div className="pt-2 border-t border-dotted border-slate-400 mt-2">
                        <p className="text-[8px] font-black uppercase tracking-wider text-slate-600 mb-0.5">Cuenta Bancaria:</p>
                        <p className="font-black text-[11px] leading-tight font-mono tracking-wider break-all">{company.accountNumber}</p>
                      </div>
                    )}
                 </div>
              </div>
           </div>

           <div className="text-center font-black text-[12px] uppercase py-3 border-t border-black">
              ¡¡GRACIAS POR SU PREFERENCIA!!
           </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col gap-3 print:hidden">
           <button 
             onClick={handleDownloadImage} 
             disabled={isGenerating}
             className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
           >
              {isGenerating ? 'Generando...' : <><Share2 size={20} /> Guardar o Compartir Ticket</>}
           </button>
           
           <div className="flex gap-3">
              <button onClick={handlePrint} className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"><Printer size={16} /> Imprimir</button>
              <button onClick={onClose} className="flex-1 bg-slate-200 text-slate-700 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest">Cerrar</button>
           </div>
        </div>
      </div>
      
      <style>{`
        @media print {
          @page { margin: 0; size: 80mm auto; }
          body * { visibility: hidden; }
          .print-content, .print-content * { visibility: visible; }
          .print-content { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%; 
            padding: 5mm;
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
};
