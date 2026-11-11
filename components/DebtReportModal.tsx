
import React, { useRef, useState } from 'react';
import { X, Printer, Download, FileText, Share2, MessageCircle } from 'lucide-react';
import { CompanyInfo, AppSettings, Sale, Purchase } from '../types';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';
import { calculateBS } from '../utils';
import { downloadOrShareFile } from '../downloadHelper';
import { Capacitor } from '@capacitor/core';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  entityName: string;
  entityPhone?: string;
  invoices: (Sale | Purchase)[];
  totalPending: number;
  creditBalance: number;
  company: CompanyInfo;
  settings: AppSettings;
  type: 'cxc' | 'cxp';
}

export const DebtReportModal: React.FC<Props> = ({ 
  isOpen, onClose, entityName, entityPhone, invoices, totalPending, creditBalance, company, settings, type 
}) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const handlePrint = () => {
    if (Capacitor.isNativePlatform()) {
      handleDownloadImage();
    } else {
      window.print();
    }
  };

  const handleDownloadImage = async () => {
    if (!reportRef.current) return;
    setIsGenerating(true);
    
    try {
      const dataUrl = await htmlToImage.toPng(reportRef.current, {
        backgroundColor: '#fff',
        pixelRatio: 3,
        cacheBust: true,
      });

      const fileName = `Estado_Cuenta_${entityName.replace(/\s+/g, '_')}.png`;
      const success = await downloadOrShareFile({
        fileName,
        title: `${reportTitle} - ${entityName}`,
        dataUrl,
        mimeType: 'image/png',
        dialogTitle: `Compartir imagen de Estado de Cuenta`,
        preferShare: true
      });

      if (!success) {
        alert('No se pudo guardar la imagen automáticamente. Intente tomar una captura de pantalla.');
      }
    } catch (err) {
      console.error('Error al generar imagen:', err);
      alert('No se pudo generar la imagen.');
    } finally {
      setIsGenerating(false);
    }
  };

  const sanitizeText = (txt: string) => {
    if (!txt) return '';
    return txt.replace(/[\u{1F300}-\u{1F9FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}]/gu, '').trim();
  };

  const handleSendWhatsApp = () => {
    const netPending = Math.max(0, totalPending - creditBalance);
    const dateStr = new Date().toLocaleDateString('es-VE');
    const bcvRate = settings.exchangeRate > 0 ? `${settings.exchangeRate.toFixed(2)} Bs/$` : 'N/A';
    const totalBs = settings.exchangeRate > 0 
      ? `${calculateBS(netPending, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`
      : '';

    let message = `📋 *${reportTitle}*\n`;
    message += `🏢 *${company.name || "D'Danez Distribuciones"}*\n`;
    message += `👤 *${entityLabel}:* ${entityName}\n`;
    message += `📅 *Fecha:* ${dateStr}\n`;
    message += `💵 *Tasa BCV:* ${bcvRate}\n\n`;

    message += `📌 *RESUMEN DE CUENTA:*\n`;
    message += `• *Total Deuda:* US$ ${totalPending.toFixed(2).replace('.', ',')}\n`;
    if (creditBalance > 0) {
      message += `• *Saldo a Favor:* US$ ${creditBalance.toFixed(2).replace('.', ',')}\n`;
    }
    message += `• *NETO PENDIENTE:* US$ ${netPending.toFixed(2).replace('.', ',')}${totalBs ? ` (≈ ${totalBs})` : ''}\n\n`;

    message += `📄 *DOCUMENTOS PENDIENTES (${invoices.length}):*\n`;
    invoices.forEach((inv, i) => {
      const invId = inv.id ? `#${inv.id.slice(-6).toUpperCase()}` : `#DOC-${i+1}`;
      const invBal = (inv.totalUSD || 0) - (inv.paidAmountUSD || 0);
      const invDate = inv.date ? new Date(inv.date).toLocaleDateString('es-VE') : '';
      message += `${i + 1}. *${invId}* (${invDate}) - Total: $${(inv.totalUSD || 0).toFixed(2)} | *Resta: $${invBal.toFixed(2)}*\n`;
    });

    if (company.bank || company.dni || company.mobilePhone || company.accountNumber) {
      message += `\n💳 *DATOS DE PAGO:*\n`;
      if (company.bank) message += `• Banco: ${company.bank}\n`;
      if (company.mobilePhone) message += `• Pago Móvil: ${company.mobilePhone}\n`;
      if (company.dni) message += `• CI/RIF: ${company.dni}\n`;
      if (company.accountNumber) message += `• Cuenta: ${company.accountNumber}\n`;
    }

    message += `\n_Emitido desde Gestor Pro administrativo._`;

    let cleanPhone = (entityPhone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
      cleanPhone = '58' + cleanPhone.slice(1);
    } else if (!cleanPhone.startsWith('58') && cleanPhone.length === 10) {
      cleanPhone = '58' + cleanPhone;
    }

    const waUrl = cleanPhone 
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

    window.open(waUrl, '_blank');
  };

  const handleExportPDF = async (action: 'download' | 'share' = 'download') => {
    setIsGenerating(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 80));

      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const contentWidth = pageWidth - (margin * 2);
      const maxY = pageHeight - 16;

      // Banner Principal
      doc.setFillColor(15, 23, 42); // Slate-900
      doc.rect(margin, 14, contentWidth, 24, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text(sanitizeText(company.name) || "D'DANEZ DISTRIBUCIONES", margin + 5, 23);

      doc.setFontSize(9.5);
      doc.setTextColor(249, 115, 22); // Orange-500
      doc.text(reportTitle, margin + 5, 31);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(203, 213, 225);
      doc.text(`Fecha: ${new Date().toLocaleDateString('es-VE')}`, pageWidth - margin - 5, 20.5, { align: 'right' });
      const rifRate = `RIF: ${company.rif || 'N/A'} • Tasa: ${settings.exchangeRate > 0 ? settings.exchangeRate.toFixed(2) + ' Bs/$' : 'N/A'}`;
      doc.text(rifRate, pageWidth - margin - 5, 26, { align: 'right' });
      doc.text(`Documentos pendientes: ${invoices.length}`, pageWidth - margin - 5, 31.5, { align: 'right' });

      // Info Entidad
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(margin, 41, contentWidth, 14, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(entityLabel + (entityPhone ? ` • TELF: ${entityPhone}` : ''), margin + 5, 46);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(sanitizeText(entityName), margin + 5, 51.5);

      // Cajas de Totales (3 Columnas)
      const boxWidth = (contentWidth - 6) / 3;
      const boxHeight = 16;
      const boxY = 58;

      // Caja 1: Total Deuda
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(margin, boxY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL DEUDA', margin + 3.5, boxY + 4.5);
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`US$ ${totalPending.toFixed(2).replace('.', ',')}`, margin + 3.5, boxY + 9.5);
      if (settings.exchangeRate > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(71, 85, 105);
        const bsTotal = calculateBS(totalPending, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 });
        doc.text(`≈ ${bsTotal} Bs.`, margin + 3.5, boxY + 13.5);
      }

      // Caja 2: Saldo a Favor
      const box2X = margin + boxWidth + 3;
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(110, 231, 183);
      doc.roundedRect(box2X, boxY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(6, 95, 70);
      doc.text('SALDO A FAVOR', box2X + 3.5, boxY + 4.5);
      doc.setFontSize(10);
      doc.setTextColor(4, 120, 87);
      doc.text(`US$ ${creditBalance.toFixed(2).replace('.', ',')}`, box2X + 3.5, boxY + 9.5);
      if (settings.exchangeRate > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(6, 95, 70);
        const bsCredit = calculateBS(creditBalance, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 });
        doc.text(`≈ ${bsCredit} Bs.`, box2X + 3.5, boxY + 13.5);
      }

      // Caja 3: Neto Pendiente
      const netPending = Math.max(0, totalPending - creditBalance);
      const box3X = box2X + boxWidth + 3;
      doc.setFillColor(15, 23, 42);
      doc.setDrawColor(30, 41, 59);
      doc.roundedRect(box3X, boxY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(251, 146, 60);
      doc.text(`NETO PENDIENTE`, box3X + 3.5, boxY + 4.5);
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(`US$ ${netPending.toFixed(2).replace('.', ',')}`, box3X + 3.5, boxY + 9.5);
      if (settings.exchangeRate > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(203, 213, 225);
        const bsNet = calculateBS(netPending, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 });
        doc.text(`≈ ${bsNet} Bs.`, box3X + 3.5, boxY + 13.5);
      }

      // Tabla de Documentos
      let currentY = 78;
      const drawTableHead = (y: number) => {
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, y, contentWidth, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text('#', margin + 3.5, y + 4.8, { align: 'center' });
        doc.text('DOCUMENTO', margin + 9, y + 4.8);
        doc.text('FECHA', margin + 45, y + 4.8);
        doc.text('ORIGINAL (USD)', margin + 85, y + 4.8, { align: 'right' });
        doc.text('ABONADO', margin + 118, y + 4.8, { align: 'right' });
        doc.text('PENDIENTE (USD)', margin + 150, y + 4.8, { align: 'right' });
        doc.text('PENDIENTE (BS.)', margin + contentWidth - 3, y + 4.8, { align: 'right' });
      };

      drawTableHead(currentY);
      currentY += 7;

      invoices.forEach((inv, idx) => {
        const rowH = 6.8;
        if (currentY + rowH > maxY) {
          doc.addPage();
          doc.setFillColor(15, 23, 42);
          doc.rect(margin, 10, contentWidth, 9, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(255, 255, 255);
          doc.text(`${sanitizeText(company.name)} • ${reportTitle} - ${sanitizeText(entityName)}`, margin + 3, 16);
          currentY = 22;
          drawTableHead(currentY);
          currentY += 7;
        }

        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, currentY, contentWidth, rowH, 'F');
        }

        const balance = (inv.totalUSD || 0) - (inv.paidAmountUSD || 0);
        const invId = inv.id ? `#${inv.id.slice(-6).toUpperCase()}` : '#DOC';
        const invDate = inv.date ? new Date(inv.date).toLocaleDateString('es-VE') : '';
        const bsFormatted = settings.exchangeRate > 0
          ? `${calculateBS(balance, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`
          : '-';

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(String(idx + 1), margin + 3.5, currentY + 4.6, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text(invId, margin + 9, currentY + 4.6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text(invDate, margin + 45, currentY + 4.6);

        doc.text(`US$ ${(inv.totalUSD || 0).toFixed(2)}`, margin + 85, currentY + 4.6, { align: 'right' });
        doc.text(`US$ ${(inv.paidAmountUSD || 0).toFixed(2)}`, margin + 118, currentY + 4.6, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`US$ ${balance.toFixed(2)}`, margin + 150, currentY + 4.6, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(51, 65, 85);
        doc.text(bsFormatted, margin + contentWidth - 3, currentY + 4.6, { align: 'right' });

        doc.setDrawColor(241, 245, 249);
        doc.line(margin, currentY + rowH, margin + contentWidth, currentY + rowH);
        currentY += rowH;
      });

      // Total Final
      if (currentY + 10 > maxY) {
        doc.addPage();
        currentY = 22;
      }

      doc.setFillColor(15, 23, 42);
      doc.rect(margin, currentY, contentWidth, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(249, 115, 22);
      doc.text(`TOTAL PENDIENTE (${invoices.length} DOCUMENTOS)`, margin + 5, currentY + 5.2);

      doc.setTextColor(255, 255, 255);
      doc.text(`US$ ${totalPending.toFixed(2).replace('.', ',')}`, margin + 150, currentY + 5.2, { align: 'right' });

      if (settings.exchangeRate > 0) {
        const totalBsFull = `${calculateBS(totalPending, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.text(totalBsFull, margin + contentWidth - 3, currentY + 5.2, { align: 'right' });
      }

      // Pie de página
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(margin, 287, margin + contentWidth, 287);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Página ${p} de ${totalPages} • D'Danez Gestor Pro - Estado de Cuenta`,
          pageWidth / 2,
          291.5,
          { align: 'center' }
        );
        doc.text(
          `Impreso: ${new Date().toLocaleDateString('es-VE')} ${new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`,
          pageWidth - margin,
          291.5,
          { align: 'right' }
        );
      }

      const pdfBlob = doc.output('blob');
      const pdfDataUri = doc.output('datauristring');
      const fileName = `Estado_Cuenta_${entityName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

      if (action === 'download' && !Capacitor.isNativePlatform()) {
        doc.save(fileName);
        return;
      }

      await downloadOrShareFile({
        fileName,
        title: `${reportTitle} - ${entityName}`,
        blob: pdfBlob,
        dataUrl: pdfDataUri,
        mimeType: 'application/pdf',
        dialogTitle: action === 'share' ? `Compartir ${fileName}` : `Guardar ${fileName}`,
        action,
        preferShare: action === 'share'
      });
    } catch (err) {
      console.error('Error al generar PDF:', err);
      alert('Hubo un error al generar el PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  const reportTitle = type === 'cxc' ? 'ESTADO DE CUENTA (CXC)' : 'ESTADO DE CUENTA (CXP)';
  const entityLabel = type === 'cxc' ? 'CLIENTE' : 'PROVEEDOR';

  return (
    <div className="fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-2 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white">
      <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 print:shadow-none print:rounded-none">
        
        <div className="bg-slate-900 p-3 flex justify-between items-center print:hidden">
           <span className="text-white text-[10px] font-black uppercase tracking-widest">
              {reportTitle}
           </span>
           <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
             <X size={20} />
           </button>
        </div>

        <div 
          ref={reportRef} 
          className="p-6 text-slate-900 bg-white font-sans text-xs leading-normal print-content"
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

           <div className="text-center space-y-1 mb-4 pb-3 border-b-2 border-slate-900">
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">{company.name}</h2>
              <div className="inline-block bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded">
                {reportTitle}
              </div>
              <div className="text-xs font-semibold text-slate-600 space-y-0.5 mt-2">
                <p>RIF: <span className="font-bold text-slate-900">{company.rif || 'N/A'}</span></p>
                {company.phone && <p>TELF: <span className="font-bold text-slate-900">{company.phone}</span></p>}
                {company.address && <p className="uppercase text-[11px] text-slate-500 leading-tight">{company.address}</p>}
              </div>
           </div>

           <div className="bg-slate-50 p-3.5 rounded-xl mb-4 border border-slate-200">
              <div className="flex justify-between items-baseline mb-1.5">
                 <span className="font-black uppercase text-[10px] text-slate-500">{entityLabel}:</span>
                 <span className="uppercase font-black text-sm text-slate-900 text-right">{entityName}</span>
              </div>
              <div className="flex justify-between items-baseline">
                 <span className="font-black uppercase text-[10px] text-slate-500">FECHA REPORTE:</span>
                 <span className="font-bold text-xs text-slate-700 text-right">{new Date().toLocaleDateString('es-VE')}</span>
              </div>
           </div>

           <div className="mb-4">
              <div className="flex justify-between font-black text-[11px] uppercase border-b-2 border-slate-900 pb-1.5 mb-2 text-slate-700">
                 <span className="w-[20%]">FECHA</span>
                 <span className="w-[30%]">DOCUMENTO</span>
                 <span className="w-[25%] text-right">TOTAL</span>
                 <span className="w-[25%] text-right">SALDO</span>
              </div>

              <div className="space-y-1.5">
                 {invoices.length > 0 ? invoices.map((inv, i) => {
                   const balance = (inv.totalUSD || 0) - (inv.paidAmountUSD || 0);
                   return (
                     <div key={i} className="flex justify-between text-xs items-center border-b border-slate-200 pb-1.5">
                        <span className="w-[20%] font-semibold text-slate-600">{new Date(inv.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })}</span>
                        <span className="w-[30%] font-black text-slate-900">#{inv.id.slice(-6).toUpperCase()}</span>
                        <span className="w-[25%] text-right text-slate-500 font-medium">${inv.totalUSD.toFixed(2)}</span>
                        <span className="w-[25%] text-right font-black text-rose-600">${balance.toFixed(2)}</span>
                     </div>
                   );
                 }) : (
                   <div className="text-center py-4 text-slate-400 font-bold uppercase text-xs">Sin facturas pendientes</div>
                 )}
              </div>
           </div>

           <div className="border-t-2 border-slate-900 pt-3.5 space-y-2 mb-5">
              <div className="flex justify-between text-base font-black text-slate-900">
                 <span className="uppercase">TOTAL DEUDA</span>
                 <span className="text-right">US$ {totalPending.toFixed(2).replace('.', ',')}</span>
              </div>

              {creditBalance > 0 && (
                <div className="flex justify-between text-xs font-bold text-emerald-700 border-t border-slate-200 pt-1.5">
                   <span className="uppercase">SALDO A FAVOR</span>
                   <span className="text-right">- US$ {creditBalance.toFixed(2).replace('.', ',')}</span>
                </div>
              )}

              <div className="flex justify-between text-lg font-black border-t-2 border-slate-900 pt-2 mt-2 bg-slate-100 p-3 rounded-xl text-slate-900">
                 <span className="uppercase tracking-tight">NETO A {type === 'cxc' ? 'COBRAR' : 'PAGAR'}</span>
                 <span className="text-right text-orange-600">US$ {Math.max(0, totalPending - creditBalance).toFixed(2).replace('.', ',')}</span>
              </div>
           </div>

           <div className="border-t border-slate-300 pt-4 mb-4">
              <div className="border border-slate-300 rounded-xl p-3.5 text-center bg-slate-50">
                 <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 text-slate-500">Datos para Pago Móvil</p>
                 <div className="space-y-1">
                    <p className="uppercase font-black text-sm text-slate-900">{company.bank || 'BANCO DE VENEZUELA'}</p>
                    <p className="font-black text-base text-slate-900">{company.mobilePhone || 'N/A'}</p>
                    <p className="font-bold text-xs text-slate-700">V-{(company.dni || '').replace(/\D/g, '')}</p>
                    {company.accountNumber && (
                      <div className="pt-2 border-t border-slate-200 mt-2">
                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 mb-0.5">Cuenta Bancaria:</p>
                        <p className="font-bold text-xs tracking-wider break-all text-slate-800">{company.accountNumber}</p>
                      </div>
                    )}
                 </div>
              </div>
           </div>

           <div className="text-center font-bold text-[10px] uppercase py-3 border-t border-slate-200 text-slate-400">
              *** FIN DEL REPORTE • GESTOR PRO ***
           </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col gap-2.5 print:hidden">
           <div className="flex gap-2">
             <button 
               onClick={() => handleExportPDF('download')} 
               disabled={isGenerating}
               className="flex-1 bg-slate-900 hover:bg-black text-white py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
             >
                <Download size={18} className="text-orange-500" />
                <span>{isGenerating ? 'Generando...' : 'Descargar PDF'}</span>
             </button>

             <button 
               onClick={() => handleExportPDF('share')} 
               disabled={isGenerating}
               className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
             >
                <Share2 size={18} />
                <span>Compartir PDF</span>
             </button>
           </div>

           {type === 'cxc' && (
             <button 
               onClick={handleSendWhatsApp} 
               disabled={isGenerating}
               className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
             >
                <MessageCircle size={18} />
                <span>Enviar por WhatsApp {entityPhone ? `(${entityPhone})` : ''}</span>
             </button>
           )}

           <div className="flex gap-2">
              <button 
                onClick={handleDownloadImage} 
                disabled={isGenerating}
                className="flex-1 bg-slate-800 hover:bg-slate-900 text-white py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                 <FileText size={15} /> Imagen PNG
              </button>
              <button onClick={handlePrint} className="flex-1 bg-slate-700 hover:bg-slate-800 text-white py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer">
                 <Printer size={15} /> Imprimir
              </button>
              <button onClick={onClose} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer">
                 Cerrar
              </button>
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
