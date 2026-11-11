
import React, { useRef, useState, useMemo } from 'react';
import { X, FileText, LayoutList, List, Download, Share2, Printer } from 'lucide-react';
import { CompanyInfo, AppSettings, Sale, Purchase } from '../types';
import { jsPDF } from 'jspdf';
import { calculateBS } from '../utils';
import { downloadOrShareFile } from '../downloadHelper';
import { Capacitor } from '@capacitor/core';

interface GroupedData {
  id: string;
  name: string;
  totalPending: number;
  invoices: (Sale | Purchase)[];
  creditBalance: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: GroupedData[];
  company: CompanyInfo;
  settings: AppSettings;
  type: 'cxc' | 'cxp';
}

type SortOption = 'alphabetical' | 'balance-high' | 'balance-low';
type ViewMode = 'summary' | 'detailed';

export const GlobalAccountsReportModal: React.FC<Props> = ({ 
  isOpen, onClose, data, company, settings, type 
}) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('alphabetical');
  const [viewMode, setViewMode] = useState<ViewMode>('summary');

  const sortedData = useMemo(() => {
    const result = [...data];
    if (sortOption === 'alphabetical') {
      return result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOption === 'balance-high') {
      return result.sort((a, b) => b.totalPending - a.totalPending);
    } else if (sortOption === 'balance-low') {
      return result.sort((a, b) => a.totalPending - b.totalPending);
    }
    return result;
  }, [data, sortOption]);

  const totalOutstanding = useMemo(() => {
    return data.reduce((sum, item) => sum + item.totalPending, 0);
  }, [data]);

  const totalCredit = useMemo(() => {
    return data.reduce((sum, item) => sum + item.creditBalance, 0);
  }, [data]);

  const netTotal = Math.max(0, totalOutstanding - totalCredit);

  if (!isOpen) return null;

  const sanitizeText = (txt: string) => {
    if (!txt) return '';
    return txt.replace(/[\u{1F300}-\u{1F9FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}]/gu, '').trim();
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

      const sortName = sortOption === 'alphabetical' 
        ? 'Alfabético (A-Z)' 
        : sortOption === 'balance-high' 
        ? 'Mayor Saldo' 
        : 'Menor Saldo';

      const drawSubsequentPageHeader = () => {
        doc.setFillColor(15, 23, 42);
        doc.rect(margin, 10, contentWidth, 9, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text(`${sanitizeText(company.name) || "D'DANEZ DISTRIBUCIONES"} • ${reportTitle}`, margin + 3, 16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(203, 213, 225);
        const rateText = settings.exchangeRate > 0 ? `Tasa: ${settings.exchangeRate.toFixed(2)} Bs/$` : '';
        doc.text(`${new Date().toLocaleDateString('es-VE')}  ${rateText}`, pageWidth - margin - 3, 16, { align: 'right' });
      };

      const drawTableHeader = (y: number) => {
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, y, contentWidth, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text('#', margin + 3.5, y + 4.8, { align: 'center' });
        doc.text(type === 'cxc' ? 'CLIENTE / RAZÓN SOCIAL' : 'PROVEEDOR / RAZÓN SOCIAL', margin + 9, y + 4.8);
        doc.text('SALDO FAVOR', margin + 118, y + 4.8, { align: 'right' });
        doc.text('PENDIENTE (USD)', margin + 145, y + 4.8, { align: 'right' });
        doc.text('PENDIENTE (BS.)', margin + contentWidth - 3, y + 4.8, { align: 'right' });
      };

      // Banner Principal Página 1
      doc.setFillColor(15, 23, 42);
      doc.rect(margin, 14, contentWidth, 24, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text(sanitizeText(company.name) || "D'DANEZ DISTRIBUCIONES", margin + 5, 23);

      doc.setFontSize(9.5);
      doc.setTextColor(249, 115, 22);
      doc.text(reportTitle, margin + 5, 31);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(203, 213, 225);
      doc.text(`Fecha: ${new Date().toLocaleDateString('es-VE')}`, pageWidth - margin - 5, 20.5, { align: 'right' });
      const rifRate = `RIF: ${company.rif || 'N/A'} • Tasa: ${settings.exchangeRate > 0 ? settings.exchangeRate.toFixed(2) + ' Bs/$' : 'N/A'}`;
      doc.text(rifRate, pageWidth - margin - 5, 26, { align: 'right' });
      doc.text(`Modo: ${viewMode === 'summary' ? 'Resumen' : 'Detallado'} • Orden: ${sortName}`, pageWidth - margin - 5, 31.5, { align: 'right' });

      // Cajas de Totales KPI
      const boxWidth = (contentWidth - 6) / 3;
      const boxHeight = 16;
      const boxY = 41;

      // Caja 1: Total Pendiente
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(margin, boxY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL PENDIENTE', margin + 3.5, boxY + 4.5);
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`US$ ${totalOutstanding.toFixed(2).replace('.', ',')}`, margin + 3.5, boxY + 9.5);
      if (settings.exchangeRate > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(71, 85, 105);
        const bsTotal = calculateBS(totalOutstanding, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 });
        doc.text(`≈ ${bsTotal} Bs.`, margin + 3.5, boxY + 13.5);
      }

      // Caja 2: Total Saldo a Favor
      const box2X = margin + boxWidth + 3;
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(110, 231, 183);
      doc.roundedRect(box2X, boxY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(6, 95, 70);
      doc.text('TOTAL SALDO A FAVOR', box2X + 3.5, boxY + 4.5);
      doc.setFontSize(10);
      doc.setTextColor(4, 120, 87);
      doc.text(`US$ ${totalCredit.toFixed(2).replace('.', ',')}`, box2X + 3.5, boxY + 9.5);
      if (settings.exchangeRate > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(6, 95, 70);
        const bsCredit = calculateBS(totalCredit, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 });
        doc.text(`≈ ${bsCredit} Bs.`, box2X + 3.5, boxY + 13.5);
      }

      // Caja 3: Neto Real
      const box3X = box2X + boxWidth + 3;
      doc.setFillColor(15, 23, 42);
      doc.setDrawColor(30, 41, 59);
      doc.roundedRect(box3X, boxY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(251, 146, 60);
      doc.text(`NETO POR ${type === 'cxc' ? 'COBRAR' : 'PAGAR'}`, box3X + 3.5, boxY + 4.5);
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(`US$ ${netTotal.toFixed(2).replace('.', ',')}`, box3X + 3.5, boxY + 9.5);
      if (settings.exchangeRate > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(203, 213, 225);
        const bsNet = calculateBS(netTotal, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 });
        doc.text(`≈ ${bsNet} Bs.`, box3X + 3.5, boxY + 13.5);
      }

      // Tabla de Datos
      let currentY = 60;
      drawTableHeader(currentY);
      currentY += 7;

      const activeList = sortedData.filter(item => item.totalPending > 0);

      if (activeList.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(148, 163, 184);
        doc.text('No hay cuentas pendientes por cobrar registradas.', pageWidth / 2, currentY + 12, { align: 'center' });
      }

      activeList.forEach((group, idx) => {
        const clientName = sanitizeText(group.name);
        const bsFormatted = settings.exchangeRate > 0
          ? `${calculateBS(group.totalPending, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`
          : '-';

        if (viewMode === 'summary') {
          const rowH = 6.8;
          if (currentY + rowH > maxY) {
            doc.addPage();
            drawSubsequentPageHeader();
            currentY = 22;
            drawTableHeader(currentY);
            currentY += 7;
          }

          if (idx % 2 === 1) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, currentY, contentWidth, rowH, 'F');
          }

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(100, 116, 139);
          doc.text(String(idx + 1), margin + 3.5, currentY + 4.6, { align: 'center' });

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(15, 23, 42);
          const truncatedName = doc.splitTextToSize(clientName, 80)[0] || clientName;
          doc.text(truncatedName, margin + 9, currentY + 4.6);

          if (group.creditBalance > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(5, 150, 105);
            doc.text(`-US$ ${group.creditBalance.toFixed(2)}`, margin + 118, currentY + 4.6, { align: 'right' });
          } else {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text('-', margin + 118, currentY + 4.6, { align: 'right' });
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.8);
          doc.setTextColor(15, 23, 42);
          doc.text(`US$ ${group.totalPending.toFixed(2)}`, margin + 145, currentY + 4.6, { align: 'right' });

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(51, 65, 85);
          doc.text(bsFormatted, margin + contentWidth - 3, currentY + 4.6, { align: 'right' });

          doc.setDrawColor(241, 245, 249);
          doc.line(margin, currentY + rowH, margin + contentWidth, currentY + rowH);
          currentY += rowH;
        } else {
          // MODO DETALLADO
          const headerRowH = 6.5;

          if (currentY + 12 > maxY) {
            doc.addPage();
            drawSubsequentPageHeader();
            currentY = 22;
            drawTableHeader(currentY);
            currentY += 7;
          }

          doc.setFillColor(241, 245, 249);
          doc.rect(margin, currentY, contentWidth, headerRowH, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(71, 85, 105);
          doc.text(String(idx + 1), margin + 3.5, currentY + 4.4, { align: 'center' });

          doc.setTextColor(15, 23, 42);
          doc.setFontSize(8);
          doc.text(clientName, margin + 9, currentY + 4.4);

          if (group.creditBalance > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(5, 150, 105);
            doc.text(`Favor: -US$ ${group.creditBalance.toFixed(2)}`, margin + 118, currentY + 4.4, { align: 'right' });
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(15, 23, 42);
          doc.text(`US$ ${group.totalPending.toFixed(2)}`, margin + 145, currentY + 4.4, { align: 'right' });

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(51, 65, 85);
          doc.text(bsFormatted, margin + contentWidth - 3, currentY + 4.4, { align: 'right' });

          currentY += headerRowH;

          group.invoices.forEach((inv) => {
            if (currentY + 5 > maxY) {
              doc.addPage();
              drawSubsequentPageHeader();
              currentY = 22;
              drawTableHeader(currentY);
              currentY += 7;
            }

            const balance = (inv.totalUSD || 0) - (inv.paidAmountUSD || 0);
            const invId = inv.id ? `#${inv.id.slice(-6).toUpperCase()}` : '#DOC';
            const invDate = inv.date ? new Date(inv.date).toLocaleDateString('es-VE') : '';
            const invBs = settings.exchangeRate > 0
              ? `${calculateBS(balance, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`
              : '-';

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.8);
            doc.setTextColor(100, 116, 139);
            doc.text(`• ${invId}  (${invDate})`, margin + 14, currentY + 3.6);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.2);
            doc.setTextColor(71, 85, 105);
            doc.text(`US$ ${balance.toFixed(2)}`, margin + 145, currentY + 3.6, { align: 'right' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.8);
            doc.setTextColor(100, 116, 139);
            doc.text(invBs, margin + contentWidth - 3, currentY + 3.6, { align: 'right' });

            doc.setDrawColor(241, 245, 249);
            doc.line(margin + 12, currentY + 4.8, margin + contentWidth, currentY + 4.8);
            currentY += 4.8;
          });

          currentY += 1.5;
        }
      });

      // Total General Final
      if (activeList.length > 0) {
        if (currentY + 10 > maxY) {
          doc.addPage();
          drawSubsequentPageHeader();
          currentY = 22;
        }

        doc.setFillColor(15, 23, 42);
        doc.rect(margin, currentY, contentWidth, 8, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        doc.setTextColor(249, 115, 22);
        doc.text(`TOTAL GENERAL (${activeList.length} ${type === 'cxc' ? 'CLIENTES' : 'PROVEEDORES'})`, margin + 5, currentY + 5.2);

        doc.setTextColor(255, 255, 255);
        doc.text(`US$ ${totalOutstanding.toFixed(2).replace('.', ',')}`, margin + 145, currentY + 5.2, { align: 'right' });

        if (settings.exchangeRate > 0) {
          const totalBsFull = `${calculateBS(totalOutstanding, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.2);
          doc.text(totalBsFull, margin + contentWidth - 3, currentY + 5.2, { align: 'right' });
        }
      }

      // Numeración de páginas
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
          `Página ${p} de ${totalPages} • D'Danez Gestor Pro - Reporte General de ${type === 'cxc' ? 'Cuentas por Cobrar' : 'Cuentas por Pagar'}`,
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
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `Reporte_${type.toUpperCase()}_${viewMode === 'summary' ? 'Resumen' : 'Detallado'}_${dateStr}.pdf`;

      if (action === 'download' && !Capacitor.isNativePlatform()) {
        doc.save(fileName);
        return;
      }

      await downloadOrShareFile({
        fileName,
        title: `${reportTitle} (${viewMode === 'summary' ? 'Resumen' : 'Detallado'})`,
        blob: pdfBlob,
        dataUrl: pdfDataUri,
        mimeType: 'application/pdf',
        dialogTitle: action === 'share' ? `Compartir ${fileName}` : `Guardar ${fileName}`,
        action,
        preferShare: action === 'share'
      });
    } catch (err) {
      console.error('Error al generar PDF:', err);
      alert('Hubo un inconveniente al generar el PDF del reporte. Intente de nuevo.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const reportTitle = type === 'cxc' ? 'CUENTAS POR COBRAR GENERAL' : 'CUENTAS POR PAGAR GENERAL';

  return (
    <div className="fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl bg-white rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        
        {/* Header Controls */}
        <div className="bg-slate-900 p-4 flex flex-col gap-3">
           <div className="flex justify-between items-center">
             <span className="text-white text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <FileText size={18} className="text-orange-500" />
                {reportTitle}
             </span>
             <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
               <X size={22} />
             </button>
           </div>

           <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Modo de Vista</label>
                <div className="flex bg-slate-800 p-1 rounded-xl">
                  <button 
                    onClick={() => setViewMode('summary')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'summary' ? 'bg-orange-500 text-white' : 'text-slate-400'}`}
                  >
                    <LayoutList size={14} /> Resumen
                  </button>
                  <button 
                    onClick={() => setViewMode('detailed')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'detailed' ? 'bg-orange-500 text-white' : 'text-slate-400'}`}
                  >
                    <List size={14} /> Detallado
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Ordenar por</label>
                <select 
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                  className="w-full bg-slate-800 text-white text-[10px] font-black uppercase p-2.5 rounded-xl border border-slate-700 outline-none appearance-none cursor-pointer"
                >
                  <option value="alphabetical">Alfabeto (A-Z)</option>
                  <option value="balance-high">Saldo (Mayor a Menor)</option>
                  <option value="balance-low">Saldo (Menor a Mayor)</option>
                </select>
              </div>
           </div>
        </div>

        {/* Report Preview & Capture Container */}
        <div className="max-h-[62vh] overflow-y-auto overflow-x-auto bg-slate-200/90 p-2 sm:p-4 flex justify-start md:justify-center">
          <div 
            ref={reportRef} 
            className="p-8 text-slate-900 bg-white font-sans w-[740px] min-w-[740px] leading-normal shadow-md"
          >
             {/* Company Header */}
             <div className="text-center space-y-2 mb-6 pb-4 border-b-2 border-slate-900">
                {settings.showLogoOnTicket && company.logo && (
                  <div className="flex justify-center mb-2">
                    <img 
                      src={company.logo} 
                      alt="Logo" 
                      className="h-14 max-h-16 w-auto object-contain block mx-auto" 
                    />
                  </div>
                )}
                <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">{company.name}</h2>
                <div className="inline-block bg-orange-600 text-white text-xs font-black uppercase tracking-widest px-3 py-1 rounded-md">
                  {reportTitle}
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-xs font-bold text-slate-600 pt-2 border-t border-slate-200 mt-2">
                  <div>RIF: <span className="text-slate-900 font-extrabold">{company.rif || 'N/A'}</span></div>
                  <div>FECHA: <span className="text-slate-900 font-extrabold">{new Date().toLocaleDateString('es-VE')}</span></div>
                  <div>TASA: <span className="text-slate-900 font-extrabold">{settings.exchangeRate > 0 ? `${settings.exchangeRate.toFixed(2)} Bs/$` : 'N/A'}</span></div>
                </div>
             </div>

             {/* Totals Summary Cards */}
             <div className="grid grid-cols-2 gap-4 mb-6">
               <div className="bg-slate-50 p-4 border-2 border-slate-900 rounded-xl shadow-sm">
                 <p className="text-xs font-black uppercase text-slate-600 tracking-wider mb-1">Total Pendiente General</p>
                 <p className="text-2xl font-black text-slate-900">US$ {totalOutstanding.toFixed(2).replace('.', ',')}</p>
                 {settings.exchangeRate > 0 && (
                   <p className="text-xs font-bold text-slate-700 mt-0.5">
                     ≈ {calculateBS(totalOutstanding, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
                   </p>
                 )}
               </div>

               <div className="bg-emerald-50 p-4 border-2 border-emerald-700 rounded-xl shadow-sm">
                 <p className="text-xs font-black uppercase text-emerald-800 tracking-wider mb-1">Total Saldo a Favor</p>
                 <p className="text-2xl font-black text-emerald-700">US$ {totalCredit.toFixed(2).replace('.', ',')}</p>
                 {settings.exchangeRate > 0 && (
                   <p className="text-xs font-bold text-emerald-800 mt-0.5">
                     ≈ {calculateBS(totalCredit, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
                   </p>
                 )}
               </div>
             </div>

             {/* Net Total Highlight Bar */}
             <div className="bg-slate-900 text-white px-5 py-3.5 rounded-xl flex justify-between items-center mb-6 shadow-md">
                <span className="text-xs font-black uppercase tracking-widest text-orange-400">
                  NETO REAL POR {type === 'cxc' ? 'COBRAR' : 'PAGAR'}:
                </span>
                <div className="text-right">
                   <span className="text-xl font-black tracking-tight text-white">
                     US$ {netTotal.toFixed(2).replace('.', ',')}
                   </span>
                   {settings.exchangeRate > 0 && (
                     <span className="block text-[11px] font-bold text-slate-300">
                       {calculateBS(netTotal, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
                     </span>
                   )}
                </div>
             </div>

             {/* Table Header */}
             <div className="grid grid-cols-12 bg-slate-100 text-slate-900 font-black text-xs uppercase px-4 py-2.5 rounded-lg border-b-2 border-slate-900 mb-3">
                <span className="col-span-7">CLIENTE / ENTIDAD {viewMode === 'detailed' && 'Y DOCUMENTOS'}</span>
                <span className="col-span-5 text-right">MONTO PENDIENTE</span>
             </div>

             {/* List of Entities */}
             <div className="space-y-3">
                {sortedData.filter(item => item.totalPending > 0).map((group, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-xl p-3 bg-white hover:bg-slate-50/50 transition-colors">
                    <div className="grid grid-cols-12 items-baseline">
                      <div className="col-span-7">
                        <span className="font-black text-sm uppercase text-slate-900 tracking-tight">{group.name}</span>
                        {group.creditBalance > 0 && (
                          <div className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            Saldo a favor: -US$ {group.creditBalance.toFixed(2)}
                          </div>
                        )}
                      </div>
                      
                      <div className="col-span-5 text-right">
                        <span className="font-black text-base text-slate-900">US$ {group.totalPending.toFixed(2)}</span>
                        {settings.exchangeRate > 0 && (
                          <span className="block text-xs font-semibold text-slate-600">
                            {calculateBS(group.totalPending, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Detailed Invoice Breakdown */}
                    {viewMode === 'detailed' && group.invoices.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5 pl-3">
                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">
                          Documentos pendientes ({group.invoices.length}):
                        </div>
                        {group.invoices.map((inv, invIdx) => {
                          const balance = (inv.totalUSD || 0) - (inv.paidAmountUSD || 0);
                          return (
                            <div key={invIdx} className="flex justify-between items-center text-xs font-semibold text-slate-700 bg-slate-50 px-2.5 py-1 rounded border border-slate-200/60">
                              <span className="font-bold">
                                #{inv.id.slice(-6).toUpperCase()} • {new Date(inv.date).toLocaleDateString('es-VE')}
                              </span>
                              <span className="font-extrabold text-slate-900">
                                US$ {balance.toFixed(2)}
                                {settings.exchangeRate > 0 && (
                                  <span className="text-[11px] font-normal text-slate-500 ml-1.5">
                                    ({calculateBS(balance, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.)
                                  </span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
             </div>

             {/* Footer Notice */}
             <div className="mt-8 pt-4 border-t-2 border-slate-900 text-center space-y-1">
                <p className="text-xs font-extrabold uppercase text-slate-600">
                  GESTOR PRO • REPORTE GENERADO EL {new Date().toLocaleDateString('es-VE')} A LAS {new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-[10px] text-slate-400 font-semibold">
                  *** Documento de control interno administrativo ***
                </p>
             </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-2.5">
           <button 
             onClick={() => handleExportPDF('download')} 
             disabled={isGenerating}
             className="flex-1 min-w-[140px] bg-slate-900 hover:bg-black text-white py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
           >
              <Download size={18} className="text-orange-500" />
              <span>{isGenerating ? 'Generando...' : 'Descargar PDF'}</span>
           </button>

           <button 
             onClick={() => handleExportPDF('share')} 
             disabled={isGenerating}
             className="flex-1 min-w-[140px] bg-orange-600 hover:bg-orange-700 text-white py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
           >
              <Share2 size={18} />
              <span>Compartir / Enviar</span>
           </button>
           
           <button 
             onClick={handlePrint} 
             disabled={isGenerating}
             className="w-auto px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer"
             title="Imprimir"
           >
             <Printer size={18} />
             <span className="hidden sm:inline">Imprimir</span>
           </button>

           <button onClick={onClose} className="w-auto px-5 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer">
             Cerrar
           </button>
        </div>
      </div>
    </div>
  );
};

