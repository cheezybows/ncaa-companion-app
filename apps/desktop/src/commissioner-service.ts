import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  DEMO_DYNASTY_ID,
  DEMO_USERS,
  PLACEHOLDER_CONFERENCES,
  PLACEHOLDER_DYNASTY,
  PLACEHOLDER_PROGRESSION,
  PLACEHOLDER_ROSTERS,
  PLACEHOLDER_TEAMS,
} from '@ncaa/domain';
import type { AppUser, Roster, Team, TeamTenure } from '@ncaa/domain';
import type { Season } from '@ncaa/domain';
import { createSyncPayload, type DynastySyncPayload } from '@ncaa/sync';
import type { ScheduleCaptureImport } from '@ncaa/parsers';
import type {
  CommissionerRepository,
  PublishedBatchRecord,
  RosterImportRecord,
} from '@ncaa/storage';
import type { MemoryCommissionerRepository } from '@ncaa/storage/memory';

export type CommissionerStore = CommissionerRepository | MemoryCommissionerRepository;

const DEFAULT_API_URL = 'http://127.0.0.1:8787';
const COMMISSIONER_USER_ID = 'user-admin';

export function getHostedApiUrl(): string {
  return process.env.NCAA_API_URL ?? DEFAULT_API_URL;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getHostedApiUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hosted API ${response.status} ${path}: ${text}`);
  }
  return response.json() as Promise<T>;
}

export class CommissionerService {
  private scheduleImports: ScheduleCaptureImport[] = [];

  constructor(
    private store: CommissionerStore,
    private hostedStateMirrorPath?: string
  ) {}

  async writeHostedStateMirror(): Promise<void> {
    if (!this.hostedStateMirrorPath) return;
    const state = {
      updatedAt: new Date().toISOString(),
      users: this.listUsers(),
      teams: this.listTeams(),
      tenures: this.store.listTenures(DEMO_DYNASTY_ID),
      rosterImports: this.store.listRosterImports(DEMO_DYNASTY_ID),
      scheduleImports: this.scheduleImports,
      publishHistory: this.store.listPublishHistory(DEMO_DYNASTY_ID),
      lastPublishedPayload: this.store.getLastPublishedPayload(DEMO_DYNASTY_ID),
    };
    await mkdir(dirname(this.hostedStateMirrorPath), { recursive: true });
    await writeFile(this.hostedStateMirrorPath, JSON.stringify(state, null, 2));
  }

  async seedDemoUsers(): Promise<AppUser[]> {
    this.store.upsertUsers(
      DEMO_USERS.map((user) => ({
        ...user,
        accessStatus: user.accessStatus ?? 'active',
        passwordResetRequired: user.passwordResetRequired ?? false,
      }))
    );
    await this.writeHostedStateMirror();
    return this.listUsers();
  }

  async refreshUsers(): Promise<AppUser[]> {
    await this.seedDemoUsers();
    try {
      const users = await apiRequest<AppUser[]>('/users');
      this.store.upsertUsers(users.map((user) => ({ ...user, accessStatus: user.accessStatus ?? 'active' })));
      await this.writeHostedStateMirror();
      return this.listUsers();
    } catch {
      await this.writeHostedStateMirror();
      return this.listUsers();
    }
  }

  listUsers(): AppUser[] {
    const cached = this.store.listUsers();
    const byId = new Map<string, AppUser>(
      DEMO_USERS.map((user) => [user.id, { ...user, accessStatus: 'active' as const }])
    );
    for (const user of cached) {
      byId.set(user.id, { ...user, accessStatus: user.accessStatus ?? 'active' });
    }
    return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  listTeams(): Team[] {
    const byId = new Map<string, Team>(PLACEHOLDER_TEAMS.map((team) => [team.id, { ...team }]));
    for (const item of this.store.listRosterImports(DEMO_DYNASTY_ID)) {
      byId.set(item.teamId, { ...item.team });
    }

    const conferenceOverrides = this.store.listTeamConferenceOverrides();
    for (const [teamId, conferenceId] of Object.entries(conferenceOverrides)) {
      const team = byId.get(teamId);
      if (team) byId.set(teamId, { ...team, conferenceId });
    }

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async updateTeamConference(input: { teamId: string; conferenceId: string }): Promise<Team> {
    const team = this.listTeams().find((item) => item.id === input.teamId);
    if (!team) throw new Error(`Unknown team: ${input.teamId}`);
    if (!PLACEHOLDER_CONFERENCES.some((conference) => conference.id === input.conferenceId)) {
      throw new Error(`Unknown conference: ${input.conferenceId}`);
    }

    this.store.saveTeamConference(input.teamId, input.conferenceId);
    const updated = { ...team, conferenceId: input.conferenceId };
    await this.writeHostedStateMirror();
    return updated;
  }

  listCoaches(): AppUser[] {
    const cached = this.listUsers().filter(
      (user) => user.role === 'coach' && (user.accessStatus ?? 'active') === 'active'
    );
    if (cached.length > 0) return cached;
    return DEMO_USERS.filter((user) => user.role === 'coach');
  }

  async saveUser(input: {
    id?: string;
    email: string;
    displayName: string;
    role: AppUser['role'];
    accessStatus?: AppUser['accessStatus'];
    temporaryPassword?: string;
    passwordResetRequired?: boolean;
  }): Promise<AppUser> {
    const existing = input.id ? this.listUsers().find((user) => user.id === input.id) : undefined;
    const user: AppUser = {
      id: input.id || `user-${randomUUID()}`,
      email: input.email.trim(),
      displayName: input.displayName.trim(),
      role: input.role,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      accessStatus: input.accessStatus ?? existing?.accessStatus ?? 'active',
      temporaryPassword: input.temporaryPassword?.trim() || existing?.temporaryPassword,
      passwordUpdatedAt: input.temporaryPassword?.trim() ? new Date().toISOString() : existing?.passwordUpdatedAt,
      passwordResetRequired: input.passwordResetRequired ?? existing?.passwordResetRequired ?? false,
    };

    if (!user.email || !user.displayName) {
      throw new Error('Display name and email are required.');
    }

    this.store.upsertUsers([user]);
    await this.writeHostedStateMirror();
    return user;
  }

  listTenures(dynastyId = DEMO_DYNASTY_ID): TeamTenure[] {
    return this.store.listTenures(dynastyId);
  }

  async listAssignableTeams(dynastyId: string, userId: string): Promise<string[]> {
    try {
      const data = await apiRequest<{ teamIds: string[] }>(
        `/dynasties/${dynastyId}/assignable-teams?userId=${encodeURIComponent(userId)}`
      );
      const locallyAssigned = new Set(
        this.store
          .listTenures(dynastyId)
          .filter((tenure) => tenure.status === 'active')
          .map((tenure) => tenure.teamId)
      );
      return data.teamIds.filter((teamId) => !locallyAssigned.has(teamId));
    } catch {
      const occupied = new Set(
        this.store
          .listTenures(dynastyId)
          .filter((tenure) => tenure.status === 'active')
          .map((tenure) => tenure.teamId)
      );
      return this.listTeams().map((team) => team.id).filter((teamId) => !occupied.has(teamId));
    }
  }

  private archiveOtherActiveTenures(activeTenure: TeamTenure): void {
    const previousActiveTenures = this.store
      .listTenures(activeTenure.dynastyId)
      .filter(
        (tenure) =>
          tenure.userId === activeTenure.userId &&
          tenure.status === 'active' &&
          tenure.id !== activeTenure.id
      );

    for (const tenure of previousActiveTenures) {
      this.store.saveTenure({
        ...tenure,
        status: 'completed',
        endSeasonYear: activeTenure.startSeasonYear - 1,
        label: 'Archived after commissioner team change',
      });
    }
  }

  async assignTeam(input: {
    dynastyId: string;
    userId: string;
    teamId: string;
  }): Promise<TeamTenure> {
    let tenure: TeamTenure;
    try {
      tenure = await apiRequest<TeamTenure>(`/dynasties/${input.dynastyId}/team-assignments`, {
        method: 'POST',
        body: JSON.stringify({
          userId: input.userId,
          teamId: input.teamId,
          assignedByUserId: COMMISSIONER_USER_ID,
        }),
      });
    } catch {
      tenure = {
        id: randomUUID(),
        careerId: `career-${input.userId}`,
        userId: input.userId,
        dynastyId: input.dynastyId,
        teamId: input.teamId,
        role: 'coach',
        status: 'active',
        startSeasonYear: PLACEHOLDER_DYNASTY.currentSeasonYear,
        label: 'Assigned locally (API offline)',
      };
    }
    this.archiveOtherActiveTenures(tenure);
    this.store.saveTenure(tenure);
    await this.writeHostedStateMirror();
    return tenure;
  }

  saveRosterImport(input: {
    dynastyId: string;
    team: Team;
    roster: Roster;
    sourceLabel: string;
    fixtureId?: string;
  }): RosterImportRecord {
    const record = this.store.saveRosterImport(input);
    void this.writeHostedStateMirror();
    return record;
  }

  listRosterImports(dynastyId = DEMO_DYNASTY_ID): RosterImportRecord[] {
    return this.store.listRosterImports(dynastyId);
  }

  saveScheduleImport(imported: ScheduleCaptureImport): ScheduleCaptureImport {
    this.scheduleImports = [
      imported,
      ...this.scheduleImports.filter((item) => item.season.year !== imported.season.year),
    ];
    void this.writeHostedStateMirror();
    return imported;
  }

  listScheduleImports(): ScheduleCaptureImport[] {
    return [...this.scheduleImports];
  }

  private buildDynastyWithScheduleImports(): typeof PLACEHOLDER_DYNASTY {
    const seasonsByYear = new Map<number, Season>(
      PLACEHOLDER_DYNASTY.seasons.map((season) => [season.year, season])
    );

    for (const imported of this.scheduleImports) {
      seasonsByYear.set(imported.season.year, imported.season);
    }

    return {
      ...PLACEHOLDER_DYNASTY,
      currentSeasonYear: Math.max(
        PLACEHOLDER_DYNASTY.currentSeasonYear,
        ...Array.from(seasonsByYear.keys())
      ),
      seasons: Array.from(seasonsByYear.values()).sort((a, b) => a.year - b.year),
      updatedAt: new Date().toISOString(),
    };
  }

  buildPublishPayload(uploadedByUserId = COMMISSIONER_USER_ID): DynastySyncPayload {
    const imports = this.store.listRosterImports(DEMO_DYNASTY_ID);
    const teams = this.listTeams();
    const rosters: Record<string, Roster> = { ...PLACEHOLDER_ROSTERS };

    for (const item of imports) {
      rosters[item.teamId] = item.roster;
    }

    return createSyncPayload(
      uploadedByUserId,
      this.buildDynastyWithScheduleImports(),
      teams,
      rosters,
      PLACEHOLDER_PROGRESSION
    );
  }

  async publishToHosted(uploadedByUserId = COMMISSIONER_USER_ID): Promise<{
    payload: DynastySyncPayload;
    updated: boolean;
    batchId: string;
  }> {
    const payload = this.buildPublishPayload(uploadedByUserId);

    const response = await apiRequest<{ updated?: boolean; batch?: { id: string } }>(
      '/sync/batches',
      {
        method: 'POST',
        body: JSON.stringify({ payload }),
      }
    );

    this.store.recordPublishedBatch(payload);
    await this.writeHostedStateMirror();
    return {
      payload,
      updated: response.updated ?? true,
      batchId: response.batch?.id ?? payload.batchId,
    };
  }

  listPublishHistory(dynastyId = DEMO_DYNASTY_ID): PublishedBatchRecord[] {
    return this.store.listPublishHistory(dynastyId);
  }
}
