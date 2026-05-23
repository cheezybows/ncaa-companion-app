import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  PLACEHOLDER_CONFERENCES,
  PLACEHOLDER_DYNASTY,
  PLACEHOLDER_ROSTERS,
  PLACEHOLDER_TEAMS,
} from '@ncaa/domain';
import type {
  AppUser,
  DynastyArchiveSummary,
  PostseasonResult,
  RankingEntry,
  Roster,
  ScheduleGame,
  SeasonAdvanceAction,
  SeasonAdvanceAssignmentInput,
  SeasonAdvancePreview,
  Team,
  TeamTenure,
  WeekAdvancePreview,
} from '@ncaa/domain';
import { getCompanionApi } from './api';
import type { CommissionerConfig, PublishResult, RosterImportRecord } from './api';

const api = getCompanionApi();

type Top25DraftRow = {
  rank: number;
  teamId: string;
  wins: number;
  losses: number;
};

type ScheduleDraftRow = {
  id: string;
  week: number;
  site: 'home' | 'away' | 'bye';
  opponentTeamId: string;
  isBye?: boolean;
  isPlayed: boolean;
  teamScore: number;
  opponentScore: number;
  isConferenceGame?: boolean;
};

type RosterDraftRow = {
  id: string;
  jerseyNumber?: number;
  firstName: string;
  lastName: string;
  position: string;
  overall?: number;
};

const TRADITIONAL_BOWL_GAMES = [
  'Alamo Bowl',
  'Boca Raton Bowl',
  'Camellia Bowl',
  'Cheez-It Citrus Bowl',
  'Cure Bowl',
  "Duke's Mayo Bowl",
  'Fenway Bowl',
  'Frisco Bowl',
  'GameAbove Sports Bowl',
  'Gasparilla Bowl',
  'Gator Bowl',
  'Hawaii Bowl',
  'Holiday Bowl',
  'Independence Bowl',
  'LA Bowl',
  'Las Vegas Bowl',
  'LendingTree Bowl',
  'Liberty Bowl',
  'Military Bowl',
  'Music City Bowl',
  'Pop-Tarts Bowl',
  'Rate Bowl',
  'ReliaQuest Bowl',
  'Texas Bowl',
] as const;

type BowlWinDraftRow = {
  id: string;
  bowlName: string;
  teamId: string;
};

export function CommissionerOverviewPage() {
  const [config, setConfig] = useState<CommissionerConfig | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [tenures, setTenures] = useState<TeamTenure[]>([]);
  const [imports, setImports] = useState<RosterImportRecord[]>([]);
  const [scheduleImports, setScheduleImports] = useState<
    Awaited<ReturnType<NonNullable<typeof api.listScheduleImports>>>
  >([]);
  const [top25Imports, setTop25Imports] = useState<
    Awaited<ReturnType<NonNullable<typeof api.listTop25Imports>>>
  >([]);
  const [scheduleImportCount, setScheduleImportCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!api.getCommissionerConfig) return;
      const nextConfig = await api.getCommissionerConfig();
      setConfig(nextConfig);
      const [nextUsers, nextTenures, nextImports, nextScheduleImports, nextTop25Imports, history] = await Promise.all([
        api.listUsers?.() ?? [],
        api.listCommissionerTenures?.(nextConfig.dynastyId) ?? [],
        api.listRosterImports?.(nextConfig.dynastyId) ?? [],
        api.listScheduleImports?.() ?? [],
        api.listTop25Imports?.() ?? [],
        api.listPublishHistory?.(nextConfig.dynastyId) ?? [],
      ]);
      setUsers(nextUsers);
      setTenures(nextTenures);
      setImports(nextImports);
      setScheduleImports(nextScheduleImports);
      setTop25Imports(nextTop25Imports);
      setScheduleImportCount(nextScheduleImports.length);
      setHistoryCount(history.length);
    })();
  }, []);

  const activeUserCards = useMemo(() => {
    const userById = new Map(users.map((user) => [user.id, user]));
    const placeholderTeamById = new Map(PLACEHOLDER_TEAMS.map((team) => [team.id, team]));
    const importedTeamById = new Map(imports.map((item) => [item.teamId, item.team]));
    const conferenceById = new Map(PLACEHOLDER_CONFERENCES.map((conference) => [conference.id, conference]));

    return tenures
      .filter((tenure) => tenure.status === 'active')
      .map((tenure) => {
        const user = userById.get(tenure.userId);
        const team = importedTeamById.get(tenure.teamId) ?? placeholderTeamById.get(tenure.teamId);
        const importedSchedule = scheduleImports.find((item) =>
          item.season.standings.some((standing) => standing.teamId === tenure.teamId)
        );
        const standing = importedSchedule?.season.standings.find((row) => row.teamId === tenure.teamId);

        return {
          id: tenure.id,
          coachName: user?.displayName ?? tenure.userId,
          coachEmail: user?.email ?? '',
          teamName: team?.name ?? tenure.teamId,
          teamAbbreviation: team?.abbreviation ?? tenure.teamId,
          teamOverall: team?.overallRating,
          teamOffense: team?.offensiveRating,
          teamDefense: team?.defensiveRating,
          conference:
            conferenceById.get(team?.conferenceId ?? '')?.abbreviation ??
            conferenceById.get(team?.conferenceId ?? '')?.name ??
            team?.conferenceId ??
            '—',
          record: standing ? `${standing.wins}-${standing.losses}` : '0-0',
          lastLogin: 'Not tracked yet',
        };
      })
      .sort((a, b) => a.coachName.localeCompare(b.coachName));
  }, [imports, scheduleImports, tenures, users]);

  const seasonOverview = useMemo(() => {
    const importedCurrentSeason = [...scheduleImports].sort((a, b) => b.season.year - a.season.year)[0]?.season;
    const fallbackCurrentSeason =
      PLACEHOLDER_DYNASTY.seasons.find((season) => season.year === PLACEHOLDER_DYNASTY.currentSeasonYear) ??
      PLACEHOLDER_DYNASTY.seasons[0];
    const currentSeason = importedCurrentSeason ?? fallbackCurrentSeason;
    const teamById = new Map(PLACEHOLDER_TEAMS.map((team) => [team.id, team]));
    const userById = new Map(users.map((user) => [user.id, user]));
    const coachForTeamSeason = (teamId: string, seasonYear: number) => {
      const tenure = tenures.find(
        (item) =>
          item.teamId === teamId &&
          item.startSeasonYear <= seasonYear &&
          (item.endSeasonYear === undefined || item.endSeasonYear >= seasonYear)
      );
      if (!tenure) return null;
      return {
        id: tenure.userId,
        name: userById.get(tenure.userId)?.displayName ?? tenure.userId,
      };
    };
    const latestTop25 = [...top25Imports]
      .sort((a, b) => b.rankings.capturedAt.localeCompare(a.rankings.capturedAt))[0];
    const rankedTeams = latestTop25
      ? latestTop25.rankings.entries.slice(0, 3).map((entry) => ({
          rank: entry.rank,
          teamName: teamById.get(entry.teamId)?.name ?? entry.teamName,
          record: `${entry.wins}-${entry.losses}`,
        }))
      : [];
    const allSeasons = [
      ...PLACEHOLDER_DYNASTY.seasons,
      ...scheduleImports.map((item) => item.season),
    ];
    const previousSeason = allSeasons
      .filter((season) => season.year < (currentSeason?.year ?? PLACEHOLDER_DYNASTY.currentSeasonYear))
      .sort((a, b) => b.year - a.year)[0];
    const pastChampionStanding = previousSeason?.standings.find((standing) => standing.ranking === 1);
    const pastChampion =
      pastChampionStanding && previousSeason
        ? coachForTeamSeason(pastChampionStanding.teamId, previousSeason.year)?.name ?? 'Unassigned'
        : 'Not tracked yet';
    const recordsByUser = new Map<string, { coachName: string; wins: number; losses: number }>();
    for (const season of allSeasons) {
      for (const standing of season.standings) {
        const coach = coachForTeamSeason(standing.teamId, season.year);
        if (!coach) continue;
        const record = recordsByUser.get(coach.id) ?? { coachName: coach.name, wins: 0, losses: 0 };
        record.wins += standing.wins;
        record.losses += standing.losses;
        recordsByUser.set(coach.id, record);
      }
    }
    const bestRecord = [...recordsByUser.values()]
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
      .map((record) => ({
        coachName: record.coachName,
        record: `${record.wins}-${record.losses}`,
      }))[0];

    return {
      seasonYear: currentSeason?.year ?? PLACEHOLDER_DYNASTY.currentSeasonYear,
      topRankedTeams: rankedTeams,
      pastChampion,
      bestRecord,
    };
  }, [scheduleImports, tenures, top25Imports, users]);

  if (!api.getCommissionerConfig) {
    return (
      <section className="panel">
        <h3>Commissioner Console</h3>
        <p className="muted">Open the Electron desktop app to manage assignments and publishing.</p>
      </section>
    );
  }

  return (
    <section className="grid two">
      <article className="panel full season-overview-card">
        <div>
          <p className="eyebrow">Current Season</p>
          <h2>{seasonOverview.seasonYear}</h2>
        </div>
        <div className="season-center-stats">
          <div>
            <span>Past Champion</span>
            <strong>{seasonOverview.pastChampion}</strong>
          </div>
          <div>
            <span>Best W-L All Time</span>
            <strong>
              {seasonOverview.bestRecord
                ? `${seasonOverview.bestRecord.coachName} ${seasonOverview.bestRecord.record}`
                : 'No records imported yet'}
            </strong>
          </div>
        </div>
        <div className="season-history">
          <span>Current Top 3</span>
          {seasonOverview.topRankedTeams.length === 0 ? (
            <p>No rankings imported yet.</p>
          ) : (
            <ol>
              {seasonOverview.topRankedTeams.map((team, index) => (
                <li key={team.teamName} className={`rank-${index + 1}`}>
                  <strong>#{team.rank} {team.teamName}</strong>
                  <em>{team.record}</em>
                </li>
              ))}
            </ol>
          )}
        </div>
      </article>
      <article className="panel full">
        <div className="section-header">
          <div>
            <h3>Active Users</h3>
            <p className="muted">Coach assignments and team snapshots from the local commissioner store.</p>
          </div>
          <span className="pill">{activeUserCards.length} active</span>
        </div>
        {activeUserCards.length === 0 ? (
          <p className="muted">Assign coaches to teams to populate this overview.</p>
        ) : (
          <div className="active-user-grid">
            {activeUserCards.map((card) => (
              <div key={card.id} className="active-user-card">
                <div className="active-user-card-header">
                  <div>
                    <span>{card.coachEmail || 'Coach'}</span>
                    <strong>{card.coachName}</strong>
                  </div>
                  <em>{card.teamAbbreviation}</em>
                </div>
                <div className="active-team-name">{card.teamName}</div>
                <div className="active-rating-strip">
                  <div>
                    <strong>{card.teamOverall ?? '—'}</strong>
                    <span>OVR</span>
                  </div>
                  <div>
                    <strong>{card.teamOffense ?? '—'}</strong>
                    <span>OFF</span>
                  </div>
                  <div>
                    <strong>{card.teamDefense ?? '—'}</strong>
                    <span>DEF</span>
                  </div>
                </div>
                <div className="active-user-stats">
                  <div>
                    <span>Conference</span>
                    <strong>{card.conference}</strong>
                  </div>
                  <div>
                    <span>Record</span>
                    <strong>{card.record}</strong>
                  </div>
                </div>
                <p className="active-last-login">Last Login: {card.lastLogin}</p>
              </div>
            ))}
          </div>
        )}
      </article>
      <div className="overview-details-toggle full">
        <button className="subtle-link" onClick={() => setShowDetails((value) => !value)}>
          {showDetails ? 'Hide details' : 'See more details...'}
        </button>
      </div>
      {showDetails && (
        <>
          <article className="panel">
            <h3>Commissioner Console</h3>
            <p className="muted">
              Local SQLite is the source of truth. Publishing pushes snapshots to the hosted API for
              coaches.
            </p>
            <dl className="meta-list">
              <div>
                <dt>Hosted API</dt>
                <dd>{config?.apiUrl ?? '—'}</dd>
              </div>
              <div>
                <dt>Dynasty</dt>
                <dd>{config?.dynastyId ?? '—'}</dd>
              </div>
              <div>
                <dt>Active tenures (local)</dt>
                <dd>{tenures.filter((t) => t.status === 'active').length}</dd>
              </div>
              <div>
                <dt>Roster imports</dt>
                <dd>{imports.length}</dd>
              </div>
              <div>
                <dt>Schedule imports</dt>
                <dd>{scheduleImportCount}</dd>
              </div>
              <div>
                <dt>Publish events</dt>
                <dd>{historyCount}</dd>
              </div>
            </dl>
          </article>
          <article className="panel">
            <h3>Workflow</h3>
            <ol className="muted">
              <li>Assign coaches to teams</li>
              <li>Select an assigned team on Imports</li>
              <li>Upload roster and schedule screenshots for that team</li>
              <li>Publish to hosted so the coach portal reads live data</li>
            </ol>
          </article>
        </>
      )}
    </section>
  );
}

export function CommissionerUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppUser['role']>('coach');
  const [accessStatus, setAccessStatus] = useState<AppUser['accessStatus']>('active');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [passwordResetRequired, setPasswordResetRequired] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const nextUsers = (await api.listUsers?.()) ?? [];
    setUsers(nextUsers);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const selectedUser = users.find((user) => user.id === selectedUserId);

  useEffect(() => {
    if (!selectedUser) return;
    setDisplayName(selectedUser.displayName);
    setEmail(selectedUser.email);
    setRole(selectedUser.role);
    setAccessStatus(selectedUser.accessStatus ?? 'active');
    setTemporaryPassword('');
    setPasswordResetRequired(selectedUser.passwordResetRequired ?? false);
  }, [selectedUser]);

  async function saveUser() {
    if (!api.saveUser) {
      setMessage('User management is available in the Electron desktop app.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const saved = await api.saveUser({
        id: selectedUserId || undefined,
        displayName,
        email,
        role,
        accessStatus,
        temporaryPassword,
        passwordResetRequired,
      });
      setMessage(`${selectedUserId ? 'Updated' : 'Added'} ${saved.displayName}.`);
      setSelectedUserId(saved.id);
      await refresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  if (!api.listUsers || !api.saveUser) {
    return (
      <section className="panel">
        <h3>Users</h3>
        <p className="muted">User management is available in the Electron desktop app.</p>
      </section>
    );
  }

  return (
    <section className="grid two">
      <div className="panel full">
        <div className="section-header">
          <div>
            <h3>Users</h3>
            <p className="muted">Add coaches, update accounts, then assign teams from Assign Teams.</p>
          </div>
        </div>
        {message && <div className="notice">{message}</div>}
      </div>

      <div className="panel">
        <h3>{selectedUserId ? 'Edit User' : 'Add User'}</h3>
        <div className="form-grid">
          <label className="stacked-field">
            <span>Existing User</span>
            <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
              <option value="">Create new user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} ({user.role})
                </option>
              ))}
            </select>
          </label>
          <label className="stacked-field">
            <span>Display Name</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label className="stacked-field">
            <span>Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="stacked-field">
            <span>Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value as AppUser['role'])}>
              <option value="coach">Coach</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Commissioner Admin</option>
            </select>
          </label>
          <label className="stacked-field">
            <span>Access</span>
            <select
              value={accessStatus ?? 'active'}
              onChange={(event) => setAccessStatus(event.target.value as AppUser['accessStatus'])}
            >
              <option value="active">Active</option>
              <option value="disabled">Disabled / Remove access</option>
            </select>
          </label>
          <label className="stacked-field">
            <span>Temporary Password</span>
            <input
              value={temporaryPassword}
              onChange={(event) => {
                setTemporaryPassword(event.target.value);
                if (event.target.value) setPasswordResetRequired(true);
              }}
              placeholder={selectedUserId ? 'Leave blank to keep current password' : 'Set initial password'}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={passwordResetRequired}
              onChange={(event) => setPasswordResetRequired(event.target.checked)}
            />
            <span>Require password reset on next sign-in</span>
          </label>
          <button onClick={() => void saveUser()} disabled={busy || !displayName.trim() || !email.trim()}>
            {busy ? 'Saving...' : selectedUserId ? 'Update User' : 'Add User'}
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>Current Users</h3>
        <DataTable
          headers={['Name', 'Email', 'Role', 'Access', 'Password']}
          rows={users.map((user) => [
            user.displayName,
            user.email,
            user.role,
            user.accessStatus ?? 'active',
            user.passwordResetRequired ? 'Reset required' : user.passwordUpdatedAt ? 'Set' : 'Not set',
          ])}
          empty="No users added yet."
        />
      </div>
    </section>
  );
}

export function CommissionerAssignmentsPage() {
  const [config, setConfig] = useState<CommissionerConfig | null>(null);
  const [coaches, setCoaches] = useState<AppUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assignableTeamIds, setAssignableTeamIds] = useState<string[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [teams, setTeams] = useState<Team[]>(PLACEHOLDER_TEAMS);
  const [tenures, setTenures] = useState<TeamTenure[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showConferenceEditor, setShowConferenceEditor] = useState(false);

  async function refresh(dynastyId: string) {
    const [nextTenures, nextTeams] = await Promise.all([
      api.listCommissionerTenures?.(dynastyId) ?? [],
      api.listTeams?.() ?? PLACEHOLDER_TEAMS,
    ]);
    setTenures(nextTenures);
    setTeams(nextTeams);
    if (selectedUserId) {
      const teamIds = (await api.listAssignableTeams?.(dynastyId, selectedUserId)) ?? [];
      setAssignableTeamIds(teamIds);
    }
  }

  useEffect(() => {
    void (async () => {
      if (!api.getCommissionerConfig) return;
      const nextConfig = await api.getCommissionerConfig();
      setConfig(nextConfig);
      const nextCoaches = (await api.listCoaches?.()) ?? [];
      setCoaches(nextCoaches);
      setSelectedUserId(nextCoaches[0]?.id ?? '');
      await refresh(nextConfig.dynastyId);
    })();
  }, []);

  useEffect(() => {
    if (!config || !selectedUserId) return;
    void (async () => {
      const teamIds = (await api.listAssignableTeams?.(config.dynastyId, selectedUserId)) ?? [];
      setAssignableTeamIds(teamIds);
    })();
  }, [config, selectedUserId]);

  const teamById = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams]
  );
  const teamNameById = useMemo(
    () => new Map(teams.map((team) => [team.id, team.name])),
    [teams]
  );
  const sortedAssignableTeamIds = useMemo(
    () =>
      [...assignableTeamIds].sort((a, b) =>
        (teamNameById.get(a) ?? a).localeCompare(teamNameById.get(b) ?? b)
      ),
    [assignableTeamIds, teamNameById]
  );
  const visibleAssignableTeamIds = useMemo(() => {
    const query = teamSearch.trim().toLowerCase();
    if (!query) return sortedAssignableTeamIds;
    return sortedAssignableTeamIds.filter((teamId) => {
      const team = teamById.get(teamId);
      return (
        teamId.toLowerCase().includes(query) ||
        team?.name.toLowerCase().includes(query) ||
        team?.abbreviation.toLowerCase().includes(query) ||
        team?.conferenceId?.toLowerCase().includes(query)
      );
    });
  }, [sortedAssignableTeamIds, teamById, teamSearch]);

  useEffect(() => {
    if (visibleAssignableTeamIds.length === 0) {
      setSelectedTeamId('');
      return;
    }
    if (!visibleAssignableTeamIds.includes(selectedTeamId)) {
      setSelectedTeamId(visibleAssignableTeamIds[0] ?? '');
    }
  }, [selectedTeamId, visibleAssignableTeamIds]);

  async function assignTeam() {
    if (!config || !selectedUserId || !selectedTeamId || !api.assignCoachTeam) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.assignCoachTeam({
        dynastyId: config.dynastyId,
        userId: selectedUserId,
        teamId: selectedTeamId,
      });
      setMessage('Team assignment saved locally and pushed to the hosted API.');
      await refresh(config.dynastyId);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  if (!api.assignCoachTeam) {
    return (
      <section className="panel">
        <p className="muted">Team assignments are available in the Electron desktop app.</p>
      </section>
    );
  }

  if (showConferenceEditor) {
    return (
      <ConferenceEditorScreen
        teams={teams}
        onBack={() => setShowConferenceEditor(false)}
        onSaved={(updatedTeam) => {
          setTeams((current) =>
            current.map((team) => (team.id === updatedTeam.id ? updatedTeam : team))
          );
        }}
      />
    );
  }

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <h3>Assign Teams</h3>
          <p className="muted">One active team per coach. Prior tenures are archived on change.</p>
        </div>
        <div className="button-row">
          <button className="secondary" onClick={() => setShowConferenceEditor(true)}>
            Edit Conferences
          </button>
          <details className="overflow-menu">
            <summary aria-label="More assignment actions" title="More actions">
              ⋮
            </summary>
            <div className="overflow-menu-content">
              <button type="button" onClick={() => void api.refreshHostedUsers?.()}>
                Refresh coaches
              </button>
            </div>
          </details>
        </div>
      </div>
      {message && <div className="notice">{message}</div>}
      <div className="assignment-form-card">
        <label className="stacked-field">
          <span>Coach</span>
          <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
            {coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.displayName}
              </option>
            ))}
          </select>
        </label>

        <div className="team-picker">
          <label className="stacked-field">
            <span>Find Team</span>
            <input
              placeholder="Search by name, abbreviation, or conference..."
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
            />
          </label>
          <label className="stacked-field">
            <span>Team</span>
            <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}>
              {visibleAssignableTeamIds.map((teamId) => (
                <option key={teamId} value={teamId}>
                  {teamNameById.get(teamId) ?? teamId}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="assignment-form-footer">
          <span className="muted">
            {visibleAssignableTeamIds.length} of {assignableTeamIds.length} teams available
          </span>
          <button onClick={() => void assignTeam()} disabled={busy || !selectedTeamId}>
            {busy ? 'Assigning...' : 'Assign Team'}
          </button>
        </div>
      </div>
      <h4>Recent tenures</h4>
      <DataTable
        headers={['Coach', 'Team', 'Status', 'Season', 'Label']}
        rows={tenures.slice(0, 12).map((tenure) => [
          coaches.find((c) => c.id === tenure.userId)?.displayName ?? tenure.userId,
          teamNameById.get(tenure.teamId) ?? tenure.teamId,
          tenure.status,
          String(tenure.startSeasonYear),
          tenure.label ?? '—',
        ])}
      />
    </section>
  );
}

function ConferenceEditorScreen({
  teams,
  onBack,
  onSaved,
}: {
  teams: Team[];
  onBack: () => void;
  onSaved: (team: Team) => void;
}) {
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const conferenceById = useMemo(
    () => new Map(PLACEHOLDER_CONFERENCES.map((conference) => [conference.id, conference])),
    []
  );

  const visibleTeams = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name));
    if (!query) return sortedTeams;
    return sortedTeams.filter((team) => {
      const conference = conferenceById.get(team.conferenceId ?? '');
      return (
        team.name.toLowerCase().includes(query) ||
        team.abbreviation.toLowerCase().includes(query) ||
        team.id.toLowerCase().includes(query) ||
        (conference?.name.toLowerCase().includes(query) ?? false) ||
        (conference?.abbreviation?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [conferenceById, search, teams]);

  async function updateConference(team: Team, conferenceId: string) {
    if (!api.updateTeamConference) {
      setMessage('Conference editing is available in the Electron desktop app.');
      return;
    }
    setSavingTeamId(team.id);
    setMessage(null);
    try {
      const updated = await api.updateTeamConference({ teamId: team.id, conferenceId });
      onSaved(updated);
      const conference = conferenceById.get(conferenceId);
      setMessage(`${updated.name} moved to ${conference?.abbreviation ?? conference?.name ?? conferenceId}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingTeamId(null);
    }
  }

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <h3>Conference Realignment</h3>
          <p className="muted">Search every team and edit its conference to match your in-game setup.</p>
        </div>
        <button className="secondary" onClick={onBack}>
          Back to Assign Teams
        </button>
      </div>
      {message && <div className="notice">{message}</div>}
      <label className="stacked-field">
        <span>Search teams or conferences</span>
        <input
          placeholder="Search Alabama, SEC, Big Ten..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className="conference-editor-list">
        {visibleTeams.map((team) => {
          const conference = conferenceById.get(team.conferenceId ?? '');
          return (
            <div className="conference-editor-row" key={team.id}>
              <div>
                <strong>{team.name}</strong>
                <span>
                  {team.abbreviation} - {conference?.abbreviation ?? conference?.name ?? 'No conference'}
                </span>
              </div>
              <select
                value={team.conferenceId ?? ''}
                onChange={(event) => void updateConference(team, event.target.value)}
                disabled={savingTeamId === team.id}
              >
                {PLACEHOLDER_CONFERENCES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.abbreviation ? `${item.abbreviation} - ${item.name}` : item.name}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <p className="muted">
        Showing {visibleTeams.length} of {teams.length} teams.
      </p>
    </section>
  );
}

export function CommissionerAdvanceSeasonPage() {
  const [preview, setPreview] = useState<SeasonAdvancePreview | null>(null);
  const [assignments, setAssignments] = useState<SeasonAdvanceAssignmentInput[]>([]);
  const [teams, setTeams] = useState<Team[]>(PLACEHOLDER_TEAMS);
  const [postseasonResults, setPostseasonResults] = useState<PostseasonResult[]>([]);
  const [nationalChampionTeamId, setNationalChampionTeamId] = useState('');
  const [bowlWins, setBowlWins] = useState<BowlWinDraftRow[]>([
    { id: crypto.randomUUID(), bowlName: '', teamId: '' },
  ]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishAfter, setPublishAfter] = useState(true);

  async function refreshPreview(nextAssignments?: SeasonAdvanceAssignmentInput[]) {
    if (!api.previewSeasonAdvance) return;
    const nextPreview = await api.previewSeasonAdvance(nextAssignments ?? assignments);
    setPreview(nextPreview);
    if (api.listPostseasonResults) {
      const nextPostseasonResults = await api.listPostseasonResults(nextPreview.currentSeasonYear);
      setPostseasonResults(nextPostseasonResults);
      setNationalChampionTeamId(
        nextPostseasonResults.find((item) => item.kind === 'national_championship' && item.isChampion)
          ?.teamId ?? ''
      );
      const nextBowlWins = nextPostseasonResults
        .filter((item) => item.kind === 'bowl')
        .map((item) => ({
          id: item.id,
          bowlName: item.titleLabel ?? '',
          teamId: item.teamId,
        }));
      setBowlWins(
        nextBowlWins.length > 0
          ? nextBowlWins
          : [{ id: crypto.randomUUID(), bowlName: '', teamId: '' }]
      );
    }
    if (!nextAssignments) {
      setAssignments(nextPreview.assignments);
    }
  }

  useEffect(() => {
    void (async () => {
      if (!api.previewSeasonAdvance) return;
      const nextTeams = (await api.listTeams?.()) ?? PLACEHOLDER_TEAMS;
      setTeams(nextTeams);
      await refreshPreview();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateAssignment(
    tenureId: string,
    patch: Partial<Pick<SeasonAdvanceAssignmentInput, 'action' | 'nextTeamId'>>
  ) {
    const nextAssignments = assignments.map((assignment) =>
      assignment.tenureId === tenureId ? { ...assignment, ...patch } : assignment
    );
    setAssignments(nextAssignments);
    void refreshPreview(nextAssignments);
  }

  async function confirmAdvance() {
    if (!api.advanceToNextSeason || !preview) return;
    if (preview.validationErrors.length > 0) {
      setMessage(preview.validationErrors.join(' '));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.advanceToNextSeason(assignments);
      if (publishAfter && api.publishToHosted) {
        const published = await api.publishToHosted();
        setMessage(
          `Advanced to ${result.currentSeasonYear}. Archived ${result.previousSeasonYear} (${result.archivedSeason.schedule.length} games). Carried ${result.rostersCarriedForward} rosters. Published batch ${published.batchId}.`
        );
      } else {
        setMessage(
          `Advanced to ${result.currentSeasonYear}. Archived ${result.previousSeasonYear}. Carried ${result.rostersCarriedForward} rosters. Publish when ready.`
        );
      }
      await refreshPreview();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function savePostseasonArchive() {
    if (!api.savePostseasonResult || !preview) return;
    setBusy(true);
    setMessage(null);
    try {
      if (api.deletePostseasonResult) {
        for (const result of postseasonResults) {
          await api.deletePostseasonResult(result.id);
        }
      }

      if (nationalChampionTeamId) {
        await api.savePostseasonResult({
          seasonYear: preview.currentSeasonYear,
          teamId: nationalChampionTeamId,
          kind: 'national_championship',
          titleLabel: 'National Champion',
          isChampion: true,
        });
      }

      for (const bowl of bowlWins) {
        if (!bowl.teamId || !bowl.bowlName) continue;
        await api.savePostseasonResult({
          seasonYear: preview.currentSeasonYear,
          teamId: bowl.teamId,
          kind: 'bowl',
          titleLabel: bowl.bowlName,
          isChampion: true,
        });
      }

      setMessage('Postseason archive saved for season advance.');
      await refreshPreview();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function deletePostseasonResult(id: string) {
    if (!api.deletePostseasonResult) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.deletePostseasonResult(id);
      setMessage('Postseason result removed.');
      await refreshPreview();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  if (!api.previewSeasonAdvance || !api.advanceToNextSeason) {
    return (
      <section className="panel">
        <p className="muted">Season advance is available in the Electron desktop app.</p>
      </section>
    );
  }

  const teamOptions = [...teams].sort((a, b) => a.name.localeCompare(b.name));
  const userTeamIds = new Set(assignments.map((assignment) => assignment.currentTeamId));
  const userTeamOptions = teamOptions.filter((team) => userTeamIds.has(team.id));

  function updateBowlWin(id: string, patch: Partial<BowlWinDraftRow>) {
    setBowlWins((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addBowlWin() {
    setBowlWins((current) => [
      ...current,
      { id: crypto.randomUUID(), bowlName: '', teamId: '' },
    ]);
  }

  function removeBowlWin(id: string) {
    setBowlWins((current) =>
      current.length === 1
        ? [{ id: crypto.randomUUID(), bowlName: '', teamId: '' }]
        : current.filter((row) => row.id !== id)
    );
  }

  return (
    <section className="grid two advance-season-page">
      <article className="panel full">
        <h3>Advance to Next Season</h3>
        <p className="muted">
          Review each active coach, choose stay, leave, or change teams, then archive{' '}
          {preview?.currentSeasonYear ?? '—'} and open season {preview?.nextSeasonYear ?? '—'} with
          carried-forward rosters until fresh imports replace them.
        </p>
        {message && <div className="notice">{message}</div>}
        {preview && preview.validationErrors.length > 0 && (
          <div className="notice error">{preview.validationErrors.join(' ')}</div>
        )}
      </article>

      <article className="panel full">
        <DataTable
          headers={['Coach', 'Current Team', 'Decision', 'Next Team']}
          rows={assignments.map((assignment) => [
            assignment.coachName,
            assignment.currentTeamName,
            <select
              key={`${assignment.tenureId}-action`}
              value={assignment.action}
              onChange={(event) =>
                updateAssignment(assignment.tenureId, {
                  action: event.target.value as SeasonAdvanceAction,
                  nextTeamId:
                    event.target.value === 'change' ? assignment.nextTeamId : undefined,
                })
              }
            >
              <option value="stay">Stay</option>
              <option value="leave">Leave Team</option>
              <option value="change">Change Team</option>
            </select>,
            assignment.action === 'change' ? (
              <SearchableTeamSelect
                key={`${assignment.tenureId}-team`}
                id={`season-advance-next-team-${assignment.tenureId}`}
                teams={teamOptions.filter((team) => team.id !== assignment.currentTeamId)}
                value={assignment.nextTeamId ?? ''}
                onChange={(teamId) =>
                  updateAssignment(assignment.tenureId, { nextTeamId: teamId || undefined })
                }
                placeholder="Search next team..."
              />
            ) : (
              '—'
            ),
          ])}
          empty="No active coach assignments to review."
        />
      </article>

      <article className="panel full postseason-panel">
        <h3>Postseason Archive</h3>
        <p className="muted">
          Upload conference championship results when capture support is ready, record user bowl wins, and set the national champion before advancing the season.
        </p>
        <h4>Conference Championships</h4>
        <div className="notice compact-notice">
          Conference champion screenshot upload is coming next. Those games will be added to the season schedule so coaches can see them alongside the rest of the year.
        </div>
        <button className="secondary" disabled>
          Upload conference championship screenshot
        </button>

        <div className="grid two compact-grid">
          <label className="stacked-field">
            <span>National champion</span>
            <SearchableTeamSelect
              id="national-champion-team"
              teams={teamOptions}
              value={nationalChampionTeamId}
              onChange={setNationalChampionTeamId}
              placeholder="Search national champion..."
            />
          </label>
        </div>

        <h4>Bowl Wins</h4>
        <p className="muted">Only user-controlled teams are tracked here. CPU-only bowl games are ignored for now.</p>
        <div className="editable-table">
          <div className="editable-row editable-row-header bowl-win-row">
            <span>Game</span>
            <span>Winning Team</span>
            <span></span>
          </div>
          {bowlWins.map((row) => (
            <div key={row.id} className="editable-row bowl-win-row">
              <SearchableTextSelect
                id={`bowl-game-${row.id}`}
                options={[...TRADITIONAL_BOWL_GAMES]}
                value={row.bowlName}
                onChange={(bowlName) => updateBowlWin(row.id, { bowlName })}
                placeholder="Search bowl game..."
              />
              <SearchableTeamSelect
                id={`bowl-winner-${row.id}`}
                teams={userTeamOptions}
                value={row.teamId}
                onChange={(teamId) => updateBowlWin(row.id, { teamId })}
                placeholder="Search user team..."
              />
              <button className="secondary" onClick={() => removeBowlWin(row.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="postseason-actions">
          <button className="secondary" onClick={addBowlWin}>
            Add bowl win
          </button>
          <button className="secondary" onClick={() => void savePostseasonArchive()} disabled={busy}>
            Save postseason archive
          </button>
        </div>
        <DataTable
          headers={['Type', 'Team / Details', 'Title', '']}
          rows={postseasonResults.map((item) => [
            item.kind,
            item.kind === 'bowl'
              ? teamOptions.find((team) => team.id === item.teamId)?.name ?? item.teamId
              : teamOptions.find((team) => team.id === item.teamId)?.name ?? item.teamId,
            item.titleLabel ?? '—',
            api.deletePostseasonResult ? (
              <button className="secondary" onClick={() => void deletePostseasonResult(item.id)}>
                Delete
              </button>
            ) : null,
          ])}
          empty="No postseason results saved for this season yet."
        />
      </article>

      <article className="panel">
        <h3>Confirm</h3>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={publishAfter}
            onChange={(event) => setPublishAfter(event.target.checked)}
          />
          Publish to hosted immediately after rollover
        </label>
        <button onClick={() => void confirmAdvance()} disabled={busy || !preview}>
          {busy ? 'Advancing…' : `Advance to ${preview?.nextSeasonYear ?? 'next season'}`}
        </button>
      </article>
      {preview && (
        <p className="advance-season-footnote">
          Archive preview: {preview.currentSeasonYear} closes with {preview.archivedSeason.schedule.length}{' '}
          games and {preview.teamRosterSnapshots.length} roster snapshots. {preview.nextSeasonYear} opens with an empty schedule until import.
        </p>
      )}
    </section>
  );
}

export function CommissionerArchivePage() {
  const [summary, setSummary] = useState<DynastyArchiveSummary | null>(null);
  const [weekPreview, setWeekPreview] = useState<WeekAdvancePreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!api.getDynastyArchiveSummary) return;
    const [nextSummary, nextWeekPreview] = await Promise.all([
      api.getDynastyArchiveSummary(),
      api.previewWeekAdvance?.() ?? null,
    ]);
    setSummary(nextSummary);
    setWeekPreview(nextWeekPreview);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function advanceWeek() {
    if (!api.advanceToNextWeek) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.advanceToNextWeek();
      setMessage(
        `Checkpoint saved for ${result.seasonYear} week ${result.week} (${result.rosterSnapshots} roster snapshots, ${result.progressionSnapshots} progression entries).`
      );
      await refresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function updateCatalogExit(
    playerId: string,
    exitStatus: 'graduated' | 'transferred' | 'active' | 'unknown'
  ) {
    if (!api.updatePlayerCatalogEntry || !summary) return;
    setBusy(true);
    try {
      await api.updatePlayerCatalogEntry({
        playerId,
        exitStatus,
        correctionReason: 'Commissioner manual correction',
      });
      setMessage(`Updated ${playerId} exit status to ${exitStatus}.`);
      await refresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  if (!api.getDynastyArchiveSummary) {
    return (
      <section className="panel">
        <p className="muted">Advance Week is available in the Electron desktop app.</p>
      </section>
    );
  }

  return (
    <section className="grid two">
      <article className="panel full">
        <h3>Advance Week</h3>
        <p className="muted">
          Lock the current imports into a weekly checkpoint and review the archive data built from those checkpoints.
        </p>
        {message && <div className="notice">{message}</div>}
        {summary && (
          <dl className="meta-list">
            <div>
              <dt>Current season</dt>
              <dd>
                {summary.currentSeasonYear}
                {summary.currentWeek !== null ? ` · week ${summary.currentWeek}` : ' · no checkpoints yet'}
              </dd>
            </div>
            <div>
              <dt>Checkpoints</dt>
              <dd>{summary.checkpointCount}</dd>
            </div>
            <div>
              <dt>Archived seasons</dt>
              <dd>{summary.archivedSeasonCount}</dd>
            </div>
            <div>
              <dt>Player catalog</dt>
              <dd>{summary.playerCatalogCount}</dd>
            </div>
            <div>
              <dt>Postseason results</dt>
              <dd>{summary.postseasonResultCount}</dd>
            </div>
          </dl>
        )}
      </article>

      <article className="panel full">
        <h3>Advance Week</h3>
        {weekPreview && (
          <dl className="meta-list">
            <div>
              <dt>Next checkpoint</dt>
              <dd>
                {weekPreview.currentSeasonYear} week {weekPreview.nextWeek}
              </dd>
            </div>
            <div>
              <dt>Rosters</dt>
              <dd>
                {weekPreview.teamCount} teams · {weekPreview.rosterPlayerCount} players
              </dd>
            </div>
            <div>
              <dt>Schedule games</dt>
              <dd>{weekPreview.scheduleGameCount}</dd>
            </div>
            <div>
              <dt>Top 25 attached</dt>
              <dd>{weekPreview.hasTop25 ? 'Yes' : 'No'}</dd>
            </div>
          </dl>
        )}
        <button onClick={() => void advanceWeek()} disabled={busy || !api.advanceToNextWeek}>
          {busy ? 'Saving checkpoint…' : 'Advance Week'}
        </button>
      </article>

      {summary && (
        <>
          <article className="panel full">
            <h3>Checkpoints</h3>
            <DataTable
              headers={['Season', 'Week', 'Type', 'Teams', 'Captured', 'Notes']}
              rows={summary.checkpoints.map((checkpoint) => [
                checkpoint.seasonYear,
                checkpoint.week,
                checkpoint.type,
                checkpoint.rosterSnapshots.length,
                new Date(checkpoint.capturedAt).toLocaleString(),
                checkpoint.notes ?? '—',
              ])}
              empty="No checkpoints yet. Use Advance Week after importing rosters."
            />
          </article>

          <article className="panel full">
            <h3>Player Catalog</h3>
            <DataTable
              headers={['Player', 'Position', 'Last seen', 'Exit', 'Actions']}
              rows={summary.playerCatalog.slice(0, 100).map((entry) => [
                `${entry.firstName} ${entry.lastName}`,
                entry.position,
                entry.lastSeenSeasonYear,
                entry.exitStatus,
                api.updatePlayerCatalogEntry ? (
                  <div className="actions compact-actions">
                    <button
                      className="secondary"
                      onClick={() => void updateCatalogExit(entry.playerId, 'graduated')}
                    >
                      Graduate
                    </button>
                    <button
                      className="secondary"
                      onClick={() => void updateCatalogExit(entry.playerId, 'transferred')}
                    >
                      Transfer
                    </button>
                  </div>
                ) : null,
              ])}
              empty="Player catalog fills in as checkpoints are created."
            />
          </article>

          <article className="panel full">
            <h3>Coach Team History</h3>
            <DataTable
              headers={['Coach', 'Team', 'Seasons', 'Checkpoints']}
              rows={summary.coachArchiveBuckets.map((bucket) => [
                bucket.coachName,
                bucket.teamName,
                bucket.seasonYears.join(', ') || '—',
                bucket.checkpointIds.length,
              ])}
              empty="Coach archive buckets appear after checkpoints and tenure history exist."
            />
          </article>
        </>
      )}
    </section>
  );
}

export function CommissionerPublishPage() {
  const [config, setConfig] = useState<CommissionerConfig | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.getCommissionerConfig?.().then(setConfig);
  }, []);

  async function publish() {
    if (!api.publishToHosted) {
      setMessage('Publishing requires the Electron desktop app.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const next = await api.publishToHosted();
      setResult(next);
      setMessage(
        next.updated
          ? `Published batch ${next.batchId} to ${config?.apiUrl ?? 'hosted API'}.`
          : `Batch ${next.batchId} was already ingested (idempotent).`
      );
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h3>Publish to Hosted</h3>
      <p className="muted">
        Builds a dynasty sync payload from placeholders plus local roster imports, then POSTs to{' '}
        <code>/sync/batches</code>.
      </p>
      {message && <div className="notice">{message}</div>}
      {result && (
        <p className="muted">
          Last batch: <strong>{result.batchId}</strong> ({result.updated ? 'created' : 'unchanged'})
        </p>
      )}
      <button onClick={() => void publish()} disabled={busy}>
        {busy ? 'Publishing...' : 'Publish Snapshot'}
      </button>
    </section>
  );
}

export function CommissionerTeamImportsPage() {
  const [config, setConfig] = useState<CommissionerConfig | null>(null);
  const [coaches, setCoaches] = useState<AppUser[]>([]);
  const [tenures, setTenures] = useState<TeamTenure[]>([]);
  const [rosterImports, setRosterImports] = useState<RosterImportRecord[]>([]);
  const [scheduleImports, setScheduleImports] = useState<
    Awaited<ReturnType<NonNullable<typeof api.listScheduleImports>>>
  >([]);
  const [top25Imports, setTop25Imports] = useState<
    Awaited<ReturnType<NonNullable<typeof api.listTop25Imports>>>
  >([]);
  const [selectedTenureId, setSelectedTenureId] = useState('');
  const [showTop25, setShowTop25] = useState(false);
  const [showAllRoster, setShowAllRoster] = useState(false);
  const [top25Draft, setTop25Draft] = useState<Top25DraftRow[]>([]);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraftRow[]>([]);
  const [rosterDraft, setRosterDraft] = useState<RosterDraftRow[]>([]);
  const [editingTop25Index, setEditingTop25Index] = useState<number | null>(null);
  const [editingScheduleIndex, setEditingScheduleIndex] = useState<number | null>(null);
  const [editingRosterId, setEditingRosterId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<'roster' | 'schedule' | 'top25' | null>(null);
  const [savingKind, setSavingKind] = useState<'roster' | 'schedule' | 'top25' | null>(null);
  const [weekPreview, setWeekPreview] = useState<WeekAdvancePreview | null>(null);
  const [weekBusy, setWeekBusy] = useState(false);

  async function refresh() {
    const nextConfig = config ?? (await api.getCommissionerConfig?.()) ?? null;
    if (!nextConfig) return;
    setConfig(nextConfig);
    const [nextCoaches, nextTenures, nextRosters, nextSchedules, nextTop25Imports, nextWeekPreview] =
      await Promise.all([
      api.listCoaches?.() ?? [],
      api.listCommissionerTenures?.(nextConfig.dynastyId) ?? [],
      api.listRosterImports?.(nextConfig.dynastyId) ?? [],
      api.listScheduleImports?.() ?? [],
      api.listTop25Imports?.() ?? [],
      api.previewWeekAdvance?.() ?? null,
    ]);
    setCoaches(nextCoaches);
    setTenures(nextTenures);
    setRosterImports(nextRosters);
    setScheduleImports(nextSchedules);
    setTop25Imports(nextTop25Imports);
    setWeekPreview(nextWeekPreview);
    setSelectedTenureId(
      (current) => current || (nextTenures.find((tenure) => tenure.status === 'active')?.id ?? '')
    );
  }

  useEffect(() => {
    void refresh();
  }, []);

  const teamNameById = useMemo(
    () => new Map(PLACEHOLDER_TEAMS.map((team) => [team.id, team.name])),
    []
  );
  const activeTenures = useMemo(
    () => tenures.filter((tenure) => tenure.status === 'active'),
    [tenures]
  );
  const selectedTenure =
    activeTenures.find((tenure) => tenure.id === selectedTenureId) ?? activeTenures[0];
  const selectedCoach = coaches.find((coach) => coach.id === selectedTenure?.userId);
  const selectedTeamName = selectedTenure
    ? teamNameById.get(selectedTenure.teamId) ?? selectedTenure.teamId
    : 'Selected Team';
  const selectedTeamId = selectedTenure?.teamId;
  const teamOptions = useMemo(
    () => [...PLACEHOLDER_TEAMS].sort((a, b) => a.name.localeCompare(b.name)),
    []
  );
  const currentRoster = useMemo(
    () =>
      selectedTeamId
        ? rosterImports.find((item) => item.teamId === selectedTeamId)?.roster ??
          PLACEHOLDER_ROSTERS[selectedTeamId]
        : undefined,
    [rosterImports, selectedTeamId]
  );
  const currentRosterSource = selectedTeamId && rosterImports.some((item) => item.teamId === selectedTeamId)
    ? 'Latest imported roster'
    : 'Placeholder roster';
  const currentScheduleImport = useMemo(
    () =>
      selectedTeamId
        ? scheduleImports.find(
            (item) =>
              item.teamId === selectedTeamId ||
              mostCommonTeamId(item.season.schedule) === selectedTeamId
          )
        : undefined,
    [scheduleImports, selectedTeamId]
  );
  const fallbackSeason = PLACEHOLDER_DYNASTY.seasons.find(
    (season) => season.year === PLACEHOLDER_DYNASTY.currentSeasonYear
  );
  const currentSchedule = useMemo(
    () =>
      currentScheduleImport?.season.schedule ??
      fallbackSeason?.schedule.filter(
        (game) => game.homeTeamId === selectedTeamId || game.awayTeamId === selectedTeamId
      ) ??
      [],
    [currentScheduleImport, fallbackSeason, selectedTeamId]
  );
  const currentScheduleSource = currentScheduleImport ? 'Latest imported schedule' : 'Placeholder schedule';
  const latestTop25 = [...top25Imports]
    .map((item) => item.rankings)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
  const currentTop25 = latestTop25
    ? latestTop25.entries.slice().sort((a, b) => a.rank - b.rank)
    : getTop25FromStandings();
  const top25Source = latestTop25 ? 'Latest imported Top 25' : 'Placeholder standings';
  const top25Baseline = currentTop25.slice(0, 25).map((entry) => ({
    rank: entry.rank,
    teamId: entry.teamId,
    wins: entry.wins,
    losses: entry.losses,
  }));
  const scheduleBaseline = selectedTeamId
    ? currentSchedule.map((game) => scheduleGameToDraft(game, selectedTeamId))
    : [];
  const rosterBaseline = (currentRoster?.players ?? []).map((player) => ({
    id: player.id,
    jerseyNumber: player.jerseyNumber,
    firstName: player.firstName,
    lastName: player.lastName,
    position: player.position,
    overall: player.ratings.overall,
  }));
  const hasTop25Changes = JSON.stringify(top25Draft) !== JSON.stringify(top25Baseline);
  const hasScheduleChanges = JSON.stringify(scheduleDraft) !== JSON.stringify(scheduleBaseline);
  const hasRosterChanges = JSON.stringify(rosterDraft) !== JSON.stringify(rosterBaseline);
  const visibleTop25Draft = showTop25 ? top25Draft : top25Draft.slice(0, 9);

  useEffect(() => {
    setTop25Draft(
      currentTop25.slice(0, 25).map((entry) => ({
        rank: entry.rank,
        teamId: entry.teamId,
        wins: entry.wins,
        losses: entry.losses,
      }))
    );
  }, [top25Imports]);

  useEffect(() => {
    if (!selectedTeamId) {
      setScheduleDraft([]);
      return;
    }
    setScheduleDraft(currentSchedule.map((game) => scheduleGameToDraft(game, selectedTeamId)));
  }, [currentSchedule, selectedTeamId]);

  useEffect(() => {
    setShowAllRoster(false);
    setRosterDraft(
      (currentRoster?.players ?? []).map((player) => ({
        id: player.id,
        jerseyNumber: player.jerseyNumber,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        overall: player.ratings.overall,
      }))
    );
  }, [currentRoster]);

  function revertTop25Edits() {
    setTop25Draft(
      currentTop25.slice(0, 25).map((entry) => ({
        rank: entry.rank,
        teamId: entry.teamId,
        wins: entry.wins,
        losses: entry.losses,
      }))
    );
    setEditingTop25Index(null);
  }

  function revertScheduleEdits() {
    setScheduleDraft(
      selectedTeamId ? currentSchedule.map((game) => scheduleGameToDraft(game, selectedTeamId)) : []
    );
    setEditingScheduleIndex(null);
  }

  function revertRosterEdits() {
    setRosterDraft(
      (currentRoster?.players ?? []).map((player) => ({
        id: player.id,
        jerseyNumber: player.jerseyNumber,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        overall: player.ratings.overall,
      }))
    );
    setEditingRosterId(null);
  }

  useEffect(() => {
    if (editingTop25Index === null && editingScheduleIndex === null && editingRosterId === null) return;

    function closeEditModeOnOutsideClick(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.click-edit-row')) return;

      setEditingTop25Index(null);
      setEditingScheduleIndex(null);
      setEditingRosterId(null);
    }

    document.addEventListener('pointerdown', closeEditModeOnOutsideClick, true);
    return () => document.removeEventListener('pointerdown', closeEditModeOnOutsideClick, true);
  }, [editingRosterId, editingScheduleIndex, editingTop25Index]);

  async function advanceWeekFromImports() {
    if (!api.advanceToNextWeek) {
      setMessage('Restart the desktop app to enable weekly checkpoints.');
      return;
    }
    setWeekBusy(true);
    setMessage(null);
    try {
      const result = await api.advanceToNextWeek();
      setMessage(
        `Saved ${result.seasonYear} week ${result.week} checkpoint (${result.progressionSnapshots} new progression snapshots).`
      );
      await refresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setWeekBusy(false);
    }
  }

  async function importRosterScreenshot() {
    if (!config || !selectedTenure) return;
    if (!api.importRosterScreenshotForTeam) {
      setMessage('Restart the desktop app to load the latest team import tools.');
      return;
    }

    setBusyKind('roster');
    setMessage(null);
    try {
      const imported = await api.importRosterScreenshotForTeam({
        dynastyId: config.dynastyId,
        teamId: selectedTenure.teamId,
      });
      if (!imported) {
        setMessage('Roster screenshot selection canceled.');
        return;
      }
      const warningNote =
        imported.warnings && imported.warnings.length > 0
          ? ` (${imported.warnings.length} merge warning${imported.warnings.length === 1 ? '' : 's'} — review before saving.)`
          : '';
      setMessage(
        `Imported ${imported.roster.players.length} roster players for ${teamNameById.get(selectedTenure.teamId) ?? selectedTenure.teamId}.${warningNote}`
      );
      await refresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyKind(null);
    }
  }

  async function importScheduleScreenshot() {
    if (!config || !selectedTenure) return;
    if (!api.importScheduleScreenshotForTeam) {
      setMessage('Restart the desktop app to load the latest team import tools.');
      return;
    }

    setBusyKind('schedule');
    setMessage(null);
    try {
      const imported = await api.importScheduleScreenshotForTeam({
        dynastyId: config.dynastyId,
        teamId: selectedTenure.teamId,
      });
      if (!imported) {
        setMessage('Schedule screenshot selection canceled.');
        return;
      }
      const warningNote =
        imported.warnings && imported.warnings.length > 0
          ? ` (${imported.warnings.length} merge warning${imported.warnings.length === 1 ? '' : 's'} — review before saving.)`
          : '';
      setMessage(
        `Imported ${imported.season.schedule.length} schedule games for ${teamNameById.get(selectedTenure.teamId) ?? selectedTenure.teamId}.${warningNote}`
      );
      await refresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyKind(null);
    }
  }

  async function importTop25Screenshot() {
    if (!config) return;
    if (!api.importTop25Screenshot) {
      setMessage('Restart the desktop app to load the latest league-wide import tools.');
      return;
    }

    setBusyKind('top25');
    setMessage(null);
    try {
      const imported = await api.importTop25Screenshot({ dynastyId: config.dynastyId });
      if (!imported) {
        setMessage('Top 25 screenshot selection canceled.');
        return;
      }
      const warningNote =
        imported.warnings && imported.warnings.length > 0
          ? ` (${imported.warnings.length} merge warning${imported.warnings.length === 1 ? '' : 's'} — review before saving.)`
          : '';
      setMessage(`Imported ${imported.rankings.entries.length} Top 25 rankings.${warningNote}`);
      await refresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyKind(null);
    }
  }

  async function saveTop25Edits() {
    if (!config || !api.saveManualTop25 || !hasTop25Changes) return;
    setSavingKind('top25');
    setMessage(null);
    try {
      if (top25Draft.length !== 25) {
        setMessage('Top 25 must include exactly 25 ranked teams before saving.');
        return;
      }

      const missingRows = top25Draft.filter((row) => !row.teamId);
      if (missingRows.length > 0) {
        setMessage(`Choose a team for rank #${missingRows[0]?.rank} before saving the Top 25.`);
        setEditingTop25Index(top25Draft.findIndex((row) => !row.teamId));
        return;
      }

      const duplicateTeam = top25Draft.find((row, index) =>
        top25Draft.some((other, otherIndex) => otherIndex !== index && other.teamId === row.teamId)
      );
      if (duplicateTeam) {
        setMessage(`${teamNameById.get(duplicateTeam.teamId) ?? duplicateTeam.teamId} is listed more than once in the Top 25.`);
        return;
      }

      const entries: RankingEntry[] = top25Draft.map((row) => ({
          rank: Number(row.rank),
          teamId: row.teamId,
          teamName: teamNameById.get(row.teamId) ?? row.teamId,
          wins: Number(row.wins),
          losses: Number(row.losses),
        }));
      await api.saveManualTop25({ dynastyId: config.dynastyId, entries });
      setEditingTop25Index(null);
      setMessage('Top 25 edits saved.');
      await refresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setSavingKind(null);
    }
  }

  async function saveScheduleEdits() {
    if (!config || !selectedTeamId || !api.saveManualSchedule || !hasScheduleChanges) return;
    setSavingKind('schedule');
    setMessage(null);
    try {
      const schedule = scheduleDraft
        .filter((row) => row.isBye || row.opponentTeamId)
        .map((row) => draftToScheduleGame(row, selectedTeamId));
      await api.saveManualSchedule({ dynastyId: config.dynastyId, teamId: selectedTeamId, schedule });
      setEditingScheduleIndex(null);
      setMessage('Schedule edits saved.');
      await refresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setSavingKind(null);
    }
  }

  async function saveRosterEdits() {
    if (!config || !selectedTeamId || !currentRoster || !api.saveManualRoster || !hasRosterChanges) return;
    setSavingKind('roster');
    setMessage(null);
    try {
      const draftById = new Map(rosterDraft.map((row) => [row.id, row]));
      const roster: Roster = {
        ...currentRoster,
        players: currentRoster.players.map((player) => {
          const draft = draftById.get(player.id);
          if (!draft) return player;
          return {
            ...player,
            jerseyNumber: draft.jerseyNumber,
            firstName: draft.firstName.trim() || player.firstName,
            lastName: draft.lastName.trim() || player.lastName,
            position: draft.position.trim() || player.position,
            ratings: {
              ...player.ratings,
              overall: draft.overall,
            },
          };
        }),
      };
      await api.saveManualRoster({ dynastyId: config.dynastyId, teamId: selectedTeamId, roster });
      setEditingRosterId(null);
      setMessage('Roster edits saved.');
      await refresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setSavingKind(null);
    }
  }

  async function undoLastRosterImport() {
    if (!config || !selectedTeamId) return;
    if (!api.undoLatestRosterImport) {
      setMessage('Restart the desktop app to enable undo import actions.');
      return;
    }
    setBusyKind('roster');
    setMessage(null);
    try {
      const result = await api.undoLatestRosterImport({
        dynastyId: config.dynastyId,
        teamId: selectedTeamId,
      });
      setMessage(
        result.removedRosterImports > 0
          ? `Removed the latest roster import for ${selectedTeamName}.`
          : `No roster imports found for ${selectedTeamName}.`
      );
      await refresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyKind(null);
    }
  }

  async function undoLastScheduleImport() {
    if (!config || !selectedTeamId) return;
    if (!api.undoLatestScheduleImport) {
      setMessage('Restart the desktop app to enable undo import actions.');
      return;
    }
    setBusyKind('schedule');
    setMessage(null);
    try {
      const result = await api.undoLatestScheduleImport({
        dynastyId: config.dynastyId,
        teamId: selectedTeamId,
      });
      setMessage(
        result.removedScheduleImports > 0
          ? `Removed the latest schedule import for ${selectedTeamName}.`
          : `No schedule imports found for ${selectedTeamName}.`
      );
      await refresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyKind(null);
    }
  }

  async function clearAllSelectedTeamData() {
    if (!config || !selectedTeamId) return;
    if (!api.clearTeamImports) {
      setMessage('Restart the desktop app to enable temporary clear-all testing actions.');
      return;
    }
    setBusyKind('roster');
    setMessage(null);
    try {
      const result = await api.clearTeamImports({
        dynastyId: config.dynastyId,
        teamId: selectedTeamId,
      });
      setMessage(
        `Cleared all testing imports for ${selectedTeamName}: ${result.removedRosterImports} roster, ${result.removedScheduleImports} schedule.`
      );
      await refresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyKind(null);
    }
  }

  async function clearAllImportData() {
    if (!config) return;
    if (!api.clearAllImports) {
      setMessage('Restart the desktop app to enable temporary clear-all import cleanup.');
      return;
    }
    setBusyKind('top25');
    setMessage(null);
    try {
      const result = await api.clearAllImports({ dynastyId: config.dynastyId });
      setMessage(
        `Cleared all imports: ${result.removedRosterImports} roster, ${result.removedScheduleImports} schedule, ${result.removedTop25Imports} Top 25.`
      );
      await refresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyKind(null);
    }
  }

  if (!api.importRosterScreenshotForTeam || !api.importScheduleScreenshotForTeam) {
    return (
      <section className="panel">
        <h3>Team Data Imports</h3>
        <p className="muted">Team-based screenshot imports are available in the Electron desktop app.</p>
      </section>
    );
  }

  return (
    <section className="grid two">
      <div className="panel full">
        <div className="section-header">
          <div>
            <h3>Team Data Imports</h3>
            <p className="muted">
              Pick an assigned coach/team, then upload roster or schedule screenshots for that same team.
            </p>
          </div>
          <button className="secondary" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
        {message && <div className="notice">{message}</div>}
      </div>

      <div className="panel">
        <div className="assignment-card-header">
          <div>
            <h3>Team-Scoped Imports</h3>
            <p className="muted">Choose the assigned coach/team, then import data for that team.</p>
          </div>
        </div>
        {activeTenures.length === 0 ? (
          <p className="muted">Assign coaches to teams before importing team data.</p>
        ) : (
          <label className="stacked-field">
            <span>Coach / Team</span>
            <select value={selectedTenure?.id ?? ''} onChange={(event) => setSelectedTenureId(event.target.value)}>
              {activeTenures.map((tenure) => {
                const coach = coaches.find((item) => item.id === tenure.userId);
                return (
                  <option key={tenure.id} value={tenure.id}>
                    {coach?.displayName ?? tenure.userId} - {teamNameById.get(tenure.teamId) ?? tenure.teamId}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        {selectedTenure && (
          <div className="assignment-summary">
            <div className="summary-tile">
              <span>Coach</span>
              <strong>{selectedCoach?.displayName ?? selectedTenure.userId}</strong>
            </div>
            <div className="summary-tile">
              <span>Team</span>
              <strong>{teamNameById.get(selectedTenure.teamId) ?? selectedTenure.teamId}</strong>
            </div>
          </div>
        )}
        <div className="import-toolbox">
          <div>
            <h3>Upload For {selectedTeamName}</h3>
            <p className="muted">
              The selected team above determines where roster and schedule data is saved.
            </p>
          </div>

          <div className="action-group">
            <span>Checkpoint</span>
            <div className="actions compact-actions">
              <button
                className="secondary"
                onClick={() => void advanceWeekFromImports()}
                disabled={!selectedTenure || busyKind !== null || weekBusy}
              >
                {weekBusy ? 'Saving checkpoint…' : 'Advance Week'}
              </button>
            </div>
            {weekPreview && (
              <p className="muted">
                Next: {weekPreview.currentSeasonYear} week {weekPreview.nextWeek} ·{' '}
                {weekPreview.rosterPlayerCount} players · {weekPreview.scheduleGameCount} schedule games
              </p>
            )}
          </div>

          <div className="action-group">
            <span>Import</span>
            <div className="actions compact-actions">
              <button onClick={() => void importRosterScreenshot()} disabled={!selectedTenure || busyKind !== null}>
                {busyKind === 'roster' ? 'Importing roster...' : 'Roster Screenshots'}
              </button>
              <button
                className="secondary"
                onClick={() => void importScheduleScreenshot()}
                disabled={!selectedTenure || busyKind !== null}
              >
                {busyKind === 'schedule' ? 'Importing schedule...' : 'Schedule Screenshots'}
              </button>
            </div>
          </div>

          <div className="action-group">
            <span>Undo Latest</span>
            <div className="actions compact-actions">
              <button
                className="secondary"
                onClick={() => void undoLastRosterImport()}
                disabled={!selectedTenure || busyKind !== null}
              >
                Roster Import
              </button>
              <button
                className="secondary"
                onClick={() => void undoLastScheduleImport()}
                disabled={!selectedTenure || busyKind !== null}
              >
                Schedule Import
              </button>
            </div>
          </div>

          <div className="action-group testing-tools">
            <span>Temporary Testing Cleanup</span>
            <div className="actions compact-actions">
              <button
                className="secondary danger"
                onClick={() => void clearAllSelectedTeamData()}
                disabled={!selectedTenure || busyKind !== null}
              >
                Clear Selected Team
              </button>
              <button
                className="secondary danger"
                onClick={() => void clearAllImportData()}
                disabled={busyKind !== null}
              >
                Clear All Imports
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>League-Wide Updates</h3>
        <p className="muted">Upload rankings and review the current Top 25 when needed.</p>
        <div className="actions import-action-row">
          <button
            className="secondary"
            onClick={() => void importTop25Screenshot()}
            disabled={busyKind !== null}
          >
            {busyKind === 'top25' ? 'Importing Top 25...' : 'Upload Top 25 Screenshots'}
          </button>
          <button className="secondary" onClick={() => setShowTop25((current) => !current)}>
            {showTop25 ? 'Show Top 9' : 'Show Top 25'}
          </button>
        </div>
        <div className="embedded-top25">
          <div className="card-heading">
            <div>
              <h4>{showTop25 ? 'Top 25' : 'Top 9'}</h4>
              <p className="muted">{top25Source}. Click a row to edit.</p>
            </div>
          </div>
          <div className="editable-table">
            <div className="editable-row editable-row-header top25-edit-row">
              <span>Rank</span>
              <span>Team</span>
              <span>W</span>
              <span>L</span>
            </div>
            {visibleTop25Draft.map((row, index) => (
              <Top25EditableRow
                key={`${row.rank}-${index}`}
                row={row}
                index={index}
                isEditing={editingTop25Index === index}
                teamNameById={teamNameById}
                teamOptions={teamOptions}
                setEditingTop25Index={setEditingTop25Index}
                setTop25Draft={setTop25Draft}
              />
            ))}
          </div>
          <div className="edit-actions">
            <button className="secondary" onClick={revertTop25Edits} disabled={savingKind !== null || !hasTop25Changes}>
              Revert Changes
            </button>
            <button className="secondary" onClick={() => void saveTop25Edits()} disabled={savingKind !== null || !hasTop25Changes}>
              {savingKind === 'top25' ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      <div className="panel full">
        <div className="section-header">
          <div>
            <h3>Current Data For {selectedTeamName}</h3>
            <p className="muted">
              Review the current local data before replacing it with new screenshots.
            </p>
          </div>
        </div>
        <div className="current-import-data">
          <article className="current-data-card">
            <div className="card-heading">
              <div>
                <h4>Selected Team Schedule</h4>
                <p className="muted">{currentScheduleSource}</p>
              </div>
            </div>
            <div className="editable-table">
              <div className="editable-row editable-row-header schedule-edit-row">
                <span>Week</span>
                <span>Site</span>
                <span>Opponent</span>
                <span>Played</span>
                <span>Score</span>
              </div>
              {scheduleDraft.map((row, index) => (
                <div
                  className="editable-row schedule-edit-row click-edit-row"
                  key={row.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingScheduleIndex(index);
                  }}
                  onBlur={(event) => {
                    const nextTarget = event.relatedTarget;
                    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                      setEditingScheduleIndex(null);
                    }
                  }}
                >
                  {editingScheduleIndex === index ? (
                    <>
                      <input
                        type="number"
                        value={row.week}
                        onChange={(event) =>
                          updateScheduleDraft(index, { week: Number(event.target.value) }, setScheduleDraft)
                        }
                      />
                      <select
                        value={row.site}
                        onChange={(event) =>
                          updateScheduleDraft(index, {
                            site: event.target.value as 'home' | 'away' | 'bye',
                            isBye: event.target.value === 'bye',
                            opponentTeamId: event.target.value === 'bye' ? 'team-bye' : row.opponentTeamId,
                            isPlayed: event.target.value === 'bye' ? false : row.isPlayed,
                          }, setScheduleDraft)
                        }
                      >
                        <option value="home">Home</option>
                        <option value="away">Away</option>
                        <option value="bye">BYE</option>
                      </select>
                      {row.isBye ? (
                        <strong>BYE</strong>
                      ) : (
                        <select
                          value={row.opponentTeamId}
                          onChange={(event) =>
                            updateScheduleDraft(index, { opponentTeamId: event.target.value }, setScheduleDraft)
                          }
                        >
                          {teamOptions
                            .filter((team) => team.id !== selectedTeamId)
                            .map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                        </select>
                      )}
                      <input
                        type="checkbox"
                        checked={row.isPlayed}
                        disabled={row.isBye}
                        onChange={(event) =>
                          updateScheduleDraft(index, { isPlayed: event.target.checked }, setScheduleDraft)
                        }
                      />
                      <div className="score-inputs">
                        <input
                          type="number"
                          value={row.teamScore}
                          disabled={row.isBye}
                          onChange={(event) =>
                            updateScheduleDraft(index, { teamScore: Number(event.target.value) }, setScheduleDraft)
                          }
                        />
                        <span>-</span>
                        <input
                          type="number"
                          value={row.opponentScore}
                          disabled={row.isBye}
                          onChange={(event) =>
                            updateScheduleDraft(index, { opponentScore: Number(event.target.value) }, setScheduleDraft)
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <span>{row.week}</span>
                      <span>{row.isBye ? 'BYE' : row.site === 'home' ? 'Home' : 'Away'}</span>
                      <strong>{row.isBye ? 'BYE' : teamNameById.get(row.opponentTeamId) ?? row.opponentTeamId}</strong>
                      <span>{row.isBye ? '-' : row.isPlayed ? 'Yes' : 'No'}</span>
                      <span>{formatScheduleDraftResult(row)}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="edit-actions">
              <button className="secondary" onClick={revertScheduleEdits} disabled={savingKind !== null || !hasScheduleChanges}>
                Revert Changes
              </button>
              <button className="secondary" onClick={() => void saveScheduleEdits()} disabled={savingKind !== null || !selectedTeamId || !hasScheduleChanges}>
                {savingKind === 'schedule' ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </article>

          <article className="current-data-card">
            <div className="card-heading">
              <div>
                <h4>Roster</h4>
                <p className="muted">{currentRosterSource}</p>
              </div>
              <span className="muted">{currentRoster?.players.length ?? 0} players</span>
            </div>
            <div className="editable-table">
              <div className="editable-row editable-row-header roster-edit-row">
                <span>#</span>
                <span>First</span>
                <span>Last</span>
                <span>Pos</span>
                <span>OVR</span>
              </div>
              {(showAllRoster ? rosterDraft : rosterDraft.slice(0, 12)).map((row, index) => (
                <div
                  className="editable-row roster-edit-row click-edit-row"
                  key={row.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingRosterId(row.id);
                  }}
                  onBlur={(event) => {
                    const nextTarget = event.relatedTarget;
                    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                      setEditingRosterId(null);
                    }
                  }}
                >
                  {editingRosterId === row.id ? (
                    <>
                      <input
                        type="number"
                        value={row.jerseyNumber ?? ''}
                        onChange={(event) =>
                          updateRosterDraft(index, { jerseyNumber: Number(event.target.value) }, setRosterDraft)
                        }
                      />
                      <input
                        value={row.firstName}
                        onChange={(event) =>
                          updateRosterDraft(index, { firstName: event.target.value }, setRosterDraft)
                        }
                      />
                      <input
                        value={row.lastName}
                        onChange={(event) =>
                          updateRosterDraft(index, { lastName: event.target.value }, setRosterDraft)
                        }
                      />
                      <input
                        value={row.position}
                        onChange={(event) =>
                          updateRosterDraft(index, { position: event.target.value }, setRosterDraft)
                        }
                      />
                      <input
                        type="number"
                        value={row.overall ?? ''}
                        onChange={(event) =>
                          updateRosterDraft(index, { overall: Number(event.target.value) }, setRosterDraft)
                        }
                      />
                    </>
                  ) : (
                    <>
                      <span>{row.jerseyNumber ? `#${row.jerseyNumber}` : '-'}</span>
                      <strong>{row.firstName}</strong>
                      <strong>{row.lastName}</strong>
                      <span>{row.position}</span>
                      <span>{row.overall ?? '-'}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            <button
              className="secondary"
              onClick={() => setShowAllRoster((current) => !current)}
              disabled={rosterDraft.length <= 12}
            >
              {showAllRoster ? 'Show First 12' : `Show All ${rosterDraft.length}`}
            </button>
            <p className="muted">
              Showing {showAllRoster ? rosterDraft.length : Math.min(rosterDraft.length, 12)} of{' '}
              {rosterDraft.length} roster players.
            </p>
            <div className="edit-actions">
              <button className="secondary" onClick={revertRosterEdits} disabled={savingKind !== null || !hasRosterChanges}>
                Revert Changes
              </button>
              <button className="secondary" onClick={() => void saveRosterEdits()} disabled={savingKind !== null || !currentRoster || !hasRosterChanges}>
                {savingKind === 'roster' ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </article>
        </div>
      </div>

      <div className="panel full">
        <h3>Recent Imports</h3>
        <DataTable
          headers={['Type', 'Team', 'Details', 'Source']}
          rows={[
            ...rosterImports.map((item) => [
              'Roster',
              item.team.name,
              `${item.roster.players.length} players`,
              item.sourceLabel,
            ]),
            ...scheduleImports.map((item) => {
              const teamId = mostCommonTeamId(item.season.schedule);
              const standing = item.season.standings.find((row) => row.teamId === teamId);
              return [
                'Schedule',
                teamNameById.get(teamId) ?? teamId,
                `${item.season.schedule.length} games${standing ? `, ${standing.wins}-${standing.losses}` : ''}`,
                item.sourceLabel,
              ];
            }),
            ...top25Imports.map((item) => [
              'Top 25',
              'League',
              `${item.rankings.entries.length} ranked teams`,
              item.sourceLabel,
            ]),
          ]}
          empty="No imports yet."
        />
      </div>
    </section>
  );
}

function Top25EditableRow({
  row,
  index,
  isEditing,
  teamNameById,
  teamOptions,
  setEditingTop25Index,
  setTop25Draft,
}: {
  row: Top25DraftRow;
  index: number;
  isEditing: boolean;
  teamNameById: Map<string, string>;
  teamOptions: Team[];
  setEditingTop25Index: Dispatch<SetStateAction<number | null>>;
  setTop25Draft: Dispatch<SetStateAction<Top25DraftRow[]>>;
}) {
  return (
    <div
      className="editable-row top25-edit-row click-edit-row"
      onClick={(event) => {
        event.stopPropagation();
        setEditingTop25Index(index);
      }}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setEditingTop25Index(null);
        }
      }}
    >
      {isEditing ? (
        <>
          <input
            type="number"
            value={row.rank}
            onChange={(event) =>
              setTop25Draft((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, rank: Number(event.target.value) } : item
                )
              )
            }
          />
          <select
            value={row.teamId}
            onChange={(event) =>
              setTop25Draft((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, teamId: event.target.value } : item
                )
              )
            }
          >
            <option value="">Choose team...</option>
            {teamOptions.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={row.wins}
            onChange={(event) =>
              setTop25Draft((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, wins: Number(event.target.value) } : item
                )
              )
            }
          />
          <input
            type="number"
            value={row.losses}
            onChange={(event) =>
              setTop25Draft((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, losses: Number(event.target.value) } : item
                )
              )
            }
          />
        </>
      ) : (
        <>
          <span>#{row.rank}</span>
          <strong>{row.teamId ? teamNameById.get(row.teamId) ?? row.teamId : 'Manual entry required'}</strong>
          <span>{row.wins}</span>
          <span>{row.losses}</span>
        </>
      )}
    </div>
  );
}

function mostCommonTeamId(games: Array<{ homeTeamId: string; awayTeamId: string }>): string {
  const counts = new Map<string, number>();
  for (const game of games) {
    counts.set(game.homeTeamId, (counts.get(game.homeTeamId) ?? 0) + 1);
    counts.set(game.awayTeamId, (counts.get(game.awayTeamId) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function updateScheduleDraft(
  index: number,
  patch: Partial<ScheduleDraftRow>,
  setScheduleDraft: Dispatch<SetStateAction<ScheduleDraftRow[]>>
) {
  setScheduleDraft((current) =>
    current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
  );
}

function updateRosterDraft(
  index: number,
  patch: Partial<RosterDraftRow>,
  setRosterDraft: Dispatch<SetStateAction<RosterDraftRow[]>>
) {
  setRosterDraft((current) =>
    current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
  );
}

function formatScheduleDraftResult(row: ScheduleDraftRow): string {
  if (row.isBye) return 'BYE';
  if (!row.isPlayed) return 'Scheduled';
  const result = row.teamScore > row.opponentScore ? 'W' : row.teamScore < row.opponentScore ? 'L' : 'T';
  return `${result} ${row.teamScore}-${row.opponentScore}`;
}

function scheduleGameToDraft(game: ScheduleGame, selectedTeamId: string): ScheduleDraftRow {
  if (game.isBye) {
    return {
      id: game.id,
      week: game.week,
      site: 'bye',
      opponentTeamId: 'team-bye',
      isBye: true,
      isPlayed: false,
      teamScore: 0,
      opponentScore: 0,
      isConferenceGame: game.isConferenceGame,
    };
  }

  const isHome = game.homeTeamId === selectedTeamId;
  return {
    id: game.id,
    week: game.week,
    site: isHome ? 'home' : 'away',
    opponentTeamId: isHome ? game.awayTeamId : game.homeTeamId,
    isPlayed: game.isPlayed,
    teamScore: game.isPlayed ? (isHome ? game.homeScore ?? 0 : game.awayScore ?? 0) : 0,
    opponentScore: game.isPlayed ? (isHome ? game.awayScore ?? 0 : game.homeScore ?? 0) : 0,
    isConferenceGame: game.isConferenceGame,
  };
}

function draftToScheduleGame(
  row: ScheduleDraftRow,
  selectedTeamId: string
): ScheduleGame {
  if (row.isBye || row.site === 'bye') {
    return {
      id: row.id || `manual-week-${row.week}-bye-${selectedTeamId}`,
      seasonId: `season-${PLACEHOLDER_DYNASTY.currentSeasonYear}`,
      week: Number(row.week),
      homeTeamId: selectedTeamId,
      awayTeamId: 'team-bye',
      isBye: true,
      isConferenceGame: row.isConferenceGame,
      isPlayed: false,
    };
  }

  const isHome = row.site === 'home';
  const homeTeamId = isHome ? selectedTeamId : row.opponentTeamId;
  const awayTeamId = isHome ? row.opponentTeamId : selectedTeamId;
  return {
    id: row.id || `manual-week-${row.week}-${awayTeamId}-at-${homeTeamId}`,
    seasonId: `season-${PLACEHOLDER_DYNASTY.currentSeasonYear}`,
    week: Number(row.week),
    homeTeamId,
    awayTeamId,
    homeScore: row.isPlayed ? (isHome ? row.teamScore : row.opponentScore) : undefined,
    awayScore: row.isPlayed ? (isHome ? row.opponentScore : row.teamScore) : undefined,
    isConferenceGame: row.isConferenceGame,
    isPlayed: row.isPlayed,
  };
}

function getTop25FromStandings(): Array<{
  rank: number;
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
}> {
  const season = PLACEHOLDER_DYNASTY.seasons.find(
    (item) => item.year === PLACEHOLDER_DYNASTY.currentSeasonYear
  );
  return (season?.standings ?? [])
    .filter((standing) => standing.ranking !== undefined)
    .sort((a, b) => (a.ranking ?? 999) - (b.ranking ?? 999))
    .map((standing) => ({
      rank: standing.ranking ?? 0,
      teamId: standing.teamId,
      teamName: PLACEHOLDER_TEAMS.find((team) => team.id === standing.teamId)?.name ?? standing.teamId,
      wins: standing.wins,
      losses: standing.losses,
    }));
}

export function CommissionerHistoryPage() {
  const [rows, setRows] = useState<
    Awaited<ReturnType<NonNullable<typeof api.listPublishHistory>>>
  >([]);

  useEffect(() => {
    void (async () => {
      const config = await api.getCommissionerConfig?.();
      setRows((await api.listPublishHistory?.(config?.dynastyId)) ?? []);
    })();
  }, []);

  return (
    <section className="panel">
      <h3>Publish History</h3>
      <DataTable
        headers={['Batch', 'Status', 'Synced', 'Recorded']}
        rows={rows.map((row) => [
          row.batchId,
          row.status,
          new Date(row.syncedAt).toLocaleString(),
          new Date(row.createdAt).toLocaleString(),
        ])}
      />
    </section>
  );
}

function SearchableTeamSelect({
  id,
  teams,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  teams: Team[];
  value: string;
  onChange: (teamId: string) => void;
  placeholder?: string;
}) {
  const selectedTeam = teams.find((team) => team.id === value);
  const [text, setText] = useState(selectedTeam?.name ?? '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setText(selectedTeam?.name ?? '');
  }, [selectedTeam?.name]);

  const visibleTeams = useMemo(() => {
    const query = text.trim().toLowerCase();
    if (!query) return teams;
    return teams.filter((team) =>
      `${team.name} ${team.abbreviation} ${team.id}`.toLowerCase().includes(query)
    );
  }, [teams, text]);

  function chooseTeam(team: Team) {
    onChange(team.id);
    setText(team.name);
    setOpen(false);
  }

  function closeAndNormalize() {
    window.setTimeout(() => {
      setOpen(false);
      if (!text.trim()) {
        onChange('');
        return;
      }
      const exact = teams.find((team) =>
        [team.name, team.abbreviation, team.id, `${team.name} (${team.abbreviation})`]
          .map((label) => label.toLowerCase())
          .includes(text.trim().toLowerCase())
      );
      if (exact) {
        chooseTeam(exact);
        return;
      }
      setText(selectedTeam?.name ?? '');
    }, 100);
  }

  return (
    <div className="search-select combo-select">
      <input
        id={id}
        value={text}
        placeholder={placeholder ?? 'Search team...'}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          if (!event.target.value.trim()) onChange('');
        }}
        onBlur={closeAndNormalize}
      />
      <button
        type="button"
        className="combo-select-toggle"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
        aria-label="Show teams"
      >
        ▾
      </button>
      {open && (
        <div className="combo-select-menu">
          {visibleTeams.length === 0 ? (
            <div className="combo-select-empty">No teams match search</div>
          ) : (
            visibleTeams.map((team) => (
              <button
                key={team.id}
                type="button"
                className={team.id === value ? 'combo-select-option active' : 'combo-select-option'}
                onMouseDown={(event) => {
                  event.preventDefault();
                  chooseTeam(team);
                }}
              >
                <span>{team.name}</span>
                <small>{team.abbreviation}</small>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SearchableTextSelect({
  id,
  options,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setText(value);
  }, [value]);

  const visibleOptions = useMemo(() => {
    const query = text.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.toLowerCase().includes(query));
  }, [options, text]);

  function chooseOption(option: string) {
    onChange(option);
    setText(option);
    setOpen(false);
  }

  function closeAndNormalize() {
    window.setTimeout(() => {
      setOpen(false);
      if (!text.trim()) {
        onChange('');
        setText('');
        return;
      }
      const exact = options.find((option) => option.toLowerCase() === text.trim().toLowerCase());
      if (exact) {
        chooseOption(exact);
        return;
      }
      setText(value);
    }, 100);
  }

  return (
    <div className="search-select combo-select">
      <input
        id={id}
        value={text}
        placeholder={placeholder ?? 'Search...'}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          if (!event.target.value.trim()) onChange('');
        }}
        onBlur={closeAndNormalize}
      />
      <button
        type="button"
        className="combo-select-toggle"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
        aria-label="Show options"
      >
        ▾
      </button>
      {open && (
        <div className="combo-select-menu">
          {visibleOptions.length === 0 ? (
            <div className="combo-select-empty">No options match search</div>
          ) : (
            visibleOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={option === value ? 'combo-select-option active' : 'combo-select-option'}
                onMouseDown={(event) => {
                  event.preventDefault();
                  chooseOption(option);
                }}
              >
                <span>{option}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DataTable({
  headers,
  rows,
  empty = 'No records yet.',
}: {
  headers: string[];
  rows: ReactNode[][];
  empty?: string;
}) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={headers.length} className="muted">
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
