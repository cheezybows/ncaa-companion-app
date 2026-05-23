import { NCAA_TEAM_CATALOG } from '@ncaa/domain';
import type { CaptureImportWarning, CaptureOcrPageResult, ExtractedRankingEntry, Top25CaptureExpected } from './types.js';
import { ocrTextToLines, parseRecord } from './ocr-text.js';
import { mergeRecordsByKey, type MergeFieldConflict } from './ocr-merge.js';
import { resolveTeamKeyFromName } from './team-resolver.js';

const TOP25_LINE =
  /^(\d{1,2})\s+(?:(\d{1,2})\s+)?(.+?)\s+(\d{1,2})\s*-\s*(\d{1,2})(?:\s+(.+))?$/i;

function parseTop25Line(line: string): ExtractedRankingEntry | undefined {
  const cleaned = line.replace(/[▲▼►◄↑↓]/g, ' ').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(TOP25_LINE);
  if (!match) return undefined;

  const rank = Number(match[1]);
  const previousRank = match[2] ? Number(match[2]) : undefined;
  const teamName = match[3].trim();
  const wins = Number(match[4]);
  const losses = Number(match[5]);
  if (!isValidRecord(wins, losses)) return undefined;
  const tail = match[6]?.trim();
  const teamKey = resolveTeamKeyFromName(teamName) ?? teamName.toLowerCase().replace(/\s+/g, '-');

  let movement: ExtractedRankingEntry['movement'];
  if (previousRank != null) {
    if (rank < previousRank) movement = 'up';
    else if (rank > previousRank) movement = 'down';
    else movement = 'same';
  }

  const entry: ExtractedRankingEntry = {
    rank,
    previousRank,
    teamKey,
    teamName,
    wins,
    losses,
    movement,
  };

  if (tail) {
    if (/^[WL]\s/i.test(tail) || /\d+-\d+/.test(tail)) {
      entry.lastWeekResult = tail;
    } else {
      entry.thisWeekOpponent = tail;
    }
  }

  return entry;
}

function parseTop25LineFallback(line: string): ExtractedRankingEntry | undefined {
  const rankMatch = line.match(/^(\d{1,2})\b/);
  const record = parseRecord(line);
  if (!rankMatch || !record) return undefined;
  if (!isValidRecord(record.wins, record.losses)) return undefined;

  const rank = Number(rankMatch[1]);
  const withoutRank = line.slice(rankMatch[0].length).trim();
  const recordIndex = withoutRank.search(/\d{1,2}\s*-\s*\d{1,2}/);
  if (recordIndex < 0) return undefined;

  const teamName = withoutRank.slice(0, recordIndex).replace(/^\d{1,2}\s*/, '').trim();
  if (!teamName) return undefined;

  const teamKey = resolveTeamKeyFromName(teamName) ?? teamName.toLowerCase().replace(/\s+/g, '-');
  return {
    rank,
    teamKey,
    teamName,
    wins: record.wins,
    losses: record.losses,
  };
}

function normalizedTeamLookup(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const OCR_TEAM_ALIASES = new Map<string, { teamName: string; teamKey: string }>([
  ['tenas', { teamName: 'Texas', teamKey: 'texas' }],
  ['appalachianstate', { teamName: 'App State', teamKey: 'app-state' }],
  ['floridainternational', { teamName: 'FIU', teamKey: 'fiu' }],
  ['ohiosute', { teamName: 'Ohio State', teamKey: 'ohio-state' }],
  ['oniosute', { teamName: 'Ohio State', teamKey: 'ohio-state' }],
  ['cemson', { teamName: 'Clemson', teamKey: 'clemson' }],
  ['peanstate', { teamName: 'Penn State', teamKey: 'penn-state' }],
  ['penastate', { teamName: 'Penn State', teamKey: 'penn-state' }],
  ['lowa', { teamName: 'Iowa', teamKey: 'iowa' }],
]);

function editDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, row) =>
    Array.from({ length: b.length + 1 }, (_unused, col) => (row === 0 ? col : col === 0 ? row : 0))
  );

  for (let row = 1; row <= a.length; row += 1) {
    for (let col = 1; col <= b.length; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      matrix[row]![col] = Math.min(
        matrix[row - 1]![col]! + 1,
        matrix[row]![col - 1]! + 1,
        matrix[row - 1]![col - 1]! + cost
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

function resolveOcrTeamName(rawTeamName: string): { teamName: string; teamKey: string } | undefined {
  const cleaned = rawTeamName.replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;

  const directKey = resolveTeamKeyFromName(cleaned);
  if (directKey) {
    const direct = NCAA_TEAM_CATALOG.find((team) => team.id === `team-${directKey}`);
    if (direct) return { teamName: direct.name, teamKey: directKey };
  }

  const normalized = normalizedTeamLookup(cleaned);
  if (normalized.length < 3) return undefined;

  const alias = OCR_TEAM_ALIASES.get(normalized);
  if (alias) return alias;

  let best: { teamName: string; teamKey: string; distance: number } | undefined;
  for (const team of NCAA_TEAM_CATALOG) {
    const teamName = normalizedTeamLookup(team.name);
    const abbreviation = normalizedTeamLookup(team.abbreviation);
    const distance = Math.min(editDistance(normalized, teamName), editDistance(normalized, abbreviation));
    const maxDistance = normalized.length <= 5 ? 1 : 2;
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = {
        teamName: team.name,
        teamKey: team.id.replace(/^team-/, ''),
        distance,
      };
    }
  }

  return best ? { teamName: best.teamName, teamKey: best.teamKey } : undefined;
}

function resolveOcrTeamNameFromText(rawTeamName: string): { teamName: string; teamKey: string } | undefined {
  const normalized = normalizedTeamLookup(rawTeamName);
  let bestAlias: { alias: string; teamName: string; teamKey: string } | undefined;
  for (const [alias, team] of OCR_TEAM_ALIASES) {
    if (!normalized.includes(alias)) continue;
    if (!bestAlias || alias.length > bestAlias.alias.length) {
      bestAlias = { alias, ...team };
    }
  }
  if (bestAlias) return { teamName: bestAlias.teamName, teamKey: bestAlias.teamKey };

  let bestTeam: { normalized: string; teamName: string; teamKey: string } | undefined;
  for (const team of NCAA_TEAM_CATALOG) {
    const teamName = normalizedTeamLookup(team.name);
    const abbreviation = normalizedTeamLookup(team.abbreviation);
    const matched = normalized.includes(teamName) ? teamName : normalized.includes(abbreviation) ? abbreviation : undefined;
    if (!matched) continue;
    if (!bestTeam || matched.length > bestTeam.normalized.length) {
      bestTeam = {
        normalized: matched,
        teamName: team.name,
        teamKey: team.id.replace(/^team-/, ''),
      };
    }
  }

  return bestTeam ? { teamName: bestTeam.teamName, teamKey: bestTeam.teamKey } : resolveOcrTeamName(rawTeamName);
}

function parsePreviousRankToken(token: string): number | undefined {
  if (/^nr$/i.test(token.trim())) return undefined;
  return parseRankToken(token);
}

function parseRankToken(token: string): number | undefined {
  const cleaned = token.replace(/[+|\-–—.,:;]+$/g, '');
  if (/^nr$/i.test(cleaned)) return undefined;
  const match = cleaned.match(/^\D*(\d{1,3})\D*$/);
  if (!match) return undefined;
  if (/^0\d+$/.test(match[1]!)) return undefined;

  let rank = Number(match[1]);
  if (rank >= 1 && rank <= 25) return rank;

  if (rank > 25 && rank < 100) {
    const shortened = Math.floor(rank / 10);
    if (shortened >= 1 && shortened <= 25) return shortened;
  }

  if (rank >= 100 && rank < 200) {
    const shortened = Math.floor(rank / 10);
    if (shortened >= 1 && shortened <= 25) return shortened;
  }

  if (rank >= 200 && rank < 260) {
    const leadingRank = Math.floor(rank / 10);
    if (leadingRank >= 20 && leadingRank <= 25) return leadingRank;
  }

  return undefined;
}

function normalizeMergedOcrRank(rank: number, previousRank?: number): number {
  if (rank >= 20 && previousRank != null && previousRank <= 9) {
    const shortened = Math.floor(rank / 10);
    if (shortened >= 1 && shortened <= 25) return shortened;
  }

  if (previousRank != null && previousRank < 10 && rank >= 10) {
    const merged = Number(`${rank}${String(previousRank)[0]}`);
    if (merged >= 2 && merged <= 25 && merged > rank) return merged;
  }

  if (previousRank == null || previousRank < 10 || rank >= 10) return rank;
  const merged = Number(`${rank}${String(previousRank)[0]}`);
  if (merged >= 2 && merged <= 25 && merged > rank) return merged;
  return rank;
}

function isValidRecord(wins: number, losses: number): boolean {
  return wins >= 0 && wins <= 15 && losses >= 0 && losses <= 15;
}

function parseOcrRecordToken(token: string): { wins: number; losses: number } | undefined {
  const standard = token.match(/^(\d{1,2})\s*[-:.]\s*(\d{1,2})$/);
  if (standard) {
    const wins = Number(standard[1]);
    const losses = Number(standard[2]);
    return isValidRecord(wins, losses) ? { wins, losses } : undefined;
  }

  const colon = token.match(/^(\d{1,2})[:.](\d{1,2})$/);
  if (colon) {
    const wins = Number(colon[1]);
    const losses = Number(colon[2]);
    return isValidRecord(wins, losses) ? { wins, losses } : undefined;
  }

  return parseCompactOcrRecordToken(token);
}

function parseOcrRecordNearIndex(tokens: string[], recordIndex: number): { wins: number; losses: number } | undefined {
  const direct = parseOcrRecordToken(tokens[recordIndex]!);
  if (direct) return direct;

  const merged = `${tokens[recordIndex - 1] ?? ''}${tokens[recordIndex] ?? ''}`.replace(/\D/g, '');
  if (merged.length >= 3) {
    return parseCompactOcrRecordToken(merged);
  }

  return undefined;
}

function parseCompactOcrRecordToken(token: string): { wins: number; losses: number } | undefined {
  const dotted = token.match(/^(\d{1,2})[.:](\d)/);
  if (dotted) {
    const wins = Number(dotted[1]);
    const losses = Number(dotted[2]);
    return isValidRecord(wins, losses) ? { wins, losses } : undefined;
  }

  const leadingRecord = token.match(/^(\d{3})/);
  const digitsOnly = leadingRecord?.[1] ?? token.replace(/[^\d]/g, '');
  if (digitsOnly.length < 2 || digitsOnly.length > 3) return undefined;

  if (digitsOnly.length === 2) {
    const wins = Number(digitsOnly[0]);
    const losses = Number(digitsOnly[1]);
    if (wins < 8 || wins > 9 || losses > 9) return undefined;
    return { wins, losses };
  }

  const wins = Number(digitsOnly.slice(0, -1));
  const losses = Number(digitsOnly.slice(-1));
  if (wins < 1 || wins > 15 || losses > 9) return undefined;
  return { wins, losses };
}

const TEAM_NOISE_TOKENS = new Set([
  'a',
  'ae',
  'af',
  'aggies',
  'arr',
  'aut',
  'e',
  'fa',
  'il',
  'lg',
  'ms',
  'os',
  'v',
]);

function cleanTeamTokens(tokens: string[]): string {
  return tokens
    .map((token) => token.replace(/^@+/, '').replace(/[^a-zA-Z&.'-]/g, ''))
    .filter((token) => {
      const normalized = token.toLowerCase();
      if (!normalized) return false;
      if (TEAM_NOISE_TOKENS.has(normalized)) return false;
      if (/^(rank|lw|name|votes|wl|last|week|this|top|rankings|act|ant|aly|alp|arr|acr|ast|ape|tf|ed|ef|be|me|pan|pean)$/i.test(token)) return false;
      if (/^#?\d+$/.test(token)) return false;
      return true;
    })
    .join(' ')
    .trim();
}

function parseTop25OcrRowLine(line: string, rankOverride?: number): ExtractedRankingEntry | undefined {
  const tokens = line
    .replace(/[|]/g, ' ')
    .replace(/[“”"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length < 3) return undefined;

  const previousRank = parsePreviousRankToken(tokens[1] ?? '');
  const rawRank = rankOverride ?? parseRankToken(tokens[0]!);
  const rank = rawRank ? normalizeMergedOcrRank(rawRank, previousRank) : undefined;
  if (!rank) return undefined;
  const teamStartIndex = previousRank ? 2 : 1;
  const maxRecordIndex = Math.min(tokens.length, teamStartIndex + 8);

  for (let recordIndex = teamStartIndex + 1; recordIndex < maxRecordIndex; recordIndex += 1) {
    const record = parseOcrRecordNearIndex(tokens, recordIndex);
    if (!record) continue;

    const teamText = cleanTeamTokens(tokens.slice(teamStartIndex, recordIndex));
    const resolved = resolveOcrTeamNameFromText(teamText);
    if (!resolved) continue;

    let movement: ExtractedRankingEntry['movement'];
    if (previousRank != null) {
      if (rank < previousRank) movement = 'up';
      else if (rank > previousRank) movement = 'down';
      else movement = 'same';
    }

    return {
      rank,
      previousRank,
      teamKey: resolved.teamKey,
      teamName: resolved.teamName,
      wins: record.wins,
      losses: record.losses,
      movement,
    };
  }

  return undefined;
}

function parseTop25EntriesFromLineSequence(text: string): ExtractedRankingEntry[] {
  const entries: ExtractedRankingEntry[] = [];
  let lastRank = 0;

  for (const line of ocrTextToLines(text)) {
    if (/^rank\b/i.test(line) || /^lw\b/i.test(line)) continue;

    const tokens = line
      .replace(/[|]/g, ' ')
      .replace(/[“”"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) continue;

    const rawRank = parseRankToken(tokens[0]!);
    const previousRank = parsePreviousRankToken(tokens[1] ?? '');
    let inferredRank: number | undefined;
    if (rawRank && lastRank > 0 && rawRank <= lastRank && previousRank != null && previousRank >= 10) {
      inferredRank = lastRank + 1;
    }

    const entry = parseTop25OcrRowLine(line, inferredRank);
    if (!entry) continue;
    if (lastRank > 0 && entry.rank <= lastRank) continue;
    if (lastRank > 0 && entry.rank > lastRank + 4) continue;
    entries.push(entry);
    lastRank = entry.rank;
  }

  return entries;
}

function resolveTeamFromTokenWindow(tokens: string[], start: number, end: number): { teamName: string; teamKey: string } | undefined {
  for (let window = Math.min(4, end - start); window >= 1; window -= 1) {
    for (let offset = end - start - window; offset >= 0; offset -= 1) {
      const candidate = cleanTeamTokens(tokens.slice(start + offset, start + offset + window));
      const resolved = resolveOcrTeamName(candidate);
      if (resolved) return resolved;
    }
  }
  return undefined;
}

function parseTop25EntriesFromTokenStream(text: string): ExtractedRankingEntry[] {
  const tokens = text
    .replace(/[|]/g, ' ')
    .replace(/[“”"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const entries: ExtractedRankingEntry[] = [];
  let lastAcceptedRank = 0;
  const previousRankTokenIndexes = new Set<number>();

  for (let index = 0; index < tokens.length; index += 1) {
    if (previousRankTokenIndexes.has(index)) continue;
    const rawRank = parseRankToken(tokens[index]!);
    if (!rawRank) continue;

    const previousRank = parseRankToken(tokens[index + 1] ?? '');
    const rank = normalizeMergedOcrRank(rawRank, previousRank);
    if (lastAcceptedRank > 0 && (rank <= lastAcceptedRank || rank > lastAcceptedRank + 4)) continue;

    const teamStartIndex = previousRank ? index + 2 : index + 1;
    const maxRecordIndex = Math.min(tokens.length, teamStartIndex + 8);

    for (let recordIndex = teamStartIndex + 1; recordIndex < maxRecordIndex; recordIndex += 1) {
      const record = parseOcrRecordNearIndex(tokens, recordIndex);
      if (!record) continue;

      const resolved = resolveTeamFromTokenWindow(tokens, teamStartIndex, recordIndex);
      if (!resolved) continue;

      let movement: ExtractedRankingEntry['movement'];
      if (previousRank != null) {
        if (rank < previousRank) movement = 'up';
        else if (rank > previousRank) movement = 'down';
        else movement = 'same';
      }

      entries.push({
        rank,
        previousRank,
        teamKey: resolved.teamKey,
        teamName: resolved.teamName,
        wins: record.wins,
        losses: record.losses,
        movement,
      });
      if (previousRank != null) previousRankTokenIndexes.add(index + 1);
      lastAcceptedRank = rank;
      break;
    }
  }

  return entries;
}

function findTokenIndexForTeam(tokens: string[], teamName: string): number {
  const normalizedTeam = normalizedTeamLookup(teamName);
  for (let index = 0; index < tokens.length; index += 1) {
    const single = normalizedTeamLookup(tokens[index]!);
    if (single.includes(normalizedTeam) || single === normalizedTeam) return index;

    const two = normalizedTeamLookup(tokens.slice(index, index + 2).join(' '));
    if (two.includes(normalizedTeam) || two === normalizedTeam) return index;

    const three = normalizedTeamLookup(tokens.slice(index, index + 3).join(' '));
    if (three.includes(normalizedTeam) || three === normalizedTeam) return index;
  }
  return -1;
}

function findRecordNearTokens(tokens: string[], anchorIndex: number): { wins: number; losses: number } | undefined {
  const searchStart = Math.max(0, anchorIndex - 4);
  const searchEnd = Math.min(tokens.length, anchorIndex + 14);
  let best: { wins: number; losses: number } | undefined;

  for (const token of tokens.slice(searchStart, searchEnd)) {
    const record = parseCompactOcrRecordToken(token.replace(/[^\d]/g, '')) ?? parseCompactOcrRecordToken(token);
    if (!record) continue;
    if (!best || record.wins > best.wins || (record.wins === best.wins && record.losses < best.losses)) {
      best = record;
    }
  }

  return best;
}

function recoverHighlightedRankFromCard(
  text: string,
  entries: ExtractedRankingEntry[],
  targetRank: number
): ExtractedRankingEntry | undefined {
  const hasNeighboringRank =
    entries.some((entry) => entry.rank === targetRank - 1) ||
    entries.some((entry) => entry.rank === targetRank + 1) ||
    (targetRank === 1 && entries.some((entry) => entry.rank === 2));
  if (!hasNeighboringRank) return undefined;

  const tokens = text
    .replace(/[|]/g, ' ')
    .replace(/[“”"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (new RegExp(`(^|\\D)${targetRank}(\\D|$)`).test(text)) {
    const resolved = resolveOcrTeamNameFromText(text);
    const record = parseRecord(text);
    if (resolved && record && isValidRecord(record.wins, record.losses)) {
      return {
        rank: targetRank,
        previousRank: targetRank,
        teamKey: resolved.teamKey,
        teamName: resolved.teamName,
        wins: record.wins,
        losses: record.losses,
        movement: 'same',
      };
    }
  }

  let best:
    | {
        teamName: string;
        teamKey: string;
        wins: number;
        losses: number;
      }
    | undefined;

  for (const team of NCAA_TEAM_CATALOG) {
    const teamKey = team.id.replace(/^team-/, '');

    const teamIndex = findTokenIndexForTeam(tokens, team.name);
    if (teamIndex === -1) continue;

    const record = findRecordNearTokens(tokens, teamIndex);
    if (!record) continue;

    if (
      !best ||
      record.wins > best.wins ||
      (record.wins === best.wins && record.losses < best.losses) ||
      (record.wins === best.wins && record.losses === best.losses && team.name.length > best.teamName.length)
    ) {
      best = {
        teamName: team.name,
        teamKey,
        wins: record.wins,
        losses: record.losses,
      };
    }
  }

  if (!best) return undefined;

  const existing = entries.find((entry) => entry.rank === targetRank);
  if (existing?.teamKey === best.teamKey) return undefined;

  return {
    rank: targetRank,
    previousRank: targetRank,
    teamKey: best.teamKey,
    teamName: best.teamName,
    wins: best.wins,
    losses: best.losses,
    movement: 'same',
  };
}

function recoverHighlightedRankOne(text: string, entries: ExtractedRankingEntry[]): ExtractedRankingEntry | undefined {
  return recoverHighlightedRankFromCard(text, entries, 1);
}

function recoverHighlightedRankTwentyFive(text: string, entries: ExtractedRankingEntry[]): ExtractedRankingEntry | undefined {
  return recoverHighlightedRankFromCard(text, entries, 25);
}

function extractOcrRegionText(text: string, region: string): string | undefined {
  const marker = `[[OCR_REGION:${region}]]`;
  const start = text.indexOf(marker);
  if (start === -1) return undefined;

  const contentStart = start + marker.length;
  const nextRegionStart = text.indexOf('[[OCR_REGION:', contentStart);
  return text.slice(contentStart, nextRegionStart === -1 ? undefined : nextRegionStart).trim();
}

function dropFalseLowRanks(entries: ExtractedRankingEntry[]): ExtractedRankingEntry[] {
  const ranks = new Set(entries.map((entry) => entry.rank));
  return entries.filter((entry) => {
    if (entry.rank !== 1) return true;
    if (!ranks.has(11) && entry.previousRank != null && entry.previousRank >= 10) return false;
    if (/[([\]|#@]/.test(entry.teamName)) return false;
    if ((entry.teamKey.match(/-/g)?.length ?? 0) > 2) return false;
    return true;
  });
}

export function parseTop25EntriesFromOcrText(text: string): ExtractedRankingEntry[] {
  const tableText = extractOcrRegionText(text, 'top25_table') ?? text;
  const cardText = extractOcrRegionText(text, 'top25_team_card') ?? text;
  const entries: ExtractedRankingEntry[] = [];
  for (const line of ocrTextToLines(tableText)) {
    if (/^rank\b/i.test(line) || /^lw\b/i.test(line)) continue;
    const entry = parseTop25Line(line) ?? parseTop25OcrRowLine(line) ?? parseTop25LineFallback(line);
    if (entry && entry.rank >= 1 && entry.rank <= 30) {
      entries.push(entry);
    }
  }

  const tokenEntries = parseTop25EntriesFromTokenStream(tableText);
  const sequentialEntries = parseTop25EntriesFromLineSequence(tableText);
  const combined = dropFalseLowRanks([...tokenEntries, ...entries, ...sequentialEntries]);
  const recoveredRankOne = recoverHighlightedRankOne(cardText, combined);
  const recoveredRankTwentyFive = recoverHighlightedRankTwentyFive(cardText, combined);
  const byRank = new Map<number, ExtractedRankingEntry>();
  for (const entry of [
    ...combined,
    ...(recoveredRankOne ? [recoveredRankOne] : []),
    ...(recoveredRankTwentyFive ? [recoveredRankTwentyFive] : []),
  ]) {
    byRank.set(entry.rank, entry);
  }

  return [...byRank.values()].sort((a, b) => a.rank - b.rank);
}

function top25EntryQuality(entry: ExtractedRankingEntry): number {
  let score = 0;
  if (/^[A-Za-z][A-Za-z .&'-]*$/.test(entry.teamName)) score += 10;
  if (/[([\]#@\d]/.test(entry.teamName)) score -= 8;
  if (entry.teamName.length <= 24) score += 2;
  if (entry.wins >= 8) score += 1;
  return score;
}

function preferBetterTop25Entry(
  previous: ExtractedRankingEntry,
  next: ExtractedRankingEntry,
  conflicts: MergeFieldConflict[]
): ExtractedRankingEntry {
  if (conflicts.length === 0) return next;

  const previousQuality = top25EntryQuality(previous);
  const nextQuality = top25EntryQuality(next);
  if (nextQuality > previousQuality) return next;
  if (previousQuality > nextQuality) return previous;

  if (previous.teamKey === next.teamKey && next.wins > previous.wins) return next;
  return previous;
}

function preferUniqueTeamEntry(previous: ExtractedRankingEntry, next: ExtractedRankingEntry): ExtractedRankingEntry {
  const previousQuality = top25EntryQuality(previous);
  const nextQuality = top25EntryQuality(next);
  if (nextQuality > previousQuality) return next;
  if (previousQuality > nextQuality) return previous;
  return next.rank < previous.rank ? next : previous;
}

function dedupeTop25Teams(entries: ExtractedRankingEntry[]): {
  entries: ExtractedRankingEntry[];
  warnings: CaptureImportWarning[];
} {
  const byTeam = new Map<string, ExtractedRankingEntry>();
  const warnings: CaptureImportWarning[] = [];

  for (const entry of entries.sort((a, b) => a.rank - b.rank)) {
    const existing = byTeam.get(entry.teamKey);
    if (!existing) {
      byTeam.set(entry.teamKey, entry);
      continue;
    }

    const kept = preferUniqueTeamEntry(existing, entry);
    const dropped = kept === existing ? entry : existing;
    byTeam.set(entry.teamKey, kept);
    warnings.push({
      code: 'duplicate_team',
      rowKey: entry.teamKey,
      message: `Duplicate Top 25 team ${entry.teamName} appeared at ranks #${existing.rank} and #${entry.rank}; kept #${kept.rank} and dropped #${dropped.rank}.`,
    });
  }

  return {
    entries: [...byTeam.values()].sort((a, b) => a.rank - b.rank),
    warnings,
  };
}

export function mergeTop25Entries(
  batches: ExtractedRankingEntry[][]
): { entries: ExtractedRankingEntry[]; warnings: CaptureImportWarning[] } {
  const flat = batches.flat();
  const { merged, warnings } = mergeRecordsByKey(
    flat,
    (row) => String(row.rank),
    preferBetterTop25Entry
  );
  const uniqueTeams = dedupeTop25Teams(merged);
  return {
    entries: uniqueTeams.entries,
    warnings: [...warnings, ...uniqueTeams.warnings],
  };
}

function fillMissingTop25Ranks(entries: ExtractedRankingEntry[]): {
  entries: ExtractedRankingEntry[];
  warnings: CaptureImportWarning[];
} {
  const byRank = new Map(entries.map((entry) => [entry.rank, entry]));
  const filled: ExtractedRankingEntry[] = [];
  const warnings: CaptureImportWarning[] = [];

  for (let rank = 1; rank <= 25; rank += 1) {
    const entry = byRank.get(rank);
    if (entry) {
      filled.push(entry);
      continue;
    }

    filled.push({
      rank,
      teamKey: '',
      teamName: `Manual entry required (#${rank})`,
      wins: 0,
      losses: 0,
    });
    warnings.push({
      code: 'missing_rank',
      rowKey: String(rank),
      message: `Rank #${rank} could not be read from the uploaded Top 25 screenshots. Choose the team and record manually before saving.`,
    });
  }

  return { entries: filled, warnings };
}

export function buildTop25CaptureExpectedFromOcr(
  pages: CaptureOcrPageResult[],
  seasonYear: number
): { expected: Top25CaptureExpected; warnings: CaptureImportWarning[] } {
  const batches = pages.map((page) => parseTop25EntriesFromOcrText(page.text));
  const { entries: mergedEntries, warnings } = mergeTop25Entries(batches);
  const filled = fillMissingTop25Ranks(mergedEntries);
  warnings.push(...filled.warnings);

  if (mergedEntries.length === 0) {
    warnings.push({
      code: 'no_rows',
      message: 'No Top 25 rows were detected in the uploaded screenshots.',
    });
  }

  return {
    expected: {
      fixtureId: `ocr-top25-${seasonYear}`,
      screenKind: 'top25_rankings',
      partial: filled.warnings.length > 0,
      seasonYear,
      pollType: 'top25',
      entries: filled.entries,
    },
    warnings,
  };
}
