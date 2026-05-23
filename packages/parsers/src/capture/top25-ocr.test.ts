import { describe, expect, it } from 'vitest';
import { mergeTop25Entries, parseTop25EntriesFromOcrText } from './top25-ocr.js';

describe('top25 OCR parsing', () => {
  it('parses structured Top 25 lines', () => {
    const sample = [
      '1 1 Virginia Tech 13-0 9 Iowa',
      '2 5 Oregon 12-2 7 Kentucky',
      '3 2 Miami 12-1 6 Texas',
    ].join('\n');

    const parsed = parseTop25EntriesFromOcrText(sample);
    expect(parsed.length).toBeGreaterThanOrEqual(2);
    expect(parsed[0]?.teamName).toContain('Virginia');
  });

  it('parses noisy game OCR with compact records', () => {
    const sample = [
      '@ TOP 25 RANKINGS 013 | puncal i ws. IOWA COACH |LVL 44',
      'ARANK LW NAME/VOTES WL LAST WEEK THIS WEEK',
      '2 5 @ oregon 122 7 Kentucky',
      '3 2 IL1) miami 121 . Texas',
      '6 3 A Texas 131 W 3128 vs 11 Florida State 3 Miami',
      '8 7 [Temple 122 L 37-29 vs Iowa',
      '16 16 BME Michigan 103 W5617 vs SMU',
      '17 17 af Appalachian state 94 - Nebraska',
      '18 18 (C3 Penn State 94 142:31 519 Ole Miss',
      '19 22 Bole Miss 103 W 42:31 v5 18 Penn Stat',
    ].join(' ');

    const parsed = parseTop25EntriesFromOcrText(sample);
    expect(parsed.map((entry) => entry.rank)).toEqual(expect.arrayContaining([2, 3, 6, 8]));
    expect(parsed.find((entry) => entry.rank === 2)).toMatchObject({
      teamName: 'Oregon',
      wins: 12,
      losses: 2,
    });
    expect(parsed.find((entry) => entry.rank === 8)).toMatchObject({
      teamName: 'Temple',
      wins: 12,
      losses: 2,
    });
  });

  it('recovers highlighted rank one from team-card OCR text', () => {
    const sample = [
      '(@ TOP 25 RANKINGS 0] IOWA COACH |LVL 44',
      'CRANK LW NAME/VOTES WL LAST WEEK THIS WEEK',
      '2 5 @ oregon 122 7 Kentucky',
      '3 2 IL1) miami 121 . Texas',
      'VIRGINIATECH HOKIES A 130(60)] 15TINACC DIVISION',
      '6 3 A Texas 131 W 3128 vs 11 Florida State 3 Miami',
      '8 7 [Temple 122 L 37-29 vs Iowa',
    ].join(' ');

    const parsed = parseTop25EntriesFromOcrText(sample);
    expect(parsed[0]).toMatchObject({
      rank: 1,
      teamName: 'Virginia Tech',
      wins: 13,
      losses: 0,
    });
  });

  it('recovers highlighted rank twenty-five from explicit team-card OCR text', () => {
    const sample = [
      '[[OCR_REGION:top25_table]]',
      '23 24 QP Missouri 8-4',
      '24 NR © Georgia 9-4',
      '[[OCR_REGION:top25_team_card]]',
      '25 ~ ae | [ @ J > SS UTAH STATE wi | TAT AGGIES : . - : wi Ke! K Ry 12-2 (8-0) | 1STIN MWC',
    ].join(' ');

    const parsed = parseTop25EntriesFromOcrText(sample);
    expect(parsed.find((entry) => entry.rank === 25)).toMatchObject({
      teamName: 'Utah State',
      wins: 12,
      losses: 2,
    });
  });

  it('parses lower-page OCR rows from a separate screenshot', () => {
    const sample = [
      '@ TOP 25 RANKINGS 013 ARANK LW NAME/VOTES WL LAST WEEK THIS WEEK',
      'Lg E os 12 10 AG Western Kentucky 122 46:35 ats East Carolina',
      '13 3 @ ohiostate "2 W3814vsTCY',
      '1. 15 \\0Y washington 93 - stanford',
      '1% 1% BME Michigan 103 W5617 vs SMU',
      '18 18 (C3 Penn State 94 142:31 519 Ole Miss.',
      '194 2 Bole Miss 103 W 42:31 v5 18 Penn Stat',
    ].join(' ');

    const parsed = parseTop25EntriesFromOcrText(sample);
    expect(parsed.map((entry) => entry.rank)).toEqual(expect.arrayContaining([12, 15, 18]));
    expect(parsed.find((entry) => entry.rank === 12)).toMatchObject({
      teamName: 'Western Kentucky',
      wins: 12,
      losses: 2,
    });
  });

  it('normalizes common scoreboard aliases from OCR text', () => {
    const sample = [
      '17 17 af Appalachian State 94 Nebraska',
      '21 19 be Florida International 113 L 34:28 vs Southern Mississippi',
      '22 20 & cemson 94 W 34.23 vs Florida',
    ].join('\n');

    const parsed = parseTop25EntriesFromOcrText(sample);
    expect(parsed.find((entry) => entry.rank === 17)).toMatchObject({
      teamName: 'App State',
      teamKey: 'app-state',
      wins: 9,
      losses: 4,
    });
    expect(parsed.find((entry) => entry.rank === 21)).toMatchObject({
      teamName: 'FIU',
      teamKey: 'fiu',
      wins: 11,
      losses: 3,
    });
    expect(parsed.find((entry) => entry.rank === 22)).toMatchObject({
      teamName: 'Clemson',
      teamKey: 'clemson',
      wins: 9,
      losses: 4,
    });
  });

  it('parses merged lower-rank tokens while keeping LW separate', () => {
    const sample = [
      '24 5 ©) oregon 122',
      '234 24 QP Missouri 8-4',
      '244 NR © Georgia 9-4',
    ].join('\n');

    const parsed = parseTop25EntriesFromOcrText(sample);
    expect(parsed.find((entry) => entry.rank === 2)).toMatchObject({
      previousRank: 5,
      teamName: 'Oregon',
      wins: 12,
      losses: 2,
    });
    expect(parsed.find((entry) => entry.rank === 23)).toMatchObject({
      previousRank: 24,
      teamName: 'Missouri',
      wins: 8,
      losses: 4,
    });
    expect(parsed.find((entry) => entry.rank === 24)).toMatchObject({
      previousRank: undefined,
      teamName: 'Georgia',
      wins: 9,
      losses: 4,
    });
  });

  it('merges duplicate ranks from multiple batches with warnings on conflict', () => {
    const first = [{ rank: 1, teamKey: 'a', teamName: 'Team A', wins: 10, losses: 0 }];
    const second = [{ rank: 1, teamKey: 'a', teamName: 'Team A', wins: 11, losses: 0 }];
    const { entries, warnings } = mergeTop25Entries([first, second]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.wins).toBe(11);
    expect(warnings.some((warning) => warning.code === 'merge_conflict')).toBe(true);
  });

  it('removes duplicate teams across different ranks', () => {
    const first = [{ rank: 1, teamKey: 'virginia-tech', teamName: 'Virginia Tech', wins: 13, losses: 0 }];
    const second = [{ rank: 8, teamKey: 'virginia-tech', teamName: 'Virginia Tech', wins: 10, losses: 4 }];
    const { entries, warnings } = mergeTop25Entries([first, second]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      rank: 1,
      teamKey: 'virginia-tech',
      wins: 13,
      losses: 0,
    });
    expect(warnings.some((warning) => warning.code === 'duplicate_team')).toBe(true);
  });
});
