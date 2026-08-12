import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// Memory store for registered webhook operators (stub database fallback)
const operatorWebhooks = new Set();

/**
 * Registers an operator webhook URL for alerts.
 */
export function registerOperatorWebhook(url) {
  operatorWebhooks.add(url);
  console.log(`[AlertEngine] Operator subscribed with URL: ${url}`);
  return true;
}

/**
 * Returns all registered operator webhooks.
 */
export function getOperatorSubscribers() {
  return Array.from(operatorWebhooks);
}

/**
 * Scans all active conjunctions to identify and alert on high risk conjunctions.
 * Runs every 15 minutes.
 */
export async function runAlertCheck(wsBroadcaster = null) {
  console.log('[AlertEngine] Running periodic 15-minute conjunction risk audit...');
  try {
    // Fetch unresolved conjunctions with Pc > 1e-4
    const highRiskConjunctions = await prisma.conjunction.findMany({
      where: {
        pc: { gte: 1e-4 },
        resolved: false
      }
    });

    console.log(`[AlertEngine] Found ${highRiskConjunctions.length} high-risk conjunction candidates.`);

    for (const conj of highRiskConjunctions) {
      // Check if alert already exists for this pair (SQLite compatible JS filter)
      const existingAlerts = await prisma.alert.findMany({
        where: { type: 'HIGH_COLLISION_RISK' }
      });
      const alreadyLogged = existingAlerts.some(a => {
        const payload = typeof a.payload === 'string' ? JSON.parse(a.payload) : a.payload;
        return payload?.conjunctionId === conj.id;
      });

      if (alreadyLogged) {
        continue; // Already raised alert
      }

      // Retrieve full details of objects involved
      const obj1 = await prisma.debrisObject.findUnique({ where: { noradId: conj.object1Id } });
      const obj2 = await prisma.debrisObject.findUnique({ where: { noradId: conj.object2Id } });

      const name1 = obj1 ? obj1.name : `NORAD-${conj.object1Id}`;
      const name2 = obj2 ? obj2.name : `NORAD-${conj.object2Id}`;

      // Recommended evasive maneuvers
      const recommendedAction = conj.missDistance < 100.0
        ? 'CRITICAL: Execute immediate delta-v avoidance maneuver. Thruster burn recommended.'
        : 'WARNING: Prepare evasive maneuver coordinates. Coordinate orbital drift adjustment.';

      const alertPayload = {
        conjunctionId: conj.id,
        object1: { noradId: conj.object1Id, name: name1 },
        object2: { noradId: conj.object2Id, name: name2 },
        tca: conj.tca.toISOString(),
        missDistance: conj.missDistance,
        pc: conj.pc,
        recommendedAction
      };

      // 1. Create alert record in SQLite (JSON stringified)
      const alertRecord = await prisma.alert.create({
        data: {
          type: 'HIGH_COLLISION_RISK',
          payload: JSON.stringify(alertPayload),
          severity: 'CRITICAL'
        }
      });

      console.log(`[AlertEngine] Raised Alert #${alertRecord.id} for ${name1} / ${name2}. Miss distance: ${conj.missDistance}m.`);

      // 2. Push WebSocket live alert to connected front-ends
      if (wsBroadcaster) {
        wsBroadcaster('new_conjunction', alertPayload);
      }

      // 3. Fire mock webhook posts to all operators
      for (const webhookUrl of operatorWebhooks) {
        axios.post(webhookUrl, alertPayload, { timeout: 3000 })
          .then(() => console.log(`[AlertEngine] Triggered webhook alert to operator at ${webhookUrl}`))
          .catch(e => console.warn(`[AlertEngine] Webhook delivery failed to ${webhookUrl}: ${e.message}`));
      }
    }
  } catch (error) {
    console.error('[AlertEngine] Error during alert check routine:', error);
  }
}
