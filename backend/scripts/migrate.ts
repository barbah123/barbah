/**
 * Minimal forward-only migration runner. Applies every migrations/*.sql file in
 * lexical order exactly once, tracking applied files in a schema_migrations
 * table. Safe to run repeatedly (idempotent) and on every container start.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hydrateEnvFromSsm } from '../src/ssm.js';
import { getPool, closePool } from '../src/db.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function run(): Promise<void> {
  await hydrateEnvFromSsm();
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    (await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map(
      (r) => r.filename,
    ),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= skip ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`+ applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`! failed ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('Migrations complete.');
}

run()
  .then(() => closePool())
  .catch(async (err) => {
    console.error(err);
    await closePool();
    process.exit(1);
  });
