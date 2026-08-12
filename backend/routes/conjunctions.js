import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const router = Router();
const prisma = new PrismaClient();

import { propagateTleJs } from '../services/sgp4Propagator.js';
import { calculateChanProbability, runMonteCarloSimJs, findClosestApproachJs } from '../services/collisionPhysics.js';

/**
 * @swagger
 * /api/conjunctions:
 *   get:
 *     summary: Retrieve top high-risk conjunctions
 *     description: Returns the top 50 high-threat orbital encounters sorted by probability of collision descending.
 *     responses:
 *       200:
 *         description: A JSON array of active conjunction warnings.
 */
router.get('/', async (req, res) => {
  try {
    const conjunctions = await prisma.conjunction.findMany({
      take: 50,
      orderBy: { pc: 'desc' }
    });

    // Decorate the conjunction list with object names
    const decorated = await Promise.all(conjunctions.map(async (conj) => {
      const obj1 = await prisma.debrisObject.findUnique({ where: { noradId: conj.object1Id } });
      const obj2 = await prisma.debrisObject.findUnique({ where: { noradId: conj.object2Id } });
      return {
        ...conj,
        object1Name: obj1 ? obj1.name : `NORAD-${conj.object1Id}`,
        object2Name: obj2 ? obj2.name : `NORAD-${conj.object2Id}`,
      };
    }));

    res.json({ success: true, count: decorated.length, data: decorated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/conjunctions/{id}:
 *   get:
 *     summary: Detailed conjunction conjunction report
 *     description: Pulls elements for the paired objects and generates analytical Chan and Monte Carlo results natively in JS.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Live conjunction report.
 *       404:
 *         description: Conjunction record not found.
 */
router.get('/:id', async (req, res) => {
  try {
    const conjId = parseInt(req.params.id);
    const conjunction = await prisma.conjunction.findUnique({
      where: { id: conjId }
    });

    if (!conjunction) {
      return res.status(404).json({ success: false, error: 'Conjunction entry not found.' });
    }

    const obj1 = await prisma.debrisObject.findUnique({ where: { noradId: conjunction.object1Id } });
    const obj2 = await prisma.debrisObject.findUnique({ where: { noradId: conjunction.object2Id } });

    if (!obj1 || !obj2) {
      return res.json({
        success: true,
        data: {
          ...conjunction,
          message: "Standard details only. Core orbital elements missing from DB catalog to run Monte Carlo.",
          object1Name: obj1?.name || `NORAD-${conjunction.object1Id}`,
          object2Name: obj2?.name || `NORAD-${conjunction.object2Id}`
        }
      });
    }

    // Run native SGP4 JS propagation (±30 minutes around TCA)
    const startTime = new Date(conjunction.tca.getTime() - 1800000);
    const endTime = new Date(conjunction.tca.getTime() + 1800000);

    let mcResults = null;
    try {
      const orbit1 = propagateTleJs(obj1.tleLine1, obj1.tleLine2, startTime, endTime, 10);
      const orbit2 = propagateTleJs(obj2.tleLine1, obj2.tleLine2, startTime, endTime, 10);
      
      const approach = findClosestApproachJs(orbit1, orbit2);
      if (approach) {
        const pcChan = calculateChanProbability(approach.missDistanceM, approach.relativeVelocityKms, 15.0, 100.0);
        const mcSim = runMonteCarloSimJs(approach.pos1, approach.pos2, 15.0, 100.0, 1000);
        
        mcResults = {
          conjunction_detected: true,
          tca: approach.timestamp,
          miss_distance_m: Math.round(approach.missDistanceM * 100) / 100,
          relative_velocity_kms: Math.round(approach.relativeVelocityKms * 10000) / 10000,
          probability_analytical: pcChan,
          probability_monte_carlo: mcSim.probability,
          min_simulated_distance_m: Math.round(mcSim.minDistance * 100) / 100,
          risk_level: pcChan > 1e-4 ? "critical" : (pcChan > 1e-5 ? "warning" : "normal")
        };
      }
    } catch (e) {
      console.warn('[ConjunctionRouter] Native collision calculation failed:', e.message);
    }

    res.json({
      success: true,
      data: {
        ...conjunction,
        object1Name: obj1.name,
        object2Name: obj2.name,
        object1Inclination: obj1.inclination,
        object2Inclination: obj2.inclination,
        object1Altitude: obj1.altitudeKm,
        object2Altitude: obj2.altitudeKm,
        object1: obj1,
        object2: obj2,
        simulation: mcResults || {
          status: "unavailable",
          reason: "Calculation failure"
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
