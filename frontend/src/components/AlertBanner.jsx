import React, { useEffect, useState } from 'react';
import { AlertOctagon, X, Volume2, ShieldAlert } from 'lucide-react';

export default function AlertBanner({ alerts }) {
  const [activeAlert, setActiveAlert] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Automatically select the latest alert from the socket pool
    if (alerts && alerts.length > 0) {
      const latest = alerts[0];
      // Only display critical/high-threat alerts in the banner
      if (latest.severity === 'CRITICAL' || latest.payload?.pc > 1e-4) {
        setActiveAlert(latest);
        setDismissed(false);
        
        // Sound a subtle synthesizer beep alert to simulate Space command vibes!
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(320, audioCtx.currentTime); // Pitch
          osc.frequency.exponentialRampToValueAtTime(160, audioCtx.currentTime + 0.4);
          
          gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
          
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          
          osc.start();
          osc.stop(audioCtx.currentTime + 0.5);
        } catch (e) {
          // Audio blocked or unsupported
        }
      }
    }
  }, [alerts]);

  if (!activeAlert || dismissed) return null;

  const payload = activeAlert.payload;
  const isCritical = activeAlert.severity === 'CRITICAL';

  return (
    <div className={`w-full relative px-6 py-3.5 border-b flex items-center justify-between z-40 transition-all duration-300 animate-pulse ${
      isCritical 
        ? 'bg-rose-950/80 border-rose-500/30 text-rose-200' 
        : 'bg-amber-950/80 border-amber-500/30 text-amber-200'
    }`}>
      {/* Glow decorative backdrop */}
      <div className="absolute inset-0 bg-gradient-to-r from-red-600/10 via-transparent to-transparent pointer-events-none" />

      <div className="flex items-center gap-3.5 flex-1 mr-4 overflow-hidden">
        <div className={`p-2 rounded-lg ${isCritical ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
          <AlertOctagon className="w-5 h-5 animate-bounce" />
        </div>
        
        <div className="flex flex-col text-xs md:text-sm">
          <span className="font-display font-bold tracking-wider flex items-center gap-1.5 uppercase">
            <ShieldAlert className="w-4 h-4 text-rose-500 animate-spin-slow" />
            CRITICAL CONJUNCTION INTRUSION DETECTED
          </span>
          <span className="text-slate-300 font-mono line-clamp-1 mt-0.5">
            <strong>{payload.object1?.name || `NORAD ${payload.object1Id}`}</strong> is in close approach encounter with <strong>{payload.object2?.name || `NORAD ${payload.object2Id}`}</strong>. 
            TCA: <span className="text-white font-semibold">{new Date(payload.tca).toLocaleTimeString()} UTC</span> | 
            Miss Distance: <span className="text-rose-400 font-semibold">{payload.missDistance.toFixed(1)}m</span> | 
            Collision Probability: <span className="text-rose-400 font-bold">{payload.pc.toExponential(2)}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {payload.recommendedAction && (
          <span className="hidden lg:inline-block text-[10px] font-semibold uppercase tracking-widest font-mono border border-red-500/40 px-3 py-1 rounded bg-red-950/40 text-red-400 max-w-sm truncate">
            {payload.recommendedAction}
          </span>
        )}
        <button 
          onClick={() => setDismissed(true)}
          className="text-slate-400 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
