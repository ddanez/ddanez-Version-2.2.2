import React, { useState } from 'react';
import { TrendingUp, Save, DollarSign, RefreshCw, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { parseNumber } from '../utils';
import { fetchBcvRate } from '../services/bcvService';

interface Props {
  onSave: (rate: number, source?: string) => void;
  currentRate: number;
  onClose?: () => void;
}

const ExchangeRateModal: React.FC<Props> = ({ onSave, currentRate, onClose }) => {
  const [rate, setRate] = useState(currentRate > 0 ? currentRate.toString() : '');
  const [rateSource, setRateSource] = useState<string>('Manual');
  const [isLoadingBcv, setIsLoadingBcv] = useState(false);
  const [bcvStatus, setBcvStatus] = useState<{ message: string; isError?: boolean } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseNumber(rate);
    if (val > 0) onSave(val, rateSource);
  };

  const handleFetchBcv = async () => {
    setIsLoadingBcv(true);
    setBcvStatus(null);
    try {
      const result = await fetchBcvRate();
      if (result.success && result.rate > 0) {
        setRate(result.rate.toString());
        setRateSource(result.source || 'Banco Central de Venezuela (Oficial)');
        setBcvStatus({
          message: `Tasa BCV obtenida: ${result.rate.toFixed(2)} Bs/$ (${result.date})`,
          isError: false
        });
      } else {
        setBcvStatus({
          message: result.error || 'No se pudo obtener la tasa oficial automáticamente.',
          isError: true
        });
      }
    } catch (err: any) {
      setBcvStatus({
        message: 'Error al conectar con el servicio del BCV.',
        isError: true
      });
    } finally {
      setIsLoadingBcv(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[150] flex items-center justify-center p-4">
      <div className="bg-[#1e293b] w-full max-w-md rounded-[3rem] p-8 sm:p-10 border border-slate-700 shadow-[0_35px_60px_-15px_rgba(0,0,0,0.6)] animate-in zoom-in-95 duration-300 relative">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X size={20} />
          </button>
        )}

        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-tr from-orange-500 to-amber-500 rounded-[1.8rem] flex items-center justify-center shadow-xl shadow-orange-500/30 mb-4">
            <TrendingUp className="text-white" size={32} />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">Actualizar Tasa</h2>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Valor oficial en Bolívares (Bs/$)</p>
        </div>

        {/* Botón de Actualización Automática BCV */}
        <div className="mb-6">
          <button
            type="button"
            onClick={handleFetchBcv}
            disabled={isLoadingBcv}
            className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-600 text-white font-black py-3.5 px-4 rounded-2xl transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-600/20 active:scale-98 border border-emerald-400/30"
          >
            <RefreshCw size={18} className={isLoadingBcv ? 'animate-spin' : ''} />
            <span className="text-xs uppercase tracking-wider">
              {isLoadingBcv ? 'Consultando BCV...' : 'Consultar Tasa Oficial BCV'}
            </span>
          </button>

          {bcvStatus && (
            <div className={`mt-2.5 p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${bcvStatus.isError ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400' : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'}`}>
              {bcvStatus.isError ? <AlertCircle size={16} className="shrink-0" /> : <CheckCircle2 size={16} className="shrink-0" />}
              <span className="leading-snug">{bcvStatus.message}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative group">
            <div className="absolute -top-3 left-6 px-3 bg-[#1e293b] text-[10px] font-black text-orange-500 uppercase tracking-[0.3em] z-10 transition-colors group-focus-within:text-white">
              Precio en Bolívares (Bs)
            </div>
            <div className="relative flex items-center">
              <div className="absolute left-6 text-slate-500 group-focus-within:text-orange-500 transition-colors">
                <DollarSign size={24} />
              </div>
              <input
                type="number"
                step="0.01"
                lang="en-US"
                value={rate}
                onChange={(e) => {
                  setRate(e.target.value);
                  setRateSource('Manual');
                }}
                placeholder="0.00"
                className="w-full bg-[#0f172a] border-2 border-slate-700 rounded-[2rem] px-14 py-6 text-3xl sm:text-4xl font-black text-white focus:outline-none focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 transition-all text-center tracking-tighter"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/50 text-center">
            <p className="text-[11px] text-slate-300 font-medium">
              Esta tasa se aplicará automáticamente a todas las conversiones de facturas, ventas, compras y reportes.
            </p>
          </div>

          <div className="flex gap-3">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-4 rounded-2xl transition-all text-xs uppercase tracking-wider"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-orange-500/30 active:scale-95 uppercase tracking-[0.2em] text-xs"
            >
              <Save size={18} />
              Establecer Valor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExchangeRateModal;
