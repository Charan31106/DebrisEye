import { useEffect, useState, useRef } from 'react';

const BACKEND_WS_URL = import.meta.env.VITE_BACKEND_WS_URL || 'ws://localhost:4000';

// Keplerian Orbit Propagator Constants
const GM_EARTH = 398600.4418;
const EARTH_RADIUS_KM = 6378.137;

function getJulianDate(date) {
  return (date.getTime() / 86400000.0) + 2440587.5;
}

function gmst(jd) {
  const t = (jd - 2451545.0) / 36525.0;
  const theta = (280.46061837 + 360.98564736629 * (jd - 2451545.0) +
                 0.000387933 * t**2 - t**3 / 38710000.0);
  return (theta % 360.0) * Math.PI / 180.0;
}

function propagateKeplerian(obj, now) {
  try {
    const epochTime = new Date(obj.epoch).getTime();
    const currentTime = now.getTime();
    const dtSeconds = (currentTime - epochTime) / 1000.0;

    const radI = obj.inclination * Math.PI / 180.0;
    const radRaan = (obj.raan || 0.0) * Math.PI / 180.0;

    // Convert mean motion (revs/day) to rad/sec
    const nRadPerSec = (obj.meanMotion * 2.0 * Math.PI) / 86400.0;
    const semiMajorAxis = Math.pow(GM_EARTH / (nRadPerSec * nRadPerSec), 1.0 / 3.0);

    const u = nRadPerSec * dtSeconds;
    const eccentricityFactor = Math.sqrt(1.0 - obj.eccentricity * obj.eccentricity);
    const xo = semiMajorAxis * Math.cos(u);
    const yo = semiMajorAxis * Math.sin(u) * eccentricityFactor;

    // ECI rotation
    const xEci = xo * Math.cos(radRaan) - yo * Math.sin(radRaan) * Math.cos(radI);
    const yEci = xo * Math.sin(radRaan) + yo * Math.cos(radRaan) * Math.cos(radI);
    const zEci = yo * Math.sin(radI);

    // ECEF rotation
    const jd = getJulianDate(now);
    const theta = gmst(jd);

    const xEcef = xEci * Math.cos(theta) + yEci * Math.sin(theta);
    const yEcef = -xEci * Math.sin(theta) + yEci * Math.cos(theta);
    const zEcef = zEci;

    const lat = Math.atan2(zEcef, Math.sqrt(xEcef * xEcef + yEcef * yEcef)) * 180.0 / Math.PI;
    const lon = Math.atan2(yEcef, xEci) * 180.0 / Math.PI;
    const alt = semiMajorAxis - EARTH_RADIUS_KM;

    return {
      noradId: obj.noradId,
      name: obj.name,
      x: xEci,
      y: yEci,
      z: zEci,
      lat,
      lon,
      alt: Math.max(100.0, alt),
      riskScore: obj.riskScore,
      inclination: obj.inclination,
      eccentricity: obj.eccentricity,
      meanMotion: obj.meanMotion,
      raan: obj.raan,
      epoch: obj.epoch
    };
  } catch (error) {
    return null;
  }
}

export function useDebrisSocket() {
  const [debris, setDebris] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [kessler, setKessler] = useState(12.5);
  const [status, setStatus] = useState('connecting');
  
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const propagationIntervalRef = useRef(null);
  const rawDebrisRef = useRef([]);

  const startHttpFallback = () => {
    console.log('[useDebrisSocket] Starting HTTP polling fallback...');
    setStatus('connected');

    const fetchDebris = () => {
      fetch('/api/debris?limit=250')
        .then(res => res.json())
        .then(res => {
          if (res.success && Array.isArray(res.data)) {
            rawDebrisRef.current = res.data;
          }
        })
        .catch(e => console.error('[useDebrisSocket Fallback] Failed to fetch debris list:', e));
    };

    const fetchKessler = () => {
      fetch('/api/kessler-index')
        .then(res => res.json())
        .then(res => {
          if (res.success && res.current) {
            setKessler(res.current.score);
          }
        })
        .catch(e => console.error('[useDebrisSocket Fallback] Failed to fetch Kessler index:', e));
    };

    const fetchAlerts = () => {
      fetch('/api/alerts')
        .then(res => res.json())
        .then(res => {
          if (res.success && res.data) {
            setAlerts(res.data);
          }
        })
        .catch(e => console.error('[useDebrisSocket Fallback] Failed to fetch alerts:', e));
    };

    // Initial fetch
    fetchDebris();
    fetchKessler();
    fetchAlerts();

    // Poll data every 15 seconds
    pollingIntervalRef.current = setInterval(() => {
      fetchDebris();
      fetchKessler();
      fetchAlerts();
    }, 15000);

    // Propagate positions locally in frontend every 1.5 seconds for a smooth globe visualization
    propagationIntervalRef.current = setInterval(() => {
      if (rawDebrisRef.current.length > 0) {
        const now = new Date();
        const propagated = rawDebrisRef.current
          .map(obj => propagateKeplerian(obj, now))
          .filter(p => p !== null);
        setDebris(propagated);
      }
    }, 1500);
  };

  const connect = () => {
    setStatus('connecting');
    console.log(`[useDebrisSocket] Connecting to WS server at ${BACKEND_WS_URL}...`);
    
    // Safety check: if Vercel deployment, fail WS immediately to trigger fallback quickly
    if (window.location.hostname.includes('vercel.app')) {
      console.warn('[useDebrisSocket] Vercel environment detected. Directing to HTTP Fallback.');
      startHttpFallback();
      return;
    }

    const ws = new WebSocket(BACKEND_WS_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('[useDebrisSocket] Connected to WS gateway.');
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        switch (type) {
          case 'sys_connect':
            console.log('[useDebrisSocket] Authorized system channel.');
            break;
            
          case 'debris_update':
            setDebris(data);
            break;

          case 'new_conjunction':
            setAlerts((prev) => [
              {
                id: Math.random().toString(36).substring(7),
                type: 'HIGH_COLLISION_RISK',
                severity: 'CRITICAL',
                createdAt: new Date().toISOString(),
                payload: data
              },
              ...prev
            ]);
            break;

          case 'kessler_update':
            setKessler(data.score);
            break;

          default:
            break;
        }
      } catch (e) {
        console.error('[useDebrisSocket] Error parsing WS payload:', e);
      }
    };

    ws.onerror = (err) => {
      console.error('[useDebrisSocket] Socket encountered an error:', err);
      setStatus('disconnected');
    };

    ws.onclose = () => {
      console.warn('[useDebrisSocket] Socket connection closed. Falling back to HTTP polling.');
      setStatus('disconnected');
      startHttpFallback();
    };
  };

  useEffect(() => {
    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      if (propagationIntervalRef.current) clearInterval(propagationIntervalRef.current);
    };
  }, []);

  return { debris, alerts, kessler, status };
}
