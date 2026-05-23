import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { CommissionerRepository } from '@ncaa/storage/commissioner';
import type { AppUser, TeamTenure } from '@ncaa/domain';
import type { DynastySyncPayload } from '@ncaa/sync';
import type { PublishedBatchRecord, RosterImportRecord } from '@ncaa/storage/commissioner';

const require = createRequire(import.meta.url);
const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));

loadEnv();
loadEnv({ path: rootEnvPath });

export interface LocalCommissionerRepository {
  listUsers(): AppUser[];
  listTenures(dynastyId: string): TeamTenure[];
  saveTenure(tenure: TeamTenure): void;
  hasPublishedBatch(batchId: string): boolean;
  recordPublishedBatch(payload: DynastySyncPayload): void;
  getLastPublishedPayload(dynastyId: string): DynastySyncPayload | null;
  listPublishHistory(dynastyId: string, limit?: number): PublishedBatchRecord[];
}

interface HostedStateMirror {
  users?: AppUser[];
  tenures?: TeamTenure[];
  rosterImports?: RosterImportRecord[];
  publishHistory?: PublishedBatchRecord[];
  lastPublishedPayload?: DynastySyncPayload | null;
}

class JsonMirrorRepository implements LocalCommissionerRepository {
  constructor(private mirrorPath: string) {}

  private read(): HostedStateMirror {
    return JSON.parse(readFileSync(this.mirrorPath, 'utf8')) as HostedStateMirror;
  }

  listUsers(): AppUser[] {
    return this.read().users ?? [];
  }

  listTenures(dynastyId: string): TeamTenure[] {
    return (this.read().tenures ?? []).filter((tenure) => tenure.dynastyId === dynastyId);
  }

  saveTenure(_tenure: TeamTenure): void {
    // Desktop owns writes; this mirror is a read path for hosted dev.
  }

  hasPublishedBatch(batchId: string): boolean {
    return (this.read().publishHistory ?? []).some((batch) => batch.batchId === batchId);
  }

  recordPublishedBatch(_payload: DynastySyncPayload): void {
    // Desktop writes the mirror after publishing.
  }

  getLastPublishedPayload(dynastyId: string): DynastySyncPayload | null {
    const payload = this.read().lastPublishedPayload ?? null;
    return payload?.dynastyId === dynastyId ? payload : null;
  }

  listPublishHistory(dynastyId: string, limit = 20): PublishedBatchRecord[] {
    return (this.read().publishHistory ?? [])
      .filter((batch) => batch.dynastyId === dynastyId)
      .slice(0, limit);
  }
}

let repository: LocalCommissionerRepository | null | undefined;
let status:
  | { mode: 'sqlite'; path: string }
  | { mode: 'json'; path: string; reason?: string }
  | { mode: 'memory'; reason: string; path?: string }
  | undefined;

function getMirrorPath(dbPath: string | undefined): string | undefined {
  return process.env.NCAA_DESKTOP_STATE_PATH ?? (dbPath ? join(dirname(dbPath), 'hosted-state.json') : undefined);
}

export function getLocalCommissionerRepository(): LocalCommissionerRepository | null {
  if (repository !== undefined) return repository;

  const dbPath = process.env.NCAA_DESKTOP_DB_PATH;
  const mirrorPath = getMirrorPath(dbPath);
  if (mirrorPath && existsSync(mirrorPath)) {
    repository = new JsonMirrorRepository(mirrorPath);
    status = { mode: 'json', path: mirrorPath };
    return repository;
  }

  if (!dbPath || !existsSync(dbPath)) {
    repository = null;
    status = dbPath
      ? { mode: 'memory', reason: 'NCAA_DESKTOP_DB_PATH does not exist', path: dbPath }
      : { mode: 'memory', reason: 'NCAA_DESKTOP_DB_PATH is not set' };
    return repository;
  }

  try {
    const BetterSqlite3 = require('better-sqlite3-node');
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    repository = new CommissionerRepository(db);
    status = { mode: 'sqlite', path: dbPath };
    return repository;
  } catch (error) {
    if (mirrorPath && existsSync(mirrorPath)) {
      repository = new JsonMirrorRepository(mirrorPath);
      status = { mode: 'json', path: mirrorPath, reason: String(error) };
      return repository;
    }
    repository = null;
    status = {
      mode: 'memory',
      reason: `SQLite native module failed and hosted mirror was not found: ${String(error)}`,
      path: dbPath,
    };
    return repository;
  }
}

export function getLocalStorageStatus() {
  getLocalCommissionerRepository();
  return status ?? { mode: 'memory' as const, reason: 'storage not initialized' };
}

