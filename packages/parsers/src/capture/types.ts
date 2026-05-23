export type CaptureScreenKind = 'roster_by_position' | 'team_schedule' | 'top25_rankings';

export interface CaptureRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CaptureTableColumn {
  key: string;
  header: string;
  kind: 'text' | 'number' | 'icon';
  ratingCode?: string;
  sortActive?: boolean;
}

export interface RosterCaptureMeta {
  fixtureId: string;
  screenKind: CaptureScreenKind;
  game: string;
  partial: boolean;
  notes: string[];
  navigation: {
    teamCycle: string;
    positionCycle: string;
    selectedTeam: string;
    selectedPosition: string;
  };
  teamContext: {
    name: string;
    rank?: number;
    record?: string;
    conferenceRecord?: string;
    conferenceStanding?: string;
    conference?: string;
    overallRating?: number;
    offensiveRating?: number;
    defensiveRating?: number;
  };
  regions: Record<string, CaptureRegion>;
  table: {
    columns: CaptureTableColumn[];
    visibleRowCount: number;
    focusedRowIndex: number;
    hasMoreRows: boolean;
    hasHorizontalScroll: boolean;
  };
  detailPanel: { fields: string[] };
  imageFile: string;
}

export interface ExtractedRosterTableRow {
  index: number;
  displayName: string;
  classYear?: string;
  position: string;
  focused?: boolean;
  ratings: Record<string, number | undefined>;
}

export interface ExtractedRosterDetailPanel {
  firstName: string;
  lastName: string;
  displayName: string;
  position: string;
  jerseyNumber?: number;
  classYear?: string;
  archetype?: string;
  heightInches?: number;
  weightLbs?: number;
  hometown?: string;
  ratings: Record<string, number | undefined>;
  abilities?: Array<{ name: string; type: 'physical' | 'mental' }>;
  developmentTrait?: string;
}

export interface RosterCaptureExpected {
  fixtureId: string;
  screenKind: CaptureScreenKind;
  partial: boolean;
  /**
   * Source-screen context from the screenshot. Import callers may override the
   * destination team based on the team selected in the UI.
   */
  teamContext?: {
    teamKey?: string;
    name: string;
    selectedPosition: string;
  };
  table: {
    focusedRowIndex: number;
    rows: ExtractedRosterTableRow[];
  };
  detailPanel: ExtractedRosterDetailPanel;
}

export interface RosterCaptureFixture {
  meta: RosterCaptureMeta;
  expected: RosterCaptureExpected;
  imagePath: string;
  imagePresent: boolean;
}

export interface ScheduleCaptureMeta {
  fixtureId: string;
  screenKind: 'team_schedule';
  game: string;
  partial: boolean;
  notes: string[];
  teamContext: {
    teamKey: string;
    name: string;
    record?: string;
    conference?: string;
  };
  table: {
    visibleRowCount: number;
    hasMoreRows: boolean;
  };
  imageFile: string;
}

export interface ExtractedScheduleTableRow {
  week: number;
  date?: string;
  opponentName?: string;
  opponentTeamKey?: string;
  site: 'home' | 'away' | 'neutral' | 'bye';
  timeOrResult?: string;
  opponentRecord?: string;
  isConferenceGame?: boolean;
}

export interface ScheduleCaptureExpected {
  fixtureId: string;
  screenKind: 'team_schedule';
  partial: boolean;
  teamContext: {
    teamKey?: string;
    name: string;
    seasonYear: number;
  };
  table: {
    rows: ExtractedScheduleTableRow[];
  };
}

export interface ScheduleCaptureFixture {
  meta: ScheduleCaptureMeta;
  expected: ScheduleCaptureExpected;
  imagePath: string;
  imagePresent: boolean;
}

export interface Top25CaptureMeta {
  fixtureId: string;
  screenKind: 'top25_rankings';
  game: string;
  partial: boolean;
  notes: string[];
  seasonYear: number;
  pollType: 'top25';
  table: {
    visibleRowCount: number;
    hasMoreRows: boolean;
  };
  imageFile: string;
}

export interface ExtractedRankingEntry {
  rank: number;
  previousRank?: number;
  teamKey: string;
  teamName: string;
  wins: number;
  losses: number;
  lastWeekResult?: string;
  thisWeekOpponent?: string;
  movement?: 'up' | 'down' | 'same';
}

export interface Top25CaptureExpected {
  fixtureId: string;
  screenKind: 'top25_rankings';
  partial: boolean;
  seasonYear: number;
  pollType: 'top25';
  entries: ExtractedRankingEntry[];
}

export interface Top25CaptureFixture {
  meta: Top25CaptureMeta;
  expected: Top25CaptureExpected;
  imagePath: string;
  imagePresent: boolean;
}

export interface CaptureOcrBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CaptureOcrWord {
  text: string;
  confidence: number;
  bbox: CaptureOcrBBox;
}

export interface CaptureOcrPageResult {
  imagePath: string;
  text: string;
  words: CaptureOcrWord[];
  confidence: number;
}

export interface CaptureImportWarning {
  code: string;
  message: string;
  rowKey?: string;
}

export interface CaptureOcrDraft<T> {
  data: T;
  warnings: CaptureImportWarning[];
  partial: boolean;
}

export interface UniversalCaptureLayouts {
  notes: string[];
  rosterByPosition: {
    screenKind: 'roster_by_position';
    sharedColumns: CaptureTableColumn[];
    ratingColumnSets: Record<string, CaptureTableColumn[]>;
    detailPanelFields: string[];
  };
  teamSchedule: {
    screenKind: 'team_schedule';
    columns: CaptureTableColumn[];
  };
  top25Rankings: {
    screenKind: 'top25_rankings';
    columns: CaptureTableColumn[];
  };
}
