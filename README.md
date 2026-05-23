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

## Cursor Skills

Repo-local skills:

- `ncaa-app-functionality` — app functionality, architecture, commissioner workflow, league management, storage, sync payloads, IPC, hosted portal, publish flow
- `ncaa-frontend-theming` — frontend, styling, CSS, theme, layout, React UI, commissioner UI, portal UI, app shell
- `ncaa-ocr-imports` — OCR, Tesseract, screenshot import, roster OCR, schedule OCR, Top 25 OCR, capture imports, image parsing

Cursor/user skills:

- `babysit` — babysit PR, keep PR merge-ready, triage comments, fix CI, resolve conflicts
- `canvas` — canvas, dashboard, chart, table, visual artifact, analysis view, interactive report
- `create-hook` — create hook, hooks.json, agent event automation, Cursor hooks
- `create-rule` — create rule, Cursor rules, project conventions, AGENTS.md, `.cursor/rules`
- `create-skill` — create skill, SKILL.md, new agent skill, skill structure
- `loop` — loop, recurring task, polling, cron-like, interval check, monitor status
- `sdk` — Cursor SDK, `@cursor/sdk`, `cursor-sdk`, `Agent.create`, `Agent.prompt`, cloud agents, programmatic agents
- `split-to-prs` — split PR, split branch, reviewable PRs, break up changes
- `statusline` — status line, statusline, CLI status bar, prompt footer
- `update-cursor-settings` — settings.json, editor settings, Cursor settings, VSCode settings, theme, font size, auto save
