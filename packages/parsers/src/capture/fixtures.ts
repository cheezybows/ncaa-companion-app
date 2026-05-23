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
} from './types.js';

const captureFixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/capture');

export function loadRosterCaptureFixture(
  basename = 'roster-cb-oregon-state.partial'
): RosterCaptureFixture {
  const metaPath = join(captureFixturesDir, `${basename}.meta.json`);
  const expectedPath = join(captureFixturesDir, `${basename}.expected.json`);
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as RosterCaptureMeta;
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as RosterCaptureExpected;
  const imagePath = join(captureFixturesDir, meta.imageFile);

  return {
    meta,
    expected,
    imagePath,
    imagePresent: existsSync(imagePath),
  };
}

export function loadScheduleCaptureFixture(
  basename = 'schedule-utep-2026.partial'
): ScheduleCaptureFixture {
  const metaPath = join(captureFixturesDir, `${basename}.meta.json`);
  const expectedPath = join(captureFixturesDir, `${basename}.expected.json`);
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as ScheduleCaptureMeta;
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as ScheduleCaptureExpected;
  const imagePath = join(captureFixturesDir, meta.imageFile);

  return {
    meta,
    expected,
    imagePath,
    imagePresent: existsSync(imagePath),
  };
}
