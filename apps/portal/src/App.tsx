import { useEffect, useMemo, useState } from 'react';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  AppShell,
  DataTable,
  NavItem,
  SidebarBrand,
  SidebarNav,
  TeamMark,
} from '@ncaa/ui';
import {
  DEMO_DYNASTY_ID,
  PLACEHOLDER_CONFERENCES,
  PLACEHOLDER_TEAMS,
} from '@ncaa/domain';
import type {
  AppUser,
  Dynasty,
  Player,
  PlayerAbility,
  PlayerCatalogEntry,
  PlayerProgression,
  PlayerProgressionSnapshot,
  PostseasonResult,
  RankingSnapshot,
  Roster,
  ScheduleGame,
  Season,
  Team,
  TeamTenure,
} from '@ncaa/domain';
import { roleLabel } from '@ncaa/auth';
import { fetchTenures, fetchUsers } from './api';
import { DynastyDataProvider, useDynastyData } from './dynasty-data-context';
import { useAuth } from './auth-context';

const DYNASTY_ID = DEMO_DYNASTY_ID;
function canUseCoachPortal(user: AppUser): boolean {
  return (user.role === 'coach' || user.role === 'admin') && (user.accessStatus ?? 'active') === 'active';
}

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
type Top25Row = { rank: number; team: Team; wins: number; losses: number };

const TOP_25_COLLAPSED_LIMIT = 12;

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

  const defaultPath = `/portal/dynasties/${session.dynastyId ?? DYNASTY_ID}/my-team`;

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
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const nextUsers = (await fetchUsers()).filter(canUseCoachPortal);
      setUsers(nextUsers);
      setSelectedUserId((current) => current || (nextUsers[0]?.id ?? ''));
    })();
  }, []);

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
          Coach and commissioner accounts can sign in after the desktop app publishes access.
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
              placeholder="Password"
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
  const location = useLocation();
  const { session, signOut } = useAuth();
  const { dynastyId = DYNASTY_ID } = useParams();
  const nav = [
    { to: `/portal/dynasties/${dynastyId}/my-team`, label: 'Home', end: true },
    { to: `/portal/dynasties/${dynastyId}/team`, label: 'Team' },
    { to: `/portal/dynasties/${dynastyId}/progression`, label: 'Progression' },
    { to: `/portal/dynasties/${dynastyId}/career`, label: 'Career' },
    { to: `/portal/dynasties/${dynastyId}/archive`, label: 'Archive' },
  ];
  const lockedTeam = session?.activeTenure?.teamId;

  return (
    <DynastyDataProvider dynastyId={dynastyId}>
      <AppShell
        className="app--portal"
        sidebar={
          <>
            <SidebarBrand logoSrc="/college-football-comissioner-app-logo.svg" />
            <SidebarNav>
              {nav.map((item) => (
                <NavItem
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  active={isPortalNavActive(location.pathname, item.to, item.end)}
                />
              ))}
            </SidebarNav>
          </>
        }
        sidebarFooter={
          <>
            <div className="sidebar-card">
              <span>Signed in</span>
              <strong>{session!.user.displayName}</strong>
              <small>{roleLabel(session!.user.role)}</small>
              {lockedTeam && (
                <small className="team-name-with-mark">
                  <TeamMark team={teamForId(lockedTeam, PLACEHOLDER_TEAMS)} teamId={lockedTeam} size="sm" />
                  Locked team: {teamName(lockedTeam, PLACEHOLDER_TEAMS)}
                </small>
              )}
            </div>
            <div className="sidebar-footer">
              <button className="secondary" type="button" onClick={signOut}>
                Sign Out
              </button>
            </div>
          </>
        }
      >
        <Routes>
          <Route index element={<Navigate to="my-team" replace />} />
          <Route path="my-team" element={<CoachSeasonHomePage />} />
          <Route path="team" element={<CoachTeamPage />} />
          <Route path="progression" element={<CoachProgressionPage />} />
          <Route path="career" element={<CoachCareerPage />} />
          <Route path="archive" element={<CoachArchivePage />} />
        </Routes>
      </AppShell>
    </DynastyDataProvider>
  );
}

function isPortalNavActive(pathname: string, to: string, end?: boolean): boolean {
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
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
      const coaches = (await fetchUsers()).filter(canUseCoachPortal);
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
  const regularSeasonSchedule = getRegularSeasonSchedule(teamSchedule);
  const record = getTeamRecord(teamId, regularSeasonSchedule);
  const conference = conferenceName(teamConference(teamId, teams));
  const conferenceRecord = getConferenceRecord(teamId, regularSeasonSchedule, teams);
  const userTeamIds = new Set(
    Object.values(tenuresByUser)
      .flat()
      .filter((tenure) => tenure.status === 'active')
      .map((tenure) => tenure.teamId)
  );
  const userGames = regularSeasonSchedule.filter((game) => isUserGameForTeam(game, teamId, userTeamIds));
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
  const currentWeek = getCurrentWeek(dynasty);
  const top25 = getCurrentTop25(teams, dynasty, dynasty.currentSeasonYear, currentWeek ?? undefined);
  const currentRank = top25.find((row) => row.team.id === teamId)?.rank;
  const currentTeam = teamForId(teamId, teams);

  return (
    <section className="grid two">
      <div className="panel full">
        <p className="eyebrow">Coach Home</p>
        <h3 className="team-heading">
          <TeamMark team={currentTeam} teamId={teamId} size="lg" />
          <span>{teamName(teamId, teams)} Season Dashboard</span>
        </h3>
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
                    <td>{game.isBye ? 'BYE' : <TeamNameWithMark teamId={opponentId} teams={teams} />}</td>
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
        <h3>Current Top 25{currentWeek !== null ? ` · Week ${currentWeek}` : ''}</h3>
        <Top25Table
          rows={top25}
          emptyMessage="No Top 25 upload published yet."
          highlightedTeamIds={userTeamIds}
          starredTeamId={teamId}
        />
      </div>

      <div className="panel">
        <h3>Team Leaders</h3>
        <div className="leader-list">
          <h4>Highest Rated</h4>
          {topPlayers.map((player) => (
            <Link
              className="leader-card leader-card-link"
              key={player.id}
              to={`/portal/dynasties/${dynastyId}/progression?player=${player.id}`}
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
              to={`/portal/dynasties/${dynastyId}/progression?player=${player.playerId}`}
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

function RosterTable({
  players,
  title = 'Roster',
  description = 'Filter by position, then click a table title to sort.',
  highlightedPlayerId = '',
  emptyMessage = 'No players on roster.',
  onPlayerSelect,
}: {
  players: Player[];
  title?: string;
  description?: string;
  highlightedPlayerId?: string;
  emptyMessage?: string;
  onPlayerSelect: (playerId: string) => void;
}) {
  const [positionFilter, setPositionFilter] = useState('all');
  const [rosterSort, setRosterSort] = useState<{ key: RosterSortKey; direction: SortDirection }>({
    key: 'overall',
    direction: 'desc',
  });

  const positionOptions = useMemo(() => {
    return Array.from(new Set(players.map((player) => player.position))).sort(
      (a, b) => positionSortValue(a) - positionSortValue(b)
    );
  }, [players]);
  const sortedPlayers = useMemo(
    () => sortRosterPlayers(players, positionFilter, rosterSort),
    [players, positionFilter, rosterSort]
  );

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

  return (
    <>
      <div className="section-header">
        <div>
          {title ? <h3>{title}</h3> : null}
          {description ? <p className="muted">{description}</p> : null}
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

      {players.length === 0 ? (
        <p className="muted">{emptyMessage}</p>
      ) : (
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
                  className={
                    player.id === highlightedPlayerId ? 'player-row selected-player-row' : 'player-row'
                  }
                  onClick={() => onPlayerSelect(player.id)}
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
      )}
    </>
  );
}

function CoachTeamPage() {
  const { session } = useAuth();
  const { rosters, teams } = useDynastyData();
  const [searchParams] = useSearchParams();
  const { dynastyId = DYNASTY_ID } = useParams();
  const navigate = useNavigate();
  const teamId = session?.activeTenure?.teamId;
  const roster = teamId ? rosters[teamId] : undefined;
  const requestedPlayerId = searchParams.get('player') ?? '';
  const players = roster?.players ?? [];

  function openPlayerProgression(playerId: string) {
    navigate(`/portal/dynasties/${dynastyId}/progression?player=${playerId}`);
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
      <div className="panel full national-champion-callout team-roster-hero">
        <TeamMark team={teamForId(teamId, teams)} teamId={teamId} size="lg" />
        <div>
          <span>Roster</span>
          <strong>{teamName(teamId, teams)}</strong>
          <small>
            Click a player to open their progression detail.
          </small>
        </div>
      </div>

      <div className="panel full">
        <RosterTable
          players={players}
          highlightedPlayerId={requestedPlayerId}
          onPlayerSelect={openPlayerProgression}
        />
      </div>
    </section>
  );
}

function CoachProgressionPage() {
  const { session } = useAuth();
  const { progression: publishedProgression, rosters, teams, playerCatalog } = useDynastyData();
  const { dynastyId = DYNASTY_ID } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const teamId = session?.activeTenure?.teamId;
  const coachTenures = useCoachTenures(session?.user.id, dynastyId);
  const coachedTeamIds = useMemo(() => {
    const teamIds = new Set(coachTenures.map((tenure) => tenure.teamId));
    if (teamId) teamIds.add(teamId);
    return teamIds;
  }, [coachTenures, teamId]);
  const roster = teamId ? rosters[teamId] : undefined;
  const requestedPlayerId = searchParams.get('player') ?? '';
  const progression = useMemo(
    () => {
      const teamProgression = getProgressionForTeams(publishedProgression, playerCatalog, coachedTeamIds);
      const requestedProgression = requestedPlayerId
        ? publishedProgression.find((item) => item.playerId === requestedPlayerId)
        : undefined;
      if (
        requestedProgression &&
        !teamProgression.some((item) => item.playerId === requestedProgression.playerId)
      ) {
        return [...teamProgression, requestedProgression];
      }
      return teamProgression;
    },
    [coachedTeamIds, playerCatalog, publishedProgression, requestedPlayerId]
  );
  const rosterPlayers = roster?.players ?? [];
  const playerOptions = useMemo(
    () =>
      buildProgressionPlayerOptions(
        rosterPlayers,
        progression,
        playerCatalog,
        teams,
        coachedTeamIds,
        teamId
      ).sort((a, b) => a.sortGroup - b.sortGroup || a.label.localeCompare(b.label)),
    [coachedTeamIds, playerCatalog, progression, rosterPlayers, teamId, teams]
  );
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph');
  const selectedOption =
    playerOptions.find((option) => option.id === selectedPlayerId) ?? playerOptions[0];
  const selectedPlayer = selectedOption?.player;
  const selectedProgression = selectedOption?.progression;
  const selectedAbilityProfile = selectedPlayer ? getAbilityProfileForPlayer(selectedPlayer) : undefined;
  const selectedSnapshots = selectedProgression?.snapshots ?? [];
  const selectedLatestSnapshot = selectedSnapshots.at(-1);

  useEffect(() => {
    const requestedOption = playerOptions.find((option) => option.id === requestedPlayerId);
    const nextOption = requestedOption ?? playerOptions[0];
    setSelectedPlayerId(nextOption?.id ?? '');
  }, [playerOptions, requestedPlayerId, teamId]);

  if (!teamId) {
    return (
      <section className="panel">
        <h3>No Active Team</h3>
        <p className="muted">The commissioner has not assigned you an active team yet.</p>
      </section>
    );
  }

  function handlePlayerSelect(playerId: string) {
    setSelectedPlayerId(playerId);
    setSearchParams({ player: playerId });
  }

  return (
    <section className="grid two">
      <div className="panel full">
        <p className="eyebrow">Progression</p>
        <h3 className="team-heading">
          <TeamMark team={teamForId(teamId, teams)} teamId={teamId} size="lg" />
          <span>{teamName(teamId, teams)} Player Progression</span>
        </h3>
        <p className="muted">Search for a player to review their overall progression graph and snapshots.</p>
      </div>

      <div className="panel full progression-detail-panel">
        <div className="section-header">
          <div>
            <h3>{selectedOption?.label ?? 'Player Progression'}</h3>
            <p className="muted">
              {selectedPlayer
                ? `${selectedPlayer.position} · ${selectedPlayer.classYear ?? 'Class TBD'} · OVR ${
                    selectedPlayer.ratings.overall ?? '-'
                  }`
                : selectedProgression
                  ? `${selectedProgression.position} · ${selectedProgression.snapshots.length} snapshots`
                  : 'No player selected'}
            </p>
            {selectedOption && (
              <div className="progression-track-summary">
                <span>
                  Snapshots <strong>{selectedSnapshots.length}</strong>
                </span>
                <span>
                  Latest OVR <strong>{selectedLatestSnapshot?.ratings.overall ?? '-'}</strong>
                </span>
                <span>
                  Latest capture{' '}
                  <strong>
                    {selectedLatestSnapshot
                      ? selectedLatestSnapshot.label ??
                        new Date(selectedLatestSnapshot.capturedAt).toLocaleDateString()
                      : '-'}
                  </strong>
                </span>
                {selectedOption.teamLabel && (
                  <span>
                    Coached at <strong>{selectedOption.teamLabel}</strong>
                  </span>
                )}
                {selectedOption.status && (
                  <span>
                    Status <strong>{selectedOption.status}</strong>
                  </span>
                )}
              </div>
            )}
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
          <div className="progression-controls">
            <label>
              <span>Player</span>
              <select
                value={selectedPlayerId}
                onChange={(event) => handlePlayerSelect(event.target.value)}
              >
                {playerOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
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
    </section>
  );
}

function useCoachTenures(userId: string | undefined, dynastyId: string): TeamTenure[] {
  const { teamTenures: bundledTenures } = useDynastyData();
  const [fetchedTenures, setFetchedTenures] = useState<TeamTenure[]>([]);
  const bundledForUser = useMemo(
    () => (userId ? bundledTenures.filter((tenure) => tenure.userId === userId) : []),
    [bundledTenures, userId]
  );

  useEffect(() => {
    if (!userId || bundledForUser.length > 0) return;
    void fetchTenures(userId, dynastyId).then(setFetchedTenures);
  }, [userId, dynastyId, bundledForUser.length]);

  return bundledForUser.length > 0 ? bundledForUser : fetchedTenures;
}

function Top25Table({
  rows,
  emptyMessage,
  highlightedTeamIds,
  starredTeamId,
}: {
  rows: Top25Row[];
  emptyMessage: string;
  highlightedTeamIds?: Set<string>;
  starredTeamId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = rows.length > TOP_25_COLLAPSED_LIMIT;
  const visibleRows = expanded || !canExpand ? rows : rows.slice(0, TOP_25_COLLAPSED_LIMIT);

  return (
    <>
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={3}>{emptyMessage}</td>
              </tr>
            )}
            {visibleRows.map((row) => {
              const isHighlighted = highlightedTeamIds?.has(row.team.id);
              return (
                <tr key={row.team.id} className={isHighlighted ? 'ranked-user-row' : undefined}>
                  <td>{row.rank}</td>
                  <td>
                    <span className="team-name-with-mark">
                      <TeamMark team={row.team} size="sm" />
                      {row.team.id === starredTeamId && <span className="rank-star">★</span>}
                      <span>{row.team.name}</span>
                    </span>
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
      {canExpand && (
        <div className="top25-toggle-row">
          <button className="secondary" type="button" onClick={() => setExpanded((current) => !current)}>
            {expanded ? 'Show Top 12' : 'Show All 25'}
          </button>
        </div>
      )}
    </>
  );
}

function HistoricalSeasonDashboard({
  teamId,
  season,
  dynasty,
  teams,
  rosters,
  progression,
  postseasonResults,
  dynastyId,
}: {
  teamId: string;
  season: Season;
  dynasty: Dynasty;
  teams: Team[];
  rosters: Record<string, Roster>;
  progression: PlayerProgression[];
  postseasonResults: PostseasonResult[];
  dynastyId: string;
}) {
  const navigate = useNavigate();
  const teamSchedule = getTeamScheduleForSeason(teamId, season);
  const regularSeasonSchedule = getRegularSeasonSchedule(teamSchedule);
  const record = getTeamRecord(teamId, regularSeasonSchedule);
  const conference = conferenceName(teamConference(teamId, teams));
  const conferenceRecord = getConferenceRecord(teamId, regularSeasonSchedule, teams);
  const top25Snapshot = getTop25SnapshotForSeason(dynasty, season.year);
  const top25 = top25RowsFromSnapshot(teams, top25Snapshot, season);
  const teamRank =
    season.standings.find((standing) => standing.teamId === teamId)?.ranking ??
    top25.find((row) => row.team.id === teamId)?.rank;
  const finalRoster = finalRosterForTeamSeason(dynasty, rosters, teamId, season.year);
  const teamPostseason = postseasonResults.filter(
    (item) => item.seasonYear === season.year && item.teamId === teamId
  );
  const nationalChampion = nationalChampionForSeason(season, postseasonResults);
  const scheduleRows = buildScheduleRowsWithPostseason(teamSchedule, teamPostseason);
  const heismanLabel =
    season.heismanWinner?.teamId === teamId
      ? season.heismanWinner.playerName
      : season.heismanWinner
        ? `${season.heismanWinner.playerName} (${teamName(season.heismanWinner.teamId, teams)})`
        : '—';
  const progressionLeaders = progression
    .map((item) => {
      const seasonSnapshots = item.snapshots.filter((snapshot) => snapshot.seasonYear === season.year);
      if (seasonSnapshots.length === 0) return null;
      const ordered = [...seasonSnapshots].sort(
        (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
      );
      const first = ordered[0]?.ratings.overall ?? 0;
      const latest = ordered.at(-1)?.ratings.overall ?? first;
      return { ...item, first, latest, gain: latest - first };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);

  return (
    <>
      <div
        className={
          nationalChampion?.teamId === teamId
            ? 'panel full national-champion-callout national-champion-callout--user'
            : 'panel full national-champion-callout'
        }
      >
        <span>National Champion</span>
        <strong>
          {nationalChampion ? (
            <TeamNameWithMark teamId={nationalChampion.teamId} teams={teams} size="md" />
          ) : (
            'Not recorded'
          )}
        </strong>
        <small>
          {nationalChampion?.teamId === teamId
            ? `${teamName(teamId, teams)} won the national title in ${season.year}.`
            : nationalChampion
              ? `${nationalChampion.titleLabel ?? 'National Championship'} · ${season.year}`
              : `No national champion has been published for ${season.year}.`}
        </small>
      </div>

      <div className="panel full">
        <p className="eyebrow">{season.label}</p>
        <h3 className="team-heading">
          <TeamMark team={teamForId(teamId, teams)} teamId={teamId} size="lg" />
          <span>{teamName(teamId, teams)} · {season.year}</span>
        </h3>
        <div className="metric-grid">
          <Metric label="Record" value={`${record.wins}-${record.losses}`} />
          <Metric label={`Conference - ${conference}`} value={`${conferenceRecord.wins}-${conferenceRecord.losses}`} />
          <Metric label="Final Rank" value={teamRank ? `#${teamRank}` : 'NR'} />
          <Metric label="Heisman" value={heismanLabel} />
        </div>
      </div>

      <div className="panel full">
        <h3>Schedule & Results</h3>
        <div className="table-wrap">
          <table className="season-schedule-table">
            <colgroup>
              <col className="schedule-col-week" />
              <col className="schedule-col-opponent" />
              <col className="schedule-col-site" />
              <col className="schedule-col-status" />
            </colgroup>
            <thead>
              <tr>
                <th>Week</th>
                <th>Opponent</th>
                <th>Site</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {scheduleRows.length === 0 && (
                <tr>
                  <td colSpan={4}>No schedule published for this season yet.</td>
                </tr>
              )}
              {scheduleRows.map((row) => {
                if (row.kind === 'postseason') {
                  return (
                    <tr key={row.result.id} className="postseason-schedule-row">
                      <td>{row.week}</td>
                      <td>{postseasonScheduleTitle(row.result, teams)}</td>
                      <td>{postseasonKindLabel(row.result.kind)}</td>
                      <td>{formatPostseasonResult(row.result)}</td>
                    </tr>
                  );
                }

                const opponentId = row.game.homeTeamId === teamId ? row.game.awayTeamId : row.game.homeTeamId;
                return (
                  <tr key={row.game.id}>
                    <td>{row.game.week}</td>
                    <td>{row.game.isBye ? 'BYE' : <TeamNameWithMark teamId={opponentId} teams={teams} />}</td>
                    <td>{row.game.isBye ? 'BYE' : row.game.homeTeamId === teamId ? 'Home' : 'Away'}</td>
                    <td>{formatGameResultForTeam(row.game, teamId)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>Final Top 25 · {season.year}</h3>
        <Top25Table
          rows={top25}
          emptyMessage="No Top 25 snapshot for this season."
          highlightedTeamIds={new Set([teamId])}
          starredTeamId={teamId}
        />
      </div>

      {progressionLeaders.length > 0 && (
        <div className="panel">
          <h3>Top Progression</h3>
          <div className="leader-list">
            {progressionLeaders.map((player) => (
              <Link
                className="leader-card leader-card-link"
                key={player.playerId}
                to={`/portal/dynasties/${dynastyId}/progression?player=${player.playerId}`}
              >
                <strong>{player.playerName}</strong>
                <span>
                  {player.position} · +{player.gain} OVR ({player.first} to {player.latest})
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="panel full">
        <h3>Final Roster</h3>
        {!finalRoster && <p className="muted">No final roster snapshot published for this season.</p>}
        {finalRoster && (
          <RosterTable
            players={finalRoster.players}
            title=""
            description="Filter by position, then click a table title to sort. Click a player to open progression."
            emptyMessage="No players in the final roster snapshot."
            onPlayerSelect={(playerId) =>
              navigate(`/portal/dynasties/${dynastyId}/progression?player=${playerId}`)
            }
          />
        )}
      </div>
    </>
  );
}

function CoachCareerPage() {
  const { session } = useAuth();
  const { dynastyId = DYNASTY_ID } = useParams();
  const { dynasty, teams, rosters, progression, postseasonResults } = useDynastyData();
  const tenures = useCoachTenures(session?.user.id, dynastyId);
  const activeTenure = useMemo(
    () => tenures.find((tenure) => tenure.status === 'active') ?? session?.activeTenure ?? null,
    [tenures, session?.activeTenure]
  );
  const completedSeasons = useMemo(
    () => (activeTenure ? seasonsForTenure(dynasty, activeTenure) : []),
    [dynasty, activeTenure]
  );
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const effectiveYear = selectedYear ?? completedSeasons[0]?.year ?? null;
  const selectedSeason = completedSeasons.find((season) => season.year === effectiveYear);

  useEffect(() => {
    if (completedSeasons.length === 0) {
      setSelectedYear(null);
      return;
    }
    setSelectedYear((current) => {
      if (current && completedSeasons.some((season) => season.year === current)) return current;
      return completedSeasons[0]?.year ?? null;
    });
  }, [completedSeasons, activeTenure?.id]);

  if (!activeTenure) {
    return (
      <section className="panel">
        <h3>Coaching Career</h3>
        <p className="muted">No active team assigned yet.</p>
      </section>
    );
  }

  if (completedSeasons.length === 0) {
    return (
      <section className="panel">
        <h3>Coaching Career</h3>
        <p className="muted">
          No completed seasons yet for {teamName(activeTenure.teamId, teams)}. Completed seasons appear here
          after rollover.
        </p>
      </section>
    );
  }

  return (
    <section className="grid two">
      <div className="panel full">
        <div className="section-header history-selectors">
          <div>
            <p className="eyebrow">Coaching Career</p>
            <h3 className="team-heading">
              <TeamMark team={teamForId(activeTenure.teamId, teams)} teamId={activeTenure.teamId} />
              <span>{teamName(activeTenure.teamId, teams)}</span>
            </h3>
            <p className="muted">Browse completed seasons with your current team.</p>
          </div>
          <select
            value={effectiveYear ?? ''}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
          >
            {completedSeasons.map((season) => (
              <option key={season.year} value={season.year}>
                {season.year} · {season.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {selectedSeason && effectiveYear !== null && (
        <HistoricalSeasonDashboard
          teamId={activeTenure.teamId}
          season={selectedSeason}
          dynasty={dynasty}
          teams={teams}
          rosters={rosters}
          progression={progression}
          postseasonResults={postseasonResults}
          dynastyId={dynastyId}
        />
      )}
    </section>
  );
}

function CoachArchivePage() {
  const { session } = useAuth();
  const { dynastyId = DYNASTY_ID } = useParams();
  const { dynasty, teams, rosters, progression, postseasonResults } = useDynastyData();
  const tenures = useCoachTenures(session?.user.id, dynastyId);
  const archivedTenures = useMemo(
    () =>
      [...tenures.filter((tenure) => tenure.status !== 'active')].sort(
        (a, b) => b.startSeasonYear - a.startSeasonYear
      ),
    [tenures]
  );
  const [selectedTenureId, setSelectedTenureId] = useState('');
  const selectedTenure =
    archivedTenures.find((tenure) => tenure.id === selectedTenureId) ?? archivedTenures[0];
  const completedSeasons = useMemo(
    () => (selectedTenure ? seasonsForTenure(dynasty, selectedTenure) : []),
    [dynasty, selectedTenure]
  );
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const effectiveYear = selectedYear ?? completedSeasons[0]?.year ?? null;
  const selectedSeason = completedSeasons.find((season) => season.year === effectiveYear);

  useEffect(() => {
    if (archivedTenures.length === 0) {
      setSelectedTenureId('');
      return;
    }
    setSelectedTenureId((current) =>
      archivedTenures.some((tenure) => tenure.id === current) ? current : archivedTenures[0]!.id
    );
    setSelectedYear(null);
  }, [archivedTenures, session?.user.id]);

  useEffect(() => {
    if (completedSeasons.length === 0) {
      setSelectedYear(null);
      return;
    }
    setSelectedYear((current) => {
      if (current && completedSeasons.some((season) => season.year === current)) return current;
      return completedSeasons[0]?.year ?? null;
    });
  }, [completedSeasons, selectedTenure?.id]);

  if (archivedTenures.length === 0) {
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
        <div className="section-header history-selectors">
          <div>
            <p className="eyebrow">Archive</p>
            <h3>Past Teams</h3>
            <p className="muted">Select a previous team, then a season year.</p>
          </div>
          <div className="history-selector-row">
            <select
              value={selectedTenure?.id ?? ''}
              onChange={(event) => {
                setSelectedTenureId(event.target.value);
                setSelectedYear(null);
              }}
            >
              {archivedTenures.map((tenure) => (
                <option key={tenure.id} value={tenure.id}>
                  {teamName(tenure.teamId, teams)} ({tenure.startSeasonYear}-
                  {tenure.endSeasonYear ?? 'End'})
                </option>
              ))}
            </select>
            {completedSeasons.length > 0 ? (
              <select
                value={effectiveYear ?? ''}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
              >
                {completedSeasons.map((season) => (
                  <option key={season.year} value={season.year}>
                    {season.year} · {season.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="muted">No completed seasons</span>
            )}
          </div>
        </div>
      </div>
      {selectedTenure && selectedSeason && effectiveYear !== null ? (
        <HistoricalSeasonDashboard
          teamId={selectedTenure.teamId}
          season={selectedSeason}
          dynasty={dynasty}
          teams={teams}
          rosters={rosters}
          progression={progression}
          postseasonResults={postseasonResults}
          dynastyId={dynastyId}
        />
      ) : (
        <div className="panel full">
          <p className="muted">No completed seasons archived for this team yet.</p>
        </div>
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

function TeamNameWithMark({
  teamId,
  teams,
  size = 'sm',
}: {
  teamId: string;
  teams: Team[];
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span className="team-name-with-mark">
      <TeamMark team={teamForId(teamId, teams)} teamId={teamId} size={size} />
      <span>{teamName(teamId, teams)}</span>
    </span>
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
              {progressionSnapshotShortLabel(point.snapshot)}
            </text>
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        {points.map((point) => (
          <span key={point.snapshot.id}>
          {point.snapshot.label ?? progressionSnapshotShortLabel(point.snapshot)}: <strong>{point.overall}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function seasonsForTenure(dynasty: Dynasty, tenure: TeamTenure): Season[] {
  return dynasty.seasons
    .filter(
      (season) =>
        season.year >= tenure.startSeasonYear &&
        season.year <= (tenure.endSeasonYear ?? dynasty.currentSeasonYear - 1) &&
        season.year < dynasty.currentSeasonYear
    )
    .sort((a, b) => b.year - a.year);
}

function getTeamScheduleForSeason(teamId: string, season: Season): ScheduleGame[] {
  return (season.schedule ?? [])
    .filter((game) => game.homeTeamId === teamId || game.awayTeamId === teamId)
    .sort((a, b) => a.week - b.week);
}

type ScheduleDisplayRow =
  | { kind: 'game'; game: ScheduleGame }
  | { kind: 'postseason'; week: number; result: PostseasonResult };

function buildScheduleRowsWithPostseason(
  schedule: ScheduleGame[],
  postseasonResults: PostseasonResult[]
): ScheduleDisplayRow[] {
  if (postseasonResults.length === 0) {
    return schedule.map((game) => ({ kind: 'game', game }));
  }

  const regularSeasonRows = schedule
    .filter((game) => game.week < 15)
    .map<ScheduleDisplayRow>((game) => ({ kind: 'game', game }));
  const postseasonRows = [...postseasonResults]
    .sort((a, b) => postseasonSortValue(a.kind) - postseasonSortValue(b.kind))
    .map<ScheduleDisplayRow>((result, index) => ({
      kind: 'postseason',
      week: 15 + index,
      result,
    }));

  return [...regularSeasonRows, ...postseasonRows];
}

function postseasonSortValue(kind: PostseasonResult['kind']): number {
  switch (kind) {
    case 'conference_championship':
      return 0;
    case 'playoff':
      return 1;
    case 'bowl':
      return 2;
    case 'national_championship':
      return 3;
    default:
      return 4;
  }
}

function postseasonKindLabel(kind: PostseasonResult['kind']): string {
  switch (kind) {
    case 'conference_championship':
      return 'Conference Championship';
    case 'national_championship':
      return 'National Championship';
    case 'playoff':
      return 'Playoff';
    case 'bowl':
      return 'Bowl';
    default:
      return kind;
  }
}

function nationalChampionForSeason(
  season: Season,
  postseasonResults: PostseasonResult[]
): { teamId: string; titleLabel?: string } | undefined {
  if (season.nationalChampionTeamId) {
    return {
      teamId: season.nationalChampionTeamId,
      titleLabel: 'National Championship',
    };
  }

  const seasonPostseason = postseasonResults.filter((item) => item.seasonYear === season.year);
  const explicitChampion = seasonPostseason.find(
    (item) => item.kind === 'national_championship' && item.isChampion
  );
  if (explicitChampion) return explicitChampion;

  return seasonPostseason.find(
    (item) =>
      item.isChampion &&
      /\bnational\b/i.test(`${item.titleLabel ?? ''} ${item.round ?? ''}`)
  );
}

function postseasonScheduleTitle(result: PostseasonResult, teams: Team[]): string {
  if (result.opponentTeamId) {
    return `${result.titleLabel ?? postseasonKindLabel(result.kind)} vs ${teamName(result.opponentTeamId, teams)}`;
  }
  return result.titleLabel ?? postseasonKindLabel(result.kind);
}

function formatPostseasonResult(result: PostseasonResult): string {
  if (result.teamScore !== undefined && result.opponentScore !== undefined) {
    const outcome =
      result.teamScore > result.opponentScore ? 'W' : result.teamScore < result.opponentScore ? 'L' : 'T';
    return `${outcome} ${result.teamScore}-${result.opponentScore}`;
  }
  return result.isChampion ? 'Champion' : 'Recorded';
}

function getTop25ForSeason(
  teams: Team[] = PLACEHOLDER_TEAMS,
  dynasty?: Dynasty,
  seasonYear?: number,
  week?: number
): Array<{ rank: number; team: Team; wins: number; losses: number }> {
  const snapshot = getTop25SnapshotForSeason(dynasty, seasonYear, week);
  const season = dynasty?.seasons.find((item) => item.year === seasonYear);
  return top25RowsFromSnapshot(teams, snapshot, season, week);
}

function getTop25SnapshotForSeason(
  dynasty?: Dynasty,
  seasonYear?: number,
  week?: number
): RankingSnapshot | undefined {
  const snapshots = [...(dynasty?.rankings ?? [])]
    .filter((item) => item.pollType === 'top25')
    .filter((item) => seasonYear === undefined || item.seasonYear === seasonYear)
    .filter((item) => week === undefined || item.week === undefined || item.week <= week)
    .sort((a, b) => {
      const weekDiff = (b.week ?? -1) - (a.week ?? -1);
      if (weekDiff !== 0) return weekDiff;
      return b.capturedAt.localeCompare(a.capturedAt);
    });
  return snapshots[0];
}

function top25RowsFromSnapshot(
  teams: Team[] = PLACEHOLDER_TEAMS,
  snapshot?: RankingSnapshot,
  season?: Season,
  week?: number
): Array<{ rank: number; team: Team; wins: number; losses: number }> {
  if (!snapshot) return [];

  return snapshot.entries
    .map((entry) => {
      const team = teams.find((item) => item.id === entry.teamId);
      const record = season ? getTeamRecordThroughWeek(entry.teamId, season, week ?? snapshot.week) : null;
      return team
        ? {
            rank: entry.rank,
            team,
            wins: record?.wins ?? entry.wins,
            losses: record?.losses ?? entry.losses,
          }
        : null;
    })
    .filter((row): row is { rank: number; team: Team; wins: number; losses: number } => Boolean(row))
    .sort((a, b) => a.rank - b.rank);
}

function finalRosterForTeamSeason(
  dynasty: Dynasty,
  rosters: Record<string, Roster>,
  teamId: string,
  seasonYear: number
): Roster | undefined {
  const snapshots = (dynasty.teamRosterSnapshots ?? []).filter(
    (item) => item.teamId === teamId && item.seasonYear === seasonYear
  );
  const seasonFinal = snapshots.find((item) => item.snapshotType === 'season_final');
  if (seasonFinal) return seasonFinal.roster;

  const latest = [...snapshots].sort((a, b) => b.archivedAt.localeCompare(a.archivedAt))[0];
  if (latest) return latest.roster;

  return rosters[teamId];
}

function getTeamSchedule(teamId: string, dynasty?: Dynasty): ScheduleGame[] {
  const currentSeason =
    dynasty?.seasons.find((season) => season.year === dynasty.currentSeasonYear) ??
    [...(dynasty?.seasons ?? [])].sort((a, b) => b.year - a.year)[0];
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

function getTeamRecordThroughWeek(
  teamId: string,
  season: Season,
  week?: number
): { wins: number; losses: number } | null {
  const gamesById = new Map(
    season.schedule
      .filter((game) => game.homeTeamId === teamId || game.awayTeamId === teamId)
      .filter((game) => week === undefined || game.week <= week)
      .map((game) => [game.id, game])
  );
  const games = [...gamesById.values()].filter((game) => !game.isBye);
  if (games.length === 0) return null;
  return getTeamRecord(teamId, getRegularSeasonSchedule(games));
}

function getRegularSeasonSchedule(schedule: ScheduleGame[]): ScheduleGame[] {
  return schedule.filter((game) => game.week < 15);
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

function playerOptionLabel(player: Player): string {
  return `#${player.jerseyNumber ?? '-'} · ${player.firstName} ${player.lastName} · ${player.position} · OVR ${
    player.ratings.overall ?? '-'
  }`;
}

type ProgressionPlayerOption = {
  id: string;
  label: string;
  sortGroup: number;
  teamLabel?: string;
  status?: string;
  player?: Player;
  progression?: PlayerProgression;
};

function buildProgressionPlayerOptions(
  players: Player[],
  progression: PlayerProgression[],
  playerCatalog: PlayerCatalogEntry[] = [],
  teams: Team[] = PLACEHOLDER_TEAMS,
  coachedTeamIds: Set<string> = new Set(),
  activeTeamId?: string
): ProgressionPlayerOption[] {
  const progressionByPlayerId = new Map(progression.map((item) => [item.playerId, item]));
  const catalogByPlayerId = new Map(playerCatalog.map((item) => [item.playerId, item]));
  const optionsById = new Map<string, ProgressionPlayerOption>();

  for (const player of players) {
    const matchedProgression = progressionByPlayerId.get(player.id);
    const catalogEntry = catalogByPlayerId.get(player.id);
    const teamLabel = teamName(player.teamId, teams);
    const status = playerCatalogStatus(catalogEntry, activeTeamId);
    optionsById.set(player.id, {
      id: player.id,
      label: [playerOptionLabel(player), teamLabel, status ?? 'Current'].filter(Boolean).join(' · '),
      sortGroup: 0,
      teamLabel,
      status: status ?? 'Current',
      player,
      progression: matchedProgression,
    });
  }

  for (const item of progression) {
    if (optionsById.has(item.playerId)) continue;
    const catalogEntry = catalogByPlayerId.get(item.playerId);
    const latestSnapshot = [...item.snapshots].sort(
      (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
    ).at(-1);
    const teamId = coachedTeamIdForPlayer(item, catalogEntry, coachedTeamIds) ?? item.teamId;
    const teamLabel = teamName(teamId, teams);
    const status = playerCatalogStatus(catalogEntry, teamId) ?? (teamId === activeTeamId ? 'Current' : 'Archived');
    const sortGroup = teamId === activeTeamId ? 0 : status === 'Archived' ? 1 : 2;
    optionsById.set(item.playerId, {
      id: item.playerId,
      label: [
        item.playerName,
        item.position,
        `OVR ${latestSnapshot?.ratings.overall ?? '-'}`,
        teamLabel,
        status,
      ].filter(Boolean).join(' · '),
      sortGroup,
      teamLabel,
      status,
      progression: item,
    });
  }

  return [...optionsById.values()];
}

function progressionSnapshotShortLabel(snapshot: PlayerProgressionSnapshot): string {
  if (snapshot.week === 16 || /final/i.test(snapshot.label ?? '')) return `${snapshot.seasonYear} Final`;
  if (typeof snapshot.week === 'number') return `${snapshot.seasonYear} W${snapshot.week}`;
  return snapshot.seasonYear.toString();
}

function getProgressionForTeams(
  progression: PlayerProgression[],
  playerCatalog: PlayerCatalogEntry[] = [],
  teamIds: Set<string> = new Set()
): PlayerProgression[] {
  if (teamIds.size === 0) return [];
  const catalogByPlayerId = new Map(playerCatalog.map((item) => [item.playerId, item]));
  return progression.filter((item) => {
    if (teamIds.has(item.teamId)) return true;
    const catalogEntry = catalogByPlayerId.get(item.playerId);
    return Boolean(
      (catalogEntry?.exitTeamId && teamIds.has(catalogEntry.exitTeamId)) ||
        catalogEntry?.teams.some((span) => teamIds.has(span.teamId))
    );
  });
}

function coachedTeamIdForPlayer(
  progression: PlayerProgression,
  catalogEntry: PlayerCatalogEntry | undefined,
  coachedTeamIds: Set<string>
): string | undefined {
  const catalogTeamId = catalogEntry?.teams.find((span) => coachedTeamIds.has(span.teamId))?.teamId;
  if (catalogTeamId) return catalogTeamId;
  if (coachedTeamIds.has(progression.teamId)) return progression.teamId;
  return catalogEntry?.exitTeamId && coachedTeamIds.has(catalogEntry.exitTeamId)
    ? catalogEntry.exitTeamId
    : undefined;
}

function playerCatalogStatus(entry: PlayerCatalogEntry | undefined, teamId?: string): string | undefined {
  if (!entry || entry.exitStatus === 'active') return undefined;
  if (teamId && entry.exitTeamId && entry.exitTeamId !== teamId) return undefined;
  switch (entry.exitStatus) {
    case 'graduated':
      return 'Graduated';
    case 'transferred':
      return 'Transferred';
    case 'unknown':
      return 'No longer on roster';
    default:
      return undefined;
  }
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

function sortRosterPlayers(
  players: Player[],
  positionFilter: string,
  rosterSort: { key: RosterSortKey; direction: SortDirection }
): Player[] {
  const filteredPlayers =
    positionFilter === 'all'
      ? players
      : players.filter(
          (player) => normalizePosition(player.position) === normalizePosition(positionFilter)
        );

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

function getCurrentWeek(dynasty?: Dynasty): number | null {
  const seasonYear = dynasty?.currentSeasonYear;
  if (!seasonYear) return null;
  const weeks = (dynasty?.checkpoints ?? [])
    .filter((checkpoint) => checkpoint.seasonYear === seasonYear)
    .map((checkpoint) => checkpoint.week);
  return weeks.length > 0 ? Math.max(...weeks) : null;
}

function getCurrentTop25(
  teams: Team[] = PLACEHOLDER_TEAMS,
  dynasty?: Dynasty,
  seasonYear = dynasty?.currentSeasonYear,
  week?: number
): Array<{ rank: number; team: Team; wins: number; losses: number }> {
  return getTop25ForSeason(teams, dynasty, seasonYear, week);
}

function teamConference(teamId: string, teams: Team[] = PLACEHOLDER_TEAMS): string {
  return teams.find((team) => team.id === teamId)?.conferenceId ?? '';
}

function teamForId(teamId: string, teams: Team[] = PLACEHOLDER_TEAMS): Team | undefined {
  return teams.find((team) => team.id === teamId);
}

function teamName(teamId: string, teams: Team[] = PLACEHOLDER_TEAMS): string {
  return teams.find((t) => t.id === teamId)?.name ?? teamId;
}

function conferenceName(conferenceId: string): string {
  const conference = PLACEHOLDER_CONFERENCES.find((item) => item.id === conferenceId);
  return conference?.abbreviation ?? conference?.name ?? conferenceId;
}

function userName(userId: string, users: AppUser[] = []): string {
  return users.find((user) => user.id === userId)?.displayName ?? userId;
}

