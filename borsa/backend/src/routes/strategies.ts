// Strateji ve sinyal uçları: strateji CRUD, manuel çalıştırma, sinyal geçmişi

import { json, error } from '../lib/http';
import { getQuote } from '../lib/data';
import { STRATEGY_INFO, type StrategyType } from '../lib/strategies';
import { runStrategies, type StrategyRow } from '../lib/signals';
import type { Portfolio } from '../lib/broker';
import type { TelegramEnv } from '../lib/telegram';

export async function strategyRoutes(
  request: Request,
  url: URL,
  db: D1Database,
  portfolio: Portfolio,
  telegram?: TelegramEnv
): Promise<Response> {
  const path = url.pathname;

  if (path === '/api/strategies' && request.method === 'GET') {
    const { results } = await db
      .prepare('SELECT * FROM strategies WHERE portfolio_id = ? ORDER BY created_at DESC')
      .bind(portfolio.id)
      .all<StrategyRow>();
    return json({
      strategies: results.map((s) => ({ ...s, params: safeParse(s.params) })),
      types: STRATEGY_INFO,
    });
  }

  if (path === '/api/strategies' && request.method === 'POST') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return error('Geçersiz istek gövdesi');
    }
    const symbol = String(body.symbol ?? '').toUpperCase().trim();
    const type = body.type as StrategyType;
    if (!symbol) return error('Sembol gerekli');
    if (!STRATEGY_INFO[type])
      return error('Geçersiz strateji tipi (sma_cross, rsi veya ftrend)');
    const quantity = Number(body.quantity ?? 1);
    if (!Number.isFinite(quantity) || quantity <= 0) return error('Adet 0’dan büyük olmalı');

    const quote = await getQuote(symbol);
    if (!quote) return error(`${symbol} için fiyat alınamadı, sembolü kontrol edin`);

    const params = { ...STRATEGY_INFO[type].defaults };
    if (body.params && typeof body.params === 'object') {
      for (const key of Object.keys(params)) {
        const v = Number(body.params[key]);
        if (Number.isFinite(v) && v > 0) params[key] = v;
      }
    }

    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO strategies (id, portfolio_id, symbol, type, params, quantity, auto_execute)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, portfolio.id, symbol, type, JSON.stringify(params), quantity, body.auto_execute ? 1 : 0)
      .run();
    const row = await db
      .prepare('SELECT * FROM strategies WHERE id = ?')
      .bind(id)
      .first<StrategyRow>();
    return json({ strategy: { ...row!, params } }, 201);
  }

  const idMatch = path.match(/^\/api\/strategies\/([\w-]+)$/);
  if (idMatch && request.method === 'PATCH') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return error('Geçersiz istek gövdesi');
    }
    const sets: string[] = [];
    const binds: unknown[] = [];
    if (body.enabled !== undefined) {
      sets.push('enabled = ?');
      binds.push(body.enabled ? 1 : 0);
    }
    if (body.auto_execute !== undefined) {
      sets.push('auto_execute = ?');
      binds.push(body.auto_execute ? 1 : 0);
    }
    if (body.quantity !== undefined) {
      const q = Number(body.quantity);
      if (!Number.isFinite(q) || q <= 0) return error('Adet 0’dan büyük olmalı');
      sets.push('quantity = ?');
      binds.push(q);
    }
    if (!sets.length) return error('Güncellenecek alan yok');
    const result = await db
      .prepare(`UPDATE strategies SET ${sets.join(', ')} WHERE id = ? AND portfolio_id = ?`)
      .bind(...binds, idMatch[1], portfolio.id)
      .run();
    if (!result.meta.changes) return error('Strateji bulunamadı', 404);
    return json({ ok: true });
  }

  if (idMatch && request.method === 'DELETE') {
    await db
      .prepare('DELETE FROM strategies WHERE id = ? AND portfolio_id = ?')
      .bind(idMatch[1], portfolio.id)
      .run();
    return json({ ok: true });
  }

  if (path === '/api/strategies/run' && request.method === 'POST') {
    const summary = await runStrategies(db, portfolio.id, telegram);
    return json({ ok: true, summary });
  }

  if (path === '/api/signals' && request.method === 'GET') {
    const { results } = await db
      .prepare('SELECT * FROM signals WHERE portfolio_id = ? ORDER BY created_at DESC LIMIT 100')
      .bind(portfolio.id)
      .all();
    return json({ signals: results });
  }

  return error('Bulunamadı', 404);
}

function safeParse(text: string): Record<string, number> {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
