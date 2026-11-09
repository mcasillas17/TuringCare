# TuringCare deterministic training engine — specification

Status: **authoritative engine spec**, revision 9 (2026-11-09; applies the round-table and review rounds 1–8; v2 deferrals in §14.3). It supersedes the "Engine specification" section of [README.md](README.md) and the design details in
[docs/audit/IMPROVEMENT-PLAN.md](../../audit/IMPROVEMENT-PLAN.md). Evidence base: the seven deep-read digests
([01](01-learning-theory/DIGEST.md), [02a](02-problem-behaviors/DIGEST-a.md),
[02b](02-problem-behaviors/DIGEST-b.md), [03](03-development-life-stages/DIGEST.md),
[04](04-individual-differences/DIGEST.md), [05](05-professional-standards-curricula/DIGEST.md),
[06](06-life-skills-enrichment-adherence/DIGEST.md)). Where a digest and a NOTES file or the README
disagree, the digest wins. Citations use the digest key (`D01`…`D06`, `D02a`, `D02b`) plus the study.
Full references are in each folder's `LINKS.md`.

Conventions: **MUST/MUST NOT** are build requirements. "conv" means convention: no study supports the number, so it
is a tunable constant (§2). Every number a rule uses has a stable id (e.g. `DOSE.SESSION_MIN`) and appears in §15.1;
numbers that only appear in owner copy reach the copy as `{key, params}` from the engine, so the engine references
every constant (§12.2, §13.4). **Exempt:** skill-graph pass criteria and ladder prose (§9) are catalog content, not
rules; their numbers live in `skill-graph.ts`/i18n catalog copy and are exempt from the constants rule and the digit test.

---

## 1. Purpose, scope, non-goals

**Purpose.** Given one dog's profile, intake answers and logged practice, produce a personalised weekly training
plan: safety mode, management steps, skills and protocol stages, a schedule, and an enrichment floor. Adapt it from
the logs. The same inputs always give the same plan.

**In scope.** Life-skill training (the skill graph in §9), protocol ladders for common problems (separation, noise,
leash reactivity, handling, muzzle, relaxation, guarding, socialisation), house training, a settling plan for
adopted dogs, senior adaptations, safety gating and referral, and adherence-aware dosing.

**Non-goals (hard).**

| # | Non-goal | Rule |
|---|---|---|
| N1 | No AI at runtime | No LLM, ML model or remote inference anywhere in plan generation. Every output is a rule over structured inputs plus authored catalog content. |
| N2 | Never prescribes medication | No drug, supplement, pheromone or dose is ever named as treatment. Fixed wording: "A veterinarian can discuss whether medication is appropriate." Neutral, not "last resort": AAHA calls medication first-line for separation and noise phobia (D02a Corr. 30; ABTC: non-vets must not discuss specific drugs). Internal note, never shown: for noise fear only dexmedetomidine, imepitoin and gabapentin have placebo-controlled support (D02b 2.1#1). |
| N3 | Never diagnoses | Observable facts only; no emotion or disorder labels (D02b Wilson 2026; D04 R-TRI-04). |
| N4 | Never treats aggression as DIY | Any tooth contact on a person, any person-directed high-tier flag, and any escalating, repeated, child- or vulnerable-adult-involved aggression → referral mode with a management-only plan (§6). AAHA: aggression never goes to a trainer for primary treatment (D02a [2]). |
| N5 | Never guarantees outcomes | No timelines, no "typical weeks", no "cured". AAHA: aggression is "never cured but can be treated and managed" (D02a [2], P-16). No source gives weeks to fluency (D05 Corr. 25). |
| N6 | Never reads free text | Owner notes, concern text and journal prose are never parsed (existing invariant). |

**Force-free is a TuringCare product policy, not professional consensus.**

| Body | Position (source actually read) |
|---|---|
| AVSAB 2021 | Reward-based only, "no evidence that aversive training is necessary"; avoid choke/prong/shock, intimidation and flooding; the learner must be able to opt out. Concedes survey evidence is correlational. (D01; D05 [12]) |
| CCPDT | *Position Statement on Behavior Change Procedures* (adopted 11/20/25, read in D01): reinforcement first under a mandatory Humane Hierarchy; **permits positive punishment and negative reinforcement** in documented safety cases after less intrusive options fail (D01 Corr. 2). The CCPDT Hierarchy PDF (D05 [17]) is undated and lists the six levels; the joint standards (4/30/23, D05 [18]) apply LIMA. |
| IAABC LIMA | `iaabc-position-lima.pdf` (D01; D02b [10]): Level 5 "may occasionally be the ethical, effective choice"; Level 6 (P+) "rarely necessary"; LIMA "does not justify" e-collar/choke/prong in place of reinforcement. |
| ABTC (UK) | ABTC home page (D05 [29]): methods "must not be based on Positive Punishment or the creation of anxiety or fear." (Not in the vet-referral PDF, D02a [12].) |

TuringCare sits at the AVSAB/ABTC end and **never** outputs positive punishment, aversive tools, intimidation,
flooding, dominance framing or punishment of growling. The basis is welfare precaution plus equal-or-better
efficacy, **not** proven harm: most evidence is correlational and moderate (Fernandes 2017; D01 Corr. 3, 24). The one
small RCT, Johnson AC & Wynne CDL 2024, "Comparison of the efficacy and welfare of different training methods in
stopping chasing behavior in dogs", *Animals* 14(18):2632, doi 10.3390/ani14182632, reportedly found that only the
e-collar group stopped lure chasing within 5 days. That result is **second-hand**, as relayed by ACVB 2025 and by
DeLeeuw & Williams 2026; the full text was not read (D02a Corr. 3, 31; LINKS 02 row 58b). It is a different paper from
Johnson & Wynne 2024, *PeerJ* 12:e18131 (leash equipment). Copy MUST NOT claim that "science proves aversives never
work".

---

## 2. Evidence policy

Every rule and numeric constant lives in **one** module, `apps/api/src/data/engine-rules.ts`:

```ts
type RuleConstant<T> = {
  id: string;                          // e.g. "ADAPT.ADVANCE_PCT"
  value: T;
  sources: string[];                   // e.g. ["D01:R19", "Feuerbacher2020"]
  confidence: "high" | "med" | "low";
  basis: "study" | "position" | "convention" | "definition";  // definition = unit/calendar facts
  advisorReview?: true;                // launch-blocking until reviewedBy is set (the only mechanism)
  reviewedBy?: string;
};
```

1. `basis: "convention"` MUST NOT have `confidence: "high"`. Copy never presents a convention number as science.
2. Engine code reads numbers only through this module, and copy numbers only through `{key, params}` (§13.4).
3. Changing any constant bumps `ENGINE_VERSION`.
4. **Recalibration (Phase 4, outside the engine).** Only `convention`/`low` constants, by offline replay of
   de-identified histories through the pure `buildPlan`; one constant per release, one step per change, and only
   with ≥200 dogs in the affected band (a process rule, not an engine constant). **Safety constants (`SAFE.*`,
   `HEAT.*`) are never loosened from logs**, only tightened; loosening needs advisor sign-off.

---

## 3. Architecture

### 3.1 One pure function

```ts
// apps/api/src/lib/plan-engine.ts
export function buildPlan(input: PlanInput): Plan;   // reads skill-graph.ts and engine-rules.ts directly
type PlanInput = {
  profile: DogProfileFacts;      // existing `dogs` row (canonical store, §4.1)
  intake: Intake | null;         // latest version: dosing, anchors, heat, unknown-answer check
  intakeAtWeekStart: Intake | null; // version in force at weekStart: item-set selection (§3.6)
  reports: AggressionReport[];   // all rows, append-only (§4.2)
  history: PlanHistory;          // §4.4
  now: string;                   // server timestamp sampled under the shared lock: all windows, ages, week boundaries
  localDate: string;             // owner-local date of `now` (route: now + timezoneOffsetMinutes); settling day, check-ins, display day
  weekStart: string;             // owner-local Monday of localDate
  hotToday: boolean;             // owner tap (§8)
};
```

It **absorbs and replaces** `lib/suggestion-rules.ts`, the rule path of `lib/suggestion.ts` and the
`nextPracticeAction` path of `lib/contextual-progress.ts`. It **reuses** `lib/curriculum.ts`,
`lib/context-adjacency.ts`, `data/training-curriculum.ts` metadata, the proposal table and `setSkillLevel`
(with the changes in §4.3), and the locks in `lib/safety-lock.ts`.

### 3.2 Files

| File | Kind | Content |
|---|---|---|
| `packages/shared/src/plan.ts` | new | Zod: intake, aggression reports, plan output (`planSchema`), plan-session body, check-in, clearance, `RationaleCode`, `StressFlag`; exported from `index.ts` |
| `apps/api/src/data/engine-rules.ts` | new | all constants (§15.1) |
| `apps/api/src/data/skill-graph.ts` | new | nodes, ladders, per-item `version`, `topStage`, domains, legacy aliases (§9) |
| `apps/api/src/lib/safety-mode.ts` | new, **pure** | `decideSafetyMode(facts)` (§6) and `toLegacySafety(mode)` (§6.8) |
| `apps/api/src/lib/plan-engine.ts` | new, **pure** | `buildPlan`, `evaluatePlanAdvancement`, signal-transition helpers (§6.5) |
| `apps/api/src/lib/safety-policy.ts` | edit | loaders and locks; `decideSafety` delegates to `safety-mode.ts` (§6.8) |
| `apps/api/src/lib/plan-store.ts` | new, IO | loaders under the shared lock; write helpers (find-or-create, signal transitions) |
| `apps/api/src/routes/plan.ts` | new | Hono sub-app (§12.1) |
| `apps/api/src/db/schema.ts` + migration | edit + `pnpm db:generate`, then an appended hand-written RLS block (as 0011/0014) | §4.6; `schema.test.ts` asserts the RLS statement for each new table |
| `apps/api/src/app.ts` | edit | mount `routes/plan.ts` |
| `packages/i18n/src/en.ts`, `es.ts` | edit | `plan.*` copy, parity |
| `apps/api/src/db/owned-skill.ts` | edit | plan-row guard (§4.3) |
| `apps/api/src/lib/purity.test.ts` | new | grep of both pure modules for `Date.now`, argument-less `new Date()`, `Math.random`, `localeCompare`, `toLocale*`, `db`; runs with `DATABASE_URL` unset |
| `apps/api/src/lib/journal-writes.ts`, `routes/dogs.ts` (`POST`/`PUT /:id/journal`), `routes/guided-setup.ts` | edit | call `syncWorseningBehaviorSignal(tx, dogId)` (plan-store) inside the existing dog-safety lock on every journal create/update (moments and daily check-ins) |
| `packages/shared/src/journal.ts` | edit | `problemDomain` required on new moments and on any PUT that yields a high-intensity moment (§5 D keys, `aggression`, `other`) |
| `packages/shared/src/practice-evidence.ts` | keep | owner-selectable `safetySignalValues` stays the 3 values; engine signal types live in `plan.ts` (`engineSignalType`); legacy schemas reject them (test) |
| `apps/api/src/db/schema.ts` (`briefs`) | edit | + `plan_snapshot jsonb` nullable: the §12.4 allowlisted projection, frozen with the Brief version |
| `routes/dogs.ts` (`POST /:id/brief`), `apps/api/src/lib/brief.ts` | edit | `briefGenerateSchema` gains a bounded `timezoneOffsetMinutes`; the snapshot is built with `buildPlan` inside the shared dog-safety lock transaction, with server `now`, and stored in `plan_snapshot` |
| `apps/api/src/lib/time.ts` | edit | receives `practiceOccurredAt` and `MAX_FUTURE_CLOCK_SKEW_MS` (moved from `routes/dogs.ts`), imported by `routes/dogs.ts`, `routes/plan.ts` and `journal-writes.ts` |
| `apps/web/src/lib/plan.ts` | new (Phase 3) | TanStack query keys and the §12.7 invalidation table |
| web quick composer + journal edit | edit (Phase 1) | `problemDomain` picker |
| web "record a vet check" form | new (Phase 1) | minimal medical clearance form |
| `apps/api/src/db/migrate-predeploy.ts` | keep `POSTDEPLOY_MIGRATIONS = []` | the migration is **drained pre-deploy**; `DEPLOY.md` §6 table and `migration-rollout.test.ts` get its row |
| `apps/api/src/lib/safety-policy.ts` constants | edit | `WORSENING_*`, `HIGH_INTENSITY_THRESHOLD` move to `engine-rules.ts`; `SAFETY_SIGNAL_WINDOW_DAYS` is deleted (no injury expiry); `safety-policy.ts` imports them; pure modules never import `safety-policy.ts` |
| `apps/api/src/lib/advancement.ts`, `practice-evidence.ts` | edit | §4.3 code changes |
| `CURRICULUM_VERSION` call sites | review | `practice-evidence.ts`, `advancement.ts`, `suggestion.ts`, `practice-anchor.ts`, `contextual-progress-data.ts`, `routes/dogs.ts`, `data/training-curriculum.ts`: legacy paths keep the global constant; plan paths use the node version |

### 3.3 Determinism (MUST)

1. No-AI denylist test: `plan-engine.ts`, `safety-mode.ts`, `plan-store.ts`, `routes/plan.ts` and `apps/api/package.json`
   import no LLM/ML SDK (`openai`, `@anthropic-ai/*`, `ai`, `@google/generative-ai`, `langchain`, `onnx*`, `@tensorflow/*`).
   In `plan-engine.ts` and `safety-mode.ts` the grep test also forbids `Date.now`, argument-less `new Date()`,
   `Math.random`, `localeCompare`, `toLocale*`, `Intl`, `process`, `fetch` and `db`. `Math`
   and `Date.UTC`/`Date.parse` on ISO strings are allowed (integer UTC-day arithmetic).
2. Every sort ends with a codepoint key comparison. History is re-sorted by `(practiceDay | reportedAt, id)`.
3. Integer percentage arithmetic (`successes * UNIT.PCT >= ADAPT.ADVANCE_PCT * trials`); day differences =
   `Math.floor((Date.parse(b) − Date.parse(a)) / UNIT.MS_PER_DAY)`; explicit `Math.floor`.
4. JSON-serialisable output; no timestamps except dates derived from `localDate`.
5. Tests: `buildPlan(x)` deep-equals `buildPlan(structuredClone(x))` and the result for shuffled history arrays. Nothing
   is persisted.

### 3.4 Versioning

- `ENGINE_VERSION`: bump on any rule, constant or algorithm change; returned in every plan and sent as
  `engineVersion` on every write-route telemetry event (§12.4).
- **Per-item evidence version:** each node and ladder has `version`; plan-route sessions store it in
  `practice_sessions.curriculum_version`; evidence for an item uses only sessions with its current version (§4.3
  changes the two places that hard-code `CURRICULUM_VERSION`). Legacy-aliased nodes start at `"2026-08-11"` so
  existing evidence stays valid. Adding a node never resets another.
- `INTAKE_SCHEMA_VERSION = "intake-1"` on each intake row; `migrateIntake` arrives with `intake-2` (deferred).

### 3.5 Reads must not write

`GET …/plan` runs in a read-only transaction holding the shared dog-safety lock and returns `buildPlan(...)`. It
writes nothing (no rows, no proposals, no server telemetry). All writes are explicit POST/PUT routes (§12.1).
No stored plan in v1: `ENGINE_VERSION` plus append-only intake versions, reports, signals, sessions, check-ins and
clearances make every plan reproducible; a plan shared with a professional is frozen inside a Brief version.

### 3.6 Week stability

**Mode, triggers and safety items** (referral/vet tasks, management) always use current facts at server `now`.
Only **teaching-item selection and stages** use the `weekStart` snapshot: `intakeAtWeekStart`, sessions with
owner-local `practice_day` < `weekStart` **and** `created_at` < `weekStartUtc` (a Sunday session logged on Wednesday
waits for next Monday; test), each skill's level at `weekStart` = `fromLevel` of the earliest confirmed
proposal decided on/after `weekStart`, else the current level; then the snapshot's items are **filtered by the current
mode**. **First-plan exception:** with no intake at `weekStart`, selection uses the latest intake. Mid-week logs change
stages and session counts only; a mid-week safety change can add task/management items and remove or zero teaching
items, never add teaching items. The distress pause (§11.6) and the puppy fear pause (G24) likewise. Maintenance rotation uses `lastPracticeDay`.

---

## 4. Data model

### 4.1 Canonical stores

| Field | Store | Engine reads |
|---|---|---|
| DOB, weight, sex, neuter, source, adoption date, vaccine stage | existing `dogs` row | `profile` |
| other intake answers | `dog_intakes.answers` | `intake`, `intakeAtWeekStart` |
| bites and warnings | `dog_aggression_reports` (append-only) | `reports` |
| sticky safety facts | `dog_safety_signals` (append-only) | `history.signals` |

- `weightKg = round(dogs.weightLbs / UNIT.LB_PER_KG, UNIT.KG_DECIMALS)`; null weight → size band from `dogs.size`. `spayedNeutered` is nullable in the engine input (information only). `dogs.source` stays on the dog row; `originDetail` (`street,
  ex_breeding, pet_shop_online, friend_family, unknown`) is an intake-only answer (§5 A7); without it, `other` → `unknown`.
- Vaccine gate: `vaccineStage = complete` → vaccinated; `in_progress` → `puppy.firstVaccineOn` + `dewormed`;
  `unknown` → not met.
- `intakeAtWeekStart`: one query, `dog_intakes where dog_id = $1 and created_at < $weekStartUtc order by version desc
  limit 1` (uses the `(dog_id, version)` unique index; `weekStartUtc` from `timezoneOffsetMinutes`).
- **Validation:** `adoptedAt ≥ dateOfBirth` (refine on the shared `dogProfileSchema`); an existing violating row is
  treated as `adoptedAt = null` with `NOTICE_PROFILE_DATES`.
- **No intake / unanswered items:** never mapped to "no". Unanswered required safety items (§6.3 G30) make the mode
  at least CAUTION and are listed as `blockingQuestions`. C1/C2 answered "yes" with no matching report count as
  unanswered. B3/B5 "yes" signals are sticky like G14 (resolved only by a medical clearance). Non-safety defaults: no problems, traits null, baseline 0,
  minutesPerDay `DOSE.DEFAULT_MINUTES_PER_DAY`, anchors [after_breakfast], goals [].

### 4.2 Shared schemas (`packages/shared/src/plan.ts`)

Abridged. Enum values not spelled out here are listed in: `problemKey` §5 D; `traitKey` §5 E; `baselineKey` §5 F;
`goalKey` §10.4 goal table; `anchorKey` §5 G; `rationaleCode` §15.2; `safetyMode` §6.1; `lifeBand` §7.1;
`checkinKind` §4.6; `referralCategory` = existing `referralCategoryValues` plus `credentialed_behavior_consultant`.
Object schemas named but not expanded (`profileAnswersSchema`, `healthSchema`, `safetySchema`, …) have exactly the
fields of the matching §5 table.

```ts
export const incidentContext = z.enum(["handling","food_or_item","resting","approach","visitor","on_lead","play","unknown"]);
export const heatBreedKey = z.enum(["pug","french_bulldog","bulldog","boston_terrier","pekingese","shih_tzu",
  "chow_chow","greyhound","english_springer","cavalier_kcs","staffordshire_bt"]);
const yesNoUnknown = z.enum(["yes","no"]).nullable();      // null = unanswered (never "no")

export const biteReportSchema = z.object({
  kind: z.literal("bite"), occurredOn: z.string().date(),
  target: z.enum(["adult","child","vulnerable_adult","dog","other_animal"]),
  teethOnSkin: z.boolean(), skinBroken: z.boolean(), holes: z.enum(["none","shallow","deep"]),
  separateBites: z.number().int().min(1).max(20), heldOrShook: z.boolean(),
  care: z.enum(["none","first_aid","doctor_or_vet","hospital"]), victimDied: z.boolean(),
  context: incidentContext, predictable: z.enum(["yes","no","unsure"]),
}).refine((b) => !b.skinBroken || b.teethOnSkin)
  .refine((b) => b.holes === "none" || b.skinBroken)
  .refine((b) => b.teethOnSkin || !(b.heldOrShook || b.victimDied || b.separateBites > 1 ||
                                    b.care === "doctor_or_vet" || b.care === "hospital"));

export const warningReportSchema = z.object({       // growl, stiffen, lip curl, snap without contact; dated by reported_at
  kind: z.literal("warning"), target: z.enum(["adult","child","vulnerable_adult"]),
  contexts: z.array(incidentContext).min(1), frequency: z.number().int().min(0).max(4),
  escalating: z.boolean(), predictable: z.enum(["yes","no","unsure"]),
});
export const aggressionReportSchema = z.discriminatedUnion("kind", [biteReportSchema, warningReportSchema]);

export const intakeSchema = z.object({
  schemaVersion: z.literal("intake-1"),
  profile: profileAnswersSchema,  // §5 A
  puppy: puppyVaccineSchema.nullable(),
  health: healthSchema,           // §5 B (yesNoUnknown for B3/B4-none/B5)
  safety: safetySchema,           // §5 C: noBites, noWarnings, C3–C9 as yesNoUnknown
  problems: z.array(problemSchema).max(17),   // §5 D incl. onset, firstSignAfterS; unique by key (refine)
  traits: traitsSchema, baseline: baselineSchema, owner: ownerSchema, goals: z.array(goalKey).max(3),
});   // refines: problems (by key), goals, owner.anchors and profile.heatBreeds have no duplicates (test)

export const clearanceSchema = z.object({
  role: z.enum(["veterinarian","veterinary_behaviorist","credentialed_behavior_consultant"]),
  scope: z.array(z.enum(["medical","behavior"])).min(1).max(2),
  constraint: z.enum(["full_plan","low_impact_only"]),
  professionalName: z.string().trim().min(1).max(120), organisation: z.string().trim().min(1).max(120),
  country: z.string().regex(/^[A-Z]{2}$/), credentialRef: z.string().trim().max(64).nullable(),
  clearedOn: z.string().date(),
}).refine((c) => !c.scope.includes("medical") || c.role !== "credentialed_behavior_consultant");
// medical scope needs veterinarian/veterinary_behaviorist (else 400); text is never rendered as HTML or sent to telemetry

export const planItemSchema = z.object({
  key: z.string(), kind: z.enum(["task","management","routine","skill","protocol","enrichment"]),
  stage: z.number().int().min(0).nullable(), topStage: z.number().int().min(1).nullable(),
  sessionsPerWeek: z.number().int().min(0), sessionMinutes: z.number().int().min(0),
  copy: z.array(z.object({ key: z.string(), params: z.record(z.string(), z.number()) })),
  rationale: z.array(rationaleCode).min(1),
});
export const planSchema = z.object({
  engineVersion: z.string(), intakeVersion: z.number().int().nullable(), today: z.string().date(),   // = localDate
  weekStart: z.string().date(),
  safety: z.object({ mode: safetyMode, triggers: z.array(rationaleCode), referrals: z.array(referralCategory),
    urgent: z.boolean(), pausedDomains: z.array(z.string()), blockingQuestions: z.array(z.string()) }),
  lifeStage: z.object({ band: lifeBand, ageWeeks: z.number().int().nullable(), settlingDay: z.number().int().nullable() }),
  heat: z.object({ dogRisk: z.enum(["standard","elevated","high"]), today: z.enum(["normal","caution","no_exertion","unknown"]) }),
  items: z.array(planItemSchema),
  days: z.array(z.object({ date: z.string().date(),
    sessions: z.array(z.object({ itemKey: z.string(), anchor: anchorKey, minutes: z.number().int() })) })).length(7),
  notices: z.array(rationaleCode), checkInsDue: z.array(checkinKind),
});
```

### 4.3 Practice storage and advancement (one model)

- **Plan rows.** Every logged plan item (skills and protocols) has its own `training_skills` row under one per-dog
  system goal (`training_goals.catalog_goal_key = 'plan'`), with `catalog_skill_key` = item id. Legacy template
  rows are **never reused** for plan logging; their stored levels and evidence are read (alias union, §9.3).
- **Created only on write.** The first `POST …/plan/sessions` for an item find-or-creates goal and row inside the
  exclusive safety-lock transaction, with `confidence` = the engine's start stage for that item at that moment
  (baseline and legacy alias levels **seed** this value only). GET never creates rows.
- **One guard.** `findOwnedSkill(userId, dogId, skillId, executor, lock, { includePlan = false })` filters
  `training_goals.catalog_goal_key IS DISTINCT FROM 'plan'` unless `includePlan`. Every legacy route uses the default,
  so plan rows are **404** on: `GET /:id/skills/:skillId/contextual-progress`, `PUT /:id/skills/:skillId`,
  `PUT /:id/skills/:skillId/level`, `DELETE /:id/skills/:skillId`, `POST /:id/skills/:skillId/sessions`,
  `PATCH /:id/skills/:skillId/sessions/:sessionId/evidence`, `DELETE /:id/skills/:skillId/sessions/:sessionId`,
  `POST /:id/focus`. The inline goal lookups of `DELETE /:id/goals/:goalId` and `POST /:id/goals/:goalId/skills` add the
  same filter. Opt in (`includePlan: true`): the plan routes and the advancement-decision route. Legacy aggregates
  (`GET /api/dogs/:id` goal list, `progress.ts`, `focus.ts`, `dogs-overview.ts`, `onboarding.ts`, guided setup, Brief
  goal lists) filter the same way.
- **Skills:** once a plan row exists, stored level = its `confidence` (clamped to `topStage` ≤5); baseline and legacy
  levels are no longer consulted. The session runner uses `sessionStage = max(1, storedLevel − stepBack)`, with
  `stepBack` ∈ {0, 1} from §11.2; the stored level changes only through owner-confirmed advancement (as today). **Protocols:**
  `confidence` stays 1 and is never proposed; the stage is derived from `practice_sessions.protocol_stage` (§11.3).
- **Plan-session body** (shared Zod; **required**: `itemKey`, `idempotencyKey`, `occurredAt`, `timezoneOffsetMinutes`,
  `trials`, `successes`; a client `outcome` is rejected): `stressFlags`, `optOuts`, `socCategory` (required for
  `protocol.socialization`), `bodyArea` (required for `protocol.handling`), `protocolStage` (required for protocols),
  `durationMinutes`, `notes`, `flagTarget` (`person`/`animal`; refine: required when a high-tier aggression flag is set,
  else 400). `occurredAt` is checked by `practiceOccurredAt` (moved to `lib/time.ts`; future beyond
  `MAX_FUTURE_CLOCK_SKEW_MS` → 400). The same rule applies to journal POST/PUT `occurredAt` (`journal-writes.ts` and
  the PUT route); guided setup sets times server-side and needs no check. The server sets `practiceDay`
  (owner-local), `curriculumLevel` = the **stored level** (skills), `practiceVariant` = `'primary'` when the session ran
  at the stored level and `'fallback'` when it ran at a stepped-back `sessionStage` (so legacy evidence predicates,
  which require `primary` at the stored level, still hold), `curriculumVersion` = node version, and derives `outcome`.
- **Code changes:**
  - `practice-evidence.ts`: `loadSkillEvidence(skillId, level, now, version = CURRICULUM_VERSION)`; plan callers pass
    the node version.
  - `advancement.ts`: `advancement_proposals` gains `item_version text not null default '2026-08-11'`; confirm-time
    staleness compares sessions' `curriculum_version` with the proposal's `item_version` instead of the global
    constant; `confirmed` sets the level via `setSkillLevel`, clamped to the node `topStage`. For plan rows the decision route checks `decideSafetyMode` (the item must be allowed
    by the mode and `pausedDomains`), not the legacy adapter.
  - **Plan skills use `evaluatePlanAdvancement`** (pure, §11.2), not `evaluateAdvancement`, and a plan-row variant
    of the sync and decide paths (`syncPlanAdvancementProposalInTx`, used on every plan-session write and at
    confirm): the evidence arrays store the §11.2 window (session ids, occurredAt, practice days, server-derived
    outcomes; counts and window days as today). The proposal stays valid while every window session still exists
    unchanged as `primary` at `fromLevel` with the proposal's `item_version` and the aggregate trial rule still holds
    over them; there is **no per-session `went_well` requirement** and no 3-session slice. Otherwise it is withdrawn.
    API test: a window containing a `mixed` session yields a proposal that persists and can be confirmed. Legacy skills
    keep `evaluateAdvancement` and `syncAdvancementProposalInTx` unchanged (3 `went_well` on ≥2 days).
- **Protocol stage (one definition, used for prerequisites, the server cap and §11.3):** per (item,
  `body_area`/`soc_category`), derived stage = min(latest logged `protocol_stage`, highest stage with a non-failed
  session); with no non-failed session it is the §9.2 start stage. Read with indexes `(skill_id, practice_day desc)`,
  `(skill_id, body_area, practice_day desc)` and `(skill_id, soc_category, practice_day desc)`.
  The server accepts `1 ≤ protocolStage ≤ min(derived + 1, ladder length)`, else 400; for a first `protocol.noise`
  session it accepts `1…NOISE.MAX_STEP`.
- **Idempotency:** `POST …/aggression-reports` and `POST …/plan/sessions` require a client `idempotencyKey` (uuid);
  unique `(dog_id, idempotency_key)` on reports and `(skill_id, idempotency_key)` on sessions, each storing a SHA-256
  `payload_hash` of the canonical body; a replay with the same hash returns the original row (200), a different hash
  → 409.
- Routines, management and enrichment items are not practice-logged in v1.
- Owner isolation: `findOwnedDog`; non-owned or malformed UUID → 404; unknown `itemKey` → 400.

### 4.4 History

```ts
type PlanHistory = {
  sessions: SessionLog[];     // last HIST.WINDOW_DAYS days by practiceDay (skill adaptation and completion)
  protocolLatest: { key: string; area: string | null; stage: number; stageAtWeekStart: number | null; recent: SessionLog[] }[]; // last DSCC.FAIL_SESSIONS_REGATE sessions
  skillLevels: { key: string; level: number; isPlanRow: boolean }[];
  checkins: PlanCheckin[];    // last HIST.CHECKIN_WEEKS weeks
  signals: { type: SafetySignalType; source: SafetySignalSource; reportedAt: string; problemKey: string | null }[];
  journal: { problemDomain: string | null; intensity: number | null; kind: "moment" | "daily_checkin";
             trend: "better" | "same" | "harder" | null; occurredAt: string }[];  // last WORSENING_WINDOW_DAYS
  confirmedProposals: { key: string; fromLevel: number; decidedAt: string }[];   // for levels at weekStart
  clearances: Clearance[];
};
```

Safety triggers read `signals` and `reports` (§6.5), except G22 and the VET part of G21, which are read-time over
`journal` (§11.5).

### 4.5 Session log fields (extend `practice_sessions`; all nullable)

| Column | Type | Notes |
|---|---|---|
| `protocol_stage` | int, CHECK 0–`DSCC.MAX_STAGE` | protocols |
| `trials` / `successes` | int 1–50 / 0–trials | D06 L1 (conv) |
| `flag_target` | `person`, `animal` | required with a high-tier aggression flag |
| `stress_flags` | enum[] | below |
| `opt_outs` | int | §9.4 |
| `soc_category` | `people,dogs,surfaces,sounds,handling,car,alone` | required for socialisation sessions |
| `body_area` | `head_ears,mouth,eyes,paws_nails,body,tail,restraint` | required for handling sessions; stage per area |
| `outcome` | existing | **always server-derived, in this one place**: `too_hard` if <`ADAPT.END_PCT` % successes, any medium/high flag (incl. pain), or `opt_outs` ≥ the item's limit (relaxation get-ups → `RELAX.GETUPS_MAX`; muzzle pawing and handling opt-outs → `ADAPT.OPT_OUTS_MAX`); else `went_well` if ≥`ADAPT.ADVANCE_PCT` %; else `mixed` |

**Stress flags** (AAHA Table 1 / Purdue items; tiers are convention because AAHA Table 1 is unranked, D02a Corr. 21):

| Tier | Flags | Effect |
|---|---|---|
| low | `lip_lick, yawn, look_away, scanning, shake_off, paw_lift, slow_moving` | 1: next rep easier; ≥`ADAPT.STRESS_LOW_END_COUNT` distinct: end, hold |
| medium | `panting_no_exertion, pacing, whale_eye, ears_pinned, tail_tucked, freezing, refuses_food, trembling, drooling, vocalising_alone, destruction_alone, soiling_alone` | end; step back |
| high, aggression | `stiff_stare, growl, lip_curl, air_snap, snap, lunge, bite` | end; step back; signal per the table below; `bite` also opens the bite-report form (extra step) |
| high, fear/panic | `shutdown` → `severe_fear_or_panic`; `panic_escape`, `self_injury` → `self_injury_or_panic_escape` | end; step back; signal read by G10 / G08 |
| high, pain | `yelp_or_pain_response` (yelps, limps or flinches as if hurt) → `injury_or_pain` (source `practice_session`) | end; L1 VET_CHECK (G14), resolvable by medical clearance |

**Aggression-flag signal rule** (★ advisor review). High-tier aggression flags carry `flag_target` (column above).

| Flag, context | Signal written | Effect |
|---|---|---|
| `lunge` or `stiff_stare`, target animal, no contact, inside any node with the `exposure` flag (§9.1) | `reactivity` (CAUTION, G26) | expected below-threshold failure: end, step back (§11) |
| `growl`, `lip_curl`, `air_snap`, `snap` with target animal, inside or outside exposure nodes | `aggression_or_bite_risk` | L1 floor REFER_BEHAVIOR (stricter than lunge/stare: vocal or snapping escalation; golden 79) |
| `growl`, `lip_curl`, `air_snap`, `snap`, `bite` with target person (any item) | `aggression_or_bite_risk` (source `practice_session`) | L1 floor REFER_BEHAVIOR |
| `bite` with target animal (any item) | `aggression_or_bite_risk` | L1 floor REFER_BEHAVIOR |
| any aggression flag in any other item or context | `aggression_or_bite_risk` | L1 floor REFER_BEHAVIOR |

### 4.6 Migration (one, additive)

| Object | Definition |
|---|---|
| `dog_intakes` | `id`, `dog_id → dogs cascade`, `version`, `schema_version`, `answers jsonb` (Zod on write and read), `created_at`; unique `(dog_id, version)`; append-only |
| `dog_aggression_reports` | `id`, `dog_id → dogs cascade`, `kind`, bite columns, warning columns, `context`/`contexts`, `predictable`, `reported_at timestamptz default now()`; CHECKs per kind; `idempotency_key uuid not null`, `payload_hash text not null`, unique `(dog_id, idempotency_key)`. **No API can edit or delete a row**; rows disappear only when the dog itself is deleted (existing account/dog deletion cascade, which is already guarded by `brief_sends` claims). Corrections via the safety-correction runbook (extended in Phase 1 to cover reports and clearances). Index `(dog_id, reported_at)`. |
| `plan_checkins` | `id`, `dog_id`, `kind enum(weekly, adoption_d7, adoption_d30, adoption_d90, adoption_d180)`, `week_start date` CHECK isodow = 1, `distress smallint 0–3` (weekly), `skip_reason enum(no_time, dog_unwell, owner_away, plan_too_hard, other)` nullable, `created_at`; unique `(dog_id, kind, week_start)`; partial unique `(dog_id, kind) where kind <> 'weekly'` |
| `dog_safety_clearances` | `id`, `dog_id`, `cleared_by_role enum(veterinarian, veterinary_behaviorist, credentialed_behavior_consultant)`, `scope enum[](medical, behavior)`, `constraint enum(full_plan, low_impact_only)`, `professional_name`, `organisation`, `country char(2)`, `credential_ref` nullable, `cleared_on`, `created_at`; CHECK medical scope ⇒ veterinary role; no API edit/delete; index `(dog_id, created_at)` |
| `training_skills` | unique `(goal_id, catalog_skill_key)` (verify no duplicates first) |
| `training_goals` | partial unique `(dog_id) where catalog_goal_key = 'plan'` |
| `advancement_proposals` | + `item_version` (§4.3) |
| `practice_sessions` | + §4.5 columns, `idempotency_key uuid`, `payload_hash text` nullable (set by the plan route); indexes `(skill_id, practice_day desc)`, `(skill_id, body_area, practice_day desc)`, `(skill_id, soc_category, practice_day desc)`; unique `(skill_id, idempotency_key)` |
| `journal_entries` | + `problem_domain` (§5 D keys, `aggression`, `other`); required on new moments by the shared schema (missing → 400 with stable code `problem_domain_required`; the web keeps the draft and prompts a reload, covering stale bundles during rollout), null on legacy rows and check-ins (a null high-intensity moment is treated as G21, §11.5) |
| `safety_signal_type` | + `self_injury_or_panic_escape, repetitive_behavior, rehoming_or_euthanasia_considered, pain_signs, sudden_onset_change, medical_change, late_onset_change, dishaa_signs, adult_house_soiling, separation_severe, separation_signs, separation_mild, noise_panic, noise_mild, reactivity, fear_problem, aversive_history, puppy_fear, no_progress, plan_distress, household_child, household_vulnerable, worsening_behavior`; plus a nullable `problem_key` column (§5 D keys or `aggression`) used by pauses (`aggression_or_bite_risk`, `severe_fear_or_panic`, `injury_or_pain`, `severe_behavior_concern` exist) |
| `safety_signal_source` | + `intake, plan_checkin, journal_entry` |
| `briefs` | + `plan_snapshot jsonb` nullable (frozen allowlisted plan projection, §12.4) |
| RLS | `ENABLE ROW LEVEL SECURITY`, no policies, no FORCE, on every new table, appended by hand to the generated SQL (as 0011/0014); per-table assertion in `schema.test.ts` |

Rollout: **drained pre-deploy** (like 0013–0026): `POSTDEPLOY_MIGRATIONS` stays `[]`; the PR adds the migration's row
to the `DEPLOY.md` §6 table and to `migration-rollout.test.ts`. New enum values are only used by code deployed after
the migration commits. No backfill.

---

## 5. Intake questionnaire

Wording is **original**; it mirrors C-BARQ, DIAS, LSSS, LCAS, DAFRS, CFQ, CCDR and CADES constructs but copies no
items, scoring or norms (C-BARQ © Serpell/Penn; DIAS/LSSS Lincoln restricted licence; others unstated; D04 §6).
Never use "responds positively to correction" (D04 R23). Frequency: 0 never … 4 always; "not sure"/unanswered =
null. A domain score needs ≥`INTAKE.MIN_ANSWERED` of its items. Ask about specific situations, never "Does your dog
have problems?" (Powell 2021, D03 R-INTAKE-Q). **Required safety items** (marked S) left unanswered make the plan
at least CAUTION (G30).

**A. Profile** (DOB, weight, sex, neuter, source, adoption date, vaccine stage are on the dog form)

| Field | Question | Scale | Feeds | Evidence |
|---|---|---|---|---|
| A1 dobEstimated | "Is the birth date an estimate?" | yes/no | copy | — |
| A3 bodyCondition9 | "Which picture looks most like your dog?" | 1–9 | heat, vet note | Packer 2015; Tomlinson 2026 |
| A4 heatBreeds | "Is your dog one of these breeds, or mostly one of them?" | ≤3 of `heatBreedKey` | heat only | Hall 2020; Packer 2015 |
| A5 flatFaced (+ muzzle/skull cm) | "Is your dog's face flat or short-nosed?" | yes/no/unsure; cm | brachy flag | Packer 2015 |
| A6 expectedLifespanY | "If your vet has said how long dogs like yours usually live, enter it." | years | senior band | AAHA 2019 |
| A7 originDetail | "Where did your dog live before you?" | §4.1 | settling | D03 R-SETTLE |

**B. Health**

| Field | Question | Scale | S | Feeds | Evidence |
|---|---|---|---|---|---|
| B1 vetSeen12mo | "Has a vet examined your dog in the last 12 months?" | yes/no/unsure | | notice | D02a G-01 |
| B2 conditions | joint/mobility, heart/breathing, skin/ear, stomach/gut, seizures, thyroid, eye/hearing loss, other | multi | | low-impact, heat | Camps 2019; Mills 2020 |
| B3 medicationChange | "Has your dog started, stopped or changed any medicine in the last 8 weeks?" | yes/no | S | G17 | D02a G-04 |
| B4 painSigns | slow to get up; avoids stairs or jumping; limps; flinches or snaps when touched; licks one spot a lot; slips on floors; restless at night; "none of these" | multi | S | G14 | partly Mills 2020; list and count conv (D04 R11) |
| B5 changeOnset | "Did a behaviour you're worried about start or get much worse within the last 4 weeks?" + which problem | yes/no + problem key | S | G15 | D02a G-02 |
| B7 dishaa (≥`STAGE.SENIOR_SCREEN_Y`, senior, or DOB unknown) | gets lost or stuck; less interested in people; sleep–wake changed; new indoor accidents; less active; new worries | 0–4 each | S when shown | G18 | AAHA 2023 |
| B9 hearingVision | "Has your dog's hearing or eyesight changed?" | none/hearing/vision/both | | cues | Hopper 2024 |

**C. Safety.** C1/C2 incidents are **append-only reports** (`POST …/aggression-reports`); the intake only stores
whether the owner answered "no incidents". "Yes" with no matching report counts as unanswered (G30) until a report
is filed. C3/C4 "yes" are written as sticky signals (§6.5).

| Field | Question | S | Feeds | Evidence |
|---|---|---|---|---|
| C1 bites | "Has your dog ever put its teeth on a person or animal, even without hurting them?" yes → one report per incident (fields §4.2: who; teeth on skin (clothing only = no); skin broken; holes shallow/deep; separate bites; held or shook; care; (carefully worded) did the person or animal die; situation; predictable) / no → `noBites` | S | §6.2 | D02a Corr. 32 |
| C2 warnings | "In the last 12 months, has your dog growled, stiffened, curled a lip or snapped (no contact) at a person?" yes → report (at whom; situations; how often 0–4; more frequent or intense; predictable) / no → `noWarnings` | S | G05–G07 | D02a G-07, G-08 |
| C3 children | "Do children aged 14 or under live with or regularly visit your dog?" (the cutoff lives in this text) | S | G05, `HH_CHILD_CONTENT` | §6.3b |
| C4 vulnerableAdults | "Does anyone frail, immunocompromised or with limited mobility live with or regularly visit your dog?" | S | G05 | AAHA; D02a G-09, P-09 |
| C5 panicSelfInjury | "Has your dog hurt itself, broken teeth or claws, or escaped through a door/window/crate when scared or alone?" | S | G08 | D02a G-10 |
| C6 repetitive | "Does your dog repeat an action (spinning, chasing its tail or shadows, licking) so much it's hard to interrupt or it stops normal activities?" | S | G09 | AAHA Table 5 |
| C7 rehoming | "Are you considering rehoming your dog or ending its life because of its behaviour?" (yes/no/prefer not to say = unanswered) | S | G13 | ACVB 2025 |
| C8 aversiveHistory | "Has your dog ever been trained with a prong, choke, shock/e-collar, spray, leash jerks, or by being pinned?" | S | G23 | D01 R4 |
| C9 foodRefusal | "When scared, has your dog refused food for more than a day?" | S | G10 | D02a G-13 |

**D. Problems** (max 17: jumping, mouthing, pulling, barking, leash_reactivity_dogs, leash_reactivity_people,
guarding_food, guarding_items, guarding_resting_place, separation, noise, house_soiling, chasing, fear_strangers,
fear_dogs, fear_handling, fear_new_places). Per problem: frequency 0–4; intensity 1–5; **onset band**
(`before_6mo, 6mo_to_2y, 2y_to_7y, 7y_or_older, unknown`) for G16; `startDistanceM` (reactivity); separation
`aloneSigns` (vocalising <5 / 5–15 / >15 min, pacing, panting, drooling, destruction, soiling occasional / every
absence, scratching exits, self-injury) and `firstSignAfterS` (owner-measured on video, nullable; null → absence
stage 1); noise: recovery (minutes / hours / next day / days or more), hides, escape attempt; guarding: resource and
context (McGuire 2020: capture the specific case).

**E. Traits** (original 0–4 items): energy, social fear, non-social fear, touch sensitivity, separation, chasing.
Estimate = observed domain mean; no breed or size prior (§8.5). Never a gate.

**F. Baseline skills** (0 no, 1 at home with help, 2 at home on cue, 3 outside on cue): sit → `pos.sit`; down →
`pos.down`; come indoors → `recall`; loose lead → `lead.loose`; settle on a mat → `calm.settle_mat`; alone 5 min
calmly → `self.settle`; harness/collar → `handle.collar_harness`; brushed/paws → `handle.groom_exam`.

**G. Owner and household**

| Field | Scale | Feeds | Evidence |
|---|---|---|---|
| minutesPerDay | 0–60 | dosing | D06 D1 (conv) |
| anchors | 1–3 of after_breakfast, after_walk, lunchtime, before_dinner, evening | schedule | Gollwitzer & Sheeran 2006 (smaller after bias correction, D06 C18) |
| experience | first dog / had dogs / trained dogs before | coaching copy only | covariate |
| household: other dogs, cats/small pets, home type, garden, trainers 1/several | enums | §10.8 | D06 HH (conv) |
| exerciseBand, aloneHoursBand | bands | separation questions shown | Sulkama 2021; Tiira 2015 |
| rewards | ranked | §10.7 | Feuerbacher 2012; Lazaro 2023 |
| equipment | collar, harnesses, long line, crate, basket muzzle (+ trained?) | notes | Cavalli 2025 (D06 S25) |
| goals | ≤3, ordered | P3 | Daniels 2023 |
| puppy (age <`VAX.ASK_MAX_AGE_WK`): firstVaccineOn, dewormed | date; yes/no/unsure | vaccine gate | AVSAB 2008 |

---

## 6. Safety gate (`lib/safety-mode.ts`, pure)

### 6.1 Modes (most restrictive wins; default CLEAR)

| Mode | Plan may contain |
|---|---|
| `SAFETY_ONLY` | `task.behavior_referral`, plus `task.vet_visit` when any VET_CHECK trigger is active, plus the management keys of every active G01 and G05 trigger (G05 first, §6.7); `days` = 7 entries with empty sessions |
| `REFER_BEHAVIOR` | referral task, plus `task.vet_visit` when any VET_CHECK trigger is active, management (§6.7), enrichment, `protocol.relaxation` at home, maintenance outside paused domains; no exposure items, no new skills |
| `VET_CHECK` | vet task; items in `pausedDomains` removed (§6.3a); G20 keeps teaching items with 0 sessions; everything else continues, including new teaching |
| `CAUTION` | full plan, plus each CAUTION trigger's management keys (§6.7) and its P2 targets, and a banner. Removals: G07, G04a and G30 remove **all exposure-flag items** (§15.3 row 52); G07 and G30 also remove `handle.stranger_pet`, `greet.polite`, `coop.vet_exam`, `calm.settle_public`; G04a also removes `soc.dog_pass`, `calm.settle_public`; G26 removes `soc.dog_pass`, `calm.settle_public`, `handle.stranger_pet` and the `dogs`/`people` categories; G28 removes the nodes tied to each named fear (fear_strangers → `handle.stranger_pet`, `greet.polite`, `coop.vet_exam`, `people` category; fear_dogs → `soc.dog_pass`, `calm.settle_public`, `dogs` category; fear_new_places → `calm.settle_public`, `lead.road`, `surfaces` category; fear_handling → `handle.groom_exam`, `coop.vet_exam`) |
| `CLEAR` | full plan |

`SAFETY_ONLY > REFER_BEHAVIOR > VET_CHECK > CAUTION > CLEAR`. No matching trigger → `CLEAR` (`SAFE_CLEAR`).

### 6.2 Bite tiers and `multipleBites` (from bite reports)

Per incident, first match from the top (T1 is checked first, so a clothing-only incident is always T1). Tiers are an
ordered string union `"T1" | … | "T6"`, compared by index in `TIERS = ["T1",…,"T6"]`:

| Tier | Match, in order | Dunbar anchor | Engine convention |
|---|---|---|---|
| T1 | `teethOnSkin = false` | L1 "no contact" | clothing-only contact |
| T6 | `victimDied` | L6 | — |
| T5 | `care = hospital`, or (`separateBites ≥ SAFE.MULTI_BITE_MIN` and (`holes = deep` or `heldOrShook`)) | L5 "multiple bites" | hospital mapping; deep/held qualifier |
| T4 | `holes = deep`, `heldOrShook`, or `care = doctor_or_vet` | L4 "deep puncture" | held/care mappings |
| T3 | `holes = shallow` | L3 "shallow puncture" | any number of shallow bites |
| T2 | otherwise (teeth on skin, no hole; includes a graze) | L2 "no puncture" | graze as T2 |

Refinements (§4.2) make T3–T6 imply teeth on skin; `predictable = unsure` is treated as not predictable everywhere. Class tier (person = adult/child/vulnerable_adult; animal =
dog/other_animal) = max over the class. `multipleBites(class)` = any incident with `separateBites ≥
SAFE.MULTI_BITE_MIN` and tier ≥T2, or ≥`SAFE.MULTI_BITE_MIN` incidents with tier ≥T2. T1 person incidents are
evaluated as warnings (G05–G07). The handout defines only the six labels; the mappings in the last column
(conv, low, ★) (D02a Corr. 18, 32; D02b 2.1#19).

### 6.3 Trigger table (exhaustive)

HD = human-directed: any person-target bite report or any warning report. Paused domains use §6.3a.

| id | IF (reads) | Mode | urgent | Paused | Constants | Basis | Sources |
|---|---|---|---|---|---|---|---|
| G01 | person or animal tier ≥T5 (reports) | SAFETY_ONLY | yes | all | `SAFE.SAFETY_ONLY_TIER` | position, med | Dunbar; AAHA |
| G02 | person tier T3–T4, `multipleBites(person)`, any T≥2 on child/vulnerable adult, or animal tier T3–T4 (reports) | REFER_BEHAVIOR | yes (person) | aggression | `SAFE.URGENT_TIER` | position (deep bites, immunocompromised) + conv, med, ★ | AAHA; D02a G-06 |
| G03 | person tier T2 not caught by G02 (reports) | REFER_BEHAVIOR | no | aggression | `SAFE.REFER_MIN_TIER` | position+conv, med, ★ | §6.3b |
| G04a | animal tier T1–T2, one incident, `predictable = yes` (reports) | CAUTION | no | — | — | conv, low | D02a G-08 |
| G04b | animal tier T1–T2 with ≥`SAFE.ANIMAL_REPEAT_MIN` incidents or `predictable` ∈ {no, unsure} (reports) | REFER_BEHAVIOR | no | aggression | `SAFE.ANIMAL_REPEAT_MIN` | conv, low, ★ | AAHA Table 5 |
| G05 | signal `household_child` or `household_vulnerable` (C3/C4 yes, sticky) and any HD report, **or** any report whose target is child or vulnerable_adult on its own; **no decay** | REFER_BEHAVIOR | yes if person T≥2 | aggression | — (cutoff in C3 text) | position high / conv age, ★ | §6.3c; D02a G-09, P-09 |
| G06 | any warning escalating, or ≥`SAFE.MULTI_CONTEXT_MIN` contexts, or ≥`SAFE.MULTI_TARGET_MIN` target types, or any human-directed report (warning or bite) with `predictable` ∈ {no, unsure}; or ≥`SAFE.T1_REPEAT_MIN` T1 person incidents | REFER_BEHAVIOR | no | aggression | as named | position, high | AAHA; AVSAB 2026; Dogs Trust |
| G07 | any other HD report, no G05 | CAUTION | no | — | — | position, low-med | D02a G-08; McGuire 2020 |
| G08 | signal `self_injury_or_panic_escape` | REFER_BEHAVIOR | yes | fear, separation, noise | — | position, high | AAHA |
| G09 | signal `repetitive_behavior` | REFER_BEHAVIOR | no | — (management only) | — | position, med | AAHA Table 5 |
| G10 | signal `severe_fear_or_panic` (C9, `shutdown`, or ≥`SAFE.FEAR_SEVERE_CATEGORIES` fear problems at intensity ≥`SAFE.FEAR_SEVERE_INTENSITY`) | REFER_BEHAVIOR | no | fear | `SAFE.FEAR_SEVERE_CATEGORIES`, `SAFE.FEAR_SEVERE_INTENSITY` | position+conv, med | D02a G-13 |
| G11 | signal `separation_severe` | REFER_BEHAVIOR | no | separation | §6.4 | position, med | AAHA |
| G12 | signal `noise_panic` (escape attempt, or recovery ≥`SAFE.NOISE_RECOVERY_DAYS` day) | REFER_BEHAVIOR | no | noise | `SAFE.NOISE_RECOVERY_DAYS` | conv, low (Riemer 2019: ~15% of fearful dogs beyond the next day) | D02b R-NOISE-02 |
| G13 | signal `rehoming_or_euthanasia_considered` | REFER_BEHAVIOR | no | — | — | position / conv | ACVB 2025; D02a Corr. 27 |
| G14 | signal `pain_signs` (≥`SAFE.PAIN_SIGNS_MIN` B4 signs) or `injury_or_pain` | VET_CHECK | no | physical, exposure, handling | `SAFE.PAIN_SIGNS_MIN` | position high / conv low | Mills 2020; IAABC L1 |
| G15 | signal `sudden_onset_change` (with `problem_key`); sticky, resolved only by a medical clearance | VET_CHECK | no | its `problem_key` | — | conv, low | D02a G-02 |
| G16 | signal `late_onset_change` (a problem with onset `7y_or_older`; `problem_key`) | VET_CHECK | no | its `problem_key` | — (the `7y_or_older` band label carries the number) | principle position low (Camps 2019; Fagundes 2018); number conv | D04 N19 |
| G17 | signal `medical_change` (written when B3 becomes yes; the fact is B3 yes alone); sticky, resolved only by a medical clearance | VET_CHECK | no | — | — | conv, low | D02a G-04 |
| G18 | read time: (senior band, age ≥`STAGE.SENIOR_SCREEN_Y`, or DOB unknown) and signal `dishaa_signs` (any DISHAA item ≥`SAFE.DISHAA_ITEM_MIN`); or signal `adult_house_soiling` (written only when the house_soiling answer becomes yes while the dog is in the adult or senior band) | VET_CHECK | no | house_training | `SAFE.DISHAA_ITEM_MIN` | position high (AAHA 2023: CCD "may be a diagnosis of exclusion") / conv | D03 R-CCD |
| G19 | signal `no_progress` with `problem_key` (written on the session write when the item's last `DSCC.FAIL_SESSIONS_REGATE` sessions after the latest resolving clearance all failed, **only for items selected by a P2 problem**; one signal per current problem whose P2 targets include the item) | VET_CHECK; **plus a non-clearable REFER_BEHAVIOR floor if any such problem is guarding_* or fear_*** | no | each `problem_key` | `DSCC.FAIL_SESSIONS_REGATE` | conv, low | D02a G-05, P-04 |
| G20 | signal `plan_distress` (weekly distress ≥`ADAPT.DISTRESS_PAUSE` in `ADAPT.DISTRESS_REFER_WEEKS` consecutive weeks) | VET_CHECK | no | all teaching (0 sessions) | — | conv, low (extrapolated from LAIR) | D06 A8 |
| G21 | §11.5 pattern with a qualifying moment whose `problem_domain` is outside the trainer allowlist (jumping, mouthing, pulling, barking, chasing), including `other` and null: read-time, clearable VET part; for aggression/guarding_*/fear_* only, also the sticky `worsening_behavior` signal (problem_key) written by the journal hook when that condition goes false→true = non-clearable REFER_BEHAVIOR floor | VET_CHECK (+ floor) | no | that domain | `WORSENING_*` | conv, low | D02b 2.4 |
| G22 | read time: today's rule (any high-intensity entries + harder check-ins) when every qualifying moment is in the trainer allowlist (jumping, mouthing, pulling, barking, chasing); lapses after 14 days; never routes any other domain to a trainer | CAUTION + trainer suggestion | no | — | `WORSENING_*` | position, med | AAHA |
| G23 | signal `aversive_history` | CAUTION + `TRUST_REBUILD` | no | — | — | position, med | D01 R4 |
| G24 | signal `puppy_fear` (fear flag in socialisation in ≥`SAFE.PUPPY_FEAR_SESSIONS` sessions within `STAGE.PUPPY_FEAR_WINDOW_DAYS`, counted after the latest resolving clearance); a single fear session only pauses that category (§7.5) | VET_CHECK | no | socialization | `SAFE.PUPPY_FEAR_SESSIONS` | position high / conv | AVSAB 2008; AAHA |
| G26 | signal `reactivity` (leash_reactivity_* frequency ≥`SAFE.REACTIVITY_MIN_FREQ`) | CAUTION + "mention to your vet" | no | — | `SAFE.REACTIVITY_MIN_FREQ` | position, low-med | AAHA Table 5; D02 R-REACT-01 |
| G27 | signal `noise_mild` (noise problem, recovery < `SAFE.NOISE_RECOVERY_DAYS`, no escape) | CAUTION | no | — | — | position, med | Riemer 2023 |
| G28 | signal `fear_problem` (fear_* frequency ≥`SAFE.FEAR_CAUTION_FREQ` or intensity ≥`SAFE.FEAR_CAUTION_INTENSITY`) | CAUTION + "mention to your vet" | no | — | `SAFE.FEAR_CAUTION_FREQ`, `SAFE.FEAR_CAUTION_INTENSITY` | position low / conv | AAHA Table 5 |
| G29 | signal `separation_signs` / `separation_mild` (§6.4 rows 2–4) | §6.4 | no | separation (row 4) | §6.4 | position, med | AAHA; D02a G-11 |
| G30 | any required safety item (S in §5) unanswered | CAUTION; `blockingQuestions` listed | no | exposure flag, visitor/child items | — | position (precaution), high | review decision |
| L1 | legacy floor (§6.4) | REFER_BEHAVIOR or VET_CHECK | no | per type | — | position, high | existing invariant |

#### 6.3a Paused-domain mapping

| Paused value | Removes nodes with |
|---|---|
| `aggression` | `exposure` flag, domains `handling`, `guarding` |
| `fear` | `exposure` flag, domain `socialization` (`fear_handling` → also `handling`) |
| `separation` | domain `separation` |
| `noise` | domain `noise` |
| `socialization` | domain `socialization` |
| `house_training` | domain `house_training` |
| `physical`, `exposure`, `handling` | that flag/domain |
| problem key (G15, G16, G19, G21) | jumping/mouthing → `manners`; pulling → `lead`; chasing → `recall`; guarding_* → `guarding`; leash_reactivity_* → `exposure`; fear_* → as `fear`; separation; noise; house_soiling → `house_training`; `aggression` → as `aggression`; barking, `other`/null → nothing |
| `all teaching` | all skill/protocol items (kept with 0 sessions) |
| — (G09) | nothing (management only, stated) |

`calm` (relaxation, settle) is paused only by "all teaching". Property test: every paused value is in this table.

#### 6.3b Dunbar L2 boundary (G03)
Any tooth contact on a person (T2) → REFER_BEHAVIOR, non-urgent; T≥3 → urgent. Dunbar's "not dangerous" for L1–2 is
a prognosis with professional work resting on hospital injury data (D02a [19], Corr. 18); AAHA forbids trainer-level
primary treatment of aggression; owner grading is unreliable at L2/L3 (Corr. 32). position+conv, med, ★.

#### 6.3c Child cutoff and vulnerable adults (G05)
Child = **aged 14 or under** (the cutoff is in the C3 question text; no age band is stored): Hooper 2025 (gradient
strongest ≤14), Giraudet 2022 (highest-rate bands vary 0–4 … 0–14); Westgarth 2024 (children <18) only for the 5–9
admissions peak and face/head severity; the old 12 has no source (D02a Corr. 26). "Children are the highest-risk
group" is **contested** (Giraudet yes; Westgarth 2018 and Tulloch via Westgarth 2024 no; D02b 2.1#4), so copy says
"more likely to be badly hurt". Vulnerable adults are included per D02a G-09/P-09 and AAHA. HD reports are dated by
`reported_at` and **G05 never decays**: a child-household referral stays until a verified professional workflow
exists (§6.6). `HH_CHILD_CONTENT` is shown to every household with a child (policy; Arhant 2017 supports the content
for children ≤6 only).

### 6.4 Separation sub-gate (first match) and legacy floor

| # | Case (facts persisted as signals; age evaluated at read time) | Signal → mode |
|---|---|---|
| 1 | self-injury, escape, vocalising >`SAFE.SEP_VOCAL_SEVERE_MIN` min, or soiling every absence | `separation_severe` → REFER_BEHAVIOR (G11) |
| 2 | age < `SAFE.SEP_PUPPY_MAX_AGE_MO` mo, vocalising <`SAFE.SEP_MILD_VOCAL_MIN` min only | `separation_mild` → CAUTION (`SAFE_CAUTION_PUPPY_SEPARATION`), graded absence allowed |
| 3 | older, vocalising <`SAFE.SEP_MILD_VOCAL_MIN` min only | `separation_mild` → CAUTION (`SAFE_CAUTION_ADULT_SEPARATION`, "mention to your vet"); `protocol.absence` locked until a medical clearance |
| 4 | any other alone sign | `separation_signs` → VET_CHECK on separation (G29); unlocks after medical clearance |

Basis: AAHA Table 5, D02a G-11 (DIY only for puppy adjustment; "mild" = quiet <5 min, conv), Dale 2024. No graded
absence while an uncontrolled longer absence is unavoidable daily, unless cover is confirmed (Feuerbacher 2020).
**Legacy floor (L1):** every `aggression_or_bite_risk`, `severe_fear_or_panic` or `severe_behavior_concern` signal
with source `practice_session` or `behavior_concern` floors the mode at REFER_BEHAVIOR (`SAFE_REF_LEGACY_SIGNAL`);
every `injury_or_pain` signal at VET_CHECK (G14; resolvable by medical clearance, §6.6). No expiry. Reports and intake
only raise the mode above the floor.

### 6.5 Sticky facts: signals on transition

One mechanism: every safety-relevant fact is persisted as a non-deletable `dog_safety_signals` row on its
**false→true transition**, and triggers G08–G29 read signals, dated by `reportedAt`, with no window. Writers:

| Source (signal source) | When written | Signals |
|---|---|---|
| PUT intake (`intake`) | fact true in the new version and false/absent in the previous one | C3 → `household_child`, C4 → `household_vulnerable`, C5, C6, C7, C8, C9, B3, B4, B5, onset band (G16), DISHAA (`dishaa_signs`), house_soiling (`adult_house_soiling`), problem rows (§6.4, G10, G12, G26–G28); `problem_key` set where the fact names a problem |
| plan session (`practice_session`) | high-tier flag (§4.5); G24 condition; G19 condition (P2 items, checked on each session write) | aggression, fear, panic, `injury_or_pain` (pain flag), `reactivity`, `puppy_fear`, `no_progress` (one per targeting problem) |
| plan check-in (`plan_checkin`) | G20 condition | `plan_distress` |
| journal create/update (`journal_entry`) | `syncWorseningBehaviorSignal`: per clinical key (aggression, guarding_*, fear_*), the G21 condition for that key is false before the write and true after | one `worsening_behavior` per key, `problem_key` = that `problem_domain` |

Signals persist **facts**; anything age-dependent (G18 senior/≥7 y, §6.4 puppy vs adult rows) is evaluated at read
time from the current age and the persisted fact. Transition helpers are pure (`plan-engine.ts`) and run inside the
write route's exclusive-lock transaction. **No signal expires.** G22 and G21's VET part are read-time (§11.5); G21's
behaviour floor is the sticky `worsening_behavior` signal. Legacy `injury_or_pain` signals stay sticky (L1) and
resolve only by a medical clearance; the referral screen prompts the owner to record a vet check. Property: no intake re-save, and no session ageing out of the history window, ever
lowers the mode.

### 6.6 Clearance (owner-attested; one rule)

- The owner records a clearance with role, scope, one constraint (`full_plan` or `low_impact_only`) and professional
  reference fields (name, organisation, country; credential ref optional). UI and Brief show "owner-reported, not
  verified".
- **An owner-attested clearance can resolve only VET_CHECK-type (medical) triggers**: G14–G18, the VET_CHECK part of
  G19 and G21 (their REFER_BEHAVIOR floors are not clearable), G20, G24,
  G29 row 4, the medical lock in §6.4 row 3, and legacy `injury_or_pain`. Scope must be `medical` and the role
  `veterinarian` or `veterinary_behaviorist` (DVMs alone diagnose). A trigger is resolved when all of its signals have
  `reportedAt` before the clearance's `created_at`; G21's VET part is resolved when all qualifying journal entries
  have `occurredAt` before it (a later qualifying entry re-applies it). With `low_impact_only` the resolved trigger leaves CAUTION
  (`SAFE_CLEARED_WITH_CONSTRAINTS`) with `physical` paused; with `full_plan` it leaves nothing.
- **Nothing else can be lowered by any clearance**: aggression and warning triggers (G01–G07), L1 aggression/fear/
  concern floors, G08–G13, the G19/G21 behaviour floors, child and vulnerable-adult triggers, and CAUTION triggers
  stay. Behaviour-scope clearances
  are recorded and shown (Brief, referral screen) but change no mode, until a verified professional-resolution
  workflow exists (★, §14.2).
- Never auto-cleared; nothing is deleted. A new signal after the clearance re-applies its trigger. **Re-arming:** the
  G19, G20 and G24 write conditions count only sessions/check-ins created after the latest clearance that resolved that
  trigger, so a continuing problem writes a new signal (test: after a clearance resolves G19, three new failed sessions
  write a new `no_progress`; two more high-distress weeks write a new `plan_distress`).

### 6.7 Management content

Keys `mgmt.*` (≤`SEL.STEPS_MAX` steps each), max `SEL.MGMT_MAX` items. Order: G05 keys first; then triggers by mode
severity, then id; duplicates dropped.

| Trigger(s) | Keys |
|---|---|
| G05 | `mgmt.separate_vulnerable`, `mgmt.no_punish_warnings`, `mgmt.contain` |
| G01, G02, G03, G06, L1 aggression | `mgmt.avoid_triggers`, `mgmt.contain`, `mgmt.no_punish_warnings`, `mgmt.log_video`, `mgmt.muzzle_ask_pro` |
| G04a, G04b | `mgmt.avoid_triggers`, `mgmt.contain`, `mgmt.no_punish_warnings` |
| G07 | `mgmt.feed_apart` (if any context is `food_or_item`), `mgmt.avoid_triggers`, `mgmt.no_punish_warnings` |
| G08 | `mgmt.contain`, `mgmt.avoid_triggers` |
| G09 | `mgmt.log_video` |
| G10, G28, L1 fear/concern, G19/G21 fear floor | `mgmt.avoid_triggers` |
| G19/G21 aggression or guarding floor | as G01 row |
| G11, G29 | `mgmt.absence_cover` |
| G12, G27 | `mgmt.safe_place` |
| G13 | `mgmt.contain` |
| G14, L1 injury | `mgmt.rest_low_impact` |
| G18 | `mgmt.senior_home_safety` |
| G24 / single fear session | `mgmt.puppy_fear_pause` |
| G26 | `mgmt.walk_distance` |

Content: avoid known triggers (Edinburgh; AAHA); contain; children/vulnerable people never alone with the dog; never
punish growling (AAHA; D02a P-10); no treats *during* a reaction, move away (Edinburgh [13]); log/video only if safe;
muzzle only if already trained, else ask a professional (D02a P-08); no head halter with face-handling sensitivity
(Honeckman 2026); feed guarded items apart (D02a P-11).

### 6.8 Mapping from today's `safety-policy.ts` and the legacy adapter

| Today | New |
|---|---|
| `injury_or_pain`, 90-day expiry | L1 VET_CHECK, no expiry, medical clearance |
| aggression / severe fear / severe concern signals | L1 REFER_BEHAVIOR floor |
| worsening → `credentialed_trainer` | G21/G22 by domain |

**Legacy adapter** (`toLegacySafety`, used by `/suggestion`, weekly focus, contextual progress and
`decideAdvancementProposal` until they are removed): `loadSafetyInputs` additionally loads `reports`, the latest
intake, clearances and signals with source (no session history; triggers read signals). Mapping:

| Mode / top trigger | `SuggestionSafety` |
|---|---|
| CLEAR, CAUTION without G22 | `null` |
| CAUTION with G22 | `{suppressed, sustained_worsening_intensity, credentialed_trainer}` (today's behaviour, unchanged) |
| VET_CHECK with G21 | `{suppressed, sustained_worsening_intensity, veterinarian}` |
| other VET_CHECK | `{suppressed, reported_injury_or_pain, veterinarian}` |
| REFER/SAFETY_ONLY from G01–G07 or L1 aggression | `{suppressed, reported_aggression_or_bite_risk, veterinary_behaviorist}` |
| from G08, G10, G12 or L1 fear | `{suppressed, reported_severe_fear, veterinary_behaviorist}` |
| any other REFER/SAFETY_ONLY | `{suppressed, severe_recorded_concern, veterinary_behaviorist}` |

Lock scopes unchanged. The adapter serves only
legacy rows; advancement decisions on plan rows use
`decideSafetyMode` directly (§4.3). API tests: a bite report suppresses `/suggestion`, weekly focus and legacy
advancement decisions.

---

## 7. Life-stage model

### 7.1 Bands

| Band | Rule | Basis |
|---|---|---|
| `puppy_early` | age < `STAGE.PUPPY_LATE_START_WK` (12 wk); < `STAGE.MIN_PLAN_AGE_WK` (7) clamped here + `NOTICE_UNDER_7_WEEKS` | AVSAB; socialisation ~3–12 (14) wk |
| `puppy_late` | 12 ≤ age < `STAGE.JUVENILE_START_WK` (16 wk) | AAHA (vaccines to 16–20 wk) |
| `juvenile` | 16 wk ≤ age < `STAGE.ADOLESCENT_START_MO` (6 mo) | McEvoy 2022 |
| `adolescent` | 6 mo ≤ age < `STAGE.ADOLESCENT_END_MO` (18; `STAGE.ADOLESCENT_END_LARGE_MO` 24 if ≥`STAGE.LARGE_KG` 25 kg) | Asher 2020; Kinsman 2025; end ages conv |
| `adult` | end of adolescence → senior | AAHA young/mature split unused |
| `senior` | age ≥ `STAGE.SENIOR_FRACTION` (0.75) × lifespan | AAHA 2019/2023, high |
| `unknown` | no DOB → as `adult` + `NOTICE_ASK_DOB`; B7 is always shown and G18 applies on a DISHAA-positive answer | — |

`ageMonths = floor(ageDays / UNIT.DAYS_PER_MONTH)`; year thresholds compare `ageMonths ≥ Y × UNIT.MONTHS_PER_YEAR`. `STAGE.SENIOR_SCREEN_Y` = 7 (conv, med; Wallis 2024, Hopper 2024,
AAHA 2023; Brühl's ≥7 is only an inclusion criterion). Lifespan: A6, else `STAGE.LIFESPAN_DEFAULT_Y` by weight
(conv, low, inferred):

| Weight | Lifespan default (y) |
|---|---|
| < `SIZE.SMALL_MAX_KG` (10 kg) | 13.5 |
| < `SIZE.MEDIUM_MAX_KG` (25 kg) | 12 |
| < `SIZE.LARGE_MAX_KG` (45 kg) | 10.5 |
| ≥ 45 kg | 8.5 |

Without weight, map `dogs.size` (small/medium/large/giant) to the same rows.

### 7.2 Newly adopted

| Rule | Value | Basis |
|---|---|---|
| `STAGE.SETTLE_DAYS` / `STAGE.SETTLE_DAYS_LONG` | 7; 14 if originDetail ∈ {street, ex_breeding, unknown} or fear est ≥`TRAIT.FEAR_HIGH` | conv, low (shelter-housing analogy, van der Laan press release) |
| settling day | `localDate − adoptedOn + 1`, active ≤ settle days | definition |
| content | `protocol.settling`, `protocol.house_training`, rest, enrichment, management; teaching only `eng.name` | conv |
| check-ins | `adoption_dN` (N in `STAGE.ADOPTION_CHECKIN_DAYS`) due while N ≤ `settlingDay − 1` < the next milestone's N (no upper bound for d180) and not recorded; none at all when the first intake was created after `adoptedOn` + the last milestone (e.g. BASE_ADULT); "behaviour keeps changing" copy | Bohland 2023 vs Powell 2022; med |
| early return | expectations card for first-time adopters | Powell 2022 |

### 7.3 Adolescence
Card: "Teenage dogs often respond less reliably to their own people for a while. It's common and it isn't your
failure." No month figures (N5). Asher: the dip is carer-specific. Kinsman 2025: fear peaked at 12 mo (1.8, 3.0, 3.9, 3.8, 3.2% at 6–18 mo); "aggressive"
wording (0.9→3.4%) and reactivity (0.5→1.9%) rose to 18 mo — never promise everything fades (D03 C7, C9; D06 S11).
Start stage −`SEL.ADOLESCENT_START_OFFSET`; recall on a long line until `recall.distraction` passes.

### 7.4 Seniors
G18 first. P4 priorities: settle, scent, cooperative care, low impact, sensory-adapted cues (Hargrave 2024; low).
Vet cognition scores (CCDR/CADES) are deferred to v2 (§14.3).

### 7.5 Puppy socialisation, vaccines, house training

| Rule | Detail | Basis |
|---|---|---|
| Vaccine gate | eligible = vaccinated, or first set ≥`VAX.DAYS_AFTER_FIRST_SET` days ago and dewormed. Else home, garden, carried outings, known healthy vaccinated adult dogs. **Never dog parks.** "Ask your vet". | AVSAB 2008 (chosen; avoid parks of unknown vaccination status); extending to vaccinated dogs is policy (Wormald via McEvoy 2022); AAHA more permissive. Stepita 2013 279 vs 48 attenders unresolved, low (D03 C3) |
| `protocol.socialization` (logged protocol, age < `SOC.CHECKLIST_MAX_AGE_WK`) | sessions require `soc_category`. Pass: startle allowed, recovery speed counts (IKC ex4); "approaches voluntarily", "takes food" synthesis | structure high; numbers conv |
| fear pause | one session with a medium/high flag → that category stops for ≥`STAGE.FEAR_PAUSE_MIN_DAYS`, then one recheck session at stage 1; clean → resumes; flagged → counts toward G24; a medical clearance also resumes | AAHA ("no more exposure unless recommended by their veterinarian"); conv days |
| after 16 wk | checklist offered under P4 if fear est ≥`TRAIT.FEAR_HIGH`; never "the window has closed" | Howell 2015; Foyer 2016 |
| fear periods | no calendar | Purdue; Lazzaroni 2019 |
| classes | if eligible; evidence **mixed** (Dinwoodie 2021: lower odds of 4 problems, higher house soiling OR 1.56; start age irrelevant) | low |
| sleep | copy params: puppies <16 wk aim ≥`SLEEP.PUPPY_NIGHT_H` h overnight in an enclosed space (Dale 2024, low); total `SLEEP.TOTAL_H` (Kinsman 2020; low-med) | D06 C22 |
| joint caution | copy params: no repeated stairs ≤`JOINT.NO_STAIRS_MO` mo; off-lead free play; soft ground preferred | Krontveit 2012 |
| `protocol.house_training` (routine) | outings after waking, eating, play; puppies every `HOUSE.INTERVAL_H` h (copy param, conv); reward outdoors; never punish. The ≥4 accidents/wk flag and crate-hours notice are **dropped from v1** (no input; Dale 2024 OR 13.25 is exploratory) | conv |

---

## 8. Individual-difference modifiers (v1)

- **Traits** (§5 E, observed means): `fearful` (social or non-social fear ≥`TRAIT.FEAR_HIGH`), settling length, energy
  ≥`TRAIT.ENERGY_HIGH` → upper scent dose, chasing ≥`TRAIT.CHASING_HIGH` + cats → note, separation
  ≥`TRAIT.SEPARATION_HIGH` → separation questions.
- **Sex/neuter:** information only (D04 R7); vet note on neuter timing (Hart 2020).
- **Heat (v1: owner tap + static advice).** Dog risk (tiers conv, low):

| Tier | Any of | Sources |
|---|---|---|
| `high` | flatFaced yes or CFR < `HEAT.CFR_RISK`; heatBreeds ∩ {pug, french_bulldog, bulldog, boston_terrier, pekingese, shih_tzu, chow_chow}; BCS ≥`HEAT.BCS_RISK`; heart/breathing condition; age ≥`HEAT.ENV_RISK_AGE_Y` | Packer 2015; Tomlinson 2026; Fawcett 2019; Hall 2020 (Chow OR 7.0; ≥12 y env OR 3.15); Hall 2022 (brachy fatal OR 3.01). Brachy is `high` despite exertional OR 1.32 because of environmental, vehicular and fatal odds and BOAS cooling limits |
| `elevated` | weight ≥`HEAT.WEIGHT_ELEVATED_KG`; heatBreeds ∩ {greyhound, english_springer, cavalier_kcs, staffordshire_bt}; age <`HEAT.YOUNG_EXERTION_AGE_Y` | Hall 2020 (2.11, 1.85, 1.69, 1.56; ≥10 kg 2.15–2.52) |
| `standard` | otherwise | — |

  "Outdoor" = `physical`-flag items plus `enr.sniff_walk`. `hotToday` → `high`: `no_exertion` (outdoor items
  removed); others: `caution` (outdoor items to the coolest anchor, shortened by `HEAT.CAUTION_SHORTEN_PCT` %). No tap → `unknown` (static
  warm-day advice for high-risk dogs). ★. No °C threshold in v1 (no source for "~20 °C", D04 N3). Equipment: no neck
  collar on brachycephalic dogs; Y/chest-strap harness (Cavalli & Protopopova 2025 via D06 S25); back-clip won't fix
  pulling (Shih 2021).
- **Body condition/health:** BCS ≥`HEAT.BCS_RISK` → vet weight note; treats ≤`REW.TREAT_KCAL_PCT` % of calories
  (copy param); joint condition or ≥`SAFE.PAIN_SIGNS_MIN` pain signs → `low_impact` (no physical-flag items; band
  minimum session); eye/hearing loss → cue adaptation.

### 8.5 Deferred
Breed/size priors, heat thresholds and the rest of the v2 list are in §14.3.

---

## 9. Skill graph and protocol modules

### 9.1 Graph (derived from D05 §3; merges in §15.3)

Kinds: `skill` (stage = plan row `confidence`), `protocol` (derived stage), `routine`, `management`, `enrichment`,
`task`. Legacy-aliased skills keep their 5 authored levels (`topStage` 5); new skills have `GRAPH.NEW_SKILL_STAGES`
(3): S1 home with help, S2 home on cue (Syn), S3 published criterion. Each node has `domain` (`calm, manners, recall,
lead, handling, socialization, separation, noise, guarding, house_training`) and flags `physical`, `exposure`.

| id | kind | domain / flags | prereqs | tier | Top-stage criterion | Source | Legacy alias |
|---|---|---|---|---|---|---|---|
| eng.name | skill | manners | — | 1 | brief attention to name, on lead | KCP ex3; IKC ex2 | name-recognition, name-response |
| handle.collar_harness | skill | handling | — | 1 | tolerates collar/harness | STAR #9 | — |
| handle.hold | skill | handling | handle.collar_harness | 1 | owner can hold | STAR #10 | — |
| res.give | skill | guarding | — | 1 | gives a non-food item; trade | STAR #11; KCP ex11 | — |
| food.take | skill | manners | — | 1 | takes a treat gently | KCP ex12 | — |
| play.handler | skill | manners, physical | — | 1 | plays under control, releases | KCP ex4 | — |
| bite.redirect | skill | manners | — | 1 | mouthing redirected; calm pause (conv) | D03 R-BITE | bite-inhibition |
| pos.sit | skill | manners | eng.name | 1 | sits | STAR #16; KCP ex8 | basic-manners.sit, puppy-fundamentals.sit |
| pos.down | skill | manners | pos.sit | 1 | downs | STAR #17 | basic-manners.down |
| pos.stand | skill | manners, physical | pos.sit | 2 | stands briefly | KCP ex8 | — |
| lead.loose | skill | lead, physical | handle.collar_harness, eng.name | 1→4 | 15 steps → ~30 paces with turns → turns + 2 stops | STAR #14; KCB ex3; CGC T4 | basic-manners.loose-leash |
| lead.crowd | skill | lead, physical | lead.loose ≥S2 | 3 | passes ≥3 people close | CGC T5 | — |
| lead.door | skill | lead | lead.loose ≥S3 | 3 | waits at door/gate | KCB ex4 | — |
| lead.road | skill | lead, physical | lead.crowd | 4 | kerb stop; passes traffic | KCS ex2 | — |
| stay | skill | manners | pos.sit | 1→5 | ~10 s at 1 pace → 1 min at 5 paces → 2 min (KC/IKC/CGC variants) → down off lead 10 paces 2 min (KC Gold) | KCP ex10; KCB ex6 (verify erratum); KCS ex4; IKC Silver ex6; CGC T6; KCG ex4 | basic-manners.stay |
| recall | skill | recall, physical | eng.name | 1→5 | 2–3 paces / 5 ft → 10 paces / 10 ft on a 20 ft line | KCP ex7; KCB ex9; CGC T7 | basic-manners.recall, recall-on-cue |
| recall.distraction | skill | recall, physical | recall ≥S3 | 3–4 | off lead near leashed dogs; long line until met | KCS ex6 | recall-through-distractions |
| recall.stop | skill | recall, physical | recall ≥S3, stay ≥S3 | 4 | stops at ≥10 paces | KCG ex6 | — |
| recall.side | skill | recall, physical | recall.distraction | 4 | returns to walking handler's side | KCG ex2 | — |
| recall.distance | skill | recall, physical | recall.distraction | 5 | Syn | — | recall-at-distance |
| walk.free | skill | recall, physical | recall.side | 5 | ~40 paces off lead | KCG ex3 | — |
| handle.stranger_pet | skill | socialization, exposure | protocol.socialization ≥S2 or age ≥16 wk | 2 | petting by a non-owner | STAR #12; CGC T1–2 | — |
| handle.groom_exam | skill | handling | handle.hold | 2 | brush, ears, front feet → mouth, eyes, tail, feet | CGC T3; KCB ex7–8 | — |
| coop.chin_rest | skill | handling | food.take | 2 | chin rest 1 s → duration (Syn) | Klebba; Brehaut | — |
| coop.vet_exam | skill | handling, exposure | handle.groom_exam, protocol.handling ≥S6 | 3 | stranger exam on lead, no restraint by equipment | KCS ex9; KCG ex9 | — |
| calm.settle_mat | skill | calm | pos.down | 3 | sent to bed ~10 paces, stays | KCG ex5 | settle-on-mat |
| calm.distractions | skill | calm | eng.name | 3 | two distractions, no panic/bark | CGC T9; STAR #19 | settle-in-distractions (partial) |
| calm.settle_public | skill | calm, exposure | calm.settle_mat, lead.crowd | 4 | calm in a busy area | Dogs NZ titles | — |
| soc.dog_pass | skill | socialization, exposure | lead.loose ≥S3, calm.distractions | 4 | passes a dog, casual interest | CGC T8 | threshold-awareness (partial) |
| greet.polite | skill | manners | pos.sit | 3 | no jumping at a greeting | KCS ex7 | — |
| food.manners | skill | manners | pos.sit | 3 | no begging; wait 3–5 s (never bowl-lift) | KCS ex8; KCG ex8 | — |
| veh.control | skill | manners | lead.door | 4 | waits at car door; quiet ≥15 s engine on | KCS ex5; IKC | — |
| self.settle | skill | calm | — | 2 | settles in another room | catalog | self-settle |
| sep.supervised | skill | separation | greet.polite | 4 | owner out of sight 3 min | CGC T10 | calm-departures (partial) |
| sep.isolation | skill | separation | protocol.absence ≥S9 (120 s) | 5 | 2 min alone, quiet | KCG ex7 | stay-alone-duration |
| protocol.socialization | protocol | socialization, exposure | — | 1 | §7.5 | KCP ex5; IKC ex4 | — |
| protocol.house_training | routine | house_training | — | 1 | §7.5 | conv | potty-signal |
| routine.rest_alone | routine | calm | — | 0 | solo naps; overnight space | AVSAB | — |
| protocol.settling | routine | calm | — | 0 | §7.2 | conv | — |
| protocol.noise_adhoc | routine | noise | — | 1 | §9.2 | Riemer 2023 | — |
| protocol.relaxation | protocol | calm | — | 2 | §9.2 | Overall (paraphrased) | — |
| protocol.absence | protocol | separation, exposure | protocol.relaxation ≥`SEP.ABSENCE_PREREQ_RELAX_STAGE` | 3 | §9.2 | Feuerbacher 2020 | — |
| protocol.noise | protocol | noise, exposure | protocol.relaxation ≥3 | 3 | §9.2 | Riemer 2023 | — |
| pattern.lat / pattern.engage_disengage | protocol | calm, exposure | protocol.relaxation ≥3 | 3 | §9.2 | McDevitt; Parsons | look-at-that, engage-disengage |
| protocol.handling | protocol | handling, exposure | food.take | 2 | §9.2 (per body area) | Klebba; Jones (WDJ) | — |
| protocol.muzzle | protocol | handling | food.take | 2 | §9.2 | Cornell; Toronto | — |
| protocol.trade | protocol | guarding | — | 2 | §9.2 | D02a P-11 | — |
| enr.scent / enr.sniff_walk / enr.rest | enrichment | calm (`enr.sniff_walk` physical) | — | 0 | §10.9 | D06 | — |
| task.vet_visit / task.behavior_referral | task | — | — | 0 | §12.3 | AAHA; AVSAB | — |

Prereq grammar: comma = AND; `or` joins alternatives; atoms are `node ≥Sn` (bare node = stage ≥`SEL.PREREQ_MIN_STAGE`)
or `age ≥ N wk`. Graph tests: acyclic, prereqs exist, EN+ES
prose, every legacy key maps to one node. The 3-Ds "one variable at a time" rule = existing `levelSteps`; its only
source is an AKC web article (no research, no percentages): conv, low (D01 R20, Corr. 25). No weeks-to-fluency.

### 9.2 Protocol ladders (advance/regress §11.3; `DSCC.MAX_STAGE` 60)

| Protocol | Ladder | Start | Fail | Sources |
|---|---|---|---|---|
| `protocol.relaxation` | `RELAX.DURATIONS_S` 5, 10, 15, 30, 60, 120, 300 (stages 1–7); stages 8–12 distraction: owner moves → steps away → out of sight → soft knock → outdoors quiet | 1 | medium flag, or gets up ≥`RELAX.GETUPS_MAX` times | Overall paraphrased (low-med); Riemer 2023 (69%) |
| `protocol.absence` | `DSCC.ABSENCE_LADDER_S` = 0, 5, 10, 15, 30, 45, 60, 90, 120, 150, 180, 210 s (DIGEST-a P-06); +`DSCC.ABSENCE_STEP_S` to `DSCC.ABSENCE_LINEAR_MAX_S`; ×`DSCC.ABSENCE_GROWTH` rounded to `DSCC.ABSENCE_STEP_S`, cap `DSCC.ABSENCE_MAX_S` | largest step < `DSCC.START_FRACTION` × `firstSignAfterS`; null → stage 1 | any alone sign on video/audio | Feuerbacher & Muir 2020 (n=5; one dog to 300 s; low); beyond 210 s conv |
| `protocol.noise` | volume 1–`NOISE.MAX_STEP` | one below the lowest volume with any sign (owner sets on first session; else 1) | medium flag or stops eating | Riemer 2023; low |
| `protocol.noise_adhoc` | real events: noise → treat every time; safe place; never forced out | — | — | Riemer 2023; med |
| `pattern.lat` / `.engage_disengage` | distance: start `startDistanceM × DSCC.DISTANCE_START_FACTOR` (floor); −`DSCC.DISTANCE_STEP_PCT` % per stage; floor at owner minimum | 1 | fixating, stiffening, lunging, barking (signal per §4.5 flag rule) | practitioner, no trials (low); Edinburgh caution ★ |
| `protocol.handling` | **per `body_area`**: chin rest 1 s → 3 s → hand in view → touch shoulder → glide → two hands → light touch area → instrument shown → mock procedure (9 stages); the item's stage = the lowest stage among areas practised | 1 per area | ≥`ADAPT.OPT_OUTS_MAX` opt-outs or medium flag | Klebba; Jones (WDJ); low-med |
| `protocol.muzzle` | 9 stages merged from Toronto and Cornell (paraphrased): appears; nose near; nose in; hold while feeding (pull away so it re-inserts); feed through front; straps around neck unclipped; clip loosely; fit (1–2 fingers); end positively | 1; first session ≤`MUZZLE.FIRST_SESSION_MAX_MIN` min, later ≤`MUZZLE.SESSION_MAX_MIN` | pawing (cue, reward, remove), medium flag | Cornell; Toronto; med |
| `protocol.trade` | high value for low → equal → owner keeps item briefly (3 stages) | 1 | any growl (also writes the aggression signal) | D02a P-11; low |
| `protocol.socialization` | per `soc_category`: stage 1 home/distance → 2 near → 3 brief contact; item stage = lowest category stage | 1 | medium/high flag → fear pause (§7.5) | AVSAB; IKC |

### 9.3 Legacy aliases
Legacy keys alias the nodes listed. Before a plan row exists, a skill's stage = max(levels of the dog's legacy alias
rows, baseline start); that value seeds the plan row at find-or-create. **Once the plan row exists, its level is the
stage** (so step-backs and regress proposals take effect). Legacy evidence is display-only and never feeds plan
proposals. Templates
stop being the selection unit; "apply template" stays a manual shortcut.

### 9.4 Handling, cooperative care, muzzle
- **Opt-out** (Klebba vs Brehaut): stop; don't reward the opt-out; invite back; reward the re-offer; easier rep.
  ≥`ADAPT.OPT_OUTS_MAX` opt-outs (conv; Klebba says "multiple times in a row") → last success or end. Never hold
  through a struggle (stricter than Yin's ≤3 s restraint framework). ★
- Puppies <16 wk: gentling and opt-out together (D05 rule 24, low). Home cooperative care: "only minor" effects in
  one study (Riemer 2021); pair with clinic happy visits.
- **Muzzle for all dogs:** offered (P4, adolescent/adult) when no person or animal tier ≥T2 and no fear_handling
  problem; else "ask your behaviour professional" (D02a P-08). Basket type; never unattended; never during fear.

### 9.5 Copyright
Facts and names are not copyrightable; AKC/KC/IKC texts, the Overall protocol, Control Unleashed, Click to Calm, BAT
and Fear Free/KPA curricula are paraphrased or linked. BAT is never a DIY module.

---

## 10. Selection, dosing and scheduling

### 10.1 Facts
`ageDays`; band; `settlingDay`; `weightKg`; heat; `lowImpact`; traits; bite tiers; item stages; open triggers.

### 10.2 Gate
`decideSafetyMode`. `SAFETY_ONLY` → task + management, 7 empty days, stop.

### 10.3 Stages, prerequisites, candidates
1. **Stage:** skill → plan row level, else the §9.3 seed; protocol → derived (§11.3); else baseline `startStage = min(topStage,
   1 + v)`, else 1.
2. **Prereq satisfied** if the prereq's stage ≥ the listed stage (default `SEL.PREREQ_MIN_STAGE`). **Ancestor rule:**
   a node with baseline ≥1 or stage ≥2 satisfies all its ancestors.
3. **Candidate** if prereqs satisfied; allowed by mode, clearance constraint, paused domains (§6.3a) and G30;
   vaccine gate for outside-home socialisation; no `physical` items when `lowImpact`; off-lead nodes
   (`walk.free`, `recall.side`, `recall.distance`) only in adult/senior bands; settling restricts to §7.2.
4. **Start offsets:** adolescent −`SEL.ADOLESCENT_START_OFFSET`, `TRUST_REBUILD` −`SEL.TRUST_START_OFFSET` (floor 1),
   outside-home stages capped at `SEL.OUTSIDE_START_CAP`.
5. **Locked targets** (not mode-excluded ones: a target removed by the mode, paused domains or G30 pulls nothing)
   pull the **nearest unmet prerequisite** (depth-first in prereq order; first unsatisfied node
   whose prereqs are satisfied; skipped if already selected or not a candidate).

### 10.4 Priority and output order
- **P0** management (§6.7). **P1** in fixed order (not counted in teaching caps): `protocol.settling` (settling),
  `protocol.socialization` (age < `SOC.CHECKLIST_MAX_AGE_WK`), `protocol.house_training` (puppy/juvenile bands,
  settling, or a house_soiling problem), `routine.rest_alone` (puppy/juvenile), `protocol.noise_adhoc` (noise problem,
  not REFER).
- **P2** problem protocols, problems by `frequency × intensity` desc then key:

| Problem | Targets |
|---|---|
| separation | protocol.relaxation, protocol.absence |
| noise | protocol.relaxation, protocol.noise |
| leash_reactivity_* | protocol.relaxation, pattern.lat |
| fear_strangers, fear_dogs, fear_new_places | protocol.relaxation |
| fear_handling | protocol.handling |
| guarding_* | protocol.trade, res.give |
| jumping / mouthing / pulling / barking / chasing | greet.polite / bite.redirect / lead.loose / calm.settle_mat / recall.distraction |
| house_soiling | P1 |

- **P3** goals in owner order (goal table):

| goalKey | Nodes (in order) |
|---|---|
| sit / down / stay | pos.sit / pos.down / stay |
| recall | recall |
| loose_lead | lead.loose |
| settle | calm.settle_mat |
| polite_greeting | greet.polite |
| food_manners | food.manners |
| give_items | res.give |
| alone_time | self.settle, sep.supervised |
| vet_handling | protocol.handling, coop.vet_exam |
| muzzle | protocol.muzzle (only if allowed, §9.4) |
| car | veh.control |
| off_lead | recall.distraction, walk.free |

-  **P4** band defaults: puppy/juvenile: eng.name, handle.collar_harness, bite.redirect,
  food.take, handle.hold, pos.sit, protocol.handling; adolescent: recall, lead.loose, calm.settle_mat,
  protocol.muzzle; adult: calm.settle_mat, protocol.handling, protocol.muzzle; senior: calm.settle_mat,
  protocol.handling, eng.name.
- Tie-break: list order, then codepoint key.
- **Output order:** (1) `task.behavior_referral` (REFER/SAFETY_ONLY), `task.vet_visit` (any VET_CHECK trigger);
  (2) management; (3) P1; (4) teaching (P2, P3, P4); (5) maintenance; (6) `enr.scent`, `enr.sniff_walk`, `enr.rest`.

### 10.5 Weekly caps
| Constant | Value | Basis |
|---|---|---|
| `SEL.NEW_PER_WEEK` / `SEL.FIRST_WEEK_NEW` | 1 / 2 (first plan week: no plan-item sessions yet) | conv (D06 D3) |
| `SEL.ACTIVE_MAX` / `SEL.ACTIVE_MAX_FEAR_SEP` | 2 / 3 | conv (D06 D5) |
| `SEL.MAINT_PER_WEEK` | 2 | conv |
| `SEL.STEPS_MAX` | 5 per item view | Takeuchi 2000 (low-med); LAIR |
| `SEL.MGMT_MAX` | 5 | conv |
**One selection step:** *continuing* = teaching items with a plan session in the week snapshot (§3.6) and not at top stage;
*new* = any other teaching item. Walk continuing items in priority order, then new items in priority order; add an
item while `active < SEL.ACTIVE_MAX` (or `SEL.ACTIVE_MAX_FEAR_SEP`) and, for a new item, `new < NEW_PER_WEEK` (`FIRST_WEEK_NEW` when the
dog has no plan session yet). While G21 or G22 holds, the new cap is 0 if plan sessions exist, else `NEW_PER_WEEK`.

### 10.6 Dosing
| Band | `DOSE.SESSION_MIN` | `DOSE.MAX_SESSIONS_PER_DAY` |
|---|---|---|
| puppy_early | 1 | 5 |
| puppy_late / juvenile | 2 | 4 |
| adolescent | 3 | 3 |
| adult | 3 | 3 |
| senior | 2 | 3 |

Fearful or all-baseline-0, non-puppy: `min(band, DOSE.FEARFUL_MAX_MIN)`. Basis: Fear Free handout (3 min; puppies
1 min; no data); D01 R15 differs (3–5 min); all conv, low. `planMin = floor(DOSE.BUDGET_FACTOR × minutesPerDay)`;
`sessionsToday = clamp(floor(planMin / sessionMin), 1, MAX_SESSIONS_PER_DAY)`, then capped by legal placements
(§10.10). `minutesPerDay < DOSE.MIN_BUDGET` → micro plan: first teaching item, one `DOSE.MICRO_SESSION_MIN`-minute
session/day. Sessions every day; the factor is the only slack.

### 10.7 Reinforcement (copy, with params)
Small soft food by default (high); praise alone weak (Feuerbacher 2015 abstract; med); reward every success while
teaching, thin after a stage passes (AAHA 2015); recall and DS/CC keep high-value variable rewards; never leave a
marker unrewarded (Feng 2017 relaying Wennmacher 2007; low-med); marker optional, pairing `REW.MARKER_PAIRINGS`
(copy param, conv).

### 10.8 Household
One cue list per dog; one trainer per new skill; multi-dog homes train individually (conv). C3 yes → `HH_CHILD_CONTENT`.

### 10.9 Enrichment and maintenance
- Enrichment (not SAFETY_ONLY; not in caps): `enr.scent` (`ENR.SCENT_MIN`, `ENR.SCENT_MIN_HIGH` if energy ≥`TRAIT.ENERGY_HIGH`; indoors
  when heat ≠ normal), `enr.sniff_walk`, `enr.rest` (`ENR.REST_BLOCKS`). Chews optional. Evidence thin (Duranton 2019;
  Fountain 2025; Chan 2023; enrichment pilot); minutes conv.
- **Maintenance** = skills whose **plan row or legacy alias row** is at `topStage` (stored level). A baseline-only top
  stage satisfies prerequisites but is never shown as maintenance. Show `SEL.MAINT_PER_WEEK`, least recently
  practised first, then key; `ADAPT.MAINT_SESSIONS_PER_WEEK` each on day `(index + SCHED.MAINT_DAY_OFFSET) mod
  UNIT.DAYS_PER_WEEK`.

### 10.10 Scheduling
1. Daily teaching sessions = `sessionsToday`; fill: P2 protocol, new item, other active, maintenance on its day;
   round-robin. **P1:** `protocol.socialization` takes one anchor slot per day first (`sessionsPerWeek` 7,
   `sessionMinutes` = band `DOSE.SESSION_MIN`) and counts against `sessionsToday`; P1 routines
   (`protocol.settling`, `protocol.house_training`, `routine.rest_alone`, `protocol.noise_adhoc`) have
   `sessionsPerWeek` 0, are not placed in `days` and are shown as daily routines.
2. One session per item per anchor; ≤`ADAPT.MAX_SAME_SKILL_PER_DAY` per item per day (conv; Demant 2011 supports only
   "never back-to-back", med); the new-learning block goes last in its anchor, then the rest/walk prompt (Kis 2017:
   unrelated new learning blocked gains; play worsened the 1 h retest, so no test-type session right after play;
   `DOSE.NO_NEW_LEARNING_AFTER_MIN`, low-med).
3. `sessionsToday = min(sessionsToday, anchors × activeTeachingItems)`; illegal placements are dropped.
4. Anchors in owner order, cycling; today = `days[localDate − weekStart]`.

---

## 11. Adaptation rules

### 11.1 Inputs
Sessions in `HIST.WINDOW_DAYS` with the item's current version, sorted `(practiceDay, id)`.

### 11.2 Skills: `evaluatePlanAdvancement` (pure)
| Signal | Action | Code |
|---|---|---|
| **window**: walk back whole `primary` sessions at the stored level within `HIST.WINDOW_DAYS`, skipping sessions that ended with ≥`ADAPT.STRESS_LOW_END_COUNT` distinct low flags, until Σtrials ≥`ADAPT.WINDOW_TRIALS` **and** ≥`ADAPT.MIN_SESSIONS` sessions **and** ≥`ADAPT.MIN_DAYS` distinct practice days (not reached → no proposal); rate = Σsuccesses / Σtrials ≥`ADAPT.ADVANCE_PCT` %; no medium/high flag in the window; stage < `topStage` | propose +1 (owner confirms; §4.3) | `ADAPT_ADVANCE_PROPOSED` |
| 60–79 % | hold; reward-rate tip / ease the step's dimension | `ADAPT_HOLD` |
| <`ADAPT.STEP_BACK_PCT` % in `ADAPT.STEP_BACK_CONSECUTIVE` consecutive sessions (all sessions of the item, primary and fallback, newest first) | `stepBack` = `ADAPT.STEP_BACK_SIZE` (next `sessionStage` = max(1, stored − 1)); a later fallback session ≥`ADAPT.ADVANCE_PCT` % resets it to 0 (test: P 50 %, P 55 %, F 85 % → 0, next session primary) | `ADAPT_STEP_BACK` |
| <`ADAPT.END_PCT` % or medium flag | end session; `stepBack` = 1 | `ADAPT_STEP_BACK` |
| `ADAPT.END_PCT`–(`ADAPT.STEP_BACK_PCT` − 1) % in a single session | hold; next session eases the step's dimension via `context-adjacency` (no stage change) | `ADAPT_HOLD` |
| `ADAPT.STEP_BACKS_BEFORE_EASE` step-backs at one stage | ease via `context-adjacency` first | D01 R21 |
All conv, low. Skills step back one stage (not two): no source supports two; Feuerbacher & Muir prespecified "drop to last
success" without testing drop size (recurrence 30% of next trials; sooner in 14/18 repeats). Legacy skills keep the
outcome-only rules in `advancement.ts`/`suggestion-rules.ts` (their own constants stay there until removal).

### 11.3 Protocols
Derived stage per (item, area/category) as defined in §4.3; no replay, no window. The plan
suggests the **next session stage** from the last `DSCC.FAIL_SESSIONS_REGATE` sessions. **One trial** per protocol:
relaxation = one settle bout at the stage duration; absence = one departure; noise = one sound presentation;
`pattern.*` = one trigger appearance; handling = one touch sequence; muzzle = one muzzle presentation; trade = one
exchange; socialisation = one exposure.

A session **failed** if its server-derived `outcome` is `too_hard` (§4.5). First match wins:

| # | Latest sessions at stage s | Next session stage |
|---|---|---|
| 1 | last `DSCC.FAIL_SESSIONS_REGATE` failed | `no_progress` (G19, P2 items only); stage max(1, s − `DSCC.DROP_STAGES`) |
| 2 | last `DSCC.FAIL_SESSIONS_DROP` failed | max(1, s − `DSCC.DROP_STAGES`) |
| 3 | latest failed | max(1, s − 1) |
| 4 | latest session: `trials ≥ DSCC.ADVANCE_SUCCESSES` and `successes = trials` and not failed | s + 1 (≤ ladder length) |
| 5 | otherwise | s |

Prerequisites use the §4.3 derived stage; `stageAtWeekStart` = the same over the week snapshot's sessions (§3.6). The §11.2 "one step back" rule is for skills; protocols drop one stage per
failed session and `DSCC.DROP_STAGES` after repeated failures (rows 1–2).
Start stages (no sessions): §9.2 (absence from `firstSignAfterS`; noise owner-chosen on the first session within
1…`NOISE.MAX_STEP`; others 1). Feuerbacher 2020's within-session rule (2 up, back to the last success; n=5, low) is
the owner instruction in session copy. Unexpected above-threshold triggers are logged as failures; after a major
scare, copy says pause until appetite and play return.

### 11.4 Completion
`completion(w)` = owner-local days in week w with ≥1 logged plan session ÷ `UNIT.DAYS_PER_WEEK`, for full weeks after
the first plan session. One missed day → nothing (Lally 2010). <`ADAPT.SHRINK_PCT` % for `ADAPT.SHRINK_WEEKS`
consecutive weeks → **minimum viable plan** (management, first teaching item at one micro session/day, enrichment;
skip-reason question; new anchor offer; `ADAPT_SHRINK_LOW_COMPLETION`). Restore one item per week after a week
≥`ADAPT.RESTORE_PCT` %. conv, low. Independent of the current plan, so the shrink is stable.

### 11.5 Worsening
Today's rule, with constants moved to `engine-rules.ts` (`WORSENING_WINDOW_DAYS`, `HIGH_INTENSITY_THRESHOLD`,
`WORSENING_MIN_HIGH_INTENSITY_ENTRIES`, `WORSENING_MIN_HARDER_CHECKINS`): within the window before `now`, ≥ min
high-intensity entries and ≥ min "harder" daily check-ins (check-ins have no domain). **G22** only if every qualifying
high-intensity moment's `problem_domain` is in the trainer allowlist (jumping, mouthing, pulling, barking, chasing);
otherwise **G21** (any other domain, `other` or null). G21's VET part and G22 lapse with the window; the journal hook writes the sticky `worsening_behavior` signal
per key, only when G21 for that aggression/guarding/fear key goes false→true. Moments with `other` or null `problem_domain` (legacy)
count as clinical for the VET part (no floor): a deliberate change from today's trainer routing, toward safety. No intensifying while G21 or G22 holds.

### 11.6 Weekly distress check
"In the past week, did the training plan seem to upset your dog?" 0–3. Latest weekly check-in → this week: `ADAPT.DISTRESS_EASE` (1) → hold
advances, band-minimum sessions (`ADAPT_DISTRESS_EASE`); ≥`ADAPT.DISTRESS_PAUSE` → teaching kept with 0 sessions
(`ADAPT_DISTRESS_PAUSE`); ≥`ADAPT.DISTRESS_PAUSE` in `ADAPT.DISTRESS_REFER_WEEKS` consecutive weeks → `plan_distress`
(G20). LAIR 2018: "distress to the animal over time" predicted client-rated end-of-treatment success (OR 8.05, n=42);
no study of a weekly check; low.

---

## 12. Output and UX contract

### 12.1 API (sub-app `routes/plan.ts`; `findOwnedDog`; non-owned or malformed UUID → **404**)
| Method | Path | Input | Writes |
|---|---|---|---|
| GET | `/api/dogs/:dogId/plan` | `timezoneOffsetMinutes` (bounded as in focus routes), `hotToday`; no client date: the route derives `localDate` and `weekStart` from server `now` | none |
| POST / PUT | existing `/:id/journal`, `/:id/journal/:entryId` (+ guided setup) | `problemDomain` on moments | entry + `worsening_behavior` on transition |
| GET / PUT | `/api/dogs/:dogId/intake` | `intakeSchema` | version + transition signals |
| POST | `/api/dogs/:dogId/aggression-reports` | `aggressionReportSchema` + `idempotencyKey` | append-only row (replay → original) |
| POST | `/api/dogs/:dogId/plan/sessions` | plan-session body (§4.3) + `idempotencyKey` | rows, session, flag signals, proposals |
| POST | `/api/dogs/:dogId/plan/checkins` | `{kind, weekStart, timezoneOffsetMinutes, distress?, skipReason?}` (`skipReason` from the closed §4.6 enum, no free text); `weekStart` = the Monday of the current or previous owner-local week of server `now` | check-in + transition signal |
| POST | `/api/dogs/:dogId/clearances` | clearance schema | clearance |
Writes that touch safety inputs run under the exclusive safety lock. `GET /suggestion` becomes a read-only adapter
(§6.8), then is removed.

### 12.2 Copy
Every `RationaleCode` → `plan.rationale.<CODE>` in `en.ts` and `es.ts`. Items: `plan.items.<id>.*` (≤5 steps);
`plan.management.*`; `plan.notice.*`. Numbers in copy come only from `{key, params}` emitted by the engine from
`engine-rules.ts`; an i18n test fails if a `plan.*` string contains a literal digit, except catalog-sourced item
criteria (`plan.items.*.criteria`), which are catalog content (header note).

### 12.3 Referral screens
What we noticed (codes in plain words); management; who to contact (vet first; DACVB / ECAWBM / CAAB / ACAAB /
IAABC-CDBC / CCPDT-CBCC-KA; UK ABTC CAB/VB/AAB only on vet referral; "behaviorist" unprotected; AVSAB 2026 red-flag
screen); Brief send (§12.4); "record a vet check" (medical clearance). `urgent` → containment first; `role="alert"`, no
dismiss.

### 12.4 Privacy (Brief, share links, telemetry)
- **Bearer share links:** a closed allowlist only: mode; a generic referral code (`REFER_GENERIC_BEHAVIOR`,
  `REFER_GENERIC_VET`, `CAUTION_GENERIC`); life band; **skill and protocol item keys only** (no task or `mgmt.*`
  keys) with stages; per-item session counts and success rates
  (last `BRIEF.EVIDENCE_WEEKS` weeks); coarse bite category (`contact`, `puncture`, `severe` = T5 and T6 merged) with
  report month/year and target `person` or `animal`.
- **Email send (owner opt-in per send, "include health and household details"):** specific trigger codes, child /
  vulnerable-adult targets and household codes, health and medication codes, rehoming/euthanasia code, clearance
  summary. Never: `victimDied`, free text.
- **Telemetry** (write routes only; scalar): `intake.saved {version, engineVersion}`, `aggression_report.created
  {engineVersion}`, `plan_session.logged {itemKind, engineVersion}`, `plan_checkin.saved {kind, engineVersion}`,
  `clearance.saved {engineVersion}`. No trigger, bite, child, health, victim, clearance or rehoming values.
- **Brief storage:** a Brief version freezes the share-link projection in `briefs.plan_snapshot` (jsonb), built under
  the shared lock with server `now` and the request's bounded `timezoneOffsetMinutes`; email opt-in details are rendered
  at send time and never stored there.
- **Logging:** plan, intake, report, clearance, check-in and journal routes log only the route name, IDs and error
  codes, never request bodies or intake values (test).
- Tests: Brief payload snapshot per channel; route telemetry tests; log-content test.

### 12.5 No-guarantee rules
Banned in all `plan.*` copy (case-insensitive word match; aversive-tool and punishment terms allowed only in
`plan.avoid.*` and `plan.management.*`):
- EN: cure, cured, guarantee, guaranteed, permanent fix, alpha, pack leader, dominant, dominance, submissive, correction,
  prong, choke chain, shock collar, e-collar, spray bottle, shaker can, leash pop, alpha roll, scruff, flooding,
  separation anxiety, fear aggression, phobia, dementia, compulsive disorder, and drug names (fluoxetine,
  clomipramine, trazodone, gabapentin, imepitoin, dexmedetomidine, alprazolam, selegiline), drug classes and
  products (SSRI, tricyclic, benzodiazepine, sedative, supplement, pheromone, DAP, Adaptil, CBD, hemp, melatonin,
  L-theanine, tryptophan, valerian, Zylkene, calming chews).
- ES: cura, curar, garantía, garantizado, solución permanente, alfa, líder de la manada, dominante, dominancia, sumiso,
  corrección, collar de púas, collar de ahorque, collar eléctrico, pulverizador, lata con piedras, tirón de correa,
  volteo alfa, inundación, ansiedad por separación, agresividad por miedo, fobia, demencia, trastorno compulsivo, and
  the same drug names and products (ISRS, tricíclico, benzodiacepina, sedante, suplemento, feromona, CBD, cáñamo,
  melatonina, triptófano, valeriana, premios calmantes).
- Dose pattern (both languages): a number followed by `mg`, `ml`, `mg/kg`, `tablet(s)`/`comprimido(s)`.
Timelines are caught by the digit test (§12.2).

### 12.6 UI hooks
Session runner ≥44 px targets, labelled controls, focus management, reduced motion, <20 s to log; single-column today
view on phones.

### 12.7 Web cache (Phase 3, `apps/web/src/lib/plan.ts`)
Query keys: `["plan", dogId, hotToday]`, `["intake", dogId]`. The existing `invalidateTrainingSafetyData`
(`training-safety-cache.ts`) also invalidates `["plan", dogId]`, so every legacy caller (journal, dog, progress
mutations) refreshes the plan. It is called by the intake PUT (plus `intake`, `dogs`, `dogs-overview`), aggression
report, clearance (Phase 1 form), plan session (plus `progress`) and check-in mutations. Web tests: toggling `hotToday`
refetches; a report mutation invalidates suggestion, focus and plan. Web tests: session runner (keyboard, 44 px, `aria-live` result)
and referral screen (`role="alert"`, no dismiss, focus on load).

---

## 13. Test plan (pure targets need no Postgres)

Seeded in-test LCG enumerates ≥5,000 `PlanInput`s over every enum (1 anchor, 1–2 items, ages <7 wk, null intake,
unanswered safety items, legacy signals only).

### 13.1 Properties
1. Determinism (deep-equal on a structural clone; shuffled history ⇒ same plan). 2. File-level purity grep. 3. Every output parses
with `planSchema`. 4. No aversive output; banned terms absent. 5. Safety: mode = max over triggers; adding a trigger
or signal never lowers it; SAFETY_ONLY ⇒ no teaching; REFER ⇒ no exposure or new skills; VET_CHECK ⇒ nothing in
paused domains; person tier ≥T2 ⇒ ≥REFER; child/vulnerable + any HD report ⇒ ≥REFER at any later date; every valid
bite report ⇒ ≥CAUTION; teethOnSkin=false ⇒ T1 and never G02; legacy signals ⇒ floors; animal-directed no-contact `lunge`/`stiff_stare` inside the listed protocols never writes `aggression_or_bite_risk`, every other aggression flag does; any unanswered S item ⇒
≥CAUTION and no exposure items. 6. **Stickiness:** no intake re-save lowers the mode; no session ageing out of the
window lowers it; no signal expires (G15/G17 resolve only by medical clearance); G21/G22 lapse only with the journal window; C1/C2 "yes" without a
report ⇒ G30. 7. **Clearance:** only medical triggers resolve; no clearance lowers
G01–G13, the G19/G21 behaviour floors, L1 aggression/fear/concern, child triggers or CAUTION triggers; a signal reported after a clearance re-applies.
8. Caps and legal placements. 9. Vaccine gate; no dog parks; off-lead nodes (`walk.free`, `recall.side`,
`recall.distance`) never for puppy, juvenile or adolescent bands; `protocol.muzzle` never offered with a person or
animal tier ≥T2 or a fear_handling problem; G07/G04a/G30 plans contain no exposure-flag item; G17 holds after B3 is
set and problems are removed. 10. Every paused value maps (§6.3a). 11. Rationale
reachability: every code is emitted by ≥1 golden (asserted on the plan's full rationale list; the table shows headline
codes), adaptation test or share-link test, at the emitter in §15.2.

### 13.2 Golden cases
Fixtures: server `now` 2026-11-09T12:00:00Z, `timezoneOffsetMinutes` 0, so `localDate` 2026-11-09 (Monday) = weekStart. Reports default to
`predictable = yes`, `context = handling`, `care = none` unless stated. B7 is not shown for BASE fixtures (adult, 4 y);
where a delta shows it, its items are 0 unless stated. **Phase split:** goldens whose expected items are all tasks,
management, enrichment or legacy-aliased skills run in Phase 1; the rest run in Phase 2 (new graph nodes).
**BASE_ADULT:** DOB 2022-11-09, 44.1 lb (20 kg), medium, breeder,
adopted 2023-01-09, vaccine complete; intake (one version, `created_at` 2026-10-01): every S item answered no (`noBites`, `noWarnings`), no problems, traits
null, baseline 0, minutesPerDay 15, anchors [after_breakfast, evening], experience had_dogs, goals []; no reports,
signals, clearances, sessions, check-ins; hotToday false. **BASE_PUPPY:** BASE_ADULT with DOB 2026-09-07 (9 wk), 11 lb,
small, adopted 2026-11-02 (settling day 8), vaccine in_progress, puppy {firstVaccineOn 2026-11-06, dewormed yes}. A
delta with a DOB later than the base adoption date also sets `adoptedAt` = DOB + 8 weeks unless stated. Signals named
below are those the write routes produce for the stated inputs. Expected = mode (triggers) and first 3 items.

| # | Name | Delta | Mode (triggers) | First 3 items |
|---|---|---|---|---|
| 1 | pup_9w_unvaxed | BASE_PUPPY | CLEAR (STAGE_VAX_GATE_PENDING) | protocol.socialization · protocol.house_training · routine.rest_alone |
| 2 | pup_11w_vax_ok | DOB 2026-08-24, firstVaccineOn 2026-10-30 | CLEAR (STAGE_VAX_GATE_MET) | as 1 |
| 3 | pup_12w_fearful | DOB 2026-08-17; socialization sessions (people) with `freezing` on 11-04 and 11-06 → `puppy_fear` | VET_CHECK (G24) | task.vet_visit · mgmt.puppy_fear_pause · protocol.house_training |
| 4 | teen_lab_8mo | DOB 2026-03-09 (adopted 2026-05-04), 28 kg, goals [recall], baseline sit 3, down 2, come 2, harness 3 | CLEAR (STAGE_ADOLESCENT_TOLERANCE) | recall · lead.loose · enr.scent |
| 5 | street_2y_day3 | DOB 2024-11-09, adopted 2026-11-07, originDetail street | CLEAR (STAGE_SETTLING) | protocol.settling · protocol.house_training · eng.name |
| 6 | shelter_4y_day20 | source shelter, adopted 2026-10-21, goals [loose_lead], baseline harness 3, sit 3, down 3 | CLEAR (adoption_d7 due) | lead.loose · calm.settle_mat · enr.scent |
| 7 | senior_12y_dishaa | DOB 2014-11-09, 12 kg, B7 sleep 3, soiling 3 → `dishaa_signs` | VET_CHECK (G18) | task.vet_visit · mgmt.senior_home_safety · eng.name |
| 8 | senior_cleared | #7 + clearance vet, medical, full_plan, created after the signal | CLEAR | eng.name · food.take · enr.scent |
| 9 | bite_T3_child6 | bite adult shallow 1 first_aid; C3 yes (6–9) | REFER urgent (G02, G05) | task.behavior_referral · mgmt.separate_vulnerable · mgmt.no_punish_warnings |
| 10 | bite_T2_adult | bite adult teethOnSkin, no break, 1 bite | REFER (G03) | task.behavior_referral · mgmt.avoid_triggers · mgmt.contain |
| 11 | growl_bone_no_kids | warning adult [food_or_item] freq 1, predictable; guarding_items 1/2 | CAUTION (G07) | mgmt.feed_apart · mgmt.avoid_triggers · mgmt.no_punish_warnings |
| 12 | growl_bone_toddler | #11 + C3 yes (0–5) | REFER (G05) | task.behavior_referral · mgmt.separate_vulnerable · mgmt.no_punish_warnings |
| 13 | bite_T5_hospital | bite adult deep 2 bites hospital | SAFETY_ONLY (G01) | full item list: task.behavior_referral · mgmt.avoid_triggers · mgmt.contain · mgmt.no_punish_warnings · mgmt.log_video · mgmt.muzzle_ask_pro (no enrichment; 7 empty days) |
| 14 | limping_lab_3y | DOB 2023-11-09, 30 kg, B4 [limps, avoids_stairs] → `pain_signs` | VET_CHECK (G14) | task.vet_visit · mgmt.rest_low_impact · eng.name |
| 15 | sudden_growl_3y | DOB 2023-11-09; warning adult [handling] freq 1 predictable; problem fear_handling 1/2; B5 yes (fear_handling) → `sudden_onset_change` (problem_key fear_handling) | VET_CHECK (G15, G07) | task.vet_visit · mgmt.avoid_triggers · mgmt.no_punish_warnings |
| 16 | sep_pup_5mo_mild | DOB 2026-06-09 (adopted 2026-08-04), separation 2/2 vocalising <5 only | CAUTION (SAFE_CAUTION_PUPPY_SEPARATION) | mgmt.absence_cover · protocol.house_training · routine.rest_alone |
| 17 | sep_adult_selfinjury | DOB 2023-11-09, separation [destruction, self_injury], C5 yes | REFER urgent (G08, G11) | task.behavior_referral · mgmt.contain · mgmt.avoid_triggers |
| 18 | sep_adult_pacing | separation [pacing], goals [loose_lead], baseline harness 3, sit 3 | VET_CHECK (G29) | task.vet_visit · mgmt.absence_cover · protocol.relaxation |
| 19 | noise_mild_adult | noise 2/2, recovery minutes | CAUTION (G27) | mgmt.safe_place · protocol.noise_adhoc · protocol.relaxation |
| 20 | noise_panic_escape | noise 3/5, recovery days, escape | REFER (G12) | task.behavior_referral · mgmt.safe_place · protocol.relaxation |
| 21 | leash_reactive | leash_reactivity_dogs 3/3, startDistanceM 15 | CAUTION (G26) | mgmt.walk_distance · protocol.relaxation · eng.name |
| 22 | pug_bcs8_hot | DOB 2021-11-09, 8 kg, heatBreeds [pug], flatFaced yes, BCS 8, hotToday | CLEAR (HEAT_NO_EXERTION, BRACHY_HARNESS) | eng.name · food.take · enr.scent |
| 23 | aversive_history | C8 yes, goals [recall], baseline come 2 | CAUTION (G23) | recall (S2) · pos.sit · enr.scent |
| 24 | rehoming | C7 yes | REFER (G13) | task.behavior_referral · mgmt.contain · enr.scent |
| 25 | budget_4min | minutesPerDay 4 | CLEAR (DOSE_LOW_BUDGET) | eng.name · enr.scent · enr.sniff_walk |
| 26 | low_completion | goals [loose_lead], baseline harness 3, sit 3; first plan session 2026-10-12; logged on 2 days (wk 10-26) and 3 days (wk 11-02) | CLEAR (ADAPT_SHRINK_LOW_COMPLETION) | lead.loose · enr.scent · enr.sniff_walk |
| 27 | distress_twice | #26 with sessions on 7 days each week + weekly check-ins distress 2 (wk 10-26), 2 (wk 11-02) → `plan_distress` | VET_CHECK (G20, ADAPT_DISTRESS_PAUSE) | task.vet_visit · lead.loose (0 sessions) · pos.down (new, 0 sessions) |
| 28 | worsening_jumping | jumping 3/3; 2 journal entries intensity 4 (jumping) + 2 harder check-ins in the last 14 days (read time) | CAUTION (G22) | eng.name · enr.scent · enr.sniff_walk |
| 29 | worsening_fear | fear_strangers 3/3 → `fear_problem`; same journal pattern (fear_strangers), read time | REFER (G21 fear floor SAFE_REF_BEHAVIOR_FLOOR, G28) | task.behavior_referral · task.vet_visit · mgmt.avoid_triggers |
| 30 | bite_T3_cleared | #9 without child + clearance vet behaviorist, behavior | REFER urgent (G02; clearance recorded, no effect) | task.behavior_referral · mgmt.avoid_triggers · mgmt.contain |
| 31 | no_dob | DOB null | CLEAR (NOTICE_ASK_DOB) | eng.name · food.take · enr.scent |
| 32 | bite_two_shallow | bite adult shallow 2 bites first_aid | REFER urgent (G02) | task.behavior_referral · mgmt.avoid_triggers · mgmt.contain |
| 33 | bite_clothing_only | bite adult teethOnSkin false [handling] predictable, care none | CAUTION (G07; T1) | mgmt.avoid_triggers · mgmt.no_punish_warnings · eng.name |
| 34 | dog_directed_repeat | 2 bites target dog T2, unpredictable | REFER (G04b) | task.behavior_referral · mgmt.avoid_triggers · mgmt.contain |
| 35 | dog_directed_single | 1 bite dog T2 predictable | CAUTION (G04a) | mgmt.avoid_triggers · mgmt.contain · mgmt.no_punish_warnings |
| 36 | vulnerable_adult_growl | warning adult [resting] freq 1 predictable; C4 yes | REFER (G05) | task.behavior_referral · mgmt.separate_vulnerable · mgmt.no_punish_warnings |
| 37 | legacy_aggression_no_intake | intake null; signal aggression_or_bite_risk (behavior_concern) 2026-05-01 | REFER (L1, G30) | task.behavior_referral · mgmt.avoid_triggers · mgmt.contain |
| 38 | legacy_injury_no_intake | intake null; signal injury_or_pain (practice_session) 2026-10-01 | VET_CHECK (L1/G14, G30) | task.vet_visit · mgmt.rest_low_impact · eng.name |
| 39 | sep_adult_brief_vocal | DOB 2023-11-09, separation 1/1 vocalising <5 only | CAUTION (SAFE_CAUTION_ADULT_SEPARATION) | mgmt.absence_cover · protocol.relaxation · eng.name |
| 40 | pup_4mo_pacing | DOB 2026-07-13 (adopted 2026-09-07), separation [pacing] | VET_CHECK (G29) | task.vet_visit · mgmt.absence_cover · protocol.house_training |
| 41 | pup_under_7w | DOB 2026-10-05, adopted 2026-11-02, firstVaccineOn null | CLEAR (NOTICE_UNDER_7_WEEKS) | as 1 |
| 42 | pup_fear_recheck | BASE_PUPPY DOB 2026-08-31; 1 socialization session (people) `freezing` 11-05 | CLEAR (STAGE_FEAR_PAUSE) | mgmt.puppy_fear_pause · protocol.socialization (people recheck S1) · protocol.house_training |
| 43 | consultant_vs_child | #12 + clearance consultant, behavior, full_plan | REFER (G05) | as 12 |
| 44 | report_after_clearance | clearance vet, medical, created 2026-10-01; bite T3 occurred 09-15, reported 11-01 | REFER urgent (G02) | as 32 |
| 45 | resave_after_clearance | #8 + intake version 2026-11-08 with identical answers (no new signal) | CLEAR | as 8 |
| 46 | resave_drops_answer | #24 + new intake with C7 = no | REFER (G13, sticky) | as 24 |
| 47 | unknown_safety | BASE_ADULT with C3 unanswered, goals [loose_lead], baseline harness 3, sit 3 | CAUTION (G30; blockingQuestions [C3]) | lead.loose · pos.down (pulled for calm.settle_mat) · enr.scent |
| 48 | lunge_flag_outside_protocol | #21 + one relaxation session with `lunge` (target animal) → `aggression_or_bite_risk` (relaxation is not an exposure protocol) | REFER (L1, G26) | task.behavior_referral · mgmt.avoid_triggers · mgmt.contain |
| 50 | lunge_in_lat | #21 + relaxation sessions on all 7 days of last week reaching stage 3 (pattern.lat unlocked at weekStart) + one `pattern.lat` session with `lunge` (target animal, no contact) | CAUTION (G26); pattern.lat steps back | mgmt.walk_distance · protocol.relaxation · pattern.lat |
| 51 | growl_at_person_in_lat | #50 but `growl`, target person | REFER (L1) | task.behavior_referral · mgmt.avoid_triggers · mgmt.contain |
| 49 | med_change_sticky | intake created 2026-08-01 with B3 yes + jumping 1/1; signal `medical_change` 2026-08-01 | VET_CHECK (G17, sticky) | task.vet_visit · eng.name (pulled by greet.polite) · food.take |
| 52 | escalating_warnings | warning adult [handling, resting] freq 2, escalating | REFER (G06) | task.behavior_referral · mgmt.avoid_triggers · mgmt.contain |
| 53 | repetitive | C6 yes | REFER (G09) | task.behavior_referral · mgmt.log_video · enr.scent |
| 54 | severe_fear | C9 yes | REFER (G10) | task.behavior_referral · mgmt.avoid_triggers · enr.scent |
| 55 | late_onset | DOB 2018-11-09 (8 y), 12 kg, B7 all 0, barking 2/2 onset 7y_or_older | VET_CHECK (G16) | task.vet_visit · eng.name · food.take |
| 56 | med_change_fresh | B3 yes in an intake version created 2026-10-20; jumping 1/1 | VET_CHECK (G17) | task.vet_visit · eng.name · food.take |
| 57 | no_progress | noise 2/2 recovery minutes; relaxation sessions too_hard on 11-03, 11-04, 11-05 → `no_progress` (noise) | VET_CHECK (G19, G27) | task.vet_visit · mgmt.safe_place · protocol.relaxation |
| 58 | low_impact_clearance | #14 + clearance vet, medical, low_impact_only, created after the signal | CAUTION (SAFE_CLEARED_WITH_CONSTRAINTS; physical paused) | eng.name · food.take · enr.scent |
| 59 | household_resave | #12 + new intake with C3 = no (signal `household_child` stays) | REFER (G05) | as 12 |
| 60 | c1_yes_no_report | C1 yes, no report filed | CAUTION (G30, blockingQuestions [C1]) | eng.name · food.take · enr.scent |
| 61 | worsening_aggression | warning adult [resting] freq 1 predictable; 2 journal entries intensity 4 (aggression) + 2 harder check-ins in 14 d | REFER (G21 floor SAFE_REF_BEHAVIOR_FLOOR, G07) | task.behavior_referral · task.vet_visit · mgmt.avoid_triggers |
| 63 | first_intake_midweek | now 2026-11-11T12:00:00Z; the only intake created 2026-11-10 (goals [loose_lead], baseline harness 3, sit 3) | CLEAR (first-plan exception) | lead.loose · pos.down (pulled for calm.settle_mat) · enr.scent |
| 64 | b5_cleared | intake created 2026-09-01 with B5 yes (barking) + barking 1/1; signal 2026-09-01; clearance vet, medical, full_plan created 2026-10-01 | CLEAR (G15 resolved) | eng.name (pulled by calm.settle_mat) · food.take · enr.scent |
| 65 | absence_start_stage | #16 + latest relaxation session at stage 3 (before weekStart), `firstSignAfterS` 40 | CAUTION (as 16) | as 16; protocol.absence present at stage 4 (15 s) |
| 66 | skill_step_back | goals [loose_lead], baseline harness 3, sit 3; plan row lead.loose stored 3; sessions 11-05 50 %, 11-06 55 % | CLEAR (ADAPT_STEP_BACK) | lead.loose (sessionStage 2, stored 3) · pos.down · enr.scent |
| 67 | worsening_floor_sticky | #61 but the journal pattern was 2026-09-20…09-25 (`worsening_behavior` written 09-25; window now empty) | REFER (SAFE_REF_BEHAVIOR_FLOOR, G07) | task.behavior_referral · mgmt.avoid_triggers · mgmt.contain |
| 68 | puppy_house_soiling | BASE_PUPPY DOB 2026-08-17, house_soiling 2/2 (no `adult_house_soiling` written) | CLEAR | protocol.socialization · protocol.house_training · routine.rest_alone |
| 69 | g21_vet_cleared | #61 + clearance vet, medical, full_plan created after the qualifying moments | REFER (floor stays; G21 VET part resolved, no vet task) | task.behavior_referral · mgmt.avoid_triggers · mgmt.contain |
| 72 | noise_worsening_g21 | noise 1/1 recovery minutes; moments intensity 4 (noise) ×2 + 2 harder check-ins | VET_CHECK (G21 noise, no floor; G27) | task.vet_visit · mgmt.safe_place · protocol.relaxation |
| 75 | noise_worsening_cleared | #72 + clearance vet, medical, full_plan created after the moments | CAUTION (G27; G21 resolved) | mgmt.safe_place · protocol.noise_adhoc · protocol.relaxation |
| 73 | unknown_dob_dishaa | DOB null, B7 sleep 3 | VET_CHECK (G18) | task.vet_visit · mgmt.senior_home_safety · eng.name |
| 74 | g04a_dog_items | BASE_PUPPY + 1 bite: target dog, T2, predictable | CAUTION (G04a) | mgmt.avoid_triggers · mgmt.contain · mgmt.no_punish_warnings; no exposure-flag item (`protocol.socialization` absent) |
| 76 | wednesday_bite | now 2026-11-11T12:00:00Z; goals [loose_lead], baseline harness 3, sit 3, lead.loose plan sessions before Monday; bite adult shallow 1, reported 2026-11-11 | REFER urgent (G02) | task.behavior_referral · mgmt.avoid_triggers · mgmt.contain (mode and safety items change on Wednesday; the Monday teaching set is only filtered by mode, never extended) |
| 70 | g22_legacy_adapter | #28 | CAUTION (G22); `toLegacySafety` → `{suppressed, sustained_worsening_intensity, credentialed_trainer}` | as 28 |
| 71 | no_progress_all_keys | noise 2/2 and separation 3/3 (vocalising <5 only, adult); 3 relaxation sessions `too_hard` → `no_progress` for noise and for separation | VET_CHECK (G19 noise + separation) + CAUTION (G27, G29) | task.vet_visit · mgmt.safe_place (G27) · mgmt.absence_cover (G29) |
| 77 | profile_dates_invalid | adopted 2022-10-01 (before DOB) | CLEAR (NOTICE_PROFILE_DATES; adoptedAt treated as null) | eng.name · food.take · enr.scent |
| 78 | hot_adult | hotToday | CLEAR (HEAT_CAUTION) | eng.name · food.take · enr.scent (none of these is outdoor; `enr.sniff_walk` shortened) |
| 79 | growl_at_animal_in_lat | #50 but `growl`, target animal | REFER (L1, G26) | task.behavior_referral · mgmt.avoid_triggers · mgmt.contain |
| 80 | worsening_other_domain | 2 journal moments intensity 4, `problem_domain` other, + 2 harder check-ins in 14 d | VET_CHECK (G21 other, no floor; new cap 1 as in 28); never `credentialed_trainer` | task.vet_visit · eng.name · enr.scent |

Goldens change only with a reviewed diff and an `ENGINE_VERSION` bump.

### 13.3 Adaptation and data tests
§11 boundaries (79/80, 59/60, 39/40 %; advancement window: two 12-trial sessions at 100 % on two days → proposal, one 12-trial session → none, a low-flag-ended session is skipped; 2nd/3rd failure; completion 3/7 vs 4/7 days; distress 1/2); plan proposals
never exceed `topStage`; first log keeps the baseline start stage; a node at version ≠ `CURRICULUM_VERSION` can be
proposed and confirmed; protocol items never create proposals; adding a node keeps other items' evidence; ancestor
rule; nearest-prereq order; handling stage per area; socialisation per category; outcome derivation incl. opt-out
limits; one trial per protocol; per-key `worsening_behavior` transitions (second clinical key writes its own signal;
`other`/null-domain moments → G21 VET part without floor; G22 only for allowlisted domains; missing `problemDomain` → 400 `problem_domain_required`); all windows/ages use `now`; the same UTC `now` under offsets −600 and +600 at a day boundary gives different
`localDate`/`settlingDay` (midnight test); a Wednesday report changes mode and safety items immediately (golden 76).

### 13.4 Rule-constant coverage
1. Every constant has sources; convention ⇒ confidence ≠ high. 2. Every constant is imported by some `apps/api` source file and by some test; constants without a value are not
   constants (dropped). AST scan of both files: no numeric literal other than
`0` and `1` (integers and fractions). 3. No digit literals in `plan.*` i18n strings. 4. Every code has en+es copy and an
emitter. 5. The release check fails while any constant has `advisorReview` without `reviewedBy` (no separate list). 6. A
snapshot hash of `engine-rules.ts` is pinned to `ENGINE_VERSION`: changing a constant without bumping the version
fails.

### 13.5 API tests (Postgres)
GET plan writes nothing; 404 for cross-user/malformed UUID on all new routes; each guarded legacy route returns 404 for
a plan row (`GET …/skills/:skillId/contextual-progress`, `PUT …/skills/:skillId`, `PUT …/skills/:skillId/level`,
`DELETE …/skills/:skillId`, `POST …/skills/:skillId/sessions`, `PATCH …/sessions/:sessionId/evidence`,
`DELETE …/sessions/:sessionId`, `POST …/focus`, `DELETE …/goals/:goalId`, `POST …/goals/:goalId/skills`); `GET
/api/dogs/:id` and the other aggregates exclude plan rows; a stepped-back session is stored as `fallback` at the stored
level; protocolStage outside `1…min(derived+1, ladder)` → 400; first protocol log creates one goal + row, no proposal; PUT intake
cannot remove reports or signals; transition signals are written once; reports/clearances not editable or deletable;
check-in week validation; a check-in completing G20 writes `plan_distress` once; RLS on new tables; Brief per-channel and telemetry allowlists; Brief generate stores `plan_snapshot` = the share-link projection
of the plan at server `now` (a bite report committed first is reflected); a bite report suppresses
legacy `/suggestion`, focus and advancement decisions; idempotency: same key + same payload → original row (200),
different payload → 409, two concurrent first sessions for one item create one plan goal, one row and one session;
client `outcome` → 400; new moment without `problemDomain` → 400; PUT that yields a high-intensity moment without
`problemDomain` → 400; future-dated `occurredAt` on plan sessions and journal POST/PUT → 400; missing `problemDomain` → `problem_domain_required`; legacy
safety-signal schemas reject engine signal types; a high-tier aggression flag without `flagTarget` → 400; a
medical-scope clearance from `credentialed_behavior_consultant` → 400; a vet `behavior`-scope clearance resolves no
G01–G13 trigger; a `yelp_or_pain_response` flag writes `injury_or_pain` (VET_CHECK); adoption check-in kinds
unique per dog; the journal hook runs one grouped aggregate
query per write; journal POST, PUT and guided-setup writes call the
hook (one `worsening_behavior` per key).

---

## 14. Rollout and open questions

### 14.1 Phases (IMPROVEMENT-PLAN)
| Phase | Work |
|---|---|
| 0 | DOB/weight/adoption date in forms + `adoptedAt ≥ DOB`; defects #1–5 and #8 (accessibility/mobile, unchanged); pure test target (no schema change) |
| 1 | constants, schemas, the one migration (drained pre-deploy; incl. `problem_domain`), the web `problemDomain` picker in the quick composer and journal edit, the minimal "record a vet check" form, G21/G22 routing, removal of the injury expiry together with the clearance route, `safety-mode.ts` (signals, clearances, legacy floor, adapter), `buildPlan` over existing skills + aliases, plan sessions route with guards and the §4.3 advancement changes, GET plan, goldens; **extend `docs/operations/safety-signal-correction.md` to reports, transition signals and clearances** |
| 2 | graph nodes and ladders with EN+ES prose; advisor review of every ★ item |
| 3 | intake UI, report flow, today view, session runner, referral screen, check-ins; remove legacy focus compat, `suggestion-rules.ts`, contextual action path |
| 4 | recalibration (§2) |

### 14.2 Open questions (★ = launch-blocking)
1. ★ **Verified professional-resolution workflow**: until it exists, no clearance lowers any aggression, child,
   panic, rehoming or legacy trigger (§6.6). Design and advisor sign-off needed.
2. ★ L2 boundary, urgent tier, the convention parts of the §6.2 tier table. 3. ★ Child ≤14, vulnerable adults, no decay for G05.
4. ★ The §4.5 aggression-flag rule: lunge/stiff stare at an animal inside exposure protocols → CAUTION only; growl,
   lip curl, air snap or snap at an animal (even inside exposure protocols), all person-directed, contact and
   out-of-protocol flags → REFER.
5. ★ Permanence of CAUTION signals (reactivity, mild noise, fear, aversive history) with no clearance path.
6. ★ Animal-directed thresholds; G26–G28. 7. ★ Heat tiers and tap behaviour; future numeric thresholds.
8. ★ DS/CC numbers. 9. ★ Stress tiers. 10. ★ LAT vs Edinburgh. 11. ★ Separation sub-gate. 12. ★ Opt-out rule.
13. Muzzle-for-all copy; distress/worsening thresholds; session minutes, budget factor, caps.

**Licensing:** C-BARQ, DIAS/LSSS, CCDR/CADES (not administered), BCS chart, AKC/KC/IKC paraphrase, credential display.
**Library full texts:** Johnson & Wynne 2024 *Animals* 14:2632; Takeuchi 2000; Demant 2011; Meyer & Ladewig 2008;
Dunbar full scale; Shepherd's ladder; Madari 2015; Salvin 2011; Overall protocol; Butler 2011; Sherman & Mills 2008;
Lally 2010; Stepita 2013; Dutrow Table S3; Morrill per-breed tables; Urfer lifespan; physeal closure; Krontveit 2012;
current KC Bronze guidelines.

### 14.3 Deferred to v2
Breed/size priors (D04 §3 shrinkage `k = 0.91r/(0.91r + 1 − r)`; never lower an observed fear score); numeric heat
thresholds with client weather input; `migrateIntake` (with intake-2); house-training accident flag; the optional crate protocol and its crate-hours
notice; plan snapshot table; regress proposals (v1 uses the derived `sessionStage`); level reconstruction from
milestones; protocol replay from history; the 4-week no-progress branch of G19; stranger-watch notice; 3-3-3 notice;
adult 5-minute opt-in; socialisation exposures/day; vet cognition scores (CCDR/CADES, B8) and `STAGE_CCD_SUPPORT`; a stored child age band; a verified professional-resolution
workflow (§14.2 item 1); clearance of CAUTION signals.

---

## 15. Appendix

### 15.1 Constants (one row per id; `basis` and `confidence` use the §2 enums; ★ = advisorReview)

| id | value | basis | confidence | sources |
|---|---|---|---|---|
| UNIT.DAYS_PER_WEEK | 7 | definition | high | calendar |
| UNIT.PCT | 100 | definition | high | percent |
| UNIT.DAYS_PER_MONTH | 30.44 | definition | high | mean month |
| UNIT.MS_PER_DAY | 86400000 | definition | high | calendar |
| UNIT.MONTHS_PER_YEAR | 12 | definition | high | calendar |
| UNIT.LB_PER_KG | 2.2046 | definition | high | unit |
| UNIT.KG_DECIMALS | 1 | definition | high | display rounding |
| SAFE.MULTI_BITE_MIN ★ | 2 | convention | low | Dunbar L5 "multiple bites" |
| SAFE.SAFETY_ONLY_TIER ★ | 5 | position | med | Dunbar; AAHA |
| SAFE.URGENT_TIER ★ | 3 | convention | low | AAHA (deep, immunocompromised) + conv |
| SAFE.REFER_MIN_TIER ★ | 2 | convention | low | §6.3b |
| SAFE.ANIMAL_REPEAT_MIN ★ | 2 | convention | low | AAHA Table 5 |
| SAFE.MULTI_CONTEXT_MIN | 2 | convention | med | AAHA; Dogs Trust |
| SAFE.MULTI_TARGET_MIN | 2 | convention | med | AAHA; Dogs Trust |
| SAFE.T1_REPEAT_MIN | 2 | convention | med | AAHA; Dogs Trust |
| SAFE.FEAR_SEVERE_CATEGORIES | 3 | convention | low | D02a G-13 |
| SAFE.FEAR_SEVERE_INTENSITY | 4 | convention | low | D02a G-13 |
| SAFE.FEAR_CAUTION_FREQ ★ | 2 | convention | low | AAHA Table 5 |
| SAFE.FEAR_CAUTION_INTENSITY ★ | 3 | convention | low | AAHA Table 5 |
| SAFE.REACTIVITY_MIN_FREQ ★ | 1 | convention | low | AAHA Table 5 |
| SAFE.NOISE_RECOVERY_DAYS | 1 | convention | low | Riemer 2019 |
| SAFE.PAIN_SIGNS_MIN | 2 | convention | low | Mills 2020; D04 R11 |
| SAFE.DISHAA_ITEM_MIN | 2 | convention | low | AAHA 2023 |
| SAFE.PUPPY_FEAR_SESSIONS | 2 | convention | low | AVSAB 2008 |
| SAFE.SEP_PUPPY_MAX_AGE_MO ★ | 6 | convention | low | D02a G-11 |
| SAFE.SEP_MILD_VOCAL_MIN ★ | 5 | convention | low | D02a G-11 |
| SAFE.SEP_VOCAL_SEVERE_MIN ★ | 15 | convention | low | D02b R-SEP-02 |
| WORSENING_WINDOW_DAYS ★ | 14 | convention | low | moved from `safety-policy.ts` |
| HIGH_INTENSITY_THRESHOLD ★ | 4 | convention | low | moved from `safety-policy.ts` |
| WORSENING_MIN_HIGH_INTENSITY_ENTRIES ★ | 2 | convention | low | moved from `safety-policy.ts` |
| WORSENING_MIN_HARDER_CHECKINS ★ | 2 | convention | low | moved from `safety-policy.ts` |
| STAGE.MIN_PLAN_AGE_WK | 7 | position | med | AVSAB 2008 |
| STAGE.PUPPY_LATE_START_WK | 12 | convention | med | D03 3.1 |
| STAGE.JUVENILE_START_WK | 16 | convention | med | D03 3.1 |
| STAGE.ADOLESCENT_START_MO | 6 | convention | low | D03 C5 |
| STAGE.ADOLESCENT_END_MO | 18 | convention | low | D03 C5 |
| STAGE.ADOLESCENT_END_LARGE_MO | 24 | convention | low | D03 C5 |
| STAGE.LARGE_KG | 25 | convention | low | conv |
| STAGE.SENIOR_FRACTION | 0.75 | position | high | AAHA |
| STAGE.SENIOR_SCREEN_Y | 7 | convention | med | Wallis; Hopper; AAHA |
| STAGE.LIFESPAN_DEFAULT_Y | {small: 13.5, medium: 12, large: 10.5, giant: 8.5} | convention | low | D03 (inferred) |
| SIZE.SMALL_MAX_KG | 10 | convention | low | conv |
| SIZE.MEDIUM_MAX_KG | 25 | convention | low | conv |
| SIZE.LARGE_MAX_KG | 45 | convention | low | conv |
| STAGE.SETTLE_DAYS | 7 | convention | low | D03 R-SETTLE |
| STAGE.SETTLE_DAYS_LONG | 14 | convention | low | D03 R-SETTLE |
| STAGE.ADOPTION_CHECKIN_DAYS | [7, 30, 90, 180] | study | med | Bohland 2023 |
| STAGE.FEAR_PAUSE_MIN_DAYS | 3 | convention | low | AAHA |
| STAGE.PUPPY_FEAR_WINDOW_DAYS | 14 | convention | low | conv |
| VAX.DAYS_AFTER_FIRST_SET | 7 | position | high | AVSAB 2008 |
| VAX.ASK_MAX_AGE_WK | 20 | convention | low | conv |
| SOC.CHECKLIST_MAX_AGE_WK | 16 | position | med | AVSAB; Howell |
| SLEEP.PUPPY_NIGHT_H (copy) | 9 | study | low | Dale 2024 |
| SLEEP.TOTAL_H (copy) | [8, 14] | study | low | Kinsman 2020 |
| JOINT.NO_STAIRS_MO (copy) | 3 | study | med | Krontveit 2012 |
| HOUSE.INTERVAL_H (copy) | [1, 2] | convention | low | conv |
| TRAIT.FEAR_HIGH | 3 | convention | low | scale (0–4 mean) |
| TRAIT.ENERGY_HIGH | 3 | convention | low | scale (0–4 mean) |
| TRAIT.CHASING_HIGH | 3 | convention | low | scale (0–4 mean) |
| TRAIT.SEPARATION_HIGH | 3 | convention | low | scale (0–4 mean) |
| INTAKE.MIN_ANSWERED | 0.75 | convention | med | C-BARQ practice |
| HEAT.CFR_RISK | 0.5 | study | high | Packer 2015 |
| HEAT.BCS_RISK | 6 | convention | low | Packer; Tomlinson; Fawcett |
| HEAT.ENV_RISK_AGE_Y | 12 | study | med | Hall 2020/2022 |
| HEAT.YOUNG_EXERTION_AGE_Y | 2 | study | med | Hall 2020 |
| HEAT.WEIGHT_ELEVATED_KG | 10 | study | high | Hall 2020 |
| HEAT.CAUTION_SHORTEN_PCT ★ | 50 | convention | low | conv |
| REW.TREAT_KCAL_PCT (copy) | 10 | convention | med | D01 R8 |
| REW.MARKER_PAIRINGS (copy) | [5, 20] | convention | low | D01 R10 |
| GRAPH.NEW_SKILL_STAGES | 3 | convention | low | conv |
| SEL.PREREQ_MIN_STAGE | 2 | convention | low | conv |
| SEL.OUTSIDE_START_CAP | 3 | convention | low | conv |
| SEL.ADOLESCENT_START_OFFSET | 1 | convention | low | D03 |
| SEL.TRUST_START_OFFSET | 1 | convention | low | D01 R4 |
| SEL.NEW_PER_WEEK | 1 | convention | low | D06 D3 |
| SEL.FIRST_WEEK_NEW | 2 | convention | low | D06 D3 |
| SEL.ACTIVE_MAX | 2 | convention | low | D06 D5 |
| SEL.ACTIVE_MAX_FEAR_SEP | 3 | convention | low | D06 D5 |
| SEL.MAINT_PER_WEEK | 2 | convention | low | conv |
| SEL.MGMT_MAX | 5 | convention | low | conv |
| SEL.STEPS_MAX | 5 | study | low | Takeuchi 2000; LAIR |
| DOSE.SESSION_MIN | {puppy_early: 1, puppy_late: 2, juvenile: 2, adolescent: 3, adult: 3, senior: 2} | convention | low | Fear Free; D01 R15 differs |
| DOSE.MAX_SESSIONS_PER_DAY | {puppy_early: 5, puppy_late: 4, juvenile: 4, adolescent: 3, adult: 3, senior: 3} | convention | low | D01 R16 |
| DOSE.FEARFUL_MAX_MIN | 2 | convention | low | Fear Free |
| DOSE.MICRO_SESSION_MIN | 2 | convention | low | conv |
| DOSE.BUDGET_FACTOR | 0.6 | convention | low | D06 D1 |
| DOSE.MIN_BUDGET | 5 | convention | low | D01 R16 |
| DOSE.DEFAULT_MINUTES_PER_DAY | 10 | convention | low | D06 D1 |
| DOSE.NO_NEW_LEARNING_AFTER_MIN | 60 | study | low | Kis 2017 |
| SCHED.MAINT_DAY_OFFSET | 3 | convention | low | conv |
| ADAPT.MAX_SAME_SKILL_PER_DAY | 3 | convention | low | Demant 2011 (back-to-back only) |
| ADAPT.ADVANCE_PCT | 80 | convention | low | D01 R19 |
| ADAPT.WINDOW_TRIALS | 10 | convention | low | D01 R19 |
| ADAPT.MIN_SESSIONS | 2 | convention | low | D06 A1 |
| ADAPT.MIN_DAYS | 2 | convention | low | D06 A1 |
| ADAPT.STEP_BACK_PCT | 60 | convention | low | D01 R19 |
| ADAPT.STEP_BACK_CONSECUTIVE | 2 | convention | low | D01 R19 |
| ADAPT.END_PCT | 40 | convention | low | D01 R19 |
| ADAPT.STEP_BACK_SIZE | 1 | convention | low | Feuerbacher 2020 |
| ADAPT.STEP_BACKS_BEFORE_EASE | 2 | convention | low | D01 R21 |
| ADAPT.STRESS_LOW_END_COUNT ★ | 2 | convention | low | Purdue (D06 L2) |
| ADAPT.OPT_OUTS_MAX ★ | 2 | convention | low | Klebba; WDJ |
| ADAPT.SHRINK_PCT | 50 | convention | low | D06 A3 |
| ADAPT.SHRINK_WEEKS | 2 | convention | low | D06 A3 |
| ADAPT.RESTORE_PCT | 80 | convention | low | D06 A3 |
| ADAPT.MAINT_SESSIONS_PER_WEEK | 1 | convention | low | D06 A7 |
| ADAPT.DISTRESS_EASE | 1 | convention | low | from LAIR |
| ADAPT.DISTRESS_PAUSE | 2 | convention | low | from LAIR |
| ADAPT.DISTRESS_REFER_WEEKS | 2 | convention | low | from LAIR |
| DSCC.ADVANCE_SUCCESSES ★ | 2 | study | low | Feuerbacher 2020 |
| DSCC.START_FRACTION ★ | 0.5 | convention | low | D02 NOTES 3.4 |
| DSCC.DISTANCE_START_FACTOR ★ | 1.5 | convention | low | D02 NOTES 3.4 |
| DSCC.DISTANCE_STEP_PCT ★ | 10 | convention | low | conv |
| DSCC.FAIL_SESSIONS_DROP ★ | 2 | convention | low | D02a P-04 |
| DSCC.FAIL_SESSIONS_REGATE ★ | 3 | convention | low | D02a P-04 |
| DSCC.DROP_STAGES ★ | 2 | convention | low | D02a P-04 |
| DSCC.MAX_STAGE | 60 | definition | high | schema bound |
| DSCC.ABSENCE_LADDER_S ★ | [0, 5, 10, 15, 30, 45, 60, 90, 120, 150, 180, 210] | study | low | Feuerbacher 2020 (DIGEST-a P-06) |
| DSCC.ABSENCE_STEP_S ★ | 30 | convention | low | conv |
| DSCC.ABSENCE_LINEAR_MAX_S ★ | 600 | convention | low | conv |
| DSCC.ABSENCE_GROWTH ★ | 1.25 | convention | low | conv |
| DSCC.ABSENCE_MAX_S ★ | 14400 | convention | low | conv |
| SEP.ABSENCE_PREREQ_RELAX_STAGE ★ | 3 | convention | low | AAHA SRP case |
| RELAX.DURATIONS_S | [5, 10, 15, 30, 60, 120, 300] | convention | low | Overall (paraphrased) |
| RELAX.GETUPS_MAX | 2 | convention | low | conv |
| NOISE.MAX_STEP | 10 | convention | low | conv |
| MUZZLE.FIRST_SESSION_MAX_MIN | 2 | position | med | Cornell |
| MUZZLE.SESSION_MAX_MIN | 5 | convention | low | conv |
| ENR.SCENT_MIN | [5, 10] | convention | low | D06 D9 |
| ENR.SCENT_MIN_HIGH | [10, 20] | convention | low | D06 D9 |
| ENR.REST_BLOCKS | 2 | convention | low | D06 D12 |
| HIST.WINDOW_DAYS | 56 | convention | low | conv |
| HIST.CHECKIN_WEEKS | 8 | convention | low | conv |
| BRIEF.EVIDENCE_WEEKS | 8 | convention | low | conv |

Combined position+convention bases are recorded as `convention` with `low` confidence. Removed in revisions 3–9:
`ADAPT.MASTERY_ENVIRONMENTS`, `API.TODAY_TOLERANCE_DAYS`, `SAFE.SUDDEN_ONSET_WEEKS`, `SAFE.MED_CHANGE_WEEKS`,
`SAFE.LATE_ONSET_AGE_Y`, `STAGE.PUPPY_FEAR_CATEGORIES`, `TRAIT.HIGH`, `CAL.MIN_DOGS`, `DSCC.RECOVERY_MAX_DAYS`, `HOUSE.ACCIDENTS_FLAG_PER_WK`, `CRATE.NOTICE_H`,
`SAFE.CHILD_WARNING_WINDOW_MO`, `SAFE.CHILD_MAX_AGE_Y`, `SAFE.NO_PROGRESS_WEEKS`, `SOC.EXPOSURES_PER_DAY`,
`SEL.NEW_REQUIRES_COMPLETION_PCT`, `DOSE.ADULT_OPT_IN_MIN`, `ADAPT.REGRESS_PROPOSE_WEEKS`, `SAFE.ROLLOUT_DATE`,
`SAFE.SIGNAL_WINDOW_DAYS`, `STAGE.CCDR_*`, `SEP.ISOLATION_PREREQ_S`, `SAFE.BITE_TIER_MAP`, `HEAT.TIERS_AND_TAP` (§14.3).

### 15.2 Rationale codes → emitter

| Code | Emitter |
|---|---|
| SAFE_CLEAR | default |
| SAFE_CAUTION_WARNING_PREDICTABLE / _DOG_DIRECTED / _REACTIVITY / _MILD_NOISE / _FEAR | G07 / G04a / G26 / G27 / G28 |
| SAFE_CAUTION_PUPPY_SEPARATION / _ADULT_SEPARATION | §6.4 rows 2 / 3 |
| SAFE_CAUTION_UNKNOWN_SAFETY | G30 |
| TRUST_REBUILD | G23 |
| SAFE_VET_PAIN, _SUDDEN_ONSET, _LATE_ONSET, _MEDICAL_CHANGE, _SENIOR_SIGNS, _SEPARATION_SIGNS, _PUPPY_FEAR, _NO_PROGRESS, _PLAN_DISTRESS, _WORSENING_CLINICAL | G14, G15, G16, G17, G18, G29, G24, G19, G20, G21 |
| SAFE_REF_BITE_CONTACT, _BITE_SEVERE, _ANIMAL_DIRECTED, _CHILD_VULNERABLE, _ESCALATING_AGGRESSION, _PANIC_SELF_INJURY, _REPETITIVE, _SEVERE_FEAR, _SEPARATION_SEVERE, _NOISE_PANIC, _REHOME_EUTHANASIA, _LEGACY_SIGNAL, _BEHAVIOR_FLOOR | G03, G02, G04b, G05, G06, G08, G09, G10, G11, G12, G13, L1, G19/G21 floors |
| SAFE_ONLY_SERIOUS_INJURY | G01 |
| SAFE_CLEARED_WITH_CONSTRAINTS | §6.6 (medical clearance with `low_impact_only`) |
| SAFE_WORSENING_NONCLINICAL | G22 |
| STAGE_SOCIAL_WINDOW, _VAX_GATE_PENDING, _VAX_GATE_MET, _FEAR_PAUSE | §7.5 |
| STAGE_ADOLESCENT_TOLERANCE | §7.3 |
| STAGE_SETTLING | §7.2 |
| STAGE_SENIOR_SUPPORT | §7.4 |
| HEAT_CAUTION, HEAT_NO_EXERTION, BRACHY_HARNESS | §8 |
| HEALTH_LOW_IMPACT | §8 |
| HH_CHILD_CONTENT | §6.3c |
| PRIO_MANAGEMENT_FIRST, _PROBLEM_PROTOCOL, _OWNER_GOAL, _PREREQ_FOR_GOAL, _LIFE_STAGE | §10.4 |
| MAINT_ROTATION, ENR_FLOOR | §10.9 |
| DOSE_LOW_BUDGET | §10.6 |
| ADAPT_ADVANCE_PROPOSED, _HOLD, _STEP_BACK | §11.2 |
| ADAPT_DSCC_RETREAT | §11.3 |
| ADAPT_SHRINK_LOW_COMPLETION | §11.4 |
| ADAPT_DISTRESS_EASE, _PAUSE | §11.6 |
| NOTICE_ASK_DOB, _UNDER_7_WEEKS, _ADOLESCENT_DIP, _PROFILE_DATES | §7.1, §7.3, §4.1 |
| REFER_GENERIC_BEHAVIOR, REFER_GENERIC_VET, CAUTION_GENERIC | §12.4 (share links only) |

### 15.3 Corrections and design changes vs README.md (and the D05 graph)

| # | Before | This spec | Source |
|---|---|---|---|
| 1 | Force-free as consensus | Product policy; CCPDT permits P+/R− in documented safety cases | D01 Corr. 2; D02b 2.1#20 |
| 2 | Aversive evidence "convergent" | Correlational; one small RCT (second-hand) favoured an e-collar for chasing | D01 Corr. 3, 24; D02a Corr. 3, 31 |
| 3 | Owner reports a Dunbar level | Append-only fact reports; engine tiers | D02a Corr. 32 |
| 4 | CAUTION "L1–L2" vs REFER "skin contact" | T2 on a person → REFER; T1 → warning path | D02b 2.1#19 |
| 5 | Children "under 12" | ≤14; contested "highest risk"; vulnerable adults; no decay | D02a Corr. 26; D02b 2.1#4 |
| 6 | Muzzle only after professional input | Offered to dogs without bite/handling history | D02a Corr. 20 |
| 7 | REFER_VET at ≥7 y as evidence | Convention; onset band asked per problem | D02b 2.1#5; D04 N19 |
| 8 | No progress after 4–6 wk | Convention | D02a Corr. 25 |
| 9 | Worsening → trainer | By domain | D02b 2.4 |
| 10 | Pain signal expires | No expiry; medical clearance | D02a G-01 |
| 11 | Adolescence 15/18/24/24 | 6–18 (24 large), conv | D03 C5 |
| 12 | Senior ages by size | Last 25% of lifespan; screen ≥7 | D03 C4 |
| 13 | CCDR/CADES missing | CCDR 50; CADES 8/24/45 | D03 C2 |
| 14 | 8-mo dip and relinquishment peak | Carer-specific dip; no 8-mo figure | D03 C7, C9 |
| 15 | Breed weight 0.25/0.75 | Priors dropped from v1 | D04 N1 |
| 16 | Group deltas | Deferred research note | D04 N9–N12 |
| 17 | Small-dog excitability | Dropped | D04 N13 |
| 18 | Brachy "~20 °C" | Owner tap + static advice | D04 N3 |
| 19 | Sessions 1–3/2–4/3–5 (≤10) | 1/2/3 defaults, conv | D06 C2 |
| 20 | ≤5 instructions/week | ≤5 steps per view | D06 C1 |
| 21 | 0.6 × budget (med) | conv, low | D06 C28 |
| 22 | 5–6 days/week | Dropped | D01 Corr. 19 |
| 23 | 3 vs 2 sessions/skill/day | 3 spaced, never one anchor | D06 C27 |
| 24 | No new skill within 1 h; rest/sleep/play | Only unrelated new learning blocked | D01 Corr. 7; D06 C5 |
| 25 | 80% / back 2; DS/CC 3×2 days, back 2 | Back 1; DS/CC 2-up / back to last success | D01 R19; D02a Corr. 22 |
| 26 | Absence ladder 5,10,20,30,60 | Feuerbacher ladder | D02a Corr. 22 |
| 27 | Reward tiers by distraction | Dropped | D01 Corr. 13 |
| 28 | Chews preferred | Optional | D06 C23 |
| 29 | Sleep "puppies and seniors higher" | 8–14 h; puppies ≥9 h overnight (low) | D06 C22 |
| 30 | 3-3-3 | Not shown (a timeline; no source) | D03 C40 |
| 31 | Rehoming → REFER as evidence | Euthanasia ACVB; rehoming conv | D02a Corr. 27 |
| 32 | Mild separation DIY at any age | Four-row sub-gate | D02a G-11 |
| 33 | Medication "adjunct only" | Neutral, never named | D02a Corr. 30 |
| 34 | Weeks-to-fluency | Removed | D05 Corr. 25 |
| 35 | Head halter for reactivity | Not recommended | D02b 2.1#3 |
| 36 | Criteria "from STAR/CGC/KC" | Only where published | D05 Corr. 1–5, 37 |
| 37 | Recall dose | Not a dosing study | D06 C9 |
| 38 | Habit 66 days | No number | D06 C17 |
| 39 | D05 stay.* nodes | `stay` S1–S5 | D05 §3 |
| 40 | D05 recall.puppy/recall.10 | `recall` stages | D05 §3 |
| 41 | D05 lead.loose L1/L3/L4 | `lead.loose` stages | D05 §3 |
| 42 | D05 soc.checklist, muzzle.train, coop.touch_ladder, house | `protocol.socialization` (logged), `protocol.muzzle`, `protocol.handling` (per area), `protocol.house_training` | D05 §3 |
| 43 | D05 mgmt.*, resp.owner, pattern 1-2-3/turn | Removed as nodes | D05 §3 |
| 44 | D05 46 rows | 49 rows (53 ids: 47 teaching rows with 48 ids, plus the `enr.*` and `task.*` rows) | — |
| 45 | Stepita 279 (high) | Unresolved; low | D03 C3 |
| 46 | House-training "≥4 accidents" flag; crate ">4 h" notice | Dropped from v1 (no input) | Dale 2024 exploratory |
| 47 | Worsening as a stored state | G22 and G21's VET part read-time; only the aggression/guarding/fear floor is stored | review rounds 3–4 |
| 48 | Stranger-watch notice | Dropped (no input) | review round 3 |
| 49 | 90-day expiry of legacy injury signals (code) | Removed: legacy injury signals stay until a medical clearance | review round 5 |
| 51 | CCDR/CADES scoring (B8) | Deferred to v2 | review round 5 |
| 50 | Regress proposals, level reconstruction from milestones, protocol replay, 4-week no-progress branch | Removed (§14.3) | review round 4 |
| 52 | DIGEST-a G-08 CAUTION = management + trade/avoid only | CAUTION keeps teaching, but G07/G04a/G30 remove all exposure-flag items (handling, socialisation, noise, absence, LAT) | review round 8; ★ advisor |
| 53 | Worsening with null/"other" domain → trainer (today) | G21 VET part (clinical by default); trainer route only for jumping, mouthing, pulling, barking, chasing | review round 8 |
