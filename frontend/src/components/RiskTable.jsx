import React, { useEffect, useState } from 'react';
import { AlertTriangle, ShieldCheck, Zap } from 'lucide-react';

export default function RiskTable({ onSelectObject }) {
  const [conjunctions, setConjunctions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchConjunctions = () => {
    fetch('/api/conjunctions')
      .then(res => res.json())
      .then(res => {
        if (res.success && res.data) {
          // Take top 10
          setConjunctions(res.data.slice(0, 10));
        }
        setLoading(false);
      })
      .catch(e => {
        console.error('[RiskTable] Failed to fetch conjunctions:', e);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchConjunctions();
    
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchConjunctions, 60000);
    return () => clearInterval(interval);
  }, []);

  const getRiskBadge = (level, pc) => {
    switch (level) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/15 border border-rose-500/30 text-rose-400">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
            Critical ({pc.toExponential(1)})
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Warning ({pc.toExponential(1)})
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 border border-blue-500/30 text-blue-400">
            <ShieldCheck className="w-3 h-3" />
            Low Risk
          </span>
        );
    }
  };

  return (
    <div className="glass-panel rounded-xl border border-white/5 flex flex-col">
      <div className="p-4 border-b border-white/5 bg-slate-950/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold tracking-wide text-slate-100 uppercase">
            Top Conjunction Warnings
          </h3>
        </div>
        <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full font-mono">
          Live feed
        </span>
      </div>

      {/* Visual Instruction Banner */}
      <div className="bg-rose-500/10 border-b border-rose-500/20 p-2.5 text-[10px] text-rose-300 leading-relaxed font-mono">
        💡 <span className="font-bold text-white">OPERATIONAL GUIDANCE:</span> Click any warning event below to visualize both orbits simultaneously on the 3D globe and simulate escape maneuvers.
      </div>

      <div className="w-full min-h-[250px]">
        {loading ? (
          <div className="flex items-center justify-center h-full min-h-[250px]">
            <Zap className="w-5 h-5 text-blue-400 animate-bounce" />
            <span className="text-xs text-slate-400 ml-2 animate-pulse">Running orbital scan...</span>
          </div>
        ) : conjunctions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[250px] p-6 text-center">
            <ShieldCheck className="w-8 h-8 text-emerald-400 mb-2 opacity-60" />
            <span className="text-xs text-slate-300 font-medium">No High-Risk Conjunctions Found</span>
            <span className="text-[10px] text-slate-500 mt-1">LEO tracking catalog scans are normal.</span>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-900/30">
                <th className="py-2.5 px-4">Primary Target</th>
                <th className="py-2.5 px-4">Challenger Object</th>
                <th className="py-2.5 px-4">TCA (UTC)</th>
                <th className="py-2.5 px-4 text-right">Miss (m)</th>
                <th className="py-2.5 px-4 text-center">Risk Badge</th>
              </tr>
            </thead>
            <tbody>
              {conjunctions.map((conj, idx) => (
                <tr 
                  key={conj.id} 
                  onClick={() => onSelectObject(`${conj.object1Id},${conj.object2Id}`)}
                  className="border-b border-white/5 text-xs hover:bg-blue-500/5 transition-colors cursor-pointer group"
                >
                  <td className="py-3 px-4 font-semibold text-slate-200 group-hover:text-blue-400 transition-colors">
                    {conj.object1Name || `NORAD ${conj.object1Id}`}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-300">
                    {conj.object2Name || `NORAD ${conj.object2Id}`}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400">
                    {new Date(conj.tca).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false
                    })}
                  </td>
                  <td className="py-3 px-4 font-mono text-right text-slate-300 font-semibold">
                    {conj.missDistance.toLocaleString(undefined, { maximumFractionDigits: 1 })}m
                  </td>
                  <td className="py-3 px-4 text-center">
                    {getRiskBadge(conj.riskLevel, conj.pc)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
