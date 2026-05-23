import { describe, expect, it } from 'vitest';
import { loadScheduleCaptureFixture } from './fixtures.js';
import { scheduleCaptureFixtureToImport } from './schedule-mapper.js';

describe('scheduleCaptureFixtureToImport', () => {
  it('maps a schedule screenshot fixture into a season schedule', () => {
    const imported = scheduleCaptureFixtureToImport(loadScheduleCaptureFixture());

    expect(imported.fixtureId).toBe('schedule-utep-2026-partial');
    expect(imported.season.year).toBe(2026);
    expect(imported.season.schedule).toHaveLength(8);
    expect(imported.season.schedule[0]).toMatchObject({
      week: 1,
      homeTeamId: 'team-utep',
      awayTeamId: 'team-unlv',
      homeScore: 21,
      awayScore: 20,
      isPlayed: true,
    });
    expect(imported.season.standings.find((standing) => standing.teamId === 'team-utep')).toMatchObject({
      wins: 2,
      losses: 0,
    });
  });
});
