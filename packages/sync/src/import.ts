import type { DynastySyncPayload } from './payloads.js';

export interface ImportedDynastyState {
  dynastyId: string;
  lastBatchId: string;
  lastSyncedAt: string;
  teamCount: number;
  playerCount: number;
  snapshotCount: number;
}

const imported = new Map<string, ImportedDynastyState>();

export function applySyncPayload(payload: DynastySyncPayload): ImportedDynastyState {
  const playerCount = Object.values(payload.rosters).reduce(
    (sum, roster) => sum + roster.players.length,
    0
  );
  const snapshotCount = payload.progression.reduce(
    (sum, progression) => sum + progression.snapshots.length,
    0
  );
  const scheduleGames = payload.dynasty.seasons.reduce(
    (sum, season) => sum + season.schedule.length,
    0
  );
  const recruits = payload.dynasty.recruitingClasses.reduce(
    (sum, klass) => sum + klass.recruits.length,
    0
  );

  const state: ImportedDynastyState = {
    dynastyId: payload.dynastyId,
    lastBatchId: payload.batchId,
    lastSyncedAt: payload.syncedAt,
    teamCount: payload.teams.length,
    playerCount,
    snapshotCount,
  };

  imported.set(payload.dynastyId, state);
  void scheduleGames;
  void recruits;
  return state;
}

export function getImportedState(dynastyId: string): ImportedDynastyState | undefined {
  return imported.get(dynastyId);
}

export function isIdempotentBatch(dynastyId: string, batchId: string): boolean {
  const existing = imported.get(dynastyId);
  return existing?.lastBatchId === batchId;
}
