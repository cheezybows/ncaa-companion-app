import type { FileKind, IndexedFile } from '@ncaa/domain';

const TEXT_EXTENSIONS = new Set(['.txt', '.xml', '.csv', '.ini', '.cfg', '.log', '.md']);
const JSON_EXTENSIONS = new Set(['.json']);
const SQLITE_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3']);
const COMPRESSED_EXTENSIONS = new Set(['.zip', '.gz', '.7z', '.rar']);

const SAVE_HINTS = ['save', 'dynasty', 'career', 'franchise'];
const ROSTER_HINTS = ['roster', 'player', 'team'];
const SETTINGS_HINTS = ['settings', 'config', 'prefs'];
const CACHE_HINTS = ['cache', 'temp'];

export interface ScanFileInput {
  absolutePath: string;
  relativePath: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
}

export function inferFileKind(input: ScanFileInput): FileKind {
  const ext = input.extension.toLowerCase();
  const lowerPath = input.relativePath.toLowerCase();
  const lowerName = input.fileName.toLowerCase();

  if (JSON_EXTENSIONS.has(ext)) return 'json';
  if (SQLITE_EXTENSIONS.has(ext)) return 'sqlite';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  if (COMPRESSED_EXTENSIONS.has(ext)) return 'compressed';

  if (SAVE_HINTS.some((h) => lowerPath.includes(h) || lowerName.includes(h))) return 'save';
  if (ROSTER_HINTS.some((h) => lowerPath.includes(h) || lowerName.includes(h))) return 'roster';
  if (SETTINGS_HINTS.some((h) => lowerPath.includes(h) || lowerName.includes(h)))
    return 'settings';
  if (CACHE_HINTS.some((h) => lowerPath.includes(h) || lowerName.includes(h))) return 'cache';

  if (ext === '' || ext === '.dat' || ext === '.bin') return 'binary';
  return 'unknown';
}

export function toIndexedFile(
  input: ScanFileInput,
  scanSessionId: string,
  id?: string
): IndexedFile {
  return {
    id: id ?? crypto.randomUUID(),
    absolutePath: input.absolutePath,
    relativePath: input.relativePath,
    fileName: input.fileName,
    extension: input.extension,
    sizeBytes: input.sizeBytes,
    modifiedAt: input.modifiedAt,
    kind: inferFileKind(input),
    scanSessionId,
  };
}

/** Extensions we attempt to copy into working directory for safe parsing */
export const COPYABLE_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  ...JSON_EXTENSIONS,
  ...SQLITE_EXTENSIONS,
  '.dat',
  '.bin',
  '.sav',
]);

export function shouldCopyToWorkingCopy(file: IndexedFile): boolean {
  const ext = file.extension.toLowerCase();
  return COPYABLE_EXTENSIONS.has(ext) || file.kind !== 'unknown';
}
