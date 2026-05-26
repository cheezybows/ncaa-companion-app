import type {
  AppUser,
  DynastyArchiveSummary,
  DynastyCheckpoint,
  IndexedFile,
  PlayerCatalogEntry,
  PostseasonResult,
  RankingEntry,
  Roster,
  ScanSession,
  ScheduleGame,
  SeasonAdvanceAssignmentInput,
  SeasonAdvanceHeismanInput,
  SeasonAdvancePreview,
  SeasonAdvanceResult,
  Team,
  TeamTenure,
  WeekAdvancePreview,
  WeekAdvanceResult,
} from '@ncaa/domain';
import type { CaptureImportWarning, ScheduleCaptureImport, Top25CaptureImport } from '@ncaa/parsers';

export interface RosterFixtureImport {
  team: Team;
  roster: Roster;
  fixtureId: string;
  partial: boolean;
  sourceLabel: string;
  warnings?: CaptureImportWarning[];
}

export interface AppSummary {
  latestSession: ScanSession | null;
  totalIndexedFiles: number;
  databasePath: string;
  hostedStateMirrorPath?: string;
}

export interface ScanResult {
  session: ScanSession;
  files: Array<IndexedFile & { workingCopyPath?: string }>;
}

export interface CommissionerLeagueSummary {
  id: string;
  name: string;
  startingSeasonYear: number;
  status: 'active' | 'archived';
  commissionerUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionerConfig {
  apiUrl: string;
  dynastyId: string;
  leagueName: string;
  startingSeasonYear: number;
  commissionerUserId: string;
  hostedStateMirrorPath?: string;
}

export interface RosterImportRecord {
  id: string;
  dynastyId: string;
  teamId: string;
  team: Team;
  roster: Roster;
  importedAt: string;
  sourceLabel: string;
  fixtureId?: string;
}

export interface PublishedBatchRecord {
  batchId: string;
  dynastyId: string;
  uploadedByUserId: string;
  syncedAt: string;
  status: 'completed' | 'failed';
  createdAt: string;
}

export interface PublishResult {
  batchId: string;
  updated: boolean;
}

export interface DemoModeResult {
  dynastyId: string;
  leagueName: string;
  batchId: string;
  updated: boolean;
  userCount: number;
  tenureCount: number;
}

export interface CompanionApi {
  getSummary(): Promise<AppSummary>;
  chooseAndScanFolder(): Promise<ScanResult | null>;
  listLatestFiles(): Promise<Array<IndexedFile & { workingCopyPath?: string }>>;
  exportPlaceholderData(): Promise<{ canceled: boolean; filePath?: string }>;
  importRosterScreenshotForTeam?(input: {
    dynastyId: string;
    teamId: string;
  }): Promise<RosterFixtureImport | null>;
  importScheduleScreenshotForTeam?(input: {
    dynastyId: string;
    teamId: string;
  }): Promise<ScheduleCaptureImport | null>;
  listScheduleImports?(): Promise<ScheduleCaptureImport[]>;
  importTop25Screenshot?(input: { dynastyId: string }): Promise<Top25CaptureImport | null>;
  listTop25Imports?(): Promise<Top25CaptureImport[]>;
  saveManualRoster?(input: { dynastyId: string; teamId: string; roster: Roster }): Promise<RosterImportRecord>;
  saveManualSchedule?(input: {
    dynastyId: string;
    teamId: string;
    schedule: ScheduleGame[];
  }): Promise<ScheduleCaptureImport>;
  saveManualTop25?(input: {
    dynastyId: string;
    entries: RankingEntry[];
  }): Promise<Top25CaptureImport>;
  clearTeamImports?(input: {
    dynastyId: string;
    teamId: string;
  }): Promise<{ removedRosterImports: number; removedScheduleImports: number }>;
  clearAllImports?(input: {
    dynastyId: string;
  }): Promise<{
    removedRosterImports: number;
    removedScheduleImports: number;
    removedTop25Imports: number;
  }>;
  undoLatestRosterImport?(input: {
    dynastyId: string;
    teamId: string;
  }): Promise<{ removedRosterImports: number }>;
  undoLatestScheduleImport?(input: {
    dynastyId: string;
    teamId: string;
  }): Promise<{ removedScheduleImports: number }>;
  undoLatestTop25Import?(): Promise<{ removedTop25Imports: number }>;
  getCommissionerConfig?(): Promise<CommissionerConfig>;
  listUsers?(): Promise<AppUser[]>;
  listTeams?(): Promise<Team[]>;
  updateTeamConference?(input: { teamId: string; conferenceId: string }): Promise<Team>;
  seedDemoUsers?(): Promise<AppUser[]>;
  saveUser?(input: {
    id?: string;
    email: string;
    displayName: string;
    role: AppUser['role'];
    accessStatus?: AppUser['accessStatus'];
    temporaryPassword?: string;
    passwordResetRequired?: boolean;
  }): Promise<AppUser>;
  deleteUser?(userId: string): Promise<{ removedUsers: number }>;
  listCoaches?(): Promise<AppUser[]>;
  refreshHostedUsers?(): Promise<AppUser[]>;
  listCommissionerTenures?(dynastyId?: string): Promise<TeamTenure[]>;
  listAssignableTeams?(dynastyId: string, userId: string): Promise<string[]>;
  assignCoachTeam?(input: {
    dynastyId: string;
    userId: string;
    teamId: string;
  }): Promise<TeamTenure>;
  listRosterImports?(dynastyId?: string): Promise<RosterImportRecord[]>;
  publishToHosted?(): Promise<PublishResult>;
  installDemoMode?(): Promise<DemoModeResult>;
  listPublishHistory?(dynastyId?: string): Promise<PublishedBatchRecord[]>;
  previewSeasonAdvance?(
    assignments?: SeasonAdvanceAssignmentInput[]
  ): Promise<SeasonAdvancePreview>;
  advanceToNextSeason?(
    assignments: SeasonAdvanceAssignmentInput[],
    heisman?: SeasonAdvanceHeismanInput
  ): Promise<SeasonAdvanceResult>;
  previewWeekAdvance?(): Promise<WeekAdvancePreview>;
  advanceToNextWeek?(): Promise<WeekAdvanceResult>;
  getDynastyArchiveSummary?(): Promise<DynastyArchiveSummary>;
  listPostseasonResults?(seasonYear?: number): Promise<PostseasonResult[]>;
  savePostseasonResult?(
    input: Omit<PostseasonResult, 'id' | 'dynastyId'> & { id?: string }
  ): Promise<PostseasonResult>;
  deletePostseasonResult?(id: string): Promise<void>;
  updateCheckpoint?(input: {
    checkpointId: string;
    notes?: string;
    correctionReason?: string;
  }): Promise<DynastyCheckpoint>;
  updateCheckpointRoster?(input: {
    checkpointId: string;
    teamId: string;
    roster: Roster;
    correctionReason?: string;
  }): Promise<DynastyCheckpoint>;
  updatePlayerCatalogEntry?(input: {
    playerId: string;
    exitStatus?: PlayerCatalogEntry['exitStatus'];
    exitSeasonYear?: number;
    exitTeamId?: string;
    correctionReason?: string;
  }): Promise<PlayerCatalogEntry>;
  listLeagues?(): Promise<CommissionerLeagueSummary[]>;
  createLeague?(input: {
    name: string;
    startingSeasonYear: number;
    selfUser: {
      displayName: string;
      email: string;
      temporaryPassword?: string;
    };
  }): Promise<{ league: CommissionerLeagueSummary; user: AppUser }>;
  switchActiveLeague?(leagueId: string): Promise<CommissionerLeagueSummary>;
  deleteLeague?(leagueId: string): Promise<void>;
}

const fallback: CompanionApi = {
  async getSummary() {
    return { latestSession: null, totalIndexedFiles: 0, databasePath: 'Not available in browser' };
  },
  async chooseAndScanFolder() {
    alert('Folder scanning is available in the Electron desktop app.');
    return null;
  },
  async listLatestFiles() {
    return [];
  },
  async exportPlaceholderData() {
    const link = document.createElement('a');
    link.href = `data:application/json,${encodeURIComponent(JSON.stringify({ exportedAt: new Date().toISOString() }, null, 2))}`;
    link.download = 'ncaa-companion-export.json';
    link.click();
    return { canceled: false, filePath: link.download };
  },
};

export function getCompanionApi(): CompanionApi {
  return window.ncaa ?? fallback;
}
