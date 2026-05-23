---
name: ncaa-app-functionality
description: Explains NCAA Companion app functionality, architecture, data flow, local commissioner workflows, hosted portal publishing, storage boundaries, and verification commands. Use when implementing or debugging app features, league management, commissioner workflows, sync payloads, desktop IPC, local storage, hosted API behavior, or portal functionality.
---

# NCAA App Functionality

## Purpose

Use this skill before changing NCAA Companion app behavior across desktop, web, API, portal, storage, sync, or domain packages. It captures the current functional boundaries so future work preserves how local commissioner data becomes hosted portal data.

## Product Model

NCAA Companion is a local-first commissioner tool with a hosted read-only coach portal.

- Commissioner desktop app: local league administration, users, team assignments, imports, schedule/ranking edits, week/season advance, archive, and publish.
- Hosted portal: coach-facing sign-in and dynasty views populated by published commissioner data.
- Local leagues: desktop-only for now. The hosted portal remains driven by publishing the currently selected local league.
- Users are global in local storage. League-scoped data is keyed by `dynastyId`.

## Workspace Map

| Area | Path | Role |
|------|------|------|
| Desktop host | `apps/desktop` | Electron window, preload, IPC handlers, local SQLite, commissioner service |
| Commissioner UI | `apps/web` | React renderer for local commissioner workflows |
| Hosted API | `apps/api` | REST API that serves published dynasty bundles to the portal |
| Hosted portal | `apps/portal` | React coach portal and hosted dynasty views |
| Domain | `packages/domain` | Canonical app types, placeholder teams, demo users, dynasty contracts |
| Storage | `packages/storage` | SQLite schema, repositories, local dynasty state, league metadata |
| Sync | `packages/sync` | Publish payload creation and hosted sync contracts |
| Parsers | `packages/parsers` | Capture/OCR parse models and parser tests |

## Core Data Flow

```text
Commissioner UI (`apps/web`)
  -> `getCompanionApi()` / `window.ncaa`
  -> Electron preload (`apps/desktop/src/preload.ts`)
  -> IPC handlers (`apps/desktop/src/main.ts`)
  -> `CommissionerService`
  -> storage repositories / parser helpers / sync payloads

Publish
  -> `createSyncPayload(...)`
  -> hosted API
  -> portal `DynastyDataProvider`
```

## Local League Rules

- Active league id is the active `dynastyId`.
- `CommissionerService.getCommissionerConfig()` is the source for the active league in the UI.
- `commissioner_leagues` stores local league metadata.
- `commissioner_settings` stores `active_league_id`.
- League-scoped tables/data include `team_tenures`, `roster_imports`, `published_batches`, and `commissioner_dynasty_state`.
- Deleting a league must remove its league-scoped data and leave at least one local league.
- Switching leagues should reload `CommissionerService` dynasty state and refresh sidebar stats.
- Do not add hosted API league management unless explicitly requested; publish still sends the selected local league.

## Feature Boundaries

### Commissioner desktop

- Add Electron-facing API methods in all three places: `apps/desktop/src/types.ts`, `apps/desktop/src/preload.ts`, and IPC handlers in `apps/desktop/src/main.ts`.
- Keep business behavior in `apps/desktop/src/commissioner-service.ts`; React pages should call typed API methods.
- Browser fallback behavior belongs in `apps/web/src/api.ts`; gate Electron-only actions by optional API methods.

### Storage

- Add schema in `packages/storage/src/database.ts`.
- Add SQLite behavior in `packages/storage/src/commissioner-repositories.ts`.
- Mirror behavior in `packages/storage/src/memory-repositories.ts` for tests and service compatibility.
- Export shared storage types from `packages/storage/src/index.ts`.

### Hosted portal

- Portal reads bundles from `apps/portal/src/dynasty-data-context.tsx` and `apps/portal/src/api.ts`.
- Portal should not directly read local desktop storage or IPC.
- Publish history and visible portal state should come from sync payloads, not local-only UI state.

### Domain and sync

- Prefer `@ncaa/domain` types for stable app objects such as `AppUser`, `Team`, `Roster`, `TeamTenure`, and `Dynasty`.
- Publish payload shape belongs in `packages/sync`.
- Avoid one-off transport-only types when a domain or sync contract already exists.

## Common Workflows

### Add a commissioner feature

1. Confirm whether data is local-only, publishable, or hosted-only.
2. Add or extend domain/storage/sync contracts only where the data actually belongs.
3. Implement service behavior in `CommissionerService`.
4. Expose it through desktop `types`, `preload`, and `main` IPC.
5. Add web API typings in `apps/web/src/api.ts`.
6. Update the relevant React page in `apps/web`.
7. Run focused tests and typechecks.

### Add persisted local data

1. Update SQLite schema and `ensureColumn` migrations if changing existing tables.
2. Add SQLite repository methods.
3. Add equivalent memory repository methods.
4. Add focused storage tests.
5. Make service code depend on repository methods, not raw SQL.

### Change publish behavior

1. Inspect `packages/sync/src/payloads.ts`.
2. Trace `CommissionerService.publishToHosted()`.
3. Confirm hosted API accepts the payload.
4. Confirm portal data context renders the updated bundle.
5. Preserve idempotent publish history behavior.

## Verification

Use targeted checks first:

- Storage: `npm run build -w @ncaa/storage` and `npm run test -w @ncaa/storage`
- Desktop service or IPC: `npm run typecheck -w @ncaa/desktop` and `npm run build:main -w @ncaa/desktop`
- Commissioner UI: `npm run typecheck -w @ncaa/web` and `npm run build -w @ncaa/web`
- Portal: `npm run typecheck -w @ncaa/portal` and `npm run build -w @ncaa/portal`
- Cross-package contract changes: `npm run build:packages`

On Windows PowerShell, separate commands with `;` rather than `&&`.

## Related Skills

- UI and styling: `ncaa-frontend-theming`
- OCR/import behavior: `ncaa-ocr-imports`

## Avoid

- Do not use hardcoded `dynasty-demo` for new commissioner flows unless bootstrapping demo data.
- Do not make portal features depend on Electron APIs or local SQLite.
- Do not skip memory repository parity when adding storage methods.
- Do not silently drop warnings or commissioner review data from import flows.
- Do not edit generated `dist`, `node_modules`, `.vite`, or temporary screenshots unless explicitly requested.
