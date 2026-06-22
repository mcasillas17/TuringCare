# Events-over-time Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Live activity feed with one interactive "Events over time" chart (breakdown toggle, category filter chips, Day/Week granularity), fed by a single new `eventsByDay` metrics field.

**Architecture:** The API adds `eventsByDay` (day × event-name counts) to `/metrics`. The web panel derives everything client-side: a pure `eventCategory` map + a pure `buildSeries` bucketer produce the chart data; the panel renders a recharts `AreaChart` (Total) or stacked `BarChart` (By type). The old activity feed + `/api/admin/activity` are removed.

**Tech Stack:** Hono + Drizzle (API), React 19 + recharts + TanStack Query (web), Vitest + Testing Library, Biome.

---

## Setup (run once in the worktree before Task 1)

Worktree: `/Users/elopenmike/build/Apps/Care/TuringCare/.worktrees/events-timeseries` (branch `feat/events-timeseries`, based on the telemetry branch).

- [ ] Install deps: `pnpm install`
- [ ] API tests (Task 3) need Postgres + env (shared dev DB; schema already current):
  ```bash
  cp ../../.env .env
  docker compose up -d --wait   # harmless if the container is already running
  set -a && . ./.env && set +a
  pnpm --filter @turingcare/api db:push
  ```
  Re-run `set -a && . ./.env && set +a` in any new shell before api tests.

## File Structure

**New**
- `apps/web/src/routes/admin/panels/event-category.ts` — `eventCategory(name)` + `CATEGORIES` (keys, labels, brand colors).
- `apps/web/src/routes/admin/panels/event-category.test.ts`
- `apps/web/src/routes/admin/panels/events-series.ts` — pure `buildSeries(eventsByDay, granularity, hidden)` bucketer.
- `apps/web/src/routes/admin/panels/events-series.test.ts`
- `apps/web/src/routes/admin/panels/events-over-time.tsx` — the panel (controls + recharts).
- `apps/web/src/routes/admin/panels/events-over-time.test.tsx`

**Modified**
- `apps/api/src/routes/admin.ts` — add `eventsByDay` to `/metrics` (Task 3); remove `/activity` (Task 5).
- `apps/api/src/routes/admin.test.ts` — assert `eventsByDay` (Task 3); drop `/activity` (Task 5).
- `apps/web/src/routes/admin/use-metrics.ts` — add `eventsByDay` to `Metrics` (Task 3); remove `useActivity` + `Activity` (Task 5).
- `apps/web/src/routes/admin/index.tsx` — render `EventsOverTime`, remove `ActivityFeed`/`useActivity` (Task 5).
- `apps/web/src/routes/admin/index.test.tsx` — add `eventsByDay` to the mock, drop the `/activity` branch (Task 5).
- `apps/web/src/routes/admin/panels/panels.test.tsx` — drop `ActivityFeed` tests/imports (Task 5).

**Deleted**
- `apps/web/src/routes/admin/panels/activity-feed.tsx` (Task 5).

---

## Task 1: Event category mapping

**Files:**
- Create: `apps/web/src/routes/admin/panels/event-category.ts`
- Test: `apps/web/src/routes/admin/panels/event-category.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/routes/admin/panels/event-category.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CATEGORIES, eventCategory } from "./event-category";

describe("eventCategory", () => {
  it("maps event names to categories", () => {
    expect(eventCategory("page.viewed")).toBe("pageViews");
    expect(eventCategory("training.level_set")).toBe("training");
    expect(eventCategory("focus.week_set")).toBe("training");
    expect(eventCategory("journal.entry_created")).toBe("journalDogs");
    expect(eventCategory("dog.created")).toBe("journalDogs");
    expect(eventCategory("brief.emailed")).toBe("briefs");
    expect(eventCategory("trainer.viewed")).toBe("directory");
    expect(eventCategory("course.viewed")).toBe("directory");
    expect(eventCategory("user.signed_in")).toBe("auth");
    expect(eventCategory("something.weird")).toBe("other");
  });

  it("exposes every category with a label and color", () => {
    expect(CATEGORIES.map((c) => c.key)).toContain("pageViews");
    for (const c of CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.color).toMatch(/^#/);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web test src/routes/admin/panels/event-category.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the mapping**

Create `apps/web/src/routes/admin/panels/event-category.ts`:

```ts
export type Category =
  | "pageViews"
  | "training"
  | "journalDogs"
  | "briefs"
  | "directory"
  | "auth"
  | "other";

export const CATEGORIES: { key: Category; label: string; color: string }[] = [
  { key: "pageViews", label: "Page views", color: "#c8893b" },
  { key: "training", label: "Training", color: "#7fb8d6" },
  { key: "journalDogs", label: "Journal & dogs", color: "#28323d" },
  { key: "briefs", label: "Briefs", color: "#e0a85a" },
  { key: "directory", label: "Directory", color: "#9bbf9b" },
  { key: "auth", label: "Auth", color: "#a98bd0" },
  { key: "other", label: "Other", color: "#c9d4dd" },
];

export function eventCategory(name: string): Category {
  if (name === "page.viewed") return "pageViews";
  if (name.startsWith("training.") || name.startsWith("focus.")) return "training";
  if (name.startsWith("journal.") || name.startsWith("dog.")) return "journalDogs";
  if (name.startsWith("brief.")) return "briefs";
  if (name === "trainer.viewed" || name === "course.viewed") return "directory";
  if (name.startsWith("user.")) return "auth";
  return "other";
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @turingcare/web test src/routes/admin/panels/event-category.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/admin/panels/event-category.ts apps/web/src/routes/admin/panels/event-category.test.ts
git commit -m "feat(admin): event-category mapping for the events chart" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: `buildSeries` bucketer

**Files:**
- Create: `apps/web/src/routes/admin/panels/events-series.ts`
- Test: `apps/web/src/routes/admin/panels/events-series.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/routes/admin/panels/events-series.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSeries } from "./events-series";

// 2026-05-04 = Mon, 2026-05-05 = Tue (same week), 2026-05-11 = next Mon.
const data = [
  { day: "2026-05-04", name: "page.viewed", count: 10 },
  { day: "2026-05-05", name: "page.viewed", count: 5 },
  { day: "2026-05-05", name: "dog.created", count: 2 },
  { day: "2026-05-11", name: "page.viewed", count: 7 },
];

describe("buildSeries", () => {
  it("buckets by day with per-category counts and a total", () => {
    const rows = buildSeries(data, "day", new Set());
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ bucket: "2026-05-04", pageViews: 10, total: 10 });
    expect(rows[1]).toMatchObject({ bucket: "2026-05-05", pageViews: 5, journalDogs: 2, total: 7 });
    expect(rows[2]).toMatchObject({ bucket: "2026-05-11", pageViews: 7, total: 7 });
  });

  it("collapses days into Monday-keyed weeks", () => {
    const rows = buildSeries(data, "week", new Set());
    expect(rows.map((r) => r.bucket)).toEqual(["2026-05-04", "2026-05-11"]);
    expect(rows[0]).toMatchObject({ bucket: "2026-05-04", pageViews: 15, journalDogs: 2, total: 17 });
    expect(rows[1]).toMatchObject({ bucket: "2026-05-11", pageViews: 7, total: 7 });
  });

  it("excludes hidden categories", () => {
    const rows = buildSeries(data, "day", new Set(["pageViews"]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ bucket: "2026-05-05", journalDogs: 2, total: 2 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web test src/routes/admin/panels/events-series.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the bucketer**

Create `apps/web/src/routes/admin/panels/events-series.ts`:

```ts
import { dayKey, mondayOf } from "@/lib/week";
import { type Category, eventCategory } from "./event-category";

export type SeriesRow = { bucket: string; total: number } & Partial<Record<Category, number>>;

/** Group day×name event counts into day or Monday-week buckets, summing per
 *  category (and a `total`), dropping hidden categories. Sorted by bucket. */
export function buildSeries(
  eventsByDay: { day: string; name: string; count: number }[],
  granularity: "day" | "week",
  hidden: Set<Category>,
): SeriesRow[] {
  const bucketOf = (day: string) =>
    granularity === "week" ? dayKey(mondayOf(new Date(`${day}T00:00:00`))) : day;

  const map = new Map<string, SeriesRow>();
  for (const { day, name, count } of eventsByDay) {
    const cat = eventCategory(name);
    if (hidden.has(cat)) continue;
    const bucket = bucketOf(day);
    const row = map.get(bucket) ?? { bucket, total: 0 };
    row[cat] = (row[cat] ?? 0) + count;
    row.total += count;
    map.set(bucket, row);
  }
  return [...map.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @turingcare/web test src/routes/admin/panels/events-series.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/admin/panels/events-series.ts apps/web/src/routes/admin/panels/events-series.test.ts
git commit -m "feat(admin): buildSeries bucketer for the events chart" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: `eventsByDay` metrics field (additive)

**Files:**
- Modify: `apps/api/src/routes/admin.ts`, `apps/api/src/routes/admin.test.ts`
- Modify: `apps/web/src/routes/admin/use-metrics.ts`

- [ ] **Step 1: Add the failing API assertion**

In `apps/api/src/routes/admin.test.ts`, after the existing `expect(body).toHaveProperty("topPages");` line, add:

```ts
    expect(body).toHaveProperty("eventsByDay");
    expect(Array.isArray((body as { eventsByDay: unknown[] }).eventsByDay)).toBe(true);
```

- [ ] **Step 2: Run it to verify it fails**

Run (env loaded): `pnpm --filter @turingcare/api test src/routes/admin.test.ts`
Expected: FAIL — `eventsByDay` not present.

- [ ] **Step 3: Add the `eventsByDay` query in `admin.ts`**

In `apps/api/src/routes/admin.ts`, add `eventsByDay` to the destructured names (after `topPages`):

```ts
      firstBrief,
      topPages,
      eventsByDay,
    ] = await Promise.all([
```

and add this query as the new last element of the `Promise.all` array (immediately after the `topPages` query's `.then((r) => r.rows),`):

```ts
        .then((r) => r.rows),
      db
        .execute<{ day: string; name: string; count: number }>(
          sql`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
                     name, count(*)::int as count
              from events where created_at >= ${since}
              group by 1, 2 order by 1`,
        )
        .then((r) => r.rows),
    ]);
```

Then add `eventsByDay` to the JSON response, after `topPages,`:

```ts
      funnel,
      topPages,
      eventsByDay,
    } as const);
```

- [ ] **Step 4: Run the API admin test to verify it passes**

Run: `pnpm --filter @turingcare/api test src/routes/admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `eventsByDay` to the web `Metrics` type**

In `apps/web/src/routes/admin/use-metrics.ts`, add to the `Metrics` type after the `topPages` line:

```ts
  topPages: { path: string; count: number }[];
  eventsByDay: { day: string; name: string; count: number }[];
};
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @turingcare/web typecheck && pnpm --filter @turingcare/api typecheck`
Expected: clean (this change is purely additive).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/admin.ts apps/api/src/routes/admin.test.ts apps/web/src/routes/admin/use-metrics.ts
git commit -m "feat(admin): add eventsByDay aggregation to metrics" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: `EventsOverTime` panel (additive)

**Files:**
- Create: `apps/web/src/routes/admin/panels/events-over-time.tsx`
- Test: `apps/web/src/routes/admin/panels/events-over-time.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/routes/admin/panels/events-over-time.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { EventsOverTime } from "./events-over-time";

const eventsByDay = [
  { day: "2026-05-04", name: "page.viewed", count: 10 },
  { day: "2026-05-05", name: "dog.created", count: 2 },
];

afterEach(() => vi.clearAllMocks());

it("renders the heading and the three controls", () => {
  render(<EventsOverTime eventsByDay={eventsByDay} />);
  expect(screen.getByText(/events over time/i)).toBeInTheDocument();
  // breakdown + granularity segmented controls
  expect(screen.getByRole("button", { name: "Total" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "By type" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Day" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "false");
  // a category filter chip
  expect(screen.getByRole("button", { name: "Page views" })).toHaveAttribute("aria-pressed", "true");
});

it("toggles breakdown to By type", async () => {
  const user = userEvent.setup();
  render(<EventsOverTime eventsByDay={eventsByDay} />);
  await user.click(screen.getByRole("button", { name: "By type" }));
  expect(screen.getByRole("button", { name: "By type" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Total" })).toHaveAttribute("aria-pressed", "false");
});

it("toggles a category chip off", async () => {
  const user = userEvent.setup();
  render(<EventsOverTime eventsByDay={eventsByDay} />);
  const chip = screen.getByRole("button", { name: "Page views" });
  await user.click(chip);
  expect(chip).toHaveAttribute("aria-pressed", "false");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web test src/routes/admin/panels/events-over-time.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the panel**

Create `apps/web/src/routes/admin/panels/events-over-time.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Metrics } from "../use-metrics";
import { CATEGORIES, type Category } from "./event-category";
import { buildSeries } from "./events-series";

type Breakdown = "total" | "byType";
type Granularity = "day" | "week";

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <span className="inline-flex overflow-hidden rounded-md border border-silver">
      {options.map(([val, label]) => (
        <button
          key={val}
          type="button"
          aria-pressed={value === val}
          onClick={() => onChange(val)}
          className={cn(
            "px-2.5 py-1 text-xs",
            value === val ? "bg-slate text-cream" : "bg-white text-slate-soft",
          )}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

export function EventsOverTime({ eventsByDay }: { eventsByDay: Metrics["eventsByDay"] }) {
  const [breakdown, setBreakdown] = useState<Breakdown>("total");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [hidden, setHidden] = useState<Set<Category>>(new Set());

  const data = useMemo(
    () => buildSeries(eventsByDay ?? [], granularity, hidden),
    [eventsByDay, granularity, hidden],
  );
  const visible = CATEGORIES.filter((c) => !hidden.has(c.key));

  function toggle(cat: Category) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase text-slate-soft">Events over time</h2>
        <div className="flex items-center gap-2">
          <Segmented
            value={breakdown}
            onChange={setBreakdown}
            options={[
              ["total", "Total"],
              ["byType", "By type"],
            ]}
          />
          <Segmented
            value={granularity}
            onChange={setGranularity}
            options={[
              ["day", "Day"],
              ["week", "Week"],
            ]}
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => {
          const on = !hidden.has(c.key);
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(c.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border border-silver px-2.5 py-1 text-xs",
                on ? "bg-white text-slate" : "bg-white text-slate-soft/50",
              )}
            >
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: on ? c.color : "#c9d4dd" }}
              />
              {c.label}
            </button>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        {breakdown === "total" ? (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#c8893b"
              fill="#c8893b"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </AreaChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Legend />
            {visible.map((c) => (
              <Bar key={c.key} dataKey={c.key} name={c.label} stackId="events" fill={c.color} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </section>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @turingcare/web test src/routes/admin/panels/events-over-time.test.tsx`
Expected: PASS (3 tests). (recharts may log a width(0) warning under jsdom — harmless; the assertions are on the controls.)

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter @turingcare/web typecheck && pnpm exec biome check --write apps/web/src/routes/admin/panels/events-over-time.tsx apps/web/src/routes/admin/panels/events-over-time.test.tsx`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/admin/panels/events-over-time.tsx apps/web/src/routes/admin/panels/events-over-time.test.tsx
git commit -m "feat(admin): EventsOverTime panel (area/stacked, day/week, category filter)" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Swap the panel in and remove the activity feed

**Files:**
- Modify: `apps/web/src/routes/admin/index.tsx`, `apps/web/src/routes/admin/index.test.tsx`
- Modify: `apps/web/src/routes/admin/use-metrics.ts`
- Modify: `apps/web/src/routes/admin/panels/panels.test.tsx`
- Modify: `apps/api/src/routes/admin.ts`, `apps/api/src/routes/admin.test.ts`
- Delete: `apps/web/src/routes/admin/panels/activity-feed.tsx`

- [ ] **Step 1: Wire `EventsOverTime` into the dashboard**

In `apps/web/src/routes/admin/index.tsx`, replace the import lines:

```tsx
import { ActivityFeed } from "./panels/activity-feed";
```

with:

```tsx
import { EventsOverTime } from "./panels/events-over-time";
```

Replace:

```tsx
import { useActivity, useMetrics } from "./use-metrics";
```

with:

```tsx
import { useMetrics } from "./use-metrics";
```

Remove the activity hook line:

```tsx
  const activity = useActivity();
```

Replace the activity render block:

```tsx
          {activity.isError ? (
            <p className="rounded-lg border border-silver bg-white p-4 text-sm text-red-600">
              Activity feed unavailable.
            </p>
          ) : (
            <ActivityFeed activity={activity.data ?? { items: [] }} />
          )}
```

with:

```tsx
          <EventsOverTime eventsByDay={metrics.data.eventsByDay} />
```

- [ ] **Step 2: Remove `useActivity` + `Activity` from the hook module**

In `apps/web/src/routes/admin/use-metrics.ts`, delete the `Activity` type block:

```ts
export type Activity = {
  items: { id: string; name: string; userId: string | null; createdAt: string; props: unknown }[];
};
```

and delete the entire `useActivity` function:

```ts
export function useActivity() {
  return useQuery({
    queryKey: ["admin", "activity"],
    queryFn: async () => {
      const res = await api.api.admin.activity.$get();
      if (!res.ok) throw new Error("activity failed");
      return (await res.json()) as Activity;
    },
  });
}
```

- [ ] **Step 3: Remove the `/activity` route from the API**

In `apps/api/src/routes/admin.ts`, replace the end of the `/metrics` handler and the whole `/activity` route:

```ts
    } as const);
  })
  .get("/activity", async (c) => {
    const { rows: items } = await db.execute<{
      id: string;
      name: string;
      userId: string | null;
      createdAt: string;
      props: unknown;
    }>(
      sql`select id, name, user_id as "userId",
                 to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
                 props
          from events order by created_at desc limit 100`,
    );
    return c.json({ items } as const);
  });
```

with:

```ts
    } as const);
  });
```

- [ ] **Step 4: Drop the `/activity` assertions from the API test**

In `apps/api/src/routes/admin.test.ts`, delete this block (the trailing part of the "returns 200 with metrics" test):

```ts
    const act = await app.request("/api/admin/activity", { headers: { cookie } });
    expect(act.status).toBe(200);
    // app.request().json() is typed `unknown` in this Hono version (it does not
    // infer like the hc<AppType> client); narrow before property access.
    const actBody = (await act.json()) as { items: { createdAt: string }[] };
    expect(Array.isArray(actBody.items)).toBe(true);
    const firstItem = actBody.items[0];
    if (firstItem) {
      expect(Number.isNaN(new Date(firstItem.createdAt).getTime())).toBe(false);
    }
```

(Leave the closing `  });` and `});` of the test/describe intact.)

- [ ] **Step 5: Update the dashboard test mock**

In `apps/web/src/routes/admin/index.test.tsx`, add `eventsByDay` to the `metrics` fixture after its `topPages` line:

```ts
  topPages: [{ path: "/my", count: 5 }],
  eventsByDay: [{ day: "2026-05-01", name: "page.viewed", count: 12 }],
};
```

and simplify the fetch mock (no more `/activity` branch) — replace:

```ts
      .mockImplementation((url: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(String(url).includes("/activity") ? { items: [] } : metrics),
            { status: 200 },
          ),
        ),
      ),
```

with:

```ts
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(metrics), { status: 200 })),
      ),
```

- [ ] **Step 6: Remove the `ActivityFeed` tests**

In `apps/web/src/routes/admin/panels/panels.test.tsx`, change the imports — replace:

```tsx
import type { Activity, Metrics } from "../use-metrics";
import { ActivityFeed } from "./activity-feed";
```

with:

```tsx
import type { Metrics } from "../use-metrics";
```

and add `eventsByDay` to the typed `metrics` fixture after its `topPages` line:

```ts
  topPages: [{ path: "/my", count: 90 }],
  eventsByDay: [{ day: "2026-05-01", name: "page.viewed", count: 1900 }],
};
```

Then delete the three `ActivityFeed` tests (`"ActivityFeed lists events"`, `"ActivityFeed does not throw on a malformed date and shows the raw string"`, and `"ActivityFeed shows anon for null userId"`).

- [ ] **Step 7: Delete the activity-feed component**

```bash
git rm apps/web/src/routes/admin/panels/activity-feed.tsx
```

- [ ] **Step 8: Run the affected suites + typecheck**

Run:
```bash
pnpm --filter @turingcare/web typecheck
pnpm --filter @turingcare/web test src/routes/admin/index.test.tsx src/routes/admin/panels/panels.test.tsx
set -a && . ./.env && set +a && pnpm --filter @turingcare/api test src/routes/admin.test.ts
```
Expected: typecheck clean (no references to `useActivity`/`Activity`/`ActivityFeed`/`api.api.admin.activity`); web tests PASS; api admin test PASS.

- [ ] **Step 9: Lint**

Run: `pnpm exec biome check --write apps/web/src/routes/admin apps/api/src/routes/admin.ts apps/api/src/routes/admin.test.ts`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(admin): replace Live activity feed with the Events over time panel" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Web suite**

Run: `pnpm --filter @turingcare/web test`
Expected: PASS (new event-category / events-series / events-over-time tests; activity-feed tests gone).

- [ ] **Step 2: API suite** (DB up + env loaded)

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api test`
Expected: PASS (admin metrics asserts `eventsByDay`; `/activity` removed).

- [ ] **Step 3: Lint, typecheck, build**

Run: `pnpm lint && pnpm -r typecheck && pnpm -r build`
Expected: Biome clean; `tsc --noEmit` clean; builds succeed.

- [ ] **Step 4: Manual smoke (optional)**

With `pnpm dev` + an admin account: open `/admin`; the bottom panel is now **Events over time**. Toggle Total↔By type, Day↔Week, and a couple of category chips; confirm the chart updates and no Live activity feed remains.

---

## Self-Review notes

- **Spec coverage:** category mapping → Task 1; client bucketer (day/week, filter, total) → Task 2; `eventsByDay` API + `Metrics` → Task 3; interactive panel (breakdown/filter/granularity, area/stacked) → Task 4; remove activity feed + `/activity` + `useActivity` → Task 5; tests + gates → each task + Task 6.
- **Type consistency:** `Category` keys (`pageViews`/`training`/`journalDogs`/`briefs`/`directory`/`auth`/`other`) defined in Task 1 are used as `buildSeries` record keys (Task 2) and recharts `Bar dataKey` (Task 4); `Metrics["eventsByDay"]` is `{ day; name; count }[]` (Task 3) and is the panel's prop (Task 4) and the dashboard mock shape (Task 5).
- **Green at every commit:** Tasks 1–4 are additive; Task 5 performs the coupled removal (API route + typed-client consumer) in one commit so typecheck never breaks.
