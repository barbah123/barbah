// SİNYAL ÜRETİMİ
// Etkin stratejileri mum verisiyle değerlendirir, üretilen al/sat sinyallerini
// kaydeder ve auto_execute açıksa doğrulama + aracı yürütme katmanına iletir.

import { getCandles } from './data';
import { evaluate, STRATEGY_INFO, type StrategyType } from './strategies';
import { placeOrder } from './broker';
import { sendTelegram, type TelegramEnv } from './telegram';

export interface StrategyRow {
  id: string;
  portfolio_id: string;
  symbol: string;
  type: StrategyType;
  params: string;
  quantity: number;
  auto_execute: number;
  enabled: number;
}

// Aynı stratejinin aynı yönde sinyali bu pencere içinde tekrar üretmesi engellenir
// (5 dk'lık cron her koşuşta aynı kesişimi tekrar tekrar tetiklemesin).
const DEDUPE_WINDOW_MINUTES = 60;

export interface RunSummary {
  evaluated: number;
  signals: number;
  executed: number;
  skipped: number;
}

export async function runStrategies(
  db: D1Database,
  portfolioId?: string,
  telegram?: TelegramEnv
): Promise<RunSummary> {
  const query = portfolioId
    ? db
        .prepare('SELECT * FROM strategies WHERE enabled = 1 AND portfolio_id = ?')
        .bind(portfolioId)
    : db.prepare('SELECT * FROM strategies WHERE enabled = 1');
  const { results: strategies } = await query.all<StrategyRow>();

  const summary: RunSummary = { evaluated: 0, signals: 0, executed: 0, skipped: 0 };

  // Aynı sembolün mumlarını bir kez çek
  const candleCache = new Map<string, Awaited<ReturnType<typeof getCandles>>>();

  for (const strategy of strategies) {
    summary.evaluated++;
    // Strateji tipi kendi mum aralığını isteyebilir (ör. ftrend 1 saatlik çalışır)
    const pref = STRATEGY_INFO[strategy.type]?.candles;
    const interval = pref?.interval ?? '5m';
    const range = pref?.range ?? '5d';
    const cacheKey = `${strategy.symbol}:${interval}:${range}`;
    let candles = candleCache.get(cacheKey);
    if (!candles) {
      try {
        candles = await getCandles(strategy.symbol, interval, range);
      } catch {
        continue;
      }
      candleCache.set(cacheKey, candles);
    }
    if (!candles.length) continue;

    let params: Record<string, number> = {};
    try {
      params = JSON.parse(strategy.params);
    } catch {
      // bozuk params: varsayılanlarla devam
    }

    const result = evaluate(strategy.type, params, candles);
    if (result.action === 'hold') continue;

    const recent = await db
      .prepare(
        `SELECT id FROM signals WHERE strategy_id = ? AND action = ?
         AND created_at > datetime('now', ?) LIMIT 1`
      )
      .bind(strategy.id, result.action, `-${DEDUPE_WINDOW_MINUTES} minutes`)
      .first();
    if (recent) continue;

    summary.signals++;
    const lastPrice = candles[candles.length - 1].c;
    const signalId = crypto.randomUUID();

    let status = 'new';
    let orderId: string | null = null;
    let note: string | null = null;

    if (strategy.auto_execute) {
      const placed = await placeOrder(db, strategy.portfolio_id, {
        symbol: strategy.symbol,
        side: result.action,
        type: 'market',
        quantity: strategy.quantity,
        source: 'strategy',
        note: result.reason,
      });
      if ('order' in placed) {
        status = 'executed';
        orderId = placed.order.id;
        summary.executed++;
      } else {
        status = 'skipped';
        note = placed.error; // doğrulama katmanının reddi sinyal kaydında görünür
        summary.skipped++;
      }
    }

    await db
      .prepare(
        `INSERT INTO signals (id, strategy_id, portfolio_id, symbol, action, price, reason, status, order_id, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        signalId,
        strategy.id,
        strategy.portfolio_id,
        strategy.symbol,
        result.action,
        lastPrice,
        result.reason,
        status,
        orderId,
        note
      )
      .run();

    if (telegram) {
      const dir = result.action === 'buy' ? '🟢 AL' : '🔴 SAT';
      const statusText =
        status === 'executed'
          ? '✅ emir gerçekleşti'
          : status === 'skipped'
            ? `⛔ atlandı: ${note}`
            : 'ℹ️ bilgi amaçlı (otomatik işlem kapalı)';
      await sendTelegram(
        telegram,
        `🤖 <b>Strateji Sinyali</b>\n${dir} <b>${strategy.symbol}</b> @ $${lastPrice.toFixed(2)}\n${result.reason}\n${statusText}`
      );
    }
  }

  return summary;
}
