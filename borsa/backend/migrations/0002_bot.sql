-- Otonom trader botu: konfigürasyon + işlem defteri

CREATE TABLE bot_config (
  portfolio_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  risk_per_trade_pct REAL NOT NULL DEFAULT 1.0,   -- işlem başına riske edilen özkaynak yüzdesi
  stop_loss_pct REAL NOT NULL DEFAULT 2.0,        -- girişten % uzaklıkta stop
  take_profit_pct REAL NOT NULL DEFAULT 3.0,      -- girişten % uzaklıkta hedef
  trailing_stop_pct REAL NOT NULL DEFAULT 0,      -- 0 = kapalı; >0 ise zirveden % iz süren stop
  max_positions INTEGER NOT NULL DEFAULT 3,       -- eşzamanlı azami bot pozisyonu
  max_position_pct REAL NOT NULL DEFAULT 20.0,    -- tek pozisyonun özkaynağa azami oranı
  flatten_eod INTEGER NOT NULL DEFAULT 1,         -- kapanıştan önce tüm pozisyonları kapat
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE bot_trades (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  quantity REAL NOT NULL,
  entry_price REAL NOT NULL,
  stop_loss REAL NOT NULL,
  take_profit REAL NOT NULL,
  high_water REAL NOT NULL,                       -- iz süren stop için görülen en yüksek fiyat
  status TEXT NOT NULL DEFAULT 'open',            -- open | closed
  exit_price REAL,
  pnl REAL,
  entry_reason TEXT,
  exit_reason TEXT,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);
CREATE INDEX idx_bot_trades ON bot_trades(portfolio_id, status, opened_at DESC);
