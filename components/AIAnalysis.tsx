
import React, { useState } from 'react';
import { Sparkles, BrainCircuit, Loader2, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react';
import { analyzeFinancialData } from '../geminiService';
import Markdown from 'react-markdown';
import { AppSettings, Movement, Sale } from '../types';

interface Props {
  sales: Sale[];
  purchases: any[];
  expenses: any[];
  products: any[];
  settings: AppSettings;
  movements: Movement[];
}

const AIAnalysis: React.FC<Props> = ({ sales, purchases, expenses, products, settings, movements }) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  const providerName = settings.aiProvider === 'deepseek' ? 'DeepSeek' : settings.aiProvider === 'openai' ? 'OpenAI' : 'Gemini';
  const providerColor = settings.aiProvider === 'deepseek' ? 'text-slate-200' : settings.aiProvider === 'openai' ? 'text-emerald-400' : 'text-amber-400';
  const buttonGradient = settings.aiProvider === 'deepseek' ? 'from-slate-700 to-slate-900' : settings.aiProvider === 'openai' ? 'from-emerald-500 to-teal-600' : 'from-indigo-500 to-purple-600';

  const handleAnalyze = async () => {
    setLoading(true);
    
    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);

    const filteredSales = sales.filter(s => {
      const d = new Date(s.date);
      return d >= start && d <= end;
    });

    const filteredMovements = movements.filter(m => {
      const d = new Date(m.date);
      return d >= start && d <= end;
    });

    const filteredPurchases = purchases.filter(p => {
      const d = new Date(p.date);
      return d >= start && d <= end;
    });

    const filteredExpenses = expenses.filter(e => {
      const d = new Date(e.date);
      return d >= start && d <= end;
    });
    
    const data = {
      periodo: { desde: fromDate, hasta: toDate },
      resumen: {
        totalVentas: filteredSales.filter(s => !s.type || s.type === 'venta').length,
        totalObsequios: filteredSales.filter(s => s.type === 'obsequio').length,
        totalConsumos: filteredSales.filter(s => s.type === 'consumo').length,
        totalMerma: filteredMovements.filter(m => m.type === 'merma').length,
        totalCompras: filteredPurchases.length,
        totalGastosOperativos: filteredExpenses.length,
        totalProductos: products.length,
        ingresosUSD: filteredSales.filter(s => !s.type || s.type === 'venta').reduce((sum, s) => sum + s.totalUSD, 0),
        obsequiosUSD: filteredSales.filter(s => s.type === 'obsequio').reduce((sum, s) => sum + s.totalUSD, 0),
        consumosUSD: filteredSales.filter(s => s.type === 'consumo').reduce((sum, s) => sum + s.totalUSD, 0),
        mermaUSD: filteredMovements.filter(m => m.type === 'merma').reduce((sum, m) => {
          const product = products.find(p => p.id === m.productId);
          return sum + (Math.abs(m.quantity) * (product?.costUSD || 0));
        }, 0),
        costoInversionUSD: filteredPurchases.reduce((sum, p) => sum + p.totalUSD, 0),
        gastosOperativosUSD: filteredExpenses.reduce((sum, e) => sum + e.amountUSD, 0),
      },
      ventasPeriodo: filteredSales.filter(s => !s.type || s.type === 'venta').map(s => ({ fecha: s.date, total: s.totalUSD, cliente: s.customerName })),
      obsequiosPeriodo: filteredSales.filter(s => s.type === 'obsequio').map(s => ({ fecha: s.date, total: s.totalUSD, cliente: s.customerName })),
      consumosPeriodo: filteredSales.filter(s => s.type === 'consumo').map(s => ({ fecha: s.date, total: s.totalUSD, cliente: s.customerName })),
      mermaPeriodo: filteredMovements.filter(m => m.type === 'merma').map(m => ({ fecha: m.date, producto: m.productName, cant: m.quantity })),
      gastosPeriodo: filteredExpenses.map(e => ({ fecha: e.date, desc: e.description, total: e.amountUSD })),
      productosBajoStock: products.filter(p => p.stock <= (p.minStock || 5)).map(p => ({ nombre: p.name, stock: p.stock }))
    };

    const result = await analyzeFinancialData(data);
    setAnalysis(result || "No se pudo generar el análisis.");
    setLoading(false);
  };

  return (
    <div className="bg-[#1e293b] p-8 rounded-3xl border border-slate-700 shadow-xl space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className={`${providerColor} animate-pulse`} /> Análisis Inteligente {providerName}
        </h2>
        {!analysis && !loading && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-[#0f172a] p-2 rounded-xl border border-slate-700">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Desde:</span>
              <input 
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-transparent text-[10px] font-bold text-white outline-none"
              />
            </div>
            <div className="flex items-center gap-2 bg-[#0f172a] p-2 rounded-xl border border-slate-700">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Hasta:</span>
              <input 
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-transparent text-[10px] font-bold text-white outline-none"
              />
            </div>
            <button 
              onClick={handleAnalyze}
              className={`bg-gradient-to-r ${buttonGradient} hover:opacity-90 text-white text-xs font-bold py-2 px-6 rounded-full flex items-center gap-2 transition-all transform hover:scale-105 shadow-lg shadow-indigo-500/20`}
            >
              <BrainCircuit size={16} /> Analizar Periodo
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 className="text-indigo-500 animate-spin" size={48} />
          <p className="text-slate-400 animate-pulse">{providerName} está analizando tus finanzas...</p>
        </div>
      )}

      {analysis && !loading && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
          <div className="prose prose-invert max-w-none text-slate-300 text-sm leading-relaxed">
            <Markdown>{analysis}</Markdown>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setAnalysis(null)}
              className="text-xs text-slate-500 hover:text-slate-300 underline"
            >
              Nuevo análisis
            </button>
            
            {(analysis.includes("configura tu llave") || analysis.includes("no está configurada")) && (
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                ⚠️ VE A LA PESTAÑA DE "AJUSTES" PARA CONFIGURAR TU LLAVE.
              </p>
            )}

            {(analysis.includes("alta demanda") || analysis.includes("saturalo") || analysis.includes("saturado")) && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                  ⚠️ EL SERVICIO ESTÁ SATURADO TEMPORALMENTE.
                </p>
                <button 
                  onClick={handleAnalyze}
                  className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold py-1 px-3 rounded-full transition-all w-fit"
                >
                  Reintentar ahora
                </button>
              </div>
            )}

            {analysis.includes("Insufficient Balance") && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">
                  ⚠️ SALDO INSUFICIENTE EN TU CUENTA DE DEEPSEEK.
                </p>
                <a 
                  href="https://platform.deepseek.com/top_up" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold py-1 px-3 rounded-full transition-all w-fit text-center"
                >
                  Recargar Saldo
                </a>
              </div>
            )}
            
            {analysis.includes("No se ha detectado la llave") && (
              <button 
                onClick={async () => {
                  // Try to find aistudio in window or parent (for mobile/iframe issues)
                  const aiStudio = (window as any).aistudio || (window.parent as any)?.aistudio;
                  
                  if (aiStudio && typeof aiStudio.openSelectKey === 'function') {
                    try {
                      await aiStudio.openSelectKey();
                      // After opening, we assume success as per guidelines and reload
                      setTimeout(() => window.location.reload(), 1000);
                    } catch (e) {
                      console.error("Error calling openSelectKey:", e);
                      alert("Error al abrir el configurador de llaves.");
                    }
                  } else {
                    console.error("AI Studio API not found in window.aistudio or parent.aistudio");
                    alert("La herramienta de configuración no se detectó automáticamente. Por favor, asegúrate de estar usando el entorno de AI Studio o intenta recargar la página.");
                  }
                }}
                className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold py-1 px-3 rounded-full transition-all"
              >
                Configurar Llave Manualmente
              </button>
            )}
          </div>
        </div>
      )}

      {!analysis && !loading && (
        <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
          <div className="bg-[#0f172a] p-4 rounded-full">
            <TrendingUp className="text-slate-600" size={32} />
          </div>
          <p className="text-slate-400 text-sm max-w-xs">
            Obtén una visión profunda de tu negocio. {providerName} analizará tus ventas, stock y gastos para darte consejos estratégicos.
          </p>
        </div>
      )}
    </div>
  );
};

export default AIAnalysis;
