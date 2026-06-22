# Events-over-time Panel — Design

- **Date:** 2026-06-21
- **Status:** Approved (design); ready for implementation plan
- **Scope:** `apps/api` + `apps/web`. No DB schema change.
- **Base:** `feat/telemetry-expansion` (this builds on the telemetry dashboard panels; it should land after / on top of that work).

## Goal

Replace the low-value **Live activity** feed (a flat list of the last 100 raw events) with one interactive **Events over time** chart that visualizes event volume over the selected range, with controls for breakdown, event-type filtering, and granularity.

## Background — current state

- `apps/web/src/routes/admin/index.tsx` renders `ActivityFeed` (full-width, last 100 events) via `useActivity()` → `GET /api/admin/activity` (returns `{ items: [...] }`).
- The dashboard already has a date-range selector (`days` = 7/30/90) driving `useMetrics(days)`, and recharts time-series panels (`Growth` = daily signups, `ActiveUsage` = daily distinct users). The metrics route buckets with `date_trunc('day', created_at)`.
- `apps/web/src/lib/week.ts` provides `mondayOf(date)` and `dayKey(date)` (already used by Weekly focus) for Monday-based week bucketing.

## Design

### 1. New component: `EventsOverTime` panel

`apps/web/src/routes/admin/panels/events-over-time.tsx` — full-width brand card (white, `border-silver`, `text-slate-soft` heading), replacing `ActivityFeed` in `index.tsx`. Three header controls (local `useState`):

- **Breakdown** — segmented `Total` ↔ `By type`.
  - `Total`: recharts `AreaChart`, one copper series = sum of the selected categories per bucket.
  - `By type`: recharts stacked `BarChart`, one stacked series per selected category (category colors).
- **Event filter** — toggle chips, one per category (default all on). Toggling a category off removes it from the chart in both modes. (Narrowing to only **Page views** yields the "page views over time" line.)
- **Granularity** — segmented `Day` ↔ `Week`.

All three controls recompute the chart **client-side** from a single fetched dataset (no refetch) via a `useMemo`.

### 2. Data: one new metrics field (single fetch)

- `apps/api/src/routes/admin.ts` `/metrics`: add **`eventsByDay: { day: string; name: string; count: number }[]`** — `select to_char(date_trunc('day', created_at),'YYYY-MM-DD') as day, name, count(*)::int as count from events where created_at >= ${since} group by 1, 2 order by 1`. (Mirrors the existing `signups`/`active` queries; range-windowed by the existing `since`.)
- `apps/web/src/routes/admin/use-metrics.ts`: add `eventsByDay: { day: string; name: string; count: number }[]` to the `Metrics` type.

The panel derives all views from `eventsByDay`:
1. **Filter** rows whose category is toggled on.
2. **Bucket** by `day` (granularity=Day) or by the Monday of each day via `mondayOf`/`dayKey` (granularity=Week).
3. **Shape**: `Total` → sum counts per bucket into `{ bucket, total }`; `By type` → pivot into `{ bucket, [category]: count }` for stacking.

Buckets with no events render as gaps in the (sparse) day/week series — acceptable; the existing panels behave the same.

### 3. Category mapping (client-side)

`apps/web/src/routes/admin/panels/event-category.ts` — a pure `eventCategory(name): Category` plus an ordered `CATEGORIES` list with brand colors:

| Category | Matches | Color |
|---|---|---|
| Page views | `page.viewed` | copper `#c8893b` |
| Training | `training.*`, `focus.*` | ice `#7fb8d6` |
| Journal & dogs | `journal.*`, `dog.*` | slate `#28323d` |
| Briefs | `brief.*` | gold `#e0a85a` |
| Directory | `trainer.viewed`, `course.viewed` | `#9bbf9b` (sage) |
| Auth | `user.*` | `#a98bd0` (muted violet) |
| Other | anything unmatched | `#c9d4dd` (silver) |

Colors live only in this module so the chart and the filter chips stay in sync.

### 4. Removed (dead code after the swap)

- `apps/web/src/routes/admin/panels/activity-feed.tsx` (delete) and its tests in `panels.test.tsx`.
- `useActivity` hook + the `Activity` type in `use-metrics.ts`.
- `GET /api/admin/activity` route in `admin.ts` and its assertions in `admin.test.ts`.
- `ActivityFeed`/`useActivity` usage + the activity `fetch` mock in `index.tsx` / `index.test.tsx`.

## Files

**New**
- `apps/web/src/routes/admin/panels/events-over-time.tsx`
- `apps/web/src/routes/admin/panels/event-category.ts`
- `apps/web/src/routes/admin/panels/event-category.test.ts`
- `apps/web/src/routes/admin/panels/events-over-time.test.tsx`

**Modified**
- `apps/api/src/routes/admin.ts` — add `eventsByDay`; remove `/activity`.
- `apps/api/src/routes/admin.test.ts` — assert `eventsByDay`; drop `/activity`.
- `apps/web/src/routes/admin/use-metrics.ts` — add `eventsByDay` to `Metrics`; remove `useActivity` + `Activity`.
- `apps/web/src/routes/admin/index.tsx` — render `EventsOverTime`; remove `ActivityFeed`/`useActivity`.
- `apps/web/src/routes/admin/index.test.tsx` — add `eventsByDay` to the mock; drop the activity fetch/branch.
- `apps/web/src/routes/admin/panels/panels.test.tsx` — drop `ActivityFeed` tests.

**Deleted**
- `apps/web/src/routes/admin/panels/activity-feed.tsx`

## Testing

- **API** (`@turingcare/api`, real Postgres): `/metrics` returns `eventsByDay` grouped by day+name in date order; `GET /api/admin/activity` returns 404 (removed).
- **Web** (jsdom):
  - `event-category.test.ts`: `eventCategory` maps representative names to the right category.
  - `events-over-time.test.tsx`: renders a chart from a fixture; toggling a category chip off removes its series; switching `Day`→`Week` collapses day buckets into weeks; `Total`↔`By type` swaps chart shape. Use recharts in a fixed-size container (mock `ResizeObserver` is already in `src/test/setup.ts`).
- Gate: `pnpm --filter @turingcare/web test`, `pnpm --filter @turingcare/api test`, `pnpm lint`, `pnpm -r typecheck`.

## Non-goals (deferred)

- Hour-level granularity, custom date ranges, or comparison-to-previous-period.
- Per-event (vs per-category) breakdown/filter — categories keep the stack and chips legible.
- Auto-refresh/polling ("live"); the existing range refetch is enough.
- Drill-down from a bucket to the raw events.

## Risks

- **recharts under jsdom**: charts need a sized container; tests render inside a fixed-width wrapper and rely on the existing `ResizeObserver` stub. Assert on rendered labels/legend/series role rather than pixel geometry.
- **Sparse buckets**: days/weeks with zero events are simply absent from `eventsByDay`; the chart shows gaps (consistent with `Growth`/`ActiveUsage`). Acceptable for v1.
- **`By type` busyness**: capped at the 7 fixed categories (not raw event names), so the stack and legend stay readable.
