import type { Player, PlayerAbility, PlayerRatings, Roster, Team } from '@ncaa/domain';
import type { ExtractedRosterTableRow, RosterCaptureFixture } from './types.js';

export interface RosterCaptureImport {
  team: Team;
  roster: Roster;
  fixtureId: string;
  partial: boolean;
  sourceLabel: string;
}

function parseDisplayName(displayName: string): { firstName: string; lastName: string } {
  const dotIndex = displayName.indexOf('.');
  if (dotIndex === -1) {
    const parts = displayName.trim().split(/\s+/);
    return {
      firstName: parts[0] ?? displayName,
      lastName: parts.slice(1).join(' ') || displayName,
    };
  }

  return {
    firstName: displayName.slice(0, dotIndex + 1),
    lastName: displayName.slice(dotIndex + 1).trim(),
  };
}

function toPlayerRatings(ratings: ExtractedRosterTableRow['ratings']): PlayerRatings {
  const mapped: PlayerRatings = {
    overall: ratings.overall,
    speed: ratings.speed,
    acceleration: ratings.acceleration,
    agility: ratings.agility,
    changeOfDirection: ratings.changeOfDirection,
    strength: ratings.strength,
    awareness: ratings.awareness,
    playRecognition: ratings.playRecognition,
    manCoverage: ratings.manCoverage,
  };

  return Object.fromEntries(
    Object.entries(mapped).filter(([, value]) => value != null)
  ) as PlayerRatings;
}

function toAbilities(
  abilities: Array<{ name: string; type: 'physical' | 'mental' }> | undefined
): PlayerAbility[] | undefined {
  if (!abilities?.length) return undefined;

  return abilities.map((ability, index) => ({
    id: `capture-ability-${index}`,
    name: ability.name,
    type: ability.type,
    category: ability.type === 'mental' ? 'mental' : 'trait',
  }));
}

function rowToPlayer(
  teamId: string,
  row: ExtractedRosterTableRow,
  detail?: RosterCaptureFixture['expected']['detailPanel']
): Player {
  const detailPanel = row.focused ? detail : undefined;
  const parsed = detailPanel
    ? { firstName: detailPanel.firstName, lastName: detailPanel.lastName }
    : parseDisplayName(row.displayName);

  const ratings = detailPanel
    ? { ...toPlayerRatings(row.ratings), ...toPlayerRatings(detailPanel.ratings) }
    : toPlayerRatings(row.ratings);

  return {
    id: `capture-${teamId}-${row.index}`,
    teamId,
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    position: row.position,
    jerseyNumber: detailPanel?.jerseyNumber,
    classYear: detailPanel?.classYear ?? row.classYear,
    heightInches: detailPanel?.heightInches,
    weightLbs: detailPanel?.weightLbs,
    hometown: detailPanel?.hometown,
    ratings,
    developmentTrait: detailPanel?.developmentTrait,
    archetype: detailPanel?.archetype,
    abilities: toAbilities(detailPanel?.abilities),
  };
}

export function rosterCaptureFixtureToImport(fixture: RosterCaptureFixture): RosterCaptureImport {
  const { expected, meta } = fixture;
  const teamId = `team-${expected.teamContext.teamKey}`;

  const team: Team = {
    id: teamId,
    name: expected.teamContext.name,
    abbreviation: 'ORST',
    conferenceId: meta.teamContext.conference?.toLowerCase().replace(/\s+/g, '-') ?? 'big-ten',
    overallRating: meta.teamContext.overallRating,
    offensiveRating: meta.teamContext.offensiveRating,
    defensiveRating: meta.teamContext.defensiveRating,
    ranking: meta.teamContext.rank,
    primaryColor: '#D73F09',
    secondaryColor: '#000000',
  };

  const players = expected.table.rows.map((row) =>
    rowToPlayer(teamId, row, expected.detailPanel)
  );

  const roster: Roster = {
    teamId,
    players,
    depthChart: [],
    updatedAt: new Date().toISOString(),
  };

  return {
    team,
    roster,
    fixtureId: expected.fixtureId,
    partial: expected.partial,
    sourceLabel: `${expected.teamContext.selectedPosition} screenshot fixture`,
  };
}
