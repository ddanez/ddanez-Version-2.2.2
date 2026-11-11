
import React, { useState, useEffect } from 'react';
import { Wallet, Plus, Trash2, Calendar, Tag, DollarSign, Search } from 'lucide-react';
import { Expense, AppSettings } from '../types';
import { dbService } from '../db';
import { parseNumber, calculateBS } from '../utils';

interface Props {
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  settings: AppSettings;
}

const Expenses: React.FC<Props> = ({ expenses, setExpenses, settings }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Manejar retroceso de modales con la flecha atrás de Android
  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (showAddModal) {
        e.preventDefault();
        setShowAddModal(false);
      }
    };
    window.addEventListener('app:backbutton', handleBackButton);
    return () => window.removeEventListener('app:backbutton', handleBackButton);
  }, [showAddModal]);
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    date: new Date().toISOString().split('T')[0],
    category: 'General',
    paymentMethod: 'Efectivo',
    amountUSD: 0
  });

  const handleAddExpense = async () => {
    if (!newExpense.description || !newExpense.amountUSD) return;

    const expense: Expense = {
      id: crypto.randomUUID(),
      date: newExpense.date || new Date().toISOString(),
      description: newExpense.description,
      category: newExpense.category || 'General',
      amountUSD: newExpense.amountUSD,
      amountBS: newExpense.amountUSD * settings.exchangeRate,
      exchangeRate: settings.exchangeRate,
      paymentMethod: newExpense.paymentMethod || 'Efectivo',
      notes: newExpense.notes
    };

    await dbService.put('expenses', expense);
    setExpenses(prev => [expense, ...prev]);
    setShowAddModal(false);
    setNewExpense({
      date: new Date().toISOString().split('T')[0],
      category: 'General',
      paymentMethod: 'Efectivo',
      amountUSD: 0
    });
  };

  const handleDeleteExpense = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar este gasto?')) {
      await dbService.delete('expenses', id);
      setExpenses(prev => prev.filter(e => e.id !== id));
    }
  };

  const filteredExpenses = expenses.filter(e => 
    e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const categories = ['General', 'Alquiler', 'Servicios', 'Sueldos', 'Transporte', 'Mantenimiento', 'Publicidad', 'Otros'];
  const paymentMethods = ['Efectivo', 'Pago Móvil', 'Transferencia', 'Zelle', 'Divisas'];

  const totalExpensesUSD = filteredExpenses.reduce((sum, e) => sum + e.amountUSD, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Gastos Operativos</h1>
          <p className="text-slate-400 text-sm">Registro de egresos no relacionados a inventario</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-rose-500 hover:bg-rose-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-rose-500/20 transition-all transform hover:scale-105"
        >
          <Plus size={18} /> Nuevo Gasto
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1e293b] p-6 rounded-3xl border border-slate-700 md:col-span-2 flex items-center gap-3">
          <Search className="text-slate-500" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por descripción o categoría..." 
            className="bg-transparent border-none outline-none text-white w-full text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="bg-rose-500/10 border border-rose-500/20 p-6 rounded-3xl flex justify-between items-center">
          <div>
            <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest leading-none mb-1">Total Filtrado</p>
            <p className="text-2xl font-black text-white leading-none">${totalExpensesUSD.toFixed(2)}</p>
          </div>
          <Wallet className="text-rose-500 opacity-30" size={32} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredExpenses.map(expense => (
          <div key={expense.id} className="bg-[#1e293b] p-6 rounded-3xl border border-slate-700 hover:border-slate-500 transition-all group">
            <div className="flex justify-between items-start">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center shrink-0">
                  <Wallet size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-white uppercase tracking-tight">{expense.description}</h3>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <span className="text-[8px] font-black uppercase tracking-widest bg-slate-800 text-slate-400 px-2 py-1 rounded-lg border border-slate-700">{expense.category}</span>
                    <span className="text-[8px] font-black uppercase tracking-widest bg-slate-800 text-slate-400 px-2 py-1 rounded-lg border border-slate-700">{expense.paymentMethod}</span>
                    <span className="text-[8px] font-black uppercase tracking-widest bg-slate-800 text-slate-400 px-2 py-1 rounded-lg border border-slate-700">{new Date(expense.date).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-2">
                <div>
                  <p className="text-xl font-black text-white leading-none">${expense.amountUSD.toFixed(2)}</p>
                  <p className="text-[10px] font-bold text-rose-400 mt-1">{calculateBS(expense.amountUSD, 'paid', expense.exchangeRate, settings.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</p>
                </div>
                <button 
                  onClick={() => handleDeleteExpense(expense.id)}
                  className="p-2 text-slate-600 hover:text-rose-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            {expense.notes && (
              <p className="mt-4 text-xs text-slate-500 italic border-t border-slate-800 pt-3">
                Nota: {expense.notes}
              </p>
            )}
          </div>
        ))}

        {filteredExpenses.length === 0 && (
          <div className="py-20 text-center space-y-4">
            <div className="bg-[#1e293b] w-16 h-16 rounded-full flex items-center justify-center mx-auto text-slate-700">
              <Wallet size={32} />
            </div>
            <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">No se encontraron gastos</p>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="bg-[#1e293b] w-full max-w-lg rounded-[2.5rem] p-8 border border-slate-700 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Registrar Gasto</h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 text-slate-500 hover:text-white"><Plus className="rotate-45" /></button>
            </div>

            <div className="space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Descripción</label>
                <input 
                  type="text" 
                  placeholder="Ej: Pago de Electricidad"
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-white outline-none focus:border-rose-500 transition-colors"
                  value={newExpense.description || ''}
                  onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Monto (USD)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      type="number" 
                      step="0.01"
                      lang="en-US"
                      className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 pl-10 text-white outline-none focus:border-rose-500 transition-colors"
                      value={newExpense.amountUSD || ''}
                      onChange={(e) => setNewExpense({...newExpense, amountUSD: parseNumber(e.target.value) || 0})}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Fecha</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      type="date" 
                      className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 pl-10 text-white outline-none focus:border-rose-500 transition-colors"
                      value={newExpense.date || ''}
                      onChange={(e) => setNewExpense({...newExpense, date: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Categoría</label>
                  <select 
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-white outline-none focus:border-rose-500 transition-colors appearance-none"
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Método de Pago</label>
                  <select 
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-white outline-none focus:border-rose-500 transition-colors appearance-none"
                    value={newExpense.paymentMethod}
                    onChange={(e) => setNewExpense({...newExpense, paymentMethod: e.target.value})}
                  >
                    {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Notas (Opcional)</label>
                <textarea 
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-2xl p-4 text-white outline-none focus:border-rose-500 transition-colors h-24 resize-none"
                  value={newExpense.notes || ''}
                  onChange={(e) => setNewExpense({...newExpense, notes: e.target.value})}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-4 font-black text-slate-500 uppercase text-xs tracking-widest"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleAddExpense}
                  className="flex-1 bg-rose-500 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-rose-500/20"
                >
                  Guardar Gasto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
