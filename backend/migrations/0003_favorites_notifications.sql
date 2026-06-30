CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL,
  auction_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, auction_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  auction_id TEXT,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_favorites_auction ON favorites(auction_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
