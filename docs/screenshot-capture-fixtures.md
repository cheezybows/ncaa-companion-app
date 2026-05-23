# Screenshot capture fixtures

Ground-truth fixtures for the screenshot capture agent live under `packages/parsers/fixtures/capture/`.

## First fixture: partial roster (CB)

- **Screen:** CFB 25 `ROSTERS`, Oregon State, position tab `CB`
- **Scope:** 10 visible table rows; one highlighted player (`D.Biggums` / Demarquis Biggums)
- **Not in table:** archetype, hometown, dev trait, abilities — those come from the right detail panel only

Files:

| File | Role |
|------|------|
| `roster-cb-oregon-state.partial.jpg` | Source screenshot |
| `roster-cb-oregon-state.partial.meta.json` | UI regions, columns, navigation (`L2` / `R2`) |
| `roster-cb-oregon-state.partial.expected.json` | Expected extraction for tests |

Parser tests load meta + expected via `loadRosterCaptureFixture()` in `@ncaa/parsers`. Place the JPG beside the JSON files; tests assert the image fixture is present.

## Implications for the capture agent

1. **Per-position passes:** cycle `R2` (position) and capture each tab; table rows are not the full roster.
2. **Per-team passes:** cycle `L2` (team) when exporting league views.
3. **Scroll:** vertical scroll for more players; horizontal scroll for more attribute columns.
4. **Detail pass:** for dev trait / archetype / hometown, read the detail panel while each row is focused (or capture detail-only after highlighting).

## Expected extraction (ground truth)

Focused row `D.Biggums` must match the detail panel. Other visible rows only require name/class/OVR unless a full-table OCR pass is run.

```json
{
  "fixtureId": "roster-cb-oregon-state-partial",
  "table": {
    "focusedRowIndex": 4,
    "rows": [
      { "index": 0, "displayName": "J.Braxton", "classYear": "JR", "position": "CB", "ratings": { "overall": 87 } },
      { "index": 1, "displayName": "E.Ayers", "classYear": "JR", "position": "CB", "ratings": { "overall": 83 } },
      { "index": 2, "displayName": "N.Thomas Jr.", "classYear": "RS_SR", "position": "CB", "ratings": { "overall": 80 } },
      { "index": 3, "displayName": "S.Vadrawale III", "classYear": "RS_JR", "position": "CB", "ratings": { "overall": 77 } },
      {
        "index": 4,
        "displayName": "D.Biggums",
        "classYear": "FR",
        "position": "CB",
        "focused": true,
        "ratings": {
          "overall": 76,
          "speed": 93,
          "acceleration": 93,
          "agility": 89,
          "changeOfDirection": 88,
          "strength": 67,
          "awareness": 71,
          "playRecognition": 69,
          "manCoverage": 74
        }
      },
      { "index": 5, "displayName": "F.Simoneau", "classYear": "FR", "position": "CB", "ratings": { "overall": 75 } },
      { "index": 6, "displayName": "J.Paulding", "classYear": "RS_SO", "position": "CB", "ratings": { "overall": 74 } },
      { "index": 7, "displayName": "T.Crandall", "classYear": "RS_JR", "position": "CB", "ratings": { "overall": 74 } },
      { "index": 8, "displayName": "D.Vickers", "classYear": "RS_SR", "position": "CB", "ratings": { "overall": 73 } },
      { "index": 9, "displayName": "B.Clinton", "classYear": "FR", "position": "CB", "ratings": { "overall": 66 } }
    ]
  },
  "detailPanel": {
    "firstName": "Demarquis",
    "lastName": "Biggums",
    "position": "CB",
    "jerseyNumber": 2,
    "classYear": "FR",
    "archetype": "Boundary",
    "heightInches": 74,
    "weightLbs": 184,
    "hometown": "Sunnyvale, CA",
    "ratings": { "overall": 76 },
    "abilities": [
      { "name": "Quick Jump", "type": "physical" },
      { "name": "Road Dog", "type": "mental" }
    ],
    "developmentTrait": "Star"
  }
}
```

Table columns for OCR templates: `RS`, `NAME`, `YEAR`, `POS`, `OVR`, `SPD`, `ACC`, `AGI`, `COD`, `STR`, `AWR`, `PRC`, `MCV` (map to `RATING_DEFINITIONS` codes in `@ncaa/domain`).
