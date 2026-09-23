-- Altın bekçisine sanal TL portföyü: 1.000.000 ₺ başlangıç bakiyesi.
-- AL sinyalinde tüm nakit gram altına döner (GC=F USD/ons × USDTRY / 31,1035),
-- SAT sinyalinde altın TL'ye döner. Her işlem gold_trades'e yazılır;
-- performans başlangıç bakiyesi ve gram-altın al-tut kıyasıyla ölçülür.
ALTER TABLE goldwatch ADD COLUMN trading INTEGER NOT NULL DEFAULT 1;
ALTER TABLE goldwatch ADD COLUMN cash_tl REAL NOT NULL DEFAULT 1000000;
ALTER TABLE goldwatch ADD COLUMN gold_grams REAL NOT NULL DEFAULT 0;
ALTER TABLE goldwatch ADD COLUMN start_tl REAL NOT NULL DEFAULT 1000000;
ALTER TABLE goldwatch ADD COLUMN start_gram_tl REAL;  -- ölçüm başındaki gram fiyatı (al-tut kıyası)
ALTER TABLE goldwatch ADD COLUMN started_at TEXT;

CREATE TABLE IF NOT EXISTS gold_trades (
  id TEXT PRIMARY KEY,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  grams REAL NOT NULL,
  gram_price_tl REAL NOT NULL,
  usd_gold REAL NOT NULL,   -- işlem anındaki ons fiyatı (USD)
  usdtry REAL NOT NULL,
  tl_amount REAL NOT NULL,  -- buy: harcanan TL (brüt); sell: ele geçen TL (net)
  fee_tl REAL NOT NULL,
  pnl_tl REAL,              -- sell: önceki alıma göre net K/Z
  equity_tl REAL NOT NULL,  -- işlem sonrası toplam portföy değeri
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
