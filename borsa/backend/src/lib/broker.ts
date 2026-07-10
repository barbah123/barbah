// ARACI YÜRÜTME KATMANI (paper-broker)
// Doğrulamadan geçen emirleri sanal portföyde gerçekleştirir:
// piyasa emirleri anında, limit emirleri fiyat koşulu sağlanınca dolar.

import { getQuote, getQuotes } from './data';
import { validateOrder } from './validation';

export const STARTING_CASH = 100000;
const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'SPY'];

export interface Portfolio {
  id: string;
  device_id: string;
  cash: number;
  starting_cash: number;
  created_at: string;
}

export interface Order {
  id: string;
  portfolio_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  limit_price: number | null;
  status: 'open' | 'filled' | 'cancelled' | 'rejected';
  fill_price: number | null;
  realized_pnl: number | null;
  source: string;
  note: string | null;
  created_at: string;
  filled_at: string | null;
}

export async function getOrCreatePortfolio(
  db: D1Database,
  deviceId: string
): Promise<Portfolio> {
  const existing = await db
    .prepare('SELECT * FROM portfolios WHERE device_id = ?')
    .bind(deviceId)
    .first<Portfolio>();
  if (existing) return existing;

  const id = crypto.randomUUID();
  const statements = [
    db
      .prepare(
        'INSERT INTO portfolios (id, device_id, cash, starting_cash) VALUES (?, ?, ?, ?)'
      )
      .bind(id, deviceId, STARTING_CASH, STARTING_CASH),
    ...DEFAULT_WATCHLIST.map((s) =>
      db
        .prepare('INSERT INTO watchlist (portfolio_id, symbol) VALUES (?, ?)')
        .bind(id, s)
    ),
  ];
  await db.batch(statements);
  return (await db
    .prepare('SELECT * FROM portfolios WHERE id = ?')
    .bind(id)
    .first<Portfolio>())!;
}

interface SymbolState {
  cash: number;
  positionQty: number;
  avgCost: number;
  openBuyReserved: number;
  openSellQty: number;
}

async function getSymbolState(
  db: D1Database,
  portfolioId: string,
  symbol: string
): Promise<SymbolState> {
  const [portfolio, position, reserved, sells] = await Promise.all([
    db.prepare('SELECT cash FROM portfolios WHERE id = ?').bind(portfolioId).first<{ cash: number }>(),
    db
      .prepare('SELECT quantity, avg_cost FROM positions WHERE portfolio_id = ? AND symbol = ?')
      .bind(portfolioId, symbol)
      .first<{ quantity: number; avg_cost: number }>(),
    db
      .prepare(
        "SELECT COALESCE(SUM(quantity * limit_price), 0) AS total FROM orders WHERE portfolio_id = ? AND status = 'open' AND side = 'buy'"
      )
      .bind(portfolioId)
      .first<{ total: number }>(),
    db
      .prepare(
        "SELECT COALESCE(SUM(quantity), 0) AS total FROM orders WHERE portfolio_id = ? AND symbol = ? AND status = 'open' AND side = 'sell'"
      )
      .bind(portfolioId, symbol)
      .first<{ total: number }>(),
  ]);
  return {
    cash: portfolio?.cash ?? 0,
    positionQty: position?.quantity ?? 0,
    avgCost: position?.avg_cost ?? 0,
    openBuyReserved: reserved?.total ?? 0,
    openSellQty: sells?.total ?? 0,
  };
}

/** Emri portföye uygular: nakit, pozisyon ve emir kaydı tek batch'te güncellenir. */
async function applyFill(
  db: D1Database,
  orderId: string,
  portfolioId: string,
  symbol: string,
  side: 'buy' | 'sell',
  quantity: number,
  price: number,
  state: SymbolState
): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  let realizedPnl: number | null = null;

  if (side === 'buy') {
    const cost = quantity * price;
    const newQty = state.positionQty + quantity;
    const newAvg = (state.positionQty * state.avgCost + cost) / newQty;
    statements.push(
      db.prepare('UPDATE portfolios SET cash = cash - ? WHERE id = ?').bind(cost, portfolioId),
      db
        .prepare(
          `INSERT INTO positions (portfolio_id, symbol, quantity, avg_cost) VALUES (?, ?, ?, ?)
           ON CONFLICT (portfolio_id, symbol) DO UPDATE SET quantity = ?, avg_cost = ?`
        )
        .bind(portfolioId, symbol, newQty, newAvg, newQty, newAvg)
    );
  } else {
    const proceeds = quantity * price;
    realizedPnl = (price - state.avgCost) * quantity;
    const newQty = state.positionQty - quantity;
    statements.push(
      db.prepare('UPDATE portfolios SET cash = cash + ? WHERE id = ?').bind(proceeds, portfolioId)
    );
    if (newQty > 1e-9) {
      statements.push(
        db
          .prepare('UPDATE positions SET quantity = ? WHERE portfolio_id = ? AND symbol = ?')
          .bind(newQty, portfolioId, symbol)
      );
    } else {
      statements.push(
        db
          .prepare('DELETE FROM positions WHERE portfolio_id = ? AND symbol = ?')
          .bind(portfolioId, symbol)
      );
    }
  }

  statements.push(
    db
      .prepare(
        "UPDATE orders SET status = 'filled', fill_price = ?, realized_pnl = ?, filled_at = datetime('now') WHERE id = ?"
      )
      .bind(price, realizedPnl, orderId)
  );
  await db.batch(statements);
}

export interface PlaceOrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  limitPrice?: number | null;
  source?: string;
  note?: string | null;
}

export async function placeOrder(
  db: D1Database,
  portfolioId: string,
  req: PlaceOrderRequest
): Promise<{ order: Order } | { error: string }> {
  const symbol = req.symbol.toUpperCase().trim();
  if (!symbol) return { error: 'Sembol gerekli' };

  const quote = await getQuote(symbol);
  if (!quote) return { error: `${symbol} için fiyat alınamadı, sembolü kontrol edin` };

  const state = await getSymbolState(db, portfolioId, symbol);
  const verdict = validateOrder(
    {
      side: req.side,
      type: req.type,
      quantity: req.quantity,
      price: quote.price,
      limitPrice: req.limitPrice,
    },
    state
  );
  if (!verdict.ok) return { error: verdict.error };

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO orders (id, portfolio_id, symbol, side, type, quantity, limit_price, source, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      portfolioId,
      symbol,
      req.side,
      req.type,
      req.quantity,
      req.type === 'limit' ? req.limitPrice : null,
      req.source ?? 'manual',
      req.note ?? null
    )
    .run();

  if (req.type === 'market') {
    await applyFill(db, id, portfolioId, symbol, req.side, req.quantity, quote.price, state);
  }

  const order = (await db
    .prepare('SELECT * FROM orders WHERE id = ?')
    .bind(id)
    .first<Order>())!;
  return { order };
}

export async function cancelOrder(
  db: D1Database,
  portfolioId: string,
  orderId: string
): Promise<{ ok: true } | { error: string }> {
  const result = await db
    .prepare(
      "UPDATE orders SET status = 'cancelled' WHERE id = ? AND portfolio_id = ? AND status = 'open'"
    )
    .bind(orderId, portfolioId)
    .run();
  if (!result.meta.changes) return { error: 'Açık emir bulunamadı' };
  return { ok: true };
}

/**
 * Açık limit emirlerini güncel fiyatla karşılaştırıp koşulu sağlayanları doldurur.
 * Cron tetikleyicisinden ve portföy/emir okumalarından önce çağrılır.
 */
export async function processOpenOrders(db: D1Database, portfolioId?: string): Promise<number> {
  const query = portfolioId
    ? db
        .prepare("SELECT * FROM orders WHERE status = 'open' AND portfolio_id = ? ORDER BY created_at")
        .bind(portfolioId)
    : db.prepare("SELECT * FROM orders WHERE status = 'open' ORDER BY created_at");
  const { results: open } = await query.all<Order>();
  if (!open.length) return 0;

  const quotes = await getQuotes(open.map((o) => o.symbol));
  const priceMap = new Map(quotes.map((q) => [q.symbol, q.price]));

  let filled = 0;
  for (const order of open) {
    const price = priceMap.get(order.symbol);
    if (price == null || order.limit_price == null) continue;

    const shouldFill =
      order.side === 'buy' ? price <= order.limit_price : price >= order.limit_price;
    if (!shouldFill) continue;

    // Dolum anında durumu yeniden doğrula (nakit/pozisyon değişmiş olabilir)
    const state = await getSymbolState(db, order.portfolio_id, order.symbol);
    if (order.side === 'buy' && state.cash < price * order.quantity) {
      await db
        .prepare("UPDATE orders SET status = 'rejected', note = ? WHERE id = ?")
        .bind('Dolum anında yetersiz bakiye', order.id)
        .run();
      continue;
    }
    if (order.side === 'sell' && state.positionQty < order.quantity) {
      await db
        .prepare("UPDATE orders SET status = 'rejected', note = ? WHERE id = ?")
        .bind('Dolum anında yetersiz pozisyon', order.id)
        .run();
      continue;
    }

    await applyFill(
      db,
      order.id,
      order.portfolio_id,
      order.symbol,
      order.side,
      order.quantity,
      price,
      state
    );
    filled++;
  }
  return filled;
}

export async function resetPortfolio(db: D1Database, portfolioId: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM positions WHERE portfolio_id = ?').bind(portfolioId),
    db.prepare('DELETE FROM orders WHERE portfolio_id = ?').bind(portfolioId),
    db.prepare('DELETE FROM signals WHERE portfolio_id = ?').bind(portfolioId),
    db.prepare('DELETE FROM bot_trades WHERE portfolio_id = ?').bind(portfolioId),
    db
      .prepare('UPDATE portfolios SET cash = starting_cash WHERE id = ?')
      .bind(portfolioId),
  ]);
}
