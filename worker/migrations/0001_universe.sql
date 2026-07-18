CREATE TABLE IF NOT EXISTS realms (
  seed TEXT PRIMARY KEY,
  parent_seed TEXT,
  portal_id TEXT,
  title TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS art_jobs (
  seed TEXT PRIMARY KEY REFERENCES realms(seed),
  status TEXT NOT NULL CHECK(status IN ('queued', 'generating', 'ready', 'failed')),
  lease_id TEXT,
  lease_expires_at INTEGER,
  attempt INTEGER NOT NULL DEFAULT 0,
  object_key TEXT,
  content_type TEXT,
  error_code TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS art_jobs_status_updated_idx ON art_jobs(status, updated_at);

CREATE TABLE IF NOT EXISTS art_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seed TEXT NOT NULL REFERENCES art_jobs(seed),
  event_type TEXT NOT NULL,
  attempt INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS art_events_seed_created_idx ON art_events(seed, created_at);
