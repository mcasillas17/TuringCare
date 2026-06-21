# Skill Milestones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each training skill's 5 levels checkable milestones with dated completion — the manual confidence chip becomes a tap-to-advance milestone stepper, and we record when each level was reached.

**Architecture:** Reuse `training_skills.confidence` as the stored "current level". Add a `skill_milestones` table recording the date each level (2–5) is reached; "reached" is derived (`level <= confidence`) so no backfill. A new `PUT …/skills/:skillId/level` endpoint sets the level and stamps newly-reached dates; `loadProgress` returns each skill's recorded dates. The web swaps the inline confidence chip for a milestone stepper.

**Tech Stack:** Hono + Drizzle (Postgres) API, typed `hc<AppType>` RPC client, React 19 + Tailwind v4 + TanStack Query web, Zod shared schemas, Vitest, Biome, typed i18n (en/es).

**Conventions:**
- Work in this git worktree; before each commit run `git branch --show-current` and confirm it prints `feat/skill-milestones`.
- Each task ends green. Web gates: `pnpm --filter @turingcare/web exec tsc --noEmit`, `pnpm --filter @turingcare/web test`, `pnpm exec biome check apps/web/src`. API gates: `pnpm --filter @turingcare/api exec tsc --noEmit`; API vitest needs Postgres (runs in CI) — run locally if Docker DB is up, otherwise rely on CI and still write the tests.
- API test harness pattern: see `apps/api/src/routes/focus.test.ts` (`app.request(...)` + `createTestUser` from `../test-helpers` + local `makeDog/makeGoal/makeSkill` helpers).
- i18n parity test (`apps/web/src/i18n/i18n.test.tsx`) requires equal key sets and every es value ≠ its en value.
- Tailwind tokens in use: `slate`, `slate-soft`, `cream`, `silver`, `copper` (support `/opacity`). `green-*`/`red-*` are stock.

---

## Task 1: Shared `skillLevelSchema`

**Files:**
- Modify: `packages/shared/src/progress.ts`
- Test: `packages/shared/src/progress.test.ts` (create if absent; otherwise append)

- [ ] **Step 1: Write the failing test** — append to `packages/shared/src/progress.test.ts` (create the file with this content if it doesn't exist):

```ts
import { describe, expect, it } from "vitest";
import { skillLevelSchema } from "./progress";

describe("skillLevelSchema", () => {
  it("accepts levels 1..5", () => {
    for (const level of [1, 2, 3, 4, 5]) {
      expect(skillLevelSchema.parse({ level }).level).toBe(level);
    }
  });
  it("rejects out-of-range and non-integers", () => {
    expect(skillLevelSchema.safeParse({ level: 0 }).success).toBe(false);
    expect(skillLevelSchema.safeParse({ level: 6 }).success).toBe(false);
    expect(skillLevelSchema.safeParse({ level: 2.5 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/shared exec vitest run src/progress.test.ts`
Expected: FAIL (`skillLevelSchema` not exported).

- [ ] **Step 3: Add the schema** — in `packages/shared/src/progress.ts`, after `skillConfidenceSchema`/`SkillConfidenceInput`, add:

```ts
export const skillLevelSchema = z.object({
  level: z.number().int().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX),
});
export type SkillLevelInput = z.infer<typeof skillLevelSchema>;
```

- [ ] **Step 4: Run it, expect PASS**

Run: `pnpm --filter @turingcare/shared exec vitest run src/progress.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @turingcare/shared exec tsc --noEmit
git add packages/shared/src/progress.ts packages/shared/src/progress.test.ts
git commit -m "feat(shared): skillLevelSchema (1-5)"
```

---

## Task 2: `skill_milestones` table + migration

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create (generated): `apps/api/drizzle/XXXX_*.sql` + meta snapshot

- [ ] **Step 1: Add the table to `apps/api/src/db/schema.ts`** — directly after the `practiceSessions` table definition, add:

```ts
export const skillMilestones = pgTable(
  "skill_milestones",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => trainingSkills.id, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    reachedAt: timestamp("reached_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("skill_milestone_skill_level").on(t.skillId, t.level),
    check("milestone_level_range", sql`${t.level} BETWEEN 2 AND 5`),
  ],
);
```

Then add its relations next to `practiceSessionsRelations`:

```ts
export const skillMilestonesRelations = relations(skillMilestones, ({ one }) => ({
  skill: one(trainingSkills, {
    fields: [skillMilestones.skillId],
    references: [trainingSkills.id],
  }),
}));
```

And extend `trainingSkillsRelations` to include the new child:

```ts
export const trainingSkillsRelations = relations(trainingSkills, ({ one, many }) => ({
  goal: one(trainingGoals, { fields: [trainingSkills.goalId], references: [trainingGoals.id] }),
  practiceSessions: many(practiceSessions),
  skillMilestones: many(skillMilestones),
}));
```

(`unique`, `check`, `integer`, `timestamp`, `uuid`, `sql`, `relations` are already imported in this file — confirm; add any that are missing.)

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @turingcare/api db:generate`
Expected: a new `apps/api/drizzle/XXXX_<name>.sql` containing `CREATE TABLE "skill_milestones" (...)` with the unique + check constraints, plus an updated `meta/_journal.json` and snapshot. Open the `.sql` and confirm it ONLY creates the new table (no other table altered).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @turingcare/api exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: (If Docker Postgres is up) apply + sanity check**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api db:migrate
```
Expected: applies cleanly. If the DB is down, skip — CI applies it.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/
git commit -m "feat(api): skill_milestones table + migration"
```

---

## Task 3: `setSkillLevel` + `loadProgress` milestones

**Files:**
- Create: `apps/api/src/lib/skill-level.ts`
- Modify: `apps/api/src/lib/progress.ts` (add `milestones` to `ProgressSkill` + query)
- Test: `apps/api/src/lib/skill-level.test.ts`

- [ ] **Step 1: Write the failing test** `apps/api/src/lib/skill-level.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { skillMilestones, trainingGoals, trainingSkills } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";
import { loadProgress } from "./progress";
import { setSkillLevel } from "./skill-level";

const validDog = {
  name: "Biscuit", size: "medium", sex: "female", source: "rescue",
  vaccineStage: "in_progress", spayedNeutered: true,
};

async function makeDog(u: TestUser) {
  const r = await app.request("/api/dogs", {
    method: "POST", headers: u.authHeaders, body: JSON.stringify(validDog),
  });
  return ((await r.json()) as { dog: { id: string } }).dog;
}
async function makeSkill(dogId: string) {
  const [goal] = await db.insert(trainingGoals).values({ dogId, goal: "Recall" }).returning();
  if (!goal) throw new Error("expected goal");
  const [skill] = await db
    .insert(trainingSkills)
    .values({ goalId: goal.id, name: "Sit", confidence: 1 })
    .returning();
  if (!skill) throw new Error("expected skill");
  return skill;
}

describe("setSkillLevel", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  it("sets confidence and records reachedAt for newly-reached levels", async () => {
    const u = await createTestUser(); users.push(u);
    const skill = await makeSkill((await makeDog(u)).id);

    await setSkillLevel(skill.id, 3);

    const [row] = await db.select().from(trainingSkills).where(eq(trainingSkills.id, skill.id));
    expect(row?.confidence).toBe(3);
    const ms = await db.select().from(skillMilestones).where(eq(skillMilestones.skillId, skill.id));
    expect(ms.map((m) => m.level).sort()).toEqual([2, 3]); // level 1 is baseline, never recorded
  });

  it("is idempotent — re-setting does not duplicate rows, and lowering keeps dates", async () => {
    const u = await createTestUser(); users.push(u);
    const skill = await makeSkill((await makeDog(u)).id);
    await setSkillLevel(skill.id, 4);
    await setSkillLevel(skill.id, 2); // lower
    const ms = await db.select().from(skillMilestones).where(eq(skillMilestones.skillId, skill.id));
    expect(ms.map((m) => m.level).sort()).toEqual([2, 3, 4]); // dates kept
    const [row] = await db.select().from(trainingSkills).where(eq(trainingSkills.id, skill.id));
    expect(row?.confidence).toBe(2);
  });

  it("loadProgress returns milestones ascending", async () => {
    const u = await createTestUser(); users.push(u);
    const dog = await makeDog(u);
    const skill = await makeSkill(dog.id);
    await setSkillLevel(skill.id, 3);
    const progress = await loadProgress(dog.id);
    const loaded = progress.goals[0]?.skills[0];
    expect(loaded?.confidence).toBe(3);
    expect(loaded?.milestones.map((m) => m.level)).toEqual([2, 3]);
    expect(typeof loaded?.milestones[0]?.reachedAt).toBe("string");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/api exec vitest run src/lib/skill-level.test.ts`
Expected: FAIL (`setSkillLevel` missing; `milestones` not on ProgressSkill).

- [ ] **Step 3: Implement `apps/api/src/lib/skill-level.ts`**

```ts
import { eq } from "drizzle-orm";
import { db } from "../db";
import { skillMilestones, trainingSkills } from "../db/schema";

/**
 * Set a skill's current level (1–5) and record `reachedAt` for any newly-reached
 * levels (2..level). Lowering the level records/deletes nothing — earned dates
 * are kept. Returns the updated skill row.
 */
export async function setSkillLevel(skillId: string, level: number) {
  const [updated] = await db
    .update(trainingSkills)
    .set({ confidence: level })
    .where(eq(trainingSkills.id, skillId))
    .returning();
  if (!updated) throw new Error("failed to set skill level");

  if (level >= 2) {
    const existing = await db
      .select({ level: skillMilestones.level })
      .from(skillMilestones)
      .where(eq(skillMilestones.skillId, skillId));
    const have = new Set(existing.map((row) => row.level));
    const toInsert = [];
    for (let lvl = 2; lvl <= level; lvl++) {
      if (!have.has(lvl)) toInsert.push({ skillId, level: lvl });
    }
    if (toInsert.length > 0) await db.insert(skillMilestones).values(toInsert);
  }
  return updated;
}
```

- [ ] **Step 4: Extend `apps/api/src/lib/progress.ts`** — add the import, the type field, the query, and include it per skill.

Add to the imports:
```ts
import { asc, desc, eq, inArray } from "drizzle-orm";
import { practiceSessions, skillMilestones, trainingGoals, trainingSkills } from "../db/schema";
```

Add a type above `ProgressSkill`:
```ts
export type ProgressMilestone = { level: number; reachedAt: string };
```

Add the field to `ProgressSkill`:
```ts
export type ProgressSkill = {
  id: string;
  name: string;
  confidence: number;
  position: number;
  catalogSkillKey: string | null;
  sessionCount: number;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
  lastNote: string | null;
  sessions: ProgressSession[];
  milestones: ProgressMilestone[];
};
```

In `loadProgress`, after the `sessions` query/`sessionsBySkill` map, add:
```ts
  const milestoneRows =
    skillIds.length === 0
      ? []
      : await db
          .select()
          .from(skillMilestones)
          .where(inArray(skillMilestones.skillId, skillIds))
          .orderBy(asc(skillMilestones.level));
  const milestonesBySkill = new Map<string, ProgressMilestone[]>();
  for (const row of milestoneRows) {
    const existing = milestonesBySkill.get(row.skillId) ?? [];
    existing.push({ level: row.level, reachedAt: row.reachedAt.toISOString() });
    milestonesBySkill.set(row.skillId, existing);
  }
```

And in the `skills` loop where the `ProgressSkill` object is pushed, add the field:
```ts
      sessions: skillSessions.slice(0, 5),
      milestones: milestonesBySkill.get(skill.id) ?? [],
```

- [ ] **Step 5: Run it, expect PASS**

Run: `pnpm --filter @turingcare/api exec vitest run src/lib/skill-level.test.ts`
Expected: PASS (needs Postgres; if local DB is down, ensure it passes in CI).

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm --filter @turingcare/api exec tsc --noEmit
git add apps/api/src/lib/skill-level.ts apps/api/src/lib/skill-level.test.ts apps/api/src/lib/progress.ts
git commit -m "feat(api): setSkillLevel + loadProgress milestones"
```

---

## Task 4: `PUT …/skills/:skillId/level` route

**Files:**
- Modify: `apps/api/src/routes/dogs.ts` (add route; keep the existing confidence route for now)
- Test: `apps/api/src/routes/skill-level-route.test.ts`

- [ ] **Step 1: Write the failing test** `apps/api/src/routes/skill-level-route.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { trainingGoals, trainingSkills } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";

const validDog = {
  name: "Biscuit", size: "medium", sex: "female", source: "rescue",
  vaccineStage: "in_progress", spayedNeutered: true,
};
async function makeDog(u: TestUser) {
  const r = await app.request("/api/dogs", { method: "POST", headers: u.authHeaders, body: JSON.stringify(validDog) });
  return ((await r.json()) as { dog: { id: string } }).dog;
}
async function makeSkill(dogId: string) {
  const [goal] = await db.insert(trainingGoals).values({ dogId, goal: "Recall" }).returning();
  const [skill] = await db.insert(trainingSkills).values({ goalId: goal!.id, name: "Sit", confidence: 1 }).returning();
  return skill!;
}

describe("dogs: set skill level", () => {
  const users: TestUser[] = [];
  afterEach(async () => { for (let u = users.pop(); u; u = users.pop()) await u.cleanup(); });

  it("PUT level sets confidence and returns the skill", async () => {
    const u = await createTestUser(); users.push(u);
    const dog = await makeDog(u);
    const skill = await makeSkill(dog.id);
    const res = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}/level`, {
      method: "PUT", headers: u.authHeaders, body: JSON.stringify({ level: 3 }),
    });
    expect(res.status).toBe(200);
    const { skill: updated } = (await res.json()) as { skill: { confidence: number } };
    expect(updated.confidence).toBe(3);
  });

  it("rejects another user's skill with 404", async () => {
    const owner = await createTestUser(); users.push(owner);
    const other = await createTestUser(); users.push(other);
    const dog = await makeDog(owner);
    const skill = await makeSkill(dog.id);
    const res = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}/level`, {
      method: "PUT", headers: other.authHeaders, body: JSON.stringify({ level: 3 }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects an out-of-range level with 400", async () => {
    const u = await createTestUser(); users.push(u);
    const dog = await makeDog(u);
    const skill = await makeSkill(dog.id);
    const res = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}/level`, {
      method: "PUT", headers: u.authHeaders, body: JSON.stringify({ level: 9 }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/api exec vitest run src/routes/skill-level-route.test.ts`
Expected: FAIL (route 404s / not defined).

- [ ] **Step 3: Add the route** — in `apps/api/src/routes/dogs.ts`:

Add imports near the top:
```ts
import { skillLevelSchema } from "@turingcare/shared";
import { setSkillLevel } from "../lib/skill-level";
```
(Add `skillLevelSchema` to the existing `@turingcare/shared` import group if one exists.)

Immediately AFTER the existing `.patch("/:id/skills/:skillId/confidence", …)` block, chain:
```ts
  .put("/:id/skills/:skillId/level", zValidator("json", skillLevelSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const skill = await findOwnedSkill(c.get("userId"), dog.id, c.req.param("skillId"));
    if (!skill) return c.json({ error: "not_found" } as const, 404);
    const updated = await setSkillLevel(skill.id, c.req.valid("json").level);
    return c.json({ skill: updated });
  })
```

- [ ] **Step 4: Run it, expect PASS** + typecheck

Run: `pnpm --filter @turingcare/api exec vitest run src/routes/skill-level-route.test.ts`
Run: `pnpm --filter @turingcare/api exec tsc --noEmit`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/dogs.ts apps/api/src/routes/skill-level-route.test.ts
git commit -m "feat(api): PUT skill level route"
```

---

## Task 5: Web progress lib — `milestones` type + `useSetSkillLevel`

**Files:**
- Modify: `apps/web/src/lib/progress.ts`

- [ ] **Step 1: Add the type field** — in `apps/web/src/lib/progress.ts`, add above `ProgressSkill`:
```ts
export type ProgressMilestone = { level: number; reachedAt: string };
```
and add to `ProgressSkill`:
```ts
  sessions: ProgressSession[];
  milestones: ProgressMilestone[];
```

- [ ] **Step 2: Add the hook** — after `useUpdateSkillConfidence`, add (mirror its invalidation):
```ts
export function useSetSkillLevel(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { skillId: string; level: number }) => {
      const res = await dogSkills[":skillId"].level.$put({
        param: { id: dogId, skillId: args.skillId },
        json: { level: args.level },
      });
      if (!res.ok) throw new Error("set_level_failed");
      return (await res.json()).skill;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["progress", dogId] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}
```
(Keep `useUpdateSkillConfidence` for now — it's removed in Task 10 once the chip is gone. `dogSkills` is the existing `api.api.dogs[":id"].skills` reference; `.level.$put` is available now that Task 4 added the route.)

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @turingcare/web exec tsc --noEmit
git add apps/web/src/lib/progress.ts
git commit -m "feat(web): useSetSkillLevel + milestones type"
```

---

## Task 6: i18n keys for the stepper

**Files:**
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`
- Test: `apps/web/src/i18n/i18n.test.tsx` (existing parity test)

- [ ] **Step 1: Add to the `progress:` object in `en.ts`:**
```ts
    milestonesTitle: "Milestones · level {n} of 5",
    reachedOn: "reached {date}",
    markReached: "Tap to mark reached",
    levelStart: "start",
    currentTag: "current",
    levelBadge: "Level {n} — {label}",
```

- [ ] **Step 2: Add the SAME keys to the `progress:` object in `es.ts` (translated, each ≠ en):**
```ts
    milestonesTitle: "Hitos · nivel {n} de 5",
    reachedOn: "alcanzado {date}",
    markReached: "Toca para marcar logrado",
    levelStart: "inicio",
    currentTag: "actual",
    levelBadge: "Nivel {n} — {label}",
```

- [ ] **Step 3: Run parity + tsc**

Run: `pnpm --filter @turingcare/web exec vitest run src/i18n/i18n.test.tsx`
Run: `pnpm --filter @turingcare/web exec tsc --noEmit`
Expected: PASS / clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): i18n keys for milestone stepper"
```

---

## Task 7: `MilestoneStepper` component

**Files:**
- Create: `apps/web/src/components/progress/milestone-stepper.tsx`
- Test: `apps/web/src/components/progress/milestone-stepper.test.tsx`

- [ ] **Step 1: Write the failing test** `milestone-stepper.test.tsx`:

```tsx
import { LocaleProvider } from "@/i18n";
import * as progressLib from "@/lib/progress";
import type { ProgressSkill } from "@/lib/progress";
import * as catalogLib from "@/lib/training-catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MilestoneStepper } from "./milestone-stepper";

vi.mock("@/lib/progress", async () => {
  const actual = await vi.importActual<typeof import("@/lib/progress")>("@/lib/progress");
  return { ...actual, useSetSkillLevel: vi.fn() };
});
vi.mock("@/lib/training-catalog", async () => {
  const actual = await vi.importActual<typeof import("@/lib/training-catalog")>("@/lib/training-catalog");
  return { ...actual, useTrainingCatalog: vi.fn() };
});

const skill: ProgressSkill = {
  id: "s1", name: "Sit", confidence: 2, position: 0, catalogSkillKey: null,
  sessionCount: 0, firstSessionAt: null, lastSessionAt: null, lastNote: null,
  sessions: [], milestones: [{ level: 2, reachedAt: new Date(2026, 5, 3).toISOString() }],
};

function setup(over: Partial<ProgressSkill> = {}) {
  const mutate = vi.fn();
  vi.mocked(progressLib.useSetSkillLevel).mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<typeof progressLib.useSetSkillLevel>);
  vi.mocked(catalogLib.useTrainingCatalog).mockReturnValue({ data: [] } as unknown as ReturnType<typeof catalogLib.useTrainingCatalog>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MilestoneStepper dogId="d1" skill={{ ...skill, ...over }} />
      </QueryClientProvider>
    </LocaleProvider>,
  );
  return { mutate };
}

describe("MilestoneStepper", () => {
  it("renders 5 generic levels for a free-form skill", () => {
    setup();
    expect(screen.getByText("Not yet")).toBeInTheDocument();
    expect(screen.getByText("Consistently")).toBeInTheDocument();
  });

  it("marks the next level when its CTA is tapped", () => {
    const { mutate } = setup({ confidence: 2 }); // next level is 3
    fireEvent.click(screen.getByRole("button", { name: /level 3/i }));
    expect(mutate).toHaveBeenCalledWith({ skillId: "s1", level: 3 });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/progress/milestone-stepper.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `milestone-stepper.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { type ProgressSkill, useSetSkillLevel } from "@/lib/progress";
import { findCatalogSkill, useTrainingCatalog } from "@/lib/training-catalog";
import { dateLabel } from "@/lib/when";

const LEVELS = [1, 2, 3, 4, 5] as const;
const genericKeys = ["progress.level1", "progress.level2", "progress.level3", "progress.level4", "progress.level5"] as const;

export function MilestoneStepper({ dogId, skill }: { dogId: string; skill: ProgressSkill }) {
  const { t, locale } = useI18n();
  const setLevel = useSetSkillLevel(dogId);
  const { data: catalog } = useTrainingCatalog();
  const catalogSkill = findCatalogSkill(catalog, skill.catalogSkillKey);
  const current = skill.confidence;
  const dateFor = (level: number) => {
    const m = skill.milestones.find((x) => x.level === level);
    return m ? dateLabel(m.reachedAt, new Date(), locale) : null;
  };
  const descFor = (level: number) =>
    catalogSkill?.levels.find((l) => l.level === level)?.description ?? t(genericKeys[level - 1]);

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-soft">
        {t("progress.milestonesTitle", { n: current })}
      </p>
      <ol className="space-y-1">
        {LEVELS.map((level) => {
          const reached = level <= current;
          const isCurrent = level === current;
          const isNext = level === current + 1;
          const date = dateFor(level);
          const dot = reached ? (isCurrent ? "bg-copper text-white" : "bg-green-600 text-white") : "border-2 border-silver text-slate-soft";
          const row = (
            <span className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${dot}`} aria-hidden="true">
                {reached && !isCurrent ? "✓" : level}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-soft">
                  {t("training.levelPrefix")} {level}{isCurrent ? ` · ${t("progress.currentTag")}` : ""}
                </span>
                <span className={`block text-sm ${reached ? "text-slate" : "text-slate-soft"}`}>{descFor(level)}</span>
                <span className="block text-xs">
                  {level === 1 ? (
                    <span className="text-slate-soft">{t("progress.levelStart")}</span>
                  ) : reached && date ? (
                    <span className="font-medium text-green-700">✓ {t("progress.reachedOn", { date })}</span>
                  ) : isNext ? (
                    <span className="font-semibold text-copper">{t("progress.markReached")} →</span>
                  ) : reached ? (
                    <span className="font-medium text-green-700">✓</span>
                  ) : (
                    <span className="text-slate-soft">—</span>
                  )}
                </span>
              </span>
            </span>
          );
          return (
            <li key={level}>
              <button
                type="button"
                disabled={setLevel.isPending}
                aria-label={`${t("training.levelPrefix")} ${level}`}
                onClick={() => setLevel.mutate({ skillId: skill.id, level })}
                className={`w-full rounded-lg p-2 text-left ${isCurrent ? "bg-cream" : "hover:bg-cream"}`}
              >
                {row}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

> `@/lib/when` (`dateLabel`) already exists in the codebase (shipped with the journal redesign). `findCatalogSkill`/`useTrainingCatalog` are in `@/lib/training-catalog`. The `Button` import is unused above — remove it if Biome flags `noUnusedImports` (the component uses plain `<button>`).

- [ ] **Step 4: Run it, expect PASS**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/progress/milestone-stepper.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check --write apps/web/src/components/progress/milestone-stepper.tsx apps/web/src/components/progress/milestone-stepper.test.tsx
git add apps/web/src/components/progress/milestone-stepper.tsx apps/web/src/components/progress/milestone-stepper.test.tsx
git commit -m "feat(web): milestone stepper component"
```

---

## Task 8: Wire the stepper into the progress panel

Replace the inline `ConfidenceChip` with a collapsed level **badge** + the expanded **stepper**, and make skill edit name-only.

**Files:**
- Modify: `apps/web/src/components/progress/progress-panel.tsx`
- Test: `apps/web/src/components/progress/progress-panel.test.tsx` (create if absent)

- [ ] **Step 1: Write/extend the test** `progress-panel.test.tsx`:

```tsx
import { LocaleProvider } from "@/i18n";
import * as progressLib from "@/lib/progress";
import type { ProgressGoal } from "@/lib/progress";
import * as catalogLib from "@/lib/training-catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProgressPanel } from "./progress-panel";

vi.mock("@/lib/progress", async () => {
  const actual = await vi.importActual<typeof import("@/lib/progress")>("@/lib/progress");
  return {
    ...actual,
    useProgress: vi.fn(), useAddSkill: vi.fn(), useUpdateSkill: vi.fn(),
    useDeleteSkill: vi.fn(), useDeleteSession: vi.fn(), useSetSkillLevel: vi.fn(),
  };
});
vi.mock("@/lib/training-catalog", async () => {
  const actual = await vi.importActual<typeof import("@/lib/training-catalog")>("@/lib/training-catalog");
  return { ...actual, useTrainingCatalog: vi.fn() };
});

const goals: ProgressGoal[] = [{
  id: "g1", goal: "Basic Manners", catalogGoalKey: null, avgConfidence: 3,
  skills: [{
    id: "s1", name: "Sit", confidence: 3, position: 0, catalogSkillKey: null,
    sessionCount: 0, firstSessionAt: null, lastSessionAt: null, lastNote: null,
    sessions: [], milestones: [],
  }],
}];

function setup() {
  vi.mocked(progressLib.useProgress).mockReturnValue({ data: goals, isLoading: false, isError: false } as unknown as ReturnType<typeof progressLib.useProgress>);
  for (const h of ["useAddSkill", "useUpdateSkill", "useDeleteSkill", "useDeleteSession", "useSetSkillLevel"] as const) {
    vi.mocked(progressLib[h]).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, data: undefined } as never);
  }
  vi.mocked(catalogLib.useTrainingCatalog).mockReturnValue({ data: [] } as unknown as ReturnType<typeof catalogLib.useTrainingCatalog>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <ProgressPanel dogId="d1" />
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("ProgressPanel", () => {
  it("shows a level badge on the collapsed skill row and the stepper when expanded", () => {
    setup();
    expect(screen.getByText(/Level 3 — Sometimes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /expand sit/i }));
    expect(screen.getByText(/Milestones · level 3 of 5/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/progress/progress-panel.test.tsx`
Expected: FAIL (badge/stepper text absent; ConfidenceChip still rendered).

- [ ] **Step 3: Edit `progress-panel.tsx`**

(a) Imports — drop the chip, add the stepper + generic-label helper:
```ts
import { MilestoneStepper } from "@/components/progress/milestone-stepper";
```
Remove `import { ConfidenceChip } from "@/components/progress/confidence-chip";`.

(b) In `SkillCard`, replace the current-level computation + the chip + the inline catalog-level `<p>` with a **collapsed badge**. Specifically:

- Delete the `currentLevel` const (lines computing `catalogSkill?.levels.find(...)`).
- Delete the `<ConfidenceChip … />` block.
- Replace the `{currentLevel && (<p>…</p>)}` block in the header with a level badge:
```tsx
            <span className="mt-1 inline-block rounded-full bg-cream px-2 py-0.5 text-xs font-semibold text-slate-soft">
              {t("progress.levelBadge", {
                n: displaySkill.confidence,
                label: t(genericKeys[displaySkill.confidence - 1]),
              })}
            </span>
```
where `genericKeys` is a module-level const added near the top of the file:
```ts
const genericKeys = ["progress.level1", "progress.level2", "progress.level3", "progress.level4", "progress.level5"] as const;
```
(Keep `catalogSkill`/`useTrainingCatalog` only if still used for `catalogSkill.description` on line 171–173; that block stays.)

(c) In the expanded `<>…</>`, render the stepper above the action buttons:
```tsx
      {expanded && (
        <>
          <MilestoneStepper dogId={dogId} skill={displaySkill} />
          {displaySkill.lastNote && (
            <p className="text-sm text-slate-soft">{displaySkill.lastNote}</p>
          )}
          {/* …existing Log session / Edit / Remove buttons, edit form, session list unchanged… */}
        </>
      )}
```

(d) Make skill edit **name-only** so level stays controlled by the stepper. In `SkillFields`, delete the confidence `<select>` `<label>` block (the second label, lines ~296–305), leaving only the name field. The add/edit forms keep `defaultValues` with `confidence` (1 for add, `skill.confidence` for edit) so `trainingSkillSchema` is still satisfied and the level is preserved unchanged.

- [ ] **Step 4: Run it, expect PASS** + full progress tests

Run: `pnpm --filter @turingcare/web exec vitest run src/components/progress`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check --write apps/web/src/components/progress/progress-panel.tsx apps/web/src/components/progress/progress-panel.test.tsx
git add apps/web/src/components/progress/progress-panel.tsx apps/web/src/components/progress/progress-panel.test.tsx
git commit -m "feat(web): milestone stepper + level badge in progress panel"
```

---

## Task 9: Brief — show level label + date

**Files:**
- Modify: `apps/api/src/lib/brief.ts`
- Test: existing brief test (`apps/api/src/lib/brief.test.ts` or `packages/shared/src/brief.test.ts` — locate the one covering `composeBrief`); add/extend a case.

- [ ] **Step 1: Locate the brief test** that exercises the training-progress line and add a case asserting the new format. Run `grep -rn "Training progress\|confidenceLabel\|composeBrief" apps/api/src` to find the test + the function.

- [ ] **Step 2: Write the failing assertion** — in that test, for a skill at confidence 3 with a milestone `{level:3, reachedAt}`, expect the line to contain `Level 3` and the confidence label (e.g. `Sometimes`). Example assertion:
```ts
expect(text).toMatch(/Sit — Level 3: Sometimes/);
```
(Adapt to the test's existing fixture/harness.)

- [ ] **Step 3: Update the skill line in `composeBrief`** (`apps/api/src/lib/brief.ts`, the `* ${skill.name} -- ${skill.confidence}/5, …` line). Replace with:
```ts
        const label = confidenceLabel(skill.confidence);
        const reached = skill.milestones?.find((m) => m.level === skill.confidence)?.reachedAt;
        const when = reached
          ? ` (reached ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(reached))})`
          : "";
        lines.push(`    * ${skill.name} — Level ${skill.confidence}: ${label}${when} — ${sessionSummary(skill)}`);
```
(`confidenceLabel` and `sessionSummary` already exist in this file. `skill.milestones` is now on the `ProgressSkill` passed in from `loadProgress`.)

- [ ] **Step 4: Run the brief test + tsc**

Run: `pnpm --filter @turingcare/api exec vitest run` (the brief test file) and `pnpm --filter @turingcare/api exec tsc --noEmit`.
Expected: PASS / clean. (Brief snapshot/format tests may need their expected strings updated to the new format — update them to match.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/brief.ts apps/api/src/lib/brief.test.ts
git commit -m "feat(api): brief shows milestone level + reached date"
```

---

## Task 10: Cleanup + full verification

Remove the now-unused confidence chip path, then verify everything.

**Files:**
- Delete: `apps/web/src/components/progress/confidence-chip.tsx`
- Modify: `apps/web/src/lib/progress.ts` (remove `useUpdateSkillConfidence`), `apps/api/src/routes/dogs.ts` (remove the `.patch(".../confidence")` route), `packages/shared/src/progress.ts` (remove `skillConfidenceSchema`/`SkillConfidenceInput` if unused elsewhere)

- [ ] **Step 1: Confirm the chip + confidence hook are unused**

Run: `grep -rn "ConfidenceChip\|useUpdateSkillConfidence\|skillConfidenceSchema\|/confidence" apps/web/src apps/api/src packages/shared/src`
Expected: the only references are their own definitions (the chip is no longer imported by progress-panel after Task 8).

- [ ] **Step 2: Remove them**
```bash
git rm apps/web/src/components/progress/confidence-chip.tsx
```
- In `apps/web/src/lib/progress.ts` delete the `useUpdateSkillConfidence` function (and the now-unused `SkillConfidenceInput` import if present).
- In `apps/api/src/routes/dogs.ts` delete the `.patch("/:id/skills/:skillId/confidence", …)` block and remove `skillConfidenceSchema` from its import if now unused.
- In `packages/shared/src/progress.ts` remove `skillConfidenceSchema` + `SkillConfidenceInput` ONLY if `grep` shows no remaining references.

- [ ] **Step 3: Full gates**
```bash
pnpm --filter @turingcare/shared exec tsc --noEmit
pnpm --filter @turingcare/api exec tsc --noEmit
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm --filter @turingcare/web test
pnpm --filter @turingcare/web exec vitest run src/i18n/i18n.test.tsx
pnpm exec biome check apps/web/src apps/api/src packages/shared/src
pnpm --filter @turingcare/web build
```
Expected: all green. (API vitest runs in CI against Postgres; run locally if the Docker DB is up.)

- [ ] **Step 4: react-doctor regression check**

Run: `cd apps/web && npx react-doctor@latest --scope changed` — confirm no new errors; triage warnings (SPA false-positives for hydration are expected; fix anything real and cheap).

- [ ] **Step 5: Manual smoke (document result)** — `pnpm dev`, open a dog's Training tab: collapsed skills show the `Level n — label` badge; expand a skill → stepper with reached/current/next states; tap the next level → it advances and shows today's date; tap a lower level → corrects; a template skill shows catalog descriptions, a free-form skill shows generic labels; the Brief reflects the level. Note anything off; fix.

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "chore: remove confidence chip path; verify skill milestones green"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** milestones replace confidence as current level (T3 `setSkillLevel` sets `confidence`; T8 removes chip, T10 removes the confidence path) ✓; dated history (`skill_milestones`, T2/T3) ✓; no backfill — reached derived from confidence (T3 query + T7 stepper logic) ✓; correction keeps dates (T3 idempotency test) ✓; template vs free-form labels (T7 `descFor`) ✓; collapsed badge + stepper UI (T7/T8) ✓; reuse `confidence` so Brief/This-Week/avg keep working (no change to those reads) ✓; Brief upgrade (T9) ✓; i18n parity (T6) ✓; tests across shared/api/web (every task) ✓.

**Placeholder scan:** none — all code blocks are concrete and compile-ready (the T3 test mirrors `focus.test.ts` helpers with throw-on-missing instead of non-null assertions). The only "find X yourself" steps are T9 step 1 (locate the existing brief test) and T10 step 1 (grep to confirm no remaining references before deletion) — both verification steps, not code placeholders.

**Type consistency:** `setSkillLevel(skillId, level)` (T3) used by T4 route; `ProgressMilestone {level, reachedAt}` defined in api (T3) and web (T5) identically and consumed by T7/T8/T9; `useSetSkillLevel({skillId, level})` (T5) called by T7; `skillLevelSchema {level}` (T1) used by T4 route + T5 client `.level.$put`. Consistent.

**Scope:** single sub-project (milestones). Trends + dashboard explicitly deferred. Good.
