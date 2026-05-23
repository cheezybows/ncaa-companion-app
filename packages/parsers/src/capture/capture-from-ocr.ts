import type { Team } from '@ncaa/domain';
import type { CaptureImportWarning, CaptureOcrPageResult, RosterCaptureExpected } from './types.js';
import { buildRosterCaptureExpectedFromOcr } from './roster-ocr.js';
import { buildScheduleCaptureExpectedFromOcr } from './schedule-ocr.js';
import { buildTop25CaptureExpectedFromOcr } from './top25-ocr.js';
import { rosterCaptureFixtureToImport, type RosterCaptureImport } from './roster-mapper.js';
import { scheduleCaptureFixtureToImport, type ScheduleCaptureImport } from './schedule-mapper.js';
import { top25CaptureFixtureToImport, type Top25CaptureImport } from './top25-mapper.js';
import { teamKeyFromId } from './team-resolver.js';

export interface CaptureImportWithWarnings<T> {
  import: T;
  warnings: CaptureImportWarning[];
}

function emptyFixturePaths() {
  return { imagePath: '', imagePresent: false };
}

export function importTop25FromOcrPages(
  pages: CaptureOcrPageResult[],
  options: { dynastyId: string; seasonYear: number }
): CaptureImportWithWarnings<Top25CaptureImport> {
  const { expected, warnings } = buildTop25CaptureExpectedFromOcr(pages, options.seasonYear);
  const captureImport = top25CaptureFixtureToImport(
    {
      meta: {
        fixtureId: expected.fixtureId,
        screenKind: 'top25_rankings',
        game: 'College Football 26',
        partial: expected.partial,
        notes: [],
        seasonYear: expected.seasonYear,
        pollType: 'top25',
        table: { visibleRowCount: expected.entries.length, hasMoreRows: expected.partial },
        imageFile: '',
      },
      expected,
      ...emptyFixturePaths(),
    },
    {
      dynastyId: options.dynastyId,
      sourceLabel: 'Top 25 screenshot OCR import',
    }
  );

  return {
    import: { ...captureImport, warnings },
    warnings,
  };
}

export function importScheduleFromOcrPages(
  pages: CaptureOcrPageResult[],
  options: { dynastyId: string; teamId: string; teamName: string; seasonYear: number }
): CaptureImportWithWarnings<ScheduleCaptureImport> {
  const teamKey = teamKeyFromId(options.teamId);
  const { expected, warnings } = buildScheduleCaptureExpectedFromOcr(pages, {
    seasonYear: options.seasonYear,
    teamKey,
    teamName: options.teamName,
  });

  const captureImport = scheduleCaptureFixtureToImport(
    {
      meta: {
        fixtureId: expected.fixtureId,
        screenKind: 'team_schedule',
        game: 'College Football 26',
        partial: expected.partial,
        notes: [],
        teamContext: {
          teamKey,
          name: options.teamName,
        },
        table: {
          visibleRowCount: expected.table.rows.length,
          hasMoreRows: expected.partial,
        },
        imageFile: '',
      },
      expected,
      ...emptyFixturePaths(),
    },
    {
      dynastyId: options.dynastyId,
      teamId: options.teamId,
      teamName: options.teamName,
    }
  );

  return {
    import: { ...captureImport, warnings },
    warnings,
  };
}

export function importRosterFromOcrPages(
  pages: CaptureOcrPageResult[],
  options: {
    dynastyId: string;
    team: Team;
    selectedPosition?: string;
    seasonYear?: number;
  }
): CaptureImportWithWarnings<RosterCaptureImport> {
  const teamKey = teamKeyFromId(options.team.id);
  const selectedPosition = options.selectedPosition ?? 'ATH';
  const pageResults = pages.map((page) =>
    buildRosterCaptureExpectedFromOcr([page], {
      teamKey,
      teamName: options.team.name,
      selectedPosition,
      seasonYear: options.seasonYear,
    })
  );
  const warnings = pageResults.flatMap((result) => result.warnings);
  const [firstPageResult] = pageResults;
  const expected =
    pages.length <= 1 && firstPageResult
      ? firstPageResult.expected
      : mergeRosterPageExpecteds(
          pageResults.map((result) => result.expected),
          teamKey,
          options.team.name,
          selectedPosition
        );

  const captureImport = rosterCaptureFixtureToImport(
    {
      meta: {
        fixtureId: expected.fixtureId,
        screenKind: 'roster_by_position',
        game: 'College Football 26',
        partial: expected.partial,
        notes: [],
        navigation: {
          teamCycle: 'L2',
          positionCycle: 'R2',
          selectedTeam: options.team.name,
          selectedPosition,
        },
        teamContext: { name: options.team.name },
        regions: {},
        table: {
          columns: [],
          visibleRowCount: expected.table.rows.length,
          focusedRowIndex: expected.table.focusedRowIndex,
          hasMoreRows: expected.partial,
          hasHorizontalScroll: false,
        },
        detailPanel: { fields: [] },
        imageFile: '',
      },
      expected,
      ...emptyFixturePaths(),
    },
    { team: options.team }
  );

  return {
    import: { ...captureImport, warnings },
    warnings,
  };
}

function mergeRosterPageExpecteds(
  expecteds: RosterCaptureExpected[],
  teamKey: string,
  teamName: string,
  selectedPosition: string
): RosterCaptureExpected {
  const rowsByKey = new Map<string, RosterCaptureExpected['table']['rows'][number]>();
  for (const expected of expecteds) {
    for (const row of expected.table.rows) {
      rowsByKey.set(`${row.position}:${row.displayName}`.toLowerCase(), row);
    }
  }
  const rows = [...rowsByKey.values()].map((row, index) => ({ ...row, index }));
  const focusedRowIndex = Math.max(0, rows.findIndex((row) => row.focused));

  return {
    fixtureId: `ocr-roster-${teamKey}-${selectedPosition}`,
    screenKind: 'roster_by_position',
    partial: expecteds.some((expected) => expected.partial),
    teamContext: {
      teamKey,
      name: teamName,
      selectedPosition,
    },
    table: {
      focusedRowIndex,
      rows,
    },
    detailPanel: {
      firstName: '',
      lastName: '',
      displayName: '',
      position: selectedPosition,
      ratings: {},
    },
  };
}
