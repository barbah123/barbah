// Sensible defaults so tests run without a hand-written .env. A real
// DATABASE_URL (local cluster or CI service) must point at a throwaway database
// because the suite truncates tables.
process.env.JWT_SECRET ||= 'test-secret';
process.env.JWT_EXPIRES_IN ||= '1h';
process.env.STORAGE_DRIVER ||= 'memory';
process.env.DATABASE_URL ||= 'postgres://postgres:postgres@localhost:5432/pokemon_auction_test';

// Tests run without Redis (caching is optional) and without SSM.
delete process.env.REDIS_URL;
delete process.env.USE_SSM;
