import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, join, relative } from 'node:path';
import type { IndexedFile, ScanSession } from '@ncaa/domain';
import { shouldCopyToWorkingCopy, toIndexedFile } from '@ncaa/parsers';

export interface ScanServiceOptions {
  appDataDir: string;
  maxFiles?: number;
}

export interface ScanServiceResult {
  session: ScanSession;
  files: Array<IndexedFile & { workingCopyPath?: string }>;
}

export class ScanService {
  constructor(private readonly options: ScanServiceOptions) {}

  async scan(sourceRoot: string): Promise<ScanServiceResult> {
    const id = randomUUID();
    const startedAt = new Date().toISOString();
    const workingCopyDir = join(this.options.appDataDir, 'working-copies', id);
    await mkdir(workingCopyDir, { recursive: true });

    const session: ScanSession = {
      id,
      sourceRoot,
      startedAt,
      fileCount: 0,
      workingCopyDir,
    };

    const files = await this.walk(sourceRoot, sourceRoot, id, workingCopyDir);
    session.fileCount = files.length;
    session.completedAt = new Date().toISOString();

    return { session, files };
  }

  private async walk(
    sourceRoot: string,
    currentDir: string,
    scanSessionId: string,
    workingCopyDir: string,
    collected: Array<IndexedFile & { workingCopyPath?: string }> = []
  ): Promise<Array<IndexedFile & { workingCopyPath?: string }>> {
    if (this.options.maxFiles && collected.length >= this.options.maxFiles) return collected;

    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (this.options.maxFiles && collected.length >= this.options.maxFiles) break;

      const absolutePath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(sourceRoot, absolutePath, scanSessionId, workingCopyDir, collected);
        continue;
      }

      if (!entry.isFile()) continue;

      const stats = await stat(absolutePath);
      const relativePath = relative(sourceRoot, absolutePath).replaceAll('\\', '/');
      const indexed = toIndexedFile(
        {
          absolutePath,
          relativePath,
          fileName: basename(absolutePath),
          extension: extname(absolutePath),
          sizeBytes: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        },
        scanSessionId
      );

      const fileWithCopy: IndexedFile & { workingCopyPath?: string } = indexed;
      if (shouldCopyToWorkingCopy(indexed)) {
        const destination = join(workingCopyDir, relativePath);
        await mkdir(dirname(destination), { recursive: true });
        await copyFile(absolutePath, destination);
        fileWithCopy.workingCopyPath = destination;
      }

      collected.push(fileWithCopy);
    }

    return collected;
  }
}
