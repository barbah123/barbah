-- KULLAMÄGI (Qullamaggie) KURULUM TARAYICISI
-- Üç kurulum aranır: sıkı konsolidasyon breakout'u, episodic pivot (katalizörlü
-- dev gap) ve parabolik short (aşırı hareket sonrası dönüş).
--
-- Mimari not: günlük mum analizi PAHALI (sembol başına 1 istek), tetik kontrolü
-- UCUZ (tek snapshot'tan canlı fiyat). Bu yüzden kurulum tespiti dönen (rotating)
-- derin taramada kk_watch'a yazılır; her koşuda yalnızca canlı fiyat pivot/tetik
-- seviyeleriyle kıyaslanır.

CREATE TABLE IF NOT EXISTS kk_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  min_price REAL NOT NULL DEFAULT 3,            -- penny hisse elemesi
  min_dollar_vol REAL NOT NULL DEFAULT 3000000, -- 20 günlük ort. dolar hacmi tabanı
  min_gap_pct REAL NOT NULL DEFAULT 8,          -- episodic pivot asgari gap %
  refresh_batch INTEGER NOT NULL DEFAULT 10,    -- koşu başına derin taranan sembol
  universe_max INTEGER NOT NULL DEFAULT 400,    -- dönen taramanın evren tavanı
  last_watchlist_day TEXT,                      -- son izleme listesi raporu (NY tarihi)
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO kk_state (id) VALUES (1);

-- Derin taramanın çıktısı: sembolün güncel kurulum durumu ve tetik seviyeleri.
CREATE TABLE IF NOT EXISTS kk_watch (
  symbol TEXT PRIMARY KEY,
  setup TEXT NOT NULL,          -- breakout | parabolic_watch | none
  price REAL,
  adr_pct REAL,                 -- 20 günlük ortalama gün içi menzil %
  dollar_vol REAL,              -- 20 günlük ortalama dolar hacmi
  gain_1m REAL,
  gain_3m REAL,
  gain_6m REAL,
  pivot REAL,                   -- konsolidasyon tepesi (breakout tetiği)
  base_low REAL,                -- konsolidasyon dibi
  base_len INTEGER,             -- konsolidasyon gün sayısı
  depth_pct REAL,               -- tepeden dibe derinlik %
  tightness REAL,               -- ikinci yarı menzili / ilk yarı menzili (<1 = daralma)
  vol_dryup REAL,               -- ikinci yarı hacmi / ilk yarı hacmi (<1 = kuruma)
  ma_ref TEXT,                  -- 10ema | 20ema | 50sma (baz uzunluğuna göre)
  ma_level REAL,
  last_low REAL,                -- son kapanmış günün düşüğü (stop referansı)
  last_high REAL,               -- son kapanmış günün tepesi (short stop referansı)
  trigger_below REAL,           -- parabolik: bu seviyenin altı = dönüş tetiği
  ext_pct REAL,                 -- 20 EMA'dan uzama % (parabolik ölçüsü)
  score REAL,
  note TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kk_watch_setup ON kk_watch(setup, score DESC);
CREATE INDEX IF NOT EXISTS idx_kk_watch_checked ON kk_watch(checked_at);

-- Üretilen sinyaller (Telegram'a giden kayıtlar + soğuma kontrolü).
CREATE TABLE IF NOT EXISTS kk_signals (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  setup TEXT NOT NULL,          -- breakout | episodic_pivot | parabolic_short
  side TEXT NOT NULL,           -- long | short
  price REAL NOT NULL,          -- sinyal anındaki fiyat
  entry REAL NOT NULL,          -- önerilen giriş seviyesi
  stop REAL NOT NULL,
  target REAL,
  risk_pct REAL NOT NULL,       -- giriş→stop mesafesi %
  rel_volume REAL,
  adr_pct REAL,
  score REAL,
  detail TEXT,
  notified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kk_signals_time ON kk_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kk_signals_symbol ON kk_signals(symbol, setup, created_at DESC);
