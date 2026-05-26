import { randomUUID } from 'node:crypto';
import type {
  AppUser,
  CoachTeamArchiveBucket,
  DynastyCheckpoint,
  Player,
  PlayerCatalogEntry,
  PlayerExitStatus,
  PlayerProgression,
  PlayerProgressionSnapshot,
  PostseasonResult,
  RankingSnapshot,
  Roster,
  Season,
  Team,
  TeamRosterSnapshot,
  TeamTenure,
  WeekAdvancePreview,
} from '@ncaa/domain';
import type { ScheduleCaptureImport, Top25CaptureImport } from '@ncaa/parsers';
import {
  buildArchivedSeason,
  mergeTeamScheduleIntoSeason,
} from './season-advance.js';

export function getLatestWeekForSeason(
  checkpoints: DynastyCheckpoint[],
  seasonYear: number
): number | null {
  const seasonCheckpoints = checkpoints.filter((item) => item.seasonYear === seasonYear);
  if (seasonCheckpoints.length === 0) return null;
  return Math.max(...seasonCheckpoints.map((item) => item.week));
}

export function getNextWeekNumber(
  checkpoints: DynastyCheckpoint[],
  seasonYear: number
): number {
  const latest = getLatestWeekForSeason(checkpoints, seasonYear);
  return latest === null ? 0 : latest + 1;
}

export function isSeniorClass(classYear?: string): boolean {
  if (!classYear) return false;
  const normalized = classYear.trim().toUpperCase().replace(/\s+/g, '_');
  return normalized === 'SR' || normalized === 'RS_SR' || normalized.includes('SR');
}

export function buildCheckpointRosterSnapshots(input: {
  checkpointId: string;
  seasonYear: number;
  week: number;
  type: DynastyCheckpoint['type'];
  rosterByTeamId: Map<string, Roster>;
  sourceLabel: string;
}): TeamRosterSnapshot[] {
  const archivedAt = new Date().toISOString();
  const snapshots: TeamRosterSnapshot[] = [];
  for (const [teamId, roster] of input.rosterByTeamId) {
    snapshots.push({
      seasonYear: input.seasonYear,
      teamId,
      roster: structuredClone(roster),
      sourceLabel: input.sourceLabel,
      archivedAt,
      week: input.week,
      checkpointId: input.checkpointId,
      snapshotType: input.type === 'season_final' ? 'season_final' : 'weekly',
    });
  }
  return snapshots;
}

export function buildScheduleSnapshotForSeason(input: {
  dynastyId: string;
  seasonYear: number;
  scheduleImports: ScheduleCaptureImport[];
  archivedSeasons: Season[];
  applyRankingSnapshotsToSeason: (season: Season, rankings: RankingSnapshot[]) => Season;
  archivedRankings: RankingSnapshot[];
  top25Imports: Top25CaptureImport[];
}): SeasonScheduleSnapshot | undefined {
  const rankings = [
    ...input.archivedRankings,
    ...input.top25Imports.map((item) => item.rankings),
  ];
  const season = buildArchivedSeason(
    input.dynastyId,
    input.seasonYear,
    input.scheduleImports,
    rankings,
    input.applyRankingSnapshotsToSeason
  );
  if (season.schedule.length === 0) return undefined;
  return {
    seasonYear: input.seasonYear,
    schedule: structuredClone(season.schedule),
    standings: structuredClone(season.standings),
  };
}

export interface SeasonScheduleSnapshot {
  seasonYear: number;
  schedule: Season['schedule'];
  standings: Season['standings'];
}

export function getLatestRankingSnapshot(input: {
  seasonYear: number;
  archivedRankings: RankingSnapshot[];
  top25Imports: Top25CaptureImport[];
}): RankingSnapshot | undefined {
  const candidates = [
    ...input.archivedRankings.filter(
      (item) => item.seasonYear === input.seasonYear && item.pollType === 'top25'
    ),
    ...input.top25Imports
      .filter((item) => item.rankings.seasonYear === input.seasonYear)
      .map((item) => item.rankings),
  ];
  return candidates.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
}

export function findPriorPlayerSnapshot(
  snapshots: PlayerProgressionSnapshot[],
  playerId: string,
  seasonYear: number,
  week: number
): PlayerProgressionSnapshot | undefined {
  return snapshots
    .filter(
      (item) =>
        item.playerId === playerId &&
        (item.seasonYear < seasonYear || (item.seasonYear === seasonYear && (item.week ?? -1) < week))
    )
    .sort((a, b) => {
      const seasonDiff = b.seasonYear - a.seasonYear;
      if (seasonDiff !== 0) return seasonDiff;
      return (b.week ?? -1) - (a.week ?? -1);
    })[0];
}

export function buildProgressionSnapshotsForCheckpoint(input: {
  checkpoint: DynastyCheckpoint;
  priorSnapshots: PlayerProgressionSnapshot[];
}): PlayerProgressionSnapshot[] {
  const capturedAt = input.checkpoint.capturedAt;
  const next: PlayerProgressionSnapshot[] = [];

  for (const rosterSnapshot of input.checkpoint.rosterSnapshots) {
    for (const player of rosterSnapshot.roster.players) {
      const prior = findPriorPlayerSnapshot(
        input.priorSnapshots,
        player.id,
        input.checkpoint.seasonYear,
        input.checkpoint.week
      );
      const overall = player.ratings.overall;
      const priorOverall = prior?.ratings.overall;
      const overallDelta =
        overall !== undefined && priorOverall !== undefined ? overall - priorOverall : undefined;

      next.push({
        id: randomUUID(),
        playerId: player.id,
        teamId: rosterSnapshot.teamId,
        capturedAt,
        seasonYear: input.checkpoint.seasonYear,
        week: input.checkpoint.week,
        label:
          input.checkpoint.type === 'season_final'
            ? `Season ${input.checkpoint.seasonYear} final`
            : `Week ${input.checkpoint.week}`,
        ratings: structuredClone(player.ratings),
        overallDelta,
      });
    }
  }

  return next;
}

export function progressionFromSnapshots(snapshots: PlayerProgressionSnapshot[]): PlayerProgression[] {
  const byPlayer = new Map<string, PlayerProgression>();

  for (const snapshot of snapshots) {
    const existing = byPlayer.get(snapshot.playerId);
    if (existing) {
      existing.snapshots.push(snapshot);
      continue;
    }
    byPlayer.set(snapshot.playerId, {
      playerId: snapshot.playerId,
      playerName: snapshot.playerId,
      teamId: snapshot.teamId,
      position: 'ATH',
      snapshots: [snapshot],
    });
  }

  for (const progression of byPlayer.values()) {
    progression.snapshots.sort((a, b) => {
      const seasonDiff = a.seasonYear - b.seasonYear;
      if (seasonDiff !== 0) return seasonDiff;
      return (a.week ?? -1) - (b.week ?? -1);
    });
    const latest = progression.snapshots.at(-1);
    if (latest) {
      progression.teamId = latest.teamId;
    }
  }

  return [...byPlayer.values()];
}

export function enrichProgressionNames(
  progression: PlayerProgression[],
  rosterSnapshots: TeamRosterSnapshot[]
): PlayerProgression[] {
  const playerById = new Map<string, Player>();
  for (const snapshot of rosterSnapshots) {
    for (const player of snapshot.roster.players) {
      playerById.set(player.id, player);
    }
  }

  return progression.map((item) => {
    const player = playerById.get(item.playerId);
    if (!player) return item;
    return {
      ...item,
      playerName: `${player.firstName} ${player.lastName}`.trim(),
      position: player.position,
      teamId: player.teamId,
    };
  });
}

export function collectAllProgressionSnapshots(checkpoints: DynastyCheckpoint[]): PlayerProgressionSnapshot[] {
  const all: PlayerProgressionSnapshot[] = [];
  const sorted = [...checkpoints].sort((a, b) => {
    const seasonDiff = a.seasonYear - b.seasonYear;
    if (seasonDiff !== 0) return seasonDiff;
    return a.week - b.week;
  });

  for (const checkpoint of sorted) {
    all.push(...buildProgressionSnapshotsForCheckpoint({ checkpoint, priorSnapshots: all }));
  }

  return all;
}

export function buildWeekAdvancePreview(input: {
  dynastyId: string;
  currentSeasonYear: number;
  checkpoints: DynastyCheckpoint[];
  scheduleImports: ScheduleCaptureImport[];
  top25Imports: Top25CaptureImport[];
  rosterByTeamId: Map<string, Roster>;
  postseasonResults: PostseasonResult[];
}): WeekAdvancePreview {
  const nextWeek = getNextWeekNumber(input.checkpoints, input.currentSeasonYear);
  const scheduleSnapshot = buildScheduleSnapshotForSeason({
    dynastyId: input.dynastyId,
    seasonYear: input.currentSeasonYear,
    scheduleImports: input.scheduleImports,
    archivedSeasons: [],
    applyRankingSnapshotsToSeason: (season) => season,
    archivedRankings: [],
    top25Imports: input.top25Imports,
  });

  let rosterPlayerCount = 0;
  for (const roster of input.rosterByTeamId.values()) {
    rosterPlayerCount += roster.players.length;
  }

  return {
    currentSeasonYear: input.currentSeasonYear,
    nextWeek,
    teamCount: input.rosterByTeamId.size,
    rosterPlayerCount,
    scheduleGameCount: scheduleSnapshot?.schedule.length ?? 0,
    hasTop25: input.top25Imports.some((item) => item.rankings.seasonYear === input.currentSeasonYear),
    postseasonResultCount: input.postseasonResults.filter(
      (item) => item.seasonYear === input.currentSeasonYear
    ).length,
  };
}

export function buildDynastyCheckpoint(input: {
  dynastyId: string;
  seasonYear: number;
  week: number;
  type: DynastyCheckpoint['type'];
  rosterByTeamId: Map<string, Roster>;
  scheduleImports: ScheduleCaptureImport[];
  archivedSeasons: Season[];
  archivedRankings: RankingSnapshot[];
  top25Imports: Top25CaptureImport[];
  postseasonResults: PostseasonResult[];
  applyRankingSnapshotsToSeason: (season: Season, rankings: RankingSnapshot[]) => Season;
  notes?: string;
}): DynastyCheckpoint {
  const checkpointId = randomUUID();
  const capturedAt = new Date().toISOString();
  const sourceLabel =
    input.type === 'season_final'
      ? `Season ${input.seasonYear} final checkpoint`
      : `Week ${input.week} checkpoint`;

  return {
    id: checkpointId,
    dynastyId: input.dynastyId,
    seasonYear: input.seasonYear,
    week: input.week,
    type: input.type,
    capturedAt,
    rosterSnapshots: buildCheckpointRosterSnapshots({
      checkpointId,
      seasonYear: input.seasonYear,
      week: input.week,
      type: input.type,
      rosterByTeamId: input.rosterByTeamId,
      sourceLabel,
    }),
    scheduleSnapshot: buildScheduleSnapshotForSeason({
      dynastyId: input.dynastyId,
      seasonYear: input.seasonYear,
      scheduleImports: input.scheduleImports,
      archivedSeasons: input.archivedSeasons,
      applyRankingSnapshotsToSeason: input.applyRankingSnapshotsToSeason,
      archivedRankings: input.archivedRankings,
      top25Imports: input.top25Imports,
    }),
    rankingSnapshot: getLatestRankingSnapshot({
      seasonYear: input.seasonYear,
      archivedRankings: input.archivedRankings,
      top25Imports: input.top25Imports,
    }),
    postseasonResults: input.postseasonResults.filter((item) => item.seasonYear === input.seasonYear),
    notes: input.notes,
  };
}

function upsertTeamSpan(
  catalog: PlayerCatalogEntry,
  teamId: string,
  seasonYear: number
): void {
  const span = catalog.teams.find((item) => item.teamId === teamId);
  if (!span) {
    catalog.teams.push({
      teamId,
      seasonYears: [seasonYear],
      firstSeenSeasonYear: seasonYear,
      lastSeenSeasonYear: seasonYear,
    });
    return;
  }
  if (!span.seasonYears.includes(seasonYear)) {
    span.seasonYears.push(seasonYear);
    span.seasonYears.sort((a, b) => a - b);
  }
  span.firstSeenSeasonYear = Math.min(span.firstSeenSeasonYear, seasonYear);
  span.lastSeenSeasonYear = Math.max(span.lastSeenSeasonYear, seasonYear);
}

export function updatePlayerCatalogFromRosters(input: {
  catalog: PlayerCatalogEntry[];
  priorRosterSnapshots: TeamRosterSnapshot[];
  nextRosterSnapshots: TeamRosterSnapshot[];
  seasonYear: number;
}): PlayerCatalogEntry[] {
  const catalogById = new Map(
    input.catalog.map((item) => [item.playerId, { ...item, teams: [...item.teams], classHistory: [...item.classHistory] }])
  );

  const priorPlayers = new Map<string, { player: Player; teamId: string }>();
  for (const snapshot of input.priorRosterSnapshots) {
    for (const player of snapshot.roster.players) {
      priorPlayers.set(player.id, { player, teamId: snapshot.teamId });
    }
  }

  const nextPlayers = new Map<string, { player: Player; teamId: string }>();
  for (const snapshot of input.nextRosterSnapshots) {
    for (const player of snapshot.roster.players) {
      nextPlayers.set(player.id, { player, teamId: snapshot.teamId });
    }
  }

  for (const [playerId, { player, teamId }] of nextPlayers) {
    const existing = catalogById.get(playerId);
    if (existing) {
      upsertTeamSpan(existing, teamId, input.seasonYear);
      if (player.classYear && !existing.classHistory.includes(player.classYear)) {
        existing.classHistory.push(player.classYear);
      }
      existing.lastSeenSeasonYear = Math.max(existing.lastSeenSeasonYear, input.seasonYear);
      existing.position = player.position;
      existing.exitStatus = 'active';
      existing.exitSeasonYear = undefined;
      existing.exitTeamId = undefined;
      catalogById.set(playerId, existing);
      continue;
    }

    catalogById.set(playerId, {
      playerId,
      firstName: player.firstName,
      lastName: player.lastName,
      position: player.position,
      teams: [
        {
          teamId,
          seasonYears: [input.seasonYear],
          firstSeenSeasonYear: input.seasonYear,
          lastSeenSeasonYear: input.seasonYear,
        },
      ],
      classHistory: player.classYear ? [player.classYear] : [],
      firstSeenSeasonYear: input.seasonYear,
      lastSeenSeasonYear: input.seasonYear,
      exitStatus: 'active',
    });
  }

  for (const [playerId, { player, teamId }] of priorPlayers) {
    if (nextPlayers.has(playerId)) continue;
    const existing = catalogById.get(playerId) ?? {
      playerId,
      firstName: player.firstName,
      lastName: player.lastName,
      position: player.position,
      teams: [],
      classHistory: player.classYear ? [player.classYear] : [],
      firstSeenSeasonYear: input.seasonYear - 1,
      lastSeenSeasonYear: input.seasonYear - 1,
      exitStatus: 'unknown' as PlayerExitStatus,
    };

    upsertTeamSpan(existing, teamId, input.seasonYear - 1);
    if (player.classYear && !existing.classHistory.includes(player.classYear)) {
      existing.classHistory.push(player.classYear);
    }

    const exitStatus: PlayerExitStatus = isSeniorClass(player.classYear) ? 'graduated' : 'transferred';
    existing.exitStatus = exitStatus;
    existing.exitSeasonYear = input.seasonYear - 1;
    existing.exitTeamId = teamId;
    existing.lastSeenSeasonYear = Math.max(existing.lastSeenSeasonYear, input.seasonYear - 1);
    catalogById.set(playerId, existing);
  }

  return [...catalogById.values()].sort((a, b) =>
    `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)
  );
}

export function applyPostseasonAchievementsToSeason(
  season: Season,
  postseasonResults: PostseasonResult[]
): Season {
  const forSeason = postseasonResults.filter((item) => item.seasonYear === season.year);
  const conferenceChampionTeamIds = [
    ...new Set(
      forSeason
        .filter((item) => item.kind === 'conference_championship' && item.isChampion)
        .map((item) => item.teamId)
    ),
  ];
  const playoffTeamIds = [
    ...new Set(forSeason.filter((item) => item.kind === 'playoff').map((item) => item.teamId)),
  ];
  const nationalChampion =
    forSeason.find((item) => item.kind === 'national_championship' && item.isChampion) ??
    forSeason.find(
      (item) =>
        item.isChampion &&
        /\bnational\b/i.test(`${item.titleLabel ?? ''} ${item.round ?? ''}`)
    );

  return {
    ...season,
    conferenceChampionTeamIds,
    playoffTeamIds,
    nationalChampionTeamId: nationalChampion?.teamId ?? season.nationalChampionTeamId,
  };
}

export function buildCoachTeamArchiveBuckets(input: {
  tenures: TeamTenure[];
  users: AppUser[];
  teams: Team[];
  checkpoints: DynastyCheckpoint[];
}): CoachTeamArchiveBucket[] {
  const userById = new Map(input.users.map((user) => [user.id, user]));
  const teamById = new Map(input.teams.map((team) => [team.id, team]));
  const buckets: CoachTeamArchiveBucket[] = [];

  for (const tenure of input.tenures) {
    const start = tenure.startSeasonYear;
    const end = tenure.endSeasonYear ?? tenure.startSeasonYear;
    const seasonYears: number[] = [];
    for (let year = start; year <= end; year += 1) {
      seasonYears.push(year);
    }

    const checkpointIds = input.checkpoints
      .filter(
        (checkpoint) =>
          seasonYears.includes(checkpoint.seasonYear) &&
          checkpoint.rosterSnapshots.some((snapshot) => snapshot.teamId === tenure.teamId)
      )
      .map((checkpoint) => checkpoint.id);

    buckets.push({
      tenureId: tenure.id,
      userId: tenure.userId,
      coachName: userById.get(tenure.userId)?.displayName ?? tenure.userId,
      teamId: tenure.teamId,
      teamName: teamById.get(tenure.teamId)?.name ?? tenure.teamId,
      startSeasonYear: start,
      endSeasonYear: tenure.endSeasonYear,
      seasonYears,
      checkpointIds,
    });
  }

  return buckets.sort(
    (a, b) => b.startSeasonYear - a.startSeasonYear || a.coachName.localeCompare(b.coachName)
  );
}

export { mergeTeamScheduleIntoSeason };
