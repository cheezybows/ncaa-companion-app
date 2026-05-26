import { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import type { IndexedFile } from '@ncaa/domain';
import {
  AppShell,
  DataTable,
  NavItem,
  SidebarBrand,
  SidebarNav,
} from '@ncaa/ui';
import { getCompanionApi } from './api';
import type { AppSummary } from './api';
import {
  CommissionerAssignmentsPage,
  CommissionerHistoryPage,
  CommissionerTeamImportsPage,
  CommissionerOverviewPage,
  CommissionerAdvanceSeasonPage,
  CommissionerArchivePage,
  CommissionerPublishPage,
  CommissionerUsersPage,
} from './commissioner';
import { CommissionerAdminPage } from './commissioner-admin';

const api = getCompanionApi();

const nav = [
  { to: '/commissioner', label: 'Overview', end: true },
  { to: '/commissioner/users', label: 'Users' },
  { to: '/commissioner/assignments', label: 'Assign Teams' },
  { to: '/commissioner/imports', label: 'Team Imports' },
  { to: '/commissioner/advance-week', label: 'Advance Week' },
  { to: '/commissioner/advance-season', label: 'Advance Season' },
  { to: '/commissioner/publish', label: 'Publish' },
  { to: '/commissioner/history', label: 'History' },
  { to: '/scanner', label: 'Local Files' },
  { to: '/admin', label: 'Admin' },
];

export function App() {
  const location = useLocation();
  const [summary, setSummary] = useState<AppSummary | null>(null);
  const [files, setFiles] = useState<Array<IndexedFile & { workingCopyPath?: string }>>([]);
  const [activeUserCount, setActiveUserCount] = useState(0);
  const [lastPublishDate, setLastPublishDate] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const [nextSummary, nextFiles] = await Promise.all([
      api.getSummary(),
      api.listLatestFiles(),
    ]);
    setSummary(nextSummary);
    setFiles(nextFiles);

    if (api.getCommissionerConfig) {
      const config = await api.getCommissionerConfig();
      const [tenures, history] = await Promise.all([
        api.listCommissionerTenures?.(config.dynastyId) ?? [],
        api.listPublishHistory?.(config.dynastyId) ?? [],
      ]);
      const activeUserIds = new Set(
        tenures.filter((tenure) => tenure.status === 'active').map((tenure) => tenure.userId)
      );
      setActiveUserCount(activeUserIds.size);
      setLastPublishDate(history[0]?.syncedAt ?? history[0]?.createdAt ?? null);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function scanFolder() {
    setIsScanning(true);
    setMessage(null);
    try {
      const result = await api.chooseAndScanFolder();
      if (result) {
        setFiles(result.files);
        await refresh();
        setMessage(`Indexed ${result.files.length} files from ${result.session.sourceRoot}`);
      } else {
        setMessage('Folder selection canceled.');
      }
    } finally {
      setIsScanning(false);
    }
  }

  async function exportData() {
    const result = await api.exportPlaceholderData();
    setMessage(result.canceled ? 'Export canceled.' : `Exported data to ${result.filePath}`);
  }

  return (
    <AppShell
      sidebar={
        <>
          <SidebarBrand logoSrc="/college-football-comissioner-app-logo.svg" />
          <SidebarNav>
            {nav.map((item) => (
              <NavItem
                key={item.to}
                to={item.to}
                label={item.label}
                active={isNavActive(location.pathname, item.to, item.end)}
              />
            ))}
          </SidebarNav>
        </>
      }
      sidebarFooter={
        <div className="sidebar-footer">
          <span className="sidebar-footer-label">League snapshot</span>
          <span className="sidebar-footer-number">{activeUserCount}</span>
          <span className="sidebar-footer-sub">active coaches</span>
          <span className="sidebar-footer-sub">Last publish: {formatSidebarDate(lastPublishDate)}</span>
        </div>
      }
    >
      {message && <div className="notice">{message}</div>}
      <Routes>
        <Route path="/" element={<Navigate to="/commissioner" replace />} />
        <Route
          path="/scanner"
          element={
            <ScannerView
              summary={summary}
              files={files}
              isScanning={isScanning}
              onScanFolder={scanFolder}
              onExportData={exportData}
            />
          }
        />
        <Route path="/admin" element={<CommissionerAdminPage onLeagueChanged={refresh} />} />
        <Route path="/commissioner" element={<CommissionerShell />}>
          <Route index element={<CommissionerOverviewPage />} />
          <Route path="users" element={<CommissionerUsersPage />} />
          <Route path="assignments" element={<CommissionerAssignmentsPage />} />
          <Route path="imports" element={<CommissionerTeamImportsPage />} />
          <Route path="advance-week" element={<CommissionerArchivePage />} />
          <Route path="archive" element={<Navigate to="advance-week" replace />} />
          <Route path="advance-season" element={<CommissionerAdvanceSeasonPage />} />
          <Route path="publish" element={<CommissionerPublishPage />} />
          <Route path="history" element={<CommissionerHistoryPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/commissioner" replace />} />
      </Routes>
    </AppShell>
  );
}

function isNavActive(pathname: string, to: string, end?: boolean): boolean {
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function formatSidebarDate(value: string | null): string {
  if (!value) return 'No data published yet';
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function CommissionerShell() {
  return <Outlet />;
}

function ScannerView({
  summary,
  files,
  isScanning,
  onScanFolder,
  onExportData,
}: {
  summary: AppSummary | null;
  files: Array<IndexedFile & { workingCopyPath?: string }>;
  isScanning: boolean;
  onScanFolder: () => void;
  onExportData: () => void;
}) {
  const filesByKind = useMemo(() => {
    return files.reduce<Record<string, number>>((acc, file) => {
      acc[file.kind] = (acc[file.kind] ?? 0) + 1;
      return acc;
    }, {});
  }, [files]);

  return (
    <section className="grid two">
      <div className="panel full">
        <div className="section-header">
          <div>
            <p className="eyebrow">Local discovery</p>
            <h3>Local Files</h3>
            <p className="muted">Index NCAA save or game folders on this machine.</p>
          </div>
          <div className="actions">
            <button onClick={onScanFolder} disabled={isScanning}>
              {isScanning ? 'Scanning...' : 'Choose & Scan Folder'}
            </button>
            <button className="secondary" onClick={onExportData}>
              Export JSON
            </button>
          </div>
        </div>
      </div>
      <div className="panel">
        <h3>Latest Scan</h3>
        <dl className="details">
          <dt>Source</dt>
          <dd>{summary?.latestSession?.sourceRoot ?? 'Not scanned yet'}</dd>
          <dt>Working copies</dt>
          <dd>{summary?.latestSession?.workingCopyDir ?? 'Not available yet'}</dd>
          <dt>SQLite database</dt>
          <dd>{summary?.databasePath ?? 'Loading...'}</dd>
        </dl>
      </div>
      <div className="panel">
        <h3>File Kind Breakdown</h3>
        <div className="stat-list">
          {Object.entries(filesByKind).length === 0 ? (
            <p className="muted">Choose a game or save folder to index files.</p>
          ) : (
            Object.entries(filesByKind).map(([kind, count]) => (
              <span key={kind} className="pill">
                {kind}: {count}
              </span>
            ))
          )}
        </div>
      </div>
      <div className="panel full">
        <h3>Indexed Files</h3>
        <DataTable
          headers={['File', 'Kind', 'Size', 'Modified']}
          rows={files.slice(0, 100).map((file) => [
            file.relativePath,
            file.kind,
            `${Math.round(file.sizeBytes / 1024)} KB`,
            new Date(file.modifiedAt).toLocaleString(),
          ])}
          empty="No files indexed yet."
        />
      </div>
    </section>
  );
}
