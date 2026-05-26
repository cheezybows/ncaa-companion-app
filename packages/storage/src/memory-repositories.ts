import { randomUUID } from 'node:crypto';
import type { AppUser, IndexedFile, Roster, ScanSession, Team, TeamTenure } from '@ncaa/domain';
import type { DynastySyncPayload } from '@ncaa/sync';
import {
  DEFAULT_COMMISSIONER_DYNASTY_STATE,
  type CommissionerDynastyState,
} from './dynasty-state.js';
import type { PublishedBatchRecord, RosterImportRecord } from './commissioner-repositories.js';
import {
  leagueIdFromName,
  type CommissionerLeague,
  type CreateCommissionerLeagueInput,
} from './leagues.js';

const ACTIVE_LEAGUE_SETTING_KEY = 'active_league_id';

export class MemoryScanRepository {
  private sessions: ScanSession[] = [];
  private files: Array<IndexedFile & { workingCopyPath?: string }> = [];

  createSession(session: ScanSession): void {
    this.sessions.unshift(session);
  }

  completeSession(id: string, fileCount: number): void {
    const session = this.sessions.find((item) => item.id === id);
    if (!session) return;
    session.completedAt = new Date().toISOString();
    session.fileCount = fileCount;
  }

  listSessions(): ScanSession[] {
    return [...this.sessions];
  }

  getLatestSession(): ScanSession | null {
    return this.sessions[0] ?? null;
  }

  insertFiles(files: Array<IndexedFile & { workingCopyPath?: string }>): void {
    const sessionId = files[0]?.scanSessionId;
    if (sessionId) {
      this.files = this.files.filter((file) => file.scanSessionId !== sessionId);
    }
    this.files.push(...files);
  }

  listFilesBySession(sessionId: string): Array<IndexedFile & { workingCopyPath?: string }> {
    return this.files
      .filter((file) => file.scanSessionId === sessionId)
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  countFiles(): number {
    return this.files.length;
  }
}

export class MemoryCommissionerRepository {
  private users: AppUser[] = [];
  private tenures: TeamTenure[] = [];
  private imports: RosterImportRecord[] = [];
  private batches: PublishedBatchRecord[] = [];
  private payloads = new Map<string, DynastySyncPayload>();
  private teamConferenceOverrides = new Map<string, string>();
  private dynastyState = new Map<string, CommissionerDynastyState>();
  private leagues: CommissionerLeague[] = [];
  private settings = new Map<string, string>();

  upsertUsers(users: AppUser[]): void {
    const byId = new Map(this.users.map((user) => [user.id, user]));
    for (const user of users) byId.set(user.id, user);
    this.users = [...byId.values()];
  }

  listUsers(): AppUser[] {
    return [...this.users];
  }

  deleteUsers(userIds: string[]): number {
    const ids = new Set(userIds);
    const before = this.users.length;
    this.users = this.users.filter((user) => !ids.has(user.id));
    this.tenures = this.tenures.filter((tenure) => !ids.has(tenure.userId));
    return before - this.users.length;
  }

  listTeamConferenceOverrides(): Record<string, string> {
    return Object.fromEntries(this.teamConferenceOverrides.entries());
  }

  saveTeamConference(teamId: string, conferenceId: string): void {
    this.teamConferenceOverrides.set(teamId, conferenceId);
  }

  listTenures(dynastyId: string): TeamTenure[] {
    return this.tenures.filter((tenure) => tenure.dynastyId === dynastyId);
  }

  saveTenure(tenure: TeamTenure): void {
    this.tenures = this.tenures.filter((item) => item.id !== tenure.id);
    this.tenures.unshift(tenure);
  }

  saveRosterImport(input: {
    dynastyId: string;
    team: Team;
    roster: Roster;
    sourceLabel: string;
    fixtureId?: string;
  }): RosterImportRecord {
    const record: RosterImportRecord = {
      id: randomUUID(),
      dynastyId: input.dynastyId,
      teamId: input.team.id,
      team: input.team,
      roster: input.roster,
      importedAt: new Date().toISOString(),
      sourceLabel: input.sourceLabel,
      fixtureId: input.fixtureId,
    };
    this.imports.unshift(record);
    return record;
  }

  listRosterImports(dynastyId: string): RosterImportRecord[] {
    return this.imports.filter((item) => item.dynastyId === dynastyId);
  }

  deleteRosterImportsForTeam(dynastyId: string, teamId: string): number {
    const before = this.imports.length;
    this.imports = this.imports.filter(
      (item) => item.dynastyId !== dynastyId || item.teamId !== teamId
    );
    return before - this.imports.length;
  }

  deleteRosterImportsForDynasty(dynastyId: string): number {
    const before = this.imports.length;
    this.imports = this.imports.filter((item) => item.dynastyId !== dynastyId);
    return before - this.imports.length;
  }

  deleteLatestRosterImportForTeam(dynastyId: string, teamId: string): number {
    const index = this.imports.findIndex(
      (item) => item.dynastyId === dynastyId && item.teamId === teamId
    );
    if (index === -1) return 0;
    this.imports.splice(index, 1);
    return 1;
  }

  recordPublishedBatch(payload: DynastySyncPayload, status: 'completed' | 'failed' = 'completed'): void {
    this.batches = this.batches.filter((batch) => batch.batchId !== payload.batchId);
    this.batches.unshift({
      batchId: payload.batchId,
      dynastyId: payload.dynastyId,
      uploadedByUserId: payload.uploadedByUserId,
      syncedAt: payload.syncedAt,
      status,
      createdAt: new Date().toISOString(),
    });
    this.payloads.set(payload.batchId, payload);
  }

  getDynastyState(dynastyId: string, defaultSeasonYear: number): CommissionerDynastyState {
    return (
      this.dynastyState.get(dynastyId) ?? DEFAULT_COMMISSIONER_DYNASTY_STATE(dynastyId, defaultSeasonYear)
    );
  }

  saveDynastyState(state: CommissionerDynastyState): void {
    this.dynastyState.set(state.dynastyId, state);
  }

  hasPublishedBatch(batchId: string): boolean {
    return this.batches.some((batch) => batch.batchId === batchId);
  }

  listPublishHistory(dynastyId: string, limit = 20): PublishedBatchRecord[] {
    return this.batches.filter((batch) => batch.dynastyId === dynastyId).slice(0, limit);
  }

  getLastPublishedPayload(dynastyId: string): DynastySyncPayload | null {
    const latest = this.batches.find(
      (batch) => batch.dynastyId === dynastyId && batch.status === 'completed'
    );
    return latest ? (this.payloads.get(latest.batchId) ?? null) : null;
  }

  listLeagues(): CommissionerLeague[] {
    return [...this.leagues].sort((a, b) => a.name.localeCompare(b.name));
  }

  getLeague(leagueId: string): CommissionerLeague | null {
    return this.leagues.find((league) => league.id === leagueId) ?? null;
  }

  createLeague(input: CreateCommissionerLeagueInput): CommissionerLeague {
    const now = new Date().toISOString();
    let id = input.id ?? leagueIdFromName(input.name);
    while (this.getLeague(id)) {
      id = `${id}-${randomUUID().slice(0, 8)}`;
    }

    const league: CommissionerLeague = {
      id,
      name: input.name.trim(),
      startingSeasonYear: input.startingSeasonYear,
      status: 'active',
      commissionerUserId: input.commissionerUserId,
      createdAt: now,
      updatedAt: now,
    };
    this.leagues.push(league);
    if (!this.dynastyState.has(id)) {
      this.saveDynastyState(DEFAULT_COMMISSIONER_DYNASTY_STATE(id, input.startingSeasonYear));
    }
    return league;
  }

  deleteLeague(leagueId: string): boolean {
    const index = this.leagues.findIndex((league) => league.id === leagueId);
    if (index === -1) return false;
    this.deleteDynastyScopedData(leagueId);
    this.leagues.splice(index, 1);
    if (this.getActiveLeagueId() === leagueId) {
      this.settings.delete(ACTIVE_LEAGUE_SETTING_KEY);
    }
    return true;
  }

  getActiveLeagueId(): string | null {
    return this.settings.get(ACTIVE_LEAGUE_SETTING_KEY) ?? null;
  }

  setActiveLeagueId(leagueId: string): void {
    if (!this.getLeague(leagueId)) {
      throw new Error(`Unknown league: ${leagueId}`);
    }
    this.settings.set(ACTIVE_LEAGUE_SETTING_KEY, leagueId);
  }

  deleteDynastyScopedData(dynastyId: string): void {
    this.tenures = this.tenures.filter((tenure) => tenure.dynastyId !== dynastyId);
    this.imports = this.imports.filter((item) => item.dynastyId !== dynastyId);
    this.batches = this.batches.filter((batch) => batch.dynastyId !== dynastyId);
    for (const [batchId, payload] of this.payloads.entries()) {
      if (payload.dynastyId === dynastyId) this.payloads.delete(batchId);
    }
    this.dynastyState.delete(dynastyId);
  }
}
