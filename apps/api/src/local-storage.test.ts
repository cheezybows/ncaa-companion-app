import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEMO_DYNASTY_ID,
  PLACEHOLDER_DYNASTY,
  PLACEHOLDER_PROGRESSION,
  PLACEHOLDER_ROSTERS,
  PLACEHOLDER_TEAMS,
} from '@ncaa/domain';
import { createSyncPayload } from '@ncaa/sync';
import {
  getLocalCommissionerRepository,
  resetLocalStorageForTests,
} from './local-storage.js';

const originalDesktopStatePath = process.env.NCAA_DESKTOP_STATE_PATH;
const originalDesktopDbPath = process.env.NCAA_DESKTOP_DB_PATH;

afterEach(() => {
  if (originalDesktopStatePath === undefined) {
    delete process.env.NCAA_DESKTOP_STATE_PATH;
  } else {
    process.env.NCAA_DESKTOP_STATE_PATH = originalDesktopStatePath;
  }

  if (originalDesktopDbPath === undefined) {
    delete process.env.NCAA_DESKTOP_DB_PATH;
  } else {
    process.env.NCAA_DESKTOP_DB_PATH = originalDesktopDbPath;
  }

  resetLocalStorageForTests();
});

describe('getLocalCommissionerRepository', () => {
  it('retries local state discovery after an initial miss', () => {
    delete process.env.NCAA_DESKTOP_STATE_PATH;
    delete process.env.NCAA_DESKTOP_DB_PATH;
    resetLocalStorageForTests();

    expect(getLocalCommissionerRepository()).toBeNull();

    const mirrorPath = join(mkdtempSync(join(tmpdir(), 'ncaa-hosted-state-')), 'hosted-state.json');
    const payload = createSyncPayload(
      'user-admin',
      { ...PLACEHOLDER_DYNASTY, name: 'Published Dynasty' },
      PLACEHOLDER_TEAMS,
      PLACEHOLDER_ROSTERS,
      PLACEHOLDER_PROGRESSION
    );
    writeFileSync(
      mirrorPath,
      JSON.stringify({
        lastPublishedPayload: payload,
        publishHistory: [],
      })
    );
    process.env.NCAA_DESKTOP_STATE_PATH = mirrorPath;

    const repository = getLocalCommissionerRepository();
    expect(repository?.getLastPublishedPayload(DEMO_DYNASTY_ID)?.dynasty.name).toBe(
      'Published Dynasty'
    );
  });

  it('prefers the mirror over SQLite when both paths are configured', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ncaa-hosted-state-'));
    const mirrorPath = join(dir, 'hosted-state.json');
    const dbPath = join(dir, 'ncaa-companion.db');
    writeFileSync(dbPath, 'sqlite-placeholder');
    writeFileSync(
      mirrorPath,
      JSON.stringify({
        lastPublishedPayload: createSyncPayload(
          'user-admin',
          { ...PLACEHOLDER_DYNASTY, name: 'Mirror Dynasty' },
          PLACEHOLDER_TEAMS,
          PLACEHOLDER_ROSTERS,
          PLACEHOLDER_PROGRESSION
        ),
        publishHistory: [],
      })
    );

    process.env.NCAA_DESKTOP_DB_PATH = dbPath;
    process.env.NCAA_DESKTOP_STATE_PATH = mirrorPath;
    resetLocalStorageForTests();

    const repository = getLocalCommissionerRepository();
    expect(repository?.getLastPublishedPayload(DEMO_DYNASTY_ID)?.dynasty.name).toBe('Mirror Dynasty');
    expect(existsSync(mirrorPath)).toBe(true);
  });
});
