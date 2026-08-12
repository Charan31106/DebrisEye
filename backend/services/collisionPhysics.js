/**
 * Native Node.js Collision Probability Physics Engine
 * Implements Chan's analytical encounter plane probability model 
 * and a 1,000-iteration Monte Carlo statistical simulator.
 */

// Math factorials lookup table
const factorials = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
function factorial(n) {
  if (n < 0) return 0;
  if (n <= 10) return factorials[n];
  let val = 1;
  for (let i = 2; i <= n; i++) val *= i;
  return val;
}

// Box-Muller transform to generate standard normal distributions
function randomNormal(mean = 0, std = 1) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * std + mean;
}

/**
 * Chan's isotropic probability series calculation.
 */
export function calculateChanProbability(missDistanceM, relativeVelocityKms, combinedRadiusM = 15.0, sigmaM = 100.0) {
  const v = Math.pow(missDistanceM / sigmaM, 2);
  const u = Math.pow(combinedRadiusM, 2) / (2.0 * Math.pow(sigmaM, 2));

  let prob = 0.0;
  const eV = Math.exp(-v / 2.0);
  const eU = Math.exp(-u);

  for (let m = 0; m < 10; m++) {
    const coeff = Math.pow(v / 2.0, m) / factorial(m);
    let sumK = 0.0;
    for (let k = 0; k <= m; k++) {
      sumK += Math.pow(u, k) / factorial(k);
    }
    prob += coeff * (1.0 - eU * sumK);
  }

  return eV * prob;
}

/**
 * 1,000-iteration Monte Carlo Gaussian coordinate perturbation.
 */
export function runMonteCarloSimJs(pos1, pos2, combinedRadiusM = 15.0, sigmaM = 100.0, iterations = 1000) {
  const p1M = pos1.map(val => val * 1000.0);
  const p2M = pos2.map(val => val * 1000.0);

  const singleSigma = sigmaM / Math.sqrt(2.0);
  let hits = 0;
  let minSimDist = Infinity;

  for (let i = 0; i < iterations; i++) {
    const noise1 = [randomNormal(0, singleSigma), randomNormal(0, singleSigma), randomNormal(0, singleSigma)];
    const noise2 = [randomNormal(0, singleSigma), randomNormal(0, singleSigma), randomNormal(0, singleSigma)];

    const pertP1 = [p1M[0] + noise1[0], p1M[1] + noise1[1], p1M[2] + noise1[2]];
    const pertP2 = [p2M[0] + noise2[0], p2M[1] + noise2[1], p2M[2] + noise2[2]];

    const dx = pertP1[0] - pertP2[0];
    const dy = pertP1[1] - pertP2[1];
    const dz = pertP1[2] - pertP2[2];
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

    if (dist < minSimDist) {
      minSimDist = dist;
    }
    if (dist < combinedRadiusM) {
      hits++;
    }
  }

  return {
    probability: hits / iterations,
    minDistance: minSimDist
  };
}

/**
 * Locates the Time of Closest Approach (TCA) between two trajectory files.
 */
export function findClosestApproachJs(orbit1, orbit2) {
  let minDist = Infinity;
  let tcaIndex = -1;
  let relVel = 0.0;

  for (let i = 0; i < orbit1.length; i++) {
    const state1 = orbit1[i];
    const state2 = orbit2.find(s => s.timestamp === state1.timestamp);
    if (!state2) continue;

    const dx = state1.x_km - state2.x_km;
    const dy = state1.y_km - state2.y_km;
    const dz = state1.z_km - state2.z_km;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

    if (dist < minDist) {
      minDist = dist;
      tcaIndex = i;

      const dvx = state1.vx_kms - state2.vx_kms;
      const dvy = state1.vy_kms - state2.vy_kms;
      const dvz = state1.vz_kms - state2.vz_kms;
      relVel = Math.sqrt(dvx*dvx + dvy*dvy + dvz*dvz);
    }
  }

  if (tcaIndex === -1) return null;

  const o1 = orbit1[tcaIndex];
  const o2 = orbit2.find(s => s.timestamp === o1.timestamp);

  return {
    timestamp: o1.timestamp,
    missDistanceM: minDist * 1000.0,
    relativeVelocityKms: relVel,
    pos1: [o1.x_km, o1.y_km, o1.z_km],
    pos2: [o2.x_km, o2.y_km, o2.z_km]
  };
}
