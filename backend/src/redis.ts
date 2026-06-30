import Redis from 'ioredis';

let client: Redis | null = null;

/**
 * Returns a shared Redis client, or null when REDIS_URL is not configured.
 * Caching is treated as an optional optimisation: every caller must work
 * correctly (just slower) when this returns null, which also keeps tests
 * runnable without a Redis instance.
 */
export function getRedis(): Redis | null {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  client = new Redis(url, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });
  // Never let a Redis hiccup crash the process; log and carry on uncached.
  client.on('error', (err) => {
    console.error('[redis] connection error:', err.message);
  });
  return client;
}

/** Best-effort GET that returns null on any cache failure. */
export async function cacheGet(key: string): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return await r.get(key);
  } catch {
    return null;
  }
}

/** Best-effort SET with TTL (seconds); silently ignores cache failures. */
export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, value, 'EX', ttlSeconds);
  } catch {
    /* ignore cache write failures */
  }
}

/** Best-effort delete of one or more keys. */
export async function cacheDel(...keys: string[]): Promise<void> {
  const r = getRedis();
  if (!r || keys.length === 0) return;
  try {
    await r.del(...keys);
  } catch {
    /* ignore */
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = null;
  }
}
