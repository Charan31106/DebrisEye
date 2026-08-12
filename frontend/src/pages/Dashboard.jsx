import React, { useState, useMemo } from 'react';
import Globe from '../components/Globe';
import Sidebar from '../components/Sidebar';
import RiskTable from '../components/RiskTable';
import KasslerIndex from '../components/KasslerIndex';
import AlertBanner from '../components/AlertBanner';
import APIDocs from './APIDocs';
import ObjectDetail from './ObjectDetail';
import { useDebrisSocket } from '../hooks/useDebrisSocket';
import { Radio, Database, ShieldAlert, Cpu } from 'lucide-react';

export default function Dashboard() {
  const { debris, alerts, kessler, status } = useDebrisSocket();
  
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'conjunctions' | 'api'
  const [selectedNoradId, setSelectedNoradId] = useState(null);
  const [maneuverDeltaV, setManeuverDeltaV] = useState(0);
  
  const [filters, setFilters] = useState({
    search: '',
    minAlt: 0,
    maxAlt: 20000,
    minInc: 0,
    maxInc: 180,
    minRisk: 0
  });

  // Calculate coordinates in memory based on sliders to prune the globe in real-time
  const filteredDebris = useMemo(() => {
    return debris.filter(obj => {
      // 1. Search filter
      if (filters.search) {
        const query = filters.search.toLowerCase();
        const matchName = obj.name.toLowerCase().includes(query);
        const matchId = obj.noradId.includes(query);
        if (!matchName && !matchId) return false;
      }
      // 2. Altitude filter
      if (obj.alt < filters.minAlt || obj.alt > filters.maxAlt) return false;
      // 3. Inclination filter
      if (obj.inclination < filters.minInc || obj.inclination > filters.maxInc) return false;
      // 4. Risk filter
      if (filters.minRisk > 0 && obj.riskScore < filters.minRisk) return false;

      return true;
    });
  }, [debris, filters]);

  // Find selected objects list (supports single object selection and dual conjunction highlight)
  const selectedObjectsList = useMemo(() => {
    if (!selectedNoradId) return [];
    
    // Check if selectedNoradId is actually a comma-separated pair (passed from RiskTable row click!)
    if (selectedNoradId.includes(',')) {
      const [id1, id2] = selectedNoradId.split(',');
      const obj1 = debris.find(obj => obj.noradId === id1);
      const obj2 = debris.find(obj => obj.noradId === id2);
      if (!obj1 || !obj2) return [];

      if (maneuverDeltaV !== 0 && obj1.meanMotion !== undefined && obj1.eccentricity !== undefined) {
        // Create a modified copy of obj1 with shifted elements
        const GM = 398600.4418;
        const n0 = (obj1.meanMotion * 2 * Math.PI) / 86400.0;
        const a0 = Math.pow(GM / (n0 * n0), 1.0 / 3.0);
        const r = a0 * (1.0 - obj1.eccentricity);
        const v0 = Math.sqrt(GM * (2.0 / r - 1.0 / a0));
        const vNew = v0 + (maneuverDeltaV / 1000.0);
        const aNew = 1.0 / (2.0 / r - (vNew * vNew) / GM);
        const eNew = Math.abs(1.0 - r / aNew);
        const nNew = Math.sqrt(GM / Math.pow(aNew, 3));
        const mmNew = nNew * 86400.0 / (2.0 * Math.PI);
        
        const modifiedObj1 = {
          ...obj1,
          meanMotion: mmNew,
          eccentricity: eNew,
          isManeuver: true
        };
        return [obj1, obj2, modifiedObj1];
      }
      return [obj1, obj2];
    }
    
    const obj = debris.find(obj => obj.noradId === selectedNoradId);
    if (!obj) return [];
    if (maneuverDeltaV !== 0 && obj.meanMotion !== undefined && obj.eccentricity !== undefined) {
      const GM = 398600.4418;
      const n0 = (obj.meanMotion * 2 * Math.PI) / 86400.0;
      const a0 = Math.pow(GM / (n0 * n0), 1.0 / 3.0);
      const r = a0 * (1.0 - obj.eccentricity);
      const v0 = Math.sqrt(GM * (2.0 / r - 1.0 / a0));
      const vNew = v0 + (maneuverDeltaV / 1000.0);
      const aNew = 1.0 / (2.0 / r - (vNew * vNew) / GM);
      const eNew = Math.abs(1.0 - r / aNew);
      const nNew = Math.sqrt(GM / Math.pow(aNew, 3));
      const mmNew = nNew * 86400.0 / (2.0 * Math.PI);
      
      const modifiedObj = {
        ...obj,
        meanMotion: mmNew,
        eccentricity: eNew,
        isManeuver: true
      };
      return [obj, modifiedObj];
    }
    return [obj];
  }, [selectedNoradId, debris, maneuverDeltaV]);

  const handleSelectObject = (noradId) => {
    setSelectedNoradId(noradId);
    setManeuverDeltaV(0); // Reset maneuver delta-V on new selection
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll page to top to reveal details!
  };

  return (
    <div className="w-full min-h-screen flex flex-col bg-[#0a0e1a] text-slate-100 font-sans">
      {/* Live Warning Alarm Banner */}
      <AlertBanner alerts={alerts} />

      {/* Main Core Layout Grid */}
      <div className="flex-1 flex flex-col md:flex-row relative">
        
        {/* Fullscreen 3D Space Globe Panel (Left 60-65% width) */}
        <div className="w-full md:w-[60%] lg:w-[65%] h-[55vh] md:h-[calc(100vh-3.5rem)] md:sticky md:top-[3.5rem] overflow-hidden bg-slate-950/20">
          <Globe 
            debris={filteredDebris} 
            selectedObjects={selectedObjectsList}
            onSelectObject={handleSelectObject}
          />
          
          {/* Neon Floating Space Command Hud Overlays */}
          <div className="absolute left-6 top-6 pointer-events-none z-20 hidden md:flex flex-col gap-1.5">
            <span className="font-display font-bold text-lg tracking-widest text-slate-100 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
              DEBRISEYE COMMAND HUD
            </span>
            <span className="text-[10px] text-slate-400 font-mono tracking-wider">
              ORBITAL DENSITY METRICS FEED | STATUS: {status === 'connected' ? 'ONLINE' : 'BOOTING'}
            </span>
          </div>

          <div className="absolute left-6 bottom-6 z-20 pointer-events-none hidden md:flex items-center gap-6">
            <div className="flex flex-col bg-slate-950/65 border border-white/5 p-3 rounded-lg backdrop-blur-md">
              <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">Grid Entities</span>
              <span className="text-xl font-display font-bold text-blue-400 mt-0.5">{debris.length}</span>
            </div>
            <div className="flex flex-col bg-slate-950/65 border border-white/5 p-3 rounded-lg backdrop-blur-md">
              <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">Threat Alerts</span>
              <span className="text-xl font-display font-bold text-rose-500 mt-0.5">{alerts.length}</span>
            </div>
            <div className="flex flex-col bg-slate-950/65 border border-white/5 p-3 rounded-lg backdrop-blur-md">
              <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">Visible Target Node</span>
              <span className="text-xl font-display font-bold text-slate-100 mt-0.5">{filteredDebris.length}</span>
            </div>
          </div>
        </div>

        {/* Sidebar Console Control Room Panel (Right 35-40% width) */}
        <div className="w-full md:w-[40%] lg:w-[35%] border-t md:border-t-0 md:border-l border-white/5 flex flex-col bg-slate-950/45 backdrop-blur-xl z-20 min-h-screen">
          
          {/* Kessler Index Metric card at top of console */}
          <div className="p-5 border-b border-white/5 bg-slate-950/20">
            <KasslerIndex currentScore={kessler} />
          </div>

          {/* Navigation Tab controls */}
          {!selectedNoradId && (
            <div className="flex border-b border-white/5 bg-slate-950/30 text-[10px] uppercase font-bold tracking-widest font-mono">
              <button 
                onClick={() => setActiveTab('catalog')}
                className={`flex-1 py-3 border-b flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'catalog' 
                    ? 'border-blue-500 text-blue-400 bg-blue-500/5' 
                    : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                Live Catalog
              </button>
              
              <button 
                onClick={() => setActiveTab('conjunctions')}
                className={`flex-1 py-3 border-b flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'conjunctions' 
                    ? 'border-rose-500 text-rose-500 bg-rose-500/5' 
                    : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Conjunctions
              </button>
              
              <button 
                onClick={() => setActiveTab('api')}
                className={`flex-1 py-3 border-b flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'api' 
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' 
                    : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                API Specs
              </button>
            </div>
          )}

          {/* Console Content Screen body */}
          <div className="w-full flex-1">
            {selectedNoradId ? (
              // If an object is active, immediately slide details view overlay card
              <div className="w-full p-5 pb-16">
                <ObjectDetail 
                  noradId={selectedNoradId.includes(',') ? selectedNoradId.split(',')[0] : selectedNoradId} 
                  challengerId={selectedNoradId.includes(',') ? selectedNoradId.split(',')[1] : null}
                  maneuverDeltaV={maneuverDeltaV}
                  onManeuverDeltaVChange={setManeuverDeltaV}
                  onClose={() => {
                    setSelectedNoradId(null);
                    setManeuverDeltaV(0);
                  }} 
                />
              </div>
            ) : (
              // Normal console screen views
              <div className="w-full">
                {activeTab === 'catalog' && (
                  <Sidebar 
                    onSelectObject={handleSelectObject} 
                    activeFilters={filters}
                    onChangeFilters={setFilters}
                  />
                )}
                {activeTab === 'conjunctions' && (
                  <div className="w-full p-4 pb-16">
                    <RiskTable onSelectObject={handleSelectObject} />
                  </div>
                )}
                {activeTab === 'api' && (
                  <APIDocs />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
