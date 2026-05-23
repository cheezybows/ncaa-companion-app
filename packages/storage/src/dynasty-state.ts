import type {
  DynastyCheckpoint,
  PlayerCatalogEntry,
  PostseasonResult,
  RankingSnapshot,
  Season,
  TeamRosterSnapshot,
} from '@ncaa/domain';
import type { ScheduleCaptureImport, Top25CaptureImport } from '@ncaa/parsers';

export interface CommissionerDynastyState {
  dynastyId: string;
  currentSeasonYear: number;
  archivedSeasons: Season[];
  archivedRankings: RankingSnapshot[];
  teamRosterSnapshots: TeamRosterSnapshot[];
  checkpoints: DynastyCheckpoint[];
  playerCatalog: PlayerCatalogEntry[];
  postseasonResults: PostseasonResult[];
  scheduleImports: ScheduleCaptureImport[];
  top25Imports: Top25CaptureImport[];
}

export const DEFAULT_COMMISSIONER_DYNASTY_STATE = (
  dynastyId: string,
  currentSeasonYear: number
): CommissionerDynastyState => ({
  dynastyId,
  currentSeasonYear,
  archivedSeasons: [],
  archivedRankings: [],
  teamRosterSnapshots: [],
  checkpoints: [],
  playerCatalog: [],
  postseasonResults: [],
  scheduleImports: [],
  top25Imports: [],
});
