
import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart3, 
  Download, 
  FileSpreadsheet, 
  PieChart, 
  TrendingUp, 
  Calendar, 
  CreditCard, 
  ShoppingBag, 
  Package, 
  PackageSearch, 
  PackageX, 
  Layers, 
  Users, 
  Truck, 
  Trash2, 
  Wallet, 
  ClipboardList,
  ArrowLeft,
  Search,
  ChevronRight,
  X,
  Gift,
  Tag,
  Award,
  CheckCircle2,
  Filter,
  ChevronDown,
  ChevronUp,
  Percent,
  UserCheck,
  RotateCcw
} from 'lucide-react';
import { Sale, Purchase, AppSettings, Product, Expense, Customer, Supplier, Movement, Promotion, CustomerPromotion } from '../types';
import { dbService } from '../db';
import AIAnalysis from './AIAnalysis';
import { calculateBS } from '../utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';

interface Props {
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  settings: AppSettings;
  movements: Movement[];
  promotions?: Promotion[];
  customerPromotions?: CustomerPromotion[];
}

type ReportType = 
  | 'transactions_day' 
  | 'transactions_summary' 
  | 'sales_credit' 
  | 'purchases_credit' 
  | 'product_sales' 
  | 'product_purchases' 
  | 'products_no_sales' 
  | 'category_sales' 
  | 'clients_ranking' 
  | 'suppliers_ranking' 
  | 'product_waste' 
  | 'payment_methods' 
  | 'inventory_adjustments'
  | 'promotions_delivered';

const Reports: React.FC<Props> = ({ sales, purchases, expenses, products, customers, suppliers, settings, movements, promotions, customerPromotions }) => {
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>('all');
  const [promoViewMode, setPromoViewMode] = useState<'by_customer' | 'chronological'>('by_customer');
  const [localPromotions, setLocalPromotions] = useState<Promotion[]>(promotions || []);
  const [localCustomerPromos, setLocalCustomerPromos] = useState<CustomerPromotion[]>(customerPromotions || []);
  const [mermaViewTab, setMermaViewTab] = useState<'by_customer' | 'by_product' | 'movements_log'>('by_customer');
  const [mermaCustomerFilter, setMermaCustomerFilter] = useState<string>('all');
  const [expandedMermaCustomer, setExpandedMermaCustomer] = useState<string | null>(null);

  useEffect(() => {
    if (promotions && promotions.length > 0) {
      setLocalPromotions(promotions);
    }
    if (customerPromotions && customerPromotions.length > 0) {
      setLocalCustomerPromos(customerPromotions);
    }
  }, [promotions, customerPromotions]);

  const reportCards = [
    { id: 'transactions_day', title: 'Transacciones Por Día', icon: <Calendar size={24} />, color: 'bg-emerald-500' },
    { id: 'transactions_summary', title: 'Resumen Transacciones', icon: <BarChart3 size={24} />, color: 'bg-emerald-600' },
    { id: 'promotions_delivered', title: 'Promociones Entregadas', icon: <Gift size={24} />, color: 'bg-orange-500' },
    { id: 'sales_credit', title: 'Ventas Crédito', icon: <CreditCard size={24} />, color: 'bg-amber-500' },
    { id: 'purchases_credit', title: 'Compras Crédito', icon: <ShoppingBag size={24} />, color: 'bg-amber-600' },
    { id: 'product_sales', title: 'Producto Ventas', icon: <Package size={24} />, color: 'bg-indigo-500' },
    { id: 'product_purchases', title: 'Producto Compras', icon: <PackageSearch size={24} />, color: 'bg-indigo-600' },
    { id: 'products_no_sales', title: 'Productos Sin Ventas', icon: <PackageX size={24} />, color: 'bg-rose-500' },
    { id: 'category_sales', title: 'Categoría Ventas', icon: <Layers size={24} />, color: 'bg-rose-600' },
    { id: 'clients_ranking', title: 'Ranking Clientes', icon: <Users size={24} />, color: 'bg-cyan-500' },
    { id: 'suppliers_ranking', title: 'Ranking Proveedores', icon: <Truck size={24} />, color: 'bg-cyan-600' },
    { id: 'product_waste', title: 'Merma Productos', icon: <Trash2 size={24} />, color: 'bg-yellow-600' },
    { id: 'payment_methods', title: 'Forma Pago', icon: <Wallet size={24} />, color: 'bg-teal-600' },
  ];
  const chartData = [
    { name: 'Ventas', total: sales.reduce((sum, s) => sum + s.totalUSD, 0) },
    { name: 'Compras', total: purchases.reduce((sum, p) => sum + p.totalUSD, 0) },
    { name: 'Gastos', total: expenses.reduce((sum, e) => sum + e.amountUSD, 0) },
  ];

  const exportToCSV = () => {
    const headers = ['ID', 'Fecha', 'Cliente', 'Total USD', 'Total BS', 'Estado'];
    const rows = sales.map(s => [
      s.id,
      s.date,
      s.customerName,
      s.totalUSD.toFixed(2),
      calculateBS(s.totalUSD, s.status, s.exchangeRate, settings.exchangeRate).toFixed(2),
      s.status === 'paid' ? 'Pagado' : 'Pendiente'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ventas_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalSales = sales.reduce((sum, s) => sum + s.totalUSD, 0);
  const totalPurchases = purchases.reduce((sum, p) => sum + p.totalUSD, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amountUSD, 0);
  const estimatedProfit = totalSales - totalPurchases - totalExpenses;

  const totalSalesBS = sales.reduce((sum, s) => sum + calculateBS(s.totalUSD, s.status, s.exchangeRate, settings.exchangeRate), 0);
  const totalPurchasesBS = purchases.reduce((sum, p) => sum + calculateBS(p.totalUSD, p.status, p.exchangeRate, settings.exchangeRate), 0);
  const totalExpensesBS = expenses.reduce((sum, e) => sum + e.amountBS, 0);
  const estimatedProfitBS = totalSalesBS - totalPurchasesBS - totalExpensesBS;

  const renderReportDetail = () => {
    if (!selectedReport) return null;

    let title = "";
    let content = null;

    switch (selectedReport) {
      case 'transactions_day':
        title = "Transacciones Por Día";
        const last7Days = [...Array(7)].map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          return {
            date: dateStr,
            total: sales.filter(s => s.date.startsWith(dateStr)).reduce((sum, s) => sum + s.totalUSD, 0)
          };
        }).reverse();

        content = (
          <div className="space-y-4">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={last7Days}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickFormatter={(val) => val.split('-').slice(1).join('/')} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(val) => `$${val}`} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
                  <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
        break;

      case 'transactions_summary':
        title = "Resumen de Transacciones";
        const filteredSales = sales.filter(s => s.date.split('T')[0] >= startDate && s.date.split('T')[0] <= endDate);
        const filteredPurchases = purchases.filter(p => p.date.split('T')[0] >= startDate && p.date.split('T')[0] <= endDate);
        const filteredExpenses = expenses.filter(e => e.date.split('T')[0] >= startDate && e.date.split('T')[0] <= endDate);

        const currentTotalSales = filteredSales.reduce((sum, s) => sum + s.totalUSD, 0);
        const currentTotalPurchases = filteredPurchases.reduce((sum, p) => sum + p.totalUSD, 0);
        const currentTotalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amountUSD, 0);
        const currentEstimatedProfit = currentTotalSales - currentTotalPurchases - currentTotalExpenses;

        const currentTotalSalesBS = filteredSales.reduce((sum, s) => sum + calculateBS(s.totalUSD, s.status, s.exchangeRate, settings.exchangeRate), 0);
        const currentTotalPurchasesBS = filteredPurchases.reduce((sum, p) => sum + calculateBS(p.totalUSD, p.status, p.exchangeRate, settings.exchangeRate), 0);
        const currentTotalExpensesBS = filteredExpenses.reduce((sum, e) => sum + e.amountBS, 0);
        const currentEstimatedProfitBS = currentTotalSalesBS - currentTotalPurchasesBS - currentTotalExpensesBS;

        content = (
          <div className="space-y-6">
            <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700 flex flex-col md:flex-row items-center gap-4">
              <div className="flex-1 w-full">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Desde</label>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-orange-500" 
                />
              </div>
              <div className="flex-1 w-full">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Hasta</label>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-orange-500" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Ventas</p>
                <p className="text-2xl font-black text-emerald-400">${currentTotalSales.toFixed(2)}</p>
                <p className="text-sm text-slate-400">Bs. {currentTotalSalesBS.toFixed(2)}</p>
              </div>
              <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Compras</p>
                <p className="text-2xl font-black text-rose-400">${currentTotalPurchases.toFixed(2)}</p>
                <p className="text-sm text-slate-400">Bs. {currentTotalPurchasesBS.toFixed(2)}</p>
              </div>
              <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Gastos</p>
                <p className="text-2xl font-black text-rose-400">${currentTotalExpenses.toFixed(2)}</p>
                <p className="text-sm text-slate-400">Bs. {currentTotalExpensesBS.toFixed(2)}</p>
              </div>
            </div>
            <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Utilidad Estimada</p>
              <p className={`text-3xl font-black ${currentEstimatedProfit >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                ${currentEstimatedProfit.toFixed(2)}
              </p>
              <p className={`text-lg font-bold ${currentEstimatedProfitBS >= 0 ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
                Bs. {currentEstimatedProfitBS.toFixed(2)}
              </p>
            </div>
          </div>
        );
        break;

      case 'category_sales':
        title = "Ventas por Categoría";
        const categoryData = products.reduce((acc: any[], p) => {
          const catSales = sales.reduce((sum, s) => 
            sum + s.items.filter(i => i.productId === p.id).reduce((isum, item) => isum + (item.quantity * item.priceUSD), 0), 0
          );
          const existing = acc.find(a => a.name === p.category);
          if (existing) {
            existing.value += catSales;
          } else {
            acc.push({ name: p.category, value: catSales });
          }
          return acc;
        }, []).filter(c => c.value > 0).sort((a, b) => b.value - a.value);

        content = (
          <div className="space-y-4">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={100} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
                  <Bar dataKey="value" fill="#f43f5e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
        break;

      case 'product_waste':
        title = "Reporte de Merma y Pérdidas";

        // Enriquecer movimientos de merma para asociar cliente incluso si proviene de una venta histórica
        const enrichedMermaMovements = movements
          .filter(m => m.type === 'merma')
          .map(m => {
            let custId = m.customerId;
            let custName = m.customerName;
            if (!custId && m.relatedId) {
              const relSale = sales.find(s => s.id === m.relatedId);
              if (relSale) {
                custId = relSale.customerId;
                custName = relSale.customerName;
              }
            }
            const dateOnly = m.date ? m.date.split('T')[0] : '';
            return {
              ...m,
              dateOnly,
              computedCustomerId: custId || 'almacen',
              computedCustomerName: custName || 'Merma Interna / Almacén'
            };
          });

        // 1. Filtrar por período de tiempo
        const dateFilteredMerma = enrichedMermaMovements.filter(m => 
          m.dateOnly >= startDate && m.dateOnly <= endDate
        );

        // 2. Filtrar por cliente si hay filtro individual activo
        const finalFilteredMerma = mermaCustomerFilter === 'all' 
          ? dateFilteredMerma 
          : dateFilteredMerma.filter(m => m.computedCustomerId === mermaCustomerFilter);

        // Totales del período seleccionado (para cálculos porcentuales)
        const totalPeriodMermaUnits = dateFilteredMerma.reduce((sum, m) => sum + Math.abs(m.quantity), 0);
        const totalPeriodMermaUSD = dateFilteredMerma.reduce((sum, m) => {
          const prod = products.find(p => p.id === m.productId);
          const cost = prod?.costUSD || 0;
          return sum + (Math.abs(m.quantity) * cost);
        }, 0);
        const totalPeriodMermaBS = calculateBS(totalPeriodMermaUSD, 'pending', undefined, settings.exchangeRate);

        // Salidas totales (ventas + merma) en el período para porcentaje global
        const totalSoldUnitsInPeriod = movements
          .filter(m => m.type === 'sale' && m.date.split('T')[0] >= startDate && m.date.split('T')[0] <= endDate)
          .reduce((sum, m) => sum + Math.abs(m.quantity), 0);
        const globalPeriodOutflow = totalPeriodMermaUnits + totalSoldUnitsInPeriod;
        const globalMermaPct = globalPeriodOutflow > 0 ? (totalPeriodMermaUnits / globalPeriodOutflow) * 100 : 0;

        // Porcentaje atribuible a clientes vs almacén
        const clientMermaUnits = dateFilteredMerma
          .filter(m => m.computedCustomerId !== 'almacen')
          .reduce((sum, m) => sum + Math.abs(m.quantity), 0);
        const clientMermaPct = totalPeriodMermaUnits > 0 ? (clientMermaUnits / totalPeriodMermaUnits) * 100 : 0;
        const warehouseMermaPct = totalPeriodMermaUnits > 0 ? 100 - clientMermaPct : 0;

        // Agrupación por Clientes para la pestaña "Por Clientes"
        const customerWasteMap: { [key: string]: { 
          id: string; 
          name: string; 
          rif?: string;
          phone?: string;
          units: number; 
          costUSD: number; 
          products: { [prodId: string]: { name: string; units: number; costUSD: number; reason?: string } } 
        } } = {};

        finalFilteredMerma.forEach(m => {
          const cId = m.computedCustomerId;
          const cName = m.computedCustomerName;
          const prod = products.find(p => p.id === m.productId);
          const cost = prod?.costUSD || 0;
          const units = Math.abs(m.quantity);
          const costTotal = units * cost;

          if (!customerWasteMap[cId]) {
            const customerObj = customers.find(c => c.id === cId);
            customerWasteMap[cId] = {
              id: cId,
              name: cName,
              rif: customerObj?.rif,
              phone: customerObj?.phone,
              units: 0,
              costUSD: 0,
              products: {}
            };
          }

          customerWasteMap[cId].units += units;
          customerWasteMap[cId].costUSD += costTotal;

          if (!customerWasteMap[cId].products[m.productId]) {
            customerWasteMap[cId].products[m.productId] = {
              name: m.productName || prod?.name || 'Producto Desconocido',
              units: 0,
              costUSD: 0,
              reason: m.reason
            };
          }
          customerWasteMap[cId].products[m.productId].units += units;
          customerWasteMap[cId].products[m.productId].costUSD += costTotal;
          if (m.reason) {
            customerWasteMap[cId].products[m.productId].reason = m.reason;
          }
        });

        const customerWasteList = Object.values(customerWasteMap).sort((a, b) => b.units - a.units);

        // Agrupación por Productos para la pestaña "Por Productos"
        const productWasteMap: { [key: string]: {
          id: string;
          name: string;
          category: string;
          sku: string;
          costUSD: number;
          units: number;
          totalCostUSD: number;
          clientBreakdown: { [cName: string]: number };
        } } = {};

        finalFilteredMerma.forEach(m => {
          const prod = products.find(p => p.id === m.productId);
          const cost = prod?.costUSD || 0;
          const units = Math.abs(m.quantity);
          const costTotal = units * cost;

          if (!productWasteMap[m.productId]) {
            productWasteMap[m.productId] = {
              id: m.productId,
              name: m.productName || prod?.name || 'Producto Desconocido',
              category: prod?.category || 'Otros',
              sku: prod?.sku || '',
              costUSD: cost,
              units: 0,
              totalCostUSD: 0,
              clientBreakdown: {}
            };
          }

          productWasteMap[m.productId].units += units;
          productWasteMap[m.productId].totalCostUSD += costTotal;
          productWasteMap[m.productId].clientBreakdown[m.computedCustomerName] = 
            (productWasteMap[m.productId].clientBreakdown[m.computedCustomerName] || 0) + units;
        });

        const productWasteList = Object.values(productWasteMap).sort((a, b) => b.units - a.units);

        // Helper para botones rápidos de rango de fechas
        const handleQuickRange = (type: 'today' | 'week' | 'month' | 'last30' | 'all') => {
          const now = new Date();
          const todayStr = now.toISOString().split('T')[0];
          if (type === 'today') {
            setStartDate(todayStr);
            setEndDate(todayStr);
          } else if (type === 'week') {
            const d = new Date(now);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            d.setDate(diff);
            setStartDate(d.toISOString().split('T')[0]);
            setEndDate(todayStr);
          } else if (type === 'month') {
            const first = new Date(now.getFullYear(), now.getMonth(), 1);
            setStartDate(first.toISOString().split('T')[0]);
            setEndDate(todayStr);
          } else if (type === 'last30') {
            const past = new Date(now);
            past.setDate(past.getDate() - 30);
            setStartDate(past.toISOString().split('T')[0]);
            setEndDate(todayStr);
          } else if (type === 'all') {
            setStartDate('2020-01-01');
            setEndDate(todayStr);
          }
        };

        // Exportación de Merma a CSV
        const exportMermaCSV = () => {
          let csvRows: string[][] = [];
          if (mermaViewTab === 'by_customer') {
            csvRows.push(['REPORTE DE MERMA POR CLIENTE - PERIODO:', `${startDate} a ${endDate}`]);
            csvRows.push(['Cliente', 'RIF', 'Unidades Mermadas', '% del Total Merma Periodo', 'Costo USD', 'Costo BS']);
            customerWasteList.forEach(c => {
              const pct = totalPeriodMermaUnits > 0 ? (c.units / totalPeriodMermaUnits) * 100 : 0;
              const bsVal = calculateBS(c.costUSD, 'pending', undefined, settings.exchangeRate);
              csvRows.push([
                `"${c.name}"`,
                `"${c.rif || 'N/A'}"`,
                c.units.toString(),
                `${pct.toFixed(2)}%`,
                c.costUSD.toFixed(2),
                bsVal.toFixed(2)
              ]);
            });
          } else if (mermaViewTab === 'by_product') {
            csvRows.push(['REPORTE DE MERMA POR PRODUCTO - PERIODO:', `${startDate} a ${endDate}`]);
            csvRows.push(['Producto', 'SKU', 'Categoria', 'Unidades Mermadas', '% del Total Merma Periodo', 'Costo Unitario USD', 'Costo Total USD', 'Costo Total BS']);
            productWasteList.forEach(p => {
              const pct = totalPeriodMermaUnits > 0 ? (p.units / totalPeriodMermaUnits) * 100 : 0;
              const bsVal = calculateBS(p.totalCostUSD, 'pending', undefined, settings.exchangeRate);
              csvRows.push([
                `"${p.name}"`,
                `"${p.sku}"`,
                `"${p.category}"`,
                p.units.toString(),
                `${pct.toFixed(2)}%`,
                p.costUSD.toFixed(2),
                p.totalCostUSD.toFixed(2),
                bsVal.toFixed(2)
              ]);
            });
          } else {
            csvRows.push(['HISTORIAL DE MOVIMIENTOS DE MERMA - PERIODO:', `${startDate} a ${endDate}`]);
            csvRows.push(['Fecha', 'Producto', 'Cliente', 'Cantidad', 'Costo Est. USD', 'Motivo / Causa']);
            finalFilteredMerma.forEach(m => {
              const prod = products.find(p => p.id === m.productId);
              const cost = prod?.costUSD || 0;
              const units = Math.abs(m.quantity);
              csvRows.push([
                m.date ? new Date(m.date).toLocaleString() : '',
                `"${m.productName || prod?.name || ''}"`,
                `"${m.computedCustomerName}"`,
                units.toString(),
                (units * cost).toFixed(2),
                `"${m.reason || 'Sin especificar'}"`
              ]);
            });
          }

          const csvContent = csvRows.map(e => e.join(',')).join('\n');
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `reporte_merma_${mermaViewTab}_${startDate}_${endDate}.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        };
        
        content = (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Controles de Filtros de Período y Cliente */}
            <div className="bg-[#1e293b] p-5 rounded-2xl border border-slate-700 space-y-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-orange-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-white">Filtro de Período de Tiempo</span>
                </div>
                
                {/* Botones de selección rápida de período */}
                <div className="flex flex-wrap gap-1.5">
                  <button 
                    type="button" 
                    onClick={() => handleQuickRange('today')}
                    className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-[#0f172a] hover:bg-orange-500/20 text-slate-300 hover:text-orange-400 rounded-lg border border-slate-700 transition-colors"
                  >
                    Hoy
                  </button>
                  <button 
                    type="button" 
                    onClick={() => handleQuickRange('week')}
                    className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-[#0f172a] hover:bg-orange-500/20 text-slate-300 hover:text-orange-400 rounded-lg border border-slate-700 transition-colors"
                  >
                    Esta Semana
                  </button>
                  <button 
                    type="button" 
                    onClick={() => handleQuickRange('month')}
                    className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-[#0f172a] hover:bg-orange-500/20 text-slate-300 hover:text-orange-400 rounded-lg border border-slate-700 transition-colors"
                  >
                    Este Mes
                  </button>
                  <button 
                    type="button" 
                    onClick={() => handleQuickRange('last30')}
                    className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-[#0f172a] hover:bg-orange-500/20 text-slate-300 hover:text-orange-400 rounded-lg border border-slate-700 transition-colors"
                  >
                    Últimos 30 Días
                  </button>
                  <button 
                    type="button" 
                    onClick={() => handleQuickRange('all')}
                    className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-[#0f172a] hover:bg-orange-500/20 text-slate-300 hover:text-orange-400 rounded-lg border border-slate-700 transition-colors"
                  >
                    Todo
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1">Fecha Desde</label>
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none focus:border-orange-500" 
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1">Fecha Hasta</label>
                  <input 
                    type="date" 
                    value={endDate} 
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none focus:border-orange-500" 
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1">Filtrar por Cliente</label>
                  <select
                    value={mermaCustomerFilter}
                    onChange={(e) => setMermaCustomerFilter(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none focus:border-orange-500"
                  >
                    <option value="all">Todos los Clientes y Almacén</option>
                    <option value="almacen">Sólo Merma Interna / Almacén</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Tarjetas de Resumen y Porcentajes del Período */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-[#1e293b] p-4 rounded-2xl border border-slate-800 shadow-md">
                <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest leading-none mb-1">Costo Total Merma</p>
                <p className="text-xl font-black text-white leading-tight">${totalPeriodMermaUSD.toFixed(2)}</p>
                <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Bs. {totalPeriodMermaBS.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                <div className="mt-2 pt-2 border-t border-slate-800/80 text-[8px] text-slate-400 uppercase">
                  Período: {startDate} al {endDate}
                </div>
              </div>

              <div className="bg-[#1e293b] p-4 rounded-2xl border border-slate-800 shadow-md">
                <p className="text-[8px] font-black text-amber-500 uppercase tracking-widest leading-none mb-1">Unidades Mermadas</p>
                <p className="text-xl font-black text-white leading-tight">{totalPeriodMermaUnits % 1 === 0 ? totalPeriodMermaUnits : totalPeriodMermaUnits.toFixed(2)} <span className="text-xs text-slate-400 font-bold">uni.</span></p>
                <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">
                  {dateFilteredMerma.length} registros en total
                </p>
                <div className="mt-2 pt-2 border-t border-slate-800/80 text-[8px] text-slate-400 uppercase">
                  {mermaCustomerFilter !== 'all' ? 'Filtrado por cliente' : 'Incluye almacén y clientes'}
                </div>
              </div>

              <div className="bg-[#1e293b] p-4 rounded-2xl border border-slate-800 shadow-md">
                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-1">% Merma s/ Salidas</p>
                <p className="text-xl font-black text-emerald-400 leading-tight">{globalMermaPct.toFixed(1)}%</p>
                <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">
                  De {globalPeriodOutflow % 1 === 0 ? globalPeriodOutflow : globalPeriodOutflow.toFixed(1)} salidas totales
                </p>
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${globalMermaPct > 10 ? 'bg-rose-500' : globalMermaPct > 5 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, globalMermaPct)}%` }}
                  />
                </div>
              </div>

              <div className="bg-[#1e293b] p-4 rounded-2xl border border-slate-800 shadow-md">
                <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest leading-none mb-1">Distribución Período</p>
                <div className="flex items-center justify-between text-xs font-black mt-1 text-white">
                  <span>Clientes: <strong className="text-orange-400">{clientMermaPct.toFixed(0)}%</strong></span>
                  <span>Almacén: <strong className="text-slate-400">{warehouseMermaPct.toFixed(0)}%</strong></span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden flex">
                  <div className="h-full bg-orange-500" style={{ width: `${clientMermaPct}%` }} />
                  <div className="h-full bg-slate-600" style={{ width: `${warehouseMermaPct}%` }} />
                </div>
                <p className="text-[8px] text-slate-400 mt-2 uppercase truncate">
                  {customerWasteList.length} clientes con incidencia
                </p>
              </div>
            </div>

            {/* Pestañas de Vista y Botón de Exportación */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex bg-[#1e293b] p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setMermaViewTab('by_customer')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                    mermaViewTab === 'by_customer' ? 'bg-orange-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Users size={14} />
                  <span>Por Clientes</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMermaViewTab('by_product')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                    mermaViewTab === 'by_product' ? 'bg-orange-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Package size={14} />
                  <span>Por Productos</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMermaViewTab('movements_log')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                    mermaViewTab === 'movements_log' ? 'bg-orange-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ClipboardList size={14} />
                  <span>Movimientos ({finalFilteredMerma.length})</span>
                </button>
              </div>

              <button
                type="button"
                onClick={exportMermaCSV}
                className="bg-[#1e293b] hover:bg-slate-800 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95"
                title="Descargar este reporte en CSV / Excel"
              >
                <Download size={14} className="text-orange-400" />
                <span>Exportar CSV</span>
              </button>
            </div>

            {/* TABLA 1: POR CLIENTES */}
            {mermaViewTab === 'by_customer' && (
              <div className="bg-[#0f172a] rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
                <div className="p-4 bg-[#1e293b]/50 border-b border-slate-800 flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-white">
                      Merma Agrupada por Clientes
                    </h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">
                      Porcentajes calculados respecto al total de merma del período ({totalPeriodMermaUnits % 1 === 0 ? totalPeriodMermaUnits : totalPeriodMermaUnits.toFixed(2)} uni.)
                    </p>
                  </div>
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20 uppercase">
                    {customerWasteList.length} Clientes / Entidades
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1e293b] text-slate-400 font-black uppercase tracking-widest text-[9px]">
                      <tr>
                        <th className="p-3.5">Cliente</th>
                        <th className="p-3.5 text-center">Unidades Mermadas</th>
                        <th className="p-3.5 text-center" title="Porcentaje que este cliente representa sobre toda la merma ocurrida en el periodo seleccionado">
                          % del Periodo
                        </th>
                        <th className="p-3.5 text-right">Costo Estimado (USD)</th>
                        <th className="p-3.5 text-right">Costo Estimado (BS)</th>
                        <th className="p-3.5 text-center">Detalle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {customerWasteList.map((c) => {
                        const pctPeriod = totalPeriodMermaUnits > 0 ? (c.units / totalPeriodMermaUnits) * 100 : 0;
                        const bsVal = calculateBS(c.costUSD, 'pending', undefined, settings.exchangeRate);
                        const isExpanded = expandedMermaCustomer === c.id;
                        const productEntries = Object.values(c.products);

                        return (
                          <React.Fragment key={c.id}>
                            <tr className="hover:bg-slate-800/40 transition-colors">
                              <td className="p-3.5">
                                <div className="font-bold text-white uppercase flex items-center gap-2">
                                  {c.id === 'almacen' ? (
                                    <span className="p-1 rounded bg-slate-700 text-slate-300"><Package size={12}/></span>
                                  ) : (
                                    <span className="p-1 rounded bg-orange-500/20 text-orange-400"><Users size={12}/></span>
                                  )}
                                  <div>
                                    <p className="leading-tight">{c.name}</p>
                                    {c.rif && <p className="text-[8px] text-slate-500 font-mono">{c.rif}</p>}
                                  </div>
                                </div>
                              </td>
                              <td className="p-3.5 text-center font-black text-rose-400 text-sm">
                                {c.units % 1 === 0 ? c.units : c.units.toFixed(2)}
                              </td>
                              <td className="p-3.5 text-center">
                                <div className="inline-flex flex-col items-center">
                                  <span className={`text-xs font-black ${pctPeriod > 30 ? 'text-rose-500' : pctPeriod > 15 ? 'text-amber-500' : 'text-emerald-400'}`}>
                                    {pctPeriod.toFixed(1)}%
                                  </span>
                                  <div className="w-16 bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full ${pctPeriod > 30 ? 'bg-rose-500' : pctPeriod > 15 ? 'bg-amber-500' : 'bg-emerald-400'}`}
                                      style={{ width: `${Math.min(100, pctPeriod)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="p-3.5 text-right font-black text-slate-300">
                                ${c.costUSD.toFixed(2)}
                              </td>
                              <td className="p-3.5 text-right font-black text-emerald-400">
                                Bs. {bsVal.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-3.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => setExpandedMermaCustomer(isExpanded ? null : c.id)}
                                  className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors inline-flex items-center gap-1 text-[9px] font-bold uppercase"
                                  title="Ver productos mermados por este cliente"
                                >
                                  <span>{productEntries.length} prod.</span>
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                              </td>
                            </tr>

                            {/* Desglose de productos mermados al expandir cliente */}
                            {isExpanded && (
                              <tr className="bg-[#0b1120]">
                                <td colSpan={6} className="p-4 pl-10 border-t border-b border-slate-800/80">
                                  <div className="space-y-2">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
                                      <Package size={12} /> Productos Mermados por {c.name} en el Período:
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {productEntries.map((prod, pIdx) => {
                                        const prodPct = c.units > 0 ? (prod.units / c.units) * 100 : 0;
                                        return (
                                          <div key={pIdx} className="bg-[#1e293b] p-2.5 rounded-xl border border-slate-700/60 flex justify-between items-center text-xs">
                                            <div className="pr-2">
                                              <p className="font-bold text-white uppercase text-[11px] leading-tight truncate max-w-[150px]">{prod.name}</p>
                                              {prod.reason && (
                                                <p className="text-[7.5px] text-rose-400/90 font-medium italic mt-0.5 truncate max-w-[150px]">{prod.reason}</p>
                                              )}
                                            </div>
                                            <div className="text-right whitespace-nowrap">
                                              <span className="font-black text-rose-400 text-xs block">
                                                {prod.units % 1 === 0 ? prod.units : prod.units.toFixed(2)} uni.
                                              </span>
                                              <span className="text-[8px] font-bold text-slate-400 uppercase">
                                                {prodPct.toFixed(0)}% del cliente
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}

                      {customerWasteList.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-500 font-bold uppercase italic">
                            No hay merma registrada para el período y filtros seleccionados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TABLA 2: POR PRODUCTOS */}
            {mermaViewTab === 'by_product' && (
              <div className="bg-[#0f172a] rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
                <div className="p-4 bg-[#1e293b]/50 border-b border-slate-800 flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-white">
                      Merma Agrupada por Productos
                    </h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">
                      Porcentaje sobre merma del período ({totalPeriodMermaUnits % 1 === 0 ? totalPeriodMermaUnits : totalPeriodMermaUnits.toFixed(2)} uni.) y porcentaje sobre salidas totales
                    </p>
                  </div>
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20 uppercase">
                    {productWasteList.length} Productos
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1e293b] text-slate-400 font-black uppercase tracking-widest text-[9px]">
                      <tr>
                        <th className="p-3.5">Producto</th>
                        <th className="p-3.5 text-center">Cant. Merma</th>
                        <th className="p-3.5 text-center" title="Porcentaje que este producto representa respecto al total de merma del período">% del Total Merma</th>
                        <th className="p-3.5 text-center" title="Porcentaje de unidades mermadas respecto a la salida total (Ventas + Merma) de este producto">% Merma / Salidas</th>
                        <th className="p-3.5 text-right">Valor Est. (USD)</th>
                        <th className="p-3.5 text-right">Valor Est. (BS)</th>
                        <th className="p-3.5">Clientes Afectados</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {productWasteList.map((p, i) => {
                        const valorUSD = p.totalCostUSD;
                        const valorBS = calculateBS(valorUSD, 'pending', undefined, settings.exchangeRate);
                        
                        const soldQty = movements
                          .filter(m => m.productId === p.id && m.type === 'sale' && m.date.split('T')[0] >= startDate && m.date.split('T')[0] <= endDate)
                          .reduce((sum, m) => sum + Math.abs(m.quantity), 0);
                        
                        const totalOutflow = p.units + soldQty;
                        const outflowPercentage = totalOutflow > 0 ? (p.units / totalOutflow) * 100 : 0;
                        const periodMermaPercentage = totalPeriodMermaUnits > 0 ? (p.units / totalPeriodMermaUnits) * 100 : 0;

                        const clientsArray = Object.entries(p.clientBreakdown);

                        return (
                          <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-3.5 font-bold">
                              <div>
                                <p className="text-white uppercase leading-tight">{p.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {p.sku && <span className="text-[7.5px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded font-mono">{p.sku}</span>}
                                  <span className="text-[7.5px] text-orange-400 uppercase">{p.category}</span>
                                </div>
                              </div>
                            </td>
                            <td className="p-3.5 text-center font-black text-rose-400 text-sm">
                              {p.units % 1 === 0 ? p.units : p.units.toFixed(2)}
                            </td>
                            <td className="p-3.5 text-center">
                              <span className={`text-xs font-black ${periodMermaPercentage > 25 ? 'text-rose-500' : 'text-amber-400'}`}>
                                {periodMermaPercentage.toFixed(1)}%
                              </span>
                              <div className="w-14 bg-slate-800 h-1 rounded-full mx-auto mt-1 overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${periodMermaPercentage > 25 ? 'bg-rose-500' : 'bg-amber-400'}`}
                                  style={{ width: `${Math.min(100, periodMermaPercentage)}%` }}
                                />
                              </div>
                            </td>
                            <td className="p-3.5 text-center">
                              <span className={`text-xs font-black ${outflowPercentage > 15 ? 'text-rose-500' : outflowPercentage > 5 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                {outflowPercentage.toFixed(1)}%
                              </span>
                              <span className="block text-[7.5px] text-slate-500 font-medium uppercase tracking-tighter">
                                de {totalOutflow % 1 === 0 ? totalOutflow : totalOutflow.toFixed(1)} salidas
                              </span>
                            </td>
                            <td className="p-3.5 text-right font-black text-slate-300">${valorUSD.toFixed(2)}</td>
                            <td className="p-3.5 text-right font-black text-emerald-400">Bs. {valorBS.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                            <td className="p-3.5">
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {clientsArray.map(([cName, qty], idx) => (
                                  <span key={idx} className="text-[8px] bg-slate-800/80 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700/50">
                                    {cName}: <strong className="text-orange-400">{qty % 1 === 0 ? qty : qty.toFixed(1)}</strong>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {productWasteList.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-500 font-bold uppercase italic">
                            No hay merma de productos registrada en este período.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TABLA 3: HISTORIAL CRONOLÓGICO */}
            {mermaViewTab === 'movements_log' && (
              <div className="bg-[#0f172a] rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
                <div className="p-4 bg-[#1e293b]/50 border-b border-slate-800 flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-white">
                      Historial Detallado de Registros de Merma
                    </h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">
                      Cada movimiento de descuento de unidades del período
                    </p>
                  </div>
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase">
                    {finalFilteredMerma.length} Movimientos
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1e293b] text-slate-400 font-black uppercase tracking-widest text-[9px]">
                      <tr>
                        <th className="p-3.5">Fecha</th>
                        <th className="p-3.5">Producto</th>
                        <th className="p-3.5">Cliente / Origen</th>
                        <th className="p-3.5 text-center">Unidades</th>
                        <th className="p-3.5 text-right">Costo Estimado</th>
                        <th className="p-3.5">Motivo / Causa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {finalFilteredMerma.map((m) => {
                        const prod = products.find(p => p.id === m.productId);
                        const cost = prod?.costUSD || 0;
                        const units = Math.abs(m.quantity);
                        const costTotal = units * cost;

                        return (
                          <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-3.5 whitespace-nowrap text-slate-400 font-mono text-[10px]">
                              {m.date ? new Date(m.date).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                            </td>
                            <td className="p-3.5 font-bold text-white uppercase">
                              {m.productName || prod?.name || 'Producto'}
                            </td>
                            <td className="p-3.5 font-bold text-orange-400 uppercase">
                              {m.computedCustomerName}
                            </td>
                            <td className="p-3.5 text-center font-black text-rose-400">
                              -{units % 1 === 0 ? units : units.toFixed(2)}
                            </td>
                            <td className="p-3.5 text-right font-black text-slate-300">
                              ${costTotal.toFixed(2)}
                            </td>
                            <td className="p-3.5 text-slate-400 text-[10px]">
                              {m.reason ? (
                                <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-medium">
                                  {m.reason}
                                </span>
                              ) : (
                                <span className="text-slate-600 italic">Sin motivo especificado</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {finalFilteredMerma.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-500 font-bold uppercase italic">
                            No se encontraron movimientos de merma en el período.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
        break;

      case 'payment_methods':
        title = "Ventas por Forma de Pago";
        // Asumiendo que las ventas pagadas son 'Efectivo' por defecto si no hay campo
        const paymentData = [
          { name: 'Contado', value: sales.filter(s => s.status === 'paid').reduce((sum, s) => sum + s.totalUSD, 0) },
          { name: 'Crédito', value: sales.filter(s => s.status === 'pending').reduce((sum, s) => sum + s.totalUSD, 0) },
        ].sort((a, b) => b.value - a.value);

        content = (
          <div className="space-y-4">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={paymentData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(val) => `$${val}`} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
                  <Bar dataKey="value" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
        break;

      case 'product_sales':
        title = "Top Productos Vendidos";
        const topProducts = products
          .map(p => ({
            name: p.name,
            total: sales.reduce((sum, s) => sum + s.items.filter(i => i.productId === p.id).reduce((isum, item) => isum + item.quantity, 0), 0)
          }))
          .filter(p => p.total > 0)
          .sort((a, b) => b.total - a.total)
          .slice(0, 10);
        
        content = (
          <div className="space-y-4">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={10} hide />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={100} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
                  <Bar dataKey="total" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-[#0f172a] rounded-2xl overflow-hidden border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1e293b] text-slate-400 font-black uppercase tracking-widest">
                  <tr>
                    <th className="p-4">Producto</th>
                    <th className="p-4 text-right">Cantidad Vendida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {topProducts.map((p, i) => (
                    <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-4 font-bold">{p.name}</td>
                      <td className="p-4 text-right font-black text-emerald-400">{p.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
        break;

      case 'sales_credit':
        title = "Ventas a Crédito (CXC)";
        const creditSales = sales.filter(s => s.status === 'pending');
        content = (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#1e293b] p-4 rounded-2xl border border-slate-700">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Pendiente (USD)</p>
                <p className="text-2xl font-black text-amber-400">${creditSales.reduce((sum, s) => sum + s.totalUSD, 0).toFixed(2)}</p>
              </div>
              <div className="bg-[#1e293b] p-4 rounded-2xl border border-slate-700">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Pendiente (BS)</p>
                <p className="text-2xl font-black text-emerald-400">Bs. {creditSales.reduce((sum, s) => sum + calculateBS(s.totalUSD, s.status, s.exchangeRate, settings.exchangeRate), 0).toFixed(2)}</p>
              </div>
            </div>
            <div className="bg-[#0f172a] rounded-2xl overflow-hidden border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1e293b] text-slate-400 font-black uppercase tracking-widest">
                  <tr>
                    <th className="p-4">Cliente</th>
                    <th className="p-4">Fecha</th>
                    <th className="p-4 text-right">Monto USD</th>
                    <th className="p-4 text-right">Monto BS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {creditSales.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-4 font-bold">{s.customerName}</td>
                      <td className="p-4 text-slate-400">{new Date(s.date).toLocaleDateString()}</td>
                      <td className="p-4 text-right font-black text-amber-400">${s.totalUSD.toFixed(2)}</td>
                      <td className="p-4 text-right font-black text-emerald-400">Bs. {calculateBS(s.totalUSD, s.status, s.exchangeRate, settings.exchangeRate).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
        break;

      case 'purchases_credit':
        title = "Compras a Crédito (CXP)";
        const creditPurchases = purchases.filter(p => p.status === 'pending');
        content = (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#1e293b] p-4 rounded-2xl border border-slate-700">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total por Pagar (USD)</p>
                <p className="text-2xl font-black text-rose-400">${creditPurchases.reduce((sum, p) => sum + p.totalUSD, 0).toFixed(2)}</p>
              </div>
              <div className="bg-[#1e293b] p-4 rounded-2xl border border-slate-700">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total por Pagar (BS)</p>
                <p className="text-2xl font-black text-emerald-400">Bs. {creditPurchases.reduce((sum, p) => sum + calculateBS(p.totalUSD, p.status, p.exchangeRate, settings.exchangeRate), 0).toFixed(2)}</p>
              </div>
            </div>
            <div className="bg-[#0f172a] rounded-2xl overflow-hidden border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1e293b] text-slate-400 font-black uppercase tracking-widest">
                  <tr>
                    <th className="p-4">Proveedor</th>
                    <th className="p-4">Fecha</th>
                    <th className="p-4 text-right">Monto USD</th>
                    <th className="p-4 text-right">Monto BS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {creditPurchases.map((p, i) => (
                    <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-4 font-bold">{p.supplierName}</td>
                      <td className="p-4 text-slate-400">{new Date(p.date).toLocaleDateString()}</td>
                      <td className="p-4 text-right font-black text-rose-400">${p.totalUSD.toFixed(2)}</td>
                      <td className="p-4 text-right font-black text-emerald-400">Bs. {calculateBS(p.totalUSD, p.status, p.exchangeRate, settings.exchangeRate).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
        break;

      case 'clients_ranking':
        title = "Ranking de Clientes";
        const clientRanking = customers
          .map(c => {
            const clientSales = sales.filter(s => s.customerId === c.id);
            const totalUSD = clientSales.reduce((sum, s) => sum + s.totalUSD, 0);
            const totalBS = clientSales.reduce((sum, s) => sum + calculateBS(s.totalUSD, s.status, s.exchangeRate, settings.exchangeRate), 0);
            return {
              name: c.name,
              totalUSD,
              totalBS
            };
          })
          .filter(c => c.totalUSD > 0)
          .sort((a, b) => b.totalUSD - a.totalUSD);
        
        content = (
          <div className="space-y-4">
            <div className="bg-[#0f172a] rounded-2xl overflow-hidden border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1e293b] text-slate-400 font-black uppercase tracking-widest">
                  <tr>
                    <th className="p-4">Cliente</th>
                    <th className="p-4 text-right">Total (USD)</th>
                    <th className="p-4 text-right">Total (BS)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {clientRanking.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-4 font-bold">{c.name}</td>
                      <td className="p-4 text-right font-black text-emerald-400">${c.totalUSD.toFixed(2)}</td>
                      <td className="p-4 text-right font-black text-emerald-500/70">Bs. {c.totalBS.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
        break;

      case 'promotions_delivered': {
        title = "Promociones y Premios Entregados";

        // Consolidate delivered promotions list
        const list: {
          id: string;
          date: string;
          customerId: string;
          customerName: string;
          customerPhone?: string;
          promotionId: string;
          promotionName: string;
          productName: string;
          quantity: number;
          source: string;
        }[] = [];

        // Helper maps
        const customerMap = new Map<string, Customer>();
        customers.forEach(c => customerMap.set(c.id, c));

        const promoMap = new Map<string, Promotion>();
        localPromotions.forEach(p => promoMap.set(p.id, p));

        // Consolidar lista de promociones y premios entregados
        // Fuente canónica de fidelidad: customer_promotions con totalRedeemed > 0
        const validCustomerPromos = localCustomerPromos.filter(cp => (cp.totalRedeemed || 0) > 0);

        // Movimientos de tipo obsequio
        const promoMovements = movements.filter(m => m.type === 'obsequio');
        const processedMovementIds = new Set<string>();

        // 1. Asignar primero movimientos que ya tengan customerId explícito coincidente
        validCustomerPromos.forEach(cp => {
          const cust = customerMap.get(cp.customerId);
          const promo = promoMap.get(cp.promotionId);
          const custName = cust?.name || 'Cliente';
          const custPhone = cust?.phone;
          const promoName = promo?.name || 'Promoción de Fidelidad';
          const prizeName = promo?.name ? `Premio: ${promo.name}` : 'Premio de Promoción';
          const rewardQty = promo?.rewardQuantity || 1;
          const targetCount = Number(cp.totalRedeemed) || 0;

          // Buscar movimientos explícitamente asociados a este cliente y promoción
          const explicitMatches = promoMovements.filter(m => 
            !processedMovementIds.has(m.id) &&
            m.customerId === cp.customerId &&
            (m.promotionId === cp.promotionId || m.relatedId === cp.promotionId)
          );

          explicitMatches.slice(0, targetCount).forEach(m => {
            processedMovementIds.add(m.id);
            list.push({
              id: m.id,
              date: m.date,
              customerId: cp.customerId,
              customerName: custName,
              customerPhone: custPhone,
              promotionId: cp.promotionId,
              promotionName: promoName,
              productName: m.productName || prizeName,
              quantity: Math.abs(m.quantity) || rewardQty,
              source: 'Canje de Promoción'
            });
          });
        });

        // 2. Asociar movimientos históricos que tienen relatedId = promo.id pero no tenían customerId
        // a los clientes que canjearon esa misma promoción (en orden cronológico)
        const unassignedPromoMovements = promoMovements
          .filter(m => !processedMovementIds.has(m.id))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        validCustomerPromos.forEach(cp => {
          const cust = customerMap.get(cp.customerId);
          const promo = promoMap.get(cp.promotionId);
          const custName = cust?.name || 'Cliente';
          const custPhone = cust?.phone;
          const promoName = promo?.name || 'Promoción de Fidelidad';
          const prizeName = promo?.name ? `Premio: ${promo.name}` : 'Premio de Promoción';
          const rewardQty = promo?.rewardQuantity || 1;
          const targetCount = Number(cp.totalRedeemed) || 0;

          const alreadyAdded = list.filter(item => 
            item.customerId === cp.customerId && item.promotionId === cp.promotionId
          ).length;

          let missing = targetCount - alreadyAdded;
          if (missing <= 0) return;

          // Tomar movimientos no asignados de esta promoción para este cliente
          for (let i = 0; i < unassignedPromoMovements.length && missing > 0; i++) {
            const m = unassignedPromoMovements[i];
            if (processedMovementIds.has(m.id)) continue;

            const matchesPromo = (m.promotionId === cp.promotionId) || (m.relatedId === cp.promotionId);
            if (matchesPromo) {
              processedMovementIds.add(m.id);
              list.push({
                id: m.id,
                date: m.date,
                customerId: cp.customerId,
                customerName: custName,
                customerPhone: custPhone,
                promotionId: cp.promotionId,
                promotionName: promoName,
                productName: m.productName || prizeName,
                quantity: Math.abs(m.quantity) || rewardQty,
                source: 'Canje de Promoción'
              });
              missing--;
            }
          }

          // Si aún faltan entregas, generar con la fecha de lastUpdate del cliente
          for (let i = 0; i < missing; i++) {
            list.push({
              id: `cp-redeemed-${cp.id}-${i}`,
              date: cp.lastUpdate || new Date().toISOString(),
              customerId: cp.customerId,
              customerName: custName,
              customerPhone: custPhone,
              promotionId: cp.promotionId,
              promotionName: promoName,
              productName: prizeName,
              quantity: rewardQty,
              source: 'Canje de Promoción'
            });
          }
        });

        // Chronological sort
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Filter by date range
        const inPeriod = list.filter(item => {
          const d = item.date.split('T')[0];
          return d >= startDate && d <= endDate;
        });

        // Filter by customer
        const customerFiltered = selectedCustomerFilter === 'all' 
          ? inPeriod 
          : inPeriod.filter(item => item.customerId === selectedCustomerFilter);

        // Filter by search term
        const term = searchTerm.toLowerCase().trim();
        const finalDeliveries = term === '' 
          ? customerFiltered 
          : customerFiltered.filter(item => 
              item.customerName.toLowerCase().includes(term) ||
              (item.customerPhone && item.customerPhone.includes(term)) ||
              item.promotionName.toLowerCase().includes(term) ||
              item.productName.toLowerCase().includes(term)
            );

        // Metrics
        const totalDeliveriesCount = finalDeliveries.length;
        const totalUnitsDelivered = finalDeliveries.reduce((sum, d) => sum + d.quantity, 0);
        const distinctCustomersCount = new Set(finalDeliveries.map(d => d.customerId)).size;

        const formatUnits = (val: number) => {
          const rounded = Math.round((val + Number.EPSILON) * 100) / 100;
          return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
        };

        const promoCountMap: { [name: string]: number } = {};
        finalDeliveries.forEach(d => {
          promoCountMap[d.promotionName] = (promoCountMap[d.promotionName] || 0) + 1;
        });
        const topPromoEntry = Object.entries(promoCountMap).sort((a, b) => b[1] - a[1])[0];
        const topPromoName = topPromoEntry ? `${topPromoEntry[0]} (${topPromoEntry[1]})` : 'Sin datos';

        // Group by customer
        const groupedByCustomer: {
          customerId: string;
          customerName: string;
          customerPhone?: string;
          totalDeliveries: number;
          totalUnits: number;
          deliveries: typeof finalDeliveries;
        }[] = [];

        const customerGroups: { [id: string]: typeof groupedByCustomer[0] } = {};
        finalDeliveries.forEach(item => {
          if (!customerGroups[item.customerId]) {
            customerGroups[item.customerId] = {
              customerId: item.customerId,
              customerName: item.customerName,
              customerPhone: item.customerPhone,
              totalDeliveries: 0,
              totalUnits: 0,
              deliveries: []
            };
            groupedByCustomer.push(customerGroups[item.customerId]);
          }
          customerGroups[item.customerId].totalDeliveries += 1;
          customerGroups[item.customerId].totalUnits += item.quantity;
          customerGroups[item.customerId].deliveries.push(item);
        });

        groupedByCustomer.sort((a, b) => b.totalDeliveries - a.totalDeliveries);

        // All distinct customers in history for the filter selector
        const customersWithDeliveries = Array.from(new Set(list.map(l => l.customerId)))
          .map(id => {
            const match = list.find(l => l.customerId === id);
            return { id, name: match?.customerName || 'Cliente' };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        const handlePresetPeriod = (preset: 'today' | '7days' | 'this_month' | 'last_month' | 'all') => {
          const now = new Date();
          const todayStr = now.toISOString().split('T')[0];

          if (preset === 'today') {
            setStartDate(todayStr);
            setEndDate(todayStr);
          } else if (preset === '7days') {
            const past7 = new Date();
            past7.setDate(now.getDate() - 7);
            setStartDate(past7.toISOString().split('T')[0]);
            setEndDate(todayStr);
          } else if (preset === 'this_month') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            setStartDate(firstDay);
            setEndDate(todayStr);
          } else if (preset === 'last_month') {
            const firstDayPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
            const lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
            setStartDate(firstDayPrev);
            setEndDate(lastDayPrev);
          } else if (preset === 'all') {
            setStartDate('2020-01-01');
            setEndDate(todayStr);
          }
        };

        const exportCSV = () => {
          const headers = ['ID', 'Fecha', 'Hora', 'Cliente', 'Telefono', 'Promocion', 'Premio_Entregado', 'Cantidad', 'Origen'];
          const rows = finalDeliveries.map(r => {
            const d = new Date(r.date);
            const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString() : r.date;
            const timeStr = !isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            return [
              `"${r.id}"`,
              `"${dateStr}"`,
              `"${timeStr}"`,
              `"${(r.customerName || '').replace(/"/g, '""')}"`,
              `"${(r.customerPhone || '').replace(/"/g, '""')}"`,
              `"${(r.promotionName || '').replace(/"/g, '""')}"`,
              `"${(r.productName || '').replace(/"/g, '""')}"`,
              r.quantity,
              `"${r.source}"`
            ];
          });

          const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
          ].join('\n');

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          const url = URL.createObjectURL(blob);
          link.setAttribute('href', url);
          link.setAttribute('download', `promociones_entregadas_${startDate}_al_${endDate}.csv`);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        };

        content = (
          <div className="space-y-6">
            {/* Control Bar: Date pickers & presets */}
            <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700 space-y-4">
              <div className="flex flex-col md:flex-row items-center gap-4">
                <div className="flex-1 w-full">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Desde</label>
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-orange-500 transition-all" 
                  />
                </div>
                <div className="flex-1 w-full">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Hasta</label>
                  <input 
                    type="date" 
                    value={endDate} 
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-orange-500 transition-all" 
                  />
                </div>
              </div>

              {/* Quick Period Presets */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-700/50">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Período rápido:</span>
                <button 
                  onClick={() => handlePresetPeriod('today')}
                  className="px-3 py-1.5 rounded-lg bg-[#0f172a] hover:bg-orange-500/20 text-slate-300 hover:text-orange-400 text-[10px] font-bold uppercase transition-all border border-slate-700"
                >
                  Hoy
                </button>
                <button 
                  onClick={() => handlePresetPeriod('7days')}
                  className="px-3 py-1.5 rounded-lg bg-[#0f172a] hover:bg-orange-500/20 text-slate-300 hover:text-orange-400 text-[10px] font-bold uppercase transition-all border border-slate-700"
                >
                  Últimos 7 días
                </button>
                <button 
                  onClick={() => handlePresetPeriod('this_month')}
                  className="px-3 py-1.5 rounded-lg bg-[#0f172a] hover:bg-orange-500/20 text-slate-300 hover:text-orange-400 text-[10px] font-bold uppercase transition-all border border-slate-700"
                >
                  Este Mes
                </button>
                <button 
                  onClick={() => handlePresetPeriod('last_month')}
                  className="px-3 py-1.5 rounded-lg bg-[#0f172a] hover:bg-orange-500/20 text-slate-300 hover:text-orange-400 text-[10px] font-bold uppercase transition-all border border-slate-700"
                >
                  Mes Anterior
                </button>
                <button 
                  onClick={() => handlePresetPeriod('all')}
                  className="px-3 py-1.5 rounded-lg bg-[#0f172a] hover:bg-orange-500/20 text-slate-300 hover:text-orange-400 text-[10px] font-bold uppercase transition-all border border-slate-700"
                >
                  Todo el Historial
                </button>
              </div>

              {/* Customer Selector & Mode Switch */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-700/50">
                <div className="w-full sm:w-72">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-1">
                    <Filter size={12} className="text-orange-500" /> Filtrar por Cliente
                  </label>
                  <select 
                    value={selectedCustomerFilter}
                    onChange={(e) => setSelectedCustomerFilter(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-orange-500 uppercase transition-all mt-1"
                  >
                    <option value="all">TODOS LOS CLIENTES ({customersWithDeliveries.length})</option>
                    {customersWithDeliveries.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto self-end">
                  <div className="flex bg-[#0f172a] p-1 rounded-xl border border-slate-700 w-full sm:w-auto">
                    <button 
                      onClick={() => setPromoViewMode('by_customer')}
                      className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                        promoViewMode === 'by_customer' 
                          ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Users size={14} /> Por Cliente
                    </button>
                    <button 
                      onClick={() => setPromoViewMode('chronological')}
                      className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                        promoViewMode === 'chronological' 
                          ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <ClipboardList size={14} /> Cronológico
                    </button>
                  </div>

                  <button 
                    onClick={exportCSV}
                    disabled={finalDeliveries.length === 0}
                    title="Exportar datos a CSV"
                    className="p-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Metric KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#1e293b] p-5 rounded-2xl border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Entregas</p>
                  <Gift size={16} className="text-orange-500" />
                </div>
                <p className="text-3xl font-black text-orange-400">{totalDeliveriesCount}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">En el período seleccionado</p>
              </div>

              <div className="bg-[#1e293b] p-5 rounded-2xl border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Clientes Beneficiados</p>
                  <Users size={16} className="text-emerald-500" />
                </div>
                <p className="text-3xl font-black text-emerald-400">{distinctCustomersCount}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Clientes distintos</p>
              </div>

              <div className="bg-[#1e293b] p-5 rounded-2xl border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Unidades Obsequiadas</p>
                  <Package size={16} className="text-indigo-400" />
                </div>
                <p className="text-3xl font-black text-indigo-400">{formatUnits(totalUnitsDelivered)}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Total artículos/premios</p>
              </div>

              <div className="bg-[#1e293b] p-5 rounded-2xl border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Campaña Principal</p>
                  <Award size={16} className="text-amber-400" />
                </div>
                <p className="text-sm font-black text-amber-300 uppercase truncate" title={topPromoName}>
                  {topPromoName}
                </p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">Más canjeada</p>
              </div>
            </div>

            {/* Body: By Customer or Chronological */}
            {finalDeliveries.length === 0 ? (
              <div className="bg-[#1e293b] rounded-2xl border border-slate-800 p-12 text-center space-y-3">
                <div className="w-16 h-16 bg-orange-500/10 text-orange-500 rounded-full flex items-center justify-center mx-auto">
                  <Gift size={32} />
                </div>
                <h4 className="text-base font-black uppercase tracking-wider text-white">No hay entregas registradas</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  No se encontraron promociones entregadas en el período del {new Date(startDate + 'T12:00:00').toLocaleDateString()} al {new Date(endDate + 'T12:00:00').toLocaleDateString()}{selectedCustomerFilter !== 'all' ? ' para el cliente seleccionado' : ''}.
                </p>
              </div>
            ) : promoViewMode === 'by_customer' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <span className="text-xs font-black uppercase text-slate-400 tracking-widest">
                    {groupedByCustomer.length} Cliente{groupedByCustomer.length === 1 ? '' : 's'} con Promociones Entregadas
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">
                    Ordenado por mayor cantidad de premios
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {groupedByCustomer.map(group => (
                    <div key={group.customerId} className="bg-[#1e293b] rounded-2xl border border-slate-700/80 overflow-hidden hover:border-orange-500/50 transition-all shadow-lg">
                      {/* Customer Card Header */}
                      <div className="p-5 bg-[#0f172a]/60 border-b border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 flex items-center justify-center font-black text-sm">
                            {group.customerName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-white uppercase tracking-tight">{group.customerName}</h4>
                            {group.customerPhone && (
                              <p className="text-[10px] font-bold text-slate-400">{group.customerPhone}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[10px] font-black uppercase tracking-wider">
                            {group.totalDeliveries} Entrega{group.totalDeliveries === 1 ? '' : 's'}
                          </span>
                          <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-black uppercase tracking-wider">
                            {formatUnits(group.totalUnits)} {group.totalUnits === 1 ? 'Unidad' : 'Unidades'}
                          </span>
                        </div>
                      </div>

                      {/* Items Delivered to this Customer */}
                      <div className="p-4 divide-y divide-slate-800">
                        {group.deliveries.map(delivery => {
                          const dateObj = new Date(delivery.date);
                          const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : delivery.date;
                          const timeStr = !isNaN(dateObj.getTime()) ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

                          return (
                            <div key={delivery.id} className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#0f172a] rounded-lg text-orange-400">
                                  <Gift size={16} />
                                </div>
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-black text-white uppercase">
                                      {delivery.productName}
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-bold uppercase tracking-wider">
                                      {delivery.promotionName}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-500 uppercase">
                                    {dateStr} {timeStr && `• ${timeStr}`} • {delivery.source}
                                  </span>
                                </div>
                              </div>

                              <div className="text-right flex items-center sm:block gap-2 pl-9 sm:pl-0">
                                <span className="text-xs font-black text-emerald-400">
                                  {delivery.quantity > 0 ? `+${formatUnits(delivery.quantity)}` : formatUnits(delivery.quantity)} {delivery.quantity === 1 ? 'unidad' : 'unidades'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Chronological Audit Table */
              <div className="bg-[#0f172a] rounded-2xl overflow-hidden border border-slate-800">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1e293b] text-slate-400 font-black uppercase tracking-widest text-[10px]">
                      <tr>
                        <th className="p-4">Fecha y Hora</th>
                        <th className="p-4">Cliente</th>
                        <th className="p-4">Promoción / Campaña</th>
                        <th className="p-4">Premio Entregado</th>
                        <th className="p-4 text-center">Cantidad</th>
                        <th className="p-4">Origen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {finalDeliveries.map((delivery) => {
                        const dateObj = new Date(delivery.date);
                        const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : delivery.date;
                        const timeStr = !isNaN(dateObj.getTime()) ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

                        return (
                          <tr key={delivery.id} className="hover:bg-slate-800/50 transition-colors">
                            <td className="p-4 font-bold text-slate-300 whitespace-nowrap">
                              <div>{dateStr}</div>
                              {timeStr && <div className="text-[10px] text-slate-500 font-normal">{timeStr}</div>}
                            </td>
                            <td className="p-4">
                              <div className="font-black text-white uppercase">{delivery.customerName}</div>
                              {delivery.customerPhone && (
                                <div className="text-[10px] text-slate-500">{delivery.customerPhone}</div>
                              )}
                            </td>
                            <td className="p-4">
                              <span className="px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[10px] font-bold uppercase whitespace-nowrap">
                                {delivery.promotionName}
                              </span>
                            </td>
                            <td className="p-4 font-bold text-slate-200">
                              <div className="flex items-center gap-2">
                                <Gift size={14} className="text-orange-400 shrink-0" />
                                <span>{delivery.productName}</span>
                              </div>
                            </td>
                            <td className="p-4 text-center">
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-black text-[11px]">
                                {formatUnits(delivery.quantity)}
                              </span>
                            </td>
                            <td className="p-4 text-slate-400 text-[10px] uppercase font-bold">
                              {delivery.source}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
        break;
      }

      default:
        title = "Reporte en Desarrollo";
        content = (
          <div className="py-20 text-center space-y-4">
            <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto">
               <BarChart3 className="text-slate-600" size={40} />
            </div>
            <p className="text-slate-400 text-sm">Estamos trabajando en la visualización detallada de este reporte.</p>
          </div>
        );
    }

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedReport(null)} />
        <div className="relative bg-[#0f172a] w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
          <header className="p-6 border-b border-slate-800 flex justify-between items-center bg-[#1e293b]/50">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSelectedReport(null)}
                className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <h2 className="text-xl font-black uppercase tracking-tighter">{title}</h2>
            </div>
            <button 
              onClick={() => setSelectedReport(null)}
              className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors"
            >
              <X size={24} />
            </button>
          </header>
          <div className="p-6 overflow-y-auto">
            {content}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {renderReportDetail()}
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reportes</h1>
          <p className="text-slate-400 text-sm">Análisis detallado de tu negocio</p>
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input 
            type="text" 
            placeholder="Buscar reporte..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-[#1e293b] border border-slate-700 rounded-2xl py-3 pl-12 pr-6 text-sm focus:outline-none focus:border-orange-500 transition-all w-full md:w-64"
          />
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {reportCards
          .filter(card => card.title.toLowerCase().includes(searchTerm.toLowerCase()))
          .map((card) => (
          <button 
            key={card.id}
            onClick={() => setSelectedReport(card.id as ReportType)}
            className="group relative flex flex-col items-center justify-center p-6 rounded-[2rem] bg-[#1e293b] border border-slate-700 hover:border-orange-500/50 transition-all hover:shadow-2xl hover:shadow-orange-500/10 active:scale-95 overflow-hidden"
          >
            <div className={`w-14 h-14 ${card.color} rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
              {card.icon}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-center text-slate-300 group-hover:text-white transition-colors">
              {card.title}
            </span>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight size={16} className="text-slate-500" />
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
        <AIAnalysis 
          sales={sales} 
          purchases={purchases} 
          expenses={expenses} 
          products={products} 
          settings={settings}
          movements={movements}
        />
        
        <div className="bg-[#1e293b] p-8 rounded-[2.5rem] border border-slate-700 shadow-xl space-y-6">
           <h2 className="text-xl font-bold flex items-center gap-2">
              <FileSpreadsheet className="text-orange-500" /> Exportar Datos
           </h2>
           <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={exportToCSV}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 border border-slate-700"
              >
                 <Download size={20} /> Ventas (CSV)
              </button>
              <button 
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 border border-slate-700 opacity-50 cursor-not-allowed"
              >
                 <Download size={20} /> Inventario (PDF)
              </button>
           </div>
        </div>

        <div className="bg-[#1e293b] p-8 rounded-[2.5rem] border border-slate-700 shadow-xl space-y-6">
           <h2 className="text-xl font-bold flex items-center gap-2">
              <PieChart className="text-emerald-500" /> Resumen Financiero
           </h2>
           <div className="space-y-4 py-4">
              <div className="flex justify-between items-center text-sm">
                 <span className="text-slate-400">Ventas Brutas:</span>
                 <div className="text-right">
                    <p className="font-bold text-white">${totalSales.toFixed(2)}</p>
                    <p className="text-[10px] text-slate-500">Bs. {totalSalesBS.toFixed(2)}</p>
                 </div>
              </div>
              <div className="flex justify-between items-center text-sm">
                 <span className="text-slate-400">Inversión (Compras):</span>
                 <div className="text-right">
                    <p className="font-bold text-rose-400">${totalPurchases.toFixed(2)}</p>
                    <p className="text-[10px] text-slate-500">Bs. {totalPurchasesBS.toFixed(2)}</p>
                 </div>
              </div>
              <div className="flex justify-between items-center text-sm">
                 <span className="text-slate-400">Gastos Operativos:</span>
                 <div className="text-right">
                    <p className="font-bold text-rose-400">${totalExpenses.toFixed(2)}</p>
                    <p className="text-[10px] text-slate-500">Bs. {totalExpensesBS.toFixed(2)}</p>
                 </div>
              </div>
              <div className="pt-4 border-t border-slate-700 flex justify-between items-center">
                 <span className="font-bold">Utilidad Neta:</span>
                 <div className="text-right">
                    <p className={`text-xl font-black ${estimatedProfit >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                      ${estimatedProfit.toFixed(2)}
                    </p>
                    <p className={`text-xs font-bold ${estimatedProfitBS >= 0 ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
                      Bs. {estimatedProfitBS.toFixed(2)}
                    </p>
                 </div>
              </div>
           </div>
        </div>

        <div className="bg-[#1e293b] p-8 rounded-[2.5rem] border border-slate-700 shadow-xl space-y-6 md:col-span-2">
           <h2 className="text-xl font-bold flex items-center gap-2">
              <TrendingUp className="text-indigo-400" /> Comparativa Financiera (USD)
           </h2>
           <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={[
                    { name: 'Ventas', total: totalSales },
                    { name: 'Compras', total: totalPurchases },
                    { name: 'Gastos', total: totalExpenses },
                 ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="total" radius={[8, 8, 0, 0]} barSize={60}>
                      <Cell fill="#10b981" />
                      <Cell fill="#f43f5e" />
                      <Cell fill="#6366f1" />
                    </Bar>
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
