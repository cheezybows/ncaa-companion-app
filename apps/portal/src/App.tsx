import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom';
import {
  DEMO_DYNASTY_ID,
  PLACEHOLDER_CONFERENCES,
  PLACEHOLDER_DYNASTY,
  PLACEHOLDER_PROGRESSION,
  PLACEHOLDER_TEAMS,
} from '@ncaa/domain';
import type {
  AppUser,
  Player,
  PlayerAbility,
  PlayerProgression,
  PlayerProgressionSnapshot,
  ScheduleGame,
  Team,
  TeamTenure,
} from '@ncaa/domain';
import { roleLabel } from '@ncaa/auth';
import { fetchTenures, fetchUsers } from './api';
import { DynastyDataProvider, useDynastyData } from './dynasty-data-context';
import { listDemoUsers, useAuth } from './auth-context';

const DYNASTY_ID = DEMO_DYNASTY_ID;
type RosterSortKey =
  | 'jersey'
  | 'name'
  | 'devTrait'
  | 'position'
  | 'class'
  | 'overall'
  | 'speed'
  | 'acceleration'
  | 'changeOfDirection';
type SortDirection = 'asc' | 'desc';

export function App() {
  const { session, loading } = useAuth();

  if (loading) return <div className="sign-in-page">Loading...</div>;
  if (!session) {
    return (
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    );
  }

  const defaultPath = `/portal/dynasties/${DYNASTY_ID}/my-team`;

  return (
    <Routes>
      <Route path="/sign-in" element={<Navigate to={defaultPath} replace />} />
      <Route path="/portal/dynasties/:dynastyId/*" element={<PortalLayout />} />
      <Route path="*" element={<Navigate to={defaultPath} replace />} />
    </Routes>
  );
}

function SignInPage() {
  const { signIn } = useAuth();
  const users = listDemoUsers().filter((user) => user.role === 'coach');
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    setMessage('');
    try {
      await signIn(selectedUserId, password);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sign-in-page">
      <div className="panel sign-in-card">
        <img
          className="sign-in-logo commissioner-logo"
          src="/college-football-comissioner-app-logo.svg"
          alt="College Football Commissioner App"
        />
        <p className="eyebrow">Dynasty Coach Portal</p>
        <h1>Sign In</h1>
        <p className="muted">
          Coach accounts only. Commissioners use the desktop app to assign teams and publish data.
        </p>
        <div className="sign-in-form">
          <label>
            Account
            <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} ({user.email})
                </option>
              ))}
            </select>
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Demo password: password"
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleSignIn();
              }}
            />
          </label>
          <button onClick={() => void handleSignIn()} disabled={busy || !selectedUserId || !password}>
            {busy ? 'Signing in...' : 'Sign In'}
          </button>
          {message && <p className="error-text">{message}</p>}
        </div>
      </div>
    </div>
  );
}

function PortalLayout() {
  const { session, signOut } = useAuth();
  const { dynastyId = DYNASTY_ID } = useParams();
  const nav = [
    { to: `/portal/dynasties/${dynastyId}/my-team`, label: 'Home', end: true },
    { to: `/portal/dynasties/${dynastyId}/team`, label: 'Team' },
    { to: `/portal/dynasties/${dynastyId}/progression`, label: 'Progression' },
    { to: `/portal/dynasties/${dynastyId}/career`, label: 'Career' },
    { to: `/portal/dynasties/${dynastyId}/archive`, label: 'Archive' },
  ];

  return (
    <DynastyDataProvider dynastyId={dynastyId}>
      <Shell
        title="Coach Portal"
        subtitle="Published dynasty data from the commissioner desktop app."
        user={session!.user.displayName}
        role={roleLabel(session!.user.role)}
        nav={nav}
        onSignOut={signOut}
        lockedTeam={session?.activeTenure?.teamId}
      >
        <Routes>
          <Route index element={<Navigate to="my-team" replace />} />
          <Route path="my-team" element={<CoachSeasonHomePage />} />
          <Route path="team" element={<CoachTeamPage />} />
          <Route path="progression" element={<CoachProgressionPage />} />
          <Route path="career" element={<CoachCareerPage />} />
          <Route path="archive" element={<CoachArchivePage />} />
        </Routes>
      </Shell>
    </DynastyDataProvider>
  );
}

function Shell({
  title,
  subtitle,
  user,
  role,
  nav,
  onSignOut,
  lockedTeam,
  children,
}: {
  title: string;
  subtitle: string;
  user: string;
  role: string;
  nav: { to: string; label: string; end?: boolean }[];
  onSignOut: () => void;
  lockedTeam?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <img
            className="sidebar-logo commissioner-logo"
            src="/college-football-comissioner-app-logo.svg"
            alt="College Football Commissioner App"
          />
          <p className="eyebrow">Dynasty Coach Portal</p>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
        </div>
        <nav>
          {nav.map((item) => (
            <NavItem key={item.to} to={item.to} label={item.label} end={item.end} />
          ))}
        </nav>
        <div className="sidebar-card">
          <span>Signed in</span>
          <strong>{user}</strong>
          <small>{role}</small>
          {lockedTeam && (
            <small>Locked team: {teamName(lockedTeam, PLACEHOLDER_TEAMS)}</small>
          )}
        </div>
        <button className="secondary" onClick={onSignOut}>
          Sign Out
        </button>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

function NavItem({ to, label, end }: { to: string; label: string; end?: boolean }) {
  const location = useLocation();
  const active = end ? location.pathname === to : location.pathname.startsWith(to);
  return (
    <Link className={active ? 'nav-link active' : 'nav-link'} to={to}>
      {label}
    </Link>
  );
}

function CoachSeasonHomePage() {
  const { session } = useAuth();
  const { dynastyId = DYNASTY_ID } = useParams();
  const { rosters, progression, teams, dynasty } = useDynastyData();
  const teamId = session?.activeTenure?.teamId;
  const roster = teamId ? rosters[teamId] : undefined;
  const [coachUsers, setCoachUsers] = useState<AppUser[]>([]);
  const [tenuresByUser, setTenuresByUser] = useState<Record<string, TeamTenure[]>>({});

  useEffect(() => {
    async function loadUserTeams() {
      const coaches = (await fetchUsers()).filter(
        (user) => user.role === 'coach' && (user.accessStatus ?? 'active') === 'active'
      );
      const entries = await Promise.all(
        coaches.map(async (user) => [user.id, await fetchTenures(user.id, dynastyId)] as const)
      );
      setCoachUsers(coaches);
      setTenuresByUser(Object.fromEntries(entries));
    }

    void loadUserTeams();
  }, [dynastyId]);

  if (!teamId) {
    return (
      <section className="panel">
        <h3>No Active Team</h3>
        <p className="muted">The commissioner has not assigned you an active team yet.</p>
      </section>
    );
  }

  const teamSchedule = getTeamSchedule(teamId, dynasty);
  const record = getTeamRecord(teamId, teamSchedule);
  const conference = conferenceName(teamConference(teamId, teams));
  const conferenceRecord = getConferenceRecord(teamId, teamSchedule, teams);
  const userTeamIds = new Set(
    Object.values(tenuresByUser)
      .flat()
      .filter((tenure) => tenure.status === 'active')
      .map((tenure) => tenure.teamId)
  );
  const userGames = teamSchedule.filter((game) => isUserGameForTeam(game, teamId, userTeamIds));
  const userGameRecord = getTeamRecord(teamId, userGames);
  const topPlayers = [...(roster?.players ?? [])]
    .sort((a, b) => (b.ratings.overall ?? 0) - (a.ratings.overall ?? 0))
    .slice(0, 3);
  const progressionLeaders = progression.filter((item) => item.teamId === teamId)
    .map((item) => {
      const ordered = [...item.snapshots].sort(
        (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
      );
      const first = ordered[0]?.ratings.overall ?? 0;
      const latest = ordered.at(-1)?.ratings.overall ?? first;
      return { ...item, first, latest, gain: latest - first };
    })
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);
  const top25 = getCurrentTop25(teams, dynasty);
  const currentRank = top25.find((row) => row.team.id === teamId)?.rank;

  return (
    <section className="grid two">
      <div className="panel full">
        <p className="eyebrow">Coach Home</p>
        <h3>{teamName(teamId, teams)} Season Dashboard</h3>
        <div className="metric-grid">
          <Metric label="Record" value={`${record.wins}-${record.losses}`} />
          <Metric label={`Conference - ${conference}`} value={`${conferenceRecord.wins}-${conferenceRecord.losses}`} />
          <Metric label="Current Rank" value={currentRank ? `#${currentRank}` : 'NR'} />
          <UserGamesMetric
            games={userGames.length}
            record={`${userGameRecord.wins}-${userGameRecord.losses}`}
          />
        </div>
      </div>

      <div className="panel full">
        <h3>Schedule</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Week</th>
                <th>Opponent</th>
                <th>Site</th>
                <th>Status</th>
                <th>User Game</th>
              </tr>
            </thead>
            <tbody>
              {teamSchedule.map((game) => {
                const opponentId = game.homeTeamId === teamId ? game.awayTeamId : game.homeTeamId;
                const isUserGame = isUserGameForTeam(game, teamId, userTeamIds);
                return (
                  <tr key={game.id} className={isUserGame ? 'user-game-row' : undefined}>
                    <td>{game.week}</td>
                    <td>{game.isBye ? 'BYE' : teamName(opponentId, teams)}</td>
                    <td>{game.isBye ? 'BYE' : game.homeTeamId === teamId ? 'Home' : 'Away'}</td>
                    <td>{formatGameResultForTeam(game, teamId)}</td>
                    <td>
                      {isUserGame ? (
                        <span className="user-game-badge">
                          vs {activeCoachForTeam(opponentId, tenuresByUser, coachUsers)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>Current Top 25</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {top25.length === 0 && (
                <tr>
                  <td colSpan={3}>No Top 25 upload published yet.</td>
                </tr>
              )}
              {top25.map((row) => {
                const isUserTeam = userTeamIds.has(row.team.id);
                const isCurrentCoachTeam = row.team.id === teamId;
                return (
                  <tr key={row.team.id} className={isUserTeam ? 'ranked-user-row' : undefined}>
                    <td>{row.rank}</td>
                    <td>
                      {isCurrentCoachTeam && <span className="rank-star">★</span>}
                      {row.team.name}
                    </td>
                    <td>
                      {row.wins}-{row.losses}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>Team Leaders</h3>
        <div className="leader-list">
          <h4>Highest Rated</h4>
          {topPlayers.map((player) => (
            <Link
              className="leader-card leader-card-link"
              key={player.id}
              to={`/portal/dynasties/${dynastyId}/team?player=${player.id}`}
            >
              <strong>{player.firstName} {player.lastName}</strong>
              <span>{player.position} · OVR {player.ratings.overall ?? '-'}</span>
            </Link>
          ))}
          <h4>Highest Progression</h4>
          {progressionLeaders.length === 0 && <p className="muted">No progression records yet.</p>}
          {progressionLeaders.map((player) => (
            <Link
              className="leader-card leader-card-link"
              key={player.playerId}
              to={`/portal/dynasties/${dynastyId}/team?player=${player.playerId}`}
            >
              <strong>{player.playerName}</strong>
              <span>{player.position} · +{player.gain} OVR ({player.first} to {player.latest})</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function CoachTeamPage() {
  const { session } = useAuth();
  const { rosters, progression: publishedProgression, teams } = useDynastyData();
  const [searchParams] = useSearchParams();
  const teamId = session?.activeTenure?.teamId;
  const roster = teamId ? rosters[teamId] : undefined;
  const requestedPlayerId = searchParams.get('player') ?? '';
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph');
  const [positionFilter, setPositionFilter] = useState('all');
  const [rosterSort, setRosterSort] = useState<{ key: RosterSortKey; direction: SortDirection }>({
    key: 'overall',
    direction: 'desc',
  });

  const players = roster?.players ?? [];
  const positionOptions = useMemo(() => {
    return Array.from(new Set(players.map((player) => player.position))).sort(
      (a, b) => positionSortValue(a) - positionSortValue(b)
    );
  }, [players]);
  const sortedPlayers = useMemo(() => {
    const filteredPlayers =
      positionFilter === 'all'
        ? players
        : players.filter((player) => normalizePosition(player.position) === normalizePosition(positionFilter));

    return [...filteredPlayers].sort((a, b) => {
      const direction = rosterSort.direction === 'asc' ? 1 : -1;
      if (rosterSort.key === 'jersey') {
        const jerseyDelta = (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999);
        if (jerseyDelta !== 0) return jerseyDelta * direction;
      }
      if (rosterSort.key === 'name') {
        return `${a.lastName}, ${a.firstName}`.localeCompare(`${b.lastName}, ${b.firstName}`) * direction;
      }
      if (rosterSort.key === 'position') {
        const positionDelta = positionSortValue(a.position) - positionSortValue(b.position);
        if (positionDelta !== 0) return positionDelta * direction;
      }
      if (rosterSort.key === 'class') {
        const classDelta = classSortValue(a.classYear) - classSortValue(b.classYear);
        if (classDelta !== 0) return classDelta * direction;
      }
      if (rosterSort.key === 'devTrait') {
        const traitDelta = devTraitSortValue(a.developmentTrait) - devTraitSortValue(b.developmentTrait);
        if (traitDelta !== 0) return traitDelta * direction;
      }
      if (rosterSort.key === 'overall') {
        const overallDelta = (a.ratings.overall ?? 0) - (b.ratings.overall ?? 0);
        if (overallDelta !== 0) return overallDelta * direction;
      }
      if (rosterSort.key === 'speed') {
        const speedDelta = (a.ratings.speed ?? 0) - (b.ratings.speed ?? 0);
        if (speedDelta !== 0) return speedDelta * direction;
      }
      if (rosterSort.key === 'changeOfDirection') {
        const codDelta = (a.ratings.changeOfDirection ?? 0) - (b.ratings.changeOfDirection ?? 0);
        if (codDelta !== 0) return codDelta * direction;
      }
      if (rosterSort.key === 'acceleration') {
        const accelDelta = (a.ratings.acceleration ?? 0) - (b.ratings.acceleration ?? 0);
        if (accelDelta !== 0) return accelDelta * direction;
      }
      return `${a.lastName}, ${a.firstName}`.localeCompare(`${b.lastName}, ${b.firstName}`) * direction;
    });
  }, [players, positionFilter, rosterSort]);
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? sortedPlayers[0] ?? players[0];
  const selectedProgression = selectedPlayer
    ? getProgressionForPlayer(selectedPlayer, teamId ?? '', publishedProgression)
    : undefined;
  const selectedAbilityProfile = selectedPlayer ? getAbilityProfileForPlayer(selectedPlayer) : undefined;

  useEffect(() => {
    const requestedPlayer = roster?.players.find((player) => player.id === requestedPlayerId);
    setSelectedPlayerId(requestedPlayer?.id ?? '');
    setPositionFilter('all');
  }, [requestedPlayerId, roster, teamId]);

  function handleRosterSort(key: RosterSortKey) {
    setRosterSort((current) => ({
      key,
      direction:
        current.key === key
          ? current.direction === 'asc'
            ? 'desc'
            : 'asc'
          : defaultRosterSortDirection(key),
    }));
  }

  if (!teamId) {
    return (
      <section className="panel">
        <h3>No Active Team</h3>
        <p className="muted">The commissioner has not assigned you an active team yet.</p>
      </section>
    );
  }

  return (
    <section className="grid two">
      <div className="panel full">
        <p className="eyebrow">Team</p>
        <h3>{teamName(teamId, teams)} Roster</h3>
        <p className="muted">
          Click a player to open their progression detail. SPD, ACC, and COD are always shown.
        </p>
      </div>

      <div className="panel full">
        <div className="section-header">
          <div>
            <h3>Roster</h3>
            <p className="muted">Filter by position, then click a table title to sort.</p>
          </div>
          <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)}>
            <option value="all">All Positions</option>
            {positionOptions.map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortableHeader
                  label="#"
                  sortKey="jersey"
                  activeSort={rosterSort}
                  onSort={handleRosterSort}
                />
                <SortableHeader
                  label="Player"
                  sortKey="name"
                  activeSort={rosterSort}
                  onSort={handleRosterSort}
                />
                <SortableHeader
                  label="Dev"
                  sortKey="devTrait"
                  activeSort={rosterSort}
                  onSort={handleRosterSort}
                />
                <SortableHeader
                  label="Pos"
                  sortKey="position"
                  activeSort={rosterSort}
                  onSort={handleRosterSort}
                />
                <SortableHeader
                  label="Year"
                  sortKey="class"
                  activeSort={rosterSort}
                  onSort={handleRosterSort}
                />
                <SortableHeader
                  label="OVR"
                  sortKey="overall"
                  activeSort={rosterSort}
                  onSort={handleRosterSort}
                />
                <SortableHeader
                  label="SPD"
                  sortKey="speed"
                  activeSort={rosterSort}
                  onSort={handleRosterSort}
                />
                <SortableHeader
                  label="ACC"
                  sortKey="acceleration"
                  activeSort={rosterSort}
                  onSort={handleRosterSort}
                />
                <SortableHeader
                  label="COD"
                  sortKey="changeOfDirection"
                  activeSort={rosterSort}
                  onSort={handleRosterSort}
                />
                <th>Key Stats</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((player) => (
                <tr
                  key={player.id}
                  className={player.id === selectedPlayer?.id ? 'player-row selected-player-row' : 'player-row'}
                  onClick={() => setSelectedPlayerId(player.id)}
                >
                  <td>{player.jerseyNumber ?? '-'}</td>
                  <td>
                    {player.firstName} {player.lastName}
                  </td>
                  <td>{formatDevTrait(player.developmentTrait)}</td>
                  <td>{player.position}</td>
                  <td>{player.classYear ?? '-'}</td>
                  <td>{player.ratings.overall ?? '-'}</td>
                  <td>{player.ratings.speed ?? '-'}</td>
                  <td>{player.ratings.acceleration ?? '-'}</td>
                  <td>{player.ratings.changeOfDirection ?? '-'}</td>
                  <td>
                    <div className="key-stat-list">
                      {importantStatsForPosition(player).map((stat) => (
                        <span key={stat.label} className="key-stat-chip">
                          <em>{stat.label}</em>
                          <strong>{stat.value}</strong>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPlayer && (
        <div className="panel full">
          <div className="section-header">
            <div>
              <h3>
                {selectedPlayer.firstName} {selectedPlayer.lastName} Progression
              </h3>
              <p className="muted">
                {selectedPlayer.position} · {selectedPlayer.classYear ?? 'Class TBD'} · OVR{' '}
                {selectedPlayer.ratings.overall ?? '-'}
              </p>
              {selectedAbilityProfile &&
                (selectedAbilityProfile.archetype || selectedAbilityProfile.traits.length > 0) && (
                <div className="ability-summary">
                  {selectedAbilityProfile.archetype && (
                    <span className="ability-pill ability-pill--archetype">
                      Archetype: <strong>{selectedAbilityProfile.archetype.name}</strong>
                    </span>
                  )}
                  {selectedAbilityProfile.traits.length > 0 && (
                    <div className="ability-traits">
                      <span className="ability-traits-label">Traits</span>
                      {selectedAbilityProfile.traits.map((ability) => (
                        <span key={ability.id} className="ability-pill ability-pill--trait">
                          <strong>{ability.name}</strong>
                          {ability.level && <em>{formatAbilityLevel(ability.level)}</em>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                )}
            </div>
            <div className="view-toggle" role="group" aria-label="Player progression view">
              <button
                className={viewMode === 'graph' ? 'active' : 'secondary'}
                onClick={() => setViewMode('graph')}
              >
                Graph
              </button>
              <button
                className={viewMode === 'table' ? 'active' : 'secondary'}
                onClick={() => setViewMode('table')}
              >
                Table
              </button>
            </div>
          </div>

          {selectedProgression ? (
            viewMode === 'graph' ? (
              <ProgressionLineChart snapshots={selectedProgression.snapshots} />
            ) : (
              <DataTable
                headers={['Year', 'Snapshot', 'OVR', 'Delta', 'AWR', 'SPD']}
                rows={selectedProgression.snapshots.map((snapshot) => [
                  snapshot.seasonYear.toString(),
                  snapshot.label ?? new Date(snapshot.capturedAt).toLocaleDateString(),
                  snapshot.ratings.overall?.toString() ?? '-',
                  snapshot.overallDelta ? `+${snapshot.overallDelta}` : '-',
                  snapshot.ratings.awareness?.toString() ?? '-',
                  snapshot.ratings.speed?.toString() ?? '-',
                ])}
              />
            )
          ) : (
            <p className="muted">No progression history for this player yet.</p>
          )}
        </div>
      )}
    </section>
  );
}

function CoachProgressionPage() {
  const { session } = useAuth();
  const { progression: publishedProgression } = useDynastyData();
  const teamId = session?.activeTenure?.teamId;
  const progression = publishedProgression.filter((p) => p.teamId === teamId);

  return (
    <section className="panel">
      <h3>Team Progression</h3>
      <DataTable
        headers={['Player', 'POS', 'Snapshots', 'Latest OVR']}
        rows={progression.map((p) => {
          const latest = p.snapshots.at(-1);
          return [
            p.playerName,
            p.position,
            p.snapshots.length.toString(),
            latest?.ratings.overall?.toString() ?? '-',
          ];
        })}
        empty="No progression data for your team yet."
      />
    </section>
  );
}

function CoachCareerPage() {
  const { session } = useAuth();
  const { teams } = useDynastyData();
  const [tenures, setTenures] = useState<TeamTenure[]>([]);

  useEffect(() => {
    if (!session) return;
    void fetchTenures(session.user.id, DYNASTY_ID).then(setTenures);
  }, [session]);

  const ordered = useMemo(
    () => [...tenures].sort((a, b) => b.startSeasonYear - a.startSeasonYear),
    [tenures]
  );

  return (
    <section className="panel">
      <h3>Coaching Career</h3>
      <p className="muted">Team changes are tracked as tenures so history stays intact.</p>
      <div className="progression-timeline">
        {ordered.map((tenure) => (
          <div key={tenure.id} className="timeline-item">
            <span>{tenure.startSeasonYear}</span>
            <strong>
              {teamName(tenure.teamId, teams)} ({tenure.status})
            </strong>
            <em>{formatTenureLabel(tenure)}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function CoachArchivePage() {
  const { session } = useAuth();
  const {
    rosters,
    progression: publishedProgression,
    dynasty,
    teams,
    checkpoints,
    postseasonResults,
    playerCatalog,
  } = useDynastyData();
  const [tenures, setTenures] = useState<TeamTenure[]>([]);
  const [selectedTenureId, setSelectedTenureId] = useState('');
  const [activeTenure, setActiveTenure] = useState<TeamTenure | null>(null);

  useEffect(() => {
    if (!session) return;
    void fetchTenures(session.user.id, DYNASTY_ID).then((items) => {
      const archived = items.filter((tenure) => tenure.status !== 'active');
      const current = items.find((tenure) => tenure.status === 'active') ?? null;
      setTenures(archived);
      setActiveTenure(current);
      setSelectedTenureId(archived[0]?.id ?? '');
    });
  }, [session]);

  const selectedTenure = tenures.find((tenure) => tenure.id === selectedTenureId) ?? tenures[0];
  const rosterForTenure = (tenure: TeamTenure, seasonYear?: number) => {
    if (seasonYear !== undefined) {
      const snapshot = dynasty.teamRosterSnapshots?.find(
        (item) => item.teamId === tenure.teamId && item.seasonYear === seasonYear
      );
      if (snapshot) return snapshot.roster;
    }
    return rosters[tenure.teamId];
  };
  const roster = selectedTenure ? rosterForTenure(selectedTenure) : undefined;
  const progression = selectedTenure
    ? publishedProgression.filter((item) => item.teamId === selectedTenure.teamId)
    : [];
  const seasonRowsForTenure = (tenure: TeamTenure) =>
    dynasty.seasons
      .filter(
        (season) =>
          season.year >= tenure.startSeasonYear &&
          season.year <= (tenure.endSeasonYear ?? dynasty.currentSeasonYear - 1) &&
          season.year < dynasty.currentSeasonYear
      )
      .map((season) => [
        season.year.toString(),
        season.label,
        season.schedule.length.toString(),
        season.standings.find((standing) => standing.teamId === tenure.teamId)?.ranking?.toString() ??
          '-',
      ]);

  const seasonRows = selectedTenure ? seasonRowsForTenure(selectedTenure) : [];
  const priorSeasonRows = activeTenure ? seasonRowsForTenure(activeTenure) : [];
  const activeRosterSnapshotYear = priorSeasonRows.at(-1)?.[0];
  const activeHistoricalRoster = activeTenure
    ? rosterForTenure(
        activeTenure,
        activeRosterSnapshotYear ? Number(activeRosterSnapshotYear) : dynasty.currentSeasonYear - 1
      )
    : undefined;

  if (tenures.length === 0 && !activeTenure) {
    return (
      <section className="panel">
        <h3>Archive</h3>
        <p className="muted">
          No archived teams yet. When you change jobs, your old team/season data will appear here.
        </p>
      </section>
    );
  }

  return (
    <section className="grid two">
      <div className="panel full">
        <div className="section-header">
          <div>
            <h3>Archive</h3>
            <p className="muted">
              Historical teams and prior seasons remain viewable after rollover or a job change.
            </p>
          </div>
          {tenures.length > 0 && (
            <select value={selectedTenure?.id ?? ''} onChange={(e) => setSelectedTenureId(e.target.value)}>
              {tenures.map((tenure) => (
                <option key={tenure.id} value={tenure.id}>
                  {teamName(tenure.teamId, teams)} ({tenure.startSeasonYear}-{tenure.endSeasonYear ?? 'Present'})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="panel full">
        <h3>Dynasty Checkpoints</h3>
        <DataTable
          headers={['Season', 'Week', 'Type', 'Teams', 'Captured']}
          rows={checkpoints.map((checkpoint) => [
            checkpoint.seasonYear,
            checkpoint.week,
            checkpoint.type,
            checkpoint.rosterSnapshots.length,
            new Date(checkpoint.capturedAt).toLocaleDateString(),
          ])}
          empty="No weekly checkpoints published yet."
        />
      </div>

      <div className="panel full">
        <h3>Postseason & Titles</h3>
        <DataTable
          headers={['Season', 'Team', 'Kind', 'Title', 'Champion']}
          rows={postseasonResults.map((item) => [
            item.seasonYear,
            teamName(item.teamId, teams),
            item.kind,
            item.titleLabel ?? '—',
            item.isChampion ? 'Yes' : 'No',
          ])}
          empty="No postseason results published yet."
        />
      </div>

      <div className="panel full">
        <h3>Player Catalog</h3>
        <DataTable
          headers={['Player', 'Position', 'Last seen', 'Exit status']}
          rows={playerCatalog.slice(0, 50).map((entry) => [
            `${entry.firstName} ${entry.lastName}`,
            entry.position,
            entry.lastSeenSeasonYear,
            entry.exitStatus,
          ])}
          empty="Player catalog populates after season checkpoints and rollover."
        />
      </div>

      {activeTenure && priorSeasonRows.length > 0 && (
        <>
          <div className="panel">
            <p className="eyebrow">Current Team — Prior Seasons</p>
            <h3>{teamName(activeTenure.teamId, teams)}</h3>
            <p className="muted">
              You are still coaching this team in {dynasty.currentSeasonYear}. Completed seasons are listed
              below.
            </p>
          </div>
          <div className="panel">
            <h3>Prior Seasons</h3>
            <DataTable
              headers={['Year', 'Season', 'Games', 'Rank']}
              rows={priorSeasonRows}
              empty="No prior season records yet."
            />
          </div>
          {activeHistoricalRoster && (
            <div className="panel">
              <h3>Last Archived Roster</h3>
              <DataTable
                headers={['#', 'Player', 'POS', 'Class', 'OVR']}
                rows={activeHistoricalRoster.players.map((player) => [
                  player.jerseyNumber?.toString() ?? '-',
                  `${player.firstName} ${player.lastName}`,
                  player.position,
                  player.classYear ?? '-',
                  player.ratings.overall?.toString() ?? '-',
                ])}
              />
            </div>
          )}
        </>
      )}

      {selectedTenure && (
        <>
          <div className="panel">
            <p className="eyebrow">Archived Tenure</p>
            <h3>{teamName(selectedTenure.teamId, teams)}</h3>
            <div className="metric-grid">
              <Metric label="Start" value={selectedTenure.startSeasonYear} />
              <Metric label="End" value={selectedTenure.endSeasonYear ?? 'Open'} />
              <Metric label="Players" value={roster?.players.length ?? 0} />
              <Metric label="Tracks" value={progression.length} />
            </div>
          </div>

          <div className="panel">
            <h3>Archived Seasons</h3>
            <DataTable
              headers={['Year', 'Season', 'Games', 'Rank']}
              rows={seasonRows}
              empty="No season records archived for this tenure yet."
            />
          </div>

          <div className="panel">
            <h3>Roster Snapshot</h3>
            <DataTable
              headers={['#', 'Player', 'POS', 'Class', 'OVR']}
              rows={(roster?.players ?? []).map((player) => [
                player.jerseyNumber?.toString() ?? '-',
                `${player.firstName} ${player.lastName}`,
                player.position,
                player.classYear ?? '-',
                player.ratings.overall?.toString() ?? '-',
              ])}
            />
          </div>

          <div className="panel">
            <h3>Archived Progression</h3>
            <DataTable
              headers={['Player', 'POS', 'Snapshots', 'Latest OVR']}
              rows={progression.map((item) => [
                item.playerName,
                item.position,
                item.snapshots.length.toString(),
                item.snapshots.at(-1)?.ratings.overall?.toString() ?? '-',
              ])}
              empty="No archived progression for this team yet."
            />
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function UserGamesMetric({ games, record }: { games: number; record: string }) {
  return (
    <div className="metric-card">
      <span>User Games</span>
      <div className="split-metric-value">
        <strong>{games}</strong>
        <strong>{record}</strong>
      </div>
      <div className="split-metric-labels">
        <small>Games</small>
        <small>Record</small>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeSort,
  onSort,
}: {
  label: string;
  sortKey: RosterSortKey;
  activeSort: { key: RosterSortKey; direction: SortDirection };
  onSort: (key: RosterSortKey) => void;
}) {
  const isActive = activeSort.key === sortKey;
  return (
    <th>
      <button className="sortable-header" onClick={() => onSort(sortKey)}>
        <span className="sortable-label">{label}</span>
        <span className={isActive ? 'sort-indicator active' : 'sort-indicator'} aria-hidden={!isActive}>
          {isActive ? (activeSort.direction === 'asc' ? '▲' : '▼') : '▲'}
        </span>
      </button>
    </th>
  );
}

function ProgressionLineChart({ snapshots }: { snapshots: PlayerProgressionSnapshot[] }) {
  const orderedSnapshots = [...snapshots].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
  );
  if (orderedSnapshots.length === 0) return <p className="muted">No snapshots available.</p>;

  const values = orderedSnapshots.map((snapshot) => snapshot.ratings.overall ?? 0);
  const minValue = Math.max(0, Math.min(...values) - 3);
  const maxValue = Math.min(99, Math.max(...values) + 3);
  const width = 900;
  const height = 320;
  const padding = 44;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const valueRange = Math.max(1, maxValue - minValue);
  const points = orderedSnapshots.map((snapshot, index) => {
    const x =
      orderedSnapshots.length === 1
        ? padding + chartWidth / 2
        : padding + (index / (orderedSnapshots.length - 1)) * chartWidth;
    const overall = snapshot.ratings.overall ?? minValue;
    const y = padding + chartHeight - ((overall - minValue) / valueRange) * chartHeight;
    return { snapshot, overall, x, y };
  });
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div className="chart-card">
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img">
        <title>Overall rating progression over time</title>
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
        {[maxValue, Math.round((maxValue + minValue) / 2), minValue].map((value) => {
          const y = padding + chartHeight - ((value - minValue) / valueRange) * chartHeight;
          return (
            <g key={value}>
              <line className="grid-line" x1={padding} y1={y} x2={width - padding} y2={y} />
              <text x={padding - 12} y={y + 4} textAnchor="end">
                {value}
              </text>
            </g>
          );
        })}
        <polyline points={linePoints} />
        {points.map((point) => (
          <g key={point.snapshot.id}>
            <circle cx={point.x} cy={point.y} r="6" />
            <text className="point-value" x={point.x} y={point.y - 12} textAnchor="middle">
              {point.overall}
            </text>
            <text className="point-label" x={point.x} y={height - 16} textAnchor="middle">
              {point.snapshot.seasonYear}
            </text>
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        {points.map((point) => (
          <span key={point.snapshot.id}>
            {point.snapshot.label}: <strong>{point.overall}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  empty = 'No data available.',
}: {
  headers: string[];
  rows: string[][];
  empty?: string;
}) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getTeamSchedule(teamId: string, dynasty = PLACEHOLDER_DYNASTY): ScheduleGame[] {
  const currentSeason =
    dynasty.seasons.find((season) => season.year === dynasty.currentSeasonYear) ??
    [...dynasty.seasons].sort((a, b) => b.year - a.year)[0];
  const publishedTeamSchedule = (currentSeason?.schedule ?? [])
    .filter((game) => game.homeTeamId === teamId || game.awayTeamId === teamId)
    .sort((a, b) => a.week - b.week);
  if (publishedTeamSchedule.length > 0) return publishedTeamSchedule;
  return [];
}

function getTeamRecord(teamId: string, schedule: ScheduleGame[]): { wins: number; losses: number } {
  return schedule.reduce(
    (record, game) => {
      if (game.isBye) return record;
      if (!game.isPlayed || game.homeScore === undefined || game.awayScore === undefined) return record;
      const isHome = game.homeTeamId === teamId;
      const teamScore = isHome ? game.homeScore : game.awayScore;
      const opponentScore = isHome ? game.awayScore : game.homeScore;
      if (teamScore > opponentScore) record.wins += 1;
      if (teamScore < opponentScore) record.losses += 1;
      return record;
    },
    { wins: 0, losses: 0 }
  );
}

function getConferenceRecord(
  teamId: string,
  schedule: ScheduleGame[],
  teams: Team[] = PLACEHOLDER_TEAMS
): { wins: number; losses: number } {
  const conferenceId = teamConference(teamId, teams);
  return schedule.reduce(
    (record, game) => {
      if (game.isBye) return record;
      if (!game.isPlayed || game.homeScore === undefined || game.awayScore === undefined) return record;

      const opponentId = game.homeTeamId === teamId ? game.awayTeamId : game.homeTeamId;
      if (teamConference(opponentId, teams) !== conferenceId) return record;

      const isHome = game.homeTeamId === teamId;
      const teamScore = isHome ? game.homeScore : game.awayScore;
      const opponentScore = isHome ? game.awayScore : game.homeScore;
      if (teamScore > opponentScore) record.wins += 1;
      if (teamScore < opponentScore) record.losses += 1;
      return record;
    },
    { wins: 0, losses: 0 }
  );
}

function formatGameResultForTeam(game: ScheduleGame, teamId: string): string {
  if (game.isBye) return 'BYE';
  if (!game.isPlayed || game.homeScore === undefined || game.awayScore === undefined) return 'Upcoming';
  const isHome = game.homeTeamId === teamId;
  const teamScore = isHome ? game.homeScore : game.awayScore;
  const opponentScore = isHome ? game.awayScore : game.homeScore;
  const result = teamScore > opponentScore ? 'W' : teamScore < opponentScore ? 'L' : 'T';
  return `${result} ${teamScore}-${opponentScore}`;
}

function getProgressionForPlayer(
  player: Player,
  teamId: string,
  progression: PlayerProgression[] = PLACEHOLDER_PROGRESSION
): PlayerProgression | undefined {
  return (
    progression.find((item) => item.playerId === player.id) ??
    progression.find((item) => item.teamId === teamId && item.position === player.position) ??
    progression.find((item) => item.teamId === teamId)
  );
}

function getAbilityProfileForPlayer(player: Player): {
  archetype?: PlayerAbility;
  traits: PlayerAbility[];
} {
  const uploadedAbilities = player.abilities ?? [];
  return {
    archetype:
      uploadedAbilities.find((ability) => ability.category === 'archetype') ??
      (player.archetype
        ? {
            id: player.archetype.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            name: player.archetype,
            type: 'physical',
            category: 'archetype',
          }
        : undefined),
    traits: uploadedAbilities.filter((ability) => ability.category === 'trait'),
  };
}

function importantStatsForPosition(player: Player): Array<{ label: string; value: number }> {
  const ratings = player.ratings;
  const position = player.position.toUpperCase();
  const statSets: Record<string, Array<[string, number | undefined]>> = {
    QB: [
      ['THP', ratings.throwPower],
      ['SAC', ratings.shortAccuracy],
      ['MAC', ratings.mediumAccuracy],
      ['DAC', ratings.deepAccuracy],
      ['AWR', ratings.awareness],
    ],
    RB: [
      ['BCV', ratings.ballCarrierVision],
      ['BTK', ratings.breakTackle],
      ['ELU', ratings.elusiveness],
      ['CAR', ratings.carry],
      ['JKM', ratings.juke],
    ],
    WR: [
      ['CTH', ratings.catching],
      ['SRR', ratings.shortRouteRunning],
      ['MRR', ratings.mediumRouteRunning],
      ['DRR', ratings.deepRouteRunning],
      ['RLS', ratings.release],
    ],
    TE: [
      ['CTH', ratings.catching],
      ['CIT', ratings.catchInTraffic],
      ['RBK', ratings.runBlock],
      ['PBK', ratings.passBlock],
      ['AWR', ratings.awareness],
    ],
    OL: [
      ['RBK', ratings.runBlock],
      ['PBK', ratings.passBlock],
      ['IBL', ratings.impactBlocking],
      ['STR', ratings.strength],
      ['AWR', ratings.awareness],
    ],
    DL: [
      ['BSH', ratings.blockShed],
      ['PMV', ratings.powerMoves],
      ['FMV', ratings.finesseMoves],
      ['STR', ratings.strength],
      ['TAK', ratings.tackle],
    ],
    LB: [
      ['TAK', ratings.tackle],
      ['PUR', ratings.pursuit],
      ['PRC', ratings.playRecognition],
      ['BSH', ratings.blockShed],
      ['POW', ratings.hitPower],
    ],
    CB: [
      ['MCV', ratings.manCoverage],
      ['ZCV', ratings.zoneCoverage],
      ['PRS', ratings.press],
      ['PRC', ratings.playRecognition],
      ['AWR', ratings.awareness],
    ],
    S: [
      ['ZCV', ratings.zoneCoverage],
      ['MCV', ratings.manCoverage],
      ['TAK', ratings.tackle],
      ['POW', ratings.hitPower],
      ['PRC', ratings.playRecognition],
    ],
    K: [
      ['KPW', ratings.kickPower],
      ['KAC', ratings.kickAccuracy],
      ['AWR', ratings.awareness],
    ],
    P: [
      ['KPW', ratings.kickPower],
      ['KAC', ratings.kickAccuracy],
      ['AWR', ratings.awareness],
    ],
  };
  const stats = statSets[position] ?? [
    ['AWR', ratings.awareness],
    ['STR', ratings.strength],
    ['AGI', ratings.agility],
  ];
  const availableStats = stats
    .filter(([, value]) => value !== undefined)
    .map(([label, value]) => ({ label, value: value! }));

  if (availableStats.length > 0) return availableStats.slice(0, 5);

  const fallbackStats: Array<[string, number | undefined]> = [
    ['OVR', ratings.overall],
    ['SPD', ratings.speed],
    ['ACC', ratings.acceleration],
  ];

  return fallbackStats
    .filter((stat): stat is [string, number] => stat[1] !== undefined)
    .map(([label, value]) => ({ label, value }));
}

function positionSortValue(position: string): number {
  const order = [
    'QB',
    'RB',
    'FB',
    'WR',
    'TE',
    'OL',
    'LT',
    'LG',
    'C',
    'RG',
    'RT',
    'DL',
    'DE',
    'DT',
    'LE',
    'RE',
    'LB',
    'MLB',
    'OLB',
    'CB',
    'S',
    'FS',
    'SS',
    'K',
    'P',
    'LS',
    'ATH',
  ];
  const index = order.indexOf(normalizePosition(position));
  return index === -1 ? order.length : index;
}

function classSortValue(classYear: string | undefined): number {
  const order = ['FR', 'RS_FR', 'SO', 'RS_SO', 'JR', 'RS_JR', 'SR', 'RS_SR'];
  const index = order.indexOf((classYear ?? '').toUpperCase());
  return index === -1 ? order.length : index;
}

function devTraitSortValue(devTrait: string | undefined): number {
  switch ((devTrait ?? 'Normal').toLowerCase()) {
    case 'elite':
      return 3;
    case 'star':
      return 2;
    case 'impact':
      return 1;
    case 'normal':
    default:
      return 0;
  }
}

function defaultRosterSortDirection(key: RosterSortKey): SortDirection {
  if (['overall', 'devTrait', 'speed', 'changeOfDirection', 'acceleration'].includes(key)) {
    return 'desc';
  }
  return 'asc';
}

function formatAbilityLevel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
}

function formatDevTrait(devTrait: string | undefined): string {
  const normalized = (devTrait ?? 'Normal').toLowerCase();
  switch (normalized) {
    case 'elite':
      return 'Elite';
    case 'star':
      return 'Star';
    case 'impact':
      return 'Impact';
    default:
      return 'Normal';
  }
}

function formatTenureLabel(tenure: TeamTenure): string {
  if (tenure.status === 'active') {
    return normalizeAssignmentLabel(tenure.label) ?? 'Assigned by commissioner';
  }

  if (!tenure.label || /\bcurrent\b/i.test(tenure.label)) {
    return 'Archived team history';
  }

  return normalizeAssignmentLabel(tenure.label) ?? tenure.role;
}

function normalizeAssignmentLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  if (label === 'Assigned by user-admin') return 'Assigned by commissioner';
  return label;
}

function normalizePosition(position: string): string {
  return position.toUpperCase().replaceAll('-', '_');
}

function isUserGameForTeam(
  game: ScheduleGame,
  teamId: string,
  activeUserTeamIds: Set<string>
): boolean {
  if (game.isBye) return false;
  const opponentId = game.homeTeamId === teamId ? game.awayTeamId : game.homeTeamId;
  return opponentId !== teamId && activeUserTeamIds.has(teamId) && activeUserTeamIds.has(opponentId);
}

function activeCoachForTeam(
  teamId: string,
  tenuresByUser: Record<string, TeamTenure[]>,
  users: AppUser[]
): string {
  const userId = Object.entries(tenuresByUser).find(([, tenures]) =>
    tenures.some((tenure) => tenure.status === 'active' && tenure.teamId === teamId)
  )?.[0];
  return userId ? userName(userId, users) : 'CPU';
}

function getCurrentTop25(
  teams: Team[] = PLACEHOLDER_TEAMS,
  dynasty = PLACEHOLDER_DYNASTY
): Array<{ rank: number; team: Team; wins: number; losses: number }> {
  const snapshot = [...(dynasty.rankings ?? [])]
    .filter((item) => item.pollType === 'top25')
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
  if (snapshot) {
    return snapshot.entries
      .map((entry) => {
        const team = teams.find((item) => item.id === entry.teamId);
        return team ? { rank: entry.rank, team, wins: entry.wins, losses: entry.losses } : null;
      })
      .filter((row): row is { rank: number; team: Team; wins: number; losses: number } => Boolean(row))
      .sort((a, b) => a.rank - b.rank);
  }
  return [];
}

function teamConference(teamId: string, teams: Team[] = PLACEHOLDER_TEAMS): string {
  return teams.find((team) => team.id === teamId)?.conferenceId ?? '';
}

function teamName(teamId: string, teams: Team[] = PLACEHOLDER_TEAMS): string {
  return teams.find((t) => t.id === teamId)?.name ?? teamId;
}

function conferenceName(conferenceId: string): string {
  const conference = PLACEHOLDER_CONFERENCES.find((item) => item.id === conferenceId);
  return conference?.abbreviation ?? conference?.name ?? conferenceId;
}

function userName(userId: string, users: AppUser[] = listDemoUsers()): string {
  return users.find((user) => user.id === userId)?.displayName ?? userId;
}

