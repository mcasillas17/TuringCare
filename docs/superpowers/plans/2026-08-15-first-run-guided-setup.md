# First-Run Guided Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a resumable three-step first-run flow that creates a dog, captures owner intent, and completes one real behavior, training, or progress action.

**Architecture:** Persist one active guided-setup row per owner and expose it through a typed Hono sub-app. Extract transaction-aware domain write helpers from the existing dog routes so guided actions and normal routes share dog, concern, journal, template, focus, safety, and telemetry behavior. Build a dedicated authenticated React route backed by TanStack Query, then redirect only dog-less owners or owners with an active setup into it.

**Tech Stack:** TypeScript, Zod, Hono, Drizzle/Postgres, React 19, React Router, TanStack Query, React Hook Form, Vitest, Testing Library, Playwright, pnpm.

---

## Conventions

- Execute tasks in numeric order. Tasks 1–6 establish contracts and API behavior before
  Tasks 7–12 add web consumers; Task 13 depends on the complete vertical flow.
- Work only in the `feat/first-run-guided-setup` worktree created from `origin/main`.
- API integration tests use `app.request()`, `createTestUser()`, and real Postgres. Clean
  users in `afterEach`; cascading deletes remove setup and owned domain rows.
- Every owned lookup returns `404`, never `403`. Setup mutations accept only the opaque
  `setupId` returned by setup status/start and scope it to the signed-in owner. No route
  accepts `userId`, `dogId`, or setup identity from owner prose or telemetry.
- Acquire the owner-scoped setup advisory lock before setup mutations. For behavior and
  journal writes, acquire the dog-safety advisory lock before domain rows; never lock a
  setup row and then wait for dog safety.
- All cross-app payloads live in `packages/shared`; do not add web-only request types.
- All owner-facing copy must exist in both typed catalogs. Keep telemetry scalar and
  bounded; never record dog names, breed text, concern text, journal notes, or safety
  details.
- In scope: guided first-dog/additional-dog setup, three intents, real first actions,
  resume, skip/abandon, handoff, telemetry, accessibility, localization, and tests.
- Out of scope: new curriculum prose, LLM generation, reminders, navigation redesign,
  profile-schema relaxation, and forcing owners with an existing dog through setup.

## File Structure

### Shared contracts

- Create `packages/shared/src/guided-setup.ts`: setup enums, requests, DTOs, and tailored-action schemas.
- Create `packages/shared/src/guided-setup.test.ts`: contract and safety-confirmation tests.
- Modify `packages/shared/src/index.ts`: export guided-setup contracts.

### API persistence and reusable writes

- Modify `apps/api/src/db/schema.ts`: guided-setup enums, table, indexes, and relations.
- Create `apps/api/drizzle/0018_guided_setup.sql`: generated migration.
- Create `apps/api/drizzle/meta/0018_snapshot.json`: generated schema snapshot.
- Modify `apps/api/drizzle/meta/_journal.json`: generated migration journal entry.
- Create `apps/api/src/lib/dog-writes.ts`: transaction-aware dog creation.
- Create `apps/api/src/lib/behavior-concern-writes.ts`: concern and safety-signal creation.
- Create `apps/api/src/lib/journal-writes.ts`: validated journal creation.
- Create `apps/api/src/lib/training-template-writes.ts`: catalog goal and skill creation.
- Modify `apps/api/src/lib/focus.ts`: expose transaction-aware weekly-focus setter.
- Modify `apps/api/src/routes/dogs.ts`: call shared write helpers without changing public behavior.

### Guided-setup API

- Create `apps/api/src/routes/guided-setup.ts`: status, start, intent, action, skip, and abandon routes.
- Create `apps/api/src/routes/guided-setup.test.ts`: integration, isolation, idempotency, safety, and telemetry coverage.
- Modify `apps/api/src/app.ts`: mount `/api/guided-setup`.
- Modify `apps/api/src/telemetry/events.ts`: add server-only guided-setup event names.
- Modify `apps/api/src/routes/telemetry.test.ts`: verify bounded scalar properties.

### Web data and routing

- Create `apps/web/src/lib/guided-setup.ts`: typed queries, mutations, error parsing, and cache invalidation.
- Create `apps/web/src/lib/guided-setup.test.tsx`: hook request and invalidation tests.
- Create `apps/web/src/routes/guided-setup.tsx`: route-level state machine and completion handoff.
- Create `apps/web/src/routes/guided-setup.test.tsx`: route, resume, error, and accessibility tests.
- Create `apps/web/src/components/guided-setup/guided-setup-layout.tsx`: authenticated minimal chrome.
- Create `apps/web/src/components/guided-setup/setup-shell.tsx`: heading, step indicator, and focus management.
- Create `apps/web/src/components/guided-setup/dog-basics-step.tsx`: dog profile form.
- Create `apps/web/src/components/guided-setup/intent-step.tsx`: accessible intent radio group.
- Create `apps/web/src/components/guided-setup/abandon-setup-button.tsx`: explicit two-step exit.
- Create `apps/web/src/components/guided-setup/behavior-action-step.tsx`: concern and safety confirmation.
- Create `apps/web/src/components/guided-setup/training-action-step.tsx`: starter goal and suggestion handoff.
- Create `apps/web/src/components/guided-setup/progress-action-step.tsx`: daily check-in.
- Create `apps/web/src/components/guided-setup/completion-step.tsx`: saved result and workspace CTA.
- Modify `apps/web/src/components/training/suggestion-card.tsx`: add read-only setup preview mode.
- Modify `apps/web/src/components/training/suggestion-card.test.tsx`: protect interactive and preview modes.
- Modify `apps/web/src/main.tsx`: add `/my/setup` and `/my/setup/new`.
- Modify `apps/web/src/routes/overview.tsx`: redirect eligible or active setup owners.
- Modify `apps/web/src/routes/overview.test.tsx`: guard and redirect coverage.
- Modify `apps/web/src/components/onboarding/checklist.tsx`: hide while setup is active.
- Modify `apps/web/src/routes/dogs-list.tsx`: add explicit guided-setup entry for another dog.
- Modify `apps/web/src/i18n/en.ts`: English guided-setup copy.
- Modify `apps/web/src/i18n/es.ts`: matching Spanish catalog shape.

### End-to-end

- Modify `e2e/critical-owner-journey.spec.ts`: desktop behavior path plus phone training
  and resume smoke.
- Modify `playwright.config.ts`: route tagged journeys to their intended device projects.

---

### Task 1: Define Guided-Setup Contracts

**Files:**
- Create: `packages/shared/src/guided-setup.ts`
- Create: `packages/shared/src/guided-setup.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import {
  guidedSetupBehaviorActionSchema,
  guidedSetupIntentInputSchema,
  guidedSetupProgressActionSchema,
  guidedSetupTrainingActionSchema,
} from "./guided-setup";

describe("guided setup contracts", () => {
  const setupId = "00000000-0000-4000-8000-000000000001";

  it("accepts the three launch intents", () => {
    for (const intent of ["understand_behavior", "train_skill", "track_progress"]) {
      expect(guidedSetupIntentInputSchema.safeParse({ setupId, intent }).success).toBe(true);
    }
  });

  it("requires explicit confirmation for severe or signaled concerns", () => {
    expect(
      guidedSetupBehaviorActionSchema.safeParse({
        setupId,
        concern: "Snapped when approached",
        severity: "severe",
        safetySignal: null,
        safetyConfirmed: false,
      }).success,
    ).toBe(false);
    expect(
      guidedSetupBehaviorActionSchema.safeParse({
        setupId,
        concern: "Barked at the window",
        severity: "mild",
        safetySignal: null,
        safetyConfirmed: false,
      }).success,
    ).toBe(true);
  });

  it("uses the existing training and daily-check-in value shapes", () => {
    expect(
      guidedSetupTrainingActionSchema.safeParse({
        setupId,
        templateKey: "puppy-fundamentals",
        weekKey: "2026-08-10",
        timezoneOffsetMinutes: 420,
      }).success,
    ).toBe(true);
    expect(
      guidedSetupProgressActionSchema.safeParse({
        setupId,
        trend: "better",
        note: "Settled faster after dinner.",
      }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run:

```bash
pnpm --filter @turingcare/shared exec vitest run src/guided-setup.test.ts
```

Expected: FAIL because `./guided-setup` does not exist.

- [ ] **Step 3: Implement the contracts**

Create `packages/shared/src/guided-setup.ts`:

```ts
import { z } from "zod";
import { behaviorConcernSchema, dogProfileSchema } from "./dog";
import { journalDailyCheckInCreateSchema } from "./journal";

export const guidedSetupIntentValues = [
  "understand_behavior",
  "train_skill",
  "track_progress",
] as const;
export const guidedSetupStepValues = ["intent", "action"] as const;
export const guidedSetupCompletionReasonValues = [
  "first_action_completed",
  "skipped",
  "abandoned",
] as const;
export const guidedSetupActionTypeValues = ["behavior", "training", "progress"] as const;

export const guidedSetupStartSchema = dogProfileSchema.strict();
export const guidedSetupMutationSchema = z.object({
  setupId: z.string().uuid(),
}).strict();
export const guidedSetupIntentInputSchema = z.object({
  setupId: z.string().uuid(),
  intent: z.enum(guidedSetupIntentValues),
}).strict();

export const guidedSetupBehaviorActionSchema = behaviorConcernSchema
  .extend({ setupId: z.string().uuid(), safetyConfirmed: z.boolean() })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.severity === "severe" || value.safetySignal) && !value.safetyConfirmed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["safetyConfirmed"],
        message: "Safety confirmation is required",
      });
    }
  });

export const guidedSetupTrainingActionSchema = z.object({
  setupId: z.string().uuid(),
  templateKey: z.string().min(1).max(200),
  weekKey: z.string().date(),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840),
}).strict();

export const guidedSetupProgressActionSchema = journalDailyCheckInCreateSchema.omit({
  kind: true,
  occurredAt: true,
}).extend({ setupId: z.string().uuid() }).strict();

export type GuidedSetupIntent = (typeof guidedSetupIntentValues)[number];
export type GuidedSetupStep = (typeof guidedSetupStepValues)[number];
export type GuidedSetupCompletionReason =
  (typeof guidedSetupCompletionReasonValues)[number];
export type GuidedSetupActionType = (typeof guidedSetupActionTypeValues)[number];
export type GuidedSetupBehaviorAction = z.infer<typeof guidedSetupBehaviorActionSchema>;
export type GuidedSetupTrainingAction = z.infer<typeof guidedSetupTrainingActionSchema>;
export type GuidedSetupProgressAction = z.infer<typeof guidedSetupProgressActionSchema>;

export type GuidedSetupRecord = {
  id: string;
  dogId: string | null;
  dogName: string | null;
  currentStep: GuidedSetupStep;
  intent: GuidedSetupIntent | null;
  startedAt: string;
  completedAt: string | null;
  completionReason: GuidedSetupCompletionReason | null;
  firstActionType: GuidedSetupActionType | null;
  firstActionId: string | null;
};

export type GuidedSetupStatus = {
  active: GuidedSetupRecord | null;
  latest: GuidedSetupRecord | null;
  autoStartEligible: boolean;
};
```

Export it from `packages/shared/src/index.ts`:

```ts
export * from "./guided-setup";
```

- [ ] **Step 4: Run shared tests**

Run:

```bash
pnpm --filter @turingcare/shared exec vitest run src/guided-setup.test.ts src/dog.test.ts src/journal.test.ts
```

Expected: PASS with all selected tests.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/guided-setup.ts packages/shared/src/guided-setup.test.ts packages/shared/src/index.ts
git commit -m "feat: define guided setup contracts"
```

---

### Task 2: Persist Resumable Setup State

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/db/schema.test.ts`
- Create: `apps/api/drizzle/0018_guided_setup.sql`
- Create: `apps/api/drizzle/meta/0018_snapshot.json`
- Modify: `apps/api/drizzle/meta/_journal.json`

- [ ] **Step 1: Add a failing schema test**

Add to `apps/api/src/db/schema.test.ts`:

```ts
import { getTableConfig } from "drizzle-orm/pg-core";
import { guidedSetups } from "./schema";

it("enforces one active guided setup per owner", () => {
  const config = getTableConfig(guidedSetups);
  expect(config.indexes.some((index) => index.config.name === "guided_setups_one_active_owner")).toBe(
    true,
  );
});
```

- [ ] **Step 2: Run the schema test**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/db/schema.test.ts
```

Expected: FAIL because `guidedSetups` is not exported.

- [ ] **Step 3: Add enums and table**

Add domain enums near the existing domain enums in `apps/api/src/db/schema.ts`:

```ts
export const guidedSetupIntentEnum = pgEnum("guided_setup_intent", [
  "understand_behavior",
  "train_skill",
  "track_progress",
]);
export const guidedSetupStepEnum = pgEnum("guided_setup_step", ["intent", "action"]);
export const guidedSetupCompletionReasonEnum = pgEnum("guided_setup_completion_reason", [
  "first_action_completed",
  "skipped",
  "abandoned",
]);
export const guidedSetupActionTypeEnum = pgEnum("guided_setup_action_type", [
  "behavior",
  "training",
  "progress",
]);
```

Add the table after `dogs`:

```ts
export const guidedSetups = pgTable(
  "guided_setups",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dogId: uuid("dog_id").references(() => dogs.id, { onDelete: "set null" }),
    currentStep: guidedSetupStepEnum("current_step").notNull().default("intent"),
    intent: guidedSetupIntentEnum("intent"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completionReason: guidedSetupCompletionReasonEnum("completion_reason"),
    firstActionType: guidedSetupActionTypeEnum("first_action_type"),
    firstActionId: uuid("first_action_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("guided_setups_dog_unique").on(t.dogId),
    uniqueIndex("guided_setups_one_active_owner")
      .on(t.userId)
      .where(sql`${t.completedAt} is null`),
    index("guided_setups_user_started_idx").on(t.userId, t.startedAt),
    check(
      "guided_setups_completion_consistent",
      sql`(${t.completedAt} is null and ${t.completionReason} is null) or
          (${t.completedAt} is not null and ${t.completionReason} is not null)`,
    ),
    check(
      "guided_setups_active_dog_required",
      sql`${t.completedAt} is not null or ${t.dogId} is not null`,
    ),
  ],
);
```

Add relations:

```ts
export const guidedSetupsRelations = relations(guidedSetups, ({ one }) => ({
  owner: one(user, { fields: [guidedSetups.userId], references: [user.id] }),
  dog: one(dogs, { fields: [guidedSetups.dogId], references: [dogs.id] }),
}));
```

- [ ] **Step 4: Generate and inspect the migration**

Run:

```bash
pnpm --filter @turingcare/api exec drizzle-kit generate --name guided_setup
```

Expected: creates `apps/api/drizzle/0018_guided_setup.sql`, snapshot `0018`, and journal entry.

Append the repository's deny-all Data API posture to the generated SQL:

```sql
ALTER TABLE "guided_setups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', 'guided_setups', rol);
    END IF;
  END LOOP;
END
$$;
```

Inspect the SQL and confirm it creates all four enums, the table, foreign keys with
`ON DELETE SET NULL`, both checks, dog uniqueness, active-owner partial uniqueness,
user/start index, RLS enablement, and guarded PostgREST-role revocation. Do not hand-edit
the generated snapshot.

- [ ] **Step 5: Run schema and type checks**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/db/schema.test.ts
pnpm --filter @turingcare/api typecheck
```

Expected: both commands PASS.

- [ ] **Step 6: Prepare the API integration-test database**

Run from the worktree root:

```bash
[ -f .env ] || cp .env.example .env
docker compose up -d --wait
set -a && . ./.env && set +a
pnpm --filter @turingcare/api db:migrate
```

Expected: Postgres is healthy and migration `0018_guided_setup` is applied before any
guided-setup integration test runs.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/src/db/schema.test.ts apps/api/drizzle
git commit -m "feat: persist guided setup progress"
```

---

### Task 3: Extract Transaction-Aware Domain Writes

**Files:**
- Create: `apps/api/src/lib/dog-writes.ts`
- Create: `apps/api/src/lib/behavior-concern-writes.ts`
- Create: `apps/api/src/lib/journal-writes.ts`
- Create: `apps/api/src/lib/training-template-writes.ts`
- Modify: `apps/api/src/lib/focus.ts`
- Modify: `apps/api/src/routes/dogs.ts`
- Test: `apps/api/src/routes/dogs.test.ts`
- Test: `apps/api/src/routes/journal.test.ts`
- Test: `apps/api/src/routes/focus.test.ts`

- [ ] **Step 1: Add route regression assertions**

Extend the existing route tests to assert:

```ts
expect(createDogResponse.status).toBe(201);
expect(createConcernResponse.status).toBe(201);
expect(createJournalResponse.status).toBe(201);
expect(applyTemplateResponse.status).toBe(201);
expect(setFocusResponse.status).toBe(201);
```

Keep the existing response-shape, safety-signal, owner-isolation, and telemetry
assertions in those suites unchanged.

Add a dog-delete regression: deleting a dog linked to an active setup returns
`409 active_guided_setup`; deleting a dog linked only to a completed setup succeeds and
leaves the historical setup row with `dogId = null`.

- [ ] **Step 2: Run the focused route suites before refactoring**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run \
  src/routes/dogs.test.ts src/routes/journal.test.ts src/routes/focus.test.ts
```

Expected: PASS. This is the behavior-preservation baseline.

- [ ] **Step 3: Add a shared transaction type and dog writer**

Create `apps/api/src/lib/dog-writes.ts`:

```ts
import type { DogProfile } from "@turingcare/shared";
import { db } from "../db";
import { dogs } from "../db/schema";
import type { TransactionType } from "./safety-lock";

export type DbExecutor = typeof db | TransactionType;

export async function createDog(
  executor: DbExecutor,
  userId: string,
  input: DogProfile,
) {
  const { weightLbs, ...body } = input;
  const [dog] = await executor
    .insert(dogs)
    .values({
      ...body,
      ownerId: userId,
      weightLbs: weightLbs == null ? weightLbs : String(weightLbs),
    })
    .returning();
  if (!dog) throw new Error("failed to create dog");
  return dog;
}
```

- [ ] **Step 4: Extract concern, journal, template, and focus writers**

Implement these exact public signatures:

```ts
export async function createBehaviorConcern(
  executor: TransactionType,
  dogId: string,
  input: BehaviorConcernInput,
): Promise<{ concern: typeof behaviorConcerns.$inferSelect; reportedSignals: string[] }>;

export async function createJournalEntry(
  executor: TransactionType,
  dogId: string,
  input: JournalEntryCreateInput,
): Promise<typeof journalEntries.$inferSelect>;

export async function applyTrainingTemplate(
  executor: TransactionType,
  dogId: string,
  templateKey: string,
): Promise<{
  goal: typeof trainingGoals.$inferSelect;
  skills: (typeof trainingSkills.$inferSelect)[];
} | null>;

export async function setWeeklyFocus(
  executor: TransactionType,
  dogId: string,
  skillId: string,
  weekKey: string,
): Promise<
  { kind: "unchanged" | "created" | "replaced"; focus: typeof weeklyFocus.$inferSelect }
>;
```

Import and reuse `TransactionType` from `apps/api/src/lib/safety-lock.ts`; do not define a
second transaction alias. `createBehaviorConcern` must call
`lockDogSafety(executor, dogId)` before writing the
concern and optional signal. `createJournalEntry` must also call `lockDogSafety`, parse
`occurredAt`, throw a typed `InvalidJournalOccurredAtError`, and write the same nullable
fields as the current route.
`applyTrainingTemplate` returns `null` for an unknown key. `setWeeklyFocus` acquires the
same advisory locks currently used by `withFocusWeekLock`, then upserts the one focus row;
the unchanged branch returns the existing focus row.

- [ ] **Step 5: Refactor existing routes to call the helpers**

Keep ownership checks and response codes in `apps/api/src/routes/dogs.ts`. For example:

```ts
const dog = await createDog(db, c.get("userId"), c.req.valid("json"));
await recordEvent("dog.created", { userId: c.get("userId") });
return c.json({ dog }, 201);
```

Use `db.transaction()` around concern, journal, template, and focus helpers. Keep
telemetry after commit. Preserve `404` before payload-dependent work.
Catch `InvalidJournalOccurredAtError` in the journal route and return the existing
`invalidJournalField("occurredAt", "Invalid date")` 400 body from
`POST /api/dogs/:id/journal` in `apps/api/src/routes/dogs.ts`. Before deleting a dog,
query for an incomplete linked setup and return `{ error: "active_guided_setup" }` with
`409` when one exists. Also catch Postgres check-constraint
`guided_setups_active_dog_required` from the delete and map it to the same `409`, covering
a concurrent state change between the guard query and delete.

- [ ] **Step 6: Run focused route suites**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run \
  src/routes/dogs.test.ts src/routes/journal.test.ts src/routes/focus.test.ts \
  src/routes/telemetry.test.ts
```

Expected: PASS with no response or telemetry regressions.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/dog-writes.ts apps/api/src/lib/behavior-concern-writes.ts \
  apps/api/src/lib/journal-writes.ts apps/api/src/lib/training-template-writes.ts \
  apps/api/src/lib/focus.ts apps/api/src/routes/dogs.ts \
  apps/api/src/routes/dogs.test.ts apps/api/src/routes/journal.test.ts \
  apps/api/src/routes/focus.test.ts
git commit -m "refactor: share guided setup domain writes"
```

---

### Task 4: Add Setup Status, Start, Intent, Skip, and Abandon APIs

**Files:**
- Create: `apps/api/src/routes/guided-setup.ts`
- Create: `apps/api/src/routes/guided-setup.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/telemetry/events.ts`

- [ ] **Step 1: Write failing lifecycle integration tests**

Create `apps/api/src/routes/guided-setup.test.ts` with real database users:

```ts
it("starts, resumes, selects intent, skips, and preserves the dog", async () => {
  const user = await createTestUser();
  const started = await app.request("/api/guided-setup", {
    method: "POST",
    headers: user.authHeaders,
    body: JSON.stringify(validDog),
  });
  expect(started.status).toBe(201);
  const setup = (await started.json()).setup;

  const resumed = await app.request("/api/guided-setup", { headers: user.authHeaders });
  expect((await resumed.json()).active.id).toBe(setup.id);

  const intent = await app.request("/api/guided-setup/intent", {
    method: "PUT",
    headers: user.authHeaders,
    body: JSON.stringify({ setupId: setup.id, intent: "track_progress" }),
  });
  expect(intent.status).toBe(200);

  const skipped = await app.request("/api/guided-setup/skip", {
    method: "POST",
    headers: user.authHeaders,
    body: JSON.stringify({ setupId: setup.id }),
  });
  expect((await skipped.json()).setup.completionReason).toBe("skipped");
});
```

Add tests for:

- `autoStartEligible: true` only when the owner has no dog and no prior setup row;
- start is atomic and emits no setup row if dog validation fails;
- request bodies with extra identity fields such as `userId` or `dogId` return `400`;
- setup mutations require a valid `setupId`; unknown and cross-owner IDs return `404`;
- retries against a completed setup cannot mutate a newer active setup;
- a second active start returns `409 active_setup_exists`;
- intent cannot be saved before start;
- invalid or cross-owner setup IDs are never accepted from the client;
- abandon keeps the dog and records `abandoned`;
- skip creates no concern, journal, goal, skill, focus, or practice row.

- [ ] **Step 2: Run the lifecycle tests**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/routes/guided-setup.test.ts
```

Expected: FAIL because the route is not mounted.

- [ ] **Step 3: Implement status loading and DTO mapping**

In `apps/api/src/routes/guided-setup.ts`, add:

```ts
async function loadStatus(userId: string): Promise<GuidedSetupStatus> {
  const rows = await db
    .select({ setup: guidedSetups, dogName: dogs.name })
    .from(guidedSetups)
    .leftJoin(dogs, eq(guidedSetups.dogId, dogs.id))
    .where(eq(guidedSetups.userId, userId))
    .orderBy(desc(guidedSetups.startedAt));
  const activeRow = rows.find(({ setup }) => setup.completedAt === null) ?? null;
  const dogCountRows = await db
    .select({ value: count() })
    .from(dogs)
    .where(eq(dogs.ownerId, userId));
  return {
    active: activeRow ? toSetupDto(activeRow) : null,
    latest: rows[0] ? toSetupDto(rows[0]) : null,
    autoStartEligible:
      Number(dogCountRows[0]?.value ?? 0) === 0 && rows.length === 0 && !activeRow,
  };
}
```

Convert timestamps with `.toISOString()` and never return `userId`. If an active row has
`dogId === null`, fail loudly because the database check should make that state
impossible; completed historical rows may return null dog fields.

- [ ] **Step 4: Implement lifecycle routes**

Use this route surface:

```ts
export const guidedSetupApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/", async (c) => c.json(await loadStatus(c.get("userId"))))
  .post("/", zValidator("json", guidedSetupStartSchema), startSetup)
  .put("/intent", zValidator("json", guidedSetupIntentInputSchema), saveIntent)
  .post("/skip", zValidator("json", guidedSetupMutationSchema), skipSetup)
  .post("/abandon", zValidator("json", guidedSetupMutationSchema), abandonSetup);
```

For `startSetup`, take a transaction-scoped advisory lock:

```ts
await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`guided-setup:${userId}`}))`);
```

Check for an active row under the lock, call `createDog(tx, userId, input)`, insert the
setup, and return `201`. For every later mutation, load the requested `setupId` scoped by
`userId`; never substitute the owner's current active setup. Save intent only when the
requested setup is incomplete and set `currentStep: "action"`. Skip and abandon set
`completedAt`, `completionReason`, and `updatedAt` while leaving action fields null.

- [ ] **Step 5: Add server-only event names and route telemetry**

Add to `KNOWN_EVENTS` but not `CLIENT_EVENTS`:

```ts
"guided_setup.started",
"guided_setup.dog_basics_completed",
"guided_setup.intent_selected",
"guided_setup.first_action_completed",
"guided_setup.first_action_skipped",
"guided_setup.completed",
```

Emit only bounded properties:

```ts
props: { intent, step: "action", completionReason: "skipped" }
```

Do not include names, breed, concern text, journal text, or safety details.

- [ ] **Step 6: Mount and test**

Add to `apps/api/src/app.ts`:

```ts
import { guidedSetupApp } from "./routes/guided-setup";
```

Chain `.route("/api/guided-setup", guidedSetupApp)` immediately after the existing
`.route("/api/onboarding", onboardingApp)` call.

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/routes/guided-setup.test.ts
```

Expected: lifecycle and isolation tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/routes/guided-setup.ts \
  apps/api/src/routes/guided-setup.test.ts apps/api/src/telemetry/events.ts
git commit -m "feat: add guided setup lifecycle api"
```

---

### Task 5: Add Atomic Behavior and Progress Actions

**Files:**
- Modify: `apps/api/src/routes/guided-setup.ts`
- Modify: `apps/api/src/routes/guided-setup.test.ts`

- [ ] **Step 1: Write failing action tests**

Add integration tests:

```ts
it("creates one severe concern and completes setup atomically", async () => {
  const response = await app.request("/api/guided-setup/action/behavior", {
    method: "POST",
    headers,
    body: JSON.stringify({
      setupId,
      concern: "Snapped when touched",
      severity: "severe",
      safetySignal: null,
      safetyConfirmed: true,
    }),
  });
  expect(response.status).toBe(201);
  expect((await response.json()).setup.firstActionType).toBe("behavior");
});

it("creates one daily check-in and returns it on a duplicate submit", async () => {
  const body = JSON.stringify({
    setupId,
    trend: "better",
    note: "Settled after dinner.",
  });
  const first = await app.request("/api/guided-setup/action/progress", {
    method: "POST",
    headers,
    body,
  });
  const second = await app.request("/api/guided-setup/action/progress", {
    method: "POST",
    headers,
    body,
  });
  expect(first.status).toBe(201);
  expect(second.status).toBe(200);
  expect((await second.json()).entry.id).toBe((await first.json()).entry.id);
});
```

Also assert:

- intent mismatch returns `409 intent_mismatch`;
- missing safety confirmation returns `400`;
- safety signal insertion and suppression invariants match concern routes;
- transaction rollback leaves setup active when the domain writer throws;
- telemetry props contain action type and intent but no prose.
- a deleted concern replay returns `200` with `{ concern: null, actionDeleted: true }`
  after the normal owner concern-delete route, without a duplicate concern or
  replay telemetry;
- a deleted journal replay returns `200` with `{ entry: null, actionDeleted: true }`
  after the normal owner journal-delete route, without a duplicate entry or
  replay telemetry;
- deleting a completed action's dog cascades its domain row, preserves completed
  setup history with `dogId` and `dogName` set to `null`, and returns the same
  tombstone contract on replay without telemetry.

- [ ] **Step 2: Run the action tests**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/routes/guided-setup.test.ts \
  -t "behavior|progress"
```

Expected: FAIL with route not found.

- [ ] **Step 3: Reuse serialized setup lookup helpers**

```ts
async function lockSetupFlow(tx: TransactionType, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`guided-setup:${userId}`}))`);
}
```

Reuse Task 4's existing `loadOwnedSetup(tx, userId, input.setupId)` and
`requireActiveSetupDog(row)` helpers rather than adding a parallel lookup. Load only the
setup named by the request. Return its referenced domain record for idempotent repeat
requests only when its action type matches the endpoint.
The owner-scoped advisory lock serializes duplicate setup submissions without locking the
setup row before the established dog-safety lock order.
If the requested setup was skipped, abandoned, or completed with a different action type,
return `409 setup_already_completed`.

Widen Task 4's `completeSetup` helper to take a discriminated completion object:

```ts
type SetupCompletion =
  | { reason: "skipped" | "abandoned" }
  | {
      reason: "first_action_completed";
      actionType: GuidedSetupActionType;
      actionId: string;
    };
```

For first actions, persist `firstActionType` and `firstActionId`; for skip/abandon, keep
both fields null. Existing lifecycle callers pass `{ reason: "skipped" }` or
`{ reason: "abandoned" }`.

Every successful behavior and progress action response, including a `200` replay,
uses a discriminated shape:

```ts
// behavior
{ setup, concern, actionDeleted: false }
{ setup, concern: null, actionDeleted: true }

// progress
{ setup, entry, actionDeleted: false }
{ setup, entry: null, actionDeleted: true }
```

When a completed setup's `firstActionType` and completion reason match the
endpoint but the referenced concern or journal row is gone, return the deleted
tombstone with `200`. Do not snapshot or recreate the deleted row, include its
prose, or emit telemetry on replay. Skipped, abandoned, and different-action
replays remain `409`. Future hooks and UI must check `actionDeleted` before
rendering `concern` or `entry`.

- [ ] **Step 4: Implement both action routes**

Add:

```ts
.post(
  "/action/behavior",
  zValidator("json", guidedSetupBehaviorActionSchema),
  completeBehaviorAction,
)
.post(
  "/action/progress",
  zValidator("json", guidedSetupProgressActionSchema),
  completeProgressAction,
)
```

Inside one transaction:

1. acquire `lockSetupFlow` and load the owner-scoped setup named by `input.setupId`;
2. verify the saved intent;
3. call `createBehaviorConcern` or `createJournalEntry`, which acquires the dog-safety
   lock before writing domain rows;
4. call the widened `completeSetup` with the active setup and
   `{ reason: "first_action_completed", actionType, actionId }`;
5. return the domain row and setup DTO.

For a completed setup, resolve the saved action row before deciding the replay
status. A present row returns `actionDeleted: false`; a missing row returns the
matching `actionDeleted: true` tombstone and no telemetry. Keep the existing
owner-scoped setup lookup and advisory-lock ordering unchanged.

For progress, call:

```ts
createJournalEntry(tx, setup.dogId, {
  kind: "daily_checkin",
  trend: input.trend,
  note: input.note,
});
```

Emit domain telemetry and guided-setup telemetry only after commit.

- [ ] **Step 5: Run behavior and progress tests**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/routes/guided-setup.test.ts \
  src/routes/suggestion.test.ts
```

Expected: PASS, including safety suppression coverage.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/guided-setup.ts apps/api/src/routes/guided-setup.test.ts
git commit -m "feat: complete guided behavior and progress actions"
```

---

### Task 6: Add Atomic Training Action and Suggestion Handoff

**Files:**
- Modify: `apps/api/src/routes/guided-setup.ts`
- Modify: `apps/api/src/routes/guided-setup.test.ts`

- [ ] **Step 1: Write failing training tests**

```ts
it("applies a starter template, focuses its first skill, and returns a suggestion", async () => {
  const response = await app.request("/api/guided-setup/action/training", {
    method: "POST",
    headers,
    body: JSON.stringify({
      setupId,
      templateKey: "puppy-fundamentals",
      weekKey: "2026-08-10",
      timezoneOffsetMinutes: 420,
    }),
  });
  expect(response.status).toBe(201);
  const body = await response.json();
  expect(body.goal.catalogGoalKey).toBe("puppy-fundamentals");
  expect(body.focus.skillId).toBe(body.skills[0].id);
  expect(body.suggestion.type).toBe("exercise");
});
```

Add tests for:

- invalid template returns `400 invalid_template` with setup still active;
- historical `weekKey` returns `409 historical_suggestion_unavailable`;
- safety-suppressed dogs return the normal safety suggestion, never an exercise;
- duplicate submit returns the existing goal, skills, focus, and current suggestion;
- no duplicate goals or focus rows are created;
- cross-owner state cannot be addressed.
- a deleted goal or completed dog returns the `200` training tombstone
  `{ setup, goal: null, skills: [], focus: null, suggestion: null, actionDeleted: true }`
  without recreating rows or emitting replay telemetry;
- stale retries use the original completed setup rather than a newer active setup;
- telemetry contains only the bounded normal template/focus and guided completion props.

- [ ] **Step 2: Run training tests**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/routes/guided-setup.test.ts -t training
```

Expected: FAIL with route not found.

- [ ] **Step 3: Implement the training transaction**

Add the route:

```ts
.post(
  "/action/training",
  zValidator("json", guidedSetupTrainingActionSchema),
  completeTrainingAction,
)
```

Before opening the transaction, reject a non-current week:

```ts
if (input.weekKey !== currentWeekKey(new Date(), input.timezoneOffsetMinutes)) {
  return c.json({ error: "historical_suggestion_unavailable" } as const, 409);
}
```

Inside one transaction:

```ts
const applied = await applyTrainingTemplate(tx, setup.dogId, input.templateKey);
if (!applied) return { kind: "invalid_template" as const };
const orderedSkills = [...applied.skills].sort((a, b) => a.position - b.position);
const firstSkill = orderedSkills[0];
if (!firstSkill) throw new Error("template created no skills");
const focusResult = await setWeeklyFocus(tx, setup.dogId, firstSkill.id, input.weekKey);
await completeSetup(tx, active, {
  reason: "first_action_completed",
  actionType: "training",
  actionId: applied.goal.id,
});
return {
  kind: "created" as const,
  goal: applied.goal,
  skills: orderedSkills,
  focus: focusResult.focus,
};
```

After commit, call `loadSuggestion()` through its normal current-week path and include the
result in the response. On duplicate submission, load the goal by `firstActionId`, its
ordered skills, the matching focus, and a fresh suggestion. A matching completed training
setup whose goal/domain graph is missing returns the same typed `actionDeleted: true`
tombstone contract as behavior and progress; do not snapshot or recreate training data.
Future web consumers must branch on `actionDeleted` before rendering the goal, skills,
focus, or suggestion.

- [ ] **Step 4: Emit existing and setup telemetry**

After commit:

```ts
await recordEvent("training.goal_added", {
  userId,
  props: { source: "template" },
});
await recordEvent("focus.week_set", {
  userId,
  props: { replaced: false },
});
await recordEvent("guided_setup.first_action_completed", {
  userId,
  props: { intent: "train_skill", actionType: "training" },
});
await recordEvent("guided_setup.completed", {
  userId,
  props: {
    intent: "train_skill",
    actionType: "training",
    completionReason: "first_action_completed",
  },
});
```

- [ ] **Step 5: Run training and safety suites**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run \
  src/routes/guided-setup.test.ts src/routes/focus.test.ts src/routes/suggestion.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/guided-setup.ts apps/api/src/routes/guided-setup.test.ts
git commit -m "feat: complete guided training action"
```

---

### Task 7: Add Typed Web Data Hooks

**Files:**
- Create: `apps/web/src/lib/guided-setup.ts`
- Create: `apps/web/src/lib/guided-setup.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Mock `@/lib/api` and test:

```ts
expect(api.api["guided-setup"].$get).toHaveBeenCalled();
expect(api.api["guided-setup"].intent.$put).toHaveBeenCalledWith({
  json: { setupId, intent: "train_skill" },
});
expect(api.api["guided-setup"].action.training.$post).toHaveBeenCalledWith({
  json: {
    setupId,
    templateKey: "puppy-fundamentals",
    weekKey: "2026-08-10",
    timezoneOffsetMinutes: 420,
  },
});
```

Assert successful actions invalidate:

```ts
["guided-setup"], ["dogs"], ["dogs-overview"], ["overview"], ["onboarding"],
["journal"], ["dog-journal", dogId], ["progress", dogId],
["focus", dogId, weekKey], ["suggestion", dogId, weekKey]
```

- [ ] **Step 2: Run the hook tests**

Run:

```bash
pnpm --filter @turingcare/web exec vitest run src/lib/guided-setup.test.tsx
```

Expected: FAIL because the hook module does not exist.

- [ ] **Step 3: Implement query and mutations**

Create:

```ts
export const guidedSetupKey = ["guided-setup"] as const;

export function useGuidedSetup() {
  return useQuery({
    queryKey: guidedSetupKey,
    queryFn: async (): Promise<GuidedSetupStatus> => {
      const response = await api.api["guided-setup"].$get();
      if (!response.ok) throw new Error("load_failed");
      return response.json();
    },
  });
}
```

Add `useStartGuidedSetup`, `useSaveGuidedSetupIntent`, `useCompleteBehaviorSetup`,
`useCompleteTrainingSetup`, `useCompleteProgressSetup`, `useSkipGuidedSetup`, and
`useAbandonGuidedSetup`. Every mutation after start takes the active `setupId` and sends
it in the typed request payload. Parse structured errors:

```ts
async function requireOk(response: Response, fallback: string) {
  if (response.ok) return response.json();
  const body = (await response.json()) as { error?: string };
  throw new Error(body.error ?? fallback);
}
```

Centralize invalidation in:

```ts
async function invalidateSetupCaches(
  queryClient: QueryClient,
  dogId?: string,
  weekKey?: string,
) {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: guidedSetupKey }),
    queryClient.invalidateQueries({ queryKey: ["dogs"] }),
    queryClient.invalidateQueries({ queryKey: ["dogs-overview"] }),
    queryClient.invalidateQueries({ queryKey: ["overview"] }),
    queryClient.invalidateQueries({ queryKey: ["onboarding"] }),
    queryClient.invalidateQueries({ queryKey: ["journal"] }),
  ];
  if (dogId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["dog-journal", dogId] }),
      queryClient.invalidateQueries({ queryKey: ["progress", dogId] }),
    );
  }
  if (dogId && weekKey) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["focus", dogId, weekKey] }),
      queryClient.invalidateQueries({ queryKey: ["suggestion", dogId, weekKey] }),
    );
  }
  await Promise.all(invalidations);
}
```

- [ ] **Step 4: Run hook tests and web typecheck**

Run:

```bash
pnpm --filter @turingcare/web exec vitest run src/lib/guided-setup.test.tsx
pnpm --filter @turingcare/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/guided-setup.ts apps/web/src/lib/guided-setup.test.tsx
git commit -m "feat: add guided setup web hooks"
```

---

### Task 8: Build the Setup Shell, Dog Basics, and Intent Steps

**Files:**
- Create: `apps/web/src/components/guided-setup/guided-setup-layout.tsx`
- Create: `apps/web/src/components/guided-setup/setup-shell.tsx`
- Create: `apps/web/src/components/guided-setup/dog-basics-step.tsx`
- Create: `apps/web/src/components/guided-setup/intent-step.tsx`
- Create: `apps/web/src/components/guided-setup/abandon-setup-button.tsx`
- Create: `apps/web/src/routes/guided-setup.tsx`
- Create: `apps/web/src/routes/guided-setup.test.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/routes/overview.tsx`
- Modify: `apps/web/src/routes/overview.test.tsx`
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Write failing route tests**

Cover:

```tsx
it("renders dog basics for an eligible owner", async () => {
  mockStatus({ active: null, latest: null, autoStartEligible: true });
  renderRoute("/my/setup");
  expect(await screen.findByRole("heading", { name: "Tell us about your dog" })).toBeVisible();
});

it("resumes at intent without recreating the dog", async () => {
  mockStatus({ active: setupAt("intent"), latest: setupAt("intent"), autoStartEligible: false });
  renderRoute("/my/setup");
  expect(await screen.findByRole("radiogroup", { name: /what would help most/i })).toBeVisible();
});

it("redirects a dog-less owner from overview into setup", async () => {
  mockStatus({ active: null, latest: null, autoStartEligible: true });
  renderRoute("/my");
  expect(await screen.findByRole("heading", { name: "Tell us about your dog" })).toBeVisible();
});
```

Also test loading, load failure, Spanish strings, visible labels, keyboard radio selection,
step announcement, retained form values after a rejected mutation, and abandonment from
both intent and action steps.

- [ ] **Step 2: Run the route tests**

Run:

```bash
pnpm --filter @turingcare/web exec vitest run src/routes/guided-setup.test.tsx
```

Expected: FAIL because the route and components do not exist.

- [ ] **Step 3: Build the setup shell**

`SetupShell` accepts:

```ts
type SetupShellProps = {
  step: 1 | 2 | 3;
  title: string;
  description?: string;
  children: ReactNode;
};
```

Render an `<h1 tabIndex={-1}>` and a visible progress string:

```tsx
<p>{t("guidedSetup.stepLabel", { step, total: 3 })}</p>
```

Focus the heading on step change. Use only reduced-motion-safe CSS transitions.

- [ ] **Step 4: Build dog basics using the existing profile contract**

Use `useForm<DogProfile>` with `zodResolver(dogProfileSchema)`. Render required name,
size, sex, source, and vaccine-stage controls plus optional breed. Submit through
`useStartGuidedSetup`. Do not send guessed date, weight, adoption date, or notes.

Use the same enum values and existing translation keys as `DogForm`:
`small|medium|large|giant`, `male|female`, `breeder|rescue|shelter|other`, and
`in_progress|complete|unknown`.

- [ ] **Step 5: Build the intent radio group**

Render a `<fieldset>` with three radio inputs:

```tsx
const intents: GuidedSetupIntent[] = [
  "understand_behavior",
  "train_skill",
  "track_progress",
];
```

Save through `useSaveGuidedSetupIntent` and keep the selected value after errors.

- [ ] **Step 6: Add explicit abandon control**

Create `AbandonSetupButton` with an initial **Exit setup** action and a second explicit
confirmation. On confirm, call `useAbandonGuidedSetup`; then navigate to
`/my/dogs/:dogId` when the active setup still has a dog, otherwise `/my`. Render it on
Steps 2 and 3, never Step 1. A failed abandon keeps the owner on the current step and
shows the localized structured error.

- [ ] **Step 7: Add authenticated minimal layout, route composition, and overview guard**

Create `GuidedSetupLayout` with a compact header containing `BrandMark`,
`LanguageToggle`, and sign-out, followed by `VerifyEmailBanner` and `<Outlet />`. It must
not render the main navigation rail or `TuringCompanion`.

In `apps/web/src/main.tsx`, place setup routes in their own authenticated group before
the `AppShell` group:

```tsx
<Route
  element={
    <RequireAuth>
      <GuidedSetupLayout />
    </RequireAuth>
  }
>
  <Route path="/my/setup" element={<GuidedSetup allowNewDog={false} />} />
  <Route path="/my/setup/new" element={<GuidedSetup allowNewDog />} />
</Route>
```

In `Overview`, load both overview and guided setup. While either is loading, show the
existing loading copy. Redirect with `<Navigate to="/my/setup" replace />` when
`status.autoStartEligible || status.active`.

In `GuidedSetup`, when there is no active setup:

- render `CompletionStep` first when route-local completion state exists; action and skip
  mutation success handlers set that state from the server response before cache
  invalidation can refetch status;
- render dog basics when `autoStartEligible` or `allowNewDog` is true;
- redirect to `/my` when `allowNewDog` is false, including both a latest completed setup
  and an existing owner with no setup history.

Refreshing after completion intentionally clears route-local handoff state and redirects
to the normal owner experience, matching the completed-setup guard.

- [ ] **Step 8: Add English and Spanish copy**

Add matching `guidedSetup` catalog objects for:

- step labels and headings;
- dog field guidance;
- all three intent titles and descriptions;
- save, retry, back, skip, abandon, and loading states;
- structured API errors.

Do not use English literals in components.

- [ ] **Step 9: Run route tests and typecheck**

Run:

```bash
pnpm --filter @turingcare/web exec vitest run \
  src/routes/guided-setup.test.tsx src/routes/overview.test.tsx
pnpm --filter @turingcare/web typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/guided-setup apps/web/src/routes/guided-setup.tsx \
  apps/web/src/routes/guided-setup.test.tsx apps/web/src/main.tsx \
  apps/web/src/routes/overview.tsx apps/web/src/routes/overview.test.tsx \
  apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat: add guided setup basics and intent"
```

---

### Task 9: Build Behavior and Progress First Actions

**Files:**
- Create: `apps/web/src/components/guided-setup/behavior-action-step.tsx`
- Create: `apps/web/src/components/guided-setup/progress-action-step.tsx`
- Modify: `apps/web/src/routes/guided-setup.tsx`
- Modify: `apps/web/src/routes/guided-setup.test.tsx`
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Write failing component-route tests**

Test:

```tsx
expect(screen.getByRole("textbox", { name: "What happened?" })).toBeVisible();
expect(screen.getByRole("combobox", { name: "Concern level" })).toBeVisible();
expect(screen.getByRole("checkbox", { name: /confirm/i })).not.toBeChecked();
```

Assert severe and signaled concerns require confirmation; mild concerns do not. Assert
the progress path renders a three-option radio group and required note. For both paths,
double-clicking submit calls the mutation once, and a rejected mutation preserves values.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm --filter @turingcare/web exec vitest run src/routes/guided-setup.test.tsx \
  -t "behavior|progress"
```

Expected: FAIL because action components do not exist.

- [ ] **Step 3: Implement behavior action**

Use `guidedSetupBehaviorActionSchema` with React Hook Form. Show safety confirmation only
when severity is severe or a signal is selected. Render the options from
`SAFETY_SIGNAL_KEYS` in `apps/web/src/lib/practice-options.ts`.
Seed `setupId: setup.id` in `defaultValues`; it is a request binding, not an editable
form field.

On success, pass the returned setup and concern to route state. Do not render or cache
owner prose outside the form and normal dog query.

- [ ] **Step 4: Implement progress action**

Use `guidedSetupProgressActionSchema`. Render `better`, `same`, and `harder` as a real
radio group and require the short note. Seed `setupId: setup.id` in `defaultValues`
without rendering an editable field. Submit through `useCompleteProgressSetup`.

- [ ] **Step 5: Wire intent dispatch**

In `GuidedSetup`:

```tsx
if (active.currentStep === "action" && active.intent === "understand_behavior") {
  return <BehaviorActionStep setup={active} onCompleted={setCompletion} />;
}
if (active.currentStep === "action" && active.intent === "track_progress") {
  return <ProgressActionStep setup={active} onCompleted={setCompletion} />;
}
```

Back returns to intent only before a domain action succeeds. Skip calls the server and
goes directly to completion.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter @turingcare/web exec vitest run src/routes/guided-setup.test.tsx
```

Expected: behavior and progress cases PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/guided-setup apps/web/src/routes/guided-setup.tsx \
  apps/web/src/routes/guided-setup.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat: add guided behavior and progress actions"
```

---

### Task 10: Build Training First Action and Safe Suggestion Display

**Files:**
- Create: `apps/web/src/components/guided-setup/training-action-step.tsx`
- Modify: `apps/web/src/routes/guided-setup.tsx`
- Modify: `apps/web/src/routes/guided-setup.test.tsx`
- Modify: `apps/web/src/components/training/suggestion-card.tsx`
- Modify: `apps/web/src/components/training/suggestion-card.test.tsx`
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Write failing training UI tests**

Cover:

- only curated starter templates are shown;
- applying sends current owner-local `weekKey` and `getTimezoneOffset()`;
- submit is disabled while pending;
- exercise response renders primary and easier fallback;
- safety response renders referral guidance and no exercise text;
- failed, absent, historical, or dismissed suggestion never renders exercise-shaped fallback;
- retry retains the selected template.

Use the real `TrainingSuggestion` fixtures from existing suggestion component tests.

- [ ] **Step 2: Run training UI tests**

Run:

```bash
pnpm --filter @turingcare/web exec vitest run src/routes/guided-setup.test.tsx -t training
```

Expected: FAIL because the training action component does not exist.

- [ ] **Step 3: Implement starter template selection**

Load `useTrainingCatalog()` and filter to a constant allowlist:

```ts
const STARTER_TEMPLATE_KEYS = [
  "basic-manners",
  "puppy-fundamentals",
  "recall-reliability",
] as const;
```

These keys already exist in `apps/api/src/data/training-catalog.ts`; do not add curriculum
content in this project.

Submit:

```ts
{
  setupId: setup.id,
  templateKey,
  weekKey: weekKeyAtOffset(new Date(), new Date().getTimezoneOffset()),
  timezoneOffsetMinutes: new Date().getTimezoneOffset(),
}
```

- [ ] **Step 4: Add preview mode to the existing suggestion card**

Add `mode?: "interactive" | "preview"` to `SuggestionCard`, defaulting to
`"interactive"` through a discriminated props union:

```ts
type SuggestionCardProps =
  | {
      mode?: "interactive";
      suggestion: TrainingSuggestion;
      onAction: (action: SuggestionAction) => void;
      onDecision: (proposalId: string, decision: AdvancementDecision) => void;
      onPickFocus: () => void;
      actionPending?: boolean;
      decisionPending?: boolean;
    }
  | {
      mode: "preview";
      suggestion: TrainingSuggestion;
    };
```

Change the component signature to `export function SuggestionCard(props: SuggestionCardProps)`
and narrow with `if (props.mode === "preview")` before reading interactive handlers; do
not destructure union-only handlers in the function parameter.

In preview mode, preserve the existing exercise, easier fallback, and `SafetyNotice`
rendering but omit suggestion-action buttons, focus controls, ratings, and advancement
decisions. Add a test proving preview mode has no action buttons and still renders
`SafetyNotice` for a safety suggestion.

The setup route may render an exercise only when the API response has
the normal authored exercise payload. A safety suggestion renders only `SafetyNotice`.
Render:

```tsx
<SuggestionCard suggestion={suggestion} mode="preview" />
```

- [ ] **Step 5: Run training and suggestion tests**

Run:

```bash
pnpm --filter @turingcare/web exec vitest run \
  src/routes/guided-setup.test.tsx src/components/training/suggestion-card.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/guided-setup/training-action-step.tsx \
  apps/web/src/routes/guided-setup.tsx apps/web/src/routes/guided-setup.test.tsx \
  apps/web/src/components/training/suggestion-card.tsx \
  apps/web/src/components/training/suggestion-card.test.tsx \
  apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat: add guided training first action"
```

---

### Task 11: Add Completion Handoff and Checklist Integration

**Files:**
- Create: `apps/web/src/components/guided-setup/completion-step.tsx`
- Modify: `apps/web/src/routes/guided-setup.tsx`
- Modify: `apps/web/src/components/onboarding/checklist.tsx`
- Modify: `apps/web/src/components/onboarding/checklist.test.tsx`
- Modify: `apps/web/src/routes/dogs-list.tsx`
- Modify: `apps/web/src/routes/dogs-list.test.tsx`
- Modify: `apps/web/src/lib/dogs.ts`
- Modify: `apps/web/src/components/dog-layout.tsx`
- Modify: `apps/web/src/components/dog-layout.test.tsx`
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Write failing handoff tests**

Assert:

- behavior completion links to `/my/dogs/:dogId/journal`;
- training completion links to `/my/dogs/:dogId/week`;
- progress completion links to `/my/dogs/:dogId/journal`;
- skip links to `/my/dogs/:dogId`;
- completion message uses `role="status"`;
- active setup hides `OnboardingChecklist`;
- completed setup restores the checklist;
- dogs list exposes a **Guided setup** link to `/my/setup/new`.
- deleting the active setup dog shows a localized link back to `/my/setup` instead of a
  generic save error.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm --filter @turingcare/web exec vitest run \
  src/routes/guided-setup.test.tsx \
  src/components/onboarding/checklist.test.tsx \
  src/routes/dogs-list.test.tsx
```

Expected: FAIL on missing handoff and integration behavior.

- [ ] **Step 3: Implement completion handoff**

`CompletionStep` accepts:

```ts
type CompletionStepProps = {
  setup: GuidedSetupRecord;
  suggestion?: TrainingSuggestion;
};
```

Map action type to destination and one translated next-step sentence. Never repeat concern
or journal prose. Keep the saved-value confirmation generic.

- [ ] **Step 4: Hide checklist during active setup**

In `OnboardingChecklist`, load `useGuidedSetup()` and return `null` when
`guidedSetup.active !== null`. Preserve the existing checklist completion and celebration
logic after setup ends.

- [ ] **Step 5: Add explicit additional-dog entry**

Add a translated secondary link in `DogsList`:

```tsx
<Link to="/my/setup/new">{t("guidedSetup.startAnother")}</Link>
```

The explicit `/my/setup/new` route starts with dog basics when there is no active setup,
regardless of an older completed setup.

- [ ] **Step 6: Handle active-setup dog deletion**

In `useDeleteDog`, parse the structured API body and throw
`new Error(body.error ?? "delete_failed")`. In `DogLayout`, when the error message is
`active_guided_setup`, close the confirmation controls and render a localized inline
message with:

```tsx
<Link to="/my/setup">{t("guidedSetup.resumeBeforeDelete")}</Link>
```

Keep the generic error toast for all other deletion failures.

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm --filter @turingcare/web exec vitest run \
  src/routes/guided-setup.test.tsx \
  src/components/onboarding/checklist.test.tsx \
  src/routes/dogs-list.test.tsx src/components/dog-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/guided-setup/completion-step.tsx \
  apps/web/src/routes/guided-setup.tsx \
  apps/web/src/components/onboarding/checklist.tsx \
  apps/web/src/components/onboarding/checklist.test.tsx \
  apps/web/src/routes/dogs-list.tsx apps/web/src/routes/dogs-list.test.tsx \
  apps/web/src/lib/dogs.ts apps/web/src/components/dog-layout.tsx \
  apps/web/src/components/dog-layout.test.tsx \
  apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat: complete guided setup handoff"
```

---

### Task 12: Harden Telemetry, Accessibility, and Recovery

**Files:**
- Modify: `apps/api/src/routes/guided-setup.test.ts`
- Modify: `apps/api/src/routes/telemetry.test.ts`
- Modify: `apps/web/src/routes/guided-setup.test.tsx`
- Modify: `apps/web/src/components/guided-setup/setup-shell.tsx`
- Modify: `apps/web/src/components/guided-setup/abandon-setup-button.tsx`
- Modify: `apps/web/src/components/guided-setup/dog-basics-step.tsx`
- Modify: `apps/web/src/components/guided-setup/intent-step.tsx`
- Modify: `apps/web/src/components/guided-setup/behavior-action-step.tsx`
- Modify: `apps/web/src/components/guided-setup/training-action-step.tsx`
- Modify: `apps/web/src/components/guided-setup/progress-action-step.tsx`
- Modify: `apps/web/src/components/guided-setup/completion-step.tsx`

- [ ] **Step 1: Add privacy regression tests**

Capture `recordEvent` rows for every lifecycle and action route. Assert:

```ts
expect(JSON.stringify(event.props)).not.toContain(validDog.name);
expect(JSON.stringify(event.props)).not.toContain("Snapped when touched");
expect(JSON.stringify(event.props)).not.toContain("Settled after dinner");
expect(Object.values(event.props).every((value) =>
  ["string", "number", "boolean"].includes(typeof value),
)).toBe(true);
```

Assert duration is a bounded bucket such as `under_2m`, `2_to_5m`, `5_to_10m`, or
`over_10m`, never an exact timestamp delta.

- [ ] **Step 2: Add accessibility and lifecycle tests**

Test keyboard-only completion, focus moving to each new heading, step label accessible
name, error association, polite completion announcement, reduced-motion classes, refresh
resume, duplicate submit, and active-setup conflict recovery.

- [ ] **Step 3: Implement duration buckets and error mapping**

Add:

```ts
function durationBucket(startedAt: Date, completedAt: Date) {
  const minutes = (completedAt.getTime() - startedAt.getTime()) / 60_000;
  if (minutes < 2) return "under_2m";
  if (minutes < 5) return "2_to_5m";
  if (minutes < 10) return "5_to_10m";
  return "over_10m";
}
```

Map API errors to specific i18n keys. Unknown errors use one generic retry message and
remain logged through the repository's existing monitoring boundary.

- [ ] **Step 4: Run privacy and accessibility tests**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run \
  src/routes/guided-setup.test.ts src/routes/telemetry.test.ts
pnpm --filter @turingcare/web exec vitest run src/routes/guided-setup.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/guided-setup.test.ts \
  apps/api/src/routes/telemetry.test.ts \
  apps/web/src/routes/guided-setup.test.tsx \
  apps/web/src/components/guided-setup
git commit -m "test: harden guided setup privacy and recovery"
```

---

### Task 13: Add Desktop and Phone End-to-End Journeys

**Files:**
- Modify: `e2e/critical-owner-journey.spec.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: Reconcile the existing journey and add the desktop behavior path**

Change the existing test's first argument to
`"[desktop] full owner journey: register → guided setup → training → brief → share"` and
keep its existing callback body.

Change the post-registration URL assertion from `/my` to `/my/setup`. Keep the
verification-banner assertion there because `GuidedSetupLayout` renders
`VerifyEmailBanner`. After visiting the verification URL, navigate to `/my` and expect
the dog-less first-run eligibility guard to redirect back to `/my/setup`.

Delete the old **Create dog** section that visits `/my/dogs/new`; Step 1 now creates that
same dog. Preserve the later moment, training, practice, week, brief, and share sections
against the setup-created dog. Fill setup with:

```ts
await page.getByLabel("Name").fill("Maple");
await page.getByLabel("Size").selectOption("medium");
await page.getByLabel("Sex").selectOption("female");
await page.getByLabel("Source").selectOption("rescue");
await page.getByLabel("Vaccination").selectOption("unknown");
await page.getByRole("button", { name: "Continue" }).click();
await page.getByLabel("Understand a behavior").check();
await page.getByRole("button", { name: "Continue" }).click();
await page.getByLabel("What happened?").fill("Barked when the doorbell rang.");
await page.getByLabel("Concern level").selectOption("mild");
await page.getByRole("button", { name: "Save concern" }).click();
await expect(page.getByRole("status")).toContainText("saved");
```

Continue into the journal workspace, log the journey's existing quick moment, and proceed
through its remaining sections.

- [ ] **Step 2: Add phone training and resume smoke in the same spec**

At the phone viewport:

1. create a second test titled `[phone] guided training setup resumes after reload`;
2. register a fresh owner and verify email through the test outbox;
3. start setup and save dog basics;
4. reload;
5. verify Step 2 resumes;
6. choose training;
7. apply a starter template;
8. assert either a real exercise or a safety notice, never both;
9. follow the weekly workspace CTA.

In `playwright.config.ts`, route tags to projects:

```ts
{
  name: "desktop-chromium",
  grep: /\[desktop\]/,
  use: { ...devices["Desktop Chrome"] },
},
{
  name: "phone-chromium",
  grep: /\[phone\]/,
  use: { ...devices["Pixel 7"], browserName: "chromium" },
},
```

- [ ] **Step 3: Run Playwright journeys**

The Playwright config starts the local API and web apps. Run:

```bash
pnpm exec playwright test e2e/critical-owner-journey.spec.ts --project=desktop-chromium
pnpm exec playwright test e2e/critical-owner-journey.spec.ts --project=phone-chromium
```

Expected: desktop and phone journeys PASS with no retries required.

- [ ] **Step 4: Commit**

```bash
git add e2e/critical-owner-journey.spec.ts playwright.config.ts
git commit -m "test: cover guided first-run journeys"
```

---

### Task 14: Full Verification and Documentation Reconciliation

**Files:**
- Modify: `docs/superpowers/specs/2026-08-15-first-run-guided-setup-design.md` only if implementation revealed a required factual correction.
- Modify: `docs/superpowers/plans/2026-08-15-first-run-guided-setup.md` by checking completed task boxes.
- Modify: `docs/PROJECT-LOG.md`

- [ ] **Step 1: Apply the migration to the local test database**

```bash
corepack enable
cp .env.example .env
docker compose up -d --wait
set -a && . ./.env && set +a
pnpm --filter @turingcare/api db:migrate
```

Expected: migration `0018_guided_setup` applies successfully.

- [ ] **Step 2: Run repository checks**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all commands exit `0`; API tests include real Postgres guided-setup coverage.

- [ ] **Step 3: Run the focused Playwright journeys**

```bash
pnpm exec playwright test e2e/critical-owner-journey.spec.ts --project=desktop-chromium
pnpm exec playwright test e2e/critical-owner-journey.spec.ts --project=phone-chromium
```

Expected: all selected projects PASS.

- [ ] **Step 4: Add the shipped phase to the project log**

Run:

```bash
git log --reverse --format='%h %s' origin/main..HEAD
```

Append a `2026-08-15 — First-run guided setup` entry to `docs/PROJECT-LOG.md` describing
the three-step flow, persisted resume state, three real first actions, safety behavior,
telemetry, accessibility/localization, and desktop/phone coverage. Record the actual first
and last implementation commit hashes from the command, plus the exact spec and plan paths.

- [ ] **Step 5: Inspect the final diff**

```bash
git diff origin/main...HEAD --check
git status --short
```

Expected: no whitespace errors and no untracked implementation residue.

- [ ] **Step 6: Commit final factual documentation adjustments**

If no documentation changed, do not create an empty commit. Otherwise:

```bash
git add docs/superpowers/specs/2026-08-15-first-run-guided-setup-design.md \
  docs/superpowers/plans/2026-08-15-first-run-guided-setup.md docs/PROJECT-LOG.md
git commit -m "docs: reconcile guided setup implementation"
```
