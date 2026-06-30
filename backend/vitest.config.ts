import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setupEnv.ts'],
    // DB-backed tests share a single Postgres schema, so run serially to keep
    // them deterministic instead of fighting over the same tables.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
