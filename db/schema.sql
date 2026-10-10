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
CREATE TABLE IF NOT EXISTS research_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  user_id TEXT NOT NULL,
  brief_revision INTEGER NOT NULL,
  brief_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  payload TEXT NOT NULL,
  lease_token TEXT,
  lease_expires INTEGER NOT NULL DEFAULT 0,
  retry_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, purchase_id, brief_revision, brief_hash)
);
CREATE INDEX IF NOT EXISTS idx_research_jobs_runnable ON research_jobs(status,retry_at,lease_expires);
CREATE INDEX IF NOT EXISTS idx_research_jobs_owner ON research_jobs(user_id,purchase_id);
