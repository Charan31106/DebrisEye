import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { registerOperatorWebhook, getOperatorSubscribers } from '../services/alertEngine.js';

const router = Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * /api/alerts:
 *   get:
 *     summary: Retrieve recent critical alerts log
 *     description: Returns the latest tracked space debris collision threat alerts logged to the database.
 *     responses:
 *       200:
 *         description: A JSON array of logged alerts.
 */
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    const parsedAlerts = alerts.map(a => ({
      ...a,
      payload: typeof a.payload === 'string' ? JSON.parse(a.payload) : a.payload
    }));

    res.json({ success: true, count: parsedAlerts.length, data: parsedAlerts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/operators/subscribe:
 *   post:
 *     summary: Subscribe a satellite operator webhook
 *     description: Registers an operator's server endpoint to receive immediate HTTP POST payloads when critical debris conjunctions are detected.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - webhookUrl
 *             properties:
 *               webhookUrl:
 *                 type: string
 *                 format: uri
 *                 example: https://operator.spaceagency.gov/alerts/receiver
 *     responses:
 *       200:
 *         description: Successful registration response.
 *       400:
 *         description: Invalid or missing webhook URL.
 */
router.post('/operators/subscribe', (req, res) => {
  const { webhookUrl } = req.body;
  if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
    return res.status(400).json({ success: false, error: 'A valid http/https webhookUrl is required.' });
  }

  try {
    registerOperatorWebhook(webhookUrl);
    res.json({
      success: true,
      message: 'Operator webhook registered successfully.',
      currentSubscribersCount: getOperatorSubscribers().length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
