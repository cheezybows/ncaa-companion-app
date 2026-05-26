import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { OpenDialogOptions, SaveDialogOptions } from 'electron';
import type { Team } from '@ncaa/domain';
import {
  importRosterFromOcrPages,
  importScheduleFromOcrPages,
  importTop25FromOcrPages,
} from '@ncaa/parsers';
import { CommissionerService } from './commissioner-service.js';
import { recognizeScreenshots, terminateOcrWorker } from './ocr-service.js';
import { ScanService } from './scanner-service.js';
import type {
  AppSummary,
  RosterCaptureImport,
  ScanResult,
  ScanStore,
  ScheduleCaptureImport,
  Top25CaptureImport,
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

function logCapture(message: string): void {
  console.log(`[capture] ${message}`);
}

function logCaptureWarnings(context: string, warnings: Array<{ code: string; message: string; rowKey?: string }> | undefined): void {
  if (!warnings?.length) {
    logCapture(`${context}: warnings=0`);
    return;
  }

  logCapture(`${context}: warnings=${warnings.length}`);
  for (const warning of warnings.slice(0, 10)) {
    console.warn(
      `[capture] ${context} warning${warning.rowKey ? ` row=${warning.rowKey}` : ''} code=${warning.code}: ${warning.message}`
    );
  }
  if (warnings.length > 10) {
    console.warn(`[capture] ${context}: ${warnings.length - 10} additional warnings omitted`);
  }
}

function logOcrPages(context: string, filePaths: string[], pages: Array<{ text: string; words: unknown[]; confidence: number }>): void {
  logCapture(`${context}: selectedFiles=${filePaths.length}`);
  filePaths.forEach((filePath, index) => logCapture(`${context}: file[${index}]=${filePath}`));
  logCapture(
    `${context}: ocrPages=${pages.length} totalWords=${pages.reduce((sum, page) => sum + page.words.length, 0)} totalChars=${pages.reduce((sum, page) => sum + page.text.length, 0)} avgConfidence=${
      pages.length === 0
        ? '0.0'
        : (pages.reduce((sum, page) => sum + page.confidence, 0) / pages.length).toFixed(1)
    }`
  );
}

function getRendererEntry(): string {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) return devServerUrl;
  return `file://${join(__dirname, '../../../web/dist/index.html')}`;
}

function getDemoDynastyFixturePath(): string {
  return join(__dirname, '../../portal/public/temp_screenshots/demo-dynasty.json');
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
  await commissionerService.loadHostedStateMirror();
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

  ipcMain.handle(
    'capture:import-roster-for-team',
    async (_event, input: { dynastyId: string; teamId: string }): Promise<RosterCaptureImport | null> => {
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, {
            title: `Choose roster screenshots for ${teamForImport(input.teamId).name}`,
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
          })
        : await dialog.showOpenDialog({
            title: `Choose roster screenshots for ${teamForImport(input.teamId).name}`,
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
          });
      if (result.canceled || !result.filePaths[0]) return null;

      const team = teamForImport(input.teamId);
      logCapture(
        `roster import started: dynastyId=${input.dynastyId} teamId=${input.teamId} team="${team.name}"`
      );
      const pages = await recognizeScreenshots(result.filePaths, { screenKind: 'roster_by_position' });
      logOcrPages('roster import', result.filePaths, pages);
      const { import: imported } = importRosterFromOcrPages(pages, {
        dynastyId: input.dynastyId,
        team,
      });
      logCapture(
        `roster import parsed: players=${imported.roster.players.length} partial=${imported.partial}`
      );
      logCaptureWarnings('roster import', imported.warnings);
      commissionerService.saveRosterImport({
        dynastyId: input.dynastyId,
        team: imported.team,
        roster: imported.roster,
        sourceLabel: imported.sourceLabel,
        fixtureId: imported.fixtureId,
      });
      logCapture(`roster import saved: teamId=${imported.team.id} players=${imported.roster.players.length}`);
      return imported;
    }
  );

  ipcMain.handle('capture:import-schedule-for-team', async (_event, input: { dynastyId: string; teamId: string }): Promise<ScheduleCaptureImport | null> => {
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, {
          title: `Choose schedule screenshots for ${teamForImport(input.teamId).name}`,
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
        })
      : await dialog.showOpenDialog({
          title: `Choose schedule screenshots for ${teamForImport(input.teamId).name}`,
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
        });
    if (result.canceled || !result.filePaths[0]) return null;

    const team = teamForImport(input.teamId);
    logCapture(
      `schedule import started: dynastyId=${input.dynastyId} teamId=${input.teamId} team="${team.name}"`
    );
    const pages = await recognizeScreenshots(result.filePaths, { screenKind: 'team_schedule' });
    logOcrPages('schedule import', result.filePaths, pages);
    const seasonYear = commissionerService.getCurrentSeasonYear();
    const { import: imported } = importScheduleFromOcrPages(pages, {
      dynastyId: input.dynastyId,
      teamId: input.teamId,
      teamName: team.name,
      seasonYear,
    });
    logCapture(
      `schedule import parsed: games=${imported.season.schedule.length} rowsYear=${imported.season.year} partial=${imported.partial}`
    );
    logCaptureWarnings('schedule import', imported.warnings);
    commissionerService.saveScheduleImport(imported);
    logCapture(`schedule import saved: teamId=${imported.teamId} games=${imported.season.schedule.length}`);
    return imported;
  });

  ipcMain.handle('capture:list-schedule-imports', async () => commissionerService.listScheduleImports());

  ipcMain.handle(
    'capture:import-top25',
    async (_event, input: { dynastyId: string }): Promise<Top25CaptureImport | null> => {
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, {
            title: 'Choose Top 25 rankings screenshots',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
          })
        : await dialog.showOpenDialog({
            title: 'Choose Top 25 rankings screenshots',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
          });
      if (result.canceled || !result.filePaths[0]) return null;

      logCapture(`top25 import started: dynastyId=${input.dynastyId}`);
      const pages = await recognizeScreenshots(result.filePaths, { screenKind: 'top25_rankings' });
      logOcrPages('top25 import', result.filePaths, pages);
      const seasonYear = commissionerService.getCurrentSeasonYear();
      const { import: imported } = importTop25FromOcrPages(pages, {
        dynastyId: input.dynastyId,
        seasonYear,
      });
      logCapture(
        `top25 import parsed: entries=${imported.rankings.entries.length} seasonYear=${imported.rankings.seasonYear} partial=${imported.partial}`
      );
      logCaptureWarnings('top25 import', imported.warnings);
      commissionerService.saveTop25Import(imported);
      logCapture(`top25 import saved: entries=${imported.rankings.entries.length}`);
      return imported;
    }
  );

  ipcMain.handle('capture:list-top25-imports', async () => commissionerService.listTop25Imports());

  ipcMain.handle('capture:save-manual-roster', async (_event, input) =>
    commissionerService.saveManualRoster(input)
  );

  ipcMain.handle('capture:save-manual-schedule', async (_event, input) =>
    commissionerService.saveManualSchedule(input)
  );

  ipcMain.handle('capture:save-manual-top25', async (_event, input) =>
    commissionerService.saveManualTop25(input)
  );

  ipcMain.handle('capture:clear-team-imports', async (_event, input) =>
    commissionerService.clearTeamImports(input)
  );

  ipcMain.handle('capture:clear-all-imports', async (_event, input) =>
    commissionerService.clearAllImports(input)
  );

  ipcMain.handle('capture:undo-latest-roster-import', async (_event, input) =>
    commissionerService.undoLatestRosterImport(input)
  );

  ipcMain.handle('capture:undo-latest-schedule-import', async (_event, input) =>
    commissionerService.undoLatestScheduleImport(input)
  );

  ipcMain.handle('capture:undo-latest-top25-import', async () =>
    commissionerService.undoLatestTop25Import()
  );

  ipcMain.handle('commissioner:get-config', async () => commissionerService.getCommissionerConfig());

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

  ipcMain.handle('commissioner:delete-user', async (_event, userId: string) =>
    commissionerService.deleteUser(userId)
  );

  ipcMain.handle('commissioner:list-coaches', async () => commissionerService.listCoaches());

  ipcMain.handle('commissioner:refresh-users', async () => commissionerService.refreshUsers());

  ipcMain.handle('commissioner:list-tenures', async (_event, dynastyId?: string) =>
    commissionerService.listTenures(dynastyId)
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
    commissionerService.listRosterImports(dynastyId)
  );

  ipcMain.handle('commissioner:publish', async () => commissionerService.publishToHosted());

  ipcMain.handle('commissioner:install-demo-mode', async () =>
    commissionerService.installDemoModeFromFile(getDemoDynastyFixturePath())
  );

  ipcMain.handle('commissioner:publish-history', async (_event, dynastyId?: string) =>
    commissionerService.listPublishHistory(dynastyId)
  );

  ipcMain.handle('commissioner:list-leagues', async () => commissionerService.listLeagues());

  ipcMain.handle(
    'commissioner:create-league',
    async (
      _event,
      input: {
        name: string;
        startingSeasonYear: number;
        selfUser: { displayName: string; email: string; temporaryPassword?: string };
      }
    ) => commissionerService.createLeague(input)
  );

  ipcMain.handle('commissioner:switch-league', async (_event, leagueId: string) =>
    commissionerService.switchActiveLeague(leagueId)
  );

  ipcMain.handle('commissioner:delete-league', async (_event, leagueId: string) => {
    await commissionerService.deleteLeague(leagueId);
  });

  ipcMain.handle('commissioner:preview-season-advance', async (_event, assignments?) =>
    commissionerService.previewSeasonAdvance(assignments)
  );

  ipcMain.handle('commissioner:advance-season', async (_event, assignments, heisman) =>
    commissionerService.advanceToNextSeason(assignments, heisman)
  );

  ipcMain.handle('commissioner:preview-week-advance', async () =>
    commissionerService.previewWeekAdvance()
  );

  ipcMain.handle('commissioner:advance-week', async () => commissionerService.advanceToNextWeek());

  ipcMain.handle('commissioner:get-archive-summary', async () =>
    commissionerService.getDynastyArchiveSummary()
  );

  ipcMain.handle('commissioner:list-postseason-results', async (_event, seasonYear?: number) =>
    commissionerService.listPostseasonResults(seasonYear)
  );

  ipcMain.handle('commissioner:save-postseason-result', async (_event, input) =>
    commissionerService.savePostseasonResult(input)
  );

  ipcMain.handle('commissioner:delete-postseason-result', async (_event, id: string) =>
    commissionerService.deletePostseasonResult(id)
  );

  ipcMain.handle('commissioner:update-checkpoint', async (_event, input) =>
    commissionerService.updateCheckpoint(input)
  );

  ipcMain.handle('commissioner:update-checkpoint-roster', async (_event, input) =>
    commissionerService.updateCheckpointRoster(input)
  );

  ipcMain.handle('commissioner:update-player-catalog-entry', async (_event, input) =>
    commissionerService.updatePlayerCatalogEntry(input)
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
          payload: commissionerService.buildPublishPayload(),
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

app.on('will-quit', () => {
  void terminateOcrWorker();
});

void bootstrap().catch((error) => {
  console.error('[desktop] Fatal startup error:', error);
  app.exit(1);
});
