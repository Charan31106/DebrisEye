import React from 'react';
import { ExternalLink, Terminal, Shield } from 'lucide-react';

export default function APIDocs() {
  return (
    <div className="w-full h-full flex flex-col bg-[#0a0e1a]">
      {/* OpenAPI Header */}
      <div className="p-4 border-b border-white/5 bg-slate-950/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-slate-100 uppercase">
              Researcher REST Gateway
            </h3>
            <span className="text-[10px] text-slate-400">
              Interactive OpenAPI Swagger sandbox
            </span>
          </div>
        </div>
        
        <a 
          href="http://localhost:4000/api/docs" 
          target="_blank" 
          rel="noreferrer" 
          className="text-[10px] uppercase font-mono tracking-widest bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 px-3 py-1 rounded flex items-center gap-1 transition-all"
        >
          Open Sandbox
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Embedded Swagger API Iframe with CSS filters to blend Swagger light mode to deep space dark mode */}
      <div className="flex-1 relative min-h-[450px]">
        {/* Glow grid backdrop */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

        <iframe 
          src="http://localhost:4000/api/docs" 
          title="DebrisEye API Documentation" 
          className="w-full h-full border-none absolute inset-0 z-10 filter invert hue-rotate-180 brightness-95 opacity-90 hover:opacity-100 transition-opacity"
          style={{ 
            colorScheme: 'dark',
            mixBlendMode: 'screen' 
          }}
        />
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-white/5 bg-slate-950/20 flex justify-between items-center text-[9px] text-slate-500 font-mono">
        <span className="flex items-center gap-1">
          <Shield className="w-3 h-3 text-blue-500" />
          Secured Rate-Limiting: 100 req/min/IP
        </span>
        <span>Version: v1.0.0</span>
      </div>
    </div>
  );
}
