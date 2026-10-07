CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  brief TEXT NOT NULL,
  report TEXT,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);
CREATE TABLE IF NOT EXISTS workspace (id TEXT PRIMARY KEY NOT NULL, settings TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY NOT NULL,
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_observations_purchase ON observations(purchase_id);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY NOT NULL, user TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_flows (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY NOT NULL,
  purchase_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS job_leases (name TEXT PRIMARY KEY NOT NULL, token TEXT NOT NULL, expires INTEGER NOT NULL);
