import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ensureSchema } from './helpers.js';
import { getPool, closePool } from '../src/db.js';

const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts');

function hasBinary(bin: string): boolean {
  try {
    execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// The backup scripts shell out to pg_dump/psql; skip cleanly where unavailable.
const canRun = hasBinary('pg_dump') && hasBinary('psql');
const maybe = canRun ? describe : describe.skip;

let workdir: string;

beforeAll(async () => {
  await ensureSchema();
  workdir = mkdtempSync(join(tmpdir(), 'backup-test-'));
});

afterAll(async () => {
  if (workdir) rmSync(workdir, { recursive: true, force: true });
  await closePool();
});

maybe('backup & restore (round-trip)', () => {
  it('dumps seeded data and restores it into a fresh database', async () => {
    // Seed a recognisable row.
    await getPool().query(
      `INSERT INTO users (id, email, username, password_hash) VALUES ($1, $2, $3, $4)`,
      ['u-backup', 'backup@example.com', 'backupuser', 'x'],
    );

    const dumpPath = join(workdir, 'dump.sql.gz');

    // 1) Back up (local dump, no S3).
    execFileSync('bash', [join(scriptsDir, 'backup.sh')], {
      env: { ...process.env, DUMP_ONLY: 'true', LOCAL_DUMP_PATH: dumpPath },
      stdio: 'pipe',
    });

    const dumpText = gunzipSync(readFileSync(dumpPath)).toString('utf8');
    expect(dumpText).toContain('backup@example.com');

    // 2) Restore into a brand-new database and verify the row survives.
    const base = new URL(process.env.DATABASE_URL as string);
    const targetName = `${base.pathname.replace('/', '')}_restore`;
    const adminUrl = new URL(base.toString());
    adminUrl.pathname = '/postgres';
    const targetUrl = new URL(base.toString());
    targetUrl.pathname = `/${targetName}`;

    const admin = new pg.Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${targetName} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${targetName}`);

      execFileSync('bash', [join(scriptsDir, 'restore.sh'), dumpPath], {
        env: { ...process.env, DATABASE_URL: targetUrl.toString(), FORCE: 'true' },
        stdio: 'pipe',
      });

      const target = new pg.Client({ connectionString: targetUrl.toString() });
      await target.connect();
      try {
        const res = await target.query(
          'SELECT email FROM users WHERE email = $1',
          ['backup@example.com'],
        );
        expect(res.rows).toHaveLength(1);
      } finally {
        await target.end();
      }
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS ${targetName} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
  });
});
