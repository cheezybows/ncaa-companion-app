---
name: ncaa-ocr-imports
description: Implements, debugs, and extends NCAA Companion screenshot OCR imports for rosters, schedules, Top 25 rankings, Tesseract preprocessing, multi-image merging, and commissioner review flows. Use when the user mentions OCR, Tesseract, screenshot uploads, capture imports, roster OCR, schedule OCR, Top 25 OCR, highlighted rows, week 0, or NCAA Companion image parsing.
---

# NCAA OCR Imports

## Purpose

Use this skill for NCAA Companion OCR/import work. The project keeps OCR runtime in the Electron desktop layer and parsing/merge logic in `@ncaa/parsers`, then saves results through the commissioner service for manual review, edit, and publish.

## First Steps

1. Inspect the relevant importer path before editing:
   - Desktop OCR/preprocess: `apps/desktop/src/ocr-service.ts`, `apps/desktop/src/ocr-preprocess.ts`, `apps/desktop/src/main.ts`
   - Import orchestration: `apps/desktop/src/commissioner-service.ts`, `apps/desktop/src/capture-import.test.ts`
   - Parser package: `packages/parsers/src/capture/*`
   - UI review/edit flow: `apps/web/src/commissioner.tsx`
2. Check existing fixtures under `packages/parsers/fixtures/capture` and `apps/portal/public/temp_screenshots`.
3. Prefer targeted parser tests first, then desktop capture/import tests.

## Architecture Rules

- Run OCR locally in the Electron desktop app. Do not send screenshots to the hosted API for OCR.
- Keep image region selection and Tesseract calls in `apps/desktop`.
- Keep text/token parsing, normalization, and capture models in `packages/parsers`.
- Save successful imports through `CommissionerService` so current manual edit/review behavior still applies.
- Preserve warning visibility. Do not silently hide conflicts or missing rows.

## Roster OCR

Current desired behavior:

- Prefer table-only crops and ignore player-card data unless explicitly requested.
- Use preprocessing regions in this priority when available:
  - `roster_selected_row`
  - `roster_precropped`
  - `roster_table_threshold`
- Do not add `roster_player_card` back as the default path unless the user asks for player-card parsing.
- Full screenshots may miss highlighted rows; table-only crops are preferred.
- Multi-image roster import must parse each page independently, then merge rows by stable key such as `position:displayName`.
- Normalize OCR position mistakes that have known fixes, especially `EOS` -> `LEDG`.
- Drop duplicate `ATH` rows when a real position row exists for the same player.
- Keep roster identity stable with `roster-merge.ts` name keys where possible.

Important known cases:

- Multi-screenshot roster import previously returned about 55 players because pages were merged before page-specific focused-row context. Keep page parsing independent.
- Highlighted rows were missing on some full-frame DT/RT/SS screenshots without player-card fallback.
- `POW` single-digit OCR `4` can mean `41` in punter captures.
- `roster-te.png` was known to be the wrong fixture in one testing pass; verify fixtures before tuning parsers.

## Schedule OCR

Current desired behavior:

- Include week `0` BYE rows and week `0` games.
- Pre-scan `N BYE` tokens before dated rows; do not assume the first `Sat` begins the schedule.
- Treat time tokens like `8:00 PM` as row terminators when parsing OCR token streams.
- Use `schedule_selected_row` preprocessing for highlighted rows, similar to roster selected row crops.
- Multi-image schedule merging should key rows by week, with conservative conflict warnings.

## Top 25 OCR

Current desired behavior:

- Top 25 screenshots may require multi-image merging.
- Merge by rank as the natural row ID.
- Dedupe identical rows automatically.
- If the same rank has missing/low-confidence fields, prefer the better value.
- If meaningful values conflict, choose a merged value but attach a warning for commissioner review.

## Multi-Image Merge Policy

Use natural row IDs:

- Top 25: rank
- Schedule: week
- Roster: player name plus position

Merge policy:

- Same ID and same values: dedupe silently.
- Same ID with empty or low-confidence fields: prefer higher confidence/non-empty values.
- Same ID with meaningful conflict: keep a chosen row, but preserve warnings.
- Top 25 and schedule can merge more aggressively than roster because rank/week are stronger identifiers than names.

## Preprocessing Guidance

- Add or adjust named regions in `apps/desktop/src/ocr-preprocess.ts`.
- Prefer explicit region names over one-off parser hacks.
- Use selected-row regions for highlighted rows.
- Keep preprocessing deterministic and covered by parser or desktop tests where practical.

## Testing Checklist

Run the smallest relevant tests first:

- Parser tests: `npm test -w @ncaa/parsers`
- Desktop capture/import tests: `npm test -w @ncaa/desktop`
- Package builds after type/model changes: `npm run build:packages`
- Desktop main build after Electron changes: `npm run build:main -w @ncaa/desktop`

When debugging a fixture:

1. Confirm the fixture is the right screenshot and position/screen type.
2. Compare OCR text/tokens before changing parser rules.
3. Add a regression test for the exact row/key that failed.
4. Avoid broad normalization rules that could corrupt unrelated names, teams, or ratings.

## Commissioner UX Expectations

- OCR output should land in the existing commissioner review/edit flow.
- Duplicates and conflicts should be visible through warnings rather than hidden.
- Current imports remain editable after OCR.
- Imported schedule/Top 25/roster data should still publish through the existing sync payload path.

## Avoid

- Do not move OCR to the hosted API without explicit user direction.
- Do not rely on player-card parsing for roster rows by default.
- Do not silently overwrite conflicting multi-image rows.
- Do not tune parser logic against a bad fixture without first verifying the source image.
- Do not add broad OCR substitutions unless they are scoped to a column/screen where they are known safe.
