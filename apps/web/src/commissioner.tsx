import { useEffect, useMemo, useState } from 'react';
import { PLACEHOLDER_CONFERENCES, PLACEHOLDER_DYNASTY, PLACEHOLDER_TEAMS } from '@ncaa/domain';
import type { AppUser, Team, TeamTenure } from '@ncaa/domain';
import { getCompanionApi } from './api';
import type { CommissionerConfig, PublishResult, RosterImportRecord } from './api';

const api = getCompanionApi();

export function CommissionerOverviewPage() {
  const [config, setConfig] = useState<CommissionerConfig | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [tenures, setTenures] = useState<TeamTenure[]>([]);
  const [imports, setImports] = useState<RosterImportRecord[]>([]);
  const [scheduleImports, setScheduleImports] = useState<
    Awaited<ReturnType<NonNullable<typeof api.listScheduleImports>>>
  >([]);
  const [scheduleImportCount, setScheduleImportCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!api.getCommissionerConfig) return;
      const nextConfig = await api.getCommissionerConfig();
      setConfig(nextConfig);
      const [nextUsers, nextTenures, nextImports, nextScheduleImports, history] = await Promise.all([
        api.listUsers?.() ?? [],
        api.listCommissionerTenures?.(nextConfig.dynastyId) ?? [],
        api.listRosterImports?.(nextConfig.dynastyId) ?? [],
        api.listScheduleImports?.() ?? [],
        api.listPublishHistory?.(nextConfig.dynastyId) ?? [],
      ]);
      setUsers(nextUsers);
      setTenures(nextTenures);
      setImports(nextImports);
      setScheduleImports(nextScheduleImports);
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
    const rankedTeams = [...(currentSeason?.standings ?? [])]
      .filter((standing) => standing.ranking !== undefined)
      .sort((a, b) => (a.ranking ?? 999) - (b.ranking ?? 999))
      .slice(0, 3)
      .map((standing) => ({
        rank: standing.ranking,
        teamName: teamById.get(standing.teamId)?.name ?? standing.teamId,
        record: `${standing.wins}-${standing.losses}`,
      }));
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
  }, [scheduleImports, tenures, users]);

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
  const [selectedTenureId, setSelectedTenureId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<'roster' | 'schedule' | null>(null);

  async function refresh() {
    const nextConfig = config ?? (await api.getCommissionerConfig?.()) ?? null;
    if (!nextConfig) return;
    setConfig(nextConfig);
    const [nextCoaches, nextTenures, nextRosters, nextSchedules] = await Promise.all([
      api.listCoaches?.() ?? [],
      api.listCommissionerTenures?.(nextConfig.dynastyId) ?? [],
      api.listRosterImports?.(nextConfig.dynastyId) ?? [],
      api.listScheduleImports?.() ?? [],
    ]);
    setCoaches(nextCoaches);
    setTenures(nextTenures);
    setRosterImports(nextRosters);
    setScheduleImports(nextSchedules);
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
      setMessage(
        `Imported ${imported.roster.players.length} roster players for ${teamNameById.get(selectedTenure.teamId) ?? selectedTenure.teamId}.`
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
      setMessage(
        `Imported ${imported.season.schedule.length} schedule games for ${teamNameById.get(selectedTenure.teamId) ?? selectedTenure.teamId}.`
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
            <h3>Assigned Team</h3>
            <p className="muted">Choose which coach team this import belongs to.</p>
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
      </div>

      <div className="panel">
        <h3>Upload For {selectedTeamName}</h3>
        <p className="muted">
          Both buttons use the selected team above, so roster and schedule updates follow the same flow.
        </p>
        <div className="actions">
          <button onClick={() => void importRosterScreenshot()} disabled={!selectedTenure || busyKind !== null}>
            {busyKind === 'roster' ? 'Importing roster...' : 'Upload Roster Screenshot'}
          </button>
          <button
            className="secondary"
            onClick={() => void importScheduleScreenshot()}
            disabled={!selectedTenure || busyKind !== null}
          >
            {busyKind === 'schedule' ? 'Importing schedule...' : 'Upload Schedule Screenshot'}
          </button>
        </div>
      </div>

      <div className="panel full">
        <h3>Recent Team Imports</h3>
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
          ]}
          empty="No team imports yet."
        />
      </div>
    </section>
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

function DataTable({
  headers,
  rows,
  empty = 'No records yet.',
}: {
  headers: string[];
  rows: string[][];
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
