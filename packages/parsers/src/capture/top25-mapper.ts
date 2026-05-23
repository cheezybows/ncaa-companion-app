import type { RankingSnapshot } from '@ncaa/domain';
import type { CaptureImportWarning, Top25CaptureFixture } from './types.js';
import { teamIdFromKey } from './team-resolver.js';

export interface Top25CaptureImport {
  rankings: RankingSnapshot;
  fixtureId: string;
  partial: boolean;
  sourceLabel: string;
  warnings?: CaptureImportWarning[];
}

export interface Top25CaptureImportOptions {
  dynastyId?: string;
  sourceLabel?: string;
}

export function top25CaptureFixtureToImport(
  fixture: Top25CaptureFixture,
  options: Top25CaptureImportOptions = {}
): Top25CaptureImport {
  const { expected } = fixture;
  const sourceLabel = options.sourceLabel ?? `${expected.seasonYear} Top 25 screenshot fixture`;
  const rankings: RankingSnapshot = {
    id: `rankings-${expected.pollType}-${expected.seasonYear}`,
    dynastyId: options.dynastyId ?? 'dynasty-demo',
    seasonYear: expected.seasonYear,
    pollType: expected.pollType,
    capturedAt: new Date().toISOString(),
    sourceLabel,
    fixtureId: expected.fixtureId,
    entries: expected.entries.map((entry) => ({
      ...entry,
      teamId: entry.teamKey ? teamIdFromKey(entry.teamKey) : '',
    })),
  };

  return {
    rankings,
    fixtureId: expected.fixtureId,
    partial: expected.partial,
    sourceLabel,
  };
}
