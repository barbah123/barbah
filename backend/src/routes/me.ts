import { Env } from '../index';
import { json } from '../middleware/cors';
import { getUser } from '../lib/jwt';

export async function meRoutes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  const user = await getUser(request, env.JWT_SECRET).catch(() => null);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  // GET /me — profile of the authenticated user
  if (path === '/me' && request.method === 'GET') {
    return json({ id: user.id, email: user.email, username: (user as any).username });
  }

  // GET /me/auctions — auctions I'm selling (all statuses, newest first)
  if (path === '/me/auctions' && request.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT a.*, u.username as seller_username
       FROM auctions a JOIN users u ON a.seller_id = u.id
       WHERE a.seller_id = ? ORDER BY a.created_at DESC`
    ).bind(user.id).all();
    return json(rows.results);
  }

  // GET /me/bids — auctions I've bid on, with my highest bid and whether I'm winning
  if (path === '/me/bids' && request.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT a.id, a.title, a.card_image_key, a.current_price, a.status, a.ends_at,
              a.seller_id,
              MAX(b.amount) AS my_bid,
              (a.highest_bidder_id = ?) AS winning
       FROM bids b JOIN auctions a ON b.auction_id = a.id
       WHERE b.bidder_id = ?
       GROUP BY a.id
       ORDER BY a.ends_at ASC`
    ).bind(user.id, user.id).all();
    return json(rows.results);
  }

  return json({ error: 'Not found' }, 404);
}
