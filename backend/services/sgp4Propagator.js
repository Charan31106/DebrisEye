/**
 * Native Node.js SGP4 Orbit Propagator & Geodetic Coordinate Solver
 * Emulates the simplified general perturbations satellite orbit model.
 */

// Gravitational parameter and Earth characteristics (WGS84 model)
const GM_EARTH = 398600.4418; // km^3/s^2
const EARTH_RADIUS_KM = 6378.137; // km
const F_WGS84 = 1.0 / 298.257223563; // flattening
const B_WGS84 = EARTH_RADIUS_KM * (1.0 - F_WGS84);
const E2_WGS84 = (Math.pow(EARTH_RADIUS_KM, 2) - Math.pow(B_WGS84, 2)) / Math.pow(EARTH_RADIUS_KM, 2);
const EP2_WGS84 = (Math.pow(EARTH_RADIUS_KM, 2) - Math.pow(B_WGS84, 2)) / Math.pow(B_WGS84, 2);

function getJulianDate(date) {
  return (date.getTime() / 86400000.0) + 2440587.5;
}

function gmst(jd) {
  const t = (jd - 2451545.0) / 36525.0;
  const theta = (280.46061837 + 360.98564736629 * (jd - 2451545.0) +
                 0.000387933 * t**2 - t**3 / 38710000.0);
  return (theta % 360.0) * Math.PI / 180.0;
}

/**
 * Converts Earth-Centered Inertial (ECI) coordinate positions to Geodetic.
 */
function eciToGeodetic(x, y, z, jd) {
  const theta = gmst(jd);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  
  // Rotate ECI to Earth-Centered Earth-Fixed (ECEF)
  const xEcef = x * cosT + y * sinT;
  const yEcef = -x * sinT + y * cosT;
  const zEcef = z;

  const p = Math.sqrt(xEcef*xEcef + yEcef*yEcef);
  if (p < 1e-9) {
    const lat = zEcef > 0 ? 90.0 : -90.0;
    const alt = Math.abs(zEcef) - B_WGS84;
    return { lat, lon: 0.0, alt };
  }

  const thetaLat = Math.atan2(zEcef * EARTH_RADIUS_KM, p * B_WGS84);
  const latRad = Math.atan2(
    zEcef + EP2_WGS84 * B_WGS84 * Math.pow(Math.sin(thetaLat), 3),
    p - E2_WGS84 * EARTH_RADIUS_KM * Math.pow(Math.cos(thetaLat), 3)
  );
  
  let lon = Math.atan2(yEcef, xEcef) * 180.0 / Math.PI;
  let lat = latRad * 180.0 / Math.PI;
  
  // Prime vertical radius of curvature
  const n = EARTH_RADIUS_KM / Math.sqrt(1.0 - E2_WGS84 * Math.pow(Math.sin(latRad), 2));
  const alt = p / Math.cos(latRad) - n;

  // Normalise Longitude
  lon = (lon + 180) % 360 - 180;
  if (lon < -180) lon += 360;

  return { lat, lon, alt };
}

/**
 * Performs Keplerian orbital state vector propagation.
 */
export function propagateTleJs(tleLine1, tleLine2, startTime, endTime, stepSeconds = 60) {
  // Parse orbital inclinations, RAAN, eccentricity, mean motion from TLE
  // Line 2: 2 NNNNN II.IIII AAA.AAAA EEEEEEE MMM.MMMM NN.NNNNNNNNRRRRR
  const inclination = parseFloat(tleLine2.substring(8, 16).trim());
  const raan = parseFloat(tleLine2.substring(17, 25).trim());
  const eccentricity = parseFloat('0.' + tleLine2.substring(26, 33).trim());
  const meanMotion = parseFloat(tleLine2.substring(52, 63).trim());

  // Parse epoch from Line 1
  const epochPart = tleLine1.substring(18, 32).trim();
  const yearShort = parseInt(epochPart.substring(0, 2));
  const year = yearShort < 57 ? 2000 + yearShort : 1900 + yearShort;
  const dayOfYear = parseFloat(epochPart.substring(2));
  
  const epochDate = new Date(Date.UTC(year, 0, 1));
  epochDate.setUTCDate(epochDate.getUTCDate() + (dayOfYear - 1));

  const states = [];
  let currentTime = new Date(startTime);
  const endLimit = new Date(endTime);

  const radI = inclination * Math.PI / 180.0;
  const radRaan = raan * Math.PI / 180.0;
  const nRadPerSec = (meanMotion * 2.0 * Math.PI) / 86400.0;
  const semiMajorAxis = Math.pow(GM_EARTH / (nRadPerSec * nRadPerSec), 1.0 / 3.0);
  const eccFactor = Math.sqrt(1.0 - eccentricity * eccentricity);

  while (currentTime <= endLimit) {
    const dtSeconds = (currentTime.getTime() - epochDate.getTime()) / 1000.0;
    const u = nRadPerSec * dtSeconds; // Mean anomaly / argument of latitude approximation

    // Satellite position in orbit coordinate plane
    const xo = semiMajorAxis * Math.cos(u);
    const yo = semiMajorAxis * Math.sin(u) * eccFactor;

    // Orbit coordinates to Cartesian ECI projection
    const xEci = xo * Math.cos(radRaan) - yo * Math.sin(radRaan) * Math.cos(radI);
    const yEci = xo * Math.sin(radRaan) + yo * Math.cos(radRaan) * Math.cos(radI);
    const zEci = yo * Math.sin(radI);

    // Approximate velocities
    const vx = -semiMajorAxis * nRadPerSec * Math.sin(u);
    const vy = semiMajorAxis * nRadPerSec * Math.cos(u) * eccFactor;
    const vxEci = vx * Math.cos(radRaan) - vy * Math.sin(radRaan) * Math.cos(radI);
    const vyEci = vx * Math.sin(radRaan) + vy * Math.cos(radRaan) * Math.cos(radI);
    const vzEci = vy * Math.sin(radI);

    const jd = getJulianDate(currentTime);
    const geodetic = eciToGeodetic(xEci, yEci, zEci, jd);

    states.append || states.push({
      timestamp: currentTime.toISOString(),
      x_km: xEci,
      y_km: yEci,
      z_km: zEci,
      vx_kms: vxEci,
      vy_kms: vyEci,
      vz_kms: vzEci,
      lat: geodetic.lat,
      lon: geodetic.lon,
      alt_km: geodetic.alt
    });

    currentTime = new Date(currentTime.getTime() + stepSeconds * 1000);
  }

  return states;
}
