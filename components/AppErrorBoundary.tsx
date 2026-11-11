
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center p-6 font-sans">
          <div className="bg-[#1e293b] border border-rose-500/30 p-8 rounded-[2rem] max-w-lg w-full shadow-2xl">
            <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tighter mb-2">Error de Aplicación</h1>
            <p className="text-slate-400 text-sm mb-6 font-bold uppercase tracking-tight">
              Algo salió mal al cargar la interfaz. Esto puede deberse a un error en el código o un problema de conexión.
            </p>
            
            <div className="bg-black/40 rounded-xl p-4 mb-6 overflow-auto max-h-40 border border-slate-700">
              <p className="text-rose-400 font-mono text-xs break-all">
                {this.state.error && this.state.error.toString()}
              </p>
              {this.state.errorInfo && (
                <pre className="text-slate-500 font-mono text-[10px] mt-2 leading-tight">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={() => window.location.reload()}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-orange-500/20 uppercase text-[10px] tracking-widest"
              >
                Recargar Aplicación
              </button>
              <button 
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-black py-4 rounded-xl transition-all uppercase text-[10px] tracking-widest"
              >
                Limpiar Datos y Reintentar
              </button>
            </div>
            
            <p className="mt-6 text-center text-[9px] text-slate-500 font-bold uppercase tracking-widest">
              Usa el botón azul de la esquina (Eruda) para ver más detalles técnicos.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
