import type { CaptureImportWarning } from './types.js';

export interface MergeFieldConflict {
  field: string;
  previous: unknown;
  next: unknown;
}

export interface MergeResult<T> {
  merged: T;
  warnings: CaptureImportWarning[];
}

function valuesConflict(previous: unknown, next: unknown): boolean {
  if (previous == null || previous === '') return false;
  if (next == null || next === '') return false;
  return String(previous) !== String(next);
}

export function mergeRecordsByKey<T extends object>(
  rows: T[],
  keyOf: (row: T) => string,
  preferNext: (previous: T, next: T, conflicts: MergeFieldConflict[]) => T
): MergeResult<T[]> {
  const merged = new Map<string, T>();
  const warnings: CaptureImportWarning[] = [];

  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, row);
      continue;
    }

    const conflicts: MergeFieldConflict[] = [];
    const existingRecord = existing as Record<string, unknown>;
    const rowRecord = row as Record<string, unknown>;
    const keys = new Set([...Object.keys(existingRecord), ...Object.keys(rowRecord)]);
    for (const field of keys) {
      const prev = existingRecord[field];
      const next = rowRecord[field];
      if (valuesConflict(prev, next)) {
        conflicts.push({ field, previous: prev, next });
      }
    }

    if (conflicts.length > 0) {
      warnings.push({
        code: 'merge_conflict',
        rowKey: key,
        message: `Merged row ${key} had conflicting fields: ${conflicts.map((c) => c.field).join(', ')}`,
      });
    }

    merged.set(key, preferNext(existing, row, conflicts));
  }

  return { merged: [...merged.values()], warnings };
}

export function preferHigherConfidenceOrLater<T extends object>(
  previous: T,
  next: T,
  conflicts: MergeFieldConflict[]
): T {
  const result = { ...previous } as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;
  const previousRecord = previous as Record<string, unknown>;
  for (const key of Object.keys(nextRecord)) {
    const nextVal = nextRecord[key];
    const prevVal = previousRecord[key];
    if (nextVal == null || nextVal === '') continue;
    if (prevVal == null || prevVal === '') {
      result[key] = nextVal;
      continue;
    }
    const conflict = conflicts.find((item) => item.field === key);
    if (conflict) {
      result[key] = nextVal;
    }
  }
  return result as T;
}
