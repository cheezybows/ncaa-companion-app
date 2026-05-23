# Desktop Commissioner

## Ownership

| Surface | Role |
| --- | --- |
| **Desktop app** (`apps/desktop` + `apps/web`) | Commissioner console: imports, roster review, team assignments, publish to hosted API |
| **Local SQLite** (`@ncaa/storage`) | Source of truth for commissioner state until published |
| **Hosted API** (`apps/api`) | Ingests desktop-submitted sync snapshots and team assignments |
| **Coach portal** (`apps/portal`) | Read-only consumer of published dynasty data |

Commissioners do **not** mutate hosted data from the portal. Coaches sign in to the portal and see the latest published snapshot.

## Local persistence

SQLite tables (see `packages/storage/src/database.ts`):

- `commissioner_users` — cached coach accounts for assignment UI
- `team_tenures` — local mirror of assignment history
- `roster_imports` — imported rosters per team (e.g. screenshot fixtures)
- `published_batches` — publish history and idempotency by `batch_id`

When the native SQLite module is unavailable, in-memory repositories are used and state resets on restart.

## Publish flow

1. Commissioner assigns teams in the desktop **Assign Teams** view (saved locally, pushed to `POST /dynasties/:id/team-assignments`).
2. Optional: load screenshot roster fixtures under **Rosters** (saved locally).
3. **Publish to Hosted** builds a `DynastySyncPayload` from placeholders + local imports and posts to `POST /sync/batches`.
4. Coaches open the portal; pages load `GET /dynasties/:dynastyId` for rosters, progression, and dynasty metadata.

Repeated publishes with the same `batchId` are ignored by the API (idempotent ingest).

## Run locally

```bash
# Commissioner desktop (Electron + Vite)
npm run dev

# Hosted stack for coach portal + API
npm run dev:hosted
```

Set `NCAA_API_URL` (desktop main process) or `VITE_API_URL` (renderer) to point at the API, default `http://127.0.0.1:8787`.

To make the local hosted API read the same desktop SQLite database, set `NCAA_DESKTOP_DB_PATH` to the desktop database path shown in the app's **Local Files** screen. The API uses its own Node SQLite driver and reads the same file/schema without reusing Electron's native module.
