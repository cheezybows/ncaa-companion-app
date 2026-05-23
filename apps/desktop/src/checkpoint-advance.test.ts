import { describe, expect, it } from 'vitest';
import type { DynastyCheckpoint, Player, Roster, TeamRosterSnapshot } from '@ncaa/domain';
import {
  buildDynastyCheckpoint,
  buildProgressionSnapshotsForCheckpoint,
  collectAllProgressionSnapshots,
  getNextWeekNumber,
  isSeniorClass,
  progressionFromSnapshots,
  updatePlayerCatalogFromRosters,
} from './checkpoint-advance.js';

function makePlayer(id: string, overall: number, classYear?: string): Player {
  return {
    id,
    teamId: 'team-a',
    firstName: 'Test',
    lastName: id,
    position: 'QB',
    classYear,
    ratings: { overall },
  };
}

function makeRoster(players: Player[]): Roster {
  return {
    teamId: 'team-a',
    players,
    depthChart: [],
    updatedAt: new Date().toISOString(),
  };
}

describe('checkpoint-advance', () => {
  it('computes next week from prior checkpoints', () => {
    const checkpoints: DynastyCheckpoint[] = [
      {
        id: 'cp-1',
        dynastyId: 'dynasty-demo',
        seasonYear: 2025,
        week: 2,
        type: 'weekly',
        capturedAt: '2025-01-01T00:00:00.000Z',
        rosterSnapshots: [],
      },
    ];
    expect(getNextWeekNumber(checkpoints, 2025)).toBe(3);
    expect(getNextWeekNumber([], 2025)).toBe(0);
  });

  it('builds progression deltas between checkpoints', () => {
    const rosterSnapshots: TeamRosterSnapshot[] = [
      {
        seasonYear: 2025,
        teamId: 'team-a',
        roster: makeRoster([makePlayer('p1', 80)]),
        sourceLabel: 'week 0',
        archivedAt: '2025-01-01T00:00:00.000Z',
        week: 0,
      },
    ];
    const week1: DynastyCheckpoint = {
      id: 'cp-week-1',
      dynastyId: 'dynasty-demo',
      seasonYear: 2025,
      week: 1,
      type: 'weekly',
      capturedAt: '2025-01-08T00:00:00.000Z',
      rosterSnapshots: [
        {
          ...rosterSnapshots[0],
          roster: makeRoster([makePlayer('p1', 84)]),
          week: 1,
        },
      ],
    };

    const snapshots = collectAllProgressionSnapshots([
      {
        id: 'cp-week-0',
        dynastyId: 'dynasty-demo',
        seasonYear: 2025,
        week: 0,
        type: 'weekly',
        capturedAt: '2025-01-01T00:00:00.000Z',
        rosterSnapshots,
      },
      week1,
    ]);

    const week1Snapshots = buildProgressionSnapshotsForCheckpoint({
      checkpoint: week1,
      priorSnapshots: snapshots.filter((item) => item.week === 0),
    });
    expect(week1Snapshots[0]?.overallDelta).toBe(4);

    const progression = progressionFromSnapshots(snapshots);
    expect(progression).toHaveLength(1);
    expect(progression[0]?.snapshots).toHaveLength(2);
  });

  it('classifies departed seniors as graduated and others as transferred', () => {
    const prior: TeamRosterSnapshot[] = [
      {
        seasonYear: 2025,
        teamId: 'team-a',
        roster: makeRoster([
          makePlayer('senior', 90, 'SR'),
          makePlayer('junior', 88, 'JR'),
        ]),
        sourceLabel: 'final',
        archivedAt: '2025-12-01T00:00:00.000Z',
      },
    ];
    const next: TeamRosterSnapshot[] = [
      {
        seasonYear: 2026,
        teamId: 'team-a',
        roster: makeRoster([makePlayer('incoming', 75, 'FR')]),
        sourceLabel: 'opening',
        archivedAt: '2026-08-01T00:00:00.000Z',
      },
    ];

    const catalog = updatePlayerCatalogFromRosters({
      catalog: [],
      priorRosterSnapshots: prior,
      nextRosterSnapshots: next,
      seasonYear: 2026,
    });

    const senior = catalog.find((item) => item.playerId === 'senior');
    const junior = catalog.find((item) => item.playerId === 'junior');
    expect(senior?.exitStatus).toBe('graduated');
    expect(junior?.exitStatus).toBe('transferred');
    expect(catalog.find((item) => item.playerId === 'incoming')?.exitStatus).toBe('active');
  });

  it('detects senior class variants', () => {
    expect(isSeniorClass('SR')).toBe(true);
    expect(isSeniorClass('RS_SR')).toBe(true);
    expect(isSeniorClass('JR')).toBe(false);
  });

  it('creates a dynasty checkpoint with roster snapshots', () => {
    const checkpoint = buildDynastyCheckpoint({
      dynastyId: 'dynasty-demo',
      seasonYear: 2025,
      week: 0,
      type: 'weekly',
      rosterByTeamId: new Map([['team-a', makeRoster([makePlayer('p1', 80)])]]),
      scheduleImports: [],
      archivedSeasons: [],
      archivedRankings: [],
      top25Imports: [],
      postseasonResults: [],
      applyRankingSnapshotsToSeason: (season) => season,
    });

    expect(checkpoint.rosterSnapshots).toHaveLength(1);
    expect(checkpoint.rosterSnapshots[0]?.checkpointId).toBe(checkpoint.id);
  });
});
