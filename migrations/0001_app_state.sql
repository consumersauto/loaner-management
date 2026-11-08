-- The table already exists in the live database (created before this repo).
-- Kept here so a fresh local or new database matches production.
CREATE TABLE IF NOT EXISTS app_state (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
