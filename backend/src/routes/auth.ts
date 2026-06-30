import { Env } from '../index';
import { json } from '../middleware/cors';
import { signJWT } from '../lib/jwt';

async function hashPassword(password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export async function authRoutes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/auth/register' && request.method === 'POST') {
    const { email, username, password } = await request.json() as any;
    if (!email || !username || !password) return json({ error: 'Missing fields' }, 400);

    const id = crypto.randomUUID();
    const password_hash = await hashPassword(password);

    try {
      await env.DB.prepare(
        'INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)'
      ).bind(id, email, username, password_hash).run();
    } catch {
      return json({ error: 'Email or username already exists' }, 409);
    }

    const token = await signJWT({ id, email, username }, env.JWT_SECRET);
    return json({ token, user: { id, email, username } });
  }

  if (path === '/auth/login' && request.method === 'POST') {
    const { email, password } = await request.json() as any;
    if (!email || !password) return json({ error: 'Missing fields' }, 400);

    const password_hash = await hashPassword(password);
    const user = await env.DB.prepare(
      'SELECT id, email, username FROM users WHERE email = ? AND password_hash = ?'
    ).bind(email, password_hash).first<{ id: string; email: string; username: string }>();

    if (!user) return json({ error: 'Invalid credentials' }, 401);

    const token = await signJWT(user, env.JWT_SECRET);
    return json({ token, user });
  }

  return json({ error: 'Not found' }, 404);
}
