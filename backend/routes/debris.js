import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { propagateTleJs } from '../services/sgp4Propagator.js';

const router = Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * /api/debris:
 *   get:
 *     summary: Retrieve debris catalog
 *     description: Returns a paginated list of tracked orbital objects with advanced inclination, altitude, and risk filtering options.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page offset multiplier.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Items count per page.
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Query string matching satellite/debris name or NORAD ID.
 *       - in: query
 *         name: minAlt
 *         schema:
 *           type: number
 *         description: Minimum altitude filter in km.
 *       - in: query
 *         name: maxAlt
 *         schema:
 *           type: number
 *         description: Maximum altitude filter in km.
 *       - in: query
 *         name: minInc
 *         schema:
 *           type: number
 *         description: Minimum inclination angle in degrees.
 *       - in: query
 *         name: maxInc
 *         schema:
 *           type: number
 *         description: Maximum inclination angle in degrees.
 *       - in: query
 *         name: minRisk
 *         schema:
 *           type: number
 *         description: Minimum risk probability filter.
 *     responses:
 *       200:
 *         description: A JSON array of debris objects.
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;

    const { search, minAlt, maxAlt, minInc, maxInc, minRisk } = req.query;

    const filter = {};

    if (search) {
      filter.OR = [
        { name: { contains: search } },
        { noradId: { contains: search } }
      ];
    }

    // Altitude Filter
    if (minAlt || maxAlt) {
      filter.altitudeKm = {};
      if (minAlt) filter.altitudeKm.gte = parseFloat(minAlt);
      if (maxAlt) filter.altitudeKm.lte = parseFloat(maxAlt);
    }

    // Inclination Filter
    if (minInc || maxInc) {
      filter.inclination = {};
      if (minInc) filter.inclination.gte = parseFloat(minInc);
      if (maxInc) filter.inclination.lte = parseFloat(maxInc);
    }

    // Risk Filter
    if (minRisk) {
      filter.riskScore = { gte: parseFloat(minRisk) };
    }

    const items = await prisma.debrisObject.findMany({
      where: filter,
      skip: offset,
      take: limit,
      orderBy: { riskScore: 'desc' }
    });

    const total = await prisma.debrisObject.count({ where: filter });

    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: items
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/debris/{noradId}:
 *   get:
 *     summary: Get single debris object detail
 *     description: Returns complete Keplerian elements and historical properties of a single tracking entity.
 *     parameters:
 *       - in: path
 *         name: noradId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Complete debris object details.
 *       404:
 *         description: Object not found.
 */


router.get('/:noradId', async (req, res) => {
  try {
    const item = await prisma.debrisObject.findUnique({
      where: { noradId: req.params.noradId }
    });
    if (!item) {
      return res.status(404).json({ success: false, error: 'Debris object not found.' });
    }
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/debris/propagate:
 *   post:
 *     summary: Propagate orbital elements natively
 *     description: Computes Earth-Centered coordinates natively in Javascript for a given TLE and timeline window.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tleLine1
 *               - tleLine2
 *               - startTime
 *               - endTime
 *             properties:
 *               tleLine1:
 *                 type: string
 *               tleLine2:
 *                 type: string
 *               startTime:
 *                 type: string
 *               endTime:
 *                 type: string
 *               stepSeconds:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Propagated positions.
 */
router.post('/propagate', (req, res) => {
  try {
    const { tleLine1, tleLine2, startTime, endTime, stepSeconds } = req.body;
    if (!tleLine1 || !tleLine2 || !startTime || !endTime) {
      return res.status(400).json({ success: false, error: 'Missing required parameters.' });
    }
    
    const points = propagateTleJs(
      tleLine1,
      tleLine2,
      new Date(startTime),
      new Date(endTime),
      parseInt(stepSeconds) || 60
    );
    res.json({ success: true, points });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
