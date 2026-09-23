-- İÇERİDEN KÜME ALIMLARI (OpenInsider) — bkz. src/lib/insider.ts
-- Görülen her küme kaydı (hisse + dosyalama tarihi) bir kez yazılır; tarama
-- yalnızca burada olmayan kayıtlar için hisse geçmişi çeker ve bildirim yollar.
-- score NULL = puanlanmadan geçildi (ilk koşudaki / bayat kayıtlar).
CREATE TABLE IF NOT EXISTS insider_seen (
  key TEXT PRIMARY KEY,          -- TICKER|YYYY-MM-DD (dosyalama tarihi)
  ticker TEXT NOT NULL,
  filing_date TEXT NOT NULL,
  trade_date TEXT,
  insiders INTEGER,
  value REAL,
  score INTEGER,
  grade TEXT,
  routine TEXT,                  -- "rutin/üye" ör. "2/5"
  notified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_insider_seen_created ON insider_seen(created_at);
