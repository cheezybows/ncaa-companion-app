import { describe, expect, it } from 'vitest';
import { DEMO_USERS } from '@ncaa/domain';
import { createSyncPayload } from '@ncaa/sync';
import {
  PLACEHOLDER_DYNASTY,
  PLACEHOLDER_PROGRESSION,
  PLACEHOLDER_ROSTERS,
  PLACEHOLDER_TEAMS,
} from '@ncaa/domain';
import { MemoryCommissionerRepository } from './memory-repositories.js';

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
      fixtureId: 'roster-cb-oregon-state',
    });
    expect(repository.listRosterImports('dynasty-demo')).toHaveLength(1);
  });
});
