import { randomUUID } from 'node:crypto';
import type { AppUser, Roster, Team, TeamTenure } from '@ncaa/domain';
import type { DynastySyncPayload } from '@ncaa/sync';
import type Database from 'better-sqlite3';
import {
  DEFAULT_COMMISSIONER_DYNASTY_STATE,
  type CommissionerDynastyState,
} from './dynasty-state.js';
import {
  leagueIdFromName,
  type CommissionerLeague,
  type CreateCommissionerLeagueInput,
} from './leagues.js';

const ACTIVE_LEAGUE_SETTING_KEY = 'active_league_id';

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

  deleteRosterImportsForTeam(dynastyId: string, teamId: string): number {
    const result = this.db
      .prepare(`DELETE FROM roster_imports WHERE dynasty_id = @dynastyId AND team_id = @teamId`)
      .run({ dynastyId, teamId });
    return result.changes;
  }

  deleteRosterImportsForDynasty(dynastyId: string): number {
    const result = this.db
      .prepare(`DELETE FROM roster_imports WHERE dynasty_id = @dynastyId`)
      .run({ dynastyId });
    return result.changes;
  }

  deleteLatestRosterImportForTeam(dynastyId: string, teamId: string): number {
    const row = this.db
      .prepare(
        `SELECT id FROM roster_imports
         WHERE dynasty_id = @dynastyId AND team_id = @teamId
         ORDER BY imported_at DESC
         LIMIT 1`
      )
      .get({ dynastyId, teamId }) as { id: string } | undefined;
    if (!row) return 0;
    const result = this.db.prepare(`DELETE FROM roster_imports WHERE id = @id`).run({ id: row.id });
    return result.changes;
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

  getDynastyState(dynastyId: string, defaultSeasonYear: number): CommissionerDynastyState {
    const row = this.db
      .prepare(
        `SELECT dynasty_id as dynastyId, current_season_year as currentSeasonYear,
                archived_seasons_json as archivedSeasonsJson,
                archived_rankings_json as archivedRankingsJson,
                team_roster_snapshots_json as teamRosterSnapshotsJson,
                checkpoints_json as checkpointsJson,
                player_catalog_json as playerCatalogJson,
                postseason_results_json as postseasonResultsJson,
                schedule_imports_json as scheduleImportsJson,
                top25_imports_json as top25ImportsJson
         FROM commissioner_dynasty_state WHERE dynasty_id = @dynastyId`
      )
      .get({ dynastyId }) as
      | {
          dynastyId: string;
          currentSeasonYear: number;
          archivedSeasonsJson: string;
          archivedRankingsJson: string;
          teamRosterSnapshotsJson: string;
          checkpointsJson?: string;
          playerCatalogJson?: string;
          postseasonResultsJson?: string;
          scheduleImportsJson: string;
          top25ImportsJson: string;
        }
      | undefined;

    if (!row) return DEFAULT_COMMISSIONER_DYNASTY_STATE(dynastyId, defaultSeasonYear);

    return {
      dynastyId: row.dynastyId,
      currentSeasonYear: row.currentSeasonYear,
      archivedSeasons: JSON.parse(row.archivedSeasonsJson),
      archivedRankings: JSON.parse(row.archivedRankingsJson),
      teamRosterSnapshots: JSON.parse(row.teamRosterSnapshotsJson),
      checkpoints: JSON.parse(row.checkpointsJson ?? '[]'),
      playerCatalog: JSON.parse(row.playerCatalogJson ?? '[]'),
      postseasonResults: JSON.parse(row.postseasonResultsJson ?? '[]'),
      scheduleImports: JSON.parse(row.scheduleImportsJson),
      top25Imports: JSON.parse(row.top25ImportsJson),
    };
  }

  saveDynastyState(state: CommissionerDynastyState): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO commissioner_dynasty_state
         (dynasty_id, current_season_year, archived_seasons_json, archived_rankings_json,
          team_roster_snapshots_json, checkpoints_json, player_catalog_json,
          postseason_results_json, schedule_imports_json, top25_imports_json, updated_at)
         VALUES (@dynastyId, @currentSeasonYear, @archivedSeasonsJson, @archivedRankingsJson,
                 @teamRosterSnapshotsJson, @checkpointsJson, @playerCatalogJson,
                 @postseasonResultsJson, @scheduleImportsJson, @top25ImportsJson, @updatedAt)`
      )
      .run({
        dynastyId: state.dynastyId,
        currentSeasonYear: state.currentSeasonYear,
        archivedSeasonsJson: JSON.stringify(state.archivedSeasons),
        archivedRankingsJson: JSON.stringify(state.archivedRankings),
        teamRosterSnapshotsJson: JSON.stringify(state.teamRosterSnapshots),
        checkpointsJson: JSON.stringify(state.checkpoints),
        playerCatalogJson: JSON.stringify(state.playerCatalog),
        postseasonResultsJson: JSON.stringify(state.postseasonResults),
        scheduleImportsJson: JSON.stringify(state.scheduleImports),
        top25ImportsJson: JSON.stringify(state.top25Imports),
        updatedAt: new Date().toISOString(),
      });
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

  listLeagues(): CommissionerLeague[] {
    return this.db
      .prepare(
        `SELECT id, name, starting_season_year as startingSeasonYear, status,
                commissioner_user_id as commissionerUserId, created_at as createdAt, updated_at as updatedAt
         FROM commissioner_leagues
         ORDER BY name COLLATE NOCASE`
      )
      .all() as CommissionerLeague[];
  }

  getLeague(leagueId: string): CommissionerLeague | null {
    const row = this.db
      .prepare(
        `SELECT id, name, starting_season_year as startingSeasonYear, status,
                commissioner_user_id as commissionerUserId, created_at as createdAt, updated_at as updatedAt
         FROM commissioner_leagues WHERE id = @leagueId`
      )
      .get({ leagueId }) as CommissionerLeague | undefined;
    return row ?? null;
  }

  createLeague(input: CreateCommissionerLeagueInput): CommissionerLeague {
    const now = new Date().toISOString();
    let id = input.id ?? leagueIdFromName(input.name);
    while (this.getLeague(id)) {
      id = `${id}-${randomUUID().slice(0, 8)}`;
    }

    const league: CommissionerLeague = {
      id,
      name: input.name.trim(),
      startingSeasonYear: input.startingSeasonYear,
      status: 'active',
      commissionerUserId: input.commissionerUserId,
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO commissioner_leagues
         (id, name, starting_season_year, status, commissioner_user_id, created_at, updated_at)
         VALUES (@id, @name, @startingSeasonYear, @status, @commissionerUserId, @createdAt, @updatedAt)`
      )
      .run(league);

    const existingState = this.db
      .prepare(`SELECT 1 as found FROM commissioner_dynasty_state WHERE dynasty_id = @id`)
      .get({ id }) as { found: number } | undefined;
    if (!existingState) {
      this.saveDynastyState(DEFAULT_COMMISSIONER_DYNASTY_STATE(id, input.startingSeasonYear));
    }
    return league;
  }

  deleteLeague(leagueId: string): boolean {
    if (!this.getLeague(leagueId)) return false;
    this.deleteDynastyScopedData(leagueId);
    const result = this.db.prepare(`DELETE FROM commissioner_leagues WHERE id = @leagueId`).run({ leagueId });
    if (this.getActiveLeagueId() === leagueId) {
      this.db.prepare(`DELETE FROM commissioner_settings WHERE key = @key`).run({
        key: ACTIVE_LEAGUE_SETTING_KEY,
      });
    }
    return result.changes > 0;
  }

  getActiveLeagueId(): string | null {
    const row = this.db
      .prepare(`SELECT value FROM commissioner_settings WHERE key = @key`)
      .get({ key: ACTIVE_LEAGUE_SETTING_KEY }) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setActiveLeagueId(leagueId: string): void {
    if (!this.getLeague(leagueId)) {
      throw new Error(`Unknown league: ${leagueId}`);
    }
    this.db
      .prepare(
        `INSERT OR REPLACE INTO commissioner_settings (key, value) VALUES (@key, @value)`
      )
      .run({ key: ACTIVE_LEAGUE_SETTING_KEY, value: leagueId });
  }

  deleteDynastyScopedData(dynastyId: string): void {
    this.db.prepare(`DELETE FROM team_tenures WHERE dynasty_id = @dynastyId`).run({ dynastyId });
    this.db.prepare(`DELETE FROM roster_imports WHERE dynasty_id = @dynastyId`).run({ dynastyId });
    this.db.prepare(`DELETE FROM published_batches WHERE dynasty_id = @dynastyId`).run({ dynastyId });
    this.db
      .prepare(`DELETE FROM commissioner_dynasty_state WHERE dynasty_id = @dynastyId`)
      .run({ dynastyId });
  }
}
