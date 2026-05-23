import { randomUUID } from 'node:crypto';
import type { AppUser, Roster, Team, TeamTenure } from '@ncaa/domain';
import type { DynastySyncPayload } from '@ncaa/sync';
import type Database from 'better-sqlite3';

export interface RosterImportRecord {
  id: string;
  dynastyId: string;
  teamId: string;
  team: Team;
  roster: Roster;
  importedAt: string;
  sourceLabel: string;
  fixtureId?: string;
}

export interface PublishedBatchRecord {
  batchId: string;
  dynastyId: string;
  uploadedByUserId: string;
  syncedAt: string;
  status: 'completed' | 'failed';
  createdAt: string;
}

export class CommissionerRepository {
  constructor(private db: Database.Database) {}

  upsertUsers(users: AppUser[]): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO commissioner_users
       (id, email, display_name, role, created_at, synced_at, access_status,
        password_updated_at, password_reset_required, temporary_password)
       VALUES (@id, @email, @displayName, @role, @createdAt, @syncedAt, @accessStatus,
               @passwordUpdatedAt, @passwordResetRequired, @temporaryPassword)`
    );
    const tx = this.db.transaction((items: AppUser[]) => {
      const syncedAt = new Date().toISOString();
      for (const user of items) {
        stmt.run({
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          createdAt: user.createdAt,
          syncedAt,
          accessStatus: user.accessStatus ?? 'active',
          passwordUpdatedAt: user.passwordUpdatedAt ?? null,
          passwordResetRequired: user.passwordResetRequired ? 1 : 0,
          temporaryPassword: user.temporaryPassword ?? null,
        });
      }
    });
    tx(users);
  }

  listUsers(): AppUser[] {
    return this.db
      .prepare(
        `SELECT id, email, display_name as displayName, role, created_at as createdAt,
                access_status as accessStatus, password_updated_at as passwordUpdatedAt,
                password_reset_required as passwordResetRequired, temporary_password as temporaryPassword
         FROM commissioner_users ORDER BY display_name`
      )
      .all()
      .map((user) => ({
        ...(user as AppUser),
        accessStatus: (user as AppUser).accessStatus ?? 'active',
        passwordResetRequired: Boolean((user as { passwordResetRequired?: number }).passwordResetRequired),
      }));
  }

  listTeamConferenceOverrides(): Record<string, string> {
    const rows = this.db
      .prepare(`SELECT team_id as teamId, conference_id as conferenceId FROM team_conference_overrides`)
      .all() as Array<{ teamId: string; conferenceId: string }>;
    return Object.fromEntries(rows.map((row) => [row.teamId, row.conferenceId]));
  }

  saveTeamConference(teamId: string, conferenceId: string): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO team_conference_overrides
         (team_id, conference_id, updated_at)
         VALUES (@teamId, @conferenceId, @updatedAt)`
      )
      .run({
        teamId,
        conferenceId,
        updatedAt: new Date().toISOString(),
      });
  }

  listTenures(dynastyId: string): TeamTenure[] {
    return this.db
      .prepare(
        `SELECT id, career_id as careerId, user_id as userId, dynasty_id as dynastyId,
                team_id as teamId, role, status, start_season_year as startSeasonYear,
                end_season_year as endSeasonYear, label
         FROM team_tenures WHERE dynasty_id = @dynastyId
         ORDER BY assigned_at DESC`
      )
      .all({ dynastyId }) as TeamTenure[];
  }

  saveTenure(tenure: TeamTenure): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO team_tenures
         (id, career_id, user_id, dynasty_id, team_id, role, status, start_season_year,
          end_season_year, label, assigned_at, published_at)
         VALUES (@id, @careerId, @userId, @dynastyId, @teamId, @role, @status,
                 @startSeasonYear, @endSeasonYear, @label, @assignedAt, @publishedAt)`
      )
      .run({
        id: tenure.id,
        careerId: tenure.careerId,
        userId: tenure.userId,
        dynastyId: tenure.dynastyId,
        teamId: tenure.teamId,
        role: tenure.role,
        status: tenure.status,
        startSeasonYear: tenure.startSeasonYear,
        endSeasonYear: tenure.endSeasonYear ?? null,
        label: tenure.label ?? null,
        assignedAt: new Date().toISOString(),
        publishedAt: null,
      });
  }

  saveRosterImport(input: {
    dynastyId: string;
    team: Team;
    roster: Roster;
    sourceLabel: string;
    fixtureId?: string;
  }): RosterImportRecord {
    const record: RosterImportRecord = {
      id: randomUUID(),
      dynastyId: input.dynastyId,
      teamId: input.team.id,
      team: input.team,
      roster: input.roster,
      importedAt: new Date().toISOString(),
      sourceLabel: input.sourceLabel,
      fixtureId: input.fixtureId,
    };
    this.db
      .prepare(
        `INSERT INTO roster_imports
         (id, dynasty_id, team_id, roster_json, team_json, imported_at, source_label, fixture_id)
         VALUES (@id, @dynastyId, @teamId, @rosterJson, @teamJson, @importedAt, @sourceLabel, @fixtureId)`
      )
      .run({
        id: record.id,
        dynastyId: record.dynastyId,
        teamId: record.teamId,
        rosterJson: JSON.stringify(record.roster),
        teamJson: JSON.stringify(record.team),
        importedAt: record.importedAt,
        sourceLabel: record.sourceLabel,
        fixtureId: record.fixtureId ?? null,
      });
    return record;
  }

  listRosterImports(dynastyId: string): RosterImportRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, dynasty_id as dynastyId, team_id as teamId, roster_json as rosterJson,
                team_json as teamJson, imported_at as importedAt, source_label as sourceLabel,
                fixture_id as fixtureId
         FROM roster_imports WHERE dynasty_id = @dynastyId
         ORDER BY imported_at DESC`
      )
      .all({ dynastyId }) as Array<{
      id: string;
      dynastyId: string;
      teamId: string;
      rosterJson: string;
      teamJson: string;
      importedAt: string;
      sourceLabel: string;
      fixtureId: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      dynastyId: row.dynastyId,
      teamId: row.teamId,
      team: JSON.parse(row.teamJson) as Team,
      roster: JSON.parse(row.rosterJson) as Roster,
      importedAt: row.importedAt,
      sourceLabel: row.sourceLabel,
      fixtureId: row.fixtureId ?? undefined,
    }));
  }

  recordPublishedBatch(payload: DynastySyncPayload, status: 'completed' | 'failed' = 'completed'): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO published_batches
         (batch_id, dynasty_id, uploaded_by_user_id, synced_at, status, payload_json, created_at)
         VALUES (@batchId, @dynastyId, @uploadedByUserId, @syncedAt, @status, @payloadJson, @createdAt)`
      )
      .run({
        batchId: payload.batchId,
        dynastyId: payload.dynastyId,
        uploadedByUserId: payload.uploadedByUserId,
        syncedAt: payload.syncedAt,
        status,
        payloadJson: JSON.stringify(payload),
        createdAt: new Date().toISOString(),
      });
  }

  hasPublishedBatch(batchId: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 as found FROM published_batches WHERE batch_id = @batchId`)
      .get({ batchId }) as { found: number } | undefined;
    return Boolean(row);
  }

  listPublishHistory(dynastyId: string, limit = 20): PublishedBatchRecord[] {
    return this.db
      .prepare(
        `SELECT batch_id as batchId, dynasty_id as dynastyId, uploaded_by_user_id as uploadedByUserId,
                synced_at as syncedAt, status, created_at as createdAt
         FROM published_batches WHERE dynasty_id = @dynastyId
         ORDER BY created_at DESC LIMIT @limit`
      )
      .all({ dynastyId, limit }) as PublishedBatchRecord[];
  }

  getLastPublishedPayload(dynastyId: string): DynastySyncPayload | null {
    const row = this.db
      .prepare(
        `SELECT payload_json as payloadJson FROM published_batches
         WHERE dynasty_id = @dynastyId AND status = 'completed'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get({ dynastyId }) as { payloadJson: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.payloadJson) as DynastySyncPayload;
  }
}
