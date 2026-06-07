# Weekly skill focus ("This Week") — Design

**Date:** 2026-06-07
**Status:** Approved (design)

## Problem

Owners log training sessions per skill, but there's no way to commit to *which*
skills to work on over a week, or to see at a glance whether they actually put
time on the right ones. The raw data exists (`practice_sessions`, dated per
skill) — what's missing is **intention** (pick this week's focus) and
**reflection** (did the sessions land on those skills, on which days).

## Concept

A per-dog **focus list** (the owner picks skills to work on) rendered as a
**week grid**: focus skills × 7 days (Mon–Sun). A filled cell means a practice
session was logged for that skill on that day.

- **Tap an empty cell** (today or a past day) to log a quick session for that
  skill on that day — the dot fills immediately.
- **Tap a filled cell** to see that day's sessions (time + duration if present)
  with a remove ✕ and a "Log another" action.
- **Future cells are disabled** (can't train in the future).
- **Page ◀ to prior weeks**; forward paging is capped at the current week.
- **Presence-only** — no per-skill targets, no streaks. Weekly success reads as
  "Trained X of N focus skills · Y sessions."

The focus list is a **single evolving list per dog** that the owner edits
anytime. History across weeks comes for free: the grid re-buckets the dog's
existing dated sessions for whichever week is in view. (Trade-off, accepted for
MVP: paging back shows the *current* focus skills, not a historical snapshot of
what was focused that week.)

## Data model

New table `weekly_focus` (migration 0009):

| column      | type          | notes                                  |
|-------------|---------------|----------------------------------------|
| `id`        | uuid PK       |                                        |
| `dogId`     | uuid          | FK → `dogs.id`, cascade on delete      |
| `skillId`   | uuid          | FK → `training_skills.id`, cascade     |
| `position`  | integer       | default 0; order within the grid       |
| `createdAt` | timestamptz   | default now()                          |

- Unique constraint `(dogId, skillId)` — a skill is focused at most once.
- `dogId` is stored (denormalized from skill→goal→dog) for simple owner-scoping
  and the unique constraint; adds validate that the skill belongs to the dog.
- No change to `practice_sessions`. The grid is computed from existing sessions.

## API (owner-scoped, under `/api/dogs/:id`)

- `GET …/focus?weekStart=<ISO>&weekEnd=<ISO>`
  Returns the dog's focus skills (each with `skillId`, `name`, `goalId`,
  `goalName`, `position`) and, per skill, the sessions whose `occurredAt` falls
  in `[weekStart, weekEnd)` (`id`, `occurredAt`, `durationMinutes`). The client
  passes local week bounds (local midnight Monday → next Monday) so day-bucketing
  is timezone-correct; the server filters by the instant range and does no
  day math.
- `POST …/focus { skillId }` — add a skill to the focus list. Validates the
  skill belongs to the dog (404 if not / cross-dog); 409 if already focused.
- `DELETE …/focus/:skillId` — remove from the focus list (404 if not focused).
- **Tap-to-log reuses existing endpoints** — no new logging route:
  - log: `POST …/skills/:skillId/sessions { occurredAt }` (`occurredAt` = that
    day; today → current time, a past day → 12:00 local).
  - remove: `DELETE …/skills/:skillId/sessions/:sessionId`.

Shared zod (`packages/shared`): `focusAddSchema = z.object({ skillId: z.string().uuid() })`.

## Web

- New **This Week** tab in `<DogLayout>` (5th tab: Overview / Journal / Training
  / Brief / This Week) → route `apps/web/src/routes/dog-week.tsx`.
- `apps/web/src/lib/weekly-focus.ts`: `useFocusWeek(dogId, weekStart)`,
  `useAddFocus(dogId)`, `useRemoveFocus(dogId)`. Reuse `useLogSession` /
  `useDeleteSession` from `lib/progress.ts`.
- Components:
  - `WeekGrid` — rows = focus skills, 7 day columns (Mon–Sun), dots per cell;
    future cells disabled; cell-tap interactions above.
  - `FocusPicker` — add/remove skills from the dog's existing skills, grouped by
    goal (checkbox list).
  - `WeekNav` — ◀ / "This week" / ▶ (▶ disabled at the current week).
- Header summary for the visible week: "Trained **X of N** focus skills ·
  **Y** sessions."
- Cell popover (filled cell): lists that day's sessions for that skill (time +
  duration if any) with remove ✕ and "Log another."
- Empty states: no skills anywhere for the dog → CTA to the Training tab; focus
  list empty → "Pick skills to focus on this week" → opens `FocusPicker`.

## Conventions

- Week starts **Monday**; "this week" is computed in the browser's local
  timezone.
- No hard cap on focus count (UI comfortable up to ~8; we recommend ~5).
- After any log/remove, invalidate the focus-week query and `["progress"]` so the
  grid and the Training spoke stay in sync.

## Testing

- **API:** add/remove (ownership, duplicate → 409, cross-dog → 404); GET returns
  only in-range sessions; cascade removes focus rows when a skill is deleted.
- **Web:** grid renders dots from sessions; tap-empty logs a session; tap-filled
  removes; week paging (forward cap); picker add/remove; both empty states;
  i18n en/es parity (new keys differ between catalogs).

## Out of scope (MVP)

Per-skill targets/streaks; per-week focus snapshots; an Overview summary card;
cross-dog/all-dogs weekly view; reminders or notifications. All are natural
follow-ups once the core grid proves useful.
