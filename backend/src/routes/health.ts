import { Router } from 'express';
import { query } from '../db.js';
import { getRedis } from '../redis.js';

export function healthRouter(): Router {
  const router = Router();

  // Liveness: process is up.
  router.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness: dependencies reachable.
  router.get('/readyz', async (_req, res) => {
    const checks: Record<string, string> = {};
    let healthy = true;

    try {
      await query('SELECT 1');
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'down';
      healthy = false;
    }

    const redis = getRedis();
    if (!redis) {
      checks.redis = 'disabled';
    } else {
      try {
        await redis.ping();
        checks.redis = 'ok';
      } catch {
        checks.redis = 'down';
        // Redis is an optional cache; do not fail readiness on it.
      }
    }

    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', checks });
  });

  return router;
}
