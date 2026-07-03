-- Paper trading şeması

CREATE TABLE portfolios (
  id TEXT PRIMARY KEY,
  device_id TEXT UNIQUE NOT NULL,
  cash REAL NOT NULL DEFAULT 100000,
  starting_cash REAL NOT NULL DEFAULT 100000,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE positions (
  portfolio_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  quantity REAL NOT NULL,
  avg_cost REAL NOT NULL,
  PRIMARY KEY (portfolio_id, symbol)
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  type TEXT NOT NULL CHECK (type IN ('market', 'limit')),
  quantity REAL NOT NULL,
  limit_price REAL,
  status TEXT NOT NULL DEFAULT 'open', -- open | filled | cancelled | rejected
  fill_price REAL,
  realized_pnl REAL,
  source TEXT NOT NULL DEFAULT 'manual', -- manual | strategy
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  filled_at TEXT
);
CREATE INDEX idx_orders_portfolio ON orders(portfolio_id, created_at DESC);
CREATE INDEX idx_orders_open ON orders(portfolio_id, symbol) WHERE status = 'open';

CREATE TABLE watchlist (
  portfolio_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (portfolio_id, symbol)
);

-- Strateji katmanı: sembol başına konfigüre edilen otomatik stratejiler
CREATE TABLE strategies (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sma_cross', 'rsi')),
  params TEXT NOT NULL DEFAULT '{}', -- JSON: {fast,slow} veya {period,buyBelow,sellAbove}
  quantity REAL NOT NULL DEFAULT 1,  -- sinyal başına işlem adedi
  auto_execute INTEGER NOT NULL DEFAULT 0, -- 1: sinyali otomatik emre çevir
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_strategies_portfolio ON strategies(portfolio_id);

-- Sinyal üretimi: strateji değerlendirmelerinin kaydı
CREATE TABLE signals (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  portfolio_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
  price REAL NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', -- new | executed | skipped
  order_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_signals_portfolio ON signals(portfolio_id, created_at DESC);
CREATE INDEX idx_signals_strategy ON signals(strategy_id, created_at DESC);
