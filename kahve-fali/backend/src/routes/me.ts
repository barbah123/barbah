import { Env } from '../index';
import { json } from '../middleware/cors';
import { getUser } from '../lib/jwt';
import { encryptSecret, decryptSecret } from '../lib/crypto';
import { validateApiKey } from '../lib/openai';

const ALLOWED_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'];
const ALLOWED_GENDERS = ['kadin', 'erkek', 'diger'];
const ALLOWED_MARITAL = ['bekar', 'evli', 'iliskisi_var', 'diger'];

interface SettingsRow {
  openai_api_key_encrypted: string | null;
  openai_key_last4: string | null;
  model: string;
  birth_date: string | null;
  gender: string | null;
  marital_status: string | null;
}

// "YYYY-MM-DD" doğrula; geçersizse null.
function cleanBirthDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function pickFromList(v: unknown, list: string[]): string | null {
  return typeof v === 'string' && list.includes(v) ? v : null;
}

export async function meRoutes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  const user = await getUser(request, env.JWT_SECRET).catch(() => null);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  // GET /me — kimliği doğrulanmış kullanıcının profili
  if (path === '/me' && request.method === 'GET') {
    return json({ id: user.id, email: user.email, username: user.username });
  }

  // GET /me/settings — API anahtarının bağlı olup olmadığı + model + profil (anahtar asla geri döndürülmez)
  if (path === '/me/settings' && request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT openai_api_key_encrypted, openai_key_last4, model, birth_date, gender, marital_status FROM user_settings WHERE user_id = ?'
    ).bind(user.id).first<SettingsRow>();

    return json({
      has_api_key: !!row?.openai_api_key_encrypted,
      key_last4: row?.openai_key_last4 ?? null,
      model: row?.model ?? 'gpt-4o-mini',
      birth_date: row?.birth_date ?? null,
      gender: row?.gender ?? null,
      marital_status: row?.marital_status ?? null,
    });
  }

  // PUT /me/settings — OpenAI API anahtarını, modeli ve/veya profil bilgilerini kaydet
  if (path === '/me/settings' && request.method === 'PUT') {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const model =
      typeof body.model === 'string' && ALLOWED_MODELS.includes(body.model) ? body.model : 'gpt-4o-mini';

    let encrypted: string | null | undefined;
    let last4: string | null | undefined;

    if (typeof body.openai_api_key === 'string') {
      const key = body.openai_api_key.trim();
      if (key === '') {
        // Boş string → anahtarı kaldır
        encrypted = null;
        last4 = null;
      } else {
        if (!key.startsWith('sk-')) return json({ error: 'API anahtarı "sk-" ile başlamalı' }, 400);
        encrypted = await encryptSecret(key, env.ENCRYPTION_KEY);
        last4 = key.slice(-4);
      }
    }

    // upsert: satır yoksa oluştur, varsa güncelle. Gönderilmeyen alanlar mevcut değerini korur.
    const existing = await env.DB.prepare(
      'SELECT openai_api_key_encrypted, openai_key_last4, birth_date, gender, marital_status FROM user_settings WHERE user_id = ?'
    ).bind(user.id).first<SettingsRow>();

    const finalEncrypted = encrypted !== undefined ? encrypted : existing?.openai_api_key_encrypted ?? null;
    const finalLast4 = last4 !== undefined ? last4 : existing?.openai_key_last4 ?? null;

    // Profil alanları: yalnızca istekte yer alıyorsa güncelle (yoksa mevcut değeri koru).
    const birthDate = 'birth_date' in body ? cleanBirthDate(body.birth_date) : existing?.birth_date ?? null;
    const gender = 'gender' in body ? pickFromList(body.gender, ALLOWED_GENDERS) : existing?.gender ?? null;
    const marital = 'marital_status' in body ? pickFromList(body.marital_status, ALLOWED_MARITAL) : existing?.marital_status ?? null;

    await env.DB.prepare(
      `INSERT INTO user_settings (user_id, openai_api_key_encrypted, openai_key_last4, model, birth_date, gender, marital_status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
       ON CONFLICT(user_id) DO UPDATE SET
         openai_api_key_encrypted = excluded.openai_api_key_encrypted,
         openai_key_last4 = excluded.openai_key_last4,
         model = excluded.model,
         birth_date = excluded.birth_date,
         gender = excluded.gender,
         marital_status = excluded.marital_status,
         updated_at = excluded.updated_at`
    ).bind(user.id, finalEncrypted, finalLast4, model, birthDate, gender, marital).run();

    return json({
      has_api_key: !!finalEncrypted,
      key_last4: finalLast4,
      model,
      birth_date: birthDate,
      gender,
      marital_status: marital,
    });
  }

  // POST /me/settings/test — anahtarı OpenAI'a karşı doğrula.
  // Body'de anahtar varsa onu, yoksa kayıtlı anahtarı test eder.
  if (path === '/me/settings/test' && request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { openai_api_key?: string };
    let key = (body.openai_api_key ?? '').trim();

    if (!key) {
      const row = await env.DB.prepare(
        'SELECT openai_api_key_encrypted FROM user_settings WHERE user_id = ?'
      ).bind(user.id).first<SettingsRow>();
      if (!row?.openai_api_key_encrypted) {
        return json({ error: 'Önce bir API anahtarı girin veya kaydedin.' }, 400);
      }
      try {
        key = await decryptSecret(row.openai_api_key_encrypted, env.ENCRYPTION_KEY);
      } catch {
        return json({ error: 'Kayıtlı anahtar çözülemedi, lütfen yeniden kaydedin.' }, 500);
      }
    }

    const ok = await validateApiKey(key).catch(() => false);
    return json({ valid: ok });
  }

  // GET /me/readings — geçmiş fal okumaları (en yeni önce)
  if (path === '/me/readings' && request.method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT id, type, question, result, model, created_at FROM readings WHERE user_id = ? ORDER BY created_at DESC LIMIT 100'
    ).bind(user.id).all();
    return json(rows.results);
  }

  // GET /me/readings/:id — tek bir okuma
  const readingMatch = path.match(/^\/me\/readings\/([^/]+)$/);
  if (readingMatch && request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT id, type, question, result, model, created_at FROM readings WHERE id = ? AND user_id = ?'
    ).bind(readingMatch[1], user.id).first();
    if (!row) return json({ error: 'Bulunamadı' }, 404);
    return json(row);
  }

  return json({ error: 'Not found' }, 404);
}
