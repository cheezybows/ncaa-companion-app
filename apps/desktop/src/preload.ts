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
};

contextBridge.exposeInMainWorld('ncaa', api);
