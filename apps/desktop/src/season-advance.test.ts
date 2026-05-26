import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_TEAMS } from '@ncaa/domain';
import type { SeasonAdvanceAssignmentInput, TeamTenure } from '@ncaa/domain';
import {
  applyTenureUpdatesForSeasonAdvance,
  buildArchivedSeason,
  buildDefaultSeasonAdvanceAssignments,
  mergeTeamScheduleIntoSeason,
  resolveHeismanWinner,
  rosterMapFromImports,
  validateSeasonAdvanceAssignments,
} from './season-advance.js';
import type { ScheduleCaptureImport } from '@ncaa/parsers';

describe('season advance validation', () => {
  it('flags duplicate next-team assignments', () => {
    const assignments: SeasonAdvanceAssignmentInput[] = [
      {
        tenureId: 't1',
        userId: 'u1',
        coachName: 'Coach A',
        currentTeamId: 'team-iowa',
        currentTeamName: 'Iowa',
        action: 'stay',
      },
      {
        tenureId: 't2',
        userId: 'u2',
        coachName: 'Coach B',
        currentTeamId: 'team-ohio-state',
        currentTeamName: 'Ohio State',
        action: 'change',
        nextTeamId: 'team-iowa',
      },
    ];

    const errors = validateSeasonAdvanceAssignments(assignments, PLACEHOLDER_TEAMS);
    expect(errors.some((error) => error.includes('team-iowa'))).toBe(true);
  });

  it('requires a destination team for change actions', () => {
    const assignments: SeasonAdvanceAssignmentInput[] = [
      {
        tenureId: 't1',
        userId: 'u1',
        coachName: 'Coach A',
        currentTeamId: 'team-iowa',
        currentTeamName: 'Iowa',
        action: 'change',
      },
    ];

    const errors = validateSeasonAdvanceAssignments(assignments, PLACEHOLDER_TEAMS);
    expect(errors[0]).toContain('choose a team');
  });
});

describe('season advance tenure updates', () => {
  const baseTenure: TeamTenure = {
    id: 'tenure-1',
    careerId: 'career-1',
    userId: 'user-coach',
    dynastyId: 'dynasty-demo',
    teamId: 'team-iowa',
    role: 'coach',
    status: 'active',
    startSeasonYear: 2026,
  };

  it('closes tenure on leave and creates a new tenure on change', () => {
    const assignments: SeasonAdvanceAssignmentInput[] = [
      {
        tenureId: 'tenure-1',
        userId: 'user-coach',
        coachName: 'Coach',
        currentTeamId: 'team-iowa',
        currentTeamName: 'Iowa',
        action: 'change',
        nextTeamId: 'team-michigan',
      },
    ];

    const result = applyTenureUpdatesForSeasonAdvance({
      assignments,
      tenures: [baseTenure],
      currentSeasonYear: 2026,
      nextSeasonYear: 2027,
    });

    expect(result.updated.some((tenure) => tenure.status === 'completed' && tenure.endSeasonYear === 2026)).toBe(
      true
    );
    expect(
      result.updated.some(
        (tenure) => tenure.status === 'active' && tenure.teamId === 'team-michigan' && tenure.startSeasonYear === 2027
      )
    ).toBe(true);
  });

  it('builds default stay assignments for active coaches', () => {
    const defaults = buildDefaultSeasonAdvanceAssignments(
      [baseTenure],
      [{ id: 'user-coach', email: 'c@x.com', displayName: 'Coach', role: 'coach', createdAt: '' }],
      PLACEHOLDER_TEAMS
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.action).toBe('stay');
  });
});

describe('season archive helpers', () => {
  function scheduleImport(teamId: string, opponentId: string, week: number, year = 2026): ScheduleCaptureImport {
    const seasonId = `season-${year}`;
    return {
      teamId,
      fixtureId: `${teamId}-schedule`,
      partial: true,
      sourceLabel: `${teamId} schedule`,
      season: {
        id: seasonId,
        dynastyId: 'dynasty-demo',
        year,
        label: `${year} schedule`,
        schedule: [
          {
            id: `${seasonId}-w${week}-${teamId}-vs-${opponentId}`,
            seasonId,
            week,
            homeTeamId: teamId,
            awayTeamId: opponentId,
            homeScore: 21,
            awayScore: 14,
            isPlayed: true,
          },
        ],
        standings: [{ teamId, wins: 1, losses: 0 }],
      },
    };
  }

  it('merges multiple schedule imports for the archived season', () => {
    let season: ReturnType<typeof mergeTeamScheduleIntoSeason> | undefined;
    season = mergeTeamScheduleIntoSeason(season, scheduleImport('team-alabama', 'team-auburn', 1));
    season = mergeTeamScheduleIntoSeason(season, scheduleImport('team-georgia', 'team-clemson', 2));

    const archived = buildArchivedSeason('dynasty-demo', 2026, [
      scheduleImport('team-alabama', 'team-auburn', 1),
      scheduleImport('team-georgia', 'team-clemson', 2),
    ], [], (value) => value);

    expect(archived.schedule.some((game) => game.homeTeamId === 'team-alabama')).toBe(true);
    expect(archived.schedule.some((game) => game.homeTeamId === 'team-georgia')).toBe(true);
    expect(season?.schedule).toHaveLength(2);
  });

  it('keeps the newest roster import per team', () => {
    const map = rosterMapFromImports([
      {
        teamId: 'team-iowa',
        importedAt: '2026-01-01T00:00:00.000Z',
        roster: {
          teamId: 'team-iowa',
          players: [{ id: 'old', teamId: 'team-iowa', firstName: 'Old', lastName: 'Player', position: 'QB', ratings: {} }],
          depthChart: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
      {
        teamId: 'team-iowa',
        importedAt: '2026-01-02T00:00:00.000Z',
        roster: {
          teamId: 'team-iowa',
          players: [{ id: 'new', teamId: 'team-iowa', firstName: 'New', lastName: 'Player', position: 'QB', ratings: {} }],
          depthChart: [],
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      },
    ]);

    expect(map.get('team-iowa')?.players[0]?.id).toBe('new');
  });

  it('matches a Heisman winner to a user-controlled roster player', () => {
    const winner = resolveHeismanWinner({
      heisman: { playerName: 'new player', teamId: 'team-iowa' },
      assignments: [
        {
          tenureId: 'tenure-1',
          userId: 'user-coach',
          coachName: 'Coach',
          currentTeamId: 'team-iowa',
          currentTeamName: 'Iowa',
          action: 'stay',
        },
      ],
      rosterByTeamId: new Map([
        [
          'team-iowa',
          {
            teamId: 'team-iowa',
            players: [
              {
                id: 'new-player',
                teamId: 'team-iowa',
                firstName: 'New',
                lastName: 'Player',
                position: 'QB',
                classYear: 'JR',
                ratings: { overall: 96 },
              },
            ],
            depthChart: [],
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      ]),
      seasonYear: 2026,
    });

    expect(winner?.playerId).toBe('new-player');
    expect(winner?.coachName).toBe('Coach');
    expect(winner?.matchedRosterPlayer).toBe(true);
  });
});
