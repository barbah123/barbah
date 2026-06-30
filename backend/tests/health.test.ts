import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp, ensureSchema } from './helpers.js';
import { closePool } from '../src/db.js';

let app: Express;

beforeAll(async () => {
  await ensureSchema();
  app = buildApp();
});
afterAll(closePool);

describe('health', () => {
  it('liveness returns ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('readiness reports postgres ok and redis disabled', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.checks.postgres).toBe('ok');
    expect(res.body.checks.redis).toBe('disabled');
  });

  it('unknown route returns 404 json', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});
