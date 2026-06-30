CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Kullanıcı başına ayarlar: şifrelenmiş OpenAI API anahtarı ve model tercihi.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  openai_api_key_encrypted TEXT,
  openai_key_last4 TEXT,
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Geçmiş fal okumaları (fincan görseli kalıcı olarak saklanmaz, yalnızca sonuç metni).
CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,            -- 'photo' | 'text'
  question TEXT,
  result TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_readings_user ON readings(user_id, created_at DESC);
