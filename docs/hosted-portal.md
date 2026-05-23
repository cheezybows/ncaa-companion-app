# Hosted Portal (Coach-Facing)

## Run locally

Terminal 1:

```bash
npm run dev:api
```

Terminal 2:

```bash
npm run dev:portal
```

Or both together:

```bash
npm run dev:hosted
```

Portal: http://127.0.0.1:5180  
API: http://127.0.0.1:8787

## Who uses what

- **Commissioners** use the **desktop app** only for assignments, imports, and publishing. See [desktop-commissioner.md](./desktop-commissioner.md).
- **Coaches** use this portal to view their active team, progression, career history, and archives from **published** API snapshots.

## Demo coach accounts

- Coach (Alabama): `user-coach-carter`
- Coach (career history): `user-coach-brooks`
- Coach (Georgia): `user-coach-reed`

The commissioner account (`user-admin`) is not offered on portal sign-in; use the desktop app instead.

## Coach flows

- Coaches see only their active team in My Team and Progression.
- A coach can have only one active team at a time.
- When the commissioner changes a coach's team (from desktop), the old tenure is archived on the API.
- Career and Archive pages show historical teams/seasons after job changes.
- Dynasty/roster/progression data comes from `GET /dynasties/:dynastyId` (last desktop publish), with placeholders only if the API is offline.

## Postgres

Set `DATABASE_URL` and apply schema from `apps/api/src/db.ts` when moving off in-memory demo storage.
