import { describe, expect, it } from 'vitest';
import { DEMO_DYNASTY_ID, PLACEHOLDER_DYNASTY, PLACEHOLDER_ROSTERS, PLACEHOLDER_TEAMS } from '@ncaa/domain';
import type { ScheduleCaptureImport } from '@ncaa/parsers';
import { MemoryCommissionerRepository } from '@ncaa/storage/memory';
import { CommissionerService } from './commissioner-service.js';

function scheduleImport(teamId: string, opponentId: string, week: number): ScheduleCaptureImport {
  const seasonId = `season-${PLACEHOLDER_DYNASTY.currentSeasonYear}`;
  return {
    teamId,
    fixtureId: `${teamId}-schedule`,
    partial: true,
    sourceLabel: `${teamId} test schedule`,
    season: {
      id: seasonId,
      dynastyId: DEMO_DYNASTY_ID,
      year: PLACEHOLDER_DYNASTY.currentSeasonYear,
      label: `${teamId} Schedule Capture`,
      schedule: [
        {
          id: `${seasonId}-w${week}-${opponentId}-at-${teamId}`,
          seasonId,
          week,
          homeTeamId: teamId,
          awayTeamId: opponentId,
          homeScore: 28,
          awayScore: 14,
          isPlayed: true,
        },
      ],
      standings: [
        { teamId, wins: 1, losses: 0 },
        { teamId: opponentId, wins: 0, losses: 1 },
      ],
    },
  };
}

describe('CommissionerService schedule and rankings publish', () => {
  it('merges multiple team schedule imports for the same season', () => {
    const service = new CommissionerService(new MemoryCommissionerRepository());

    service.saveScheduleImport(scheduleImport('team-alabama', 'team-auburn', 1));
    service.saveScheduleImport(scheduleImport('team-georgia', 'team-clemson', 2));

    const currentSeason = service
      .buildPublishPayload()
      .dynasty.seasons.find((season) => season.year === PLACEHOLDER_DYNASTY.currentSeasonYear);

    expect(currentSeason?.schedule.some((game) => game.homeTeamId === 'team-alabama')).toBe(true);
    expect(currentSeason?.schedule.some((game) => game.homeTeamId === 'team-georgia')).toBe(true);
  });
});

describe('CommissionerService roster merge', () => {
  it('merges positional roster imports by player name and preserves player ids', () => {
    const store = new MemoryCommissionerRepository();
    const service = new CommissionerService(store);
    const team = PLACEHOLDER_TEAMS.find((item) => item.id === 'team-iowa')!;

    service.saveRosterImport({
      dynastyId: DEMO_DYNASTY_ID,
      team,
      sourceLabel: 'QB import',
      roster: {
        teamId: team.id,
        depthChart: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
        players: [
          {
            id: 'qb-1',
            teamId: team.id,
            firstName: 'L.',
            lastName: 'Melvin',
            position: 'QB',
            ratings: { overall: 84, speed: 80 },
          },
        ],
      },
    });

    service.saveRosterImport({
      dynastyId: DEMO_DYNASTY_ID,
      team,
      sourceLabel: 'TE import',
      roster: {
        teamId: team.id,
        depthChart: [],
        updatedAt: '2026-01-02T00:00:00.000Z',
        players: [
          {
            id: 'te-1',
            teamId: team.id,
            firstName: 'K.',
            lastName: 'Fatinikun',
            position: 'TE',
            ratings: { overall: 90 },
          },
          {
            id: 'qb-1-updated',
            teamId: team.id,
            firstName: 'L.',
            lastName: 'Melvin',
            position: 'QB',
            ratings: { overall: 86, speed: 85 },
          },
        ],
      },
    });

    const payload = service.buildPublishPayload();
    const roster = payload.rosters[team.id];
    expect(roster?.players).toHaveLength(2);
    const melvin = roster?.players.find((player) => player.lastName === 'Melvin');
    expect(melvin?.id).toBe('qb-1');
    expect(melvin?.ratings.overall).toBe(86);
    expect(roster?.players.some((player) => player.lastName === 'Fatinikun')).toBe(true);
  });
});

describe('CommissionerService season advance', () => {
  it('advances season year and archives prior schedule in publish payload', async () => {
    const store = new MemoryCommissionerRepository();
    const service = new CommissionerService(store);

    service.saveScheduleImport(scheduleImport('team-alabama', 'team-auburn', 1));
    service.saveScheduleImport(scheduleImport('team-georgia', 'team-clemson', 2));

    const alabama = PLACEHOLDER_TEAMS.find((team) => team.id === 'team-alabama');
    const alabamaRoster = PLACEHOLDER_ROSTERS['team-alabama'];
    if (alabama && alabamaRoster) {
      store.saveRosterImport({
        dynastyId: DEMO_DYNASTY_ID,
        team: alabama,
        roster: alabamaRoster,
        sourceLabel: 'Test import',
      });
    }

    store.saveTenure({
      id: 'tenure-1',
      careerId: 'career-1',
      userId: 'user-coach-1',
      dynastyId: DEMO_DYNASTY_ID,
      teamId: 'team-alabama',
      role: 'coach',
      status: 'active',
      startSeasonYear: PLACEHOLDER_DYNASTY.currentSeasonYear,
    });

    const preview = service.previewSeasonAdvance();
    const result = await service.advanceToNextSeason(
      preview.assignments.map((assignment) =>
        assignment.tenureId === 'tenure-1' ? { ...assignment, action: 'stay' as const } : assignment
      )
    );
    const payload = service.buildPublishPayload();

    expect(result.currentSeasonYear).toBe(preview.nextSeasonYear);
    expect(payload.dynasty.currentSeasonYear).toBe(preview.nextSeasonYear);
    const archived = payload.dynasty.seasons.find((season) => season.year === preview.currentSeasonYear);
    expect(archived).toBeDefined();
    expect(archived?.schedule.some((game) => game.homeTeamId === 'team-alabama')).toBe(true);
    expect(archived?.schedule.some((game) => game.homeTeamId === 'team-georgia')).toBe(true);
    expect(payload.dynasty.teamRosterSnapshots?.length ?? 0).toBeGreaterThan(0);
    expect(payload.dynasty.rankings?.every((ranking) => ranking.seasonYear < preview.nextSeasonYear)).not.toBe(false);
  });

  it('persists dynasty state in memory repository', async () => {
    const store = new MemoryCommissionerRepository();
    const service = new CommissionerService(store);

    store.saveTenure({
      id: 'tenure-2',
      careerId: 'career-2',
      userId: 'user-coach-2',
      dynastyId: DEMO_DYNASTY_ID,
      teamId: 'team-iowa',
      role: 'coach',
      status: 'active',
      startSeasonYear: PLACEHOLDER_DYNASTY.currentSeasonYear,
    });

    await service.advanceToNextSeason(
      service.previewSeasonAdvance().assignments.map((assignment) => ({
        ...assignment,
        action: 'leave',
      }))
    );

    const state = store.getDynastyState(DEMO_DYNASTY_ID, PLACEHOLDER_DYNASTY.currentSeasonYear);
    expect(state.currentSeasonYear).toBe(PLACEHOLDER_DYNASTY.currentSeasonYear + 1);
    expect(state.archivedSeasons.length).toBeGreaterThan(0);
  });
});
