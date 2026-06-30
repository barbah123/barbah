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

// Length-constant comparison to avoid leaking hash bytes via timing.
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
    const { email, username, password } = await request.json().catch(() => ({})) as any;
    if (!email || !username || !password) return json({ error: 'Lütfen tüm alanları doldurun' }, 400);

    const id = crypto.randomUUID();
    const salt = generateSalt();
    const password_hash = await hashPassword(password, salt);

    try {
      await env.DB.prepare(
        'INSERT INTO users (id, email, username, password_hash, salt) VALUES (?, ?, ?, ?, ?)'
      ).bind(id, email, username, password_hash, salt).run();
    } catch {
      return json({ error: 'Bu e-posta veya kullanıcı adı zaten kayıtlı' }, 409);
    }

    const user = { id, email, username };
    const token = await signJWT(user, env.JWT_SECRET);
    return json({ token, user });
  }

  if (path === '/auth/login' && request.method === 'POST') {
    const { email, password } = await request.json().catch(() => ({})) as any;
    if (!email || !password) return json({ error: 'Lütfen tüm alanları doldurun' }, 400);

    const row = await env.DB.prepare(
      'SELECT id, email, username, password_hash, salt FROM users WHERE email = ?'
    ).bind(email).first<{ id: string; email: string; username: string; password_hash: string; salt: string }>();

    if (!row) return json({ error: 'E-posta veya parola hatalı' }, 401);

    const candidate = await hashPassword(password, row.salt);
    if (!timingSafeEqual(candidate, row.password_hash)) return json({ error: 'E-posta veya parola hatalı' }, 401);

    const user = { id: row.id, email: row.email, username: row.username };
    const token = await signJWT(user, env.JWT_SECRET);
    return json({ token, user });
  }

  // Test-grade password reset: prove identity with email + username (no email
  // delivery channel here), then set a new password and sign the user in.
  if (path === '/auth/reset' && request.method === 'POST') {
    const { email, username, password } = await request.json().catch(() => ({})) as any;
    if (!email || !username || !password) return json({ error: 'Lütfen tüm alanları doldurun' }, 400);

    const row = await env.DB.prepare(
      'SELECT id, email, username FROM users WHERE email = ? AND username = ?'
    ).bind(email, username).first<{ id: string; email: string; username: string }>();

    if (!row) return json({ error: 'E-posta ve kullanıcı adı eşleşen hesap bulunamadı' }, 404);

    const salt = generateSalt();
    const password_hash = await hashPassword(password, salt);
    await env.DB.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?')
      .bind(password_hash, salt, row.id).run();

    const user = { id: row.id, email: row.email, username: row.username };
    const token = await signJWT(user, env.JWT_SECRET);
    return json({ token, user });
  }

  return json({ error: 'Bulunamadı' }, 404);
}
