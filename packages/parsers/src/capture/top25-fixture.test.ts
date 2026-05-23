import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ExtractedRankingEntry, Top25CaptureExpected } from './types.js';
import { mergeTop25Entries, parseTop25EntriesFromOcrText } from './top25-ocr.js';

const captureFixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/capture');

function loadExpected(basename: string): Top25CaptureExpected {
  return JSON.parse(readFileSync(join(captureFixturesDir, `${basename}.expected.json`), 'utf8')) as Top25CaptureExpected;
}

function loadOcrText(basename: string): string {
  return readFileSync(join(captureFixturesDir, `${basename}.ocr.txt`), 'utf8');
}

function matchRate(parsed: ExtractedRankingEntry[], expected: ExtractedRankingEntry[]): number {
  if (expected.length === 0) return 1;
  const parsedByRank = new Map(parsed.map((entry) => [entry.rank, entry]));
  let matches = 0;
  for (const entry of expected) {
    const actual = parsedByRank.get(entry.rank);
    if (!actual) continue;
    if (actual.teamKey !== entry.teamKey) continue;
    if (actual.wins !== entry.wins || actual.losses !== entry.losses) continue;
    matches += 1;
  }
  return matches / expected.length;
}

function expectKeyRanks(parsed: ExtractedRankingEntry[], ranks: number[]): void {
  const parsedByRank = new Map(parsed.map((entry) => [entry.rank, entry]));
  for (const rank of ranks) {
    expect(parsedByRank.has(rank)).toBe(true);
  }
}

describe('top25 golden OCR fixtures', () => {
  it('parses page 1 OCR text with core ranks', () => {
    const expected = loadExpected('top25-cfp-2026-page1');
    const parsed = parseTop25EntriesFromOcrText(loadOcrText('top25-cfp-2026-page1'));
    expect(matchRate(parsed, expected.entries)).toBeGreaterThanOrEqual(0.35);
    expectKeyRanks(parsed, [1, 2, 3, 10, 11, 12]);
    expect(parsed.find((entry) => entry.rank === 1)).toMatchObject({
      teamKey: 'virginia-tech',
      wins: 13,
      losses: 0,
    });
  });

  it('parses page 2 OCR text with lower-table ranks', () => {
    const expected = loadExpected('top25-cfp-2026-page2');
    const parsed = parseTop25EntriesFromOcrText(loadOcrText('top25-cfp-2026-page2'));
    expect(matchRate(parsed, expected.entries)).toBeGreaterThanOrEqual(0.5);
    expectKeyRanks(parsed, [14, 15, 16, 18, 19, 20, 22]);
  });

  it('merges both pages for a near-complete Top 25', () => {
    const expected = loadExpected('top25-cfp-2026.merged');
    const page1 = parseTop25EntriesFromOcrText(loadOcrText('top25-cfp-2026-page1'));
    const page2 = parseTop25EntriesFromOcrText(loadOcrText('top25-cfp-2026-page2'));
    const { entries } = mergeTop25Entries([page1, page2]);
    expect(entries.length).toBeGreaterThanOrEqual(16);
    expect(matchRate(entries, expected.entries)).toBeGreaterThanOrEqual(0.45);
    expect(entries.find((entry) => entry.rank === 1)).toMatchObject({
      teamKey: 'virginia-tech',
      wins: 13,
      losses: 0,
    });
  });
});
