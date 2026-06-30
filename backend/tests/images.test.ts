import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp, ensureSchema, truncateAll } from './helpers.js';
import { closePool } from '../src/db.js';

let app: Express;

beforeAll(async () => {
  await ensureSchema();
  app = buildApp();
});
beforeEach(truncateAll);
afterAll(closePool);

async function token(): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'img@b.com', username: 'imguser', password: 'pw123456' });
  return res.body.token as string;
}

describe('images', () => {
  it('requires auth to upload', async () => {
    const res = await request(app)
      .post('/images/upload')
      .set('Content-Type', 'image/png')
      .send(Buffer.from([1, 2, 3]));
    expect(res.status).toBe(401);
  });

  it('uploads and serves an image round-trip', async () => {
    const auth = `Bearer ${await token()}`;
    const bytes = Buffer.from('fake-png-bytes');

    const up = await request(app)
      .post('/images/upload')
      .set('Authorization', auth)
      .set('Content-Type', 'image/png')
      .send(bytes);
    expect(up.status).toBe(200);
    expect(up.body.key).toMatch(/^cards\//);

    const get = await request(app).get(`/images/${up.body.key}`);
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toContain('image/png');
    expect(Buffer.from(get.body)).toEqual(bytes);
  });

  it('404s for a missing key', async () => {
    const res = await request(app).get('/images/cards/nobody/missing');
    expect(res.status).toBe(404);
  });
});
