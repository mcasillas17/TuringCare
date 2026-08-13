# Personalized Training Gate 1 (Focus-First Evidence Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Gate 1 cohort slice of `docs/superpowers/specs/2026-08-11-personalized-training-progress-design.md`: historically versioned weekly focus, structured practice evidence, one deterministic curated exercise plus one easier fallback per dog/focus skill, owner-confirmed advancement proposals, deterministic safety suppression with referral guidance, and the audit/telemetry that lets us read the cohort signals.

**Architecture:** Weekly focus rows gain a `week_start` Monday key and enforce one selected skill per dog/week so each week keeps one unambiguous focus. Practice sessions gain optional structured outcome/context columns plus the curriculum level and primary/fallback variant actually practised, so advancement only uses successful primary work at the current level. The reviewed catalog stays the single source of exercise prose: bounded per-skill metadata (relevant dimensions, the dimension each level step changes, and direction-aware easing) turns the five authored level descriptions into machine-readable targets. The primary exercise is always authored prose; its fallback keeps that prose and applies exactly one reviewed, skill-safe easing clause. A pure rule module picks the effective level from recent structured evidence; a separate pure safety module suppresses everything and returns a referral category; a thin orchestrator does the DB reads, persists an audit row and telemetry, and never blocks a save when it fails. Advancement is only ever a proposal row the owner decides on.

**Tech Stack:** Node 22 / pnpm 11.1.2 monorepo; Hono + Drizzle + Postgres API (`apps/api`), React 19 + Vite + TanStack Query SPA (`apps/web`), Zod contracts in `packages/shared`, Vitest, Biome, typed en/es i18n.

**Scope (Gate 1 only).** In: historically versioned weekly focus; structured practice outcome/context; catalog dimension metadata; deterministic suggestion + one fallback; conservative structured safety suppression + referral; suggestion/advancement persistence and telemetry; owner authorization; API endpoints; suggestion UI + optional evidence capture; custom-skill unsupported state; en/es interface strings; focused tests. Out (do not build): contextual progress dashboards, custom-skill suggestions, Behavior Brief integration, public/catalog localization, AI anything, automatic advancement, gamification, reminders.

Database inspection examples use local `psql`. If it is unavailable, run the
same SQL through the repository service:
`docker compose exec -T postgres psql -U postgres -d turingcare -c '<SQL>'`.

---

## Conventions (read once, apply to every task)

- Dependency order is `1, 4–7, 2, 3, 8–10, 12, 11, 13–24`. Tasks 2, 3, 8, and 9
  form one atomic focus-contract checkpoint so shared, API, and web consumers
  cut over together. Task 11 validates exact
  suggestion anchors and therefore intentionally runs after Task 12 creates
  the audit tables, even though its product-facing number is lower.
- Work on a branch: `git checkout -b feat/personalized-training-gate-1`. Before each commit run `git branch --show-current` and confirm it prints `feat/personalized-training-gate-1`.
- API tests need Postgres and the root `.env`:

```bash
cp .env.example .env   # only if .env is missing
docker compose up -d --wait
set -a && . ./.env && set +a
pnpm --filter @turingcare/api db:migrate
```

- Per-workspace commands used throughout:

```bash
pnpm --filter @turingcare/shared exec vitest run src/<file>.test.ts
pnpm --filter @turingcare/api exec vitest run src/<path>.test.ts
pnpm --filter @turingcare/web exec vitest run src/<path>.test.tsx
pnpm --filter @turingcare/api exec tsc --noEmit
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check apps packages
```

- API integration tests use `app.request()` + `createTestUser()` from `apps/api/src/test-helpers.ts`, and clean users in `afterEach` (cascade deletes their data). Copy the harness shape from `apps/api/src/routes/focus.test.ts`.
- Owner isolation: every new route resolves the dog with `findOwnedDog(userId, dogId)` and the skill with `findOwnedSkill(userId, dogId, skillId)` and returns `404` (never `403`) for rows the caller does not own.
- All user-facing copy goes through `apps/web/src/i18n/en.ts` + `es.ts`. `apps/web/src/i18n/i18n.test.tsx` fails if the key sets differ or if any `es` value equals its `en` value.
- Biome: 2-space indent, double quotes, semicolons, 100-column width. TypeScript is strict with `noUncheckedIndexedAccess` — index access returns `T | undefined`, so guard it.
- Telemetry is server-side only via `recordEvent` (fail-open) with scalar props. Never put free text (notes, journal text, skill names typed by owners) in telemetry props or audit rows.

## File structure

**Create (shared):**
- `packages/shared/src/practice-evidence.ts` — practice outcome/context/safety-signal enums + `practiceEvidenceSchema`.
- `packages/shared/src/practice-evidence.test.ts`
- `packages/shared/src/suggestion.ts` — suggestion/advancement enums, request schemas, response DTO types.
- `packages/shared/src/suggestion.test.ts`

**Create (api):**
- `apps/api/src/data/training-curriculum.ts` — `CURRICULUM_VERSION`, per-skill dimension metadata for all 21 catalog skills, enriched `trainingCurriculum`.
- `apps/api/src/data/training-curriculum.test.ts`
- `apps/api/src/lib/curriculum.ts` — `resolveCurriculumTarget` (primary + fallback from authored prose).
- `apps/api/src/lib/curriculum.test.ts`
- `apps/api/src/lib/practice-evidence.ts` — level-anchored evidence loader + summariser.
- `apps/api/src/lib/practice-evidence.test.ts`
- `apps/api/src/lib/observations.ts` — recent structured daily check-in observation.
- `apps/api/src/lib/safety-lock.ts` — `TransactionType`, `lockDogSafety`, `withDogSafetyLock`.
- `apps/api/src/lib/safety-lock.test.ts`
- `apps/api/src/lib/safety-policy.ts` — pure `decideSafety` + DB `evaluateSafety`.
- `apps/api/src/lib/safety-policy.test.ts`
- `apps/api/src/lib/suggestion-rules.ts` — pure deterministic rule selection.
- `apps/api/src/lib/suggestion-rules.test.ts`
- `apps/api/src/lib/advancement.ts` — pure `evaluateAdvancement` + proposal persistence/decision.
- `apps/api/src/lib/advancement.test.ts`
- `apps/api/src/lib/suggestion.ts` — orchestrator: reads, rules, persistence, telemetry.
- `apps/api/src/routes/suggestion.test.ts` — route-level integration tests.
- `apps/api/src/routes/practice-evidence.test.ts` — practice evidence + safety-signal capture tests.
- `apps/api/src/routes/journal-safety-lock.test.ts` — journal writes serialize through the dog safety lock.

**Create (web):**
- `apps/web/src/lib/practice-options.ts` — enum → i18n key maps for dimensions/outcomes/rules/safety.
- `apps/web/src/lib/suggestion.ts` — `useSuggestion`, `useSuggestionAction`, `useAdvancementDecision`.
- `apps/web/src/components/training/suggestion-card.tsx`
- `apps/web/src/components/training/suggestion-card.test.tsx`
- `apps/web/src/components/training/safety-notice.tsx`
- `apps/web/src/components/training/advancement-proposal-card.tsx`
- `apps/web/src/components/progress/outcome-quick-capture.tsx`
- `apps/web/src/components/progress/session-form.test.tsx`

**Modify:**
- `packages/shared/src/progress.ts` (practice session schema gains evidence), `packages/shared/src/focus.ts` (week key), `packages/shared/src/training-catalog.ts` (catalog skill gains dimension metadata), `packages/shared/src/index.ts`.
- `apps/api/src/db/schema.ts`, `apps/api/src/db/schema.test.ts`, `apps/api/drizzle/*` (four migrations, through `0016_journal_observation_index`), `apps/api/src/data/training-catalog.ts` (type annotation only), `apps/api/src/lib/focus.ts`, `apps/api/src/routes/dogs.ts`, `apps/api/src/routes/training.ts`, `apps/api/src/telemetry/events.ts`, `apps/api/src/routes/focus.test.ts`, `apps/api/src/routes/telemetry.test.ts`.
- `apps/web/src/lib/weekly-focus.ts`, `apps/web/src/lib/progress.ts`, `apps/web/src/components/week/focus-picker.tsx`, `apps/web/src/components/progress/session-form.tsx`, `apps/web/src/components/progress/progress-panel.tsx`, `apps/web/src/routes/dog-week.tsx`, `apps/web/src/routes/dog-week.test.tsx`, `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`.
- `docs/PROJECT-LOG.md`, `README.md`.

---

## Task 1: Shared practice-evidence contract

**Files:**
- Create: `packages/shared/src/practice-evidence.ts`
- Create: `packages/shared/src/practice-evidence.test.ts`
- Modify: `packages/shared/src/progress.ts`
- Modify: `packages/shared/src/dog.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/progress.test.ts`
- Modify: `packages/shared/src/dog.test.ts`

- [ ] **Step 1: Write the failing test** — create `packages/shared/src/practice-evidence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  cueSupportValues,
  distanceValues,
  distractionValues,
  durationBandValues,
  environmentValues,
  practiceDimensionValues,
  practiceEvidenceSchema,
  practiceOutcomeValues,
  safetySignalValues,
} from "./practice-evidence";

describe("practice evidence vocabularies", () => {
  it("keeps controlled context values stable", () => {
    expect(practiceOutcomeValues).toEqual(["went_well", "mixed", "too_hard"]);
    expect(practiceDimensionValues).toEqual([
      "cue_support",
      "environment",
      "distance",
      "duration",
      "distraction",
    ]);
    expect(cueSupportValues).toEqual(["food_lure", "hand_signal", "verbal_cue", "no_extra_help"]);
    expect(environmentValues).toEqual([
      "home_quiet",
      "home_busy",
      "yard",
      "quiet_outdoor",
      "busy_outdoor",
    ]);
    expect(distanceValues).toEqual([
      "at_side",
      "few_steps",
      "across_room",
      "across_yard",
      "far_away",
    ]);
    expect(durationBandValues).toEqual([
      "under_5_seconds",
      "about_15_seconds",
      "about_30_seconds",
      "one_to_two_minutes",
      "five_to_fifteen_minutes",
      "about_30_minutes",
      "one_to_two_hours",
      "half_day_or_more",
    ]);
    expect(distractionValues).toEqual(["none", "mild", "moderate", "strong"]);
    expect(safetySignalValues).toEqual([
      "aggression_or_bite_risk",
      "injury_or_pain",
      "severe_fear_or_panic",
    ]);
  });
});

describe("practiceEvidenceSchema", () => {
  it("accepts an entirely empty payload so capture friction can never block a save", () => {
    expect(practiceEvidenceSchema.parse({})).toEqual({});
  });

  it("accepts a full payload", () => {
    const parsed = practiceEvidenceSchema.parse({
      outcome: "went_well",
      cueSupport: "verbal_cue",
      environment: "yard",
      distance: "across_room",
      durationBand: "about_30_seconds",
      distraction: "mild",
      safetySignal: "injury_or_pain",
    });
    expect(parsed.outcome).toBe("went_well");
    expect(parsed.safetySignal).toBe("injury_or_pain");
  });

  it("accepts explicit nulls (owner clearing a value)", () => {
    expect(practiceEvidenceSchema.parse({ outcome: null, distraction: null }).outcome).toBeNull();
  });

  it("rejects values outside the controlled vocabulary", () => {
    expect(practiceEvidenceSchema.safeParse({ outcome: "great" }).success).toBe(false);
    expect(practiceEvidenceSchema.safeParse({ distraction: "extreme" }).success).toBe(false);
    expect(practiceEvidenceSchema.safeParse({ safetySignal: "bit someone" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/shared exec vitest run src/practice-evidence.test.ts`
Expected: FAIL — `Failed to resolve import "./practice-evidence"`.

- [ ] **Step 3: Create `packages/shared/src/practice-evidence.ts`**

```ts
import { z } from "zod";

/**
 * Controlled practice-evidence vocabulary. These values are stored in the
 * database and compared across curriculum versions, so their meaning must not
 * change once shipped. The values are descriptive, not a universal difficulty
 * order: for example, greater distance is harder for recall but safer/easier
 * for trigger work.
 */
export const practiceOutcomeValues = ["went_well", "mixed", "too_hard"] as const;
export type PracticeOutcome = (typeof practiceOutcomeValues)[number];

export const practiceDimensionValues = [
  "cue_support",
  "environment",
  "distance",
  "duration",
  "distraction",
] as const;
export type PracticeDimension = (typeof practiceDimensionValues)[number];

export const cueSupportValues = ["food_lure", "hand_signal", "verbal_cue", "no_extra_help"] as const;
export type CueSupport = (typeof cueSupportValues)[number];

export const environmentValues = [
  "home_quiet",
  "home_busy",
  "yard",
  "quiet_outdoor",
  "busy_outdoor",
] as const;
export type PracticeEnvironment = (typeof environmentValues)[number];

export const distanceValues = [
  "at_side",
  "few_steps",
  "across_room",
  "across_yard",
  "far_away",
] as const;
export type PracticeDistance = (typeof distanceValues)[number];

export const durationBandValues = [
  "under_5_seconds",
  "about_15_seconds",
  "about_30_seconds",
  "one_to_two_minutes",
  "five_to_fifteen_minutes",
  "about_30_minutes",
  "one_to_two_hours",
  "half_day_or_more",
] as const;
export type PracticeDurationBand = (typeof durationBandValues)[number];

export const distractionValues = ["none", "mild", "moderate", "strong"] as const;
export type PracticeDistraction = (typeof distractionValues)[number];

/**
 * Explicit, owner-answered safety inputs. The v1 policy never scans free text
 * for hidden safety meaning, so every safety-critical signal is asked for here.
 */
export const safetySignalValues = [
  "aggression_or_bite_risk",
  "injury_or_pain",
  "severe_fear_or_panic",
] as const;
export type SafetySignalType = (typeof safetySignalValues)[number];

export const easingStrategyValues = [
  "add_cue_help",
  "use_quieter_environment",
  "increase_trigger_distance",
  "decrease_owner_distance",
  "shorten_duration",
  "reduce_distractions",
] as const;
export type EasingStrategy = (typeof easingStrategyValues)[number];

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).nullable().optional();

export const practiceEvidenceSchema = z.object({
  outcome: optionalEnum(practiceOutcomeValues),
  cueSupport: optionalEnum(cueSupportValues),
  environment: optionalEnum(environmentValues),
  distance: optionalEnum(distanceValues),
  durationBand: optionalEnum(durationBandValues),
  distraction: optionalEnum(distractionValues),
  safetySignal: optionalEnum(safetySignalValues),
  practicedTarget: z
    .object({
      suggestionId: z.string().uuid(),
      variant: z.enum(["primary", "fallback"]),
    })
    .nullable()
    .optional(),
});
export type PracticeEvidenceInput = z.infer<typeof practiceEvidenceSchema>;
```

- [ ] **Step 4: Run it, expect PASS**

Run: `pnpm --filter @turingcare/shared exec vitest run src/practice-evidence.test.ts`
Expected: PASS (4 tests in `practiceEvidenceSchema` + 1 vocabulary test).

- [ ] **Step 5: Merge evidence into the practice-session schema** — in `packages/shared/src/progress.ts`, add the import at the top and replace the `practiceSessionSchema` declaration:

```ts
import { practiceEvidenceSchema } from "./practice-evidence";
```

```ts
export const practiceSessionSchema = z
  .object({
    occurredAt: z.string().min(1, "Date is required"),
    durationMinutes: z.number().int().nonnegative().nullable().optional(),
    notes: z.string().nullable().optional(),
    timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional(),
  })
  .merge(practiceEvidenceSchema);
export type PracticeSessionInput = z.infer<typeof practiceSessionSchema>;

/**
 * Expand-phase API boundary: accepts the new offset-qualified instant and the
 * legacy datetime-local shape during one web rollout. Legacy saves remain
 * unanchored because they have no owner offset.
 */
export const practiceSessionApiSchema = practiceSessionSchema.extend({
  occurredAt: z.union([
    z.string().datetime({ offset: true }),
    z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  ]),
});
```

- [ ] **Step 6: Export the module** — in `packages/shared/src/index.ts`, add `export * from "./practice-evidence";` immediately after the `export * from "./journal";` line (keep the list alphabetical: journal, practice-evidence, progress, profile, …).

- [ ] **Step 7: Add the regression test for the merged schema** — append to `packages/shared/src/progress.test.ts`:

Add `practiceSessionApiSchema` to that file's existing `./progress` import.

```ts
describe("practiceSessionSchema with evidence", () => {
  it("still accepts a bare session with no evidence", () => {
    const parsed = practiceSessionSchema.parse({ occurredAt: "2026-08-11T10:00" });
    expect(parsed.outcome).toBeUndefined();
  });

  it("accepts outcome, context and a safety signal", () => {
    const parsed = practiceSessionSchema.parse({
      occurredAt: "2026-08-11T10:00:00-04:00",
      outcome: "too_hard",
      distraction: "strong",
      safetySignal: "severe_fear_or_panic",
      practicedTarget: {
        suggestionId: "11111111-1111-4111-8111-111111111111",
        variant: "primary",
      },
    });
    expect(parsed.outcome).toBe("too_hard");
    expect(parsed.distraction).toBe("strong");
    expect(parsed.safetySignal).toBe("severe_fear_or_panic");
    expect(parsed.practicedTarget).toEqual({
      suggestionId: "11111111-1111-4111-8111-111111111111",
      variant: "primary",
    });
  });

  it("rejects an unknown outcome", () => {
    expect(
      practiceSessionSchema.safeParse({
        occurredAt: "2026-08-11T10:00:00.000Z",
        outcome: "perfect",
      })
        .success,
    ).toBe(false);
  });

  it("accepts both deploy-compatible and offset-qualified API timestamps", () => {
    expect(
      practiceSessionApiSchema.safeParse({ occurredAt: "2026-08-11T10:00" }).success,
    ).toBe(true);
    expect(
      practiceSessionApiSchema.safeParse({ occurredAt: "2026-08-11T10:00:00-04:00" }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 8: Add explicit safety input to behavior concerns** — in
  `packages/shared/src/dog.ts`, import `safetySignalValues` and extend
  `behaviorConcernSchema`:

```ts
import { safetySignalValues } from "./practice-evidence";

export const behaviorConcernSchema = z.object({
  concern: z.string().min(1, "Concern is required").max(500),
  severity: concernSeverity,
  safetySignal: z.enum(safetySignalValues).nullable().optional(),
});
```

Append this regression test to `packages/shared/src/dog.test.ts`:

```ts
describe("behaviorConcernSchema safety input", () => {
  it("accepts an explicit structured safety signal", () => {
    const parsed = behaviorConcernSchema.parse({
      concern: "Growled and snapped near the food bowl",
      severity: "moderate",
      safetySignal: "aggression_or_bite_risk",
    });
    expect(parsed.safetySignal).toBe("aggression_or_bite_risk");
  });

  it("keeps the signal optional and rejects free-form risk labels", () => {
    expect(
      behaviorConcernSchema.parse({ concern: "Counter surfing", severity: "mild" }).safetySignal,
    ).toBeUndefined();
    expect(
      behaviorConcernSchema.safeParse({
        concern: "Something happened",
        severity: "moderate",
        safetySignal: "maybe dangerous",
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 9: Run the shared suite, expect PASS**

Run: `pnpm --filter @turingcare/shared test`
Expected: PASS, all files.

- [ ] **Step 10: Typecheck + commit**

```bash
pnpm --filter @turingcare/shared exec tsc --noEmit
git add packages/shared/src/practice-evidence.ts packages/shared/src/practice-evidence.test.ts packages/shared/src/progress.ts packages/shared/src/progress.test.ts packages/shared/src/dog.ts packages/shared/src/dog.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): structured practice evidence contract"
```

---

## Task 2: Shared week key for historically versioned focus

**Files:**
- Modify: `packages/shared/src/focus.ts`
- Modify: `packages/shared/src/focus.test.ts`

- [ ] **Step 1: Write the failing test** — replace the whole contents of `packages/shared/src/focus.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  focusAddSchema,
  focusRemoveQuerySchema,
  focusWeekQuerySchema,
  weekKeySchema,
} from "./focus";

const SKILL_ID = "5f3f0b7a-6d1a-4f1e-9a3c-2f5d9d8f6b21";
const MONDAY = "2026-08-10";
const TUESDAY = "2026-08-11";

describe("weekKeySchema", () => {
  it("accepts a Monday date key", () => {
    expect(weekKeySchema.parse(MONDAY)).toBe(MONDAY);
  });

  it("rejects a non-Monday, a malformed key and an impossible date", () => {
    expect(weekKeySchema.safeParse(TUESDAY).success).toBe(false);
    expect(weekKeySchema.safeParse("2026-8-10").success).toBe(false);
    expect(weekKeySchema.safeParse("2026-13-45").success).toBe(false);
  });
});

describe("focusAddSchema", () => {
  it("requires a skill id and a week key", () => {
    expect(focusAddSchema.parse({ skillId: SKILL_ID, weekKey: MONDAY }).weekKey).toBe(MONDAY);
    expect(focusAddSchema.safeParse({ skillId: SKILL_ID }).success).toBe(false);
  });
});

describe("focusWeekQuerySchema", () => {
  it("requires the local week key and browser timezone offset", () => {
    const parsed = focusWeekQuerySchema.parse({
      weekKey: MONDAY,
      timezoneOffsetMinutes: "420",
      weekEndTimezoneOffsetMinutes: "420",
    });
    expect(parsed.weekKey).toBe(MONDAY);
    expect(parsed.timezoneOffsetMinutes).toBe(420);
    expect(parsed.weekEndTimezoneOffsetMinutes).toBe(420);
    expect(
      focusWeekQuerySchema.safeParse({
        weekKey: MONDAY,
        timezoneOffsetMinutes: 900,
        weekEndTimezoneOffsetMinutes: 420,
      }).success,
    ).toBe(false);
  });
});

describe("focusRemoveQuerySchema", () => {
  it("requires the week key", () => {
    expect(focusRemoveQuerySchema.parse({ weekKey: MONDAY }).weekKey).toBe(MONDAY);
    expect(focusRemoveQuerySchema.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/shared exec vitest run src/focus.test.ts`
Expected: FAIL — `weekKeySchema` / `focusRemoveQuerySchema` are not exported.

- [ ] **Step 3: Replace `packages/shared/src/focus.ts`**

```ts
import { z } from "zod";

/**
 * Local Monday of the focus week, as `YYYY-MM-DD`. Weekly focus is versioned by
 * this key so a past week always renders the selection that was active then.
 * The client sends its own local Monday; the server never derives it from an
 * instant, so owners in any timezone get a stable, consistent week bucket.
 */
export const weekKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "weekKey must be YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "weekKey must be a real date")
  .refine(
    (value) => new Date(`${value}T00:00:00.000Z`).getUTCDay() === 1,
    "weekKey must be a Monday",
  );
export type WeekKey = z.infer<typeof weekKeySchema>;

export const focusAddSchema = z.object({
  skillId: z.string().uuid(),
  weekKey: weekKeySchema,
});
export type FocusAddInput = z.infer<typeof focusAddSchema>;

export const focusWeekQuerySchema = z.object({
  weekKey: weekKeySchema,
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840),
  weekEndTimezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840),
});
export type FocusWeekQuery = z.infer<typeof focusWeekQuerySchema>;

export const focusRemoveQuerySchema = z.object({ weekKey: weekKeySchema });
export type FocusRemoveQuery = z.infer<typeof focusRemoveQuerySchema>;
```

- [ ] **Step 4: Run it, expect PASS**

Run: `pnpm --filter @turingcare/shared exec vitest run src/focus.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and continue directly to Task 8**

```bash
pnpm --filter @turingcare/shared exec tsc --noEmit
```

Do not commit yet. Task 3 consumes the new week key, then Tasks 8 and 9 update
the API/web consumers in the same atomic checkpoint.

---

## Task 3: Shared suggestion + advancement contract

**Files:**
- Create: `packages/shared/src/suggestion.ts`
- Create: `packages/shared/src/suggestion.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test** — create `packages/shared/src/suggestion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  advancementDecisionSchema,
  advancementStatusValues,
  evidenceCategoryValues,
  referralCategoryValues,
  safetyRuleValues,
  suggestionActionSchema,
  suggestionActionValues,
  suggestionQuerySchema,
  suggestionRuleValues,
  suggestionTypeValues,
} from "./suggestion";

describe("suggestion vocabularies", () => {
  it("keeps stable identifiers for audit records", () => {
    expect(suggestionTypeValues).toEqual([
      "exercise",
      "safety_suppressed",
      "needs_focus_skill",
      "custom_skill_unsupported",
    ]);
    expect(suggestionRuleValues).toEqual([
      "needs_focus_skill",
      "custom_skill_unsupported",
      "cold_start_curriculum_level",
      "step_back_after_too_hard",
      "ease_after_harder_checkin",
      "ease_after_hard_context",
      "hold_after_mixed",
      "maintain_current_level",
    ]);
    expect(evidenceCategoryValues).toEqual([
      "curriculum_only",
      "recent_practice",
      "recent_observation",
    ]);
    expect(safetyRuleValues).toEqual([
      "reported_injury_or_pain",
      "reported_aggression_or_bite_risk",
      "reported_severe_fear",
      "severe_recorded_concern",
      "sustained_worsening_intensity",
    ]);
    expect(referralCategoryValues).toEqual([
      "veterinarian",
      "veterinary_behaviorist",
      "credentialed_trainer",
    ]);
    expect(suggestionActionValues).toEqual([
      "started",
      "skipped",
      "rated_useful",
      "rated_not_useful",
    ]);
    expect(advancementStatusValues).toEqual([
      "proposed",
      "confirmed",
      "stayed",
      "rejected",
      "regressed",
      "insufficient_evidence",
      "withdrawn",
    ]);
  });
});

describe("suggestion request schemas", () => {
  it("suggestionQuerySchema requires a Monday week key and timezone offset", () => {
    expect(
      suggestionQuerySchema.parse({
        weekKey: "2026-08-10",
        timezoneOffsetMinutes: "420",
      }).timezoneOffsetMinutes,
    ).toBe(420);
    expect(suggestionQuerySchema.safeParse({ weekKey: "2026-08-11" }).success).toBe(false);
  });

  it("suggestionActionSchema accepts owner actions only", () => {
    expect(suggestionActionSchema.parse({ action: "started" }).action).toBe("started");
    expect(suggestionActionSchema.safeParse({ action: "shown" }).success).toBe(false);
  });

  it("advancementDecisionSchema accepts the five owner decisions and rejects system statuses", () => {
    for (const decision of [
      "confirmed",
      "stayed",
      "rejected",
      "regressed",
      "insufficient_evidence",
    ]) {
      expect(advancementDecisionSchema.parse({ decision }).decision).toBe(decision);
    }
    expect(advancementDecisionSchema.safeParse({ decision: "proposed" }).success).toBe(false);
    expect(advancementDecisionSchema.safeParse({ decision: "withdrawn" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/shared exec vitest run src/suggestion.test.ts`
Expected: FAIL — `Failed to resolve import "./suggestion"`.

- [ ] **Step 3: Create `packages/shared/src/suggestion.ts`**

```ts
import { z } from "zod";
import { weekKeySchema } from "./focus";
import type {
  EasingStrategy,
  PracticeDimension,
  PracticeOutcome,
} from "./practice-evidence";

export const suggestionTypeValues = [
  "exercise",
  "safety_suppressed",
  "needs_focus_skill",
  "custom_skill_unsupported",
] as const;
export type SuggestionType = (typeof suggestionTypeValues)[number];

/** Deterministic rule identifiers. Stored on every audit row. */
export const suggestionRuleValues = [
  "needs_focus_skill",
  "custom_skill_unsupported",
  "cold_start_curriculum_level",
  "step_back_after_too_hard",
  "ease_after_harder_checkin",
  "ease_after_hard_context",
  "hold_after_mixed",
  "maintain_current_level",
] as const;
export type SuggestionRule = (typeof suggestionRuleValues)[number];

export const evidenceCategoryValues = [
  "curriculum_only",
  "recent_practice",
  "recent_observation",
] as const;
export type EvidenceCategory = (typeof evidenceCategoryValues)[number];

export const safetyRuleValues = [
  "reported_injury_or_pain",
  "reported_aggression_or_bite_risk",
  "reported_severe_fear",
  "severe_recorded_concern",
  "sustained_worsening_intensity",
] as const;
export type SafetyRule = (typeof safetyRuleValues)[number];

export const referralCategoryValues = [
  "veterinarian",
  "veterinary_behaviorist",
  "credentialed_trainer",
] as const;
export type ReferralCategory = (typeof referralCategoryValues)[number];

/** Owner-initiated actions on a shown suggestion. */
export const suggestionActionValues = [
  "started",
  "skipped",
  "rated_useful",
  "rated_not_useful",
] as const;
export type SuggestionAction = (typeof suggestionActionValues)[number];

/** `withdrawn` is system-set when evidence stops supporting an open proposal. */
export const advancementStatusValues = [
  "proposed",
  "confirmed",
  "stayed",
  "rejected",
  "regressed",
  "insufficient_evidence",
  "withdrawn",
] as const;
export type AdvancementStatus = (typeof advancementStatusValues)[number];

export const advancementDecisionValues = [
  "confirmed",
  "stayed",
  "rejected",
  "regressed",
  "insufficient_evidence",
] as const;
export type AdvancementDecision = (typeof advancementDecisionValues)[number];

export const advancementRuleId = "recent_success_at_level" as const;

export const suggestionQuerySchema = z.object({
  weekKey: weekKeySchema,
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840),
});
export type SuggestionQuery = z.infer<typeof suggestionQuerySchema>;

export const suggestionActionSchema = z.object({ action: z.enum(suggestionActionValues) });
export type SuggestionActionInput = z.infer<typeof suggestionActionSchema>;

export const advancementDecisionSchema = z.object({
  decision: z.enum(advancementDecisionValues),
});
export type AdvancementDecisionInput = z.infer<typeof advancementDecisionSchema>;

/** One reviewed exercise: authored catalog prose for a curriculum level. */
export type CurriculumExercise = {
  level: number;
  exercise: string;
  dimension: PracticeDimension;
};

/**
 * The single easier variant. Its explicit strategy is rendered for every
 * level so a distance fallback never reverses safety direction.
 */
export type CurriculumFallback = {
  level: number;
  exercise: string;
  reducedDimension: PracticeDimension;
  sameLevelEasing: boolean;
  easingStrategy: EasingStrategy | null;
};

export type SuggestionEvidence = {
  windowDays: number;
  sessionCount: number;
  wentWellCount: number;
  mixedCount: number;
  tooHardCount: number;
  distinctDayCount: number;
  lastPracticeAt: string | null;
};

export type AdvancementProposalDto = {
  id: string;
  skillId: string;
  fromLevel: number;
  toLevel: number;
  ruleId: typeof advancementRuleId;
  status: AdvancementStatus;
  sessionCount: number;
  dayCount: number;
  windowDays: number;
  supportingSessions: Array<{
    id: string;
    occurredAt: string;
    practiceDay: string;
    outcome: PracticeOutcome;
  }>;
  createdAt: string;
  decidedAt: string | null;
};

export type SuggestionSafety = {
  suppressed: true;
  ruleId: SafetyRule;
  referral: ReferralCategory;
};

export type TrainingSuggestion = {
  suggestionId: string | null;
  /** True after the owner skips this exact audited suggestion for the day. */
  dismissed: boolean;
  type: SuggestionType;
  ruleId: SuggestionRule | null;
  curriculumVersion: string;
  dogId: string;
  weekKey: string;
  skill: {
    id: string;
    name: string;
    catalogSkillKey: string | null;
    level: number;
    goalId: string;
    goalName: string;
  } | null;
  primary: CurriculumExercise | null;
  fallback: CurriculumFallback | null;
  requestedDimensions: PracticeDimension[];
  evidenceCategory: EvidenceCategory | null;
  evidence: SuggestionEvidence;
  safety: SuggestionSafety | null;
  advancementProposal: AdvancementProposalDto | null;
};
```

- [ ] **Step 4: Export the module** — in `packages/shared/src/index.ts`, add `export * from "./suggestion";` after `export * from "./progress";`.

- [ ] **Step 5: Run it, expect PASS**

Run: `pnpm --filter @turingcare/shared exec vitest run src/suggestion.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and continue directly to Task 8**

```bash
pnpm --filter @turingcare/shared exec tsc --noEmit
```

Do not commit yet: `suggestion.ts` imports Task 2's uncommitted week-key
contract. Include both shared changes in Task 9's atomic cutover commit.

---

## Task 4: Catalog types gain dimension metadata

**Files:**
- Modify: `packages/shared/src/training-catalog.ts`
- Modify: `apps/api/src/data/training-catalog.ts` (type annotation only)
- Modify: `apps/web/src/components/training/template-picker.test.tsx`

- [ ] **Step 1: Replace `packages/shared/src/training-catalog.ts`**

```ts
import type { EasingStrategy, PracticeDimension } from "./practice-evidence";

export type CatalogLevel = {
  level: 1 | 2 | 3 | 4 | 5;
  description: string;
};

/** Authored, professionally reviewed content: names + five level descriptions. */
export type AuthoredCatalogSkill = {
  key: string;
  name: string;
  description: string;
  levels: CatalogLevel[];
};

export type AuthoredCatalogTemplate = {
  key: string;
  name: string;
  description: string;
  skills: AuthoredCatalogSkill[];
};

/**
 * Machine-readable progression metadata for one catalog skill.
 * - `dimensions`: the practice-context dimensions worth asking the owner about.
 * - `levelSteps`: the single dimension that changes from level 1→2, 2→3, 3→4
 *   and 4→5. Index 0 is the 1→2 step, so the step *into* level N is
 *   `levelSteps[N - 2]`.
 * - `levelStepStrategies`: the reviewed safe easing direction for undoing each
 *   step while keeping the authored exercise at the same level. Every entry is
 *   required so a fallback changes exactly one declared dimension instead of
 *   swapping to lower-level prose that may change several dimensions.
 * - `baseEase`: the reviewed direction used at level 1. Direction is explicit
 *   because greater distance is
 *   easier for trigger work but harder for recall.
 */
export type SkillDimensionMetadata = {
  dimensions: PracticeDimension[];
  levelSteps: [PracticeDimension, PracticeDimension, PracticeDimension, PracticeDimension];
  levelStepStrategies: [
    EasingStrategy,
    EasingStrategy,
    EasingStrategy,
    EasingStrategy,
  ];
  baseEase: {
    dimension: PracticeDimension;
    strategy: EasingStrategy;
  };
};

export type CatalogSkill = AuthoredCatalogSkill & SkillDimensionMetadata;

export type CatalogTemplate = {
  key: string;
  name: string;
  description: string;
  skills: CatalogSkill[];
};
```

- [ ] **Step 2: Point the authored data file at the authored type** — in `apps/api/src/data/training-catalog.ts`, change the first two lines to:

```ts
import type { AuthoredCatalogTemplate } from "@turingcare/shared";

export const trainingCatalog: AuthoredCatalogTemplate[] = [
```

- [ ] **Step 3: Typecheck, expect one known failure**

Run: `pnpm --filter @turingcare/api exec tsc --noEmit`
Expected: FAIL in `apps/api/src/routes/training.ts` or `apps/web` only if something requires the enriched `CatalogTemplate`. At this point the API should still typecheck clean because `trainingApp` returns `trainingCatalog` untyped by `CatalogTemplate`. If `tsc` reports errors in files other than the ones this plan modifies, stop and read them — do not weaken the types.

- [ ] **Step 4: Run the existing catalog test, expect PASS**

Run: `pnpm --filter @turingcare/api exec vitest run src/data/training-catalog.test.ts`
Expected: PASS (unchanged behaviour).

- [ ] **Step 5: Enrich the typed web fixture**

In `apps/web/src/components/training/template-picker.test.tsx`, add
`dimensions`, `levelSteps`, `levelStepStrategies`, and `baseEase` to both skill
objects in `sampleCatalog`. Use the exact `basic-manners.sit` and
`basic-manners.down` metadata from Task 5. The fixture is explicitly typed
`CatalogTemplate[]`, so leaving it in the authored-only shape makes the final
web typecheck fail.

- [ ] **Step 6: Continue directly to Task 5**

Tasks 4 and 5 are one atomic checkpoint: the shared enriched type intentionally
precedes the enriched API payload. Do not commit or run the web typecheck in
between them. Task 5 updates the endpoint and commits both tasks only after the
shared, API, and web packages typecheck together.

---

## Task 5: Curriculum metadata for all 21 catalog skills

**Files:**
- Create: `apps/api/src/data/training-curriculum.ts`
- Create: `apps/api/src/data/training-curriculum.test.ts`

Design note: we deliberately do **not** author 105 new target strings. The exercise text a suggestion shows is always an existing reviewed level description. Each of the 21 bounded metadata records contains requested dimensions, four level-step dimensions, and a direction-aware base easing strategy. The six localized easing clauses added in Task 18 are the only new fallback instruction copy and must receive the same curriculum review as the catalog prose before public v1.

- [ ] **Step 1: Write the failing test** — create `apps/api/src/data/training-curriculum.test.ts`:

```ts
import { easingStrategyValues, practiceDimensionValues } from "@turingcare/shared";
import { describe, expect, it } from "vitest";
import { trainingCatalog } from "./training-catalog";
import {
  CURRICULUM_VERSION,
  findCurriculumSkill,
  skillDimensionMetadata,
  trainingCurriculum,
} from "./training-curriculum";

const allSkillKeys = trainingCatalog.flatMap((template) =>
  template.skills.map((skill) => skill.key),
);

describe("training curriculum metadata", () => {
  it("has a stable version string", () => {
    expect(CURRICULUM_VERSION).toBe("2026-08-11");
  });

  it("covers all 21 catalog skills and nothing else", () => {
    expect(allSkillKeys).toHaveLength(21);
    expect(Object.keys(skillDimensionMetadata).sort()).toEqual([...allSkillKeys].sort());
  });

  it("uses only known dimensions", () => {
    for (const [key, meta] of Object.entries(skillDimensionMetadata)) {
      for (const dimension of [...meta.dimensions, ...meta.levelSteps, meta.baseEase.dimension]) {
        expect(practiceDimensionValues, `${key} uses an unknown dimension`).toContain(dimension);
      }
    }
  });

  it("asks about at least two dimensions per skill without duplicates", () => {
    for (const [key, meta] of Object.entries(skillDimensionMetadata)) {
      expect(meta.dimensions.length, `${key} needs >= 2 dimensions`).toBeGreaterThanOrEqual(2);
      expect(new Set(meta.dimensions).size, `${key} has duplicate dimensions`).toBe(
        meta.dimensions.length,
      );
    }
  });

  it("declares exactly four level steps drawn from the skill's own dimensions", () => {
    for (const [key, meta] of Object.entries(skillDimensionMetadata)) {
      expect(meta.levelSteps, `${key} needs 4 level steps`).toHaveLength(4);
      expect(meta.levelStepStrategies, `${key} needs 4 easing strategies`).toHaveLength(4);
      for (const step of meta.levelSteps) {
        expect(meta.dimensions, `${key} step ${step} is not a requested dimension`).toContain(step);
      }
      for (const strategy of meta.levelStepStrategies) {
        if (strategy !== null) {
          expect(easingStrategyValues, `${key} uses an unknown easing strategy`).toContain(
            strategy,
          );
        }
      }
      expect(meta.dimensions, `${key} base easing dimension is not requested`).toContain(
        meta.baseEase.dimension,
      );
      expect(easingStrategyValues, `${key} uses an unknown easing strategy`).toContain(
        meta.baseEase.strategy,
      );
    }
  });

  it("never leaves a distance step without an explicit safe direction", () => {
    for (const [key, meta] of Object.entries(skillDimensionMetadata)) {
      meta.levelSteps.forEach((dimension, index) => {
        if (dimension === "distance") {
          expect(
            meta.levelStepStrategies[index],
            `${key} distance step ${index + 1} needs a direction`,
          ).not.toBeNull();
        }
      });
    }
  });

  it("keeps reviewed mappings for semantically ambiguous progressions", () => {
    expect(skillDimensionMetadata["basic-manners.stay"]).toEqual({
      dimensions: ["duration", "distance", "distraction"],
      levelSteps: ["distance", "duration", "distraction", "duration"],
      levelStepStrategies: [
        "decrease_owner_distance",
        "shorten_duration",
        "reduce_distractions",
        "shorten_duration",
      ],
      baseEase: { dimension: "duration", strategy: "shorten_duration" },
    });
    expect(skillDimensionMetadata["puppy-fundamentals.potty-signal"]).toEqual({
      dimensions: ["cue_support", "duration"],
      levelSteps: ["duration", "cue_support", "cue_support", "duration"],
      levelStepStrategies: [
        "shorten_duration",
        "add_cue_help",
        "add_cue_help",
        "shorten_duration",
      ],
      baseEase: { dimension: "duration", strategy: "shorten_duration" },
    });
    expect(skillDimensionMetadata["puppy-fundamentals.bite-inhibition"]).toEqual({
      dimensions: ["cue_support", "distraction"],
      levelSteps: ["cue_support", "cue_support", "cue_support", "cue_support"],
      levelStepStrategies: [
        "add_cue_help",
        "add_cue_help",
        "add_cue_help",
        "add_cue_help",
      ],
      baseEase: { dimension: "cue_support", strategy: "add_cue_help" },
    });
  });

  it("merges metadata onto every authored skill and keeps the authored prose", () => {
    expect(trainingCurriculum).toHaveLength(trainingCatalog.length);
    for (const template of trainingCurriculum) {
      for (const skill of template.skills) {
        expect(skill.levels).toHaveLength(5);
        expect(skill.levels.map((level) => level.level)).toEqual([1, 2, 3, 4, 5]);
        for (const level of skill.levels) {
          expect(level.description.length).toBeGreaterThan(20);
        }
        expect(skill.dimensions.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("finds a skill by key and returns undefined for unknown keys", () => {
    const sit = findCurriculumSkill("basic-manners.sit");
    expect(sit?.name).toBe("Sit");
    expect(sit?.levelSteps).toHaveLength(4);
    expect(findCurriculumSkill("basic-manners.moonwalk")).toBeUndefined();
    expect(findCurriculumSkill(null)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/api exec vitest run src/data/training-curriculum.test.ts`
Expected: FAIL — `Failed to resolve import "./training-curriculum"`.

- [ ] **Step 3: Create `apps/api/src/data/training-curriculum.ts`**

```ts
import type { CatalogSkill, CatalogTemplate, SkillDimensionMetadata } from "@turingcare/shared";
import { trainingCatalog } from "./training-catalog";

/**
 * Bumped whenever authored level prose or the metadata below changes meaning.
 * Stamped on practice sessions and suggestion audit rows so cohort analysis can
 * separate evidence collected under different curriculum content.
 */
export const CURRICULUM_VERSION = "2026-08-11";

/**
 * For each catalog skill: which practice-context dimensions we ask about,
 * which single dimension each authored level step raises (1→2, 2→3, 3→4, 4→5),
 * and which dimension to ease at level 1 where no lower level exists.
 * Derived by reading the authored level descriptions in ./training-catalog.ts.
 */
export const skillDimensionMetadata: Record<string, SkillDimensionMetadata> = {
  "basic-manners.sit": {
    dimensions: ["cue_support", "environment", "distraction"],
    levelSteps: ["cue_support", "distraction", "environment", "environment"],
    levelStepStrategies: ["add_cue_help", "reduce_distractions", "use_quieter_environment", "use_quieter_environment"],
    baseEase: { dimension: "cue_support", strategy: "add_cue_help" },
  },
  "basic-manners.down": {
    dimensions: ["cue_support", "environment", "duration", "distraction"],
    levelSteps: ["cue_support", "distraction", "duration", "environment"],
    levelStepStrategies: ["add_cue_help", "reduce_distractions", "shorten_duration", "use_quieter_environment"],
    baseEase: { dimension: "cue_support", strategy: "add_cue_help" },
  },
  "basic-manners.stay": {
    dimensions: ["duration", "distance", "distraction"],
    levelSteps: ["distance", "duration", "distraction", "duration"],
    levelStepStrategies: ["decrease_owner_distance", "shorten_duration", "reduce_distractions", "shorten_duration"],
    baseEase: { dimension: "duration", strategy: "shorten_duration" },
  },
  "basic-manners.recall": {
    dimensions: ["distance", "environment", "distraction"],
    levelSteps: ["distance", "distraction", "environment", "distraction"],
    levelStepStrategies: ["decrease_owner_distance", "reduce_distractions", "use_quieter_environment", "reduce_distractions"],
    baseEase: { dimension: "distance", strategy: "decrease_owner_distance" },
  },
  "basic-manners.loose-leash": {
    dimensions: ["environment", "duration", "distraction"],
    levelSteps: ["environment", "distraction", "distraction", "distraction"],
    levelStepStrategies: ["use_quieter_environment", "reduce_distractions", "reduce_distractions", "reduce_distractions"],
    baseEase: { dimension: "environment", strategy: "use_quieter_environment" },
  },
  "puppy-fundamentals.name-recognition": {
    dimensions: ["environment", "distance", "distraction"],
    levelSteps: ["distraction", "distance", "distraction", "environment"],
    levelStepStrategies: ["reduce_distractions", "decrease_owner_distance", "reduce_distractions", "use_quieter_environment"],
    baseEase: { dimension: "environment", strategy: "use_quieter_environment" },
  },
  "puppy-fundamentals.potty-signal": {
    dimensions: ["cue_support", "duration"],
    levelSteps: ["duration", "cue_support", "cue_support", "duration"],
    levelStepStrategies: ["shorten_duration", "add_cue_help", "add_cue_help", "shorten_duration"],
    baseEase: { dimension: "duration", strategy: "shorten_duration" },
  },
  "puppy-fundamentals.sit": {
    dimensions: ["cue_support", "environment", "duration", "distraction"],
    levelSteps: ["cue_support", "distraction", "duration", "distraction"],
    levelStepStrategies: ["add_cue_help", "reduce_distractions", "shorten_duration", "reduce_distractions"],
    baseEase: { dimension: "cue_support", strategy: "add_cue_help" },
  },
  "puppy-fundamentals.bite-inhibition": {
    dimensions: ["cue_support", "distraction"],
    levelSteps: ["cue_support", "cue_support", "cue_support", "cue_support"],
    levelStepStrategies: ["add_cue_help", "add_cue_help", "add_cue_help", "add_cue_help"],
    baseEase: { dimension: "cue_support", strategy: "add_cue_help" },
  },
  "puppy-fundamentals.settle-on-mat": {
    dimensions: ["cue_support", "environment", "duration", "distraction"],
    levelSteps: ["duration", "duration", "distraction", "duration"],
    levelStepStrategies: ["shorten_duration", "shorten_duration", "reduce_distractions", "shorten_duration"],
    baseEase: { dimension: "duration", strategy: "shorten_duration" },
  },
  "reactivity-work.threshold-awareness": {
    dimensions: ["environment", "distance", "distraction"],
    levelSteps: ["distraction", "distance", "environment", "environment"],
    levelStepStrategies: ["reduce_distractions", "increase_trigger_distance", "use_quieter_environment", "use_quieter_environment"],
    baseEase: { dimension: "distance", strategy: "increase_trigger_distance" },
  },
  "reactivity-work.look-at-that": {
    dimensions: ["cue_support", "environment", "distance", "distraction"],
    levelSteps: ["cue_support", "distraction", "distance", "environment"],
    levelStepStrategies: ["add_cue_help", "reduce_distractions", "increase_trigger_distance", "use_quieter_environment"],
    baseEase: { dimension: "distance", strategy: "increase_trigger_distance" },
  },
  "reactivity-work.engage-disengage": {
    dimensions: ["cue_support", "environment", "distance", "distraction"],
    levelSteps: ["cue_support", "distraction", "distance", "environment"],
    levelStepStrategies: ["add_cue_help", "reduce_distractions", "increase_trigger_distance", "use_quieter_environment"],
    baseEase: { dimension: "distance", strategy: "increase_trigger_distance" },
  },
  "reactivity-work.settle-in-distractions": {
    dimensions: ["environment", "distance", "duration", "distraction"],
    levelSteps: ["duration", "distraction", "environment", "duration"],
    levelStepStrategies: ["shorten_duration", "reduce_distractions", "use_quieter_environment", "shorten_duration"],
    baseEase: { dimension: "environment", strategy: "use_quieter_environment" },
  },
  "separation-comfort.calm-departures": {
    dimensions: ["environment", "duration", "distraction"],
    levelSteps: ["distraction", "distraction", "duration", "duration"],
    levelStepStrategies: ["reduce_distractions", "reduce_distractions", "shorten_duration", "shorten_duration"],
    baseEase: { dimension: "duration", strategy: "shorten_duration" },
  },
  "separation-comfort.self-settle": {
    dimensions: ["environment", "distance", "duration"],
    levelSteps: ["distance", "duration", "duration", "duration"],
    levelStepStrategies: ["decrease_owner_distance", "shorten_duration", "shorten_duration", "shorten_duration"],
    baseEase: { dimension: "duration", strategy: "shorten_duration" },
  },
  "separation-comfort.stay-alone-duration": {
    dimensions: ["environment", "duration"],
    levelSteps: ["duration", "duration", "duration", "duration"],
    levelStepStrategies: ["shorten_duration", "shorten_duration", "shorten_duration", "shorten_duration"],
    baseEase: { dimension: "duration", strategy: "shorten_duration" },
  },
  "recall-reliability.name-response": {
    dimensions: ["environment", "distance", "distraction"],
    levelSteps: ["distance", "distraction", "distraction", "distraction"],
    levelStepStrategies: ["decrease_owner_distance", "reduce_distractions", "reduce_distractions", "reduce_distractions"],
    baseEase: { dimension: "distraction", strategy: "reduce_distractions" },
  },
  "recall-reliability.recall-on-cue": {
    dimensions: ["environment", "distance", "distraction"],
    levelSteps: ["distance", "environment", "distance", "distraction"],
    levelStepStrategies: ["decrease_owner_distance", "use_quieter_environment", "decrease_owner_distance", "reduce_distractions"],
    baseEase: { dimension: "distance", strategy: "decrease_owner_distance" },
  },
  "recall-reliability.recall-through-distractions": {
    dimensions: ["environment", "distance", "distraction"],
    levelSteps: ["distraction", "distraction", "distraction", "distraction"],
    levelStepStrategies: ["reduce_distractions", "reduce_distractions", "reduce_distractions", "reduce_distractions"],
    baseEase: { dimension: "distraction", strategy: "reduce_distractions" },
  },
  "recall-reliability.recall-at-distance": {
    dimensions: ["environment", "distance", "distraction"],
    levelSteps: ["distance", "distance", "distance", "distance"],
    levelStepStrategies: ["decrease_owner_distance", "decrease_owner_distance", "decrease_owner_distance", "decrease_owner_distance"],
    baseEase: { dimension: "distance", strategy: "decrease_owner_distance" },
  },
};

type AuthoredSkill = (typeof trainingCatalog)[number]["skills"][number];

function enrichSkill(templateKey: string, skill: AuthoredSkill): CatalogSkill {
  const metadata = skillDimensionMetadata[skill.key];
  if (!metadata) {
    throw new Error(`Missing curriculum metadata for catalog skill "${skill.key}" (${templateKey})`);
  }
  return { ...skill, ...metadata };
}

/** The authored catalog enriched with progression metadata. */
export const trainingCurriculum: CatalogTemplate[] = trainingCatalog.map((template) => ({
  key: template.key,
  name: template.name,
  description: template.description,
  skills: template.skills.map((skill) => enrichSkill(template.key, skill)),
}));

const curriculumByKey = new Map<string, CatalogSkill>(
  trainingCurriculum.flatMap((template) => template.skills.map((skill) => [skill.key, skill])),
);

export function findCurriculumSkill(key: string | null | undefined): CatalogSkill | undefined {
  if (!key) return undefined;
  return curriculumByKey.get(key);
}
```

- [ ] **Step 4: Run it, expect PASS**

Run: `pnpm --filter @turingcare/api exec vitest run src/data/training-curriculum.test.ts`
Expected: PASS — 9 tests, including the 21-skill coverage assertion and golden
semantic mappings for stay, potty signal, and bite inhibition.

- [ ] **Step 5: Serve the enriched curriculum from the templates endpoint** — in `apps/api/src/routes/training.ts`, replace the `trainingCatalog` import with `import { trainingCurriculum } from "../data/training-curriculum";` and return `{ templates: trainingCurriculum }` from the `GET /templates` handler. Leave every other handler untouched.

- [ ] **Step 6: Run the training route tests, expect PASS**

Run: `pnpm --filter @turingcare/api exec vitest run src/routes/training.test.ts`
Expected: PASS — the response gains fields but keeps every asserted key.

- [ ] **Step 7: Obtain curriculum content approval**

Before public-v1 deployment, send the complete 21-skill metadata table, the
existing 105 authored level descriptions, and the six localized easing clauses
from Task 18 to a qualified reward-based dog-training professional. Require a
recorded PR approval confirming: each level transition's named dimension
matches the authored progression; every fallback makes the exercise easier
rather than merely different; bite-inhibition, reactivity, fear, separation,
and resource-guarding copy stays within safe educational scope; and referral
boundaries are correct. Task 24's production deployment must remain blocked
until that approval exists. Any requested content change increments
`CURRICULUM_VERSION` and updates the golden metadata tests before approval is
re-requested.

- [ ] **Step 8: Commit**

```bash
pnpm exec biome check --write packages/shared/src/training-catalog.ts apps/api/src/data/training-catalog.ts apps/api/src/data/training-curriculum.ts apps/api/src/data/training-curriculum.test.ts apps/api/src/routes/training.ts apps/web/src/components/training/template-picker.test.tsx
pnpm --filter @turingcare/shared exec tsc --noEmit
pnpm --filter @turingcare/api exec tsc --noEmit
pnpm --filter @turingcare/web exec tsc --noEmit
git add packages/shared/src/training-catalog.ts apps/api/src/data/training-catalog.ts apps/api/src/data/training-curriculum.ts apps/api/src/data/training-curriculum.test.ts apps/api/src/routes/training.ts apps/web/src/components/training/template-picker.test.tsx
git commit -m "feat(api): curriculum dimension metadata for all catalog skills"
```

---

## Task 6: Curriculum target resolver (primary + one fallback)

**Files:**
- Create: `apps/api/src/lib/curriculum.ts`
- Create: `apps/api/src/lib/curriculum.test.ts`

- [ ] **Step 1: Write the failing test** — create `apps/api/src/lib/curriculum.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findCurriculumSkill, trainingCurriculum } from "../data/training-curriculum";
import { clampLevel, resolveCurriculumTarget } from "./curriculum";

const SIT = "basic-manners.sit";

describe("clampLevel", () => {
  it("keeps levels inside 1-5", () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(3)).toBe(3);
    expect(clampLevel(9)).toBe(5);
    expect(clampLevel(Number.NaN)).toBe(1);
  });
});

describe("resolveCurriculumTarget", () => {
  it("returns the authored description for the requested level", () => {
    const skill = findCurriculumSkill(SIT);
    const target = resolveCurriculumTarget(SIT, 3);
    expect(target?.primary.level).toBe(3);
    expect(target?.primary.exercise).toBe(skill?.levels[2]?.description);
  });

  it("keeps the authored level and eases exactly the step dimension", () => {
    const skill = findCurriculumSkill(SIT);
    const target = resolveCurriculumTarget(SIT, 3);
    expect(target?.fallback.level).toBe(3);
    expect(target?.fallback.exercise).toBe(skill?.levels[2]?.description);
    expect(target?.fallback.sameLevelEasing).toBe(true);
    expect(target?.fallback.easingStrategy).toBe(skill?.levelStepStrategies[1]);
    // levelSteps[1] is the dimension raised going from level 2 to level 3.
    expect(target?.fallback.reducedDimension).toBe(skill?.levelSteps[1]);
  });

  it("uses the reviewed base easing at level 1", () => {
    const skill = findCurriculumSkill(SIT);
    const target = resolveCurriculumTarget(SIT, 1);
    expect(target?.primary.level).toBe(1);
    expect(target?.fallback.level).toBe(1);
    expect(target?.fallback.exercise).toBe(skill?.levels[0]?.description);
    expect(target?.fallback.sameLevelEasing).toBe(true);
    expect(target?.fallback.reducedDimension).toBe(skill?.baseEase.dimension);
    expect(target?.fallback.easingStrategy).toBe("add_cue_help");
  });

  it("increases trigger distance for a level-1 reactivity fallback", () => {
    const target = resolveCurriculumTarget("reactivity-work.look-at-that", 1);
    expect(target?.fallback.reducedDimension).toBe("distance");
    expect(target?.fallback.easingStrategy).toBe("increase_trigger_distance");
  });

  it("clamps out-of-range levels instead of throwing", () => {
    expect(resolveCurriculumTarget(SIT, 42)?.primary.level).toBe(5);
    expect(resolveCurriculumTarget(SIT, -1)?.primary.level).toBe(1);
  });

  it("returns null for a skill that is not in the curriculum", () => {
    expect(resolveCurriculumTarget("basic-manners.moonwalk", 2)).toBeNull();
    expect(resolveCurriculumTarget(null, 2)).toBeNull();
  });

  it("resolves every level of every catalog skill with an explicit fallback dimension", () => {
    for (const template of trainingCurriculum) {
      for (const skill of template.skills) {
        for (const level of [1, 2, 3, 4, 5]) {
          const target = resolveCurriculumTarget(skill.key, level);
          expect(target, `${skill.key} level ${level}`).not.toBeNull();
          expect(target?.primary.exercise.length).toBeGreaterThan(20);
          expect(target?.fallback.exercise.length).toBeGreaterThan(20);
          expect(skill.dimensions).toContain(target?.fallback.reducedDimension);
          expect(target?.fallback.level).toBe(level);
          expect(target?.fallback.sameLevelEasing).toBe(true);
          expect(target?.fallback.easingStrategy).toBe(
            level === 1 ? skill.baseEase.strategy : skill.levelStepStrategies[level - 2],
          );
          expect(target?.requestedDimensions).toEqual(skill.dimensions);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/api exec vitest run src/lib/curriculum.test.ts`
Expected: FAIL — `Failed to resolve import "./curriculum"`.

- [ ] **Step 3: Create `apps/api/src/lib/curriculum.ts`**

```ts
import type {
  CurriculumExercise,
  CurriculumFallback,
  PracticeDimension,
} from "@turingcare/shared";
import { findCurriculumSkill } from "../data/training-curriculum";

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_LEVEL;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)));
}

export type CurriculumTarget = {
  skillKey: string;
  level: number;
  primary: CurriculumExercise;
  fallback: CurriculumFallback;
  requestedDimensions: PracticeDimension[];
};

/**
 * Resolves the reviewed exercise for a level plus exactly one easier variant.
 * The primary is always the authored level description. The fallback is the
 * same authored description plus one professionally reviewed easing clause for
 * the step dimension. It never substitutes lower-level prose, because an
 * authored level change may alter several dimensions at once.
 */
export function resolveCurriculumTarget(
  skillKey: string | null | undefined,
  level: number,
): CurriculumTarget | null {
  const skill = findCurriculumSkill(skillKey);
  if (!skill) return null;

  const target = clampLevel(level);
  const primaryLevel = skill.levels[target - 1];
  if (!primaryLevel) return null;

  const stepIntoTarget = target >= 2 ? skill.levelSteps[target - 2] : undefined;
  const easingIntoTarget =
    target >= 2 ? skill.levelStepStrategies[target - 2] : undefined;
  const fallback: CurriculumFallback = {
    level: target,
    exercise: primaryLevel.description,
    reducedDimension: stepIntoTarget ?? skill.baseEase.dimension,
    sameLevelEasing: true,
    easingStrategy: easingIntoTarget ?? skill.baseEase.strategy,
  };

  return {
    skillKey: skill.key,
    level: target,
    primary: {
      level: target,
      exercise: primaryLevel.description,
      dimension: stepIntoTarget ?? skill.baseEase.dimension,
    },
    fallback,
    requestedDimensions: skill.dimensions,
  };
}
```

- [ ] **Step 4: Run it, expect PASS**

Run: `pnpm --filter @turingcare/api exec vitest run src/lib/curriculum.test.ts`
Expected: PASS — including the sweep over 21 skills × 5 levels = 105 resolved targets.

- [ ] **Step 5: Commit**

```bash
pnpm --filter @turingcare/api exec tsc --noEmit
git add apps/api/src/lib/curriculum.ts apps/api/src/lib/curriculum.test.ts
git commit -m "feat(api): resolve curriculum targets with an explicit easier fallback"
```

---

## Task 7: Migration — historically versioned weekly focus

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0013_weekly_focus_week_start.sql` (rename the generated file to this name)
- Modify: `apps/api/drizzle/meta/_journal.json` + generated snapshot (drizzle-kit writes these)
- Modify: `docs/PROJECT-LOG.md`

- [ ] **Step 1: Update the schema** — in `apps/api/src/db/schema.ts`, replace the `weeklyFocus` table definition with:

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
    // Local Monday of the focus week. Focus is versioned per week so past weeks
    // keep the selection that was actually active then.
    // Nullable only for preserved pre-migration rows whose owner-local week is
    // unknowable. Every Gate 1 write supplies a non-null Monday.
    weekStart: date("week_start"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("weekly_focus_dog_week").on(t.dogId, t.weekStart),
    check(
      "weekly_focus_week_start_monday",
      sql`${t.weekStart} is null or extract(isodow from ${t.weekStart}) = 1`,
    ),
  ],
);

/** Short-lived owner-local context scoped to one authenticated legacy client. */
export const focusCompatibilityWeeks = pgTable(
  "focus_compatibility_weeks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    dogId: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    weekStart: date("week_start").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [unique("focus_compatibility_dog_session").on(t.dogId, t.sessionId)],
);

/** Durable marker ensuring preserved undated focus seeds at most one week. */
export const legacyFocusClaims = pgTable("legacy_focus_claims", {
  dogId: uuid("dog_id")
    .primaryKey()
    .references(() => dogs.id, { onDelete: "cascade" }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull(),
});
```

`date` and `index` are already imported at the top of the file; do not add duplicate imports.

- [ ] **Step 2: Generate the migration**

```bash
pnpm --filter @turingcare/api db:generate
```

Expected: drizzle-kit prints `Your SQL migration file ➜ drizzle/0013_<random_name>.sql 🚀` and updates `drizzle/meta/_journal.json` + `drizzle/meta/0013_snapshot.json`.

- [ ] **Step 3: Rename the generated file and update the journal**

```bash
git -C . status --short apps/api/drizzle
mv apps/api/drizzle/0013_*.sql apps/api/drizzle/0013_weekly_focus_week_start.sql
```

Then edit `apps/api/drizzle/meta/_journal.json` and set the `tag` of the entry with `"idx": 13` to `"0013_weekly_focus_week_start"`.

- [ ] **Step 4: Inventory and document legacy focus conversion**

```bash
set -a && . ./.env && set +a
psql "$DATABASE_URL" -c 'SELECT count(*) AS legacy_focus_rows FROM weekly_focus;'
```

Record the observed count in `docs/PROJECT-LOG.md`. Preserve every row with
`week_start = NULL`; Task 8 atomically claims one deterministic row into the
owner's actual current local week on their first week request. This avoids
guessing the week from the database timezone.

- [ ] **Step 5: Hand-edit the SQL to preserve legacy focus for owner-local claim** —
  keep Drizzle's generated `focus_compatibility_weeks` and
  `legacy_focus_claims` table creation and
  replace only the generated `weekly_focus` alteration statements with:

```sql
ALTER TABLE "weekly_focus" ADD COLUMN "week_start" date;--> statement-breakpoint
ALTER TABLE "weekly_focus" DROP CONSTRAINT "weekly_focus_dog_skill";--> statement-breakpoint
ALTER TABLE "weekly_focus" ADD CONSTRAINT "weekly_focus_dog_week" UNIQUE("dog_id","week_start");--> statement-breakpoint
ALTER TABLE "weekly_focus" ADD CONSTRAINT "weekly_focus_week_start_monday"
CHECK ("week_start" IS NULL OR extract(isodow from "week_start") = 1);
```

PostgreSQL permits multiple `NULL` values in the unique constraint. Task 8
claims at most one row per dog under a dedicated dog-scoped legacy-claim lock
and records that one-time claim durably, while every new write supplies a real
Monday.

Append a mixed-version delete guard and RLS:

```sql
--> statement-breakpoint
CREATE FUNCTION "protect_weekly_focus_history_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- FK cascades delete at trigger depth 2. Preserve dog/goal/skill deletion
  -- while still rejecting direct unscoped deletes from an old API handler.
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  IF OLD."week_start" IS NOT NULL
     AND current_setting('app.allow_weekly_focus_delete', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'week-scoped focus delete requires app.allow_weekly_focus_delete';
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "weekly_focus_history_delete_guard"
BEFORE DELETE ON "weekly_focus"
FOR EACH ROW EXECUTE FUNCTION "protect_weekly_focus_history_delete"();--> statement-breakpoint
ALTER TABLE "focus_compatibility_weeks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "legacy_focus_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.focus_compatibility_weeks FROM %I', rol);
      EXECUTE format('REVOKE ALL ON TABLE public.legacy_focus_claims FROM %I', rol);
    END IF;
  END LOOP;
END
$$;
```

During the bounded maintenance deployment in Task 24, no old handler remains
live after this migration. The guard is still defense in depth for rollback or
an accidentally restarted old machine: it may insert `NULL` rows, but cannot
directly delete a claimed or historical row. FK cascades remain valid, and only
Task 8's week-scoped direct delete sets the transaction-local guard.

- [ ] **Step 6: Apply it to a database that already has focus rows**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api db:migrate
psql "$DATABASE_URL" -c "\d weekly_focus"
psql "$DATABASE_URL" -c "\d focus_compatibility_weeks"
psql "$DATABASE_URL" -c "\d legacy_focus_claims"
```

Expected: `db:migrate` completes without error, all pre-existing rows still
exist with `week_start IS NULL`, and `\d weekly_focus` shows the nullable
`week_start | date` column, the `weekly_focus_dog_week` unique constraint and
its PostgreSQL-managed backing index, and **no** `weekly_focus_dog_skill`
constraint. The `weekly_focus_week_start_monday` check is present.
`focus_compatibility_weeks` and `legacy_focus_claims` exist with RLS enabled
and `weekly_focus_history_delete_guard` is attached.

Also verify the trigger behavior with a transaction-local SQL probe: an
unguarded direct delete of a non-null row raises, the same delete after
`set_config('app.allow_weekly_focus_delete', 'on', true)` succeeds, and deleting
the owning dog cascades through a non-null focus row without raising.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle docs/PROJECT-LOG.md
git commit -m "feat(api): version weekly focus by week start"
```

---

## Task 8: Week-scoped focus loader and routes

**Files:**
- Modify: `apps/api/src/lib/focus.ts`
- Modify: `apps/api/src/middleware/require-user.ts`
- Modify: `apps/api/src/routes/dogs.ts`
- Modify: `apps/api/src/telemetry/events.ts`
- Modify: `apps/api/src/routes/focus.test.ts`
- Modify: `apps/api/src/routes/telemetry.test.ts`

- [ ] **Step 1: Write the failing test** — append to `apps/api/src/routes/focus.test.ts` (inside the existing top-level `describe`, reusing its harness helpers):

Add `import { and, eq } from "drizzle-orm";` and add `weeklyFocus` to the
existing `../db/schema` import before appending the tests; the concurrency
assertion queries the table directly. Also import `claimLegacyFocus` from
`../lib/focus`; import `legacyFocusWeekKey` and `rememberLegacyFocusWeek` too.

```ts
  async function setupDogWithSkill() {
    const user = await createTestUser();
    users.push(user);
    const dog = await makeDog(user);
    const goal = await makeGoal(dog.id);
    const skill = await makeSkill(goal.id);
    return { headers: user.authHeaders, dogId: dog.id, goalId: goal.id, skillId: skill.id };
  }

  it("keeps each week's focus separate", async () => {
    const { headers, dogId, skillId } = await setupDogWithSkill();

    const addThisWeek = await app.request(`/api/dogs/${dogId}/focus`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ skillId, weekKey: "2026-08-10" }),
    });
    expect(addThisWeek.status).toBe(201);

    const addNextWeek = await app.request(`/api/dogs/${dogId}/focus`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ skillId, weekKey: "2026-08-17" }),
    });
    expect(addNextWeek.status).toBe(201);

    const thisWeek = await app.request(
      `/api/dogs/${dogId}/focus?weekKey=2026-08-10&timezoneOffsetMinutes=0&weekEndTimezoneOffsetMinutes=0`,
      { headers },
    );
    const thisWeekBody = (await thisWeek.json()) as { focusSkills: { skillId: string }[] };
    expect(thisWeekBody.focusSkills).toHaveLength(1);

    const removeThisWeek = await app.request(
      `/api/dogs/${dogId}/focus/${skillId}?weekKey=2026-08-10`,
      { method: "DELETE", headers },
    );
    expect(removeThisWeek.status).toBe(200);

    const afterRemoval = await app.request(
      `/api/dogs/${dogId}/focus?weekKey=2026-08-10&timezoneOffsetMinutes=0&weekEndTimezoneOffsetMinutes=0`,
      { headers },
    );
    const afterBody = (await afterRemoval.json()) as { focusSkills: unknown[] };
    expect(afterBody.focusSkills).toHaveLength(0);

    const nextWeek = await app.request(
      `/api/dogs/${dogId}/focus?weekKey=2026-08-17&timezoneOffsetMinutes=0&weekEndTimezoneOffsetMinutes=0`,
      { headers },
    );
    const nextWeekBody = (await nextWeek.json()) as { focusSkills: { skillId: string }[] };
    expect(nextWeekBody.focusSkills).toHaveLength(1);
    expect(nextWeekBody.focusSkills[0]?.skillId).toBe(skillId);
  });

  it("rejects a focus week key that is not a Monday", async () => {
    const { headers, dogId, skillId } = await setupDogWithSkill();
    const res = await app.request(`/api/dogs/${dogId}/focus`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ skillId, weekKey: "2026-08-11" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a legacy focus range that does not normalize to Monday", async () => {
    const { headers, dogId } = await setupDogWithSkill();
    const res = await app.request(
      `/api/dogs/${dogId}/focus?weekStart=2026-08-12T00:00:00.000Z&weekEnd=2026-08-19T00:00:00.000Z`,
      { headers },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_focus_week" });
  });

  it("enforces Monday focus dates at the database boundary", async () => {
    const { dogId, skillId } = await setupDogWithSkill();
    await expect(
      db.insert(weeklyFocus).values({
        dogId,
        skillId,
        weekStart: "2026-08-12",
        position: 0,
      }),
    ).rejects.toThrow("weekly_focus_week_start_monday");
  });

  it("replaces rather than adds a second focus skill in the same week", async () => {
    const { headers, dogId, goalId, skillId } = await setupDogWithSkill();
    const second = await makeSkill(goalId, "Down", 1);
    await app.request(`/api/dogs/${dogId}/focus`, {
      method: "POST",
      headers,
      body: JSON.stringify({ skillId, weekKey: "2026-08-10" }),
    });
    const replace = await app.request(`/api/dogs/${dogId}/focus`, {
      method: "POST",
      headers,
      body: JSON.stringify({ skillId: second.id, weekKey: "2026-08-10" }),
    });
    expect([200, 201]).toContain(replace.status);

    const get = await app.request(
      `/api/dogs/${dogId}/focus?weekKey=2026-08-10&timezoneOffsetMinutes=0&weekEndTimezoneOffsetMinutes=0`,
      { headers },
    );
    const body = (await get.json()) as { focusSkills: Array<{ skillId: string }> };
    expect(body.focusSkills).toEqual([expect.objectContaining({ skillId: second.id })]);
  });

  it("claims one retained legacy row into the requested owner-local week", async () => {
    const { dogId, skillId } = await setupDogWithSkill();
    await db.insert(weeklyFocus).values({
      dogId,
      skillId,
      weekStart: null,
      position: 0,
    });

    await claimLegacyFocus(dogId, "2026-08-10");
    const rows = await db
      .select({ skillId: weeklyFocus.skillId, weekStart: weeklyFocus.weekStart })
      .from(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dogId), eq(weeklyFocus.weekStart, "2026-08-10")));
    expect(rows).toEqual([{ skillId, weekStart: "2026-08-10" }]);
  });

  it("claims legacy focus only once across all weeks", async () => {
    const { dogId, goalId, skillId } = await setupDogWithSkill();
    const second = await makeSkill(goalId, "Down", 1);
    await db.insert(weeklyFocus).values([
      { dogId, skillId, weekStart: null, position: 0 },
      { dogId, skillId: second.id, weekStart: null, position: 1 },
    ]);

    await claimLegacyFocus(dogId, "2026-08-10");
    await claimLegacyFocus(dogId, "2026-08-17");

    const rows = await db
      .select({ skillId: weeklyFocus.skillId, weekStart: weeklyFocus.weekStart })
      .from(weeklyFocus)
      .where(eq(weeklyFocus.dogId, dogId));
    expect(rows).toEqual(
      expect.arrayContaining([
        { skillId, weekStart: "2026-08-10" },
        { skillId: second.id, weekStart: null },
      ]),
    );
    expect(rows.some((row) => row.weekStart === "2026-08-17")).toBe(false);
  });

  it("scopes legacy mutation context to one authenticated session", async () => {
    const { dogId } = await setupDogWithSkill();
    await rememberLegacyFocusWeek(dogId, "session-a", "2026-08-10");
    expect(await legacyFocusWeekKey(dogId, "session-a")).toBe("2026-08-10");
    expect(await legacyFocusWeekKey(dogId, "session-b")).toBeNull();
  });

  it("serializes a first legacy claim against a focus replacement", async () => {
    const { headers, dogId, goalId, skillId } = await setupDogWithSkill();
    const second = await makeSkill(goalId, "Down", 1);
    await db.insert(weeklyFocus).values({
      dogId,
      skillId,
      weekStart: null,
      position: 0,
    });

    const [, replace] = await Promise.all([
      claimLegacyFocus(dogId, "2026-08-10"),
      app.request(`/api/dogs/${dogId}/focus`, {
        method: "POST",
        headers,
        body: JSON.stringify({ skillId: second.id, weekKey: "2026-08-10" }),
      }),
    ]);

    expect([200, 201]).toContain(replace.status);
    const current = await db
      .select({ skillId: weeklyFocus.skillId })
      .from(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dogId), eq(weeklyFocus.weekStart, "2026-08-10")));
    expect(current).toEqual([{ skillId: second.id }]);
  });

  it("allows focus cleanup through dog and skill cascades", async () => {
    const first = await setupDogWithSkill();
    await db.insert(weeklyFocus).values({
      dogId: first.dogId,
      skillId: first.skillId,
      weekStart: "2026-08-10",
      position: 0,
    });
    const deleteSkill = await app.request(
      `/api/dogs/${first.dogId}/skills/${first.skillId}`,
      { method: "DELETE", headers: first.headers },
    );
    expect(deleteSkill.status).toBe(200);

    const second = await setupDogWithSkill();
    await db.insert(weeklyFocus).values({
      dogId: second.dogId,
      skillId: second.skillId,
      weekStart: "2026-08-10",
      position: 0,
    });
    const deleteDog = await app.request(`/api/dogs/${second.dogId}`, {
      method: "DELETE",
      headers: second.headers,
    });
    expect(deleteDog.status).toBe(200);
  });

  it("rejects a direct unscoped delete of focus history", async () => {
    const { dogId, skillId } = await setupDogWithSkill();
    await db.insert(weeklyFocus).values({
      dogId,
      skillId,
      weekStart: "2026-08-10",
      position: 0,
    });

    await expect(
      db
        .delete(weeklyFocus)
        .where(and(eq(weeklyFocus.dogId, dogId), eq(weeklyFocus.skillId, skillId))),
    ).rejects.toThrow("week-scoped focus delete requires");
  });

  it("serializes concurrent replacements to one focus row", async () => {
    const { headers, dogId, goalId, skillId } = await setupDogWithSkill();
    const second = await makeSkill(goalId, "Down", 1);
    const third = await makeSkill(goalId, "Stay", 1);
    await app.request(`/api/dogs/${dogId}/focus`, {
      method: "POST",
      headers,
      body: JSON.stringify({ skillId, weekKey: "2026-08-10" }),
    });
    const responses = await Promise.all(
      [second.id, third.id].map((nextSkillId) =>
        app.request(`/api/dogs/${dogId}/focus`, {
          method: "POST",
          headers,
          body: JSON.stringify({ skillId: nextSkillId, weekKey: "2026-08-10" }),
        }),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const rows = await db
      .select()
      .from(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dogId), eq(weeklyFocus.weekStart, "2026-08-10")));
    expect(rows).toHaveLength(1);
  });

  it("serializes clear against replacement without throwing", async () => {
    const { headers, dogId, goalId, skillId } = await setupDogWithSkill();
    const second = await makeSkill(goalId, "Down", 1);
    await app.request(`/api/dogs/${dogId}/focus`, {
      method: "POST",
      headers,
      body: JSON.stringify({ skillId, weekKey: "2026-08-10" }),
    });
    const [replace, clear] = await Promise.all([
      app.request(`/api/dogs/${dogId}/focus`, {
        method: "POST",
        headers,
        body: JSON.stringify({ skillId: second.id, weekKey: "2026-08-10" }),
      }),
      app.request(`/api/dogs/${dogId}/focus/${skillId}?weekKey=2026-08-10`, {
        method: "DELETE",
        headers,
      }),
    ]);
    expect([200, 201]).toContain(replace.status);
    expect([200, 404]).toContain(clear.status);
    const rows = await db
      .select()
      .from(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dogId), eq(weeklyFocus.weekStart, "2026-08-10")));
    expect(rows.length).toBeLessThanOrEqual(1);
    if (rows.length === 1) expect(rows[0]?.skillId).toBe(second.id);
  });
```

- [ ] **Step 2: Run it, expect FAIL**

Run:
```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api exec vitest run src/routes/focus.test.ts
```
Expected: FAIL — the second POST returns 409 `already_focused` (or 400 for the unknown `weekKey` field), because focus is still keyed by dog+skill only.

- [ ] **Step 3: Make the loader week-scoped** — in `apps/api/src/lib/focus.ts`, change the signature and the `where` clause:

```ts
export async function loadFocusWeek(
  dogId: string,
  weekKey: string,
  timezoneOffsetMinutes: number,
  weekEndTimezoneOffsetMinutes: number,
): Promise<{ focusSkills: FocusSkill[] }> {
  const { startISO, endISO } = weekBoundsFromOffset(
    weekKey,
    timezoneOffsetMinutes,
    weekEndTimezoneOffsetMinutes,
  );
```

Add this helper above `loadFocusWeek` and use its output for the existing
practice-session range query:

```ts
export function weekBoundsFromOffset(
  weekKey: string,
  timezoneOffsetMinutes: number,
  weekEndTimezoneOffsetMinutes: number,
) {
  const startMs =
    Date.parse(`${weekKey}T00:00:00.000Z`) + timezoneOffsetMinutes * 60_000;
  const endLocalDateMs = Date.parse(`${weekKey}T00:00:00.000Z`) + 7 * 24 * 60 * 60_000;
  return {
    startISO: new Date(startMs).toISOString(),
    endISO: new Date(
      endLocalDateMs + weekEndTimezoneOffsetMinutes * 60_000,
    ).toISOString(),
  };
}
```

```ts
    .where(and(eq(weeklyFocus.dogId, dogId), eq(weeklyFocus.weekStart, weekKey)))
```

Keep the existing session query and mapping, but feed its existing
`gte(...new Date(startISO))` / `lt(...new Date(endISO))` predicates from the
explicit local-week bounds above.

Also export an atomic legacy-claim helper from `focus.ts`:

```ts
export async function claimLegacyFocus(dogId: string, weekKey: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`legacy-focus:${dogId}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${dogId}:${weekKey}`}))`);
    const [claimState] = await tx
      .select({ claimedAt: legacyFocusClaims.claimedAt })
      .from(legacyFocusClaims)
      .where(eq(legacyFocusClaims.dogId, dogId))
      .for("update")
      .limit(1);
    if (claimState) return;
    const [current] = await tx
      .select({ id: weeklyFocus.id })
      .from(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dogId), eq(weeklyFocus.weekStart, weekKey)))
      .limit(1);
    if (current) {
      await tx
        .insert(legacyFocusClaims)
        .values({
          dogId,
          claimedAt: new Date(),
        })
        .onConflictDoNothing();
      return;
    }
    const [legacy] = await tx
      .select({ id: weeklyFocus.id })
      .from(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dogId), isNull(weeklyFocus.weekStart)))
      .orderBy(weeklyFocus.position, weeklyFocus.createdAt, weeklyFocus.id)
      .for("update")
      .limit(1);
    if (!legacy) return;
    await tx
      .update(weeklyFocus)
      .set({ weekStart: weekKey })
      .where(eq(weeklyFocus.id, legacy.id));
    await tx
      .insert(legacyFocusClaims)
      .values({
        dogId,
        claimedAt: new Date(),
      })
      .onConflictDoNothing();
  });
}
```

Add `isNull` and `sql` to the Drizzle imports and
`legacyFocusClaims` to the schema import. The dog-scoped lock and durable claim
row ensure preserved undated rows can seed at most one week; any remaining
`NULL` rows stay audit-only.

- [ ] **Step 4: Update the three focus routes** — in `apps/api/src/routes/dogs.ts`:

Keep the expand phase compatible with the currently deployed web client. Add
`z` from `zod` and define:

```ts
const legacyFocusWeekQuerySchema = z.object({
  weekStart: z.string().datetime({ offset: true }),
  weekEnd: z.string().datetime({ offset: true }),
}).strict();
const focusWeekCompatSchema = z.union([
  focusWeekQuerySchema,
  legacyFocusWeekQuerySchema,
]);
const focusAddCompatSchema = z.union([
  focusAddSchema,
  z.object({ skillId: z.string().uuid() }).strict(),
]);
const focusRemoveCompatSchema = z.union([
  focusRemoveQuerySchema,
  z.object({}).strict(),
]);

function legacyWeekInput(weekStart: string, weekEnd: string) {
  const start = new Date(weekStart);
  const localMonday = new Date(start);
  if (localMonday.getUTCDay() === 0) localMonday.setUTCDate(localMonday.getUTCDate() + 1);
  const weekKey = localMonday.toISOString().slice(0, 10);
  const localEnd = new Date(`${weekKey}T00:00:00.000Z`);
  localEnd.setUTCDate(localEnd.getUTCDate() + 7);
  const normalized = {
    weekKey,
    timezoneOffsetMinutes:
      (Date.parse(weekStart) - Date.parse(`${weekKey}T00:00:00.000Z`)) / 60_000,
    weekEndTimezoneOffsetMinutes:
      (Date.parse(weekEnd) - localEnd.getTime()) / 60_000,
  };
  return focusWeekQuerySchema.safeParse(normalized).success ? normalized : null;
}
```

Also add short-lived compatibility context helpers in `focus.ts`. A legacy
mutation has no week in its request, so it must use the owner-local week
recorded by that same legacy client's preceding GET rather than guessing from
history or UTC. This branch remains until rollout telemetry confirms no legacy
requests.

```ts
export async function rememberLegacyFocusWeek(
  dogId: string,
  sessionId: string,
  weekKey: string,
): Promise<void> {
  await db
    .insert(focusCompatibilityWeeks)
    .values({
      dogId,
      sessionId,
      weekStart: weekKey,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    })
    .onConflictDoUpdate({
      target: [
        focusCompatibilityWeeks.dogId,
        focusCompatibilityWeeks.sessionId,
      ],
      set: {
        weekStart: weekKey,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
}

export async function legacyFocusWeekKey(
  dogId: string,
  sessionId: string,
): Promise<string | null> {
  const [context] = await db
    .select({ weekStart: focusCompatibilityWeeks.weekStart })
    .from(focusCompatibilityWeeks)
    .where(
      and(
        eq(focusCompatibilityWeeks.dogId, dogId),
        eq(focusCompatibilityWeeks.sessionId, sessionId),
        gt(focusCompatibilityWeeks.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return context?.weekStart ?? null;
}
```

Add `focusCompatibilityWeeks` to the schema import and `gt` to the Drizzle
imports.

In `apps/api/src/middleware/require-user.ts`, extend the request variables and
store Better Auth's session ID without exposing its token:

```ts
export type Vars = { userId: string; sessionId: string };

// Inside requireUser, after the null check:
c.set("userId", session.user.id);
c.set("sessionId", session.session.id);
```

Before the route emits compatibility telemetry, add
`"focus.legacy_compat_used"` to `KNOWN_EVENTS` in
`apps/api/src/telemetry/events.ts`. Keep it out of `CLIENT_EVENTS`; it is
server-emitted. This addition belongs to Task 8 so its route code and telemetry
test typecheck before Task 11.

```ts
  .get("/:id/focus", zValidator("query", focusWeekCompatSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const query = c.req.valid("query");
    const legacyRequest = "weekStart" in query;
    const normalized =
      "weekKey" in query
        ? query
        : legacyWeekInput(query.weekStart, query.weekEnd);
    if (!normalized) return c.json({ error: "invalid_focus_week" } as const, 400);
    const { weekKey, timezoneOffsetMinutes, weekEndTimezoneOffsetMinutes } =
      normalized;
    const { startISO, endISO } = weekBoundsFromOffset(
      weekKey,
      timezoneOffsetMinutes,
      weekEndTimezoneOffsetMinutes,
    );
    const now = new Date();
    if (now >= new Date(startISO) && now < new Date(endISO)) {
      await claimLegacyFocus(dog.id, weekKey);
      if (legacyRequest) {
        await rememberLegacyFocusWeek(dog.id, c.get("sessionId"), weekKey);
        await recordEvent("focus.legacy_compat_used", {
          userId: c.get("userId"),
          props: { operation: "read" },
        });
      }
    }
    const data = await loadFocusWeek(
      dog.id,
      weekKey,
      timezoneOffsetMinutes,
      weekEndTimezoneOffsetMinutes,
    );
    return c.json(data);
  })
  .post("/:id/focus", zValidator("json", focusAddCompatSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const input = c.req.valid("json");
    const skillId = input.skillId;
    const weekKey = "weekKey" in input
      ? input.weekKey
      : await legacyFocusWeekKey(dog.id, c.get("sessionId"));
    if (!weekKey) {
      return c.json({ error: "legacy_focus_context_required" } as const, 409);
    }
    if (!("weekKey" in input)) {
      await recordEvent("focus.legacy_compat_used", {
        userId: c.get("userId"),
        props: { operation: "write" },
      });
    }
    const skill = await findOwnedSkill(c.get("userId"), dog.id, skillId);
    if (!skill) return c.json({ error: "not_found" } as const, 404);
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`legacy-focus:${dog.id}`}))`,
      );
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${dog.id}:${weekKey}`}))`);
      const [existing] = await tx
        .select({ id: weeklyFocus.id, skillId: weeklyFocus.skillId })
        .from(weeklyFocus)
        .where(and(eq(weeklyFocus.dogId, dog.id), eq(weeklyFocus.weekStart, weekKey)))
        .limit(1);
      if (existing?.skillId === skillId) return { kind: "unchanged" as const };
      if (existing) {
        const [focus] = await tx
          .update(weeklyFocus)
          .set({ skillId, position: 0 })
          .where(eq(weeklyFocus.id, existing.id))
          .returning();
        if (!focus) throw new Error("failed to replace focus skill");
        return { kind: "replaced" as const, focus };
      }
      const [focus] = await tx
        .insert(weeklyFocus)
        .values({ dogId: dog.id, skillId, weekStart: weekKey, position: 0 })
        .returning();
      if (!focus) throw new Error("failed to add focus skill");
      return { kind: "created" as const, focus };
    });
    if (result.kind === "unchanged") return c.json({ ok: true, unchanged: true } as const);
    await recordEvent("focus.week_set", {
      userId: c.get("userId"),
      props: { replaced: result.kind === "replaced" },
    });
    return c.json({ focus: result.focus }, result.kind === "created" ? 201 : 200);
  })
  .delete(
    "/:id/focus/:skillId",
    zValidator("query", focusRemoveCompatSchema),
    async (c) => {
      const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
      if (!dog) return c.json({ error: "not_found" } as const, 404);
      const input = c.req.valid("query");
      const weekKey = "weekKey" in input
        ? input.weekKey
        : await legacyFocusWeekKey(dog.id, c.get("sessionId"));
      if (!weekKey) {
        return c.json({ error: "legacy_focus_context_required" } as const, 409);
      }
      if (!("weekKey" in input)) {
        await recordEvent("focus.legacy_compat_used", {
          userId: c.get("userId"),
          props: { operation: "delete" },
        });
      }
      const [deleted] = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`legacy-focus:${dog.id}`}))`,
        );
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${dog.id}:${weekKey}`}))`);
        await tx.execute(
          sql`select set_config('app.allow_weekly_focus_delete', 'on', true)`,
        );
        return tx
          .delete(weeklyFocus)
          .where(
            and(
              eq(weeklyFocus.dogId, dog.id),
              eq(weeklyFocus.skillId, c.req.param("skillId")),
              eq(weeklyFocus.weekStart, weekKey),
            ),
          )
          .returning({ id: weeklyFocus.id });
      });
      if (!deleted) return c.json({ error: "not_found" } as const, 404);
      return c.json({ ok: true } as const);
    },
  )
```

Import `claimLegacyFocus`, `rememberLegacyFocusWeek`,
`legacyFocusWeekKey`, and `weekBoundsFromOffset` with `loadFocusWeek`.
This claims legacy focus only when the requested week actually contains the
current instant in the owner's supplied offsets; historical navigation cannot
steal the undated row.

Apply the same compatibility normalization to DELETE: validate with
`focusRemoveCompatSchema` and use the supplied `weekKey` when present,
otherwise `await legacyFocusWeekKey(dog.id, c.get("sessionId"))` and return 409
when it is absent. Add tests that the legacy
`weekStart`/`weekEnd` GET, body-without-`weekKey` POST, and query-without-
`weekKey` DELETE all succeed during the rollout window, that a mutation without
a preceding legacy GET returns `409 legacy_focus_context_required`, and that
prior/future historical rows cannot redirect a legacy mutation. Document removal of
these branches as a post-launch contract-cleanup item, not part of Gate 1.

Include this regression for historical legacy navigation:

```ts
  it("does not let a historical legacy GET establish mutation context", async () => {
    const { headers, dogId, skillId } = await setupDogWithSkill();
    const get = await app.request(
      `/api/dogs/${dogId}/focus?weekStart=2020-01-06T00:00:00.000Z&weekEnd=2020-01-13T00:00:00.000Z`,
      { headers },
    );
    expect(get.status).toBe(200);

    const mutate = await app.request(`/api/dogs/${dogId}/focus`, {
      method: "POST",
      headers,
      body: JSON.stringify({ skillId }),
    });
    expect(mutate.status).toBe(409);
    expect(await mutate.json()).toEqual({ error: "legacy_focus_context_required" });
  });
```

Only a legacy GET whose computed owner-local bounds contain the current instant
may refresh `focus_compatibility_weeks`; historical or future tabs cannot
redirect a dog-global legacy mutation.

Add `focusRemoveQuerySchema` to the existing `@turingcare/shared` import block at the top of `apps/api/src/routes/dogs.ts`.
Reuse the file's existing Drizzle `sql` import, or add it if absent.

- [ ] **Step 5: Update every pre-existing focus request in the same test file**

Use `weekKey: "2026-06-01"` in every existing POST body,
`weekKey=2026-06-01&timezoneOffsetMinutes=0&weekEndTimezoneOffsetMinutes=0` in every existing GET query, and
`?weekKey=2026-06-01` in every existing DELETE request. Do not only append the
new tests; the old requests must satisfy the new required contract.
Also rewrite the existing "POST the same skill twice returns 409" case as
"POST the same skill twice is idempotent": the second response is `200` with
`{ ok: true, unchanged: true }`.

- [ ] **Step 6: Run it, expect PASS**

Run: `pnpm --filter @turingcare/api exec vitest run src/routes/focus.test.ts`
Expected: PASS — the new week isolation, one-shot claim, claim/write race,
cascade, direct-delete guard, compatibility, and historical-context tests plus
the pre-existing cases after every focus request uses a valid contract.

- [ ] **Step 7: Update the telemetry route caller** — in
  `apps/api/src/routes/telemetry.test.ts`, change the focus request body:

```ts
    await app.request(`/api/dogs/${dogId}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ skillId: skill.id, weekKey: "2026-08-10" }),
    });

    const monday = new Date();
    monday.setUTCHours(0, 0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
    await app.request(
      `/api/dogs/${dogId}/focus?weekStart=${monday.toISOString()}&weekEnd=${nextMonday.toISOString()}`,
      { headers: u.authHeaders },
    );
```

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/routes/telemetry.test.ts
```

Also assert
`expect(await countEvents(u.userId, "focus.legacy_compat_used")).toBe(1)`.
Expected: PASS, including the `focus.week_set` and legacy compatibility
telemetry assertions.

- [ ] **Step 8: Typecheck API and continue directly to Task 9**

```bash
pnpm --filter @turingcare/api exec tsc --noEmit
```

Do not commit yet; the web consumer still uses the old contract until Task 9.

---

## Task 9: Web sends the week key

**Files:**
- Create: `apps/web/src/lib/suggestion-key.ts`
- Modify: `apps/web/src/lib/weekly-focus.ts`
- Create: `apps/web/src/lib/weekly-focus.test.tsx`
- Modify: `apps/web/src/components/week/focus-picker.tsx`
- Create: `apps/web/src/components/week/focus-picker.test.tsx`
- Modify: `apps/web/src/routes/dog-week.tsx`
- Modify: `apps/web/src/routes/dog-week.test.tsx`
- Modify: `apps/web/src/lib/week.test.ts`
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Write the failing test** — replace the existing `./week` import
  in `apps/web/src/lib/week.test.ts` with the import below, then append the test:

```ts
import {
  addDays,
  dayKey,
  mondayOf,
  sameWeek,
  shouldCelebrateWeek,
  weekBounds,
  weekDays,
  weekKeyOf,
} from "./week";

describe("weekKeyOf", () => {
  it("returns the local Monday as YYYY-MM-DD", () => {
    expect(weekKeyOf(new Date(2026, 7, 13, 23, 30))).toBe("2026-08-10");
    expect(weekKeyOf(new Date(2026, 7, 10, 0, 0))).toBe("2026-08-10");
    expect(weekKeyOf(new Date(2026, 7, 9, 23, 59))).toBe("2026-08-03");
  });
});
```

Create `apps/web/src/lib/weekly-focus.test.tsx` and cover both mutations:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { focusKey, useAddFocus, useRemoveFocus } from "./weekly-focus";
import { suggestionKey } from "./suggestion-key";

const { post, remove } = vi.hoisted(() => ({
  post: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
  remove: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
}));
vi.mock("./api", () => ({
  api: {
    api: {
      dogs: {
        ":id": {
          focus: {
            $post: post,
            ":skillId": { $delete: remove },
          },
        },
      },
    },
  },
}));

function setup<T>(hook: () => T) {
  const qc = new QueryClient();
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { ...renderHook(hook, { wrapper }), invalidate };
}

describe("focus mutations", () => {
  it.each([
    ["add", () => useAddFocus("d1", "2026-08-10")],
    ["remove", () => useRemoveFocus("d1", "2026-08-10")],
  ])("invalidates focus and suggestion after %s", async (_name, hook) => {
    const { result, invalidate } = setup(hook);
    await act(() => result.current.mutateAsync("s1"));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: focusKey("d1", "2026-08-10"),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: suggestionKey("d1", "2026-08-10"),
    });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/web exec vitest run src/lib/week.test.ts`
Expected: FAIL — `weekKeyOf is not a function`.

Create `apps/web/src/lib/suggestion-key.ts` before running the focus-hook test:

```ts
export function suggestionKey(dogId: string, weekKey: string) {
  return ["suggestion", dogId, weekKey] as const;
}
```

- [ ] **Step 3: Add `weekKeyOf` to `apps/web/src/lib/week.ts`**

```ts
/** Canonical week key sent to the API: the local Monday as `YYYY-MM-DD`. */
export function weekKeyOf(date: Date): string {
  return dayKey(mondayOf(date));
}
```

- [ ] **Step 4: Run it, expect PASS**

Run: `pnpm --filter @turingcare/web exec vitest run src/lib/week.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread the key through the focus hooks** — in `apps/web/src/lib/weekly-focus.ts`, make the week key part of the cache key and of every request:

```ts
import { suggestionKey } from "./suggestion-key";

const focusApi = api.api.dogs[":id"].focus;

export function focusKey(dogId: string, weekKey: string) {
  return ["focus", dogId, weekKey] as const;
}

export function useFocusWeek(
  dogId: string,
  weekKey: string,
  timezoneOffsetMinutes: number,
  weekEndTimezoneOffsetMinutes: number,
) {
  return useQuery({
    queryKey: focusKey(dogId, weekKey),
    enabled: !!dogId,
    queryFn: async (): Promise<FocusSkill[]> => {
      const res = await focusApi.$get({
        param: { id: dogId },
        query: {
          weekKey,
          timezoneOffsetMinutes: String(timezoneOffsetMinutes),
          weekEndTimezoneOffsetMinutes: String(weekEndTimezoneOffsetMinutes),
        },
      });
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).focusSkills;
    },
  });
}

export function useAddFocus(dogId: string, weekKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: string) => {
      const res = await focusApi.$post({ param: { id: dogId }, json: { skillId, weekKey } });
      if (!res.ok) throw new Error("add_failed");
      return res.json();
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: focusKey(dogId, weekKey) }),
        qc.invalidateQueries({ queryKey: suggestionKey(dogId, weekKey) }),
      ]);
    },
  });
}

export function useRemoveFocus(dogId: string, weekKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: string) => {
      const res = await focusApi[":skillId"].$delete({
        param: { id: dogId, skillId },
        query: { weekKey },
      });
      if (!res.ok) throw new Error("remove_failed");
      return res.json();
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: focusKey(dogId, weekKey) }),
        qc.invalidateQueries({ queryKey: suggestionKey(dogId, weekKey) }),
      ]);
    },
  });
}
```

- [ ] **Step 6: Update the two call sites**

In `apps/web/src/components/week/focus-picker.tsx`, add `weekKey: string` to the `Props` type, destructure it in the component signature, and pass it to both hooks:

```ts
type Props = {
  dogId: string;
  weekKey: string;
  focusSkills: FocusSkill[];
  onClose: () => void;
};

export function FocusPicker({ dogId, weekKey, focusSkills, onClose }: Props) {
  const { t } = useI18n();
  const { data: goals } = useProgress(dogId);
  const add = useAddFocus(dogId, weekKey);
  const remove = useRemoveFocus(dogId, weekKey);
```

Replace `focus-picker.tsx` with the explicit single-select implementation below:

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useProgress } from "@/lib/progress";
import type { FocusSkill } from "@/lib/weekly-focus";
import { useAddFocus, useRemoveFocus } from "@/lib/weekly-focus";
import { toast } from "sonner";

type Props = {
  dogId: string;
  weekKey: string;
  focusSkills: FocusSkill[];
  onClose: () => void;
};

export function FocusPicker({ dogId, weekKey, focusSkills, onClose }: Props) {
  const { t } = useI18n();
  const { data: goals } = useProgress(dogId);
  const add = useAddFocus(dogId, weekKey);
  const remove = useRemoveFocus(dogId, weekKey);
  const selectedId = focusSkills[0]?.skillId ?? null;
  const pending = add.isPending || remove.isPending;
  const goalList = goals ?? [];
  const hasSkills = goalList.some((goal) => goal.skills.length > 0);

  return (
    <section className="space-y-3 rounded border border-silver bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate">{t("week.pickerTitle")}</h2>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("week.pickerDone")}
        </Button>
      </div>
      {!hasSkills && <p className="text-sm text-slate-soft">{t("week.noSkills")}</p>}
      <fieldset role="radiogroup" aria-label={t("week.selectFocusSkill")}>
        <legend className="sr-only">{t("week.selectFocusSkill")}</legend>
        {goalList.map((goal) =>
          goal.skills.length === 0 ? null : (
            <div key={goal.id} className="space-y-1">
              <div className="text-xs font-medium text-slate-soft">{goal.goal}</div>
              {goal.skills.map((skill) => (
                <label key={skill.id} className="flex items-center gap-2 py-1 text-sm text-slate">
                  <input
                    type="radio"
                    name="weekly-focus-skill"
                    checked={selectedId === skill.id}
                    disabled={pending}
                    onChange={() => {
                      if (selectedId === skill.id) return;
                      add.mutate(skill.id, {
                        onSuccess: () => toast.success(t("week.focusReplaced")),
                      });
                    }}
                  />
                  {skill.name}
                </label>
              ))}
            </div>
          ),
        )}
      </fieldset>
      {selectedId && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => remove.mutate(selectedId)}
        >
          {t("week.clearFocus")}
        </Button>
      )}
    </section>
  );
}
```

Create `focus-picker.test.tsx` with mocked `useProgress`, `useAddFocus`, and
`useRemoveFocus`. Use this fixture before the four tests:

```tsx
import { LocaleProvider } from "@/i18n";
import * as progressLib from "@/lib/progress";
import * as focusLib from "@/lib/weekly-focus";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FocusPicker } from "./focus-picker";

vi.mock("@/lib/progress");
vi.mock("@/lib/weekly-focus");

function setupPicker({
  selectedId,
  addPending = false,
}: {
  selectedId: string | null;
  addPending?: boolean;
}) {
  const add = { mutate: vi.fn(), isPending: addPending };
  const remove = { mutate: vi.fn(), isPending: false };
  vi.mocked(progressLib.useProgress).mockReturnValue({
    data: [
      {
        id: "g1",
        goal: "Basic manners",
        skills: [
          { id: "s1", name: "Sit", confidence: 1 },
          { id: "s2", name: "Down", confidence: 1 },
        ],
      },
    ],
  } as unknown as ReturnType<typeof progressLib.useProgress>);
  vi.mocked(focusLib.useAddFocus).mockReturnValue(
    add as unknown as ReturnType<typeof focusLib.useAddFocus>,
  );
  vi.mocked(focusLib.useRemoveFocus).mockReturnValue(
    remove as unknown as ReturnType<typeof focusLib.useRemoveFocus>,
  );
  render(
    <LocaleProvider>
      <FocusPicker
        dogId="d1"
        weekKey="2026-08-10"
        focusSkills={
          selectedId
            ? [{
                skillId: selectedId,
                name: selectedId === "s1" ? "Sit" : "Down",
                goalId: "g1",
                goalName: "Basic manners",
                position: 0,
                sessions: [],
              }]
            : []
        }
        onClose={vi.fn()}
      />
    </LocaleProvider>,
  );
  return { add, remove };
}

beforeEach(() => vi.clearAllMocks());
```

Then cover all four behaviors with role-based queries:

```tsx
it("renders one accessible radio group and replaces the selected skill", () => {
  const { add } = setupPicker({ selectedId: "s1" });
  expect(screen.getByRole("radiogroup", { name: "Focus skill" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Down" }));
  expect(add.mutate).toHaveBeenCalledWith("s2", expect.any(Object));
});

it("clears the selected focus", () => {
  const { remove } = setupPicker({ selectedId: "s1" });
  fireEvent.click(screen.getByRole("button", { name: "Clear focus" }));
  expect(remove.mutate).toHaveBeenCalledWith("s1");
});

it("disables every choice while replacement is pending", () => {
  setupPicker({ selectedId: "s1", addPending: true });
  for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
});

it("does not resubmit the already selected skill", () => {
  const { add } = setupPicker({ selectedId: "s1" });
  fireEvent.click(screen.getByRole("radio", { name: "Sit" }));
  expect(add.mutate).not.toHaveBeenCalled();
});
```

The local `setupPicker` fixture must render two skills (`s1` Sit and `s2`
Down), return the mocked mutations, and wrap the component in
`LocaleProvider`. Do not use text-only queries for the selection contract.

Update the existing `week` copy in both locales:

```ts
// en.ts
pickFocus: "Pick one skill to focus on this week",
summary: "{sessions} sessions for this week's focus",
pickerTitle: "Choose one focus skill",
clearFocus: "Clear focus",
focusReplaced: "Focus updated.",
selectFocusSkill: "Focus skill",

// es.ts
pickFocus: "Elige una habilidad para enfocarte esta semana",
summary: "{sessions} sesiones para el enfoque de esta semana",
pickerTitle: "Elige una habilidad de enfoque",
clearFocus: "Quitar enfoque",
focusReplaced: "Enfoque actualizado.",
selectFocusSkill: "Habilidad en foco",
```

Update the week summary call to match the narrowed message:

```tsx
{t("week.summary", { sessions: sessionCount })}
```

Use `t("week.selectFocusSkill")` as the radio-group accessible label,
`t("week.clearFocus")` for the clear action, and
`toast.success(t("week.focusReplaced"))` after a successful replacement.

In `apps/web/src/routes/dog-week.test.tsx`, update the existing empty-focus
assertion from `/Pick skills to focus on this week/i` to
`/Pick one skill to focus on this week/i`.

In `apps/web/src/routes/dog-week.tsx`, the local `const weekKey = dayKey(monday);` already exists but is declared after the focus query. Move that declaration up so it sits immediately after `const days = useMemo(...)`, then use it in the query and the picker:

```ts
  const weekKey = dayKey(monday);
  const timezoneOffsetMinutes = monday.getTimezoneOffset();
  const weekEndTimezoneOffsetMinutes = addDays(monday, 7).getTimezoneOffset();
  const { data: focusSkills } = useFocusWeek(
    id,
    weekKey,
    timezoneOffsetMinutes,
    weekEndTimezoneOffsetMinutes,
  );
```

```ts
  const refreshFocus = () => qc.invalidateQueries({ queryKey: focusKey(id, weekKey) });
```

```tsx
      {pickerOpen && (
        <FocusPicker
          dogId={id}
          weekKey={weekKey}
          focusSkills={skills}
          onClose={() => setPickerOpen(false)}
        />
      )}
```

Delete the now-duplicated `const weekKey = dayKey(monday);` further down the component.
Also delete the old `const { weekStart, weekEnd } = useMemo(() =>
weekBounds(monday), [monday]);` and remove `weekBounds` from the import because
the focus hook now derives bounds from the week key and occurrence-specific
offsets. Remove the obsolete `week.addToFocus` and `week.inFocus` keys from both
locale files after the radio-group rewrite.

- [ ] **Step 7: Run the web suite, expect PASS**

Run: `pnpm --filter @turingcare/web test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
pnpm exec biome check --write packages/shared/src/focus.ts packages/shared/src/focus.test.ts packages/shared/src/suggestion.ts packages/shared/src/suggestion.test.ts packages/shared/src/index.ts apps/api/src/lib/focus.ts apps/api/src/routes/dogs.ts apps/api/src/routes/focus.test.ts apps/api/src/routes/telemetry.test.ts apps/web/src/lib/week.ts apps/web/src/lib/week.test.ts apps/web/src/lib/suggestion-key.ts apps/web/src/lib/weekly-focus.ts apps/web/src/lib/weekly-focus.test.tsx apps/web/src/components/week/focus-picker.tsx apps/web/src/components/week/focus-picker.test.tsx apps/web/src/routes/dog-week.tsx apps/web/src/routes/dog-week.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
pnpm --filter @turingcare/shared exec tsc --noEmit
pnpm --filter @turingcare/api exec tsc --noEmit
pnpm --filter @turingcare/web exec tsc --noEmit
git add packages/shared/src/focus.ts packages/shared/src/focus.test.ts packages/shared/src/suggestion.ts packages/shared/src/suggestion.test.ts packages/shared/src/index.ts apps/api/src/lib/focus.ts apps/api/src/routes/dogs.ts apps/api/src/routes/focus.test.ts apps/api/src/routes/telemetry.test.ts apps/web/src/lib/week.ts apps/web/src/lib/week.test.ts apps/web/src/lib/suggestion-key.ts apps/web/src/lib/weekly-focus.ts apps/web/src/lib/weekly-focus.test.tsx apps/web/src/components/week/focus-picker.tsx apps/web/src/components/week/focus-picker.test.tsx apps/web/src/routes/dog-week.tsx apps/web/src/routes/dog-week.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat: cut focus reads and writes over to canonical week keys"
```

---

## Task 10: Migration — structured practice evidence columns and safety signals

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0014_practice_evidence.sql` (rename the generated file)
- Modify: `apps/api/drizzle/meta/_journal.json` + snapshot

- [ ] **Step 1: Add the enums** — in `apps/api/src/db/schema.ts`, directly above the `practiceSessions` table, add:

```ts
export const practiceOutcomeEnum = pgEnum("practice_outcome", [
  "went_well",
  "mixed",
  "too_hard",
]);
export const practiceCueSupportEnum = pgEnum("practice_cue_support", [
  "food_lure",
  "hand_signal",
  "verbal_cue",
  "no_extra_help",
]);
export const practiceEnvironmentEnum = pgEnum("practice_environment", [
  "home_quiet",
  "home_busy",
  "yard",
  "quiet_outdoor",
  "busy_outdoor",
]);
export const practiceDistanceEnum = pgEnum("practice_distance", [
  "at_side",
  "few_steps",
  "across_room",
  "across_yard",
  "far_away",
]);
export const practiceDurationBandEnum = pgEnum("practice_duration_band", [
  "under_5_seconds",
  "about_15_seconds",
  "about_30_seconds",
  "one_to_two_minutes",
  "five_to_fifteen_minutes",
  "about_30_minutes",
  "one_to_two_hours",
  "half_day_or_more",
]);
export const practiceVariantEnum = pgEnum("practice_variant", ["primary", "fallback"]);
export const practiceDistractionEnum = pgEnum("practice_distraction", [
  "none",
  "mild",
  "moderate",
  "strong",
]);
export const practiceDimensionEnum = pgEnum("practice_dimension", [
  "cue_support",
  "environment",
  "distance",
  "duration",
  "distraction",
]);
export const safetySignalTypeEnum = pgEnum("safety_signal_type", [
  "aggression_or_bite_risk",
  "injury_or_pain",
  "severe_fear_or_panic",
  // Internal structured rule derived from severity, never shown as an owner option.
  "severe_behavior_concern",
]);
export const safetySignalSourceEnum = pgEnum("safety_signal_source", [
  "practice_session",
  "behavior_concern",
]);
```

- [ ] **Step 2: Extend `practiceSessions` and add `dogSafetySignals`** — replace the `practiceSessions` definition and add the new table immediately after it:

```ts
export const practiceSessions = pgTable(
  "practice_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => trainingSkills.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes"),
    notes: text("notes"),
    // Structured evidence. All nullable: capture is always optional and must
    // never block a practice save.
    outcome: practiceOutcomeEnum("outcome"),
    cueSupport: practiceCueSupportEnum("cue_support"),
    environment: practiceEnvironmentEnum("environment"),
    distance: practiceDistanceEnum("distance"),
    durationBand: practiceDurationBandEnum("duration_band"),
    distraction: practiceDistractionEnum("distraction"),
    // The curriculum level the dog was practising at when this was logged, so
    // advancement evidence is level-anchored and resets after a level change.
    curriculumLevel: integer("curriculum_level"),
    curriculumVersion: text("curriculum_version"),
    practiceVariant: practiceVariantEnum("practice_variant"),
    // Exact audited suggestion the owner said they practised. The API validates
    // ownership/currentness before storing this UUID; Task 10 cannot add an FK
    // because the suggestion table is created by the following migration.
    suggestionId: uuid("suggestion_id"),
    // Owner-local calendar date derived once from occurredAt + the offset sent
    // for that specific session. This remains correct across DST boundaries.
    practiceDay: date("practice_day"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("practice_sessions_skill_occurred_idx").on(t.skillId, t.occurredAt),
    check(
      "practice_curriculum_level_range",
      sql`${t.curriculumLevel} IS NULL OR ${t.curriculumLevel} BETWEEN 1 AND 5`,
    ),
  ],
);

/**
 * Explicit, owner-answered safety reports. Written only from structured inputs
 * (never from free text) and deliberately not deletable through the API: the
 * suppression they cause must not be dismissible by the owner. Injury/pain is
 * time-bounded; aggression/bite risk, severe fear/panic, and the internal
 * severe-concern signal persist until a future reviewed
 * professional-resolution workflow exists.
 */
export const dogSafetySignals = pgTable(
  "dog_safety_signals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    dogId: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    type: safetySignalTypeEnum("type").notNull(),
    source: safetySignalSourceEnum("source").notNull(),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("dog_safety_signals_dog_reported_idx").on(t.dogId, t.reportedAt)],
);
```

- [ ] **Step 3: Generate, rename, and add RLS**

```bash
pnpm --filter @turingcare/api db:generate
mv apps/api/drizzle/0014_*.sql apps/api/drizzle/0014_practice_evidence.sql
```

Set the `"idx": 14` entry's `tag` in `apps/api/drizzle/meta/_journal.json` to `"0014_practice_evidence"`. Then append to the end of `apps/api/drizzle/0014_practice_evidence.sql` (keep everything drizzle generated above it):

```sql
--> statement-breakpoint
-- Existing severe concerns already represented a safety condition before this
-- table existed. Preserve that condition even if the concern is later deleted.
INSERT INTO "dog_safety_signals" ("dog_id", "type", "source", "reported_at")
SELECT "dog_id", 'severe_behavior_concern', 'behavior_concern', "created_at"
FROM "behavior_concerns"
WHERE "severity" = 'severe';--> statement-breakpoint
CREATE FUNCTION "persist_severe_behavior_concern_signal"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."severity" = 'severe' THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('dog-safety:' || NEW."dog_id"::text)
    );
    INSERT INTO "dog_safety_signals" ("dog_id", "type", "source", "reported_at")
    SELECT NEW."dog_id", 'severe_behavior_concern', 'behavior_concern', NEW."created_at"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "dog_safety_signals"
      WHERE "dog_id" = NEW."dog_id"
        AND "type" = 'severe_behavior_concern'
        AND "source" = 'behavior_concern'
        AND "reported_at" = NEW."created_at"
    );
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "behavior_concern_severe_signal"
AFTER INSERT OR UPDATE OF "severity" ON "behavior_concerns"
FOR EACH ROW EXECUTE FUNCTION "persist_severe_behavior_concern_signal"();--> statement-breakpoint
-- Same deny-all posture as 0011_enable_rls.sql: RLS on, no policies, and strip
-- any PostgREST grants where those roles exist. `skill_milestones` is included
-- because 0012 created it without RLS.
ALTER TABLE "dog_safety_signals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "skill_milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  tbl text;
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      FOREACH tbl IN ARRAY ARRAY['dog_safety_signals', 'skill_milestones'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', tbl, rol);
      END LOOP;
    END IF;
  END LOOP;
END
$$;
```

- [ ] **Step 4: Apply and verify**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api db:migrate
psql "$DATABASE_URL" -c "\d practice_sessions"
psql "$DATABASE_URL" -c "SELECT count(*) AS unmigrated_severe_concerns FROM behavior_concerns c WHERE c.severity = 'severe' AND NOT EXISTS (SELECT 1 FROM dog_safety_signals s WHERE s.dog_id = c.dog_id AND s.type = 'severe_behavior_concern' AND s.reported_at = c.created_at);"
psql "$DATABASE_URL" -c "select relname, relrowsecurity from pg_class where relname in ('dog_safety_signals','skill_milestones');"
```

Expected: `practice_sessions` shows the structured evidence columns plus
`curriculum_level`, `curriculum_version`, `practice_variant`, `suggestion_id`, and
`practice_day`; `unmigrated_severe_concerns` is zero; both tables report
`relrowsecurity = t`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle
git commit -m "feat(api): structured practice evidence columns and safety signals"
```

---

## Task 11: Capture practice evidence and safety signals

**Files:**
- Modify: `apps/api/src/telemetry/events.ts`
- Modify: `apps/api/src/routes/dogs.ts`
- Create: `apps/api/src/lib/practice-anchor.ts`
- Create: `apps/api/src/lib/safety-lock.ts`
- Create: `apps/api/src/lib/safety-lock.test.ts`
- Create: `apps/api/src/routes/practice-evidence.test.ts`
- Create: `apps/api/src/routes/journal-safety-lock.test.ts`
- Modify: `apps/web/src/components/progress/session-form.tsx`
- Modify: `apps/web/src/components/progress/session-form.test.tsx`

- [ ] **Step 1: Write the failing test** — create `apps/api/src/routes/practice-evidence.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { dogSafetySignals, practiceSessions, trainingSuggestions } from "../db/schema";
import * as practiceAnchor from "../lib/practice-anchor";
import { type TestUser, createTestUser } from "../test-helpers";

const users: TestUser[] = [];
const validDog = {
  name: "Nala",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

async function setup() {
  const testUser = await createTestUser();
  users.push(testUser);
  const headers = testUser.authHeaders;

  const dogRes = await app.request("/api/dogs", {
    method: "POST",
    headers,
    body: JSON.stringify(validDog),
  });
  const { dog } = (await dogRes.json()) as { dog: { id: string } };

  const goalRes = await app.request(`/api/dogs/${dog.id}/goals/from-template`, {
    method: "POST",
    headers,
    body: JSON.stringify({ templateKey: "basic-manners" }),
  });
  const { skills } = (await goalRes.json()) as {
    skills: Array<{ id: string; catalogSkillKey: string | null }>;
  };
  const skill = skills.find((row) => row.catalogSkillKey === "basic-manners.sit");
  if (!skill) throw new Error("expected basic-manners.sit");

  async function addSuggestion(level = 1) {
    const [row] = await db
      .insert(trainingSuggestions)
      .values({
        dogId: dog.id,
        skillId: skill.id,
        weekStart: "2026-08-10",
        curriculumVersion: "2026-08-11",
        suggestionType: "exercise",
        ruleId: "maintain_current_level",
        level,
        fallbackLevel: level,
        fallbackDimension: "cue_support",
        evidenceCategory: "curriculum_only",
        suppressed: false,
        dedupeKey: `${dog.id}:${skill.id}:${level}:${crypto.randomUUID()}`,
      })
      .returning({ id: trainingSuggestions.id });
    if (!row) throw new Error("expected suggestion audit fixture");
    return row.id;
  }

  return {
    headers,
    dogId: dog.id,
    skillId: skill.id,
    userId: testUser.userId,
    addSuggestion,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (let user = users.pop(); user; user = users.pop()) await user.cleanup();
});

describe("practice evidence capture", () => {
  it("saves a session with no evidence at all", async () => {
    const { headers, dogId, skillId } = await setup();
    const res = await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ occurredAt: new Date().toISOString() }),
    });
    expect(res.status).toBe(201);
    const { session } = (await res.json()) as { session: { outcome: string | null } };
    expect(session.outcome).toBeNull();
  });

  it("stores structured evidence and stamps the exercise actually practised", async () => {
    const { headers, dogId, skillId, addSuggestion } = await setup();
    const suggestionId = await addSuggestion(1);
    const occurredAt = new Date(Date.now() - 60_000);
    const expectedPracticeDay = new Date(occurredAt.getTime() - 420 * 60_000)
      .toISOString()
      .slice(0, 10);
    const res = await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        occurredAt: occurredAt.toISOString(),
        outcome: "went_well",
        distraction: "mild",
        environment: "yard",
        timezoneOffsetMinutes: 420,
        practicedTarget: { suggestionId, variant: "primary" },
      }),
    });
    expect(res.status).toBe(201);
    const { session } = (await res.json()) as { session: { id: string } };
    const [row] = await db
      .select()
      .from(practiceSessions)
      .where(eq(practiceSessions.id, session.id));
    expect(row?.outcome).toBe("went_well");
    expect(row?.distraction).toBe("mild");
    expect(row?.curriculumLevel).toBe(1);
    expect(row?.curriculumVersion).toBe("2026-08-11");
    expect(row?.practiceVariant).toBe("primary");
    expect(row?.suggestionId).toBe(suggestionId);
    expect(row?.practiceDay).toBe(expectedPracticeDay);
  });

  it("records an explicit safety signal alongside the session", async () => {
    const { headers, dogId, skillId } = await setup();
    const res = await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        occurredAt: "2026-01-01T12:00:00.000Z",
        outcome: "too_hard",
        safetySignal: "aggression_or_bite_risk",
      }),
    });
    expect(res.status).toBe(201);
    const signals = await db
      .select()
      .from(dogSafetySignals)
      .where(eq(dogSafetySignals.dogId, dogId));
    expect(signals).toHaveLength(1);
    expect(signals[0]?.type).toBe("aggression_or_bite_risk");
    expect(signals[0]?.source).toBe("practice_session");
    expect(signals[0]?.reportedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("records a non-dismissible safety signal from a behavior concern", async () => {
    const { headers, dogId } = await setup();
    const created = await app.request(`/api/dogs/${dogId}/concerns`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        concern: "Growling near food",
        severity: "moderate",
        safetySignal: "aggression_or_bite_risk",
      }),
    });
    expect(created.status).toBe(201);
    const { concern } = (await created.json()) as { concern: { id: string } };

    await app.request(`/api/dogs/${dogId}/concerns/${concern.id}`, {
      method: "DELETE",
      headers,
    });
    const signals = await db
      .select()
      .from(dogSafetySignals)
      .where(eq(dogSafetySignals.dogId, dogId));
    expect(signals).toHaveLength(1);
    expect(signals[0]?.type).toBe("aggression_or_bite_risk");
    expect(signals[0]?.source).toBe("behavior_concern");
  });

  it("persists severe concern suppression even when no specific signal was selected", async () => {
    const { headers, dogId } = await setup();
    const created = await app.request(`/api/dogs/${dogId}/concerns`, {
      method: "POST",
      headers,
      body: JSON.stringify({ concern: "Severe behavior change", severity: "severe" }),
    });
    const { concern } = (await created.json()) as { concern: { id: string } };
    await app.request(`/api/dogs/${dogId}/concerns/${concern.id}`, {
      method: "DELETE",
      headers,
    });
    const signals = await db
      .select()
      .from(dogSafetySignals)
      .where(eq(dogSafetySignals.dogId, dogId));
    expect(signals[0]?.type).toBe("severe_behavior_concern");
  });

  it("persists the permanent severe rule alongside a selected specific signal", async () => {
    const { headers, dogId } = await setup();
    const created = await app.request(`/api/dogs/${dogId}/concerns`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        concern: "Severe bite-risk change",
        severity: "severe",
        safetySignal: "aggression_or_bite_risk",
      }),
    });
    const { concern } = (await created.json()) as { concern: { id: string } };
    await app.request(`/api/dogs/${dogId}/concerns/${concern.id}`, {
      method: "DELETE",
      headers,
    });
    const signals = await db
      .select({ type: dogSafetySignals.type })
      .from(dogSafetySignals)
      .where(eq(dogSafetySignals.dogId, dogId));
    expect(signals.map((row) => row.type).sort()).toEqual([
      "aggression_or_bite_risk",
      "severe_behavior_concern",
    ]);
  });

  it("adds evidence to an existing session via the evidence endpoint", async () => {
    const { headers, dogId, skillId, addSuggestion } = await setup();
    const suggestionId = await addSuggestion(1);
    const created = await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        occurredAt: new Date().toISOString(),
        timezoneOffsetMinutes: 0,
        practicedTarget: { suggestionId, variant: "primary" },
      }),
    });
    const { session } = (await created.json()) as { session: { id: string } };

    const res = await app.request(
      `/api/dogs/${dogId}/skills/${skillId}/sessions/${session.id}/evidence`,
      { method: "PATCH", headers, body: JSON.stringify({ outcome: "mixed" }) },
    );
    expect(res.status).toBe(200);
    const [row] = await db
      .select()
      .from(practiceSessions)
      .where(eq(practiceSessions.id, session.id));
    expect(row?.outcome).toBe("mixed");
    expect(row?.curriculumLevel).toBe(1);
  });

  it("preserves omitted context fields during a partial evidence update", async () => {
    const { headers, dogId, skillId } = await setup();
    const created = await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        occurredAt: new Date().toISOString(),
        outcome: "mixed",
        environment: "yard",
        distraction: "mild",
      }),
    });
    const { session } = (await created.json()) as { session: { id: string } };

    const patched = await app.request(
      `/api/dogs/${dogId}/skills/${skillId}/sessions/${session.id}/evidence`,
      { method: "PATCH", headers, body: JSON.stringify({ outcome: "went_well" }) },
    );
    expect(patched.status).toBe(200);
    const [row] = await db
      .select()
      .from(practiceSessions)
      .where(eq(practiceSessions.id, session.id));
    expect(row?.outcome).toBe("went_well");
    expect(row?.environment).toBe("yard");
    expect(row?.distraction).toBe("mild");
  });

  it("never re-anchors an old session when evidence is edited after advancement", async () => {
    const { headers, dogId, skillId, addSuggestion } = await setup();
    const suggestionId = await addSuggestion(1);
    const created = await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        occurredAt: new Date().toISOString(),
        timezoneOffsetMinutes: 0,
        practicedTarget: { suggestionId, variant: "primary" },
      }),
    });
    const { session } = (await created.json()) as { session: { id: string } };
    await app.request(`/api/dogs/${dogId}/skills/${skillId}/level`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ level: 2 }),
    });
    await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions/${session.id}/evidence`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ outcome: "went_well" }),
    });
    const [row] = await db
      .select()
      .from(practiceSessions)
      .where(eq(practiceSessions.id, session.id));
    expect(row?.curriculumLevel).toBe(1);
  });

  it("sets a target once during quick capture and rejects later re-anchoring", async () => {
    const { headers, dogId, skillId, addSuggestion } = await setup();
    const suggestionId = await addSuggestion(1);
    const created = await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        occurredAt: new Date().toISOString(),
        timezoneOffsetMinutes: 0,
      }),
    });
    const { session } = (await created.json()) as { session: { id: string } };
    const first = await app.request(
      `/api/dogs/${dogId}/skills/${skillId}/sessions/${session.id}/evidence`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          outcome: "went_well",
          practicedTarget: { suggestionId, variant: "fallback" },
        }),
      },
    );
    expect(first.status).toBe(200);
    const second = await app.request(
      `/api/dogs/${dogId}/skills/${skillId}/sessions/${session.id}/evidence`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ practicedTarget: { suggestionId, variant: "primary" } }),
      },
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(
      expect.objectContaining({ anchorRejected: "target_locked" }),
    );
  });

  it("saves evidence but leaves the target unlinked without an owner-local day", async () => {
    const { headers, dogId, skillId, addSuggestion } = await setup();
    const suggestionId = await addSuggestion(1);
    const created = await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ occurredAt: new Date().toISOString() }),
    });
    const { session } = (await created.json()) as { session: { id: string } };
    const patched = await app.request(
      `/api/dogs/${dogId}/skills/${skillId}/sessions/${session.id}/evidence`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          outcome: "went_well",
          practicedTarget: { suggestionId, variant: "primary" },
        }),
      },
    );
    expect(patched.status).toBe(200);
    expect(await patched.json()).toEqual(
      expect.objectContaining({ anchorRejected: "practice_day_required" }),
    );
  });

  it("rejects practice timestamps beyond the allowed clock skew", async () => {
    const { headers, dogId, skillId } = await setup();
    const occurredAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const res = await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ occurredAt, timezoneOffsetMinutes: 0 }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "future_practice_session" });
  });

  function legacyWallClockHoursFromNow(hours: number): string {
    const value = new Date(Date.now() + hours * 60 * 60_000);
    const pad = (part: number) => String(part).padStart(2, "0");
    return [
      `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
      `${pad(value.getHours())}:${pad(value.getMinutes())}`,
    ].join("T");
  }

  it("accepts a legacy east-of-UTC wall clock during the rollout window", async () => {
    const { headers, dogId, skillId } = await setup();
    const occurredAt = legacyWallClockHoursFromNow(10);
    const res = await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ occurredAt }),
    });
    expect(res.status).toBe(201);
  });

  it("rejects a legacy wall clock farther than any real timezone offset", async () => {
    const { headers, dogId, skillId } = await setup();
    const occurredAt = legacyWallClockHoursFromNow(16);
    const res = await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ occurredAt }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "future_practice_session" });
  });

  it("accepts a stepped-back primary without making it advancement evidence", async () => {
    const { headers, dogId, skillId, addSuggestion } = await setup();
    await app.request(`/api/dogs/${dogId}/skills/${skillId}/level`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ level: 3 }),
    });
    const suggestionId = await addSuggestion(2);
    const res = await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        occurredAt: new Date().toISOString(),
        timezoneOffsetMinutes: 0,
        outcome: "went_well",
        practicedTarget: { suggestionId, variant: "primary" },
      }),
    });
    expect(res.status).toBe(201);
    const { session } = (await res.json()) as { session: { id: string } };
    const [row] = await db
      .select()
      .from(practiceSessions)
      .where(eq(practiceSessions.id, session.id));
    expect(row?.curriculumLevel).toBe(2);
    expect(row?.practiceVariant).toBe("primary");
  });

  it("saves the session but drops a target above the confirmed level", async () => {
    const { headers, dogId, skillId, addSuggestion } = await setup();
    const suggestionId = await addSuggestion(2);
    const res = await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        occurredAt: new Date().toISOString(),
        timezoneOffsetMinutes: 0,
        outcome: "went_well",
        practicedTarget: { suggestionId, variant: "primary" },
      }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(
      expect.objectContaining({ anchorRejected: "invalid_target" }),
    );
  });

  it("saves safety evidence but drops an anchor from another dog", async () => {
    const mine = await setup();
    const theirs = await setup();
    const foreignSuggestionId = await theirs.addSuggestion(1);
    const res = await app.request(
      `/api/dogs/${mine.dogId}/skills/${mine.skillId}/sessions`,
      {
        method: "POST",
        headers: mine.headers,
        body: JSON.stringify({
          occurredAt: new Date().toISOString(),
          timezoneOffsetMinutes: 0,
          outcome: "went_well",
          safetySignal: "injury_or_pain",
          practicedTarget: {
            suggestionId: foreignSuggestionId,
            variant: "primary",
          },
        }),
      },
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(
      expect.objectContaining({ anchorRejected: "invalid_anchor" }),
    );
    const signals = await db
      .select({ type: dogSafetySignals.type })
      .from(dogSafetySignals)
      .where(eq(dogSafetySignals.dogId, mine.dogId));
    expect(signals).toEqual([{ type: "injury_or_pain" }]);
  });

  it("saves outcome and safety unanchored when audit lookup is unavailable", async () => {
    const ctx = await setup();
    vi.spyOn(practiceAnchor, "resolvePracticeTargetAudit").mockResolvedValueOnce(
      "unavailable",
    );
    const res = await app.request(
      `/api/dogs/${ctx.dogId}/skills/${ctx.skillId}/sessions`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          occurredAt: new Date().toISOString(),
          timezoneOffsetMinutes: 0,
          outcome: "mixed",
          safetySignal: "injury_or_pain",
          practicedTarget: {
            suggestionId: crypto.randomUUID(),
            variant: "primary",
          },
        }),
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      session: { id: string; outcome: string; suggestionId: string | null };
      anchorRejected: string | null;
    };
    expect(body.anchorRejected).toBe("audit_unavailable");
    expect(body.session.outcome).toBe("mixed");
    expect(body.session.suggestionId).toBeNull();
    expect(
      await db
        .select({ type: dogSafetySignals.type })
        .from(dogSafetySignals)
        .where(eq(dogSafetySignals.dogId, ctx.dogId)),
    ).toEqual([{ type: "injury_or_pain" }]);
  });

  it("serializes concurrent first anchors so one exact target wins", async () => {
    const ctx = await setup();
    const primarySuggestionId = await ctx.addSuggestion(1);
    const fallbackSuggestionId = await ctx.addSuggestion(1);
    const created = await app.request(
      `/api/dogs/${ctx.dogId}/skills/${ctx.skillId}/sessions`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          occurredAt: new Date().toISOString(),
          timezoneOffsetMinutes: 0,
        }),
      },
    );
    const { session } = (await created.json()) as { session: { id: string } };
    const responses = await Promise.all([
      app.request(
        `/api/dogs/${ctx.dogId}/skills/${ctx.skillId}/sessions/${session.id}/evidence`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            practicedTarget: {
              suggestionId: primarySuggestionId,
              variant: "primary",
            },
          }),
        },
      ),
      app.request(
        `/api/dogs/${ctx.dogId}/skills/${ctx.skillId}/sessions/${session.id}/evidence`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            practicedTarget: {
              suggestionId: fallbackSuggestionId,
              variant: "fallback",
            },
          }),
        },
      ),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(
      bodies.map((body) => (body as { anchorRejected: string | null }).anchorRejected).sort(),
    ).toEqual([null, "target_locked"]);
  });

  it("returns 404 when another owner's session is targeted", async () => {
    const mine = await setup();
    const theirs = await setup();
    const created = await app.request(
      `/api/dogs/${theirs.dogId}/skills/${theirs.skillId}/sessions`,
      {
        method: "POST",
        headers: theirs.headers,
        body: JSON.stringify({ occurredAt: new Date().toISOString() }),
      },
    );
    const { session } = (await created.json()) as { session: { id: string } };

    const res = await app.request(
      `/api/dogs/${mine.dogId}/skills/${mine.skillId}/sessions/${session.id}/evidence`,
      { method: "PATCH", headers: mine.headers, body: JSON.stringify({ outcome: "mixed" }) },
    );
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run:
```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api exec vitest run src/routes/practice-evidence.test.ts
```
Expected: FAIL — evidence columns are never written (`row.outcome` is `null`), no safety signal row exists, and the `PATCH .../evidence` request 404s because the route does not exist.

- [ ] **Step 3: Extend the telemetry allowlist** — in `apps/api/src/telemetry/events.ts`, add these names to `KNOWN_EVENTS` after `"focus.legacy_compat_used"` (leave `CLIENT_EVENTS` unchanged; all seven are server-emitted):

```ts
  "training.practice_outcome_recorded",
  "training.suggestion_shown",
  "training.suggestion_action",
  "training.advancement_proposed",
  "training.advancement_decided",
  "safety.signal_reported",
  "safety.suppression_shown",
```

- [ ] **Step 4: Persist safety signals from behavior concerns** — in
  `apps/api/src/routes/dogs.ts`, replace the existing `POST /:id/concerns`
  handler:

Create `apps/api/src/lib/safety-lock.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "../db";

/** The Drizzle executor handed to a callback running inside a database transaction. */
export type TransactionType = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Serializes safety writes before any more granular training locks are acquired. */
export async function lockDogSafety(tx: Pick<typeof db, "execute">, dogId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dog-safety:${dogId}`}))`);
}

/**
 * Runs `callback` inside a transaction that holds the dog-scoped safety lock
 * for its entire duration, so every writer of a safety input (signals, journal
 * entries) is serialized against every safety decision for the same dog.
 */
export async function withDogSafetyLock<T>(
  dogId: string,
  callback: (tx: TransactionType) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await lockDogSafety(tx, dogId);
    return await callback(tx);
  });
}
```

Every safety writer and advancement decision acquires this dog-scoped lock
before any skill lock. Writers that mutate a safety *input* for a whole
transaction (journal entry create/update/delete, safety signals) use
`withDogSafetyLock` so the read, the decision and the write share one
linearization point.

Cover the helper with `apps/api/src/lib/safety-lock.test.ts` — 3 tests, each
proving the lock state from an independent `pool.connect()` probe that runs
`select pg_try_advisory_xact_lock(hashtext($1))` with `dog-safety:<dogId>` (a
`false` result proves another transaction holds it, so no sleeps are needed):

1. the lock is held for the whole callback and released on commit;
2. a different dog id is never blocked;
3. a throwing callback rolls the guarded write back and still releases the lock.

```ts
  .post("/:id/concerns", zValidator("json", behaviorConcernSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const { safetySignal, ...input } = c.req.valid("json");
    const reportedSignals = [
      ...(input.severity === "severe" ? (["severe_behavior_concern"] as const) : []),
      ...(safetySignal ? [safetySignal] : []),
    ];
    const concern = await db.transaction(async (tx) => {
      await lockDogSafety(tx, dog.id);
      const [row] = await tx
        .insert(behaviorConcerns)
        .values({ ...input, dogId: dog.id })
        .returning();
      if (!row) throw new Error("failed to create behavior concern");
      // The migration trigger persists severe_behavior_concern for both old
      // and new API versions. The application writes only the explicit signal.
      if (safetySignal) {
        await tx.insert(dogSafetySignals).values({
          dogId: dog.id,
          type: safetySignal,
          source: "behavior_concern",
          reportedAt: new Date(),
        });
      }
      return row;
    });
    for (const signal of reportedSignals) {
      await recordEvent("safety.signal_reported", {
        userId: c.get("userId"),
        props: { signal, source: "behavior_concern" },
      });
    }
    return c.json({ concern }, 201);
  })
```

Deleting the concern continues to delete only `behavior_concerns`; the separate
internal `severe_behavior_concern` safety row remains active indefinitely. Gate
1 deliberately has no owner-controlled resolution path; restoring exercises
requires a future reviewed professional-resolution workflow.

- [ ] **Step 5: Serialize journal writes through the dog safety lock** — journal
  entries are a safety input (`daily_checkin` trend and `moment` intensity feed
  `loadSafetyInputs`), so every journal mutation must linearize against safety
  decisions for the same dog. In `apps/api/src/routes/dogs.ts`, import
  `withDogSafetyLock` from `../lib/safety-lock` and rewrite the three journal
  mutation handlers without changing any status code or response body:

  - `POST /:id/journal` — keep `findOwnedDog` (404) and the `occurredAt`
    `Number.isNaN` check returning `invalidJournalField("occurredAt", "Invalid
    date")` with 400 *before* the lock. Then change only the executor of the
    existing insert: replace `db` with the locked `tx` by wrapping the current
    `.insert(journalEntries).values(…).returning()` chain unchanged in
    `const [entry] = await withDogSafetyLock(dog.id, (tx) => …);`. The value
    mapping and telemetry (`journal.entry_created`, emitted after the lock is
    released) are untouched, and the route still returns `{ entry }` with 201.
  - `PUT /:id/journal/:entryId` — wrap the whole read-modify-write in
    `const result = await withDogSafetyLock(dog.id, async (tx) => …);`. Inside
    the lock, re-read the exact row with
    `and(eq(journalEntries.id, entryId), eq(journalEntries.dogId, dog.id))`
    plus `.limit(1).for("update")`, so the row the changes are computed from is
    the row that is written. Compute `changes` from that fresh row (kind
    switching, `occurredAt` validity, `daily_checkin` trend requirement,
    moment-field clearing) exactly as today, but return a discriminated result —
    `{ kind: "not_found" }`, `{ kind: "invalid_occurred_at" }`,
    `{ kind: "missing_trend" }` or `{ kind: "updated", entry: updated }` —
    instead of building the response inside the callback, because a response
    must never be produced while the lock is held by an aborted branch. Map the
    result outside the lock to the unchanged behavior: 400
    `invalidJournalField("occurredAt", "Invalid date")`, 400
    `invalidJournalField("trend", "Trend is required for daily check-ins")`,
    404 `{ error: "not_found" }`, and 200 `{ entry: result.entry }`.
  - `DELETE /:id/journal/:entryId` — wrap the existing delete, with its current
    `and(eq(journalEntries.id, entryId), eq(journalEntries.dogId, dog.id))`
    predicate, in `await withDogSafetyLock(dog.id, (tx) => …);` and keep the
    unconditional 200 `{ ok: true }`.

  `GET /:id/journal` and the read-only brief/export queries stay on `db` and
  take no lock.

  Create `apps/api/src/routes/journal-safety-lock.test.ts` — 4 tests. It
  `vi.mock`s `../lib/safety-lock` with `importOriginal`, keeping the real
  `withDogSafetyLock` but recording, for each call, whether the lock was already
  held when the callback started (same independent `pool.connect()` +
  `pg_try_advisory_xact_lock` probe as the unit test). The tests assert:

  1. create, update and delete each run their write with the lock held for that
     dog (`guardedWrites` has one entry per mutation, all `lockHeldDuringWrite`);
  2. an invalid create date is rejected with 400 *before* the lock is taken (no
     recorded guarded write);
  3. update validation and ownership semantics are unchanged under the lock —
     the 400 paths leave the stored row untouched and a valid update persists;
  4. a mutation for a dog the caller does not own returns 404 and never takes
     the lock.

- [ ] **Step 6: Write the session routes** — in `apps/api/src/routes/dogs.ts`, replace the `POST /:id/skills/:skillId/sessions` handler and add the evidence route directly after it:

Create `apps/api/src/lib/practice-anchor.ts` first:

```ts
import { and, eq, gte } from "drizzle-orm";
import { CURRICULUM_VERSION } from "../data/training-curriculum";
import { db } from "../db";
import { trainingSuggestionActions, trainingSuggestions } from "../db/schema";

export type PracticeTargetAudit =
  | {
      level: number | null;
      fallbackLevel: number | null;
      curriculumVersion: string;
    }
  | null
  | "unavailable";

export async function resolvePracticeTargetAudit(input: {
  dogId: string;
  skillId: string;
  suggestionId: string;
  createdAfter: Date;
}): Promise<PracticeTargetAudit> {
  try {
    const [audit] = await db
      .select({
        level: trainingSuggestions.level,
        fallbackLevel: trainingSuggestions.fallbackLevel,
        curriculumVersion: trainingSuggestions.curriculumVersion,
      })
      .from(trainingSuggestions)
      .where(
        and(
          eq(trainingSuggestions.id, input.suggestionId),
          eq(trainingSuggestions.dogId, input.dogId),
          eq(trainingSuggestions.skillId, input.skillId),
          eq(trainingSuggestions.suggestionType, "exercise"),
          eq(trainingSuggestions.suppressed, false),
          eq(trainingSuggestions.curriculumVersion, CURRICULUM_VERSION),
          gte(trainingSuggestions.createdAt, input.createdAfter),
        ),
      )
      .limit(1);
    if (!audit) return null;
    const [skipped] = await db
      .select({ id: trainingSuggestionActions.id })
      .from(trainingSuggestionActions)
      .where(
        and(
          eq(trainingSuggestionActions.suggestionId, input.suggestionId),
          eq(trainingSuggestionActions.action, "skipped"),
        ),
      )
      .limit(1);
    return skipped ? null : audit;
  } catch (error) {
    console.error("[practice] anchor_lookup_failed", {
      dogId: input.dogId,
      skillId: input.skillId,
      error,
    });
    return "unavailable";
  }
}
```

This helper is intentionally called before the write transaction. Audit
infrastructure is fail-open: `"unavailable"` rejects only the anchor and cannot
poison the transaction that saves practice, outcome, context, or safety.

Also export these transaction helpers from `practice-anchor.ts`:

```ts
export async function lockSuggestionAnchor(
  tx: Pick<typeof db, "execute">,
  suggestionId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`suggestion-anchor:${suggestionId}`}))`,
  );
}

export async function isSuggestionSkipped(
  tx: Pick<typeof db, "select">,
  suggestionId: string,
): Promise<boolean> {
  const [skipped] = await tx
    .select({ id: trainingSuggestionActions.id })
    .from(trainingSuggestionActions)
    .where(
      and(
        eq(trainingSuggestionActions.suggestionId, suggestionId),
        eq(trainingSuggestionActions.action, "skipped"),
      ),
    )
    .limit(1);
  return skipped !== undefined;
}
```

Add `sql` to the Drizzle import. The action writer in Task 16 takes this same
suggestion-scoped advisory lock before inserting an action. This makes a
concurrent skip and anchor deterministic: whichever transaction obtains the
lock first commits first, and an anchor that runs after a committed skip is
rejected.

Add the helper above the `dogsApp` route chain, then replace/add the handlers:

```ts
function practiceDay(
  occurredAt: Date,
  timezoneOffsetMinutes: number | undefined,
): string | null {
  if (timezoneOffsetMinutes === undefined) return null;
  return new Date(occurredAt.getTime() - timezoneOffsetMinutes * 60_000)
    .toISOString()
    .slice(0, 10);
}

const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60_000;
const MAX_LEGACY_FUTURE_SKEW_MS = 15 * 60 * 60_000;
const PRACTICE_TARGET_MAX_AGE_MS = 24 * 60 * 60_000;

// `resolvePracticeTargetAudit` is called before this write transaction. Audit
// lookup failure rejects only the anchor, never the practice or safety save.
// Inside the dogsApp chain:
  .post("/:id/skills/:skillId/sessions", zValidator("json", practiceSessionApiSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const skill = await findOwnedSkill(c.get("userId"), dog.id, c.req.param("skillId"));
    if (!skill) return c.json({ error: "not_found" } as const, 404);
    const body = c.req.valid("json");
    const legacyWallClock = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(
      body.occurredAt,
    );
    const occurredAt = new Date(body.occurredAt);
    const allowedFutureSkew = legacyWallClock
      ? MAX_LEGACY_FUTURE_SKEW_MS
      : MAX_FUTURE_CLOCK_SKEW_MS;
    if (occurredAt.getTime() > Date.now() + allowedFutureSkew) {
      return c.json({ error: "future_practice_session" } as const, 400);
    }
    const targetAudit = body.practicedTarget
      ? await resolvePracticeTargetAudit({
          dogId: dog.id,
          skillId: skill.id,
          suggestionId: body.practicedTarget.suggestionId,
          createdAfter: new Date(Date.now() - PRACTICE_TARGET_MAX_AGE_MS),
        })
      : null;
    // The session and any safety signal are written together: a safety report
    // must never be silently dropped while the session succeeds.
    const sessionResult = await db.transaction(async (tx) => {
      if (body.safetySignal) await lockDogSafety(tx, dog.id);
      if (body.practicedTarget) {
        await lockSuggestionAnchor(tx, body.practicedTarget.suggestionId);
      }
      const [currentSkill] = await tx
        .select({ confidence: trainingSkills.confidence })
        .from(trainingSkills)
        .where(eq(trainingSkills.id, skill.id))
        .for("update")
        .limit(1);
      if (!currentSkill) return "not_found" as const;

      let resolvedTarget: {
        suggestionId: string;
        level: number;
        variant: "primary" | "fallback";
        curriculumVersion: string;
      } | null = null;
      let anchorRejected:
        | "practice_day_required"
        | "audit_unavailable"
        | "invalid_anchor"
        | "invalid_target"
        | null = null;
      if (body.practicedTarget) {
        if (body.timezoneOffsetMinutes === undefined) {
          anchorRejected = "practice_day_required";
        }
        if (!anchorRejected && targetAudit === "unavailable") {
          anchorRejected = "audit_unavailable";
        }
        if (
          !anchorRejected &&
          (await isSuggestionSkipped(tx, body.practicedTarget.suggestionId))
        ) {
          anchorRejected = "invalid_anchor";
        }
        const audit =
          !anchorRejected && targetAudit !== "unavailable" ? targetAudit : null;
        const level =
          body.practicedTarget.variant === "fallback"
            ? audit?.fallbackLevel
            : audit?.level;
        if (!anchorRejected && (!audit || level === null || level === undefined)) {
          anchorRejected = "invalid_anchor";
        } else if (
          !anchorRejected &&
          level !== null &&
          level !== undefined &&
          level > currentSkill.confidence
        ) {
          anchorRejected = "invalid_target";
        } else if (!anchorRejected && audit && level !== null && level !== undefined) {
          resolvedTarget = {
            suggestionId: body.practicedTarget.suggestionId,
            level,
            variant: body.practicedTarget.variant,
            curriculumVersion: audit.curriculumVersion,
          };
        }
      }

      const [row] = await tx
        .insert(practiceSessions)
        .values({
          skillId: skill.id,
          occurredAt,
          durationMinutes: body.durationMinutes ?? null,
          notes: body.notes ?? null,
          outcome: body.outcome ?? null,
          cueSupport: body.cueSupport ?? null,
          environment: body.environment ?? null,
          distance: body.distance ?? null,
          durationBand: body.durationBand ?? null,
          distraction: body.distraction ?? null,
          curriculumLevel: resolvedTarget?.level ?? null,
          curriculumVersion: resolvedTarget?.curriculumVersion ?? null,
          practiceVariant: resolvedTarget?.variant ?? null,
          suggestionId: resolvedTarget?.suggestionId ?? null,
          practiceDay: practiceDay(occurredAt, body.timezoneOffsetMinutes),
        })
        .returning();
      if (!row) throw new Error("failed to create practice session");
      if (body.safetySignal) {
        await tx.insert(dogSafetySignals).values({
          dogId: dog.id,
          type: body.safetySignal,
          source: "practice_session",
          reportedAt: new Date(),
        });
      }
      return { session: row, anchorRejected };
    });
    if (sessionResult === "not_found") {
      return c.json({ error: "not_found" } as const, 404);
    }
    const { session, anchorRejected } = sessionResult;

    await recordEvent("training.practice_logged", { userId: c.get("userId") });
    if (body.outcome) {
      await recordEvent("training.practice_outcome_recorded", {
        userId: c.get("userId"),
        props: {
          outcome: body.outcome,
          level: session.curriculumLevel ?? 0,
          variant: session.practiceVariant ?? "unlinked",
          curriculumVersion: session.curriculumVersion ?? "unlinked",
        },
      });
    }
    if (body.safetySignal) {
      await recordEvent("safety.signal_reported", {
        userId: c.get("userId"),
        props: { signal: body.safetySignal, source: "practice_session" },
      });
    }
    return c.json({ session, anchorRejected }, 201);
  })
  .patch(
    "/:id/skills/:skillId/sessions/:sessionId/evidence",
    zValidator("json", practiceEvidenceSchema),
    async (c) => {
      const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
      if (!dog) return c.json({ error: "not_found" } as const, 404);
      const skill = await findOwnedSkill(c.get("userId"), dog.id, c.req.param("skillId"));
      if (!skill) return c.json({ error: "not_found" } as const, 404);
      const body = c.req.valid("json");
      const sessionId = c.req.param("sessionId");
      const updates: Partial<typeof practiceSessions.$inferInsert> = {};
      if (body.outcome !== undefined) updates.outcome = body.outcome;
      if (body.cueSupport !== undefined) updates.cueSupport = body.cueSupport;
      if (body.environment !== undefined) updates.environment = body.environment;
      if (body.distance !== undefined) updates.distance = body.distance;
      if (body.durationBand !== undefined) updates.durationBand = body.durationBand;
      if (body.distraction !== undefined) updates.distraction = body.distraction;
      const targetAudit = body.practicedTarget
        ? await resolvePracticeTargetAudit({
            dogId: dog.id,
            skillId: skill.id,
            suggestionId: body.practicedTarget.suggestionId,
            createdAfter: new Date(Date.now() - PRACTICE_TARGET_MAX_AGE_MS),
          })
        : null;

      const updated = await db.transaction(async (tx) => {
        if (body.safetySignal) await lockDogSafety(tx, dog.id);
        if (body.practicedTarget) {
          await lockSuggestionAnchor(tx, body.practicedTarget.suggestionId);
        }
        const [currentSkill] = await tx
          .select({ confidence: trainingSkills.confidence })
          .from(trainingSkills)
          .where(eq(trainingSkills.id, skill.id))
          .for("update")
          .limit(1);
        if (!currentSkill) return null;
        const [existing] = await tx
          .select()
          .from(practiceSessions)
          .where(
            and(eq(practiceSessions.id, sessionId), eq(practiceSessions.skillId, skill.id)),
          )
          .for("update")
          .limit(1);
        if (!existing) return null;
        let anchorRejected:
          | "practice_day_required"
          | "audit_unavailable"
          | "invalid_anchor"
          | "invalid_target"
          | "target_locked"
          | null = null;
        if (body.practicedTarget && existing.practiceDay === null) {
          anchorRejected = "practice_day_required";
        }
        let resolvedTarget: {
          suggestionId: string;
          level: number;
          variant: "primary" | "fallback";
          curriculumVersion: string;
        } | null = null;
        if (body.practicedTarget && !anchorRejected) {
          if (targetAudit === "unavailable") {
            anchorRejected = "audit_unavailable";
          }
          if (
            !anchorRejected &&
            (await isSuggestionSkipped(tx, body.practicedTarget.suggestionId))
          ) {
            anchorRejected = "invalid_anchor";
          }
          const audit = targetAudit === "unavailable" ? null : targetAudit;
          const level =
            body.practicedTarget.variant === "fallback"
              ? audit?.fallbackLevel
              : audit?.level;
          if (!anchorRejected && (!audit || level === null || level === undefined)) {
            anchorRejected = "invalid_anchor";
          } else if (!anchorRejected && level !== null && level !== undefined && level > currentSkill.confidence) {
            anchorRejected = "invalid_target";
          } else if (!anchorRejected && audit && level !== null && level !== undefined) {
            resolvedTarget = {
              suggestionId: body.practicedTarget.suggestionId,
              level,
              variant: body.practicedTarget.variant,
              curriculumVersion: audit.curriculumVersion,
            };
          }
        }
        if (
          resolvedTarget &&
          existing.curriculumLevel !== null &&
          (existing.suggestionId !== resolvedTarget.suggestionId ||
            existing.curriculumLevel !== resolvedTarget.level ||
            existing.practiceVariant !== resolvedTarget.variant)
        ) {
          anchorRejected = "target_locked";
          resolvedTarget = null;
        }
        if (resolvedTarget && existing.curriculumLevel === null) {
          updates.curriculumLevel = resolvedTarget.level;
          updates.curriculumVersion = resolvedTarget.curriculumVersion;
          updates.practiceVariant = resolvedTarget.variant;
          updates.suggestionId = resolvedTarget.suggestionId;
        }
        let row = existing;
        if (Object.keys(updates).length > 0) {
          const [changed] = await tx
            .update(practiceSessions)
            .set(updates)
            .where(
              and(eq(practiceSessions.id, sessionId), eq(practiceSessions.skillId, skill.id)),
            )
            .returning();
          if (!changed) return null;
          row = changed;
        }
        if (body.safetySignal) {
          await tx.insert(dogSafetySignals).values({
            dogId: dog.id,
            type: body.safetySignal,
            source: "practice_session",
            reportedAt: new Date(),
          });
        }
        return { session: row, anchorRejected };
      });

      if (!updated) return c.json({ error: "not_found" } as const, 404);
      const { session, anchorRejected } = updated;
      if (body.outcome) {
        await recordEvent("training.practice_outcome_recorded", {
          userId: c.get("userId"),
          props: {
            outcome: body.outcome,
            level: session.curriculumLevel ?? 0,
            variant: session.practiceVariant ?? "unlinked",
            curriculumVersion: session.curriculumVersion ?? "unlinked",
          },
        });
      }
      if (body.safetySignal) {
        await recordEvent("safety.signal_reported", {
          userId: c.get("userId"),
          props: { signal: body.safetySignal, source: "practice_session" },
        });
      }
      return c.json({ session, anchorRejected });
    },
  )
```

Replace the existing `DELETE /:id/skills/:skillId/sessions/:sessionId` handler
with a transaction that uses the same skill lock as proposal sync:

```ts
    const deleted = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${skill.id}))`);
      const [currentSkill] = await tx
        .select({ id: trainingSkills.id })
        .from(trainingSkills)
        .where(eq(trainingSkills.id, skill.id))
        .for("update")
        .limit(1);
      if (!currentSkill) return null;
      const [session] = await tx
        .select({ id: practiceSessions.id })
        .from(practiceSessions)
        .where(
          and(
            eq(practiceSessions.id, c.req.param("sessionId")),
            eq(practiceSessions.skillId, skill.id),
          ),
        )
        .for("update")
        .limit(1);
      if (!session) return null;
      await tx.delete(practiceSessions).where(eq(practiceSessions.id, session.id));
      await tx
        .update(advancementProposals)
        .set({ status: "withdrawn", decidedAt: new Date() })
        .where(
          and(
            eq(advancementProposals.skillId, skill.id),
            eq(advancementProposals.status, "proposed"),
          ),
        );
      return session;
    });
```

Keep the existing ownership checks and 404/200 response shape. Add
`advancementProposals` to the schema import. The skill advisory lock makes
delete-vs-proposal synchronization linearizable; if sync wins, delete waits and
withdraws, and if delete wins, sync cannot snapshot the removed row.

Add `practiceEvidenceSchema` and `practiceSessionApiSchema` to the
`@turingcare/shared` import block, `dogSafetySignals` to the `../db/schema`
import block, and `resolvePracticeTargetAudit` from
`../lib/practice-anchor`; import `isSuggestionSkipped` and
`lockSuggestionAnchor` from that module too, plus `lockDogSafety` from
`../lib/safety-lock`.
Replace the route's old
`practiceSessionSchema` import with `practiceSessionApiSchema`.

- [ ] **Step 7: Cut the web timestamp payload over in the same checkpoint**

In `apps/web/src/components/progress/session-form.tsx`, convert the
`datetime-local` wall clock before calling the mutation:

```tsx
 const onSubmit = handleSubmit(async (body) => {
   try {
     const occurredAt = new Date(body.occurredAt);
     await logSession.mutateAsync({
       skillId,
       body: {
         ...body,
         occurredAt: occurredAt.toISOString(),
         timezoneOffsetMinutes: occurredAt.getTimezoneOffset(),
       },
     });
     toast.success(t("progress.saved"));
     onSaved?.();
   } catch {
     toast.error(t("progress.saveFailed"));
   }
 });
```

Add `max={localDateTime()}` to the existing `datetime-local` input. Create
`apps/web/src/components/progress/session-form.test.tsx` with a mocked
`useLogSession`; submit the default form and assert the mutation body has an
ISO-round-trippable `occurredAt` plus a numeric `timezoneOffsetMinutes`. This
keeps UI practice logging compatible in the same commit that makes the API
offset-strict.

- [ ] **Step 8: Run it, expect PASS**

Run:
```bash
pnpm --filter @turingcare/api exec vitest run src/routes/practice-evidence.test.ts
pnpm --filter @turingcare/api exec vitest run src/lib/safety-lock.test.ts
pnpm --filter @turingcare/api exec vitest run src/routes/journal-safety-lock.test.ts
```
Expected: PASS — 19 practice-evidence tests, 3 safety-lock tests, 4 journal
safety-lock tests.

- [ ] **Step 9: Keep the telemetry test honest**

Run: `pnpm --filter @turingcare/api exec vitest run src/routes/telemetry.test.ts`
Expected: PASS — the new names are server-only, so the client ingest allowlist assertions are unaffected.

Also re-run `pnpm --filter @turingcare/api exec vitest run src/routes/journal.test.ts`
to prove the journal 400/404/200 contract is unchanged by the lock.

- [ ] **Step 10: Commit**

```bash
pnpm exec biome check --write apps/api/src/telemetry/events.ts apps/api/src/lib/practice-anchor.ts apps/api/src/lib/safety-lock.ts apps/api/src/lib/safety-lock.test.ts apps/api/src/routes/dogs.ts apps/api/src/routes/practice-evidence.test.ts apps/api/src/routes/journal-safety-lock.test.ts apps/web/src/components/progress/session-form.tsx apps/web/src/components/progress/session-form.test.tsx
pnpm --filter @turingcare/api exec tsc --noEmit
pnpm --filter @turingcare/web exec vitest run src/components/progress/session-form.test.tsx
pnpm --filter @turingcare/web exec tsc --noEmit
git add apps/api/src/telemetry/events.ts apps/api/src/lib/practice-anchor.ts apps/api/src/lib/safety-lock.ts apps/api/src/lib/safety-lock.test.ts apps/api/src/routes/dogs.ts apps/api/src/routes/practice-evidence.test.ts apps/api/src/routes/journal-safety-lock.test.ts apps/web/src/components/progress/session-form.tsx apps/web/src/components/progress/session-form.test.tsx
git commit -m "feat(api): capture structured practice evidence and safety signals"
```

---

## Task 12: Migration — suggestion and advancement audit tables

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0015_training_suggestions.sql` (rename the generated file)
- Modify: `apps/api/drizzle/meta/_journal.json` + snapshot

- [ ] **Step 1: Add the enums and tables** — insert this block in
  `apps/api/src/db/schema.ts` after the Task 10 practice/safety enum declarations
  and immediately before `practiceSessions`, so that table can add a real
  foreign key to `trainingSuggestions`:

```ts
export const suggestionTypeEnum = pgEnum("suggestion_type", [
  "exercise",
  "safety_suppressed",
  "needs_focus_skill",
  "custom_skill_unsupported",
]);
export const suggestionEvidenceCategoryEnum = pgEnum("suggestion_evidence_category", [
  "curriculum_only",
  "recent_practice",
  "recent_observation",
]);
export const suggestionActionEnum = pgEnum("suggestion_action", [
  "started",
  "skipped",
  "rated_useful",
  "rated_not_useful",
]);
export const advancementStatusEnum = pgEnum("advancement_status", [
  "proposed",
  "confirmed",
  "stayed",
  "rejected",
  "regressed",
  "insufficient_evidence",
  "withdrawn",
]);

/**
 * One row per distinct suggestion shown to an owner. Scalar columns only — no
 * jsonb and no free text — so the audit trail can never carry owner prose.
 */
export const trainingSuggestions = pgTable(
  "training_suggestions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    dogId: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id").references(() => trainingSkills.id, { onDelete: "set null" }),
    // Stable authored identity survives skill deletion for audit reconstruction.
    catalogSkillKey: text("catalog_skill_key"),
    weekStart: date("week_start").notNull(),
    curriculumVersion: text("curriculum_version").notNull(),
    suggestionType: suggestionTypeEnum("suggestion_type").notNull(),
    // Free-form only in the sense that rule identifiers evolve faster than a pg
    // enum should; values always come from the shared `suggestionRuleValues`.
    ruleId: text("rule_id"),
    level: integer("level"),
    fallbackLevel: integer("fallback_level"),
    fallbackDimension: practiceDimensionEnum("fallback_dimension"),
    // Controlled `easingStrategyValues` identifier, never owner prose.
    fallbackStrategy: text("fallback_strategy"),
    evidenceCategory: suggestionEvidenceCategoryEnum("evidence_category"),
    suppressed: boolean("suppressed").notNull().default(false),
    safetyRuleId: text("safety_rule_id"),
    // Server-built from dog/week/skill/type/rule/owner-local day; never owner prose.
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("training_suggestions_dog_created_idx").on(t.dogId, t.createdAt),
    unique("training_suggestions_dedupe_key").on(t.dedupeKey),
  ],
);

export const trainingSuggestionActions = pgTable(
  "training_suggestion_actions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    suggestionId: uuid("suggestion_id")
      .notNull()
      .references(() => trainingSuggestions.id, { onDelete: "cascade" }),
    action: suggestionActionEnum("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("training_suggestion_actions_suggestion_idx").on(t.suggestionId),
    unique("training_suggestion_actions_once").on(t.suggestionId, t.action),
  ],
);

/** Advancement is always proposed and owner-decided, never applied automatically. */
export const advancementProposals = pgTable(
  "advancement_proposals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => trainingSkills.id, { onDelete: "cascade" }),
    fromLevel: integer("from_level").notNull(),
    toLevel: integer("to_level").notNull(),
    ruleId: text("rule_id").notNull(),
    evidenceSessionCount: integer("evidence_session_count").notNull(),
    evidenceDayCount: integer("evidence_day_count").notNull(),
    evidenceWindowDays: integer("evidence_window_days").notNull(),
    evidenceSessionIds: uuid("evidence_session_ids").array().notNull(),
    evidenceOccurredAt: timestamp("evidence_occurred_at", { withTimezone: true }).array().notNull(),
    evidencePracticeDays: text("evidence_practice_days").array().notNull(),
    evidenceOutcomes: practiceOutcomeEnum("evidence_outcomes").array().notNull(),
    // Latest session that supported this proposal. A stayed/rejected proposal
    // cannot reappear until newer evidence exists.
    evidenceLastSessionAt: timestamp("evidence_last_session_at", { withTimezone: true }).notNull(),
    status: advancementStatusEnum("status").notNull().default("proposed"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("advancement_proposals_skill_idx").on(t.skillId),
    check(
      "advancement_levels_range",
      sql`${t.fromLevel} BETWEEN 1 AND 5 AND ${t.toLevel} BETWEEN 1 AND 5`,
    ),
  ],
);
```

Then change `practiceSessions.suggestionId` from the temporary unconstrained
UUID added in Task 10 to:

```ts
    suggestionId: uuid("suggestion_id").references(() => trainingSuggestions.id, {
      onDelete: "set null",
    }),
```

The generated `0015` migration must include
`practice_sessions_suggestion_id_training_suggestions_id_fk`; verify that it
uses `ON DELETE SET NULL` before applying the migration.

`boolean` and `date` are already imported at the top of the file.

- [ ] **Step 2: Generate, rename, add the partial unique index and RLS**

```bash
pnpm --filter @turingcare/api db:generate
mv apps/api/drizzle/0015_*.sql apps/api/drizzle/0015_training_suggestions.sql
```

Set the `"idx": 15` entry's `tag` in `apps/api/drizzle/meta/_journal.json` to `"0015_training_suggestions"`. Append to the end of `apps/api/drizzle/0015_training_suggestions.sql`:

```sql
--> statement-breakpoint
-- At most one open proposal per skill. Expressed as a partial index in raw SQL
-- because it is enforced only for `proposed` rows; the drizzle schema keeps the
-- plain index and this migration adds the constraint.
CREATE UNIQUE INDEX "advancement_proposals_open_skill_idx" ON "advancement_proposals" USING btree ("skill_id") WHERE "status" = 'proposed';--> statement-breakpoint
ALTER TABLE "training_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training_suggestion_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "advancement_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  tbl text;
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      FOREACH tbl IN ARRAY ARRAY[
        'training_suggestions', 'training_suggestion_actions', 'advancement_proposals'
      ] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', tbl, rol);
      END LOOP;
    END IF;
  END LOOP;
END
$$;
```

- [ ] **Step 3: Apply and verify**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api db:migrate
psql "$DATABASE_URL" -c "\d advancement_proposals"
psql "$DATABASE_URL" -c "select relname, relrowsecurity from pg_class where relname in ('training_suggestions','training_suggestion_actions','advancement_proposals');"
```

Expected: the partial index `advancement_proposals_open_skill_idx ... WHERE (status = 'proposed')` is listed, and all three tables report `relrowsecurity = t`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle
git commit -m "feat(api): suggestion and advancement audit tables"
```

---

## Task 13: Deterministic safety policy

**Files:**
- Create: `apps/api/src/lib/safety-policy.ts`
- Create: `apps/api/src/lib/safety-policy.test.ts`

- [ ] **Step 1: Write the failing test** — create `apps/api/src/lib/safety-policy.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { type SafetyInputs, decideSafety, evaluateSafetyWithLock } from "./safety-policy";

const NOW = new Date("2026-08-13T12:00:00.000Z");

const empty: SafetyInputs = {
  now: NOW,
  signals: [],
  highIntensityEntryCount: 0,
  harderCheckinCount: 0,
};

describe("decideSafety", () => {
  it("returns null when nothing structured indicates risk", () => {
    expect(decideSafety(empty)).toBeNull();
  });

  it("refers injury or pain to a veterinarian first", () => {
    const decision = decideSafety({
      ...empty,
      signals: [
        { type: "injury_or_pain", reportedAt: new Date("2026-08-12T09:00:00.000Z") },
        { type: "aggression_or_bite_risk", reportedAt: new Date("2026-08-12T09:00:00.000Z") },
      ],
    });
    expect(decision).toEqual({
      suppressed: true,
      ruleId: "reported_injury_or_pain",
      referral: "veterinarian",
    });
  });

  it("refers aggression or bite risk to a veterinary behaviorist", () => {
    expect(
      decideSafety({
        ...empty,
        signals: [
          { type: "aggression_or_bite_risk", reportedAt: new Date("2026-07-01T09:00:00.000Z") },
        ],
      })?.referral,
    ).toBe("veterinary_behaviorist");
  });

  it("refers severe fear or panic to a veterinary behaviorist", () => {
    expect(
      decideSafety({
        ...empty,
        signals: [
          { type: "severe_fear_or_panic", reportedAt: new Date("2026-08-10T09:00:00.000Z") },
        ],
      })?.ruleId,
    ).toBe("reported_severe_fear");
  });

  it("ignores signals older than the 90-day window", () => {
    expect(
      decideSafety({
        ...empty,
        signals: [{ type: "injury_or_pain", reportedAt: new Date("2026-01-01T09:00:00.000Z") }],
      }),
    ).toBeNull();
  });

  it("includes injury reports at exactly 90 days and expires them immediately after", () => {
    const atBoundary = new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000);
    expect(
      decideSafety({
        ...empty,
        signals: [{ type: "injury_or_pain", reportedAt: atBoundary }],
      }),
    ).not.toBeNull();
    expect(
      decideSafety({
        ...empty,
        signals: [
          {
            type: "injury_or_pain",
            reportedAt: new Date(atBoundary.getTime() - 1),
          },
        ],
      }),
    ).toBeNull();
  });

  it("keeps a deleted severe concern active through its persisted safety rule", () => {
    expect(
      decideSafety({
        ...empty,
        signals: [{ type: "severe_behavior_concern", reportedAt: NOW }],
      })?.ruleId,
    ).toBe("severe_recorded_concern");
  });

  it("does not age out a persisted severe concern", () => {
    expect(
      decideSafety({
        ...empty,
        signals: [
          { type: "severe_behavior_concern", reportedAt: new Date("2025-01-01T09:00:00.000Z") },
        ],
      })?.ruleId,
    ).toBe("severe_recorded_concern");
  });

  it("does not age out aggression or severe-fear reports", () => {
    for (const type of ["aggression_or_bite_risk", "severe_fear_or_panic"] as const) {
      expect(
        decideSafety({
          ...empty,
          signals: [{ type, reportedAt: new Date("2025-01-01T09:00:00.000Z") }],
        }),
      ).not.toBeNull();
    }
  });

  it("suppresses on sustained worsening and refers to a credentialed trainer", () => {
    expect(decideSafety({ ...empty, highIntensityEntryCount: 2, harderCheckinCount: 2 })).toEqual({
      suppressed: true,
      ruleId: "sustained_worsening_intensity",
      referral: "credentialed_trainer",
    });
  });

  describe("evaluateSafetyWithLock", () => {
    it("runs the guarded callback with an empty decision and propagates its value", async () => {
      const result = await evaluateSafetyWithLock(
        crypto.randomUUID(),
        NOW,
        async (decision, tx) => {
          expect(decision).toBeNull();
          await tx.execute(sql`select 1`);
          return "guarded-write-complete";
        },
      );

      expect(result).toBe("guarded-write-complete");
    });
  });

  it("does not suppress on partial worsening evidence", () => {
    expect(
      decideSafety({ ...empty, highIntensityEntryCount: 2, harderCheckinCount: 1 }),
    ).toBeNull();
    expect(
      decideSafety({ ...empty, highIntensityEntryCount: 1, harderCheckinCount: 3 }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/api exec vitest run src/lib/safety-policy.test.ts`
Expected: FAIL — `Failed to resolve import "./safety-policy"`.

- [ ] **Step 3: Create `apps/api/src/lib/safety-policy.ts`**

```ts
import type { SafetySignalType, SuggestionSafety } from "@turingcare/shared";
import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import { dogSafetySignals, journalEntries } from "../db/schema";
import { type TransactionType, withDogSafetyLock } from "./safety-lock";

/** Time-bounded medical reports stay in policy for this long. */
export const SAFETY_SIGNAL_WINDOW_DAYS = 90;
/** Window for the "things are getting worse" pattern. */
export const WORSENING_WINDOW_DAYS = 14;
export const HIGH_INTENSITY_THRESHOLD = 4;
export const WORSENING_MIN_HIGH_INTENSITY_ENTRIES = 2;
export const WORSENING_MIN_HARDER_CHECKINS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export type { TransactionType };

export type SafetyInputs = {
  now: Date;
  signals: {
    type: SafetySignalType | "severe_behavior_concern";
    reportedAt: Date;
  }[];
  highIntensityEntryCount: number;
  harderCheckinCount: number;
};

/**
 * Pure, conservative safety policy over *structured* inputs only. Owner free
 * text is never inspected. When this returns a decision, the suggestion engine
 * must suppress every exercise and show referral guidance instead.
 * Persisted safety signals are authoritative; behavior-concern rows are never
 * reinterpreted on reads, so a support-corrected input mistake stays corrected.
 */
export function decideSafety(inputs: SafetyInputs): SuggestionSafety | null {
  const cutoff = new Date(inputs.now.getTime() - SAFETY_SIGNAL_WINDOW_DAYS * DAY_MS);
  const active = inputs.signals.filter(
    (signal) =>
      signal.type === "severe_behavior_concern" ||
      signal.type === "aggression_or_bite_risk" ||
      signal.type === "severe_fear_or_panic" ||
      signal.reportedAt >= cutoff,
  );
  const has = (type: SafetyInputs["signals"][number]["type"]) =>
    active.some((signal) => signal.type === type);

  if (has("injury_or_pain")) {
    return { suppressed: true, ruleId: "reported_injury_or_pain", referral: "veterinarian" };
  }
  if (has("aggression_or_bite_risk")) {
    return {
      suppressed: true,
      ruleId: "reported_aggression_or_bite_risk",
      referral: "veterinary_behaviorist",
    };
  }
  if (has("severe_fear_or_panic")) {
    return {
      suppressed: true,
      ruleId: "reported_severe_fear",
      referral: "veterinary_behaviorist",
    };
  }
  if (has("severe_behavior_concern")) {
    return {
      suppressed: true,
      ruleId: "severe_recorded_concern",
      referral: "veterinary_behaviorist",
    };
  }
  if (
    inputs.highIntensityEntryCount >= WORSENING_MIN_HIGH_INTENSITY_ENTRIES &&
    inputs.harderCheckinCount >= WORSENING_MIN_HARDER_CHECKINS
  ) {
    return {
      suppressed: true,
      ruleId: "sustained_worsening_intensity",
      referral: "credentialed_trainer",
    };
  }
  return null;
}

export async function loadSafetyInputs(
  dogId: string,
  now: Date,
  executor: Pick<typeof db, "select"> = db,
): Promise<SafetyInputs> {
  const signalCutoff = new Date(now.getTime() - SAFETY_SIGNAL_WINDOW_DAYS * DAY_MS);
  const worseningCutoff = new Date(now.getTime() - WORSENING_WINDOW_DAYS * DAY_MS);

  const [signals, worsening] = await Promise.all([
    executor
      .select({ type: dogSafetySignals.type, reportedAt: dogSafetySignals.reportedAt })
      .from(dogSafetySignals)
      .where(
        and(
          eq(dogSafetySignals.dogId, dogId),
          or(
            inArray(dogSafetySignals.type, [
              "severe_behavior_concern",
              "aggression_or_bite_risk",
              "severe_fear_or_panic",
            ]),
            gte(dogSafetySignals.reportedAt, signalCutoff),
          ),
        ),
      ),
    executor
      .select({
        highIntensity: sql<number>`count(*) filter (where ${journalEntries.intensity} >= ${HIGH_INTENSITY_THRESHOLD})`,
        harder: sql<number>`count(*) filter (where ${journalEntries.kind} = 'daily_checkin' and ${journalEntries.trend} = 'harder')`,
      })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.dogId, dogId),
          gte(journalEntries.occurredAt, worseningCutoff),
          lte(journalEntries.occurredAt, now),
        ),
      ),
  ]);

  const counts = worsening[0];
  return {
    now,
    signals,
    highIntensityEntryCount: Number(counts?.highIntensity ?? 0),
    harderCheckinCount: Number(counts?.harder ?? 0),
  };
}

export async function evaluateSafety(dogId: string, now: Date): Promise<SuggestionSafety | null> {
  return decideSafety(await loadSafetyInputs(dogId, now));
}

/**
 * Holds the shared safety lock through the guarded write, making this decision
 * and action a single linearization point.
 */
export async function evaluateSafetyWithLock<T>(
  dogId: string,
  now: Date,
  callback: (decision: SuggestionSafety | null, tx: TransactionType) => Promise<T>,
): Promise<T> {
  return withDogSafetyLock(dogId, async (tx) => {
    const decision = decideSafety(await loadSafetyInputs(dogId, now, tx));
    return await callback(decision, tx);
  });
}
```

Callers get the decision *and* the same `tx` that holds the lock, so every
write conditioned on that decision must go through this `tx` — never `db`.

- [ ] **Step 4: Run it, expect PASS**

Run: `pnpm --filter @turingcare/api exec vitest run src/lib/safety-policy.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write apps/api/src/lib/safety-policy.ts apps/api/src/lib/safety-policy.test.ts
pnpm --filter @turingcare/api exec tsc --noEmit
git add apps/api/src/lib/safety-policy.ts apps/api/src/lib/safety-policy.test.ts
git commit -m "feat(api): conservative structured safety policy"
```

---

## Task 14: Level-anchored evidence loader and deterministic rules

Gate 1 records the relevant context answers with the exact displayed
curriculum target, but does not invent numeric context thresholds that the
reviewed catalog does not yet define. Difficulty selection uses the anchored
primary/fallback target plus outcome/observation rules; advancement uses only
owner-confirmed success on the exact displayed primary target. Rich
cross-context reliability and weakest-context scoring remain the approved Gate
2 work. This is deliberate, safer staging rather than treating the context
columns as equivalent difficulty scales across all 21 skills.

**Files:**
- Create: `apps/api/src/lib/practice-evidence.ts`
- Create: `apps/api/src/lib/practice-evidence.test.ts`
- Create: `apps/api/src/lib/observations.ts`
- Create: `apps/api/src/lib/suggestion-rules.ts`
- Create: `apps/api/src/lib/suggestion-rules.test.ts`
- Create: `apps/api/drizzle/0016_journal_observation_index.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Create: `apps/api/drizzle/meta/0016_snapshot.json`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/db/schema.test.ts`

`loadRecentObservation` filters `journal_entries` by `dog_id` and
`kind`, restricts `occurred_at` to its observation window, and requests the
latest row ordered by `occurred_at DESC, id DESC`. Add
`journal_entries_dog_kind_occurred_idx` on `(dog_id, kind, occurred_at, id)`
so PostgreSQL can use the equality prefix and backward-scan the standard ASC
B-tree for that descending order without a sort. It follows
`0015_training_suggestions`, so this generated migration is `0016`; rename
the generated SQL and journal tag, but do not regenerate or renumber earlier
migrations.

- [ ] **Step 1: Write the failing evidence test** — create `apps/api/src/lib/practice-evidence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EVIDENCE_WINDOW_DAYS, summarizeEvidence } from "./practice-evidence";

const NOW = new Date("2026-08-13T12:00:00.000Z");
const day = (iso: string) => new Date(iso);

describe("summarizeEvidence", () => {
  it("reports an empty summary with no rows", () => {
    expect(summarizeEvidence([], NOW)).toEqual({
      windowDays: EVIDENCE_WINDOW_DAYS,
      sessionCount: 0,
      wentWellCount: 0,
      mixedCount: 0,
      tooHardCount: 0,
      distinctDayCount: 0,
      lastPracticeAt: null,
      recentOutcomes: [],
    });
  });

  it("counts outcomes, distinct owner-local days and the latest practice", () => {
    const summary = summarizeEvidence(
      [
        {
          outcome: "went_well",
          occurredAt: day("2026-08-10T08:00:00.000Z"),
          practiceDay: "2026-08-10",
        },
        {
          outcome: "went_well",
          occurredAt: day("2026-08-10T18:00:00.000Z"),
          practiceDay: "2026-08-10",
        },
        {
          outcome: "mixed",
          occurredAt: day("2026-08-12T08:00:00.000Z"),
          practiceDay: "2026-08-12",
        },
        {
          outcome: "too_hard",
          occurredAt: day("2026-08-13T08:00:00.000Z"),
          practiceDay: "2026-08-13",
        },
      ],
      NOW,
    );
    expect(summary.sessionCount).toBe(4);
    expect(summary.wentWellCount).toBe(2);
    expect(summary.mixedCount).toBe(1);
    expect(summary.tooHardCount).toBe(1);
    expect(summary.distinctDayCount).toBe(3);
    expect(summary.lastPracticeAt).toBe("2026-08-13T08:00:00.000Z");
  });

  it("orders recentOutcomes newest first", () => {
    const summary = summarizeEvidence(
      [
        { outcome: "went_well", occurredAt: day("2026-08-10T08:00:00.000Z") },
        { outcome: "too_hard", occurredAt: day("2026-08-13T08:00:00.000Z") },
      ],
      NOW,
    );
    expect(summary.recentOutcomes).toEqual(["too_hard", "went_well"]);
  });

  it("uses the captured local date instead of applying one offset to the whole window", () => {
    const summary = summarizeEvidence(
      [
        {
          outcome: "went_well",
          occurredAt: day("2026-11-01T06:30:00.000Z"),
          practiceDay: "2026-11-01",
        },
        {
          outcome: "went_well",
          occurredAt: day("2026-11-02T06:30:00.000Z"),
          practiceDay: "2026-11-02",
        },
      ],
      new Date("2026-11-03T12:00:00.000Z"),
    );
    expect(summary.distinctDayCount).toBe(2);
  });

  it("ignores sessions without a recorded outcome", () => {
    const summary = summarizeEvidence(
      [
        { outcome: null, occurredAt: day("2026-08-12T08:00:00.000Z") },
        { outcome: "mixed", occurredAt: day("2026-08-12T09:00:00.000Z") },
      ],
      NOW,
    );
    expect(summary.sessionCount).toBe(1);
    expect(summary.recentOutcomes).toEqual(["mixed"]);
  });

  it("ignores future-dated evidence", () => {
    const summary = summarizeEvidence(
      [
        { outcome: "went_well", occurredAt: day("2026-08-13T08:00:00.000Z") },
        { outcome: "went_well", occurredAt: day("2026-08-14T08:00:00.000Z") },
      ],
      NOW,
    );
    expect(summary.sessionCount).toBe(1);
    expect(summary.lastPracticeAt).toBe("2026-08-13T08:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/api exec vitest run src/lib/practice-evidence.test.ts`
Expected: FAIL — `Failed to resolve import "./practice-evidence"`.

- [ ] **Step 3: Create `apps/api/src/lib/practice-evidence.ts`**

```ts
import type {
  PracticeDistraction,
  PracticeEnvironment,
  PracticeOutcome,
  SuggestionEvidence,
} from "@turingcare/shared";
import { and, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { CURRICULUM_VERSION } from "../data/training-curriculum";
import { db } from "../db";
import { practiceSessions } from "../db/schema";

/** How far back structured practice evidence is considered. */
export const EVIDENCE_WINDOW_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

export type EvidenceRow = {
  id?: string;
  outcome: PracticeOutcome | null;
  occurredAt: Date;
  practiceDay?: string;
};

export type EvidenceSummary = SuggestionEvidence & { recentOutcomes: PracticeOutcome[] };

export function summarizeEvidence(
  rows: EvidenceRow[],
  now: Date,
): EvidenceSummary {
  const scored = rows
    .filter(
      (row): row is EvidenceRow & { outcome: PracticeOutcome } =>
        row.outcome !== null && row.occurredAt <= now,
    )
    .sort(
      (a, b) =>
        b.occurredAt.getTime() - a.occurredAt.getTime() ||
        (b.id ?? "").localeCompare(a.id ?? ""),
    );

  const days = new Set(
    scored.map((row) => row.practiceDay ?? row.occurredAt.toISOString().slice(0, 10)),
  );
  const latest = scored[0];

  return {
    windowDays: EVIDENCE_WINDOW_DAYS,
    sessionCount: scored.length,
    wentWellCount: scored.filter((row) => row.outcome === "went_well").length,
    mixedCount: scored.filter((row) => row.outcome === "mixed").length,
    tooHardCount: scored.filter((row) => row.outcome === "too_hard").length,
    distinctDayCount: days.size,
    lastPracticeAt: latest ? latest.occurredAt.toISOString() : null,
    recentOutcomes: scored.map((row) => row.outcome),
  };
}

/**
 * Loads structured outcomes for the confirmed level and its one-step-easier
 * level so successful eased practice can recover to the confirmed target.
 * Primary and fallback outcomes both inform next-session difficulty. A
 * separate confirmed-level, primary-only slice is returned for advancement.
 */
export type ScoredRow = {
  id: string;
  outcome: PracticeOutcome;
  occurredAt: Date;
  practiceDay: string;
  practiceVariant: "primary" | "fallback";
  curriculumLevel: number;
  environment: PracticeEnvironment | null;
  distraction: PracticeDistraction | null;
};

export async function loadSkillEvidence(
  skillId: string,
  confirmedLevel: number,
  now: Date,
): Promise<{
  summary: EvidenceSummary;
  rows: ScoredRow[];
  advancementRows: ScoredRow[];
  latestMixedHadChallengingContext: boolean;
}> {
  const cutoff = new Date(now.getTime() - EVIDENCE_WINDOW_DAYS * DAY_MS);
  const rows = await db
    .select({
      id: practiceSessions.id,
      outcome: practiceSessions.outcome,
      occurredAt: practiceSessions.occurredAt,
      practiceDay: practiceSessions.practiceDay,
      practiceVariant: practiceSessions.practiceVariant,
      curriculumLevel: practiceSessions.curriculumLevel,
      environment: practiceSessions.environment,
      distraction: practiceSessions.distraction,
    })
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.skillId, skillId),
        gte(practiceSessions.occurredAt, cutoff),
        lte(practiceSessions.occurredAt, now),
        inArray(practiceSessions.curriculumLevel, [
          confirmedLevel,
          Math.max(1, confirmedLevel - 1),
        ]),
        eq(practiceSessions.curriculumVersion, CURRICULUM_VERSION),
        isNotNull(practiceSessions.practiceDay),
        isNotNull(practiceSessions.practiceVariant),
      ),
    )
    .orderBy(desc(practiceSessions.occurredAt), desc(practiceSessions.id));
  const scored = rows.filter(
    (row): row is ScoredRow =>
      row.outcome !== null &&
      row.practiceDay !== null &&
      row.practiceVariant !== null &&
      row.curriculumLevel !== null,
  );
  return {
    summary: summarizeEvidence(scored, now),
    rows: scored,
    latestMixedHadChallengingContext:
      scored[0]?.outcome === "mixed" &&
      (scored[0].environment === "busy_outdoor" ||
        scored[0].distraction === "strong"),
    advancementRows: scored.filter(
      (row) =>
        row.practiceVariant === "primary" &&
        row.curriculumLevel === confirmedLevel,
    ),
  };
}
```

- [ ] **Step 4: Run it, expect PASS**

Run: `pnpm --filter @turingcare/api exec vitest run src/lib/practice-evidence.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Add and test the recent-observation index** — in
  `apps/api/src/db/schema.ts`, add this table extra-config entry:

```ts
index("journal_entries_dog_kind_occurred_idx").on(t.dogId, t.kind, t.occurredAt, t.id),
```

In `apps/api/src/db/schema.test.ts`, use `getTableConfig(journalEntries)` to
assert that the named index's columns are `dog_id`, `kind`, `occurred_at`, and
`id`. Generate the migration, rename the generated file, and update only the
new journal entry tag:

```bash
pnpm --filter @turingcare/api db:generate
mv apps/api/drizzle/0016_*.sql apps/api/drizzle/0016_journal_observation_index.sql
# Set only idx 16's tag to 0016_journal_observation_index in _journal.json.
pnpm --filter @turingcare/api exec vitest run src/db/schema.test.ts
```

The default ASC B-tree supports `ORDER BY occurred_at DESC, id DESC` by a
backward scan after the `dog_id` and `kind` equality prefixes; explicit DESC
storage is unnecessary.

- [ ] **Step 6: Create `apps/api/src/lib/observations.ts`** (no separate test — it is one query, covered by the route tests in Task 17):

```ts
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db";
import { journalEntries } from "../db/schema";

/** How recent a daily check-in must be to influence today's suggestion. */
export const OBSERVATION_WINDOW_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RecentObservation = { trend: "better" | "same" | "harder"; occurredAt: Date } | null;

/** Latest structured daily check-in trend within the observation window. */
export async function loadRecentObservation(dogId: string, now: Date): Promise<RecentObservation> {
  const cutoff = new Date(now.getTime() - OBSERVATION_WINDOW_DAYS * DAY_MS);
  const [row] = await db
    .select({
      id: journalEntries.id,
      trend: journalEntries.trend,
      occurredAt: journalEntries.occurredAt,
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.dogId, dogId),
        eq(journalEntries.kind, "daily_checkin"),
        gte(journalEntries.occurredAt, cutoff),
        lte(journalEntries.occurredAt, now),
      ),
    )
    .orderBy(desc(journalEntries.occurredAt), desc(journalEntries.id))
    .limit(1);
  if (!row || !row.trend) return null;
  return { trend: row.trend, occurredAt: row.occurredAt };
}
```

- [ ] **Step 7: Write the failing rules test** — create `apps/api/src/lib/suggestion-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EVIDENCE_WINDOW_DAYS } from "./practice-evidence";
import { type RuleInputs, selectSuggestionRule } from "./suggestion-rules";

const NOW = new Date("2026-08-13T12:00:00.000Z");

const base: RuleInputs = {
  now: NOW,
  hasFocusSkill: true,
  catalogSkillKey: "basic-manners.sit",
  level: 3,
  recentOutcomes: [],
  latestMixedHadChallengingContext: false,
  lastWentWellAt: null,
  observation: null,
};

describe("selectSuggestionRule", () => {
  it("asks for a focus skill first", () => {
    expect(selectSuggestionRule({ ...base, hasFocusSkill: false })).toEqual({
      ruleId: "needs_focus_skill",
      type: "needs_focus_skill",
      effectiveLevel: null,
      evidenceCategory: null,
    });
  });

  it("marks a custom skill as unsupported", () => {
    expect(selectSuggestionRule({ ...base, catalogSkillKey: null })).toEqual({
      ruleId: "custom_skill_unsupported",
      type: "custom_skill_unsupported",
      effectiveLevel: null,
      evidenceCategory: null,
    });
  });

  it("works at cold start from the curriculum level alone", () => {
    expect(selectSuggestionRule(base)).toEqual({
      ruleId: "cold_start_curriculum_level",
      type: "exercise",
      effectiveLevel: 3,
      evidenceCategory: "curriculum_only",
    });
  });

  it("steps back after two of the last three outcomes were too hard", () => {
    const result = selectSuggestionRule({
      ...base,
      recentOutcomes: ["too_hard", "went_well", "too_hard", "went_well"],
    });
    expect(result.ruleId).toBe("step_back_after_too_hard");
    expect(result.effectiveLevel).toBe(2);
    expect(result.evidenceCategory).toBe("recent_practice");
  });

  it("never steps below level 1", () => {
    expect(
      selectSuggestionRule({ ...base, level: 1, recentOutcomes: ["too_hard", "too_hard"] })
        .effectiveLevel,
    ).toBe(1);
  });

  it("eases after a harder check-in with no success since", () => {
    const result = selectSuggestionRule({
      ...base,
      recentOutcomes: ["mixed"],
      lastWentWellAt: new Date("2026-08-01T12:00:00.000Z"),
      observation: { trend: "harder", occurredAt: new Date("2026-08-12T12:00:00.000Z") },
    });
    expect(result.ruleId).toBe("ease_after_harder_checkin");
    expect(result.effectiveLevel).toBe(2);
    expect(result.evidenceCategory).toBe("recent_observation");
  });

  it("ignores a harder check-in once practice has gone well since", () => {
    const result = selectSuggestionRule({
      ...base,
      recentOutcomes: ["went_well"],
      lastWentWellAt: new Date("2026-08-13T09:00:00.000Z"),
      observation: { trend: "harder", occurredAt: new Date("2026-08-12T12:00:00.000Z") },
    });
    expect(result.ruleId).toBe("maintain_current_level");
    expect(result.effectiveLevel).toBe(3);
  });

  it("eases one level after mixed practice in a challenging context", () => {
    const result = selectSuggestionRule({
      ...base,
      recentOutcomes: ["mixed"],
      latestMixedHadChallengingContext: true,
    });
    expect(result.ruleId).toBe("ease_after_hard_context");
    expect(result.effectiveLevel).toBe(2);
    expect(result.evidenceCategory).toBe("recent_practice");
  });

  it("holds the level after two of the last three were mixed", () => {
    const result = selectSuggestionRule({
      ...base,
      recentOutcomes: ["mixed", "went_well", "mixed"],
    });
    expect(result.ruleId).toBe("hold_after_mixed");
    expect(result.effectiveLevel).toBe(3);
  });

  it("maintains the level when practice is going well", () => {
    const result = selectSuggestionRule({
      ...base,
      recentOutcomes: ["went_well", "went_well", "went_well"],
    });
    expect(result.ruleId).toBe("maintain_current_level");
    expect(result.effectiveLevel).toBe(3);
  });

  it("is deterministic for identical inputs", () => {
    const inputs = { ...base, recentOutcomes: ["mixed", "too_hard", "too_hard"] } as RuleInputs;
    expect(selectSuggestionRule(inputs)).toEqual(selectSuggestionRule(inputs));
  });

  it("exposes the evidence window used by the loader", () => {
    expect(EVIDENCE_WINDOW_DAYS).toBe(21);
  });
});
```

- [ ] **Step 8: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/api exec vitest run src/lib/suggestion-rules.test.ts`
Expected: FAIL — `Failed to resolve import "./suggestion-rules"`.

- [ ] **Step 9: Create `apps/api/src/lib/suggestion-rules.ts`**

```ts
import type {
  EvidenceCategory,
  PracticeOutcome,
  SuggestionRule,
  SuggestionType,
} from "@turingcare/shared";
import { clampLevel } from "./curriculum";
import type { RecentObservation } from "./observations";

/** How many of the most recent outcomes the rules look at. */
export const RECENT_OUTCOME_WINDOW = 3;
export const STEP_BACK_TOO_HARD_COUNT = 2;
export const HOLD_MIXED_COUNT = 2;

export type RuleInputs = {
  now: Date;
  hasFocusSkill: boolean;
  catalogSkillKey: string | null;
  level: number;
  /** Newest first, filtered to the confirmed or one-step-easier level. */
  recentOutcomes: PracticeOutcome[];
  latestMixedHadChallengingContext: boolean;
  lastWentWellAt: Date | null;
  observation: RecentObservation;
};

export type RuleResult = {
  ruleId: SuggestionRule;
  type: SuggestionType;
  effectiveLevel: number | null;
  evidenceCategory: EvidenceCategory | null;
};

/**
 * Deterministic, explainable rule selection. Pure: no DB, no clock beyond the
 * injected `now`, and it never reads owner free text. Rules are evaluated in a
 * fixed precedence order, so identical inputs always yield the same result.
 */
export function selectSuggestionRule(inputs: RuleInputs): RuleResult {
  if (!inputs.hasFocusSkill) {
    return {
      ruleId: "needs_focus_skill",
      type: "needs_focus_skill",
      effectiveLevel: null,
      evidenceCategory: null,
    };
  }
  if (!inputs.catalogSkillKey) {
    return {
      ruleId: "custom_skill_unsupported",
      type: "custom_skill_unsupported",
      effectiveLevel: null,
      evidenceCategory: null,
    };
  }

  const level = clampLevel(inputs.level);
  const recent = inputs.recentOutcomes.slice(0, RECENT_OUTCOME_WINDOW);
  const countOf = (outcome: PracticeOutcome) => recent.filter((v) => v === outcome).length;

  if (recent.length === 0) {
    return {
      ruleId: "cold_start_curriculum_level",
      type: "exercise",
      effectiveLevel: level,
      evidenceCategory: "curriculum_only",
    };
  }

  if (countOf("too_hard") >= STEP_BACK_TOO_HARD_COUNT) {
    return {
      ruleId: "step_back_after_too_hard",
      type: "exercise",
      effectiveLevel: clampLevel(level - 1),
      evidenceCategory: "recent_practice",
    };
  }

  const harder = inputs.observation?.trend === "harder" ? inputs.observation : null;
  const successSinceCheckin =
    harder && inputs.lastWentWellAt ? inputs.lastWentWellAt >= harder.occurredAt : false;
  if (harder && !successSinceCheckin) {
    return {
      ruleId: "ease_after_harder_checkin",
      type: "exercise",
      effectiveLevel: clampLevel(level - 1),
      evidenceCategory: "recent_observation",
    };
  }

  if (inputs.latestMixedHadChallengingContext) {
    return {
      ruleId: "ease_after_hard_context",
      type: "exercise",
      effectiveLevel: clampLevel(level - 1),
      evidenceCategory: "recent_practice",
    };
  }

  if (countOf("mixed") >= HOLD_MIXED_COUNT) {
    return {
      ruleId: "hold_after_mixed",
      type: "exercise",
      effectiveLevel: level,
      evidenceCategory: "recent_practice",
    };
  }

  return {
    ruleId: "maintain_current_level",
    type: "exercise",
    effectiveLevel: level,
    evidenceCategory: "recent_practice",
  };
}
```

- [ ] **Step 10: Run both, expect PASS**

Run: `pnpm --filter @turingcare/api exec vitest run src/lib/suggestion-rules.test.ts src/lib/practice-evidence.test.ts`
Expected: PASS — 18 tests total.

- [ ] **Step 11: Commit**

```bash
pnpm exec biome check --write apps/api/src/db/schema.ts apps/api/src/db/schema.test.ts apps/api/src/lib/practice-evidence.ts apps/api/src/lib/practice-evidence.test.ts apps/api/src/lib/observations.ts apps/api/src/lib/suggestion-rules.ts apps/api/src/lib/suggestion-rules.test.ts
pnpm --filter @turingcare/api exec tsc --noEmit
git add apps/api/src/db/schema.ts apps/api/src/db/schema.test.ts apps/api/drizzle/0016_journal_observation_index.sql apps/api/drizzle/meta/_journal.json apps/api/drizzle/meta/0016_snapshot.json docs/superpowers/plans/2026-08-11-personalized-training-gate-1.md
git commit -m "perf(api): index recent journal observations"
```

---

## Task 15: Owner-confirmed advancement proposals

**Files:**
- Create: `apps/api/src/lib/advancement.ts`
- Create: `apps/api/src/lib/advancement.test.ts`
- Modify: `apps/api/src/lib/skill-level.ts`
- Modify: `apps/api/src/routes/dogs.ts`

- [ ] **Step 1: Write the failing test** — create `apps/api/src/lib/advancement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ADVANCEMENT_MIN_DAYS,
  ADVANCEMENT_MIN_SESSIONS,
  type AdvancementInputs,
  evaluateAdvancement,
} from "./advancement";

const day = (iso: string) => new Date(iso);

const base: AdvancementInputs = {
  ruleId: "maintain_current_level",
  level: 3,
  outcomes: [],
};

describe("evaluateAdvancement", () => {
  it("requires three consecutive good sessions across two days", () => {
    expect(ADVANCEMENT_MIN_SESSIONS).toBe(3);
    expect(ADVANCEMENT_MIN_DAYS).toBe(2);
    const result = evaluateAdvancement({
      ...base,
      outcomes: [
        { outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
        { outcome: "went_well", occurredAt: day("2026-08-12T09:00:00.000Z") },
        { outcome: "went_well", occurredAt: day("2026-08-11T09:00:00.000Z") },
      ],
    });
    expect(result).toEqual({
      fromLevel: 3,
      toLevel: 4,
      sessionCount: 3,
      dayCount: 3,
      lastSessionAt: day("2026-08-13T09:00:00.000Z"),
      lastSessionId: null,
    });
  });

  it("does not propose when the good sessions all happened on one day", () => {
    expect(
      evaluateAdvancement({
        ...base,
        outcomes: [
          { outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-13T12:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-13T18:00:00.000Z") },
        ],
      }),
    ).toBeNull();
  });

  it("does not propose when a recent session was not a success", () => {
    expect(
      evaluateAdvancement({
        ...base,
        outcomes: [
          { outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
          { outcome: "mixed", occurredAt: day("2026-08-12T09:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-11T09:00:00.000Z") },
        ],
      }),
    ).toBeNull();
  });

  it("does not propose with fewer than three sessions", () => {
    expect(
      evaluateAdvancement({
        ...base,
        outcomes: [
          { outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-12T09:00:00.000Z") },
        ],
      }),
    ).toBeNull();
  });

  it("does not propose past level 5", () => {
    expect(
      evaluateAdvancement({
        ...base,
        level: 5,
        outcomes: [
          { outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-12T09:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-11T09:00:00.000Z") },
        ],
      }),
    ).toBeNull();
  });

  it("does not propose unless the rule is maintain_current_level", () => {
    for (const ruleId of [
      "hold_after_mixed",
      "step_back_after_too_hard",
      "ease_after_harder_checkin",
      "ease_after_hard_context",
      "cold_start_curriculum_level",
    ] as const) {
      expect(
        evaluateAdvancement({
          ...base,
          ruleId,
          outcomes: [
            { outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
            { outcome: "went_well", occurredAt: day("2026-08-12T09:00:00.000Z") },
            { outcome: "went_well", occurredAt: day("2026-08-11T09:00:00.000Z") },
          ],
        }),
      ).toBeNull();
    }
  });

  it("reports only the three qualifying recent successes as proposal evidence", () => {
    const result = evaluateAdvancement({
      ...base,
      outcomes: [
        { outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
        { outcome: "went_well", occurredAt: day("2026-08-12T09:00:00.000Z") },
        { outcome: "went_well", occurredAt: day("2026-08-11T09:00:00.000Z") },
        { outcome: "mixed", occurredAt: day("2026-08-10T09:00:00.000Z") },
      ],
    });
    expect(result?.sessionCount).toBe(3);
    expect(result?.dayCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/api exec vitest run src/lib/advancement.test.ts`
Expected: FAIL — `Failed to resolve import "./advancement"`.

- [ ] **Step 3: Allow skill-level updates to participate in a transaction** — in
  `apps/api/src/lib/skill-level.ts`, import `type DB` alongside `db`, add this
  database interface, add the optional parameter, and replace the three direct
  `db` calls inside the function with `database`:

```ts
type SkillLevelDatabase = Pick<DB, "update" | "select" | "insert">;

export async function setSkillLevel(
  skillId: string,
  level: number,
  database: SkillLevelDatabase = db,
) {
  const [updated] = await database
    .update(trainingSkills)
    .set({ confidence: level })
    .where(eq(trainingSkills.id, skillId))
    .returning();
  if (!updated) throw new Error("failed to set skill level");

  if (level >= 2) {
    const existing = await database
      .select({ level: skillMilestones.level })
      .from(skillMilestones)
      .where(eq(skillMilestones.skillId, skillId));
    const have = new Set(existing.map((row) => row.level));
    const toInsert = [];
    for (let next = 2; next <= level; next++) {
      if (!have.has(next)) toInsert.push({ skillId, level: next });
    }
    if (toInsert.length > 0) {
      await database.insert(skillMilestones).values(toInsert).onConflictDoNothing();
    }
  }
  return updated;
}
```

In `apps/api/src/routes/dogs.ts`, make the existing manual level endpoint share
the same skill advisory lock as advancement decisions:

```ts
  .put("/:id/skills/:skillId/level", zValidator("json", skillLevelSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const skill = await findOwnedSkill(c.get("userId"), dog.id, c.req.param("skillId"));
    if (!skill) return c.json({ error: "not_found" } as const, 404);
    const level = c.req.valid("json").level;
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${skill.id}))`);
      return setSkillLevel(skill.id, level, tx);
    });
    await recordEvent("training.level_set", {
      userId: c.get("userId"),
      props: { level },
    });
    return c.json({ skill: updated });
  })
```

Task 17 adds the route-level lock regression after it creates
`apps/api/src/routes/suggestion.test.ts`. The existing stale-proposal test there
proves a decision cannot overwrite a manual change that linearizes first.

- [ ] **Step 4: Create `apps/api/src/lib/advancement.ts`**

```ts
import type {
  AdvancementDecision,
  AdvancementProposalDto,
  PracticeOutcome,
  SuggestionRule,
} from "@turingcare/shared";
import { advancementRuleId } from "@turingcare/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { CURRICULUM_VERSION } from "../data/training-curriculum";
import { db } from "../db";
import { advancementProposals, practiceSessions, trainingSkills } from "../db/schema";
import { clampLevel, MAX_LEVEL } from "./curriculum";
import { EVIDENCE_WINDOW_DAYS } from "./practice-evidence";
import { type TransactionType, lockDogSafety } from "./safety-lock";
import { decideSafety, loadSafetyInputs } from "./safety-policy";
import { setSkillLevel } from "./skill-level";

export const ADVANCEMENT_MIN_SESSIONS = 3;
export const ADVANCEMENT_MIN_DAYS = 2;

export type AdvancementInputs = {
  ruleId: SuggestionRule;
  level: number;
  /** Newest first, already filtered to the skill's current level. */
  outcomes: {
    id?: string;
    outcome: PracticeOutcome;
    occurredAt: Date;
    practiceDay?: string;
  }[];
};

export type AdvancementEvidence = {
  fromLevel: number;
  toLevel: number;
  sessionCount: number;
  dayCount: number;
  lastSessionAt: Date;
  lastSessionId: string | null;
};

/**
 * Pure check for "ready to try the next step". Advancement is only ever a
 * proposal the owner confirms; nothing here changes a skill level.
 */
export function evaluateAdvancement(inputs: AdvancementInputs): AdvancementEvidence | null {
  if (inputs.ruleId !== "maintain_current_level") return null;
  const level = clampLevel(inputs.level);
  if (level >= MAX_LEVEL) return null;
  if (inputs.outcomes.length < ADVANCEMENT_MIN_SESSIONS) return null;

  const recent = inputs.outcomes.slice(0, ADVANCEMENT_MIN_SESSIONS);
  if (!recent.every((row) => row.outcome === "went_well")) return null;
  const newest = recent[0];
  if (!newest) return null;

  const days = new Set(
    recent.map((row) => row.practiceDay ?? row.occurredAt.toISOString().slice(0, 10)),
  );
  if (days.size < ADVANCEMENT_MIN_DAYS) {
    return null;
  }

  return {
    fromLevel: level,
    toLevel: level + 1,
    sessionCount: recent.length,
    dayCount: days.size,
    lastSessionAt: newest.occurredAt,
    lastSessionId: newest.id ?? null,
  };
}

function toDto(row: typeof advancementProposals.$inferSelect): AdvancementProposalDto {
  if (
    row.evidenceSessionIds.length !== row.evidenceOccurredAt.length ||
    row.evidenceSessionIds.length !== row.evidencePracticeDays.length ||
    row.evidenceSessionIds.length !== row.evidenceOutcomes.length
  ) {
    throw new Error("advancement proposal evidence snapshot is inconsistent");
  }
  const supportingSessions: AdvancementProposalDto["supportingSessions"] = [];
  for (let index = 0; index < row.evidenceSessionIds.length; index++) {
    const id = row.evidenceSessionIds[index];
    const occurredAt = row.evidenceOccurredAt[index];
    const practiceDay = row.evidencePracticeDays[index];
    const outcome = row.evidenceOutcomes[index];
    if (!id || !occurredAt || !practiceDay || !outcome) {
      throw new Error("advancement proposal evidence snapshot is incomplete");
    }
    supportingSessions.push({
      id,
      occurredAt: occurredAt.toISOString(),
      practiceDay,
      outcome,
    });
  }
  return {
    id: row.id,
    skillId: row.skillId,
    fromLevel: row.fromLevel,
    toLevel: row.toLevel,
    ruleId: advancementRuleId,
    status: row.status,
    sessionCount: row.evidenceSessionCount,
    dayCount: row.evidenceDayCount,
    windowDays: row.evidenceWindowDays,
    supportingSessions,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}

/**
 * Keeps at most one open proposal per skill in step with the evidence:
 * creates one when earned, leaves a matching one untouched, and withdraws a
 * stale one when the evidence no longer supports it.
 *
 * Runs on the caller's transaction so a caller that already holds a lock (the
 * safety-locked suggestion path) never opens a nested transaction and never
 * takes a second pooled connection while holding the first.
 */
export async function syncAdvancementProposalInTx(
  tx: TransactionType,
  skillId: string,
  evidence: AdvancementEvidence | null,
  evidenceRows: Array<{
    id: string;
    outcome: PracticeOutcome;
    occurredAt: Date;
    practiceDay: string;
  }>,
): Promise<{ proposal: AdvancementProposalDto | null; created: boolean }> {
  // Every proposal sync and owner decision takes this lock first. The shared
  // lock order is advisory lock -> skill row -> proposal/evidence rows.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${skillId}))`);
  const [currentSkill] = await tx
    .select({ confidence: trainingSkills.confidence })
    .from(trainingSkills)
    .where(eq(trainingSkills.id, skillId))
    .for("update")
    .limit(1);
  if (!currentSkill) return { proposal: null, created: false };
  const [open] = await tx
    .select()
    .from(advancementProposals)
    .where(
      and(eq(advancementProposals.skillId, skillId), eq(advancementProposals.status, "proposed")),
    )
    .limit(1);

  if (!evidence) {
    if (open) {
      await tx
        .update(advancementProposals)
        .set({ status: "withdrawn", decidedAt: new Date() })
        .where(eq(advancementProposals.id, open.id));
    }
    return { proposal: null, created: false };
  }
  if (currentSkill.confidence !== evidence.fromLevel) {
    if (open) {
      await tx
        .update(advancementProposals)
        .set({ status: "withdrawn", decidedAt: new Date() })
        .where(eq(advancementProposals.id, open.id));
    }
    return { proposal: null, created: false };
  }

  const qualifying = evidenceRows.slice(0, ADVANCEMENT_MIN_SESSIONS);
  const persisted = await tx
    .select({
      id: practiceSessions.id,
      outcome: practiceSessions.outcome,
      occurredAt: practiceSessions.occurredAt,
      practiceDay: practiceSessions.practiceDay,
      curriculumLevel: practiceSessions.curriculumLevel,
      practiceVariant: practiceSessions.practiceVariant,
    })
    .from(practiceSessions)
    .where(
      inArray(
        practiceSessions.id,
        qualifying.map((row) => row.id),
      ),
    );
  const persistedById = new Map(persisted.map((row) => [row.id, row]));
  const snapshotStillValid = qualifying.every((row) => {
    const saved = persistedById.get(row.id);
    if (!saved) return false;
    return (
      saved.outcome === row.outcome &&
      saved.occurredAt.getTime() === row.occurredAt.getTime() &&
      saved.practiceDay === row.practiceDay &&
      saved.curriculumLevel === evidence.fromLevel &&
      saved.practiceVariant === "primary"
    );
  });
  if (!snapshotStillValid) {
    if (open) {
      await tx
        .update(advancementProposals)
        .set({ status: "withdrawn", decidedAt: new Date() })
        .where(eq(advancementProposals.id, open.id));
    }
    return { proposal: null, created: false };
  }
  const sameSnapshot =
    open &&
    open.evidenceSessionIds.length === qualifying.length &&
    open.evidenceSessionIds.every((id, index) => id === qualifying[index]?.id) &&
    open.evidenceOutcomes.every((outcome, index) => outcome === qualifying[index]?.outcome);
  if (
    open &&
    open.fromLevel === evidence.fromLevel &&
    open.toLevel === evidence.toLevel &&
    sameSnapshot
  ) {
    return { proposal: toDto(open), created: false };
  }

  if (open) {
    await tx
      .update(advancementProposals)
      .set({ status: "withdrawn", decidedAt: new Date() })
      .where(eq(advancementProposals.id, open.id));
  }

  const [latestDecision] = await tx
    .select()
    .from(advancementProposals)
    .where(
      and(
        eq(advancementProposals.skillId, skillId),
        eq(advancementProposals.fromLevel, evidence.fromLevel),
        eq(advancementProposals.toLevel, evidence.toLevel),
        inArray(advancementProposals.status, [
          "stayed",
          "rejected",
          "regressed",
          "insufficient_evidence",
        ]),
      ),
    )
    .orderBy(desc(advancementProposals.evidenceLastSessionAt), desc(advancementProposals.createdAt))
    .limit(1);
  const latestDecisionCoversEvidence =
    latestDecision &&
    (latestDecision.evidenceLastSessionAt.getTime() > evidence.lastSessionAt.getTime() ||
      (latestDecision.evidenceLastSessionAt.getTime() === evidence.lastSessionAt.getTime() &&
        (evidence.lastSessionId === null ||
          latestDecision.evidenceSessionIds.includes(evidence.lastSessionId))));
  if (latestDecision && latestDecision.status !== "proposed" && latestDecisionCoversEvidence) {
    return { proposal: null, created: false };
  }

  const [created] = await tx
    .insert(advancementProposals)
    .values({
      skillId,
      fromLevel: evidence.fromLevel,
      toLevel: evidence.toLevel,
      ruleId: advancementRuleId,
      evidenceSessionCount: evidence.sessionCount,
      evidenceDayCount: evidence.dayCount,
      evidenceWindowDays: EVIDENCE_WINDOW_DAYS,
      evidenceLastSessionAt: evidence.lastSessionAt,
      evidenceSessionIds: evidenceRows.slice(0, ADVANCEMENT_MIN_SESSIONS).map((row) => row.id),
      evidenceOccurredAt: evidenceRows
        .slice(0, ADVANCEMENT_MIN_SESSIONS)
        .map((row) => row.occurredAt),
      evidencePracticeDays: evidenceRows
        .slice(0, ADVANCEMENT_MIN_SESSIONS)
        .map((row) => row.practiceDay),
      evidenceOutcomes: evidenceRows.slice(0, ADVANCEMENT_MIN_SESSIONS).map((row) => row.outcome),
    })
    .returning();
  if (!created) return { proposal: null, created: false };
  return { proposal: toDto(created), created: true };
}

/**
 * Default entry point for callers that are not already inside a transaction:
 * opens one so the advisory lock, the `FOR UPDATE` reads and the proposal write
 * share a single linearization point.
 */
export async function syncAdvancementProposal(
  skillId: string,
  evidence: AdvancementEvidence | null,
  evidenceRows: Array<{
    id: string;
    outcome: PracticeOutcome;
    occurredAt: Date;
    practiceDay: string;
  }>,
): Promise<{ proposal: AdvancementProposalDto | null; created: boolean }> {
  return db.transaction((tx) => syncAdvancementProposalInTx(tx, skillId, evidence, evidenceRows));
}

/**
 * Applies an owner's decision. Only `confirmed` and `regressed` change the
 * skill level, and only because the owner asked for it.
 */
export async function decideAdvancementProposal(
  dogId: string,
  proposalId: string,
  skillId: string,
  decision: AdvancementDecision,
): Promise<
  | { status: "decided"; proposal: AdvancementProposalDto }
  | { status: "stale" }
  | { status: "safety_suppressed" }
  | { status: "not_found" }
> {
  return db.transaction(async (tx) => {
    await lockDogSafety(tx, dogId);
    if (decideSafety(await loadSafetyInputs(dogId, new Date(), tx))) {
      return { status: "safety_suppressed" as const };
    }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${skillId}))`);
    const [skill] = await tx
      .select({ confidence: trainingSkills.confidence })
      .from(trainingSkills)
      .where(eq(trainingSkills.id, skillId))
      .for("update")
      .limit(1);
    if (!skill) return { status: "not_found" as const };

    const [proposal] = await tx
      .select()
      .from(advancementProposals)
      .where(
        and(eq(advancementProposals.id, proposalId), eq(advancementProposals.skillId, skillId)),
      )
      .for("update")
      .limit(1);
    if (!proposal) return { status: "not_found" as const };
    if (proposal.status === "withdrawn") return { status: "stale" as const };
    if (proposal.status !== "proposed") return { status: "not_found" as const };
    if (skill.confidence !== proposal.fromLevel) {
      await tx
        .update(advancementProposals)
        .set({ status: "withdrawn", decidedAt: new Date() })
        .where(eq(advancementProposals.id, proposal.id));
      return { status: "stale" as const };
    }

    const supporting = await tx
      .select({
        id: practiceSessions.id,
        outcome: practiceSessions.outcome,
        practiceDay: practiceSessions.practiceDay,
        curriculumLevel: practiceSessions.curriculumLevel,
        curriculumVersion: practiceSessions.curriculumVersion,
        practiceVariant: practiceSessions.practiceVariant,
      })
      .from(practiceSessions)
      .where(inArray(practiceSessions.id, proposal.evidenceSessionIds));
    const byId = new Map(supporting.map((row) => [row.id, row]));
    const evidenceStillValid = proposal.evidenceSessionIds.every((id, index) => {
      const row = byId.get(id);
      if (!row) return false;
      return (
        row.outcome === proposal.evidenceOutcomes[index] &&
        row.outcome === "went_well" &&
        row.practiceDay === proposal.evidencePracticeDays[index] &&
        row.curriculumLevel === proposal.fromLevel &&
        row.curriculumVersion === CURRICULUM_VERSION &&
        row.practiceVariant === "primary"
      );
    });
    if (!evidenceStillValid) {
      await tx
        .update(advancementProposals)
        .set({ status: "withdrawn", decidedAt: new Date() })
        .where(eq(advancementProposals.id, proposal.id));
      return { status: "stale" as const };
    }

    const [updated] = await tx
      .update(advancementProposals)
      .set({ status: decision, decidedAt: new Date() })
      .where(eq(advancementProposals.id, proposal.id))
      .returning();
    if (!updated) return { status: "not_found" as const };

    if (decision === "confirmed") {
      await setSkillLevel(skillId, clampLevel(updated.toLevel), tx);
    } else if (decision === "regressed") {
      await setSkillLevel(skillId, clampLevel(updated.fromLevel - 1), tx);
    }
    return { status: "decided" as const, proposal: toDto(updated) };
  });
}
```

- [ ] **Step 5: Run it, expect PASS**

Run: `pnpm --filter @turingcare/api exec vitest run src/lib/advancement.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
pnpm exec biome check --write apps/api/src/lib/advancement.ts apps/api/src/lib/advancement.test.ts apps/api/src/lib/skill-level.ts apps/api/src/routes/dogs.ts
pnpm --filter @turingcare/api exec tsc --noEmit
git add apps/api/src/lib/advancement.ts apps/api/src/lib/advancement.test.ts apps/api/src/lib/skill-level.ts apps/api/src/routes/dogs.ts
git commit -m "feat(api): owner-confirmed advancement proposals"
```

---

## Task 16: Suggestion orchestrator with audit persistence

**Files:**
- Create: `apps/api/src/lib/suggestion.ts`

This task has no unit test of its own — it is pure I/O composition over modules that are already unit-tested, and it is covered end-to-end by the route tests in Task 17.

Every path that produces a returned suggestion — the initial already-suppressed
path, the target-missing path and the exercise path — finishes inside
`evaluateSafetyWithLock(dogId, now, callback)` and persists its audit rows on
that callback's `tx`, so the final safety decision and the audit write share one
transaction and one advisory lock. `recordSuggestion` therefore takes an
executor instead of reaching for `db`.

Three rules follow from writing audit rows inside a live transaction:

1. **Never swallow a failed statement inside the transaction.** A failed
   statement has already aborted it, so a `catch` that continued would issue
   the next statement against a dead transaction. Audit statements are wrapped
   only to re-throw a recognizable `SuggestionAuditWriteError`.
2. **Keep the audit best-effort from outside.** The whole locked call is
   wrapped; on a `SuggestionAuditWriteError` the transaction rolls back and the
   already-built suggestion is returned with `suggestionId: null`. Everything
   else re-throws — a safety-input load failure must surface, because a
   suggestion is never shown when the safety decision is unknown.
3. **Telemetry runs after a successful commit** and can never abort the
   transaction; `emitAfterCommit` swallows its own failures.

Nothing inside the locked callback may open a second transaction or reach for
the global `db`: the pool connection is already checked out by the safety lock,
so a nested `db.transaction` would wait for a connection it can never get while
also writing outside the lock. Every decision-conditioned write therefore runs
on the callback's `tx` — which is why `build` receives `tx` and
`buildSuppressed(decision, tx)` calls `syncAdvancementProposalInTx(tx, focus.id, null, [])`
rather than the default `syncAdvancementProposal` wrapper.

Lock ordering is preserved: on the exercise path the default
`syncAdvancementProposal` wrapper takes the skill lock and commits its own
transaction *before* the safety lock is taken, and any suppression-driven
withdrawal runs *inside* the safety-locked callback on that callback's `tx`, so
the order is always dog safety → skill, never the reverse. Because the
withdrawal now shares the audit transaction, an audit-write rollback also rolls
the withdrawal back: the proposal stays open and the next request re-evaluates
it under the same lock, and no suppressed request can ever leave a proposal
confirmable, because confirmation itself re-checks safety under the same lock.

- [ ] **Step 1: Create `apps/api/src/lib/suggestion.ts`**

```ts
import type { SuggestionAction, SuggestionSafety, TrainingSuggestion } from "@turingcare/shared";
import { and, eq } from "drizzle-orm";
import { CURRICULUM_VERSION } from "../data/training-curriculum";
import { db } from "../db";
import {
  trainingGoals,
  trainingSkills,
  trainingSuggestionActions,
  trainingSuggestions,
  weeklyFocus,
} from "../db/schema";
import { recordEvent } from "../telemetry/record-event";
import {
  evaluateAdvancement,
  syncAdvancementProposal,
  syncAdvancementProposalInTx,
} from "./advancement";
import { resolveCurriculumTarget } from "./curriculum";
import { claimLegacyFocus } from "./focus";
import { loadRecentObservation } from "./observations";
import { isSuggestionSkipped, lockSuggestionAnchor } from "./practice-anchor";
import { EVIDENCE_WINDOW_DAYS, loadSkillEvidence } from "./practice-evidence";
import type { TransactionType } from "./safety-lock";
import { evaluateSafety, evaluateSafetyWithLock } from "./safety-policy";
import { selectSuggestionRule } from "./suggestion-rules";

const EMPTY_EVIDENCE = {
  windowDays: EVIDENCE_WINDOW_DAYS,
  sessionCount: 0,
  wentWellCount: 0,
  mixedCount: 0,
  tooHardCount: 0,
  distinctDayCount: 0,
  lastPracticeAt: null,
};

/**
 * Raised only for audit-table statements, so the fail-open wrapper can tell an
 * audit write failure apart from a safety-input load failure, which must surface.
 */
class SuggestionAuditWriteError extends Error {
  constructor(cause: unknown) {
    super("suggestion audit write failed", { cause });
    this.name = "SuggestionAuditWriteError";
  }
}

export function currentWeekKey(now: Date, timezoneOffsetMinutes: number): string {
  const local = new Date(now.getTime() - timezoneOffsetMinutes * 60_000);
  const day = local.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  local.setUTCDate(local.getUTCDate() - daysSinceMonday);
  return local.toISOString().slice(0, 10);
}

/** Gate 1 permits exactly one focus skill per dog/week. */
async function loadPrimaryFocusSkill(dogId: string, weekKey: string) {
  const [row] = await db
    .select({
      id: trainingSkills.id,
      name: trainingSkills.name,
      catalogSkillKey: trainingSkills.catalogSkillKey,
      level: trainingSkills.confidence,
      goalId: trainingSkills.goalId,
      goalName: trainingGoals.goal,
    })
    .from(weeklyFocus)
    .innerJoin(trainingSkills, eq(weeklyFocus.skillId, trainingSkills.id))
    .innerJoin(trainingGoals, eq(trainingSkills.goalId, trainingGoals.id))
    .where(and(eq(weeklyFocus.dogId, dogId), eq(weeklyFocus.weekStart, weekKey)))
    .limit(1);
  return row ?? null;
}

/**
 * Persists the suggestion for review and cohort analysis. Deduped to one row
 * per dog/skill/rule/level/type per owner-local day so repeated page loads do not
 * inflate the audit trail. Runs on the caller's executor — the transaction that
 * holds the safety lock — and never swallows a failed statement: a failure has
 * already aborted that transaction, so it is re-thrown for the caller to roll back.
 */
async function recordSuggestion(
  tx: TransactionType,
  input: {
    dogId: string;
    weekKey: string;
    auditDay: string;
    suggestion: TrainingSuggestion;
  },
): Promise<{ suggestionId: string | null; inserted: boolean }> {
  const { suggestion } = input;
  const dedupeKey = [
    input.dogId,
    input.weekKey,
    suggestion.skill?.id ?? "none",
    suggestion.type,
    suggestion.ruleId ?? "none",
    suggestion.primary?.level ?? 0,
    suggestion.safety?.ruleId ?? "no-safety-rule",
    suggestion.safety?.referral ?? "no-referral",
    CURRICULUM_VERSION,
    input.auditDay,
  ].join(":");

  try {
    const [row] = await tx
      .insert(trainingSuggestions)
      .values({
        dogId: input.dogId,
        skillId: suggestion.skill?.id ?? null,
        catalogSkillKey: suggestion.skill?.catalogSkillKey ?? null,
        weekStart: input.weekKey,
        curriculumVersion: CURRICULUM_VERSION,
        suggestionType: suggestion.type,
        ruleId: suggestion.ruleId,
        level: suggestion.primary?.level ?? null,
        fallbackLevel: suggestion.fallback?.level ?? null,
        fallbackDimension: suggestion.fallback?.reducedDimension ?? null,
        fallbackStrategy: suggestion.fallback?.easingStrategy ?? null,
        evidenceCategory: suggestion.evidenceCategory,
        suppressed: suggestion.safety !== null,
        safetyRuleId: suggestion.safety?.ruleId ?? null,
        dedupeKey,
      })
      .onConflictDoNothing({ target: trainingSuggestions.dedupeKey })
      .returning({ id: trainingSuggestions.id });
    if (row) return { suggestionId: row.id, inserted: true };

    const [existing] = await tx
      .select({ id: trainingSuggestions.id })
      .from(trainingSuggestions)
      .where(eq(trainingSuggestions.dedupeKey, dedupeKey))
      .limit(1);
    return { suggestionId: existing?.id ?? null, inserted: false };
  } catch (error) {
    throw new SuggestionAuditWriteError(error);
  }
}

/** Audit write plus the dismissal read, both on the locked transaction. */
async function persistSuggestionAudit(
  tx: TransactionType,
  input: {
    dogId: string;
    weekKey: string;
    auditDay: string;
    suggestion: TrainingSuggestion;
  },
): Promise<{ suggestionId: string | null; inserted: boolean; dismissed: boolean }> {
  const { suggestionId, inserted } = await recordSuggestion(tx, input);
  try {
    return {
      suggestionId,
      inserted,
      dismissed: suggestionId ? await isSuggestionSkipped(tx, suggestionId) : false,
    };
  } catch (error) {
    throw new SuggestionAuditWriteError(error);
  }
}

/** Side channel only: runs after the audit transaction commits and never throws. */
async function emitAfterCommit(userId: string, suggestion: TrainingSuggestion): Promise<void> {
  try {
    await recordEvent("training.suggestion_shown", {
      userId,
      props: {
        suggestionType: suggestion.type,
        ruleId: suggestion.ruleId ?? "none",
        level: suggestion.primary?.level ?? 0,
        suppressed: suggestion.safety !== null,
        curriculumVersion: CURRICULUM_VERSION,
      },
    });
    if (suggestion.safety) {
      await recordEvent("safety.suppression_shown", {
        userId,
        props: {
          safetyRuleId: suggestion.safety.ruleId,
          referral: suggestion.safety.referral,
        },
      });
    }
  } catch (error) {
    console.error("[suggestion] telemetry_failed", { error });
  }
}

/**
 * Takes the final safety decision and writes the audit rows in one transaction
 * holding the dog safety lock. Audit persistence is fail-open from the outside:
 * a recognized audit-write failure rolls the transaction back and the owner
 * still gets the built suggestion with `suggestionId: null`. Every other error —
 * including a safety-input load failure — surfaces.
 */
async function finalizeUnderSafetyLock(input: {
  userId: string;
  dogId: string;
  weekKey: string;
  auditDay: string;
  now: Date;
  build: (decision: SuggestionSafety | null, tx: TransactionType) => Promise<TrainingSuggestion>;
}): Promise<TrainingSuggestion> {
  // A plain `let` would be narrowed to `null` by control flow; the holder keeps
  // the value assigned inside the callback readable from `catch`.
  const state: { built: TrainingSuggestion | null } = { built: null };
  try {
    const { suggestion, inserted } = await evaluateSafetyWithLock(
      input.dogId,
      input.now,
      async (decision, tx) => {
        const built = await input.build(decision, tx);
        state.built = built;
        const audit = await persistSuggestionAudit(tx, {
          dogId: input.dogId,
          weekKey: input.weekKey,
          auditDay: input.auditDay,
          suggestion: built,
        });
        return {
          suggestion: {
            ...built,
            suggestionId: audit.suggestionId,
            dismissed: audit.dismissed,
          },
          inserted: audit.inserted,
        };
      },
    );
    // Committed: telemetry is safe here and `emitAfterCommit` never throws.
    if (inserted) await emitAfterCommit(input.userId, suggestion);
    return suggestion;
  } catch (error) {
    const built = state.built;
    if (!(error instanceof SuggestionAuditWriteError) || !built) throw error;
    // Audit is best-effort: never block the owner's suggestion on a write.
    console.error("[suggestion] audit_write_failed", {
      dogId: input.dogId,
      suggestionType: built.type,
      suppressed: built.safety !== null,
      error,
    });
    return { ...built, suggestionId: null, dismissed: false };
  }
}

export async function loadSuggestion(input: {
  userId: string;
  dogId: string;
  weekKey: string;
  timezoneOffsetMinutes: number;
  now?: Date;
}): Promise<TrainingSuggestion> {
  const now = input.now ?? new Date();
  const auditDay = new Date(now.getTime() - input.timezoneOffsetMinutes * 60_000)
    .toISOString()
    .slice(0, 10);
  await claimLegacyFocus(input.dogId, input.weekKey);
  const [focus, safety] = await Promise.all([
    loadPrimaryFocusSkill(input.dogId, input.weekKey),
    evaluateSafety(input.dogId, now),
  ]);

  const skill = focus
    ? {
        id: focus.id,
        name: focus.name,
        catalogSkillKey: focus.catalogSkillKey,
        level: focus.level,
        goalId: focus.goalId,
        goalName: focus.goalName,
      }
    : null;

  const base = {
    suggestionId: null,
    dismissed: false,
    curriculumVersion: CURRICULUM_VERSION,
    dogId: input.dogId,
    weekKey: input.weekKey,
    skill,
    primary: null,
    fallback: null,
    requestedDimensions: [],
    evidenceCategory: null,
    evidence: EMPTY_EVIDENCE,
    safety: null,
    advancementProposal: null,
  } satisfies Omit<TrainingSuggestion, "type" | "ruleId">;

  /**
   * Called from inside the safety-locked callback and runs on that callback's
   * transaction, so withdrawing an open proposal takes the skill lock *after*
   * the dog safety lock — never the reverse — and never opens a nested
   * transaction against the already-checked-out connection.
   */
  const buildSuppressed = async (
    decision: NonNullable<TrainingSuggestion["safety"]>,
    tx: TransactionType,
  ): Promise<TrainingSuggestion> => {
    if (focus) await syncAdvancementProposalInTx(tx, focus.id, null, []);
    return { ...base, type: "safety_suppressed", ruleId: null, safety: decision };
  };

  // Safety supersedes every suggestion: no exercise is returned at all.
  if (safety) {
    return finalizeUnderSafetyLock({
      userId: input.userId,
      dogId: input.dogId,
      weekKey: input.weekKey,
      auditDay,
      now,
      // Suppression is never downgraded inside one request: if the locked
      // re-read comes back clear, the unlocked decision still stands and the
      // next request produces an exercise.
      build: (decision, tx) => buildSuppressed(decision ?? safety, tx),
    });
  }

  const evidence = focus
    ? await loadSkillEvidence(focus.id, focus.level, now)
    : {
        summary: { ...EMPTY_EVIDENCE, recentOutcomes: [] },
        rows: [],
        advancementRows: [],
        latestMixedHadChallengingContext: false,
      };
  const observation = await loadRecentObservation(input.dogId, now);
  const lastWentWell = evidence.rows.find((row) => row.outcome === "went_well");

  const rule = selectSuggestionRule({
    now,
    hasFocusSkill: focus !== null,
    catalogSkillKey: focus?.catalogSkillKey ?? null,
    level: focus?.level ?? 1,
    recentOutcomes: evidence.summary.recentOutcomes,
    latestMixedHadChallengingContext:
      evidence.latestMixedHadChallengingContext,
    lastWentWellAt: lastWentWell?.occurredAt ?? null,
    observation,
  });

  const target =
    rule.effectiveLevel === null
      ? null
      : resolveCurriculumTarget(focus?.catalogSkillKey ?? null, rule.effectiveLevel);

  if (!target) {
    const unsupported: TrainingSuggestion = {
      ...base,
      type: rule.type === "exercise" ? "custom_skill_unsupported" : rule.type,
      ruleId: rule.type === "exercise" ? "custom_skill_unsupported" : rule.ruleId,
      evidence: {
        windowDays: evidence.summary.windowDays,
        sessionCount: evidence.summary.sessionCount,
        wentWellCount: evidence.summary.wentWellCount,
        mixedCount: evidence.summary.mixedCount,
        tooHardCount: evidence.summary.tooHardCount,
        distinctDayCount: evidence.summary.distinctDayCount,
        lastPracticeAt: evidence.summary.lastPracticeAt,
      },
    };
    return finalizeUnderSafetyLock({
      userId: input.userId,
      dogId: input.dogId,
      weekKey: input.weekKey,
      auditDay,
      now,
      build: async (decision, tx) => (decision ? buildSuppressed(decision, tx) : unsupported),
    });
  }

  // Uses the default wrapper on purpose: it runs before the safety lock is
  // taken and commits its own transaction, so the skill lock is never held
  // while waiting on the dog safety lock.
  const advancement = focus
    ? await syncAdvancementProposal(
        focus.id,
        evaluateAdvancement({
          ruleId: rule.ruleId,
          level: focus.level,
          outcomes: evidence.advancementRows,
        }),
        evidence.advancementRows,
      )
    : { proposal: null, created: false };
  const { proposal } = advancement;

  if (proposal && advancement.created) {
    await recordEvent("training.advancement_proposed", {
      userId: input.userId,
      props: {
        fromLevel: proposal.fromLevel,
        toLevel: proposal.toLevel,
        sessionCount: proposal.sessionCount,
        dayCount: proposal.dayCount,
      },
    });
  }

  const suggestion: TrainingSuggestion = {
    ...base,
    type: "exercise",
    ruleId: rule.ruleId,
    primary: target.primary,
    fallback: target.fallback,
    requestedDimensions: target.requestedDimensions,
    evidenceCategory: rule.evidenceCategory,
    evidence: {
      windowDays: evidence.summary.windowDays,
      sessionCount: evidence.summary.sessionCount,
      wentWellCount: evidence.summary.wentWellCount,
      mixedCount: evidence.summary.mixedCount,
      tooHardCount: evidence.summary.tooHardCount,
      distinctDayCount: evidence.summary.distinctDayCount,
      lastPracticeAt: evidence.summary.lastPracticeAt,
    },
    advancementProposal: proposal,
  };

  return finalizeUnderSafetyLock({
    userId: input.userId,
    dogId: input.dogId,
    weekKey: input.weekKey,
    auditDay,
    now,
    build: async (decision, tx) => (decision ? buildSuppressed(decision, tx) : suggestion),
  });
}

export async function recordSuggestionAction(input: {
  userId: string;
  dogId: string;
  suggestionId: string;
  action: SuggestionAction;
}): Promise<"recorded" | "not_found" | "dismissed"> {
  const result = await db.transaction(async (tx) => {
    await lockSuggestionAnchor(tx, input.suggestionId);
    const [owned] = await tx
      .select({ id: trainingSuggestions.id, ruleId: trainingSuggestions.ruleId })
      .from(trainingSuggestions)
      .where(
        and(
          eq(trainingSuggestions.id, input.suggestionId),
          eq(trainingSuggestions.dogId, input.dogId),
        ),
      )
      .limit(1);
    if (!owned) return { kind: "not_found" as const };
    if (
      input.action !== "skipped" &&
      (await isSuggestionSkipped(tx, input.suggestionId))
    ) {
      return { kind: "dismissed" as const };
    }
    const [inserted] = await tx
      .insert(trainingSuggestionActions)
      .values({ suggestionId: owned.id, action: input.action })
      .onConflictDoNothing({
        target: [
          trainingSuggestionActions.suggestionId,
          trainingSuggestionActions.action,
        ],
      })
      .returning({ id: trainingSuggestionActions.id });
    return { kind: "recorded" as const, inserted, ruleId: owned.ruleId };
  });
  if (result.kind !== "recorded") return result.kind;
  const { inserted, ruleId } = result;
  if (inserted) {
    await recordEvent("training.suggestion_action", {
      userId: input.userId,
      props: { action: input.action, ruleId: ruleId ?? "none" },
    });
  }
  return "recorded";
}
```

`TransactionType` comes from `../lib/safety-lock` (re-exported by
`./safety-policy`); `isSuggestionSkipped` and `lockSuggestionAnchor` come from
`./practice-anchor`. `syncAdvancementProposalInTx` is the transaction-aware
entry point added in Task 15; the plain `syncAdvancementProposal` wrapper is
used only on the pre-lock exercise path.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @turingcare/api exec tsc --noEmit`
Expected: PASS with no errors. If `satisfies Omit<TrainingSuggestion, "type" | "ruleId">` reports a mismatch, fix the offending field on the object rather than widening the type.

Also grep the finished file: `rg "db\.transaction|syncAdvancementProposal\(" apps/api/src/lib/suggestion.ts`
must show no `db.transaction` inside `loadSuggestion` and exactly one
`syncAdvancementProposal(` call — the pre-lock exercise path.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/suggestion.ts
git commit -m "feat(api): suggestion orchestrator with audit persistence"
```

---

## Task 17: Suggestion API endpoints

**Files:**
- Modify: `apps/api/src/routes/dogs.ts`
- Create: `apps/api/src/routes/suggestion.test.ts`

The endpoints go inside the existing `dogs.ts` chain rather than a new sub-app: `dogsApp` already carries the `requireUser` middleware and its RPC types, and mounting a second app at `/api/dogs` would run session lookup twice per request.

- [ ] **Step 1: Write the failing test** — create `apps/api/src/routes/suggestion.test.ts`:

```ts
import type { TrainingSuggestion } from "@turingcare/shared";
import { and, eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import {
  dogSafetySignals,
  trainingSuggestionActions,
  trainingSuggestions,
  weeklyFocus,
} from "../db/schema";
import { lockSuggestionAnchor } from "../lib/practice-anchor";
import { lockDogSafety } from "../lib/safety-lock";
import { currentWeekKey } from "../lib/suggestion";
import { type TestUser, createTestUser } from "../test-helpers";

const users: TestUser[] = [];
const WEEK_KEY = currentWeekKey(new Date(), 0);
const validDog = {
  name: "Rex",
  size: "medium",
  sex: "male",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

async function setup() {
  const testUser = await createTestUser();
  users.push(testUser);
  const headers = testUser.authHeaders;

  const dogRes = await app.request("/api/dogs", {
    method: "POST",
    headers,
    body: JSON.stringify(validDog),
  });
  const { dog } = (await dogRes.json()) as { dog: { id: string } };

  async function addCatalogSkill(catalogSkillKey: string) {
    const res = await app.request(`/api/dogs/${dog.id}/goals/from-template`, {
      method: "POST",
      headers,
      body: JSON.stringify({ templateKey: catalogSkillKey.split(".")[0] }),
    });
    const { skills } = (await res.json()) as {
      skills: Array<{ id: string; catalogSkillKey: string | null }>;
    };
    const skill = skills.find((row) => row.catalogSkillKey === catalogSkillKey);
    if (!skill) throw new Error(`expected ${catalogSkillKey}`);
    return skill.id;
  }

  async function addCustomSkill(name: string) {
    const goalRes = await app.request(`/api/dogs/${dog.id}/goals`, {
      method: "POST",
      headers,
      body: JSON.stringify({ goal: "Custom goal" }),
    });
    const { goal } = (await goalRes.json()) as { goal: { id: string } };
    const skillRes = await app.request(`/api/dogs/${dog.id}/goals/${goal.id}/skills`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, confidence: 1 }),
    });
    const { skill } = (await skillRes.json()) as { skill: { id: string } };
    return skill.id;
  }

  async function focus(skillId: string) {
    await app.request(`/api/dogs/${dog.id}/focus`, {
      method: "POST",
      headers,
      body: JSON.stringify({ skillId, weekKey: WEEK_KEY }),
    });
  }

  async function logSession(skillId: string, occurredAt: string, body: Record<string, unknown>) {
    const variant = body.variant === "fallback" ? "fallback" : "primary";
    const evidence = Object.fromEntries(
      Object.entries(body).filter(([key]) => key !== "variant"),
    );
    const shown = await getSuggestion();
    const practicedTarget =
      shown.suggestionId &&
      (variant === "fallback" ? shown.fallback !== null : shown.primary !== null)
        ? { suggestionId: shown.suggestionId, variant }
        : undefined;
    const res = await app.request(`/api/dogs/${dog.id}/skills/${skillId}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        occurredAt,
        timezoneOffsetMinutes: 0,
        ...evidence,
        practicedTarget,
      }),
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { session: { id: string } };
  }

  async function getSuggestion() {
    const res = await app.request(
      `/api/dogs/${dog.id}/suggestion?weekKey=${WEEK_KEY}&timezoneOffsetMinutes=0`,
      {
      headers,
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suggestion: TrainingSuggestion };
    return body.suggestion;
  }

  return {
    headers,
    dogId: dog.id,
    addCatalogSkill,
    addCustomSkill,
    focus,
    logSession,
    getSuggestion,
  };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

afterEach(async () => {
  for (let user = users.pop(); user; user = users.pop()) await user.cleanup();
});

describe("GET /api/dogs/:id/suggestion", () => {
  it("asks the owner to pick a focus skill when the week is empty", async () => {
    const ctx = await setup();
    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("needs_focus_skill");
    expect(suggestion.primary).toBeNull();
  });

  it("claims legacy focus before concurrent first suggestion and focus reads", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await db.insert(weeklyFocus).values({
      dogId: ctx.dogId,
      skillId,
      weekStart: null,
      position: 0,
    });
    const [suggestion, focusResponse] = await Promise.all([
      ctx.getSuggestion(),
      app.request(
        `/api/dogs/${ctx.dogId}/focus?weekKey=${WEEK_KEY}&timezoneOffsetMinutes=0&weekEndTimezoneOffsetMinutes=0`,
        { headers: ctx.headers },
      ),
    ]);
    expect(suggestion.type).toBe("exercise");
    expect(focusResponse.status).toBe(200);
  });

  it("suggests the curriculum level at cold start with an easier fallback", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("exercise");
    expect(suggestion.ruleId).toBe("cold_start_curriculum_level");
    expect(suggestion.evidenceCategory).toBe("curriculum_only");
    expect(suggestion.primary?.level).toBe(1);
    expect(suggestion.primary?.exercise.length).toBeGreaterThan(20);
    expect(suggestion.fallback?.sameLevelEasing).toBe(true);
    expect(suggestion.fallback?.reducedDimension).toBe("cue_support");
    expect(suggestion.requestedDimensions).toContain("environment");
    expect(suggestion.suggestionId).not.toBeNull();
  });

  it("marks a custom skill as unsupported", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCustomSkill("Skateboarding");
    await ctx.focus(skillId);

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("custom_skill_unsupported");
    expect(suggestion.primary).toBeNull();
    expect(suggestion.skill?.name).toBe("Skateboarding");
  });

  it("steps back after repeated too-hard outcomes", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.stay");
    await ctx.focus(skillId);
    await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/level`, {
      method: "PUT",
      headers: ctx.headers,
      body: JSON.stringify({ level: 3 }),
    });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "too_hard" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "too_hard" });

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.ruleId).toBe("step_back_after_too_hard");
    expect(suggestion.primary?.level).toBe(2);
    expect(suggestion.fallback?.level).toBe(2);
    expect(suggestion.fallback?.easingStrategy).toBe("decrease_owner_distance");
    expect(suggestion.evidence.tooHardCount).toBe(2);
  });

  it("uses fallback outcomes for difficulty but not advancement", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.stay");
    await ctx.focus(skillId);
    await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/level`, {
      method: "PUT",
      headers: ctx.headers,
      body: JSON.stringify({ level: 3 }),
    });
    await ctx.logSession(skillId, daysAgo(2), {
      outcome: "too_hard",
      variant: "fallback",
    });
    await ctx.logSession(skillId, daysAgo(1), {
      outcome: "too_hard",
      variant: "fallback",
    });
    const suggestion = await ctx.getSuggestion();
    expect(suggestion.ruleId).toBe("step_back_after_too_hard");
    expect(suggestion.primary?.level).toBe(2);
    expect(suggestion.advancementProposal).toBeNull();
  });

  it("returns to the confirmed level after successful eased practice", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.stay");
    await ctx.focus(skillId);
    await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/level`, {
      method: "PUT",
      headers: ctx.headers,
      body: JSON.stringify({ level: 3 }),
    });
    await ctx.logSession(skillId, daysAgo(4), { outcome: "too_hard" });
    await ctx.logSession(skillId, daysAgo(3), { outcome: "too_hard" });
    expect((await ctx.getSuggestion()).primary?.level).toBe(2);

    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });

    const recovered = await ctx.getSuggestion();
    expect(recovered.ruleId).toBe("maintain_current_level");
    expect(recovered.primary?.level).toBe(3);
    expect(recovered.evidence.sessionCount).toBe(4);
  });

  it("eases after mixed practice in a challenging recorded context", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.stay");
    await ctx.focus(skillId);
    await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/level`, {
      method: "PUT",
      headers: ctx.headers,
      body: JSON.stringify({ level: 3 }),
    });
    await ctx.logSession(skillId, daysAgo(1), {
      outcome: "mixed",
      distraction: "strong",
    });

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.ruleId).toBe("ease_after_hard_context");
    expect(suggestion.primary?.level).toBe(2);
  });

  it("does not reuse an older challenging context after newer success", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.stay");
    await ctx.focus(skillId);
    await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/level`, {
      method: "PUT",
      headers: ctx.headers,
      body: JSON.stringify({ level: 3 }),
    });
    await ctx.logSession(skillId, daysAgo(2), {
      outcome: "mixed",
      distraction: "strong",
    });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.ruleId).toBe("maintain_current_level");
    expect(suggestion.primary?.level).toBe(3);
  });

  it("does not advance from three successful fallback sessions", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), {
      outcome: "went_well",
      variant: "fallback",
    });
    await ctx.logSession(skillId, daysAgo(2), {
      outcome: "went_well",
      variant: "fallback",
    });
    await ctx.logSession(skillId, daysAgo(1), {
      outcome: "went_well",
      variant: "fallback",
    });

    expect((await ctx.getSuggestion()).advancementProposal).toBeNull();
  });

  it("proposes advancement after three good sessions across two days", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.ruleId).toBe("maintain_current_level");
    expect(suggestion.advancementProposal?.status).toBe("proposed");
    expect(suggestion.advancementProposal?.fromLevel).toBe(1);
    expect(suggestion.advancementProposal?.toLevel).toBe(2);
  });

  it("suppresses everything after an explicit safety signal and refers out", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.recall");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(1), {
      outcome: "too_hard",
      safetySignal: "aggression_or_bite_risk",
    });

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("safety_suppressed");
    expect(suggestion.primary).toBeNull();
    expect(suggestion.fallback).toBeNull();
    expect(suggestion.safety).toEqual({
      suppressed: true,
      ruleId: "reported_aggression_or_bite_risk",
      referral: "veterinary_behaviorist",
    });
  });

  it("still accepts practice and journal records while suggestions are suppressed", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.recall");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(1), {
      safetySignal: "aggression_or_bite_risk",
    });
    expect((await ctx.getSuggestion()).type).toBe("safety_suppressed");

    const practice = await ctx.logSession(skillId, daysAgo(0), {
      outcome: "mixed",
    });
    expect(practice.session.id).toBeTruthy();
    const journal = await app.request(`/api/dogs/${ctx.dogId}/journal`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ kind: "moment", note: "Observed calmly after the event." }),
    });
    expect(journal.status).toBe(201);
  });

  it("rechecks safety under the writer lock before returning an exercise", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.recall");
    await ctx.focus(skillId);
    let markReady: (() => void) | undefined;
    let release: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const safetyWrite = db.transaction(async (tx) => {
      await lockDogSafety(tx, ctx.dogId);
      await tx.insert(dogSafetySignals).values({
        dogId: ctx.dogId,
        type: "aggression_or_bite_risk",
        source: "practice_session",
        reportedAt: new Date(),
      });
      markReady?.();
      await hold;
    });
    await ready;
    const suggestionPromise = ctx.getSuggestion();
    await new Promise((resolve) => setTimeout(resolve, 25));
    release?.();
    await safetyWrite;

    const suggestion = await suggestionPromise;
    expect(suggestion.type).toBe("safety_suppressed");
    expect(suggestion.primary).toBeNull();
  });

  it("suppresses before the first exercise when a behavior concern reports risk", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await app.request(`/api/dogs/${ctx.dogId}/concerns`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        concern: "Snapped near the food bowl",
        severity: "moderate",
        safetySignal: "aggression_or_bite_risk",
      }),
    });

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("safety_suppressed");
    expect(suggestion.primary).toBeNull();
    expect(suggestion.safety?.ruleId).toBe("reported_aggression_or_bite_risk");
  });

  it("suppresses from a severe concern without a selected specific signal", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await app.request(`/api/dogs/${ctx.dogId}/concerns`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ concern: "Severe behavior change", severity: "severe" }),
    });
    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("safety_suppressed");
    expect(suggestion.safety?.ruleId).toBe("severe_recorded_concern");
    expect(suggestion.primary).toBeNull();
  });

  it("suppresses from sustained high-intensity worsening observations", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    for (const occurredAt of [daysAgo(3), daysAgo(2)]) {
      const res = await app.request(`/api/dogs/${ctx.dogId}/journal`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          kind: "moment",
          note: "Structured high-intensity fixture",
          occurredAt,
          intensity: 4,
        }),
      });
      expect(res.status).toBe(201);
    }
    for (const occurredAt of [daysAgo(2), daysAgo(1)]) {
      const res = await app.request(`/api/dogs/${ctx.dogId}/journal`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          kind: "daily_checkin",
          note: "Structured worsening fixture",
          occurredAt,
          trend: "harder",
        }),
      });
      expect(res.status).toBe(201);
    }
    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("safety_suppressed");
    expect(suggestion.safety?.ruleId).toBe("sustained_worsening_intensity");
    expect(suggestion.safety?.referral).toBe("credentialed_trainer");
  });

  it("ignores future journal entries in safety and suggestion rules", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    for (let index = 0; index < 2; index += 1) {
      const occurredAt = new Date(Date.now() + (index + 1) * 24 * 60 * 60_000).toISOString();
      await app.request(`/api/dogs/${ctx.dogId}/journal`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          kind: "moment",
          note: "Future intensity fixture",
          occurredAt,
          intensity: 5,
        }),
      });
      await app.request(`/api/dogs/${ctx.dogId}/journal`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          kind: "daily_checkin",
          note: "Future trend fixture",
          occurredAt,
          trend: "harder",
        }),
      });
    }
    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("exercise");
    expect(suggestion.ruleId).toBe("cold_start_curriculum_level");
  });

  it("returns 400 for a week key that is not a Monday", async () => {
    const ctx = await setup();
    const res = await app.request(
      `/api/dogs/${ctx.dogId}/suggestion?weekKey=2026-08-11&timezoneOffsetMinutes=0`,
      {
      headers: ctx.headers,
      },
    );
    expect(res.status).toBe(400);
  });

  it("does not recalculate a historical week with current evidence", async () => {
    const ctx = await setup();
    const current = currentWeekKey(new Date(), 0);
    const previous = new Date(`${current}T00:00:00.000Z`);
    previous.setUTCDate(previous.getUTCDate() - 7);
    const previousWeekKey = previous.toISOString().slice(0, 10);
    const res = await app.request(
      `/api/dogs/${ctx.dogId}/suggestion?weekKey=${previousWeekKey}&timezoneOffsetMinutes=0`,
      { headers: ctx.headers },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "historical_suggestion_unavailable" });
  });

  it("returns 404 for another owner's dog", async () => {
    const mine = await setup();
    const theirs = await setup();
    const res = await app.request(
      `/api/dogs/${theirs.dogId}/suggestion?weekKey=${WEEK_KEY}&timezoneOffsetMinutes=0`,
      { headers: mine.headers },
    );
    expect(res.status).toBe(404);
  });

  it("does not create a second audit row for concurrent identical views", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const [first, second] = await Promise.all([ctx.getSuggestion(), ctx.getSuggestion()]);
    expect(second.suggestionId).toBe(first.suggestionId);
    const rows = await db
      .select({ id: trainingSuggestions.id })
      .from(trainingSuggestions)
      .where(eq(trainingSuggestions.dogId, ctx.dogId));
    expect(rows).toHaveLength(1);
  });

  it("retains enough controlled fields to reconstruct a fallback after skill deletion", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const suggestion = await ctx.getSuggestion();
    await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}`, {
      method: "DELETE",
      headers: ctx.headers,
    });
    const [audit] = await db
      .select({
        skillId: trainingSuggestions.skillId,
        catalogSkillKey: trainingSuggestions.catalogSkillKey,
        fallbackDimension: trainingSuggestions.fallbackDimension,
        fallbackStrategy: trainingSuggestions.fallbackStrategy,
      })
      .from(trainingSuggestions)
      .where(eq(trainingSuggestions.id, suggestion.suggestionId ?? ""));
    expect(audit).toEqual({
      skillId: null,
      catalogSkillKey: "basic-manners.sit",
      fallbackDimension: "cue_support",
      fallbackStrategy: "add_cue_help",
    });
  });

  it("keeps distinct same-day audit rows when the safety rule changes", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(0), {
      outcome: "too_hard",
      safetySignal: "aggression_or_bite_risk",
    });
    expect((await ctx.getSuggestion()).safety?.ruleId).toBe(
      "reported_aggression_or_bite_risk",
    );
    await ctx.logSession(skillId, daysAgo(0), {
      outcome: "too_hard",
      safetySignal: "injury_or_pain",
    });
    expect((await ctx.getSuggestion()).safety?.ruleId).toBe("reported_injury_or_pain");
    const rows = await db
      .select({ id: trainingSuggestions.id })
      .from(trainingSuggestions)
      .where(
        and(
          eq(trainingSuggestions.dogId, ctx.dogId),
          eq(trainingSuggestions.suppressed, true),
        ),
      );
    expect(rows).toHaveLength(2);
  });

  it("serializes concurrent advancement proposal creation", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });

    const [first, second] = await Promise.all([ctx.getSuggestion(), ctx.getSuggestion()]);
    expect(first.advancementProposal?.id).toBe(second.advancementProposal?.id);
    expect(first.advancementProposal?.status).toBe("proposed");
  });

  it("withdraws an open proposal when its qualifying evidence changes", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    const latest = await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    expect((await ctx.getSuggestion()).advancementProposal).not.toBeNull();
    await app.request(
      `/api/dogs/${ctx.dogId}/skills/${skillId}/sessions/${latest.session.id}/evidence`,
      {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ outcome: "mixed" }),
      },
    );
    expect((await ctx.getSuggestion()).advancementProposal).toBeNull();
  });
});

describe("suggestion actions and advancement decisions", () => {
  it("records an owner action on a suggestion", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const suggestion = await ctx.getSuggestion();

    const res = await app.request(
      `/api/dogs/${ctx.dogId}/suggestions/${suggestion.suggestionId}/actions`,
      { method: "POST", headers: ctx.headers, body: JSON.stringify({ action: "started" }) },
    );
    expect(res.status).toBe(201);
  });

  it("records the same action idempotently", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const suggestion = await ctx.getSuggestion();
    if (!suggestion.suggestionId) throw new Error("expected audited suggestion");
    const url = `/api/dogs/${ctx.dogId}/suggestions/${suggestion.suggestionId}/actions`;
    for (let index = 0; index < 2; index += 1) {
      const res = await app.request(url, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ action: "started" }),
      });
      expect(res.status).toBe(201);
    }
    const rows = await db
      .select({ id: trainingSuggestionActions.id })
      .from(trainingSuggestionActions)
      .where(eq(trainingSuggestionActions.suggestionId, suggestion.suggestionId));
    expect(rows).toHaveLength(1);
  });

  it("keeps a skipped suggestion hidden on reload", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const suggestion = await ctx.getSuggestion();
    if (!suggestion.suggestionId) throw new Error("expected audited suggestion");
    await app.request(
      `/api/dogs/${ctx.dogId}/suggestions/${suggestion.suggestionId}/actions`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ action: "skipped" }),
      },
    );
    expect((await ctx.getSuggestion()).dismissed).toBe(true);
  });

  it("rejects later actions after a suggestion is skipped", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const suggestion = await ctx.getSuggestion();
    const suggestionId = suggestion.suggestionId;
    if (!suggestionId) throw new Error("expected audited suggestion");
    const url = `/api/dogs/${ctx.dogId}/suggestions/${suggestionId}/actions`;
    await app.request(url, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ action: "skipped" }),
    });

    for (const action of ["started", "rated_useful", "rated_not_useful"] as const) {
      const res = await app.request(url, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ action }),
      });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "suggestion_dismissed" });
    }
  });

  it("rejects a skipped suggestion as a practice anchor", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const suggestion = await ctx.getSuggestion();
    if (!suggestion.suggestionId) throw new Error("expected audited suggestion");
    await app.request(
      `/api/dogs/${ctx.dogId}/suggestions/${suggestion.suggestionId}/actions`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ action: "skipped" }),
      },
    );
    const res = await app.request(
      `/api/dogs/${ctx.dogId}/skills/${skillId}/sessions`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          occurredAt: new Date().toISOString(),
          timezoneOffsetMinutes: 0,
          outcome: "went_well",
          practicedTarget: {
            suggestionId: suggestion.suggestionId,
            variant: "primary",
          },
        }),
      },
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(
      expect.objectContaining({ anchorRejected: "invalid_anchor" }),
    );
  });

  it("rejects an anchor that waits behind a concurrent skip", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const suggestion = await ctx.getSuggestion();
    const suggestionId = suggestion.suggestionId;
    if (!suggestionId) throw new Error("expected audited suggestion");

    let releaseSkip: () => void = () => {};
    const release = new Promise<void>((resolve) => {
      releaseSkip = resolve;
    });
    let markSkipLocked: () => void = () => {};
    const skipLocked = new Promise<void>((resolve) => {
      markSkipLocked = resolve;
    });
    const skipTx = db.transaction(async (tx) => {
      await lockSuggestionAnchor(tx, suggestionId);
      await tx.insert(trainingSuggestionActions).values({
        suggestionId,
        action: "skipped",
      });
      markSkipLocked();
      await release;
    });
    await skipLocked;

    const practice = app.request(
      `/api/dogs/${ctx.dogId}/skills/${skillId}/sessions`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          occurredAt: new Date().toISOString(),
          timezoneOffsetMinutes: 0,
          outcome: "went_well",
          practicedTarget: { suggestionId, variant: "primary" },
        }),
      },
    );
    releaseSkip();
    await skipTx;

    expect(await (await practice).json()).toEqual(
      expect.objectContaining({ anchorRejected: "invalid_anchor" }),
    );
  });

  it("rejects an action on another owner's suggestion", async () => {
    const mine = await setup();
    const theirs = await setup();
    const skillId = await theirs.addCatalogSkill("basic-manners.sit");
    await theirs.focus(skillId);
    const suggestion = await theirs.getSuggestion();

    const res = await app.request(
      `/api/dogs/${mine.dogId}/suggestions/${suggestion.suggestionId}/actions`,
      { method: "POST", headers: mine.headers, body: JSON.stringify({ action: "started" }) },
    );
    expect(res.status).toBe(404);
  });

  it("rejects an advancement decision through another owner's dog", async () => {
    const mine = await setup();
    const theirs = await setup();
    const skillId = await theirs.addCatalogSkill("basic-manners.sit");
    await theirs.focus(skillId);
    await theirs.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await theirs.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await theirs.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const suggestion = await theirs.getSuggestion();
    const proposalId = suggestion.advancementProposal?.id;
    expect(proposalId).toBeDefined();
    const res = await app.request(
      `/api/dogs/${mine.dogId}/advancement-proposals/${proposalId}/decision`,
      {
        method: "POST",
        headers: mine.headers,
        body: JSON.stringify({ decision: "confirmed" }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("raises the level only when the owner confirms the proposal", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const suggestion = await ctx.getSuggestion();
    const proposalId = suggestion.advancementProposal?.id;
    expect(proposalId).toBeDefined();

    const before = await ctx.getSuggestion();
    expect(before.skill?.level).toBe(1);

    const res = await app.request(
      `/api/dogs/${ctx.dogId}/advancement-proposals/${proposalId}/decision`,
      { method: "POST", headers: ctx.headers, body: JSON.stringify({ decision: "confirmed" }) },
    );
    expect(res.status).toBe(200);
    const { proposal } = (await res.json()) as { proposal: { status: string } };
    expect(proposal.status).toBe("confirmed");

    const after = await ctx.getSuggestion();
    expect(after.skill?.level).toBe(2);
  });

  it("does not recreate an old-level proposal during a concurrent confirmation", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const suggestion = await ctx.getSuggestion();
    const proposalId = suggestion.advancementProposal?.id;
    expect(proposalId).toBeDefined();

    const [, decision] = await Promise.all([
      ctx.getSuggestion(),
      app.request(
        `/api/dogs/${ctx.dogId}/advancement-proposals/${proposalId}/decision`,
        {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({ decision: "confirmed" }),
        },
      ),
    ]);
    expect(decision.status).toBe(200);
    const after = await ctx.getSuggestion();
    expect(after.skill?.level).toBe(2);
    expect(after.advancementProposal).toBeNull();
  });

  it("keeps the level when the owner says they stayed", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const suggestion = await ctx.getSuggestion();

    const res = await app.request(
      `/api/dogs/${ctx.dogId}/advancement-proposals/${suggestion.advancementProposal?.id}/decision`,
      { method: "POST", headers: ctx.headers, body: JSON.stringify({ decision: "stayed" }) },
    );
    expect(res.status).toBe(200);
    const after = await ctx.getSuggestion();
    expect(after.skill?.level).toBe(1);
    expect(after.advancementProposal).toBeNull();

    // The same evidence must not immediately recreate a dismissed proposal.
    // New supporting evidence permits the system to ask again.
    await ctx.logSession(skillId, daysAgo(0), { outcome: "went_well" });
    const afterNewEvidence = await ctx.getSuggestion();
    expect(afterNewEvidence.advancementProposal?.status).toBe("proposed");
  });

  it("returns 404 when deciding a proposal twice", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const suggestion = await ctx.getSuggestion();
    const url = `/api/dogs/${ctx.dogId}/advancement-proposals/${suggestion.advancementProposal?.id}/decision`;

    const first = await app.request(url, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ decision: "rejected" }),
    });
    expect(first.status).toBe(200);
    const second = await app.request(url, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ decision: "confirmed" }),
    });
    expect(second.status).toBe(404);
  });

  it("returns 409 instead of applying a stale proposal over a manual level change", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const suggestion = await ctx.getSuggestion();
    await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/level`, {
      method: "PUT",
      headers: ctx.headers,
      body: JSON.stringify({ level: 3 }),
    });

    const res = await app.request(
      `/api/dogs/${ctx.dogId}/advancement-proposals/${suggestion.advancementProposal?.id}/decision`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ decision: "confirmed" }),
      },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "stale_proposal" });
    const after = await ctx.getSuggestion();
    expect(after.skill?.level).toBe(3);
  });

  it("serializes a manual level write behind the skill decision lock", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    let releaseLock: () => void = () => {};
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let markLocked: () => void = () => {};
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${skillId}))`);
      markLocked();
      await release;
    });
    await locked;

    let completed = false;
    const manualWrite = app
      .request(`/api/dogs/${ctx.dogId}/skills/${skillId}/level`, {
        method: "PUT",
        headers: ctx.headers,
        body: JSON.stringify({ level: 3 }),
      })
      .then((response) => {
        completed = true;
        return response;
      });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(completed).toBe(false);
    releaseLock();
    await holder;
    expect((await manualWrite).status).toBe(200);
  });

  it("returns 409 when supporting practice was deleted before confirmation", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    const latest = await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const suggestion = await ctx.getSuggestion();
    await app.request(
      `/api/dogs/${ctx.dogId}/skills/${skillId}/sessions/${latest.session.id}`,
      { method: "DELETE", headers: ctx.headers },
    );
    const res = await app.request(
      `/api/dogs/${ctx.dogId}/advancement-proposals/${suggestion.advancementProposal?.id}/decision`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ decision: "confirmed" }),
      },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "stale_proposal" });
  });

  it("cannot confirm advancement while safety suppression is active", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const proposal = (await ctx.getSuggestion()).advancementProposal;
    await ctx.logSession(skillId, daysAgo(0), {
      safetySignal: "aggression_or_bite_risk",
    });

    const res = await app.request(
      `/api/dogs/${ctx.dogId}/advancement-proposals/${proposal?.id}/decision`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ decision: "confirmed" }),
      },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "safety_suppressed" });
    expect((await ctx.getSuggestion()).advancementProposal).toBeNull();
  });

  it("waits for a concurrent safety report before deciding advancement", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const proposal = (await ctx.getSuggestion()).advancementProposal;
    if (!proposal) throw new Error("expected proposal");

    let markReady: (() => void) | undefined;
    let release: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const safetyWrite = db.transaction(async (tx) => {
      await lockDogSafety(tx, ctx.dogId);
      await tx.insert(dogSafetySignals).values({
        dogId: ctx.dogId,
        type: "aggression_or_bite_risk",
        source: "practice_session",
        reportedAt: new Date(),
      });
      markReady?.();
      await hold;
    });
    await ready;
    const decision = app.request(
      `/api/dogs/${ctx.dogId}/advancement-proposals/${proposal.id}/decision`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ decision: "confirmed" }),
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    release?.();
    await safetyWrite;

    const res = await decision;
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "safety_suppressed" });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run:
```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api exec vitest run src/routes/suggestion.test.ts
```
Expected: FAIL — every request 404s because `/suggestion`, `/suggestions/:id/actions` and `/advancement-proposals/:id/decision` do not exist.

- [ ] **Step 3: Add the routes** — in `apps/api/src/routes/dogs.ts`, insert after the focus routes:

```ts
  .get("/:id/suggestion", zValidator("query", suggestionQuerySchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const { weekKey, timezoneOffsetMinutes } = c.req.valid("query");
    if (weekKey !== currentWeekKey(new Date(), timezoneOffsetMinutes)) {
      return c.json({ error: "historical_suggestion_unavailable" } as const, 409);
    }
    const suggestion = await loadSuggestion({
      userId: c.get("userId"),
      dogId: dog.id,
      weekKey,
      timezoneOffsetMinutes,
    });
    return c.json({ suggestion });
  })
  .post(
    "/:id/suggestions/:suggestionId/actions",
    zValidator("json", suggestionActionSchema),
    async (c) => {
      const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
      if (!dog) return c.json({ error: "not_found" } as const, 404);
      const result = await recordSuggestionAction({
        userId: c.get("userId"),
        dogId: dog.id,
        suggestionId: c.req.param("suggestionId"),
        action: c.req.valid("json").action,
      });
      if (result === "not_found") {
        return c.json({ error: "not_found" } as const, 404);
      }
      if (result === "dismissed") {
        return c.json({ error: "suggestion_dismissed" } as const, 409);
      }
      return c.json({ ok: true } as const, 201);
    },
  )
  .post(
    "/:id/advancement-proposals/:proposalId/decision",
    zValidator("json", advancementDecisionSchema),
    async (c) => {
      const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
      if (!dog) return c.json({ error: "not_found" } as const, 404);
      const [owned] = await db
        .select({ id: advancementProposals.id, skillId: advancementProposals.skillId })
        .from(advancementProposals)
        .innerJoin(trainingSkills, eq(advancementProposals.skillId, trainingSkills.id))
        .innerJoin(trainingGoals, eq(trainingSkills.goalId, trainingGoals.id))
        .where(
          and(
            eq(advancementProposals.id, c.req.param("proposalId")),
            eq(trainingGoals.dogId, dog.id),
          ),
        )
        .limit(1);
      if (!owned) return c.json({ error: "not_found" } as const, 404);

      const { decision } = c.req.valid("json");
      const result = await decideAdvancementProposal(
        dog.id,
        owned.id,
        owned.skillId,
        decision,
      );
      if (result.status === "not_found") {
        return c.json({ error: "not_found" } as const, 404);
      }
      if (result.status === "stale") {
        return c.json({ error: "stale_proposal" } as const, 409);
      }
      if (result.status === "safety_suppressed") {
        return c.json({ error: "safety_suppressed" } as const, 409);
      }
      const { proposal } = result;
      await recordEvent("training.advancement_decided", {
        userId: c.get("userId"),
        props: {
          decision,
          fromLevel: proposal.fromLevel,
          toLevel: proposal.toLevel,
        },
      });
      return c.json({ proposal });
    },
  )
```

Add to the imports in `apps/api/src/routes/dogs.ts`: `advancementDecisionSchema`,
`suggestionActionSchema` and `suggestionQuerySchema` from
`@turingcare/shared`; `advancementProposals` from `../db/schema`;
`decideAdvancementProposal` from `../lib/advancement`; and
`currentWeekKey`, `loadSuggestion`, and `recordSuggestionAction` from
`../lib/suggestion`.

- [ ] **Step 4: Run it, expect PASS**

Run: `pnpm --filter @turingcare/api exec vitest run src/routes/suggestion.test.ts`
Expected: PASS — all suggestion route tests, including recovery, suppression,
fallback-only advancement, authorization, audit dedupe, and concurrency.

- [ ] **Step 5: Run the whole API suite, expect PASS**

Run: `pnpm --filter @turingcare/api test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm exec biome check --write apps/api/src/routes/dogs.ts apps/api/src/routes/suggestion.test.ts
pnpm --filter @turingcare/api exec tsc --noEmit
git add apps/api/src/routes/dogs.ts apps/api/src/routes/suggestion.test.ts
git commit -m "feat(api): suggestion, action and advancement decision endpoints"
```

---

## Task 18: English and Spanish interface strings

**Files:**
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/es.ts`

`apps/web/src/i18n/i18n.test.tsx` already asserts that `en` and `es` have identical key sets and that no Spanish value is left equal to its English value, so this task is verified by that existing test.

- [ ] **Step 1: Add three sections to `apps/web/src/i18n/en.ts`** — insert after the existing `progress` section, keeping the object's trailing structure intact:

```ts
  suggestion: {
    title: "This week's suggestion",
    forSkill: "Focus skill: {skill}",
    levelLabel: "Step {level} of 5",
    primaryLabel: "Try this",
    fallbackLabel: "If that looks like too much",
    fallbackSameLevel: "Same exercise",
    reasonColdStart: "Starting at step {level} because there's no practice recorded for this exact exercise yet.",
    reasonStepBack: "Stepping back to {level} because recent practice was too hard.",
    reasonEase: "Easing to step {level} because your last check-in said things felt harder.",
    reasonContext:
      "Easing to step {level} because the latest mixed practice included a strong distraction or busy outdoor setting.",
    reasonHold: "Holding at step {level} because recent practice was mixed.",
    reasonMaintain: "Staying at step {level} because recent practice is going well.",
    evidence: "{sessions} recorded sessions on {days} days in the last {window} days.",
    noEvidence: "No practice recorded for this exact exercise yet.",
    needsFocusTitle: "Pick a focus skill",
    needsFocusBody: "Choose one skill for this week and a suggestion will appear here.",
    needsFocusCta: "Choose focus",
    customTitle: "Custom skill",
    customBody:
      "Suggestions cover the reviewed skill library. This skill was written by you, so keep practising in your own way and log how it goes.",
    actionStarted: "We did this",
    actionSkipped: "Skip today",
    changeFocus: "Choose a different focus",
    skippedTitle: "Skipped for today",
    skippedBody: "This suggestion will stay hidden until tomorrow.",
    rateUseful: "Helpful",
    rateNotUseful: "Not helpful",
    actionThanks: "Thanks — noted.",
    actionFailed: "Couldn't save that.",
    loadError: "Couldn't load this week's suggestion.",
    advTitle: "Ready for the next step?",
    advBody: "{skill} looks steady at step {from}. Try step {to}?",
    advEvidence: "Based on {sessions} good sessions on {days} different days.",
    advConfirm: "Yes, move up",
    advStayed: "Stay at this step",
    advRejected: "Not yet",
    advRegressed: "Go back a step",
    advInsufficient: "That doesn't match what I saw",
    advSaved: "Updated.",
    advFailed: "Couldn't save your answer.",
  },
  practice: {
    outcomeQuestion: "How did it go?",
    outcomeWentWell: "Went well",
    outcomeMixed: "Mixed",
    outcomeTooHard: "Too hard",
    outcomeSkip: "Skip",
    saveEvidence: "Save response",
    practicedVersion: "Which version did you practise?",
    practicedPrimary: "Main exercise",
    practicedFallback: "Easier fallback",
    outcomeSaved: "Thanks — logged.",
    outcomeFailed: "Couldn't save that.",
    contextTitle: "Practice details",
    contextOptional: "optional",
    dimCueSupport: "help",
    dimEnvironment: "busyness",
    dimDistance: "distance",
    dimDuration: "duration",
    dimDistraction: "distraction",
    easeAddCueHelp: "give more help, such as a lure or hand signal",
    easeQuieterEnvironment: "move somewhere quieter",
    easeIncreaseTriggerDistance: "move farther away from the trigger",
    easeDecreaseOwnerDistance: "practice closer to your dog",
    easeShortenDuration: "make the practice interval shorter",
    easeReduceDistractions: "remove one distraction",
    cueSupportLabel: "How much help did you give?",
    cueFoodLure: "Food lure",
    cueHandSignal: "Hand signal",
    cueVerbalCue: "Spoken cue only",
    cueNoExtraHelp: "No extra help",
    environmentLabel: "Where were you?",
    envHomeQuiet: "Quiet room at home",
    envHomeBusy: "Busy room at home",
    envYard: "Yard or balcony",
    envQuietOutdoor: "Quiet street or park",
    envBusyOutdoor: "Busy street or park",
    distanceLabel: "How far apart were you?",
    distAtSide: "Right beside you",
    distFewSteps: "A few steps away",
    distAcrossRoom: "Across the room",
    distAcrossYard: "Across the yard",
    distFarAway: "Far away",
    durationLabel: "How long did they hold it?",
    durUnder5: "Under 5 seconds",
    durAbout15: "About 15 seconds",
    durAbout30: "About 30 seconds",
    durOneToTwo: "1–2 minutes",
    durFiveToFifteen: "5–15 minutes",
    durAboutThirtyMinutes: "About 30 minutes",
    durOneToTwoHours: "1–2 hours",
    durHalfDayPlus: "Half a day or more",
    distractionLabel: "What else was going on?",
    distractionNone: "Nothing much",
    distractionMild: "A little",
    distractionModerate: "Quite a lot",
    distractionStrong: "A great deal",
    safetyLabel: "Did anything unsafe happen?",
    safetyNone: "No",
    safetyConfirm: "I confirm this safety event happened and understand training suggestions may pause.",
    futureSession: "Practice time cannot be more than five minutes in the future.",
    safetyAggression: "Growling, snapping or biting",
    safetyInjury: "Signs of pain or injury",
    safetyFear: "Panic or extreme fear",
  },
  safety: {
    title: "Let's pause training suggestions",
    bodyInjury:
      "You recorded signs of pain or injury. Training suggestions are paused for 90 days from that report because pain can change behavior. Contact your veterinarian for guidance, and record a new report if signs continue.",
    bodyAggression:
      "You recorded growling, snapping or biting. Training exercises are paused. This needs an in-person professional, not an app.",
    bodyFear:
      "You recorded panic or extreme fear. Training exercises are paused, because practising through panic makes fear worse.",
    bodySevereConcern:
      "You marked a behavior concern as severe. Training exercises are paused until a professional has seen your dog.",
    bodyWorsening:
      "Your recent entries show things getting harder rather than easier. Training exercises are paused so a professional can look at the whole picture.",
    referralVeterinarian:
      "Please book a veterinary appointment and describe what you saw. Ask specifically about pain, injury and anything medical that could change behavior.",
    referralBehaviorist:
      "Please contact a veterinary behaviorist. They are veterinarians with extra training in behavior and can rule out medical causes as well as build a safe plan.",
    referralTrainer:
      "Please work with a credentialed, reward-based trainer in person. They can watch your dog and adjust in real time.",
    directoryTitle: "Where to look",
    directoryDacvb: "DACVB — veterinary behaviorists",
    directoryCcpdt: "CCPDT — certified trainers",
    directoryIaabc: "IAABC — behavior consultants",
    directoryFearFree: "Fear Free — certified professionals",
    keepLogging: "Keep logging what you see. Your records help whoever you talk to.",
  },
```

- [ ] **Step 2: Add the matching Spanish sections to `apps/web/src/i18n/es.ts`**

```ts
  suggestion: {
    title: "Sugerencia de esta semana",
    forSkill: "Habilidad en foco: {skill}",
    levelLabel: "Paso {level} de 5",
    primaryLabel: "Prueba esto",
    fallbackLabel: "Si parece demasiado",
    fallbackSameLevel: "El mismo ejercicio",
    reasonColdStart: "Empezamos en el paso {level} porque aún no hay práctica registrada para este ejercicio exacto.",
    reasonStepBack: "Bajamos al paso {level} porque la práctica reciente resultó muy difícil.",
    reasonEase:
      "Bajamos al paso {level} porque tu último registro diario dijo que estuvo más difícil.",
    reasonContext:
      "Bajamos al paso {level} porque la práctica mixta más reciente incluyó una distracción fuerte o un entorno exterior concurrido.",
    reasonHold: "Nos quedamos en el paso {level} porque la práctica reciente fue irregular.",
    reasonMaintain: "Seguimos en el paso {level} porque la práctica reciente va bien.",
    evidence: "{sessions} sesiones registradas en {days} días durante los últimos {window} días.",
    noEvidence: "Todavía no hay práctica registrada para este ejercicio exacto.",
    needsFocusTitle: "Elige una habilidad en foco",
    needsFocusBody: "Elige una habilidad para esta semana y aquí aparecerá una sugerencia.",
    needsFocusCta: "Elegir foco",
    customTitle: "Habilidad personalizada",
    customBody:
      "Las sugerencias cubren la biblioteca de habilidades revisada. Esta habilidad la escribiste tú, así que sigue practicando a tu manera y registra cómo va.",
    actionStarted: "Lo hicimos",
    actionSkipped: "Hoy no",
    changeFocus: "Elegir otro enfoque",
    skippedTitle: "Omitida por hoy",
    skippedBody: "Esta sugerencia permanecerá oculta hasta mañana.",
    rateUseful: "Útil",
    rateNotUseful: "Poco útil",
    actionThanks: "Gracias, quedó anotado.",
    actionFailed: "No se pudo guardar.",
    loadError: "No se pudo cargar la sugerencia de esta semana.",
    advTitle: "¿Listos para el siguiente paso?",
    advBody: "{skill} se ve firme en el paso {from}. ¿Prueban el paso {to}?",
    advEvidence: "Basado en {sessions} sesiones buenas en {days} días distintos.",
    advConfirm: "Sí, subamos",
    advStayed: "Quedarnos en este paso",
    advRejected: "Todavía no",
    advRegressed: "Volver un paso atrás",
    advInsufficient: "Eso no coincide con lo que vi",
    advSaved: "Actualizado.",
    advFailed: "No se pudo guardar tu respuesta.",
  },
  practice: {
    outcomeQuestion: "¿Cómo les fue?",
    outcomeWentWell: "Salió bien",
    outcomeMixed: "Irregular",
    outcomeTooHard: "Muy difícil",
    outcomeSkip: "Omitir",
    saveEvidence: "Guardar respuesta",
    practicedVersion: "¿Qué versión practicaron?",
    practicedPrimary: "Ejercicio principal",
    practicedFallback: "Alternativa más fácil",
    outcomeSaved: "Gracias, quedó registrado.",
    outcomeFailed: "No se pudo guardar.",
    contextTitle: "Detalles de la práctica",
    contextOptional: "opcional",
    dimCueSupport: "ayuda",
    dimEnvironment: "movimiento alrededor",
    dimDistance: "distancia",
    dimDuration: "duración",
    dimDistraction: "distracción",
    easeAddCueHelp: "da más ayuda, por ejemplo un señuelo o una seña con la mano",
    easeQuieterEnvironment: "cambien a un lugar más tranquilo",
    easeIncreaseTriggerDistance: "aléjense más del desencadenante",
    easeDecreaseOwnerDistance: "practica más cerca de tu perro",
    easeShortenDuration: "acorta el intervalo de práctica",
    easeReduceDistractions: "quita una distracción",
    cueSupportLabel: "¿Cuánta ayuda diste?",
    cueFoodLure: "Señuelo con comida",
    cueHandSignal: "Seña con la mano",
    cueVerbalCue: "Solo la palabra",
    cueNoExtraHelp: "Sin ayuda extra",
    environmentLabel: "¿Dónde estaban?",
    envHomeQuiet: "Cuarto tranquilo en casa",
    envHomeBusy: "Cuarto con movimiento en casa",
    envYard: "Patio o balcón",
    envQuietOutdoor: "Calle o parque tranquilo",
    envBusyOutdoor: "Calle o parque concurrido",
    distanceLabel: "¿A qué distancia estaban?",
    distAtSide: "Justo a tu lado",
    distFewSteps: "A unos pasos",
    distAcrossRoom: "Al otro lado del cuarto",
    distAcrossYard: "Al otro lado del patio",
    distFarAway: "Muy lejos",
    durationLabel: "¿Cuánto lo sostuvo?",
    durUnder5: "Menos de 5 segundos",
    durAbout15: "Unos 15 segundos",
    durAbout30: "Unos 30 segundos",
    durOneToTwo: "1 a 2 minutos",
    durFiveToFifteen: "5 a 15 minutos",
    durAboutThirtyMinutes: "Unos 30 minutos",
    durOneToTwoHours: "1 a 2 horas",
    durHalfDayPlus: "Medio día o más",
    distractionLabel: "¿Qué más pasaba alrededor?",
    distractionNone: "Casi nada",
    distractionMild: "Un poco",
    distractionModerate: "Bastante",
    distractionStrong: "Muchísimo",
    safetyLabel: "¿Pasó algo inseguro?",
    safetyNone: "No pasó nada",
    safetyConfirm: "Confirmo que este evento de seguridad ocurrió y entiendo que las sugerencias de entrenamiento pueden pausarse.",
    futureSession: "La hora de práctica no puede estar más de cinco minutos en el futuro.",
    safetyAggression: "Gruñidos, tarascadas o mordidas",
    safetyInjury: "Señales de dolor o lesión",
    safetyFear: "Pánico o miedo extremo",
  },
  safety: {
    title: "Pausemos las sugerencias de entrenamiento",
    bodyInjury:
      "Registraste señales de dolor o lesión. Las sugerencias de entrenamiento quedan en pausa durante 90 días desde ese reporte porque el dolor puede cambiar la conducta. Contacta a tu veterinario para recibir orientación y registra un nuevo reporte si las señales continúan.",
    bodyAggression:
      "Registraste gruñidos, tarascadas o mordidas. Los ejercicios quedan en pausa. Esto necesita a un profesional en persona, no una app.",
    bodyFear:
      "Registraste pánico o miedo extremo. Los ejercicios quedan en pausa, porque practicar en pánico empeora el miedo.",
    bodySevereConcern:
      "Marcaste una preocupación de conducta como grave. Los ejercicios quedan en pausa hasta que un profesional vea a tu perro.",
    bodyWorsening:
      "Tus registros recientes muestran que las cosas van a peor y no a mejor. Los ejercicios quedan en pausa para que un profesional vea el panorama completo.",
    referralVeterinarian:
      "Agenda una consulta veterinaria y describe lo que viste. Pregunta específicamente por dolor, lesiones y cualquier causa médica que pueda cambiar la conducta.",
    referralBehaviorist:
      "Contacta a un veterinario especialista en conducta. Son veterinarios con formación adicional en conducta y pueden descartar causas médicas además de armar un plan seguro.",
    referralTrainer:
      "Trabaja en persona con un entrenador acreditado que use refuerzo positivo. Puede observar a tu perro y ajustar en el momento.",
    directoryTitle: "Dónde buscar",
    directoryDacvb: "DACVB — veterinarios especialistas en conducta",
    directoryCcpdt: "CCPDT — entrenadores certificados",
    directoryIaabc: "IAABC — consultores de conducta",
    directoryFearFree: "Fear Free — profesionales certificados",
    keepLogging: "Sigue registrando lo que ves. Tus notas ayudan a quien consultes.",
  },
```

- [ ] **Step 3: Run the i18n test, expect PASS**

Run: `pnpm --filter @turingcare/web exec vitest run src/i18n/i18n.test.tsx`
Expected: PASS. A failure here means either a key exists in one locale only, or a Spanish value was left identical to English — fix the offending key rather than the test.

- [ ] **Step 4: Commit**

```bash
pnpm exec biome check --write apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
pnpm --filter @turingcare/web exec tsc --noEmit
git add apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): suggestion, practice and safety interface strings"
```

---

## Task 19: Web option maps

**Files:**
- Create: `apps/web/src/lib/practice-options.ts`

- [ ] **Step 1: Create `apps/web/src/lib/practice-options.ts`**

```ts
import type { MessageKey } from "@/i18n/types";
import type {
  CueSupport,
  EasingStrategy,
  PracticeDimension,
  PracticeDistance,
  PracticeDistraction,
  PracticeDurationBand,
  PracticeEnvironment,
  PracticeOutcome,
  ReferralCategory,
  SafetyRule,
  SafetySignalType,
  SuggestionRule,
} from "@turingcare/shared";

export const OUTCOME_KEYS: Record<PracticeOutcome, MessageKey> = {
  went_well: "practice.outcomeWentWell",
  mixed: "practice.outcomeMixed",
  too_hard: "practice.outcomeTooHard",
};

/** Reviewed, direction-aware clause for every fallback. */
export const EASING_STRATEGY_KEYS: Record<EasingStrategy, MessageKey> = {
  add_cue_help: "practice.easeAddCueHelp",
  use_quieter_environment: "practice.easeQuieterEnvironment",
  increase_trigger_distance: "practice.easeIncreaseTriggerDistance",
  decrease_owner_distance: "practice.easeDecreaseOwnerDistance",
  shorten_duration: "practice.easeShortenDuration",
  reduce_distractions: "practice.easeReduceDistractions",
};

type OptionGroup = {
  /** The field name on PracticeEvidenceInput this group writes to. */
  field: "cueSupport" | "environment" | "distance" | "durationBand" | "distraction";
  labelKey: MessageKey;
  options: { value: string; labelKey: MessageKey }[];
};

export const DIMENSION_CONFIG: Record<PracticeDimension, OptionGroup> = {
  cue_support: {
    field: "cueSupport",
    labelKey: "practice.cueSupportLabel",
    options: [
      { value: "food_lure" satisfies CueSupport, labelKey: "practice.cueFoodLure" },
      { value: "hand_signal" satisfies CueSupport, labelKey: "practice.cueHandSignal" },
      { value: "verbal_cue" satisfies CueSupport, labelKey: "practice.cueVerbalCue" },
      { value: "no_extra_help" satisfies CueSupport, labelKey: "practice.cueNoExtraHelp" },
    ],
  },
  environment: {
    field: "environment",
    labelKey: "practice.environmentLabel",
    options: [
      { value: "home_quiet" satisfies PracticeEnvironment, labelKey: "practice.envHomeQuiet" },
      { value: "home_busy" satisfies PracticeEnvironment, labelKey: "practice.envHomeBusy" },
      { value: "yard" satisfies PracticeEnvironment, labelKey: "practice.envYard" },
      {
        value: "quiet_outdoor" satisfies PracticeEnvironment,
        labelKey: "practice.envQuietOutdoor",
      },
      { value: "busy_outdoor" satisfies PracticeEnvironment, labelKey: "practice.envBusyOutdoor" },
    ],
  },
  distance: {
    field: "distance",
    labelKey: "practice.distanceLabel",
    options: [
      { value: "at_side" satisfies PracticeDistance, labelKey: "practice.distAtSide" },
      { value: "few_steps" satisfies PracticeDistance, labelKey: "practice.distFewSteps" },
      { value: "across_room" satisfies PracticeDistance, labelKey: "practice.distAcrossRoom" },
      { value: "across_yard" satisfies PracticeDistance, labelKey: "practice.distAcrossYard" },
      { value: "far_away" satisfies PracticeDistance, labelKey: "practice.distFarAway" },
    ],
  },
  duration: {
    field: "durationBand",
    labelKey: "practice.durationLabel",
    options: [
      { value: "under_5_seconds" satisfies PracticeDurationBand, labelKey: "practice.durUnder5" },
      {
        value: "about_15_seconds" satisfies PracticeDurationBand,
        labelKey: "practice.durAbout15",
      },
      {
        value: "about_30_seconds" satisfies PracticeDurationBand,
        labelKey: "practice.durAbout30",
      },
      {
        value: "one_to_two_minutes" satisfies PracticeDurationBand,
        labelKey: "practice.durOneToTwo",
      },
      {
        value: "five_to_fifteen_minutes" satisfies PracticeDurationBand,
        labelKey: "practice.durFiveToFifteen",
      },
      {
        value: "about_30_minutes" satisfies PracticeDurationBand,
        labelKey: "practice.durAboutThirtyMinutes",
      },
      {
        value: "one_to_two_hours" satisfies PracticeDurationBand,
        labelKey: "practice.durOneToTwoHours",
      },
      {
        value: "half_day_or_more" satisfies PracticeDurationBand,
        labelKey: "practice.durHalfDayPlus",
      },
    ],
  },
  distraction: {
    field: "distraction",
    labelKey: "practice.distractionLabel",
    options: [
      { value: "none" satisfies PracticeDistraction, labelKey: "practice.distractionNone" },
      { value: "mild" satisfies PracticeDistraction, labelKey: "practice.distractionMild" },
      {
        value: "moderate" satisfies PracticeDistraction,
        labelKey: "practice.distractionModerate",
      },
      { value: "strong" satisfies PracticeDistraction, labelKey: "practice.distractionStrong" },
    ],
  },
};

export const SAFETY_SIGNAL_KEYS: Record<SafetySignalType, MessageKey> = {
  aggression_or_bite_risk: "practice.safetyAggression",
  injury_or_pain: "practice.safetyInjury",
  severe_fear_or_panic: "practice.safetyFear",
};

/** Server rule identifiers map to localized explanations here, not on the API. */
export const RULE_REASON_KEYS: Record<SuggestionRule, MessageKey> = {
  needs_focus_skill: "suggestion.needsFocusBody",
  custom_skill_unsupported: "suggestion.customBody",
  cold_start_curriculum_level: "suggestion.reasonColdStart",
  step_back_after_too_hard: "suggestion.reasonStepBack",
  ease_after_harder_checkin: "suggestion.reasonEase",
  ease_after_hard_context: "suggestion.reasonContext",
  hold_after_mixed: "suggestion.reasonHold",
  maintain_current_level: "suggestion.reasonMaintain",
};

export const SAFETY_BODY_KEYS: Record<SafetyRule, MessageKey> = {
  reported_injury_or_pain: "safety.bodyInjury",
  reported_aggression_or_bite_risk: "safety.bodyAggression",
  reported_severe_fear: "safety.bodyFear",
  severe_recorded_concern: "safety.bodySevereConcern",
  sustained_worsening_intensity: "safety.bodyWorsening",
};

export const REFERRAL_KEYS: Record<ReferralCategory, MessageKey> = {
  veterinarian: "safety.referralVeterinarian",
  veterinary_behaviorist: "safety.referralBehaviorist",
  credentialed_trainer: "safety.referralTrainer",
};

export const REFERRAL_DIRECTORIES: {
  href: string;
  labelKey: MessageKey;
  referrals: ReferralCategory[];
}[] = [
  {
    href: "https://www.dacvb.org/search/custom.asp?id=4709",
    labelKey: "safety.directoryDacvb",
    referrals: ["veterinary_behaviorist"],
  },
  {
    href: "https://www.ccpdt.org/dog-owners/certified-dog-trainer-directory/",
    labelKey: "safety.directoryCcpdt",
    referrals: ["credentialed_trainer"],
  },
  {
    href: "https://iaabc.org/consultants",
    labelKey: "safety.directoryIaabc",
    referrals: ["credentialed_trainer"],
  },
  {
    href: "https://fearfreepets.com/fear-free-directory/",
    labelKey: "safety.directoryFearFree",
    referrals: ["credentialed_trainer"],
  },
];
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit`
Expected: PASS. Any error here means an i18n key in Task 18 is misspelled — fix the key, not the type.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/practice-options.ts
git commit -m "feat(web): typed option maps for practice evidence and suggestions"
```

---

## Task 20: Web suggestion hooks

**Files:**
- Create: `apps/web/src/lib/suggestion.ts`
- Modify: `apps/web/src/lib/progress.ts`

- [ ] **Step 1: Create `apps/web/src/lib/suggestion.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdvancementDecision,
  SuggestionAction,
  TrainingSuggestion,
} from "@turingcare/shared";
import { api } from "./api";
import { suggestionKey } from "./suggestion-key";
import { weekKeyOf } from "./week";

export { suggestionKey } from "./suggestion-key";

const dogsApi = api.api.dogs[":id"];

export function useSuggestion(
  dogId: string,
  weekKey: string,
  timezoneOffsetMinutes: number,
) {
  return useQuery({
    queryKey: suggestionKey(dogId, weekKey),
    enabled: !!dogId && weekKey === weekKeyOf(new Date()),
    queryFn: async (): Promise<TrainingSuggestion> => {
      const res = await dogsApi.suggestion.$get({
        param: { id: dogId },
        query: { weekKey, timezoneOffsetMinutes: String(timezoneOffsetMinutes) },
      });
      if (!res.ok) throw new Error("load_failed");
      // The RPC client infers the JSON shape structurally; the shared type is the
      // contract both sides are built against.
      return (await res.json()).suggestion as TrainingSuggestion;
    },
  });
}

export function useSuggestionAction(dogId: string, weekKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { suggestionId: string; action: SuggestionAction }) => {
      const res = await dogsApi.suggestions[":suggestionId"].actions.$post({
        param: { id: dogId, suggestionId: args.suggestionId },
        json: { action: args.action },
      });
      if (!res.ok) throw new Error("action_failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: suggestionKey(dogId, weekKey) }),
  });
}

export function useAdvancementDecision(dogId: string, weekKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { proposalId: string; decision: AdvancementDecision }) => {
      const res = await dogsApi["advancement-proposals"][":proposalId"].decision.$post({
        param: { id: dogId, proposalId: args.proposalId },
        json: { decision: args.decision },
      });
      if (!res.ok) throw new Error("decision_failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: suggestionKey(dogId, weekKey) });
      qc.invalidateQueries({ queryKey: ["progress", dogId] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}
```

- [ ] **Step 2: Add the evidence mutation** — append to `apps/web/src/lib/progress.ts`:

```ts
export function useSetSessionEvidence(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      skillId: string;
      sessionId: string;
      body: PracticeEvidenceInput;
    }) => {
      const res = await dogSkills[":skillId"].sessions[":sessionId"].evidence.$patch({
        param: { id: dogId, skillId: args.skillId, sessionId: args.sessionId },
        json: args.body,
      });
      if (!res.ok) throw new Error("evidence_failed");
      return (await res.json()).session;
    },
    onSuccess: () => invalidateProgress(qc, dogId),
  });
}
```

Add `PracticeEvidenceInput` to the existing `@turingcare/shared` type import at the top of that file.

- [ ] **Step 3: Preserve the API error code for session-form UX**

In the existing `useLogSession` mutation, replace the generic failed-response
branch with:

```ts
      if (!res.ok) {
        const failed = await res.json();
        throw new Error("error" in failed ? failed.error : "save_failed");
      }
      return (await res.json()).session;
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit`
Expected: PASS. If the RPC path segments do not resolve, confirm Task 17's routes are mounted on `dogsApp` — the client types come straight from `AppType`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/suggestion.ts apps/web/src/lib/progress.ts
git commit -m "feat(web): suggestion, action and evidence hooks"
```

---

## Task 21: Suggestion, safety and advancement components

**Files:**
- Create: `apps/web/src/components/training/safety-notice.tsx`
- Create: `apps/web/src/components/training/advancement-proposal-card.tsx`
- Create: `apps/web/src/components/training/suggestion-card.tsx`
- Create: `apps/web/src/components/training/suggestion-card.test.tsx`

- [ ] **Step 1: Write the failing test** — create `apps/web/src/components/training/suggestion-card.test.tsx`:

```tsx
import { LocaleProvider } from "@/i18n";
import type { TrainingSuggestion } from "@turingcare/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SuggestionCard } from "./suggestion-card";

const baseSuggestion: TrainingSuggestion = {
  suggestionId: "sug-1",
  dismissed: false,
  type: "exercise",
  ruleId: "cold_start_curriculum_level",
  curriculumVersion: "2026-08-11",
  dogId: "d1",
  weekKey: "2026-08-10",
  skill: {
    id: "s1",
    name: "Sit",
    catalogSkillKey: "basic-manners.sit",
    level: 1,
    goalId: "g1",
    goalName: "Basic manners",
  },
  primary: { level: 1, exercise: "Lure into a sit in a quiet room.", dimension: "cue_support" },
  fallback: {
    level: 1,
    exercise: "Lure into a sit in a quiet room.",
    reducedDimension: "cue_support",
    sameLevelEasing: true,
    easingStrategy: "add_cue_help",
  },
  requestedDimensions: ["cue_support", "environment", "distraction"],
  evidenceCategory: "curriculum_only",
  evidence: {
    windowDays: 21,
    sessionCount: 0,
    wentWellCount: 0,
    mixedCount: 0,
    tooHardCount: 0,
    distinctDayCount: 0,
    lastPracticeAt: null,
  },
  safety: null,
  advancementProposal: null,
};

function renderCard(suggestion: TrainingSuggestion, onAction = vi.fn(), onDecision = vi.fn()) {
  render(
    <LocaleProvider>
      <SuggestionCard
        suggestion={suggestion}
        onAction={onAction}
        onDecision={onDecision}
        onPickFocus={vi.fn()}
      />
    </LocaleProvider>,
  );
  return { onAction, onDecision };
}

describe("SuggestionCard", () => {
  it("shows the primary exercise, the fallback and the reason", () => {
    renderCard(baseSuggestion);
    expect(screen.getAllByText("Lure into a sit in a quiet room.")).toHaveLength(2);
    expect(screen.getByText("If that looks like too much")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Starting at step 1 because there's no practice recorded for this exact exercise yet.",
      ),
    ).toBeInTheDocument();
  });

  it("records an owner action", () => {
    const { onAction } = renderCard(baseSuggestion);
    fireEvent.click(screen.getByText("We did this"));
    expect(onAction).toHaveBeenCalledWith("started");
  });

  it("lets the owner replace an ordinary suggestion by changing focus", () => {
    const onPickFocus = vi.fn();
    render(
      <LocaleProvider>
        <SuggestionCard
          suggestion={baseSuggestion}
          onAction={vi.fn()}
          onDecision={vi.fn()}
          onPickFocus={onPickFocus}
        />
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByText("Choose a different focus"));
    expect(onPickFocus).toHaveBeenCalled();
  });

  it("hides a suggestion after the owner skips it", () => {
    renderCard({ ...baseSuggestion, dismissed: true });
    expect(screen.getByText("Skipped for today")).toBeInTheDocument();
    expect(screen.queryByText("Lure into a sit in a quiet room.")).not.toBeInTheDocument();
  });

  it("suppresses exercises and shows referral guidance when safety fires", () => {
    renderCard({
      ...baseSuggestion,
      type: "safety_suppressed",
      ruleId: null,
      primary: null,
      fallback: null,
      safety: {
        suppressed: true,
        ruleId: "reported_aggression_or_bite_risk",
        referral: "veterinary_behaviorist",
      },
    });
    expect(screen.getByText("Let's pause training suggestions")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveAccessibleName(
      "Let's pause training suggestions",
    );
    expect(screen.queryByText("Lure into a sit in a quiet room.")).not.toBeInTheDocument();
    expect(screen.queryByText("We did this")).not.toBeInTheDocument();
    expect(screen.getByText("DACVB — veterinary behaviorists")).toBeInTheDocument();
    expect(screen.queryByText("CCPDT — certified trainers")).not.toBeInTheDocument();
  });

  it("does not show trainer directories for an injury referral", () => {
    renderCard({
      ...baseSuggestion,
      type: "safety_suppressed",
      ruleId: null,
      primary: null,
      fallback: null,
      safety: {
        suppressed: true,
        ruleId: "reported_injury_or_pain",
        referral: "veterinarian",
      },
    });
    expect(screen.queryByText("Where to look")).not.toBeInTheDocument();
    expect(screen.queryByText("CCPDT — certified trainers")).not.toBeInTheDocument();
  });

  it("explains that custom skills are not covered", () => {
    renderCard({
      ...baseSuggestion,
      type: "custom_skill_unsupported",
      ruleId: "custom_skill_unsupported",
      primary: null,
      fallback: null,
      evidenceCategory: null,
    });
    expect(screen.getByText("Custom skill")).toBeInTheDocument();
    expect(screen.queryByText("We did this")).not.toBeInTheDocument();
  });

  it("prompts for a focus skill when the week is empty", () => {
    renderCard({
      ...baseSuggestion,
      type: "needs_focus_skill",
      ruleId: "needs_focus_skill",
      skill: null,
      primary: null,
      fallback: null,
      evidenceCategory: null,
    });
    expect(screen.getByText("Pick a focus skill")).toBeInTheDocument();
    expect(screen.getByText("Choose focus")).toBeInTheDocument();
  });

  it("asks the owner to confirm an advancement proposal", () => {
    const { onDecision } = renderCard({
      ...baseSuggestion,
      ruleId: "maintain_current_level",
      advancementProposal: {
        id: "p1",
        skillId: "s1",
        fromLevel: 1,
        toLevel: 2,
        ruleId: "recent_success_at_level",
        status: "proposed",
        sessionCount: 3,
        dayCount: 3,
        windowDays: 21,
        supportingSessions: [
          {
            id: "ps1",
            occurredAt: "2026-08-11T09:00:00.000Z",
            practiceDay: "2026-08-11",
            outcome: "went_well",
          },
          {
            id: "ps2",
            occurredAt: "2026-08-12T09:00:00.000Z",
            practiceDay: "2026-08-12",
            outcome: "went_well",
          },
          {
            id: "ps3",
            occurredAt: "2026-08-13T09:00:00.000Z",
            practiceDay: "2026-08-13",
            outcome: "went_well",
          },
        ],
        createdAt: "2026-08-13T00:00:00.000Z",
        decidedAt: null,
      },
    });
    expect(screen.getByText("Ready for the next step?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Yes, move up"));
    expect(onDecision).toHaveBeenCalledWith("p1", "confirmed");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/training/suggestion-card.test.tsx`
Expected: FAIL — `Failed to resolve import "./suggestion-card"`.

- [ ] **Step 3: Create `apps/web/src/components/training/safety-notice.tsx`**

```tsx
import { useI18n } from "@/i18n";
import { REFERRAL_DIRECTORIES, REFERRAL_KEYS, SAFETY_BODY_KEYS } from "@/lib/practice-options";
import type { SuggestionSafety } from "@turingcare/shared";

/**
 * Deliberately has no dismiss control: suppression must not be something an
 * owner can click away to get exercises back.
 */
export function SafetyNotice({ safety }: { safety: SuggestionSafety }) {
  const { t } = useI18n();
  const directories = REFERRAL_DIRECTORIES.filter((entry) =>
    entry.referrals.includes(safety.referral),
  );
  return (
    <section
      className="space-y-3 rounded border border-copper bg-cream p-4"
      role="alert"
      aria-labelledby="safety-notice-title"
    >
      <h2 id="safety-notice-title" className="font-semibold text-slate">
        {t("safety.title")}
      </h2>
      <p className="text-sm text-slate">{t(SAFETY_BODY_KEYS[safety.ruleId])}</p>
      <p className="text-sm text-slate">{t(REFERRAL_KEYS[safety.referral])}</p>
      {directories.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-soft">{t("safety.directoryTitle")}</p>
          <ul className="space-y-1">
            {directories.map((entry) => (
              <li key={entry.href}>
                <a
                  className="text-sm text-copper hover:underline"
                  href={entry.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t(entry.labelKey)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-slate-soft">{t("safety.keepLogging")}</p>
    </section>
  );
}
```

- [ ] **Step 4: Create `apps/web/src/components/training/advancement-proposal-card.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import type { AdvancementDecision, AdvancementProposalDto } from "@turingcare/shared";

const DECISIONS: { decision: AdvancementDecision; labelKey: MessageKey }[] = [
  { decision: "confirmed", labelKey: "suggestion.advConfirm" },
  { decision: "stayed", labelKey: "suggestion.advStayed" },
  { decision: "rejected", labelKey: "suggestion.advRejected" },
  { decision: "regressed", labelKey: "suggestion.advRegressed" },
  { decision: "insufficient_evidence", labelKey: "suggestion.advInsufficient" },
];

export function AdvancementProposalCard({
  proposal,
  skillName,
  onDecision,
}: {
  proposal: AdvancementProposalDto;
  skillName: string;
  onDecision: (proposalId: string, decision: AdvancementDecision) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <section className="space-y-2 rounded border border-silver bg-white p-4">
      <h3 className="font-semibold text-slate">{t("suggestion.advTitle")}</h3>
      <p className="text-sm text-slate">
        {t("suggestion.advBody", {
          skill: skillName,
          from: proposal.fromLevel,
          to: proposal.toLevel,
        })}
      </p>
      <p className="text-xs text-slate-soft">
        {t("suggestion.advEvidence", {
          sessions: proposal.sessionCount,
          days: proposal.dayCount,
        })}
      </p>
      <ul className="text-xs text-slate-soft">
        {proposal.supportingSessions.map((session) => (
          <li key={session.id}>
            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
              new Date(`${session.practiceDay}T12:00:00`),
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {DECISIONS.map((entry) => (
          <Button
            key={entry.decision}
            type="button"
            variant={entry.decision === "confirmed" ? "default" : "outline"}
            onClick={() => onDecision(proposal.id, entry.decision)}
          >
            {t(entry.labelKey)}
          </Button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create `apps/web/src/components/training/suggestion-card.tsx`**

```tsx
import { AdvancementProposalCard } from "@/components/training/advancement-proposal-card";
import { SafetyNotice } from "@/components/training/safety-notice";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import { EASING_STRATEGY_KEYS, RULE_REASON_KEYS } from "@/lib/practice-options";
import type {
  AdvancementDecision,
  SuggestionAction,
  TrainingSuggestion,
} from "@turingcare/shared";

const ACTIONS: { action: SuggestionAction; labelKey: MessageKey }[] = [
  { action: "started", labelKey: "suggestion.actionStarted" },
  { action: "skipped", labelKey: "suggestion.actionSkipped" },
  { action: "rated_useful", labelKey: "suggestion.rateUseful" },
  { action: "rated_not_useful", labelKey: "suggestion.rateNotUseful" },
];

export function SuggestionCard({
  suggestion,
  onAction,
  onDecision,
  onPickFocus,
}: {
  suggestion: TrainingSuggestion;
  onAction: (action: SuggestionAction) => void;
  onDecision: (proposalId: string, decision: AdvancementDecision) => void;
  onPickFocus: () => void;
}) {
  const { t } = useI18n();

  if (suggestion.safety) return <SafetyNotice safety={suggestion.safety} />;

  if (suggestion.dismissed) {
    return (
      <section className="space-y-2 rounded border border-silver bg-white p-4">
        <h2 className="font-semibold text-slate">{t("suggestion.skippedTitle")}</h2>
        <p className="text-sm text-slate-soft">{t("suggestion.skippedBody")}</p>
      </section>
    );
  }

  if (suggestion.type === "needs_focus_skill") {
    return (
      <section className="space-y-3 rounded border border-silver bg-white p-4">
        <h2 className="font-semibold text-slate">{t("suggestion.needsFocusTitle")}</h2>
        <p className="text-sm text-slate-soft">{t("suggestion.needsFocusBody")}</p>
        <Button type="button" onClick={onPickFocus}>
          {t("suggestion.needsFocusCta")}
        </Button>
      </section>
    );
  }

  if (suggestion.type === "custom_skill_unsupported") {
    return (
      <section className="space-y-2 rounded border border-silver bg-white p-4">
        <h2 className="font-semibold text-slate">{t("suggestion.customTitle")}</h2>
        {suggestion.skill && (
          <p className="text-sm text-slate">
            {t("suggestion.forSkill", { skill: suggestion.skill.name })}
          </p>
        )}
        <p className="text-sm text-slate-soft">{t("suggestion.customBody")}</p>
      </section>
    );
  }

  const { primary, fallback, skill, ruleId } = suggestion;
  if (!primary || !fallback || !ruleId) return null;

  const fallbackHeading = t("suggestion.fallbackSameLevel");

  return (
    <section className="space-y-3 rounded border border-silver bg-white p-4">
      <div className="space-y-1">
        <h2 className="font-semibold text-slate">{t("suggestion.title")}</h2>
        {skill && (
          <p className="text-sm text-slate-soft">
            {t("suggestion.forSkill", { skill: skill.name })} · {" "}
            {t("suggestion.levelLabel", { level: primary.level })}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase text-slate-soft">
          {t("suggestion.primaryLabel")}
        </p>
        <p className="text-sm text-slate">{primary.exercise}</p>
      </div>

      <div className="space-y-1 rounded bg-cream p-3">
        <p className="text-xs font-medium uppercase text-slate-soft">
          {t("suggestion.fallbackLabel")}
        </p>
        <p className="text-xs text-slate-soft">{fallbackHeading}</p>
        <p className="text-sm text-slate">{fallback.exercise}</p>
        {fallback.easingStrategy && (
          <p className="text-xs text-slate-soft">
            {t(EASING_STRATEGY_KEYS[fallback.easingStrategy])}
          </p>
        )}
      </div>

      <p className="text-xs text-slate-soft">
        {t(RULE_REASON_KEYS[ruleId], { level: primary.level })}
      </p>
      <p className="text-xs text-slate-soft">
        {suggestion.evidence.sessionCount === 0
          ? t("suggestion.noEvidence")
          : t("suggestion.evidence", {
              sessions: suggestion.evidence.sessionCount,
              days: suggestion.evidence.distinctDayCount,
              window: suggestion.evidence.windowDays,
            })}
      </p>

      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((entry) => (
          <Button
            key={entry.action}
            type="button"
            variant={entry.action === "started" ? "default" : "outline"}
            disabled={!suggestion.suggestionId}
            onClick={() => onAction(entry.action)}
          >
            {t(entry.labelKey)}
          </Button>
        ))}
        <Button type="button" variant="outline" onClick={onPickFocus}>
          {t("suggestion.changeFocus")}
        </Button>
      </div>

      {suggestion.advancementProposal?.status === "proposed" && skill && (
        <AdvancementProposalCard
          proposal={suggestion.advancementProposal}
          skillName={skill.name}
          onDecision={onDecision}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 6: Run it, expect PASS**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/training/suggestion-card.test.tsx`
Expected: PASS — 9 tests.

- [ ] **Step 7: Commit**

```bash
pnpm exec biome check --write apps/web/src/components/training
pnpm --filter @turingcare/web exec tsc --noEmit
git add apps/web/src/components/training
git commit -m "feat(web): suggestion, safety and advancement cards"
```

---

## Task 22: Optional evidence capture in the session form

**Files:**
- Modify: `apps/web/src/components/progress/session-form.tsx`
- Modify: `apps/web/src/components/progress/progress-panel.tsx`
- Create: `apps/web/src/components/progress/session-form.test.tsx`
- Modify: `apps/web/src/components/dogs/dog-card-body.tsx`
- Modify: `apps/web/src/components/dogs/dog-card-body.test.tsx`

- [ ] **Step 1: Write the failing test** — replace the focused timestamp test
  created in Task 11 with the expanded
  `apps/web/src/components/progress/session-form.test.tsx` below:

```tsx
import { LocaleProvider } from "@/i18n";
import * as progressLib from "@/lib/progress";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionForm } from "./session-form";

vi.mock("@/lib/progress", () => ({ useLogSession: vi.fn() }));

function setup(dimensions: Parameters<typeof SessionForm>[0]["dimensions"]) {
  const mutateAsync = vi.fn().mockResolvedValue({});
  vi.mocked(progressLib.useLogSession).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof progressLib.useLogSession>);
  render(
    <LocaleProvider>
      <SessionForm
        dogId="d1"
        skillId="s1"
        dimensions={dimensions}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
      />
    </LocaleProvider>,
  );
  return { mutateAsync };
}

describe("SessionForm evidence capture", () => {
  it("saves with no evidence answered at all", async () => {
    const { mutateAsync } = setup(["cue_support"]);
    fireEvent.click(screen.getByText("Save session"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const body = mutateAsync.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(screen.getByLabelText("When")).toHaveAttribute("max");
    expect(body.outcome).toBeUndefined();
    expect(body.cueSupport).toBeUndefined();
    expect(body.practicedTarget).toBeUndefined();
    expect(new Date(String(body.occurredAt)).toISOString()).toBe(body.occurredAt);
  });

  it("only renders the dimensions the suggestion asked about", () => {
    setup(["distraction"]);
    expect(screen.getByText("What else was going on?")).toBeInTheDocument();
    expect(screen.queryByText("How much help did you give?")).not.toBeInTheDocument();
  });

  it("submits the chosen outcome, context and safety signal", async () => {
    const { mutateAsync } = setup(["distraction"]);
    fireEvent.change(screen.getByLabelText("How did it go?"), {
      target: { value: "too_hard" },
    });
    fireEvent.change(screen.getByLabelText("What else was going on?"), {
      target: { value: "strong" },
    });
    fireEvent.change(screen.getByLabelText("Did anything unsafe happen?"), {
      target: { value: "injury_or_pain" },
    });
    fireEvent.click(screen.getByText("Save session"));
    await waitFor(() => expect(screen.getByText("Save session")).toBeEnabled());
    expect(mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /confirm/i }));
    fireEvent.click(screen.getByText("Save session"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const body = mutateAsync.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(body.outcome).toBe("too_hard");
    expect(body.distraction).toBe("strong");
    expect(body.safetySignal).toBe("injury_or_pain");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/progress/session-form.test.tsx`
Expected: FAIL — `SessionForm` has no `dimensions` prop and renders none of the evidence fields.

- [ ] **Step 3: Extend `apps/web/src/components/progress/session-form.tsx`** — add the imports, the prop, and the three field groups between the notes field and the buttons:

```tsx
import { DIMENSION_CONFIG, OUTCOME_KEYS, SAFETY_SIGNAL_KEYS } from "@/lib/practice-options";
import {
  type PracticeDimension,
  type PracticeSessionInput,
  practiceOutcomeValues,
  practiceSessionSchema,
  safetySignalValues,
} from "@turingcare/shared";
import { useState } from "react";
```

```tsx
export function SessionForm({
  dogId,
  skillId,
  dimensions,
  onCancel,
  onSaved,
}: {
  dogId: string;
  skillId: string;
  dimensions: PracticeDimension[];
  onCancel: () => void;
  onSaved?: () => void;
}) {
```

Also destructure `watch` from `useForm`, then add:

```tsx
  const selectedSafetySignal = watch("safetySignal");
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
```

```tsx
      <label className="block">
        <span className="text-sm">{t("practice.outcomeQuestion")}</span>
        <select
          className={input}
          aria-label={t("practice.outcomeQuestion")}
          {...register("outcome", { setValueAs: (v) => v || undefined })}
        >
          <option value="">{t("practice.outcomeSkip")}</option>
          {practiceOutcomeValues.map((value) => (
            <option key={value} value={value}>
              {t(OUTCOME_KEYS[value])}
            </option>
          ))}
        </select>
      </label>

      {dimensions.map((dimension) => {
        const group = DIMENSION_CONFIG[dimension];
        return (
          <label className="block" key={dimension}>
            <span className="text-sm">{t(group.labelKey)}</span>
            <select
              className={input}
              aria-label={t(group.labelKey)}
              {...register(group.field, { setValueAs: (v) => v || undefined })}
            >
              <option value="">{t("practice.contextOptional")}</option>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
        );
      })}

      <label className="block">
        <span className="text-sm">{t("practice.safetyLabel")}</span>
        <select
          className={input}
          aria-label={t("practice.safetyLabel")}
          {...register("safetySignal", {
            setValueAs: (v) => v || undefined,
            onChange: () => setSafetyConfirmed(false),
          })}
        >
          <option value="">{t("practice.safetyNone")}</option>
          {safetySignalValues.map((value) => (
            <option key={value} value={value}>
              {t(SAFETY_SIGNAL_KEYS[value])}
            </option>
          ))}
        </select>
      </label>

      {selectedSafetySignal && (
        <label className="block text-sm">
          <input
            type="checkbox"
            checked={safetyConfirmed}
            onChange={(event) => setSafetyConfirmed(event.target.checked)}
          />
          {t("practice.safetyConfirm")}
        </label>
      )}
```

Every field defaults to the empty option, so a save with nothing answered submits exactly what it does today.
The Training-tab form does **not** set `practicedTarget`: it is a general
practice log without proof that the displayed curriculum exercise was used.
Only quick capture attached to the exact suggestion may create level-anchored
primary/fallback evidence for deterministic rules and advancement.

Keep the Task 11 `datetime-local` conversion and `max={localDateTime()}`. Extend
that submit handler with the safety-confirmation guard and localized future-time
error handling:

```tsx
  const onSubmit = handleSubmit(async (body) => {
    if (body.safetySignal && !safetyConfirmed) {
      toast.error(t("practice.safetyConfirm"));
      return;
    }
    try {
      const occurredAt = new Date(body.occurredAt);
      await logSession.mutateAsync({
        skillId,
        body: {
          ...body,
          occurredAt: occurredAt.toISOString(),
          timezoneOffsetMinutes: occurredAt.getTimezoneOffset(),
        },
      });
      toast.success(t("progress.saved"));
      onSaved?.();
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "future_practice_session"
          ? t("practice.futureSession")
          : t("progress.saveFailed"),
      );
    }
  });
```

- [ ] **Step 4: Pass the dimensions in** — `apps/web/src/components/progress/progress-panel.tsx` already computes `const catalogSkill = findCatalogSkill(catalog, displaySkill.catalogSkillKey);` on line 154. Reuse it when rendering the form:

```tsx
            <SessionForm
              dogId={dogId}
              skillId={displaySkill.id}
              dimensions={catalogSkill?.dimensions ?? []}
              onCancel={() => setMode("view")}
              onSaved={() => setMode("view")}
            />
```

The enriched `dimensions` field arrives from the API because Task 5 changed `GET /api/training/templates` to serve `trainingCurriculum`, and `useTrainingCatalog` is already typed as `CatalogTemplate[]` — the enriched type from Task 4.

- [ ] **Step 5: Run it, expect PASS**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/progress/session-form.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 6: Capture explicit safety signals with behavior concerns** — in
  `apps/web/src/components/dogs/dog-card-body.test.tsx`, extend the existing
  `"adds a concern and clears the input"` test:

```tsx
    fireEvent.change(screen.getByRole("combobox", { name: /unsafe/i }), {
      target: { value: "aggression_or_bite_risk" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add concern/i }));
    expect(addConcern.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /confirm/i }));
    fireEvent.click(screen.getByRole("button", { name: /add concern/i }));
    expect(addConcern.mutateAsync).toHaveBeenCalledWith({
      concern: "Counter surfing",
      severity: "severe",
      safetySignal: "aggression_or_bite_risk",
    });
```

Replace that test's previous click and expectation rather than clicking the Add
button twice.

In `apps/web/src/components/dogs/dog-card-body.tsx`, extend the imports:

```tsx
import { SAFETY_SIGNAL_KEYS } from "@/lib/practice-options";
import {
  type BehaviorConcernInput,
  type SafetySignalType,
  safetySignalValues,
} from "@turingcare/shared";
```

Replace the existing single `BehaviorConcernInput` import. Add state beside
`severity`:

```tsx
  const [concernSafetySignal, setConcernSafetySignal] = useState<"" | SafetySignalType>("");
  const [concernSafetyConfirmed, setConcernSafetyConfirmed] = useState(false);
```

Add this select immediately after the severity select:

```tsx
          <select
            className="rounded border border-silver bg-white px-2 text-sm"
            aria-label={t("practice.safetyLabel")}
            value={concernSafetySignal}
            onChange={(event) => {
              setConcernSafetySignal(event.target.value as "" | SafetySignalType);
              setConcernSafetyConfirmed(false);
            }}
          >
            <option value="">{t("practice.safetyNone")}</option>
            {safetySignalValues.map((value) => (
              <option key={value} value={value}>
                {t(SAFETY_SIGNAL_KEYS[value])}
              </option>
            ))}
          </select>
          {(concernSafetySignal || severity === "severe") && (
            <label className="text-sm">
              <input
                type="checkbox"
                checked={concernSafetyConfirmed}
                onChange={(event) => setConcernSafetyConfirmed(event.target.checked)}
              />
              {t("practice.safetyConfirm")}
            </label>
          )}
```

Replace the concern mutation and reset:

```tsx
                if ((concernSafetySignal || severity === "severe") && !concernSafetyConfirmed) {
                  toast.error(t("practice.safetyConfirm"));
                  return;
                }
                await addConcern.mutateAsync({
                  concern,
                  severity,
                  safetySignal: concernSafetySignal || undefined,
                });
                setConcern("");
                setConcernSafetySignal("");
                setConcernSafetyConfirmed(false);
```

Also reset `concernSafetyConfirmed` to `false` whenever the existing severity
select changes, so switching into `severe` always requires a fresh confirmation.

Run:

```bash
pnpm --filter @turingcare/web exec vitest run src/components/dogs/dog-card-body.test.tsx
```

Expected: PASS, including the structured safety-signal assertion.

- [ ] **Step 7: Commit**

```bash
pnpm exec biome check --write apps/web/src/components/progress/session-form.tsx apps/web/src/components/progress/session-form.test.tsx apps/web/src/components/progress/progress-panel.tsx apps/web/src/components/dogs/dog-card-body.tsx apps/web/src/components/dogs/dog-card-body.test.tsx
pnpm --filter @turingcare/web exec tsc --noEmit
git add apps/web/src/components/progress/session-form.tsx apps/web/src/components/progress/session-form.test.tsx apps/web/src/components/progress/progress-panel.tsx apps/web/src/components/dogs/dog-card-body.tsx apps/web/src/components/dogs/dog-card-body.test.tsx
git commit -m "feat(web): optional structured evidence in the session form"
```

---

## Task 23: Wire the suggestion into the week view

**Files:**
- Create: `apps/web/src/components/progress/outcome-quick-capture.tsx`
- Modify: `apps/web/src/routes/dog-week.tsx`
- Modify: `apps/web/src/routes/dog-week.test.tsx`

- [ ] **Step 1: Write the failing test** — in `apps/web/src/routes/dog-week.test.tsx`, add the suggestion module to the mocks and add four tests:

```tsx
import * as suggestionLib from "@/lib/suggestion";
import type { TrainingSuggestion } from "@turingcare/shared";
```

Extend the existing Testing Library import to include `waitFor`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
```

```tsx
vi.mock("@/lib/suggestion", () => ({
  suggestionKey: (dogId: string, weekKey: string) => ["suggestion", dogId, weekKey],
  useSuggestion: vi.fn(),
  useSuggestionAction: vi.fn(),
  useAdvancementDecision: vi.fn(),
}));

const exerciseSuggestion: TrainingSuggestion = {
  suggestionId: "sug-1",
  dismissed: false,
  type: "exercise",
  ruleId: "cold_start_curriculum_level",
  curriculumVersion: "2026-08-11",
  dogId: "d1",
  weekKey: "2026-08-10",
  skill: {
    id: "s1",
    name: "Sit",
    catalogSkillKey: "basic-manners.sit",
    level: 1,
    goalId: "g1",
    goalName: "Basic manners",
  },
  primary: { level: 1, exercise: "Lure into a sit.", dimension: "cue_support" },
  fallback: {
    level: 1,
    exercise: "Lure into a sit.",
    reducedDimension: "cue_support",
    sameLevelEasing: true,
    easingStrategy: "add_cue_help",
  },
  requestedDimensions: ["cue_support"],
  evidenceCategory: "curriculum_only",
  evidence: {
    windowDays: 21,
    sessionCount: 0,
    wentWellCount: 0,
    mixedCount: 0,
    tooHardCount: 0,
    distinctDayCount: 0,
    lastPracticeAt: null,
  },
  safety: null,
  advancementProposal: null,
};
```

Inside the existing `setup()` helper, change the existing `logMutate` to
`vi.fn().mockResolvedValue({ id: "session-1" })`, then add the suggestion mocks
before the return:

```tsx
  vi.mocked(suggestionLib.useSuggestion).mockReturnValue({
    data: exerciseSuggestion,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof suggestionLib.useSuggestion>);
  const actionMutate = vi.fn().mockResolvedValue({});
  vi.mocked(suggestionLib.useSuggestionAction).mockReturnValue({
    mutateAsync: actionMutate,
  } as unknown as ReturnType<typeof suggestionLib.useSuggestionAction>);
  vi.mocked(suggestionLib.useAdvancementDecision).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
  } as unknown as ReturnType<typeof suggestionLib.useAdvancementDecision>);
```

and return `actionMutate` alongside `logMutate`. Then add:

Also extend the file's existing `vi.mock("@/lib/progress", ...)` factory with
`useSetSessionEvidence: vi.fn()`. In `setup()`, mock it to return
`{ mutateAsync: evidenceMutate }`, where
`const evidenceMutate = vi.fn().mockResolvedValue({})`; return
`evidenceMutate` from `setup()` as well. Otherwise the newly imported hook is
`undefined` before any assertion runs.

Change `renderWeek()` to return `{ ...render(...), qc }` so cache invalidation
can be asserted, and return the delete mutation from `setup()` as
`deleteMutate`.

```tsx
  it("renders the weekly suggestion above the grid", () => {
    setup([]);
    vi.mocked(suggestionLib.useSuggestion).mockReturnValue({
      data: exerciseSuggestion,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof suggestionLib.useSuggestion>);
    renderWeek();
    expect(screen.getByText("This week's suggestion")).toBeInTheDocument();
    expect(screen.getAllByText("Lure into a sit.")).toHaveLength(2);
  });

  it("still logs a session when the suggestion query failed", async () => {
    const { logMutate } = setup([
      {
        skillId: "s1",
        name: "Sit",
        goalId: "g1",
        goalName: "Basic manners",
        position: 0,
        sessions: [],
      },
    ]);
    vi.mocked(suggestionLib.useSuggestion).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof suggestionLib.useSuggestion>);
    renderWeek();
    expect(screen.getByText(/load this week's suggestion/i)).toBeInTheDocument();
    expect(screen.queryByText("This week's suggestion")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement,
    );
    await waitFor(() => expect(logMutate).toHaveBeenCalled());
  });

  it("asks for outcome, practised variant and safety after a quick log", async () => {
    const { evidenceMutate } = setup([
      {
        skillId: "s1",
        name: "Sit",
        goalId: "g1",
        goalName: "Basic manners",
        position: 0,
        sessions: [],
      },
    ]);
    vi.mocked(suggestionLib.useSuggestion).mockReturnValue({
      data: exerciseSuggestion,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof suggestionLib.useSuggestion>);
    renderWeek();
    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "Too hard" }));
    fireEvent.click(screen.getByRole("radio", { name: "Easier fallback" }));
    fireEvent.change(screen.getByLabelText("What else was going on?"), {
      target: { value: "strong" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /unsafe/i }), {
      target: { value: "aggression_or_bite_risk" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /confirm/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));
    await waitFor(() =>
      expect(evidenceMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            outcome: "too_hard",
            distraction: "strong",
            safetySignal: "aggression_or_bite_risk",
            practicedTarget: { suggestionId: "sug-1", variant: "fallback" },
          },
        }),
      ),
    );
  });

  it("can save a safety report without forcing an outcome answer", async () => {
    const { evidenceMutate } = setup([
      {
        skillId: "s1",
        name: "Sit",
        goalId: "g1",
        goalName: "Basic manners",
        position: 0,
        sessions: [],
      },
    ]);
    vi.mocked(suggestionLib.useSuggestion).mockReturnValue({
      data: exerciseSuggestion,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof suggestionLib.useSuggestion>);
    renderWeek();
    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);
    fireEvent.change(
      await screen.findByRole("combobox", { name: /unsafe/i }),
      { target: { value: "injury_or_pain" } },
    );
    expect(screen.getByRole("button", { name: "Save response" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /confirm/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));
    await waitFor(() =>
      expect(evidenceMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ safetySignal: "injury_or_pain" }),
        }),
      ),
    );
    expect(evidenceMutate.mock.calls[0]?.[0]?.body.outcome).toBeUndefined();
  });

  it("keeps confirmed safety evidence available for retry after a failed save", async () => {
    const { evidenceMutate } = setup([
      {
        skillId: "s1",
        name: "Sit",
        goalId: "g1",
        goalName: "Basic manners",
        position: 0,
        sessions: [],
      },
    ]);
    evidenceMutate.mockRejectedValueOnce(new Error("temporary"));
    vi.mocked(suggestionLib.useSuggestion).mockReturnValue({
      data: exerciseSuggestion,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof suggestionLib.useSuggestion>);
    renderWeek();
    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);
    fireEvent.change(
      await screen.findByRole("combobox", { name: /unsafe/i }),
      { target: { value: "injury_or_pain" } },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /confirm/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));
    await waitFor(() => expect(evidenceMutate).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Save response" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));
    await waitFor(() => expect(evidenceMutate).toHaveBeenCalledTimes(2));
  });

  it("never anchors grid evidence to a skipped suggestion", async () => {
    const { evidenceMutate } = setup([
      {
        skillId: "s1",
        name: "Sit",
        goalId: "g1",
        goalName: "Basic manners",
        position: 0,
        sessions: [],
      },
    ]);
    vi.mocked(suggestionLib.useSuggestion).mockReturnValue({
      data: { ...exerciseSuggestion, dismissed: true },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof suggestionLib.useSuggestion>);
    renderWeek();
    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "Went well" }));
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));
    await waitFor(() => expect(evidenceMutate).toHaveBeenCalled());
    expect(evidenceMutate.mock.calls[0]?.[0]?.body.practicedTarget).toBeUndefined();
  });

  it("invalidates the suggestion after deleting practice evidence", async () => {
    setup([
      {
        skillId: "s1",
        name: "Sit",
        goalId: "g1",
        goalName: "Basic manners",
        position: 0,
        sessions: [
          {
            id: "session-1",
            occurredAt: new Date().toISOString(),
            durationMinutes: null,
          },
        ],
      },
    ]);
    const { qc } = renderWeek();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    fireEvent.click(
      screen.getByRole("button", { name: /Sit on .*: 1 sessions/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["suggestion", "d1", expect.any(String)],
      }),
    );
  });
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/dog-week.test.tsx`
Expected: FAIL — `This week's suggestion` is not rendered because `DogWeek` does not use the suggestion hooks yet.

- [ ] **Step 3: Create `apps/web/src/components/progress/outcome-quick-capture.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import {
  DIMENSION_CONFIG,
  OUTCOME_KEYS,
  SAFETY_SIGNAL_KEYS,
} from "@/lib/practice-options";
import {
  type PracticeDimension,
  type PracticeEvidenceInput,
  type PracticeOutcome,
  type SafetySignalType,
  practiceOutcomeValues,
  safetySignalValues,
} from "@turingcare/shared";
import { useState } from "react";

/**
 * One-tap outcome capture shown right after a session is logged from the grid.
 * Skipping is always available and the session is already saved either way.
 */
export function OutcomeQuickCapture({
  onSave,
  onSkip,
  hasFallback,
  dimensions,
}: {
  onSave: (
    input: PracticeEvidenceInput & { variant: "primary" | "fallback" },
  ) => void;
  onSkip: () => void;
  hasFallback: boolean;
  dimensions: PracticeDimension[];
}) {
  const { t } = useI18n();
  const [outcome, setOutcome] = useState<PracticeOutcome | null>(null);
  const [safetySignal, setSafetySignal] = useState<"" | SafetySignalType>("");
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [variant, setVariant] = useState<"primary" | "fallback">("primary");
  const [context, setContext] = useState<PracticeEvidenceInput>({});
  return (
    <section
      aria-live="polite"
      aria-label={t("practice.outcomeQuestion")}
      className="flex flex-wrap items-center gap-2 rounded border border-silver bg-white p-3"
    >
      <span className="text-sm text-slate">{t("practice.outcomeQuestion")}</span>
      {practiceOutcomeValues.map((value) => (
        <Button
          key={value}
          type="button"
          variant={outcome === value ? "default" : "outline"}
          aria-pressed={outcome === value}
          onClick={() => setOutcome(value)}
        >
          {t(OUTCOME_KEYS[value])}
        </Button>
      ))}
      {hasFallback && (
        <fieldset>
          <legend>{t("practice.practicedVersion")}</legend>
          <label>
            <input
              type="radio"
              name="practiced-variant"
              checked={variant === "primary"}
              onChange={() => setVariant("primary")}
            />
            {t("practice.practicedPrimary")}
          </label>
          <label>
            <input
              type="radio"
              name="practiced-variant"
              checked={variant === "fallback"}
              onChange={() => setVariant("fallback")}
            />
            {t("practice.practicedFallback")}
          </label>
        </fieldset>
      )}
      {dimensions.map((dimension) => {
        const group = DIMENSION_CONFIG[dimension];
        return (
          <label key={dimension} className="text-sm text-slate">
            {t(group.labelKey)}
            <select
              aria-label={t(group.labelKey)}
              value={String(context[group.field] ?? "")}
              onChange={(event) =>
                setContext((current) => ({
                  ...current,
                  [group.field]: event.target.value || undefined,
                }))
              }
            >
              <option value="">{t("practice.contextOptional")}</option>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      <label className="text-sm text-slate">
        {t("practice.safetyLabel")}
        <select
          value={safetySignal}
          onChange={(event) => {
            setSafetySignal(event.target.value as "" | SafetySignalType);
            setSafetyConfirmed(false);
          }}
        >
          <option value="">{t("practice.safetyNone")}</option>
          {safetySignalValues.map((value) => (
            <option key={value} value={value}>
              {t(SAFETY_SIGNAL_KEYS[value])}
            </option>
          ))}
        </select>
      </label>
      {safetySignal && (
        <label className="text-sm text-slate">
          <input
            type="checkbox"
            checked={safetyConfirmed}
            onChange={(event) => setSafetyConfirmed(event.target.checked)}
          />
          {t("practice.safetyConfirm")}
        </label>
      )}
      <Button
        type="button"
        disabled={(!outcome && !safetySignal) || Boolean(safetySignal && !safetyConfirmed)}
        onClick={() =>
          onSave({
            ...context,
            outcome: outcome ?? undefined,
            safetySignal: safetySignal || undefined,
            variant,
          })
        }
      >
        {t("practice.saveEvidence")}
      </Button>
      <Button type="button" variant="outline" onClick={onSkip}>
        {t("practice.outcomeSkip")}
      </Button>
    </section>
  );
}
```

- [ ] **Step 4: Wire `apps/web/src/routes/dog-week.tsx`** — add the imports, hooks, quick-capture state, and render the card:

```tsx
import { OutcomeQuickCapture } from "@/components/progress/outcome-quick-capture";
import { SuggestionCard } from "@/components/training/suggestion-card";
import { useDeleteSession, useLogSession, useSetSessionEvidence } from "@/lib/progress";
import { useAdvancementDecision, useSuggestion, useSuggestionAction } from "@/lib/suggestion";
import type {
  AdvancementDecision,
  PracticeDimension,
  PracticeEvidenceInput,
  SuggestionAction,
} from "@turingcare/shared";
import { toast } from "sonner";
```

```tsx
  const currentTimezoneOffsetMinutes = new Date().getTimezoneOffset();
  const { data: suggestion, isError: suggestionError } = useSuggestion(
    id,
    weekKey,
    currentTimezoneOffsetMinutes,
  );
  const suggestionAction = useSuggestionAction(id, weekKey);
  const advancementDecision = useAdvancementDecision(id, weekKey);
  const setEvidence = useSetSessionEvidence(id);
  const [pendingOutcome, setPendingOutcome] = useState<{
    skillId: string;
    sessionId: string;
    suggestionId: string | null;
    hasPrimary: boolean;
    hasFallback: boolean;
    dimensions: PracticeDimension[];
  } | null>(null);
```

```tsx
  const onLog = async (skillId: string, day: Date) => {
    const isToday = dayKey(day) === dayKey(today);
    const occurredAt = isToday
      ? new Date().toISOString()
      : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0).toISOString();
    const occurrenceTimezoneOffsetMinutes = new Date(occurredAt).getTimezoneOffset();
    const created = await logSession.mutateAsync({
      skillId,
      body: { occurredAt, timezoneOffsetMinutes: occurrenceTimezoneOffsetMinutes },
    });
    refreshFocus();
    // Evidence capture is a follow-up, never a precondition: the session above
    // is already saved regardless of what happens next.
    setPendingOutcome({
      skillId,
      sessionId: created.id,
      suggestionId:
        !suggestionError &&
        suggestion?.type === "exercise" &&
        !suggestion.dismissed &&
        suggestion.skill?.id === skillId
          ? suggestion.suggestionId
          : null,
      hasPrimary:
        !suggestionError &&
        suggestion?.type === "exercise" &&
        !suggestion.dismissed &&
        suggestion.skill?.id === skillId &&
        suggestion.primary !== null,
      hasFallback:
        !suggestionError &&
        suggestion?.type === "exercise" &&
        !suggestion.dismissed &&
        suggestion.skill?.id === skillId &&
        suggestion.fallback !== null,
      dimensions:
        !suggestionError &&
        suggestion?.type === "exercise" &&
        !suggestion.dismissed &&
        suggestion.skill?.id === skillId
          ? suggestion.requestedDimensions
          : [],
    });
  };

  const onRemove = async (skillId: string, sessionId: string) => {
    await deleteSession.mutateAsync({ skillId, sessionId });
    refreshFocus();
    qc.invalidateQueries({ queryKey: suggestionKey(id, weekKey) });
  };

  const onSaveOutcome = async (
    input: PracticeEvidenceInput & { variant: "primary" | "fallback" },
  ) => {
    if (!pendingOutcome) return;
    const target = pendingOutcome;
    const { variant, ...evidence } = input;
    try {
      await setEvidence.mutateAsync({
        skillId: target.skillId,
        sessionId: target.sessionId,
        body: {
          ...evidence,
          practicedTarget:
            target.suggestionId &&
            (variant === "fallback" ? target.hasFallback : target.hasPrimary)
              ? { suggestionId: target.suggestionId, variant }
                : undefined,
        },
      });
      setPendingOutcome(null);
      qc.invalidateQueries({ queryKey: suggestionKey(id, weekKey) });
      toast.success(t("practice.outcomeSaved"));
    } catch {
      toast.error(t("practice.outcomeFailed"));
    }
  };

  const onSuggestionAction = async (action: SuggestionAction) => {
    if (!suggestion?.suggestionId) return;
    try {
      await suggestionAction.mutateAsync({ suggestionId: suggestion.suggestionId, action });
      toast.success(t("suggestion.actionThanks"));
    } catch {
      toast.error(t("suggestion.actionFailed"));
    }
  };

  const onAdvancementDecision = async (proposalId: string, decision: AdvancementDecision) => {
    try {
      await advancementDecision.mutateAsync({ proposalId, decision });
      toast.success(t("suggestion.advSaved"));
    } catch {
      toast.error(t("suggestion.advFailed"));
    }
  };
```

Import `suggestionKey` alongside the suggestion hooks. No change is needed in `useLogSession`: its `mutationFn` already returns `(await res.json()).session`, so `created.id` is available.

Render the card immediately after `<WeekNav …/>` and the quick capture immediately after the summary paragraph:

```tsx
      {!suggestionError && suggestion && (
        <SuggestionCard
          suggestion={suggestion}
          onAction={onSuggestionAction}
          onDecision={onAdvancementDecision}
          onPickFocus={() => setPickerOpen(true)}
        />
      )}
      {suggestionError && (
        <p role="status" className="text-sm text-slate-soft">
          {t("suggestion.loadError")}
        </p>
      )}

      {pendingOutcome && (
        <OutcomeQuickCapture
          hasFallback={pendingOutcome.hasFallback}
          dimensions={pendingOutcome.dimensions}
          onSave={onSaveOutcome}
          onSkip={() => setPendingOutcome(null)}
        />
      )}
```

- [ ] **Step 5: Run it, expect PASS**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/dog-week.test.tsx`
Expected: PASS — the existing tests plus all suggestion, retry, context, cache,
and accessibility regressions added above.

- [ ] **Step 6: Run the whole web suite, expect PASS**

Run: `pnpm --filter @turingcare/web test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
pnpm exec biome check --write apps/web/src/components/progress/outcome-quick-capture.tsx apps/web/src/routes/dog-week.tsx apps/web/src/routes/dog-week.test.tsx apps/web/src/lib/progress.ts
pnpm --filter @turingcare/web exec tsc --noEmit
git add apps/web/src/components/progress/outcome-quick-capture.tsx apps/web/src/routes/dog-week.tsx apps/web/src/routes/dog-week.test.tsx apps/web/src/lib/progress.ts
git commit -m "feat(web): show the weekly suggestion and capture outcomes in one tap"
```

---

## Task 24: Full gates and documentation

**Files:**
- Modify: `docs/PROJECT-LOG.md`
- Modify: `README.md`
- Modify: `DEPLOY.md`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Create: `docs/operations/safety-signal-correction.md`
- Modify: `e2e/critical-owner-journey.spec.ts`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Use a bounded maintenance deployment and serialize the web**

The current workflow migrates before a rolling API replacement. That is unsafe
for this migration because an old `loadFocusWeek` reads every row for a dog and
would expose historical or future non-null focus rows written by a new machine
during the mixed-version window. Replace the production migration and deploy
jobs so all old API machines are drained before migration, migration failure
restores the unchanged old API, and a post-migration deploy failure leaves the
API drained rather than serving unsafe old reads:

Also add this top-level workflow concurrency block immediately after `on` so
two pushes cannot interleave drain, migration, and deploy operations:

```yaml
concurrency:
  group: production-deploy
  cancel-in-progress: false
```

Use these complete production jobs:

```yaml
  migrate:
    needs: ci
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: pnpm install --frozen-lockfile
      - name: Drain old API and migrate
        run: |
          set -Eeuo pipefail
          original_count=$(flyctl machine list --json --app turingcare-api | jq 'length')
          restore_old_release() {
            flyctl scale count "$original_count" --yes --app turingcare-api
            if [ "$original_count" -gt 0 ]; then
              curl --fail --retry 12 --retry-delay 5 --retry-all-errors https://api.turingcare.dog/health
            fi
          }
          restore_on_exit() {
            status=$?
            trap - EXIT INT TERM
            restore_old_release
            exit "$status"
          }
          trap restore_on_exit EXIT
          trap 'exit 130' INT
          trap 'exit 143' TERM
          flyctl scale count 0 --yes --app turingcare-api
          for attempt in $(seq 1 12); do
            count=$(flyctl machine list --json --app turingcare-api | jq 'length')
            if [ "$count" -eq 0 ]; then
              break
            fi
            sleep 5
          done
          remaining=$(flyctl machine list --json --app turingcare-api | jq 'length')
          if [ "$remaining" -ne 0 ]; then
            echo "API machines did not drain" >&2
            exit 1
          fi
          pnpm --filter @turingcare/api db:migrate
          trap - EXIT INT TERM

  deploy-api:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - name: Deploy and verify compatible API
        run: |
          set -Eeuo pipefail
          drain_on_exit() {
            status=$?
            trap - EXIT INT TERM
            flyctl scale count 0 --yes --app turingcare-api
            exit "$status"
          }
          trap drain_on_exit EXIT
          trap 'exit 130' INT
          trap 'exit 143' TERM
          flyctl deploy --remote-only --config apps/api/fly.toml
          flyctl scale count 1 --yes --app turingcare-api
          curl --fail --retry 12 --retry-delay 5 --retry-all-errors https://api.turingcare.dog/ready
          trap - EXIT INT TERM
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

  # The web uses the expanded focus/session contracts, so publish it only after
  # the migrated API is healthy.
  deploy-web:
    needs: deploy-api
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Build frontend (prod API URL)
        run: pnpm --filter @turingcare/web build
        env:
          VITE_API_URL: https://api.turingcare.dog
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy apps/web/dist --project-name=turingcare-web --branch=main
```

This intentionally accepts a short API maintenance window to eliminate unsafe
mixed-version reads. Task 8 keeps legacy focus requests valid and Task 1 keeps
legacy `datetime-local` session timestamps valid once the new API is serving,
so the still-deployed old web works after the maintenance window. The new web
cannot reach production before the compatible API. Add contract-cleanup
follow-up notes to PROJECT-LOG for removing the legacy branches after rollout
telemetry confirms they are unused.

Run this structural workflow check:

```bash
drain_line=$(grep -n 'scale count 0' .github/workflows/deploy.yml | head -1 | cut -d: -f1)
migrate_line=$(grep -n '@turingcare/api db:migrate' .github/workflows/deploy.yml | tail -1 | cut -d: -f1)
test -n "$drain_line" -a -n "$migrate_line" -a "$drain_line" -lt "$migrate_line"
grep -q 'scale count "$original_count" --yes --app turingcare-api' .github/workflows/deploy.yml
grep -q 'scale count 1 --yes --app turingcare-api' .github/workflows/deploy.yml
grep -A1 '^  deploy-web:' .github/workflows/deploy.yml | grep -q 'needs: deploy-api'
```

Expected: all commands exit 0, proving production migration drains first,
contains a restore/serve command, and gates the web on the API.

Before editing the workflow, add a DB-backed readiness route. In
`apps/api/src/app.test.ts`, import `db` from `./db` and `vi` from Vitest, then
add:

```ts
  it("GET /ready verifies the migrated database schema", async () => {
    const res = await app.request("/ready");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready" });
  });

  it("GET /ready returns 503 when the database is unavailable", async () => {
    vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("database unavailable"));
    const res = await app.request("/ready");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "database_not_ready" });
  });

  it("GET /ready returns 503 when the final suggestion schema is missing", async () => {
    vi.spyOn(db, "execute").mockRejectedValueOnce(
      new Error('relation "training_suggestions" does not exist'),
    );
    const res = await app.request("/ready");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "database_not_ready" });
  });

  it("GET /ready returns 503 when focus compatibility tables are missing", async () => {
    vi.spyOn(db, "execute").mockRejectedValueOnce(
      new Error('relation "legacy_focus_claims" does not exist'),
    );
    const res = await app.request("/ready");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "database_not_ready" });
  });
```

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/app.test.ts
```

Expected: FAIL because `/ready` does not exist. Then add `sql` from
`drizzle-orm` and `db` from `./db` to `apps/api/src/app.ts`, directly after
`/health` add:

```ts
  .get("/ready", async (c) => {
    try {
      await db.execute(sql`
        select
          wf."week_start",
          fcw."session_id",
          lfc."claimed_at",
          ps."practice_day",
          ps."curriculum_version",
          ds."type",
          ts."curriculum_version",
          tsa."action",
          ap."status"
        from "weekly_focus" wf
        left join "focus_compatibility_weeks" fcw on false
        left join "legacy_focus_claims" lfc on false
        left join "practice_sessions" ps on false
        left join "dog_safety_signals" ds on false
        left join "training_suggestions" ts on false
        left join "training_suggestion_actions" tsa on false
        left join "advancement_proposals" ap on false
        limit 0
      `);
      return c.json({ status: "ready" } as const);
    } catch (error) {
      console.error("[ready] database_not_ready", { error });
      return c.json({ error: "database_not_ready" } as const, 503);
    }
  })
```

Run the focused app test again; expected PASS. This readiness check proves the
database is reachable and the required objects from migrations `0013`, `0014`,
and `0015` are present before the web deploy.

Update `DEPLOY.md`'s opening diagram and parallel-deploy prose to:

```text
push main → ci → drain+migrate → deploy-api → deploy-web
```

State that production deploys are serialized, the API has a bounded maintenance
window for schema-incompatible migrations, migration failure restores the old
machine after rollback, and deploy/readiness failure leaves the API drained for
operator intervention rather than serving an incompatible release. Update the
"First deploy" section to use the same serialized order.

- [ ] **Step 2: Run every gate**

```bash
pnpm lint
pnpm typecheck
set -a && . ./.env && set +a
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: all six commands exit 0. Fix any failure in the file that caused it;
do not skip or weaken a test to get green.

- [ ] **Step 3: Verify the cohort slice end to end by hand**

```bash
docker compose up -d --wait
set -a && . ./.env && set +a
pnpm dev
```

In the browser: create a dog, add a catalog goal, set one focus skill for this week, open the week view, confirm a suggestion with a primary exercise and one easier fallback appears; log a session from the grid and answer the one-tap outcome; log three good sessions across two days and confirm the advancement proposal appears and only changes the level after you confirm it; log a session answering "Signs of pain or injury" in the safety question and confirm the suggestion is replaced by the referral notice with no exercise and no dismiss control. End `pnpm dev` with Ctrl-C after the walkthrough.

- [ ] **Step 4: Add a PROJECT-LOG entry** — prepend a new dated entry to `docs/PROJECT-LOG.md` following the file's existing entry format, recording: weekly focus is now versioned by week; practice sessions carry structured outcome/context and the curriculum level; a bounded per-skill dimension metadata table turns the authored catalog into deterministic targets; suggestions are rule-based with one easier fallback; advancement is proposed and owner-confirmed; structured safety inputs suppress suggestions and refer out; suggestion/advancement audit rows and eight new telemetry names, including legacy focus compatibility usage for contract cleanup; Gate 2 dashboards, custom-skill suggestions and Behavior Brief integration are explicitly out of scope.

- [ ] **Step 5: Update `README.md`** — in the section that lists product features, add one line describing the weekly personalized suggestion with an easier fallback and the safety pause, matching the file's existing bullet style.

- [ ] **Step 6: Extend the critical owner journey**

After the existing session-log assertion in
`e2e/critical-owner-journey.spec.ts`, navigate to the week view, select one
focus skill, assert the weekly suggestion card shows both the primary exercise
and easier fallback, log from the grid, save a `went_well` one-tap outcome, and
assert the success notice appears. Use role/label queries and the existing
authenticated journey setup; do not introduce a separate browser fixture.

- [ ] **Step 7: Document operator correction for confirmed input mistakes**

Create `docs/operations/safety-signal-correction.md`. State that this procedure
is only for a support-confirmed selection mistake, never for deciding that a
real safety event is resolved. Require the support ticket ID, dog ID, signal
ID, a second operator's approval, and a database backup. Use a transaction and
an exact two-key delete:

```sql
BEGIN;
SELECT "id", "dog_id", "type", "source", "reported_at"
FROM "dog_safety_signals"
WHERE "id" = :'signal_id'::uuid AND "dog_id" = :'dog_id'::uuid
FOR UPDATE;

DELETE FROM "dog_safety_signals"
WHERE "id" = :'signal_id'::uuid AND "dog_id" = :'dog_id'::uuid
RETURNING "id", "dog_id", "type", "source", "reported_at";
COMMIT;
```

Require the operator to abort if the selected row does not exactly match the
ticket, attach the returned row to the internal ticket, and confirm the next
suggestion request still evaluates all remaining safety signals. Record this
runbook and the two-step owner confirmation in the PROJECT-LOG entry.

- [ ] **Step 8: Final commit**

```bash
git add .github/workflows/deploy.yml DEPLOY.md apps/api/src/app.ts apps/api/src/app.test.ts docs/PROJECT-LOG.md README.md docs/operations/safety-signal-correction.md e2e/critical-owner-journey.spec.ts
git commit -m "docs: record the Gate 1 personalized training evidence loop"
```

---

## Self-Review (performed during planning)

**Spec coverage.** Every Gate 1 requirement in `docs/superpowers/specs/2026-08-11-personalized-training-progress-design.md` maps to a task:

| Spec requirement | Task |
| --- | --- |
| Weekly focus keeps one unambiguous skill per historical week | 2, 7, 8, 9 |
| Structured practice outcome (`went_well` / `mixed` / `too_hard`) | 1, 10, 11, 22, 23 |
| Structured practice context (help, place, distance, duration, distraction) | 1, 10, 11, 19, 22 |
| Suggestions use reviewed training instructions only | 5, 6, 18 (primary text is authored catalog prose; fallback retains it and appends one reviewed easing clause) |
| One primary exercise plus one easier fallback that reduces a named dimension | 6, 21 |
| Deterministic, explainable, no free-text inspection | 14 (pure `selectSuggestionRule`), 16 |
| Works at cold start | 14 (`cold_start_curriculum_level`), 17 |
| Advancement proposed only, owner-confirmed, never automatic | 3, 15, 17, 21 |
| Structured safety inputs from concern and practice capture, not free-text scanning | 1 (`safetySignalValues`), 11 (concern, signal and journal writes all serialize through `withDogSafetyLock`), 13, 22 |
| Safety suppression supersedes suggestions | 13, 16 (safety is evaluated before any exercise path), 17, 21 |
| Referral guidance by category with directories | 13, 18, 21 |
| Suggestion and advancement persistence + audit | 12, 16 |
| Telemetry | 11 (allowlist), 16, 17 |
| Owner authorization on every endpoint | 8, 11, 17 (404-not-403 tests for dogs, skills, sessions, suggestions, proposals) |
| Evidence capture never blocks a practice save | 1 (all fields optional), 22 (empty-form test), 23 (`isError` logging test) |
| Custom-skill unsupported state | 3, 14, 16, 17, 21 |
| English + Spanish interface strings | 18 |
| RLS on new tables | 10, 12 |

**Out of scope, deliberately absent from every task:** contextual progress dashboards, custom-skill suggestions, Behavior Brief integration, public-page/catalog localization, AI generation, automatic level changes, streaks or badges, reminders/notifications.

**Placeholder scan.** No task contains `TODO`, `FIXME`, `...`, `<your …>`, "similar to", "and so on", or "etc." in place of content. Every code block is complete and paste-ready. The catalog metadata in Task 5 lists all 21 skill keys explicitly, and Task 6's test resolves all 21 × 5 = 105 targets. Exercise prose is never invented: the 105 authored level descriptions in `apps/api/src/data/training-catalog.ts` are reused verbatim, and the only new fallback instruction copy is the six direction-aware easing clauses in Task 18.

**Type consistency across tasks** — every identifier is defined once and referenced with the same name and shape afterwards:
- Shared: `weekKeySchema`, `focusAddSchema`, `focusWeekQuerySchema`, `focusRemoveQuerySchema`, `practiceEvidenceSchema`, `practiceSessionSchema`, `practiceSessionApiSchema`, `PracticeDimension`, `EasingStrategy`, `SkillDimensionMetadata`, `AuthoredCatalogTemplate`, `CatalogSkill`, `CatalogTemplate`, `suggestionQuerySchema`, `suggestionActionSchema`, `advancementDecisionSchema`, `TrainingSuggestion`, `CurriculumExercise`, `CurriculumFallback`, `SuggestionEvidence`, `SuggestionSafety`, `AdvancementProposalDto`, `advancementRuleId`.
- API: `CURRICULUM_VERSION`, `skillDimensionMetadata`, `trainingCurriculum`, `findCurriculumSkill`, `clampLevel`, `MAX_LEVEL`, `resolveCurriculumTarget`, `loadFocusWeek(dogId, weekKey, timezoneOffsetMinutes, weekEndTimezoneOffsetMinutes)`, `summarizeEvidence`, `loadSkillEvidence` (returns `{ summary, rows, advancementRows, latestMixedHadChallengingContext }`, consumed that way in Task 16), `loadRecentObservation`, `selectSuggestionRule`, `evaluateAdvancement`, `syncAdvancementProposalInTx(tx, skillId, evidence, evidenceRows)`, `syncAdvancementProposal(skillId, evidence, evidenceRows)` (default wrapper that opens its own transaction), `decideAdvancementProposal`, `decideSafety`, `loadSafetyInputs`, `evaluateSafety`, `evaluateSafetyWithLock(dogId, now, (decision, tx) => …)`, `TransactionType`, `lockDogSafety`, `withDogSafetyLock`, `currentWeekKey`, `loadSuggestion`, `recordSuggestionAction`.
- Web: `weekKeyOf`, `focusKey(dogId, weekKey)`, `useFocusWeek(dogId, weekKey, timezoneOffsetMinutes, weekEndTimezoneOffsetMinutes)`, `useAddFocus(dogId, weekKey)`, `useRemoveFocus(dogId, weekKey)`, `suggestionKey`, `useSuggestion(dogId, weekKey, timezoneOffsetMinutes)`, `useSuggestionAction`, `useAdvancementDecision`, `useSetSessionEvidence`, `OUTCOME_KEYS`, `EASING_STRATEGY_KEYS`, `DIMENSION_CONFIG`, `SAFETY_SIGNAL_KEYS`, `RULE_REASON_KEYS`, `SAFETY_BODY_KEYS`, `REFERRAL_KEYS`, `REFERRAL_DIRECTORIES`, `SuggestionCard`, `SafetyNotice`, `AdvancementProposalCard`, `OutcomeQuickCapture`.
- Owner-input enum values are declared once in `packages/shared` and mirrored by the pg enums in Tasks 10 and 12. The safety pg enum additionally contains the internal `severe_behavior_concern` rule, which is derived only from structured concern severity and never offered as an owner option. `suggestionRuleValues` and `safetyRuleValues` are stored as `text` because rule identifiers evolve faster than a pg enum should.

**Design decisions taken where the spec left mechanics open:**
1. Focus week key is sent by the client as a local Monday rather than derived server-side from an instant. The migration preserves legacy rows as `NULL`; the first current-week request atomically claims one deterministic row into that owner's supplied local week, records a durable per-dog claim marker, and leaves any additional rows permanently undated and audit-only.
2. Gate 1 permits exactly one focus skill per dog/week. Selecting another skill replaces the current row instead of creating an order-dependent second recommendation candidate.
3. Catalog metadata is 4 fields × 21 skills rather than 105 authored targets. Every fallback keeps the selected authored exercise and applies one required, reviewed easing strategy for exactly one dimension; distance directions are explicit.
4. Gate 1 computes suggestions only for the owner's current local week. Historical week navigation keeps its focus and sessions but does not recalculate old guidance from current evidence.
5. Evidence is anchored only when the session is created or first linked by quick capture; later PATCH requests never rewrite the historical level, variant, curriculum version, or captured owner-local practice date.
6. `too_hard` (2 of the last 3) steps back before a `harder` check-in eases, and both outrank `mixed`; practice evidence is stronger than a general observation.
7. Advancement requires 3 consecutive `went_well` sessions spread over at least 2 distinct days, and only those three sessions appear in the proposal evidence.
8. Proposal synchronization is serialized per skill and snapshots the three supporting IDs, timestamps, and outcomes. Changed or deleted evidence withdraws the proposal, a stayed/rejected proposal needs newer evidence before it can reappear, and stale confirmation cannot overwrite a level.
9. Injury/pain reports have a reviewed 90-day window. Aggression/bite risk, severe fear/panic, and the internal severe-concern signal never age out; every owner entry requires explicit confirmation, and restoring exercises requires a future reviewed professional-resolution workflow rather than an owner dismiss button. A two-operator runbook exists only to correct a support-verified input mistake.
10. Audit rows carry scalar columns only, never jsonb or owner prose.
11. Suggestion audit writes are fail-open and deduped per curriculum version and owner-local day, so a page refresh does not inflate the cohort data and a DB hiccup does not hide the suggestion. The final decision, any suppression-driven proposal withdrawal and the audit row all share the safety-locked transaction — nothing inside that callback opens a nested transaction or writes through the global `db`, so the checked-out connection can never deadlock against itself. Fail-open is therefore implemented *outside* that transaction: a recognized audit-write failure rolls it back (leaving the proposal open for the next request to re-evaluate under the same lock) and returns the built suggestion with `suggestionId: null`, while a safety-load failure still surfaces.
12. New endpoints live in `apps/api/src/routes/dogs.ts` to avoid a second `requireUser` pass and to keep RPC types on one app.
13. Rule identifiers are returned to the client and localized there, so the API never renders owner-facing prose in a locale.
