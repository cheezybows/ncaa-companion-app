# NCAA Companion App

Desktop companion for NCAA Football (PC) — dynasty tracking, rosters, and player progression.

## Stack

- **Desktop:** Electron + React + TypeScript + Vite
- **Local storage:** SQLite (`better-sqlite3`)
- **Monorepo:** npm workspaces

## Structure

```
apps/desktop   — Electron main process, preload, packaging
apps/web       — React UI (shared renderer)
packages/domain   — Shared TypeScript models
packages/parsers  — File scanner & parser interfaces
packages/storage  — SQLite access layer
```

## Development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

### Hosted portal (sign-in, claims, coach dashboards)

```bash
npm run dev:hosted
```

See [docs/hosted-portal.md](docs/hosted-portal.md).

## Workflow

1. Choose your NCAA game or save folder (read-only scan).
2. App indexes files and stores metadata in SQLite.
3. View teams, rosters, dynasty, and progression (placeholder data until game files are parsed).
4. Export CSV/JSON when data is available.

## Post-release

After the PC game ships, add real parser fixtures under `packages/parsers/fixtures/` and wire parsers to the UI.

## OCR fallback

Screenshot/OCR capture is deferred until local file readability is evaluated. See `docs/ocr-evaluation.md`.
