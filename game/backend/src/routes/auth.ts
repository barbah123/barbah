import { Env } from '../index';
import { json } from '../middleware/cors';
import { signJWT } from '../lib/jwt';
import { generateSalt, hashPassword, timingSafeEqual, generateVerifyCode } from '../lib/password';
import { sendVerificationEmail } from '../lib/email';

const CODE_TTL_MS = 15 * 60 * 1000; // 15 dakika

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function issueCode(env: Env, userId: string, email: string) {
  const code = generateVerifyCode();
  const expires = Date.now() + CODE_TTL_MS;
  await env.DB.prepare('UPDATE users SET verify_code = ?, verify_expires = ? WHERE id = ?')
    .bind(code, expires, userId).run();
  const sent = await sendVerificationEmail(env, email, code);
  // E-posta anahtari yoksa kod cevapta doner ki gelistirme sirasinda test edilebilsin.
  return sent ? {} : { dev_code: code };
}

export async function authRoutes(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;

  if (path === '/auth/register' && request.method === 'POST') {
    const { email, username, password } = await request.json().catch(() => ({})) as any;
    if (!email || !username || !password) return json({ error: 'Lütfen tüm alanları doldurun' }, 400);
    if (!validEmail(email)) return json({ error: 'Geçerli bir e-posta adresi gir' }, 400);
    if (String(username).length < 3 || String(username).length > 16)
      return json({ error: 'Kullanıcı adı 3-16 karakter olmalı' }, 400);
    if (String(password).length < 6) return json({ error: 'Parola en az 6 karakter olmalı' }, 400);

    // Ayni e-posta dogrulanmamis bir kayda aitse kaydi yenile (takilmayi onler).
    const existing = await env.DB.prepare('SELECT id, verified FROM users WHERE email = ?')
      .bind(email).first<{ id: string; verified: number }>();

    if (existing && existing.verified) return json({ error: 'Bu e-posta zaten kayıtlı' }, 409);

    const salt = generateSalt();
    const password_hash = await hashPassword(password, salt);

    let userId: string;
    if (existing) {
      userId = existing.id;
      try {
        await env.DB.prepare('UPDATE users SET username = ?, password_hash = ?, salt = ? WHERE id = ?')
          .bind(username, password_hash, salt, userId).run();
      } catch {
        return json({ error: 'Bu kullanıcı adı zaten alınmış' }, 409);
      }
    } else {
      userId = crypto.randomUUID();
      try {
        await env.DB.prepare(
          'INSERT INTO users (id, email, username, password_hash, salt) VALUES (?, ?, ?, ?, ?)'
        ).bind(userId, email, username, password_hash, salt).run();
      } catch {
        return json({ error: 'Bu e-posta veya kullanıcı adı zaten kayıtlı' }, 409);
      }
    }

    const extra = await issueCode(env, userId, email);
    return json({ ok: true, message: 'Doğrulama kodu e-postana gönderildi', ...extra });
  }

  if (path === '/auth/verify' && request.method === 'POST') {
    const { email, code } = await request.json().catch(() => ({})) as any;
    if (!email || !code) return json({ error: 'E-posta ve kod gerekli' }, 400);

    const row = await env.DB.prepare(
      'SELECT id, email, username, verified, verify_code, verify_expires FROM users WHERE email = ?'
    ).bind(email).first<any>();

    if (!row) return json({ error: 'Hesap bulunamadı' }, 404);
    if (row.verified) return json({ error: 'Hesap zaten doğrulanmış, giriş yapabilirsin' }, 400);
    if (!row.verify_code || !timingSafeEqual(String(code), String(row.verify_code)))
      return json({ error: 'Kod hatalı' }, 400);
    if (Date.now() > Number(row.verify_expires))
      return json({ error: 'Kodun süresi dolmuş, yeni kod iste' }, 400);

    await env.DB.prepare(
      'UPDATE users SET verified = 1, verify_code = NULL, verify_expires = NULL WHERE id = ?'
    ).bind(row.id).run();

    const user = { id: row.id, email: row.email, username: row.username };
    const token = await signJWT(user, env.JWT_SECRET);
    return json({ token, user });
  }

  if (path === '/auth/resend' && request.method === 'POST') {
    const { email } = await request.json().catch(() => ({})) as any;
    if (!email) return json({ error: 'E-posta gerekli' }, 400);

    const row = await env.DB.prepare('SELECT id, verified FROM users WHERE email = ?')
      .bind(email).first<{ id: string; verified: number }>();
    if (!row) return json({ error: 'Hesap bulunamadı' }, 404);
    if (row.verified) return json({ error: 'Hesap zaten doğrulanmış' }, 400);

    const extra = await issueCode(env, row.id, email);
    return json({ ok: true, message: 'Yeni kod gönderildi', ...extra });
  }

  if (path === '/auth/login' && request.method === 'POST') {
    const { email, password } = await request.json().catch(() => ({})) as any;
    if (!email || !password) return json({ error: 'Lütfen tüm alanları doldurun' }, 400);

    const row = await env.DB.prepare(
      'SELECT id, email, username, password_hash, salt, verified FROM users WHERE email = ?'
    ).bind(email).first<any>();

    if (!row) return json({ error: 'E-posta veya parola hatalı' }, 401);

    const candidate = await hashPassword(password, row.salt);
    if (!timingSafeEqual(candidate, row.password_hash))
      return json({ error: 'E-posta veya parola hatalı' }, 401);

    if (!row.verified) {
      const extra = await issueCode(env, row.id, email);
      return json({
        error: 'Hesap doğrulanmamış — e-postana yeni kod gönderdik',
        needs_verification: true,
        ...extra,
      }, 403);
    }

    const user = { id: row.id, email: row.email, username: row.username };
    const token = await signJWT(user, env.JWT_SECRET);
    return json({ token, user });
  }

  return json({ error: 'Bulunamadı' }, 404);
}
