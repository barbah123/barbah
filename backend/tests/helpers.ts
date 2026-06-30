import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryStorage } from '../src/storage.js';
import { getPool } from '../src/db.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Apply the schema (idempotent — migration uses IF NOT EXISTS). */
export async function ensureSchema(): Promise<void> {
  const sql = readFileSync(join(migrationsDir, '0001_init.sql'), 'utf8');
  await getPool().query(sql);
}

/** Wipe all data between tests for isolation. */
export async function truncateAll(): Promise<void> {
  await getPool().query('TRUNCATE bids, auctions, users RESTART IDENTITY CASCADE');
}

export function buildApp(): Express {
  return createApp(loadConfig(), new MemoryStorage());
}
