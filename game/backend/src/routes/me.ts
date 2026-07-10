import { Env } from '../index';
import { json } from '../middleware/cors';
import { getUser } from '../lib/jwt';
import { findCharacter } from '../catalog';

export async function meRoutes(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;

  let auth: { id: string };
  try {
    auth = await getUser(request, env.JWT_SECRET);
  } catch {
    return json({ error: 'Oturum geçersiz, tekrar giriş yap' }, 401);
  }

  if (path === '/me' && request.method === 'GET') {
    const user = await env.DB.prepare(
      'SELECT id, email, username, coins, character FROM users WHERE id = ?'
    ).bind(auth.id).first<any>();
    if (!user) return json({ error: 'Hesap bulunamadı' }, 404);

    const ownedChars = await env.DB.prepare(
      'SELECT character_id FROM user_characters WHERE user_id = ?'
    ).bind(auth.id).all();
    const items = await env.DB.prepare(
      'SELECT item_id, equipped FROM user_items WHERE user_id = ?'
    ).bind(auth.id).all();
    const progress = await env.DB.prepare(
      'SELECT level, completions, best_time FROM progress WHERE user_id = ?'
    ).bind(auth.id).all();

    return json({
      user: { id: user.id, email: user.email, username: user.username },
      coins: user.coins,
      character: user.character,
      owned_characters: (ownedChars.results ?? []).map((r: any) => r.character_id),
      owned_items: (items.results ?? []).map((r: any) => r.item_id),
      equipped: (items.results ?? []).filter((r: any) => r.equipped).map((r: any) => r.item_id),
      progress: progress.results ?? [],
    });
  }

  if (path === '/me/character' && request.method === 'POST') {
    const { character } = await request.json().catch(() => ({})) as any;
    const def = character && findCharacter(character);
    if (!def) return json({ error: 'Geçersiz karakter' }, 400);

    if (def.price > 0) {
      const owned = await env.DB.prepare(
        'SELECT 1 FROM user_characters WHERE user_id = ? AND character_id = ?'
      ).bind(auth.id, def.id).first();
      if (!owned) return json({ error: 'Bu karaktere sahip değilsin — önce marketten al' }, 403);
    }

    await env.DB.prepare('UPDATE users SET character = ? WHERE id = ?').bind(def.id, auth.id).run();
    return json({ ok: true, character: def.id });
  }

  return json({ error: 'Bulunamadı' }, 404);
}
