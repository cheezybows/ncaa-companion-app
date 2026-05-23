# Capture fixtures

Sanitized game UI screenshots and expected extraction payloads for OCR/template parser tests.

## Roster (partial, one highlighted player)

| File | Purpose |
|------|---------|
| `roster-cb-oregon-state.partial.jpg` | Source screenshot (CFB 25 rosters, Oregon State CB group) |
| `roster-cb-oregon-state.partial.meta.json` | Screen layout, regions, navigation hints |
| `roster-cb-oregon-state.partial.expected.json` | Ground-truth rows + detail panel for the highlighted player |

Copy your roster screenshot to `roster-cb-oregon-state.partial.jpg` if it is not already present. Tests skip image byte checks when the JPG is missing but still validate the expected JSON fixture.
