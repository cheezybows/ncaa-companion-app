import type { IndexedFile, PlayerProgressionSnapshot, ScanSession } from '@ncaa/domain';
import type Database from 'better-sqlite3';

export class ScanRepository {
  constructor(private db: Database.Database) {}

  createSession(session: ScanSession): void {
    this.db
      .prepare(
        `INSERT INTO scan_sessions (id, source_root, started_at, completed_at, file_count, working_copy_dir)
         VALUES (@id, @sourceRoot, @startedAt, @completedAt, @fileCount, @workingCopyDir)`
      )
      .run({
        id: session.id,
        sourceRoot: session.sourceRoot,
        startedAt: session.startedAt,
        completedAt: session.completedAt ?? null,
        fileCount: session.fileCount,
        workingCopyDir: session.workingCopyDir,
      });
  }

  completeSession(id: string, fileCount: number): void {
    this.db
      .prepare(
        `UPDATE scan_sessions SET completed_at = @completedAt, file_count = @fileCount WHERE id = @id`
      )
      .run({
        id,
        completedAt: new Date().toISOString(),
        fileCount,
      });
  }

  listSessions(): ScanSession[] {
    const rows = this.db
      .prepare(
        `SELECT id, source_root as sourceRoot, started_at as startedAt, completed_at as completedAt,
                file_count as fileCount, working_copy_dir as workingCopyDir
         FROM scan_sessions ORDER BY started_at DESC`
      )
      .all() as ScanSession[];
    return rows;
  }

  getLatestSession(): ScanSession | null {
    const row = this.db
      .prepare(
        `SELECT id, source_root as sourceRoot, started_at as startedAt, completed_at as completedAt,
                file_count as fileCount, working_copy_dir as workingCopyDir
         FROM scan_sessions ORDER BY started_at DESC LIMIT 1`
      )
      .get() as ScanSession | undefined;
    return row ?? null;
  }

  insertFiles(files: (IndexedFile & { workingCopyPath?: string })[]): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO indexed_files
       (id, scan_session_id, absolute_path, relative_path, file_name, extension, size_bytes, modified_at, kind, working_copy_path)
       VALUES (@id, @scanSessionId, @absolutePath, @relativePath, @fileName, @extension, @sizeBytes, @modifiedAt, @kind, @workingCopyPath)`
    );
    const insertMany = this.db.transaction((items: (IndexedFile & { workingCopyPath?: string })[]) => {
      for (const f of items) {
        stmt.run({
          id: f.id,
          scanSessionId: f.scanSessionId,
          absolutePath: f.absolutePath,
          relativePath: f.relativePath,
          fileName: f.fileName,
          extension: f.extension,
          sizeBytes: f.sizeBytes,
          modifiedAt: f.modifiedAt,
          kind: f.kind,
          workingCopyPath: f.workingCopyPath ?? null,
        });
      }
    });
    insertMany(files);
  }

  listFilesBySession(sessionId: string): (IndexedFile & { workingCopyPath?: string })[] {
    const rows = this.db
      .prepare(
        `SELECT id, scan_session_id as scanSessionId, absolute_path as absolutePath,
                relative_path as relativePath, file_name as fileName, extension,
                size_bytes as sizeBytes, modified_at as modifiedAt, kind,
                working_copy_path as workingCopyPath
         FROM indexed_files WHERE scan_session_id = @sessionId ORDER BY relative_path`
      )
      .all({ sessionId }) as (IndexedFile & { workingCopyPath?: string })[];
    return rows;
  }

  countFiles(): number {
    const row = this.db.prepare(`SELECT COUNT(*) as c FROM indexed_files`).get() as { c: number };
    return row.c;
  }
}

export class ProgressionRepository {
  constructor(private db: Database.Database) {}

  insertSnapshot(snapshot: PlayerProgressionSnapshot & { playerName: string; position: string }): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO progression_snapshots
         (id, player_id, team_id, player_name, position, captured_at, season_year, week, label, ratings_json, overall_delta)
         VALUES (@id, @playerId, @teamId, @playerName, @position, @capturedAt, @seasonYear, @week, @label, @ratingsJson, @overallDelta)`
      )
      .run({
        id: snapshot.id,
        playerId: snapshot.playerId,
        teamId: snapshot.teamId,
        playerName: snapshot.playerName,
        position: snapshot.position,
        capturedAt: snapshot.capturedAt,
        seasonYear: snapshot.seasonYear,
        week: snapshot.week ?? null,
        label: snapshot.label ?? null,
        ratingsJson: JSON.stringify(snapshot.ratings),
        overallDelta: snapshot.overallDelta ?? null,
      });
  }

  listByTeam(teamId: string): PlayerProgressionSnapshot[] {
    const rows = this.db
      .prepare(
        `SELECT id, player_id as playerId, team_id as teamId, captured_at as capturedAt,
                season_year as seasonYear, week, label, ratings_json as ratingsJson, overall_delta as overallDelta
         FROM progression_snapshots WHERE team_id = @teamId ORDER BY player_id, captured_at`
      )
      .all({ teamId }) as Array<
      PlayerProgressionSnapshot & { ratingsJson: string; playerName?: string; position?: string }
    >;

    return rows.map((r) => ({
      id: r.id,
      playerId: r.playerId,
      teamId: r.teamId,
      capturedAt: r.capturedAt,
      seasonYear: r.seasonYear,
      week: r.week,
      label: r.label,
      ratings: JSON.parse(r.ratingsJson) as PlayerProgressionSnapshot['ratings'],
      overallDelta: r.overallDelta,
    }));
  }
}
