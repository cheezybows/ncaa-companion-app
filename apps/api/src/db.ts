/**
 * Postgres adapter placeholder.
 * Set DATABASE_URL to enable a real hosted database in a future deployment.
 * Demo mode uses the in-memory store in store.ts.
 */
export function getStorageMode(): 'memory' | 'postgres' {
  return process.env.DATABASE_URL ? 'postgres' : 'memory';
}

export const POSTGRES_SCHEMA = `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE dynasties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  current_season_year INTEGER NOT NULL,
  commissioner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE team_claims (
  id TEXT PRIMARY KEY,
  dynasty_id TEXT NOT NULL REFERENCES dynasties(id),
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id TEXT REFERENCES users(id),
  note TEXT
);

CREATE TABLE team_tenures (
  id TEXT PRIMARY KEY,
  career_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  dynasty_id TEXT NOT NULL REFERENCES dynasties(id),
  team_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  start_season_year INTEGER NOT NULL,
  end_season_year INTEGER,
  label TEXT
);

CREATE TABLE sync_batches (
  id TEXT PRIMARY KEY,
  dynasty_id TEXT NOT NULL REFERENCES dynasties(id),
  uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  record_counts JSONB NOT NULL,
  errors JSONB NOT NULL DEFAULT '[]'
);
`;
