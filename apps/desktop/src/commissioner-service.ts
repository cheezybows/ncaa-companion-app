import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  DEMO_DYNASTY_ID,
  DEMO_USERS,
  PLACEHOLDER_CONFERENCES,
  PLACEHOLDER_DYNASTY,
  PLACEHOLDER_ROSTERS,
  PLACEHOLDER_TEAMS,
} from '@ncaa/domain';
import type {
  AppUser,
  ArchiveRevision,
  Dynasty,
  DynastyArchiveSummary,
  DynastyCheckpoint,
  PlayerCatalogEntry,
  PostseasonResult,
  RankingEntry,
  RankingSnapshot,
  Roster,
  ScheduleGame,
  Season,
  SeasonAdvanceAssignmentInput,
  SeasonAdvancePreview,
  SeasonAdvanceResult,
  SeasonStanding,
  Team,
  TeamRosterSnapshot,
  TeamTenure,
  WeekAdvancePreview,
  WeekAdvanceResult,
} from '@ncaa/domain';
import { createSyncPayload, type DynastySyncPayload } from '@ncaa/sync';
import type { ScheduleCaptureImport, Top25CaptureImport } from '@ncaa/parsers';
import type {
  CommissionerDynastyState,
  CommissionerLeague,
  CommissionerRepository,
  CreateCommissionerLeagueInput,
  PublishedBatchRecord,
  RosterImportRecord,
} from '@ncaa/storage';
import type { MemoryCommissionerRepository } from '@ncaa/storage/memory';
import {
  applyTenureUpdatesForSeasonAdvance,
  buildDefaultSeasonAdvanceAssignments,
  buildRosterSnapshotsForSeason,
  buildSeasonAdvancePreview,
  getScheduleImportTeamId,
  mergeTeamScheduleIntoSeason,
  resolveActiveTeamForAssignment,
  rosterMapFromImports,
} from './season-advance.js';
import { getLatestRosterForTeam, mergeTeamRosters } from './roster-merge.js';
import {
  applyPostseasonAchievementsToSeason,
  buildCoachTeamArchiveBuckets,
  buildDynastyCheckpoint,
  buildWeekAdvancePreview,
  collectAllProgressionSnapshots,
  enrichProgressionNames,
  getLatestWeekForSeason,
  getNextWeekNumber,
  progressionFromSnapshots,
  updatePlayerCatalogFromRosters,
} from './checkpoint-advance.js';

export type CommissionerStore = CommissionerRepository | MemoryCommissionerRepository;

type TeamImportDeletionStore = {
  deleteRosterImportsForTeam(dynastyId: string, teamId: string): number;
  deleteRosterImportsForDynasty(dynastyId: string): number;
  deleteLatestRosterImportForTeam(dynastyId: string, teamId: string): number;
};

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

function calculateStandings(games: ScheduleGame[]): SeasonStanding[] {
  const standings = new Map<string, SeasonStanding>();
  const ensure = (teamId: string) => {
    const existing = standings.get(teamId);
    if (existing) return existing;
    const next = { teamId, wins: 0, losses: 0 };
    standings.set(teamId, next);
    return next;
  };

  for (const game of games) {
    if (game.isBye) continue;
    ensure(game.homeTeamId);
    ensure(game.awayTeamId);
    if (!game.isPlayed || game.homeScore === undefined || game.awayScore === undefined) continue;

    const home = ensure(game.homeTeamId);
    const away = ensure(game.awayTeamId);
    if (game.homeScore > game.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (game.awayScore > game.homeScore) {
      away.wins += 1;
      home.losses += 1;
    }
  }

  return [...standings.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
}

type DynastyStateStore = {
  getDynastyState(dynastyId: string, defaultSeasonYear: number): CommissionerDynastyState;
  saveDynastyState(state: CommissionerDynastyState): void;
};

type LeagueStore = {
  listLeagues(): CommissionerLeague[];
  getLeague(leagueId: string): CommissionerLeague | null;
  createLeague(input: CreateCommissionerLeagueInput): CommissionerLeague;
  deleteLeague(leagueId: string): boolean;
  getActiveLeagueId(): string | null;
  setActiveLeagueId(leagueId: string): void;
};

export interface CommissionerConfig {
  apiUrl: string;
  dynastyId: string;
  leagueName: string;
  startingSeasonYear: number;
  commissionerUserId: string;
  hostedStateMirrorPath?: string;
}

export class CommissionerService {
  private dynastyState: CommissionerDynastyState;
  private activeLeagueId: string;

  constructor(
    private store: CommissionerStore,
    private hostedStateMirrorPath?: string
  ) {
    this.activeLeagueId = this.ensureBootstrappedLeagues();
    this.dynastyState = this.readDynastyStateFromStore();
  }

  private getLeagueStore(): LeagueStore {
    const store = this.store as CommissionerStore & Partial<LeagueStore>;
    if (
      typeof store.listLeagues !== 'function' ||
      typeof store.createLeague !== 'function' ||
      typeof store.getActiveLeagueId !== 'function' ||
      typeof store.setActiveLeagueId !== 'function'
    ) {
      throw new Error('League management is not available in this storage backend.');
    }
    return store as LeagueStore;
  }

  private ensureBootstrappedLeagues(): string {
    const store = this.store as CommissionerStore & Partial<LeagueStore>;
    if (typeof store.listLeagues !== 'function') return DEMO_DYNASTY_ID;

    const leagues = store.listLeagues();
    if (leagues.length === 0) {
      store.createLeague!({
        id: DEMO_DYNASTY_ID,
        name: PLACEHOLDER_DYNASTY.name,
        startingSeasonYear: PLACEHOLDER_DYNASTY.currentSeasonYear,
        commissionerUserId: COMMISSIONER_USER_ID,
      });
      store.setActiveLeagueId!(DEMO_DYNASTY_ID);
    } else if (!store.getActiveLeagueId?.()) {
      store.setActiveLeagueId!(leagues[0]!.id);
    }

    return store.getActiveLeagueId?.() ?? DEMO_DYNASTY_ID;
  }

  getActiveDynastyId(): string {
    return this.activeLeagueId;
  }

  getActiveLeague(): CommissionerLeague | null {
    const store = this.store as CommissionerStore & Partial<LeagueStore>;
    if (typeof store.getLeague !== 'function') return null;
    return store.getLeague(this.getActiveDynastyId());
  }

  getCommissionerConfig(): CommissionerConfig {
    const league = this.getActiveLeague();
    return {
      apiUrl: getHostedApiUrl(),
      dynastyId: this.getActiveDynastyId(),
      leagueName: league?.name ?? PLACEHOLDER_DYNASTY.name,
      startingSeasonYear: league?.startingSeasonYear ?? this.dynastyState.currentSeasonYear,
      commissionerUserId: league?.commissionerUserId ?? COMMISSIONER_USER_ID,
      hostedStateMirrorPath: this.hostedStateMirrorPath,
    };
  }

  listLeagues(): CommissionerLeague[] {
    return this.getLeagueStore().listLeagues();
  }

  async createLeague(input: {
    name: string;
    startingSeasonYear: number;
    selfUser: {
      displayName: string;
      email: string;
      temporaryPassword?: string;
    };
  }): Promise<{ league: CommissionerLeague; user: AppUser }> {
    const trimmedName = input.name.trim();
    if (!trimmedName) throw new Error('League name is required.');
    if (!Number.isFinite(input.startingSeasonYear)) {
      throw new Error('Starting year is required.');
    }
    if (!input.selfUser.displayName.trim() || !input.selfUser.email.trim()) {
      throw new Error('Self user display name and email are required.');
    }

    const user = await this.saveUser({
      email: input.selfUser.email,
      displayName: input.selfUser.displayName,
      role: 'admin',
      temporaryPassword: input.selfUser.temporaryPassword,
      passwordResetRequired: Boolean(input.selfUser.temporaryPassword?.trim()),
    });

    const league = this.getLeagueStore().createLeague({
      name: trimmedName,
      startingSeasonYear: input.startingSeasonYear,
      commissionerUserId: user.id,
    });
    await this.switchActiveLeague(league.id);
    return { league, user };
  }

  async switchActiveLeague(leagueId: string): Promise<CommissionerLeague> {
    const leagueStore = this.getLeagueStore();
    const league = leagueStore.getLeague(leagueId);
    if (!league) throw new Error(`Unknown league: ${leagueId}`);

    this.persistDynastyState();
    leagueStore.setActiveLeagueId(leagueId);
    this.activeLeagueId = leagueId;
    this.dynastyState = this.readDynastyStateFromStore();
    await this.writeHostedStateMirror();
    return league;
  }

  async deleteLeague(leagueId: string): Promise<void> {
    const leagueStore = this.getLeagueStore();
    const leagues = leagueStore.listLeagues();
    if (leagues.length <= 1) {
      throw new Error('At least one league must remain on this machine.');
    }
    if (!leagueStore.getLeague(leagueId)) {
      throw new Error(`Unknown league: ${leagueId}`);
    }

    const wasActive = this.getActiveDynastyId() === leagueId;
    const deleted = leagueStore.deleteLeague(leagueId);
    if (!deleted) throw new Error(`Failed to delete league: ${leagueId}`);

    if (wasActive) {
      const nextLeague = leagueStore.listLeagues()[0];
      if (!nextLeague) throw new Error('No leagues remain after delete.');
      await this.switchActiveLeague(nextLeague.id);
    } else {
      await this.writeHostedStateMirror();
    }
  }

  private defaultSeasonYearForDynasty(dynastyId: string): number {
    const league = (this.store as CommissionerStore & Partial<LeagueStore>).getLeague?.(dynastyId);
    return league?.startingSeasonYear ?? PLACEHOLDER_DYNASTY.currentSeasonYear;
  }

  private readDynastyStateFromStore(): CommissionerDynastyState {
    const dynastyId = this.getActiveDynastyId();
    const store = this.store as CommissionerStore & Partial<DynastyStateStore>;
    if (typeof store.getDynastyState === 'function') {
      return store.getDynastyState(dynastyId, this.defaultSeasonYearForDynasty(dynastyId));
    }
    return {
      dynastyId,
      currentSeasonYear: this.defaultSeasonYearForDynasty(dynastyId),
      archivedSeasons: [],
      archivedRankings: [],
      teamRosterSnapshots: [],
      checkpoints: [],
      playerCatalog: [],
      postseasonResults: [],
      scheduleImports: [],
      top25Imports: [],
    };
  }

  private persistDynastyState(): void {
    const store = this.store as CommissionerStore & Partial<DynastyStateStore>;
    if (typeof store.saveDynastyState === 'function') {
      store.saveDynastyState(this.dynastyState);
    }
  }

  async loadHostedStateMirror(): Promise<void> {
    if (!this.hostedStateMirrorPath) return;
    try {
      const raw = await readFile(this.hostedStateMirrorPath, 'utf8');
      const parsed = JSON.parse(raw) as {
        scheduleImports?: ScheduleCaptureImport[];
        top25Imports?: Top25CaptureImport[];
        dynastyState?: CommissionerDynastyState;
        currentSeasonYear?: number;
        archivedSeasons?: Season[];
        archivedRankings?: RankingSnapshot[];
        teamRosterSnapshots?: TeamRosterSnapshot[];
        checkpoints?: DynastyCheckpoint[];
        playerCatalog?: PlayerCatalogEntry[];
        postseasonResults?: PostseasonResult[];
      };

      if (parsed.dynastyState) {
        this.dynastyState = parsed.dynastyState;
      } else {
        this.dynastyState = {
          ...this.dynastyState,
          currentSeasonYear: parsed.currentSeasonYear ?? this.dynastyState.currentSeasonYear,
          archivedSeasons: parsed.archivedSeasons ?? this.dynastyState.archivedSeasons,
          archivedRankings: parsed.archivedRankings ?? this.dynastyState.archivedRankings,
          teamRosterSnapshots: parsed.teamRosterSnapshots ?? this.dynastyState.teamRosterSnapshots,
          checkpoints: parsed.checkpoints ?? this.dynastyState.checkpoints,
          playerCatalog: parsed.playerCatalog ?? this.dynastyState.playerCatalog,
          postseasonResults: parsed.postseasonResults ?? this.dynastyState.postseasonResults,
          scheduleImports: parsed.scheduleImports ?? this.dynastyState.scheduleImports,
          top25Imports: parsed.top25Imports ?? this.dynastyState.top25Imports,
        };
      }
      this.persistDynastyState();
    } catch {
      // Mirror may not exist on first launch.
    }
  }

  getCurrentSeasonYear(): number {
    return this.dynastyState.currentSeasonYear;
  }

  async writeHostedStateMirror(): Promise<void> {
    if (!this.hostedStateMirrorPath) return;
    const state = {
      updatedAt: new Date().toISOString(),
      users: this.listUsers(),
      teams: this.listTeams(),
      tenures: this.store.listTenures(this.getActiveDynastyId()),
      rosterImports: this.store.listRosterImports(this.getActiveDynastyId()),
      dynastyState: this.dynastyState,
      scheduleImports: this.dynastyState.scheduleImports,
      top25Imports: this.dynastyState.top25Imports,
      currentSeasonYear: this.dynastyState.currentSeasonYear,
      archivedSeasons: this.dynastyState.archivedSeasons,
      archivedRankings: this.dynastyState.archivedRankings,
      teamRosterSnapshots: this.dynastyState.teamRosterSnapshots,
      checkpoints: this.dynastyState.checkpoints,
      playerCatalog: this.dynastyState.playerCatalog,
      postseasonResults: this.dynastyState.postseasonResults,
      publishHistory: this.store.listPublishHistory(this.getActiveDynastyId()),
      lastPublishedPayload: this.store.getLastPublishedPayload(this.getActiveDynastyId()),
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
    for (const item of this.store.listRosterImports(this.getActiveDynastyId())) {
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

  listTenures(dynastyId?: string): TeamTenure[] {
    dynastyId = dynastyId ?? this.getActiveDynastyId();
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
        startSeasonYear: this.getCurrentSeasonYear(),
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
    const imports = this.store.listRosterImports(input.dynastyId);
    const existing = getLatestRosterForTeam(imports, input.team.id);
    const merged = mergeTeamRosters(existing, {
      ...input.roster,
      teamId: input.team.id,
      players: input.roster.players.map((player) => ({ ...player, teamId: input.team.id })),
    });
    const record = this.store.saveRosterImport({ ...input, roster: merged });
    void this.writeHostedStateMirror();
    return record;
  }

  listRosterImports(dynastyId?: string): RosterImportRecord[] {
    dynastyId = dynastyId ?? this.getActiveDynastyId();
    return this.store.listRosterImports(dynastyId);
  }

  async saveManualRoster(input: {
    dynastyId: string;
    teamId: string;
    roster: Roster;
  }): Promise<RosterImportRecord> {
    const team = this.listTeams().find((item) => item.id === input.teamId) ?? {
      id: input.teamId,
      name: input.teamId,
      abbreviation: input.teamId,
    };
    const imports = this.store.listRosterImports(input.dynastyId);
    const record = this.store.saveRosterImport({
      dynastyId: input.dynastyId,
      team,
      roster: mergeTeamRosters(getLatestRosterForTeam(imports, input.teamId), {
        ...input.roster,
        teamId: input.teamId,
        players: input.roster.players.map((player) => ({ ...player, teamId: input.teamId })),
        updatedAt: new Date().toISOString(),
      }),
      sourceLabel: 'Manual roster edit',
    });
    await this.writeHostedStateMirror();
    return record;
  }

  saveScheduleImport(imported: ScheduleCaptureImport): ScheduleCaptureImport {
    const importedTeamId = this.getScheduleImportTeamId(imported);
    this.dynastyState = {
      ...this.dynastyState,
      scheduleImports: [
        { ...imported, teamId: importedTeamId },
        ...this.dynastyState.scheduleImports.filter(
          (item) =>
            item.season.year !== imported.season.year ||
            this.getScheduleImportTeamId(item) !== importedTeamId
        ),
      ],
    };
    this.persistDynastyState();
    void this.writeHostedStateMirror();
    return imported;
  }

  listScheduleImports(): ScheduleCaptureImport[] {
    return [...this.dynastyState.scheduleImports];
  }

  async saveManualSchedule(input: {
    dynastyId: string;
    teamId: string;
    schedule: ScheduleGame[];
  }): Promise<ScheduleCaptureImport> {
    const seasonYear = this.getCurrentSeasonYear();
    const team = this.listTeams().find((item) => item.id === input.teamId);
    const imported: ScheduleCaptureImport = {
      teamId: input.teamId,
      fixtureId: `manual-schedule-${input.teamId}-${seasonYear}`,
      partial: false,
      sourceLabel: 'Manual schedule edit',
      season: {
        id: `season-${seasonYear}`,
        dynastyId: input.dynastyId,
        year: seasonYear,
        label: `${seasonYear} ${team?.name ?? input.teamId} Schedule`,
        schedule: input.schedule.map((game) => ({ ...game, seasonId: `season-${seasonYear}` })),
        standings: calculateStandings(input.schedule),
      },
    };
    const saved = this.saveScheduleImport(imported);
    await this.writeHostedStateMirror();
    return saved;
  }

  saveTop25Import(imported: Top25CaptureImport): Top25CaptureImport {
    this.dynastyState = {
      ...this.dynastyState,
      top25Imports: [
        imported,
        ...this.dynastyState.top25Imports.filter(
          (item) =>
            item.rankings.seasonYear !== imported.rankings.seasonYear ||
            item.rankings.pollType !== imported.rankings.pollType
        ),
      ],
    };
    this.persistDynastyState();
    void this.writeHostedStateMirror();
    return imported;
  }

  listTop25Imports(): Top25CaptureImport[] {
    return [...this.dynastyState.top25Imports];
  }

  async clearTeamImports(input: { dynastyId: string; teamId: string }): Promise<{
    removedRosterImports: number;
    removedScheduleImports: number;
  }> {
    const store = this.store as CommissionerStore & Partial<TeamImportDeletionStore>;
    const removedRosterImports =
      typeof store.deleteRosterImportsForTeam === 'function'
        ? store.deleteRosterImportsForTeam(input.dynastyId, input.teamId)
        : 0;
    const beforeScheduleCount = this.dynastyState.scheduleImports.length;
    this.dynastyState = {
      ...this.dynastyState,
      scheduleImports: this.dynastyState.scheduleImports.filter((item) => {
        const importTeamId = this.getScheduleImportTeamId(item);
        if (importTeamId === input.teamId) return false;
        return !item.season.schedule.some(
          (game) => game.homeTeamId === input.teamId || game.awayTeamId === input.teamId
        );
      }),
    };
    const removedScheduleImports = beforeScheduleCount - this.dynastyState.scheduleImports.length;
    this.persistDynastyState();
    await this.writeHostedStateMirror();
    return { removedRosterImports, removedScheduleImports };
  }

  async clearAllImports(input: { dynastyId: string }): Promise<{
    removedRosterImports: number;
    removedScheduleImports: number;
    removedTop25Imports: number;
  }> {
    const store = this.store as CommissionerStore & Partial<TeamImportDeletionStore>;
    const removedRosterImports =
      typeof store.deleteRosterImportsForDynasty === 'function'
        ? store.deleteRosterImportsForDynasty(input.dynastyId)
        : 0;
    const removedScheduleImports = this.dynastyState.scheduleImports.length;
    const removedTop25Imports = this.dynastyState.top25Imports.length;
    this.dynastyState = {
      ...this.dynastyState,
      scheduleImports: [],
      top25Imports: [],
    };
    this.persistDynastyState();
    await this.writeHostedStateMirror();
    return { removedRosterImports, removedScheduleImports, removedTop25Imports };
  }

  async undoLatestRosterImport(input: { dynastyId: string; teamId: string }): Promise<{
    removedRosterImports: number;
  }> {
    const store = this.store as CommissionerStore & Partial<TeamImportDeletionStore>;
    const removedRosterImports =
      typeof store.deleteLatestRosterImportForTeam === 'function'
        ? store.deleteLatestRosterImportForTeam(input.dynastyId, input.teamId)
        : 0;
    await this.writeHostedStateMirror();
    return { removedRosterImports };
  }

  async undoLatestScheduleImport(input: { teamId: string }): Promise<{
    removedScheduleImports: number;
  }> {
    const index = this.dynastyState.scheduleImports.findIndex((item) => {
      const importTeamId = this.getScheduleImportTeamId(item);
      if (importTeamId === input.teamId) return true;
      return item.season.schedule.some(
        (game) => game.homeTeamId === input.teamId || game.awayTeamId === input.teamId
      );
    });
    if (index === -1) return { removedScheduleImports: 0 };
    this.dynastyState = {
      ...this.dynastyState,
      scheduleImports: this.dynastyState.scheduleImports.filter((_, itemIndex) => itemIndex !== index),
    };
    this.persistDynastyState();
    await this.writeHostedStateMirror();
    return { removedScheduleImports: 1 };
  }

  async saveManualTop25(input: {
    dynastyId: string;
    entries: RankingEntry[];
  }): Promise<Top25CaptureImport> {
    const seasonYear = this.getCurrentSeasonYear();
    const imported: Top25CaptureImport = {
      fixtureId: `manual-top25-${seasonYear}`,
      partial: false,
      sourceLabel: 'Manual Top 25 edit',
      rankings: {
        id: `rankings-top25-${seasonYear}`,
        dynastyId: input.dynastyId,
        seasonYear,
        pollType: 'top25',
        capturedAt: new Date().toISOString(),
        sourceLabel: 'Manual Top 25 edit',
        entries: input.entries,
      },
    };
    const saved = this.saveTop25Import(imported);
    await this.writeHostedStateMirror();
    return saved;
  }

  previewWeekAdvance(): WeekAdvancePreview {
    return buildWeekAdvancePreview({
      dynastyId: this.getActiveDynastyId(),
      currentSeasonYear: this.getCurrentSeasonYear(),
      checkpoints: this.dynastyState.checkpoints,
      scheduleImports: this.dynastyState.scheduleImports,
      top25Imports: this.dynastyState.top25Imports,
      rosterByTeamId: rosterMapFromImports(this.store.listRosterImports(this.getActiveDynastyId())),
      postseasonResults: this.dynastyState.postseasonResults,
    });
  }

  async advanceToNextWeek(): Promise<WeekAdvanceResult> {
    const seasonYear = this.getCurrentSeasonYear();
    const week = getNextWeekNumber(this.dynastyState.checkpoints, seasonYear);
    const rosterByTeamId = rosterMapFromImports(this.store.listRosterImports(this.getActiveDynastyId()));

    if (rosterByTeamId.size === 0) {
      throw new Error('Import at least one roster before advancing the week.');
    }

    const checkpoint = buildDynastyCheckpoint({
      dynastyId: this.getActiveDynastyId(),
      seasonYear,
      week,
      type: 'weekly',
      rosterByTeamId,
      scheduleImports: this.dynastyState.scheduleImports,
      archivedSeasons: this.dynastyState.archivedSeasons,
      archivedRankings: this.dynastyState.archivedRankings,
      top25Imports: this.dynastyState.top25Imports,
      postseasonResults: this.dynastyState.postseasonResults,
      applyRankingSnapshotsToSeason: (season, rankings) =>
        this.applyRankingSnapshotsToSeason(season, rankings),
    });

    const priorSnapshots = collectAllProgressionSnapshots(this.dynastyState.checkpoints);
    const progressionSnapshots = collectAllProgressionSnapshots([
      ...this.dynastyState.checkpoints,
      checkpoint,
    ]);

    this.dynastyState = {
      ...this.dynastyState,
      checkpoints: [...this.dynastyState.checkpoints, checkpoint],
      teamRosterSnapshots: [
        ...this.dynastyState.teamRosterSnapshots,
        ...checkpoint.rosterSnapshots,
      ],
      playerCatalog: updatePlayerCatalogFromRosters({
        catalog: this.dynastyState.playerCatalog,
        priorRosterSnapshots: checkpoint.rosterSnapshots,
        nextRosterSnapshots: checkpoint.rosterSnapshots,
        seasonYear,
      }),
    };
    this.persistDynastyState();
    await this.writeHostedStateMirror();

    void priorSnapshots;
    return {
      seasonYear,
      week,
      checkpointId: checkpoint.id,
      rosterSnapshots: checkpoint.rosterSnapshots.length,
      progressionSnapshots: progressionSnapshots.length - priorSnapshots.length,
    };
  }

  getDynastyArchiveSummary(): DynastyArchiveSummary {
    const currentWeek = getLatestWeekForSeason(
      this.dynastyState.checkpoints,
      this.getCurrentSeasonYear()
    );
    return {
      currentSeasonYear: this.getCurrentSeasonYear(),
      currentWeek,
      checkpointCount: this.dynastyState.checkpoints.length,
      archivedSeasonCount: this.dynastyState.archivedSeasons.length,
      playerCatalogCount: this.dynastyState.playerCatalog.length,
      postseasonResultCount: this.dynastyState.postseasonResults.length,
      checkpoints: [...this.dynastyState.checkpoints].sort((a, b) => {
        const seasonDiff = b.seasonYear - a.seasonYear;
        if (seasonDiff !== 0) return seasonDiff;
        return b.week - a.week;
      }),
      playerCatalog: this.dynastyState.playerCatalog,
      postseasonResults: this.dynastyState.postseasonResults,
      coachArchiveBuckets: buildCoachTeamArchiveBuckets({
        tenures: this.listTenures(this.getActiveDynastyId()),
        users: this.listUsers(),
        teams: this.listTeams(),
        checkpoints: this.dynastyState.checkpoints,
      }),
    };
  }

  listPostseasonResults(seasonYear?: number): PostseasonResult[] {
    if (seasonYear === undefined) return [...this.dynastyState.postseasonResults];
    return this.dynastyState.postseasonResults.filter((item) => item.seasonYear === seasonYear);
  }

  async savePostseasonResult(input: Omit<PostseasonResult, 'id' | 'dynastyId'> & { id?: string }): Promise<PostseasonResult> {
    const record: PostseasonResult = {
      ...input,
      id: input.id ?? randomUUID(),
      dynastyId: this.getActiveDynastyId(),
      revision: {
        revision: 1,
        updatedAt: new Date().toISOString(),
        updatedByUserId: COMMISSIONER_USER_ID,
      },
    };

    this.dynastyState = {
      ...this.dynastyState,
      postseasonResults: [
        record,
        ...this.dynastyState.postseasonResults.filter((item) => item.id !== record.id),
      ],
    };
    this.persistDynastyState();
    await this.writeHostedStateMirror();
    return record;
  }

  async deletePostseasonResult(id: string): Promise<void> {
    this.dynastyState = {
      ...this.dynastyState,
      postseasonResults: this.dynastyState.postseasonResults.filter((item) => item.id !== id),
    };
    this.persistDynastyState();
    await this.writeHostedStateMirror();
  }

  async updateCheckpoint(input: {
    checkpointId: string;
    notes?: string;
    scheduleSnapshot?: DynastyCheckpoint['scheduleSnapshot'];
    rankingSnapshot?: RankingSnapshot;
    correctionReason?: string;
  }): Promise<DynastyCheckpoint> {
    const index = this.dynastyState.checkpoints.findIndex((item) => item.id === input.checkpointId);
    if (index === -1) throw new Error(`Unknown checkpoint: ${input.checkpointId}`);

    const existing = this.dynastyState.checkpoints[index];
    const revision: ArchiveRevision = {
      revision: (existing.revision?.revision ?? 0) + 1,
      updatedAt: new Date().toISOString(),
      updatedByUserId: COMMISSIONER_USER_ID,
      correctionReason: input.correctionReason,
    };

    const updated: DynastyCheckpoint = {
      ...existing,
      notes: input.notes ?? existing.notes,
      scheduleSnapshot: input.scheduleSnapshot ?? existing.scheduleSnapshot,
      rankingSnapshot: input.rankingSnapshot ?? existing.rankingSnapshot,
      revision,
    };

    const checkpoints = [...this.dynastyState.checkpoints];
    checkpoints[index] = updated;
    this.dynastyState = { ...this.dynastyState, checkpoints };
    this.persistDynastyState();
    await this.writeHostedStateMirror();
    return updated;
  }

  async updateCheckpointRoster(input: {
    checkpointId: string;
    teamId: string;
    roster: Roster;
    correctionReason?: string;
  }): Promise<DynastyCheckpoint> {
    const index = this.dynastyState.checkpoints.findIndex((item) => item.id === input.checkpointId);
    if (index === -1) throw new Error(`Unknown checkpoint: ${input.checkpointId}`);

    const existing = this.dynastyState.checkpoints[index];
    const rosterSnapshots = existing.rosterSnapshots.map((snapshot) =>
      snapshot.teamId === input.teamId
        ? {
            ...snapshot,
            roster: {
              ...input.roster,
              teamId: input.teamId,
              players: input.roster.players.map((player) => ({ ...player, teamId: input.teamId })),
              updatedAt: new Date().toISOString(),
            },
            archivedAt: new Date().toISOString(),
          }
        : snapshot
    );

    const updated: DynastyCheckpoint = {
      ...existing,
      rosterSnapshots,
      revision: {
        revision: (existing.revision?.revision ?? 0) + 1,
        updatedAt: new Date().toISOString(),
        updatedByUserId: COMMISSIONER_USER_ID,
        correctionReason: input.correctionReason,
      },
    };

    const checkpoints = [...this.dynastyState.checkpoints];
    checkpoints[index] = updated;
    this.dynastyState = {
      ...this.dynastyState,
      checkpoints,
      playerCatalog: updatePlayerCatalogFromRosters({
        catalog: this.dynastyState.playerCatalog,
        priorRosterSnapshots: rosterSnapshots,
        nextRosterSnapshots: rosterSnapshots,
        seasonYear: existing.seasonYear,
      }),
    };
    this.persistDynastyState();
    await this.writeHostedStateMirror();
    return updated;
  }

  async updatePlayerCatalogEntry(input: {
    playerId: string;
    exitStatus?: PlayerCatalogEntry['exitStatus'];
    exitSeasonYear?: number;
    exitTeamId?: string;
    correctionReason?: string;
  }): Promise<PlayerCatalogEntry> {
    const index = this.dynastyState.playerCatalog.findIndex((item) => item.playerId === input.playerId);
    if (index === -1) throw new Error(`Unknown player catalog entry: ${input.playerId}`);

    const existing = this.dynastyState.playerCatalog[index];
    const updated: PlayerCatalogEntry = {
      ...existing,
      exitStatus: input.exitStatus ?? existing.exitStatus,
      exitSeasonYear: input.exitSeasonYear ?? existing.exitSeasonYear,
      exitTeamId: input.exitTeamId ?? existing.exitTeamId,
      revision: {
        revision: (existing.revision?.revision ?? 0) + 1,
        updatedAt: new Date().toISOString(),
        updatedByUserId: COMMISSIONER_USER_ID,
        correctionReason: input.correctionReason,
      },
    };

    const playerCatalog = [...this.dynastyState.playerCatalog];
    playerCatalog[index] = updated;
    this.dynastyState = { ...this.dynastyState, playerCatalog };
    this.persistDynastyState();
    await this.writeHostedStateMirror();
    return updated;
  }

  previewSeasonAdvance(assignments?: SeasonAdvanceAssignmentInput[]): SeasonAdvancePreview {
    const activeTenures = this.listTenures(this.getActiveDynastyId()).filter((tenure) => tenure.status === 'active');
    const resolvedAssignments =
      assignments ??
      buildDefaultSeasonAdvanceAssignments(activeTenures, this.listCoaches(), this.listTeams());

    return buildSeasonAdvancePreview({
      currentSeasonYear: this.getCurrentSeasonYear(),
      assignments: resolvedAssignments,
      scheduleImports: this.dynastyState.scheduleImports,
      archivedRankings: this.dynastyState.archivedRankings,
      top25Imports: this.dynastyState.top25Imports,
      rosterByTeamId: rosterMapFromImports(this.store.listRosterImports(this.getActiveDynastyId())),
      teams: this.listTeams(),
      applyRankingSnapshotsToSeason: (season, rankings) =>
        this.applyRankingSnapshotsToSeason(season, rankings),
    });
  }

  async advanceToNextSeason(assignments: SeasonAdvanceAssignmentInput[]): Promise<SeasonAdvanceResult> {
    const preview = this.previewSeasonAdvance(assignments);
    if (preview.validationErrors.length > 0) {
      throw new Error(preview.validationErrors.join(' '));
    }

    const currentSeasonYear = preview.currentSeasonYear;
    const nextSeasonYear = preview.nextSeasonYear;
    const rosterByTeam = rosterMapFromImports(this.store.listRosterImports(this.getActiveDynastyId()));
    const teamsById = new Map(this.listTeams().map((team) => [team.id, team]));

    const activeTeamIds = new Set<string>();
    for (const assignment of assignments) {
      const teamId = resolveActiveTeamForAssignment(assignment);
      if (teamId) activeTeamIds.add(teamId);
    }

    let rostersCarriedForward = 0;
    for (const teamId of activeTeamIds) {
      const roster = rosterByTeam.get(teamId);
      if (!roster) continue;
      const team = teamsById.get(teamId) ?? { id: teamId, name: teamId, abbreviation: teamId };
      this.store.saveRosterImport({
        dynastyId: this.getActiveDynastyId(),
        team,
        roster,
        sourceLabel: `Carried forward from ${currentSeasonYear}`,
      });
      rostersCarriedForward += 1;
    }

    const tenureUpdates = applyTenureUpdatesForSeasonAdvance({
      assignments,
      tenures: this.listTenures(this.getActiveDynastyId()),
      currentSeasonYear,
      nextSeasonYear,
    });
    for (const tenure of tenureUpdates.updated) {
      if (tenure.status === 'active') {
        this.archiveOtherActiveTenures(tenure);
      }
      this.store.saveTenure(tenure);
    }

    const rankingsToArchive = this.dynastyState.top25Imports.map((item) => item.rankings);

    const finalWeek =
      getLatestWeekForSeason(this.dynastyState.checkpoints, currentSeasonYear) ?? 0;
    const seasonFinalCheckpoint = buildDynastyCheckpoint({
      dynastyId: this.getActiveDynastyId(),
      seasonYear: currentSeasonYear,
      week: finalWeek + 1,
      type: 'season_final',
      rosterByTeamId: rosterByTeam,
      scheduleImports: this.dynastyState.scheduleImports,
      archivedSeasons: this.dynastyState.archivedSeasons,
      archivedRankings: this.dynastyState.archivedRankings,
      top25Imports: this.dynastyState.top25Imports,
      postseasonResults: this.dynastyState.postseasonResults,
      applyRankingSnapshotsToSeason: (season, rankings) =>
        this.applyRankingSnapshotsToSeason(season, rankings),
      notes: `Season ${currentSeasonYear} final archive`,
    });

    const archivedSeasonWithAchievements = applyPostseasonAchievementsToSeason(
      preview.archivedSeason,
      this.dynastyState.postseasonResults
    );

    const priorFinalSnapshots = seasonFinalCheckpoint.rosterSnapshots;
    const nextSeasonSnapshots = buildRosterSnapshotsForSeason(
      nextSeasonYear,
      activeTeamIds,
      rosterByTeam,
      `Opening roster for ${nextSeasonYear}`
    );
    const updatedCatalog = updatePlayerCatalogFromRosters({
      catalog: this.dynastyState.playerCatalog,
      priorRosterSnapshots: priorFinalSnapshots,
      nextRosterSnapshots: nextSeasonSnapshots,
      seasonYear: nextSeasonYear,
    });

    this.dynastyState = {
      ...this.dynastyState,
      currentSeasonYear: nextSeasonYear,
      checkpoints: [...this.dynastyState.checkpoints, seasonFinalCheckpoint],
      archivedSeasons: [
        ...this.dynastyState.archivedSeasons.filter((season) => season.year !== currentSeasonYear),
        archivedSeasonWithAchievements,
      ].sort((a, b) => a.year - b.year),
      archivedRankings: [...this.dynastyState.archivedRankings, ...rankingsToArchive],
      teamRosterSnapshots: [
        ...this.dynastyState.teamRosterSnapshots.filter(
          (snapshot) => snapshot.seasonYear !== currentSeasonYear
        ),
        ...preview.teamRosterSnapshots,
        ...seasonFinalCheckpoint.rosterSnapshots,
      ],
      playerCatalog: updatedCatalog,
      scheduleImports: [],
      top25Imports: [],
    };
    this.persistDynastyState();
    await this.writeHostedStateMirror();

    return {
      previousSeasonYear: currentSeasonYear,
      currentSeasonYear: nextSeasonYear,
      tenuresUpdated: tenureUpdates.count,
      rostersCarriedForward,
      archivedSeason: preview.archivedSeason,
    };
  }

  private applyRankingSnapshotsToSeason(season: Season, rankings: RankingSnapshot[]): Season {
    const snapshot = rankings
      .filter((item) => item.seasonYear === season.year && item.pollType === 'top25')
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
    if (!snapshot) return season;

    const standingsByTeam = new Map(season.standings.map((standing) => [standing.teamId, standing]));
    for (const entry of snapshot.entries) {
      const standing = standingsByTeam.get(entry.teamId) ?? {
        teamId: entry.teamId,
        wins: entry.wins,
        losses: entry.losses,
      };
      standingsByTeam.set(entry.teamId, {
        ...standing,
        wins: entry.wins,
        losses: entry.losses,
        ranking: entry.rank,
      });
    }

    return {
      ...season,
      standings: [...standingsByTeam.values()].sort(
        (a, b) => (a.ranking ?? 999) - (b.ranking ?? 999) || b.wins - a.wins || a.losses - b.losses
      ),
    };
  }

  private getScheduleImportTeamId(imported: ScheduleCaptureImport): string {
    return getScheduleImportTeamId(imported);
  }

  private mergeTeamScheduleIntoSeason(existing: Season | undefined, imported: ScheduleCaptureImport): Season {
    return mergeTeamScheduleIntoSeason(existing, imported);
  }

  private buildDynastyWithScheduleImports(): Dynasty {
    const seasonsByYear = new Map<number, Season>(
      PLACEHOLDER_DYNASTY.seasons.map((season) => [season.year, season])
    );

    for (const season of this.dynastyState.archivedSeasons) {
      seasonsByYear.set(season.year, season);
    }

    for (const imported of this.dynastyState.scheduleImports) {
      seasonsByYear.set(
        imported.season.year,
        this.mergeTeamScheduleIntoSeason(seasonsByYear.get(imported.season.year), imported)
      );
    }

    const rankings = [
      ...this.dynastyState.archivedRankings,
      ...this.dynastyState.top25Imports.map((item) => item.rankings),
    ];
    const seasons = Array.from(seasonsByYear.values())
      .map((season) => this.applyRankingSnapshotsToSeason(season, rankings))
      .sort((a, b) => a.year - b.year);

    return {
      ...PLACEHOLDER_DYNASTY,
      currentSeasonYear: this.getCurrentSeasonYear(),
      seasons,
      rankings,
      teamRosterSnapshots: this.dynastyState.teamRosterSnapshots,
      checkpoints: this.dynastyState.checkpoints,
      playerCatalog: this.dynastyState.playerCatalog,
      postseasonResults: this.dynastyState.postseasonResults,
      updatedAt: new Date().toISOString(),
    };
  }

  private buildProgressionPayload() {
    const snapshots = collectAllProgressionSnapshots(this.dynastyState.checkpoints);
    const allRosterSnapshots = [
      ...this.dynastyState.teamRosterSnapshots,
      ...this.dynastyState.checkpoints.flatMap((checkpoint) => checkpoint.rosterSnapshots),
    ];
    return enrichProgressionNames(progressionFromSnapshots(snapshots), allRosterSnapshots);
  }

  buildPublishPayload(uploadedByUserId = COMMISSIONER_USER_ID): DynastySyncPayload {
    const imports = this.store.listRosterImports(this.getActiveDynastyId());
    const teams = this.listTeams();
    const rosters: Record<string, Roster> = { ...PLACEHOLDER_ROSTERS };

    for (const [teamId, roster] of rosterMapFromImports(imports)) {
      rosters[teamId] = roster;
    }

    return createSyncPayload(
      uploadedByUserId,
      this.buildDynastyWithScheduleImports(),
      teams,
      rosters,
      this.buildProgressionPayload(),
      {
        checkpoints: this.dynastyState.checkpoints,
        playerCatalog: this.dynastyState.playerCatalog,
        postseasonResults: this.dynastyState.postseasonResults,
      }
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

  listPublishHistory(dynastyId?: string): PublishedBatchRecord[] {
    return this.store.listPublishHistory(dynastyId ?? this.getActiveDynastyId());
  }
}
