---
name: ncaa-demo-json-builder
description: Builds and updates NCAA Companion app-readable demo dynasty JSON bundles. Use when creating demo seed JSON, editing demo-dynasty.json, simulating seasons, rosters, schedules, rankings, player progression, coach users, team tenure switches, or fake demo users.
---

# NCAA Demo JSON Builder

## Purpose

Use this skill for standalone demo dynasty JSON files, especially `apps/portal/public/temp_screenshots/demo-dynasty.json`. The file should be app-readable first, with enough metadata to explain how the demo was built.

## Target Contract

Prefer the portal/API bundle shape:

- `dynasty`: `Dynasty` with `seasons`, `recruitingClasses`, optional archive fields
- `teams`: real `Team[]` entries from `packages/domain/src/team-catalog.ts`
- `rosters`: `Record<teamId, Roster>` for current rosters
- `progression`: `PlayerProgression[]`
- `checkpoints`: `DynastyCheckpoint[]`
- `playerCatalog`: `PlayerCatalogEntry[]`
- `postseasonResults`, `rankings`, `syncBatches`, `importState`
- Demo-only support fields are allowed: `schemaVersion`, `source`, `users`, `coachCareers`, `teamTenures`, `activeUserId`

Use real school teams for `teams` and fake people for users/coaches.

## Builder Rules

1. Preserve app contracts from `@ncaa/domain` and `apps/portal/src/api.ts`.
2. Use deterministic IDs and timestamps so diffs are reviewable.
3. Keep tracked teams in sync across `teams`, `rosters`, `importState.trackedTeamIds`, roster players, schedules, rankings, checkpoints, and tenures.
4. Include weeks `0` through `6` when simulating weekly progression.
5. For multi-season demos, model player exits through `playerCatalog.exitStatus`:
   - seniors or redshirt seniors missing next season: `graduated`
   - underclassmen missing next season: `transferred`
6. Simulate coach movement with `teamTenures`:
   - previous tenure: `status: "transferred"` or `completed`, with `endSeasonYear`
   - new/current tenure: `status: "active"`, no `endSeasonYear`
7. Keep Top 25 data in `rankings` and checkpoint `rankingSnapshot`; do not mix ranking uploads into team-upload UI data.
8. Record source assumptions in `source.notes`.

## Current Demo Expectations

For `demo-dynasty.json`, preserve these high-level scenarios unless the user asks otherwise:

- Tracked real teams: Iowa, Iowa State, Colorado
- Fake coach users assigned through `users`, `coachCareers`, and `teamTenures`
- One coach switches teams after the second season
- Three seasons of data with weeks `0` through `6`
- Roster, schedule, Top 25, progression, and old-player archive behavior represented

## Validation

After editing a demo JSON bundle, run:

```bash
node .cursor/skills/ncaa-demo-json-builder/scripts/validate-demo-dynasty.cjs apps/portal/public/temp_screenshots/demo-dynasty.json
```

Fix any reported contract drift before finishing.
