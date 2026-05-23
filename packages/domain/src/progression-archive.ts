import type {
  DynastyId,
  PlayerId,
  RankingSnapshot,
  ScheduleGame,
  SeasonStanding,
  TeamId,
} from './types.js';
import type { TeamRosterSnapshot } from './types.js';

export type CheckpointType = 'weekly' | 'season_final';

export type PostseasonResultKind =
  | 'conference_championship'
  | 'playoff'
  | 'national_championship'
  | 'bowl';

export type PlayerExitStatus = 'active' | 'graduated' | 'transferred' | 'unknown';

export interface ArchiveRevision {
  revision: number;
  updatedAt: string;
  updatedByUserId?: string;
  correctionReason?: string;
}

export interface PostseasonResult {
  id: string;
  dynastyId: DynastyId;
  seasonYear: number;
  teamId: TeamId;
  kind: PostseasonResultKind;
  round?: string;
  opponentTeamId?: TeamId;
  teamScore?: number;
  opponentScore?: number;
  isChampion?: boolean;
  titleLabel?: string;
  notes?: string;
  revision?: ArchiveRevision;
}

export interface SeasonScheduleSnapshot {
  seasonYear: number;
  schedule: ScheduleGame[];
  standings: SeasonStanding[];
}

export interface DynastyCheckpoint {
  id: string;
  dynastyId: DynastyId;
  seasonYear: number;
  week: number;
  type: CheckpointType;
  capturedAt: string;
  rosterSnapshots: TeamRosterSnapshot[];
  scheduleSnapshot?: SeasonScheduleSnapshot;
  rankingSnapshot?: RankingSnapshot;
  postseasonResults?: PostseasonResult[];
  notes?: string;
  revision?: ArchiveRevision;
}

export interface PlayerCatalogTeamSpan {
  teamId: TeamId;
  seasonYears: number[];
  firstSeenSeasonYear: number;
  lastSeenSeasonYear: number;
}

export interface PlayerCatalogEntry {
  playerId: PlayerId;
  firstName: string;
  lastName: string;
  position: string;
  careerPlayerId?: string;
  teams: PlayerCatalogTeamSpan[];
  classHistory: string[];
  firstSeenSeasonYear: number;
  lastSeenSeasonYear: number;
  exitSeasonYear?: number;
  exitStatus: PlayerExitStatus;
  exitTeamId?: TeamId;
  revision?: ArchiveRevision;
}

export interface CoachTeamArchiveBucket {
  tenureId: string;
  userId: string;
  coachName: string;
  teamId: TeamId;
  teamName: string;
  startSeasonYear: number;
  endSeasonYear?: number;
  seasonYears: number[];
  checkpointIds: string[];
}

export interface WeekAdvancePreview {
  currentSeasonYear: number;
  nextWeek: number;
  teamCount: number;
  rosterPlayerCount: number;
  scheduleGameCount: number;
  hasTop25: boolean;
  postseasonResultCount: number;
}

export interface WeekAdvanceResult {
  seasonYear: number;
  week: number;
  checkpointId: string;
  rosterSnapshots: number;
  progressionSnapshots: number;
}

export interface DynastyArchiveSummary {
  currentSeasonYear: number;
  currentWeek: number | null;
  checkpointCount: number;
  archivedSeasonCount: number;
  playerCatalogCount: number;
  postseasonResultCount: number;
  checkpoints: DynastyCheckpoint[];
  playerCatalog: PlayerCatalogEntry[];
  postseasonResults: PostseasonResult[];
  coachArchiveBuckets: CoachTeamArchiveBucket[];
}

