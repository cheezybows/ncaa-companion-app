import { randomUUID } from 'node:crypto';
import type { AppUser, IndexedFile, Roster, ScanSession, Team, TeamTenure } from '@ncaa/domain';
import type { DynastySyncPayload } from '@ncaa/sync';
import type { PublishedBatchRecord, RosterImportRecord } from './commissioner-repositories.js';

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

  upsertUsers(users: AppUser[]): void {
    const byId = new Map(this.users.map((user) => [user.id, user]));
    for (const user of users) byId.set(user.id, user);
    this.users = [...byId.values()];
  }

  listUsers(): AppUser[] {
    return [...this.users];
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
    this.imports = this.imports.filter((item) => item.teamId !== input.team.id);
    this.imports.unshift(record);
    return record;
  }

  listRosterImports(dynastyId: string): RosterImportRecord[] {
    return this.imports.filter((item) => item.dynastyId === dynastyId);
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
}
