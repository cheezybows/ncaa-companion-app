import { describe, expect, it } from 'vitest';
import { DEMO_USERS } from '@ncaa/domain';
import { createSyncPayload } from '@ncaa/sync';
import {
  PLACEHOLDER_DYNASTY,
  PLACEHOLDER_PROGRESSION,
  PLACEHOLDER_ROSTERS,
  PLACEHOLDER_TEAMS,
} from '@ncaa/domain';
import { DEMO_DYNASTY_ID } from '@ncaa/domain';
import { MemoryCommissionerRepository } from './memory-repositories.js';

describe('MemoryCommissionerRepository dynasty state', () => {
  it('round-trips commissioner dynasty state', () => {
    const repository = new MemoryCommissionerRepository();
    repository.saveDynastyState({
      dynastyId: 'dynasty-demo',
      currentSeasonYear: 2027,
      archivedSeasons: [],
      archivedRankings: [],
      teamRosterSnapshots: [],
      checkpoints: [],
      progression: [],
      playerCatalog: [],
      postseasonResults: [],
      scheduleImports: [],
      top25Imports: [],
    });
    const state = repository.getDynastyState('dynasty-demo', 2026);
    expect(state.currentSeasonYear).toBe(2027);
  });
});

describe('MemoryCommissionerRepository', () => {
  it('persists tenures and publish history with idempotency keys', () => {
    const repository = new MemoryCommissionerRepository();
    repository.upsertUsers(DEMO_USERS.filter((u) => u.role === 'coach'));
    repository.saveTenure({
      id: 'tenure-test',
      careerId: 'career-test',
      userId: 'user-coach-carter',
      dynastyId: 'dynasty-demo',
      teamId: 'team-alabama',
      role: 'coach',
      status: 'active',
      startSeasonYear: 2026,
      label: 'Test assignment',
    });

    expect(repository.listTenures('dynasty-demo')).toHaveLength(1);

    const payload = createSyncPayload(
      'user-admin',
      PLACEHOLDER_DYNASTY,
      PLACEHOLDER_TEAMS,
      PLACEHOLDER_ROSTERS,
      PLACEHOLDER_PROGRESSION
    );
    repository.recordPublishedBatch(payload);
    expect(repository.hasPublishedBatch(payload.batchId)).toBe(true);
    expect(repository.listPublishHistory('dynasty-demo')).toHaveLength(1);
    expect(repository.getLastPublishedPayload('dynasty-demo')?.batchId).toBe(payload.batchId);
  });

  it('stores roster imports per dynasty', () => {
    const repository = new MemoryCommissionerRepository();
    const team = PLACEHOLDER_TEAMS[0]!;
    const roster = PLACEHOLDER_ROSTERS[team.id]!;
    repository.saveRosterImport({
      dynastyId: 'dynasty-demo',
      team,
      roster,
      sourceLabel: 'fixture-test',
      fixtureId: 'roster-import-test',
    });
    expect(repository.listRosterImports('dynasty-demo')).toHaveLength(1);
  });

  it('deletes users and their team tenures', () => {
    const repository = new MemoryCommissionerRepository();
    repository.upsertUsers(DEMO_USERS.filter((u) => u.role === 'coach'));
    repository.saveTenure({
      id: 'tenure-delete-user',
      careerId: 'career-delete-user',
      userId: 'user-coach-carter',
      dynastyId: 'dynasty-demo',
      teamId: 'team-alabama',
      role: 'coach',
      status: 'active',
      startSeasonYear: 2026,
      label: 'Delete user test',
    });

    expect(repository.deleteUsers(['user-coach-carter'])).toBe(1);
    expect(repository.listUsers().some((user) => user.id === 'user-coach-carter')).toBe(false);
    expect(repository.listTenures('dynasty-demo')).toHaveLength(0);
  });
});

describe('MemoryCommissionerRepository leagues', () => {
  it('creates leagues, tracks active league, and deletes dynasty-scoped data', () => {
    const repository = new MemoryCommissionerRepository();
    const league = repository.createLeague({
      name: 'Test League',
      startingSeasonYear: 2028,
      commissionerUserId: 'user-admin',
    });
    expect(league.id).toMatch(/^dynasty-test-league/);
    repository.setActiveLeagueId(league.id);
    expect(repository.getActiveLeagueId()).toBe(league.id);

    repository.saveTenure({
      id: 'tenure-league',
      careerId: 'career-league',
      userId: 'user-coach-carter',
      dynastyId: league.id,
      teamId: 'team-alabama',
      role: 'coach',
      status: 'active',
      startSeasonYear: 2028,
      label: 'League assignment',
    });
    repository.saveRosterImport({
      dynastyId: league.id,
      team: PLACEHOLDER_TEAMS[0]!,
      roster: PLACEHOLDER_ROSTERS[PLACEHOLDER_TEAMS[0]!.id]!,
      sourceLabel: 'fixture-league',
    });

    expect(repository.listTenures(league.id)).toHaveLength(1);
    expect(repository.listRosterImports(league.id)).toHaveLength(1);

    repository.deleteLeague(league.id);
    expect(repository.getLeague(league.id)).toBeNull();
    expect(repository.listTenures(league.id)).toHaveLength(0);
    expect(repository.listRosterImports(league.id)).toHaveLength(0);
    expect(repository.getActiveLeagueId()).toBeNull();
  });

  it('bootstraps a default demo league id when requested', () => {
    const repository = new MemoryCommissionerRepository();
    const league = repository.createLeague({
      id: DEMO_DYNASTY_ID,
      name: 'Demo League',
      startingSeasonYear: 2026,
    });
    expect(league.id).toBe(DEMO_DYNASTY_ID);
    expect(repository.listLeagues()).toHaveLength(1);
  });
});
