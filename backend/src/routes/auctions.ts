import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { cacheGet, cacheSet, cacheDel } from '../redis.js';

const LIST_TTL_SECONDS = 5;
const listCacheKey = (status: string) => `auctions:list:${status}`;

export function auctionRouter(): Router {
  const router = Router();

  // GET /auctions?status=active
  router.get('/', async (req, res) => {
    const status = String(req.query.status ?? 'active');

    const cached = await cacheGet(listCacheKey(status));
    if (cached) {
      res.type('application/json').send(cached);
      return;
    }

    const result = await query(
      `SELECT a.*, u.username AS seller_username
         FROM auctions a JOIN users u ON a.seller_id = u.id
        WHERE a.status = $1
        ORDER BY a.ends_at ASC
        LIMIT 50`,
      [status],
    );

    const payload = JSON.stringify(result.rows);
    await cacheSet(listCacheKey(status), payload, LIST_TTL_SECONDS);
    res.type('application/json').send(payload);
  });

  // GET /auctions/:id
  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const auctionRes = await query(
      `SELECT a.*, u.username AS seller_username
         FROM auctions a JOIN users u ON a.seller_id = u.id
        WHERE a.id = $1`,
      [id],
    );
    const auction = auctionRes.rows[0];
    if (!auction) return res.status(404).json({ error: 'Not found' });

    const bidsRes = await query(
      `SELECT b.amount, b.created_at, u.username
         FROM bids b JOIN users u ON b.bidder_id = u.id
        WHERE b.auction_id = $1
        ORDER BY b.amount DESC
        LIMIT 20`,
      [id],
    );

    return res.json({ ...auction, bids: bidsRes.rows });
  });

  // POST /auctions
  router.post('/', requireAuth, async (req, res) => {
    const user = req.user!;
    const {
      title,
      description,
      card_image_key,
      starting_price,
      min_bid_increment,
      duration_hours,
    } = req.body ?? {};

    if (!title || !card_image_key || !starting_price || !min_bid_increment || !duration_hours) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const id = randomUUID();
    const endsAt = Math.floor(Date.now() / 1000) + Number(duration_hours) * 3600;

    await query(
      `INSERT INTO auctions
         (id, seller_id, title, description, card_image_key, starting_price, min_bid_increment, current_price, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        user.id,
        title,
        description ?? '',
        card_image_key,
        starting_price,
        min_bid_increment,
        starting_price,
        endsAt,
      ],
    );

    await cacheDel(listCacheKey('active'));
    return res.status(201).json({ id, message: 'Auction created' });
  });

  // POST /auctions/:id/bid
  router.post('/:id/bid', requireAuth, async (req, res) => {
    const user = req.user!;
    const auctionId = req.params.id;
    const { amount } = req.body ?? {};
    const bidAmount = Number(amount);
    if (!Number.isFinite(bidAmount)) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    try {
      const result = await withTransaction(async (client) => {
        // Lock the auction row so concurrent bids are serialised.
        const auctionRes = await client.query(
          `SELECT * FROM auctions WHERE id = $1 AND status = 'active' FOR UPDATE`,
          [auctionId],
        );
        const auction = auctionRes.rows[0];
        if (!auction) {
          return { status: 404, body: { error: 'Auction not found or ended' } };
        }
        if (auction.seller_id === user.id) {
          return { status: 400, body: { error: 'Cannot bid on your own auction' } };
        }
        if (Date.now() / 1000 > Number(auction.ends_at)) {
          return { status: 400, body: { error: 'Auction has ended' } };
        }
        const minBid = Number(auction.current_price) + Number(auction.min_bid_increment);
        if (bidAmount < minBid) {
          return { status: 400, body: { error: `Minimum bid is ${minBid}` } };
        }

        const bidId = randomUUID();
        await client.query(
          'INSERT INTO bids (id, auction_id, bidder_id, amount) VALUES ($1, $2, $3, $4)',
          [bidId, auctionId, user.id, bidAmount],
        );
        await client.query(
          'UPDATE auctions SET current_price = $1, highest_bidder_id = $2 WHERE id = $3',
          [bidAmount, user.id, auctionId],
        );

        return { status: 200, body: { message: 'Bid placed', current_price: bidAmount } };
      });

      if (result.status === 200) {
        await cacheDel(listCacheKey('active'));
      }
      return res.status(result.status).json(result.body);
    } catch (err) {
      throw err;
    }
  });

  return router;
}
