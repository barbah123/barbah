// Otonom trader botu uçları: durum, ayarlar, işlem defteri, manuel döngü

import { json, error } from '../lib/http';
import type { Portfolio } from '../lib/broker';
import type { TelegramEnv } from '../lib/telegram';
import {
  getBotConfig,
  computeStats,
  runTraderCycle,
  type BotTrade,
} from '../lib/trader';

const NUMERIC_FIELDS = [
  'risk_per_trade_pct',
  'stop_loss_pct',
  'take_profit_pct',
  'trailing_stop_pct',
  'max_positions',
  'max_position_pct',
] as const;

export async function botRoutes(
  request: Request,
  url: URL,
  db: D1Database,
  portfolio: Portfolio,
  telegram: TelegramEnv
): Promise<Response> {
  const path = url.pathname;

  if (path === '/api/bot' && request.method === 'GET') {
    const config = await getBotConfig(db, portfolio.id);
    const { results: trades } = await db
      .prepare(
        'SELECT * FROM bot_trades WHERE portfolio_id = ? ORDER BY opened_at DESC LIMIT 50'
      )
      .bind(portfolio.id)
      .all<BotTrade>();
    const stats = await computeStats(db, portfolio.id);
    return json({ config, trades, stats });
  }

  if (path === '/api/bot' && request.method === 'PATCH') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return error('Geçersiz istek gövdesi');
    }
    await getBotConfig(db, portfolio.id); // satırın varlığını garanti et

    const sets: string[] = [];
    const binds: unknown[] = [];
    if (body.enabled !== undefined) {
      sets.push('enabled = ?');
      binds.push(body.enabled ? 1 : 0);
    }
    if (body.flatten_eod !== undefined) {
      sets.push('flatten_eod = ?');
      binds.push(body.flatten_eod ? 1 : 0);
    }
    for (const field of NUMERIC_FIELDS) {
      if (body[field] !== undefined) {
        const v = Number(body[field]);
        if (!Number.isFinite(v) || v < 0) return error(`${field} geçersiz`);
        sets.push(`${field} = ?`);
        binds.push(v);
      }
    }
    if (!sets.length) return error('Güncellenecek alan yok');
    sets.push("updated_at = datetime('now')");
    await db
      .prepare(`UPDATE bot_config SET ${sets.join(', ')} WHERE portfolio_id = ?`)
      .bind(...binds, portfolio.id)
      .run();
    return json({ ok: true, config: await getBotConfig(db, portfolio.id) });
  }

  if (path === '/api/bot/run' && request.method === 'POST') {
    const force = url.searchParams.get('force') === '1';
    const report = url.searchParams.get('report') !== '0';
    const result = await runTraderCycle(db, telegram, portfolio.id, { report, force });
    return json(result);
  }

  return error('Bulunamadı', 404);
}
