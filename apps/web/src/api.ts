import type { AppUser, IndexedFile, Roster, ScanSession, Team, TeamTenure } from '@ncaa/domain';
import type { ScheduleCaptureImport } from '@ncaa/parsers';

export interface RosterFixtureImport {
  team: Team;
  roster: Roster;
  fixtureId: string;
  partial: boolean;
  sourceLabel: string;
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

export interface CommissionerConfig {
  apiUrl: string;
  dynastyId: string;
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
  listPublishHistory?(dynastyId?: string): Promise<PublishedBatchRecord[]>;
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
