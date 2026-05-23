# Screenshot capture fixtures

Universal screenshot layout references live under `packages/parsers/fixtures/capture/`.

## Layout-first capture

Capture assets should describe reusable screen structure, not stable game values. Player names, team names, ratings, opponents, scores, records, and rankings change by upload and should come from OCR/manual entry.

Files:

| File | Role |
|------|------|
| `universal-layouts.json` | Reusable roster, schedule, and Top 25 table schemas |

## Implications for the capture agent

1. **Per-position passes:** cycle `R2` (position) and capture each tab; table rows are not the full roster.
2. **Per-team passes:** cycle `L2` (team) when exporting league views.
3. **Scroll:** vertical scroll for more players; horizontal scroll for more attribute columns.
4. **Detail pass:** for dev trait / archetype / hometown, read the detail panel while each row is focused (or capture detail-only after highlighting).

Team-specific screenshot images, meta files, and expected-value JSON files were intentionally removed. Parser tests should validate reusable layout and extraction shape instead of asserting fixed team/player values.
