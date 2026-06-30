import { Env } from '../index';
import { json } from '../middleware/cors';
import { getUser } from '../lib/jwt';

export async function auctionRoutes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const segments = path.split('/').filter(Boolean);

  // GET /auctions
  if (path === '/auctions' && request.method === 'GET') {
    const status = url.searchParams.get('status') ?? 'active';
    const auctions = await env.DB.prepare(
      `SELECT a.*, u.username as seller_username
       FROM auctions a JOIN users u ON a.seller_id = u.id
       WHERE a.status = ? ORDER BY a.ends_at ASC LIMIT 50`
    ).bind(status).all();
    return json(auctions.results);
  }

  // GET /auctions/:id
  if (segments.length === 2 && request.method === 'GET') {
    const id = segments[1];
    const auction = await env.DB.prepare(
      `SELECT a.*, u.username as seller_username FROM auctions a
       JOIN users u ON a.seller_id = u.id WHERE a.id = ?`
    ).bind(id).first();
    if (!auction) return json({ error: 'Not found' }, 404);

    const bids = await env.DB.prepare(
      `SELECT b.amount, b.created_at, u.username FROM bids b
       JOIN users u ON b.bidder_id = u.id WHERE b.auction_id = ? ORDER BY b.amount DESC LIMIT 20`
    ).bind(id).all();

    let favorited = false;
    const viewer = await getUser(request, env.JWT_SECRET).catch(() => null);
    if (viewer) {
      const fav = await env.DB.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND auction_id = ?')
        .bind(viewer.id, id).first();
      favorited = !!fav;
    }

    return json({ ...auction, bids: bids.results, favorited });
  }

  // POST/DELETE /auctions/:id/favorite
  if (segments.length === 3 && segments[2] === 'favorite' && (request.method === 'POST' || request.method === 'DELETE')) {
    const user = await getUser(request, env.JWT_SECRET).catch(() => null);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const auctionId = segments[1];

    if (request.method === 'POST') {
      await env.DB.prepare('INSERT OR IGNORE INTO favorites (user_id, auction_id) VALUES (?, ?)')
        .bind(user.id, auctionId).run();
      return json({ favorited: true });
    }
    await env.DB.prepare('DELETE FROM favorites WHERE user_id = ? AND auction_id = ?')
      .bind(user.id, auctionId).run();
    return json({ favorited: false });
  }

  // POST /auctions
  if (path === '/auctions' && request.method === 'POST') {
    const user = await getUser(request, env.JWT_SECRET).catch(() => null);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { title, description, card_image_key, starting_price, min_bid_increment, duration_hours } = await request.json().catch(() => ({})) as any;
    if (!title || !card_image_key) return json({ error: 'Missing fields' }, 400);

    const isPositiveNumber = (v: any) => typeof v === 'number' && isFinite(v) && v > 0;
    if (!isPositiveNumber(starting_price) || !isPositiveNumber(min_bid_increment) || !isPositiveNumber(duration_hours)) {
      return json({ error: 'starting_price, min_bid_increment and duration_hours must be positive numbers' }, 400);
    }
    if (duration_hours > 720) return json({ error: 'duration_hours cannot exceed 720 (30 days)' }, 400);

    const id = crypto.randomUUID();
    const ends_at = Math.floor(Date.now() / 1000) + Math.floor(duration_hours * 3600);

    await env.DB.prepare(
      `INSERT INTO auctions (id, seller_id, title, description, card_image_key, starting_price, min_bid_increment, current_price, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, user.id, title, description ?? '', card_image_key, starting_price, min_bid_increment, starting_price, ends_at).run();

    return json({ id, message: 'Auction created' }, 201);
  }

  // POST /auctions/:id/bid
  if (segments.length === 3 && segments[2] === 'bid' && request.method === 'POST') {
    const user = await getUser(request, env.JWT_SECRET).catch(() => null);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const auctionId = segments[1];
    const { amount } = await request.json().catch(() => ({})) as any;

    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
      return json({ error: 'amount must be a positive number' }, 400);
    }

    const auction = await env.DB.prepare(
      'SELECT * FROM auctions WHERE id = ? AND status = "active"'
    ).bind(auctionId).first<any>();

    if (!auction) return json({ error: 'Auction not found or ended' }, 404);
    if (auction.seller_id === user.id) return json({ error: 'Cannot bid on your own auction' }, 400);
    if (Math.floor(Date.now() / 1000) > auction.ends_at) return json({ error: 'Auction has ended' }, 400);
    if (amount < auction.current_price + auction.min_bid_increment) {
      return json({ error: `Minimum bid is ${auction.current_price + auction.min_bid_increment}` }, 400);
    }

    // Enforce the price guard atomically so two concurrent bids can't both win.
    const updated = await env.DB.prepare(
      `UPDATE auctions SET current_price = ?, highest_bidder_id = ?
       WHERE id = ? AND status = 'active' AND ends_at > unixepoch()
         AND ? >= current_price + min_bid_increment`
    ).bind(amount, user.id, auctionId, amount).run();

    if (!updated.meta.changes) {
      return json({ error: 'Bid was outpaced or the auction just ended, try again' }, 409);
    }

    await env.DB.prepare('INSERT INTO bids (id, auction_id, bidder_id, amount) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), auctionId, user.id, amount).run();

    // Notify the seller and everyone who favorited this auction (except the bidder).
    const recips = await env.DB.prepare(
      `SELECT seller_id AS uid FROM auctions WHERE id = ?
       UNION
       SELECT user_id AS uid FROM favorites WHERE auction_id = ?`
    ).bind(auctionId, auctionId).all<{ uid: string }>();
    const message = `@${(user as any).username} "${auction.title}" için ${amount} ₺ teklif verdi`;
    const stmts = recips.results
      .map((r) => r.uid)
      .filter((uid) => uid && uid !== user.id)
      .map((uid) =>
        env.DB.prepare('INSERT INTO notifications (id, user_id, auction_id, type, message) VALUES (?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), uid, auctionId, 'bid', message)
      );
    if (stmts.length) await env.DB.batch(stmts);

    return json({ message: 'Bid placed', current_price: amount });
  }

  return json({ error: 'Not found' }, 404);
}
