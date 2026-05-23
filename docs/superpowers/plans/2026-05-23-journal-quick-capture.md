# Journal Quick Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner save a journal entry in under 30 seconds with dog + note + optional intensity, while keeping ABC/trainer details as optional enrichment.

**Architecture:** Change the data model and shared schemas first so the API can accept note-first entries without fake ABC values. Add owner-scoped API support for global journal listing, then refactor the web journal page into focused composer, follow-up, details editor, and note-first entry card components.

**Tech Stack:** pnpm workspace, TypeScript, Zod, Drizzle/Postgres, Hono typed RPC, Better Auth, React 19, React Router, TanStack Query, react-hook-form, Sonner, Vitest, Testing Library, Biome.

---

**Spec:** `docs/superpowers/specs/2026-05-22-journal-quick-capture-design.md`

**Execution baseline:** Start implementation from `origin/main` or from a worktree based on the current spec branch after merging/rebasing the spec commit. Use `pnpm` from the repository root. If environment variables are required for API/db commands, load the repo's existing `.env` with `set -a && . ./.env && set +a` and never commit `.env`.

**Commit trailer for every implementation commit:**

```bash
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

---

## File Structure

```text
packages/shared/src/journal.ts                                  MODIFY  note-first create/update schemas and exported types
packages/shared/src/journal.test.ts                             MODIFY  schema coverage for moment, daily check-in, update, invalid values

apps/api/src/db/schema.ts                                       MODIFY  journal enums + nullable ABC/intensity + required note
apps/api/src/db/schema.test.ts                                  MODIFY  journal enum/table smoke coverage
apps/api/drizzle/0005_journal_quick_capture.sql                 CREATE  generated then renamed migration SQL
apps/api/drizzle/meta/_journal.json                             MODIFY  generated migration journal metadata
apps/api/drizzle/meta/0005_snapshot.json                        CREATE  generated schema snapshot

apps/api/src/routes/journal.ts                                  CREATE  global /api/journal listing endpoint
apps/api/src/routes/journal.test.ts                             CREATE  global journal endpoint tests
apps/api/src/routes/dogs.ts                                     MODIFY  dog journal create/update + brief composition mapping
apps/api/src/routes/dogs.test.ts                                MODIFY  dog-scoped journal and brief tests
apps/api/src/routes/overview.ts                                 MODIFY  recent activity reads note-first entries
apps/api/src/routes/overview.test.ts                            MODIFY  overview test payloads/assertions
apps/api/src/lib/brief.ts                                       MODIFY  Behavior Brief uses note first and optional intensity
apps/api/src/lib/brief.test.ts                                  MODIFY  note-first brief tests
apps/api/src/app.ts                                             MODIFY  mount /api/journal route

apps/web/src/lib/journal.ts                                     MODIFY  global query hook + note-first mutation types
apps/web/src/components/journal/quick-moment-composer.tsx        CREATE  default fast moment composer
apps/web/src/components/journal/daily-check-in-composer.tsx      CREATE  secondary daily check-in composer
apps/web/src/components/journal/post-save-follow-ups.tsx         CREATE  optional first follow-up prompt
apps/web/src/components/journal/structured-details-editor.tsx    CREATE  reusable ABC/context edit form
apps/web/src/components/journal/entry-card.tsx                   MODIFY  note-first display + details editor
apps/web/src/components/journal/entry-card.test.tsx              MODIFY  note-first/details/edit tests
apps/web/src/routes/journal.tsx                                 MODIFY  global journal hub and dog filter
apps/web/src/routes/journal.test.tsx                            MODIFY  quick save, daily check-in, no-dog, follow-up tests
apps/web/src/routes/dog-detail.tsx                              MODIFY  dog-specific journal link
apps/web/src/routes/dogs.test.tsx                               MODIFY  dog detail journal link test
apps/web/src/routes/overview.tsx                                MODIFY  keep quick action pointing to simplified journal
apps/web/src/routes/overview.test.tsx                           MODIFY  recent activity note-first assertion
apps/web/src/i18n/en.ts                                         MODIFY  new journal strings
apps/web/src/i18n/es.ts                                         MODIFY  Spanish parity for new keys
```

---

## Task 1: Shared journal schemas

**Files:**
- Modify: `packages/shared/src/journal.ts`
- Modify: `packages/shared/src/journal.test.ts`

- [ ] **Step 1: Replace the shared journal schema tests**

Replace `packages/shared/src/journal.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  journalDailyCheckInCreateSchema,
  journalEntryCreateSchema,
  journalEntryUpdateSchema,
  journalMomentCreateSchema,
} from "./journal";

describe("journalMomentCreateSchema", () => {
  it("accepts a note-only moment with optional intensity", () => {
    expect(
      journalMomentCreateSchema.safeParse({
        kind: "moment",
        note: "Barked at the delivery truck",
        intensity: 3,
      }).success,
    ).toBe(true);
  });

  it("accepts optional ABC and context details without requiring them", () => {
    expect(
      journalMomentCreateSchema.safeParse({
        kind: "moment",
        note: "Jumped at the window",
        occurredAt: "2026-05-22T10:00",
        antecedent: "Truck drove by",
        behavior: "Barked twice",
        consequence: "Owner redirected to mat",
        location: "Living room",
        durationSeconds: 12,
        recoverySeconds: 45,
        peoplePresent: "Owner",
        ownerResponse: "Scattered kibble",
        notes: "Recovered quickly",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty note and out-of-range intensity", () => {
    expect(journalMomentCreateSchema.safeParse({ kind: "moment", note: "   " }).success).toBe(
      false,
    );
    expect(
      journalMomentCreateSchema.safeParse({
        kind: "moment",
        note: "Too high",
        intensity: 6,
      }).success,
    ).toBe(false);
    expect(
      journalMomentCreateSchema.safeParse({
        kind: "moment",
        note: "Too low",
        intensity: 0,
      }).success,
    ).toBe(false);
  });
});

describe("journalDailyCheckInCreateSchema", () => {
  it("accepts a daily check-in with trend and note", () => {
    expect(
      journalDailyCheckInCreateSchema.safeParse({
        kind: "daily_checkin",
        trend: "better",
        note: "Settled faster during dinner.",
      }).success,
    ).toBe(true);
  });

  it("rejects a daily check-in without a trend", () => {
    expect(
      journalDailyCheckInCreateSchema.safeParse({
        kind: "daily_checkin",
        note: "Quiet afternoon",
      }).success,
    ).toBe(false);
  });
});

describe("journalEntryCreateSchema", () => {
  it("discriminates moments from daily check-ins", () => {
    expect(journalEntryCreateSchema.safeParse({ kind: "moment", note: "Growled once" }).success).toBe(
      true,
    );
    expect(
      journalEntryCreateSchema.safeParse({
        kind: "daily_checkin",
        trend: "same",
        note: "About the same today",
      }).success,
    ).toBe(true);
    expect(journalEntryCreateSchema.safeParse({ kind: "daily_checkin", note: "Missing trend" }).success).toBe(
      false,
    );
  });
});

describe("journalEntryUpdateSchema", () => {
  it("accepts partial follow-up and structured detail updates", () => {
    expect(journalEntryUpdateSchema.safeParse({ antecedent: "Doorbell rang" }).success).toBe(true);
    expect(
      journalEntryUpdateSchema.safeParse({
        note: "Updated note",
        intensity: null,
        durationSeconds: 20,
        recoverySeconds: null,
        peoplePresent: "Owner + walker",
        ownerResponse: "Asked for sit",
      }).success,
    ).toBe(true);
  });

  it("validates note, intensity, trend, and numeric detail fields when present", () => {
    expect(journalEntryUpdateSchema.safeParse({ note: "" }).success).toBe(false);
    expect(journalEntryUpdateSchema.safeParse({ intensity: 9 }).success).toBe(false);
    expect(journalEntryUpdateSchema.safeParse({ trend: "easier" }).success).toBe(false);
    expect(journalEntryUpdateSchema.safeParse({ durationSeconds: -1 }).success).toBe(false);
    expect(journalEntryUpdateSchema.safeParse({ recoverySeconds: -1 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run shared tests to verify failure**

```bash
pnpm --filter @turingcare/shared test
```

Expected: FAIL because `journalDailyCheckInCreateSchema`, `journalEntryCreateSchema`, `journalEntryUpdateSchema`, and `journalMomentCreateSchema` are not exported.

- [ ] **Step 3: Replace the shared journal schemas**

Replace `packages/shared/src/journal.ts` with:

```ts
import { z } from "zod";

export const journalEntryKindValues = ["moment", "daily_checkin"] as const;
export const journalTrendValues = ["better", "same", "harder"] as const;

const noteSchema = z.string().trim().min(1, "Quick note is required");
const optionalText = z.string().trim().nullable().optional();
const optionalNonNegativeInteger = z.number().int().nonnegative().nullable().optional();
const optionalIntensity = z.number().int().min(1).max(5).nullable().optional();

const journalDetailsSchema = z.object({
  occurredAt: z.string().min(1, "Date is required").optional(),
  antecedent: optionalText,
  behavior: optionalText,
  consequence: optionalText,
  intensity: optionalIntensity,
  location: optionalText,
  notes: optionalText,
  durationSeconds: optionalNonNegativeInteger,
  recoverySeconds: optionalNonNegativeInteger,
  peoplePresent: optionalText,
  ownerResponse: optionalText,
});

export const journalMomentCreateSchema = journalDetailsSchema.extend({
  kind: z.literal("moment"),
  note: noteSchema,
  trend: z.null().optional(),
});

export const journalDailyCheckInCreateSchema = z.object({
  kind: z.literal("daily_checkin"),
  note: noteSchema,
  trend: z.enum(journalTrendValues),
  occurredAt: z.string().min(1, "Date is required").optional(),
});

export const journalEntryCreateSchema = z.discriminatedUnion("kind", [
  journalMomentCreateSchema,
  journalDailyCheckInCreateSchema,
]);

export const journalEntryUpdateSchema = journalDetailsSchema
  .extend({
    kind: z.enum(journalEntryKindValues).optional(),
    note: noteSchema.optional(),
    trend: z.enum(journalTrendValues).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "moment" && value.trend) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trend"],
        message: "Trend is only available for daily check-ins",
      });
    }
  });

export type JournalEntryKind = (typeof journalEntryKindValues)[number];
export type JournalTrend = (typeof journalTrendValues)[number];
export type JournalMomentCreateInput = z.infer<typeof journalMomentCreateSchema>;
export type JournalDailyCheckInCreateInput = z.infer<typeof journalDailyCheckInCreateSchema>;
export type JournalEntryCreateInput = z.infer<typeof journalEntryCreateSchema>;
export type JournalEntryUpdateInput = z.infer<typeof journalEntryUpdateSchema>;

export const journalEntrySchema = journalEntryCreateSchema;
export type JournalEntryInput = JournalEntryCreateInput;
```

`journalEntrySchema` and `JournalEntryInput` remain as compatibility aliases during the refactor. New code should use `journalEntryCreateSchema` and `journalEntryUpdateSchema`.

- [ ] **Step 4: Run shared tests to verify pass**

```bash
pnpm --filter @turingcare/shared test
```

Expected: PASS for all shared tests.

- [ ] **Step 5: Commit**

```bash
git status --short
git add packages/shared/src/journal.ts packages/shared/src/journal.test.ts
git commit -m "feat(shared): add note-first journal schemas" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Journal database schema and migration

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/db/schema.test.ts`
- Create: `apps/api/drizzle/0005_journal_quick_capture.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Create: `apps/api/drizzle/meta/0005_snapshot.json`

- [ ] **Step 1: Write the failing schema smoke test**

Replace `apps/api/src/db/schema.test.ts` with:

```ts
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  journalEntries,
  journalEntryKindEnum,
  journalTrendEnum,
  practiceSessions,
  trainingSkills,
} from "./schema";

describe("training progress tables", () => {
  it("exports the expected table names", () => {
    expect(getTableName(trainingSkills)).toBe("training_skills");
    expect(getTableName(practiceSessions)).toBe("practice_sessions");
  });
});

describe("journal schema", () => {
  it("exports journal entry kinds and trends", () => {
    expect(getTableName(journalEntries)).toBe("journal_entries");
    expect(journalEntryKindEnum.enumValues).toEqual(["moment", "daily_checkin"]);
    expect(journalTrendEnum.enumValues).toEqual(["better", "same", "harder"]);
  });
});
```

- [ ] **Step 2: Run API schema test to verify failure**

```bash
pnpm --filter @turingcare/api test -- --reporter=verbose src/db/schema.test.ts
```

Expected: FAIL because `journalEntryKindEnum` and `journalTrendEnum` are not exported.

- [ ] **Step 3: Update Drizzle schema**

In `apps/api/src/db/schema.ts`, add the journal enums after `briefStatusEnum`:

```ts
export const journalEntryKindEnum = pgEnum("journal_entry_kind", ["moment", "daily_checkin"]);
export const journalTrendEnum = pgEnum("journal_trend", ["better", "same", "harder"]);
```

Replace the `journalEntries` table definition with:

```ts
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    dogId: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    kind: journalEntryKindEnum("kind").notNull().default("moment"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    note: text("note").notNull(),
    trend: journalTrendEnum("trend"),
    antecedent: text("antecedent"),
    behavior: text("behavior"),
    consequence: text("consequence"),
    intensity: integer("intensity"),
    durationSeconds: integer("duration_seconds"),
    recoverySeconds: integer("recovery_seconds"),
    location: text("location"),
    peoplePresent: text("people_present"),
    ownerResponse: text("owner_response"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("journal_intensity_range", sql`${t.intensity} IS NULL OR ${t.intensity} BETWEEN 1 AND 5`),
    check("journal_daily_checkin_trend", sql`${t.kind} <> 'daily_checkin' OR ${t.trend} IS NOT NULL`),
    check("journal_moment_trend_null", sql`${t.kind} <> 'moment' OR ${t.trend} IS NULL`),
  ],
);
```

- [ ] **Step 4: Generate and normalize the migration**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api db:generate
mv apps/api/drizzle/0005_*.sql apps/api/drizzle/0005_journal_quick_capture.sql
```

Open `apps/api/drizzle/meta/_journal.json` and change the final generated entry's `"tag"` to `"0005_journal_quick_capture"` so it matches the renamed SQL file. Keep `"idx": 5` and keep the generated `"when"` value.

The SQL file must contain this migration logic:

```sql
CREATE TYPE "public"."journal_entry_kind" AS ENUM('moment', 'daily_checkin');
--> statement-breakpoint
CREATE TYPE "public"."journal_trend" AS ENUM('better', 'same', 'harder');
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "kind" "journal_entry_kind" DEFAULT 'moment';
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "note" text;
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "trend" "journal_trend";
--> statement-breakpoint
UPDATE "journal_entries"
SET "kind" = 'moment'
WHERE "kind" IS NULL;
--> statement-breakpoint
UPDATE "journal_entries"
SET "note" = trim(both ' ' from concat_ws(' ',
  CASE WHEN nullif(trim("antecedent"), '') IS NOT NULL THEN 'A: ' || trim("antecedent") END,
  CASE WHEN nullif(trim("behavior"), '') IS NOT NULL THEN 'B: ' || trim("behavior") END,
  CASE WHEN nullif(trim("consequence"), '') IS NOT NULL THEN 'C: ' || trim("consequence") END
))
WHERE "note" IS NULL;
--> statement-breakpoint
UPDATE "journal_entries"
SET "note" = trim("behavior")
WHERE nullif(trim("note"), '') IS NULL AND nullif(trim("behavior"), '') IS NOT NULL;
--> statement-breakpoint
UPDATE "journal_entries"
SET "note" = 'Legacy journal entry'
WHERE nullif(trim("note"), '') IS NULL;
--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "kind" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "note" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "antecedent" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "behavior" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "consequence" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "intensity" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "journal_entries" DROP CONSTRAINT "intensity_range";
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_intensity_range" CHECK ("journal_entries"."intensity" IS NULL OR "journal_entries"."intensity" BETWEEN 1 AND 5);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_daily_checkin_trend" CHECK ("journal_entries"."kind" <> 'daily_checkin' OR "journal_entries"."trend" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_moment_trend_null" CHECK ("journal_entries"."kind" <> 'moment' OR "journal_entries"."trend" IS NULL);
```

If Drizzle generates the column/check changes but not the three `UPDATE` backfill statements, insert the three `UPDATE` statements in the order shown before `ALTER COLUMN "note" SET NOT NULL`.

- [ ] **Step 5: Run schema tests and apply migration locally**

```bash
pnpm --filter @turingcare/api test -- --reporter=verbose src/db/schema.test.ts
pnpm --filter @turingcare/api db:migrate
```

Expected: schema test PASS; migration applies without violating `note` not-null on existing rows.

- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/db/schema.ts apps/api/src/db/schema.test.ts apps/api/drizzle/
git commit -m "feat(api): migrate journal entries to quick capture model" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: API journal endpoints and Behavior Brief note-first mapping

**Files:**
- Create: `apps/api/src/routes/journal.ts`
- Create: `apps/api/src/routes/journal.test.ts`
- Modify: `apps/api/src/routes/dogs.ts`
- Modify: `apps/api/src/routes/dogs.test.ts`
- Modify: `apps/api/src/routes/overview.ts`
- Modify: `apps/api/src/routes/overview.test.ts`
- Modify: `apps/api/src/lib/brief.ts`
- Modify: `apps/api/src/lib/brief.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Add failing API tests for quick capture**

In `apps/api/src/routes/dogs.test.ts`, replace the `const entry = ...` inside `describe("dogs: journal", ...)` with:

```ts
  const entry = {
    kind: "moment",
    note: "Barked at the doorbell",
    intensity: 3,
  };
```

Replace the first journal test with:

```ts
  it("adds, lists, updates, and deletes a note-first moment", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const add = await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(entry),
    });
    expect(add.status).toBe(201);
    const { entry: created } = (await add.json()) as {
      entry: {
        id: string;
        note: string;
        kind: string;
        occurredAt: string;
        antecedent: string | null;
        behavior: string | null;
        consequence: string | null;
        intensity: number | null;
      };
    };
    expect(created).toMatchObject({
      note: "Barked at the doorbell",
      kind: "moment",
      antecedent: null,
      behavior: null,
      consequence: null,
      intensity: 3,
    });
    expect(new Date(created.occurredAt).toString()).not.toBe("Invalid Date");

    const update = await app.request(`/api/dogs/${dog.id}/journal/${created.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ antecedent: "Doorbell rang" }),
    });
    expect(update.status).toBe(200);
    expect(((await update.json()) as { entry: { antecedent: string } }).entry.antecedent).toBe(
      "Doorbell rang",
    );

    const list = await app.request(`/api/dogs/${dog.id}/journal`, { headers: u.authHeaders });
    expect(((await list.json()) as { entries: unknown[] }).entries).toHaveLength(1);
    const del = await app.request(`/api/dogs/${dog.id}/journal/${created.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });
    expect(del.status).toBe(200);
    const after = await app.request(`/api/dogs/${dog.id}/journal`, { headers: u.authHeaders });
    expect(((await after.json()) as { entries: unknown[] }).entries).toEqual([]);
  });
```

Append this daily check-in test inside the same `describe("dogs: journal", ...)` block:

```ts
  it("creates a daily check-in with trend and no intensity", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const add = await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        kind: "daily_checkin",
        trend: "better",
        note: "Settled faster after lunch.",
      }),
    });
    expect(add.status).toBe(201);
    const body = (await add.json()) as {
      entry: { kind: string; trend: string; note: string; intensity: number | null };
    };
    expect(body.entry).toMatchObject({
      kind: "daily_checkin",
      trend: "better",
      note: "Settled faster after lunch.",
      intensity: null,
    });
  });
```

Update the invalid-entry test to send `{ ...entry, intensity: 9 }`; it should still expect `400`.

- [ ] **Step 2: Create failing global journal endpoint tests**

Create `apps/api/src/routes/journal.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { type TestUser, createTestUser } from "../test-helpers";

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

async function makeDog(u: TestUser, name = "Biscuit") {
  const res = await app.request("/api/dogs", {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify({ ...validDog, name }),
  });
  return ((await res.json()) as { dog: { id: string; name: string } }).dog;
}

async function makeEntry(u: TestUser, dogId: string, note: string) {
  const res = await app.request(`/api/dogs/${dogId}/journal`, {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify({ kind: "moment", note }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { entry: { id: string } }).entry;
}

describe("global journal", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  it("requires auth", async () => {
    expect((await app.request("/api/journal")).status).toBe(401);
  });

  it("lists entries across owned dogs with dog summaries newest first", async () => {
    const u = await createTestUser();
    users.push(u);
    const biscuit = await makeDog(u, "Biscuit");
    const pancake = await makeDog(u, "Pancake");
    await makeEntry(u, biscuit.id, "Older biscuit note");
    await makeEntry(u, pancake.id, "Newer pancake note");

    const res = await app.request("/api/journal", { headers: u.authHeaders });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: Array<{ note: string; dog: { id: string; name: string } }>;
    };
    expect(body.entries).toHaveLength(2);
    expect(body.entries.map((entry) => entry.dog.name).sort()).toEqual(["Biscuit", "Pancake"]);
    expect(body.entries.some((entry) => entry.note === "Newer pancake note")).toBe(true);
  });

  it("filters by owned dogId and returns 404 for another user's dog", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    users.push(owner, other);
    const ownedDog = await makeDog(owner, "Biscuit");
    const otherDog = await makeDog(other, "Pancake");
    await makeEntry(owner, ownedDog.id, "Owned note");
    await makeEntry(other, otherDog.id, "Other note");

    const filtered = await app.request(`/api/journal?dogId=${ownedDog.id}`, {
      headers: owner.authHeaders,
    });
    expect(filtered.status).toBe(200);
    const filteredBody = (await filtered.json()) as { entries: Array<{ note: string }> };
    expect(filteredBody.entries).toEqual([expect.objectContaining({ note: "Owned note" })]);

    const notOwned = await app.request(`/api/journal?dogId=${otherDog.id}`, {
      headers: owner.authHeaders,
    });
    expect(notOwned.status).toBe(404);
  });
});
```

- [ ] **Step 3: Add failing note-first brief and overview tests**

In `apps/api/src/lib/brief.test.ts`, replace the first test's entries with note-first entries and add a note-only case:

```ts
  it("includes name, concerns, goals, and note-first journal stats deterministically", () => {
    const out = composeBrief({
      dog,
      concerns: [{ concern: "Leash reactivity", severity: "moderate" }],
      goals: [{ goal: "Calm greetings" }],
      entries: [
        {
          note: "Barked at delivery truck",
          behavior: "Barked",
          intensity: 4,
          occurredAt: "2026-05-18T10:00:00.000Z",
        },
        {
          note: "Recovered faster on walk",
          behavior: null,
          intensity: null,
          occurredAt: "2026-05-17T10:00:00.000Z",
        },
      ],
    });
    expect(out).toContain("Biscuit");
    expect(out).toContain("Leash reactivity (moderate)");
    expect(out).toContain("Calm greetings");
    expect(out).toContain("2 journal");
    expect(out).toContain("average intensity 4.0");
    expect(out).toContain("Barked at delivery truck");
    expect(out).toContain("Recovered faster on walk");
    expect(composeBrief({ dog, concerns: [], goals: [], entries: [] })).toBe(
      composeBrief({ dog, concerns: [], goals: [], entries: [] }),
    );
  });
```

In `apps/api/src/routes/overview.test.ts`, update the journal POST body to:

```ts
      body: JSON.stringify({
        kind: "moment",
        note: "Barked",
        intensity: 3,
      }),
```

Keep the assertion against `recentActivity[0].behavior`; the API preserves the response property for web compatibility but fills it from `note`.

- [ ] **Step 4: Run API tests to verify failure**

```bash
pnpm --filter @turingcare/api test -- --reporter=verbose src/routes/dogs.test.ts src/routes/journal.test.ts src/lib/brief.test.ts src/routes/overview.test.ts
```

Expected: FAIL because the old API requires ABC fields, `/api/journal` is not mounted, and brief composition expects `behavior`.

- [ ] **Step 5: Implement global journal route**

Create `apps/api/src/routes/journal.ts`:

```ts
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { dogs, journalEntries } from "../db/schema";
import { type Vars, requireUser } from "../middleware/require-user";

export const journalApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const userId = c.get("userId");
    const dogId = c.req.query("dogId");

    if (dogId) {
      const [dog] = await db
        .select({ id: dogs.id })
        .from(dogs)
        .where(and(eq(dogs.id, dogId), eq(dogs.ownerId, userId)))
        .limit(1);
      if (!dog) return c.json({ error: "not_found" } as const, 404);
    }

    const rows = await db
      .select({
        entry: journalEntries,
        dog: {
          id: dogs.id,
          name: dogs.name,
        },
      })
      .from(journalEntries)
      .innerJoin(dogs, eq(journalEntries.dogId, dogs.id))
      .where(dogId ? and(eq(dogs.ownerId, userId), eq(dogs.id, dogId)) : eq(dogs.ownerId, userId))
      .orderBy(desc(journalEntries.occurredAt), desc(journalEntries.createdAt));

    return c.json({
      entries: rows.map(({ entry, dog }) => ({ ...entry, dog })),
    });
  });
```

In `apps/api/src/app.ts`, import and mount the route:

```ts
import { journalApp } from "./routes/journal";
```

Add the route after `.route("/api/dogs", dogsApp)`:

```ts
  .route("/api/journal", journalApp)
```

- [ ] **Step 6: Update dog-scoped journal handlers**

In `apps/api/src/routes/dogs.ts`, replace the `journalEntrySchema` import with:

```ts
  journalEntryCreateSchema,
  journalEntryUpdateSchema,
```

Replace the dog journal POST and PUT handlers with:

```ts
  .post("/:id/journal", zValidator("json", journalEntryCreateSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const b = c.req.valid("json");
    const [entry] = await db
      .insert(journalEntries)
      .values({
        dogId: dog.id,
        kind: b.kind,
        occurredAt: b.occurredAt ? new Date(b.occurredAt) : new Date(),
        note: b.note,
        trend: b.kind === "daily_checkin" ? b.trend : null,
        antecedent: b.kind === "moment" ? (b.antecedent ?? null) : null,
        behavior: b.kind === "moment" ? (b.behavior ?? null) : null,
        consequence: b.kind === "moment" ? (b.consequence ?? null) : null,
        intensity: b.kind === "moment" ? (b.intensity ?? null) : null,
        location: b.kind === "moment" ? (b.location ?? null) : null,
        notes: b.kind === "moment" ? (b.notes ?? null) : null,
        durationSeconds: b.kind === "moment" ? (b.durationSeconds ?? null) : null,
        recoverySeconds: b.kind === "moment" ? (b.recoverySeconds ?? null) : null,
        peoplePresent: b.kind === "moment" ? (b.peoplePresent ?? null) : null,
        ownerResponse: b.kind === "moment" ? (b.ownerResponse ?? null) : null,
      })
      .returning();
    return c.json({ entry }, 201);
  })
  .put("/:id/journal/:entryId", zValidator("json", journalEntryUpdateSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const b = c.req.valid("json");
    const changes: Partial<typeof journalEntries.$inferInsert> = {};
    if (b.kind !== undefined) changes.kind = b.kind;
    if (b.occurredAt !== undefined) changes.occurredAt = new Date(b.occurredAt);
    if (b.note !== undefined) changes.note = b.note;
    if (b.trend !== undefined) changes.trend = b.trend;
    if (b.kind === "moment") changes.trend = null;
    if (b.antecedent !== undefined) changes.antecedent = b.antecedent ?? null;
    if (b.behavior !== undefined) changes.behavior = b.behavior ?? null;
    if (b.consequence !== undefined) changes.consequence = b.consequence ?? null;
    if (b.intensity !== undefined) changes.intensity = b.intensity ?? null;
    if (b.location !== undefined) changes.location = b.location ?? null;
    if (b.notes !== undefined) changes.notes = b.notes ?? null;
    if (b.durationSeconds !== undefined) changes.durationSeconds = b.durationSeconds ?? null;
    if (b.recoverySeconds !== undefined) changes.recoverySeconds = b.recoverySeconds ?? null;
    if (b.peoplePresent !== undefined) changes.peoplePresent = b.peoplePresent ?? null;
    if (b.ownerResponse !== undefined) changes.ownerResponse = b.ownerResponse ?? null;

    const [entry] = await db
      .update(journalEntries)
      .set(changes)
      .where(and(eq(journalEntries.id, c.req.param("entryId")), eq(journalEntries.dogId, dog.id)))
      .returning();
    if (!entry) return c.json({ error: "not_found" } as const, 404);
    return c.json({ entry });
  })
```

Keep the existing GET and DELETE dog journal handlers owner-scoped.

- [ ] **Step 7: Update Behavior Brief and overview mapping**

In `apps/api/src/lib/brief.ts`, change the `BriefInput.entries` type to:

```ts
  entries: {
    note: string;
    behavior?: string | null;
    antecedent?: string | null;
    consequence?: string | null;
    intensity?: number | null;
    occurredAt: string;
  }[];
```

Replace the journal summary block with:

```ts
  const sorted = [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const intensities = entries
    .map((entry) => entry.intensity)
    .filter((value): value is number => typeof value === "number");
  const avg = intensities.length
    ? `average intensity ${(intensities.reduce((sum, value) => sum + value, 0) / intensities.length).toFixed(1)}`
    : "average intensity not recorded";
  lines.push(
    `Journal: ${entries.length} journal ${entries.length === 1 ? "entry" : "entries"}, ${avg}.`,
  );
  for (const e of sorted.slice(0, 5)) {
    const details = [
      e.antecedent ? `A: ${e.antecedent}` : null,
      e.behavior ? `B: ${e.behavior}` : null,
      e.consequence ? `C: ${e.consequence}` : null,
    ].filter(Boolean);
    const intensity = typeof e.intensity === "number" ? ` (intensity ${e.intensity})` : "";
    lines.push(
      `- ${e.occurredAt.slice(0, 10)}: ${e.note}${intensity}${details.length ? ` — ${details.join(" ")}` : ""}`,
    );
  }
```

In `apps/api/src/routes/dogs.ts`, update the brief composition `entries.map` to:

```ts
      entries: entries.map((e) => ({
        note: e.note,
        behavior: e.behavior,
        antecedent: e.antecedent,
        consequence: e.consequence,
        intensity: e.intensity,
        occurredAt: e.occurredAt.toISOString(),
      })),
```

In `apps/api/src/routes/overview.ts`, preserve the existing response property but fill it from `note`:

```ts
      recentActivity: entries.slice(0, 5).map((e) => ({
        dogName: nameById.get(e.dogId) ?? "",
        behavior: e.note,
        occurredAt: e.occurredAt.toISOString(),
      })),
```

- [ ] **Step 8: Run targeted API tests**

```bash
pnpm --filter @turingcare/api test -- --reporter=verbose src/routes/dogs.test.ts src/routes/journal.test.ts src/lib/brief.test.ts src/routes/overview.test.ts src/app.test.ts
```

Expected: PASS for targeted API tests.

- [ ] **Step 9: Commit**

```bash
git status --short
git add apps/api/src/routes/journal.ts apps/api/src/routes/journal.test.ts apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts apps/api/src/routes/overview.ts apps/api/src/routes/overview.test.ts apps/api/src/lib/brief.ts apps/api/src/lib/brief.test.ts apps/api/src/app.ts
git commit -m "feat(api): support quick journal capture endpoints" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Web journal hooks and i18n

**Files:**
- Modify: `apps/web/src/lib/journal.ts`
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/es.ts`
- Existing test coverage: `apps/web/src/i18n/i18n.test.tsx`

- [ ] **Step 1: Update journal RPC hooks**

Replace `apps/web/src/lib/journal.ts` with:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  JournalEntryCreateInput,
  JournalEntryKind,
  JournalEntryUpdateInput,
  JournalTrend,
} from "@turingcare/shared";
import { api } from "./api";

const dogJournal = api.api.dogs[":id"].journal;

export type JournalEntry = {
  id: string;
  dogId: string;
  kind: JournalEntryKind;
  occurredAt: string | Date;
  note: string;
  trend: JournalTrend | null;
  antecedent: string | null;
  behavior: string | null;
  consequence: string | null;
  intensity: number | null;
  location: string | null;
  notes: string | null;
  durationSeconds: number | null;
  recoverySeconds: number | null;
  peoplePresent: string | null;
  ownerResponse: string | null;
  dog?: { id: string; name: string };
};

export function useJournal(dogId?: string) {
  return useQuery({
    queryKey: ["journal", { dogId: dogId ?? null }],
    queryFn: async () => {
      const res = dogId
        ? await api.api.journal.$get({ query: { dogId } })
        : await api.api.journal.$get();
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).entries as JournalEntry[];
    },
  });
}

export function useDogJournal(dogId: string) {
  return useQuery({
    queryKey: ["dog-journal", dogId],
    enabled: !!dogId,
    queryFn: async () => {
      const res = await dogJournal.$get({ param: { id: dogId } });
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).entries as JournalEntry[];
    },
  });
}

export function useAddEntry(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: JournalEntryCreateInput) => {
      const res = await dogJournal.$post({ param: { id: dogId }, json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).entry as JournalEntry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dog-journal", dogId] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}

export function useDeleteEntry(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      const res = await api.api.dogs[":id"].journal[":entryId"].$delete({
        param: { id: dogId, entryId },
      });
      if (!res.ok) throw new Error("delete_failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dog-journal", dogId] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}

export function useUpdateEntry(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { entryId: string; body: JournalEntryUpdateInput }) => {
      const res = await dogJournal[":entryId"].$put({
        param: { id: dogId, entryId: args.entryId },
        json: args.body,
      });
      if (!res.ok) throw new Error("update_failed");
      return (await res.json()).entry as JournalEntry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dog-journal", dogId] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}
```

- [ ] **Step 2: Add English journal strings**

In `apps/web/src/i18n/en.ts`, replace the `journal` object with:

```ts
  journal: {
    title: "Behavior Journal",
    pickDog: "Choose a dog",
    filterAllDogs: "All dogs",
    noDogs: "Add a dog first to start journaling.",
    addDog: "Add a dog",
    empty: "No entries yet.",
    logMoment: "Log moment",
    dailyCheckIn: "Daily check-in",
    quickNote: "Quick note",
    quickNotePlaceholder: "What happened?",
    optionalIntensity: "Optional intensity",
    noIntensity: "No intensity",
    saveMoment: "Save moment",
    saveCheckIn: "Save check-in",
    trendBetter: "Better",
    trendSame: "Same",
    trendHarder: "Harder",
    postSaveTitle: "Want to add a little context?",
    postSaveAntecedent: "What happened right before?",
    postSaveAnswer: "Answer",
    postSaveSkip: "Skip",
    postSaveDone: "Done",
    addDetails: "Add details",
    editDetails: "Edit details",
    detailsEmpty: "No extra details yet.",
    occurredAt: "When",
    note: "Note",
    antecedent: "Antecedent",
    behavior: "Behavior",
    consequence: "Consequence",
    intensity: "Intensity (1–5)",
    kindMoment: "Moment",
    kindDailyCheckIn: "Daily check-in",
    trend: "Trend",
    location: "Location",
    notes: "Notes",
    duration: "Duration (seconds)",
    recovery: "Recovery (seconds)",
    peoplePresent: "People present",
    ownerResponse: "Your response",
    optional: "optional",
    saving: "Saving…",
    update: "Save changes",
    cancel: "Cancel",
    edit: "Edit",
    expand: "Expand entry",
    collapse: "Collapse entry",
    remove: "Remove",
    loadError: "Couldn't load the journal.",
    saved: "Entry saved",
    savedEdit: "Entry updated",
    saveFailed: "Save failed",
    noteRequired: "Write a quick note before saving.",
    dogRequired: "Choose a dog before saving.",
  },
```

- [ ] **Step 3: Add Spanish journal strings**

In `apps/web/src/i18n/es.ts`, replace the `journal` object with:

```ts
  journal: {
    title: "Diario de conducta",
    pickDog: "Elige un perro",
    filterAllDogs: "Todos los perros",
    noDogs: "Agrega un perro primero para empezar el diario.",
    addDog: "Agregar perro",
    empty: "Aún no hay entradas.",
    logMoment: "Registrar momento",
    dailyCheckIn: "Revisión diaria",
    quickNote: "Nota rápida",
    quickNotePlaceholder: "¿Qué pasó?",
    optionalIntensity: "Intensidad opcional",
    noIntensity: "Sin intensidad",
    saveMoment: "Guardar momento",
    saveCheckIn: "Guardar revisión",
    trendBetter: "Mejor",
    trendSame: "Igual",
    trendHarder: "Más difícil",
    postSaveTitle: "¿Quieres agregar un poco de contexto?",
    postSaveAntecedent: "¿Qué pasó justo antes?",
    postSaveAnswer: "Responder",
    postSaveSkip: "Saltar",
    postSaveDone: "Listo",
    addDetails: "Agregar detalles",
    editDetails: "Editar detalles",
    detailsEmpty: "Aún no hay detalles extra.",
    occurredAt: "Cuándo",
    note: "Nota",
    antecedent: "Antecedente",
    behavior: "Conducta",
    consequence: "Consecuencia",
    intensity: "Intensidad (1–5)",
    kindMoment: "Momento",
    kindDailyCheckIn: "Revisión diaria",
    trend: "Tendencia",
    location: "Lugar",
    notes: "Notas",
    duration: "Duración (segundos)",
    recovery: "Recuperación (segundos)",
    peoplePresent: "Personas presentes",
    ownerResponse: "Tu respuesta",
    optional: "opcional",
    saving: "Guardando…",
    update: "Guardar cambios",
    cancel: "Cancelar",
    edit: "Editar",
    expand: "Expandir entrada",
    collapse: "Contraer entrada",
    remove: "Quitar",
    loadError: "No se pudo cargar el diario.",
    saved: "Entrada guardada",
    savedEdit: "Entrada actualizada",
    saveFailed: "No se pudo guardar",
    noteRequired: "Escribe una nota rápida antes de guardar.",
    dogRequired: "Elige un perro antes de guardar.",
  },
```

- [ ] **Step 4: Run web i18n/type tests**

```bash
pnpm --filter @turingcare/web test -- --reporter=verbose src/i18n/i18n.test.tsx
pnpm --filter @turingcare/web typecheck
```

Expected: i18n parity test PASS; typecheck PASS for updated Hono client types after the API route is mounted.

- [ ] **Step 5: Commit**

```bash
git status --short
git add apps/web/src/lib/journal.ts apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): add journal quick-capture hooks and copy" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Web journal UI components and route

**Files:**
- Create: `apps/web/src/components/journal/quick-moment-composer.tsx`
- Create: `apps/web/src/components/journal/daily-check-in-composer.tsx`
- Create: `apps/web/src/components/journal/post-save-follow-ups.tsx`
- Create: `apps/web/src/components/journal/structured-details-editor.tsx`
- Modify: `apps/web/src/components/journal/entry-card.tsx`
- Modify: `apps/web/src/components/journal/entry-card.test.tsx`
- Modify: `apps/web/src/routes/journal.tsx`
- Modify: `apps/web/src/routes/journal.test.tsx`

- [ ] **Step 1: Replace route tests with quick-capture behavior**

Replace `apps/web/src/routes/journal.test.tsx` with:

```tsx
import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Journal } from "./journal";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/my/journal"]}>
          <Routes>
            <Route path="/my/journal" element={<Journal />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("Journal", () => {
  it("renders the quick composer and note-first entries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const p = new URL(url, "http://x").pathname;
        const body = p.includes("/api/journal")
          ? {
              entries: [
                {
                  id: "e1",
                  dogId: "d1",
                  kind: "moment",
                  note: "Barked at delivery truck",
                  occurredAt: "2026-05-19T10:00:00.000Z",
                  intensity: 4,
                  trend: null,
                  antecedent: null,
                  behavior: null,
                  consequence: null,
                  location: null,
                  notes: null,
                  durationSeconds: null,
                  recoverySeconds: null,
                  peoplePresent: null,
                  ownerResponse: null,
                  dog: { id: "d1", name: "Biscuit" },
                },
              ],
            }
          : p.includes("/api/dogs")
            ? { dogs: [{ id: "d1", name: "Biscuit" }] }
            : {};
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    setup();
    await waitFor(() => expect(screen.getByText(/Barked at delivery truck/)).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Log moment" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Quick note/)).toBeInTheDocument();
  });

  it("saves a note-only moment and shows the follow-up prompt", async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method, body: init?.body as string });
        const p = new URL(url, "http://x").pathname;
        if (init?.method === "POST" && p.includes("/journal")) {
          return new Response(
            JSON.stringify({
              entry: {
                id: "e1",
                dogId: "d1",
                kind: "moment",
                note: "Barked at delivery truck",
                occurredAt: "2026-05-19T10:00:00.000Z",
                intensity: null,
                trend: null,
                antecedent: null,
                behavior: null,
                consequence: null,
                location: null,
                notes: null,
                durationSeconds: null,
                recoverySeconds: null,
                peoplePresent: null,
                ownerResponse: null,
              },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        }
        const body = p.includes("/api/journal")
          ? { entries: [] }
          : p.includes("/api/dogs")
            ? { dogs: [{ id: "d1", name: "Biscuit" }] }
            : {};
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    setup();
    await userEvent.type(await screen.findByLabelText(/Quick note/), "Barked at delivery truck");
    await userEvent.click(screen.getByRole("button", { name: /Save moment/ }));

    await waitFor(() =>
      expect(
        calls.some((call) => {
          if (call.method !== "POST" || !call.body) return false;
          const body = JSON.parse(call.body) as { kind: string; note: string };
          return body.kind === "moment" && body.note === "Barked at delivery truck";
        }),
      ).toBe(true),
    );
    expect(await screen.findByText(/What happened right before/)).toBeInTheDocument();
  });

  it("saves a daily check-in", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const p = new URL(url, "http://x").pathname;
        if (init?.method === "POST" && p.includes("/journal")) calls.push(init.body as string);
        const body = p.includes("/api/journal")
          ? { entries: [] }
          : p.includes("/api/dogs")
            ? { dogs: [{ id: "d1", name: "Biscuit" }] }
            : { entry: {} };
        return new Response(JSON.stringify(body), {
          status: init?.method === "POST" ? 201 : 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /Daily check-in/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Better$/ }));
    await userEvent.type(screen.getByLabelText(/Quick note/), "Settled faster today");
    await userEvent.click(screen.getByRole("button", { name: /Save check-in/ }));

    await waitFor(() => {
      const body = JSON.parse(calls[0] ?? "{}") as { kind: string; trend: string; note: string };
      expect(body).toMatchObject({
        kind: "daily_checkin",
        trend: "better",
        note: "Settled faster today",
      });
    });
  });

  it("shows a no-dog state with an add dog link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const p = new URL(url, "http://x").pathname;
        const body = p.includes("/api/dogs") ? { dogs: [] } : { entries: [] };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    setup();
    expect(await screen.findByText(/Add a dog first/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add a dog/ })).toHaveAttribute("href", "/my/dogs/new");
  });
});
```

- [ ] **Step 2: Replace entry card tests**

Replace `apps/web/src/components/journal/entry-card.test.tsx` with tests that use note-first entries:

```tsx
import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryCard } from "./entry-card";

const baseEntry = {
  id: "e1",
  dogId: "d1",
  kind: "moment" as const,
  occurredAt: "2026-05-19T10:00:00.000Z",
  note: "Barked at delivery truck",
  trend: null,
  antecedent: "Truck stopped outside",
  behavior: "Barked twice",
  consequence: "Owner scattered kibble",
  intensity: 4,
  location: "Front door",
  notes: null,
  durationSeconds: 12,
  recoverySeconds: 45,
  peoplePresent: "Owner + walker",
  ownerResponse: "Asked for sit",
  dog: { id: "d1", name: "Biscuit" },
};

afterEach(() => vi.unstubAllGlobals());

function setup(entry = baseEntry) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <ul>
          <EntryCard entry={entry} dogId="d1" />
        </ul>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("EntryCard", () => {
  it("renders note first and hides structured details while collapsed", () => {
    setup();
    expect(screen.getByText(/Barked at delivery truck/)).toBeInTheDocument();
    expect(screen.getByText(/Biscuit/)).toBeInTheDocument();
    expect(screen.queryByText(/Truck stopped outside/)).not.toBeInTheDocument();
  });

  it("expands to show optional ABC/context details", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Expand entry/i }));
    expect(await screen.findByText(/Truck stopped outside/)).toBeInTheDocument();
    expect(screen.getByText(/Barked twice/)).toBeInTheDocument();
    expect(screen.getByText(/Owner \+ walker/)).toBeInTheDocument();
  });

  it("saves edited details through PUT", async () => {
    const calls: Array<{ method?: string; body?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        calls.push({ method: init?.method, body: init?.body as string });
        return new Response(JSON.stringify({ entry: { ...baseEntry, antecedent: "Doorbell rang" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Expand entry/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Edit details/i }));
    const antecedent = (await screen.findByDisplayValue("Truck stopped outside")) as HTMLInputElement;
    fireEvent.change(antecedent, { target: { value: "Doorbell rang" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() =>
      expect(
        calls.some((call) => {
          if (call.method !== "PUT" || !call.body) return false;
          const body = JSON.parse(call.body) as { antecedent?: string };
          return body.antecedent === "Doorbell rang";
        }),
      ).toBe(true),
    );
  });
});
```

- [ ] **Step 3: Run web journal tests to verify failure**

```bash
pnpm --filter @turingcare/web test -- --reporter=verbose src/routes/journal.test.tsx src/components/journal/entry-card.test.tsx
```

Expected: FAIL because the new components and note-first card behavior do not exist.

- [ ] **Step 4: Create quick moment composer**

Create `apps/web/src/components/journal/quick-moment-composer.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { JournalEntry } from "@/lib/journal";
import { useAddEntry } from "@/lib/journal";
import { useState } from "react";
import { toast } from "sonner";

type DogOption = { id: string; name: string };

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function QuickMomentComposer({
  dogs,
  selectedDogId,
  onDogChange,
  onSaved,
}: {
  dogs: DogOption[];
  selectedDogId: string;
  onDogChange: (dogId: string) => void;
  onSaved: (entry: JournalEntry) => void;
}) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  const [intensity, setIntensity] = useState("");
  const add = useAddEntry(selectedDogId);
  const needsDogSelector = dogs.length > 1;

  async function save() {
    const trimmed = note.trim();
    if (!selectedDogId) {
      toast.error(t("journal.dogRequired"));
      return;
    }
    if (!trimmed) {
      toast.error(t("journal.noteRequired"));
      return;
    }
    try {
      const entry = await add.mutateAsync({
        kind: "moment",
        note: trimmed,
        intensity: intensity ? Number(intensity) : undefined,
      });
      setNote("");
      setIntensity("");
      toast.success(t("journal.saved"));
      onSaved(entry);
    } catch {
      toast.error(t("journal.saveFailed"));
    }
  }

  return (
    <section className="space-y-3 rounded border border-silver bg-white p-4">
      <h2 className="font-semibold text-slate">{t("journal.logMoment")}</h2>
      {needsDogSelector && (
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("journal.pickDog")}</span>
          <select className={input} value={selectedDogId} onChange={(e) => onDogChange(e.target.value)}>
            {dogs.map((dog) => (
              <option key={dog.id} value={dog.id}>
                {dog.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="text-sm font-medium text-slate">{t("journal.quickNote")}</span>
        <textarea
          className={input}
          rows={3}
          placeholder={t("journal.quickNotePlaceholder")}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate">{t("journal.optionalIntensity")}</span>
        <select className={input} value={intensity} onChange={(event) => setIntensity(event.target.value)}>
          <option value="">{t("journal.noIntensity")}</option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <Button type="button" disabled={add.isPending} className="bg-slate text-cream" onClick={save}>
        {add.isPending ? t("journal.saving") : t("journal.saveMoment")}
      </Button>
    </section>
  );
}
```

- [ ] **Step 5: Create daily check-in composer**

Create `apps/web/src/components/journal/daily-check-in-composer.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { JournalEntry } from "@/lib/journal";
import { useAddEntry } from "@/lib/journal";
import type { JournalTrend } from "@turingcare/shared";
import { useState } from "react";
import { toast } from "sonner";

type DogOption = { id: string; name: string };

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function DailyCheckInComposer({
  dogs,
  selectedDogId,
  onDogChange,
  onSaved,
}: {
  dogs: DogOption[];
  selectedDogId: string;
  onDogChange: (dogId: string) => void;
  onSaved: (entry: JournalEntry) => void;
}) {
  const { t } = useI18n();
  const [trend, setTrend] = useState<JournalTrend>("same");
  const [note, setNote] = useState("");
  const add = useAddEntry(selectedDogId);
  const needsDogSelector = dogs.length > 1;
  const trends: Array<{ value: JournalTrend; label: string }> = [
    { value: "better", label: t("journal.trendBetter") },
    { value: "same", label: t("journal.trendSame") },
    { value: "harder", label: t("journal.trendHarder") },
  ];

  async function save() {
    const trimmed = note.trim();
    if (!selectedDogId) {
      toast.error(t("journal.dogRequired"));
      return;
    }
    if (!trimmed) {
      toast.error(t("journal.noteRequired"));
      return;
    }
    try {
      const entry = await add.mutateAsync({ kind: "daily_checkin", trend, note: trimmed });
      setTrend("same");
      setNote("");
      toast.success(t("journal.saved"));
      onSaved(entry);
    } catch {
      toast.error(t("journal.saveFailed"));
    }
  }

  return (
    <section className="space-y-3 rounded border border-silver bg-white p-4">
      <h2 className="font-semibold text-slate">{t("journal.dailyCheckIn")}</h2>
      {needsDogSelector && (
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("journal.pickDog")}</span>
          <select className={input} value={selectedDogId} onChange={(event) => onDogChange(event.target.value)}>
            {dogs.map((dog) => (
              <option key={dog.id} value={dog.id}>
                {dog.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("journal.trend")}>
        {trends.map((item) => (
          <Button
            key={item.value}
            type="button"
            variant={trend === item.value ? "default" : "outline"}
            onClick={() => setTrend(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <label className="block">
        <span className="text-sm font-medium text-slate">{t("journal.quickNote")}</span>
        <textarea className={input} rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <Button type="button" disabled={add.isPending} className="bg-slate text-cream" onClick={save}>
        {add.isPending ? t("journal.saving") : t("journal.saveCheckIn")}
      </Button>
    </section>
  );
}
```

- [ ] **Step 6: Create post-save follow-up prompt**

Create `apps/web/src/components/journal/post-save-follow-ups.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { JournalEntry } from "@/lib/journal";
import { useUpdateEntry } from "@/lib/journal";
import { useState } from "react";
import { toast } from "sonner";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function PostSaveFollowUps({
  entry,
  dogId,
  onDone,
}: {
  entry: JournalEntry;
  dogId: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [antecedent, setAntecedent] = useState("");
  const update = useUpdateEntry(dogId);

  if (entry.kind !== "moment") return null;

  async function answer() {
    const trimmed = antecedent.trim();
    if (!trimmed) return;
    try {
      await update.mutateAsync({ entryId: entry.id, body: { antecedent: trimmed } });
      toast.success(t("journal.savedEdit"));
      onDone();
    } catch {
      toast.error(t("journal.saveFailed"));
    }
  }

  return (
    <section className="space-y-3 rounded border border-copper/40 bg-surface-sand p-4">
      <h2 className="font-semibold text-slate">{t("journal.postSaveTitle")}</h2>
      <label className="block">
        <span className="text-sm font-medium text-slate">{t("journal.postSaveAntecedent")}</span>
        <textarea className={input} rows={2} value={antecedent} onChange={(event) => setAntecedent(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={update.isPending || !antecedent.trim()} onClick={answer}>
          {update.isPending ? t("journal.saving") : t("journal.postSaveAnswer")}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("journal.postSaveSkip")}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("journal.postSaveDone")}
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Create structured details editor**

Create `apps/web/src/components/journal/structured-details-editor.tsx` with the same field set as the existing edit form, but based on `JournalEntryUpdateInput` and nullable optional values:

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { JournalEntry } from "@/lib/journal";
import { zodResolver } from "@hookform/resolvers/zod";
import { type JournalEntryUpdateInput, journalEntryUpdateSchema } from "@turingcare/shared";
import { useForm } from "react-hook-form";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

function emptyToNull(value: unknown) {
  return value === "" || value == null ? null : value;
}

function numberOrNull(value: unknown) {
  return value === "" || value == null || Number.isNaN(Number(value)) ? null : Number(value);
}

export function StructuredDetailsEditor({
  entry,
  submitting,
  onSave,
  onCancel,
}: {
  entry: JournalEntry;
  submitting: boolean;
  onSave: (body: JournalEntryUpdateInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<JournalEntryUpdateInput>({
    resolver: zodResolver(journalEntryUpdateSchema),
    defaultValues: {
      note: entry.note,
      occurredAt: String(entry.occurredAt).slice(0, 16),
      trend: entry.trend,
      antecedent: entry.antecedent,
      behavior: entry.behavior,
      consequence: entry.consequence,
      intensity: entry.intensity,
      location: entry.location,
      notes: entry.notes,
      durationSeconds: entry.durationSeconds,
      recoverySeconds: entry.recoverySeconds,
      peoplePresent: entry.peoplePresent,
      ownerResponse: entry.ownerResponse,
    },
  });

  const onSubmit = handleSubmit((values) => onSave(values));
  const optional = <span className="text-slate-soft"> ({t("journal.optional")})</span>;

  return (
    <form
      onSubmit={(event) => {
        event.stopPropagation();
        onSubmit();
      }}
      className="space-y-3 border-t border-silver p-3"
    >
      <label className="block">
        <span className="text-sm">{t("journal.note")}</span>
        <textarea rows={2} className={input} {...register("note")} />
        {errors.note && <span className="text-xs text-red-600">{errors.note.message}</span>}
      </label>
      <label className="block">
        <span className="text-sm">{t("journal.occurredAt")}</span>
        <input type="datetime-local" className={input} {...register("occurredAt")} />
      </label>
      {entry.kind === "daily_checkin" ? (
        <label className="block">
          <span className="text-sm">{t("journal.trend")}</span>
          <select className={input} {...register("trend")}>
            <option value="better">{t("journal.trendBetter")}</option>
            <option value="same">{t("journal.trendSame")}</option>
            <option value="harder">{t("journal.trendHarder")}</option>
          </select>
        </label>
      ) : (
        <>
          <label className="block">
            <span className="text-sm">
              {t("journal.intensity")}
              {optional}
            </span>
            <select className={input} {...register("intensity", { setValueAs: numberOrNull })}>
              <option value="">{t("journal.noIntensity")}</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm">
              {t("journal.antecedent")}
              {optional}
            </span>
            <input className={input} {...register("antecedent", { setValueAs: emptyToNull })} />
          </label>
          <label className="block">
            <span className="text-sm">
              {t("journal.behavior")}
              {optional}
            </span>
            <input className={input} {...register("behavior", { setValueAs: emptyToNull })} />
          </label>
          <label className="block">
            <span className="text-sm">
              {t("journal.consequence")}
              {optional}
            </span>
            <input className={input} {...register("consequence", { setValueAs: emptyToNull })} />
          </label>
        </>
      )}
      <label className="block">
        <span className="text-sm">
          {t("journal.location")}
          {optional}
        </span>
        <input className={input} {...register("location", { setValueAs: emptyToNull })} />
      </label>
      <label className="block">
        <span className="text-sm">
          {t("journal.duration")}
          {optional}
        </span>
        <input type="number" min={0} className={input} {...register("durationSeconds", { setValueAs: numberOrNull })} />
      </label>
      <label className="block">
        <span className="text-sm">
          {t("journal.recovery")}
          {optional}
        </span>
        <input type="number" min={0} className={input} {...register("recoverySeconds", { setValueAs: numberOrNull })} />
      </label>
      <label className="block">
        <span className="text-sm">
          {t("journal.peoplePresent")}
          {optional}
        </span>
        <input className={input} {...register("peoplePresent", { setValueAs: emptyToNull })} />
      </label>
      <label className="block">
        <span className="text-sm">
          {t("journal.ownerResponse")}
          {optional}
        </span>
        <textarea rows={2} className={input} {...register("ownerResponse", { setValueAs: emptyToNull })} />
      </label>
      <label className="block">
        <span className="text-sm">
          {t("journal.notes")}
          {optional}
        </span>
        <textarea rows={2} className={input} {...register("notes", { setValueAs: emptyToNull })} />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting || submitting} className="bg-slate text-cream">
          {isSubmitting || submitting ? t("journal.saving") : t("journal.update")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("journal.cancel")}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 8: Refactor entry card**

Replace `apps/web/src/components/journal/entry-card.tsx` with a note-first card that imports `StructuredDetailsEditor`, `type JournalEntry`, `useDeleteEntry`, and `useUpdateEntry`. Keep the existing collapsed/expanded/editing state model, but display:

```tsx
<p className="font-medium text-slate">{displayEntry.note}</p>
<span className="text-slate-soft block">
  {displayEntry.dog?.name ? `${displayEntry.dog.name} · ` : ""}
  {occurredText} · {kindLabel}
  {typeof displayEntry.intensity === "number" ? ` · ${t("journal.intensity")}: ${displayEntry.intensity}` : ""}
  {displayEntry.trend ? ` · ${trendLabel[displayEntry.trend]}` : ""}
</span>
```

Expanded mode should render ABC/context values through the existing `fmt()` helper and show `t("journal.detailsEmpty")` when all detail fields are empty. Editing mode should call:

```tsx
await upd.mutateAsync({ entryId: displayEntry.id, body });
toast.success(t("journal.savedEdit"));
setMode("expanded");
```

Use the button label `t("journal.editDetails")` instead of the old `✎ Edit`.

- [ ] **Step 9: Refactor journal route**

Replace `apps/web/src/routes/journal.tsx` with a global journal hub:

```tsx
import { DailyCheckInComposer } from "@/components/journal/daily-check-in-composer";
import { EntryCard } from "@/components/journal/entry-card";
import { PostSaveFollowUps } from "@/components/journal/post-save-follow-ups";
import { QuickMomentComposer } from "@/components/journal/quick-moment-composer";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDogs } from "@/lib/dogs";
import { type JournalEntry, useJournal } from "@/lib/journal";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function Journal() {
  const { t } = useI18n();
  const { data: dogs } = useDogs();
  const [searchParams, setSearchParams] = useSearchParams();
  const dogFromUrl = searchParams.get("dogId") ?? "";
  const [selectedDogId, setSelectedDogId] = useState(dogFromUrl);
  const [mode, setMode] = useState<"moment" | "daily_checkin">("moment");
  const [followUpEntry, setFollowUpEntry] = useState<JournalEntry | null>(null);

  useEffect(() => {
    if (dogFromUrl) setSelectedDogId(dogFromUrl);
  }, [dogFromUrl]);

  useEffect(() => {
    if (!selectedDogId && dogs?.length === 1) setSelectedDogId(dogs[0]?.id ?? "");
  }, [dogs, selectedDogId]);

  const filterDogId = dogFromUrl || undefined;
  const { data: entries, isError } = useJournal(filterDogId);
  const dogOptions = dogs ?? [];
  const composerDogId = selectedDogId || dogOptions[0]?.id || "";

  const dogNameById = useMemo(
    () => new Map(dogOptions.map((dog) => [dog.id, dog.name])),
    [dogOptions],
  );

  function changeFilter(nextDogId: string) {
    setFollowUpEntry(null);
    if (nextDogId) setSearchParams({ dogId: nextDogId });
    else setSearchParams({});
    setSelectedDogId(nextDogId || dogOptions[0]?.id || "");
  }

  if (dogs && dogs.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-2xl font-bold text-slate">{t("journal.title")}</h1>
        <p className="text-slate-soft">{t("journal.noDogs")}</p>
        <Button asChild className="bg-slate text-cream">
          <Link to="/my/dogs/new">{t("journal.addDog")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate">{t("journal.title")}</h1>
        <label className="block min-w-48">
          <span className="text-sm font-medium text-slate">{t("journal.pickDog")}</span>
          <select className={input} value={dogFromUrl} onChange={(event) => changeFilter(event.target.value)}>
            <option value="">{t("journal.filterAllDogs")}</option>
            {dogOptions.map((dog) => (
              <option key={dog.id} value={dog.id}>
                {dog.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant={mode === "moment" ? "default" : "outline"} onClick={() => setMode("moment")}>
          {t("journal.logMoment")}
        </Button>
        <Button
          type="button"
          variant={mode === "daily_checkin" ? "default" : "outline"}
          onClick={() => setMode("daily_checkin")}
        >
          {t("journal.dailyCheckIn")}
        </Button>
      </div>

      {mode === "moment" ? (
        <QuickMomentComposer
          dogs={dogOptions}
          selectedDogId={composerDogId}
          onDogChange={setSelectedDogId}
          onSaved={(entry) => setFollowUpEntry({ ...entry, dog: { id: entry.dogId, name: dogNameById.get(entry.dogId) ?? "" } })}
        />
      ) : (
        <DailyCheckInComposer
          dogs={dogOptions}
          selectedDogId={composerDogId}
          onDogChange={setSelectedDogId}
          onSaved={() => setFollowUpEntry(null)}
        />
      )}

      {followUpEntry && (
        <PostSaveFollowUps
          entry={followUpEntry}
          dogId={followUpEntry.dogId}
          onDone={() => setFollowUpEntry(null)}
        />
      )}

      {isError && <p className="text-red-600">{t("journal.loadError")}</p>}
      {entries?.length === 0 && <p className="text-slate-soft">{t("journal.empty")}</p>}
      <ul className="space-y-2">
        {entries?.map((entry) => (
          <EntryCard
            key={entry.id}
            dogId={entry.dogId}
            entry={{
              ...entry,
              occurredAt: String(entry.occurredAt),
              trend: entry.trend ?? null,
              intensity: entry.intensity ?? null,
              antecedent: entry.antecedent ?? null,
              behavior: entry.behavior ?? null,
              consequence: entry.consequence ?? null,
              durationSeconds: entry.durationSeconds ?? null,
              recoverySeconds: entry.recoverySeconds ?? null,
              peoplePresent: entry.peoplePresent ?? null,
              ownerResponse: entry.ownerResponse ?? null,
              location: entry.location ?? null,
              notes: entry.notes ?? null,
            }}
          />
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 10: Run web journal tests**

```bash
pnpm --filter @turingcare/web test -- --reporter=verbose src/routes/journal.test.tsx src/components/journal/entry-card.test.tsx src/i18n/i18n.test.tsx
```

Expected: PASS for route, entry card, and i18n tests.

- [ ] **Step 11: Commit**

```bash
git status --short
git add apps/web/src/components/journal/quick-moment-composer.tsx apps/web/src/components/journal/daily-check-in-composer.tsx apps/web/src/components/journal/post-save-follow-ups.tsx apps/web/src/components/journal/structured-details-editor.tsx apps/web/src/components/journal/entry-card.tsx apps/web/src/components/journal/entry-card.test.tsx apps/web/src/routes/journal.tsx apps/web/src/routes/journal.test.tsx
git commit -m "feat(web): simplify journal entry capture flow" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Dog detail and overview entry points

**Files:**
- Modify: `apps/web/src/routes/dog-detail.tsx`
- Modify: `apps/web/src/routes/dogs.test.tsx`
- Modify: `apps/web/src/routes/overview.tsx`
- Modify: `apps/web/src/routes/overview.test.tsx`

- [ ] **Step 1: Add dog detail test for journal entry point**

In `apps/web/src/routes/dogs.test.tsx`, add this assertion to the `DogDetail` test after the dog name assertion:

```ts
    expect(screen.getByRole("link", { name: /Log moment/i })).toHaveAttribute(
      "href",
      "/my/journal?dogId=d1",
    );
```

- [ ] **Step 2: Update overview test note-first payload**

In `apps/web/src/routes/overview.test.tsx`, change the recent activity stub from:

```ts
{ dogName: "Biscuit", behavior: "Barked", occurredAt: "2026-05-19T10:00:00.000Z" },
```

to:

```ts
{ dogName: "Biscuit", behavior: "Barked at delivery truck", occurredAt: "2026-05-19T10:00:00.000Z" },
```

Change the final assertion to:

```ts
    expect(screen.getByText(/Barked at delivery truck/)).toBeInTheDocument();
```

- [ ] **Step 3: Run tests to verify failure**

```bash
pnpm --filter @turingcare/web test -- --reporter=verbose src/routes/dogs.test.tsx src/routes/overview.test.tsx
```

Expected: dog detail test FAILS because the link is not rendered; overview test may PASS after stub-only change.

- [ ] **Step 4: Add dog-specific journal link**

In `apps/web/src/routes/dog-detail.tsx`, add this button next to the existing edit button inside the `<div className="flex gap-2">` around line 59:

```tsx
          <Button asChild className="bg-slate text-cream">
            <Link to={`/my/journal?dogId=${dog.id}`}>{t("journal.logMoment")}</Link>
          </Button>
```

No route change is needed because `/my/journal?dogId=<id>` is handled by `Journal`.

- [ ] **Step 5: Confirm overview quick action still points to journal**

`apps/web/src/routes/overview.tsx` already links the primary quick action to `/my/journal`. Keep that target. If the copy changed in i18n to "Log moment", update `overview.qLog` in both locales:

```ts
qLog: "Log moment",
```

```ts
qLog: "Registrar momento",
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @turingcare/web test -- --reporter=verbose src/routes/dogs.test.tsx src/routes/overview.test.tsx src/i18n/i18n.test.tsx
```

Expected: PASS for dog detail, overview, and i18n parity.

- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/routes/dog-detail.tsx apps/web/src/routes/dogs.test.tsx apps/web/src/routes/overview.tsx apps/web/src/routes/overview.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): add dog-specific journal entry points" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Final validation and cleanup

**Files:**
- Validate all changed files
- No new application files in this task unless validation reveals a defect directly caused by this plan

- [ ] **Step 1: Run targeted package tests**

```bash
pnpm --filter @turingcare/shared test
pnpm --filter @turingcare/api test -- --reporter=verbose src/routes/dogs.test.ts src/routes/journal.test.ts src/routes/overview.test.ts src/lib/brief.test.ts src/db/schema.test.ts src/app.test.ts
pnpm --filter @turingcare/web test -- --reporter=verbose src/routes/journal.test.tsx src/components/journal/entry-card.test.tsx src/routes/dogs.test.tsx src/routes/overview.test.tsx src/i18n/i18n.test.tsx
```

Expected: all targeted tests PASS.

- [ ] **Step 2: Run typecheck for affected workspaces**

```bash
pnpm --filter @turingcare/shared typecheck
pnpm --filter @turingcare/api typecheck
pnpm --filter @turingcare/web typecheck
```

Expected: all typechecks PASS.

- [ ] **Step 3: Run repo lint**

```bash
pnpm lint
```

Expected: Biome reports no errors.

- [ ] **Step 4: Run full tests when targeted validation is green**

```bash
pnpm test
```

Expected: all workspace test suites PASS.

- [ ] **Step 5: Inspect final diff**

```bash
git status --short
git --no-pager diff --stat origin/main...HEAD
git --no-pager diff --check
```

Expected: only planned files are changed; `diff --check` reports no whitespace errors.

---

## Self-Review Notes

- **Spec coverage:** Tasks cover required quick moment, daily check-in, optional post-save antecedent prompt, dog-specific `/my/journal?dogId=<id>`, global all-dogs journal, optional ABC/context fields, note-first Behavior Brief, localized strings, migration/backfill, owner-scoped 401/404 behavior, and targeted tests.
- **Scope control:** Voice, photos, AI extraction, trainer directory changes, separate dog-only journal routes, and Behavior Brief visual redesign are not included.
- **Type consistency:** Shared types are `JournalEntryCreateInput`, `JournalEntryUpdateInput`, `JournalEntryKind`, and `JournalTrend`; web hooks/components use those names consistently.
