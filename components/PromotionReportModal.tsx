
import React, { useRef, useState } from 'react';
import { X, Printer, Download, FileText } from 'lucide-react';
import { CompanyInfo, AppSettings, Promotion, CustomerPromotion, Customer } from '../types';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  promotion: Promotion;
  customerPromotions: CustomerPromotion[];
  customers: Customer[];
  company: CompanyInfo;
  settings: AppSettings;
}

export const PromotionReportModal: React.FC<Props> = ({ 
  isOpen, onClose, promotion, customerPromotions, customers, company, settings 
}) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setIsGenerating(true);
    
    try {
      const element = reportRef.current;
      const dataUrl = await htmlToImage.toPng(element, {
        backgroundColor: '#fff',
        pixelRatio: 3,
        cacheBust: true,
        width: element.scrollWidth,
        height: element.scrollHeight,
      });

      const imgProps = await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.src = dataUrl;
      });

      const pdfWidth = 210; // A4 width in mm
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      // Create PDF with custom height to fit all content
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: [pdfWidth, pdfHeight]
      });

      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Reporte_Promo_${promotion.name.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('Error al generar PDF:', err);
      alert('No se pudo generar el PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  const promoCustomers = customerPromotions
    .filter(cp => cp.promotionId === promotion.id)
    .sort((a, b) => b.currentCount - a.currentCount);

  return (
    <div className="fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-2 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white">
      <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 print:shadow-none print:rounded-none">
        
        <div className="bg-slate-900 p-3 flex justify-between items-center print:hidden">
           <span className="text-white text-[10px] font-black uppercase tracking-widest">
              REPORTE DE PROMOCIÓN
           </span>
           <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
             <X size={20} />
           </button>
        </div>

        <div 
          ref={reportRef} 
          className="p-8 text-black bg-white font-mono text-[11px] leading-tight print-content"
        >
           {settings.showLogoOnTicket && company.logo && (
             <div className="flex justify-center mb-4 w-full">
               <img 
                 src={company.logo} 
                 alt="Logo Empresa" 
                 className="w-32 h-auto max-h-24 object-contain block mx-auto" 
               />
             </div>
           )}

           <div className="text-center space-y-0.5 mb-6">
              <h2 className="text-[16px] font-black uppercase leading-none tracking-tighter">{company.name}</h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">REPORTE DE FIDELIDAD</p>
           </div>

           <div className="bg-slate-900 text-white p-4 rounded-2xl mb-6">
              <h3 className="text-sm font-black uppercase tracking-tighter mb-1">{promotion.name}</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase leading-tight">{promotion.description}</p>
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-700">
                 <div>
                    <p className="text-[8px] font-black text-slate-500 uppercase">REQUERIDO</p>
                    <p className="text-lg font-black">{promotion.requiredQuantity} COMPRAS</p>
                 </div>
                 <div>
                    <p className="text-[8px] font-black text-slate-500 uppercase">PREMIO</p>
                    <p className="text-lg font-black text-orange-500">{promotion.rewardQuantity} UNIDADES</p>
                 </div>
              </div>
           </div>

           <div className="mb-6">
              <div className="flex justify-between font-black text-[9px] uppercase border-b-2 border-black pb-2 mb-3">
                 <span className="w-1/2">CLIENTE</span>
                 <span className="w-1/4 text-center">PROGRESO</span>
                 <span className="w-1/4 text-right">ESTADO</span>
              </div>

              <div className="space-y-3">
                 {promoCustomers.length > 0 ? promoCustomers.map((cp, i) => {
                   const customer = customers.find(c => c.id === cp.customerId);
                   const isReady = cp.currentCount >= promotion.requiredQuantity;
                   return (
                     <div key={i} className="flex justify-between text-[10px] items-center border-b border-dotted border-slate-300 pb-2">
                        <div className="w-1/2">
                           <p className="font-black uppercase truncate">{customer?.name || 'DESCONOCIDO'}</p>
                           <p className="text-[8px] text-slate-500">{customer?.phone || ''}</p>
                        </div>
                        <span className="w-1/4 text-center font-bold">{cp.currentCount} / {promotion.requiredQuantity}</span>
                        <span className={`w-1/4 text-right font-black ${isReady ? 'text-emerald-600' : 'text-slate-400'}`}>
                           {isReady ? '¡LISTO!' : 'EN CURSO'}
                        </span>
                     </div>
                   );
                 }) : (
                   <div className="text-center py-8 text-slate-400 font-bold uppercase text-[9px]">Sin clientes inscritos</div>
                 )}
              </div>
           </div>

           <div className="border-t border-black pt-6 text-center space-y-2">
              <p className="text-[9px] font-bold text-slate-500 uppercase">FECHA DE GENERACIÓN: {new Date().toLocaleString('es-VE')}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.2em]">*** FIN DEL REPORTE ***</p>
           </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col gap-3 print:hidden">
           <button 
             onClick={handleDownloadPDF} 
             disabled={isGenerating}
             className="w-full bg-rose-600 hover:bg-rose-700 text-white py-4 rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
           >
              {isGenerating ? 'Generando...' : <><FileText size={20} /> Descargar PDF</>}
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
