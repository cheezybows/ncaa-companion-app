import { randomUUID } from 'node:crypto';
import type { Player, Roster } from '@ncaa/domain';

/** Normalize player names so spacing/case/dot variants match within a team roster. */
export function normalizePlayerName(firstName: string, lastName: string): string {
  const normalizePart = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/\s+/g, '');

  return `${normalizePart(firstName)}|${normalizePart(lastName)}`;
}

export function playerNameKey(player: Pick<Player, 'firstName' | 'lastName'>): string {
  return normalizePlayerName(player.firstName, player.lastName);
}

export function mergeTeamRosters(existing: Roster | undefined, incoming: Roster): Roster {
  const teamId = incoming.teamId;
  const now = new Date().toISOString();
  const playersByKey = new Map<string, Player>();

  for (const player of existing?.players ?? []) {
    playersByKey.set(playerNameKey(player), { ...player, teamId });
  }

  for (const player of incoming.players) {
    const key = playerNameKey(player);
    const previous = playersByKey.get(key);
    if (previous) {
      playersByKey.set(key, {
        ...previous,
        ...player,
        id: previous.id,
        teamId,
        ratings: { ...previous.ratings, ...player.ratings },
      });
    } else {
      playersByKey.set(key, {
        ...player,
        id: player.id || randomUUID(),
        teamId,
      });
    }
  }

  return {
    teamId,
    players: [...playersByKey.values()],
    depthChart: incoming.depthChart.length > 0 ? incoming.depthChart : (existing?.depthChart ?? []),
    updatedAt: now,
  };
}

export function getLatestRosterForTeam(
  imports: Array<{ teamId: string; roster: Roster; importedAt: string }>,
  teamId: string
): Roster | undefined {
  return imports
    .filter((item) => item.teamId === teamId)
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))[0]?.roster;
}
