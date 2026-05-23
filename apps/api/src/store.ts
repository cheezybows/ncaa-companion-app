import { randomUUID } from 'node:crypto';
import type {
  AppUser,
  AuthSession,
  ScheduleGame,
  Season,
  SeasonStanding,
  SyncBatch,
  TeamClaim,
  TeamTenure,
} from '@ncaa/domain';
import {
  DEMO_CLAIMS,
  DEMO_DYNASTY_ID,
  DEMO_HOSTED_DYNASTY,
  DEMO_TENURES,
  DEMO_USERS,
  PLACEHOLDER_DYNASTY,
  PLACEHOLDER_PROGRESSION,
  PLACEHOLDER_ROSTERS,
  PLACEHOLDER_TEAMS,
} from '@ncaa/domain';
import { applySyncPayload, createSyncPayload, getImportedState, isIdempotentBatch } from '@ncaa/sync';
import type { DynastySyncPayload, SeasonDataUpload, SeasonDataUploadResponse } from '@ncaa/sync';
import { getLocalCommissionerRepository } from './local-storage.js';

const sessions = new Map<string, AuthSession>();
const claims = [...DEMO_CLAIMS];
const tenures = [...DEMO_TENURES];
let syncBatches: SyncBatch[] = [];

let syncedPayload: DynastySyncPayload | null = null;

function userPassword(user: AppUser): string {
  return user.temporaryPassword || 'password';
}

export function createSession(userId: string, password: string): AuthSession | null {
  const user = listUsers().find((u) => u.id === userId);
  if (!user) return null;
  if ((user.accessStatus ?? 'active') !== 'active') return null;
  if (password !== userPassword(user)) return null;
  const activeTenure = listTenures(userId, DEMO_DYNASTY_ID).find(
    (t) => t.status === 'active'
  );
  const session: AuthSession = {
    user,
    dynastyId: DEMO_DYNASTY_ID,
    activeTenure,
  };
  sessions.set(user.id, session);
  return session;
}

export function getSession(userId: string): AuthSession | undefined {
  return sessions.get(userId);
}

export function listClaims(dynastyId: string): TeamClaim[] {
  return claims.filter((c) => c.dynastyId === dynastyId);
}

export function createClaim(input: {
  dynastyId: string;
  teamId: string;
  userId: string;
  note?: string;
}): TeamClaim {
  for (const existing of claims) {
    if (
      existing.userId === input.userId &&
      existing.dynastyId === input.dynastyId &&
      existing.status === 'pending'
    ) {
      existing.status = 'withdrawn';
    }
  }

  const claim: TeamClaim = {
    id: randomUUID(),
    dynastyId: input.dynastyId,
    teamId: input.teamId,
    userId: input.userId,
    status: 'pending',
    requestedAt: new Date().toISOString(),
    note: input.note,
  };
  claims.push(claim);
  return claim;
}

export function approveClaim(claimId: string, reviewerId: string): TeamClaim | null {
  const claim = claims.find((c) => c.id === claimId);
  if (!claim || claim.status !== 'pending') return null;

  claim.status = 'approved';
  claim.reviewedAt = new Date().toISOString();
  claim.reviewedByUserId = reviewerId;

  for (const tenure of tenures) {
    if (
      tenure.userId === claim.userId &&
      tenure.dynastyId === claim.dynastyId &&
      tenure.status === 'active'
    ) {
      tenure.status = 'completed';
      tenure.endSeasonYear = DEMO_HOSTED_DYNASTY.currentSeasonYear - 1;
      tenure.label = tenure.label ?? 'Archived after team change';
    }
  }

  const tenure: TeamTenure = {
    id: randomUUID(),
    careerId: `career-${claim.userId}`,
    userId: claim.userId,
    dynastyId: claim.dynastyId,
    teamId: claim.teamId,
    role: 'coach',
    status: 'active',
    startSeasonYear: DEMO_HOSTED_DYNASTY.currentSeasonYear,
    label: 'Claim approved',
  };
  tenures.push(tenure);
  const session = sessions.get(claim.userId);
  if (session) session.activeTenure = tenure;
  return claim;
}

export function rejectClaim(claimId: string, reviewerId: string): TeamClaim | null {
  const claim = claims.find((c) => c.id === claimId);
  if (!claim || claim.status !== 'pending') return null;
  claim.status = 'rejected';
  claim.reviewedAt = new Date().toISOString();
  claim.reviewedByUserId = reviewerId;
  return claim;
}

export function assignTeamToUser(input: {
  dynastyId: string;
  userId: string;
  teamId: string;
  assignedByUserId: string;
}): TeamTenure | null {
  const user = listUsers().find((u) => u.id === input.userId && u.role === 'coach');
  if (!user) return null;
  const repository = getLocalCommissionerRepository();
  const currentTenures = repository?.listTenures(input.dynastyId) ?? tenures;

  const occupiedByAnotherUser = currentTenures.some(
    (tenure) =>
      tenure.dynastyId === input.dynastyId &&
      tenure.teamId === input.teamId &&
      tenure.status === 'active' &&
      tenure.userId !== input.userId
  );
  if (occupiedByAnotherUser) return null;

  const activeTenures = currentTenures.filter(
    (tenure) =>
      tenure.userId === input.userId &&
      tenure.dynastyId === input.dynastyId &&
      tenure.status === 'active'
  );
  const current = activeTenures.find((tenure) => tenure.teamId === input.teamId);
  if (current && activeTenures.length === 1) return current;

  for (const activeTenure of activeTenures) {
    if (current && activeTenure.id === current.id) continue;
    activeTenure.status = 'completed';
    activeTenure.endSeasonYear = DEMO_HOSTED_DYNASTY.currentSeasonYear - 1;
    activeTenure.label = 'Archived after commissioner team change';
    repository?.saveTenure(activeTenure);
  }

  if (current) return current;

  for (const claim of claims) {
    if (
      claim.userId === input.userId &&
      claim.dynastyId === input.dynastyId &&
      claim.status === 'pending'
    ) {
      claim.status = 'withdrawn';
      claim.reviewedAt = new Date().toISOString();
      claim.reviewedByUserId = input.assignedByUserId;
    }
  }

  const existingCareerId =
    currentTenures.find((tenure) => tenure.userId === input.userId && tenure.dynastyId === input.dynastyId)
      ?.careerId ?? `career-${input.userId}`;
  const tenure: TeamTenure = {
    id: randomUUID(),
    careerId: existingCareerId,
    userId: input.userId,
    dynastyId: input.dynastyId,
    teamId: input.teamId,
    role: 'coach',
    status: 'active',
    startSeasonYear: DEMO_HOSTED_DYNASTY.currentSeasonYear,
    label: 'Assigned by commissioner',
  };

  if (repository) repository.saveTenure(tenure);
  else tenures.push(tenure);
  const session = sessions.get(input.userId);
  if (session) session.activeTenure = tenure;
  return tenure;
}

export function listTenures(userId: string, dynastyId: string): TeamTenure[] {
  const repository = getLocalCommissionerRepository();
  if (repository) {
    return repository
      .listTenures(dynastyId)
      .filter((t) => t.userId === userId);
  }
  return tenures.filter((t) => t.userId === userId && t.dynastyId === dynastyId);
}

export function ingestSync(payload: DynastySyncPayload): { batch: SyncBatch; updated: boolean } {
  const repository = getLocalCommissionerRepository();
  if (repository?.hasPublishedBatch(payload.batchId)) {
    const existing = syncBatches.find((item) => item.id === payload.batchId);
    if (existing) return { batch: existing, updated: false };
  }
  if (isIdempotentBatch(payload.dynastyId, payload.batchId)) {
    const existing = syncBatches.find((item) => item.id === payload.batchId);
    if (existing) return { batch: existing, updated: false };
  }

  const state = applySyncPayload(payload);
  syncedPayload = payload;
  repository?.recordPublishedBatch(payload);
  const batch: SyncBatch = {
    id: payload.batchId,
    dynastyId: payload.dynastyId,
    uploadedByUserId: payload.uploadedByUserId,
    source: 'electron',
    startedAt: payload.syncedAt,
    completedAt: new Date().toISOString(),
    status: 'completed',
    recordCounts: {
      teams: state.teamCount,
      players: state.playerCount,
      snapshots: state.snapshotCount,
      scheduleGames: payload.dynasty.seasons.reduce((s, season) => s + season.schedule.length, 0),
      recruits: payload.dynasty.recruitingClasses.reduce((s, k) => s + k.recruits.length, 0),
    },
    errors: [],
  };
  syncBatches = syncBatches.filter((item) => item.id !== payload.batchId);
  syncBatches.unshift(batch);
  return { batch, updated: true };
}

export function getDynastyBundle() {
  const repository = getLocalCommissionerRepository();
  const localPayload = repository?.getLastPublishedPayload(DEMO_DYNASTY_ID) ?? null;
  const payload = localPayload ?? syncedPayload;
  const localHistory = repository?.listPublishHistory(DEMO_DYNASTY_ID, 10);
  return {
    dynasty: payload?.dynasty ?? PLACEHOLDER_DYNASTY,
    teams: payload?.teams ?? PLACEHOLDER_TEAMS,
    rosters: payload?.rosters ?? PLACEHOLDER_ROSTERS,
    progression: payload?.progression ?? PLACEHOLDER_PROGRESSION,
    hosted: DEMO_HOSTED_DYNASTY,
    importState: getImportedState(DEMO_DYNASTY_ID) ?? null,
    syncBatches: localHistory?.map((record) => ({
      id: record.batchId,
      dynastyId: record.dynastyId,
      uploadedByUserId: record.uploadedByUserId,
      source: 'electron' as const,
      startedAt: record.syncedAt,
      completedAt: record.createdAt,
      status: record.status,
      recordCounts: {
        teams: payload?.teams.length ?? 0,
        players: Object.values(payload?.rosters ?? {}).reduce(
          (sum, roster) => sum + roster.players.length,
          0
        ),
        snapshots: payload?.progression.reduce((sum, item) => sum + item.snapshots.length, 0) ?? 0,
        scheduleGames: payload?.dynasty.seasons.reduce((sum, season) => sum + season.schedule.length, 0) ?? 0,
        recruits: payload?.dynasty.recruitingClasses.reduce((sum, klass) => sum + klass.recruits.length, 0) ?? 0,
      },
      errors: [],
    })) ?? syncBatches.slice(0, 10),
  };
}

export function ingestSeasonDataUpload(input: {
  dynastyId: string;
  uploadedByUserId: string;
  upload: SeasonDataUpload;
}): SeasonDataUploadResponse {
  if (!input.upload.seasonYear || !Number.isFinite(input.upload.seasonYear)) {
    throw new Error('seasonYear must be a number');
  }
  if (!Array.isArray(input.upload.games) || input.upload.games.length === 0) {
    throw new Error('games must include at least one schedule game');
  }

  const current = getDynastyBundle();
  const seasonId = `season-${input.upload.seasonYear}`;
  const games = input.upload.games.map<ScheduleGame>((game, index) => {
    if (!game.homeTeamId || !game.awayTeamId) {
      throw new Error(`games[${index}] must include homeTeamId and awayTeamId`);
    }
    if (!Number.isFinite(game.week)) {
      throw new Error(`games[${index}] must include numeric week`);
    }

    const hasScore = typeof game.homeScore === 'number' && typeof game.awayScore === 'number';
    return {
      id: game.id ?? `${seasonId}-w${game.week}-${game.awayTeamId}-at-${game.homeTeamId}`,
      seasonId,
      week: game.week,
      date: game.date,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      isConferenceGame: game.isConferenceGame,
      isPlayed: game.isPlayed ?? hasScore,
    };
  });

  const standings = input.upload.standings ?? calculateStandings(games);
  const season: Season = {
    id: seasonId,
    dynastyId: input.dynastyId,
    year: input.upload.seasonYear,
    label: input.upload.label ?? `${input.upload.seasonYear} Season`,
    schedule: games,
    standings,
  };
  const seasons = [
    ...current.dynasty.seasons.filter((item) => item.year !== input.upload.seasonYear),
    season,
  ].sort((a, b) => a.year - b.year);
  const dynasty = {
    ...current.dynasty,
    id: input.dynastyId,
    currentSeasonYear: Math.max(current.dynasty.currentSeasonYear, input.upload.seasonYear),
    seasons,
    updatedAt: new Date().toISOString(),
  };

  const payload = createSyncPayload(
    input.uploadedByUserId,
    dynasty,
    current.teams,
    current.rosters,
    current.progression
  );
  const { batch, updated } = ingestSync(payload);
  return { seasonYear: season.year, games, standings, batch, updated };
}

function calculateStandings(games: ScheduleGame[]): SeasonStanding[] {
  const standings = new Map<string, SeasonStanding>();
  const ensureStanding = (teamId: string) => {
    const existing = standings.get(teamId);
    if (existing) return existing;
    const next = { teamId, wins: 0, losses: 0 };
    standings.set(teamId, next);
    return next;
  };

  for (const game of games) {
    ensureStanding(game.homeTeamId);
    ensureStanding(game.awayTeamId);
    if (!game.isPlayed || game.homeScore === undefined || game.awayScore === undefined) continue;

    const home = ensureStanding(game.homeTeamId);
    const away = ensureStanding(game.awayTeamId);
    if (game.homeScore > game.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (game.awayScore > game.homeScore) {
      away.wins += 1;
      home.losses += 1;
    }
  }

  return Array.from(standings.values()).sort((a, b) => b.wins - a.wins || a.losses - b.losses);
}

export function getAvailableTeamIds(): string[] {
  const repository = getLocalCommissionerRepository();
  const currentTenures = repository?.listTenures(DEMO_DYNASTY_ID) ?? tenures;
  const active = new Set(
    currentTenures.filter((t) => t.status === 'active').map((t) => t.teamId)
  );
  const pending = new Set(
    claims.filter((c) => c.status === 'pending').map((c) => c.teamId)
  );
  return DEMO_HOSTED_DYNASTY.teamIds.filter((id) => !active.has(id) && !pending.has(id));
}

export function getAssignableTeamIds(userId: string): string[] {
  void userId;
  const repository = getLocalCommissionerRepository();
  const currentTenures = repository?.listTenures(DEMO_DYNASTY_ID) ?? tenures;
  const occupiedByOthers = new Set(
    currentTenures
      .filter((t) => t.status === 'active')
      .map((t) => t.teamId)
  );
  return DEMO_HOSTED_DYNASTY.teamIds.filter((id) => !occupiedByOthers.has(id));
}

export function listUsers(): AppUser[] {
  const repository = getLocalCommissionerRepository();
  const users = repository?.listUsers() ?? [];
  if (users.length > 0) return users;
  return DEMO_USERS;
}
