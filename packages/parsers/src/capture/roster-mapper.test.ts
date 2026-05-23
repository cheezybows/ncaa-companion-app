import { describe, expect, it } from 'vitest';
import { loadRosterCaptureFixture } from './fixtures.js';
import { rosterCaptureFixtureToImport } from './roster-mapper.js';

describe('rosterCaptureFixtureToImport', () => {
  it('maps fixture rows into a domain roster', () => {
    const imported = rosterCaptureFixtureToImport(loadRosterCaptureFixture());

    expect(imported.team.id).toBe('team-oregon-state');
    expect(imported.roster.players).toHaveLength(10);
    expect(imported.partial).toBe(true);
  });

  it('merges detail panel fields into the focused player', () => {
    const imported = rosterCaptureFixtureToImport(loadRosterCaptureFixture());
    const focused = imported.roster.players[4];

    expect(focused?.firstName).toBe('Demarquis');
    expect(focused?.lastName).toBe('Biggums');
    expect(focused?.jerseyNumber).toBe(2);
    expect(focused?.archetype).toBe('Boundary');
    expect(focused?.developmentTrait).toBe('Star');
    expect(focused?.ratings.speed).toBe(93);
    expect(focused?.abilities).toHaveLength(2);
  });
});
