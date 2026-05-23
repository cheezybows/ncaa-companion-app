import { describe, expect, it } from 'vitest';
import type { Player, Roster } from '@ncaa/domain';
import { getLatestRosterForTeam, mergeTeamRosters, normalizePlayerName, playerNameKey } from './roster-merge.js';

function player(overrides: Partial<Player> & Pick<Player, 'id' | 'firstName' | 'lastName' | 'position'>): Player {
  return {
    teamId: 'team-iowa',
    ratings: { overall: 80 },
    ...overrides,
  };
}

function roster(players: Player[]): Roster {
  return {
    teamId: 'team-iowa',
    players,
    depthChart: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('roster merge helpers', () => {
  it('normalizes dotted and spaced name variants', () => {
    expect(normalizePlayerName('L.', 'Melvin')).toBe(normalizePlayerName('L', 'Melvin'));
    expect(normalizePlayerName('K.', 'Fatinikun')).toBe(normalizePlayerName('K', 'Fatinikun'));
  });

  it('appends new players and updates same-name players while preserving ids', () => {
    const existing = roster([
      player({ id: 'p1', firstName: 'L.', lastName: 'Melvin', position: 'QB', ratings: { overall: 84, speed: 80 } }),
    ]);
    const incoming = roster([
      player({ id: 'new-id', firstName: 'C.', lastName: 'Brock', position: 'QB', ratings: { overall: 79 } }),
      player({ id: 'other-id', firstName: 'L.', lastName: 'Melvin', position: 'QB', ratings: { overall: 86, speed: 85 } }),
    ]);

    const merged = mergeTeamRosters(existing, incoming);
    expect(merged.players).toHaveLength(2);
    const melvin = merged.players.find((item) => playerNameKey(item) === playerNameKey(existing.players[0]!));
    const brock = merged.players.find((item) => item.lastName === 'Brock');

    expect(melvin?.id).toBe('p1');
    expect(melvin?.ratings.overall).toBe(86);
    expect(melvin?.ratings.speed).toBe(85);
    expect(brock?.id).toBe('new-id');
  });

  it('returns the newest roster import for a team', () => {
    const older = roster([player({ id: 'old', firstName: 'A', lastName: 'One', position: 'QB' })]);
    const newer = roster([player({ id: 'new', firstName: 'B', lastName: 'Two', position: 'QB' })]);
    const latest = getLatestRosterForTeam(
      [
        { teamId: 'team-iowa', roster: newer, importedAt: '2026-01-02T00:00:00.000Z' },
        { teamId: 'team-iowa', roster: older, importedAt: '2026-01-01T00:00:00.000Z' },
      ],
      'team-iowa'
    );

    expect(latest?.players[0]?.id).toBe('new');
  });
});
