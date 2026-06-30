import pg from 'pg';

const { Pool } = pg;

// Postgres returns BIGINT (int8) as a string by default to avoid precision
// loss. Our bigint columns hold unix-second timestamps and prices that fit in a
// JS number, and the mobile client expects numbers, so parse them back.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

let pool: pg.Pool | null = null;

export function getPool(databaseUrl?: string): pg.Pool {
  if (!pool) {
    const connectionString = databaseUrl ?? process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    pool = new Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX ?? 10),
      // Cloud Postgres (RDS) typically needs TLS; allow opting in.
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params as any[]);
}

/** Run fn inside a transaction, committing on success and rolling back on error. */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
