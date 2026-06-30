import { hydrateEnvFromSsm } from './ssm.js';
import { loadConfig } from './config.js';
import { createStorage } from './storage.js';
import { createApp } from './app.js';
import { closePool } from './db.js';
import { closeRedis } from './redis.js';

async function main(): Promise<void> {
  // Pull secrets from SSM into the environment first (no-op unless USE_SSM=true).
  await hydrateEnvFromSsm();

  const cfg = loadConfig();
  const storage = createStorage(cfg);
  const app = createApp(cfg, storage);

  const server = app.listen(cfg.port, () => {
    console.log(`pokemon-auction-api listening on :${cfg.port} (storage: ${cfg.storageDriver})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    server.close(async () => {
      await closePool();
      await closeRedis();
      process.exit(0);
    });
    // Force-exit if connections do not drain in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
