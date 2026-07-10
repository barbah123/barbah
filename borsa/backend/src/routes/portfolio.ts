// Portföy uçları: özet (nakit + pozisyonlar + canlı değerleme) ve sıfırlama

import { getQuotes } from '../lib/data';
import { json, error } from '../lib/http';
import { processOpenOrders, resetPortfolio, type Portfolio } from '../lib/broker';

interface PositionRow {
  symbol: string;
  quantity: number;
  avg_cost: number;
}

export async function portfolioRoutes(
  request: Request,
  url: URL,
  db: D1Database,
  portfolio: Portfolio
): Promise<Response> {
  const path = url.pathname;

  if (path === '/api/portfolio' && request.method === 'GET') {
    // Okumadan önce bekleyen limit emirlerini işle ki görünüm güncel olsun
    await processOpenOrders(db, portfolio.id);

    const fresh = await db
      .prepare('SELECT cash, starting_cash FROM portfolios WHERE id = ?')
      .bind(portfolio.id)
      .first<{ cash: number; starting_cash: number }>();
    const { results: positions } = await db
      .prepare('SELECT symbol, quantity, avg_cost FROM positions WHERE portfolio_id = ? ORDER BY symbol')
      .bind(portfolio.id)
      .all<PositionRow>();

    const quotes = positions.length
      ? await getQuotes(positions.map((p) => p.symbol))
      : [];
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

    let marketValue = 0;
    const enriched = positions.map((p) => {
      const quote = quoteMap.get(p.symbol);
      const price = quote?.price ?? p.avg_cost;
      const value = price * p.quantity;
      marketValue += value;
      return {
        symbol: p.symbol,
        name: quote?.name ?? null,
        quantity: p.quantity,
        avg_cost: p.avg_cost,
        price,
        value,
        unrealized_pnl: (price - p.avg_cost) * p.quantity,
        unrealized_pnl_percent: p.avg_cost ? ((price - p.avg_cost) / p.avg_cost) * 100 : 0,
        day_change_percent: quote?.changePercent ?? 0,
      };
    });

    const cash = fresh?.cash ?? portfolio.cash;
    const startingCash = fresh?.starting_cash ?? portfolio.starting_cash;
    const equity = cash + marketValue;
    return json({
      cash,
      market_value: marketValue,
      equity,
      starting_cash: startingCash,
      total_pnl: equity - startingCash,
      total_pnl_percent: startingCash ? ((equity - startingCash) / startingCash) * 100 : 0,
      positions: enriched,
    });
  }

  if (path === '/api/portfolio/reset' && request.method === 'POST') {
    await resetPortfolio(db, portfolio.id);
    return json({ ok: true, message: 'Portföy başlangıç bakiyesine sıfırlandı' });
  }

  return error('Bulunamadı', 404);
}
