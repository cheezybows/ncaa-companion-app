---
name: ncaa-frontend-theming
description: Guides NCAA Companion frontend, CSS, theme, and UI changes across the Electron commissioner app and hosted coach portal. Use when working on frontend structure, app styling, CSS variables, themes, layout, React UI, desktop web renderer, or portal screens.
---

# NCAA Frontend Theming

## Purpose

Use this skill before changing UI, layout, CSS, or themes in NCAA Companion. The repo has two React surfaces that share a visual language but maintain separate stylesheets. The desktop UI is not in `apps/desktop`; Electron hosts the shared commissioner renderer in `apps/web`.

## Style Guide Source

Use `ncaa-styleguide.html` in this skill folder as the source of truth for the planned visual direction. It is the full NCAA Commissioner App style guide:

- Theme: Dark Field Retro (70s Gridiron)
- Fonts: `Bebas Neue` for display/headings and `IBM Plex Mono` for body/UI
- Palette: dark field backgrounds, teal primary UI, gold CTAs/highlights, rust/danger states, cream primary text
- Layout direction: topbar + compact left sidebar + scrollable main content
- Component direction: sharp retro panels, low-radius controls, top-accent panel variants, data-dense tables and cards

Read `ncaa-styleguide.html` before implementing a new theme, extracting CSS variables, redesigning shell layout, or changing shared button/panel/table styles.

## App Map

| Surface | Path | Role | Dev URL |
|---------|------|------|---------|
| Commissioner UI | `apps/web` | Assignments, imports, publish, advance, scanner | `http://127.0.0.1:5173` via desktop `dev` |
| Electron host | `apps/desktop` | Window, IPC, SQLite, OCR/capture, commissioner service | Runs with `@ncaa/web` |
| Coach portal | `apps/portal` | Hosted read-only dynasty views for coaches | `http://127.0.0.1:5180` |
| Hosted API | `apps/api` | Serves dynasty bundles to portal | `http://127.0.0.1:8787` |
| Domain contracts | `packages/domain` | Canonical UI data shapes (`Team`, `Player`, `Roster`, etc.) |

### Key files

| Concern | Commissioner (`apps/web`) | Portal (`apps/portal`) |
|---------|----------------------------|------------------------|
| Entry | `src/main.tsx` | `src/main.tsx` |
| Routing + shell | `src/App.tsx` | `src/App.tsx` |
| Main pages | `src/commissioner.tsx`, `src/commissioner-admin.tsx` | Coach pages in `src/App.tsx` |
| API layer | `src/api.ts` (`window.ncaa` / IPC) | `src/api.ts` (REST), `src/dynasty-data-context.tsx` |
| Styles | `src/styles.css` | `src/styles.css` |
| Assets | `public/college-football-comissioner-app-logo.svg` | Same logo + `public/temp_screenshots/` (OCR fixtures) |

### Data flow

```
Commissioner UI (apps/web)
  → getCompanionApi() / window.ncaa
  → apps/desktop preload + main (IPC)
  → commissioner-service, storage, parsers

Coach portal (apps/portal)
  → fetch VITE_API_URL (default :8787)
  → apps/api store
  → DynastyDataProvider → React pages
```

## Styling Baseline

### Current approach

- One global CSS file per app, imported from `main.tsx`.
- Class-based styling only. No Tailwind, CSS modules, or styled-components.
- No inline `style={}` in React surfaces today. Do not add inline styles for themeable UI.
- Fixed dark theme with hardcoded hex/rgba values. Minimal `:root` tokens (color, background, font-family only).
- Desktop-first layout: `body { min-width: 1000px }`.

### Existing shared design language

Both apps currently use the same core patterns:

- Background: navy gradient (`#07111f`, `#0f172a`, `#111827`)
- Text: `#f7fafc`; muted: `#94a3b8`; labels: `#93c5fd`
- Accent/CTA: cyan `#67e8f9`
- Layout: `.app-shell` (280px sidebar + main), `.sidebar`, `.panel`, `.grid`, `.nav-link`
- Controls: pill buttons, `.secondary`, `.danger` (web only), rounded inputs

Do not treat these current colors or rounded controls as the target theme. They are the baseline to migrate from.

### Target style guide tokens

When applying the uploaded guide, prefer these token families from `ncaa-styleguide.html`:

- Backgrounds: `--color-bg-base`, `--color-bg-surface`, `--color-bg-raised`, `--color-bg-overlay`
- Teal UI: `--color-teal-900`, `--color-teal-700`, `--color-teal-500`, `--color-teal-300`, `--color-teal-100`
- Gold accents: `--color-gold-500`, `--color-gold-700`, `--color-gold-900`
- Danger/result states: `--color-danger-*`, `--color-win`, `--color-loss`
- Text: `--color-text-primary`, `--color-text-muted`, `--color-text-faint`
- Typography: `--font-display`, `--font-body`, `--text-*`, `--tracking-*`, `--leading-*`
- Spacing/layout: `--space-*`, `--sidebar-width`, `--topbar-height`, `--panel-padding`, `--content-gap`
- Borders/radius: `--border-*`, `--panel-accent-*`, `--radius-none`, `--radius-sm`, `--radius-md`

### Stylesheet split

| File | Lines (approx) | Unique to this app |
|------|----------------|-------------------|
| `apps/web/src/styles.css` | ~1,230 | `.form-grid`, `.assignment-*`, `.import-toolbox`, `.editable-table`, `.combo-select-*`, commissioner tables |
| `apps/portal/src/styles.css` | ~775 | `.sign-in-*`, coach rows (`.user-game-row`, `.ranked-user-row`, `.player-row`), progression chart legend |

The first ~200 lines are nearly identical between the two files. Changes to shared shell/button/panel styles may need both files until a shared token layer exists.

### Dynamic classes

Prefer conditional `className` over inline styles. Example pattern in commissioner UI:

```tsx
className={`rank-${index + 1}`}  // expects .rank-1, .rank-2, ... in CSS
className={isActive ? 'nav-link active' : 'nav-link'}
```

## Frontend Rules

### Before editing UI

1. Open the React file and its app's `styles.css` together.
2. Confirm which surface you are changing: commissioner (`apps/web`) or portal (`apps/portal`).
3. Check whether the class already exists in CSS before adding a new one.
4. For data-driven colors, use domain `Team.primaryColor` / `Team.secondaryColor` with fallback from `packages/domain/src/team-catalog.ts`.

### Routing

- Both apps use `HashRouter` for static/Electron hosting. Do not switch to `BrowserRouter` without explicit request.
- Commissioner routes: `/commissioner/*`, `/scanner`, `/admin`
- Portal routes: `/sign-in`, `/portal/dynasties/:dynastyId/*`

### Electron vs browser

- Commissioner UI runs in Electron via `window.ncaa` exposed in `apps/desktop/src/preload.ts`.
- Browser-only builds use stub methods in `apps/web/src/api.ts`.
- Gate Electron-only features by checking optional API methods (e.g. `if (!api.getCommissionerConfig)`), not a hardcoded `isElectron` flag.

### Data shapes

- Render from `@ncaa/domain` types, not capture/OCR import types.
- Portal reads `DynastyBundle` via `dynasty-data-context.tsx`.
- Commissioner uses IPC `CompanionApi` types in `apps/web/src/api.ts` as transport only.

### Theming direction (future work)

When applying a new theme or extracting tokens:

1. Read `ncaa-styleguide.html` first and map its tokens to both app stylesheets.
2. Introduce the guide's CSS custom properties in `:root` before replacing hardcoded values.
3. Migrate shared shell/button/panel/table styles toward the guide's topbar/sidebar, sharp retro panels, low-radius controls, and data-table patterns.
4. Replace hardcoded hex values in both stylesheets or extract a shared base CSS file.
5. Keep team-specific colors data-driven via domain `Team` fields, not hardcoded in CSS.
6. Avoid inline styles; move one-off values into named classes or variables.
7. Consider a future `packages/ui` only if both apps need shared components, not just shared tokens.

## Workflow Checklist

Copy and track progress for UI/theme tasks:

```
Task progress:
- [ ] Identify target app (web vs portal vs both)
- [ ] Read `ncaa-styleguide.html` if applying the new theme
- [ ] Read relevant TSX + styles.css sections
- [ ] Check for existing class names before adding new ones
- [ ] Apply CSS changes in stylesheet, not inline
- [ ] Update both stylesheets if changing shared shell/button/panel styles
- [ ] Verify Electron-only vs portal-only behavior unchanged
- [ ] Run lint/typecheck on touched files
- [ ] Visually spot-check commissioner and/or portal if both affected
```

## Validation

After substantive UI edits:

1. Run `ReadLints` on changed TSX/CSS files.
2. Run targeted tests only when logic changed; CSS-only edits usually need visual verification.
3. Start dev servers to spot-check:
   - Commissioner: root `npm run dev` (desktop + web on :5173)
   - Portal: `npm run dev:portal` (:5180)
4. Ignore generated folders (`dist`, `node_modules`) and `temp_screenshots` unless explicitly working on OCR fixtures.

## Do Not

- Put themeable UI styling in inline `style={}` attributes.
- Edit `apps/desktop` expecting to find React UI components.
- Assume portal and web share one stylesheet; they do not.
- Use capture/OCR types (`RosterCaptureImport`, etc.) as render models in UI code.
- Refactor to CSS variables or a shared UI package unless the user explicitly requests that scope.

## Related Skills

- OCR/import UI flows: personal skill `ncaa-ocr-imports`; commissioner import UI in `apps/web/src/commissioner.tsx`
