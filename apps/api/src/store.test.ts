import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEMO_DYNASTY_ID,
  DEMO_TENURES,
  DEMO_USERS,
  PLACEHOLDER_DYNASTY,
  PLACEHOLDER_PROGRESSION,
  PLACEHOLDER_ROSTERS,
  PLACEHOLDER_TEAMS,
} from '@ncaa/domain';
import type { AppUser, TeamTenure } from '@ncaa/domain';
import { createSyncPayload } from '@ncaa/sync';
import { assignTeamToUser, ingestSync, listTenures } from './store.js';

const mockRepository = vi.hoisted(() => ({
  users: [] as AppUser[],
  tenures: [] as TeamTenure[],
  payloads: new Map<string, unknown>(),
}));

vi.mock('./local-storage.js', () => ({
  getLocalCommissionerRepository: () => ({
    listUsers: () => mockRepository.users,
    listTenures: (dynastyId: string) =>
      mockRepository.tenures.filter((tenure) => tenure.dynastyId === dynastyId),
    saveTenure: (tenure: TeamTenure) => {
      mockRepository.tenures = mockRepository.tenures.filter((item) => item.id !== tenure.id);
      mockRepository.tenures.unshift(tenure);
    },
    hasPublishedBatch: (batchId: string) => mockRepository.payloads.has(batchId),
    recordPublishedBatch: (payload: { batchId: string }) => {
      mockRepository.payloads.set(payload.batchId, payload);
    },
    getLastPublishedPayload: () => null,
    listPublishHistory: () => [],
  }),
}));

beforeEach(() => {
  mockRepository.users = DEMO_USERS.map((user) => ({ ...user }));
  mockRepository.tenures = DEMO_TENURES.map((tenure) => ({ ...tenure }));
  mockRepository.payloads = new Map();
});

describe('ingestSync', () => {
  it('returns updated=false for duplicate batch ids', () => {
    const payload = createSyncPayload(
      'user-admin',
      PLACEHOLDER_DYNASTY,
      PLACEHOLDER_TEAMS,
      PLACEHOLDER_ROSTERS,
      PLACEHOLDER_PROGRESSION
    );

    const first = ingestSync(payload);
    const second = ingestSync(payload);

    expect(first.updated).toBe(true);
    expect(second.updated).toBe(false);
    expect(second.batch.id).toBe(payload.batchId);
  });
});

describe('assignTeamToUser', () => {
  it('archives existing active tenures before creating a new assignment', () => {
    const tenure = assignTeamToUser({
      dynastyId: DEMO_DYNASTY_ID,
      userId: 'user-coach-reed',
      teamId: 'team-clemson',
      assignedByUserId: 'user-admin',
    });

    expect(tenure?.status).toBe('active');
    expect(tenure?.teamId).toBe('team-clemson');

    const tenures = listTenures('user-coach-reed', DEMO_DYNASTY_ID);
    const activeTenures = tenures.filter((item) => item.status === 'active');
    const archivedGeorgia = tenures.find((item) => item.teamId === 'team-georgia');

    expect(activeTenures).toHaveLength(1);
    expect(activeTenures[0]?.teamId).toBe('team-clemson');
    expect(archivedGeorgia?.status).toBe('completed');
    expect(archivedGeorgia?.label).toBe('Archived after commissioner team change');
  });

  it('allows an admin user to receive an active team tenure', () => {
    const tenure = assignTeamToUser({
      dynastyId: DEMO_DYNASTY_ID,
      userId: 'user-admin',
      teamId: 'team-iowa',
      assignedByUserId: 'user-admin',
    });

    expect(tenure?.status).toBe('active');
    expect(tenure?.userId).toBe('user-admin');
    expect(tenure?.teamId).toBe('team-iowa');
    expect(tenure?.role).toBe('admin');
  });
});
