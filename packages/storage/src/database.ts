import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS scan_sessions (
  id TEXT PRIMARY KEY,
  source_root TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  file_count INTEGER NOT NULL DEFAULT 0,
  working_copy_dir TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS indexed_files (
  id TEXT PRIMARY KEY,
  scan_session_id TEXT NOT NULL,
  absolute_path TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  extension TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  modified_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  working_copy_path TEXT,
  FOREIGN KEY (scan_session_id) REFERENCES scan_sessions(id)
);

CREATE TABLE IF NOT EXISTS progression_snapshots (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  position TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  week INTEGER,
  label TEXT,
  ratings_json TEXT NOT NULL,
  overall_delta REAL
);

CREATE INDEX IF NOT EXISTS idx_indexed_files_session ON indexed_files(scan_session_id);
CREATE INDEX IF NOT EXISTS idx_progression_player ON progression_snapshots(player_id);

CREATE TABLE IF NOT EXISTS commissioner_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  synced_at TEXT,
  access_status TEXT NOT NULL DEFAULT 'active',
  password_updated_at TEXT,
  password_reset_required INTEGER NOT NULL DEFAULT 0,
  temporary_password TEXT
);

CREATE TABLE IF NOT EXISTS team_tenures (
  id TEXT PRIMARY KEY,
  career_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  dynasty_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  start_season_year INTEGER NOT NULL,
  end_season_year INTEGER,
  label TEXT,
  assigned_at TEXT NOT NULL,
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS roster_imports (
  id TEXT PRIMARY KEY,
  dynasty_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  roster_json TEXT NOT NULL,
  team_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  source_label TEXT NOT NULL,
  fixture_id TEXT
);

CREATE TABLE IF NOT EXISTS published_batches (
  batch_id TEXT PRIMARY KEY,
  dynasty_id TEXT NOT NULL,
  uploaded_by_user_id TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_conference_overrides (
  team_id TEXT PRIMARY KEY,
  conference_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team_tenures_dynasty ON team_tenures(dynasty_id, user_id);
CREATE INDEX IF NOT EXISTS idx_roster_imports_team ON roster_imports(team_id, imported_at);
CREATE INDEX IF NOT EXISTS idx_published_batches_dynasty ON published_batches(dynasty_id, created_at);

CREATE TABLE IF NOT EXISTS commissioner_dynasty_state (
  dynasty_id TEXT PRIMARY KEY,
  current_season_year INTEGER NOT NULL,
  archived_seasons_json TEXT NOT NULL DEFAULT '[]',
  archived_rankings_json TEXT NOT NULL DEFAULT '[]',
  team_roster_snapshots_json TEXT NOT NULL DEFAULT '[]',
  checkpoints_json TEXT NOT NULL DEFAULT '[]',
  player_catalog_json TEXT NOT NULL DEFAULT '[]',
  postseason_results_json TEXT NOT NULL DEFAULT '[]',
  schedule_imports_json TEXT NOT NULL DEFAULT '[]',
  top25_imports_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commissioner_leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  starting_season_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  commissioner_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commissioner_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  ensureColumn(db, 'commissioner_users', 'access_status', "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn(db, 'commissioner_users', 'password_updated_at', 'TEXT');
  ensureColumn(db, 'commissioner_users', 'password_reset_required', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'commissioner_users', 'temporary_password', 'TEXT');
  ensureColumn(db, 'commissioner_dynasty_state', 'checkpoints_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'commissioner_dynasty_state', 'player_catalog_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'commissioner_dynasty_state', 'postseason_results_json', "TEXT NOT NULL DEFAULT '[]'");
  return db;
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
