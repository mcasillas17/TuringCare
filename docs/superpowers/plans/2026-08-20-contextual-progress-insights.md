# Contextual Progress Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first Personalized Training Gate 2 slice: current-level exact-context reliability, one conservative next-practice action, a compact This Week summary, and full supporting evidence in expanded skill detail.

**Architecture:** Reuse Gate 1's structured practice evidence and curriculum anchors. A pure API policy derives contextual status from a bounded 21-day, current-level/current-version evidence slice; a separate data loader serves one owned-skill detail route and batched focus summaries. Manual evidence contributes only after the owner confirms that practice occurred at the current level, which the server stamps while holding the skill lock. React consumes shared DTOs through the typed Hono client, renders the same policy output on both surfaces, and keeps practice usable when insight loading fails.

**Tech Stack:** Node 22, pnpm 11, TypeScript, Zod, Hono, Drizzle/Postgres, React 19, TanStack Query, Vitest, Testing Library, Playwright, Biome.

---

## Scope and execution safety

The local `main` used to write this plan is intentionally not an implementation
base: it contains unpublished planning commits and is behind merged Gate 1.
At execution time, invoke `using-git-worktrees` and create
`feat/contextual-progress-insights` from `origin/main`. Bring the approved spec
and this plan into that worktree without resetting, rewriting, or deleting the
local planning history.

Run all implementation commands with Node 22 and the pinned pnpm:

```bash
corepack enable
node --version
pnpm --version
```

Expected:

```text
v22.x.x
11.x.x
```

API tests require the repository Postgres and root environment:

```bash
test -f .env || cp .env.example .env
docker compose up -d --wait
set -a && . ./.env && set +a
pnpm --filter @turingcare/api db:migrate
```

No database migration is planned. Gate 1 already added every persisted evidence
field and `practice_sessions_skill_occurred_idx`. Stop and inspect the query
plan before adding an index or migration.

## File map

**Create:**

- `packages/shared/src/contextual-progress.ts` — contextual status, exact-context,
  next-action, summary, and telemetry DTOs.
- `packages/shared/src/contextual-progress.test.ts` — contract and validation
  coverage.
- `apps/api/src/lib/context-adjacency.ts` — explicit controlled-value adjacency
  and direction-aware one-dimension changes.
- `apps/api/src/lib/context-adjacency.test.ts` — all direction and boundary
  cases.
- `apps/api/src/lib/contextual-progress.ts` — pure 21-day grouping, status,
  ranking, Not observed candidate, and next-action policy.
- `apps/api/src/lib/contextual-progress.test.ts` — deterministic policy tests.
- `apps/api/src/lib/contextual-progress-data.ts` — bounded persistence reads and
  current-level/current-version filtering.
- `apps/api/src/routes/contextual-progress.test.ts` — owned route, manual
  anchoring, batching, and telemetry integration tests.
- `apps/web/src/lib/contextual-progress.ts` — stable keys, typed detail query,
  and typed telemetry mutation.
- `apps/web/src/lib/training-safety-cache.ts` — shared dog-scoped safety
  invalidation boundary.
- `apps/web/src/lib/dogs-safety-cache.test.tsx`.
- `apps/web/src/lib/journal-safety-cache.test.tsx`.
- `apps/web/src/components/progress/contextual-progress-detail.tsx` — expanded
  skill evidence, empty/error states, and next-action CTA.
- `apps/web/src/components/progress/contextual-progress-detail.test.tsx`.
- `apps/web/src/components/week/contextual-progress-summary.tsx` — compact
  decision-first weekly summary.
- `apps/web/src/components/week/contextual-progress-summary.test.tsx`.

**Modify:**

- `packages/shared/src/practice-evidence.ts` — request-only
  `confirmCurrentLevel` and mutual exclusion with `practicedTarget`.
- `packages/shared/src/practice-evidence.test.ts`.
- `packages/shared/src/progress.ts` — compose practice-session fields before
  applying cross-field anchor validation.
- `packages/shared/src/progress.test.ts`.
- `packages/shared/src/index.ts`.
- `apps/api/src/routes/dogs.ts` — manual anchor stamping, detail route, and
  authenticated contextual telemetry route.
- `apps/api/src/lib/focus.ts` — batch current evidence for focused skills and
  attach compact summaries.
- `apps/api/src/routes/focus.test.ts`.
- `apps/api/src/routes/practice-evidence.test.ts`.
- `apps/api/src/routes/telemetry.test.ts`.
- `apps/api/src/telemetry/events.ts`.
- `apps/api/src/telemetry/events.test.ts`.
- `apps/web/src/lib/progress.ts` — practice-derived invalidation reusing the
  safety boundary.
- `apps/web/src/lib/dogs.ts` — concern and dog-deletion safety invalidation.
- `apps/web/src/lib/journal.ts` — journal safety invalidation.
- `apps/web/src/lib/guided-setup.ts` — behavior/progress action invalidation.
- `apps/web/src/lib/progress.test.tsx`.
- `apps/web/src/lib/guided-setup.test.tsx`.
- `apps/web/src/lib/weekly-focus.ts` — shared summary type on focused skills.
- `apps/web/src/components/progress/session-form.tsx` — current-level
  confirmation.
- `apps/web/src/components/progress/session-form.test.tsx`.
- `apps/web/src/components/progress/outcome-quick-capture.tsx` — confirmation
  when no audited suggestion target exists.
- `apps/web/src/components/progress/outcome-quick-capture.test.tsx`.
- `apps/web/src/components/progress/progress-panel.tsx` — fetch/render detail
  only while a skill is expanded.
- `apps/web/src/components/progress/progress-panel.test.tsx`.
- `apps/web/src/routes/dog-week.tsx` — render the compact summary and preserve
  practice controls on insight errors.
- `apps/web/src/routes/dog-week.test.tsx`.
- `apps/web/src/i18n/en.ts`.
- `apps/web/src/i18n/es.ts`.
- `apps/web/src/i18n/i18n.test.tsx`.
- `e2e/critical-owner-journey.spec.ts`.
- `docs/PROJECT-LOG.md`.

## Shared invariants

- The evidence interval is inclusive:
  `[now - 21 * 24 hours, now]`.
- Only evidence matching both the current owner-confirmed level and
  `CURRICULUM_VERSION` contributes.
- `practiceDay` supplies distinct owner-local days; a missing day cannot support
  Reliable.
- Exact-context identity contains cue support, environment, distance, duration
  band, and distraction, including explicit `null` positions.
- An outcome with all five context positions null remains valid history but
  does not produce a contextual status.
- Reliable requires `went_well` on at least two distinct days and zero
  `too_hard` outcomes in that exact context.
- Any observed context that is not Reliable is Developing.
- A Reliable context never recommends a reviewed harder target already observed
  as non-Reliable or with any `too_hard` result; that failed target is excluded
  from Developing-repeat fallback selection.
- At most one Not observed row is derived from a real observed context by one
  reviewed adjacent change.
- Contextual responses carry the server-owned active safety decision. When it
  suppresses exercises, `nextPracticeAction` and action-derived synthetic
  `not_observed` rows are removed; observed Reliable/Developing evidence remains
  available for guidance.
- Manual confirmation stamps server-owned level/version but leaves
  `practiceVariant` and `suggestionId` null, so it cannot support advancement.
- Every new nested resource returns `404`, not `403`, when it is absent or
  belongs to another owner.
- Insight failures never prevent session create, evidence update, or delete.

---

### Task 1: Shared contextual-progress and manual-anchor contracts

**Files:**

- Create: `packages/shared/src/contextual-progress.ts`
- Create: `packages/shared/src/contextual-progress.test.ts`
- Modify: `packages/shared/src/practice-evidence.ts`
- Modify: `packages/shared/src/practice-evidence.test.ts`
- Modify: `packages/shared/src/progress.ts`
- Modify: `packages/shared/src/progress.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing contract tests**

Add tests that require the manual confirmation flag to be request-only and
mutually exclusive with an audited suggestion target:

```ts
it("accepts explicit current-level confirmation", () => {
  expect(
    practiceEvidenceSchema.parse({
      outcome: "went_well",
      confirmCurrentLevel: true,
    }),
  ).toEqual({
    outcome: "went_well",
    confirmCurrentLevel: true,
  });
});

it("rejects manual and suggestion anchors together", () => {
  expect(
    practiceEvidenceSchema.safeParse({
      confirmCurrentLevel: true,
      practicedTarget: {
        suggestionId: "00000000-0000-4000-8000-000000000001",
        variant: "primary",
      },
    }).success,
  ).toBe(false);
});

it("rejects current-level confirmation without structured training evidence", () => {
  expect(
    practiceEvidenceSchema.safeParse({
      confirmCurrentLevel: true,
      safetySignal: "injury_or_pain",
    }).success,
  ).toBe(false);
});
```

Create `contextual-progress.test.ts` with a complete DTO fixture:

```ts
import { describe, expect, it } from "vitest";
import {
  contextualProgressEventSchema,
  contextualProgressSchema,
} from "./contextual-progress";

const fixture = {
  window: {
    startsAt: "2026-07-30T12:00:00.000Z",
    endsAt: "2026-08-20T12:00:00.000Z",
    days: 21,
  },
  curriculumLevel: 2,
  curriculumVersion: "2026-08-11",
  policyVersion: "2026-08-20",
  strongestContext: null,
  nextPracticeAction: null,
  exactContexts: [],
};

describe("contextualProgressSchema", () => {
  it("accepts the neutral empty response", () => {
    expect(contextualProgressSchema.parse(fixture)).toEqual(fixture);
  });

  it("rejects an unknown status and direction", () => {
    expect(
      contextualProgressSchema.safeParse({
        ...fixture,
        strongestContext: {
          context: {
            cueSupport: null,
            environment: "home_quiet",
            distance: null,
            durationBand: null,
            distraction: "none",
          },
          status: "mastered",
          successfulDistinctDays: 2,
          latestOutcome: "went_well",
          lastObservedAt: "2026-08-20T12:00:00.000Z",
          lastSuccessfulAt: "2026-08-20T12:00:00.000Z",
        },
      }).success,
    ).toBe(false);
  });
});

describe("contextualProgressEventSchema", () => {
  it("accepts only bounded scalar contextual telemetry", () => {
    expect(
      contextualProgressEventSchema.parse({
        name: "training.context_insight_viewed",
        surface: "week",
        strongestStatus: "developing",
        hasNextAction: true,
      }),
    ).toEqual({
      name: "training.context_insight_viewed",
      surface: "week",
      strongestStatus: "developing",
      hasNextAction: true,
    });
  });
});
```

- [ ] **Step 2: Run the tests and confirm RED**

```bash
pnpm --filter @turingcare/shared exec vitest run \
  src/practice-evidence.test.ts src/contextual-progress.test.ts
```

Expected: failure because `confirmCurrentLevel` and
`./contextual-progress` do not exist.

- [ ] **Step 3: Add the shared contracts**

Extract the raw fields so the standalone evidence schema and the larger
practice-session schema can each apply the same cross-field rule after object
composition:

```ts
export const practiceEvidenceFields = {
  outcome: z.enum(practiceOutcomeValues).nullable().optional(),
  cueSupport: z.enum(cueSupportValues).nullable().optional(),
  environment: z.enum(environmentValues).nullable().optional(),
  distance: z.enum(distanceValues).nullable().optional(),
  durationBand: z.enum(durationBandValues).nullable().optional(),
  distraction: z.enum(distractionValues).nullable().optional(),
  safetySignal: z.enum(safetySignalValues).nullable().optional(),
  confirmCurrentLevel: z.literal(true).optional(),
  practicedTarget: z
    .object({
      suggestionId: z.string().uuid(),
      variant: z.enum(practicedTargetVariantValues),
    })
    .nullable()
    .optional(),
};

type PracticeAnchorInput = {
  outcome?: PracticeOutcome | null;
  cueSupport?: CueSupport | null;
  environment?: PracticeEnvironment | null;
  distance?: PracticeDistance | null;
  durationBand?: PracticeDurationBand | null;
  distraction?: PracticeDistraction | null;
  confirmCurrentLevel?: true;
  practicedTarget?: {
    suggestionId: string;
    variant: "primary" | "fallback";
  } | null;
};

export function isValidPracticeEvidenceAnchor(input: PracticeAnchorInput): boolean {
  if (!input.confirmCurrentLevel) return true;
  if (input.practicedTarget) return false;
  return Boolean(
    input.outcome ??
      input.cueSupport ??
      input.environment ??
      input.distance ??
      input.durationBand ??
      input.distraction,
  );
}

export const practiceEvidenceSchema = z
  .object(practiceEvidenceFields)
  .refine(
    isValidPracticeEvidenceAnchor,
    "Current-level confirmation requires structured evidence and no suggestion target",
  );
```

In `packages/shared/src/progress.ts`, replace `.merge(practiceEvidenceSchema)`
and the later `.extend(...)` with two schemas composed from the same raw fields:

```ts
const practiceSessionFields = {
  occurredAt: z.string().min(1, "Date is required"),
  durationMinutes: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional(),
  ...practiceEvidenceFields,
};

export const practiceSessionSchema = z
  .object(practiceSessionFields)
  .refine(
    isValidPracticeEvidenceAnchor,
    "Current-level confirmation requires structured evidence and no suggestion target",
  );

export const practiceSessionApiSchema = z
  .object({
    ...practiceSessionFields,
    occurredAt: z.union([offsetOccurredAtSchema, legacyOccurredAtSchema]),
  })
  .refine(
    isValidPracticeEvidenceAnchor,
    "Current-level confirmation requires structured evidence and no suggestion target",
  );
```

Add a `progress.test.ts` assertion that the full session schema accepts
structured manual confirmation and rejects the combined anchor.

Create `contextual-progress.ts` with controlled shared types:

```ts
import { z } from "zod";
import {
  cueSupportValues,
  distanceValues,
  distractionValues,
  durationBandValues,
  environmentValues,
  practiceDimensionValues,
  practiceOutcomeValues,
} from "./practice-evidence";
import { suggestionSafetySchema } from "./suggestion";

export const contextualStatusValues = [
  "reliable",
  "developing",
  "not_observed",
] as const;
export const nextPracticeDirectionValues = ["easier", "harder", "repeat"] as const;
export const contextualProgressSurfaceValues = ["week", "skill_detail"] as const;

export const exactPracticeContextSchema = z.object({
  cueSupport: z.enum(cueSupportValues).nullable(),
  environment: z.enum(environmentValues).nullable(),
  distance: z.enum(distanceValues).nullable(),
  durationBand: z.enum(durationBandValues).nullable(),
  distraction: z.enum(distractionValues).nullable(),
});

export const exactContextEvidenceSchema = z.object({
  context: exactPracticeContextSchema,
  status: z.enum(contextualStatusValues),
  successfulDistinctDays: z.number().int().nonnegative(),
  latestOutcome: z.enum(practiceOutcomeValues).nullable(),
  lastObservedAt: z.string().datetime().nullable(),
  lastSuccessfulAt: z.string().datetime().nullable(),
});

export const nextPracticeActionSchema = z.object({
  ruleId: z.enum([
    "ease_after_too_hard",
    "advance_reliable_context",
    "repeat_developing_context",
  ]),
  direction: z.enum(nextPracticeDirectionValues),
  context: exactPracticeContextSchema,
  changedDimension: z.enum(practiceDimensionValues).nullable(),
});

export const contextualProgressSummarySchema = z.object({
  strongestContext: exactContextEvidenceSchema.nullable(),
  nextPracticeAction: nextPracticeActionSchema.nullable(),
  safety: suggestionSafetySchema.nullable(),
});

export const contextualProgressSchema = contextualProgressSummarySchema.extend({
  window: z.object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    days: z.literal(21),
  }),
  curriculumLevel: z.number().int().min(1).max(5),
  curriculumVersion: z.string().min(1),
  policyVersion: z.string().min(1),
  exactContexts: z.array(exactContextEvidenceSchema),
});

export const contextualProgressEventSchema = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("training.context_insight_viewed"),
    surface: z.enum(contextualProgressSurfaceValues),
    strongestStatus: z.enum(contextualStatusValues).nullable(),
    hasNextAction: z.boolean(),
  }),
  z.object({
    name: z.literal("training.context_next_action_used"),
    surface: z.enum(contextualProgressSurfaceValues),
    ruleId: nextPracticeActionSchema.shape.ruleId,
    direction: z.enum(nextPracticeDirectionValues),
  }),
]);

export type ExactPracticeContext = z.infer<typeof exactPracticeContextSchema>;
export type ExactContextEvidence = z.infer<typeof exactContextEvidenceSchema>;
export type NextPracticeAction = z.infer<typeof nextPracticeActionSchema>;
export type ContextualProgressSummary = z.infer<typeof contextualProgressSummarySchema>;
export type ContextualProgress = z.infer<typeof contextualProgressSchema>;
export type ContextualProgressEvent = z.infer<typeof contextualProgressEventSchema>;
```

Export it from `packages/shared/src/index.ts`.

- [ ] **Step 4: Run shared tests and typecheck**

```bash
pnpm --filter @turingcare/shared exec vitest run \
  src/practice-evidence.test.ts src/contextual-progress.test.ts
pnpm --filter @turingcare/shared typecheck
```

Expected: all selected tests pass and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/practice-evidence.ts \
  packages/shared/src/practice-evidence.test.ts \
  packages/shared/src/progress.ts \
  packages/shared/src/progress.test.ts \
  packages/shared/src/contextual-progress.ts \
  packages/shared/src/contextual-progress.test.ts \
  packages/shared/src/index.ts
git commit -m "feat: define contextual progress contracts"
```

---

### Task 2: Server-owned manual current-level anchoring

**Files:**

- Modify: `apps/api/src/routes/dogs.ts`
- Modify: `apps/api/src/routes/practice-evidence.test.ts`
- Modify: `apps/api/src/routes/telemetry.test.ts`

- [ ] **Step 1: Write failing API integration tests**

Add cases to `practice-evidence.test.ts` that create a catalog skill at level 3,
then assert:

```ts
expect(manual.status).toBe(201);
expect(await manual.json()).toMatchObject({
  session: {
    outcome: "went_well",
    curriculumLevel: 3,
    curriculumVersion: CURRICULUM_VERSION,
    practiceVariant: null,
    suggestionId: null,
  },
  anchorRejected: null,
});
```

Also cover:

```ts
expect(unconfirmedSession.curriculumLevel).toBeNull();
expect(combinedAnchor.status).toBe(400);
expect(reanchored.body.anchorRejected).toBe("target_locked");
expect(reanchored.body.session.curriculumLevel).toBe(originalLevel);
```

For an evidence PATCH on an unanchored quick-log session, confirm that
`confirmCurrentLevel: true` stamps the level held under the transaction lock.
Add a concurrency test that races level change and manual anchoring and asserts
the session receives either the old or new locked level, never a client value
or a mismatched curriculum version.

- [ ] **Step 2: Run the focused route tests and confirm RED**

```bash
pnpm --filter @turingcare/api exec vitest run \
  src/routes/practice-evidence.test.ts
```

Expected: assertions fail because manual confirmation is currently ignored.

- [ ] **Step 3: Add one reusable manual-anchor resolver**

In `dogs.ts`, add a small local helper used by both POST and PATCH transaction
paths:

```ts
function resolveManualAnchor(
  confirmCurrentLevel: true | undefined,
  lockedSkill: typeof trainingSkills.$inferSelect,
  resolvedPracticeDay: string | null,
  existing?: typeof practiceSessions.$inferSelect,
):
  | { kind: "none" }
  | {
      kind: "rejected";
      reason: "practice_day_required" | "target_locked";
    }
  | { kind: "accepted"; level: number; curriculumVersion: string } {
  if (!confirmCurrentLevel) return { kind: "none" };
  if (!resolvedPracticeDay) {
    return { kind: "rejected", reason: "practice_day_required" };
  }
  if (existing?.curriculumLevel !== null && existing?.curriculumLevel !== undefined) {
    return { kind: "rejected", reason: "target_locked" };
  }
  return {
    kind: "accepted",
    level: lockedSkill.confidence,
    curriculumVersion: CURRICULUM_VERSION,
  };
}
```

Use only the locked skill row and the server-derived `practiceDay`. On accepted
manual anchors set:

```ts
curriculumLevel: manualAnchor.level,
curriculumVersion: manualAnchor.curriculumVersion,
practiceVariant: null,
suggestionId: null,
```

Do not set `practiceVariant`; advancement continues to require primary
suggestion-linked evidence. Preserve the existing partial-save behavior for a
PATCH whose anchor is rejected: return `anchorRejected: "target_locked"` while
saving otherwise valid evidence fields.

Keep the same `{ session, anchorRejected }` response shape in the web
`useLogSession` mutation. `SessionForm` maps `practice_day_required`,
`target_locked`, and other non-null rejection values to the existing localized
partial-save success copy while still reporting that the session was saved.

- [ ] **Step 4: Add privacy-safe practice telemetry properties**

Change `training.practice_logged` to include scalar properties derived from the
saved server row:

```ts
props: {
  outcome: result.session.outcome ?? "unanswered",
  hasCueSupport: result.session.cueSupport !== null,
  hasEnvironment: result.session.environment !== null,
  hasDistance: result.session.distance !== null,
  hasDurationBand: result.session.durationBand !== null,
  hasDistraction: result.session.distraction !== null,
  levelAnchored: result.session.curriculumLevel !== null,
  anchorSource:
    result.session.suggestionId !== null
      ? "suggestion"
      : result.session.curriculumLevel !== null
        ? "manual_confirmation"
        : "unanchored",
},
```

Update telemetry assertions. Do not include notes, dog name, skill name, or a
client identity.

- [ ] **Step 5: Run focused API tests and typecheck**

```bash
pnpm --filter @turingcare/api exec vitest run \
  src/routes/practice-evidence.test.ts src/routes/telemetry.test.ts
pnpm --filter @turingcare/api typecheck
```

Expected: selected tests pass and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/dogs.ts \
  apps/api/src/routes/practice-evidence.test.ts \
  apps/api/src/routes/telemetry.test.ts
git commit -m "feat: anchor confirmed manual practice"
```

---

### Task 3: Direction-aware context adjacency

**Files:**

- Create: `apps/api/src/lib/context-adjacency.ts`
- Create: `apps/api/src/lib/context-adjacency.test.ts`

- [ ] **Step 1: Write failing adjacency tests**

Cover:

```ts
expect(
  adjacentContext(base, "distraction", "harder", "reduce_distractions"),
).toMatchObject({
  changedDimension: "distraction",
  context: { distraction: "moderate" },
});

expect(
  adjacentContext(
    { ...base, distance: "across_room" },
    "distance",
    "easier",
    "increase_trigger_distance",
  ),
).toMatchObject({ context: { distance: "across_yard" } });

expect(
  adjacentContext(
    { ...base, distance: "across_room" },
    "distance",
    "easier",
    "decrease_owner_distance",
  ),
).toMatchObject({ context: { distance: "few_steps" } });

expect(
  adjacentContext(
    { ...base, distraction: "strong" },
    "distraction",
    "harder",
    "reduce_distractions",
  ),
).toBeNull();
```

Test every dimension boundary, null source values, and verify exactly one field
changes.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @turingcare/api exec vitest run src/lib/context-adjacency.test.ts
```

Expected: module resolution failure.

- [ ] **Step 3: Implement explicit ordered values and strategy-aware distance**

Create:

```ts
import type {
  EasingStrategy,
  ExactPracticeContext,
  PracticeDimension,
} from "@turingcare/shared";

const orders = {
  cue_support: ["food_lure", "hand_signal", "verbal_cue", "no_extra_help"],
  environment: ["home_quiet", "home_busy", "yard", "quiet_outdoor", "busy_outdoor"],
  duration: [
    "under_5_seconds",
    "about_15_seconds",
    "about_30_seconds",
    "one_to_two_minutes",
    "five_to_fifteen_minutes",
    "about_30_minutes",
    "one_to_two_hours",
    "half_day_or_more",
  ],
  distraction: ["none", "mild", "moderate", "strong"],
} as const;

export type AdjacentContext = {
  context: ExactPracticeContext;
  changedDimension: PracticeDimension;
};

export function adjacentContext(
  source: ExactPracticeContext,
  dimension: PracticeDimension,
  direction: "easier" | "harder",
  strategy: EasingStrategy,
): AdjacentContext | null {
  const field = dimension === "duration" ? "durationBand" : dimension;
  const current = source[field];
  if (current === null) return null;

  if (dimension === "distance") {
    const distanceOrder = [
      "at_side",
      "few_steps",
      "across_room",
      "across_yard",
      "far_away",
    ] as const;
    const easierDelta = strategy === "increase_trigger_distance" ? 1 : -1;
    return moveContextValue(
      source,
      field,
      distanceOrder,
      direction === "easier" ? easierDelta : -easierDelta,
    );
  }

  const order = orders[dimension];
  const delta = direction === "easier" ? -1 : 1;
  return moveContextValue(source, field, order, delta);
}
```

Implement `moveContextValue` as a generic internal helper that returns null
outside the array and clones the source with only the named field changed. It
must not use type assertions that weaken the public contract.

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @turingcare/api exec vitest run src/lib/context-adjacency.test.ts
pnpm --filter @turingcare/api typecheck
```

Expected: tests pass and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/context-adjacency.ts \
  apps/api/src/lib/context-adjacency.test.ts
git commit -m "feat: add reviewed context adjacency"
```

---

### Task 4: Pure contextual-progress policy

**Files:**

- Create: `apps/api/src/lib/contextual-progress.ts`
- Create: `apps/api/src/lib/contextual-progress.test.ts`

- [ ] **Step 1: Write the complete policy matrix as failing tests**

Define a fixture builder with all five context positions and test:

1. evidence exactly 21 days old is included;
2. evidence one millisecond older and future evidence are excluded;
3. two successes on one `practiceDay` remain Developing;
4. two successes on distinct days become Reliable;
5. one `too_hard` anywhere in the exact context blocks Reliable;
6. contexts differing in one field never merge;
7. missing `practiceDay`, wrong level, and wrong curriculum version are ignored;
8. outcome-only rows with all context positions null are ignored;
9. strongest ranking follows status, successful days, relevant timestamp, then
   serialized context;
10. latest `too_hard` creates an easier one-field action; when easing is
    unavailable, it never falls through to a harder action and repeats the
    highest-ranked Developing context only when that context is not the
    too-hard context, otherwise returning no action;
11. Reliable creates a harder one-field action when a reviewed harder adjacency
    exists, then repeats the highest-ranked Developing context when it does not;
12. a Reliable context at level 5, at a maxed-out reviewed adjacency, or with
    custom/metadata-null context falls back to
    `repeat_developing_context` with `direction: "repeat"` and
    `changedDimension: null` when a Developing context exists, and returns null
    only when no Developing fallback exists;
13. Developing repeats when no adjacent move exists;
14. only one evidence-derived Not observed row appears;
15. custom skills without metadata never synthesize Not observed;
16. tied timestamps sort deterministically by row ID.

Use fixed dates:

```ts
const NOW = new Date("2026-08-20T12:00:00.000Z");
const input = {
  now: NOW,
  curriculumLevel: 2,
  curriculumVersion: "2026-08-11",
  catalogSkillKey: "basic-manners.sit",
  metadata: skillDimensionMetadata["basic-manners.sit"],
  rows: [],
};
```

Assert the full policy result rather than internal helper calls.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @turingcare/api exec vitest run src/lib/contextual-progress.test.ts
```

Expected: module resolution failure.

- [ ] **Step 3: Implement the pure derivation**

Create these exported contracts:

```ts
export const CONTEXTUAL_PROGRESS_POLICY_VERSION = "2026-08-20";
export const CONTEXTUAL_PROGRESS_WINDOW_DAYS = 21;

export type ContextualProgressRow = {
  id: string;
  outcome: PracticeOutcome | null;
  occurredAt: Date;
  practiceDay: string | null;
  curriculumLevel: number | null;
  curriculumVersion: string | null;
  cueSupport: CueSupport | null;
  environment: PracticeEnvironment | null;
  distance: PracticeDistance | null;
  durationBand: PracticeDurationBand | null;
  distraction: PracticeDistraction | null;
};

export function deriveContextualProgress(input: {
  now: Date;
  curriculumLevel: number;
  curriculumVersion: string;
  catalogSkillKey: string | null;
  metadata: SkillDimensionMetadata | null;
  rows: ContextualProgressRow[];
}): ContextualProgress;
```

Implementation order:

1. filter by inclusive time window, current level/version, non-null outcome,
   non-null `practiceDay`, and at least one non-null context dimension;
2. serialize the five-position context with `JSON.stringify` for a stable key;
3. sort each group by `occurredAt` descending and ID descending;
4. count unique successful `practiceDay` values;
5. assign Reliable or Developing;
6. rank observed rows deterministically;
7. for easier movement, use the step into the current level
   (`levelSteps[level - 2]`) or `baseEase` at level 1;
8. for harder movement, use the step into the next level
   (`levelSteps[level - 1]`) and return no harder adjacency at level 5;
9. pass the matching reviewed strategy to the adjacency helper;
10. select easier after the globally latest `too_hard`; if no easier action can
   be derived, repeat the highest-ranked Developing context only when it is not
   the too-hard context, otherwise return no action, and never select a harder
   action for that latest `too_hard`;
11. otherwise select a harder action after Reliable when reviewed adjacency
   exists only when its exact target is absent or already Reliable without a
   `too_hard`; if the target is observed non-Reliable, exclude it and repeat
   the highest-ranked remaining Developing context, returning null only when
   no safe Developing fallback exists;
12. append at most one Not observed adjacent row only if the adjacent exact key
   has no observed group.

Never mutate the input rows or source context object. Never parse notes.

- [ ] **Step 4: Run policy tests and typecheck**

```bash
pnpm --filter @turingcare/api exec vitest run \
  src/lib/context-adjacency.test.ts src/lib/contextual-progress.test.ts
pnpm --filter @turingcare/api typecheck
```

Expected: all selected tests pass and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/contextual-progress.ts \
  apps/api/src/lib/contextual-progress.test.ts
git commit -m "feat: derive exact-context progress"
```

---

### Task 5: Bounded loader and owned skill-detail route

**Files:**

- Create: `apps/api/src/lib/contextual-progress-data.ts`
- Create: `apps/api/src/routes/contextual-progress.test.ts`
- Modify: `apps/api/src/routes/dogs.ts`

- [ ] **Step 1: Write failing route integration tests**

Build tests with `createTestUser()` and real Postgres for:

```text
GET /api/dogs/:dogId/skills/:skillId/contextual-progress
```

Assert:

- `200` with level/version/window/policy and exact rows;
- old, future, earlier-level, obsolete-version, and unanchored evidence excluded;
- manual current-level evidence included;
- another owner's dog or skill returns `404`;
- a skill belonging to a different owned dog returns `404`;
- malformed dog or skill UUIDs return the same `{ error: "not_found" }` `404`
  before Drizzle;
- custom skill evidence returns observed rows but no synthetic Not observed row;
- active safety removes an action-derived synthetic `not_observed` row while
  preserving observed Reliable/Developing rows;
- empty evidence returns `strongestContext: null`,
  `nextPracticeAction: null`, and `exactContexts: []`.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @turingcare/api exec vitest run \
  src/routes/contextual-progress.test.ts
```

Expected: `404` because the route does not exist.

- [ ] **Step 3: Implement one bounded evidence loader**

Create:

```ts
export async function loadContextualProgress(
  skill: Pick<
    typeof trainingSkills.$inferSelect,
    "id" | "confidence" | "catalogSkillKey"
  >,
  now: Date,
  safety: SuggestionSafety | null = null,
  executor: Pick<typeof db, "select"> = db,
): Promise<ContextualProgress> {
  const startsAt = new Date(
    now.getTime() - CONTEXTUAL_PROGRESS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const rows = await executor
    .select({
      id: practiceSessions.id,
      outcome: practiceSessions.outcome,
      occurredAt: practiceSessions.occurredAt,
      practiceDay: practiceSessions.practiceDay,
      curriculumLevel: practiceSessions.curriculumLevel,
      curriculumVersion: practiceSessions.curriculumVersion,
      cueSupport: practiceSessions.cueSupport,
      environment: practiceSessions.environment,
      distance: practiceSessions.distance,
      durationBand: practiceSessions.durationBand,
      distraction: practiceSessions.distraction,
    })
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.skillId, skill.id),
        gte(practiceSessions.occurredAt, startsAt),
        lte(practiceSessions.occurredAt, now),
        eq(practiceSessions.curriculumLevel, skill.confidence),
        eq(practiceSessions.curriculumVersion, CURRICULUM_VERSION),
        isNotNull(practiceSessions.outcome),
        isNotNull(practiceSessions.practiceDay),
      ),
    )
    .orderBy(desc(practiceSessions.occurredAt), desc(practiceSessions.id));

  return deriveContextualProgress({
    now,
    curriculumLevel: skill.confidence,
    curriculumVersion: CURRICULUM_VERSION,
    catalogSkillKey: skill.catalogSkillKey,
    metadata: skill.catalogSkillKey
      ? (skillDimensionMetadata[skill.catalogSkillKey] ?? null)
      : null,
    rows,
  });
}
```

The SQL bounds prove that the existing `(skill_id, occurred_at)` index applies.
Keep the same defensive filters in the pure policy.

- [ ] **Step 4: Add the owned route**

Validate both `:id` and `:skillId` with the existing repository UUID schema
before calling `findOwnedDog` or `findOwnedSkill`. A malformed value must
return `{ error: "not_found" }` with status `404`, indistinguishable from a
missing or cross-owner resource.

Add after the existing progress route:

```ts
.get("/:id/skills/:skillId/contextual-progress", async (c) => {
  const dogId = c.req.param("id");
  const skillId = c.req.param("skillId");
  if (!uuidSchema.safeParse(dogId).success || !uuidSchema.safeParse(skillId).success) {
    return c.json({ error: "not_found" } as const, 404);
  }
  const dog = await findOwnedDog(c.get("userId"), dogId);
  if (!dog) return c.json({ error: "not_found" } as const, 404);
  const skill = await findOwnedSkill(c.get("userId"), dog.id, skillId);
  if (!skill) return c.json({ error: "not_found" } as const, 404);
  const now = new Date();
  const progress = await evaluateSafetyWithLock(dog.id, now, (safety, tx) =>
    loadContextualProgress(skill, now, safety, tx),
  );
  return c.json(progress);
})
```

The locked callback is the response linearization point: it must pass its
transaction executor to the loader and must not use global `db` for contextual
evidence after the safety decision.

- [ ] **Step 5: Inspect the query plan**

Seed one owned skill with representative evidence, then run:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, outcome, occurred_at, practice_day, curriculum_level,
       curriculum_version, cue_support, environment, distance,
       duration_band, distraction
FROM practice_sessions
WHERE skill_id = (
    SELECT id
    FROM training_skills
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  )
  AND occurred_at >= now() - interval '21 days'
  AND occurred_at <= now()
ORDER BY occurred_at DESC, id DESC;
```

Expected: the plan uses `practice_sessions_skill_occurred_idx` once the seeded
row count is large enough for index selection. If Postgres reasonably chooses a
sequential scan for a tiny table, rerun after inserting at least 1,000
nonmatching rows before proposing a new index.

- [ ] **Step 6: Run route tests and typecheck**

```bash
pnpm --filter @turingcare/api exec vitest run \
  src/routes/contextual-progress.test.ts
pnpm --filter @turingcare/api typecheck
```

Expected: route tests pass and typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/contextual-progress-data.ts \
  apps/api/src/routes/contextual-progress.test.ts \
  apps/api/src/routes/dogs.ts
git commit -m "feat: expose contextual progress detail"
```

---

### Task 6: Batched focus summaries without N+1 reads

**Files:**

- Modify: `apps/api/src/lib/contextual-progress-data.ts`
- Modify: `apps/api/src/lib/focus.ts`
- Modify: `apps/api/src/routes/focus.test.ts`

- [ ] **Step 1: Write failing focus response tests**

Use two skill fixtures only in the direct data-layer batch test: one weekly
focus response supports one focused skill because `weekly_focus_dog_week`
enforces one focus skill per dog/week. Give the catalog and custom fixtures
distinct confidence/current levels (for example, level 1 and level 2), seed
each skill's evidence at its own current level, and assert the returned
summaries reflect independent current-level filtering/results. Spy at the
data-access boundary and assert that one batched context-evidence query serves
both skill IDs, with no per-skill loader calls.

Separately, use the real `/focus` response with its one focused skill to assert
that ready contextual progress is attached without removing its sessions.
Also assert a historical focus week still receives a current summary whose
window ends at request time. Force the batch loader to reject and assert that
the same one-skill focus response still returns the skill and sessions with
`contextualProgress: { status: "unavailable" }`.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @turingcare/api exec vitest run src/routes/focus.test.ts
```

Expected: `contextualProgress` is absent.

- [ ] **Step 3: Add a batch loader**

Export:

```ts
export async function loadContextualProgressSummaries(
  skills: Array<
    Pick<
      typeof trainingSkills.$inferSelect,
      "id" | "confidence" | "catalogSkillKey"
    >
  >,
  now: Date,
): Promise<Map<string, ContextualProgressSummary>>;
```

Use one `inArray(practiceSessions.skillId, skillIds)` query with the same
21-day upper/lower bounds. Because focused skills may have different levels,
fetch the bounded rows once, group by skill ID, and let
`deriveContextualProgress` enforce each skill's current level/version. Return an
empty map without querying when `skills.length === 0`.

- [ ] **Step 4: Attach summaries in `loadFocusWeek`**

Include `confidence` and `catalogSkillKey` in the focus select. Use
`evaluateSafetyWithLock` once per dog/request and pass its transaction executor
to the one batch loader, so the safety decision and contextual evidence/action
share one linearization point. Isolate only the evidence read in a nested
transaction/savepoint: log `[contextual-progress] focus_summary_failed`
without owner content and return the explicit unavailable state for that
failure, while lock acquisition, safety-input evaluation, and outer-transaction
failures propagate instead of inventing a ready result. Active safety sets every
returned summary's action to null, removes any action-derived synthetic
`not_observed` rows from detail responses, and preserves observed evidence plus
the safety decision. Add:

```ts
currentLevel: f.confidence,
dimensions: f.catalogSkillKey
  ? (skillDimensionMetadata[f.catalogSkillKey]?.dimensions ?? [])
  : [],
contextualProgress: summaries
  ? {
      status: "ready",
      summary: summaries.get(f.skillId) ?? {
        strongestContext: null,
        nextPracticeAction: null,
        safety: null,
      },
    }
  : { status: "unavailable" },
```

Do not merge the week-session query with the rolling evidence query: they have
different date semantics and selected columns.

- [ ] **Step 5: Run focus and policy tests**

```bash
pnpm --filter @turingcare/api exec vitest run \
  src/lib/contextual-progress.test.ts \
  src/routes/contextual-progress.test.ts \
  src/routes/focus.test.ts
pnpm --filter @turingcare/api typecheck
```

Expected: tests pass and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/contextual-progress-data.ts \
  apps/api/src/lib/focus.ts \
  apps/api/src/routes/focus.test.ts
git commit -m "feat: batch weekly progress summaries"
```

---

### Task 7: Authenticated contextual telemetry

**Files:**

- Modify: `apps/api/src/telemetry/events.ts`
- Modify: `apps/api/src/telemetry/events.test.ts`
- Modify: `apps/api/src/routes/dogs.ts`
- Modify: `apps/api/src/routes/contextual-progress.test.ts`

- [ ] **Step 1: Write failing allowlist and route tests**

Require both event names in `KNOWN_EVENTS` but not in anonymous
`CLIENT_EVENTS`. Exercise:

```text
POST /api/dogs/:id/contextual-progress/events
```

Assert an authenticated owner receives `202`, another owner receives `404`,
unknown enum values receive `400`, and the stored event receives the session
user ID rather than any client identity.
- a malformed dog UUID returns `{ error: "not_found" }` with `404` before the
  ownership query or JSON validation and records no telemetry, even with an
  invalid body;
- `training.context_next_action_used` returns the same `202 { ok: true }`
  acknowledgment but records no event for every active safety rule; the view
  event remains recordable;
- deterministic safety-write interleaving makes an action-use request wait for
  the dog lock and verifies it records nothing after the write commits.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @turingcare/api exec vitest run \
  src/telemetry/events.test.ts src/routes/contextual-progress.test.ts
```

Expected: event names and route are absent.

- [ ] **Step 3: Add event names and owned ingest route**

Add to `KNOWN_EVENTS`:

```ts
"training.context_insight_viewed",
"training.context_next_action_used",
```

Do not add them to `CLIENT_EVENTS`. Add a route UUID guard before `zValidator`, then:

```ts
.post(
  "/:id/contextual-progress/events",
  async (c, next) => {
    if (!uuidSchema.safeParse(c.req.param("id")).success) {
      return c.json({ error: "not_found" } as const, 404);
    }
    await next();
  },
  zValidator("json", contextualProgressEventSchema),
  async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const event = c.req.valid("json");
    if (event.name === "training.context_next_action_used") {
      const actionUseAllowed = await evaluateSafetyWithLock(
        dog.id,
        new Date(),
        async (safety) => safety === null,
      );
      if (!actionUseAllowed) return c.json({ ok: true } as const, 202);
    }
    const { name, ...props } = event;
    await recordEvent(name, {
      userId: c.get("userId"),
      sessionId: c.get("sessionId"),
      props,
    });
    return c.json({ ok: true } as const, 202);
  },
)
```

Do not record raw errors or change the acknowledged telemetry response shape.

- [ ] **Step 4: Run telemetry tests and typecheck**

```bash
pnpm --filter @turingcare/api exec vitest run \
  src/telemetry/events.test.ts \
  src/routes/contextual-progress.test.ts \
  src/routes/telemetry.test.ts
pnpm --filter @turingcare/api typecheck
```

Expected: tests pass and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/telemetry/events.ts \
  apps/api/src/telemetry/events.test.ts \
  apps/api/src/routes/dogs.ts \
  apps/api/src/routes/contextual-progress.test.ts
git commit -m "feat: record contextual progress telemetry"
```

---

### Task 8: Web data hooks and complete invalidation

**Files:**

- Create: `apps/web/src/lib/contextual-progress.ts`
- Create: `apps/web/src/lib/contextual-progress.test.tsx`
- Create: `apps/web/src/lib/training-safety-cache.ts`
- Create: `apps/web/src/lib/dogs-safety-cache.test.tsx`
- Create: `apps/web/src/lib/journal-safety-cache.test.tsx`
- Modify: `apps/web/src/lib/progress.ts`
- Modify: `apps/web/src/lib/progress.test.tsx`
- Modify: `apps/web/src/lib/dogs.ts`
- Modify: `apps/web/src/lib/journal.ts`
- Modify: `apps/web/src/lib/guided-setup.ts`
- Modify: `apps/web/src/lib/guided-setup.test.tsx`
- Modify: `apps/web/src/lib/weekly-focus.ts`

- [ ] **Step 1: Write failing hook tests**

Test exact stable keys:

```ts
expect(contextualProgressKey("d1", "s1")).toEqual([
  "contextual-progress",
  "d1",
  "s1",
]);
expect(contextualProgressDogKey("d1")).toEqual([
  "contextual-progress",
  "d1",
]);
```

Mock the typed client and assert detail GET errors throw
`contextual_progress_load_failed`. Assert view/action telemetry POSTs the shared
event payload. Spy on a `QueryClient` and require log, evidence update, delete, and level
change to invalidate the dog-scoped safety prefixes:

```ts
["suggestion", dogId]
["focus", dogId]
["contextual-progress", dogId]
```

The same three prefixes must be covered for concern add/remove, journal
add/update/delete, guided setup behavior/progress actions, and dog deletion.
Use prefix invalidation because multiple week and skill-detail keys may be
cached. Every mutation callback returns or awaits invalidation promises so
`mutateAsync` does not resolve before active refetches settle. Dog profile
updates are excluded unless `evaluateSafety` later consumes a profile field;
the current policy reads persisted safety signals and bounded journal fields.

Practice mutations also retain these non-safety derived caches:

```ts
["progress", dogId]
["overview"]
["dogs-overview"]
```

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @turingcare/web exec vitest run \
  src/lib/contextual-progress.test.tsx
```

Expected: module resolution failure.

- [ ] **Step 3: Implement typed hooks**

Create:

```ts
export function contextualProgressDogKey(dogId: string) {
  return ["contextual-progress", dogId] as const;
}

export function contextualProgressKey(dogId: string, skillId: string) {
  return [...contextualProgressDogKey(dogId), skillId] as const;
}

export function useContextualProgress(
  dogId: string,
  skillId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: contextualProgressKey(dogId, skillId),
    enabled: enabled && Boolean(dogId && skillId),
    queryFn: async (): Promise<ContextualProgress> => {
      const response =
        await api.api.dogs[":id"].skills[":skillId"]["contextual-progress"].$get({
          param: { id: dogId, skillId },
        });
      if (!response.ok) throw new Error("contextual_progress_load_failed");
      return response.json();
    },
  });
}

export function useRecordContextualProgressEvent(dogId: string) {
  return useMutation({
    mutationFn: async (event: ContextualProgressEvent) => {
      const response =
        await api.api.dogs[":id"]["contextual-progress"].events.$post({
          param: { id: dogId },
          json: event,
        });
      if (!response.ok) throw new Error("contextual_progress_event_failed");
      return response.json();
    },
  });
}
```

Add these fields to `FocusSkill`:

```ts
currentLevel: number;
dimensions: PracticeDimension[];
contextualProgress:
  | { status: "ready"; summary: ContextualProgressSummary }
  | { status: "unavailable" };
```

Keep `invalidateTrainingSafetyData` in its own helper module so concern,
journal, guided setup, and dog hooks can share it without import cycles.
`invalidatePracticeDerivedData` must reuse that helper and add only its
progress/overview caches; do not duplicate slightly different safety lists.

- [ ] **Step 4: Run hook tests and typecheck**

```bash
pnpm --filter @turingcare/web exec vitest run \
  src/lib/contextual-progress.test.tsx
pnpm --filter @turingcare/web typecheck
```

Expected: tests pass and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/contextual-progress.ts \
  apps/web/src/lib/contextual-progress.test.tsx \
  apps/web/src/lib/progress.ts \
  apps/web/src/lib/weekly-focus.ts
git commit -m "feat: add contextual progress web data"
```

---

### Task 9: Manual current-level confirmation UI

**Files:**

- Modify: `apps/web/src/components/progress/session-form.tsx`
- Modify: `apps/web/src/components/progress/session-form.test.tsx`
- Modify: `apps/web/src/components/progress/outcome-quick-capture.tsx`
- Modify: `apps/web/src/components/progress/outcome-quick-capture.test.tsx`
- Modify: `apps/web/src/routes/dog-week.tsx`
- Modify: `apps/web/src/routes/dog-week.test.tsx`
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Write failing form and quick-capture tests**

Pass `currentLevel={3}` to both components. For manual forms assert:

```ts
fireEvent.click(
  screen.getByRole("checkbox", {
    name: "I practiced this at the current Level 3.",
  }),
);
expect(body.confirmCurrentLevel).toBe(true);
```

Assert unchecked forms omit the property. In quick capture, when
`suggestionId` is null, require the confirmation checkbox before structured
evidence can contribute; when an audited suggestion target exists, preserve the
primary/fallback controls and do not render the manual confirmation.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @turingcare/web exec vitest run \
  src/components/progress/session-form.test.tsx \
  src/components/progress/outcome-quick-capture.test.tsx \
  src/routes/dog-week.test.tsx
```

Expected: `currentLevel` is not accepted and the checkbox is absent.

- [ ] **Step 3: Add positive confirmation without changing quick log**

Add the prop and checkbox:

```tsx
{hasStructuredEvidence && (
  <label className="block text-sm text-slate">
    <input
      type="checkbox"
      {...register("confirmCurrentLevel")}
    />
    {t("contextProgress.confirmCurrentLevel", { level: currentLevel })}
  </label>
)}
```

For React Hook Form, normalize unchecked to `undefined`; never submit `false`
because the shared contract accepts only literal `true`. `hasStructuredEvidence`
means outcome or any context field is answered. Safety-only reports must not
require or imply a training-level confirmation.

For `OutcomeQuickCapture`, expose:

```ts
currentLevel: number;
usesAuditedSuggestion: boolean;
```

Return `confirmCurrentLevel: true` only when the owner checked it and
`usesAuditedSuggestion` is false. Keep `practicedTarget` construction in
`dog-week.tsx`, so the component never sends both anchor mechanisms.

When creating `pendingOutcome` in `dog-week.tsx`, include
`currentLevel: focusSkill.currentLevel`. Use suggestion-requested dimensions
for an audited suggestion; otherwise use `focusSkill.dimensions` so a manual
quick capture can record an actual context.

- [ ] **Step 4: Add bilingual copy**

Add matching keys:

```ts
// en.ts
"contextProgress.confirmCurrentLevel":
  "I practiced this at the current Level {level}.",
"contextProgress.confirmCurrentLevelHelp":
  "This lets TuringCare compare this practice with other work at the same level.",

// es.ts
"contextProgress.confirmCurrentLevel":
  "Practiqué esto en el nivel actual {level}.",
"contextProgress.confirmCurrentLevelHelp":
  "Esto permite que TuringCare compare esta práctica con otras del mismo nivel.",
```

- [ ] **Step 5: Run UI tests, i18n parity, and typecheck**

```bash
pnpm --filter @turingcare/web exec vitest run \
  src/components/progress/session-form.test.tsx \
  src/components/progress/outcome-quick-capture.test.tsx \
  src/routes/dog-week.test.tsx \
  src/i18n/i18n.test.tsx
pnpm --filter @turingcare/web typecheck
```

Expected: tests pass and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/progress/session-form.tsx \
  apps/web/src/components/progress/session-form.test.tsx \
  apps/web/src/components/progress/outcome-quick-capture.tsx \
  apps/web/src/components/progress/outcome-quick-capture.test.tsx \
  apps/web/src/routes/dog-week.tsx \
  apps/web/src/routes/dog-week.test.tsx \
  apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat: confirm manual practice level"
```

---

### Task 10: Expanded skill-detail contextual evidence

**Files:**

- Create: `apps/web/src/components/progress/contextual-progress-detail.tsx`
- Create: `apps/web/src/components/progress/contextual-progress-detail.test.tsx`
- Modify: `apps/web/src/components/progress/progress-panel.tsx`
- Modify: `apps/web/src/components/progress/progress-panel.test.tsx`
- Modify: `apps/web/src/components/progress/session-form.tsx`
- Modify: `apps/web/src/components/progress/session-form.test.tsx`
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Write failing component tests**

Cover:

- Reliable strongest context with date and two-day evidence;
- Developing latest `too_hard` copy says “needs more support”;
- Not observed copy says “No recent evidence” and never “failed”;
- sparse state prompts evidence capture;
- error state is a retryable `role="status"` and Log session remains enabled;
- all five non-null context labels render so exact combinations remain legible;
- active server-owned safety suppression shows the existing accessible
  safety/referral guidance, removes action-derived synthetic `not_observed`
  rows, preserves observed evidence rows, and removes the practice CTA/action
  telemetry;
- cached detail data keeps its evidence visible while `isFetching` suppresses
  the next-practice CTA and action telemetry;
- cached detail data remains visible but fails closed on actions after a query
  error, with Retry restoring the CTA only after a successful result;
- CTA calls the telemetry mutation then opens the existing session form
  prefilled with the recommended context;
- one view event per mounted detail result, not per rerender.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @turingcare/web exec vitest run \
  src/components/progress/contextual-progress-detail.test.tsx \
  src/components/progress/progress-panel.test.tsx
```

Expected: component module does not exist.

- [ ] **Step 3: Implement the detail component**

Use semantic sections:

```tsx
<section aria-labelledby={`context-progress-${skillId}`}>
  <h4 id={`context-progress-${skillId}`}>
    {t("contextProgress.title")}
  </h4>
  <p>{t("contextProgress.window", { days: data.window.days })}</p>
  <StrongestContext evidence={data.strongestContext} />
  <NextPracticeAction
    action={data.nextPracticeAction}
    onUse={onUseNextAction}
  />
  <ul>
    {data.exactContexts.map((evidence) => (
      <ContextEvidenceRow
        key={serializeContext(evidence.context)}
        evidence={evidence}
      />
    ))}
  </ul>
</section>
```

Keep labels as presentation helpers in this file; the server owns status and
ranking. Show Not observed only when returned by the API. On query error render
a retry button calling `refetch`, but do not hide or disable session controls.

Use a ref keyed by `policyVersion`, level, strongest serialized context, and
safety rule to send `training.context_insight_viewed` once per mounted result.
Telemetry failure must be ignored by the UI. A Reliable row labels
`lastSuccessfulAt`; Developing labels `lastObservedAt`.

- [ ] **Step 4: Prefill the selected next practice**

Add this optional prop to `SessionForm`:

```ts
initialEvidence?: Pick<
  PracticeEvidenceInput,
  "cueSupport" | "environment" | "distance" | "durationBand" | "distraction"
>;
```

Merge it into React Hook Form `defaultValues` without setting an outcome,
safety signal, or anchor. In `SkillCard`, keep the selected recommended context
in local state. The next-practice CTA records
`training.context_next_action_used`, stores the context, and switches to
`mode("logging")`. Clearing/cancelling the form clears the recommendation.
When catalog dimensions hydrate from an empty list, merge new defaults without
resetting dirty occurredAt, notes, outcome, context, or confirmation values;
an intentional recommendation change still performs the existing full reset.

- [ ] **Step 5: Fetch only for expanded skills**

In `SkillCard`, call:

```ts
useContextualProgress(dogId, displaySkill.id, expanded)
```

Render `ContextualProgressDetail` after `MilestoneStepper`. Clicking the
next-practice CTA opens the prefilled form from Step 4.

- [ ] **Step 6: Add bilingual status, field, empty, error, and CTA copy**

Add exact matching keys for:

```text
contextProgress.title
contextProgress.window
contextProgress.recentWindow
contextProgress.strongest
contextProgress.practiceNext
contextProgress.reliable
contextProgress.developing
contextProgress.notObserved
contextProgress.needsSupport
contextProgress.noEvidence
contextProgress.empty
contextProgress.loadError
contextProgress.actionUnavailable
contextProgress.retry
contextProgress.useAction
contextProgress.viewEvidence
contextProgress.successfulDays
contextProgress.lastObserved
contextProgress.lastSuccessful
contextProgress.cueSupport
contextProgress.environment
contextProgress.distance
contextProgress.durationBand
contextProgress.distraction
```

Reuse existing practice-option value labels; do not duplicate translations for
controlled values.

- [ ] **Step 7: Run component tests, i18n parity, and typecheck**

```bash
pnpm --filter @turingcare/web exec vitest run \
  src/components/progress/contextual-progress-detail.test.tsx \
  src/components/progress/progress-panel.test.tsx \
  src/components/progress/session-form.test.tsx \
  src/i18n/i18n.test.tsx
pnpm --filter @turingcare/web typecheck
```

Expected: tests pass and typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/progress/contextual-progress-detail.tsx \
  apps/web/src/components/progress/contextual-progress-detail.test.tsx \
  apps/web/src/components/progress/progress-panel.tsx \
  apps/web/src/components/progress/progress-panel.test.tsx \
  apps/web/src/components/progress/session-form.tsx \
  apps/web/src/components/progress/session-form.test.tsx \
  apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat: show contextual skill evidence"
```

---

### Task 11: Decision-first This Week summary

**Files:**

- Create: `apps/web/src/components/week/contextual-progress-summary.tsx`
- Create: `apps/web/src/components/week/contextual-progress-summary.test.tsx`
- Modify: `apps/web/src/routes/dog-week.tsx`
- Modify: `apps/web/src/routes/dog-week.test.tsx`
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Write failing weekly-summary tests**

Cover:

- strongest Reliable context plus next action;
- Developing-only summary without a false Reliable label;
- neutral empty prompt;
- no Not observed list on This Week;
- historical week explicitly says the insight covers the recent 21 days;
- action link points to `/my/dogs/:id/training#skill-:skillId`;
- “Practice this next” records `training.context_next_action_used`;
- “View all context evidence” does not record action-use telemetry;
- one `training.context_insight_viewed` event per mounted weekly summary;
- focus response/query failure does not remove or disable week-grid practice.
- an unavailable contextual summary shows an inline insight error while the
  week grid remains usable.
- the unavailable summary has an inline Retry that refetches focus;
- active safety shows the existing referral guidance, suppresses the weekly
  practice CTA, and emits no next-action-use event;
- stale exercise suggestion plus contextual safety renders one page-level
  alert, no exercise/CTA, and no contextual next-action telemetry;
- suggestion errors still show contextual safety guidance when that summary
  reports active safety;
- either suggestion or focus query `isFetching` suppresses cached suggestion
  exercise/action controls and contextual action CTAs, while a cached weekly
  suggestion retains a neutral shell and settled safe data restores the CTAs;
- a relevant focus error or current-week suggestion error suppresses cached
  suggestion/context actions and view/action telemetry while preserving Retry,
  cached evidence, and the week-grid logging controls; telemetry resumes only
  after a settled successful retry;
- an awaited session creation reads QueryClient state and data through
  `suggestionKey(id, weekKey)` and `focusKey(id, weekKey)`, requiring both
  queries to be successful, idle, error-free, current-scope, and safe before
  retaining an audited target; it falls back to manual capture when safety,
  revalidation, or an error becomes active, never sending `practicedTarget`;
- evidence save repeats that scoped cache-authority check against the captured
  suggestion ID before attaching `practicedTarget`, so a post-capture safety,
  error, or revalidation change cannot retain the audited anchor;
- initial focus failure offers Retry and Edit focus without claiming an empty
  focus, while cached focus controls remain enabled;

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @turingcare/web exec vitest run \
  src/components/week/contextual-progress-summary.test.tsx \
  src/routes/dog-week.test.tsx
```

Expected: summary component does not exist.

- [ ] **Step 3: Implement the compact decision-first component**

Render only:

```tsx
<section aria-labelledby={`week-context-${skill.skillId}`}>
  <h3 id={`week-context-${skill.skillId}`}>{skill.name}</h3>
  <p>{t("contextProgress.recentWindow", { days: 21 })}</p>
  <StrongestContextCompact evidence={summary.strongestContext} />
  <NextActionCompact action={summary.nextPracticeAction} />
  <Link
    to={`/my/dogs/${dogId}/training#skill-${skill.skillId}`}
    onClick={recordActionUse}
  >
    {t("contextProgress.useAction")}
  </Link>
  <Link
    to={`/my/dogs/${dogId}/training#skill-${skill.skillId}`}
  >
    {t("contextProgress.viewEvidence")}
  </Link>
</section>
```

If both summary fields are null, render the capture prompt and the same skill
detail link. Never render the `exactContexts` list on This Week. Give the
component explicit `suppressActions` and page-owned notice props; do not infer
ownership from DOM queries or global safety state.

- [ ] **Step 4: Mount below the weekly suggestion and above the grid**

Map the focus skills and render one compact summary for every
`contextualProgress.status === "ready"` focus skill. For `unavailable`, render
the localized inline insight error and Retry without hiding the grid. This is
response data, not a separate query. Do not condition it on the selected
historical week being current; instead always label the rolling 21-day window.
Compact context labels omit null values; full detail keeps all five labels.

- [ ] **Step 5: Handle deep-link expansion**

In `ProgressPanel`, react to `location.hash` after progress data loads. If it
matches an owned rendered skill ID, initialize that `SkillCard` expanded and
scroll it into view without forcing focus or adding a tab stop. Ignore unknown
hashes.

- [ ] **Step 6: Run weekly UI, progress panel, i18n, and typecheck**

```bash
pnpm --filter @turingcare/web exec vitest run \
  src/components/week/contextual-progress-summary.test.tsx \
  src/routes/dog-week.test.tsx \
  src/components/progress/progress-panel.test.tsx \
  src/i18n/i18n.test.tsx
pnpm --filter @turingcare/web typecheck
```

Expected: tests pass and typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/week/contextual-progress-summary.tsx \
  apps/web/src/components/week/contextual-progress-summary.test.tsx \
  apps/web/src/routes/dog-week.tsx \
  apps/web/src/routes/dog-week.test.tsx \
  apps/web/src/components/progress/progress-panel.tsx \
  apps/web/src/components/progress/progress-panel.test.tsx \
  apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat: add weekly contextual insight"
```

---

### Task 12: Critical journey, accessibility, and project record

**Files:**

- Modify: `e2e/critical-owner-journey.spec.ts`
- Modify: `docs/PROJECT-LOG.md`

- [ ] **Step 1: Extend the critical owner journey**

Use the existing registered owner and catalog skill. Through the skill-detail
session form:

1. log manual structured `went_well` evidence on two distinct owner-local days;
2. check “I practiced this at the current Level 1” for both;
3. assert This Week shows Reliable and a next-practice action;
4. open “View all context evidence” and assert skill detail shows two successful
   days;
5. log `too_hard` in the same exact context with current-level confirmation;
6. assert status becomes Developing and copy says it needs more support;
7. assert the next action changes exactly one displayed context value in the
   easier direction.

Use role/name selectors and existing route/API helpers; do not insert evidence
directly into Postgres for this owner journey.

- [ ] **Step 2: Run the desktop journey and confirm RED before final wiring**

```bash
pnpm exec playwright test e2e/critical-owner-journey.spec.ts \
  --project=desktop-chromium --grep "full owner journey"
```

Expected before completing selectors/wiring: failure at the first contextual
progress assertion.

- [ ] **Step 3: Complete only the wiring exposed by the journey**

Fix missing accessible names, focus behavior, or cache invalidation in the
components already introduced. Do not add new product behavior in this task.

- [ ] **Step 4: Run targeted accessibility-oriented UI tests**

```bash
pnpm --filter @turingcare/web exec vitest run \
  src/components/progress/contextual-progress-detail.test.tsx \
  src/components/week/contextual-progress-summary.test.tsx \
  src/components/progress/session-form.test.tsx \
  src/routes/dog-week.test.tsx
```

Expected: all selected tests pass.

- [ ] **Step 5: Run desktop and phone critical journeys**

```bash
pnpm exec playwright test e2e/critical-owner-journey.spec.ts \
  --project=desktop-chromium
pnpm exec playwright test e2e/critical-owner-journey.spec.ts \
  --project=phone-chromium
```

Expected: selected journeys pass in both projects. Confirm the three cards or
rows stack without horizontal clipping at the phone viewport.

- [ ] **Step 6: Update the project log**

Add a dated Gate 2 entry naming:

- exact-context current-level reliability;
- manual current-level confirmation;
- one evidence-derived adjacent next context;
- This Week decision-first summary;
- expanded skill evidence;
- no universal completion score and no automatic advancement.

- [ ] **Step 7: Commit**

```bash
git add e2e/critical-owner-journey.spec.ts docs/PROJECT-LOG.md \
  apps/web/src/components/progress/contextual-progress-detail.tsx \
  apps/web/src/components/progress/contextual-progress-detail.test.tsx \
  apps/web/src/components/week/contextual-progress-summary.tsx \
  apps/web/src/components/week/contextual-progress-summary.test.tsx \
  apps/web/src/components/progress/progress-panel.tsx \
  apps/web/src/components/progress/progress-panel.test.tsx \
  apps/web/src/routes/dog-week.tsx apps/web/src/routes/dog-week.test.tsx
git commit -m "test: cover contextual progress journey"
```

Before committing, inspect `git diff --cached --name-only` and confirm every
path is one of the files listed for this task.

---

### Task 13: Full verification and two-model review loop

**Files:**

- Modify only files required by verified review findings.

- [ ] **Step 1: Run the complete repository gate**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright test e2e/critical-owner-journey.spec.ts \
  --project=desktop-chromium
pnpm exec playwright test e2e/critical-owner-journey.spec.ts \
  --project=phone-chromium
```

Expected: every command exits 0 with nonzero tests collected.

- [ ] **Step 2: Inspect persistence and privacy invariants**

Confirm through tests or read-only SQL:

- manual anchors have level/version but null suggestion/variant;
- earlier levels and old curriculum versions do not appear in current status;
- another owner's IDs return `404`;
- telemetry props contain no notes, names, or client identity;
- no new migration exists;
- `practice_sessions_skill_occurred_idx` remains present.

- [ ] **Step 3: Dispatch the requested independent reviews**

Run two read-only reviewers in parallel:

1. `claude-opus-5` — whole-branch correctness, UX, privacy/security, edge
   cases, and test gaps.
2. `gpt-5.6-luna` — the same whole-branch scope independently.

Give each reviewer the approved spec, this plan, and the full
`origin/main...HEAD` diff. Require concrete file/line findings only, with no
style-only comments.

- [ ] **Step 4: Triage findings rigorously**

Invoke `receiving-code-review`. For each finding:

- reproduce or inspect the exact path;
- reject unsupported findings with evidence;
- fix valid findings using TDD;
- rerun the smallest affected test immediately.

- [ ] **Step 5: Repeat reviews until both are clean**

After every accepted fix, rerun both whole-branch reviewers. Stop only when both
return no substantive correctness, security, UX, or coverage findings. Do not
ask one reviewer to validate the other.

- [ ] **Step 6: Refresh the full gate after the last change**

Repeat Step 1 after the latest code edit. Earlier output is stale.

- [ ] **Step 7: Commit review fixes**

```bash
git status --short
git add -u
git diff --cached --name-only
git commit -m "fix: harden contextual progress insights"
```

Skip this commit when reviewers are clean and no files changed.

- [ ] **Step 8: Finish the branch**

Invoke `finishing-a-development-branch`. Preserve the approved spec and plan,
include the requested Copilot trailers on commits, and never reset or overwrite
the unpublished planning commits on the original local `main`.
