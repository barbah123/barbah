-- Nabız dedektörü: erken momentum alarmları + sıcak sembol hafızası

CREATE TABLE pulse_alerts (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  price REAL NOT NULL,
  change_15m REAL NOT NULL,   -- alarm anındaki son ~15 dk değişim
  day_change REAL NOT NULL,   -- alarm anındaki gün içi değişim
  rel_volume REAL,            -- son barların hacmi / normal bar hacmi
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pulse_symbol_time ON pulse_alerts(symbol, created_at DESC);
CREATE INDEX idx_pulse_time ON pulse_alerts(created_at DESC);

-- Son günlerde hareket etmiş semboller izlemede kalır (SLBT dersi:
-- 30 Haziran'da pumplanan hisse 2 Temmuz'da yine pumplandı).
CREATE TABLE hot_symbols (
  symbol TEXT NOT NULL,
  day TEXT NOT NULL,          -- YYYY-MM-DD
  source TEXT NOT NULL,       -- scan | pulse
  score REAL,
  PRIMARY KEY (symbol, day)
);
CREATE INDEX idx_hot_day ON hot_symbols(day DESC);
