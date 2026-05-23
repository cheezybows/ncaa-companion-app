import { NCAA_TEAM_CATALOG } from '@ncaa/domain';
import type {
  CaptureImportWarning,
  CaptureOcrPageResult,
  ExtractedScheduleTableRow,
  ScheduleCaptureExpected,
} from './types.js';
import { ocrTextToLines } from './ocr-text.js';
import { mergeRecordsByKey, preferHigherConfidenceOrLater } from './ocr-merge.js';
import { resolveTeamKeyFromName } from './team-resolver.js';

const SCHEDULE_TEAM_ALIASES = new Map<string, { teamName: string; teamKey: string }>([
  ['lowastate', { teamName: 'Iowa State', teamKey: 'iowa-state' }],
  ['minos', { teamName: 'Illinois', teamKey: 'illinois' }],
]);

function parseSite(token: string | undefined): ExtractedScheduleTableRow['site'] {
  const upper = (token ?? '').toUpperCase();
  if (upper === 'HOME' || upper === 'H') return 'home';
  if (upper === 'AWAY' || upper === 'A' || upper === '@' || upper === 'AT') return 'away';
  if (upper === 'NEUTRAL' || upper === 'N') return 'neutral';
  if (upper === 'VS') return 'home';
  if (upper === 'BYE') return 'bye';
  return 'home';
}

function normalizedLookup(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function resolveScheduleOpponent(rawOpponent: string): { teamName: string; teamKey: string } | undefined {
  const normalized = normalizedLookup(rawOpponent);
  for (const [alias, team] of SCHEDULE_TEAM_ALIASES) {
    if (normalized.includes(alias)) return team;
  }

  let best: { teamName: string; teamKey: string; matchLength: number } | undefined;
  for (const team of NCAA_TEAM_CATALOG) {
    const teamName = normalizedLookup(team.name);
    const abbreviation = normalizedLookup(team.abbreviation);
    const matched = normalized.includes(teamName) ? teamName : normalized.includes(abbreviation) ? abbreviation : undefined;
    if (!matched) continue;
    if (!best || matched.length > best.matchLength) {
      best = {
        teamName: team.name,
        teamKey: team.id.replace(/^team-/, ''),
        matchLength: matched.length,
      };
    }
  }

  if (best) return best;
  const fallbackKey = resolveTeamKeyFromName(cleanOpponentName(rawOpponent));
  return fallbackKey ? { teamName: cleanOpponentName(rawOpponent), teamKey: fallbackKey } : undefined;
}

function cleanOpponentName(rawOpponent: string): string {
  return rawOpponent
    .replace(/^[^A-Za-z]+/, '')
    .replace(/^(?:[A-Z]{1,3}|\d{1,2})\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeScheduleResult(rawResult: string | undefined): string | undefined {
  if (!rawResult) return undefined;
  const compact = rawResult.replace(/\s+/g, '').replace(/[–—:]/g, '-');
  const leading = compact.replace(/^[1Il](?=\d)/, 'L').toUpperCase();

  const standard = leading.match(/^([WL])(\d{1,2})-(\d{1,2})$/);
  if (standard) return `${standard[1]} ${Number(standard[2])}-${Number(standard[3])}`;

  const digits = leading.match(/^([WL])(\d{3,4})$/);
  if (digits) {
    const score = digits[2]!;
    const splitAt = score.length === 3 ? 2 : 2;
    return `${digits[1]} ${Number(score.slice(0, splitAt))}-${Number(score.slice(splitAt))}`;
  }

  const time = rawResult.match(/\d{1,2}:\d{2}\s*(?:AM|PM)?/i);
  return time ? time[0].replace(/\s+/g, ' ').trim() : rawResult.trim();
}

function stripIgnoredScheduleSections(text: string): string {
  const firstIgnored = text.search(/\b(?:Conf\s+Champ|Bowl\s+\d+)\b/i);
  return firstIgnored === -1 ? text : text.slice(0, firstIgnored);
}

function tokenizeScheduleText(text: string): string[] {
  return stripIgnoredScheduleSections(text)
    .replace(/\[\[OCR_REGION:[^\]]+\]\]/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/[“”"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function isResultToken(token: string): boolean {
  return /^[WL1Il]\s*\d{1,2}[-:]\d{1,2}$/i.test(token) || /^[WL1Il]\d{3,4}$/i.test(token);
}

function isTimeToken(token: string): boolean {
  return /^\d{1,2}:\d{2}$/i.test(token);
}

function isSplitResultStart(tokens: string[], index: number): boolean {
  return /^[WL1Il]$/i.test(tokens[index] ?? '') && /^\d{1,2}[-:]\d{1,2}$/.test(tokens[index + 1] ?? '');
}

function resultTextAt(tokens: string[], index: number): { text: string; endIndex: number } {
  if (isSplitResultStart(tokens, index)) {
    return { text: `${tokens[index]}${tokens[index + 1]}`, endIndex: index + 1 };
  }
  if (isTimeToken(tokens[index] ?? '') && /^(AM|PM)$/i.test(tokens[index + 1] ?? '')) {
    return { text: `${tokens[index]} ${tokens[index + 1]}`, endIndex: index + 1 };
  }
  return { text: tokens[index]!, endIndex: index };
}

function parseWeekToken(token: string): number | undefined {
  if (!/^\d{1,2}$/.test(token)) return undefined;
  const week = Number(token);
  return week >= 0 && week <= 14 ? week : undefined;
}

function parseScheduleRowsFromTokenStream(text: string): ExtractedScheduleTableRow[] {
  const tokens = tokenizeScheduleText(text);
  const rows: ExtractedScheduleTableRow[] = [];
  let lastWeek = 0;
  let index = 0;

  const pushByeRowsBefore = (endIndex: number) => {
    for (let candidateIndex = index; candidateIndex < endIndex; candidateIndex += 1) {
      const week = parseWeekToken(tokens[candidateIndex]!);
      if (week == null || !/^BYE$/i.test(tokens[candidateIndex + 1] ?? '')) continue;
      if (!rows.some((row) => row.week === week)) {
        rows.push({ week, site: 'bye' });
      }
      lastWeek = Math.max(lastWeek, week);
    }
  };

  while (index < tokens.length) {
    const week = parseWeekToken(tokens[index]!);
    if (week != null && /^BYE$/i.test(tokens[index + 1] ?? '')) {
      rows.push({ week, site: 'bye' });
      lastWeek = week;
      index += 2;
      continue;
    }

    const dayIndex = tokens.findIndex((token, candidateIndex) => candidateIndex >= index && /^Sat,?$/i.test(token));
    if (dayIndex === -1 || dayIndex + 4 >= tokens.length) break;
    pushByeRowsBefore(dayIndex);

    const rawWeek = dayIndex > 0 ? parseWeekToken(tokens[dayIndex - 1]!) : undefined;
    let inferredWeek = rawWeek;
    if (inferredWeek == null || (lastWeek > 0 && inferredWeek <= lastWeek)) {
      inferredWeek = lastWeek + 1;
    }
    if (inferredWeek > 14) break;

    const month = tokens[dayIndex + 1];
    const day = tokens[dayIndex + 2];
    const siteIndex = tokens.findIndex(
      (token, candidateIndex) => candidateIndex >= dayIndex + 3 && candidateIndex <= dayIndex + 7 && /^(vs|at|@)$/i.test(token)
    );
    if (siteIndex === -1) {
      index = dayIndex + 1;
      continue;
    }

    const resultIndex = tokens.findIndex(
      (token, candidateIndex) =>
        candidateIndex > siteIndex &&
        candidateIndex <= siteIndex + 10 &&
        (isResultToken(token) || isSplitResultStart(tokens, candidateIndex) || isTimeToken(token))
    );
    if (resultIndex === -1) {
      index = siteIndex + 1;
      continue;
    }

    const result = resultTextAt(tokens, resultIndex);
    const rawOpponent = tokens.slice(siteIndex + 1, resultIndex).join(' ');
    const opponent = resolveScheduleOpponent(rawOpponent);
    const opponentName = opponent?.teamName ?? cleanOpponentName(rawOpponent);
    rows.push({
      week: inferredWeek,
      date: `${month} ${day}`.replace(/,$/, ''),
      site: parseSite(tokens[siteIndex]),
      opponentName,
      opponentTeamKey: opponent?.teamKey ?? resolveTeamKeyFromName(opponentName),
      timeOrResult: normalizeScheduleResult(result.text),
    });
    lastWeek = inferredWeek;
    index = result.endIndex + 1;
  }

  return rows;
}

function parseScheduleLine(line: string): ExtractedScheduleTableRow | undefined {
  const cleaned = line.replace(/\s+/g, ' ').trim();
  if (/^week\b/i.test(cleaned) || /^date\b/i.test(cleaned)) return undefined;

  const byeMatch = cleaned.match(/^(\d{1,2})\b.*\bBYE\b/i);
  if (byeMatch) {
    return { week: Number(byeMatch[1]), site: 'bye' };
  }

  const weekSiteMatch = cleaned.match(
    /^(\d{1,2})\s+(HOME|AWAY|H|A|@|NEUTRAL|N)\s+(.+?)(?:\s+([WL]\s*\d+\s*-\s*\d+|\d{1,2}:\d{2}\s*(?:AM|PM)?|TBD))?$/i
  );
  if (weekSiteMatch) {
    const opponent = weekSiteMatch[3].trim();
    const opponentTeamKey = resolveTeamKeyFromName(opponent);
    return {
      week: Number(weekSiteMatch[1]),
      site: parseSite(weekSiteMatch[2]),
      opponentName: opponent,
      opponentTeamKey,
      timeOrResult: weekSiteMatch[4]?.trim(),
    };
  }

  const simpleMatch = cleaned.match(/^(\d{1,2})\s+(.+?)(?:\s+([WL]\s*\d+\s*-\s*\d+))?$/i);
  if (!simpleMatch) return undefined;

  const opponent = simpleMatch[2].replace(/^(HOME|AWAY|@)\s+/i, '').trim();
  const siteToken = simpleMatch[2].match(/^(HOME|AWAY|@)/i)?.[0];
  return {
    week: Number(simpleMatch[1]),
    site: parseSite(siteToken),
    opponentName: opponent,
    opponentTeamKey: resolveTeamKeyFromName(opponent),
    timeOrResult: simpleMatch[3]?.trim(),
  };
}

export function parseScheduleRowsFromOcrText(text: string): ExtractedScheduleTableRow[] {
  const tokenRows = parseScheduleRowsFromTokenStream(text);
  if (tokenRows.length > 0) return tokenRows;

  const rows: ExtractedScheduleTableRow[] = [];
  for (const line of ocrTextToLines(text)) {
    const row = parseScheduleLine(line);
    if (row && row.week >= 0 && row.week <= 14) {
      rows.push(row);
    }
  }
  return rows;
}

export function mergeScheduleRows(
  batches: ExtractedScheduleTableRow[][]
): { rows: ExtractedScheduleTableRow[]; warnings: CaptureImportWarning[] } {
  const flat = batches.flat();
  const { merged, warnings } = mergeRecordsByKey(
    flat,
    (row) => String(row.week),
    preferHigherConfidenceOrLater
  );
  return {
    rows: merged.sort((a, b) => a.week - b.week),
    warnings,
  };
}

export function buildScheduleCaptureExpectedFromOcr(
  pages: CaptureOcrPageResult[],
  options: { seasonYear: number; teamKey: string; teamName: string }
): { expected: ScheduleCaptureExpected; warnings: CaptureImportWarning[] } {
  const batches = pages.map((page) => parseScheduleRowsFromOcrText(page.text));
  const { rows, warnings } = mergeScheduleRows(batches);

  if (rows.length === 0) {
    warnings.push({
      code: 'no_rows',
      message: 'No schedule rows were detected in the uploaded screenshots.',
    });
  }

  return {
    expected: {
      fixtureId: `ocr-schedule-${options.teamKey}-${options.seasonYear}`,
      screenKind: 'team_schedule',
      partial: rows.length < 12,
      teamContext: {
        teamKey: options.teamKey,
        name: options.teamName,
        seasonYear: options.seasonYear,
      },
      table: { rows },
    },
    warnings,
  };
}
