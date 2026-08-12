import React, { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, Info, Compass, ShieldAlert, Crosshair, RefreshCw } from 'lucide-react';

export default function Sidebar({ onSelectObject, activeFilters, onChangeFilters }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [minAlt, setMinAlt] = useState(0);
  const [maxAlt, setMaxAlt] = useState(20000);
  const [minInc, setMinInc] = useState(0);
  const [maxInc, setMaxInc] = useState(180);
  const [onlyHighRisk, setOnlyHighRisk] = useState(false);
  
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Trigger search API queries on filter adjustments
  useEffect(() => {
    setSearching(true);
    const delayDebounce = setTimeout(() => {
      const queryParams = new URLSearchParams();
      if (searchTerm) queryParams.append('search', searchTerm);
      if (minAlt > 0) queryParams.append('minAlt', minAlt);
      if (maxAlt < 20000) queryParams.append('maxAlt', maxAlt);
      if (minInc > 0) queryParams.append('minInc', minInc);
      if (maxInc < 180) queryParams.append('maxInc', maxInc);
      if (onlyHighRisk) queryParams.append('minRisk', '1e-5');

      fetch(`/api/debris?${queryParams.toString()}&limit=20`)
        .then(res => res.json())
        .then(res => {
          if (res.success && res.data) {
            setSearchResults(res.data);
            
            // Sync up outer dashboard filters to update the points drawn on 3D globe!
            onChangeFilters({
              search: searchTerm,
              minAlt,
              maxAlt,
              minInc,
              maxInc,
              minRisk: onlyHighRisk ? 1e-5 : 0
            });
          }
          setSearching(false);
        })
        .catch(e => {
          console.error('[Sidebar] Search failed:', e);
          setSearching(false);
        });
    }, 400); // Debounce API calls by 400ms

    return () => clearTimeout(delayDebounce);
  }, [searchTerm, minAlt, maxAlt, minInc, maxInc, onlyHighRisk]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setMinAlt(0);
    setMaxAlt(20000);
    setMinInc(0);
    setMaxInc(180);
    setOnlyHighRisk(false);
  };

  return (
    <div className="w-full glass-panel border-white/5 flex flex-col p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Crosshair className="w-5 h-5 text-blue-400 animate-pulse" />
          <h2 className="text-md uppercase tracking-widest font-display text-slate-100">
            Debris Catalog
          </h2>
        </div>
        <button 
          onClick={handleResetFilters}
          className="text-[10px] uppercase font-mono tracking-wider text-slate-400 hover:text-blue-400 flex items-center gap-1 transition-colors border border-slate-700/50 px-2 py-0.5 rounded"
        >
          <RefreshCw className="w-2.5 h-2.5" />
          Reset
        </button>
      </div>

      {/* Visual Instruction Banner */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2.5 mb-4 text-[10px] text-blue-300 leading-relaxed font-mono">
        💡 <span className="font-bold text-white">OPERATIONAL GUIDANCE:</span> Click on any satellite below or hover over globe points to open live telemetry HUD and simulate engine thrust boosts.
      </div>

      {/* Target Search Box */}
      <div className="relative mb-5">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
        <input 
          type="text" 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search NORAD ID or Name..." 
          className="w-full bg-slate-900/60 border border-slate-750 px-9 py-2 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all font-sans"
        />
      </div>

      {/* Advanced Filter Adjustments Panels */}
      <div className="space-y-4 border-b border-white/5 pb-5 mb-5">
        <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5 tracking-wider">
          <SlidersHorizontal className="w-3 h-3 text-blue-500" />
           Keplerian Thresholds
        </span>

        {/* Altitude Range Filter */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-slate-300 font-mono">
            <span>Altitude Orbit (km)</span>
            <span className="text-blue-400 font-semibold">{minAlt} - {maxAlt}</span>
          </div>
          <div className="flex gap-2">
            <input 
              type="range" 
              min="0" 
              max="20000" 
              step="100"
              value={minAlt} 
              onChange={(e) => setMinAlt(parseInt(e.target.value))}
              className="w-1/2 accent-blue-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
            />
            <input 
              type="range" 
              min="0" 
              max="20000" 
              step="100"
              value={maxAlt} 
              onChange={(e) => setMaxAlt(parseInt(e.target.value))}
              className="w-1/2 accent-blue-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
          <div className="flex justify-between text-[8px] text-slate-500 font-mono">
            <span>LEO (0-2k)</span>
            <span>MEO (2k-20k)</span>
          </div>
        </div>

        {/* Inclination Angle Filter */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-slate-300 font-mono">
            <span>Inclination (degrees)</span>
            <span className="text-blue-400 font-semibold">{minInc}° - {maxInc}°</span>
          </div>
          <div className="flex gap-2">
            <input 
              type="range" 
              min="0" 
              max="180" 
              value={minInc} 
              onChange={(e) => setMinInc(parseInt(e.target.value))}
              className="w-1/2 accent-blue-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
            />
            <input 
              type="range" 
              min="0" 
              max="180" 
              value={maxInc} 
              onChange={(e) => setMaxInc(parseInt(e.target.value))}
              className="w-1/2 accent-blue-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
          <div className="flex justify-between text-[8px] text-slate-500 font-mono">
            <span>Equatorial (0°)</span>
            <span>Polar (90°)</span>
            <span>Retrograde (180°)</span>
          </div>
        </div>

        {/* Risk Checkbox */}
        <label className="flex items-center gap-2 cursor-pointer pt-1">
          <input 
            type="checkbox"
            checked={onlyHighRisk}
            onChange={(e) => setOnlyHighRisk(e.target.checked)}
            className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
          />
          <span className="text-xs text-slate-300 select-none flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
            Display only high-threat debris
          </span>
        </label>
      </div>

      {/* Dynamic Results Node List */}
      <div className="w-full pr-1 mt-4">
        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-3.5 tracking-wider">
          Query Results ({searchResults.length})
        </span>

        {searching ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-xs text-slate-400 ml-2">Calculating catalog parameters...</span>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="text-center py-10 px-4 text-slate-500 text-xs flex flex-col items-center">
            <Info className="w-6 h-6 mb-2 opacity-40 text-blue-400" />
            No catalog objects match the filters. Try expanding threshold scopes.
          </div>
        ) : (
          <div className="space-y-2">
            {searchResults.map((obj) => (
              <div 
                key={obj.noradId}
                onClick={() => onSelectObject(obj.noradId)}
                className={`glass-card p-3 rounded-lg border text-left cursor-pointer group flex justify-between items-center ${
                  obj.riskScore > 1e-4 
                    ? 'border-rose-500/10 hover:border-rose-500/35 bg-rose-500/5' 
                    : 'border-white/5 hover:border-blue-500/25'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <Compass className={`w-3.5 h-3.5 ${obj.riskScore > 1e-4 ? 'text-rose-400' : 'text-blue-400'}`} />
                    <span className="text-xs font-semibold text-slate-200 group-hover:text-blue-400 transition-colors">
                      {obj.name}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2.5 text-[9px] text-slate-400 font-mono mt-1 items-center">
                    <span>ID: {obj.noradId}</span>
                    <span>Alt: {obj.altitudeKm.toFixed(0)}km</span>
                    <span>Inc: {obj.inclination.toFixed(1)}°</span>
                    <span className={`px-1.5 py-0.2 rounded font-bold uppercase text-[7.5px] border ${
                      obj.name.toLowerCase().includes('iss') || obj.noradId === '25544'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : (obj.name.toLowerCase().includes('deb') || obj.name.toLowerCase().includes('debris')
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20')
                    }`}>
                      {obj.name.toLowerCase().includes('iss') || obj.noradId === '25544'
                        ? 'Station'
                        : (obj.name.toLowerCase().includes('deb') || obj.name.toLowerCase().includes('debris')
                            ? 'Debris'
                            : 'Payload')}
                    </span>
                  </div>
                </div>

                {obj.riskScore > 0 && (
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                    obj.riskScore > 1e-4 
                      ? 'bg-rose-500/10 text-rose-400' 
                      : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {obj.riskScore.toExponential(1)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
