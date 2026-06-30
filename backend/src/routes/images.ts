import { Router, raw } from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import type { Storage } from '../storage.js';

const MAX_BYTES = 5 * 1024 * 1024;

export function imageRouter(storage: Storage): Router {
  const router = Router();

  // POST /images/upload — raw binary body, returns the stored object key.
  router.post(
    '/upload',
    requireAuth,
    raw({ type: '*/*', limit: '10mb' }),
    async (req, res) => {
      const user = req.user!;
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({ error: 'Empty body' });
      }
      if (body.length > MAX_BYTES) {
        return res.status(400).json({ error: 'File too large (max 5MB)' });
      }

      const contentType = req.header('content-type') ?? 'image/jpeg';
      const key = `cards/${user.id}/${randomUUID()}`;
      await storage.put(key, body, contentType);
      return res.json({ key });
    },
  );

  // GET /images/<key> — key may contain slashes (cards/<userId>/<uuid>).
  router.get('/*', async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) return res.status(404).json({ error: 'Not found' });

    const obj = await storage.get(key);
    if (!obj) return res.status(404).json({ error: 'Not found' });

    res.setHeader('Content-Type', obj.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    return res.send(obj.body);
  });

  return router;
}
