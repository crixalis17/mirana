import {databaseClient} from '../database';

// Additive rollout: older Mirana databases already contain shopping/auth tables.
// Never recreate, export or reassign those records during research activation.
let ready: Promise<unknown> | undefined;
export function ensureResearchSchema() {
  return ready ??= databaseClient().batch([
    `CREATE TABLE IF NOT EXISTS research_jobs (
      id TEXT PRIMARY KEY NOT NULL,
      purchase_id TEXT NOT NULL REFERENCES purchases(id),
      user_id TEXT NOT NULL, brief_revision INTEGER NOT NULL,
      brief_hash TEXT NOT NULL, status TEXT NOT NULL, stage TEXT NOT NULL,
      payload TEXT NOT NULL, lease_token TEXT, lease_expires INTEGER NOT NULL DEFAULT 0,
      retry_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(user_id,purchase_id,brief_revision,brief_hash)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_research_jobs_runnable ON research_jobs(status,retry_at,lease_expires)',
    'CREATE INDEX IF NOT EXISTS idx_research_jobs_owner ON research_jobs(user_id,purchase_id)',
  ], 'write').catch(error => {ready=undefined;throw error;});
}
