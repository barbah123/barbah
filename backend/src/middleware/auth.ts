import type { Request, Response, NextFunction } from 'express';
import { verifyJwt, type AuthUser } from '../lib/jwt.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractUser(req: Request): AuthUser | null {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    return verifyJwt(token, process.env.JWT_SECRET as string);
  } catch {
    return null;
  }
}

/** Attaches req.user when a valid token is present; never rejects. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const user = extractUser(req);
  if (user) req.user = user;
  next();
}

/** Rejects with 401 unless a valid token is present. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = extractUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.user = user;
  next();
}
