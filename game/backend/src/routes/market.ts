import { Env } from '../index';
import { json } from '../middleware/cors';
import { getUser } from '../lib/jwt';
import { CHARACTERS, ITEMS, findCharacter, findItem } from '../catalog';

export async function marketRoutes(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;

  let auth: { id: string };
  try {
    auth = await getUser(request, env.JWT_SECRET);
  } catch {
    return json({ error: 'Oturum geçersiz, tekrar giriş yap' }, 401);
  }

  if (path === '/market' && request.method === 'GET') {
    const user = await env.DB.prepare('SELECT coins, character FROM users WHERE id = ?')
      .bind(auth.id).first<any>();
    const ownedChars = new Set(
      ((await env.DB.prepare('SELECT character_id FROM user_characters WHERE user_id = ?')
        .bind(auth.id).all()).results ?? []).map((r: any) => r.character_id)
    );
    const itemRows = (await env.DB.prepare('SELECT item_id, equipped FROM user_items WHERE user_id = ?')
      .bind(auth.id).all()).results ?? [];
    const ownedItems = new Map(itemRows.map((r: any) => [r.item_id, !!r.equipped]));

    return json({
      coins: user.coins,
      characters: CHARACTERS.map(c => ({
        id: c.id, name: c.name, price: c.price,
        owned: c.price === 0 || ownedChars.has(c.id),
        selected: user.character === c.id,
      })),
      items: ITEMS.map(i => ({
        id: i.id, name: i.name, slot: i.slot, price: i.price,
        owned: ownedItems.has(i.id),
        equipped: ownedItems.get(i.id) === true,
      })),
    });
  }

  if (path === '/market/buy' && request.method === 'POST') {
    const { type, id } = await request.json().catch(() => ({})) as any;

    const user = await env.DB.prepare('SELECT coins FROM users WHERE id = ?')
      .bind(auth.id).first<{ coins: number }>();
    if (!user) return json({ error: 'Hesap bulunamadı' }, 404);

    if (type === 'character') {
      const def = id && findCharacter(id);
      if (!def || def.price === 0) return json({ error: 'Geçersiz karakter' }, 400);
      const owned = await env.DB.prepare(
        'SELECT 1 FROM user_characters WHERE user_id = ? AND character_id = ?'
      ).bind(auth.id, def.id).first();
      if (owned) return json({ error: 'Bu karaktere zaten sahipsin' }, 409);
      if (user.coins < def.price) return json({ error: 'Yetersiz altın' }, 402);

      await env.DB.batch([
        env.DB.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').bind(def.price, auth.id),
        env.DB.prepare('INSERT INTO user_characters (user_id, character_id) VALUES (?, ?)')
          .bind(auth.id, def.id),
      ]);
      return json({ ok: true, coins: user.coins - def.price });
    }

    if (type === 'item') {
      const def = id && findItem(id);
      if (!def) return json({ error: 'Geçersiz eşya' }, 400);
      const owned = await env.DB.prepare(
        'SELECT 1 FROM user_items WHERE user_id = ? AND item_id = ?'
      ).bind(auth.id, def.id).first();
      if (owned) return json({ error: 'Bu eşyaya zaten sahipsin' }, 409);
      if (user.coins < def.price) return json({ error: 'Yetersiz altın' }, 402);

      await env.DB.batch([
        env.DB.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').bind(def.price, auth.id),
        env.DB.prepare('INSERT INTO user_items (user_id, item_id, equipped) VALUES (?, ?, 0)')
          .bind(auth.id, def.id),
      ]);
      return json({ ok: true, coins: user.coins - def.price });
    }

    return json({ error: 'Geçersiz istek' }, 400);
  }

  if (path === '/market/equip' && request.method === 'POST') {
    const { item_id, equip } = await request.json().catch(() => ({})) as any;
    const def = item_id && findItem(item_id);
    if (!def) return json({ error: 'Geçersiz eşya' }, 400);

    const owned = await env.DB.prepare(
      'SELECT 1 FROM user_items WHERE user_id = ? AND item_id = ?'
    ).bind(auth.id, def.id).first();
    if (!owned) return json({ error: 'Bu eşyaya sahip değilsin' }, 403);

    if (equip) {
      // Ayni yuvadaki (sapka/gozluk/sirt) diger esyalari cikar, bunu tak.
      const sameSlot = ITEMS.filter(i => i.slot === def.slot).map(i => i.id);
      const placeholders = sameSlot.map(() => '?').join(',');
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE user_items SET equipped = 0 WHERE user_id = ? AND item_id IN (${placeholders})`
        ).bind(auth.id, ...sameSlot),
        env.DB.prepare('UPDATE user_items SET equipped = 1 WHERE user_id = ? AND item_id = ?')
          .bind(auth.id, def.id),
      ]);
    } else {
      await env.DB.prepare('UPDATE user_items SET equipped = 0 WHERE user_id = ? AND item_id = ?')
        .bind(auth.id, def.id).run();
    }

    const rows = (await env.DB.prepare(
      'SELECT item_id FROM user_items WHERE user_id = ? AND equipped = 1'
    ).bind(auth.id).all()).results ?? [];
    return json({ ok: true, equipped: rows.map((r: any) => r.item_id) });
  }

  return json({ error: 'Bulunamadı' }, 404);
}
