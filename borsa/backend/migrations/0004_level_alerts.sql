-- Seviye alarmları: belirlenen fiyat seviyesi kırılınca Telegram bildirimi
-- (ör. "ORCL 134.50 altına inerse haber ver" — fırsat bekçiliği)

CREATE TABLE level_alerts (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  level REAL NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'armed', -- armed | triggered
  triggered_at TEXT,
  triggered_price REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_level_alerts_status ON level_alerts(status, symbol);
