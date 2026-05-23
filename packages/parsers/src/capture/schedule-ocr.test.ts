import { describe, expect, it } from 'vitest';
import { scheduleCaptureFixtureToImport } from './schedule-mapper.js';
import { mergeScheduleRows, parseScheduleRowsFromOcrText } from './schedule-ocr.js';

describe('schedule OCR parsing', () => {
  it('parses home and away schedule lines', () => {
    const text = [
      '1 HOME Wisconsin',
      '2 AWAY Minnesota',
      '3 BYE',
      '4 HOME Iowa W 24-17',
    ].join('\n');

    const rows = parseScheduleRowsFromOcrText(text);
    expect(rows).toHaveLength(4);
    expect(rows[0]?.site).toBe('home');
    expect(rows[1]?.site).toBe('away');
    expect(rows[2]?.site).toBe('bye');
    expect(rows[3]?.timeOrResult).toMatch(/W/i);
  });

  it('merges rows by week', () => {
    const { rows, warnings } = mergeScheduleRows([
      [{ week: 1, site: 'home', opponentName: 'Wisconsin' }],
      [{ week: 1, site: 'home', opponentName: 'Wisconsin', timeOrResult: 'W 10-3' }],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.timeOrResult).toBe('W 10-3');
    expect(warnings.some((warning) => warning.code === 'merge_conflict')).toBe(false);
  });

  it('parses regular-season OCR token streams and ignores postseason rows', () => {
    const text = [
      '[[OCR_REGION:schedule_table]] * WEEK DATE OPPONENT TIME(ET)/RESULT',
      '0 BYE',
      '1 Sat, Sep 3 vs & Buffalo W 49-3',
      ') Sat, Sep 10 at su lowa State W31-10',
      '3 Sat, Sep 17 vs AVZ 1VirginiaTech L45-34',
      '5 Sat, Oct 1 at {8 Colorado W 60-21',
      '6 BYE',
      '7 Sat, Oct 15 vs (TS Michigan State W447',
      '8 Sat, Oct 22 at MM 16 Michigan 138-35',
      '14 BYE Conf Champ Sat, Dec 10 vs @) 2 oregon 133-30',
    ].join(' ');

    const rows = parseScheduleRowsFromOcrText(text);
    expect(rows.find((row) => row.week === 0)).toMatchObject({ site: 'bye' });
    expect(rows.find((row) => row.week === 1)).toMatchObject({
      opponentName: 'Buffalo',
      site: 'home',
      timeOrResult: 'W 49-3',
    });
    expect(rows.find((row) => row.week === 2)).toMatchObject({
      opponentName: 'Iowa State',
      site: 'away',
      timeOrResult: 'W 31-10',
    });
    expect(rows.find((row) => row.week === 6)).toMatchObject({ site: 'bye' });
    expect(rows.find((row) => row.week === 7)).toMatchObject({
      opponentName: 'Michigan State',
      timeOrResult: 'W 44-7',
    });
    expect(rows.find((row) => row.week === 8)).toMatchObject({
      opponentName: 'Michigan',
      timeOrResult: 'L 38-35',
    });
    expect(rows.some((row) => row.opponentName === 'Oregon')).toBe(false);
  });

  it('keeps week 0 game rows when they are not byes', () => {
    const rows = parseScheduleRowsFromOcrText(
      '[[OCR_REGION:schedule_table]] * WEEK DATE OPPONENT TIME(ET)/RESULT 0 Sat, Aug 24 vs Buffalo 8:00 PM 1 BYE'
    );

    expect(rows.find((row) => row.week === 0)).toMatchObject({
      opponentName: 'Buffalo',
      site: 'home',
      timeOrResult: '8:00 PM',
    });
    expect(rows.find((row) => row.week === 1)).toMatchObject({ site: 'bye' });
  });

  it('keeps bye weeks as visible schedule entries without standings impact', () => {
    const imported = scheduleCaptureFixtureToImport(
      {
        meta: {
          fixtureId: 'schedule-bye-test',
          screenKind: 'team_schedule',
          game: 'College Football 26',
          partial: false,
          notes: [],
          teamContext: { teamKey: 'iowa', name: 'Iowa' },
          table: { visibleRowCount: 2, hasMoreRows: false },
          imageFile: '',
        },
        expected: {
          fixtureId: 'schedule-bye-test',
          screenKind: 'team_schedule',
          partial: false,
          teamContext: { teamKey: 'iowa', name: 'Iowa', seasonYear: 2026 },
          table: {
            rows: [
              { week: 1, site: 'home', opponentName: 'Buffalo', opponentTeamKey: 'buffalo', timeOrResult: 'W 49-3' },
              { week: 6, site: 'bye' },
            ],
          },
        },
        imagePath: '',
        imagePresent: false,
      },
      { dynastyId: 'dynasty-demo', teamId: 'team-iowa', teamName: 'Iowa' }
    );

    expect(imported.season.schedule).toHaveLength(2);
    expect(imported.season.schedule.find((game) => game.week === 6)).toMatchObject({
      awayTeamId: 'team-bye',
      isBye: true,
      isPlayed: false,
    });
    expect(imported.season.standings.some((standing) => standing.teamId === 'team-bye')).toBe(false);
  });
});
