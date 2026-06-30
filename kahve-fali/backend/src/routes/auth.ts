import { Env } from '../index';
import { json } from '../middleware/cors';
import { signJWT } from '../lib/jwt';

const PBKDF2_ITERATIONS = 100_000;

function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...salt));
}

async function hashPassword(password: string, saltB64: string): Promise<string> {
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

// Hash baytlarının timing üzerinden sızmasını önlemek için uzunluk-sabit karşılaştırma.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function authRoutes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/auth/register' && request.method === 'POST') {
    const { email, username, password } = (await request.json().catch(() => ({}))) as any;
    if (!email || !username || !password) return json({ error: 'Eksik alan' }, 400);
    if (String(password).length < 6) return json({ error: 'Parola en az 6 karakter olmalı' }, 400);

    const id = crypto.randomUUID();
    const salt = generateSalt();
    const password_hash = await hashPassword(password, salt);

    try {
      await env.DB.prepare(
        'INSERT INTO users (id, email, username, password_hash, salt) VALUES (?, ?, ?, ?, ?)'
      ).bind(id, email, username, password_hash, salt).run();
    } catch {
      return json({ error: 'E-posta veya kullanıcı adı zaten kayıtlı' }, 409);
    }

    const user = { id, email, username };
    const token = await signJWT(user, env.JWT_SECRET);
    return json({ token, user });
  }

  if (path === '/auth/login' && request.method === 'POST') {
    const { email, password } = (await request.json().catch(() => ({}))) as any;
    if (!email || !password) return json({ error: 'Eksik alan' }, 400);

    const row = await env.DB.prepare(
      'SELECT id, email, username, password_hash, salt FROM users WHERE email = ?'
    ).bind(email).first<{ id: string; email: string; username: string; password_hash: string; salt: string }>();

    if (!row) return json({ error: 'Geçersiz bilgiler' }, 401);

    const candidate = await hashPassword(password, row.salt);
    if (!timingSafeEqual(candidate, row.password_hash)) return json({ error: 'Geçersiz bilgiler' }, 401);

    const user = { id: row.id, email: row.email, username: row.username };
    const token = await signJWT(user, env.JWT_SECRET);
    return json({ token, user });
  }

  return json({ error: 'Not found' }, 404);
}
