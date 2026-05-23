# Training Progress Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the full Training Progress subsystem: Goal -> Skills -> Sessions, owner-rated confidence, dog-detail UI, and Behavior Brief integration.

**Architecture:** Build schema-first and keep owner scoping server-side: shared Zod schemas define payloads, Drizzle tables persist skills/sessions, Hono routes expose dog-scoped endpoints, and the web renders via TanStack Query hooks. `loadProgress(dogId)` is the single server helper for the progress endpoint and Brief composer; it returns aggregate skill data plus recent sessions for the expanded UI.

**Tech Stack:** Zod, Hono, Drizzle/Postgres, React 19, react-hook-form + `@hookform/resolvers/zod`, TanStack Query, Tailwind v4 tokens, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-05-22-training-progress-design.md`

**Conventions:** Worktree path is `/Users/elopenmike/.config/superpowers/worktrees/TuringCare/training-progress`, branch `worktree-training-progress`, off `origin/main`. This differs from the spec's `.claude/worktrees/training-progress` path because `.claude/` is not ignored on `origin/main`; user approved the external worktree. `CLAUDE.md` is absent from this worktree; user approved proceeding and documenting that deviation. `.env` is present and gitignored; never stage it. No package manifests or lockfiles should change.

**Resolved spec/repo conflicts:** Add `PATCH` to `apps/api/src/app.ts` CORS allow-methods so the required confidence endpoint works from the deployed web app. Drizzle migrations live in `apps/api/drizzle/`, not `apps/api/src/db/migrations/`. `GET /api/dogs/:id/progress` includes recent `sessions` per skill because the UI must render and delete expanded session rows; user approved this response extension.

**Per-task gates:** After the minimal implementation passes targeted tests, run `set -a && . ./.env && set +a && pnpm -r exec tsc --noEmit` and `pnpm lint` before every commit. Before every commit run `[ "$(git branch --show-current)" = "worktree-training-progress" ] || { echo "WRONG BRANCH -- STOP"; exit 1; }`. Commit with `git -c commit.gpgsign=false commit ... -m "Co-Authored-By: GitHub Copilot <noreply@github.com>"`.

---

## File Structure

```
packages/shared/src/progress.ts                         CREATE  progress payload schemas and confidence constants
packages/shared/src/progress.test.ts                    CREATE  shared schema tests
packages/shared/src/index.ts                            MODIFY  export progress schemas
apps/api/src/db/schema.ts                               MODIFY  trainingSkills/practiceSessions tables + relations
apps/api/src/db/schema.test.ts                          CREATE  schema smoke test
apps/api/drizzle/0003_*.sql                             CREATE  generated migration with two tables + backfill
apps/api/drizzle/meta/_journal.json                     MODIFY  generated migration journal
apps/api/drizzle/meta/0003_snapshot.json                CREATE  generated migration snapshot
apps/api/src/db/owned-skill.ts                          CREATE  owner/dog/skill scope helper
apps/api/src/db/owned-skill.test.ts                     CREATE  helper tests
apps/api/src/lib/progress.ts                            CREATE  loadProgress helper and progress types
apps/api/src/lib/brief.ts                               MODIFY  progress section rendering
apps/api/src/lib/brief.test.ts                          MODIFY  progress composer tests
apps/api/src/routes/dogs.ts                             MODIFY  goal default skill + progress/skill/session routes + brief load
apps/api/src/routes/dogs.test.ts                        MODIFY  endpoint, isolation, and brief route tests
apps/api/src/app.ts                                     MODIFY  allow PATCH in CORS
apps/web/src/lib/progress.ts                            CREATE  progress query/mutation hooks
apps/web/src/i18n/en.ts                                 MODIFY  progress keys
apps/web/src/i18n/es.ts                                 MODIFY  progress keys
apps/web/src/components/progress/confidence-chip.tsx    CREATE  confidence selector
apps/web/src/components/progress/session-form.tsx       CREATE  log-session form
apps/web/src/components/progress/progress-panel.tsx     CREATE  progress panel
apps/web/src/components/progress/progress-panel.test.tsx CREATE panel tests
apps/web/src/routes/dog-detail.tsx                      MODIFY  render ProgressPanel below goals
docs/PROJECT-LOG.md                                     MODIFY  shipped entry after implementation gates
```

---

## Task 1: Shared progress schemas

**Files:**
- Create: `packages/shared/src/progress.ts`
- Create: `packages/shared/src/progress.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  practiceSessionSchema,
  skillConfidenceSchema,
  trainingSkillSchema,
} from "./progress";

describe("trainingSkillSchema", () => {
  it("accepts a valid skill with confidence", () => {
    expect(trainingSkillSchema.safeParse({ name: "Door-knock threshold", confidence: 3 }).success).toBe(true);
  });

  it("rejects an empty trimmed name, overlong name, and out-of-range confidence", () => {
    expect(trainingSkillSchema.safeParse({ name: "   ", confidence: 3 }).success).toBe(false);
    expect(trainingSkillSchema.safeParse({ name: "x".repeat(121), confidence: 3 }).success).toBe(false);
    expect(trainingSkillSchema.safeParse({ name: "Mat settle", confidence: 6 }).success).toBe(false);
  });
});

describe("skillConfidenceSchema", () => {
  it("accepts only integer confidence values from 1 to 5", () => {
    expect(skillConfidenceSchema.safeParse({ confidence: 1 }).success).toBe(true);
    expect(skillConfidenceSchema.safeParse({ confidence: 5 }).success).toBe(true);
    expect(skillConfidenceSchema.safeParse({ confidence: 2.5 }).success).toBe(false);
    expect(skillConfidenceSchema.safeParse({ confidence: 0 }).success).toBe(false);
  });
});

describe("practiceSessionSchema", () => {
  it("accepts occurredAt with optional duration and notes", () => {
    expect(
      practiceSessionSchema.safeParse({
        occurredAt: "2026-05-22T10:00",
        durationMinutes: 15,
        notes: "Held sit through two knocks",
      }).success,
    ).toBe(true);
    expect(practiceSessionSchema.safeParse({ occurredAt: "2026-05-22T10:00" }).success).toBe(true);
  });

  it("rejects invalid duration and non-string notes", () => {
    expect(practiceSessionSchema.safeParse({ occurredAt: "2026-05-22T10:00", durationMinutes: -1 }).success).toBe(false);
    expect(practiceSessionSchema.safeParse({ occurredAt: "2026-05-22T10:00", notes: 7 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/shared test -- progress.test
```

Expected: FAIL because `packages/shared/src/progress.ts` does not exist.

- [ ] **Step 3: Implement the shared schema module**

Create `packages/shared/src/progress.ts`:

```ts
import { z } from "zod";

export const CONFIDENCE_MIN = 1;
export const CONFIDENCE_MAX = 5;

export const trainingSkillSchema = z.object({
  name: z.string().trim().min(1, "Skill name is required").max(120),
  confidence: z.number().int().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX),
});
export type TrainingSkillInput = z.infer<typeof trainingSkillSchema>;

export const skillConfidenceSchema = z.object({
  confidence: z.number().int().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX),
});
export type SkillConfidenceInput = z.infer<typeof skillConfidenceSchema>;

export const practiceSessionSchema = z.object({
  occurredAt: z.string().min(1, "Date is required"),
  durationMinutes: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type PracticeSessionInput = z.infer<typeof practiceSessionSchema>;
```

Add `export * from "./progress";` to `packages/shared/src/index.ts`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @turingcare/shared test -- progress.test
set -a && . ./.env && set +a && pnpm -r exec tsc --noEmit
pnpm lint
```

Expected: progress schema tests PASS; repo typecheck and lint return 0.

- [ ] **Step 5: Commit**

```bash
[ "$(git branch --show-current)" = "worktree-training-progress" ] || { echo "WRONG BRANCH -- STOP"; exit 1; }
git add packages/shared/src/progress.ts packages/shared/src/progress.test.ts packages/shared/src/index.ts
git -c commit.gpgsign=false commit -m "feat(shared): add training progress schemas" -m "Co-Authored-By: GitHub Copilot <noreply@github.com>"
```

---

## Task 2: Database schema and migration

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/db/schema.test.ts`
- Create/modify generated files under `apps/api/drizzle/`

- [ ] **Step 1: Write the failing schema smoke test**

Create `apps/api/src/db/schema.test.ts`:

```ts
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { practiceSessions, trainingSkills } from "./schema";

describe("training progress tables", () => {
  it("exports the expected table names", () => {
    expect(getTableName(trainingSkills)).toBe("training_skills");
    expect(getTableName(practiceSessions)).toBe("practice_sessions");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api test -- src/db/schema.test.ts
```

Expected: FAIL because `trainingSkills` and `practiceSessions` are not exported from `schema.ts`.

- [ ] **Step 3: Add Drizzle tables and relations**

In `apps/api/src/db/schema.ts`, add `trainingSkills` after `trainingGoals` and `practiceSessions` after `trainingSkills`:

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("confidence_range", sql`${t.confidence} BETWEEN 1 AND 5`)],
);

export const practiceSessions = pgTable("practice_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => trainingSkills.id, { onDelete: "cascade" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Update relations:

```ts
export const trainingGoalsRelations = relations(trainingGoals, ({ one, many }) => ({
  dog: one(dogs, { fields: [trainingGoals.dogId], references: [dogs.id] }),
  trainingSkills: many(trainingSkills),
}));

export const trainingSkillsRelations = relations(trainingSkills, ({ one, many }) => ({
  goal: one(trainingGoals, { fields: [trainingSkills.goalId], references: [trainingGoals.id] }),
  practiceSessions: many(practiceSessions),
}));

export const practiceSessionsRelations = relations(practiceSessions, ({ one }) => ({
  skill: one(trainingSkills, { fields: [practiceSessions.skillId], references: [trainingSkills.id] }),
}));
```

- [ ] **Step 4: Generate and verify the migration**

```bash
pnpm --filter @turingcare/api db:generate -- --name training_progress
```

Open the generated `apps/api/drizzle/0003_*.sql` and add this idempotent backfill after the `CREATE TABLE "training_skills"` statement:

```sql
INSERT INTO "training_skills" ("goal_id", "name", "confidence", "position")
SELECT "id", "goal", 1, 0 FROM "training_goals"
WHERE "id" NOT IN (SELECT DISTINCT "goal_id" FROM "training_skills");
--> statement-breakpoint
```

Confirm the migration creates exactly `training_skills` and `practice_sessions`, adds the `confidence_range` check, uses cascade foreign keys, and does not alter package manifests.

- [ ] **Step 5: Run tests and pre-commit gates**

```bash
pnpm --filter @turingcare/api test -- src/db/schema.test.ts
set -a && . ./.env && set +a && pnpm -r exec tsc --noEmit
pnpm lint
```

Expected: schema smoke test PASS; repo typecheck and lint return 0.

- [ ] **Step 6: Commit**

```bash
[ "$(git branch --show-current)" = "worktree-training-progress" ] || { echo "WRONG BRANCH -- STOP"; exit 1; }
git add apps/api/src/db/schema.ts apps/api/src/db/schema.test.ts apps/api/drizzle
git -c commit.gpgsign=false commit -m "feat(api): add training progress tables" -m "Co-Authored-By: GitHub Copilot <noreply@github.com>"
```

---

## Task 3: Owned skill scope helper

**Files:**
- Create: `apps/api/src/db/owned-skill.ts`
- Create: `apps/api/src/db/owned-skill.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `apps/api/src/db/owned-skill.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { dogs, trainingGoals, trainingSkills } from "./schema";
import { findOwnedSkill } from "./owned-skill";
import { type TestUser, createTestUser } from "../test-helpers";

const validDog = {
  name: "Biscuit",
  size: "medium" as const,
  sex: "female" as const,
  source: "rescue" as const,
  vaccineStage: "in_progress" as const,
  spayedNeutered: true,
};

describe("findOwnedSkill", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  async function seedSkill(u: TestUser) {
    const [dog] = await db.insert(dogs).values({ ...validDog, ownerId: u.userId }).returning();
    if (!dog) throw new Error("expected dog");
    const [goal] = await db.insert(trainingGoals).values({ dogId: dog.id, goal: "Calm greetings" }).returning();
    if (!goal) throw new Error("expected goal");
    const [skill] = await db
      .insert(trainingSkills)
      .values({ goalId: goal.id, name: "Door-knock threshold", confidence: 2 })
      .returning();
    if (!skill) throw new Error("expected skill");
    return { dog, goal, skill };
  }

  it("returns a skill only when user, dog, and skill all match", async () => {
    const u = await createTestUser();
    users.push(u);
    const { dog, goal, skill } = await seedSkill(u);
    await expect(findOwnedSkill(u.userId, dog.id, skill.id)).resolves.toMatchObject({
      id: skill.id,
      goalId: goal.id,
    });
  });

  it("returns null for another owner and for a different dog path", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const seeded = await seedSkill(a);
    const other = await seedSkill(a);
    await expect(findOwnedSkill(b.userId, seeded.dog.id, seeded.skill.id)).resolves.toBeNull();
    await expect(findOwnedSkill(a.userId, other.dog.id, seeded.skill.id)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api test -- src/db/owned-skill.test.ts
```

Expected: FAIL because `owned-skill.ts` does not exist.

- [ ] **Step 3: Implement `findOwnedSkill`**

Create `apps/api/src/db/owned-skill.ts` mirroring `owned-dog.ts` in shape:

```ts
import { and, eq } from "drizzle-orm";
import { db } from ".";
import { dogs, trainingGoals, trainingSkills } from "./schema";

export async function findOwnedSkill(userId: string, dogId: string, skillId: string) {
  const rows = await db
    .select({
      id: trainingSkills.id,
      goalId: trainingSkills.goalId,
      name: trainingSkills.name,
      confidence: trainingSkills.confidence,
      position: trainingSkills.position,
      createdAt: trainingSkills.createdAt,
    })
    .from(trainingSkills)
    .innerJoin(trainingGoals, eq(trainingSkills.goalId, trainingGoals.id))
    .innerJoin(dogs, eq(trainingGoals.dogId, dogs.id))
    .where(and(eq(trainingSkills.id, skillId), eq(trainingGoals.dogId, dogId), eq(dogs.ownerId, userId)))
    .limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Run tests and pre-commit gates**

```bash
pnpm --filter @turingcare/api test -- src/db/owned-skill.test.ts
set -a && . ./.env && set +a && pnpm -r exec tsc --noEmit
pnpm lint
```

Expected: helper tests PASS; repo typecheck and lint return 0.

- [ ] **Step 5: Commit**

```bash
[ "$(git branch --show-current)" = "worktree-training-progress" ] || { echo "WRONG BRANCH -- STOP"; exit 1; }
git add apps/api/src/db/owned-skill.ts apps/api/src/db/owned-skill.test.ts
git -c commit.gpgsign=false commit -m "feat(api): add owned training skill lookup" -m "Co-Authored-By: GitHub Copilot <noreply@github.com>"
```

---

## Task 4: Progress loader and GET endpoint

**Files:**
- Create: `apps/api/src/lib/progress.ts`
- Modify: `apps/api/src/routes/dogs.ts`
- Modify: `apps/api/src/routes/dogs.test.ts`

- [ ] **Step 1: Write failing API tests**

Append a `describe("dogs: progress overview", ...)` block to `apps/api/src/routes/dogs.test.ts` with these cases:

```ts
it("GET /progress returns goals, skills, averages, and recent sessions", async () => {
  const u = await createTestUser();
  users.push(u);
  const dog = await makeDog(u);
  const goalRes = await app.request(`/api/dogs/${dog.id}/goals`, {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify({ goal: "Calm greetings" }),
  });
  const { goal } = (await goalRes.json()) as { goal: { id: string } };
  const [skill] = await db
    .insert(trainingSkills)
    .values({ goalId: goal.id, name: "Door-knock threshold", confidence: 3, position: 1 })
    .returning();
  if (!skill) throw new Error("expected skill");
  await db.insert(practiceSessions).values({
    skillId: skill.id,
    occurredAt: new Date("2026-05-22T10:00:00.000Z"),
    durationMinutes: 12,
    notes: "Held sit through two knocks",
  });

  const res = await app.request(`/api/dogs/${dog.id}/progress`, { headers: u.authHeaders });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    goals: Array<{ goal: string; avgConfidence: number | null; skills: Array<{ name: string; confidence: number; sessionCount: number; lastNote: string | null; sessions: Array<{ id: string; notes: string | null }> }> }>;
  };
  expect(body.goals).toHaveLength(1);
  expect(body.goals[0]?.goal).toBe("Calm greetings");
  expect(body.goals[0]?.avgConfidence).toBe(3);
  expect(body.goals[0]?.skills.some((s) => s.name === "Door-knock threshold" && s.sessionCount === 1 && s.lastNote === "Held sit through two knocks" && s.sessions.length === 1)).toBe(true);
});

it("GET /progress is owner scoped", async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  users.push(a, b);
  const dog = await makeDog(a);
  const res = await app.request(`/api/dogs/${dog.id}/progress`, { headers: b.authHeaders });
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api test -- --reporter=verbose dogs.test
```

Expected: FAIL with 404 for `/progress` because the route is missing.

- [ ] **Step 3: Implement `loadProgress(dogId)` and the route**

Create `apps/api/src/lib/progress.ts` with exported types and a helper that:
- loads `trainingGoals` for the dog ordered by `createdAt`
- loads `trainingSkills` for those goal ids ordered by `position`, then `createdAt`
- loads all `practiceSessions` for those skill ids ordered by `occurredAt` descending
- computes `sessionCount`, `firstSessionAt`, `lastSessionAt`, `lastNote`, average confidence per goal, and `sessions.slice(0, 5)` per skill

Add `.get("/:id/progress", ...)` to `dogsApp` after the existing `/:id/goals` routes:

```ts
  .get("/:id/progress", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    return c.json(await loadProgress(dog.id));
  })
```

- [ ] **Step 4: Run tests and pre-commit gates**

```bash
pnpm --filter @turingcare/api test -- --reporter=verbose dogs.test
set -a && . ./.env && set +a && pnpm -r exec tsc --noEmit
pnpm lint
```

Expected: progress overview tests PASS; repo typecheck and lint return 0.

- [ ] **Step 5: Commit**

```bash
[ "$(git branch --show-current)" = "worktree-training-progress" ] || { echo "WRONG BRANCH -- STOP"; exit 1; }
git add apps/api/src/lib/progress.ts apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts
git -c commit.gpgsign=false commit -m "feat(api): expose dog training progress overview" -m "Co-Authored-By: GitHub Copilot <noreply@github.com>"
```

---

## Task 5: Skill API endpoints and PATCH CORS

**Files:**
- Modify: `apps/api/src/routes/dogs.ts`
- Modify: `apps/api/src/routes/dogs.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing endpoint tests**

Add tests under `describe("dogs: progress skills", ...)` covering:
- POST `/api/dogs/:id/goals/:goalId/skills` returns 201 and position `1` after the default position `0`
- PUT `/api/dogs/:id/skills/:skillId` updates name + confidence
- PATCH `/api/dogs/:id/skills/:skillId/confidence` updates only confidence
- DELETE `/api/dogs/:id/skills/:skillId` removes the skill from `GET /progress`
- owner isolation: user B gets 404 for user A's skill
- cross-dog isolation: user A cannot add a skill to dog B's goal through dog A's path
- CORS OPTIONS for the confidence endpoint includes `PATCH`

Use this CORS assertion in the test block:

```ts
const options = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}/confidence`, {
  method: "OPTIONS",
  headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "PATCH" },
});
expect(options.headers.get("access-control-allow-methods")).toContain("PATCH");
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api test -- --reporter=verbose dogs.test
```

Expected: FAIL because skill routes are missing and CORS does not allow PATCH.

- [ ] **Step 3: Implement skill routes and CORS update**

Import `trainingSkillSchema`, `skillConfidenceSchema`, `trainingSkills`, `trainingGoals`, `findOwnedSkill`, `asc`, and `max` as needed. Add:
- POST route checks owned dog, checks `goalId` belongs to that dog, computes `position` as max existing position + 1, inserts skill, returns `{ skill }`, 201
- PUT route uses `findOwnedSkill`, updates name/confidence, returns `{ skill }`
- PATCH route uses `findOwnedSkill`, updates confidence, returns `{ skill }`
- DELETE route uses `findOwnedSkill`, deletes skill by id, returns `{ ok: true }`

In `apps/api/src/app.ts`, change:

```ts
allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
```

to:

```ts
allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
```

- [ ] **Step 4: Run tests and pre-commit gates**

```bash
pnpm --filter @turingcare/api test -- --reporter=verbose dogs.test
set -a && . ./.env && set +a && pnpm -r exec tsc --noEmit
pnpm lint
```

Expected: skill endpoint and CORS tests PASS; repo typecheck and lint return 0.

- [ ] **Step 5: Commit**

```bash
[ "$(git branch --show-current)" = "worktree-training-progress" ] || { echo "WRONG BRANCH -- STOP"; exit 1; }
git add apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts apps/api/src/app.ts
git -c commit.gpgsign=false commit -m "feat(api): add training skill endpoints" -m "Co-Authored-By: GitHub Copilot <noreply@github.com>"
```

---

## Task 6: Practice session API endpoints

**Files:**
- Modify: `apps/api/src/routes/dogs.ts`
- Modify: `apps/api/src/routes/dogs.test.ts`

- [ ] **Step 1: Write failing session tests**

Add tests under `describe("dogs: progress sessions", ...)` covering:
- POST `/api/dogs/:id/skills/:skillId/sessions` returns 201 `{ session }`
- subsequent `GET /progress` shows `sessionCount: 1`, `lastSessionAt`, `lastNote`, and one recent session
- DELETE `/api/dogs/:id/skills/:skillId/sessions/:sessionId` decrements `sessionCount`
- cross-skill isolation: using a skill from another dog path returns 404

Use the same `makeDog`, `makeGoal`, and `makeSkill` helper pattern as the skill tests, with explicit `if (!row) throw new Error("expected ...")` guards.

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api test -- --reporter=verbose dogs.test
```

Expected: FAIL because session routes are missing.

- [ ] **Step 3: Implement session routes**

Import `practiceSessionSchema` and `practiceSessions`. Add:
- POST route uses `findOwnedSkill`, inserts `occurredAt: new Date(body.occurredAt)`, nullable duration/notes, returns `{ session }`, 201
- DELETE route uses `findOwnedSkill`, then deletes with `and(eq(practiceSessions.id, sessionId), eq(practiceSessions.skillId, skill.id))`; if no row returns 404, else `{ ok: true }`

- [ ] **Step 4: Run tests and pre-commit gates**

```bash
pnpm --filter @turingcare/api test -- --reporter=verbose dogs.test
set -a && . ./.env && set +a && pnpm -r exec tsc --noEmit
pnpm lint
```

Expected: session tests PASS; repo typecheck and lint return 0.

- [ ] **Step 5: Commit**

```bash
[ "$(git branch --show-current)" = "worktree-training-progress" ] || { echo "WRONG BRANCH -- STOP"; exit 1; }
git add apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts
git -c commit.gpgsign=false commit -m "feat(api): add practice session endpoints" -m "Co-Authored-By: GitHub Copilot <noreply@github.com>"
```

---

## Task 7: Default skill on goal creation

**Files:**
- Modify: `apps/api/src/routes/dogs.ts`
- Modify: `apps/api/src/routes/dogs.test.ts`

- [ ] **Step 1: Write failing goal-default-skill tests**

Update the existing `"adds and removes a goal"` test to parse `{ goal, skill }` and assert:

```ts
expect(skill.name).toBe("Calm greetings");
expect(skill.confidence).toBe(1);
expect(skill.position).toBe(0);
```

Add one assertion after goal creation:

```ts
const progress = await app.request(`/api/dogs/${dog.id}/progress`, { headers: u.authHeaders });
const progressBody = (await progress.json()) as { goals: Array<{ skills: unknown[] }> };
expect(progressBody.goals[0]?.skills).toHaveLength(1);
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api test -- --reporter=verbose dogs.test
```

Expected: FAIL because `POST /goals` returns only `{ goal }`.

- [ ] **Step 3: Extend POST `/goals`**

After inserting the goal, insert:

```ts
const [skill] = await db
  .insert(trainingSkills)
  .values({ goalId: goal.id, name: b.goal, confidence: 1, position: 0 })
  .returning();
if (!skill) throw new Error("failed to create default skill");
return c.json({ goal, skill }, 201);
```

- [ ] **Step 4: Run tests and pre-commit gates**

```bash
pnpm --filter @turingcare/api test -- --reporter=verbose dogs.test
set -a && . ./.env && set +a && pnpm -r exec tsc --noEmit
pnpm lint
```

Expected: goal default skill tests PASS; repo typecheck and lint return 0.

- [ ] **Step 5: Commit**

```bash
[ "$(git branch --show-current)" = "worktree-training-progress" ] || { echo "WRONG BRANCH -- STOP"; exit 1; }
git add apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts
git -c commit.gpgsign=false commit -m "feat(api): create default skill for new goals" -m "Co-Authored-By: GitHub Copilot <noreply@github.com>"
```

---

## Task 8: Brief composer progress section

**Files:**
- Modify: `apps/api/src/lib/brief.ts`
- Modify: `apps/api/src/lib/brief.test.ts`
- Modify: `apps/api/src/routes/dogs.ts`
- Modify: `apps/api/src/routes/dogs.test.ts`

- [ ] **Step 1: Write failing brief tests**

In `apps/api/src/lib/brief.test.ts`, add:

```ts
it("renders training progress and omits zero-skill goals", () => {
  const out = composeBrief({
    dog,
    concerns: [],
    goals: [{ goal: "Calm greetings" }],
    entries: [],
    progress: [
      {
        id: "g1",
        goal: "Calm greetings",
        avgConfidence: 3,
        skills: [
          {
            id: "s1",
            name: "Door-knock threshold",
            confidence: 3,
            sessionCount: 2,
            firstSessionAt: "2026-05-01T10:00:00.000Z",
            lastSessionAt: "2026-05-22T10:00:00.000Z",
            lastNote: "held sit through a very long note that should stay readable",
            sessions: [],
          },
          {
            id: "s2",
            name: "Greeting strangers",
            confidence: 2,
            sessionCount: 0,
            firstSessionAt: null,
            lastSessionAt: null,
            lastNote: null,
            sessions: [],
          },
        ],
      },
      { id: "g2", goal: "Empty goal", avgConfidence: null, skills: [] },
    ],
  });
  expect(out).toContain("Training progress:");
  expect(out).toContain("Calm greetings");
  expect(out).toContain("Sometimes (3.0/5)");
  expect(out).toContain("Door-knock threshold -- 3/5, 2 sessions");
  expect(out).toContain("Greeting strangers -- 2/5, no sessions yet");
  expect(out).not.toContain("Empty goal");
});

it("omits training progress when no goals exist", () => {
  const out = composeBrief({ dog, concerns: [], goals: [], entries: [], progress: [] });
  expect(out).not.toContain("Training progress:");
});
```

In `apps/api/src/routes/dogs.test.ts`, add a brief route test that creates a goal, logs a session, POSTs `/brief`, and expects `brief.summary` to contain `"Training progress:"` and the skill name.

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api test -- src/lib/brief.test.ts --reporter=verbose
pnpm --filter @turingcare/api test -- --reporter=verbose dogs.test
```

Expected: FAIL because `composeBrief` has no `progress` input and route brief generation does not call `loadProgress`.

- [ ] **Step 3: Extend brief rendering and route generation**

Update `BriefInput` to include `progress?: ProgressGoal[]`. Add helpers in `brief.ts`:
- confidence label mapping: `1 Not yet`, `2 Learning`, `3 Sometimes`, `4 Usually`, `5 Consistently`
- `truncateNote(note)` to 80 chars with `...`
- `weeksBetween(first,last)` for `over N wks`, omitted for fewer than two sessions

Render:

```ts
Training progress:
  ${goal.goal} -- ${label} (${avg.toFixed(1)}/5)
    * ${skill.name} -- ${skill.confidence}/5, ${sessionSummary}
      last: "${truncatedNote}"
```

Use ASCII `--` and `*` to match the file's deterministic plain-text style. In `POST /:id/brief`, call `const progress = await loadProgress(dog.id);` and pass `progress: progress.goals` to `composeBrief`.

- [ ] **Step 4: Run tests and pre-commit gates**

```bash
pnpm --filter @turingcare/api test -- src/lib/brief.test.ts --reporter=verbose
pnpm --filter @turingcare/api test -- --reporter=verbose dogs.test
set -a && . ./.env && set +a && pnpm -r exec tsc --noEmit
pnpm lint
```

Expected: brief tests PASS; repo typecheck and lint return 0.

- [ ] **Step 5: Commit**

```bash
[ "$(git branch --show-current)" = "worktree-training-progress" ] || { echo "WRONG BRANCH -- STOP"; exit 1; }
git add apps/api/src/lib/brief.ts apps/api/src/lib/brief.test.ts apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts
git -c commit.gpgsign=false commit -m "feat(api): include training progress in briefs" -m "Co-Authored-By: GitHub Copilot <noreply@github.com>"
```

---

## Task 9: Progress i18n keys

**Files:**
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Write failing parity expectations**

No new test file is needed because `apps/web/src/i18n/i18n.test.tsx` already asserts exact key parity and untranslated Spanish values. Add the `progress` section to `en.ts` only first to make the existing parity test fail.

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web test -- src/i18n/i18n.test.tsx
```

Expected: FAIL because `es.ts` is missing the `progress.*` keys.

- [ ] **Step 3: Add matching English and Spanish keys**

Use flat two-level keys under `progress` because `MessageKey` supports `section.key` only. Add the exact English and Spanish key sets from the spec: `title`, `empty`, `addSkill`, `skillName`, `skillNamePh`, `confidence`, `level1` through `level5`, `sessions`, `session`, `noSessions`, `lastSession`, `logSession`, `occurredAt`, `duration`, `durationOptional`, `notes`, `notesOptional`, `save`, `saving`, `cancel`, `saved`, `saveFailed`, `removeSkill`, `removeSession`, `edit`, `saveSkill`, `loadError`, `avgConfidence`.

- [ ] **Step 4: Run tests and pre-commit gates**

```bash
pnpm --filter @turingcare/web test -- src/i18n/i18n.test.tsx
set -a && . ./.env && set +a && pnpm -r exec tsc --noEmit
pnpm lint
```

Expected: i18n tests PASS; repo typecheck and lint return 0.

- [ ] **Step 5: Commit**

```bash
[ "$(git branch --show-current)" = "worktree-training-progress" ] || { echo "WRONG BRANCH -- STOP"; exit 1; }
git add apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git -c commit.gpgsign=false commit -m "feat(web): add progress translations" -m "Co-Authored-By: GitHub Copilot <noreply@github.com>"
```

---

## Task 10: Web progress hooks

**Files:**
- Create: `apps/web/src/lib/progress.ts`

- [ ] **Step 1: Write the failing hook module type check**

Create `apps/web/src/lib/progress.ts` with imports and exported function declarations that call missing RPC paths; the TypeScript gate will fail until API AppType includes the new routes from earlier tasks and the function bodies are complete.

- [ ] **Step 2: Run typecheck to verify failure**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web exec tsc --noEmit
```

Expected: FAIL while the hook module is incomplete.

- [ ] **Step 3: Implement hooks**

Implement:
- `useProgress(dogId)` with query key `["progress", dogId]`
- `useAddSkill(dogId, goalId)`
- `useUpdateSkill(dogId)`
- `useUpdateSkillConfidence(dogId)`
- `useDeleteSkill(dogId)`
- `useLogSession(dogId)`
- `useDeleteSession(dogId)`

All mutations invalidate `["progress", dogId]`. Use the existing `apps/web/src/lib/journal.ts` pattern: throw `new Error("load_failed")`, `new Error("save_failed")`, `new Error("update_failed")`, or `new Error("delete_failed")` on non-OK responses. Export `type ProgressGoal = Awaited<ReturnType<typeof useProgress>["data"]>[number]` is not safe because hooks may be undefined; instead define explicit exported `ProgressSession`, `ProgressSkill`, and `ProgressGoal` types matching the API response.

- [ ] **Step 4: Run tests and pre-commit gates**

```bash
set -a && . ./.env && set +a && pnpm --filter @turingcare/web exec tsc --noEmit
set -a && . ./.env && set +a && pnpm -r exec tsc --noEmit
pnpm lint
```

Expected: web typecheck, repo typecheck, and lint return 0.

- [ ] **Step 5: Commit**

```bash
[ "$(git branch --show-current)" = "worktree-training-progress" ] || { echo "WRONG BRANCH -- STOP"; exit 1; }
git add apps/web/src/lib/progress.ts
git -c commit.gpgsign=false commit -m "feat(web): add training progress hooks" -m "Co-Authored-By: GitHub Copilot <noreply@github.com>"
```

---

## Task 11: Progress components and component tests

**Files:**
- Create: `apps/web/src/components/progress/confidence-chip.tsx`
- Create: `apps/web/src/components/progress/session-form.tsx`
- Create: `apps/web/src/components/progress/progress-panel.tsx`
- Create: `apps/web/src/components/progress/progress-panel.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `progress-panel.test.tsx` using the provider pattern from `entry-card.test.tsx`. Cover:
- renders a goal, default skill, and `3/5` confidence chip
- clicking the confidence chip opens 5 named buttons and selecting `"Usually"` sends PATCH
- `"Add skill"` opens a form; submitting sends POST and refetch makes the new skill visible
- `"Log session"` opens form; submitting sends POST and refetch increments the session count
- `"Remove skill"` sends DELETE and refetch removes the skill
- empty response `{ goals: [] }` renders the empty message

Use `vi.stubGlobal("fetch", ...)` and keep an in-memory `progress` object that mutates in response to POST/PATCH/DELETE requests, then returns from GET `/progress`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web test -- src/components/progress/progress-panel.test.tsx
```

Expected: FAIL because the progress components do not exist.

- [ ] **Step 3: Implement components**

Implement components with these responsibilities:
- `ConfidenceChip`: button showing `${confidence}/5`; when open, render 5 buttons from i18n labels; selecting calls `useUpdateSkillConfidence(dogId).mutate({ skillId, confidence })`
- `SessionForm`: react-hook-form with `practiceSessionSchema`, default `occurredAt` as local `datetime-local`, optional `durationMinutes`, optional `notes`, Save/Cancel buttons, and a toast on success/failure
- `ProgressPanel`: query via `useProgress`; render loading/error/empty states; per goal show avg confidence and skills; per skill show confidence chip, session count, last session info, Add skill form, editable skill name, expanded recent sessions with Remove buttons, and Log session form

Use existing UI conventions: `Button`, `zodResolver`, `useState`, derive visible data from query/mutation results, no non-null assertions, and `event.stopPropagation()` for nested row buttons.

- [ ] **Step 4: Run tests and pre-commit gates**

```bash
pnpm --filter @turingcare/web test -- src/components/progress/progress-panel.test.tsx
set -a && . ./.env && set +a && pnpm -r exec tsc --noEmit
pnpm lint
```

Expected: component tests PASS; repo typecheck and lint return 0.

- [ ] **Step 5: Commit**

```bash
[ "$(git branch --show-current)" = "worktree-training-progress" ] || { echo "WRONG BRANCH -- STOP"; exit 1; }
git add apps/web/src/components/progress
git -c commit.gpgsign=false commit -m "feat(web): add training progress panel" -m "Co-Authored-By: GitHub Copilot <noreply@github.com>"
```

---

## Task 12: Wire ProgressPanel into dog detail

**Files:**
- Modify: `apps/web/src/routes/dog-detail.tsx`
- Modify: `apps/web/src/routes/dogs.test.tsx`

- [ ] **Step 1: Write the failing route test**

Extend the dog-detail test setup in `apps/web/src/routes/dogs.test.tsx` so its fetch stub responds to `/api/dogs/d1/progress` with `{ goals: [] }`, then assert the progress title appears on the dog detail page.

```ts
expect(await screen.findByText(/Training progress/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web test -- src/routes/dogs.test.tsx
```

Expected: FAIL because `dog-detail.tsx` does not render `ProgressPanel`.

- [ ] **Step 3: Render the panel**

In `apps/web/src/routes/dog-detail.tsx`, import:

```ts
import { ProgressPanel } from "@/components/progress/progress-panel";
```

Render below the existing Goals panel:

```tsx
<ProgressPanel dogId={id} />
```

- [ ] **Step 4: Run tests and pre-commit gates**

```bash
pnpm --filter @turingcare/web test -- src/routes/dogs.test.tsx src/components/progress/progress-panel.test.tsx
set -a && . ./.env && set +a && pnpm -r exec tsc --noEmit
pnpm lint
```

Expected: dog route and progress component tests PASS; repo typecheck and lint return 0.

- [ ] **Step 5: Commit**

```bash
[ "$(git branch --show-current)" = "worktree-training-progress" ] || { echo "WRONG BRANCH -- STOP"; exit 1; }
git add apps/web/src/routes/dog-detail.tsx apps/web/src/routes/dogs.test.tsx
git -c commit.gpgsign=false commit -m "feat(web): show training progress on dog detail" -m "Co-Authored-By: GitHub Copilot <noreply@github.com>"
```

---

## Task 13: Final gates, project log, and draft PR

**Files:**
- Modify: `docs/PROJECT-LOG.md`

- [ ] **Step 1: Run full repository gates**

```bash
set -a && . ./.env && set +a
pnpm -r exec tsc --noEmit
pnpm -r test
pnpm -r build
pnpm lint
```

Expected: all four commands return 0. Record final per-workspace test counts from the `pnpm -r test` output.

- [ ] **Step 2: Append the project log entry**

Append a `## 2026-05-23 -- Training Progress Tracking -- SHIPPED` entry to `docs/PROJECT-LOG.md` matching the latest style. Mention:
- goal -> skills -> sessions subsystem
- spec and plan refs
- final gates
- `Shipped as a PR from worktree-training-progress`

- [ ] **Step 3: Run focused docs-adjacent check**

```bash
pnpm lint
```

Expected: lint returns 0.

- [ ] **Step 4: Commit project log**

```bash
[ "$(git branch --show-current)" = "worktree-training-progress" ] || { echo "WRONG BRANCH -- STOP"; exit 1; }
git add docs/PROJECT-LOG.md
git -c commit.gpgsign=false commit -m "docs: log training progress shipment" -m "Co-Authored-By: GitHub Copilot <noreply@github.com>"
```

- [ ] **Step 5: Push and open one draft PR**

```bash
git push -u origin worktree-training-progress
gh pr create --base main --head worktree-training-progress --draft \
  --title "Training progress tracking (goals -> skills -> sessions)" \
  --body-file <(cat <<'EOF'
## Summary
Implements the training-progress subsystem per docs/superpowers/specs/2026-05-22-training-progress-design.md. Adds a 3-level hierarchy (Goal -> Skills -> Sessions) with owner-rated 5-level confidence per skill. New `<ProgressPanel>` on the dog-detail page. Brief composer extended with a Training progress section.

## Architecture
- 2 new tables (training_skills, practice_sessions) + idempotent backfill
- 7 new owner-scoped API endpoints under /api/dogs/:id/...
- Existing POST /goals extended to auto-create a default same-named skill
- New React component tree under components/progress/
- ~31 new i18n keys with en/es parity
- Brief composer reads progress via a new loadProgress() helper

## Test plan
- shared: <N> new schema tests
- api: <N> new endpoint/helper/brief tests
- web: <N> new component/route tests
- Gates green: tsc 0, build OK, lint 0

## Out of scope (deferred)
Editing logged sessions; drag-reorder; trainer view; charts; streaks; notifications; per-session confidence delta; data export.

## Spec + plan
- docs/superpowers/specs/2026-05-22-training-progress-design.md
- docs/superpowers/plans/2026-05-22-training-progress.md

Generated with GitHub Copilot
EOF
)
```

Replace `<N>` counts with measured test additions before creating the PR.

- [ ] **Step 6: Report completion**

Report:
- PR URL
- commit count on `worktree-training-progress`
- per-workspace total and added test counts
- deviations: external worktree because `.claude/` is not ignored, missing `CLAUDE.md`, CORS PATCH update, progress response includes recent sessions by user decision
- separate-PR follow-up: existing passing web tests emit jsdom `requestSubmit` stderr
