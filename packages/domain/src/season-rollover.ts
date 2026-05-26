import type { Season, TeamRosterSnapshot } from './types.js';

export type SeasonAdvanceAction = 'stay' | 'leave' | 'change';

export interface SeasonAdvanceAssignmentInput {
  tenureId: string;
  userId: string;
  coachName: string;
  currentTeamId: string;
  currentTeamName: string;
  action: SeasonAdvanceAction;
  nextTeamId?: string;
}

export interface SeasonAdvanceHeismanInput {
  playerName: string;
  teamId: string;
}

export type { TeamRosterSnapshot };

export interface SeasonAdvancePreview {
  currentSeasonYear: number;
  nextSeasonYear: number;
  assignments: SeasonAdvanceAssignmentInput[];
  archivedSeason: Season;
  teamRosterSnapshots: TeamRosterSnapshot[];
  validationErrors: string[];
}

export interface SeasonAdvanceResult {
  previousSeasonYear: number;
  currentSeasonYear: number;
  tenuresUpdated: number;
  rostersCarriedForward: number;
  archivedSeason: Season;
}
