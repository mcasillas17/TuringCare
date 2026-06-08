# Weekly Skill Focus ("This Week") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-dog "This Week" tab where the owner keeps an evolving focus list of training skills and sees a Mon–Sun grid of which days each focus skill was practiced, with tap-to-log.

**Architecture:** A new `weekly_focus` table stores one row per focused skill per dog (the evolving list). A new owner-scoped focus API (`GET/POST/DELETE …/focus`) returns the focus skills plus their practice sessions within a client-supplied week window; tap-to-log reuses the existing session endpoints. The web side adds a `This Week` tab rendering a week grid + focus picker, with all day-bucketing done client-side in local time.

**Tech Stack:** Hono + Drizzle + Zod (api), Vite/React 19 + TanStack Query + react-router-dom v7 + Tailwind v4 + typed i18n (web), Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-06-07-weekly-skill-focus-design.md`

---

## File Structure

- **Shared (`packages/shared`):**
  - Create `src/focus.ts` — `focusAddSchema`, `focusWeekQuerySchema` + inferred types.
  - Modify `src/index.ts` — export `./focus`.

- **API (`apps/api`):**
  - Modify `src/db/schema.ts` — add `weeklyFocus` table (+ `unique` import).
  - Create migration `drizzle/0009_*.sql` via `db:generate`.
  - Create `src/lib/focus.ts` — `loadFocusWeek(dogId, startISO, endISO)`.
  - Modify `src/routes/dogs.ts` — add `GET/POST/DELETE /:id/focus` routes (+ imports).
  - Test `src/routes/focus.test.ts` — focus CRUD + week window.

- **Web (`apps/web`):**
  - Create `src/lib/week.ts` — pure local-time week helpers.
  - Test `src/lib/week.test.ts`.
  - Create `src/lib/weekly-focus.ts` — `useFocusWeek`, `useAddFocus`, `useRemoveFocus`.
  - Create `src/components/week/week-nav.tsx` — ◀ / This week / ▶.
  - Create `src/components/week/week-grid.tsx` — skills × 7 days grid + cell tap-to-log/remove.
  - Create `src/components/week/focus-picker.tsx` — add/remove focus skills, grouped by goal.
  - Create `src/routes/dog-week.tsx` — the tab container.
  - Test `src/routes/dog-week.test.tsx`.
  - Modify `src/components/dog-layout.tsx` — add the 5th tab.
  - Modify `src/main.tsx` — add the `week` child route.
  - Modify `src/i18n/en.ts`, `src/i18n/es.ts` — `dogHub.tabWeek` + new `week` section.

**Environment note:** API tests require a reachable Postgres (`set -a && . ./.env && set +a` first). If the local DB is down (`ECONNREFUSED`), run those steps once the DB is up or rely on CI; the web/shared tasks do not need a DB.

---

## Task 1: Shared focus schemas

**Files:**
- Create: `packages/shared/src/focus.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/focus.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/focus.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { focusAddSchema, focusWeekQuerySchema } from "./focus";

describe("focusAddSchema", () => {
  it("accepts a uuid skillId", () => {
    const r = focusAddSchema.safeParse({ skillId: "11111111-1111-1111-1111-111111111111" });
    expect(r.success).toBe(true);
  });
  it("rejects a non-uuid skillId", () => {
    expect(focusAddSchema.safeParse({ skillId: "nope" }).success).toBe(false);
  });
});

describe("focusWeekQuerySchema", () => {
  it("accepts ISO datetime bounds", () => {
    const r = focusWeekQuerySchema.safeParse({
      weekStart: "2026-06-01T07:00:00.000Z",
      weekEnd: "2026-06-08T07:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });
  it("rejects a non-datetime weekStart", () => {
    expect(
      focusWeekQuerySchema.safeParse({ weekStart: "2026-06-01", weekEnd: "2026-06-08" }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @turingcare/shared test -- focus`
Expected: FAIL — `./focus` does not exist.

- [ ] **Step 3: Create the schemas**

Create `packages/shared/src/focus.ts`:

```ts
import { z } from "zod";

export const focusAddSchema = z.object({
  skillId: z.string().uuid(),
});
export type FocusAddInput = z.infer<typeof focusAddSchema>;

export const focusWeekQuerySchema = z.object({
  weekStart: z.string().datetime(),
  weekEnd: z.string().datetime(),
});
export type FocusWeekQuery = z.infer<typeof focusWeekQuerySchema>;
```

- [ ] **Step 4: Export it**

In `packages/shared/src/index.ts`, add (keep the list alphabetical — after `./dog`):

```ts
export * from "./focus";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @turingcare/shared test -- focus`
Expected: PASS (4 assertions).

- [ ] **Step 6: tsc + commit**

Run: `pnpm --filter @turingcare/shared exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check packages/shared/src/focus.ts packages/shared/src/focus.test.ts packages/shared/src/index.ts` (expect clean; `--write` if it reports formatting).

```bash
git add packages/shared/src/focus.ts packages/shared/src/focus.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): focus add + week-query zod schemas"
```

---

## Task 2: `weekly_focus` table + migration

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0009_*.sql` (generated)

- [ ] **Step 1: Add the table to the schema**

In `apps/api/src/db/schema.ts`, first ensure `unique` is imported from `drizzle-orm/pg-core`. Find the existing `drizzle-orm/pg-core` import (it already imports `check`, `integer`, `pgTable`, `text`, `timestamp`, `uuid`, etc.) and add `unique` to that import list if absent.

Then add this block immediately after the `practiceSessions` table definition (after its closing `});`, around line 155):

```ts
export const weeklyFocus = pgTable(
  "weekly_focus",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    dogId: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => trainingSkills.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("weekly_focus_dog_skill").on(t.dogId, t.skillId)],
);
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @turingcare/api db:generate`
Expected: a new `apps/api/drizzle/0009_*.sql` is created containing `CREATE TABLE "weekly_focus"` with the FK references and a unique constraint on `(dog_id, skill_id)`. (Generation diffs the schema and does NOT need a database connection.)

- [ ] **Step 3: Apply the migration (requires DB)**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api db:migrate`
Expected: applies cleanly (nullable/new-table only, no rewrite). If Postgres is unreachable locally, skip this step — it runs in CI / when the DB is up. The generated SQL is what matters for the commit.

- [ ] **Step 4: tsc + commit**

Run: `pnpm --filter @turingcare/api exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/api/src/db/schema.ts` (expect clean; `--write` if needed).

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/
git commit -m "feat(api): weekly_focus table + migration 0009"
```

---

## Task 3: Focus API (loader + routes) + tests

**Files:**
- Create: `apps/api/src/lib/focus.ts`
- Modify: `apps/api/src/routes/dogs.ts`
- Test: `apps/api/src/routes/focus.test.ts`

- [ ] **Step 1: Create the loader**

Create `apps/api/src/lib/focus.ts`:

```ts
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "../db";
import { practiceSessions, trainingGoals, trainingSkills, weeklyFocus } from "../db/schema";

export type FocusSession = {
  id: string;
  occurredAt: string;
  durationMinutes: number | null;
};

export type FocusSkill = {
  skillId: string;
  name: string;
  goalId: string;
  goalName: string;
  position: number;
  sessions: FocusSession[];
};

export async function loadFocusWeek(
  dogId: string,
  startISO: string,
  endISO: string,
): Promise<{ focusSkills: FocusSkill[] }> {
  const focus = await db
    .select({
      skillId: weeklyFocus.skillId,
      position: weeklyFocus.position,
      createdAt: weeklyFocus.createdAt,
      name: trainingSkills.name,
      goalId: trainingSkills.goalId,
      goalName: trainingGoals.goal,
    })
    .from(weeklyFocus)
    .innerJoin(trainingSkills, eq(weeklyFocus.skillId, trainingSkills.id))
    .innerJoin(trainingGoals, eq(trainingSkills.goalId, trainingGoals.id))
    .where(eq(weeklyFocus.dogId, dogId))
    .orderBy(asc(weeklyFocus.position), asc(weeklyFocus.createdAt));

  const skillIds = focus.map((f) => f.skillId);
  const sessions =
    skillIds.length === 0
      ? []
      : await db
          .select({
            id: practiceSessions.id,
            skillId: practiceSessions.skillId,
            occurredAt: practiceSessions.occurredAt,
            durationMinutes: practiceSessions.durationMinutes,
          })
          .from(practiceSessions)
          .where(
            and(
              inArray(practiceSessions.skillId, skillIds),
              gte(practiceSessions.occurredAt, new Date(startISO)),
              lt(practiceSessions.occurredAt, new Date(endISO)),
            ),
          )
          .orderBy(asc(practiceSessions.occurredAt));

  const bySkill = new Map<string, FocusSession[]>();
  for (const s of sessions) {
    const arr = bySkill.get(s.skillId) ?? [];
    arr.push({
      id: s.id,
      occurredAt: s.occurredAt.toISOString(),
      durationMinutes: s.durationMinutes,
    });
    bySkill.set(s.skillId, arr);
  }

  return {
    focusSkills: focus.map((f) => ({
      skillId: f.skillId,
      name: f.name,
      goalId: f.goalId,
      goalName: f.goalName,
      position: f.position,
      sessions: bySkill.get(f.skillId) ?? [],
    })),
  };
}
```

- [ ] **Step 2: Add the routes**

In `apps/api/src/routes/dogs.ts`:

(a) Add `focusAddSchema` and `focusWeekQuerySchema` to the existing `@turingcare/shared` import block (alphabetical, before `journalEntryCreateSchema`).

(b) Add `lt` to the existing `drizzle-orm` import (currently `{ and, desc, eq, gte, max }`) → `{ and, desc, eq, gte, lt, max }`.

(c) Add `weeklyFocus` to the existing `../db/schema` import block (alphabetical, after `user` is fine — keep it tidy).

(d) Add `import { loadFocusWeek } from "../lib/focus";` next to the existing `import { loadProgress } from "../lib/progress";`.

(e) Insert these three routes into the `dogsApp` chain. Put them immediately after the practice-session DELETE route (after its closing `})` near line 280), before whatever route currently follows:

```ts
  .get("/:id/focus", zValidator("query", focusWeekQuerySchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const { weekStart, weekEnd } = c.req.valid("query");
    const data = await loadFocusWeek(dog.id, weekStart, weekEnd);
    return c.json(data);
  })
  .post("/:id/focus", zValidator("json", focusAddSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const { skillId } = c.req.valid("json");
    const skill = await findOwnedSkill(c.get("userId"), dog.id, skillId);
    if (!skill) return c.json({ error: "not_found" } as const, 404);
    const existing = await db
      .select({ id: weeklyFocus.id })
      .from(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dog.id), eq(weeklyFocus.skillId, skillId)))
      .limit(1);
    if (existing[0]) return c.json({ error: "already_focused" } as const, 409);
    const [{ value: maxPos } = { value: null }] = await db
      .select({ value: max(weeklyFocus.position) })
      .from(weeklyFocus)
      .where(eq(weeklyFocus.dogId, dog.id));
    const [row] = await db
      .insert(weeklyFocus)
      .values({ dogId: dog.id, skillId, position: (maxPos ?? -1) + 1 })
      .returning();
    if (!row) throw new Error("failed to add focus skill");
    return c.json({ focus: row }, 201);
  })
  .delete("/:id/focus/:skillId", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [deleted] = await db
      .delete(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dog.id), eq(weeklyFocus.skillId, c.req.param("skillId"))))
      .returning({ id: weeklyFocus.id });
    if (!deleted) return c.json({ error: "not_found" } as const, 404);
    return c.json({ ok: true } as const);
  })
```

- [ ] **Step 3: Write the API test**

Look at an existing route test (e.g. `apps/api/src/routes/dogs.test.ts` or `training.test.ts`) to copy the exact sign-up/auth + dog/goal/skill setup helpers used in this codebase. Create `apps/api/src/routes/focus.test.ts` following that same harness. The test must cover:

```ts
// Pseudocode shape — use THIS FILE'S real auth+seed helpers (copy from an
// existing route test in apps/api/src/routes/*.test.ts):
//
// describe("focus", () => {
//   beforeEach: sign up a user, create a dog, a goal, two skills (A, B);
//              capture authed request helper + ids.
//
//   it("POST adds a skill to the focus list (201) and GET returns it") {
//     POST /api/dogs/:id/focus { skillId: A } -> 201
//     GET  /api/dogs/:id/focus?weekStart=..&weekEnd=.. -> focusSkills has A
//   }
//   it("POST the same skill twice returns 409") {
//     POST A -> 201; POST A -> 409 { error: "already_focused" }
//   }
//   it("POST a skill that doesn't belong to the dog returns 404") {
//     POST /api/dogs/:id/focus { skillId: <random uuid> } -> 404
//   }
//   it("GET only returns sessions inside the week window") {
//     POST focus A;
//     log a session for A at 2026-06-03T12:00:00Z (in week of Jun 1);
//     log a session for A at 2026-06-15T12:00:00Z (next week);
//     GET focus weekStart=2026-06-01T00:00:00Z weekEnd=2026-06-08T00:00:00Z
//       -> A.sessions length 1, occurredAt is the Jun 3 one
//   }
//   it("DELETE removes the focus skill (and 404 when not focused)") {
//     POST A; DELETE A -> ok; DELETE A again -> 404
//   }
//   it("deleting the skill cascades the focus row") {
//     POST focus A; DELETE /api/dogs/:id/skills/:A -> ok;
//     GET focus -> focusSkills empty
//   }
// });
```

Write these as real tests using the harness from the sibling test file. Use ISO instants with `Z` for the session `occurredAt` and the week query bounds so the window math is unambiguous.

- [ ] **Step 4: Run the API test (requires DB)**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api test -- focus`
Expected: PASS (6 tests). If Postgres is unreachable (`ECONNREFUSED`), this is the documented shared-test-DB drift — start the DB or defer to CI; do not treat it as a code failure. Confirm tsc instead (next step) before committing.

- [ ] **Step 5: tsc + lint + commit**

Run: `pnpm --filter @turingcare/api exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/api/src/lib/focus.ts apps/api/src/routes/dogs.ts apps/api/src/routes/focus.test.ts` (expect clean; `--write` if needed).

```bash
git add apps/api/src/lib/focus.ts apps/api/src/routes/dogs.ts apps/api/src/routes/focus.test.ts
git commit -m "feat(api): weekly focus endpoints (GET/POST/DELETE) + tests"
```

---

## Task 4: Web week-date utilities (pure)

**Files:**
- Create: `apps/web/src/lib/week.ts`
- Test: `apps/web/src/lib/week.test.ts`

These are pure, local-time helpers. No DB, no network — fully unit-testable.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/week.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addDays, dayKey, mondayOf, sameWeek, weekBounds, weekDays } from "./week";

describe("week helpers", () => {
  it("mondayOf returns the Monday of that local week", () => {
    // 2026-06-04 is a Thursday (local) -> Monday is 2026-06-01
    const mon = mondayOf(new Date(2026, 5, 4));
    expect(dayKey(mon)).toBe("2026-06-01");
    // A Monday maps to itself
    expect(dayKey(mondayOf(new Date(2026, 5, 1)))).toBe("2026-06-01");
    // A Sunday maps back to the prior Monday
    expect(dayKey(mondayOf(new Date(2026, 5, 7)))).toBe("2026-06-01");
  });

  it("weekDays returns 7 consecutive local days starting Monday", () => {
    const days = weekDays(mondayOf(new Date(2026, 5, 4)));
    expect(days).toHaveLength(7);
    expect(dayKey(days[0])).toBe("2026-06-01");
    expect(dayKey(days[6])).toBe("2026-06-07");
  });

  it("weekBounds returns ISO instants for [Monday, next Monday)", () => {
    const { weekStart, weekEnd } = weekBounds(mondayOf(new Date(2026, 5, 4)));
    expect(new Date(weekStart).getTime()).toBeLessThan(new Date(weekEnd).getTime());
    // exactly 7 days apart
    expect(new Date(weekEnd).getTime() - new Date(weekStart).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("addDays adds calendar days", () => {
    expect(dayKey(addDays(new Date(2026, 5, 1), 3))).toBe("2026-06-04");
  });

  it("sameWeek compares by Monday", () => {
    expect(sameWeek(new Date(2026, 5, 1), new Date(2026, 5, 7))).toBe(true);
    expect(sameWeek(new Date(2026, 5, 1), new Date(2026, 5, 8))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @turingcare/web test -- week`
Expected: FAIL — `./week` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `apps/web/src/lib/week.ts`:

```ts
/** Local midnight at the Monday of the given date's week. */
export function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (d.getDay() + 6) % 7; // getDay: 0=Sun..6=Sat
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

/** A new Date n calendar days after the given date (local time). */
export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** The 7 local days [Mon..Sun] of the week starting at `monday`. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** ISO instants for the half-open range [monday, monday+7d). */
export function weekBounds(monday: Date): { weekStart: string; weekEnd: string } {
  return { weekStart: monday.toISOString(), weekEnd: addDays(monday, 7).toISOString() };
}

/** Local YYYY-MM-DD key for a date. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** True if both dates fall in the same local Mon–Sun week. */
export function sameWeek(a: Date, b: Date): boolean {
  return mondayOf(a).getTime() === mondayOf(b).getTime();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @turingcare/web test -- week`
Expected: PASS (5 tests).

- [ ] **Step 5: tsc + lint + commit**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/web/src/lib/week.ts apps/web/src/lib/week.test.ts` (expect clean; `--write` if needed).

```bash
git add apps/web/src/lib/week.ts apps/web/src/lib/week.test.ts
git commit -m "feat(web): local-time week date helpers"
```

---

## Task 5: Web focus data hooks

**Files:**
- Create: `apps/web/src/lib/weekly-focus.ts`

No new test file here — these hooks are exercised by the `dog-week` route test in Task 7. (Mirrors the repo convention where thin RPC hooks like `lib/brief.ts` have no standalone test.)

- [ ] **Step 1: Create the hooks**

Create `apps/web/src/lib/weekly-focus.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type FocusSession = {
  id: string;
  occurredAt: string;
  durationMinutes: number | null;
};

export type FocusSkill = {
  skillId: string;
  name: string;
  goalId: string;
  goalName: string;
  position: number;
  sessions: FocusSession[];
};

const focusApi = api.api.dogs[":id"].focus;

export function focusKey(dogId: string) {
  return ["focus", dogId] as const;
}

export function useFocusWeek(dogId: string, weekStart: string, weekEnd: string) {
  return useQuery({
    queryKey: ["focus", dogId, weekStart],
    enabled: !!dogId,
    queryFn: async (): Promise<FocusSkill[]> => {
      const res = await focusApi.$get({ param: { id: dogId }, query: { weekStart, weekEnd } });
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).focusSkills;
    },
  });
}

export function useAddFocus(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: string) => {
      const res = await focusApi.$post({ param: { id: dogId }, json: { skillId } });
      if (!res.ok) throw new Error("add_failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: focusKey(dogId) }),
  });
}

export function useRemoveFocus(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: string) => {
      const res = await focusApi[":skillId"].$delete({ param: { id: dogId, skillId } });
      if (!res.ok) throw new Error("remove_failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: focusKey(dogId) }),
  });
}
```

(`queryKey: ["focus", dogId, weekStart]` includes the week so paging refetches; `focusKey(dogId)` invalidates every week of that dog after add/remove.)

- [ ] **Step 2: tsc + lint + commit**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/web/src/lib/weekly-focus.ts` (expect clean; `--write` if needed).

```bash
git add apps/web/src/lib/weekly-focus.ts
git commit -m "feat(web): weekly-focus data hooks"
```

---

## Task 6: Web presentational components (WeekNav, WeekGrid, FocusPicker)

**Files:**
- Create: `apps/web/src/components/week/week-nav.tsx`
- Create: `apps/web/src/components/week/week-grid.tsx`
- Create: `apps/web/src/components/week/focus-picker.tsx`

These consume i18n keys added in Task 7; that's fine — they compile now and are wired/tested in Task 7. (If you run a standalone tsc before Task 7, the `t("week.…")` calls still typecheck only once the keys exist, so commit this task together with Task 7's i18n additions if tsc complains. Simplest: do Task 7 Step 1 — i18n keys — before this task's tsc check.)

- [ ] **Step 1: Create `WeekNav`**

Create `apps/web/src/components/week/week-nav.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

type Props = {
  rangeLabel: string;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onThisWeek: () => void;
};

export function WeekNav({ rangeLabel, canGoNext, onPrev, onNext, onThisWeek }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-2">
      <Button type="button" variant="outline" aria-label={t("week.prevWeek")} onClick={onPrev}>
        ◀
      </Button>
      <button
        type="button"
        onClick={onThisWeek}
        className="text-sm font-medium text-slate hover:underline"
      >
        {rangeLabel}
      </button>
      <Button
        type="button"
        variant="outline"
        aria-label={t("week.nextWeek")}
        onClick={onNext}
        disabled={!canGoNext}
      >
        ▶
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Create `WeekGrid`**

Create `apps/web/src/components/week/week-grid.tsx`. Rows = focus skills, columns = the 7 local days. Empty past/today cell → tap logs a session; filled cell → opens a popover listing that day's sessions with remove + "log another"; future cells are disabled.

```tsx
import { useI18n } from "@/i18n";
import { dayKey } from "@/lib/week";
import type { FocusSession, FocusSkill } from "@/lib/weekly-focus";
import { useState } from "react";

type Props = {
  focusSkills: FocusSkill[];
  days: Date[];
  today: Date;
  onLog: (skillId: string, day: Date) => void;
  onRemove: (skillId: string, sessionId: string) => void;
};

function sessionsForCell(skill: FocusSkill, key: string): FocusSession[] {
  return skill.sessions.filter((s) => dayKey(new Date(s.occurredAt)) === key);
}

export function WeekGrid({ focusSkills, days, today, onLog, onRemove }: Props) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState<{ skillId: string; key: string } | null>(null);
  const todayKey = dayKey(today);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="p-2 text-left font-medium text-slate-soft"> </th>
            {days.map((d) => {
              const key = dayKey(d);
              return (
                <th
                  key={key}
                  className={`p-2 text-center font-medium ${
                    key === todayKey ? "text-slate" : "text-slate-soft"
                  }`}
                >
                  {weekday.format(d)}
                  <div className="text-xs">{d.getDate()}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {focusSkills.map((skill) => (
            <tr key={skill.skillId} className="border-t border-silver">
              <td className="p-2 align-top">
                <div className="font-medium text-slate">{skill.name}</div>
                <div className="text-xs text-slate-soft">{skill.goalName}</div>
              </td>
              {days.map((d) => {
                const key = dayKey(d);
                const cellSessions = sessionsForCell(skill, key);
                const isFuture = d.getTime() > today.getTime() && key !== todayKey;
                const count = cellSessions.length;
                const isOpen = open?.skillId === skill.skillId && open?.key === key;
                return (
                  <td key={key} className="relative p-1 text-center align-middle">
                    <button
                      type="button"
                      disabled={isFuture}
                      aria-label={
                        count > 0
                          ? t("week.cellFilled", { skill: skill.name, day: key, n: count })
                          : t("week.cellLog", { skill: skill.name, day: key })
                      }
                      onClick={() =>
                        count > 0 ? setOpen(isOpen ? null : { skillId: skill.skillId, key }) : onLog(skill.skillId, d)
                      }
                      className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-base ${
                        isFuture
                          ? "cursor-not-allowed text-silver"
                          : count > 0
                            ? "bg-copper/15 text-copper hover:bg-copper/25"
                            : "text-silver hover:bg-surface-sand hover:text-slate"
                      }`}
                    >
                      {count > 1 ? count : count === 1 ? "●" : "·"}
                    </button>
                    {isOpen && (
                      <div className="absolute left-1/2 z-20 mt-1 w-44 -translate-x-1/2 space-y-1 rounded border border-silver bg-white p-2 text-left shadow-md">
                        {cellSessions.map((s) => (
                          <div key={s.id} className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-soft">
                              {new Date(s.occurredAt).toLocaleTimeString(locale, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                              {s.durationMinutes != null ? ` · ${s.durationMinutes}m` : ""}
                            </span>
                            <button
                              type="button"
                              aria-label={t("week.remove")}
                              className="text-xs text-red-600 hover:underline"
                              onClick={() => {
                                onRemove(skill.skillId, s.id);
                                if (cellSessions.length <= 1) setOpen(null);
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="w-full rounded bg-slate px-2 py-1 text-xs text-cream"
                          onClick={() => onLog(skill.skillId, d)}
                        >
                          {t("week.logAnother")}
                        </button>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create `FocusPicker`**

Create `apps/web/src/components/week/focus-picker.tsx`. Lists the dog's existing skills grouped by goal (from `useProgress`), with a toggle to add/remove from the focus list.

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useProgress } from "@/lib/progress";
import type { FocusSkill } from "@/lib/weekly-focus";
import { useAddFocus, useRemoveFocus } from "@/lib/weekly-focus";

type Props = {
  dogId: string;
  focusSkills: FocusSkill[];
  onClose: () => void;
};

export function FocusPicker({ dogId, focusSkills, onClose }: Props) {
  const { t } = useI18n();
  const { data: goals } = useProgress(dogId);
  const add = useAddFocus(dogId);
  const remove = useRemoveFocus(dogId);
  const focusedIds = new Set(focusSkills.map((f) => f.skillId));
  const goalList = goals ?? [];
  const hasSkills = goalList.some((g) => g.skills.length > 0);

  return (
    <section className="space-y-3 rounded border border-silver bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate">{t("week.pickerTitle")}</h2>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("week.pickerDone")}
        </Button>
      </div>
      {!hasSkills && <p className="text-slate-soft text-sm">{t("week.noSkills")}</p>}
      {goalList.map((goal) =>
        goal.skills.length === 0 ? null : (
          <div key={goal.id} className="space-y-1">
            <div className="text-xs font-medium text-slate-soft">{goal.goal}</div>
            <ul className="space-y-1">
              {goal.skills.map((skill) => {
                const focused = focusedIds.has(skill.id);
                return (
                  <li key={skill.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate">{skill.name}</span>
                    <Button
                      type="button"
                      variant={focused ? "default" : "outline"}
                      onClick={() => (focused ? remove.mutate(skill.id) : add.mutate(skill.id))}
                    >
                      {focused ? t("week.inFocus") : t("week.addToFocus")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ),
      )}
    </section>
  );
}
```

- [ ] **Step 4: tsc + lint + commit**

(Do Task 7 Step 1 first if `t("week.…")` keys aren't present yet.)
Run: `pnpm --filter @turingcare/web exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/web/src/components/week/` (expect clean; `--write` if needed).

```bash
git add apps/web/src/components/week/
git commit -m "feat(web): WeekNav + WeekGrid + FocusPicker components"
```

---

## Task 7: i18n, "This Week" route + tab wiring, route test

**Files:**
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`
- Create: `apps/web/src/routes/dog-week.tsx`
- Test: `apps/web/src/routes/dog-week.test.tsx`
- Modify: `apps/web/src/components/dog-layout.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Add i18n keys**

In `apps/web/src/i18n/en.ts`, add `tabWeek: "This Week",` to the existing `dogHub: { … }` section (next to `tabBrief`). Then add a new top-level `week` section (place it right after the `dogHub` block):

```ts
  week: {
    title: "This week",
    pickFocus: "Pick skills to focus on this week",
    editFocus: "Edit focus",
    noSkills: "Add skills in the Training tab first, then choose your weekly focus.",
    goToTraining: "Go to Training",
    summary: "Trained {done} of {total} focus skills · {sessions} sessions",
    prevWeek: "Previous week",
    nextWeek: "Next week",
    thisWeek: "This week",
    logAnother: "Log another",
    remove: "Remove",
    pickerTitle: "Choose focus skills",
    pickerDone: "Done",
    addToFocus: "Add",
    inFocus: "In focus",
    cellLog: "Log {skill} on {day}",
    cellFilled: "{skill} on {day}: {n} sessions",
  },
```

In `apps/web/src/i18n/es.ts`, add `tabWeek: "Esta semana",` to `dogHub`, and the matching `week` section (every value must differ from the English one to satisfy the parity test):

```ts
  week: {
    title: "Esta semana",
    pickFocus: "Elige las habilidades en las que enfocarte esta semana",
    editFocus: "Editar enfoque",
    noSkills: "Primero agrega habilidades en la pestaña Entrenamiento y luego elige tu enfoque semanal.",
    goToTraining: "Ir a Entrenamiento",
    summary: "Entrenaste {done} de {total} habilidades · {sessions} sesiones",
    prevWeek: "Semana anterior",
    nextWeek: "Semana siguiente",
    thisWeek: "Esta semana",
    logAnother: "Registrar otra",
    remove: "Quitar",
    pickerTitle: "Elige habilidades de enfoque",
    pickerDone: "Listo",
    addToFocus: "Agregar",
    inFocus: "En enfoque",
    cellLog: "Registrar {skill} el {day}",
    cellFilled: "{skill} el {day}: {n} sesiones",
  },
```

- [ ] **Step 2: Write the failing route test**

Create `apps/web/src/routes/dog-week.test.tsx`. Mock the focus + progress + session hooks (same `vi.mock` style as `dog-hub.test.tsx`):

```tsx
import { LocaleProvider } from "@/i18n";
import * as progressLib from "@/lib/progress";
import * as focusLib from "@/lib/weekly-focus";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DogWeek } from "./dog-week";

vi.mock("@/lib/weekly-focus", async () => {
  const actual = await vi.importActual<typeof import("@/lib/weekly-focus")>("@/lib/weekly-focus");
  return {
    ...actual,
    useFocusWeek: vi.fn(),
    useAddFocus: vi.fn(),
    useRemoveFocus: vi.fn(),
  };
});
vi.mock("@/lib/progress", () => ({
  useProgress: vi.fn(),
  useLogSession: vi.fn(),
  useDeleteSession: vi.fn(),
}));

function setup(focusSkills: focusLib.FocusSkill[]) {
  vi.mocked(focusLib.useFocusWeek).mockReturnValue({
    data: focusSkills,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof focusLib.useFocusWeek>);
  vi.mocked(focusLib.useAddFocus).mockReturnValue({
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof focusLib.useAddFocus>);
  vi.mocked(focusLib.useRemoveFocus).mockReturnValue({
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof focusLib.useRemoveFocus>);
  vi.mocked(progressLib.useProgress).mockReturnValue({
    data: [],
  } as unknown as ReturnType<typeof progressLib.useProgress>);
  const logMutate = vi.fn().mockResolvedValue({});
  vi.mocked(progressLib.useLogSession).mockReturnValue({
    mutateAsync: logMutate,
  } as unknown as ReturnType<typeof progressLib.useLogSession>);
  vi.mocked(progressLib.useDeleteSession).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
  } as unknown as ReturnType<typeof progressLib.useDeleteSession>);
  return { logMutate };
}

function renderWeek() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/my/dogs/d1/week"]}>
          <Routes>
            <Route path="/my/dogs/:id/week" element={<DogWeek />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.resetAllMocks());

describe("DogWeek", () => {
  it("shows the pick-focus empty state when there are no focus skills", () => {
    setup([]);
    renderWeek();
    expect(screen.getByText(/Pick skills to focus on this week/i)).toBeInTheDocument();
  });

  it("renders a focus skill row and its goal", () => {
    setup([
      { skillId: "s1", name: "Recall", goalId: "g1", goalName: "Reliability", position: 0, sessions: [] },
    ]);
    renderWeek();
    expect(screen.getByText("Recall")).toBeInTheDocument();
    expect(screen.getByText("Reliability")).toBeInTheDocument();
  });

  it("logs a session when an empty cell is tapped", () => {
    const { logMutate } = setup([
      { skillId: "s1", name: "Recall", goalId: "g1", goalName: "Reliability", position: 0, sessions: [] },
    ]);
    renderWeek();
    // Tap the first loggable (non-future) empty cell for this skill.
    const cell = screen.getAllByRole("button", { name: /Log Recall on/i })[0];
    fireEvent.click(cell);
    expect(logMutate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @turingcare/web test -- dog-week`
Expected: FAIL — `DogWeek` does not exist.

- [ ] **Step 4: Create the `DogWeek` route**

Create `apps/web/src/routes/dog-week.tsx`:

```tsx
import { FocusPicker } from "@/components/week/focus-picker";
import { WeekGrid } from "@/components/week/week-grid";
import { WeekNav } from "@/components/week/week-nav";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDeleteSession, useLogSession } from "@/lib/progress";
import { addDays, dayKey, mondayOf, sameWeek, weekBounds, weekDays } from "@/lib/week";
import { focusKey, useFocusWeek } from "@/lib/weekly-focus";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

export function DogWeek() {
  const { t, locale } = useI18n();
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const today = useMemo(() => new Date(), []);
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [pickerOpen, setPickerOpen] = useState(false);

  const { weekStart, weekEnd } = useMemo(() => weekBounds(monday), [monday]);
  const days = useMemo(() => weekDays(monday), [monday]);
  const { data: focusSkills } = useFocusWeek(id, weekStart, weekEnd);
  const logSession = useLogSession(id);
  const deleteSession = useDeleteSession(id);

  const skills = focusSkills ?? [];
  const canGoNext = !sameWeek(monday, today);

  const sessionCount = skills.reduce((sum, s) => sum + s.sessions.length, 0);
  const doneCount = skills.filter((s) => s.sessions.length > 0).length;

  const refreshFocus = () => qc.invalidateQueries({ queryKey: focusKey(id) });

  const onLog = async (skillId: string, day: Date) => {
    const isToday = dayKey(day) === dayKey(today);
    const occurredAt = isToday
      ? new Date().toISOString()
      : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0).toISOString();
    await logSession.mutateAsync({ skillId, body: { occurredAt } });
    refreshFocus();
  };

  const onRemove = async (skillId: string, sessionId: string) => {
    await deleteSession.mutateAsync({ skillId, sessionId });
    refreshFocus();
  };

  const rangeLabel = `${days[0].toLocaleDateString(locale, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(locale, { month: "short", day: "numeric" })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate">{t("week.title")}</h1>
        <Button type="button" variant="outline" onClick={() => setPickerOpen((v) => !v)}>
          {t("week.editFocus")}
        </Button>
      </div>

      <WeekNav
        rangeLabel={rangeLabel}
        canGoNext={canGoNext}
        onPrev={() => setMonday((m) => addDays(m, -7))}
        onNext={() => setMonday((m) => addDays(m, 7))}
        onThisWeek={() => setMonday(mondayOf(new Date()))}
      />

      {skills.length > 0 && (
        <p className="text-sm text-slate-soft">
          {t("week.summary", { done: doneCount, total: skills.length, sessions: sessionCount })}
        </p>
      )}

      {pickerOpen && (
        <FocusPicker dogId={id} focusSkills={skills} onClose={() => setPickerOpen(false)} />
      )}

      {skills.length === 0 ? (
        <section className="space-y-3 rounded border border-silver bg-white p-6 text-center">
          <p className="text-slate-soft">{t("week.pickFocus")}</p>
          <Button type="button" className="bg-slate text-cream" onClick={() => setPickerOpen(true)}>
            {t("week.editFocus")}
          </Button>
          <div>
            <Link to={`/my/dogs/${id}/training`} className="text-sm text-copper hover:underline">
              {t("week.goToTraining")}
            </Link>
          </div>
        </section>
      ) : (
        <WeekGrid
          focusSkills={skills}
          days={days}
          today={today}
          onLog={onLog}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire the tab in `DogLayout`**

In `apps/web/src/components/dog-layout.tsx`, add a 5th entry to the `tabs` array (after the brief tab):

```tsx
    { to: `/my/dogs/${dog.id}/week`, label: t("dogHub.tabWeek"), end: false },
```

- [ ] **Step 6: Wire the route in `main.tsx`**

In `apps/web/src/main.tsx`, add the import (alphabetical with other `@/routes/*`):

```ts
import { DogWeek } from "@/routes/dog-week";
```

And add the child route inside the `<Route path="/my/dogs/:id" element={<DogLayout />}>` block, after the `brief` child:

```tsx
                <Route path="week" element={<DogWeek />} />
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @turingcare/web test -- dog-week`
Expected: PASS (3 tests).

Run: `pnpm --filter @turingcare/web test -- i18n`
Expected: PASS (parity — every es `week.*` value differs from en).

- [ ] **Step 8: tsc + lint + commit**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/web/src/routes/dog-week.tsx apps/web/src/routes/dog-week.test.tsx apps/web/src/components/dog-layout.tsx apps/web/src/main.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts` (expect clean; `--write` if needed).

```bash
git add apps/web/src/routes/dog-week.tsx apps/web/src/routes/dog-week.test.tsx apps/web/src/components/dog-layout.tsx apps/web/src/main.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): This Week tab (focus grid + picker) wired into the dog layout"
```

---

## Task 8: Full gates, docs, push + PR

**Files:**
- Modify: `docs/PROJECT-LOG.md`, `README.md`

- [ ] **Step 1: Run the full gate suite**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm --filter @turingcare/api exec tsc --noEmit
pnpm lint
pnpm --filter @turingcare/shared test
pnpm --filter @turingcare/web test
pnpm --filter @turingcare/api test
pnpm --filter @turingcare/web build
```
Expected: all green. If the api suite fails only with Postgres `ECONNREFUSED`, that's the documented shared-test-DB environment drift — note it and rely on CI; it is not a code failure (confirm api tsc is 0).

- [ ] **Step 2: PROJECT-LOG entry**

Append a dated entry to `docs/PROJECT-LOG.md` summarizing: per-dog "This Week" tab; evolving `weekly_focus` list; Mon–Sun grid computed from dated `practice_sessions`; tap-to-log reusing session endpoints; presence-only, page-back weeks; new table + migration 0009; no change to existing session/journal flows. List spec + plan paths and the gate results (note the api-suite DB caveat if it applied).

- [ ] **Step 3: README "What's next" → "What's built"**

In `README.md`, move the "Weekly skill focus + calendar tracking" bullet out of **What's next** and into the **What's built** highlights, reworded to past/present tense (e.g. "Weekly skill focus — pick the skills to work on this week and track which days you practiced them, on a per-dog This Week tab").

- [ ] **Step 4: Commit docs**

```bash
git add docs/PROJECT-LOG.md README.md
git commit -m "docs: log weekly skill focus (This Week)"
```

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feature/weekly-skill-focus
gh pr create --title "Weekly skill focus (This Week)" --body "See PROJECT-LOG entry + spec." --base main --head feature/weekly-skill-focus
```

---

## Self-Review (run during planning)

- **Spec coverage:**
  - Concept (focus list + week grid, tap-to-log, page weeks, presence-only) → Tasks 6 + 7.
  - Data model (`weekly_focus`, unique, cascade) → Task 2.
  - API (`GET/POST/DELETE …/focus`, reuse session endpoints, shared zod) → Tasks 1 + 3.
  - Web (This Week tab, lib, components, picker, empty states, invalidation) → Tasks 4–7.
  - Conventions (Monday start, local TZ, invalidate focus + progress) → `lib/week.ts` (Task 4) + `dog-week.tsx` (`refreshFocus` + `useLogSession` invalidates `["progress"]`).
  - Testing (API CRUD/window/cascade; web grid/log/picker/empty + parity + week util) → Tasks 3, 4, 7.
- **Placeholders:** none, except the API test (Task 3 Step 3) which intentionally defers to the sibling test file's auth/seed harness — the required cases are enumerated explicitly. All component/route/lib code is complete.
- **Type consistency:** `FocusSkill`/`FocusSession` shapes match between api `lib/focus.ts` (Task 3) and web `lib/weekly-focus.ts` (Task 5) and are consumed verbatim by `WeekGrid`/`FocusPicker`/`DogWeek`. `useLogSession`/`useDeleteSession` arg shapes (`{ skillId, body }` / `{ skillId, sessionId }`) match `lib/progress.ts`. Week helper names (`mondayOf`, `addDays`, `weekDays`, `weekBounds`, `dayKey`, `sameWeek`) are identical across Task 4 definition and Task 7 usage. i18n keys used by Task 6 components are all defined in Task 7 Step 1.
- **Ordering gotcha baked in:** Task 6 notes that Task 7's i18n keys must exist before its tsc check passes (do Task 7 Step 1 first, or commit 6+7 together).
