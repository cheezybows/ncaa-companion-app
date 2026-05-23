import { describe, expect, it } from 'vitest';
import { inferFileKind, shouldCopyToWorkingCopy, toIndexedFile } from './scanner.js';

describe('scanner', () => {
  it('infers json kind', () => {
    expect(
      inferFileKind({
        absolutePath: 'C:/game/data.json',
        relativePath: 'data.json',
        fileName: 'data.json',
        extension: '.json',
        sizeBytes: 100,
        modifiedAt: new Date().toISOString(),
      })
    ).toBe('json');
  });

  it('infers dynasty save from path', () => {
    expect(
      inferFileKind({
        absolutePath: 'C:/game/saves/dynasty_01.sav',
        relativePath: 'saves/dynasty_01.sav',
        fileName: 'dynasty_01.sav',
        extension: '.sav',
        sizeBytes: 100,
        modifiedAt: new Date().toISOString(),
      })
    ).toBe('save');
  });

  it('marks copyable files', () => {
    const file = toIndexedFile(
      {
        absolutePath: 'C:/game/roster.json',
        relativePath: 'roster.json',
        fileName: 'roster.json',
        extension: '.json',
        sizeBytes: 50,
        modifiedAt: new Date().toISOString(),
      },
      'session-1'
    );
    expect(shouldCopyToWorkingCopy(file)).toBe(true);
  });
});
