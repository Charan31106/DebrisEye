/**
 * Native Node.js Kessler Index Calculator
 */
export function calculateKesslerRiskJs(objectsData, activeConjunctions) {
  const totalObjects = objectsData.length;
  
  // 1. Density of tracked catalog items (Cap: 35 points)
  const objectCountScore = Math.min(35.0, (totalObjects / 1000.0) * 35.0);

  // 2. High risk active conjunctions (Cap: 35 points)
  const criticalConjunctions = activeConjunctions.filter(c => c.pc > 1e-5);
  const conjunctionScore = Math.min(35.0, (criticalConjunctions.length / 5.0) * 35.0);

  // 3. LEO Debris Density in shell 400-2000km (Cap: 20 points)
  const leoDebris = objectsData.filter(o => o.altitudeKm >= 400 && o.altitudeKm <= 2000);
  const leoDensityScore = Math.min(20.0, (leoDebris.length / 500.0) * 20.0);

  // 4. Extreme Conjunction count (Cap: 10 points)
  const extremeRiskCount = activeConjunctions.filter(c => c.pc > 1e-3).length;
  const fragmentationScore = Math.min(10.0, extremeRiskCount * 5.0);

  const totalScore = objectCountScore + conjunctionScore + leoDensityScore + fragmentationScore;
  const score = Math.max(0.0, Math.min(100.0, totalScore));

  return {
    score: Math.round(score * 10) / 10,
    factors: {
      objectCountScore: Math.round(objectCountScore * 100) / 100,
      conjunctionScore: Math.round(conjunctionScore * 100) / 100,
      leoDensityScore: Math.round(leoDensityScore * 100) / 100,
      fragmentationScore: Math.round(fragmentationScore * 100) / 100,
      totalObjectsTracked: totalObjects,
      criticalConjunctionsCount: criticalConjunctions.length,
      leoObjectsCount: leoDebris.length
    }
  };
}
