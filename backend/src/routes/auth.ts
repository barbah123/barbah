import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { query } from '../db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signJwt, type AuthUser } from '../lib/jwt.js';
import type { Config } from '../config.js';

interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
}

export function authRouter(cfg: Config): Router {
  const router = Router();

  router.post('/register', async (req, res) => {
    const { email, username, password } = req.body ?? {};
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const id = randomUUID();
    const passwordHash = await hashPassword(password);

    try {
      await query(
        'INSERT INTO users (id, email, username, password_hash) VALUES ($1, $2, $3, $4)',
        [id, email, username, passwordHash],
      );
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'Email or username already exists' });
      }
      throw err;
    }

    const user: AuthUser = { id, email, username };
    const token = signJwt(user, cfg.jwtSecret, cfg.jwtExpiresIn);
    return res.status(201).json({ token, user });
  });

  router.post('/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const result = await query<UserRow>(
      'SELECT id, email, username, password_hash FROM users WHERE email = $1',
      [email],
    );
    const row = result.rows[0];
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user: AuthUser = { id: row.id, email: row.email, username: row.username };
    const token = signJwt(user, cfg.jwtSecret, cfg.jwtExpiresIn);
    return res.json({ token, user });
  });

  return router;
}
