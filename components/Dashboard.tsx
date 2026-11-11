
import React, { useMemo, useState } from 'react';
import { calculateBS } from '../utils';
import { 
  TrendingUp, 
  CreditCard, 
  AlertTriangle,
  ShoppingCart,
  Tag,
  HandCoins,
  DollarSign,
  PiggyBank,
  Trash2,
  Wallet,
  Calendar,
  ArrowRight
} from 'lucide-react';
import { Sale, Purchase, Product, AppSettings, Expense, Movement } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
  products: Product[];
  settings: AppSettings;
  movements: Movement[];
}

const Dashboard: React.FC<Props> = ({ sales, purchases, expenses, products, settings, movements }) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  
  // Memoizar estadísticas para rendimiento
  const stats = useMemo(() => {
    const filterByRange = (items: any[]) => items.filter((item: { date: string }) => {
      const itemDate = item.date.split('T')[0];
      return itemDate >= fromDate && itemDate <= toDate;
    });

    const salesInRange = filterByRange(sales);
    const purchasesInRange = filterByRange(purchases);
    const expensesInRange = filterByRange(expenses);
    const movementsInRange = filterByRange(movements || []);
    
    const grossSales = salesInRange.reduce((sum, s) => sum + (s.totalUSD || 0), 0);
    const grossSalesBS = salesInRange.reduce((sum, s) => sum + calculateBS(s.totalUSD || 0, s.status, s.exchangeRate, settings.exchangeRate), 0);
    
    const cashSales = salesInRange.reduce((sum, s) => sum + (s.paidAmountUSD || 0), 0);
    const cashSalesBS = salesInRange.reduce((sum, s) => sum + calculateBS(s.paidAmountUSD || 0, 'paid', s.exchangeRate, settings.exchangeRate), 0);
    
    const creditSales = grossSales - cashSales;
    const creditSalesBS = grossSalesBS - cashSalesBS;
    
    const collections = cashSales; 
    const collectionsBS = cashSalesBS;
    
    const totalPurchases = purchasesInRange.reduce((sum, p) => sum + (p.totalUSD || 0), 0);
    const totalPurchasesBS = purchasesInRange.reduce((sum, p) => sum + calculateBS(p.totalUSD || 0, p.status, p.exchangeRate, settings.exchangeRate), 0);
    
    const totalExpenses = expensesInRange.reduce((sum, e) => sum + (e.amountUSD || 0), 0);
    const totalExpensesBS = expensesInRange.reduce((sum, e) => sum + (e.amountBS || (e.amountUSD * (e.exchangeRate || settings.exchangeRate))), 0);
    
    // Calcular Merma en el periodo
    const mermaMovements = movementsInRange.filter(m => m.type === 'merma');
    const mermaTotalUSD = mermaMovements.reduce((sum, m) => {
      const product = products.find(p => p.id === m.productId);
      return sum + (Math.abs(m.quantity) * (product?.costUSD || 0));
    }, 0);
    const mermaTotalBS = calculateBS(mermaTotalUSD, 'pending', undefined, settings.exchangeRate);
    
    const totalCreditsPending = sales.filter(s => s.status === 'pending').reduce((sum, s) => sum + ((s.totalUSD || 0) - (s.paidAmountUSD || 0)), 0);
    const totalCreditsPendingBS = sales.filter(s => s.status === 'pending').reduce((sum, s) => sum + calculateBS((s.totalUSD || 0) - (s.paidAmountUSD || 0), 'pending', undefined, settings.exchangeRate), 0);
    
    const lowStockProducts = products.filter(p => (p.stock || 0) <= (p.minStock || 0));

    // Calcular productos más vendidos
    const productSales: Record<string, { name: string, quantity: number, total: number }> = {};
    salesInRange.forEach(sale => {
      sale.items.forEach((item: any) => {
        if (!productSales[item.productId]) {
          productSales[item.productId] = { name: item.name, quantity: 0, total: 0 };
        }
        productSales[item.productId].quantity += item.quantity;
        productSales[item.productId].total += (item.priceUSD || 0) * item.quantity;
      });
    });

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Datos para el gráfico de tendencia (últimos 7 días)
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const daySales = sales.filter(s => s.date.startsWith(dateStr)).reduce((sum, s) => sum + s.totalUSD, 0);
      return {
        name: d.toLocaleDateString('es-VE', { weekday: 'short' }),
        total: daySales,
        date: dateStr
      };
    }).reverse();

    return {
      grossSales, grossSalesBS,
      cashSales, cashSalesBS,
      creditSales, creditSalesBS,
      collections, collectionsBS,
      totalPurchases, totalPurchasesBS,
      totalExpenses, totalExpensesBS,
      mermaTotalUSD, mermaTotalBS,
      totalCreditsPending, totalCreditsPendingBS,
      lowStockProducts,
      topProducts,
      last7Days
    };
  }, [sales, purchases, expenses, products, movements, fromDate, toDate]);

  const StatCard = ({ label, value, valueBS, icon: Icon, color, isPeriod }: any) => (
    <div className="bg-[#1e293b] p-5 rounded-[2rem] border border-slate-700/50 shadow-lg group hover:border-slate-500 transition-all">
      <div className="flex justify-between items-start mb-3">
        <div className={`p-3 rounded-2xl ${color} bg-opacity-10 ${color.replace('bg-', 'text-')} group-hover:scale-110 transition-transform`}>
          <Icon size={20} />
        </div>
        {isPeriod && <span className="text-[7px] font-black text-orange-500 bg-orange-500/10 px-2 py-1 rounded-lg tracking-widest uppercase">Periodo</span>}
      </div>
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">{label}</p>
      <h3 className="text-2xl font-black text-white mt-1.5 tracking-tighter leading-none">${(value || 0).toFixed(2)}</h3>
      <div className="flex items-center gap-1.5 mt-2">
         <span className="text-[10px] font-bold text-slate-400">{(valueBS || ((value || 0) * (settings.exchangeRate || 0))).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
         <div className="space-y-1">
            <h2 className="text-xs font-black uppercase tracking-[0.4em] text-orange-500 flex items-center gap-2">
               <TrendingUp size={16} /> Resumen de Actividad
            </h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Estado del negocio</p>
         </div>

         <div className="flex items-center gap-2 bg-[#1e293b] p-2 rounded-2xl border border-slate-700">
            <div className="flex items-center gap-2 px-3">
              <Calendar size={14} className="text-slate-500" />
              <input 
                type="date" 
                value={fromDate} 
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-transparent text-[10px] font-black text-white outline-none uppercase"
              />
            </div>
            <ArrowRight size={14} className="text-slate-600" />
            <div className="flex items-center gap-2 px-3">
              <input 
                type="date" 
                value={toDate} 
                onChange={(e) => setToDate(e.target.value)}
                className="bg-transparent text-[10px] font-black text-white outline-none uppercase"
              />
            </div>
         </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Ventas Brutas" value={stats.grossSales} valueBS={stats.grossSalesBS} icon={Tag} color="bg-orange-500" isPeriod />
        <StatCard label="Ventas Contado" value={stats.cashSales} valueBS={stats.cashSalesBS} icon={DollarSign} color="bg-emerald-500" isPeriod />
        <StatCard label="Ventas Crédito" value={stats.creditSales} valueBS={stats.creditSalesBS} icon={CreditCard} color="bg-rose-500" isPeriod />
        <StatCard label="Cobranzas" value={stats.collections} valueBS={stats.collectionsBS} icon={PiggyBank} color="bg-indigo-500" isPeriod />
        <StatCard label="Gastos" value={stats.totalExpenses} valueBS={stats.totalExpensesBS} icon={Wallet} color="bg-rose-500" isPeriod />
        <StatCard label="Compras" value={stats.totalPurchases} valueBS={stats.totalPurchasesBS} icon={ShoppingCart} color="bg-amber-500" isPeriod />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
           <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-6 rounded-[2.5rem] text-white shadow-xl shadow-rose-500/20 relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 opacity-10 group-hover:scale-110 transition-transform">
                 <Trash2 size={120} />
              </div>
              <div className="flex justify-between items-center mb-4">
                 <Trash2 size={24} />
                 <span className="text-[8px] font-black uppercase tracking-widest bg-white/20 px-2 py-1 rounded-lg">Merma</span>
              </div>
              <h3 className="text-4xl font-black tracking-tighter">${(stats.mermaTotalUSD || 0).toFixed(2)}</h3>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mt-1">Pérdida por Merma en el Periodo</p>
              <div className="mt-4 p-3 bg-white/10 rounded-2xl border border-white/10">
                 <p className="text-[10px] font-black tracking-widest uppercase">
                    {calculateBS(stats.mermaTotalUSD || 0, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                 </p>
              </div>
           </div>

           <div className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-slate-700">
              <div className="flex justify-between items-center mb-4">
                 <HandCoins size={24} className="text-emerald-500" />
                 <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Cartera Clientes</span>
              </div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total por Cobrar</p>
              <h3 className="text-3xl font-black text-white tracking-tighter mt-1">${(stats.totalCreditsPending || 0).toFixed(2)}</h3>
              <div className="mt-3 p-2 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                 <p className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest text-center">
                   {calculateBS(stats.totalCreditsPending || 0, 'pending', undefined, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                 </p>
              </div>
           </div>

           <div className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-slate-700">
               <div className="flex justify-between items-center mb-4">
                  <TrendingUp size={24} className="text-indigo-500" />
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Rendimiento</span>
               </div>
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Top Productos</p>
               <div className="mt-4 space-y-3">
                  {stats.topProducts.length > 0 ? (
                    stats.topProducts.map((p, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-500">#{i+1}</span>
                          <p className="text-[10px] font-black text-white uppercase truncate max-w-[100px]">{p.name}</p>
                        </div>
                        <span className="text-[10px] font-black text-indigo-400">{p.quantity} unds</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] font-black text-slate-600 uppercase text-center py-4">Sin datos de venta</p>
                  )}
               </div>
            </div>
        </div>

        <div className="md:col-span-2 bg-[#1e293b] p-6 rounded-[2.5rem] border border-slate-700">
           <div className="flex justify-between items-center mb-6">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                 <TrendingUp size={14} /> Tendencia de Ventas (7 días)
              </h3>
              <span className="text-[8px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-lg uppercase tracking-widest">En Vivo</span>
           </div>
           
           <div className="h-[200px] w-full mb-6">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={stats.last7Days}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff', fontSize: '10px' }}
                      labelStyle={{ color: '#64748b', fontSize: '10px', marginBottom: '4px' }}
                    />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                       {stats.last7Days.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={entry.date === todayStr ? '#f97316' : '#6366f1'} />
                       ))}
                    </Bar>
                 </BarChart>
              </ResponsiveContainer>
           </div>

           <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
              <Tag size={14} /> Historial Reciente de Ventas
           </h3>
           <div className="space-y-3">
              {sales.slice(0, 5).length > 0 ? (
                sales.slice(0, 5).map(s => (
                  <div key={s.id} className="flex items-center justify-between p-4 bg-[#0f172a] rounded-2xl border border-slate-700/30">
                     <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                           <Tag size={18}/>
                        </div>
                        <div>
                           <p className="text-xs font-black text-white uppercase truncate max-w-[150px]">{s.customerName}</p>
                           <p className="text-[8px] text-slate-500 font-bold uppercase">{s.status === 'paid' ? 'Contado' : 'Crédito'}</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-sm font-black text-white leading-none">${(s.totalUSD || 0).toFixed(2)}</p>
                        <p className="text-[8px] text-orange-500 font-bold uppercase mt-1">{calculateBS(s.totalUSD || 0, s.status, s.exchangeRate, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</p>
                     </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center">
                  <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">No hay movimientos hoy</p>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
