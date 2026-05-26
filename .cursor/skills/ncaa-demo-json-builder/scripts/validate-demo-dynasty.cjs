const fs = require('node:fs');

const file = process.argv[2] ?? 'apps/portal/public/temp_screenshots/demo-dynasty.json';
const text = fs.readFileSync(file, 'utf8');
const data = JSON.parse(text);
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const trackedTeamIds = data.importState?.trackedTeamIds ?? [];
const teamIds = new Set((data.teams ?? []).map((team) => team.id));
const rosterKeys = Object.keys(data.rosters ?? {});

assert(data.schemaVersion, 'Missing schemaVersion.');
assert(data.dynasty?.id, 'Missing dynasty.id.');
assert(Array.isArray(data.dynasty?.seasons), 'Missing dynasty.seasons.');
assert(Array.isArray(data.teams), 'Missing teams array.');
assert(data.rosters && typeof data.rosters === 'object', 'Missing rosters object.');
assert(Array.isArray(data.progression), 'Missing progression array.');
assert(Array.isArray(data.checkpoints), 'Missing checkpoints array.');
assert(Array.isArray(data.playerCatalog), 'Missing playerCatalog array.');
assert(Array.isArray(data.users), 'Missing users array.');
assert(Array.isArray(data.coachCareers), 'Missing coachCareers array.');
assert(Array.isArray(data.teamTenures), 'Missing teamTenures array.');
assert(trackedTeamIds.length > 0, 'Missing importState.trackedTeamIds.');

for (const teamId of trackedTeamIds) {
  assert(teamIds.has(teamId), `Tracked team ${teamId} is not present in teams.`);
  assert(rosterKeys.includes(teamId), `Tracked team ${teamId} is not present in rosters.`);
}

for (const [teamId, roster] of Object.entries(data.rosters ?? {})) {
  assert(trackedTeamIds.includes(teamId), `Roster key ${teamId} is not tracked.`);
  assert(roster.teamId === teamId, `Roster ${teamId} has mismatched teamId ${roster.teamId}.`);
  for (const player of roster.players ?? []) {
    assert(player.teamId === teamId, `Player ${player.id} has mismatched teamId ${player.teamId}.`);
  }
}

const activeTenures = (data.teamTenures ?? []).filter((tenure) => tenure.status === 'active');
assert(activeTenures.length > 0, 'No active team tenure found.');
assert(Boolean(data.activeUserId), 'Missing activeUserId.');
assert((data.users ?? []).some((user) => user.id === data.activeUserId), 'activeUserId does not match a user.');

const switchedUsers = new Set();
for (const tenure of data.teamTenures ?? []) {
  assert(teamIds.has(tenure.teamId), `Tenure ${tenure.id} references unknown team ${tenure.teamId}.`);
  if (tenure.status === 'transferred') {
    assert(typeof tenure.endSeasonYear === 'number', `Transferred tenure ${tenure.id} needs endSeasonYear.`);
    switchedUsers.add(tenure.userId);
  }
}
assert(
  activeTenures.some((tenure) => switchedUsers.has(tenure.userId)),
  'Expected one user to have a transferred tenure and a later active tenure.'
);

const seasonYears = (data.dynasty?.seasons ?? []).map((season) => season.year);
assert(seasonYears.length >= 3, 'Expected at least three seasons.');
const currentSeasonYear = data.dynasty?.currentSeasonYear ?? Math.max(...seasonYears);

for (const seasonYear of seasonYears.slice(0, 3)) {
  const seasonCheckpoints = (data.checkpoints ?? []).filter(
    (checkpoint) => checkpoint.seasonYear === seasonYear
  );
  const season = (data.dynasty?.seasons ?? []).find((item) => item.year === seasonYear);
  assert(Boolean(season), `Missing season ${seasonYear}.`);

  for (const teamId of trackedTeamIds) {
    const regularGames = (season?.schedule ?? []).filter(
      (game) => game.week <= 14 && !game.isBye && (game.homeTeamId === teamId || game.awayTeamId === teamId)
    );
    const conferenceGames = regularGames.filter((game) => game.isConferenceGame);
    assert(regularGames.length === 12, `${seasonYear} ${teamId} must have 12 regular-season games.`);
    assert(conferenceGames.length <= 8, `${seasonYear} ${teamId} must have at most 8 conference games.`);
  }

  if (seasonYear < currentSeasonYear) {
    const seasonFinal = seasonCheckpoints.find((checkpoint) => checkpoint.type === 'season_final');
    assert(Boolean(seasonFinal), `Missing season-final checkpoint for completed season ${seasonYear}.`);
    assert(seasonFinal?.week === 16, `${seasonYear} season-final checkpoint should be week 16.`);
    for (const teamId of trackedTeamIds) {
      assert(
        (seasonFinal?.rosterSnapshots ?? []).some(
          (snapshot) => snapshot.teamId === teamId && snapshot.snapshotType === 'season_final'
        ),
        `Missing season-final roster snapshot for ${seasonYear} ${teamId}.`
      );
    }
  } else {
    const weeks = new Set(seasonCheckpoints.map((checkpoint) => checkpoint.week));
    for (let week = 0; week <= 6; week += 1) {
      assert(weeks.has(week), `Missing checkpoint for current season ${seasonYear} week ${week}.`);
    }
  }
}

const forbiddenSyntheticTeams = [
  'Great Plains State',
  'River City',
  'team-great-plains-state',
  'team-river-city',
];
for (const value of forbiddenSyntheticTeams) {
  assert(!text.includes(value), `Synthetic team marker remains: ${value}.`);
}

if (errors.length > 0) {
  console.error(`Demo dynasty validation failed for ${file}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      file,
      teams: data.teams.length,
      trackedTeamIds,
      seasons: data.dynasty.seasons.length,
      checkpoints: data.checkpoints.length,
      users: data.users.length,
      teamTenures: data.teamTenures.length,
    },
    null,
    2
  )
);
