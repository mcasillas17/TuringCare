# Skill Milestones — Design

**Date:** 2026-06-21
**Status:** Approved (design), pending spec review
**Scope:** Make each training skill's 5 levels **checkable milestones** with dated completion. First of three sequenced sub-projects (milestones → progress-over-time → training dashboard); this one is the foundation.

## Problem

Training tracking already has goals → skills → practice sessions, and each skill carries a manual **confidence** number (1–5). Template skills additionally have 5 written level descriptions, but those are **read-only** — you can't act on them. So "progress" is a slider you set by hand, the rich milestone descriptions are decorative, and we never record **when** a level was reached. That last gap also blocks the next sub-project (progress-over-time needs dated history).

## Goals

- Turn the 5 levels into **checkable milestones**: tap a level to set the skill there; the level you've reached *is* the skill's level.
- **Record the date** each level is reached (history), so later features can chart trends.
- Keep it consistent across **template skills** (rich per-level descriptions) and **free-form skills** (generic labels).
- Reuse the existing `confidence` column as the denormalized "current level" so everything that already reads it (Brief, This Week grid, avg-confidence rollups) keeps working with no change.

## Non-goals

- **No** progress-over-time charts / streaks (next sub-project).
- **No** training dashboard / rollup (third sub-project).
- **No** practice reminders/notifications.
- **No** custom milestone authoring for free-form skills (they use generic labels; authoring is a possible later extension).
- No change to goals, sessions, weekly focus, or the catalog content itself.

## Decisions (from brainstorming)

1. **Milestones replace manual confidence.** A skill's level = the highest milestone reached. The 1–5 confidence chip is removed; you advance by completing milestones. `confidence` stays as the stored "current level".
2. **Every skill has 5 levels.** Level 1 = baseline ("Not yet" / the template's level-1). Real progress = advancing 1→5. Template skills render the catalog's per-level descriptions; free-form skills render the generic labels (`progress.level1..level5`: Not yet / Learning / Sometimes / Usually / Consistently).
3. **Correction allowed.** Tapping a lower level moves the current level down; earned dates are kept (history is append-mostly).

## Data model

Reuse `trainingSkills.confidence` (int, 1–5) as the current level. Add one table for dated history:

```
skill_milestones
  id          uuid pk
  skill_id    uuid  fk → training_skills(id) on delete cascade
  level       int   (2–5)            -- level 1 is baseline, never recorded
  reached_at  timestamptz not null
  unique (skill_id, level)
```

- Drizzle: add `skillMilestones` to `apps/api/src/db/schema.ts`; generate a migration (new table only — no column changes, no data backfill).
- **No backfill.** "Reached" is derived: a level is reached iff `level <= confidence`. The table only overlays *dates* for levels reached after this ships. Existing skills show their already-reached levels with **no date** (rendered like the level-1 "start" baseline) until they advance further.

## API

**Set level** — replaces the current confidence-set path.
`PUT /dogs/:id/skills/:skillId/level` body `{ level: 1..5 }`:
- `findOwnedSkill(dogId, skillId)` → 404 if not owned (existing helper).
- Set `trainingSkills.confidence = level`.
- For each `L` in `2..level` with no existing `skill_milestones` row for that skill, insert `{ skillId, level: L, reachedAt: now }`. (Records advancement dates; lowering the level inserts nothing and deletes nothing.)
- Return the updated skill.

**Progress read** — `loadProgress` (`apps/api/src/lib/progress.ts`) additionally returns each skill's recorded dates:
- `ProgressSkill` gains `milestones: { level: number; reachedAt: string }[]` (the rows from `skill_milestones`, ascending). `confidence` continues to be the current level. Implemented with one extra query joined to the loaded skills (mirrors how sessions are loaded).

**Removed/changed:** the existing confidence-only update route (`apps/api/src/routes/dogs.ts` confidence handler) is replaced by the level endpoint above. Skill name edit / remove / session routes are unchanged.

**Shared schema** (`packages/shared/src/progress.ts`): add `skillLevelSchema = z.object({ level: z.number().int().min(1).max(5) })`; extend the `ProgressSkill` type with `milestones`.

## Web UI

All in the Training tab's progress panel — no new screen.

- **`apps/web/src/components/progress/confidence-chip.tsx` → replaced** by a new `milestone-stepper.tsx`.
- **`apps/web/src/components/progress/progress-panel.tsx`** — render the stepper in the expanded skill where the chip was; show a level badge on the collapsed skill row.

**Collapsed skill row:** a badge `Level {n} — {label}` (template short label or generic label) instead of the bare number.

**Expanded skill — milestone stepper** (vertical, 5 rows):
- For each level 1–5: a state dot, the level number, the description (template) or generic label (free-form), and meta.
- **Reached** (`level <= confidence`): filled ✓ dot; meta = `✓ reached {date}` when a `skill_milestones` date exists, else `start` (level 1) / blank (pre-existing reached levels without a recorded date).
- **Current** (`level === confidence`): highlighted row + accent dot.
- **Next** (`level === confidence + 1`): outline dot + a primary `Tap to mark reached →` affordance.
- **Future** (`level > confidence + 1`): faint outline dot + `—`.
- Tapping any level calls the set-level mutation (advance or correct). Level descriptions come from the existing client catalog lookup (`findCatalogSkill(catalogSkillKey)`) for template skills; generic labels (`progress.level1..5`) for free-form.
- The rest of the expanded skill (Log session, recent sessions, Edit, Remove) is unchanged.

**Hooks** (`apps/web/src/lib/progress.ts`): replace the confidence-set mutation with `useSetSkillLevel(dogId)` calling the new endpoint and invalidating `["progress", dogId]` (+ existing invalidations). `ProgressSkill` type gains `milestones`.

## Brief integration (small, optional)

`apps/api/src/lib/brief.ts` already prints `Sit — 3/5`. Upgrade to include the level label and, when present, the date: `Sit — Level 3: Sometimes (reached Jun 3)`. Confidence-label map already exists in brief.ts. Low-risk text change; covered by brief tests.

## i18n

Add to `apps/web/src/i18n/en.ts` + `es.ts` (parity-safe): stepper strings — `progress.milestonesTitle` ("Milestones · current level {n} of 5"), `progress.levelN` (exists), `progress.reachedOn` ("reached {date}"), `progress.markReached` ("Tap to mark reached"), `progress.levelStart` ("start"), `progress.currentLevel` ("current"), `progress.levelBadge` ("Level {n} — {label}"). Reuse existing `progress.level1..level5`. Keep the i18n parity test green (es values differ from en).

## Testing

- **API:** set-level sets `confidence` and inserts `reached_at` rows for newly-reached levels only; idempotent re-set doesn't duplicate rows (unique constraint); lowering the level keeps existing dates; cross-dog skill → 404; `loadProgress` returns `milestones` ascending. (Runs in CI against Postgres.)
- **Web:** stepper renders 5 levels with correct reached/current/next/future states from `confidence` + `milestones`; tapping the next level calls the mutation with the right level; free-form skill shows generic labels, template skill shows catalog descriptions; collapsed badge shows the level label.
- **Shared:** `skillLevelSchema` accepts 1–5, rejects 0/6.
- i18n parity green; full web vitest + tsc + biome clean; api tsc + tests.

## Out of scope / follow-ups (next sub-projects)

- **Progress over time:** use the `skill_milestones` dates + practice sessions for per-skill trend/streak/history views.
- **Training dashboard:** roll up levels, recent advances, and streaks across all goals/skills.
- Custom milestone text for free-form skills (authoring UI).
