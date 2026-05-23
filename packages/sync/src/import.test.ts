import { describe, expect, it } from 'vitest';
import { applySyncPayload, isIdempotentBatch } from './import.js';
import type { DynastySyncPayload } from './payloads.js';

const samplePayload: DynastySyncPayload = {
  batchId: 'batch-1',
  dynastyId: 'dynasty-demo',
  uploadedByUserId: 'user-admin',
  syncedAt: new Date().toISOString(),
  dynasty: {
    id: 'dynasty-demo',
    name: 'Demo',
    currentSeasonYear: 2026,
    seasons: [],
    recruitingClasses: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  teams: [],
  rosters: {},
  progression: [],
};

describe('sync import', () => {
  it('applies payload and tracks idempotency', () => {
    applySyncPayload(samplePayload);
    expect(isIdempotentBatch('dynasty-demo', 'batch-1')).toBe(true);
    expect(isIdempotentBatch('dynasty-demo', 'batch-2')).toBe(false);
  });
});
