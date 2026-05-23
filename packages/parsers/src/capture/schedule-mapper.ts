import type { ScheduleGame, Season, SeasonStanding } from '@ncaa/domain';
import type { ExtractedScheduleTableRow, ScheduleCaptureFixture } from './types.js';

export interface ScheduleCaptureImport {
  season: Season;
  fixtureId: string;
  partial: boolean;
  sourceLabel: string;
}

function teamIdFromKey(teamKey: string): string {
  return `team-${teamKey}`;
}

function parseResult(result: string | undefined): { homeScore?: number; awayScore?: number; isPlayed: boolean } {
  if (!result) return { isPlayed: false };
  const match = result.match(/^([WL])\s*(\d+)-(\d+)$/i);
  if (!match) return { isPlayed: false };

  const teamScore = Number(match[2]);
  const opponentScore = Number(match[3]);
  return {
    homeScore: teamScore,
    awayScore: opponentScore,
    isPlayed: true,
  };
}

function rowToGame(
  row: ExtractedScheduleTableRow,
  teamId: string,
  seasonId: string
): ScheduleGame | null {
  if (row.site === 'bye') return null;
  const opponentTeamId = row.opponentTeamKey ? teamIdFromKey(row.opponentTeamKey) : undefined;
  if (!opponentTeamId) return null;

  const parsed = parseResult(row.timeOrResult);
  const isHome = row.site === 'home';
  const homeTeamId = isHome ? teamId : opponentTeamId;
  const awayTeamId = isHome ? opponentTeamId : teamId;
  const teamScore = parsed.homeScore;
  const opponentScore = parsed.awayScore;
  const homeScore = parsed.isPlayed ? (isHome ? teamScore : opponentScore) : undefined;
  const awayScore = parsed.isPlayed ? (isHome ? opponentScore : teamScore) : undefined;

  return {
    id: `${seasonId}-w${row.week}-${awayTeamId}-at-${homeTeamId}`,
    seasonId,
    week: row.week,
    date: row.date,
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    isConferenceGame: row.isConferenceGame,
    isPlayed: parsed.isPlayed,
  };
}

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

  return Array.from(standings.values()).sort((a, b) => b.wins - a.wins || a.losses - b.losses);
}

export function scheduleCaptureFixtureToImport(fixture: ScheduleCaptureFixture): ScheduleCaptureImport {
  const { expected } = fixture;
  const teamId = teamIdFromKey(expected.teamContext.teamKey);
  const seasonId = `season-${expected.teamContext.seasonYear}`;
  const schedule = expected.table.rows
    .map((row) => rowToGame(row, teamId, seasonId))
    .filter((game): game is ScheduleGame => Boolean(game));

  return {
    season: {
      id: seasonId,
      dynastyId: 'dynasty-demo',
      year: expected.teamContext.seasonYear,
      label: `${expected.teamContext.seasonYear} ${expected.teamContext.name} Schedule Capture`,
      schedule,
      standings: calculateStandings(schedule),
    },
    fixtureId: expected.fixtureId,
    partial: expected.partial,
    sourceLabel: `${expected.teamContext.name} schedule screenshot fixture`,
  };
}
