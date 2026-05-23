import { describe, expect, it } from 'vitest';
import {
  importRosterFromOcrPages,
  importScheduleFromOcrPages,
  importTop25FromOcrPages,
} from '@ncaa/parsers';

describe('capture OCR imports', () => {
  it('imports Top 25 from OCR page text', () => {
    const { import: result, warnings } = importTop25FromOcrPages(
      [{ imagePath: 'a.png', text: '1 1 Virginia Tech 13-0', words: [], confidence: 90 }],
      { dynastyId: 'dynasty-demo', seasonYear: 2026 }
    );

    expect(result.rankings.entries.length).toBeGreaterThan(0);
    expect(result.rankings.entries).toHaveLength(25);
    expect(result.rankings.entries[0]?.teamName).toContain('Virginia');
    expect(result.rankings.entries[1]).toMatchObject({
      rank: 2,
      teamId: '',
      teamName: 'Manual entry required (#2)',
    });
    expect(warnings.some((warning) => warning.code === 'missing_rank')).toBe(true);
    expect(warnings).toBeDefined();
  });

  it('imports schedule from OCR page text', () => {
    const { import: result } = importScheduleFromOcrPages(
      [{ imagePath: 'a.png', text: '1 HOME Wisconsin\n2 AWAY Minnesota', words: [], confidence: 90 }],
      {
        dynastyId: 'dynasty-demo',
        teamId: 'team-iowa',
        teamName: 'Iowa',
        seasonYear: 2026,
      }
    );

    expect(result.season.schedule.length).toBeGreaterThan(0);
  });

  it('imports roster from OCR page text', () => {
    const { import: result } = importRosterFromOcrPages(
      [{ imagePath: 'a.png', text: 'J.Braxton JR CB 87', words: [], confidence: 90 }],
      {
        dynastyId: 'dynasty-demo',
        team: { id: 'team-iowa', name: 'Iowa', abbreviation: 'IOWA' },
        selectedPosition: 'CB',
      }
    );

    expect(result.roster.players.length).toBeGreaterThan(0);
  });

  it('keeps selected-row names when no detail panel text was extracted', () => {
    const { import: result } = importRosterFromOcrPages(
      [
        {
          imagePath: 'a.png',
          text: [
            '[[OCR_REGION:roster_selected_row]] RS NAME YEAR POS *OVR SPD ACC AGI COD STR AWR PBK PBP',
            'T.Salaam FR C 78 68 77 69 52 90 68 72 60',
          ].join(' '),
          words: [],
          confidence: 90,
        },
      ],
      {
        dynastyId: 'dynasty-demo',
        team: { id: 'team-iowa', name: 'Iowa', abbreviation: 'IOWA' },
        selectedPosition: 'C',
      }
    );

    expect(result.roster.players[0]).toMatchObject({
      firstName: 'T.',
      lastName: 'Salaam',
      ratings: {
        passBlock: 72,
        passBlockPower: 60,
      },
    });
  });

  it('uses player-card OCR when the selected row name is unreadable', () => {
    const { import: result } = importRosterFromOcrPages(
      [
        {
          imagePath: 'rt.png',
          text: [
            '[[OCR_REGION:roster_selected_row]] RS NAME YEAR POS *OVR SPD ACC AGI CoD STR AWR PBK PBP',
            'Pvild dor JR(RS) RT 95 70 78 90 73 98 87 92 92',
            '[[OCR_REGION:roster_player_card]]',
            '93 OVR TOMMY VILDOR POSITION ARCHETYPE RT #72 Well Rounded CLASS JR (RS)',
          ].join(' '),
          words: [],
          confidence: 90,
        },
      ],
      {
        dynastyId: 'dynasty-demo',
        team: { id: 'team-iowa', name: 'Iowa', abbreviation: 'IOWA' },
        selectedPosition: 'RT',
      }
    );

    expect(result.roster.players[0]).toMatchObject({
      firstName: 'TOMMY',
      lastName: 'VILDOR',
      position: 'RT',
      jerseyNumber: 72,
      classYear: 'JR (RS)',
      ratings: { overall: 95 },
    });
    expect(result.roster.players[0]?.ratings.passBlock).toBe(92);
  });

  it('combines unreadable selected-row ratings with defensive player-card identity', () => {
    const { import: result } = importRosterFromOcrPages(
      [
        {
          imagePath: 'ss.png',
          text: [
            '[[OCR_REGION:roster_selected_row]] RS NAME YEAR POS * OVR SPD ACC AGI COD STR AWR PRC MCV',
            'N Dsmythe SR (RS) $s 80 90 90 89 97 63 72 70 69',
            '[[OCR_REGION:roster_player_card]]',
            '78 OVR DOMINICK SMYTHE POSITION ARCHETYPE SS #7 Coverage Specialist CLASS SR (RS)',
          ].join(' '),
          words: [],
          confidence: 90,
        },
      ],
      {
        dynastyId: 'dynasty-demo',
        team: { id: 'team-iowa', name: 'Iowa', abbreviation: 'IOWA' },
        selectedPosition: 'SS',
      }
    );

    expect(result.roster.players[0]).toMatchObject({
      firstName: 'DOMINICK',
      lastName: 'SMYTHE',
      position: 'SS',
      ratings: {
        overall: 80,
        playRecognition: 70,
        manCoverage: 69,
      },
    });
  });

  it('keeps highlighted rows from each page in multi-screenshot roster imports', () => {
    const { import: result } = importRosterFromOcrPages(
      [
        {
          imagePath: 'rt.png',
          text: [
            '[[OCR_REGION:roster_selected_row]] RS NAME YEAR POS *OVR SPD ACC AGI CoD STR AWR PBK PBP',
            'Pvild dor JR(RS) RT 95 70 78 90 73 98 87 92 92',
            '[[OCR_REGION:roster_table]]',
            'J.Leo FR RT 78 67 79 65 56 88 68 76 83',
            '[[OCR_REGION:roster_player_card]]',
            '93 OVR TOMMY VILDOR POSITION ARCHETYPE RT #72 Well Rounded CLASS JR (RS)',
          ].join(' '),
          words: [],
          confidence: 90,
        },
        {
          imagePath: 'ss.png',
          text: [
            '[[OCR_REGION:roster_selected_row]] RS NAME YEAR POS * OVR SPD ACC AGI COD STR AWR PRC MCV',
            'N Dsmythe SR (RS) $s 80 90 90 89 97 63 72 70 69',
            '[[OCR_REGION:roster_table]]',
            'G.Wing SO SS 73 88 88 82 88 59 68 74 69',
            '[[OCR_REGION:roster_player_card]]',
            '78 OVR DOMINICK SMYTHE POSITION ARCHETYPE SS #7 Coverage Specialist CLASS SR (RS)',
          ].join(' '),
          words: [],
          confidence: 90,
        },
      ],
      {
        dynastyId: 'dynasty-demo',
        team: { id: 'team-iowa', name: 'Iowa', abbreviation: 'IOWA' },
      }
    );

    expect(result.roster.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lastName: 'VILDOR',
          position: 'RT',
          ratings: expect.objectContaining({ overall: 95, passBlock: 92 }),
        }),
        expect.objectContaining({
          lastName: 'SMYTHE',
          position: 'SS',
          ratings: expect.objectContaining({ overall: 80, manCoverage: 69 }),
        }),
      ])
    );
    expect(result.roster.players).toHaveLength(4);
  });
});
