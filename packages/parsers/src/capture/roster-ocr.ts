import type {
  CaptureImportWarning,
  CaptureOcrPageResult,
  ExtractedRosterDetailPanel,
  ExtractedRosterTableRow,
  RosterCaptureExpected,
} from './types.js';
import { ocrTextToLines, parseClassYear } from './ocr-text.js';
import { mergeRecordsByKey, type MergeFieldConflict } from './ocr-merge.js';

function preferMergedRosterRow(
  previous: ExtractedRosterTableRow,
  next: ExtractedRosterTableRow,
  _conflicts: MergeFieldConflict[]
): ExtractedRosterTableRow {
  const ratings = { ...previous.ratings };
  for (const [key, value] of Object.entries(next.ratings)) {
    if (value == null) continue;
    ratings[key] = value;
  }
  return {
    ...previous,
    ...next,
    displayName: next.displayName || previous.displayName,
    ratings,
  };
}

const ROSTER_LINE =
  /^([A-Z][A-Za-z0-9.'\s-]+?)\s+(RS_(?:FR|SO|JR|SR)|FR|SO|JR|SR)\s+([A-Z]{1,4})\s+(\d{2,3})\b/;

const RATING_CODES = [
  'SPD',
  'ACC',
  'AGI',
  'COD',
  'STR',
  'AWR',
  'THP',
  'SAC',
  'MCV',
  'PRC',
  'TAK',
  'CTH',
  'CIT',
  'CAR',
  'BCV',
  'PBK',
  'PBP',
  'PMV',
  'KPW',
  'KAC',
  'POW',
  'PUR',
] as const;

const RATING_KEY_BY_CODE: Record<string, string> = {
  OVR: 'overall',
  SPD: 'speed',
  ACC: 'acceleration',
  AGI: 'agility',
  COD: 'changeOfDirection',
  STR: 'strength',
  AWR: 'awareness',
  THP: 'throwPower',
  SAC: 'shortAccuracy',
  MCV: 'manCoverage',
  PRC: 'playRecognition',
  TAK: 'tackle',
  CTH: 'catching',
  CIT: 'catchInTraffic',
  CAR: 'carry',
  BCV: 'ballCarrierVision',
  PBK: 'passBlock',
  PBP: 'passBlockPower',
  PMV: 'powerMoves',
  KPW: 'kickPower',
  KAC: 'kickAccuracy',
  POW: 'hitPower',
  PUR: 'pursuit',
};

const KNOWN_ROSTER_POSITIONS = new Set([
  'QB',
  'HB',
  'RB',
  'FB',
  'WR',
  'TE',
  'LT',
  'LG',
  'C',
  'RG',
  'RT',
  'WILL',
  'MIKE',
  'SAM',
  'SS',
  'FS',
  'CB',
  'REDG',
  'LEDG',
  'DT',
  'K',
  'P',
]);

function normalizeRosterPosition(token: string, fallbackPosition?: string): string | undefined {
  const normalized = token.toUpperCase();
  if (KNOWN_ROSTER_POSITIONS.has(normalized)) return normalized;
  if (normalized === 'EOS') return 'LEDG';
  if (normalized === 'S' && fallbackPosition === 'SS') return 'SS';
  return undefined;
}

function normalizeRosterToken(token: string): string {
  return token.replace(/[^A-Za-z0-9()'.+-]/g, '').trim();
}

function normalizeRatingCode(token: string): string | undefined {
  const normalized = token.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (normalized === 'YOVR' || normalized === 'ML') return 'OVR';
  if (normalized === 'COP' || normalized === 'COB') return 'COD';
  if (normalized === 'PKW') return 'KPW';
  if (normalized === 'KAG') return 'KAC';
  return RATING_KEY_BY_CODE[normalized] ? normalized : undefined;
}

function parseRatingToken(token: string, code?: string): number | undefined {
  const cleaned = token.replace(/[^\dA-Za-z]/g, '');
  if (code === 'POW' && /^[A-Z]+$/i.test(cleaned)) return undefined;
  if (/^A(?:L|I|1)?$/i.test(cleaned)) return 71;
  if (/^B(?:L|I|T|1)?$/i.test(cleaned)) return 81;
  if (/^LX$/i.test(cleaned)) return 63;
  const match = code === 'POW' ? cleaned.match(/\d{1,}/) : cleaned.match(/\d{2,}/);
  if (!match) return undefined;
  let value = Number(match[0]);
  if (value > 100) {
    value = Number(match[0].slice(0, 2));
  }
  if (code === 'OVR' && value < 40 && /^1/.test(match[0])) {
    value += 60;
  }
  if (code === 'POW' && value > 0 && value < 10) {
    value = value * 10 + 1;
  }
  return value >= 0 && value <= 100 ? value : undefined;
}

function normalizeClassToken(token: string): string {
  const normalized = token.toUpperCase();
  if (normalized === '5O' || normalized === '50') return 'SO';
  return normalized;
}

function parseRosterClassTokens(tokens: string[], startIndex: number): { classYear: string; nextIndex: number } | undefined {
  const first = normalizeClassToken(normalizeRosterToken(tokens[startIndex] ?? ''));
  const second = normalizeClassToken(normalizeRosterToken(tokens[startIndex + 1] ?? ''));

  const compact = first.match(/^(FR|SO|JR|SR)\(?RS\)?$/);
  if (compact) {
    return { classYear: `${compact[1]} (RS)`, nextIndex: startIndex + 1 };
  }

  if (/^(FR|SO|JR|SR)$/.test(first)) {
    if (second === '(RS)' || second === '(RS' || second === 'RS') {
      return { classYear: `${first} (RS)`, nextIndex: startIndex + 2 };
    }
    return { classYear: first, nextIndex: startIndex + 1 };
  }

  const parsed = parseClassYear(first);
  return parsed ? { classYear: parsed, nextIndex: startIndex + 1 } : undefined;
}

function tokenizeRosterText(text: string): string[] {
  return text
    .replace(/\[\[OCR_REGION:[^\]]+\]\]/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/[“”"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(normalizeRosterToken)
    .filter(Boolean);
}

function ratingCodesFromTokens(tokens: string[]): string[] {
  const codes: string[] = [];
  for (const token of tokens) {
    if (/^[A-Z]\.[A-Za-z]/.test(token)) break;
    const code = normalizeRatingCode(token);
    if (code && !codes.includes(code)) codes.push(code);
  }

  return codes.includes('OVR') ? codes : ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'THP', 'SAC', 'CTH', 'CIT'];
}

function ratingCodesForPosition(position: string, detectedCodes: string[]): string[] {
  const normalized = position.toUpperCase();
  const codesByPosition: Record<string, string[]> = {
    QB: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'THP', 'SAC'],
    HB: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'CAR', 'BCV'],
    RB: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'CAR', 'BCV'],
    FB: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'CAR', 'PBK'],
    WR: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'CTH', 'CIT'],
    TE: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'CTH', 'CIT'],
    LT: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'PBK', 'PBP'],
    LG: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'PBK', 'PBP'],
    C: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'PBK', 'PBP'],
    RG: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'PBK', 'PBP'],
    RT: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'PBK', 'PBP'],
    WILL: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'PRC', 'TAK'],
    MIKE: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'PRC', 'TAK'],
    SAM: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'PRC', 'TAK'],
    SS: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'PRC', 'MCV'],
    FS: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'PRC', 'MCV'],
    CB: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'PRC', 'MCV'],
    REDG: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'PRC', 'PMV'],
    LEDG: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'PRC', 'PMV'],
    DT: ['OVR', 'SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'PRC', 'PMV'],
    K: ['OVR', 'AWR', 'KPW', 'KAC', 'SPD', 'TAK', 'POW', 'ACC', 'PUR'],
    P: ['OVR', 'KPW', 'KAC', 'SPD', 'TAK', 'AWR', 'POW', 'ACC', 'PUR'],
  };

  return codesByPosition[normalized] ?? detectedCodes;
}

function parseRosterNameTokens(tokens: string[], startIndex: number): { displayName: string; nextIndex: number } | undefined {
  const first = tokens[startIndex];
  if (!first) return undefined;

  if (/^[A-Z]\.[A-Za-z][A-Za-z.'-]*$/.test(first)) {
    return { displayName: first, nextIndex: startIndex + 1 };
  }

  const second = tokens[startIndex + 1];
  if (/^[A-Z]\.$/.test(first) && second && /^[A-Za-z][A-Za-z.'-]*$/.test(second)) {
    return { displayName: `${first}${second}`, nextIndex: startIndex + 2 };
  }

  return undefined;
}

function splitOcrRegionTexts(text: string): Array<{ region: string; text: string }> {
  if (!text.includes('[[OCR_REGION:')) {
    return [{ region: 'full', text }];
  }

  const chunks: Array<{ region: string; text: string }> = [];
  for (const segment of text.split(/\[\[OCR_REGION:/)) {
    if (!segment.trim()) continue;
    const close = segment.indexOf(']]');
    if (close === -1) {
      chunks.push({ region: 'full', text: segment.trim() });
      continue;
    }
    const region = segment.slice(0, close);
    const body = segment.slice(close + 2).trim();
    if (body) chunks.push({ region, text: body });
  }
  return chunks;
}

function isSelectedRosterRegion(region: string): boolean {
  return region.includes('selected');
}

function isRosterPlayerCardRegion(region: string): boolean {
  return region.includes('player_card');
}

function parseRosterDetailPanelFromOcrText(
  text: string,
  fallbackPosition: string
): ExtractedRosterDetailPanel | undefined {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;

  const beforePosition = normalized.split(/\bPOSITION\b/i)[0] ?? '';
  const nameWords = (beforePosition.match(/\b[A-Z][A-Z.'-]{1,}\b/g) ?? []).filter(
    (word) => !['OVR', 'OFF', 'DEF', 'POS', 'RS'].includes(word)
  );
  const firstName = nameWords.at(-2);
  const lastName = nameWords.at(-1);
  if (!firstName || !lastName) return undefined;

  const positionMatch = normalized.match(
    /\b(QB|HB|RB|FB|WR|TE|LT|LG|C|RG|RT|WILL|MIKE|SAM|SS|FS|CB|REDG|LEDG|DT|K|P)\b\s*[•»#.\-\s]*#?(\d{1,2})?/
  );
  const classMatch = normalized.match(/\b(FR|SO|JR|SR)\s*\(?\s*RS\s*\)?|\b(FR|SO|JR|SR)\b/);
  const overallMatch = normalized.match(/\b(\d{2,3})\s*[O0]VR\b/i);
  const classYear = classMatch?.[1]
    ? `${classMatch[1]} (RS)`
    : classMatch?.[2];

  return {
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`,
    position: positionMatch?.[1] ?? fallbackPosition,
    jerseyNumber: positionMatch?.[2] ? Number(positionMatch[2]) : undefined,
    classYear,
    ratings: overallMatch ? { overall: Number(overallMatch[1]) } : {},
  };
}

function parseFocusedRosterRowFromOcrText(
  text: string,
  detailPanel: ExtractedRosterDetailPanel,
  fallbackPosition: string
): ExtractedRosterTableRow | undefined {
  const tokens = tokenizeRosterText(text);
  const position = detailPanel.position || fallbackPosition;
  const ratingCodes = ratingCodesForPosition(position, ratingCodesFromTokens(tokens));

  for (let index = 0; index < tokens.length; index += 1) {
    const parsedClass = parseRosterClassTokens(tokens, index);
    if (!parsedClass) continue;

    const rawPosition = normalizeRosterToken(tokens[parsedClass.nextIndex] ?? '').toUpperCase();
    const ratingsStartIndex =
      parseRatingToken(rawPosition, 'OVR') == null
        ? parsedClass.nextIndex + 1
        : parsedClass.nextIndex;

    const ratings: Record<string, number | undefined> = { ...detailPanel.ratings };
    for (const [ratingOffset, code] of ratingCodes.entries()) {
      const value = parseRatingToken(tokens[ratingsStartIndex + ratingOffset] ?? '', code);
      const key = RATING_KEY_BY_CODE[code];
      if (key && value != null) ratings[key] = value;
    }

    if (Object.keys(ratings).length === 0) continue;
    return {
      index: 0,
      displayName: `${detailPanel.firstName[0]}.${detailPanel.lastName}`,
      classYear: detailPanel.classYear ?? parsedClass.classYear,
      position,
      focused: true,
      ratings,
    };
  }

  return undefined;
}

function parseRosterRowsFromTokenStream(text: string, defaultPosition: string): ExtractedRosterTableRow[] {
  const tokens = tokenizeRosterText(text);
  const detectedRatingCodes = ratingCodesFromTokens(tokens);
  const rows: ExtractedRosterTableRow[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const parsedName = parseRosterNameTokens(tokens, index);
    if (!parsedName) continue;

    const parsedClass = parseRosterClassTokens(tokens, parsedName.nextIndex);
    if (!parsedClass) continue;

    const rawPosition = normalizeRosterToken(tokens[parsedClass.nextIndex] ?? '').toUpperCase();
    const normalizedPosition = normalizeRosterPosition(rawPosition, defaultPosition);
    const position = normalizedPosition ?? defaultPosition;
    const ratingCodes = ratingCodesForPosition(position, detectedRatingCodes);
    const ratingsStartIndex =
      normalizedPosition || parseRatingToken(rawPosition) == null
        ? parsedClass.nextIndex + 1
        : parsedClass.nextIndex;
    let rowEndIndex = tokens.length;
    for (let nextIndex = ratingsStartIndex; nextIndex < tokens.length; nextIndex += 1) {
      if (nextIndex > ratingsStartIndex && /^[A-Z]\.[A-Za-z]/.test(tokens[nextIndex]!)) {
        rowEndIndex = nextIndex;
        break;
      }
    }
    const ratingTokens = tokens.slice(ratingsStartIndex, rowEndIndex);

    const ratings: Record<string, number | undefined> = {};
    for (const [ratingOffset, code] of ratingCodes.entries()) {
      const ratingToken = ratingTokens[ratingOffset];
      if (!ratingToken || /^[A-Z]\.[A-Za-z]/.test(ratingToken)) break;
      const value = parseRatingToken(ratingToken, code);
      const key = RATING_KEY_BY_CODE[code];
      if (key && value != null) ratings[key] = value;
    }

    for (let ratingIndex = 0; ratingIndex < ratingTokens.length - 1; ratingIndex += 1) {
      const code = normalizeRatingCode(ratingTokens[ratingIndex]!);
      if (!code) continue;
      const key = RATING_KEY_BY_CODE[code];
      const value = parseRatingToken(ratingTokens[ratingIndex + 1]!, code);
      if (key && value != null) ratings[key] = value;
    }

    if (ratings.overall == null) continue;
    rows.push({
      index: rows.length,
      displayName: parsedName.displayName,
      classYear: parsedClass.classYear,
      position: position || defaultPosition,
      ratings,
    });
  }

  return rows;
}

function parseRosterLine(line: string, defaultPosition: string): ExtractedRosterTableRow | undefined {
  const cleaned = line.replace(/\s+/g, ' ').trim();
  if (/^name\b/i.test(cleaned) || /^year\b/i.test(cleaned) || /^pos\b/i.test(cleaned)) {
    return undefined;
  }

  const match = cleaned.match(ROSTER_LINE);
  if (!match) return undefined;

  const classYear = parseClassYear(match[2]);
  const position = normalizeRosterPosition(match[3].toUpperCase(), defaultPosition) ?? defaultPosition;
  const overall = Number(match[4]);
  const ratings: Record<string, number | undefined> = { overall };

  const tail = cleaned.slice(match[0].length);
  for (const code of RATING_CODES) {
    const ratingMatch = tail.match(new RegExp(`\\b${code}\\b\\s*(\\d{2,4})`));
    if (ratingMatch) {
      const key = RATING_KEY_BY_CODE[code];
      if (key) ratings[key] = Number(ratingMatch[1]);
    }
  }

  return {
    index: 0,
    displayName: match[1].trim(),
    classYear,
    position: position || defaultPosition,
    ratings,
  };
}

export function parseRosterRowsFromOcrText(text: string, defaultPosition = 'ATH'): ExtractedRosterTableRow[] {
  const tokenRows = parseRosterRowsFromTokenStream(text, defaultPosition);
  if (tokenRows.length > 0) return tokenRows;

  const rows: ExtractedRosterTableRow[] = [];
  for (const line of ocrTextToLines(text)) {
    const row = parseRosterLine(line, defaultPosition);
    if (row) rows.push(row);
  }
  return rows.map((row, index) => ({ ...row, index }));
}

function rosterRowKey(row: ExtractedRosterTableRow): string {
  return `${row.position}:${row.displayName}`.toLowerCase();
}

function displayNameParts(displayName: string): { initial: string; lastName: string } | undefined {
  const match = displayName.match(/^([A-Z])\.\s*([A-Za-z][A-Za-z.'-]*)$/i);
  if (!match) return undefined;
  return {
    initial: match[1]!.toLowerCase(),
    lastName: match[2]!.toLowerCase(),
  };
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let aIndex = 0; aIndex < a.length; aIndex += 1) {
    const current = [aIndex + 1];
    for (let bIndex = 0; bIndex < b.length; bIndex += 1) {
      current[bIndex + 1] =
        a[aIndex] === b[bIndex]
          ? previous[bIndex]!
          : Math.min(previous[bIndex]!, previous[bIndex + 1]!, current[bIndex]!) + 1;
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length] ?? 0;
}

function isLikelySameOcrRosterRow(
  previous: ExtractedRosterTableRow,
  next: ExtractedRosterTableRow
): boolean {
  if (previous.position !== next.position) return false;
  if (previous.classYear && next.classYear && previous.classYear !== next.classYear) return false;
  if (previous.ratings.overall !== next.ratings.overall) return false;

  const previousName = displayNameParts(previous.displayName);
  const nextName = displayNameParts(next.displayName);
  if (!previousName || !nextName || previousName.initial !== nextName.initial) return false;

  return editDistance(previousName.lastName, nextName.lastName) <= 2;
}

function dedupeLikelyOcrDuplicates(rows: ExtractedRosterTableRow[]): ExtractedRosterTableRow[] {
  const deduped: ExtractedRosterTableRow[] = [];
  for (const row of rows) {
    const existingIndex = deduped.findIndex((existing) => isLikelySameOcrRosterRow(existing, row));
    if (existingIndex === -1) {
      deduped.push(row);
      continue;
    }

    const existing = deduped[existingIndex]!;
    deduped[existingIndex] = {
      ...preferMergedRosterRow(existing, row, []),
      displayName: existing.displayName,
    };
  }
  return deduped.filter((row) => {
    if (row.position !== 'ATH') return true;
    return !deduped.some((candidate) => candidate !== row && candidate.position !== 'ATH' && candidate.displayName === row.displayName);
  });
}

export function mergeRosterRows(
  batches: ExtractedRosterTableRow[][]
): { rows: ExtractedRosterTableRow[]; warnings: CaptureImportWarning[] } {
  const flat = batches.flat();
  const { merged, warnings } = mergeRecordsByKey(flat, rosterRowKey, preferMergedRosterRow);
  return {
    rows: dedupeLikelyOcrDuplicates(merged).map((row, index) => ({ ...row, index })),
    warnings,
  };
}

export function buildRosterCaptureExpectedFromOcr(
  pages: CaptureOcrPageResult[],
  options: {
    teamKey: string;
    teamName: string;
    selectedPosition: string;
    seasonYear?: number;
  }
): { expected: RosterCaptureExpected; warnings: CaptureImportWarning[] } {
  const batches: ExtractedRosterTableRow[][] = [];
  let detailPanel: ExtractedRosterDetailPanel | undefined;
  const selectedRegionTexts: string[] = [];
  for (const page of pages) {
    for (const { region, text: regionText } of splitOcrRegionTexts(page.text)) {
      if (isRosterPlayerCardRegion(region)) {
        detailPanel = parseRosterDetailPanelFromOcrText(regionText, options.selectedPosition) ?? detailPanel;
        continue;
      }
      if (isSelectedRosterRegion(region)) {
        selectedRegionTexts.push(regionText);
      }
      const rows = parseRosterRowsFromOcrText(regionText, options.selectedPosition).map((row) =>
        isSelectedRosterRegion(region) ? { ...row, focused: true } : row
      );
      if (rows.length > 0) batches.push(rows);
    }
  }
  const merged = mergeRosterRows(batches);
  const warnings = merged.warnings;
  const rows = [...merged.rows];
  if (
    detailPanel?.firstName &&
    detailPanel.lastName &&
    !rows.some((row) => row.focused) &&
    !rows.some((row) => row.displayName.toLowerCase().endsWith(detailPanel.lastName.toLowerCase()))
  ) {
    const focusedFromSelectedRegion = selectedRegionTexts
      .map((regionText) => parseFocusedRosterRowFromOcrText(regionText, detailPanel, options.selectedPosition))
      .find((row) => row);
    rows.unshift(
      focusedFromSelectedRegion ?? {
        index: 0,
        displayName: `${detailPanel.firstName[0]}.${detailPanel.lastName}`,
        classYear: detailPanel.classYear,
        position: detailPanel.position || options.selectedPosition,
        focused: true,
        ratings: detailPanel.ratings,
      }
    );
  }

  if (rows.length === 0) {
    warnings.push({
      code: 'no_rows',
      message: 'No roster rows were detected in the uploaded screenshots.',
    });
  }

  const focusedIdx = rows.findIndex((row) => row.focused);
  const focusedRowIndex = focusedIdx >= 0 ? focusedIdx : 0;

  return {
    expected: {
      fixtureId: `ocr-roster-${options.teamKey}-${options.selectedPosition}`,
      screenKind: 'roster_by_position',
      partial: true,
      teamContext: {
        teamKey: options.teamKey,
        name: options.teamName,
        selectedPosition: options.selectedPosition,
      },
      table: {
        focusedRowIndex: focusedRowIndex >= 0 ? focusedRowIndex : 0,
        rows: rows.map((row, index) => ({ ...row, index })),
      },
      detailPanel: {
        firstName: '',
        lastName: '',
        displayName: '',
        position: options.selectedPosition,
        ratings: {},
        ...detailPanel,
      },
    },
    warnings,
  };
}
