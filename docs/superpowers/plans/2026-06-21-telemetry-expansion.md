# Telemetry Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Actually emit feature-usage events (today only sign-up/sign-in/page-view fire) and surface them on the redesigned admin dashboard.

**Architecture:** Hybrid emission — server-side `recordEvent(...)` inside the existing `dogs.ts` handlers for data mutations, plus client-side `track(...)` for two pure view events. Add a `topPages` aggregation to the metrics route and two new dashboard panels (Feature usage, Top pages). No DB schema change.

**Tech Stack:** Hono + Drizzle (API), React 19 + recharts + TanStack Query (web), Vitest + Testing Library, Biome.

---

## Setup (run once in the worktree before Task 1)

Worktree: `/Users/elopenmike/build/Apps/Care/TuringCare/.worktrees/telemetry-expansion` (branch `feat/telemetry-expansion`).

- [ ] Install deps: `pnpm install`
- [ ] API tests need Postgres + env. Bring up the DB and load env (the repo `.env` lives in the main checkout and is gitignored):
  ```bash
  cp ../../.env .env                 # DATABASE_URL etc. for this worktree
  docker compose up -d --wait        # Postgres 16 on :5432
  set -a && . ./.env && set +a       # export env for this shell
  pnpm --filter @turingcare/api db:push   # ensure schema (events table) is applied
  ```
  Re-run `set -a && . ./.env && set +a` in any new shell before api tests.

## File Structure

**Modified**
- `apps/api/src/telemetry/events.ts` — extend `KNOWN_EVENTS` + `CLIENT_EVENTS`.
- `apps/api/src/routes/dogs.ts` — import `recordEvent`; 9 emit calls.
- `apps/api/src/routes/admin.ts` — `topPages` aggregation in `/metrics`.
- `apps/api/src/routes/admin.test.ts` — assert `topPages` present.
- `apps/web/src/routes/admin/use-metrics.ts` — `topPages` on `Metrics`.
- `apps/web/src/routes/admin/index.tsx` — render the two new panels.
- `apps/web/src/routes/admin/index.test.tsx` — add `topPages` to the mocked metrics.
- `apps/web/src/routes/admin/panels/panels.test.tsx` — add `topPages` to the fixture + panel tests.
- `apps/web/src/routes/trainer-detail.tsx`, `apps/web/src/routes/course-detail.tsx` — `track(...)` on mount.

**New**
- `apps/api/src/telemetry/events.test.ts`
- `apps/api/src/routes/telemetry.test.ts`
- `apps/web/src/routes/admin/panels/feature-usage.tsx`
- `apps/web/src/routes/admin/panels/top-pages.tsx`
- `apps/web/src/routes/trainer-detail.test.tsx`, `apps/web/src/routes/course-detail.test.tsx`

---

## Task 1: Extend the event allowlists

**Files:**
- Modify: `apps/api/src/telemetry/events.ts`
- Test: `apps/api/src/telemetry/events.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/telemetry/events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CLIENT_EVENTS, eventIngestSchema, isKnownEvent } from "./events";

describe("telemetry events allowlist", () => {
  it("recognizes the new server + client event names", () => {
    expect(isKnownEvent("brief.emailed")).toBe(true);
    expect(isKnownEvent("training.practice_logged")).toBe(true);
    expect(isKnownEvent("focus.week_set")).toBe(true);
    expect(isKnownEvent("trainer.viewed")).toBe(true);
    expect(isKnownEvent("course.viewed")).toBe(true);
  });

  it("accepts the two client view events through the ingest schema", () => {
    expect(eventIngestSchema.safeParse({ name: "trainer.viewed", props: { id: "abc" } }).success).toBe(true);
    expect(eventIngestSchema.safeParse({ name: "course.viewed", props: { id: "abc" } }).success).toBe(true);
  });

  it("still rejects server-only events from the client ingest", () => {
    expect(eventIngestSchema.safeParse({ name: "dog.created", props: {} }).success).toBe(false);
  });

  it("exposes the two new client events", () => {
    expect(CLIENT_EVENTS).toContain("trainer.viewed");
    expect(CLIENT_EVENTS).toContain("course.viewed");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/api test src/telemetry/events.test.ts`
Expected: FAIL (new names not known; ingest rejects trainer.viewed). This test does not hit the DB.

- [ ] **Step 3: Extend the allowlists**

In `apps/api/src/telemetry/events.ts`, replace the `KNOWN_EVENTS` array and the `CLIENT_EVENTS` line:

```ts
export const KNOWN_EVENTS = [
  "user.signed_up",
  "user.signed_in",
  "page.viewed",
  "dog.created",
  "journal.entry_created",
  "brief.generated",
  "brief.finalized",
  "brief.shared",
  "brief.emailed",
  "training.goal_added",
  "training.practice_logged",
  "focus.week_set",
  "trainer.viewed",
  "course.viewed",
] as const;
```

```ts
export const CLIENT_EVENTS = ["page.viewed", "trainer.viewed", "course.viewed"] as const;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @turingcare/api test src/telemetry/events.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/telemetry/events.ts apps/api/src/telemetry/events.test.ts
git commit -m "feat(telemetry): add feature-usage + view events to the allowlist" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Server-side event emission in `dogs.ts`

**Files:**
- Modify: `apps/api/src/routes/dogs.ts`
- Test: `apps/api/src/routes/telemetry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/telemetry.test.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { events } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

async function countEvents(userId: string, name: string): Promise<number> {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), eq(events.name, name)));
  return rows.length;
}

async function createDog(u: TestUser): Promise<string> {
  const res = await app.request("/api/dogs", {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify(validDog),
  });
  const { dog } = (await res.json()) as { dog: { id: string } };
  return dog.id;
}

describe("server-side telemetry emission", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  it("records dog.created", async () => {
    const u = await createTestUser();
    users.push(u);
    await createDog(u);
    expect(await countEvents(u.userId, "dog.created")).toBe(1);
  });

  it("records journal.entry_created", async () => {
    const u = await createTestUser();
    users.push(u);
    const dogId = await createDog(u);
    await app.request(`/api/dogs/${dogId}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ kind: "moment", note: "chewed a shoe" }),
    });
    expect(await countEvents(u.userId, "journal.entry_created")).toBe(1);
  });

  it("records training.goal_added, training.practice_logged and focus.week_set", async () => {
    const u = await createTestUser();
    users.push(u);
    const dogId = await createDog(u);
    const goalRes = await app.request(`/api/dogs/${dogId}/goals`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ goal: "Calm greetings" }),
    });
    const { skill } = (await goalRes.json()) as { skill: { id: string } };
    await app.request(`/api/dogs/${dogId}/skills/${skill.id}/sessions`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ occurredAt: new Date().toISOString() }),
    });
    await app.request(`/api/dogs/${dogId}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ skillId: skill.id }),
    });
    expect(await countEvents(u.userId, "training.goal_added")).toBe(1);
    expect(await countEvents(u.userId, "training.practice_logged")).toBe(1);
    expect(await countEvents(u.userId, "focus.week_set")).toBe(1);
  });

  it("records the brief lifecycle (generated, finalized, shared)", async () => {
    const u = await createTestUser();
    users.push(u);
    const dogId = await createDog(u);
    await app.request(`/api/dogs/${dogId}/brief?window=30d`, {
      method: "POST",
      headers: u.authHeaders,
    });
    await app.request(`/api/dogs/${dogId}/brief`, { method: "PUT", headers: u.authHeaders });
    await app.request(`/api/dogs/${dogId}/brief/share`, { method: "POST", headers: u.authHeaders });
    expect(await countEvents(u.userId, "brief.generated")).toBe(1);
    expect(await countEvents(u.userId, "brief.finalized")).toBe(1);
    expect(await countEvents(u.userId, "brief.shared")).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (env loaded, DB up): `pnpm --filter @turingcare/api test src/routes/telemetry.test.ts`
Expected: FAIL — every `countEvents(...)` returns 0 (no emission yet).

- [ ] **Step 3: Import `recordEvent` in `dogs.ts`**

In `apps/api/src/routes/dogs.ts`, add this import **immediately after** the `import { type Vars, requireUser } from "../middleware/require-user";` line (Biome sorts `../telemetry/...` after `../middleware/...`):

```ts
import { recordEvent } from "../telemetry/record-event";
```

- [ ] **Step 4: Emit `dog.created`**

Replace (the `POST /` handler tail):

```ts
      .returning();
    return c.json({ dog }, 201);
  })
```

with:

```ts
      .returning();
    await recordEvent("dog.created", { userId: c.get("userId") });
    return c.json({ dog }, 201);
  })
```

- [ ] **Step 5: Emit `training.goal_added` (custom) and (template)**

In the `POST /:id/goals` handler, replace:

```ts
    if (!skill) throw new Error("failed to create default skill");
    return c.json({ goal, skill }, 201);
```

with:

```ts
    if (!skill) throw new Error("failed to create default skill");
    await recordEvent("training.goal_added", { userId: c.get("userId"), props: { source: "custom" } });
    return c.json({ goal, skill }, 201);
```

In the `POST /:id/goals/from-template` handler, replace:

```ts
    return c.json({ goal, skills }, 201);
  })
```

with:

```ts
    await recordEvent("training.goal_added", { userId: c.get("userId"), props: { source: "template" } });
    return c.json({ goal, skills }, 201);
  })
```

- [ ] **Step 6: Emit `training.practice_logged` and `focus.week_set`**

In `POST /:id/skills/:skillId/sessions`, replace:

```ts
    if (!session) throw new Error("failed to create practice session");
    return c.json({ session }, 201);
```

with:

```ts
    if (!session) throw new Error("failed to create practice session");
    await recordEvent("training.practice_logged", { userId: c.get("userId") });
    return c.json({ session }, 201);
```

In `POST /:id/focus`, replace:

```ts
    if (!row) throw new Error("failed to add focus skill");
    return c.json({ focus: row }, 201);
```

with:

```ts
    if (!row) throw new Error("failed to add focus skill");
    await recordEvent("focus.week_set", { userId: c.get("userId") });
    return c.json({ focus: row }, 201);
```

- [ ] **Step 7: Emit `journal.entry_created`**

In `POST /:id/journal`, replace:

```ts
      .returning();
    return c.json({ entry }, 201);
  })
```

with:

```ts
      .returning();
    await recordEvent("journal.entry_created", { userId: c.get("userId"), props: { kind: b.kind } });
    return c.json({ entry }, 201);
  })
```

- [ ] **Step 8: Emit the brief events**

In `POST /:id/brief/share`, replace:

```ts
    return c.json({ token, url: `${env.FRONTEND_URL}/b/${token}` });
  })
```

with:

```ts
    await recordEvent("brief.shared", { userId: c.get("userId") });
    return c.json({ token, url: `${env.FRONTEND_URL}/b/${token}` });
  })
```

In `POST /:id/brief` (generate), replace:

```ts
      .returning();
    return c.json({ brief }, 201);
  })
```

with:

```ts
      .returning();
    await recordEvent("brief.generated", { userId: c.get("userId"), props: { window } });
    return c.json({ brief }, 201);
  })
```

In `PUT /:id/brief` (finalize), replace:

```ts
      .returning();
    return c.json({ brief });
  })
```

with:

```ts
      .returning();
    await recordEvent("brief.finalized", { userId: c.get("userId") });
    return c.json({ brief });
  })
```

In `POST /:id/brief/send`, replace (after the `briefSends` insert):

```ts
      .returning();

    return c.json({ send }, 201);
  })
```

with:

```ts
      .returning();

    await recordEvent("brief.emailed", { userId });
    return c.json({ send }, 201);
  })
```

- [ ] **Step 9: Run the telemetry test to verify it passes**

Run: `pnpm --filter @turingcare/api test src/routes/telemetry.test.ts`
Expected: PASS (4 tests). Then confirm no regression: `pnpm --filter @turingcare/api test src/routes/dogs.test.ts`

- [ ] **Step 10: Typecheck + lint**

Run: `pnpm --filter @turingcare/api typecheck && pnpm exec biome check --write apps/api/src/routes/dogs.ts apps/api/src/routes/telemetry.test.ts`
Expected: typecheck clean; Biome auto-sorts imports/formatting and reports clean (re-stage if it rewrote anything).

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/routes/dogs.ts apps/api/src/routes/telemetry.test.ts
git commit -m "feat(telemetry): emit feature-usage events from dogs routes" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Client-side view events

**Files:**
- Modify: `apps/web/src/routes/trainer-detail.tsx`, `apps/web/src/routes/course-detail.tsx`
- Test: `apps/web/src/routes/trainer-detail.test.tsx`, `apps/web/src/routes/course-detail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/routes/trainer-detail.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

const track = vi.fn();
vi.mock("@/lib/track", () => ({ track: (...a: unknown[]) => track(...a) }));
vi.mock("@/lib/auth-client", () => ({ useSession: () => ({ data: null }) }));
vi.mock("@/lib/trainers", () => ({
  useTrainer: () => ({
    data: {
      id: "tr1",
      name: "Jane Rivera",
      businessName: null,
      city: "Seattle",
      state: "WA",
      specialties: [],
      methodologyTags: [],
      certifications: [],
      website: null,
      email: null,
      phone: null,
    },
    isLoading: false,
    isError: false,
  }),
}));

import { TrainerDetail } from "./trainer-detail";

afterEach(() => vi.clearAllMocks());

it("emits trainer.viewed on mount", () => {
  render(
    <MemoryRouter initialEntries={["/trainers/tr1"]}>
      <Routes>
        <Route path="/trainers/:id" element={<TrainerDetail />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(track).toHaveBeenCalledWith("trainer.viewed", { id: "tr1" });
});
```

Create `apps/web/src/routes/course-detail.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

const track = vi.fn();
vi.mock("@/lib/track", () => ({ track: (...a: unknown[]) => track(...a) }));
vi.mock("@/lib/courses", () => ({
  useCourse: () => ({
    data: {
      id: "co1",
      name: "Puppy Start Right",
      organizationName: "Seattle Humane",
      city: "Bellevue",
      state: "WA",
      description: null,
      format: "group",
      ageGroup: "any",
      ageRange: null,
      durationWeeks: null,
      sessionMinutes: null,
      prerequisites: null,
      skillsTaught: [],
      isOnline: false,
      coursePageUrl: null,
    },
    isLoading: false,
    isError: false,
  }),
}));

import { CourseDetail } from "./course-detail";

afterEach(() => vi.clearAllMocks());

it("emits course.viewed on mount", () => {
  render(
    <MemoryRouter initialEntries={["/courses/co1"]}>
      <Routes>
        <Route path="/courses/:id" element={<CourseDetail />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(track).toHaveBeenCalledWith("course.viewed", { id: "co1" });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @turingcare/web test src/routes/trainer-detail.test.tsx src/routes/course-detail.test.tsx`
Expected: FAIL — `track` never called.

- [ ] **Step 3: Emit `trainer.viewed`**

In `apps/web/src/routes/trainer-detail.tsx`, add imports:

```tsx
import { track } from "@/lib/track";
import { useEffect } from "react";
```

Then, immediately after the `const { data: tr, isLoading, isError } = useTrainer(id);` line and BEFORE the `if (isLoading)` early return, add:

```tsx
  useEffect(() => {
    if (id) track("trainer.viewed", { id });
  }, [id]);
```

- [ ] **Step 4: Emit `course.viewed`**

In `apps/web/src/routes/course-detail.tsx`, add imports:

```tsx
import { track } from "@/lib/track";
import { useEffect } from "react";
```

Then, immediately after the `const { data: co, isLoading, isError } = useCourse(id);` line and BEFORE the `if (isLoading)` early return, add:

```tsx
  useEffect(() => {
    if (id) track("course.viewed", { id });
  }, [id]);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @turingcare/web test src/routes/trainer-detail.test.tsx src/routes/course-detail.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm --filter @turingcare/web typecheck && pnpm exec biome check --write apps/web/src/routes/trainer-detail.tsx apps/web/src/routes/course-detail.tsx apps/web/src/routes/trainer-detail.test.tsx apps/web/src/routes/course-detail.test.tsx`
Expected: typecheck clean; Biome auto-sorts the new `react` imports and reports clean (re-stage if it rewrote anything).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/trainer-detail.tsx apps/web/src/routes/course-detail.tsx apps/web/src/routes/trainer-detail.test.tsx apps/web/src/routes/course-detail.test.tsx
git commit -m "feat(telemetry): emit trainer.viewed / course.viewed on detail pages" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: `topPages` metric

**Files:**
- Modify: `apps/api/src/routes/admin.ts`, `apps/api/src/routes/admin.test.ts`
- Modify: `apps/web/src/routes/admin/use-metrics.ts`
- Modify: `apps/web/src/routes/admin/panels/panels.test.tsx` (fixture)

- [ ] **Step 1: Add the failing assertion to the API admin test**

In `apps/api/src/routes/admin.test.ts`, inside the "returns 200 with metrics for an admin" test, after the existing `expect(body).toHaveProperty("eventVolume");` line, add:

```ts
    expect(body).toHaveProperty("topPages");
    expect(Array.isArray((body as { topPages: unknown[] }).topPages)).toBe(true);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/api test src/routes/admin.test.ts`
Expected: FAIL — `topPages` not present on the response.

- [ ] **Step 3: Add the `topPages` aggregation in `admin.ts`**

In `apps/api/src/routes/admin.ts`, add a query to the `Promise.all([...])` destructure. Add `topPages` to the destructured names (after `firstBrief`):

```ts
      firstBrief,
      topPages,
    ] = await Promise.all([
```

and add this query as the last element of the array (after the `funnelRow("brief.generated")` line, with a comma before it):

```ts
      funnelRow("brief.generated"),
      db
        .execute<{ path: string; count: number }>(
          sql`select coalesce(props->>'path', '(unknown)') as path, count(*)::int as count
              from events
              where name = 'page.viewed' and created_at >= ${since}
              group by 1 order by 2 desc limit 10`,
        )
        .then((r) => r.rows),
    ]);
```

Then add `topPages` to the JSON response, after `funnel,`:

```ts
      eventVolume,
      funnel,
      topPages,
    } as const);
```

- [ ] **Step 4: Run the API admin test to verify it passes**

Run: `pnpm --filter @turingcare/api test src/routes/admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `topPages` to the web `Metrics` type**

In `apps/web/src/routes/admin/use-metrics.ts`, add to the `Metrics` type after the `funnel` line:

```ts
  funnel: { step: string; users: number }[];
  topPages: { path: string; count: number }[];
};
```

- [ ] **Step 6: Fix the typed fixture in `panels.test.tsx`**

In `apps/web/src/routes/admin/panels/panels.test.tsx`, add `topPages` to the `const metrics: Metrics` fixture, after the `funnel` line:

```ts
  funnel: [{ step: "signup", users: 128 }],
  topPages: [{ path: "/my", count: 90 }],
};
```

- [ ] **Step 7: Verify typecheck + the existing panel/admin tests**

Run: `pnpm --filter @turingcare/web typecheck && pnpm --filter @turingcare/web test src/routes/admin/panels/panels.test.tsx`
Expected: clean + PASS (the new required `topPages` field no longer breaks the fixture).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/admin.ts apps/api/src/routes/admin.test.ts apps/web/src/routes/admin/use-metrics.ts apps/web/src/routes/admin/panels/panels.test.tsx
git commit -m "feat(telemetry): add top-pages aggregation to admin metrics" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Dashboard panels (Feature usage + Top pages)

**Files:**
- Create: `apps/web/src/routes/admin/panels/feature-usage.tsx`, `apps/web/src/routes/admin/panels/top-pages.tsx`
- Modify: `apps/web/src/routes/admin/index.tsx`, `apps/web/src/routes/admin/index.test.tsx`
- Test: `apps/web/src/routes/admin/panels/panels.test.tsx`

- [ ] **Step 1: Write the failing panel tests**

In `apps/web/src/routes/admin/panels/panels.test.tsx`, add imports at the top (next to the other panel imports):

```tsx
import { FeatureUsage } from "./feature-usage";
import { TopPages } from "./top-pages";
```

and add these tests at the end of the file:

```tsx
it("FeatureUsage lists events and excludes page.viewed", () => {
  render(
    <FeatureUsage
      eventVolume={[
        { name: "page.viewed", count: 1900 },
        { name: "dog.created", count: 12 },
      ]}
    />,
  );
  expect(screen.getByText("dog.created")).toBeInTheDocument();
  expect(screen.queryByText("page.viewed")).toBeNull();
});

it("TopPages lists paths and counts", () => {
  render(<TopPages topPages={[{ path: "/my", count: 90 }]} />);
  expect(screen.getByText("/my")).toBeInTheDocument();
  expect(screen.getByText("90")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @turingcare/web test src/routes/admin/panels/panels.test.tsx`
Expected: FAIL — `./feature-usage` and `./top-pages` don't exist.

- [ ] **Step 3: Create the Feature usage panel**

Create `apps/web/src/routes/admin/panels/feature-usage.tsx`:

```tsx
import type { Metrics } from "../use-metrics";

export function FeatureUsage({ eventVolume }: { eventVolume: Metrics["eventVolume"] }) {
  const rows = eventVolume.filter((e) => e.name !== "page.viewed");
  const top = rows[0]?.count || 1;
  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-soft">Feature usage</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-soft">No events in range.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((e) => (
            <div key={e.name} className="flex items-center gap-3">
              <div className="w-44 truncate text-sm text-slate" title={e.name}>
                {e.name}
              </div>
              <div className="h-5 flex-1 rounded bg-silver/40">
                <div
                  className="h-5 rounded bg-copper"
                  style={{ width: `${Math.max(2, (e.count / top) * 100)}%` }}
                />
              </div>
              <div className="w-12 text-right text-sm tabular-nums text-slate">{e.count}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Create the Top pages panel**

Create `apps/web/src/routes/admin/panels/top-pages.tsx`:

```tsx
import type { Metrics } from "../use-metrics";

export function TopPages({ topPages }: { topPages: Metrics["topPages"] }) {
  const top = topPages[0]?.count || 1;
  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-soft">Top pages</h2>
      {topPages.length === 0 ? (
        <p className="text-sm text-slate-soft">No page views in range.</p>
      ) : (
        <div className="space-y-2">
          {topPages.map((p) => (
            <div key={p.path} className="flex items-center gap-3">
              <div className="w-44 truncate font-mono text-xs text-slate" title={p.path}>
                {p.path}
              </div>
              <div className="h-5 flex-1 rounded bg-silver/40">
                <div
                  className="h-5 rounded bg-copper"
                  style={{ width: `${Math.max(2, (p.count / top) * 100)}%` }}
                />
              </div>
              <div className="w-12 text-right text-sm tabular-nums text-slate">{p.count}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Run the panel tests to verify they pass**

Run: `pnpm --filter @turingcare/web test src/routes/admin/panels/panels.test.tsx`
Expected: PASS.

- [ ] **Step 6: Wire the panels into the dashboard**

In `apps/web/src/routes/admin/index.tsx`, add imports (next to the other panel imports):

```tsx
import { FeatureUsage } from "./panels/feature-usage";
import { TopPages } from "./panels/top-pages";
```

Then, replace:

```tsx
          <div className="grid gap-4 md:grid-cols-2">
            <ActiveUsage active={metrics.data.active} kpis={metrics.data.kpis} />
            <Funnel funnel={metrics.data.funnel} />
          </div>
```

with:

```tsx
          <div className="grid gap-4 md:grid-cols-2">
            <ActiveUsage active={metrics.data.active} kpis={metrics.data.kpis} />
            <Funnel funnel={metrics.data.funnel} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FeatureUsage eventVolume={metrics.data.eventVolume} />
            <TopPages topPages={metrics.data.topPages} />
          </div>
```

- [ ] **Step 7: Keep the dashboard test's mocked metrics valid**

In `apps/web/src/routes/admin/index.test.tsx`, add `topPages` to the `metrics` fixture object, after its `funnel` line:

```ts
  funnel: [{ step: "signup", users: 7 }],
  topPages: [{ path: "/my", count: 5 }],
};
```

- [ ] **Step 8: Run the dashboard + panel tests**

Run: `pnpm --filter @turingcare/web test src/routes/admin/index.test.tsx src/routes/admin/panels/panels.test.tsx`
Expected: PASS (the dashboard still renders; both panels covered).

- [ ] **Step 9: Typecheck + lint**

Run: `pnpm --filter @turingcare/web typecheck && pnpm exec biome check --write apps/web/src/routes/admin`
Expected: typecheck clean; Biome auto-sorts the new panel imports and reports clean (re-stage if it rewrote anything).

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/routes/admin/panels/feature-usage.tsx apps/web/src/routes/admin/panels/top-pages.tsx apps/web/src/routes/admin/index.tsx apps/web/src/routes/admin/index.test.tsx apps/web/src/routes/admin/panels/panels.test.tsx
git commit -m "feat(telemetry): add Feature usage + Top pages dashboard panels" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Web suite**

Run: `pnpm --filter @turingcare/web test`
Expected: PASS (all web tests, including the new panel + view-event tests).

- [ ] **Step 2: API suite** (DB up + env loaded)

Run: `pnpm --filter @turingcare/api test`
Expected: PASS (events, telemetry, admin, dogs, etc.).

- [ ] **Step 3: Lint, typecheck, build**

Run: `pnpm lint && pnpm -r typecheck && pnpm -r build`
Expected: Biome clean; `tsc --noEmit` clean for all packages; builds succeed.

- [ ] **Step 4: Manual smoke (optional)**

With `pnpm dev` and an admin account: create a dog / journal entry / brief, visit a trainer and a course, then open `/admin` and confirm the funnel now advances past signup and the new **Feature usage** + **Top pages** panels populate.

---

## Self-Review notes

- **Spec coverage:** event taxonomy → Tasks 1–3; ingest allowlist → Task 1; `topPages` aggregation + type → Task 4; dashboard panels + funnel-now-real → Task 5; privacy model unchanged (server resolves identity; client allowlist still scalar-only ≤1KB — only two view names added); testing → each task + Task 6.
- **Type consistency:** `Metrics["eventVolume"]` is `{ name; count }[]`; `Metrics["topPages"]` is `{ path; count }[]` (defined in Task 4, consumed in Task 5). `recordEvent(name, { userId, props })` matches `RecordEventArgs`. Event-name string literals match the `KNOWN_EVENTS` added in Task 1 (`brief.shared`, `training.goal_added`, etc.).
- **No placeholders:** every code/edit step shows exact code; test payloads mirror the shapes used in `dogs.test.ts` (`validDog`, `{ kind: "moment", note }`, `{ goal }`).
