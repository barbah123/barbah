import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import type { Config } from './config.js';
import type { Storage } from './storage.js';
import { authRouter } from './routes/auth.js';
import { auctionRouter } from './routes/auctions.js';
import { imageRouter } from './routes/images.js';
import { healthRouter } from './routes/health.js';

export function createApp(cfg: Config, storage: Storage): Express {
  const app = express();

  app.use(cors());
  // JSON parsing for everything except the binary image upload, which installs
  // its own raw() parser on the route.
  app.use(express.json({ limit: '1mb' }));

  app.use(healthRouter());
  app.use('/auth', authRouter(cfg));
  app.use('/auctions', auctionRouter());
  app.use('/images', imageRouter(storage));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Centralised error handler: malformed JSON, oversized payloads, and any
  // error thrown from a route land here as a clean JSON 4xx/5xx.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === 'entity.too.large') {
      return res.status(400).json({ error: 'File too large (max 5MB)' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    console.error('[error]', err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
