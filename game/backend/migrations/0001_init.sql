-- Badaland: kullanicilar, kozmetik sahiplikleri ve bolum ilerlemesi

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  verify_code TEXT,
  verify_expires INTEGER,
  coins INTEGER NOT NULL DEFAULT 500,
  character TEXT NOT NULL DEFAULT 'tilki',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Satin alinan karakterler (ucretsiz karakterler tablodan bagimsiz olarak herkesindir)
CREATE TABLE user_characters (
  user_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  PRIMARY KEY (user_id, character_id)
);

-- Satin alinan kiyafet/aksesuarlar
CREATE TABLE user_items (
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  equipped INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_id)
);

-- Bolum ilerlemesi
CREATE TABLE progress (
  user_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  completions INTEGER NOT NULL DEFAULT 0,
  best_time REAL,
  PRIMARY KEY (user_id, level)
);
