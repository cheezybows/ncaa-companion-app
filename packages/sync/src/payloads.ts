import type {
  Dynasty,
  DynastyCheckpoint,
  PlayerCatalogEntry,
  PlayerProgression,
  PostseasonResult,
  Roster,
  ScheduleGame,
  SeasonStanding,
  SyncBatch,
  Team,
  TeamTenure,
} from '@ncaa/domain';

export interface DynastySyncPayload {
  batchId: string;
  dynastyId: string;
  uploadedByUserId: string;
  syncedAt: string;
  dynasty: Dynasty;
  teams: Team[];
  rosters: Record<string, Roster>;
  progression: PlayerProgression[];
  checkpoints?: DynastyCheckpoint[];
  playerCatalog?: PlayerCatalogEntry[];
  postseasonResults?: PostseasonResult[];
  teamTenures?: TeamTenure[];
}

export interface SyncBatchRequest {
  dynastyId: string;
  uploadedByUserId: string;
  payload: Omit<DynastySyncPayload, 'batchId' | 'syncedAt'>;
}

export interface SyncBatchResponse {
  batch: SyncBatch;
  updated: boolean;
}

export interface SeasonGameUpload {
  id?: string;
  week: number;
  date?: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number;
  awayScore?: number;
  isConferenceGame?: boolean;
  isPlayed?: boolean;
}

export interface SeasonDataUpload {
  seasonYear: number;
  label?: string;
  games: SeasonGameUpload[];
  standings?: SeasonStanding[];
}

export interface SeasonDataUploadResponse {
  seasonYear: number;
  games: ScheduleGame[];
  standings: SeasonStanding[];
  batch: SyncBatch;
  updated: boolean;
}

export function createSyncPayload(
  uploadedByUserId: string,
  dynasty: Dynasty,
  teams: Team[],
  rosters: Record<string, Roster>,
  progression: PlayerProgression[],
  extras?: {
    checkpoints?: DynastyCheckpoint[];
    playerCatalog?: PlayerCatalogEntry[];
    postseasonResults?: PostseasonResult[];
    teamTenures?: TeamTenure[];
  }
): DynastySyncPayload {
  const batchId = crypto.randomUUID();
  return {
    batchId,
    dynastyId: dynasty.id,
    uploadedByUserId,
    syncedAt: new Date().toISOString(),
    dynasty,
    teams,
    rosters,
    progression,
    checkpoints: extras?.checkpoints,
    playerCatalog: extras?.playerCatalog,
    postseasonResults: extras?.postseasonResults,
    teamTenures: extras?.teamTenures,
  };
}
