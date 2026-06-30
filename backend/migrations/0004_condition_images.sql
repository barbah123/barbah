-- Card condition (grade) and multiple image keys (JSON array).
ALTER TABLE auctions ADD COLUMN condition TEXT NOT NULL DEFAULT '';
ALTER TABLE auctions ADD COLUMN image_keys TEXT NOT NULL DEFAULT '[]';
