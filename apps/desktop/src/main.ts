import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { OpenDialogOptions, SaveDialogOptions } from 'electron';
import {
  PLACEHOLDER_DYNASTY,
  PLACEHOLDER_PROGRESSION,
  PLACEHOLDER_ROSTERS,
  PLACEHOLDER_TEAMS,
} from '@ncaa/domain';
import type { Roster, Team } from '@ncaa/domain';
import { CommissionerService } from './commissioner-service.js';
import { ScanService } from './scanner-service.js';
import type {
  AppSummary,
  RosterCaptureImport,
  ScanResult,
  ScanStore,
  ScheduleCaptureImport,
} from './types.js';
import type { CommissionerStore } from './commissioner-service.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

let mainWindow: BrowserWindow | null = null;
let scanRepository!: ScanStore;
let commissionerStore!: CommissionerStore;
let commissionerService!: CommissionerService;
let databasePath = '';
let hostedStateMirrorPath = '';

app.disableHardwareAcceleration();

function logStartup(message: string): void {
  console.log(`[desktop] ${message}`);
}

function getRendererEntry(): string {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) return devServerUrl;
  return `file://${join(__dirname, '../../../web/dist/index.html')}`;
}

function mostCommonTeamId(games: Array<{ homeTeamId: string; awayTeamId: string }>): string {
  const counts = new Map<string, number>();
  for (const game of games) {
    counts.set(game.homeTeamId, (counts.get(game.homeTeamId) ?? 0) + 1);
    counts.set(game.awayTeamId, (counts.get(game.awayTeamId) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

async function waitForAppReady(timeoutMs = 20000): Promise<void> {
  logStartup('Waiting for app.whenReady()...');
  await Promise.race([
    app.whenReady(),
    new Promise<void>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`app.whenReady() timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
  logStartup('app.whenReady() resolved');
}

async function initStorage(): Promise<void> {
  try {
    const storage = await import('@ncaa/storage');
    databasePath = join(app.getPath('userData'), 'ncaa-companion.db');
    hostedStateMirrorPath = join(app.getPath('userData'), 'hosted-state.json');
    const db = storage.openDatabase(databasePath);
    scanRepository = new storage.ScanRepository(db);
    commissionerStore = new storage.CommissionerRepository(db);
    logStartup(`SQLite storage ready (${databasePath})`);
  } catch (error) {
    const memory = await import('@ncaa/storage/memory');
    scanRepository = new memory.MemoryScanRepository();
    commissionerStore = new memory.MemoryCommissionerRepository();
    databasePath =
      'in-memory (SQLite native module not built for Electron; scans reset on restart)';
    hostedStateMirrorPath = join(app.getPath('userData'), 'hosted-state.json');
    logStartup(`Using in-memory storage: ${String(error)}`);
  }
  commissionerService = new CommissionerService(commissionerStore, hostedStateMirrorPath);
  await commissionerService.refreshUsers();
  await commissionerService.writeHostedStateMirror();
  logStartup(`Hosted state mirror ready (${hostedStateMirrorPath})`);
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1000,
    minHeight: 720,
    show: false,
    title: 'NCAA Companion App',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
    logStartup('BrowserWindow ready-to-show');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logStartup(`Renderer failed to load (${errorCode}): ${errorDescription} @ ${validatedURL}`);
    void dialog.showErrorBox(
      'NCAA Companion failed to load',
      `Could not load ${validatedURL}\n\n${errorDescription}\n\nMake sure Vite is running at http://127.0.0.1:5173`
    );
  });

  const entry = getRendererEntry();
  logStartup(`Loading renderer: ${entry}`);
  await mainWindow.loadURL(entry);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

function registerIpc(): void {
  ipcMain.handle('app:get-summary', async (): Promise<AppSummary> => {
    return {
      latestSession: scanRepository.getLatestSession(),
      totalIndexedFiles: scanRepository.countFiles(),
      databasePath,
      hostedStateMirrorPath,
    };
  });

  ipcMain.handle('scan:choose-folder', async (): Promise<ScanResult | null> => {
    const options: OpenDialogOptions = {
      title: 'Choose NCAA game or save folder',
      properties: ['openDirectory'],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;

    const scanner = new ScanService({ appDataDir: app.getPath('userData'), maxFiles: 5000 });
    const scan = await scanner.scan(result.filePaths[0]);
    scanRepository.createSession(scan.session);
    scanRepository.insertFiles(scan.files);
    scanRepository.completeSession(scan.session.id, scan.files.length);
    return scan;
  });

  ipcMain.handle('scan:list-latest-files', async () => {
    const session = scanRepository.getLatestSession();
    return session ? scanRepository.listFilesBySession(session.id) : [];
  });

  function teamForImport(teamId: string): Team {
    return commissionerService.listTeams().find((team) => team.id === teamId) ?? {
      id: teamId,
      name: teamId.replace(/^team-/, '').replace(/-/g, ' '),
      abbreviation: teamId.replace(/^team-/, '').slice(0, 4).toUpperCase(),
      conferenceId: 'future',
    };
  }

  function rosterForTeam(roster: Roster, teamId: string): Roster {
    return {
      ...roster,
      teamId,
      players: roster.players.map((player) => ({ ...player, teamId })),
      depthChart: roster.depthChart.map((slot) => ({ ...slot })),
      updatedAt: new Date().toISOString(),
    };
  }

  ipcMain.handle(
    'capture:import-roster-for-team',
    async (_event, input: { dynastyId: string; teamId: string }): Promise<RosterCaptureImport | null> => {
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, {
            title: `Choose roster screenshot for ${teamForImport(input.teamId).name}`,
            properties: ['openFile'],
            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
          })
        : await dialog.showOpenDialog({
            title: `Choose roster screenshot for ${teamForImport(input.teamId).name}`,
            properties: ['openFile'],
            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
          });
      if (result.canceled || !result.filePaths[0]) return null;

      const { loadRosterCaptureFixture, rosterCaptureFixtureToImport } = await import('@ncaa/parsers');
      const fixtureImport = rosterCaptureFixtureToImport(loadRosterCaptureFixture());
      const team = teamForImport(input.teamId);
      const imported: RosterCaptureImport = {
        ...fixtureImport,
        team,
        roster: rosterForTeam(fixtureImport.roster, input.teamId),
        sourceLabel: `Roster screenshot import: ${basename(result.filePaths[0])}`,
      };
    commissionerService.saveRosterImport({
      dynastyId: input.dynastyId,
      team: imported.team,
      roster: imported.roster,
      sourceLabel: imported.sourceLabel,
      fixtureId: imported.fixtureId,
    });
    return imported;
    }
  );

  ipcMain.handle('capture:import-schedule-for-team', async (_event, input: { dynastyId: string; teamId: string }): Promise<ScheduleCaptureImport | null> => {
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, {
          title: `Choose schedule screenshot for ${teamForImport(input.teamId).name}`,
          properties: ['openFile'],
          filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
        })
      : await dialog.showOpenDialog({
          title: `Choose schedule screenshot for ${teamForImport(input.teamId).name}`,
          properties: ['openFile'],
          filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
        });
    if (result.canceled || !result.filePaths[0]) return null;

    const { loadScheduleCaptureFixture, scheduleCaptureFixtureToImport } = await import('@ncaa/parsers');
    const fixtureImport = scheduleCaptureFixtureToImport(loadScheduleCaptureFixture());
    const sourceTeamId = mostCommonTeamId(fixtureImport.season.schedule);
    const imported: ScheduleCaptureImport = {
      ...fixtureImport,
      season: {
        ...fixtureImport.season,
        dynastyId: input.dynastyId,
        schedule: fixtureImport.season.schedule.map((game) => ({
          ...game,
          homeTeamId: game.homeTeamId === sourceTeamId ? input.teamId : game.homeTeamId,
          awayTeamId: game.awayTeamId === sourceTeamId ? input.teamId : game.awayTeamId,
        })),
        standings: fixtureImport.season.standings.map((standing) => ({
          ...standing,
          teamId: standing.teamId === sourceTeamId ? input.teamId : standing.teamId,
        })),
      },
      sourceLabel: `Schedule screenshot import: ${basename(result.filePaths[0])}`,
    };
    commissionerService.saveScheduleImport(imported);
    return imported;
  });

  ipcMain.handle('capture:list-schedule-imports', async () => commissionerService.listScheduleImports());

  ipcMain.handle('commissioner:get-config', async () => ({
    apiUrl: process.env.NCAA_API_URL ?? 'http://127.0.0.1:8787',
    dynastyId: 'dynasty-demo',
    commissionerUserId: 'user-admin',
    hostedStateMirrorPath,
  }));

  ipcMain.handle('commissioner:list-users', async () => commissionerService.listUsers());

  ipcMain.handle('commissioner:list-teams', async () => commissionerService.listTeams());

  ipcMain.handle(
    'commissioner:update-team-conference',
    async (_event, input: { teamId: string; conferenceId: string }) =>
      commissionerService.updateTeamConference(input)
  );

  ipcMain.handle('commissioner:seed-demo-users', async () => commissionerService.seedDemoUsers());

  ipcMain.handle(
    'commissioner:save-user',
    async (
      _event,
      input: {
        id?: string;
        email: string;
        displayName: string;
        role: 'admin' | 'coach' | 'viewer';
        accessStatus?: 'active' | 'disabled';
        temporaryPassword?: string;
        passwordResetRequired?: boolean;
      }
    ) => commissionerService.saveUser(input)
  );

  ipcMain.handle('commissioner:list-coaches', async () => commissionerService.listCoaches());

  ipcMain.handle('commissioner:refresh-users', async () => commissionerService.refreshUsers());

  ipcMain.handle('commissioner:list-tenures', async (_event, dynastyId?: string) =>
    commissionerService.listTenures(dynastyId ?? 'dynasty-demo')
  );

  ipcMain.handle(
    'commissioner:list-assignable-teams',
    async (_event, dynastyId: string, userId: string) =>
      commissionerService.listAssignableTeams(dynastyId, userId)
  );

  ipcMain.handle(
    'commissioner:assign-team',
    async (_event, input: { dynastyId: string; userId: string; teamId: string }) =>
      commissionerService.assignTeam(input)
  );

  ipcMain.handle('commissioner:list-imports', async (_event, dynastyId?: string) =>
    commissionerService.listRosterImports(dynastyId ?? 'dynasty-demo')
  );

  ipcMain.handle('commissioner:publish', async () => commissionerService.publishToHosted());

  ipcMain.handle('commissioner:publish-history', async (_event, dynastyId?: string) =>
    commissionerService.listPublishHistory(dynastyId ?? 'dynasty-demo')
  );

  ipcMain.handle('data:export-placeholder', async () => {
    const options: SaveDialogOptions = {
      title: 'Export companion data',
      defaultPath: 'ncaa-companion-export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { canceled: true };

    await writeFile(
      result.filePath,
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          teams: PLACEHOLDER_TEAMS,
          rosters: PLACEHOLDER_ROSTERS,
          dynasty: PLACEHOLDER_DYNASTY,
          progression: PLACEHOLDER_PROGRESSION,
        },
        null,
        2
      )
    );
    return { canceled: false, filePath: result.filePath };
  });
}

async function bootstrap(): Promise<void> {
  logStartup('Starting NCAA Companion desktop app...');

  if (!app.requestSingleInstanceLock()) {
    logStartup('Another NCAA Companion instance is already running. Exiting duplicate process.');
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  await waitForAppReady();
  await initStorage();
  registerIpc();
  await createWindow();
  logStartup('Desktop window ready');
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

void bootstrap().catch((error) => {
  console.error('[desktop] Fatal startup error:', error);
  app.exit(1);
});
