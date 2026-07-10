import { Env } from '../index';
import { json } from '../middleware/cors';
import { getUser } from '../lib/jwt';

const MAX_LEVEL = 3;
const FIRST_COMPLETION_REWARD = 250;
const REPEAT_REWARD = 50;

export async function progressRoutes(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;

  let auth: { id: string };
  try {
    auth = await getUser(request, env.JWT_SECRET);
  } catch {
    return json({ error: 'Oturum geçersiz, tekrar giriş yap' }, 401);
  }

  if (path === '/progress/complete' && request.method === 'POST') {
    const { level, time_seconds } = await request.json().catch(() => ({})) as any;
    const levelNum = Number(level);
    if (!Number.isInteger(levelNum) || levelNum < 1 || levelNum > MAX_LEVEL)
      return json({ error: 'Geçersiz bölüm' }, 400);

    const time = Number(time_seconds) > 0 ? Number(time_seconds) : null;

    const existing = await env.DB.prepare(
      'SELECT completions, best_time FROM progress WHERE user_id = ? AND level = ?'
    ).bind(auth.id, levelNum).first<{ completions: number; best_time: number | null }>();

    const firstTime = !existing;
    const reward = firstTime ? FIRST_COMPLETION_REWARD : REPEAT_REWARD;

    const bestTime = existing?.best_time != null && time != null
      ? Math.min(existing.best_time, time)
      : (time ?? existing?.best_time ?? null);

    await env.DB.batch([
      existing
        ? env.DB.prepare(
            'UPDATE progress SET completions = completions + 1, best_time = ? WHERE user_id = ? AND level = ?'
          ).bind(bestTime, auth.id, levelNum)
        : env.DB.prepare(
            'INSERT INTO progress (user_id, level, completions, best_time) VALUES (?, ?, 1, ?)'
          ).bind(auth.id, levelNum, bestTime),
      env.DB.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').bind(reward, auth.id),
    ]);

    const user = await env.DB.prepare('SELECT coins FROM users WHERE id = ?')
      .bind(auth.id).first<{ coins: number }>();

    return json({ ok: true, reward, first_time: firstTime, coins: user?.coins ?? 0 });
  }

  return json({ error: 'Bulunamadı' }, 404);
}
