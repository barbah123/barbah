-- Per-user salt for PBKDF2 password hashing.
ALTER TABLE users ADD COLUMN salt TEXT NOT NULL DEFAULT '';
