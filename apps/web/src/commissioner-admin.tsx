import { useCallback, useEffect, useState } from 'react';
import { getCompanionApi, type CommissionerConfig, type CommissionerLeagueSummary } from './api';

const api = getCompanionApi();

export function CommissionerAdminPage({
  onLeagueChanged,
}: {
  onLeagueChanged?: () => void | Promise<void>;
}) {
  const [config, setConfig] = useState<CommissionerConfig | null>(null);
  const [leagues, setLeagues] = useState<CommissionerLeagueSummary[]>([]);
  const [leagueName, setLeagueName] = useState('');
  const [startingYear, setStartingYear] = useState(String(new Date().getFullYear()));
  const [selfDisplayName, setSelfDisplayName] = useState('');
  const [selfEmail, setSelfEmail] = useState('');
  const [selfPassword, setSelfPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState('');

  const refresh = useCallback(async () => {
    const [nextConfig, nextLeagues] = await Promise.all([
      api.getCommissionerConfig?.() ?? null,
      api.listLeagues?.() ?? [],
    ]);
    setConfig(nextConfig);
    setLeagues(nextLeagues);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeLeagueId = config?.dynastyId ?? '';

  async function handleSwitch(leagueId: string) {
    if (!api.switchActiveLeague) {
      setMessage('League management is available in the Electron desktop app.');
      return;
    }
    if (leagueId === activeLeagueId) return;

    setBusy(true);
    setMessage(null);
    try {
      await api.switchActiveLeague(leagueId);
      await refresh();
      await onLeagueChanged?.();
      setMessage('Active league switched. Sidebar stats reflect the selected league.');
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!api.createLeague) {
      setMessage('League management is available in the Electron desktop app.');
      return;
    }

    const year = Number(startingYear);
    if (!leagueName.trim() || !selfDisplayName.trim() || !selfEmail.trim() || !Number.isFinite(year)) {
      setMessage('League name, starting year, and self user name/email are required.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const result = await api.createLeague({
        name: leagueName.trim(),
        startingSeasonYear: year,
        selfUser: {
          displayName: selfDisplayName.trim(),
          email: selfEmail.trim(),
          temporaryPassword: selfPassword.trim() || undefined,
        },
      });
      setLeagueName('');
      setSelfDisplayName('');
      setSelfEmail('');
      setSelfPassword('');
      await refresh();
      await onLeagueChanged?.();
      setMessage(`Created "${result.league.name}" and switched to it as the active league.`);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(leagueId: string) {
    if (!api.deleteLeague) {
      setMessage('League management is available in the Electron desktop app.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await api.deleteLeague(leagueId);
      setPendingDeleteId('');
      await refresh();
      await onLeagueChanged?.();
      setMessage('League deleted. Dynasty-scoped imports, tenures, and publish history were removed.');
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  if (!api.listLeagues || !api.createLeague || !api.switchActiveLeague || !api.deleteLeague) {
    return (
      <section className="panel">
        <h3>Admin</h3>
        <p className="muted">Local league management is available in the Electron desktop app.</p>
      </section>
    );
  }

  return (
    <section className="grid two">
      <div className="panel full">
        <div className="section-header">
          <div>
            <h3>Admin</h3>
            <p className="muted">
              Create and switch local leagues on this machine. Publishing sends the currently active
              league to the hosted portal.
            </p>
          </div>
        </div>
        {message && <div className="notice">{message}</div>}
        {config && (
          <dl className="details inline-details">
            <dt>Active league</dt>
            <dd>{config.leagueName}</dd>
            <dt>Dynasty id</dt>
            <dd>{config.dynastyId}</dd>
            <dt>Starting year</dt>
            <dd>{config.startingSeasonYear}</dd>
          </dl>
        )}
      </div>

      <div className="panel">
        <h3>Active League</h3>
        <div className="form-grid">
          <label className="stacked-field">
            <span>Switch league</span>
            <select
              value={activeLeagueId}
              onChange={(event) => void handleSwitch(event.target.value)}
              disabled={busy}
            >
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name} ({league.startingSeasonYear})
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">
          Team assignments, imports, and publish history are stored per league. Switching reloads the
          selected league&apos;s local data.
        </p>
      </div>

      <div className="panel">
        <h3>Create League</h3>
        <div className="form-grid">
          <label className="stacked-field">
            <span>League name</span>
            <input value={leagueName} onChange={(event) => setLeagueName(event.target.value)} />
          </label>
          <label className="stacked-field">
            <span>Starting year</span>
            <input
              type="number"
              value={startingYear}
              onChange={(event) => setStartingYear(event.target.value)}
            />
          </label>
          <label className="stacked-field">
            <span>Your display name</span>
            <input value={selfDisplayName} onChange={(event) => setSelfDisplayName(event.target.value)} />
          </label>
          <label className="stacked-field">
            <span>Your email</span>
            <input value={selfEmail} onChange={(event) => setSelfEmail(event.target.value)} />
          </label>
          <label className="stacked-field">
            <span>Your password</span>
            <input
              type="password"
              value={selfPassword}
              onChange={(event) => setSelfPassword(event.target.value)}
              placeholder="Optional initial password"
            />
          </label>
          <button
            onClick={() => void handleCreate()}
            disabled={busy || !leagueName.trim() || !selfDisplayName.trim() || !selfEmail.trim()}
          >
            {busy ? 'Creating...' : 'Create & Switch'}
          </button>
        </div>
      </div>

      <div className="panel full">
        <h3>Local Leagues</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Starting year</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leagues.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No leagues yet.
                  </td>
                </tr>
              ) : (
                leagues.map((league) => {
                  const isActive = league.id === activeLeagueId;
                  const confirmDelete = pendingDeleteId === league.id;
                  return (
                    <tr key={league.id}>
                      <td>
                        {league.name}
                        {isActive && <span className="pill">Active</span>}
                      </td>
                      <td>{league.startingSeasonYear}</td>
                      <td>{league.status}</td>
                      <td className="compact-actions">
                        {!isActive && (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => void handleSwitch(league.id)}
                          >
                            Switch
                          </button>
                        )}
                        {confirmDelete ? (
                          <>
                            <button
                              className="danger"
                              disabled={busy || leagues.length <= 1}
                              onClick={() => void handleDelete(league.id)}
                            >
                              Confirm delete
                            </button>
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() => setPendingDeleteId('')}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            className="danger secondary"
                            disabled={busy || leagues.length <= 1}
                            onClick={() => setPendingDeleteId(league.id)}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {leagues.length <= 1 && (
          <p className="muted small">At least one local league must remain on this machine.</p>
        )}
        <p className="muted small testing-tools">
          Deleting a league permanently removes its tenures, roster imports, dynasty state, and publish
          history from local storage.
        </p>
      </div>
    </section>
  );
}
