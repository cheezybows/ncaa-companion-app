import { contextBridge, ipcRenderer } from 'electron';
import type { NcaaApi } from './types.js';

const api: NcaaApi = {
  getSummary: () => ipcRenderer.invoke('app:get-summary'),
  chooseAndScanFolder: () => ipcRenderer.invoke('scan:choose-folder'),
  listLatestFiles: () => ipcRenderer.invoke('scan:list-latest-files'),
  exportPlaceholderData: () => ipcRenderer.invoke('data:export-placeholder'),
  importRosterScreenshotForTeam: (input) => ipcRenderer.invoke('capture:import-roster-for-team', input),
  importScheduleScreenshotForTeam: (input) =>
    ipcRenderer.invoke('capture:import-schedule-for-team', input),
  listScheduleImports: () => ipcRenderer.invoke('capture:list-schedule-imports'),
  importTop25Screenshot: (input) => ipcRenderer.invoke('capture:import-top25', input),
  listTop25Imports: () => ipcRenderer.invoke('capture:list-top25-imports'),
  saveManualRoster: (input) => ipcRenderer.invoke('capture:save-manual-roster', input),
  saveManualSchedule: (input) => ipcRenderer.invoke('capture:save-manual-schedule', input),
  saveManualTop25: (input) => ipcRenderer.invoke('capture:save-manual-top25', input),
  clearTeamImports: (input) => ipcRenderer.invoke('capture:clear-team-imports', input),
  clearAllImports: (input) => ipcRenderer.invoke('capture:clear-all-imports', input),
  undoLatestRosterImport: (input) => ipcRenderer.invoke('capture:undo-latest-roster-import', input),
  undoLatestScheduleImport: (input) => ipcRenderer.invoke('capture:undo-latest-schedule-import', input),
  getCommissionerConfig: () => ipcRenderer.invoke('commissioner:get-config'),
  listUsers: () => ipcRenderer.invoke('commissioner:list-users'),
  listTeams: () => ipcRenderer.invoke('commissioner:list-teams'),
  updateTeamConference: (input) =>
    ipcRenderer.invoke('commissioner:update-team-conference', input),
  seedDemoUsers: () => ipcRenderer.invoke('commissioner:seed-demo-users'),
  saveUser: (input) => ipcRenderer.invoke('commissioner:save-user', input),
  listCoaches: () => ipcRenderer.invoke('commissioner:list-coaches'),
  refreshHostedUsers: () => ipcRenderer.invoke('commissioner:refresh-users'),
  listCommissionerTenures: (dynastyId) =>
    ipcRenderer.invoke('commissioner:list-tenures', dynastyId),
  listAssignableTeams: (dynastyId, userId) =>
    ipcRenderer.invoke('commissioner:list-assignable-teams', dynastyId, userId),
  assignCoachTeam: (input) => ipcRenderer.invoke('commissioner:assign-team', input),
  listRosterImports: (dynastyId) => ipcRenderer.invoke('commissioner:list-imports', dynastyId),
  publishToHosted: () => ipcRenderer.invoke('commissioner:publish'),
  listPublishHistory: (dynastyId) =>
    ipcRenderer.invoke('commissioner:publish-history', dynastyId),
  previewSeasonAdvance: (assignments) =>
    ipcRenderer.invoke('commissioner:preview-season-advance', assignments),
  advanceToNextSeason: (assignments) =>
    ipcRenderer.invoke('commissioner:advance-season', assignments),
  previewWeekAdvance: () => ipcRenderer.invoke('commissioner:preview-week-advance'),
  advanceToNextWeek: () => ipcRenderer.invoke('commissioner:advance-week'),
  getDynastyArchiveSummary: () => ipcRenderer.invoke('commissioner:get-archive-summary'),
  listPostseasonResults: (seasonYear?: number) =>
    ipcRenderer.invoke('commissioner:list-postseason-results', seasonYear),
  savePostseasonResult: (input) => ipcRenderer.invoke('commissioner:save-postseason-result', input),
  deletePostseasonResult: (id) => ipcRenderer.invoke('commissioner:delete-postseason-result', id),
  updateCheckpoint: (input) => ipcRenderer.invoke('commissioner:update-checkpoint', input),
  updateCheckpointRoster: (input) =>
    ipcRenderer.invoke('commissioner:update-checkpoint-roster', input),
  updatePlayerCatalogEntry: (input) =>
    ipcRenderer.invoke('commissioner:update-player-catalog-entry', input),
  listLeagues: () => ipcRenderer.invoke('commissioner:list-leagues'),
  createLeague: (input) => ipcRenderer.invoke('commissioner:create-league', input),
  switchActiveLeague: (leagueId) => ipcRenderer.invoke('commissioner:switch-league', leagueId),
  deleteLeague: (leagueId) => ipcRenderer.invoke('commissioner:delete-league', leagueId),
};

contextBridge.exposeInMainWorld('ncaa', api);
