import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp, ensureSchema, truncateAll } from './helpers.js';
import { closePool } from '../src/db.js';

let app: Express;

async function registerUser(email: string, username: string): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ email, username, password: 'pw123456' });
  return res.body.token as string;
}

beforeAll(async () => {
  await ensureSchema();
  app = buildApp();
});
beforeEach(truncateAll);
afterAll(closePool);

describe('auctions', () => {
  it('requires auth to create an auction', async () => {
    const res = await request(app).post('/auctions').send({ title: 'x' });
    expect(res.status).toBe(401);
  });

  it('creates an auction and lists it', async () => {
    const token = await registerUser('seller@b.com', 'seller');
    const create = await request(app)
      .post('/auctions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Charizard 1st Edition',
        description: 'Mint',
        card_image_key: 'cards/seller/abc',
        starting_price: 100,
        min_bid_increment: 10,
        duration_hours: 24,
      });
    expect(create.status).toBe(201);
    expect(create.body.id).toBeTruthy();

    const list = await request(app).get('/auctions');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      title: 'Charizard 1st Edition',
      seller_username: 'seller',
      current_price: 100,
    });
    // BIGINT columns must come back as numbers, not strings.
    expect(typeof list.body[0].ends_at).toBe('number');
  });

  it('places a valid bid and enforces the minimum increment', async () => {
    const sellerToken = await registerUser('s2@b.com', 'seller2');
    const bidderToken = await registerUser('b2@b.com', 'bidder2');

    const create = await request(app)
      .post('/auctions')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        title: 'Pikachu',
        card_image_key: 'cards/s2/x',
        starting_price: 50,
        min_bid_increment: 5,
        duration_hours: 1,
      });
    const auctionId = create.body.id as string;

    const tooLow = await request(app)
      .post(`/auctions/${auctionId}/bid`)
      .set('Authorization', `Bearer ${bidderToken}`)
      .send({ amount: 52 });
    expect(tooLow.status).toBe(400);

    const ok = await request(app)
      .post(`/auctions/${auctionId}/bid`)
      .set('Authorization', `Bearer ${bidderToken}`)
      .send({ amount: 55 });
    expect(ok.status).toBe(200);
    expect(ok.body.current_price).toBe(55);

    const detail = await request(app).get(`/auctions/${auctionId}`);
    expect(detail.body.current_price).toBe(55);
    expect(detail.body.bids).toHaveLength(1);
    expect(detail.body.bids[0].username).toBe('bidder2');
  });

  it('forbids bidding on your own auction', async () => {
    const token = await registerUser('owner@b.com', 'owner');
    const create = await request(app)
      .post('/auctions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Self',
        card_image_key: 'k',
        starting_price: 10,
        min_bid_increment: 1,
        duration_hours: 1,
      });
    const res = await request(app)
      .post(`/auctions/${create.body.id}/bid`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100 });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown auction', async () => {
    const res = await request(app).get('/auctions/does-not-exist');
    expect(res.status).toBe(404);
  });
});
