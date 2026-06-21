# Telemetry Expansion — Design

- **Date:** 2026-06-21
- **Status:** Approved (design); ready for implementation plan
- **Scope:** `apps/api` + `apps/web`. No DB schema change — the `events` table already stores everything.
- **Base:** `origin/main` (the admin redesign #53 is now live, and #54 "Skill milestones" added a new `PUT /:id/skills/:skillId/level` mutation that is also instrumented here).

## Goal

Make the admin analytics real and useful: actually emit feature-usage events (today almost nothing is instrumented), and surface them on the redesigned admin dashboard.

## Background — current state

- The telemetry scaffolding is solid: an `events` table, an error-safe server writer `recordEvent` (`apps/api/src/telemetry/record-event.ts`), a rate-limited ingest endpoint `POST /api/events` with a privacy-safe schema (`apps/api/src/telemetry/events.ts`), a 180-day retention job, and an aggregating metrics route (`apps/api/src/routes/admin.ts`).
- **But only three events are ever emitted:** `user.signed_up`, `user.signed_in` (auth hooks in `auth.ts`), and `page.viewed` (client `PageViewTracker` → `track()` → `POST /api/events`).
- **`dog.created`, `journal.entry_created`, `brief.generated` are declared in `KNOWN_EVENTS` but never recorded anywhere.** The metrics funnel queries those names, so first_dog / first_journal / first_brief always read 0.
- The metrics route already computes **`eventVolume`** (count by event name) but no dashboard panel renders it. `page.viewed` records `props.path` but nothing aggregates per-path views.

## Design

### 1. Event taxonomy (curated core)

**Hybrid emission** (decision): server-side `recordEvent(...)` for data mutations; client-side `track(...)` only for pure view events. Identity is always resolved server-side from the auth cookie (client-claimed identity is ignored), so events stay spoof-resistant on the server side and privacy-safe on the client side.

**Server-emitted** (added inside the existing `dogs.ts` handlers, after the successful DB write, awaited like the existing `recordEvent` calls):

| Event | Handler (`apps/api/src/routes/dogs.ts`) | Props |
|---|---|---|
| `dog.created` | `POST /` | `{}` |
| `journal.entry_created` | `POST /:id/journal` | `{ kind }` (the entry's `kind`, e.g. moment/checkin) |
| `brief.generated` | `POST /:id/brief` | `{ window }` (the `briefGenerateSchema` window) |
| `brief.finalized` | `PUT /:id/brief` | `{}` |
| `brief.shared` | `POST /:id/brief/share` | `{}` |
| `brief.emailed` | `POST /:id/brief/send` | `{}` (only after a successful send) |
| `training.goal_added` | `POST /:id/goals` **and** `POST /:id/goals/from-template` | `{ source: "custom" \| "template" }` |
| `training.practice_logged` | `POST /:id/skills/:skillId/sessions` | `{}` |
| `focus.week_set` | `POST /:id/focus` | `{}` |
| `training.level_set` | `PUT /:id/skills/:skillId/level` | `{ level }` (skill milestone 1–5; from #54) |

`dog.created`, `journal.entry_created`, `brief.generated` already exist in `KNOWN_EVENTS`; the other seven names are **new** and must be added to `KNOWN_EVENTS`.

**Client-emitted** (pure views) via the existing `track(name, props)` helper:

| Event | Where | Props |
|---|---|---|
| `trainer.viewed` | `apps/web/src/routes/trainer-detail.tsx` (on mount) | `{ id }` |
| `course.viewed` | `apps/web/src/routes/course-detail.tsx` (on mount) | `{ id }` |

These two names must be added to **`CLIENT_EVENTS`** and therefore to the `eventIngestSchema` `name` enum in `apps/api/src/telemetry/events.ts`, so the ingest endpoint accepts them. All props remain scalar-only and ≤1KB (existing guard). `id` is the internal trainer/course UUID (not PII).

Net: 9 new event names; the funnel's three middle steps light up for the first time.

### 2. Ingest / allowlist changes (`apps/api/src/telemetry/events.ts`)

- Extend `KNOWN_EVENTS` with: `brief.finalized`, `brief.shared`, `brief.emailed`, `training.goal_added`, `training.practice_logged`, `focus.week_set`, `training.level_set`, `trainer.viewed`, `course.viewed`.
- Extend `CLIENT_EVENTS` with: `trainer.viewed`, `course.viewed`. (`eventIngestSchema` derives its `name` enum from `CLIENT_EVENTS`, so this is the only ingest change.)
- `recordEvent`'s `name: EventName` typing then accepts the new server names automatically.

### 3. Dashboard surfacing (`apps/web/src/routes/admin/`)

- **Feature usage panel** (new `panels/feature-usage.tsx`): a bar chart of the already-computed `eventVolume`, **excluding `page.viewed`** (covered by Top pages) so feature events are legible. Brand-styled (white card, `border-silver`, copper bars) to match the redesigned panels.
- **Top pages panel** (new `panels/top-pages.tsx`): a horizontal bar/list of the most-viewed paths, range-windowed. Requires a new aggregation in the metrics route.
  - `apps/api/src/routes/admin.ts`: add a `topPages` query — `select props->>'path' as path, count(*) from events where name = 'page.viewed' and created_at >= since group by 1 order by 2 desc limit 10` — and include `topPages: { path, count }[]` in the `/metrics` response.
  - `apps/web/src/routes/admin/use-metrics.ts`: add `topPages: { path: string; count: number }[]` to the `Metrics` type.
- **Funnel:** no UI change; it simply becomes populated once the events emit.
- Wire both panels into `apps/web/src/routes/admin/index.tsx` (e.g. a two-column row, matching the existing ActiveUsage/Funnel row).

### 4. Privacy & retention (unchanged)

Keep the existing model: client ingest stays locked to the `CLIENT_EVENTS` allowlist with scalar-only props ≤1KB; identity is resolved server-side from the session cookie and never trusted from the client; the 180-day retention job (`EVENT_RETENTION_DAYS`) continues to apply. New props are internal IDs/enums only — no free text, names, or PII.

## Files

**Modified**
- `apps/api/src/telemetry/events.ts` — extend `KNOWN_EVENTS` + `CLIENT_EVENTS`.
- `apps/api/src/routes/dogs.ts` — 9 `recordEvent(...)` calls at the emit sites above.
- `apps/api/src/routes/admin.ts` — add `topPages` aggregation to `/metrics`.
- `apps/web/src/routes/admin/use-metrics.ts` — add `topPages` to `Metrics`.
- `apps/web/src/routes/admin/index.tsx` — render the two new panels.
- `apps/web/src/routes/trainer-detail.tsx` — `track("trainer.viewed", { id })` on mount.
- `apps/web/src/routes/course-detail.tsx` — `track("course.viewed", { id })` on mount.

**New**
- `apps/web/src/routes/admin/panels/feature-usage.tsx`
- `apps/web/src/routes/admin/panels/top-pages.tsx`
- Tests colocated (see below).

## Testing

- **API (`@turingcare/api`, real Postgres):**
  - Extend `dogs.test.ts` (or a focused telemetry test) to assert that after each instrumented action a matching row lands in `events` (query by `name` + `userId`). At minimum cover `dog.created`, `journal.entry_created`, `brief.generated`, `training.practice_logged`, `focus.week_set`, and one brief lifecycle event.
  - Add a metrics-route test that `topPages` aggregates `page.viewed` paths in rank order.
- **Web (`@turingcare/web`, jsdom):**
  - `panels/panels.test.tsx` (or new files): the Feature usage panel renders bars and excludes `page.viewed`; the Top pages panel renders paths + counts.
  - `trainer-detail` / `course-detail`: mock `@/lib/track` and assert `track("trainer.viewed", { id })` / `track("course.viewed", { id })` fire on mount.
- Gate with `pnpm --filter @turingcare/web test`, `pnpm --filter @turingcare/api test`, `pnpm lint`, `pnpm -r typecheck`.

## Non-goals (deferred)

- Retention/cohort analysis and per-user drill-down.
- New funnel steps beyond the existing four.
- Changes to the dashboard date-range selector or the existing KPI/Growth/ActiveUsage panels.
- Instrumenting auth flows (password reset, verification), settings, language toggle, concerns, skills, milestones, or dog update/delete (could be a later, comprehensive pass).

## Risks

- **`eventVolume` dominated by high-volume events:** mitigated by excluding `page.viewed` from the Feature usage panel; `user.signed_in`/`user.signed_up` remain but are low-volume and meaningful.
- **Client view double-counting in dev:** `trainer.viewed`/`course.viewed` fire from a mount effect, so React StrictMode double-fires them in dev (same caveat as `page.viewed`); harmless in production.
- **Touching the large `dogs.ts`:** keep each `recordEvent` call minimal and adjacent to its existing success path; do not restructure the file.
