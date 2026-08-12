import React, { useEffect, useState, useMemo } from 'react';
import { Compass, Calendar, ArrowLeft, Cpu, Activity, Clock, ShieldCheck, HelpCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip as ChartTooltip } from 'recharts';

// Earth Gravitational constants
const GM_EARTH = 398600.4418;
const EARTH_RADIUS_KM = 6378.137;

// Keplerian coordinate generator for ECI coordinates (x, y, z km)
function propagateKeplerian(elements, tSec) {
  const GM = 398600.4418;
  const radI = elements.inclination * Math.PI / 180.0;
  const radRaan = elements.raan * Math.PI / 180.0;
  const n = (elements.meanMotion * 2.0 * Math.PI) / 86400.0;
  const a = Math.pow(GM / (n * n), 1.0 / 3.0);
  const ecc = elements.eccentricity;
  const eccFactor = Math.sqrt(1.0 - ecc * ecc);
  
  // Mean anomaly M
  const M = n * tSec;
  
  // Solve Kepler's Equation M = E - e sin E using a few iterations
  let E = M;
  for (let i = 0; i < 5; i++) {
    E = E - (E - ecc * Math.sin(E) - M) / (1.0 - ecc * Math.cos(E));
  }
  
  // Position in orbital plane
  const xo = a * (Math.cos(E) - ecc);
  const yo = a * eccFactor * Math.sin(E);
  
  // Rotate to ECI
  const x = xo * Math.cos(radRaan) - yo * Math.sin(radRaan) * Math.cos(radI);
  const y = xo * Math.sin(radRaan) + yo * Math.cos(radRaan) * Math.cos(radI);
  const z = yo * Math.sin(radI);
  
  // Velocity vectors (approximate)
  const r = a * (1.0 - ecc * Math.cos(E));
  const vCoeff = Math.sqrt(GM * a) / r;
  const vxo = -vCoeff * Math.sin(E);
  const vyo = vCoeff * eccFactor * Math.cos(E);
  
  const vx = vxo * Math.cos(radRaan) - vyo * Math.sin(radRaan) * Math.cos(radI);
  const vy = vxo * Math.sin(radRaan) + vyo * Math.cos(radRaan) * Math.cos(radI);
  const vz = vyo * Math.sin(radI);
  
  return { x, y, z, vx, vy, vz };
}

// Chan analytical probability solver
function chanProbability(missDistanceM, relativeVelocityKms, combinedRadiusM = 15.0, sigmaM = 100.0) {
  const v = Math.pow(missDistanceM / sigmaM, 2);
  const u = Math.pow(combinedRadiusM, 2) / (2.0 * Math.pow(sigmaM, 2));
  
  let prob = 0.0;
  const termLimit = 10;
  
  const eV = Math.exp(-v / 2.0);
  const eU = Math.exp(-u);
  
  const fact = (n) => {
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  };
  
  for (let m = 0; m < termLimit; m++) {
    const coeff = Math.pow(v / 2.0, m) / fact(m);
    
    let sumK = 0.0;
    for (let k = 0; k <= m; k++) {
      sumK += Math.pow(u, k) / fact(k);
    }
    
    prob += coeff * (1.0 - eU * sumK);
  }
  
  return eV * prob;
}

// Calculate shifted orbital elements after tangential burn
function getModifiedElements(obj, dvMs) {
  if (!obj) return { meanMotion: 0, eccentricity: 0, altitudeKm: 0 };
  if (dvMs === 0) return { meanMotion: obj.meanMotion, eccentricity: obj.eccentricity };
  
  const n0 = (obj.meanMotion * 2 * Math.PI) / 86400.0;
  const a0 = Math.pow(GM_EARTH / (n0 * n0), 1.0 / 3.0);
  const r = a0 * (1.0 - obj.eccentricity); // Burn at perigee
  
  const v0 = Math.sqrt(GM_EARTH * (2.0 / r - 1.0 / a0));
  const vNew = v0 + (dvMs / 1000.0);
  
  const aNew = 1.0 / (2.0 / r - (vNew * vNew) / GM_EARTH);
  const eNew = Math.abs(1.0 - r / aNew);
  
  const nNew = Math.sqrt(GM_EARTH / Math.pow(aNew, 3));
  const meanMotionNew = nNew * 86400.0 / (2.0 * Math.PI);
  
  return {
    meanMotion: meanMotionNew,
    eccentricity: eNew,
    altitudeKm: aNew - EARTH_RADIUS_KM
  };
}

// Simulated approach scanner
function simulateConjunctionManeuver(obj1, obj2, tcaDate, dvMs) {
  const mod1 = getModifiedElements(obj1, dvMs);
  
  const tcaSec = tcaDate.getTime() / 1000.0;
  const epoch1Sec = new Date(obj1.epoch).getTime() / 1000.0;
  const epoch2Sec = new Date(obj2.epoch).getTime() / 1000.0;
  
  let minDistance = Infinity;
  let tcaRelativeVel = 0.0;
  
  for (let dt = -600; dt <= 600; dt += 5) {
    const t = tcaSec + dt;
    
    const t1 = t - epoch1Sec;
    const pos1 = propagateKeplerian(
      {
        inclination: obj1.inclination,
        raan: obj1.raan,
        eccentricity: mod1.eccentricity,
        meanMotion: mod1.meanMotion
      },
      t1
    );
    
    const t2 = t - epoch2Sec;
    const pos2 = propagateKeplerian(obj2, t2);
    
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) * 1000.0;
    
    if (dist < minDistance) {
      minDistance = dist;
      
      const dvx = pos1.vx - pos2.vx;
      const dvy = pos1.vy - pos2.vy;
      const dvz = pos1.vz - pos2.vz;
      tcaRelativeVel = Math.sqrt(dvx*dvx + dvy*dvy + dvz*dvz);
    }
  }
  
  const pc = chanProbability(minDistance, tcaRelativeVel, 15.0, 100.0);
  return {
    missDistance: minDistance,
    relativeVelocity: tcaRelativeVel,
    probability: pc
  };
}

export default function ObjectDetail({ noradId, challengerId, maneuverDeltaV, onManeuverDeltaVChange, onClose }) {
  const [objectData, setObjectData] = useState(null);
  const [propagation, setPropagation] = useState([]);
  const [loading, setLoading] = useState(true);
  const [conjunctionDetail, setConjunctionDetail] = useState(null);

  useEffect(() => {
    setLoading(true);
    setConjunctionDetail(null);
    // 1. Fetch complete details of the object
    fetch(`/api/debris/${noradId}`)
      .then(res => res.json())
      .then(async (res) => {
        if (res.success && res.data) {
          const data = res.data;
          setObjectData(data);
          
          // 2. Fetch fresh propagation points from FastAPI backend
          // We propagate from now until 3 hours into the future in 2 minute steps
          const start = new Date();
          const end = new Date(start.getTime() + 3 * 3600 * 1000); // 3 hours
          
          try {
            const propagateUrl = `/api/debris/propagate`;
            const mlResponse = await fetch(propagateUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tleLine1: data.tleLine1,
                tleLine2: data.tleLine2,
                startTime: start.toISOString(),
                endTime: end.toISOString(),
                stepSeconds: 120
              })
            });
            const mlData = await mlResponse.json();
            if (mlData && mlData.success && mlData.points) {
              setPropagation(mlData.points.slice(0, 15)); // Take top 15 nodes for list
            } else {
              throw new Error("Local API failure");
            }
          } catch (e) {
            console.warn('[ObjectDetail] Express propagation failed, rendering local fallback:', e.message);
            // Standby lightweight local Keplerian coordinate generation
            const fallbackPoints = [];
            const n = (data.meanMotion * 2 * Math.PI) / 86400; // rad/s
            for (let i = 0; i < 15; i++) {
              const dt = i * 120; // 2 minutes steps
              const theta = n * dt;
              fallbackPoints.push({
                timestamp: new Date(start.getTime() + dt * 1000).toISOString(),
                lat: Math.sin(theta) * data.inclination,
                lon: ((data.raan + (theta * 180 / Math.PI)) % 360) - 180,
                alt_km: data.altitudeKm + Math.cos(theta) * data.eccentricity * 100
              });
            }
            setPropagation(fallbackPoints);
          }

          // 3. Fetch conjunction details if we selected a conjunction row
          if (challengerId) {
            try {
              const conjListRes = await fetch('/api/conjunctions');
              const conjListData = await conjListRes.json();
              if (conjListData.success && conjListData.data) {
                const matchedConj = conjListData.data.find(c => 
                  (c.object1Id === noradId && c.object2Id === challengerId) ||
                  (c.object1Id === challengerId && c.object2Id === noradId)
                );
                if (matchedConj) {
                  const detailedRes = await fetch(`/api/conjunctions/${matchedConj.id}`);
                  const detailedData = await detailedRes.json();
                  if (detailedData.success) {
                    setConjunctionDetail(detailedData.data);
                  }
                }
              }
            } catch (err) {
              console.warn('[ObjectDetail] Failed to load conjunction detailed report:', err);
            }
          }
        }
        setLoading(false);
      })
      .catch(e => {
        console.error('[ObjectDetail] Failed to load object data:', e);
        setLoading(false);
      });
  }, [noradId, challengerId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [noradId]);


  const modifiedElements = useMemo(() => {
    return getModifiedElements(objectData, maneuverDeltaV);
  }, [objectData, maneuverDeltaV]);

  const maneuverSimulation = useMemo(() => {
    if (!conjunctionDetail || !conjunctionDetail.object1 || !conjunctionDetail.object2) return null;
    return simulateConjunctionManeuver(
      conjunctionDetail.object1,
      conjunctionDetail.object2,
      new Date(conjunctionDetail.tca),
      maneuverDeltaV
    );
  }, [conjunctionDetail, maneuverDeltaV]);

  const tradeSpaceData = useMemo(() => {
    if (!conjunctionDetail || !conjunctionDetail.object1 || !conjunctionDetail.object2) return [];
    const points = [];
    // Compute probability for delta-V ranging from -15 to +15 in steps of 3
    for (let dv = -15; dv <= 15; dv += 3) {
      const sim = simulateConjunctionManeuver(
        conjunctionDetail.object1,
        conjunctionDetail.object2,
        new Date(conjunctionDetail.tca),
        dv
      );
      points.push({
        dv: dv > 0 ? `+${dv}` : `${dv}`,
        probability: sim.probability,
        missDistance: sim.missDistance
      });
    }
    return points;
  }, [conjunctionDetail]);

  if (loading || !objectData) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-20">
        <Activity className="w-6 h-6 text-blue-400 animate-spin" />
        <span className="text-xs text-slate-400 mt-2">Decrypting orbital elements...</span>
      </div>
    );
  }

  // Extra Keplerian physics variables derived from core elements
  const nRadPerSec = (objectData.meanMotion * 2.0 * Math.PI) / 86400.0;
  const semiMajorAxis = Math.pow(GM_EARTH / (nRadPerSec * nRadPerSec), 1.0 / 3.0);
  const perigeeKm = semiMajorAxis * (1.0 - objectData.eccentricity) - EARTH_RADIUS_KM;
  const apogeeKm = semiMajorAxis * (1.0 + objectData.eccentricity) - EARTH_RADIUS_KM;
  const orbitalPeriodMin = (2.0 * Math.PI / nRadPerSec) / 60.0;

  const nRadPerSecMod = (modifiedElements.meanMotion * 2.0 * Math.PI) / 86400.0;
  const semiMajorAxisMod = Math.pow(GM_EARTH / (nRadPerSecMod * nRadPerSecMod), 1.0 / 3.0);
  const perigeeKmMod = semiMajorAxisMod * (1.0 - modifiedElements.eccentricity) - EARTH_RADIUS_KM;
  const apogeeKmMod = semiMajorAxisMod * (1.0 + modifiedElements.eccentricity) - EARTH_RADIUS_KM;
  const orbitalPeriodMinMod = (2.0 * Math.PI / nRadPerSecMod) / 60.0;

  return (
    <div className="flex flex-col text-left pb-8">
      {/* Navigation header */}
      <button 
        onClick={onClose}
        className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors mb-4 text-xs font-mono"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Dashboard
      </button>

      {/* Object Title */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-md text-slate-100 font-display flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-blue-400" />
            {objectData.name}
          </h3>
          <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
            NORAD Catalog ID: {objectData.noradId}
          </span>
        </div>
        
        {objectData.riskScore > 1e-5 ? (
          <span className={`text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded font-bold ${
            objectData.riskScore > 1e-4 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>
            Risk: {objectData.riskScore.toExponential(1)}
          </span>
        ) : (
          <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Secure Object
          </span>
        )}
      </div>

      {/* Visual Image & Description Card */}
      <div className="bg-slate-950/70 border border-white/5 rounded-lg overflow-hidden mb-5">
        <div className="h-32 overflow-hidden relative border-b border-white/5 flex items-center justify-center bg-slate-900/50">
          <img 
            src={
              objectData.name.toLowerCase().includes('iss') || objectData.noradId === '25544'
                ? '/assets/images/iss_satellite.png'
                : (objectData.name.toLowerCase().includes('deb') || objectData.name.toLowerCase().includes('debris')
                    ? '/assets/images/orbital_debris.png'
                    : '/assets/images/communications_sat.png')
            } 
            alt={objectData.name}
            className="w-full h-full object-cover opacity-80 filter brightness-90 contrast-110"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
        </div>
        <div className="p-3 text-[11px] leading-relaxed text-slate-300 font-sans border-t border-white/5 bg-slate-950/30">
          <span className="font-bold text-blue-400 block mb-1 uppercase tracking-wider text-[10px]">Mission Description</span>
          {objectData.name.toLowerCase().includes('iss') || objectData.noradId === '25544'
            ? 'The International Space Station (ISS) is a modular space station in Low Earth Orbit. It serves as a microgravity and space environment research laboratory, conducting international scientific investigations in physics, astrobiology, and meteorology.'
            : (objectData.name.toLowerCase().includes('deb') || objectData.name.toLowerCase().includes('debris')
                ? 'Spent upper stage booster panel or mechanical fragmentation debris. Moving passively without active attitude control, telemetry transponders, or station-keeping capability. Poses a severe collision threat to active assets.'
                : 'Active communications and telemetry payload. Equipped with high-gain transponders and solar array panels to perform communications relay, geological telemetry collection, weather observation, and planetary monitoring.')}
        </div>
      </div>

      {conjunctionDetail && (
        <div className="bg-rose-950/25 border border-rose-500/30 rounded-lg p-3 mb-4 text-xs space-y-3 shadow-lg shadow-rose-950/20 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-rose-500/10 pb-1.5">
            <span className="font-display font-bold text-rose-400 tracking-wider uppercase flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
              Avoidance Simulator
            </span>
            <span className={`text-[9px] font-mono border px-2 py-0.5 rounded font-bold uppercase ${
              maneuverDeltaV !== 0
                ? (maneuverSimulation?.probability < 1e-6 ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 animate-pulse' : 'bg-amber-500/15 border-amber-500/30 text-amber-400')
                : (conjunctionDetail.riskLevel === 'critical' ? 'bg-rose-500/20 border-rose-500/20 text-rose-300' : 'bg-amber-500/20 border-amber-500/20 text-amber-300')
            }`}>
              {maneuverDeltaV !== 0 
                ? (maneuverSimulation?.probability < 1e-6 ? 'Clearance Secured' : 'Warning Outlook')
                : conjunctionDetail.riskLevel}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            <div className="bg-slate-950/40 p-2 rounded border border-white/5">
              <span className="text-slate-500 block text-[9px] uppercase tracking-wide">Target Satellite</span>
              <span className="text-slate-100 font-bold block truncate">{conjunctionDetail.object1Name}</span>
              <span className="text-slate-500 text-[9px]">NORAD: {conjunctionDetail.object1Id}</span>
            </div>
            <div className="bg-slate-950/40 p-2 rounded border border-white/5">
              <span className="text-slate-500 block text-[9px] uppercase tracking-wide">Challenger Debris</span>
              <span className="text-amber-400 font-bold block truncate">{conjunctionDetail.object2Name}</span>
              <span className="text-slate-500 text-[9px]">NORAD: {conjunctionDetail.object2Id}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[9px] font-mono">
            <div className="bg-slate-950/40 p-1.5 rounded border border-white/5 flex flex-col justify-between">
              <span className="text-slate-400 uppercase tracking-wider">Miss Dist</span>
              <span className={`text-xs font-bold mt-1 ${maneuverDeltaV !== 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {maneuverSimulation ? `${maneuverSimulation.missDistance.toFixed(1)} m` : `${conjunctionDetail.missDistance.toFixed(1)} m`}
              </span>
              {maneuverDeltaV !== 0 && (
                <span className="text-[7.5px] text-slate-500 line-through">
                  Orig: {conjunctionDetail.missDistance.toFixed(1)}m
                </span>
              )}
            </div>
            <div className="bg-slate-950/40 p-1.5 rounded border border-white/5 flex flex-col justify-between">
              <span className="text-slate-400 uppercase tracking-wider">Rel Vel</span>
              <span className="text-slate-200 text-xs font-bold mt-1">
                {maneuverSimulation 
                  ? `${maneuverSimulation.relativeVelocity.toFixed(2)} km/s` 
                  : (conjunctionDetail.simulation?.relative_velocity_kms ? `${conjunctionDetail.simulation.relative_velocity_kms.toFixed(2)} km/s` : 'N/A')}
              </span>
            </div>
            <div className="bg-slate-950/40 p-1.5 rounded border border-white/5 flex flex-col justify-between">
              <span className="text-slate-400 uppercase tracking-wider">TCA Outlook</span>
              <span className="text-blue-400 text-[10px] font-bold mt-1 block truncate">
                {new Date(conjunctionDetail.tca).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-2 rounded border border-white/5 space-y-1 text-[9px] font-mono">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Maneuver Probability (Chan):</span>
              <span className={`font-semibold ${maneuverDeltaV !== 0 ? (maneuverSimulation?.probability < 1e-6 ? 'text-emerald-400' : 'text-amber-400') : 'text-blue-400'}`}>
                {maneuverSimulation ? maneuverSimulation.probability.toExponential(2) : conjunctionDetail.pc.toExponential(2)}
              </span>
            </div>
            {maneuverDeltaV === 0 && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Statistical Probability (1K MC):</span>
                <span className="text-purple-400 font-semibold">
                  {conjunctionDetail.simulation?.probability_monte_carlo !== undefined ? conjunctionDetail.simulation.probability_monte_carlo.toExponential(2) : 'N/A'}
                </span>
              </div>
            )}
            {maneuverDeltaV !== 0 && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Original Probability:</span>
                <span className="text-rose-400 font-semibold">
                  {conjunctionDetail.pc.toExponential(2)}
                </span>
              </div>
            )}
          </div>

          {/* Maneuver Trade Space Chart */}
          <div className="bg-slate-950/45 border border-white/5 p-2 rounded-lg space-y-1">
            <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-mono">
              Maneuver Trade-Space (dV vs Collision Prob.)
            </span>
            <div className="h-[95px] w-full mt-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={tradeSpaceData} margin={{ top: 2, right: 5, left: -25, bottom: 2 }}>
                  <defs>
                    <linearGradient id="colorTradeSpace" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="dv" 
                    stroke="#475569" 
                    fontSize={8} 
                    tickLine={false}
                    axisLine={false}
                    unit="m/s"
                  />
                  <YAxis 
                    stroke="#475569" 
                    fontSize={8} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => val.toExponential(0)}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 border border-slate-800 p-2 rounded text-[9px] text-slate-300 font-mono">
                            <p className="font-semibold text-slate-100">dV: {data.dv} m/s</p>
                            <p className="text-rose-400">Pc: {data.probability.toExponential(2)}</p>
                            <p className="text-emerald-400">Miss: {data.missDistance.toFixed(1)} m</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="probability"
                    stroke="#f43f5e"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#colorTradeSpace)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[8px] font-mono text-slate-500 text-center">
              NASA/ESA Maneuver Threshold: <span className="text-emerald-400 font-semibold">&lt; 1.0e-6</span>
            </div>
          </div>

          
          {/* Orbital Altitude Trade-Space Curve Chart */}
          <div className="bg-slate-950/45 border border-white/5 p-2 rounded-lg space-y-1">
            <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-mono">
              Altitude Trade-Space (DV vs Apogee)
            </span>
            <div className="h-[95px] w-full mt-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={(() => {
                    const pts = [];
                    for (let dv = -30; dv <= 30; dv += 5) {
                      const mod = getModifiedElements(objectData, dv);
                      const nR2 = (mod.meanMotion * 2 * Math.PI) / 86400.0;
                      const aM2 = (isFinite(mod.meanMotion) && mod.meanMotion > 0)
                        ? Math.pow(GM_EARTH / (nR2 * nR2), 1.0 / 3.0)
                        : semiMajorAxis;
                      const apK2 = aM2 * (1.0 + mod.eccentricity) - EARTH_RADIUS_KM;
                      pts.push({ dv: dv > 0 ? `+${dv}` : `${dv}`, apogee: parseFloat(apK2.toFixed(1)) });
                    }
                    return pts;
                  })()}
                  margin={{ top: 2, right: 5, left: -14, bottom: 2 }}
                >
                  <defs>
                    <linearGradient id="colorBoostAlt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="dv" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} unit="m/s" />
                  <YAxis stroke="#475569" fontSize={8} tickLine={false} axisLine={false} tickFormatter={(v) => String(Math.round(v))} width={42} />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-slate-900 border border-slate-800 p-2 rounded text-[9px] text-slate-300 font-mono shadow-xl">
                            <p className="font-semibold text-slate-100">dV: {d.dv} m/s</p>
                            <p className="text-blue-400">Apogee: {d.apogee.toLocaleString()} km</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area type="monotone" dataKey="apogee" stroke="#3b82f6" strokeWidth={1.5} fillOpacity={1} fill="url(#colorBoostAlt)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[8px] font-mono text-slate-500 text-center">
              Baseline Apogee: <span className="text-blue-400 font-semibold">{apogeeKm.toFixed(1)} km</span>
              {maneuverDeltaV !== 0 && (
                <span className="text-emerald-400 font-semibold ml-2">after burn: {apogeeKmMod.toFixed(1)} km</span>
              )}
            </div>
          </div>

          {/* Interactive Maneuver Control Slider Console */}
          <div className="bg-slate-950/65 border border-white/5 rounded p-2.5 space-y-2">
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-slate-400 uppercase tracking-wider">Execute Evasion Burn</span>
              <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                maneuverDeltaV === 0 ? 'bg-slate-800 text-slate-300' : (maneuverDeltaV > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400')
              }`}>
                {maneuverDeltaV > 0 ? `+${maneuverDeltaV.toFixed(1)}` : maneuverDeltaV.toFixed(1)} m/s
              </span>
            </div>
            
            <input 
              type="range" 
              min="-15" 
              max="15" 
              step="0.1"
              value={maneuverDeltaV} 
              onChange={(e) => onManeuverDeltaVChange(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 bg-slate-800 h-1.5 rounded cursor-pointer"
            />
            
            <div className="flex justify-between text-[8px] text-slate-500 font-mono">
              <span>-15.0 m/s (Retrograde)</span>
              <button 
                onClick={() => onManeuverDeltaVChange(0)}
                className="hover:text-white transition-colors text-[9px] uppercase tracking-wider text-slate-400 border border-white/5 px-2 py-0.5 rounded bg-white/5"
              >
                Reset Burn
              </button>
              <span>+15.0 m/s (Prograde)</span>
            </div>
          </div>

          <div className={`p-2 rounded text-[10px] leading-relaxed border ${
            maneuverDeltaV !== 0 
              ? (maneuverSimulation?.probability < 1e-6 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-amber-500/10 border-amber-500/20 text-amber-300')
              : (conjunctionDetail.riskLevel === 'critical' ? 'bg-rose-500/10 border-rose-500/20 text-rose-300' : 'bg-amber-500/10 border-amber-500/20 text-amber-300')
          }`}>
            <span className="font-bold uppercase tracking-wider block mb-0.5">Simulation Outlook:</span>
            {maneuverDeltaV !== 0
              ? (maneuverSimulation?.probability < 1e-6 
                  ? `SUCCESS: Burn of ${maneuverDeltaV.toFixed(1)} m/s shifts orbital plane by ${Math.abs(maneuverSimulation.missDistance - conjunctionDetail.missDistance).toFixed(1)}m. Collision risk successfully cleared.`
                  : `WARNING: Burn of ${maneuverDeltaV.toFixed(1)} m/s is insufficient. Encounter probability remaining at ${maneuverSimulation.probability.toExponential(1)}.`)
              : (conjunctionDetail.riskLevel === 'critical' 
                  ? 'CRITICAL: Severe risk of fragmentation cascade. Adjust velocity vector slider to simulate escape trajectory.' 
                  : 'WARNING: Monitor conjunction parameters. Prepare collision avoidance sequence.')}
          </div>
        </div>
      )}

      {!conjunctionDetail && (
        <div className="bg-blue-950/25 border border-blue-500/30 rounded-lg p-3 mb-4 text-xs space-y-3 shadow-lg shadow-blue-950/20 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-blue-500/10 pb-1.5">
            <span className="font-display font-bold text-blue-400 tracking-wider uppercase flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
              Orbital Boost Simulator
            </span>
            <span className={`text-[9px] font-mono border px-2 py-0.5 rounded font-bold uppercase ${
              maneuverDeltaV !== 0
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 animate-pulse'
                : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
            }`}>
              {maneuverDeltaV !== 0 ? 'Thrust Active' : 'Standby'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[9px] font-mono">
            <div className="bg-slate-950/40 p-1.5 rounded border border-white/5 flex flex-col justify-between">
              <span className="text-slate-400 uppercase tracking-wider">Period</span>
              <span className={`text-xs font-bold mt-1 ${maneuverDeltaV !== 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                {orbitalPeriodMinMod.toFixed(1)} m
              </span>
              {maneuverDeltaV !== 0 && (
                <span className="text-[7.5px] text-slate-500">
                  Orig: {orbitalPeriodMin.toFixed(1)}m
                </span>
              )}
            </div>
            <div className="bg-slate-950/40 p-1.5 rounded border border-white/5 flex flex-col justify-between">
              <span className="text-slate-400 uppercase tracking-wider">Perigee</span>
              <span className={`text-xs font-bold mt-1 ${maneuverDeltaV !== 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                {perigeeKmMod.toFixed(1)} km
              </span>
              {maneuverDeltaV !== 0 && (
                <span className="text-[7.5px] text-slate-500">
                  Orig: {perigeeKm.toFixed(1)}km
                </span>
              )}
            </div>
            <div className="bg-slate-950/40 p-1.5 rounded border border-white/5 flex flex-col justify-between">
              <span className="text-slate-400 uppercase tracking-wider">Apogee</span>
              <span className={`text-xs font-bold mt-1 ${maneuverDeltaV !== 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                {apogeeKmMod.toFixed(1)} km
              </span>
              {maneuverDeltaV !== 0 && (
                <span className="text-[7.5px] text-slate-500">
                  Orig: {apogeeKm.toFixed(1)}km
                </span>
              )}
            </div>
          </div>

          
          {/* Orbital Altitude Trade-Space Curve Chart */}
          <div className="bg-slate-950/45 border border-white/5 p-2 rounded-lg space-y-1">
            <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-mono">
              Altitude Trade-Space (DV vs Apogee)
            </span>
            <div className="h-[95px] w-full mt-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={(() => {
                    const pts = [];
                    for (let dv = -30; dv <= 30; dv += 5) {
                      const mod = getModifiedElements(objectData, dv);
                      const nR2 = (mod.meanMotion * 2 * Math.PI) / 86400.0;
                      const aM2 = (isFinite(mod.meanMotion) && mod.meanMotion > 0)
                        ? Math.pow(GM_EARTH / (nR2 * nR2), 1.0 / 3.0)
                        : semiMajorAxis;
                      const apK2 = aM2 * (1.0 + mod.eccentricity) - EARTH_RADIUS_KM;
                      pts.push({ dv: dv > 0 ? `+${dv}` : `${dv}`, apogee: parseFloat(apK2.toFixed(1)) });
                    }
                    return pts;
                  })()}
                  margin={{ top: 2, right: 5, left: -14, bottom: 2 }}
                >
                  <defs>
                    <linearGradient id="colorBoostAlt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="dv" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} unit="m/s" />
                  <YAxis stroke="#475569" fontSize={8} tickLine={false} axisLine={false} tickFormatter={(v) => String(Math.round(v))} width={42} />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-slate-900 border border-slate-800 p-2 rounded text-[9px] text-slate-300 font-mono shadow-xl">
                            <p className="font-semibold text-slate-100">dV: {d.dv} m/s</p>
                            <p className="text-blue-400">Apogee: {d.apogee.toLocaleString()} km</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area type="monotone" dataKey="apogee" stroke="#3b82f6" strokeWidth={1.5} fillOpacity={1} fill="url(#colorBoostAlt)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[8px] font-mono text-slate-500 text-center">
              Baseline Apogee: <span className="text-blue-400 font-semibold">{apogeeKm.toFixed(1)} km</span>
              {maneuverDeltaV !== 0 && (
                <span className="text-emerald-400 font-semibold ml-2">after burn: {apogeeKmMod.toFixed(1)} km</span>
              )}
            </div>
          </div>

          {/* Interactive Maneuver Control Slider Console */}
          <div className="bg-slate-950/65 border border-white/5 rounded p-2.5 space-y-2">
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-slate-400 uppercase tracking-wider">Simulate Boost (Delta-V)</span>
              <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                maneuverDeltaV === 0 ? 'bg-slate-800 text-slate-300' : (maneuverDeltaV > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400')
              }`}>
                {maneuverDeltaV > 0 ? `+${maneuverDeltaV.toFixed(1)}` : maneuverDeltaV.toFixed(1)} m/s
              </span>
            </div>
            
            <input 
              type="range" 
              min="-30" 
              max="30" 
              step="0.1"
              value={maneuverDeltaV} 
              onChange={(e) => onManeuverDeltaVChange(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 bg-slate-800 h-1.5 rounded cursor-pointer"
            />
            
            <div className="flex justify-between text-[8px] text-slate-500 font-mono">
              <span>-30.0 m/s (Retro)</span>
              <button 
                onClick={() => onManeuverDeltaVChange(0)}
                className="hover:text-white transition-colors text-[9px] uppercase tracking-wider text-slate-400 border border-white/5 px-2 py-0.5 rounded bg-white/5"
              >
                Reset Boost
              </button>
              <span>+30.0 m/s (Pro)</span>
            </div>
          </div>

          <div className={`p-2 rounded text-[10px] leading-relaxed border ${
            maneuverDeltaV !== 0 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
          }`}>
            <span className="font-bold uppercase tracking-wider block mb-0.5">Physical Effect:</span>
            {maneuverDeltaV > 0
              ? `Prograde burn of ${maneuverDeltaV.toFixed(1)} m/s increases orbital energy, raising apogee by ${(apogeeKmMod - apogeeKm).toFixed(1)} km and extending period by ${(orbitalPeriodMinMod - orbitalPeriodMin).toFixed(2)} mins.`
              : maneuverDeltaV < 0
                ? `Retrograde burn of ${maneuverDeltaV.toFixed(1)} m/s decreases orbital energy, lowering perigee by ${Math.abs(perigeeKmMod - perigeeKm).toFixed(1)} km and contracting orbital period.`
                : 'Engine standby. Drag the slider to apply thrust and see the modified orbital track overlay on the 3D globe.'}
          </div>
        </div>
      )}


      {/* Core Keplerian Elements Grid */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-slate-950/40 border border-white/5 p-2.5 rounded-lg flex items-center gap-2.5 cursor-help" title="Time taken to complete one full orbit around Earth.">
          <Clock className="w-4 h-4 text-slate-500" />
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
              Orbital Period
              <HelpCircle className="w-2.5 h-2.5 text-slate-600" />
            </span>
            <span className="text-xs font-bold text-white font-mono">{orbitalPeriodMin.toFixed(1)} mins</span>
          </div>
        </div>

        <div className="bg-slate-950/40 border border-white/5 p-2.5 rounded-lg flex items-center gap-2.5 cursor-help" title="Number of complete revolutions around Earth per 24-hour day.">
          <Cpu className="w-4 h-4 text-slate-500" />
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
              Mean Motion
              <HelpCircle className="w-2.5 h-2.5 text-slate-600" />
            </span>
            <span className="text-xs font-bold text-white font-mono">{objectData.meanMotion.toFixed(4)} rev/d</span>
          </div>
        </div>

        <div className="bg-slate-950/40 border border-white/5 p-2.5 rounded-lg cursor-help" title="The lowest altitude point in the satellite's elliptical orbit.">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
              Perigee (min altitude)
              <HelpCircle className="w-2.5 h-2.5 text-slate-600" />
            </span>
            <span className="text-xs font-bold text-white font-mono">{perigeeKm.toFixed(1)} km</span>
          </div>
        </div>

        <div className="bg-slate-950/40 border border-white/5 p-2.5 rounded-lg cursor-help" title="The highest altitude point in the satellite's elliptical orbit.">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
              Apogee (max altitude)
              <HelpCircle className="w-2.5 h-2.5 text-slate-600" />
            </span>
            <span className="text-xs font-bold text-white font-mono">{apogeeKm.toFixed(1)} km</span>
          </div>
        </div>

        <div className="bg-slate-950/40 border border-white/5 p-2.5 rounded-lg cursor-help" title="The tilt angle of the orbit relative to Earth's equator (0° = equatorial, 90° = polar orbit).">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
              Inclination
              <HelpCircle className="w-2.5 h-2.5 text-slate-600" />
            </span>
            <span className="text-xs font-bold text-white font-mono">{objectData.inclination.toFixed(4)}°</span>
          </div>
        </div>

        <div className="bg-slate-950/40 border border-white/5 p-2.5 rounded-lg cursor-help" title="The oval shape rating of the orbit (0.0 = circular orbit, > 0.0 = elliptical orbit).">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
              Eccentricity
              <HelpCircle className="w-2.5 h-2.5 text-slate-600" />
            </span>
            <span className="text-xs font-bold text-white font-mono">{objectData.eccentricity.toFixed(6)}</span>
          </div>
        </div>
      </div>

      {/* Epoch Timestamp */}
      <div className="bg-slate-950/60 border border-white/5 p-3 rounded-lg mb-5 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-blue-400" />
        <div className="flex flex-col">
          <span className="text-[9px] uppercase text-slate-400">Keplerian Elements Epoch</span>
          <span className="text-[11px] font-mono text-slate-200">{new Date(objectData.epoch).toUTCString()}</span>
        </div>
      </div>

      {/* TLE Code box */}
      <div className="space-y-1.5 mb-5">
        <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Raw TLE Elements Format</span>
        <div className="bg-slate-950 p-2.5 rounded border border-white/5 font-mono text-[9px] text-blue-400 overflow-x-auto select-all leading-relaxed">
          <p className="line-clamp-1">{objectData.name}</p>
          <p className="line-clamp-1">{objectData.tleLine1}</p>
          <p className="line-clamp-1">{objectData.tleLine2}</p>
        </div>
      </div>

      {/* Dynamic SGP4 Propagated Path Coordinate nodes */}
      <div className="w-full">
        <span className="text-[9px] uppercase font-bold text-slate-400 block mb-2.5 tracking-wider">
          Propagated Geodetic Trajectory (3 Hour Outlook)
        </span>
        <div className="space-y-1.5">
          {propagation.map((p, idx) => (
            <div key={idx} className="flex justify-between items-center text-[10px] font-mono bg-slate-900/40 px-2 py-1 border-b border-white/5">
              <span className="text-slate-400">
                {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-slate-300">Lat: {p.lat.toFixed(2)}°</span>
              <span className="text-slate-300">Lon: {p.lon.toFixed(2)}°</span>
              <span className="text-blue-400 font-semibold">{p.alt_km.toFixed(0)} km</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
