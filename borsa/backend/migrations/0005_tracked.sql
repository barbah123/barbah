-- Manuel pozisyon takibi: kullanıcının bot dışında (gerçek/manuel) aldığı
-- pozisyonlar; 15 dakikada bir Telegram raporuyla izlenir.

CREATE TABLE tracked_positions (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  quantity REAL NOT NULL,
  entry_price REAL NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | closed
  exit_price REAL,
  pnl REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);
CREATE INDEX idx_tracked_status ON tracked_positions(status);
