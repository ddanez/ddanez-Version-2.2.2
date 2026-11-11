
import React from 'react';
import { Package } from 'lucide-react';
import { CompanyInfo } from '../types';

interface SplashProps {
  company: CompanyInfo;
}

const Splash: React.FC<SplashProps> = ({ company }) => {
  const logoSrc = company.logo || '/logo.png';

  return (
    <div className="fixed inset-0 bg-[#0f172a] flex flex-col items-center justify-between py-20 z-[100]">
      <div className="flex-1 flex items-center justify-center">
        <div className="relative">
          <div className="w-56 h-56 flex items-center justify-center animate-pulse">
            <img src={logoSrc} alt="Logo D'Danez" className="w-full h-full object-contain drop-shadow-2xl" />
          </div>
        </div>
      </div>

      <div className="text-center space-y-6 px-6">
         <h1 className="text-3xl font-black text-white tracking-tighter uppercase">{company.name}</h1>
         <div className="w-48 bg-slate-800 h-1 rounded-full overflow-hidden mx-auto">
           <div className="bg-orange-500 h-full w-1/3 animate-[loading_2s_ease-in-out_infinite]"></div>
         </div>
      </div>

      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
};

export default Splash;
