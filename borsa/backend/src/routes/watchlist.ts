// İzleme listesi uçları: canlı fiyatlı liste, sembol ekleme/çıkarma

import { getQuotes, getQuote } from '../lib/data';
import { json, error } from '../lib/http';
import type { Portfolio } from '../lib/broker';

export async function watchlistRoutes(
  request: Request,
  url: URL,
  db: D1Database,
  portfolio: Portfolio
): Promise<Response> {
  const path = url.pathname;

  if (path === '/api/watchlist' && request.method === 'GET') {
    const { results } = await db
      .prepare('SELECT symbol FROM watchlist WHERE portfolio_id = ? ORDER BY added_at')
      .bind(portfolio.id)
      .all<{ symbol: string }>();
    const quotes = results.length ? await getQuotes(results.map((r) => r.symbol)) : [];
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));
    return json({
      watchlist: results.map((r) => ({
        symbol: r.symbol,
        quote: quoteMap.get(r.symbol) ?? null,
      })),
    });
  }

  if (path === '/api/watchlist' && request.method === 'POST') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return error('Geçersiz istek gövdesi');
    }
    const symbol = String(body.symbol ?? '').toUpperCase().trim();
    if (!symbol) return error('Sembol gerekli');

    const quote = await getQuote(symbol);
    if (!quote) return error(`${symbol} için fiyat alınamadı, sembolü kontrol edin`);

    await db
      .prepare('INSERT OR IGNORE INTO watchlist (portfolio_id, symbol) VALUES (?, ?)')
      .bind(portfolio.id, symbol)
      .run();
    return json({ ok: true, symbol, quote }, 201);
  }

  const deleteMatch = path.match(/^\/api\/watchlist\/([\w.^-]+)$/);
  if (deleteMatch && request.method === 'DELETE') {
    await db
      .prepare('DELETE FROM watchlist WHERE portfolio_id = ? AND symbol = ?')
      .bind(portfolio.id, deleteMatch[1].toUpperCase())
      .run();
    return json({ ok: true });
  }

  return error('Bulunamadı', 404);
}
