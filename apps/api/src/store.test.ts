import { describe, expect, it, vi } from 'vitest';
import {
  DEMO_DYNASTY_ID,
  PLACEHOLDER_DYNASTY,
  PLACEHOLDER_PROGRESSION,
  PLACEHOLDER_ROSTERS,
  PLACEHOLDER_TEAMS,
} from '@ncaa/domain';
import { createSyncPayload } from '@ncaa/sync';
import { assignTeamToUser, ingestSync, listTenures } from './store.js';

vi.mock('./local-storage.js', () => ({
  getLocalCommissionerRepository: () => null,
}));

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
});
