-- Altın FTREND bekçisi: tek satırlık yapılandırma + durum.
-- Varsayılan: GC=F, 1 saatlik mum, FTREND(2,3) — 2,4 yıllık 1h verisinde
-- örneklem dışı doğrulamayı geçen tek sağlam kurulum (bkz. lib/ftrend.ts).
CREATE TABLE IF NOT EXISTS goldwatch (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  symbol TEXT NOT NULL DEFAULT 'GC=F',
  interval TEXT NOT NULL DEFAULT '1h',
  period INTEGER NOT NULL DEFAULT 2,
  mult REAL NOT NULL DEFAULT 3,
  last_flip_t INTEGER NOT NULL DEFAULT 0,   -- son bildirilen sinyal mumunun zamanı (unix sn)
  last_status_at TEXT,                      -- son durum raporunun zamanı
  last_trend TEXT                           -- 'up' | 'down' (bilgi amaçlı)
);
INSERT OR IGNORE INTO goldwatch (id) VALUES (1);
