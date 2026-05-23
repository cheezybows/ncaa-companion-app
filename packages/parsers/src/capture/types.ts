export type CaptureScreenKind = 'roster_by_position' | 'team_schedule';

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
  teamContext: {
    teamKey: string;
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
    teamKey: string;
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
