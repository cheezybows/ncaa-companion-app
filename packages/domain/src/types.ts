/** Unique identifiers */
export type TeamId = string;
export type PlayerId = string;
export type DynastyId = string;
export type SeasonId = string;
export type SnapshotId = string;

export interface Conference {
  id: string;
  name: string;
  abbreviation?: string;
}

export interface Team {
  id: TeamId;
  name: string;
  abbreviation: string;
  conferenceId?: string;
  overallRating?: number;
  offensiveRating?: number;
  defensiveRating?: number;
  ranking?: number;
  primaryColor?: string;
  secondaryColor?: string;
}

export type Position =
  | 'QB'
  | 'RB'
  | 'WR'
  | 'TE'
  | 'OL'
  | 'DL'
  | 'LB'
  | 'CB'
  | 'S'
  | 'K'
  | 'P'
  | 'ATH'
  | string;

export type PlayerClass = 'FR' | 'SO' | 'JR' | 'SR' | 'RS_FR' | 'RS_SO' | 'RS_JR' | 'RS_SR' | string;

export type RatingCategory = 'physical' | 'general' | 'offense' | 'defense' | 'specialTeams';

export interface RatingDefinition {
  code: string;
  label: string;
  category: RatingCategory;
  description: string;
  positions?: Position[];
}

export interface PlayerRatings {
  overall?: number;
  speed?: number;
  acceleration?: number;
  strength?: number;
  awareness?: number;
  agility?: number;
  changeOfDirection?: number;
  jumping?: number;
  stamina?: number;
  injury?: number;
  toughness?: number;
  throwPower?: number;
  shortAccuracy?: number;
  mediumAccuracy?: number;
  deepAccuracy?: number;
  throwOnRun?: number;
  playAction?: number;
  runBlock?: number;
  passBlock?: number;
  runBlockStrength?: number;
  passBlockFinesse?: number;
  impactBlocking?: number;
  catching?: number;
  shortRouteRunning?: number;
  mediumRouteRunning?: number;
  deepRouteRunning?: number;
  release?: number;
  catchInTraffic?: number;
  spectacularCatch?: number;
  ballCarrierVision?: number;
  trucking?: number;
  elusiveness?: number;
  breakTackle?: number;
  juke?: number;
  spin?: number;
  stiffArm?: number;
  carry?: number;
  tackle?: number;
  hitPower?: number;
  blockShed?: number;
  powerMoves?: number;
  finesseMoves?: number;
  pursuit?: number;
  playRecognition?: number;
  manCoverage?: number;
  zoneCoverage?: number;
  press?: number;
  kickPower?: number;
  kickAccuracy?: number;
  [key: string]: number | undefined;
}

export interface PlayerAbility {
  id: string;
  name: string;
  type: 'physical' | 'mental';
  category?: 'archetype' | 'trait' | 'mental';
  level?: 'bronze' | 'silver' | 'gold' | 'platinum' | string;
  positionGroups?: string[];
  archetypes?: string[];
  description?: string;
}

export interface Player {
  id: PlayerId;
  teamId: TeamId;
  firstName: string;
  lastName: string;
  position: Position;
  jerseyNumber?: number;
  classYear?: PlayerClass;
  heightInches?: number;
  weightLbs?: number;
  hometown?: string;
  state?: string;
  ratings: PlayerRatings;
  developmentTrait?: string;
  archetype?: string;
  abilities?: PlayerAbility[];
}

export interface DepthChartSlot {
  position: Position;
  depth: number;
  playerId: PlayerId;
}

export interface Roster {
  teamId: TeamId;
  players: Player[];
  depthChart: DepthChartSlot[];
  updatedAt: string;
}

export interface ScheduleGame {
  id: string;
  seasonId: SeasonId;
  week: number;
  date?: string;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  isBye?: boolean;
  homeScore?: number;
  awayScore?: number;
  isConferenceGame?: boolean;
  isPlayed: boolean;
}

export interface SeasonStanding {
  teamId: TeamId;
  wins: number;
  losses: number;
  confWins?: number;
  confLosses?: number;
  ranking?: number;
}

export interface RankingEntry {
  rank: number;
  previousRank?: number;
  teamId: TeamId;
  teamName: string;
  wins: number;
  losses: number;
  lastWeekResult?: string;
  thisWeekOpponent?: string;
  movement?: 'up' | 'down' | 'same';
}

export interface RankingSnapshot {
  id: string;
  dynastyId: DynastyId;
  seasonYear: number;
  pollType: 'top25';
  capturedAt: string;
  entries: RankingEntry[];
  sourceLabel?: string;
  fixtureId?: string;
}

export interface Season {
  id: SeasonId;
  dynastyId: DynastyId;
  year: number;
  label: string;
  schedule: ScheduleGame[];
  standings: SeasonStanding[];
  conferenceChampionTeamIds?: TeamId[];
  playoffTeamIds?: TeamId[];
  nationalChampionTeamId?: TeamId;
}

export interface Recruit {
  id: string;
  dynastyId: DynastyId;
  classYear: number;
  firstName: string;
  lastName: string;
  position: Position;
  stars?: number;
  nationalRank?: number;
  state?: string;
  committedTeamId?: TeamId;
  ratings: PlayerRatings;
}

export interface TeamRosterSnapshot {
  seasonYear: number;
  teamId: TeamId;
  roster: Roster;
  sourceLabel: string;
  archivedAt: string;
  week?: number;
  checkpointId?: string;
  snapshotType?: 'weekly' | 'season_final' | 'manual';
}

export interface Dynasty {
  id: DynastyId;
  name: string;
  userTeamId?: TeamId;
  currentSeasonYear: number;
  seasons: Season[];
  rankings?: RankingSnapshot[];
  teamRosterSnapshots?: TeamRosterSnapshot[];
  checkpoints?: import('./progression-archive.js').DynastyCheckpoint[];
  playerCatalog?: import('./progression-archive.js').PlayerCatalogEntry[];
  postseasonResults?: import('./progression-archive.js').PostseasonResult[];
  recruitingClasses: { classYear: number; recruits: Recruit[] }[];
  createdAt: string;
  updatedAt: string;
}

export interface PlayerProgressionSnapshot {
  id: SnapshotId;
  playerId: PlayerId;
  teamId: TeamId;
  capturedAt: string;
  seasonYear: number;
  week?: number;
  label?: string;
  ratings: PlayerRatings;
  overallDelta?: number;
}

export interface PlayerProgression {
  playerId: PlayerId;
  playerName: string;
  teamId: TeamId;
  position: Position;
  snapshots: PlayerProgressionSnapshot[];
}

/** Indexed game file metadata (read-only discovery) */
export type FileKind =
  | 'unknown'
  | 'text'
  | 'json'
  | 'sqlite'
  | 'binary'
  | 'compressed'
  | 'save'
  | 'roster'
  | 'dynasty'
  | 'settings'
  | 'cache';

export interface IndexedFile {
  id: string;
  absolutePath: string;
  relativePath: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
  kind: FileKind;
  scanSessionId: string;
}

export interface ScanSession {
  id: string;
  sourceRoot: string;
  startedAt: string;
  completedAt?: string;
  fileCount: number;
  workingCopyDir: string;
}

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  errors: string[];
  sourceFileId?: string;
}
