import { WebSocketServer } from 'ws';
import { PrismaClient } from '@prisma/client';
import { calculateKesslerRiskJs } from './kesslerMath.js';

const prisma = new PrismaClient();

// Earth rotation constants for local coordinate Solver
const GM_EARTH = 398600.4418;
const EARTH_RADIUS_KM = 6378.137;

/**
 * Calculates a standard Julian Date.
 */
function getJulianDate(date) {
  return (date.getTime() / 86400000.0) + 2440587.5;
}

/**
 * Greenwich Mean Sidereal Time (GMST) in radians.
 */
function gmst(jd) {
  const t = (jd - 2451545.0) / 36525.0;
  const theta = (280.46061837 + 360.98564736629 * (jd - 2451545.0) +
                 0.000387933 * t**2 - t**3 / 38710000.0);
  return (theta % 360.0) * Math.PI / 180.0;
}

/**
 * High-performance Keplerian position propagator in JavaScript.
 * Runs instantly in a loop over all objects in database.
 */
function propagateKeplerian(obj, now) {
  try {
    const epochTime = new Date(obj.epoch).getTime();
    const currentTime = now.getTime();
    const dtSeconds = (currentTime - epochTime) / 1000.0;

    const radI = obj.inclination * Math.PI / 180.0;
    const radRaan = obj.raan * Math.PI / 180.0;

    // Mean motion is in revolutions per day. Convert to rad/sec.
    const nRadPerSec = (obj.meanMotion * 2.0 * Math.PI) / 86400.0;
    const semiMajorAxis = Math.pow(GM_EARTH / (nRadPerSec * nRadPerSec), 1.0 / 3.0);

    // Approximate argument of latitude (angle along orbit from ascending node)
    // Assume mean anomaly starts at 0 at epoch.
    const u = nRadPerSec * dtSeconds;

    // Orbit plane coordinates
    const eccentricityFactor = Math.sqrt(1.0 - obj.eccentricity * obj.eccentricity);
    const xo = semiMajorAxis * Math.cos(u);
    const yo = semiMajorAxis * Math.sin(u) * eccentricityFactor;

    // Rotate to ECI (Earth-Centered Inertial) frame
    const xEci = xo * Math.cos(radRaan) - yo * Math.sin(radRaan) * Math.cos(radI);
    const yEci = xo * Math.sin(radRaan) + yo * Math.cos(radRaan) * Math.cos(radI);
    const zEci = yo * Math.sin(radI);

    // Coordinate rotation into ECEF (Earth-Centered Earth-Fixed) using GMST rotation
    const jd = getJulianDate(now);
    const theta = gmst(jd);

    const xEcef = xEci * Math.cos(theta) + yEci * Math.sin(theta);
    const yEcef = -xEci * Math.sin(theta) + yEci * Math.cos(theta);
    const zEcef = zEci;

    // ECEF to Geodetic spherical conversion
    const lat = Math.atan2(zEcef, Math.sqrt(xEcef*xEcef + yEcef*yEcef)) * 180.0 / Math.PI;
    const lon = Math.atan2(yEcef, xEcef) * 180.0 / Math.PI;
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

export function initWebSocketServer(server) {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set();

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`[WebSocket] Client connected. Active clients: ${clients.size}`);

    // Send initial greeting and kessler index
    ws.send(JSON.stringify({ type: 'sys_connect', data: { status: 'authorized' } }));

    // Send immediate initial positions right after connection
    sendImmediatePositions(ws);

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WebSocket] Client disconnected. Active clients: ${clients.size}`);
    });
  });

  // Global broadcaster function helper
  const broadcast = (type, data) => {
    const payload = JSON.stringify({ type, data });
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  };

  /**
   * Pushes initial positions to a new client to avoid waiting 60 seconds
   */
  async function sendImmediatePositions(ws) {
    try {
      const catalog = await prisma.debrisObject.findMany({});
      const now = new Date();
      const updatedPositions = catalog
        .map(obj => propagateKeplerian(obj, now))
        .filter(p => p !== null);

      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'debris_update',
          data: updatedPositions
        }));
      }
    } catch (e) {
      console.error('[WebSocket] Failed to send immediate positions:', e.message);
    }
  }

  // Periodic 60-second broadcast loop
  setInterval(async () => {
    if (clients.size === 0) return;

    try {
      console.log('[WebSocketServer] Broadcasting 60s live debris positions updates...');
      
      // 1. Fetch catalog and propagate positions
      const catalog = await prisma.debrisObject.findMany({});
      const now = new Date();
      const updatedPositions = catalog
        .map(obj => propagateKeplerian(obj, now))
        .filter(p => p !== null);

      broadcast('debris_update', updatedPositions);

      // 2. Fetch fresh Kessler Score and broadcast
      const conjunctions = await prisma.conjunction.findMany({
        where: { resolved: false },
        select: { pc: true }
      });
      const objectsSelect = catalog.map(c => ({ altitudeKm: c.altitudeKm, riskScore: c.riskScore }));

      let kesslerScore = 12.5;
      try {
        const result = calculateKesslerRiskJs(objectsSelect, conjunctions);
        kesslerScore = result.score;
      } catch (e) {
        // Fallback
      }
      
      broadcast('kessler_update', { score: kesslerScore, timestamp: now.toISOString() });

    } catch (err) {
      console.error('[WebSocketServer] Error in periodic broadcast loop:', err.message);
    }
  }, 60000);

  return broadcast;
}
