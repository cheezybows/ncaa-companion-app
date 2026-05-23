import type { IndexedFile, ScanSession, AppUser, Team, TeamTenure } from '@ncaa/domain';
import type { PublishedBatchRecord, RosterImportRecord } from '@ncaa/storage';
import type { RosterCaptureImport, ScheduleCaptureImport } from '@ncaa/parsers';

export type { RosterCaptureImport, ScheduleCaptureImport };

export interface ScanStore {
  createSession(session: ScanSession): void;
  completeSession(id: string, fileCount: number): void;
  getLatestSession(): ScanSession | null;
  insertFiles(files: Array<IndexedFile & { workingCopyPath?: string }>): void;
  listFilesBySession(sessionId: string): Array<IndexedFile & { workingCopyPath?: string }>;
  countFiles(): number;
}

export interface ScanResult {
  session: ScanSession;
  files: Array<IndexedFile & { workingCopyPath?: string }>;
}

export interface AppSummary {
  latestSession: ScanSession | null;
  totalIndexedFiles: number;
  databasePath: string;
  hostedStateMirrorPath?: string;
}

export interface CommissionerConfig {
  apiUrl: string;
  dynastyId: string;
  commissionerUserId: string;
  hostedStateMirrorPath?: string;
}

export interface PublishResult {
  batchId: string;
  updated: boolean;
}

export interface NcaaApi {
  getSummary(): Promise<AppSummary>;
  chooseAndScanFolder(): Promise<ScanResult | null>;
  listLatestFiles(): Promise<Array<IndexedFile & { workingCopyPath?: string }>>;
  exportPlaceholderData(): Promise<{ canceled: boolean; filePath?: string }>;
  importRosterScreenshotForTeam(input: {
    dynastyId: string;
    teamId: string;
  }): Promise<RosterCaptureImport | null>;
  importScheduleScreenshotForTeam(input: {
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
