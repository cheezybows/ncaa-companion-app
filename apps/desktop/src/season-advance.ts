import { randomUUID } from 'node:crypto';
import {
  DEMO_DYNASTY_ID,
  PLACEHOLDER_DYNASTY,
  PLACEHOLDER_ROSTERS,
} from '@ncaa/domain';
import type {
  AppUser,
  RankingSnapshot,
  Roster,
  Season,
  SeasonAdvanceAssignmentInput,
  SeasonAdvancePreview,
  Team,
  TeamRosterSnapshot,
  TeamTenure,
} from '@ncaa/domain';
import type { ScheduleCaptureImport, Top25CaptureImport } from '@ncaa/parsers';
import type { ScheduleGame, SeasonStanding } from '@ncaa/domain';

function calculateStandings(games: ScheduleGame[]): SeasonStanding[] {
  const standings = new Map<string, SeasonStanding>();
  const ensure = (teamId: string) => {
    const existing = standings.get(teamId);
    if (existing) return existing;
    const next = { teamId, wins: 0, losses: 0 };
    standings.set(teamId, next);
    return next;
  };

  for (const game of games) {
    if (game.isBye) continue;
    ensure(game.homeTeamId);
    ensure(game.awayTeamId);
    if (!game.isPlayed || game.homeScore === undefined || game.awayScore === undefined) continue;

    const home = ensure(game.homeTeamId);
    const away = ensure(game.awayTeamId);
    if (game.homeScore > game.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (game.awayScore > game.homeScore) {
      away.wins += 1;
      home.losses += 1;
    }
  }

  return [...standings.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
}

export function getScheduleImportTeamId(imported: ScheduleCaptureImport): string {
  return (
    imported.teamId ??
    imported.season.standings[0]?.teamId ??
    imported.season.schedule[0]?.homeTeamId ??
    imported.season.schedule[0]?.awayTeamId ??
    'unknown-team'
  );
}

export function mergeTeamScheduleIntoSeason(
  existing: Season | undefined,
  imported: ScheduleCaptureImport
): Season {
  const base =
    existing ??
    ({
      ...imported.season,
      schedule: [],
      standings: [],
    } satisfies Season);
  const teamId = getScheduleImportTeamId(imported);
  const retainedGames = base.schedule.filter(
    (game) => game.homeTeamId !== teamId && game.awayTeamId !== teamId
  );
  const gamesById = new Map(
    [...retainedGames, ...imported.season.schedule].map((game) => [game.id, game])
  );
  const schedule = [...gamesById.values()].sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));

  return {
    ...base,
    label: `${imported.season.year} Season`,
    schedule,
    standings: calculateStandings(schedule),
  };
}

export function buildDefaultSeasonAdvanceAssignments(
  activeTenures: TeamTenure[],
  users: AppUser[],
  teams: Team[]
): SeasonAdvanceAssignmentInput[] {
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const userById = new Map(users.map((user) => [user.id, user]));

  return activeTenures.map((tenure) => {
    const team = teamById.get(tenure.teamId);
    const user = userById.get(tenure.userId);
    return {
      tenureId: tenure.id,
      userId: tenure.userId,
      coachName: user?.displayName ?? tenure.userId,
      currentTeamId: tenure.teamId,
      currentTeamName: team?.name ?? tenure.teamId,
      action: 'stay',
    };
  });
}

export function validateSeasonAdvanceAssignments(
  assignments: SeasonAdvanceAssignmentInput[],
  teams: Team[]
): string[] {
  const errors: string[] = [];
  const teamIds = new Set(teams.map((team) => team.id));
  const occupiedNextTeams = new Map<string, string>();

  for (const assignment of assignments) {
    if (assignment.action === 'change') {
      if (!assignment.nextTeamId) {
        errors.push(`${assignment.coachName}: choose a team for Change Team.`);
        continue;
      }
      if (!teamIds.has(assignment.nextTeamId)) {
        errors.push(`${assignment.coachName}: unknown destination team.`);
      }
      if (assignment.nextTeamId === assignment.currentTeamId) {
        errors.push(`${assignment.coachName}: choose a different team or use Stay.`);
      }
    }

    if (assignment.action === 'stay' || assignment.action === 'change') {
      const nextTeamId =
        assignment.action === 'stay' ? assignment.currentTeamId : assignment.nextTeamId;
      if (!nextTeamId) continue;
      const existingCoach = occupiedNextTeams.get(nextTeamId);
      if (existingCoach) {
        errors.push(`Team ${nextTeamId} is assigned to both ${existingCoach} and ${assignment.coachName}.`);
      } else {
        occupiedNextTeams.set(nextTeamId, assignment.coachName);
      }
    }
  }

  return errors;
}

export function resolveActiveTeamForAssignment(
  assignment: SeasonAdvanceAssignmentInput
): string | null {
  if (assignment.action === 'leave') return null;
  if (assignment.action === 'change') return assignment.nextTeamId ?? null;
  return assignment.currentTeamId;
}

export function buildArchivedSeason(
  dynastyId: string,
  seasonYear: number,
  scheduleImports: ScheduleCaptureImport[],
  archivedRankings: RankingSnapshot[],
  applyRankingSnapshotsToSeason: (season: Season, rankings: RankingSnapshot[]) => Season
): Season {
  const matching = scheduleImports.filter((item) => item.season.year === seasonYear);
  let merged: Season | undefined;
  for (const imported of matching) {
    merged = mergeTeamScheduleIntoSeason(merged, imported);
  }

  const fallback =
    PLACEHOLDER_DYNASTY.seasons.find((season) => season.year === seasonYear) ??
    ({
      id: `season-${seasonYear}`,
      dynastyId,
      year: seasonYear,
      label: `${seasonYear} Season`,
      schedule: [],
      standings: [],
    } satisfies Season);

  const base = merged ?? fallback;
  return applyRankingSnapshotsToSeason(base, archivedRankings);
}

export function buildRosterSnapshotsForSeason(
  seasonYear: number,
  teamIds: Iterable<string>,
  rosterByTeamId: Map<string, Roster>,
  sourceLabel: string
): TeamRosterSnapshot[] {
  const archivedAt = new Date().toISOString();
  const snapshots: TeamRosterSnapshot[] = [];
  for (const teamId of teamIds) {
    const roster = rosterByTeamId.get(teamId);
    if (!roster) continue;
    snapshots.push({
      seasonYear,
      teamId,
      roster,
      sourceLabel,
      archivedAt,
    });
  }
  return snapshots;
}

export function buildSeasonAdvancePreview(input: {
  currentSeasonYear: number;
  assignments: SeasonAdvanceAssignmentInput[];
  scheduleImports: ScheduleCaptureImport[];
  archivedRankings: RankingSnapshot[];
  top25Imports: Top25CaptureImport[];
  rosterByTeamId: Map<string, Roster>;
  teams: Team[];
  applyRankingSnapshotsToSeason: (season: Season, rankings: RankingSnapshot[]) => Season;
}): SeasonAdvancePreview {
  const nextSeasonYear = input.currentSeasonYear + 1;
  const validationErrors = validateSeasonAdvanceAssignments(input.assignments, input.teams);
  const rankingsForArchive = [
    ...input.archivedRankings,
    ...input.top25Imports.map((item) => item.rankings),
  ];
  const archivedSeason = buildArchivedSeason(
    DEMO_DYNASTY_ID,
    input.currentSeasonYear,
    input.scheduleImports,
    rankingsForArchive,
    input.applyRankingSnapshotsToSeason
  );

  const snapshotTeamIds = new Set<string>();
  for (const assignment of input.assignments) {
    snapshotTeamIds.add(assignment.currentTeamId);
    const nextTeamId = resolveActiveTeamForAssignment(assignment);
    if (nextTeamId) snapshotTeamIds.add(nextTeamId);
  }

  const teamRosterSnapshots = buildRosterSnapshotsForSeason(
    input.currentSeasonYear,
    snapshotTeamIds,
    input.rosterByTeamId,
    `Archived roster for ${input.currentSeasonYear}`
  );

  return {
    currentSeasonYear: input.currentSeasonYear,
    nextSeasonYear,
    assignments: input.assignments,
    archivedSeason,
    teamRosterSnapshots,
    validationErrors,
  };
}

export function applyTenureUpdatesForSeasonAdvance(input: {
  assignments: SeasonAdvanceAssignmentInput[];
  tenures: TeamTenure[];
  currentSeasonYear: number;
  nextSeasonYear: number;
}): { updated: TeamTenure[]; count: number } {
  const tenureById = new Map(input.tenures.map((tenure) => [tenure.id, tenure]));
  const updated: TeamTenure[] = [];
  let count = 0;

  for (const assignment of input.assignments) {
    const tenure = tenureById.get(assignment.tenureId);
    if (!tenure || tenure.status !== 'active') continue;

    if (assignment.action === 'stay') {
      updated.push(tenure);
      continue;
    }

    if (assignment.action === 'leave') {
      const closed: TeamTenure = {
        ...tenure,
        status: 'completed',
        endSeasonYear: input.currentSeasonYear,
        label: 'Left team during season rollover',
      };
      tenureById.set(closed.id, closed);
      updated.push(closed);
      count += 1;
      continue;
    }

    const closed: TeamTenure = {
      ...tenure,
      status: 'completed',
      endSeasonYear: input.currentSeasonYear,
      label: 'Changed teams during season rollover',
    };
    tenureById.set(closed.id, closed);
    updated.push(closed);
    count += 1;

    const nextTeamId = assignment.nextTeamId;
    if (!nextTeamId) continue;

    const created: TeamTenure = {
      id: randomUUID(),
      careerId: tenure.careerId,
      userId: tenure.userId,
      dynastyId: tenure.dynastyId,
      teamId: nextTeamId,
      role: tenure.role,
      status: 'active',
      startSeasonYear: input.nextSeasonYear,
      label: `Assigned to ${nextTeamId} for ${input.nextSeasonYear}`,
    };
    tenureById.set(created.id, created);
    updated.push(created);
    count += 1;
  }

  return { updated, count };
}

export function rosterMapFromImports(
  imports: Array<{ teamId: string; roster: Roster; importedAt?: string }>
): Map<string, Roster> {
  const map = new Map<string, Roster>(Object.entries(PLACEHOLDER_ROSTERS));
  const newestByTeam = new Map<string, { roster: Roster; importedAt: string }>();

  for (const item of imports) {
    const importedAt = item.importedAt ?? '';
    const current = newestByTeam.get(item.teamId);
    if (!current || importedAt.localeCompare(current.importedAt) > 0) {
      newestByTeam.set(item.teamId, { roster: item.roster, importedAt });
    }
  }

  for (const [teamId, { roster }] of newestByTeam) {
    map.set(teamId, roster);
  }

  return map;
}
