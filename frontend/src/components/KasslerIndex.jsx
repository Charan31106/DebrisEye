import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Shield, ShieldAlert, ShieldOff, HelpCircle } from 'lucide-react';

export default function KasslerIndex({ currentScore }) {
  const [history, setHistory] = useState([]);
  const [factors, setFactors] = useState(null);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    // Fetch historical kessler snapshots
    fetch('/api/kessler-index')
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setHistory(res.history);
          if (res.current && res.current.factors) {
            setFactors(res.current.factors);
          }
        }
      })
      .catch(e => console.error('[KesslerCard] Error loading historic snapshots:', e));
  }, [currentScore]);

  // Color mapping based on score ranges (0-30 green, 31-60 amber, 61-100 red)
  const getTheme = (score) => {
    if (score <= 30) {
      return {
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10 border-emerald-500/20',
        glow: 'glow-text-blue shadow-emerald-500/10',
        icon: Shield,
        label: 'Stable Environment'
      };
    } else if (score <= 60) {
      return {
        color: 'text-amber-400',
        bg: 'bg-amber-500/10 border-amber-500/20',
        glow: 'glow-text-amber shadow-amber-500/10',
        icon: ShieldAlert,
        label: 'Elevated Threat'
      };
    } else {
      return {
        color: 'text-rose-500',
        bg: 'bg-rose-500/10 border-rose-500/20',
        glow: 'glow-text-red shadow-rose-500/10',
        icon: ShieldOff,
        label: 'Critical Cascade Risk'
      };
    }
  };

  const theme = getTheme(currentScore);

  return (
    <div className={`glass-card p-6 rounded-xl border relative overflow-hidden ${theme.bg}`}>
      {/* Decorative grid background lines */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent pointer-events-none" />

      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold flex items-center gap-1.5">
            LEO Command Metrics
            <button 
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onClick={() => setShowTooltip(!showTooltip)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </span>
          <h2 className="text-lg font-display text-slate-100 mt-0.5">Kessler Risk Index</h2>
        </div>
        <theme.icon className={`w-6 h-6 ${theme.color}`} />
      </div>

      {/* Tooltip Overlay */}
      {showTooltip && (
        <div className="absolute inset-x-6 top-16 bg-slate-900/95 border border-slate-700 p-3 rounded-lg text-xs text-slate-300 z-20 shadow-xl leading-relaxed">
          The Kessler Index measures LEO orbital health (0-100). It factors in debris density, high-threat conjunction alerts, and cascade collision chain reaction probabilities.
        </div>
      )}

      {/* Giant Numbers count-up aesthetic */}
      <div className="my-5 flex items-baseline gap-2.5">
        <span className={`text-6xl font-display font-bold tracking-tight select-all leading-none ${theme.color} ${theme.glow}`}>
          {currentScore.toFixed(1)}
        </span>
        <div className="flex flex-col">
          <span className={`text-xs font-semibold uppercase tracking-wider ${theme.color}`}>
            {theme.label}
          </span>
          <span className="text-[10px] text-slate-400">
            Cascade initiation probability
          </span>
        </div>
      </div>

      {/* Contributing Factors Grid — always rendered, dashes when loading */}
      <div className="grid grid-cols-2 gap-2 mt-4 text-[10px] font-mono border-t border-white/5 pt-4">
        <div className="bg-slate-900/35 border border-white/5 p-2 rounded flex flex-col justify-between">
          <span className="text-slate-400 block uppercase tracking-wider text-[8px] font-bold">Tracked Catalog</span>
          <span className="text-slate-200 font-bold text-xs mt-0.5">
            {factors ? `${factors.totalObjectsTracked} assets` : '— loading'}
          </span>
        </div>
        <div className="bg-slate-900/35 border border-white/5 p-2 rounded flex flex-col justify-between">
          <span className="text-slate-400 block uppercase tracking-wider text-[8px] font-bold">LEO Zone Count</span>
          <span className="text-slate-200 font-bold text-xs mt-0.5">
            {factors ? `${factors.leoObjectsCount} objects` : '— loading'}
          </span>
        </div>
        <div className="bg-slate-900/35 border border-white/5 p-2 rounded flex flex-col justify-between">
          <span className="text-slate-400 block uppercase tracking-wider text-[8px] font-bold">Active Threats</span>
          <span className={`${factors && factors.criticalConjunctionsCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'} font-bold text-xs mt-0.5`}>
            {factors ? `${factors.criticalConjunctionsCount} events` : '— loading'}
          </span>
        </div>
        <div className="bg-slate-900/35 border border-white/5 p-2 rounded flex flex-col justify-between">
          <span className="text-slate-400 block uppercase tracking-wider text-[8px] font-bold">LEO Risk Density</span>
          <span className="text-blue-400 font-bold text-xs mt-0.5">
            {factors ? `${(factors.leoDensityScore || 0).toFixed(1)} / 10` : '— loading'}
          </span>
        </div>
      </div>


      {/* Historical Sparkline AreaChart */}
      <div className="h-[75px] w-full mt-6">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <defs>
              <linearGradient id="colorKessler" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={currentScore <= 30 ? '#10b981' : (currentScore <= 60 ? '#f59e0b' : '#f43f5e')} stopOpacity={0.25}/>
                <stop offset="95%" stopColor={currentScore <= 30 ? '#10b981' : (currentScore <= 60 ? '#f59e0b' : '#f43f5e')} stopOpacity={0.0}/>
              </linearGradient>
            </defs>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-slate-900 border border-slate-800 p-2 rounded text-[10px] text-slate-300">
                      <p className="font-semibold">{payload[0].payload.date}</p>
                      <p className="text-blue-400">Risk Level: {payload[0].value}</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke={currentScore <= 30 ? '#10b981' : (currentScore <= 60 ? '#f59e0b' : '#f43f5e')}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorKessler)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2 px-1">
        <span>30 Days Ago</span>
        <span>Active Grid Feed</span>
        <span>Live</span>
      </div>
    </div>
  );
}
