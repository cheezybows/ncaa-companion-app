import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  RosterCaptureExpected,
  RosterCaptureFixture,
  RosterCaptureMeta,
  ScheduleCaptureExpected,
  ScheduleCaptureFixture,
  ScheduleCaptureMeta,
  Top25CaptureExpected,
  Top25CaptureFixture,
  Top25CaptureMeta,
  UniversalCaptureLayouts,
} from './types.js';

const captureFixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/capture');

function loadExpected<T>(basename: string): T {
  return JSON.parse(readFileSync(join(captureFixturesDir, `${basename}.expected.json`), 'utf8')) as T;
}

export function loadRosterCaptureMeta(
  basename = 'roster-cb-oregon-state.partial'
): { meta: RosterCaptureMeta; imagePath: string; imagePresent: boolean } {
  const metaPath = join(captureFixturesDir, `${basename}.meta.json`);
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as RosterCaptureMeta;
  const imagePath = join(captureFixturesDir, meta.imageFile);
  return { meta, imagePath, imagePresent: existsSync(imagePath) };
}

export function loadRosterCaptureFixture(basename = 'roster-cb-oregon-state.partial'): RosterCaptureFixture {
  const { meta, imagePath, imagePresent } = loadRosterCaptureMeta(basename);
  const expected = loadExpected<RosterCaptureExpected>(basename);
  return { meta, expected, imagePath, imagePresent };
}

export function loadScheduleCaptureMeta(
  basename = 'schedule-utep-2026.partial'
): { meta: ScheduleCaptureMeta; imagePath: string; imagePresent: boolean } {
  const metaPath = join(captureFixturesDir, `${basename}.meta.json`);
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as ScheduleCaptureMeta;
  const imagePath = join(captureFixturesDir, meta.imageFile);
  return { meta, imagePath, imagePresent: existsSync(imagePath) };
}

export function loadScheduleCaptureFixture(basename = 'schedule-utep-2026.partial'): ScheduleCaptureFixture {
  const { meta, imagePath, imagePresent } = loadScheduleCaptureMeta(basename);
  const expected = loadExpected<ScheduleCaptureExpected>(basename);
  return { meta, expected, imagePath, imagePresent };
}

export function loadTop25CaptureMeta(
  basename = 'top25-cfp-2026.partial'
): { meta: Top25CaptureMeta; imagePath: string; imagePresent: boolean } {
  const metaPath = join(captureFixturesDir, `${basename}.meta.json`);
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as Top25CaptureMeta;
  const imagePath = join(captureFixturesDir, meta.imageFile);
  return { meta, imagePath, imagePresent: existsSync(imagePath) };
}

export function loadTop25CaptureFixture(basename = 'top25-cfp-2026.partial'): Top25CaptureFixture {
  const expected = loadExpected<Top25CaptureExpected>(basename);
  const metaPath = join(captureFixturesDir, `${basename}.meta.json`);
  if (existsSync(metaPath)) {
    const { meta, imagePath, imagePresent } = loadTop25CaptureMeta(basename);
    return { meta, expected, imagePath, imagePresent };
  }

  const imageFile = `${basename}.png`;
  const imagePath = join(captureFixturesDir, imageFile);
  const meta: Top25CaptureMeta = {
    fixtureId: expected.fixtureId,
    screenKind: 'top25_rankings',
    game: 'College Football 26',
    partial: expected.partial,
    notes: [],
    seasonYear: expected.seasonYear,
    pollType: expected.pollType,
    table: {
      visibleRowCount: expected.entries.length,
      hasMoreRows: expected.partial,
    },
    imageFile,
  };
  return { meta, expected, imagePath, imagePresent: existsSync(imagePath) };
}

export function loadUniversalCaptureLayouts(): UniversalCaptureLayouts {
  return JSON.parse(
    readFileSync(join(captureFixturesDir, 'universal-layouts.json'), 'utf8')
  ) as UniversalCaptureLayouts;
}
