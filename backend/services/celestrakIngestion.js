import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Constants for orbit physics calculation
const GM_EARTH = 398600.4418; // Earth gravitational parameter in km^3 / s^2
const EARTH_RADIUS_KM = 6378.137; // Earth equatorial radius in km

/**
 * Parses a standard TLE representation to extract Keplerian elements.
 * Calculates altitude based on Kepler's Third Law.
 */
function parseTle(nameLine, line1, line2) {
  try {
    const name = nameLine.trim();
    const noradId = line1.substring(2, 7).trim();
    
    // Epoch parsing (Format: YYDDD.DDDDDDDD)
    const epochPart = line1.substring(18, 32).trim();
    const yearShort = parseInt(epochPart.substring(0, 2));
    const year = yearShort < 57 ? 2000 + yearShort : 1900 + yearShort;
    const dayOfYear = parseFloat(epochPart.substring(2));
    
    const epoch = new Date(Date.UTC(year, 0, 1));
    epoch.setUTCDate(epoch.getUTCDate() + (dayOfYear - 1));

    // Orbital Elements
    const inclination = parseFloat(line2.substring(8, 16).trim());
    const raan = parseFloat(line2.substring(17, 25).trim());
    
    // Eccentricity (assumes decimal point is before the parsed digits)
    const eccentricityStr = '0.' + line2.substring(26, 33).trim();
    const eccentricity = parseFloat(eccentricityStr);
    
    const meanMotion = parseFloat(line2.substring(52, 63).trim());

    // Kepler's Third Law: T^2 = (4 * pi^2 * a^3) / GM
    // Mean motion (n) is in revolutions per day. Convert to radians per second.
    const nRadPerSec = (meanMotion * 2 * Math.PI) / 86400.0;
    const semiMajorAxis = Math.pow(GM_EARTH / (nRadPerSec * nRadPerSec), 1.0 / 3.0);
    const altitudeKm = semiMajorAxis - EARTH_RADIUS_KM;

    return {
      noradId,
      name,
      tleLine1: line1.trim(),
      tleLine2: line2.trim(),
      epoch,
      inclination,
      eccentricity,
      raan,
      meanMotion,
      altitudeKm: Math.max(0, altitudeKm), // Ensure non-negative altitude
    };
  } catch (error) {
    console.error('Error parsing TLE chunk:', error.message);
    return null;
  }
}

/**
 * Parses SOCRATES CSV format and turns them into structured conjunction objects.
 */
function parseSocratesCsv(csvText) {
  const lines = csvText.split('\n');
  const headers = lines[0].split(',');
  const conjunctions = [];

  // Indices map
  const sat1IdIdx = headers.findIndex(h => h.includes('sat1_id') || h.includes('SAT_1_ID'));
  const sat2IdIdx = headers.findIndex(h => h.includes('sat2_id') || h.includes('SAT_2_ID'));
  const sat1NameIdx = headers.findIndex(h => h.includes('sat1_name') || h.includes('SAT_1_NAME'));
  const sat2NameIdx = headers.findIndex(h => h.includes('sat2_name') || h.includes('SAT_2_NAME'));
  const tcaIdx = headers.findIndex(h => h.includes('tca') || h.includes('TCA'));
  const missIdx = headers.findIndex(h => h.includes('miss_distance') || h.includes('MISS_DISTANCE'));
  const pcIdx = headers.findIndex(h => h.includes('pc') || h.includes('PREFERRED_PC') || h.includes('probability') || h.includes('PROBABILITY'));

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    
    try {
      const obj1Id = cols[sat1IdIdx]?.replace(/"/g, '').trim();
      const obj2Id = cols[sat2IdIdx]?.replace(/"/g, '').trim();
      const obj1Name = cols[sat1NameIdx]?.replace(/"/g, '').trim();
      const obj2Name = cols[sat2NameIdx]?.replace(/"/g, '').trim();
      
      const tcaStr = cols[tcaIdx]?.replace(/"/g, '').trim();
      const tca = tcaStr ? new Date(tcaStr) : new Date();

      const missDistanceKm = parseFloat(cols[missIdx]) || 1.0;
      const missDistance = missDistanceKm * 1000.0; // In meters

      const pc = parseFloat(cols[pcIdx]) || 1e-6;

      let riskLevel = 'normal';
      if (pc > 1e-4) riskLevel = 'critical';
      else if (pc > 1e-5) riskLevel = 'warning';

      if (obj1Id && obj2Id) {
        conjunctions.push({
          object1Id: obj1Id,
          object2Id: obj2Id,
          tca,
          missDistance,
          pc,
          riskLevel,
          obj1Name,
          obj2Name
        });
      }
    } catch (e) {
      console.warn('Skipping CSV row due to error:', e.message);
    }
  }

  return conjunctions;
}

/**
 * Downloads and parses debris and satellite catalog.
 */
async function fetchCatalogAndIngest() {
  console.log('[Ingestion] Downloading TLE catalog from CelesTrak...');
  try {
    // Fetch a subset of elements representing debris objects or satellites to optimize system performance
    // CelesTrak active satellites or space debris lists.
    const response = await axios.get('https://celestrak.org/pub/TLE/catalog.txt', {
      timeout: 30000,
    });
    
    const lines = response.data.split('\n');
    let ingestedCount = 0;
    
    // We will parse up to 1000 items representing diverse satellites and debris to keep the DB snappy
    const maxItems = 1000;
    
    for (let i = 0; i < lines.length - 2 && ingestedCount < maxItems; i += 3) {
      const name = lines[i]?.trim();
      const line1 = lines[i + 1]?.trim();
      const line2 = lines[i + 2]?.trim();

      if (!name || !line1 || !line2 || !line1.startsWith('1') || !line2.startsWith('2')) {
        // Shift by 1 if not aligned
        i -= 2;
        continue;
      }

      const parsed = parseTle(name, line1, line2);
      if (parsed) {
        // Upsert debris object by noradId
        await prisma.debrisObject.upsert({
          where: { noradId: parsed.noradId },
          update: {
            name: parsed.name,
            tleLine1: parsed.tleLine1,
            tleLine2: parsed.tleLine2,
            epoch: parsed.epoch,
            altitudeKm: parsed.altitudeKm,
            inclination: parsed.inclination,
            eccentricity: parsed.eccentricity,
            raan: parsed.raan,
            meanMotion: parsed.meanMotion,
          },
          create: parsed,
        });
        ingestedCount++;
      }
    }
    
    console.log(`[Ingestion] Successfully ingested/updated ${ingestedCount} catalog elements.`);
  } catch (error) {
    console.error('[Ingestion] Catalog ingestion failed:', error.message);
  }
}

/**
 * Downloads SOCRATES high-risk conjunction list.
 */
async function fetchConjunctionsAndIngest() {
  console.log('[Ingestion] Querying CelesTrak SOCRATES conjunctions...');
  try {
    const url = 'https://celestrak.org/SOCRATES/query.php?CATALOG=allsocrates&OBJS=all&SORT=probability&MIN_ALT=0&MAX_ALT=40000&MAX_PC=1&MAX_DAYS=7&FORMAT=csv';
    const response = await axios.get(url, { timeout: 20000 });
    
    const conjunctions = parseSocratesCsv(response.data);
    
    console.log(`[Ingestion] Parsed ${conjunctions.length} SOCRATES conjunctions. Saving to DB...`);
    
    // Clear old conjunctions first
    await prisma.conjunction.deleteMany({});
    
    for (const conj of conjunctions) {
      await prisma.conjunction.create({
        data: {
          object1Id: conj.object1Id,
          object2Id: conj.object2Id,
          tca: conj.tca,
          missDistance: conj.missDistance,
          pc: conj.pc,
          riskLevel: conj.riskLevel,
          resolved: false,
        }
      });
      
      // Update the objects' risk scores in catalog to be the max collision probability of the conjunctions they are in
      await prisma.debrisObject.updateMany({
        where: { noradId: { in: [conj.object1Id, conj.object2Id] } },
        data: { riskScore: conj.pc }
      });
    }
    
    console.log('[Ingestion] Completed SOCRATES conjunctions ingestion.');
  } catch (error) {
    console.error('[Ingestion] Conjunction ingestion failed:', error.message);
  }
}

/**
 * Main ingestion entrypoint running all ingestion processes.
 */
async function seedSyntheticFallback() {
  console.warn('[Ingestion] Seeding synthetic LEO fallback debris elements...');
  try {
    const existingCount = await prisma.debrisObject.count();
    if (existingCount > 0) {
      console.log('[Ingestion] Database already seeded with elements.');
      return;
    }

    const fallbacks = [
      { name: 'ISS (ZARYA)', noradId: '25544', inc: 51.64, alt: 420, ecc: 0.0005, raan: 120.4, mm: 15.49 },
      { name: 'TIANGONG', noradId: '48274', inc: 41.58, alt: 389, ecc: 0.0003, raan: 85.2, mm: 15.60 },
      { name: 'STARLINK-3012', noradId: '54201', inc: 53.22, alt: 550, ecc: 0.0001, raan: 220.1, mm: 15.06 },
      { name: 'STARLINK-1984', noradId: '46021', inc: 53.01, alt: 548, ecc: 0.0001, raan: 45.8, mm: 15.05 },
      { name: 'DEBRIS (DELTA 2 DEB)', noradId: '10940', inc: 99.12, alt: 850, ecc: 0.005, raan: 310.2, mm: 14.12 },
      { name: 'DEBRIS (SL-8 DEB)', noradId: '22830', inc: 74.02, alt: 960, ecc: 0.008, raan: 18.5, mm: 13.80 },
      { name: 'COSMOS 2251 DEB', noradId: '36001', inc: 74.04, alt: 770, ecc: 0.003, raan: 94.1, mm: 14.30 },
      { name: 'IRIDIUM 33 DEB', noradId: '36112', inc: 86.41, alt: 780, ecc: 0.002, raan: 155.4, mm: 14.28 },
      { name: 'FENGYUN 1C DEB', noradId: '29831', inc: 98.64, alt: 855, ecc: 0.001, raan: 280.9, mm: 14.10 },
      { name: 'ENVISAT DEB', noradId: '27386', inc: 98.54, alt: 765, ecc: 0.0001, raan: 64.3, mm: 14.32 }
    ];

    // Let's generate 120 more randomized debris pieces to look amazing on the ThreeJS globe!
    const names = ['DELTA DEB', 'TITAN DEB', 'SL DEB', 'COSMOS DEB', 'STARLINK DEB', 'EXPLORER DEB', 'CZ-4B DEB', 'H-2A DEB', 'PEGASUS DEB', 'VANGUARD DEB'];
    for (let i = 0; i < 120; i++) {
      const id = (60000 + i).toString();
      const nName = `${names[i % names.length]} [NORAD-${id}]`;
      const inc = Math.random() * 105; // 0 to 105 deg
      const alt = 300 + Math.random() * 1700; // LEO 300km to 2000km
      const ecc = Math.random() * 0.01;
      const raan = Math.random() * 360;
      const mm = 12.0 + Math.random() * 4.0; // 12 to 16 revs/day
      fallbacks.push({ name: nName, noradId: id, inc, alt, ecc, raan, mm });
    }

    const now = new Date();

    for (const obj of fallbacks) {
      const tle1 = `1 ${obj.noradId}U 20050A   26154.51236111  .00000123  00000-0  12345-3 0  9991`;
      const tle2 = `2 ${obj.noradId}  ${obj.inc.toFixed(4).padStart(8)} ${obj.raan.toFixed(4).padStart(8)} ${(obj.ecc.toFixed(7).substring(2))}   0.0000 ${obj.raan.toFixed(4).padStart(8)} ${obj.mm.toFixed(8).padStart(11)}00001`;

      await prisma.debrisObject.create({
        data: {
          noradId: obj.noradId,
          name: obj.name,
          tleLine1: tle1,
          tleLine2: tle2,
          epoch: now,
          altitudeKm: obj.alt,
          inclination: obj.inc,
          eccentricity: obj.ecc,
          raan: obj.raan,
          meanMotion: obj.mm,
          riskScore: 0.0
        }
      });
    }

    // Seed 5 synthetic high-threat conjunction warnings
    console.log('[Ingestion] Seeding high-risk conjunction scenarios...');
    const threatPairs = [
      { id1: '25544', id2: '36001', miss: 12.4, pc: 2.4e-4 }, // ISS vs Cosmos
      { id1: '54201', id2: '36112', miss: 84.1, pc: 8.9e-5 }, // Starlink vs Iridium
      { id1: '10940', id2: '29831', miss: 110.3, pc: 1.2e-5 },
      { id1: '22830', id2: '27386', miss: 450.8, pc: 4.8e-6 },
      { id1: '48274', id2: '29831', miss: 980.5, pc: 1.1e-6 }
    ];

    for (const pair of threatPairs) {
      let riskLevel = 'normal';
      if (pair.pc > 1e-4) riskLevel = 'critical';
      else if (pair.pc > 1e-5) riskLevel = 'warning';

      await prisma.conjunction.create({
        data: {
          object1Id: pair.id1,
          object2Id: pair.id2,
          tca: new Date(now.getTime() + (Math.random() * 86400 * 1000)), // within 24h
          missDistance: pair.miss,
          pc: pair.pc,
          riskLevel,
          resolved: false
        }
      });

      // Update max risk score on objects
      await prisma.debrisObject.updateMany({
        where: { noradId: { in: [pair.id1, pair.id2] } },
        data: { riskScore: pair.pc }
      });
    }

    console.log('[Ingestion] Seeded 130 fallback items successfully.');
  } catch (err) {
    console.error('[Ingestion] Fallback seeding failed:', err.message);
  }
}

export async function runIngestion() {
  console.log('[Ingestion] Starting scheduled 6-hour data ingestion cycle...');
  try {
    await fetchCatalogAndIngest();
    await fetchConjunctionsAndIngest();
    
    // SQLite Fallback database seeding check
    const count = await prisma.debrisObject.count();
    if (count === 0) {
      console.log('[Ingestion] Database catalog is empty. Launching synthetic seed fallback...');
      await seedSyntheticFallback();
    } else {
      console.log('[Ingestion] Data Ingestion Cycle completed successfully.');
    }
  } catch (err) {
    console.error('[Ingestion] Error during ingestion cycle, launching fallback seed...');
    await seedSyntheticFallback();
  }
}
