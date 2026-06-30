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

describe('auth', () => {
  it('registers a new user and returns a token', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'a@b.com', username: 'ash', password: 'pikachu' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: 'a@b.com', username: 'ash' });
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('rejects missing fields', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'x@y.com' });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate email/username with 409', async () => {
    const body = { email: 'dup@b.com', username: 'dup', password: 'pw' };
    await request(app).post('/auth/register').send(body);
    const res = await request(app).post('/auth/register').send(body);
    expect(res.status).toBe(409);
  });

  it('logs in with valid credentials and rejects bad ones', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'login@b.com', username: 'misty', password: 'starmie' });

    const ok = await request(app)
      .post('/auth/login')
      .send({ email: 'login@b.com', password: 'starmie' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();

    const bad = await request(app)
      .post('/auth/login')
      .send({ email: 'login@b.com', password: 'wrong' });
    expect(bad.status).toBe(401);
  });
});
