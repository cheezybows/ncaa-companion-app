# OCR / Screenshot Capture Evaluation

OCR is a fallback path if local game files are encrypted, incomplete, or too hard to parse safely.

## When To Use It

- Roster and dynasty files cannot be decoded reliably.
- Important values only appear in game screens.
- Player progression data is visible but not stored in readable files.

## Safe Approach

- User starts a guided capture session from the companion app.
- App asks the user to open a specific game screen.
- User captures screenshots or grants screen capture permission.
- OCR extracts table data into a review screen.
- User confirms uncertain values before saving.
- Confirmed data uses the same domain models as parsed file data.

## Avoid

- Process injection.
- Memory scraping.
- Automated inputs that could trigger anti-cheat or terms-of-service issues.
- Writing back into game files.

## First OCR Targets

- Roster tables.
- Depth chart screens.
- Player card ratings.
- Training results and progression screens.
- Recruiting board summary tables.
