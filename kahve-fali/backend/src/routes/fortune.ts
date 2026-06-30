import { Env } from '../index';
import { json } from '../middleware/cors';
import { getUser } from '../lib/jwt';
import { decryptSecret } from '../lib/crypto';
import { generateFortune } from '../lib/openai';

interface SettingsRow {
  openai_api_key_encrypted: string | null;
  model: string;
  birth_date: string | null;
  gender: string | null;
  marital_status: string | null;
}

export async function fortuneRoutes(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Not found' }, 404);

  const user = await getUser(request, env.JWT_SECRET).catch(() => null);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const body = (await request.json().catch(() => ({}))) as {
    type?: 'photo' | 'text';
    question?: string;
    image_base64?: string;
  };

  const question = (body.question ?? '').trim().slice(0, 500) || undefined;
  const imageBase64 = body.image_base64 ? stripDataUrl(body.image_base64) : undefined;
  const type: 'photo' | 'text' = imageBase64 ? 'photo' : 'text';

  if (type === 'text' && !question) {
    return json({ error: 'Fincan fotoğrafı ya da bir niyet/soru gönderin.' }, 400);
  }

  const settings = await env.DB.prepare(
    'SELECT openai_api_key_encrypted, model, birth_date, gender, marital_status FROM user_settings WHERE user_id = ?'
  ).bind(user.id).first<SettingsRow>();

  if (!settings?.openai_api_key_encrypted) {
    return json({ error: 'Önce Ayarlar bölümünden OpenAI API anahtarınızı bağlayın.' }, 400);
  }

  let apiKey: string;
  try {
    apiKey = await decryptSecret(settings.openai_api_key_encrypted, env.ENCRYPTION_KEY);
  } catch {
    return json({ error: 'Kayıtlı API anahtarı çözülemedi, lütfen yeniden kaydedin.' }, 500);
  }

  const model = settings.model || 'gpt-4o-mini';

  let result: string;
  try {
    result = await generateFortune({
      apiKey,
      model,
      question,
      imageBase64,
      profile: {
        birthDate: settings.birth_date,
        gender: settings.gender,
        maritalStatus: settings.marital_status,
      },
    });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Fal üretilemedi' }, 502);
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO readings (id, user_id, type, question, result, model) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, user.id, type, question ?? null, result, model).run();

  const row = await env.DB.prepare(
    'SELECT id, type, question, result, model, created_at FROM readings WHERE id = ?'
  ).bind(id).first();

  return json(row);
}

// Mobil taraf bazen "data:image/jpeg;base64,...." gönderebilir; yalnızca base64 kısmını al.
function stripDataUrl(s: string): string {
  const comma = s.indexOf(',');
  return s.startsWith('data:') && comma !== -1 ? s.slice(comma + 1) : s;
}
