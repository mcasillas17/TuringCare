# Training Goal Templates (Curated Curriculum) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a dog owner apply a curated training-curriculum template (5 starter templates, 21 skills, 105 level definitions) to a dog with one click — creating the goal + its skills, and unlocking per-skill level descriptions in the progress panel.

**Architecture:** Catalog content lives as a static `const` in `apps/api/src/data/training-catalog.ts` (no DB content). Two nullable text columns on existing `trainingGoals` / `trainingSkills` tables persist the catalog key for catalog lookup on read. Two new API endpoints (`GET /api/training/templates`, `POST /api/dogs/:id/goals/from-template`). A new `<TemplatePicker />` component lives next to the existing goal-add input on the dog detail page. The progress panel reads the catalog by key and enriches each catalog-applied skill with its description + current-level milestone text.

**Tech Stack:** Hono + Drizzle + Zod (`apps/api`), Vite/React 19 + TanStack Query + hono RPC client (`apps/web`), shared Zod schemas (`packages/shared`), Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-05-30-training-goal-templates-design.md`

---

## File Structure

- **Shared:**
  - Create `packages/shared/src/training-catalog.ts` — types only (`CatalogLevel`, `CatalogSkill`, `CatalogTemplate`).
  - Modify `packages/shared/src/index.ts` — export new types.
- **API:**
  - Create `apps/api/src/data/training-catalog.ts` — the 5-template, 21-skill, 105-level-definition `const`.
  - Create `apps/api/src/data/training-catalog.test.ts` — content-shape invariants (every skill has 5 levels, keys unique).
  - Modify `apps/api/src/db/schema.ts` — add `catalogGoalKey` + `catalogSkillKey` columns.
  - Generated `apps/api/drizzle/0008_*.sql` + `0008_snapshot.json` + `_journal.json` — drizzle-generated.
  - Modify `apps/api/src/lib/progress.ts` — surface `catalogGoalKey` / `catalogSkillKey` in the projection.
  - Create `apps/api/src/routes/training.ts` — `GET /` returning catalog.
  - Modify `apps/api/src/routes/dogs.ts` — add `POST /:id/goals/from-template`.
  - Modify `apps/api/src/app.ts` — mount `trainingApp`.
  - Create `apps/api/src/routes/training.test.ts` — endpoint tests.
  - Modify `apps/api/src/routes/dogs.test.ts` — add `from-template` tests.
- **Web:**
  - Create `apps/web/src/lib/training-catalog.ts` — `useTrainingCatalog()` hook + `findCatalogTemplate()` / `findCatalogSkill()` helpers + `useApplyTemplate(dogId)` mutation.
  - Modify `apps/web/src/lib/progress.ts` — add `catalogGoalKey` / `catalogSkillKey` to types.
  - Create `apps/web/src/components/training/template-picker.tsx` — dropdown + preview card UI.
  - Create `apps/web/src/components/training/template-picker.test.tsx` — UI behavior tests.
  - Modify `apps/web/src/routes/dog-detail.tsx` — render `<TemplatePicker />` next to "Add Goal".
  - Modify `apps/web/src/components/progress/progress-panel.tsx` — enrich `SkillCard` with catalog description + level text.
  - Modify `apps/web/src/i18n/en.ts` + `apps/web/src/i18n/es.ts` — picker chrome keys.

---

## Task 1: Shared types + catalog content

**Files:**
- Create: `packages/shared/src/training-catalog.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/data/training-catalog.ts`
- Create: `apps/api/src/data/training-catalog.test.ts`

- [ ] **Step 1: Add the shared types**

Create `packages/shared/src/training-catalog.ts`:

```ts
export type CatalogLevel = {
  level: 1 | 2 | 3 | 4 | 5;
  description: string;
};

export type CatalogSkill = {
  key: string;
  name: string;
  description: string;
  levels: CatalogLevel[];
};

export type CatalogTemplate = {
  key: string;
  name: string;
  description: string;
  skills: CatalogSkill[];
};
```

- [ ] **Step 2: Export from the shared barrel**

In `packages/shared/src/index.ts`, find the existing `export * from "./..."` block and add:

```ts
export * from "./training-catalog";
```

(Place alphabetically with the other re-exports.)

- [ ] **Step 3: Write the catalog content invariants test (failing)**

Create `apps/api/src/data/training-catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { trainingCatalog } from "./training-catalog";

describe("trainingCatalog", () => {
  it("contains exactly 5 templates", () => {
    expect(trainingCatalog).toHaveLength(5);
  });

  it("every template key is unique", () => {
    const keys = trainingCatalog.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every skill key is unique across the whole catalog and prefixed by its template key", () => {
    const allSkillKeys: string[] = [];
    for (const template of trainingCatalog) {
      for (const skill of template.skills) {
        expect(skill.key.startsWith(`${template.key}.`)).toBe(true);
        allSkillKeys.push(skill.key);
      }
    }
    expect(new Set(allSkillKeys).size).toBe(allSkillKeys.length);
  });

  it("every skill has exactly 5 levels numbered 1..5 in order", () => {
    for (const template of trainingCatalog) {
      for (const skill of template.skills) {
        expect(skill.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
      }
    }
  });

  it("every level description is a non-empty string", () => {
    for (const template of trainingCatalog) {
      for (const skill of template.skills) {
        for (const level of skill.levels) {
          expect(level.description.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @turingcare/api test -- training-catalog`
Expected: FAIL — `trainingCatalog` not exported.

- [ ] **Step 5: Create the catalog content**

Create `apps/api/src/data/training-catalog.ts`. The full 105-line content is in `docs/superpowers/specs/2026-05-30-training-goal-templates-design.md` under "Catalog (the source of truth)". Translate each template / skill / level into the typed structure below — the implementer must write out the full content from the spec verbatim. Top of file:

```ts
import type { CatalogTemplate } from "@turingcare/shared";

export const trainingCatalog: CatalogTemplate[] = [
  {
    key: "basic-manners",
    name: "Basic Manners",
    description: "Foundational behaviors every dog should know",
    skills: [
      {
        key: "basic-manners.sit",
        name: "Sit",
        description: "Dog reliably sits on cue",
        levels: [
          { level: 1, description: "Lures into a sit with food in a quiet room" },
          { level: 2, description: "Sits on a verbal or hand cue without food lure in a quiet room" },
          { level: 3, description: "Sits on cue with one mild distraction present" },
          { level: 4, description: "Sits on cue in busier indoor or backyard settings" },
          { level: 5, description: "Sits on cue across most environments, including outdoors" },
        ],
      },
      // ... continue with basic-manners.down, .stay, .recall, .loose-leash
    ],
  },
  // ... continue with puppy-fundamentals, reactivity-work, separation-comfort, recall-reliability
];
```

**Authoring rule for the implementer:** copy every name, key, description, and level definition exactly from the spec. The spec is the single source of truth for content. Do not rewrite. Use the file structure shown above; preserve key/name spellings exactly (including the `(LAT)` parenthetical, the en-dash in skill names if any, hyphens in keys).

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @turingcare/api test -- training-catalog`
Expected: PASS (5 tests). The test will count templates (must be 5), assert unique keys, assert every skill has 5 levels in order, and assert every description is non-empty.

- [ ] **Step 7: tsc + lint**

Run: `pnpm --filter @turingcare/api exec tsc --noEmit` (expect 0 errors).
Run: `pnpm --filter @turingcare/shared build` (expect exit 0).
Run: `pnpm exec biome check packages/shared/src/training-catalog.ts packages/shared/src/index.ts apps/api/src/data/training-catalog.ts apps/api/src/data/training-catalog.test.ts` (expect clean).

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/training-catalog.ts packages/shared/src/index.ts apps/api/src/data/training-catalog.ts apps/api/src/data/training-catalog.test.ts
git commit -m "feat(catalog): training-catalog types + 5-template starter curriculum"
```

---

## Task 2: Schema migration + loadProgress projection

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Generated: `apps/api/drizzle/0008_<name>.sql` + `meta/0008_snapshot.json` + `meta/_journal.json`
- Modify: `apps/api/src/lib/progress.ts`

- [ ] **Step 1: Add the two nullable columns to the schema**

In `apps/api/src/db/schema.ts`, find the `trainingGoals` table (line 120) and add the column inside the object:

```ts
export const trainingGoals = pgTable("training_goals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dogId: uuid("dog_id")
    .notNull()
    .references(() => dogs.id, { onDelete: "cascade" }),
  goal: text("goal").notNull(),
  catalogGoalKey: text("catalog_goal_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Find the `trainingSkills` table (line 129) and add the column inside its first arg:

```ts
export const trainingSkills = pgTable(
  "training_skills",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => trainingGoals.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    confidence: integer("confidence").notNull().default(1),
    position: integer("position").notNull().default(0),
    catalogSkillKey: text("catalog_skill_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("confidence_range", sql`${t.confidence} BETWEEN 1 AND 5`)],
);
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @turingcare/api db:generate`
Expected: a new file `apps/api/drizzle/0008_<random-name>.sql` is created, the `meta/_journal.json` gets a new entry with `"idx": 8`, and `meta/0008_snapshot.json` is written.

Open the generated SQL and confirm it contains exactly these two statements (no extra drops/renames):

```sql
ALTER TABLE "training_goals" ADD COLUMN "catalog_goal_key" text;
--> statement-breakpoint
ALTER TABLE "training_skills" ADD COLUMN "catalog_skill_key" text;
```

If drizzle generates extra unrelated statements, STOP and investigate — something else changed in the snapshot.

- [ ] **Step 3: Surface the catalog keys in `loadProgress`**

In `apps/api/src/lib/progress.ts`, extend `ProgressGoal` and `ProgressSkill`:

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
};

export type ProgressGoal = {
  id: string;
  goal: string;
  catalogGoalKey: string | null;
  avgConfidence: number | null;
  skills: ProgressSkill[];
};
```

Find the `skillsByGoal` build loop in `loadProgress` (around line 84) and add `catalogSkillKey: skill.catalogSkillKey` to the pushed object:

```ts
    existing.push({
      id: skill.id,
      name: skill.name,
      confidence: skill.confidence,
      position: skill.position,
      catalogSkillKey: skill.catalogSkillKey,
      sessionCount: skillSessions.length,
      firstSessionAt: firstSession?.occurredAt ?? null,
      lastSessionAt: lastSession?.occurredAt ?? null,
      lastNote: lastSession?.notes ?? null,
      sessions: skillSessions.slice(0, 5),
    });
```

Find the goal mapping at the bottom of `loadProgress` and add `catalogGoalKey: goal.catalogGoalKey`:

```ts
  return {
    goals: goals.map((goal) => {
      const goalSkills = skillsByGoal.get(goal.id) ?? [];
      // ... existing avgConfidence calc ...
      return {
        id: goal.id,
        goal: goal.goal,
        catalogGoalKey: goal.catalogGoalKey,
        avgConfidence,
        skills: goalSkills,
      };
    }),
  };
```

(Read the existing return-object construction in the file and just splice `catalogGoalKey` into it.)

- [ ] **Step 4: Apply the migration locally + run api tests**

Run (load env first): `set -a && . ./.env && set +a && pnpm --filter @turingcare/api db:migrate`
Expected: migration applies cleanly (one ALTER TABLE per table).

Run: `pnpm --filter @turingcare/api test -- dogs`
Expected: still PASS — existing tests don't reference the new fields, no regressions.

- [ ] **Step 5: tsc + lint**

Run: `pnpm --filter @turingcare/api exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/api/src/db/schema.ts apps/api/src/lib/progress.ts` (expect clean).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/src/lib/progress.ts apps/api/drizzle/0008_*.sql apps/api/drizzle/meta/0008_snapshot.json apps/api/drizzle/meta/_journal.json
git commit -m "feat(api): catalogGoalKey/catalogSkillKey columns + surface in progress"
```

---

## Task 3: `GET /api/training/templates`

**Files:**
- Create: `apps/api/src/routes/training.ts`
- Create: `apps/api/src/routes/training.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/training.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { trainingCatalog } from "../data/training-catalog";
import { type TestUser, createTestUser } from "../test-helpers";

describe("training: GET /api/training/templates", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  it("returns 401 without auth", async () => {
    const r = await app.request("/api/training/templates", {});
    expect(r.status).toBe(401);
  });

  it("returns the full catalog when authed", async () => {
    const u = await createTestUser();
    users.push(u);
    const r = await app.request("/api/training/templates", { headers: u.authHeaders });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { templates: typeof trainingCatalog };
    expect(body.templates).toHaveLength(trainingCatalog.length);
    expect(body.templates[0]?.key).toBe(trainingCatalog[0]?.key);
    expect(body.templates[0]?.skills.length).toBe(trainingCatalog[0]?.skills.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api test -- training`
Expected: FAIL — route not mounted (the second test will likely get 404 or 401 mismatch).

- [ ] **Step 3: Create the route module**

Create `apps/api/src/routes/training.ts`:

```ts
import { Hono } from "hono";
import { trainingCatalog } from "../data/training-catalog";
import { type Vars, requireUser } from "../middleware/require-user";

export const trainingApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/templates", (c) => c.json({ templates: trainingCatalog }));
```

- [ ] **Step 4: Mount the route**

In `apps/api/src/app.ts`, add the import (alphabetically between the existing `routes/*` imports):

```ts
import { trainingApp } from "./routes/training";
```

Add the `.route()` call after the existing `.route("/api/share", shareApp)` / `.route("/api/onboarding", onboardingApp)` block:

```ts
  .route("/api/training", trainingApp)
```

(Place it next to the other read-only catalog-style routes; the exact position is flexible as long as it's chained.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api test -- training`
Expected: PASS (2 tests).

- [ ] **Step 6: tsc + lint**

Run: `pnpm --filter @turingcare/api exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/api/src/routes/training.ts apps/api/src/routes/training.test.ts apps/api/src/app.ts` (expect clean).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/training.ts apps/api/src/routes/training.test.ts apps/api/src/app.ts
git commit -m "feat(api): GET /api/training/templates returns the catalog"
```

---

## Task 4: `POST /api/dogs/:id/goals/from-template`

**Files:**
- Modify: `apps/api/src/routes/dogs.ts`
- Modify: `apps/api/src/routes/dogs.test.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/routes/dogs.test.ts`, add a new `describe` block at the bottom of the file (after the existing onboarding/brief/etc. blocks; before the file's final closing brace if any module-level construct exists):

```ts
describe("dogs: POST /:id/goals/from-template", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  async function makeDog(u: TestUser) {
    const r = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    return ((await r.json()) as { dog: { id: string } }).dog;
  }

  it("creates a goal + all template skills atomically", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const r = await app.request(`/api/dogs/${dog.id}/goals/from-template`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ templateKey: "basic-manners" }),
    });
    expect(r.status).toBe(201);
    const body = (await r.json()) as {
      goal: { id: string; goal: string; catalogGoalKey: string | null };
      skills: { id: string; name: string; catalogSkillKey: string | null; position: number; confidence: number }[];
    };
    expect(body.goal.goal).toBe("Basic Manners");
    expect(body.goal.catalogGoalKey).toBe("basic-manners");
    expect(body.skills).toHaveLength(5);
    expect(body.skills[0]?.name).toBe("Sit");
    expect(body.skills[0]?.catalogSkillKey).toBe("basic-manners.sit");
    expect(body.skills[0]?.confidence).toBe(1);
    expect(body.skills[0]?.position).toBe(0);
    // Positions are sequential and unique.
    expect(body.skills.map((s) => s.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it("returns 400 for an unknown templateKey, and does not create anything", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const r = await app.request(`/api/dogs/${dog.id}/goals/from-template`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ templateKey: "does-not-exist" }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()) as { error: string }).toEqual({ error: "invalid_template" });
    // Verify no goal was created.
    const dogR = await app.request(`/api/dogs/${dog.id}`, { headers: u.authHeaders });
    const dogBody = (await dogR.json()) as { goals: { id: string }[] };
    expect(dogBody.goals).toHaveLength(0);
  });

  it("owner isolation: another user's dog returns 404", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    const r = await app.request(`/api/dogs/${dog.id}/goals/from-template`, {
      method: "POST",
      headers: b.authHeaders,
      body: JSON.stringify({ templateKey: "basic-manners" }),
    });
    expect(r.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api test -- "dogs.* POST.*from-template"`
Expected: FAIL — endpoint doesn't exist.

- [ ] **Step 3: Implement the route**

In `apps/api/src/routes/dogs.ts`, find the existing `.post("/:id/goals", ...)` handler (line 117) and add the new handler immediately after it (and before the `.delete("/:id/goals/:goalId", ...)` handler):

```ts
  .post("/:id/goals/from-template", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const parsed = (await c.req.json().catch(() => ({}))) as { templateKey?: unknown };
    if (typeof parsed.templateKey !== "string") {
      return c.json({ error: "invalid_template" } as const, 400);
    }
    const template = trainingCatalog.find((t) => t.key === parsed.templateKey);
    if (!template) return c.json({ error: "invalid_template" } as const, 400);

    const { goal, skills } = await db.transaction(async (tx) => {
      const [createdGoal] = await tx
        .insert(trainingGoals)
        .values({ dogId: dog.id, goal: template.name, catalogGoalKey: template.key })
        .returning();
      if (!createdGoal) throw new Error("failed to create template goal");
      const createdSkills = await tx
        .insert(trainingSkills)
        .values(
          template.skills.map((skill, index) => ({
            goalId: createdGoal.id,
            name: skill.name,
            confidence: 1,
            position: index,
            catalogSkillKey: skill.key,
          })),
        )
        .returning();
      return { goal: createdGoal, skills: createdSkills };
    });

    return c.json({ goal, skills }, 201);
  })
```

Add the catalog import at the top of `apps/api/src/routes/dogs.ts` (alongside the other `../data/*` imports, or with the lib imports if no `../data` import exists yet):

```ts
import { trainingCatalog } from "../data/training-catalog";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api test -- dogs`
Expected: PASS — all 3 new from-template tests green, all existing dogs tests still green.

- [ ] **Step 5: tsc + lint**

Run: `pnpm --filter @turingcare/api exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts` (expect clean).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts
git commit -m "feat(api): POST /:id/goals/from-template applies a curated template atomically"
```

---

## Task 5: Web — catalog hook + apply mutation + TemplatePicker + i18n

**Files:**
- Create: `apps/web/src/lib/training-catalog.ts`
- Modify: `apps/web/src/lib/progress.ts`
- Create: `apps/web/src/components/training/template-picker.tsx`
- Create: `apps/web/src/components/training/template-picker.test.tsx`
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Add i18n keys (en + es)**

In `apps/web/src/i18n/en.ts`, find the existing `onboarding: { ... },` section. Immediately after its closing brace, add a new sibling section:

```ts
  training: {
    templatesButton: "Templates",
    templatesPicking: "Pick a template",
    applyButton: "Apply",
    cancelButton: "Cancel",
    willAdd: "Will add these skills:",
    applied: "Template applied",
    applyFailed: "Couldn't apply template",
    levelPrefix: "Level",
  },
```

In `apps/web/src/i18n/es.ts`, in the same position (after `onboarding: { ... },`):

```ts
  training: {
    templatesButton: "Plantillas",
    templatesPicking: "Elige una plantilla",
    applyButton: "Aplicar",
    cancelButton: "Cancelar",
    willAdd: "Se agregarán estas habilidades:",
    applied: "Plantilla aplicada",
    applyFailed: "No se pudo aplicar la plantilla",
    levelPrefix: "Nivel",
  },
```

(All Spanish values differ from English — i18n parity test will pass.)

- [ ] **Step 2: Add `catalogGoalKey` / `catalogSkillKey` to the web progress types**

In `apps/web/src/lib/progress.ts`, modify the `ProgressSkill` and `ProgressGoal` type declarations to mirror the api lib version:

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
};

export type ProgressGoal = {
  id: string;
  goal: string;
  catalogGoalKey: string | null;
  avgConfidence: number | null;
  skills: ProgressSkill[];
};
```

- [ ] **Step 3: Create the catalog hook + helpers + apply mutation**

Create `apps/web/src/lib/training-catalog.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CatalogSkill, CatalogTemplate } from "@turingcare/shared";
import { api } from "./api";

const training = api.api.training;
const dogGoals = api.api.dogs[":id"].goals;

export function useTrainingCatalog() {
  return useQuery({
    queryKey: ["training-catalog"],
    staleTime: 60 * 60 * 1000, // catalog rarely changes
    queryFn: async (): Promise<CatalogTemplate[]> => {
      const res = await training.templates.$get();
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).templates;
    },
  });
}

export function findCatalogTemplate(
  catalog: CatalogTemplate[] | undefined,
  templateKey: string | null,
): CatalogTemplate | null {
  if (!catalog || !templateKey) return null;
  return catalog.find((t) => t.key === templateKey) ?? null;
}

export function findCatalogSkill(
  catalog: CatalogTemplate[] | undefined,
  skillKey: string | null,
): CatalogSkill | null {
  if (!catalog || !skillKey) return null;
  for (const template of catalog) {
    const found = template.skills.find((s) => s.key === skillKey);
    if (found) return found;
  }
  return null;
}

export function useApplyTemplate(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateKey: string) => {
      const res = await dogGoals["from-template"].$post({
        param: { id: dogId },
        json: { templateKey },
      });
      if (!res.ok) throw new Error("apply_failed");
      return await res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dogs", dogId] });
      qc.invalidateQueries({ queryKey: ["progress", dogId] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });
}
```

- [ ] **Step 4: Write the failing TemplatePicker test**

Create `apps/web/src/components/training/template-picker.test.tsx`:

```tsx
import { LocaleProvider } from "@/i18n";
import * as catalogLib from "@/lib/training-catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogTemplate } from "@turingcare/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TemplatePicker } from "./template-picker";

vi.mock("@/lib/training-catalog", () => ({
  useTrainingCatalog: vi.fn(),
  useApplyTemplate: vi.fn(),
}));

const sampleCatalog: CatalogTemplate[] = [
  {
    key: "basic-manners",
    name: "Basic Manners",
    description: "Foundational behaviors every dog should know",
    skills: [
      {
        key: "basic-manners.sit",
        name: "Sit",
        description: "Dog reliably sits on cue",
        levels: [
          { level: 1, description: "Lures into a sit with food in a quiet room" },
          { level: 2, description: "x" },
          { level: 3, description: "x" },
          { level: 4, description: "x" },
          { level: 5, description: "x" },
        ],
      },
      {
        key: "basic-manners.down",
        name: "Down",
        description: "Dog lies down on cue",
        levels: [
          { level: 1, description: "x" },
          { level: 2, description: "x" },
          { level: 3, description: "x" },
          { level: 4, description: "x" },
          { level: 5, description: "x" },
        ],
      },
    ],
  },
];

function setupMocks(opts: { mutateAsync?: ReturnType<typeof vi.fn> } = {}) {
  vi.mocked(catalogLib.useTrainingCatalog).mockReturnValue({
    data: sampleCatalog,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof catalogLib.useTrainingCatalog>);
  const mutateAsync = opts.mutateAsync ?? vi.fn().mockResolvedValue({});
  vi.mocked(catalogLib.useApplyTemplate).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof catalogLib.useApplyTemplate>);
  return { mutateAsync };
}

function renderPicker() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <TemplatePicker dogId="d1" />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setupMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("TemplatePicker", () => {
  it("renders a Templates button; dropdown is closed by default", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: /Templates/i })).toBeInTheDocument();
    expect(screen.queryByText(/Basic Manners/)).not.toBeInTheDocument();
  });

  it("opens the dropdown with template names when clicked", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /Templates/i }));
    expect(screen.getByText("Basic Manners")).toBeInTheDocument();
  });

  it("clicking a template name opens the preview showing the included skills", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /Templates/i }));
    fireEvent.click(screen.getByText("Basic Manners"));
    expect(screen.getByText(/Will add these skills/i)).toBeInTheDocument();
    expect(screen.getByText("Sit")).toBeInTheDocument();
    expect(screen.getByText("Down")).toBeInTheDocument();
    expect(screen.getByText(/Dog reliably sits on cue/i)).toBeInTheDocument();
  });

  it("Cancel returns to the dropdown without applying", () => {
    const { mutateAsync } = setupMocks();
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /Templates/i }));
    fireEvent.click(screen.getByText("Basic Manners"));
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText(/Will add these skills/i)).not.toBeInTheDocument();
  });

  it("Apply calls the mutation with the chosen template key", async () => {
    const { mutateAsync } = setupMocks();
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /Templates/i }));
    fireEvent.click(screen.getByText("Basic Manners"));
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith("basic-manners"));
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @turingcare/web test -- template-picker`
Expected: FAIL — component doesn't exist.

- [ ] **Step 6: Create the TemplatePicker component**

Create `apps/web/src/components/training/template-picker.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useApplyTemplate, useTrainingCatalog } from "@/lib/training-catalog";
import type { CatalogTemplate } from "@turingcare/shared";
import { useState } from "react";
import { toast } from "sonner";

type Props = { dogId: string };

type Phase = { kind: "closed" } | { kind: "open" } | { kind: "preview"; template: CatalogTemplate };

export function TemplatePicker({ dogId }: Props) {
  const { t } = useI18n();
  const { data: catalog } = useTrainingCatalog();
  const apply = useApplyTemplate(dogId);
  const [phase, setPhase] = useState<Phase>({ kind: "closed" });

  if (!catalog) {
    return (
      <Button type="button" variant="outline" disabled>
        {t("training.templatesButton")}
      </Button>
    );
  }

  if (phase.kind === "preview") {
    const template = phase.template;
    return (
      <section className="space-y-3 rounded border border-silver bg-cream p-3">
        <div>
          <div className="font-semibold text-slate">{template.name}</div>
          <p className="text-sm text-slate-soft">{template.description}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-slate">{t("training.willAdd")}</p>
          <ul className="mt-1 space-y-1 text-sm text-slate">
            {template.skills.map((skill) => (
              <li key={skill.key}>
                <span className="font-medium">{skill.name}</span>
                <span className="text-slate-soft"> — {skill.description}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={apply.isPending}
            onClick={async () => {
              try {
                await apply.mutateAsync(template.key);
                toast.success(t("training.applied"));
                setPhase({ kind: "closed" });
              } catch {
                toast.error(t("training.applyFailed"));
              }
            }}
          >
            {t("training.applyButton")}
          </Button>
          <Button type="button" variant="outline" onClick={() => setPhase({ kind: "open" })}>
            {t("training.cancelButton")}
          </Button>
        </div>
      </section>
    );
  }

  if (phase.kind === "open") {
    return (
      <div className="relative inline-block">
        <Button type="button" variant="outline" onClick={() => setPhase({ kind: "closed" })}>
          {t("training.templatesButton")}
        </Button>
        <ul className="mt-1 w-72 space-y-1 rounded border border-silver bg-white p-2 text-sm shadow">
          <li className="px-1 py-1 text-xs font-medium text-slate-soft">
            {t("training.templatesPicking")}
          </li>
          {catalog.map((template) => (
            <li key={template.key}>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-surface-sand"
                onClick={() => setPhase({ kind: "preview", template })}
              >
                <div className="font-medium text-slate">{template.name}</div>
                <div className="text-xs text-slate-soft">{template.description}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <Button type="button" variant="outline" onClick={() => setPhase({ kind: "open" })}>
      {t("training.templatesButton")}
    </Button>
  );
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @turingcare/web test -- template-picker`
Expected: PASS (5 tests).

- [ ] **Step 8: i18n parity + tsc + lint**

Run: `pnpm --filter @turingcare/web test -- i18n` (expect PASS).
Run: `pnpm --filter @turingcare/web exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/web/src/lib/training-catalog.ts apps/web/src/lib/progress.ts apps/web/src/components/training/template-picker.tsx apps/web/src/components/training/template-picker.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts` (expect clean).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/training-catalog.ts apps/web/src/lib/progress.ts apps/web/src/components/training/template-picker.tsx apps/web/src/components/training/template-picker.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): training catalog hook + TemplatePicker + i18n"
```

---

## Task 6: Dog detail integration

**Files:**
- Modify: `apps/web/src/routes/dog-detail.tsx`

- [ ] **Step 1: Add the import**

In `apps/web/src/routes/dog-detail.tsx`, find the top imports (the `import { ProgressPanel } from "@/components/progress/progress-panel";` line near line 1) and add immediately after the progress import:

```ts
import { TemplatePicker } from "@/components/training/template-picker";
```

- [ ] **Step 2: Render the picker next to the Add Goal button**

Find the goal-add row (currently around line 171-187, the `<div className="flex gap-2">` that wraps the goal input + "Add Goal" button). Replace that block with the same content plus the `<TemplatePicker dogId={id} />` element after the Add Goal button. The wrapper changes from `flex gap-2` to `flex flex-wrap items-start gap-2` so the picker can wrap below on narrow screens.

Replace this block:

```tsx
        <div className="flex gap-2">
          <input
            className={inputCls}
            placeholder={t("dogs.goalPlaceholder")}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <Button
            disabled={!goal.trim()}
            onClick={async () => {
              await addGoal.mutateAsync({ goal });
              setGoal("");
            }}
          >
            {t("dogs.addGoal")}
          </Button>
        </div>
```

with:

```tsx
        <div className="flex flex-wrap items-start gap-2">
          <input
            className={inputCls}
            placeholder={t("dogs.goalPlaceholder")}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <Button
            disabled={!goal.trim()}
            onClick={async () => {
              await addGoal.mutateAsync({ goal });
              setGoal("");
            }}
          >
            {t("dogs.addGoal")}
          </Button>
          <TemplatePicker dogId={id} />
        </div>
```

- [ ] **Step 3: Run all web tests**

Run: `pnpm --filter @turingcare/web test`
Expected: all tests pass — including any existing dog-detail tests.

- [ ] **Step 4: tsc + lint**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/web/src/routes/dog-detail.tsx` (expect clean).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/dog-detail.tsx
git commit -m "feat(web): mount TemplatePicker next to Add Goal on dog detail"
```

---

## Task 7: Progress panel enrichment (catalog description + level text on skill cards)

**Files:**
- Modify: `apps/web/src/components/progress/progress-panel.tsx`

- [ ] **Step 1: Add the catalog lookup imports + helper inside SkillCard**

Find the existing imports at the top of `apps/web/src/components/progress/progress-panel.tsx` and add:

```ts
import { findCatalogSkill, useTrainingCatalog } from "@/lib/training-catalog";
```

- [ ] **Step 2: Modify `SkillCard` to render catalog content when present**

Find the `SkillCard` function (around line 133). At the top of the function body (after the existing `useState`/`useUpdateSkill`/`useDeleteSkill`/`displaySkill`/`lastSession` declarations) add:

```ts
  const { data: catalog } = useTrainingCatalog();
  const catalogSkill = findCatalogSkill(catalog, displaySkill.catalogSkillKey);
  const currentLevel = catalogSkill?.levels.find((l) => l.level === displaySkill.confidence) ?? null;
```

In the JSX `<div>` that wraps the skill name (the one with `<div className="font-medium text-slate">{displaySkill.name}</div>`), add the description subtitle immediately after the name and before the existing session-count line. The block changes from:

```tsx
        <div>
          <div className="font-medium text-slate">{displaySkill.name}</div>
          <div className="text-sm text-slate-soft">
            {sessionCountLabel(displaySkill, t)}
            {lastSession ? ` · ${t("progress.lastSession")}: ${lastSession}` : ""}
          </div>
          {displaySkill.lastNote && (
            <p className="text-sm text-slate-soft">{displaySkill.lastNote}</p>
          )}
        </div>
```

to:

```tsx
        <div>
          <div className="font-medium text-slate">{displaySkill.name}</div>
          {catalogSkill && (
            <div className="text-xs text-slate-soft">{catalogSkill.description}</div>
          )}
          <div className="text-sm text-slate-soft">
            {sessionCountLabel(displaySkill, t)}
            {lastSession ? ` · ${t("progress.lastSession")}: ${lastSession}` : ""}
          </div>
          {displaySkill.lastNote && (
            <p className="text-sm text-slate-soft">{displaySkill.lastNote}</p>
          )}
          {currentLevel && (
            <p className="mt-1 text-xs italic text-copper">
              {t("training.levelPrefix")} {currentLevel.level} — {currentLevel.description}
            </p>
          )}
        </div>
```

- [ ] **Step 3: Run all web tests**

Run: `pnpm --filter @turingcare/web test`
Expected: all tests pass. Existing progress-panel tests should still pass (the new content renders conditionally on `catalogSkillKey`, which existing skills don't have).

- [ ] **Step 4: tsc + lint**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/web/src/components/progress/progress-panel.tsx` (expect clean).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/progress/progress-panel.tsx
git commit -m "feat(web): enrich SkillCard with catalog description + level text"
```

---

## Task 8: Final gates + PROJECT-LOG + push

**Files:** modify `docs/PROJECT-LOG.md`.

- [ ] **Step 1: Type-check both apps**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit && pnpm --filter @turingcare/api exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: All test suites**

Run (load env first): `set -a && . ./.env && set +a && pnpm --filter @turingcare/shared test && pnpm --filter @turingcare/web test && pnpm --filter @turingcare/api test`
Expected: all green. (If api gates hit shared-test-DB drift unrelated to templates — `rate_limit` / unique-constraint errors — recreate the test DB and re-run.)

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: exit 0.

- [ ] **Step 4: Web build**

Run: `pnpm --filter @turingcare/web build`
Expected: exit 0.

- [ ] **Step 5: PROJECT-LOG entry**

Append a dated section to `docs/PROJECT-LOG.md` summarizing the templates feature (catalog content totals — 5/21/105, schema columns, 2 API endpoints, TemplatePicker, progress-panel enrichment, no LLM, English-only catalog) and listing the spec + this plan. Then:

```bash
git add docs/PROJECT-LOG.md
git commit -m "docs: log training goal templates"
```

- [ ] **Step 6: Push the branch**

```bash
git push -u origin feature/training-goal-templates
```

Then open a PR from `feature/training-goal-templates` into `main` (the URL is in the push output).

---

## Self-Review (run during planning)

- **Spec coverage:** catalog content → Task 1; schema migration → Task 2; loadProgress projection → Task 2; `GET /api/training/templates` → Task 3; `POST /from-template` (atomic) → Task 4; web hooks → Task 5; TemplatePicker UI → Task 5; i18n keys → Task 5; dog-detail integration → Task 6; progress-panel enrichment → Task 7; tests → Tasks 1, 3, 4, 5; no migration / no-other-change to existing routes → confirmed (existing `POST /goals` untouched).
- **Placeholders:** none — the only intentional "fill in the rest from the spec" is Task 1 Step 5, where the implementer copies the remaining 4 templates' content verbatim from the spec. That's content authoring, not engineering placeholder.
- **Type consistency:** `CatalogTemplate` / `CatalogSkill` / `CatalogLevel` are defined in Task 1 (shared), consumed verbatim in Tasks 3-7. `catalogGoalKey` / `catalogSkillKey` column names match between the schema (Task 2), the progress projection (Task 2), the API route response shapes (Task 4), and the web types (Task 5). The mutation argument is a `string` (templateKey) in both API and web sides.
- **Gotchas baked in:** the API route parses the body manually (`safeParse`-style — `c.req.json().catch`) AFTER the ownership check so unauthorized users still get 404 (lesson from PR #37); the atomic insert uses `db.transaction` so a partial template can't end up half-written; `findCatalogSkill` returns null when key not found, so the UI degrades gracefully when the catalog drifts; `useApplyTemplate` invalidates `["onboarding"]` so the onboarding checklist's "Set a training goal" row ticks immediately.
