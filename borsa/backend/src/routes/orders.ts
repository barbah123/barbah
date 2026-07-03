// Emir uçları: listeleme, yeni emir (doğrulama + aracı yürütme), iptal

import { json, error } from '../lib/http';
import {
  placeOrder,
  cancelOrder,
  processOpenOrders,
  type Portfolio,
  type Order,
} from '../lib/broker';

export async function orderRoutes(
  request: Request,
  url: URL,
  db: D1Database,
  portfolio: Portfolio
): Promise<Response> {
  const path = url.pathname;

  if (path === '/api/orders' && request.method === 'GET') {
    await processOpenOrders(db, portfolio.id);
    const status = url.searchParams.get('status');
    const query = status
      ? db
          .prepare(
            'SELECT * FROM orders WHERE portfolio_id = ? AND status = ? ORDER BY created_at DESC LIMIT 100'
          )
          .bind(portfolio.id, status)
      : db
          .prepare('SELECT * FROM orders WHERE portfolio_id = ? ORDER BY created_at DESC LIMIT 100')
          .bind(portfolio.id);
    const { results } = await query.all<Order>();
    return json({ orders: results });
  }

  if (path === '/api/orders' && request.method === 'POST') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return error('Geçersiz istek gövdesi');
    }
    const side = body.side;
    const type = body.type ?? 'market';
    if (side !== 'buy' && side !== 'sell') return error('side "buy" veya "sell" olmalı');
    if (type !== 'market' && type !== 'limit') return error('type "market" veya "limit" olmalı');

    const result = await placeOrder(db, portfolio.id, {
      symbol: String(body.symbol ?? ''),
      side,
      type,
      quantity: Number(body.quantity),
      limitPrice: body.limit_price != null ? Number(body.limit_price) : null,
      source: 'manual',
    });
    if ('error' in result) return error(result.error);
    return json({ order: result.order }, 201);
  }

  const cancelMatch = path.match(/^\/api\/orders\/([\w-]+)\/cancel$/);
  if (cancelMatch && request.method === 'POST') {
    const result = await cancelOrder(db, portfolio.id, cancelMatch[1]);
    if ('error' in result) return error(result.error, 404);
    return json({ ok: true });
  }

  return error('Bulunamadı', 404);
}
