import type { Player, PlayerAbility, PlayerRatings, Roster, Team } from '@ncaa/domain';
import type {
  CaptureImportWarning,
  ExtractedRosterTableRow,
  RosterCaptureExpected,
  RosterCaptureFixture,
} from './types.js';
import { teamIdFromKey } from './team-resolver.js';

export interface RosterCaptureImport {
  team: Team;
  roster: Roster;
  fixtureId: string;
  partial: boolean;
  sourceLabel: string;
  warnings?: CaptureImportWarning[];
}

export interface RosterCaptureImportOptions {
  team?: Team;
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
  return Object.fromEntries(
    Object.entries(ratings).filter(([, value]) => value != null)
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
  const hasDetailIdentity = Boolean(detail?.firstName || detail?.lastName || detail?.displayName);
  const detailPanel = row.focused && hasDetailIdentity ? detail : undefined;
  const parsed = detailPanel
    ? { firstName: detailPanel.firstName, lastName: detailPanel.lastName }
    : parseDisplayName(row.displayName);

  const ratings = detailPanel
    ? { ...toPlayerRatings(detailPanel.ratings), ...toPlayerRatings(row.ratings) }
    : toPlayerRatings(row.ratings);

  return {
    id: `capture-${teamId}-${row.index}`,
    teamId,
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    position: detailPanel?.position ?? row.position,
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

function teamAbbreviation(teamKey: string, name: string): string {
  if (teamKey === 'iowa') return 'IOWA';
  if (teamKey === 'oregon-state') return 'ORST';
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 4)
    .toUpperCase();
}

function teamColors(teamKey: string): { primaryColor: string; secondaryColor: string } {
  if (teamKey === 'iowa') return { primaryColor: '#FFCD00', secondaryColor: '#000000' };
  if (teamKey === 'oregon-state') return { primaryColor: '#D73F09', secondaryColor: '#000000' };
  return { primaryColor: '#1d4ed8', secondaryColor: '#f8fafc' };
}

export function mergeRosterCaptureExpected(
  fixtures: RosterCaptureExpected[]
): RosterCaptureExpected {
  const [first] = fixtures;
  if (!first) throw new Error('At least one roster capture expected payload is required.');

  const rows = fixtures.flatMap((fixture) => fixture.table.rows);
  const deduped = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.position}:${row.displayName}`;
    deduped.set(key, row);
  }

  return {
    ...first,
    partial: fixtures.some((fixture) => fixture.partial),
    table: {
      focusedRowIndex: first.table.focusedRowIndex,
      rows: [...deduped.values()].map((row, index) => ({ ...row, index })),
    },
  };
}

function teamFromFixture(fixture: RosterCaptureFixture): Team {
  const { expected, meta } = fixture;
  const teamKey = expected.teamContext?.teamKey ?? meta.navigation.selectedTeam.toLowerCase().replace(/\s+/g, '-');
  const teamId = teamIdFromKey(teamKey);
  const colors = teamColors(teamKey);

  return {
    id: teamId,
    name: expected.teamContext?.name ?? meta.teamContext.name,
    abbreviation: teamAbbreviation(teamKey, expected.teamContext?.name ?? meta.teamContext.name),
    conferenceId: meta.teamContext.conference?.toLowerCase().replace(/\s+/g, '-') ?? 'big-ten',
    overallRating: meta.teamContext.overallRating,
    offensiveRating: meta.teamContext.offensiveRating,
    defensiveRating: meta.teamContext.defensiveRating,
    ranking: meta.teamContext.rank,
    primaryColor: colors.primaryColor,
    secondaryColor: colors.secondaryColor,
  };
}

export function rosterCaptureFixtureToImport(
  fixture: RosterCaptureFixture,
  options: RosterCaptureImportOptions = {}
): RosterCaptureImport {
  const { expected } = fixture;
  const team = options.team ?? teamFromFixture(fixture);
  const teamId = team.id;

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
    sourceLabel: `${expected.teamContext?.selectedPosition ?? fixture.meta.navigation.selectedPosition} screenshot fixture`,
  };
}
