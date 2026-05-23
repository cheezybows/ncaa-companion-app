# Post-Release Data Discovery

Use this checklist once the PC game is installed. Keep discovery read-only and copy candidate files into the app working directory before parsing.

## Locations To Inspect

- Game install directory.
- User documents folder.
- AppData local and roaming folders.
- Steam/Epic cloud save folders if applicable.
- Any game export, roster share, or dynasty save folders exposed by the game.

## Controlled Change Tests

Run one game action at a time, then rescan and compare timestamps, sizes, and hashes:

- Create a new dynasty.
- Edit one player rating.
- Change depth chart order.
- Advance one week.
- Complete a game.
- Add or remove a recruiting target.
- Advance offseason training to capture progression changes.

## Classification Notes

Record whether candidate files appear to be:

- Plain text, CSV, XML, or JSON.
- SQLite or another embedded database.
- Compressed archives.
- Binary/proprietary saves.
- Encrypted or checksum-protected.

## Parser Fixture Rules

- Never commit personal saves or licensed game assets.
- Keep sanitized samples under `packages/parsers/fixtures/`.
- Add a parser test before wiring a new parser into the app UI.
- Repeated imports must be idempotent and should not duplicate seasons, players, or snapshots.
