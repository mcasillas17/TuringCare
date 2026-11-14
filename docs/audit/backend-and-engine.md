# TuringCare backend and training-engine audit

Scope: `apps/api` (Hono, Drizzle/Postgres, Better Auth) plus `packages/shared` schemas and the
`packages/i18n` catalog content that feeds the engine. Intent sources read: `README.md`,
`docs/ROADMAP.md`, `docs/PROJECT-LOG.md`. Everything below was read in code; items marked
"not executed" were not run because Postgres was unavailable (see section 4.4).

Bottom line: today's "engine" is a **per-skill, evidence-reactive next-exercise picker**. It
is deterministic and well audited, but it has **no per-dog program/plan entity, no use of any
dog attribute, no scheduling, and a 21-skill, one-sentence-per-level catalog**. The distance
to "full personalized program, deterministically" is mostly missing *domain model and content*,
not missing infrastructure: the safety, audit, evidence and advancement plumbing is reusable.

---

## 1. Feature and flow inventory

### 1.1 Route groups (`apps/api/src/app.ts:40-130`, `apps/api/src/routes/*`)

All owner routes sit behind `requireUser` (`middleware/require-user.ts:6-14`): session required
and `emailVerified === true`, else 401/403.

| Mount | File | What it does | Tables touched |
|---|---|---|---|
| `/health`, `/ready` | `app.ts:60-90` | Liveness; readiness probe that selects schema columns added by recent migrations | many (limit 0) |
| `/me` | `app.ts:94` | Session user + resolved admin role | `user` |
| `/api/validate/*` | `app.ts:101-106` | Stateless zod validation for client forms | none |
| `/api/events` | `app.ts:112` | Public bounded telemetry ingest, server-derived identity | `events` |
| `/api/dogs` | `routes/dogs.ts` (1715 lines) | Dog CRUD; concerns; goals + from-template; skills CRUD; skill level; practice sessions (create/evidence patch/delete); weekly focus (new + legacy-compat API); suggestion read + actions; advancement decision; contextual progress; journal CRUD; Brief generate/finalize/share/send/sends; progress; overview | `dogs`, `behavior_concerns`, `training_goals`, `training_skills`, `practice_sessions`, `skill_milestones`, `dog_safety_signals`, `weekly_focus`, `focus_compatibility_weeks`, `legacy_focus_claims`, `training_suggestions`, `training_suggestion_actions`, `advancement_proposals`, `journal_entries`, `briefs`, `brief_sends`, `guided_setups`, `user` |
| `/api/journal` | `routes/journal.ts` | Cross-dog journal list (optional `dogId`) | `journal_entries`, `dogs` |
| `/api/share/brief/:token` | `routes/share.ts` | Public read of a finalized shared Brief (whitelisted fields) | `briefs`, `dogs` |
| `/api/onboarding` | `routes/onboarding.ts` | Activation checklist booleans | `dogs`, `journal_entries`, `training_goals`, `briefs`, `brief_sends` |
| `/api/guided-setup` | `routes/guided-setup.ts` (840 lines) | One-active-per-owner setup wizard: start (creates dog), intent, skip, abandon, three first actions (training template + focus + first suggestion; behavior concern; daily check-in) | `guided_setups`, `dogs`, `behavior_concerns`, `journal_entries`, `training_goals`, `training_skills`, `weekly_focus`, plus suggestion audit tables |
| `/api/overview` | `routes/overview.ts` | Dashboard counts, latest Brief, 5 recent entries | `dogs`, `journal_entries`, `briefs` |
| `/api/training/templates` | `routes/training.ts:8` | Returns the localized enriched catalog | none (static data) |
| `/api/trainers`, `/api/courses` | `routes/trainers.ts`, `courses.ts` | Public directories; trainer email/phone only for verified sessions on detail, never in list | `trainers`, `courses` |
| `/api/admin/*` | `admin.ts`, `admin-trainers.ts`, `admin-courses.ts` | Admin metrics and trainer/course CRUD | `events`, `trainers`, `courses`, `user` |
| `/api/profile` | `routes/profile.ts` | Profile/locale update, deletion-readiness | `user`, `dogs`, `brief_sends` |
| `/api/verification` | `routes/verification.ts` | Email-ownership status/confirm/resend | auth tables |
| `/api/test/emails` | `routes/test-email.ts` | Test-only outbox (disabled in production) | none |
| `/api/auth/*` | `auth/request-handler.ts` | Better Auth handler, DB-backed rate limits | `user`, `session`, `account`, `verification`, `rate_limit` |

### 1.2 Data model summary (`db/schema.ts`)

- **Identity**: `user` (role, locale), `session`, `account`, `verification`, `rate_limit`.
- **Dog** (`schema.ts:122-145`): name, breed (free text), dateOfBirth, size (4 buckets), weightLbs,
  sex, spayedNeutered, source (breeder/rescue/shelter/other), adoptedAt, vaccineStage, notes.
- **Behavior**: `behavior_concerns` (free-text `concern` + severity mild/moderate/severe),
  `journal_entries` (kind `moment` | `daily_checkin`; ABC fields, intensity 1-5, duration,
  recovery, location, people, trend better/same/harder).
- **Training**: `training_goals` (free-text + optional `catalog_goal_key`), `training_skills`
  (`confidence` = the level 1-5, optional `catalog_skill_key`, position), `skill_milestones`
  (earned-date per level), `practice_sessions` (outcome went_well/mixed/too_hard; context
  dimensions cue support, environment, distance, duration band, distraction; anchored
  `curriculum_level`, `curriculum_version`, `practice_variant` primary/fallback, `suggestion_id`,
  `practice_day`).
- **Focus**: `weekly_focus` (unique per dog+week, so exactly one focus skill per week),
  plus two migration-compat tables (`focus_compatibility_weeks`, `legacy_focus_claims`).
- **Suggestions and advancement**: `training_suggestions` (scalar audit rows, dedupe key),
  `training_suggestion_actions` (skipped etc.), `advancement_proposals` (evidence snapshot arrays,
  owner-decided status), `dog_safety_signals` (non-deletable structured safety reports).
- **Brief**: `briefs` (versioned, locale-stamped, share token), `brief_sends` (durable email delivery).
- **Directory**: `trainers`, `courses`. **Guided setup**: `guided_setups` (heavy CHECK constraints).
  **Telemetry**: `events`.

No table models: program, plan, schedule, session plan, lesson, exercise content, reminder,
household/handler, health history, or behavior-assessment result.

---

## 2. Training engine as-is

### 2.1 Content

- `data/training-catalog.ts:24-45`: **5 templates, 21 skills** (basic-manners 5, puppy-fundamentals 5,
  reactivity-work 4, separation-comfort 3, recall-reliability 4). The authored prose lives in
  `packages/i18n/src/en.ts:95+` / `es.ts`. Each skill = name, one-line description, and **five one-sentence level
  descriptions** (e.g. `en.ts:105-109`, "Lures into a sit with food in a quiet room" through
  "Sits on cue across most environments"). There are no step-by-step instructions, reward guidance,
  frequency/duration prescriptions, equipment, prerequisites, or common-mistake text.
- `puppy-fundamentals.sit` duplicates `basic-manners.sit` as a separate key (`training-catalog.ts:27,31`), so the
  same skill has two identities, two metadata rows (`training-curriculum.ts:19`, `:91`) and no shared progress.
- Guided setup only exposes 3 of the 5 templates (`packages/shared/src/guided-setup.ts:19-23`):
  basic-manners, puppy-fundamentals, recall-reliability. `reactivity-work` and `separation-comfort` are only
  reachable by manual `POST /goals/from-template` (`routes/dogs.ts:413`).
- `data/training-curriculum.ts:18-240` adds per-skill progression metadata: which dimensions are asked about,
  which single dimension each level step raises (`levelSteps`), the easing strategy per step, and a base ease for
  level 1. `CURRICULUM_VERSION = "2026-08-11"` (`:10`) stamps sessions and audit rows.
- Metadata fidelity concern: `puppy-fundamentals.bite-inhibition` declares all four level steps as `cue_support`
  (`training-curriculum.ts:102-107`) although its authored levels are about mouth pressure and redirection
  (`en.ts:199-203`); `recall-at-distance` and `stay-alone-duration` are single-dimension ladders. The metadata is
  hand-derived and untested against the prose, so the "ease" fallback text for these skills is generic.
- `lib/curriculum.ts:28-61` `resolveCurriculumTarget`: primary = authored level text; fallback = the same text
  at the same level plus one easing strategy for the step dimension (`:42-48`). It never substitutes lower-level
  prose (documented at `:21-27`).

### 2.2 How a suggestion is produced (`GET /api/dogs/:id/suggestion`, `routes/dogs.ts:1022`)

Trace through `lib/suggestion.ts:244 loadSuggestion`:

1. Route requires `weekKey` equal to the client's current local week (`dogs.ts:1030`, else 409).
2. `claimLegacyFocus` (`suggestion.ts:256`) migrates pre-week focus rows.
3. Load the **single** focus skill for this week (`loadPrimaryFocusSkill`, `:58-75`) and run
   `evaluateSafety` (`:258-261`).
4. **Safety gate** (`lib/safety-policy.ts:33-80`): suppress everything if any of: injury/pain signal in last 90 days;
   aggression/bite-risk, severe fear/panic, or a `severe` behavior concern (these never expire); or
   >=2 journal entries with intensity >=4 AND >=2 "harder" check-ins within 14 days (`:69-78`). Referral target is
   vet, veterinary behaviorist, or credentialed trainer. Inputs are structured only; free text is never inspected.
5. Else load evidence for the skill (`lib/practice-evidence.ts:69-125`): sessions in last 21 days
   (`EVIDENCE_WINDOW_DAYS`, `:14`) at the current or one-lower level, current curriculum version, with practice day
   and variant set. Also the most recent daily check-in within 3 days (`lib/observations.ts:7-33`).
6. **Rule selection** (`lib/suggestion-rules.ts:35-111`), fixed precedence over the last 3 outcomes:
   `needs_focus_skill` -> `custom_skill_unsupported` (no catalog key) -> `cold_start_curriculum_level` (no
   evidence) -> `step_back_after_too_hard` (>=2 too_hard in last 3, level-1) -> `ease_after_harder_checkin`
   (check-in "harder" and no success since, level-1) -> `ease_after_hard_context` (latest mixed in busy outdoor or
   strong distraction, level-1) -> `hold_after_mixed` (>=2 mixed, same level) -> `maintain_current_level`.
7. Resolve target text via `resolveCurriculumTarget` (`suggestion.ts:329-332`). No catalog key -> "unsupported".
8. **Advancement sync** runs inside this GET (`suggestion.ts:359-369`).
9. Persist an audit row with a dedupe key (`:92-103`), emit telemetry after commit.

So the entire "program" a dog sees on a given day is: one skill (the focus), one sentence (level text), one easier
variant, plus a rule id and evidence summary.

### 2.3 Inputs actually used vs collected-and-ignored

Used by the engine:
- Focus skill and its catalog key and current level (`training_skills.confidence`).
- Practice outcomes and two context dimensions (environment busy_outdoor, distraction strong) for the hard-context
  rule (`practice-evidence.ts:118-120`).
- Latest daily check-in trend (`observations.ts`), journal intensity and harder-trend counts (safety).
- Structured safety signals and `severe` concern flags.

**Dog parameters collected but never read by any training logic.** Grep of `apps/api/src` for
`dateOfBirth|weightLbs|breed|spayedNeutered|vaccineStage|adoptedAt|sex|size|source` outside tests and schema shows
only: write paths (`lib/dog-writes.ts:9-15`, `routes/dogs.ts:297-302`) and Brief prose (`lib/brief.ts:83-91`,
`routes/dogs.ts:1329`) using name, breed, size, sex. Therefore **age, life stage, weight, neuter status, vaccine
stage (relevant to socialization and outdoor work), adoption date/source, and notes have zero effect on what is
suggested.** Also ignored by the engine: `behavior_concerns.concern` text and severity below "severe" (only severe
triggers suppression), `training_goals.goal` text, journal ABC fields, location, people present, `durationMinutes`,
and practice `notes`. `contextual-progress` uses all five context dimensions but is a separate path (2.5).

### 2.4 Advancement (`lib/advancement.ts`)

- Eligibility (`:42-65`): rule must be `maintain_current_level`, level < 5, and the **3 newest primary-variant
  sessions at the current level** (current curriculum version, inside 21 days) are all `went_well` on **>= 2
  distinct practice days** (`ADVANCEMENT_MIN_SESSIONS=3`, `ADVANCEMENT_MIN_DAYS=2`, `:18-19`).
- This creates a `proposed` row with an evidence snapshot (`syncAdvancementProposalInTx`, `:112-262`); withdrawn when
  the level changes, evidence is deleted, safety suppresses, or evidence changes. Terminal decisions suppress
  re-proposal until newer evidence exists (`:213-236`).
- The owner decides (`decideAdvancementProposal`, `:273-364`): `confirmed` sets level +1, `regressed` sets level-1,
  `stayed`/`rejected`/`insufficient_evidence` change nothing. Level writes go through `setSkillLevel`
  (`lib/skill-level.ts:12-30`), which also records milestones for levels 2..n.
- Advancement is never automatic, and there is **no automatic regression**: `step_back` rules only change the
  *suggested* level for the session, never the stored skill level. Separately the owner can set any level 1-5 directly
  (`PUT /skills/:id/level`, `dogs.ts:538-553`), bypassing evidence.
- `skill-level.ts`: lowering keeps earned milestone dates.

### 2.5 Contextual progress (`lib/contextual-progress*.ts`, `lib/context-adjacency.ts`)

A second, independent "what should I practise next" computation: groups the last 21 days of level-anchored sessions
by exact 5-dimension context, marks contexts reliable (>=2 successful distinct days and no `too_hard`) or
developing, and derives a `nextPracticeAction` (ease after too_hard, advance a reliable context one reviewed step,
or repeat a developing context) (`contextual-progress.ts:376-455`). `context-adjacency.ts` supplies ordered
scales for cue, environment, duration, distance, distraction and is careful about direction (trigger distance vs owner
distance). It is surfaced in `GET /focus` and `GET /skills/:id/contextual-progress`
(`focus.ts:124-193`, `dogs.ts:442-457`). `suggestion.ts` does not import it, so **two recommenders with different
rules and policy versions (`CONTEXTUAL_PROGRESS_POLICY_VERSION`, `contextual-progress.ts:19`, vs `CURRICULUM_VERSION`)
coexist**. The ROADMAP explicitly lists "another training suggestion engine" as a non-goal (ROADMAP.md T8), which
conflicts with a program generator unless the generator replaces rather than adds.

### 2.6 Is there a per-dog program or plan?

No. The closest constructs:
- `training_goals` + `training_skills`: a bag of skills copied from a template (`lib/training-template-writes.ts:9-35`),
  all at level 1, ordered by `position`, with no sequencing, prerequisites, or target dates.
- `weekly_focus`: one skill per dog per week, chosen manually by the owner (`focus.ts:204-245`, unique
  `(dog_id, week_start)` at `schema.ts` `weekly_focus_dog_week`). Guided setup picks the template's first skill
  (`guided-setup.ts:589-607`).
- Nothing selects *which* template or skill a dog needs, orders skills, schedules sessions, or generates a multi-week
  structure. ROADMAP.md:11 states the north star ("one humane, understandable training plan") but no roadmap item
  implements it; T8 "Guided Today" is a next-action card, not a plan.

### 2.7 Safety lock (`lib/safety-lock.ts`, `safety-policy.ts:131-170`)

Postgres advisory locks: exclusive for writers of safety inputs (journal, concerns, safety signals, advancement
decisions), shared for readers that derive and audit suggestions. Lock order documented: dog safety -> skill ->
rows. It is sound and test-covered but is a large share of the complexity budget; any plan generator must run under
the same shared lock to keep "suppressed means suppressed" linearizable.

---

## 3. Gaps against "full deterministic personalized program per dog"

Intake / data
1. **Dog attributes are not inputs.** Age/life stage (puppy vs adolescent vs adult vs senior) is the most
   important selector and is stored but unused. Also unused: weight/size, neuter status, vaccine stage (gates
   outdoor/social work), source/adoption date (decompression period, "3-3-3" window).
2. **Missing intake** that a plan needs and no table holds: household (children, other pets, apartment/yard),
   owner schedule and time budget per day, owner experience, primary goal priority, trigger inventory
   (structured, not free-text concerns), medical conditions/mobility, reward preferences (food/toy/praise),
   equipment (crate, long line, harness), environment access (quiet places, dog parks), prior training history,
   breed group traits (breed is free text, unnormalized).
3. Behavior concerns are free text; severity below "severe" does nothing. There is no mapping from concern to
   template/skill/protocol.

Domain model
4. **No plan entity** (program, phases/weeks, scheduled sessions, planned vs completed, plan version, regeneration
   history). `weekly_focus` is one skill per week.
5. **No sequencing**: no prerequisite graph between skills (e.g. name-recognition before recall, settle before
   reactivity work), no phase gating, no age-appropriate ordering.
6. **No scheduling**: no cadence, session length, sessions-per-week, reminders, rest days, or plan-to-calendar
   mapping; `practice_sessions.durationMinutes` is recorded but not used.
7. **Single focus skill** at a time; no way to represent parallel tracks (life skill + behavior protocol + enrichment).

Content
8. **Catalog size and depth**: 21 skills, one sentence per level, no how-to, rewards, criteria for "done",
   proofing steps, troubleshooting, or contraindications. A personalized program needs hundreds of authored
   exercise cards or composable parameters. Missing whole domains the research docs cover (see
   `docs/research/canine-behavior/01..06`: socialization, handling/vet care, crate/potty, impulse control,
   leash skills beyond loose-leash, enrichment, fear-period management, adolescent protocols) are not in the catalog.
   Essential puppy content like potty training schedule, crate acclimation, handling/grooming, and socialization
   checklists is absent (only a `potty-signal` skill).
9. Authoring pipeline: content is TypeScript `Messages` keyed by level in `i18n` plus a hand-maintained metadata
   file; no schema validation of level-prose vs dimension metadata, no editorial review state, no content versioning
   beyond a single `CURRICULUM_VERSION` string that invalidates evidence wholesale when bumped
   (`practice-evidence.ts:101`, `contextual-progress-data.ts:51`).

Rules
10. **Rule set is tiny** (8 rule ids, `suggestion-rules.ts`): no age/stage rules, no fear-period rules, no
    time-since-last-practice decay (`lastPracticeAt` computed but no rule uses staleness), no rest/maintenance
    scheduling, no spaced-repetition, no multi-skill balancing, no cap on weekly load.
11. **No automatic regression** of stored level; regression is owner-only (`regressed` decision) or a transient
    suggested step-back. No plateau detection (many `mixed` just holds forever, `hold_after_mixed`).
12. Advancement is purely success-count based; it ignores generalization breadth (contextual-progress has it but
    isn't wired to advancement), and has no maximum-time-at-level handling.
13. Safety policy is binary suppression for *everything*. A program needs graded modification: e.g. injury ->
    vet-clearance then low-intensity only; fear/reactivity -> pause exposure but keep husbandry and settle skills;
    puppy < vaccine completion -> indoor-only plan. Severe concern and bite/fear signals suppress forever with no
    resolution workflow (acknowledged in `schema.ts` comment above `dog_safety_signals`).
14. Evidence quality: outcomes are three-valued, owner-reported, no counts of repetitions/rewards/latency, no
    success rate per session; 21-day window with 3 outcomes is thin for sequencing decisions.

Platform
15. No explanation/rationale surface for a whole plan (rule ids exist per suggestion only), no plan export in the
    Brief, no trainer-edit path (trainer accounts do not exist).
16. Suggestions are computed on read inside a locked transaction with writes (`GET` mutates); a plan generator
    should be a pure function of (dog profile, intake, evidence, catalog version) to be testable and cacheable.

---

## 4. Quality issues (verified by reading code)

### 4.1 Correctness / robustness

1. **Skill rename silently disables suggestions.** `PUT /skills/:skillId` sets `catalogSkillKey: null`
   (`routes/dogs.ts:531`), so editing a template skill's name converts it to a "custom skill" and the engine returns
   `custom_skill_unsupported` forever (`suggestion-rules.ts:44-51`). Also loses localization via the label resolver
   (`training-catalog.ts:101-105`). Likely unintended for a plain rename.
2. **Create-skill bypasses level and milestone rules.** `POST /goals/:goalId/skills` spreads the validated body,
   including `confidence` 1-5, straight into the insert (`routes/dogs.ts:513-516`; schema
   `shared/src/progress.ts:8-11`), so a skill can be created at level 5 with no milestone rows, unlike
   `setSkillLevel`. The comment at `dogs.ts:529-530` says level is owned solely by PUT level; this route contradicts it.
3. **Owner can set any level directly** (`dogs.ts:538-553`), including a jump 1 -> 5, which invalidates the
   "advancement is always owner-decided on evidence" invariant stated in `schema.ts` (`advancementProposals` doc).
   It is an explicit manual override, but it records no audit row and emits only a level number.
4. **Template can be applied repeatedly.** `applyTrainingTemplate` (`lib/training-template-writes.ts:9-35`) always
   inserts a new goal+skills; no unique key on `(dog_id, catalog_goal_key)`. Double-submit or repeat clicks create
   duplicate goals and skills.
5. **Non-UUID path ids likely return 500.** Only suggestion, advancement and contextual-progress routes pre-validate UUIDs
   (`dogs.ts:1022-1034`, `:442-447`; `uuidSchema` used 8 times). `findOwnedDog` (`db/owned-dog.ts:5-10`) is called with the raw
   `:id` on ~40 other routes, as are `trainers/:id` (`routes/trainers.ts:37`), `courses/:id` (`courses.ts:24`), the
   `goalId`/`skillId`/`sessionId` params, and `journal?dogId=` (`journal.ts:10-20`). Postgres rejects a malformed uuid
   (`22P02`), and `grep` finds no handler mapping that to 404 (not executed; needs DB to confirm). Impact: 500 plus a
   monitoring event instead of 404, noisy but not a data leak.
6. **GET has side effects and double transactions.** `GET /suggestion` writes audit rows, may create/withdraw
   advancement proposals, and opens a separate `db.transaction` for advancement (`suggestion.ts:359-369`) before the
   audit transaction; each read can hold two pooled connections serially. Idempotent by dedupe key but cost per page
   view is high (ROADMAP/PROJECT-LOG note pool concerns). Relevant for a plan generator.
7. **Cold start ignores the dog entirely**: every skill starts at level 1 regardless of age or ability
   (`training-template-writes.ts:27`, `suggestion-rules.ts:57-64`), so an adult dog with solid sit still gets
   "lure into a sit" until the owner logs three successes or overrides level.
8. **Duplicate/inconsistent recommenders** (2.5): the suggestion's "ease" rules and contextual `nextPracticeAction`
   can disagree on the same screen.
9. **Safety is evaluated twice per read.** `evaluateSafety` runs unlocked in parallel with the focus load
   (`suggestion.ts:258-261`) and again under the shared lock with a new clock (`safety-policy.ts:135-143`). The
   outcome is conservative (an unlocked "suppressed" is kept via `decision ?? safety` at `suggestion.ts:305`; a
   locked "suppressed" overrides at `:354,:405`), so it is not a correctness bug, only redundant work.

### 4.2 Security

- Owner isolation is consistently enforced via `findOwnedDog`/`findOwnedSkill` joins; no cross-owner path found
  in the routes read. Safety signals are intentionally non-deletable.
- Public endpoints return strict whitelists (`share.ts:10-24`, trainers list nulls contact `trainers.ts:30-31`).
- `routes/trainers.ts:22-35` and `courses.ts` accept raw query strings with no validation or length cap; they are
  parameterized (no injection) but unbounded result sets and no pagination on public, unauthenticated list endpoints.
- `/api/events` is unauthenticated by design (`app.ts:112-122`); bounded by `eventIngestSchema`. No finding beyond
  noting it as a write surface that relies on the global rate limiter.
- `trainers.notesInternal` exists in the table but is excluded from `TRAINER_COLS` (`trainers.ts:6-20`); confirmed not
  exposed in the routes read.
- CORS `origin: env.FRONTEND_URL` with credentials (`app.ts:50-57`) is a single origin, fine.

### 4.3 Dead code / maintenance load

- Legacy focus compatibility: `focus_compatibility_weeks`, `legacy_focus_claims`, `claimLegacyFocus`,
  `rememberLegacyFocusWeek`, `legacyFocusWeekKey`, three union-typed compat schemas and 15-minute expiry
  (`focus.ts:247-316`, `dogs.ts:70-86`, `:923-1020`, `schema.ts`) exist for old browser tabs. Every suggestion read calls
  `claimLegacyFocus` (`suggestion.ts:256`), an extra locked transaction per request. Candidate for removal after a
  rollout window.
- `lib/practice-anchor.ts`, `lib/safety-lock.ts`, and three advisory-lock families add significant surface for a
  single-focus-skill product; a plan model should reuse rather than extend them.
- `routes/dogs.ts` is a 1715-line monolith (ROADMAP T8 itself says not to add more branches to it).
- `trainingCatalog` const (`training-catalog.ts:108`) is only used as a type in `training-curriculum.ts:3,242`; runtime
  value unused (`getTrainingCatalog` is the real API).
- Brief email contains a legacy request decoder for pre-rollout tabs (`briefSendRequestSchema`, `dogs.ts` near line 255) with the same one-off nature.

### 4.4 Tests

Ran `pnpm --filter @turingcare/api test` (vitest). **Result: 47 of 79 files failed; 447 failed, 426 passed, 30
skipped (903 tests)**. Every failure I inspected is `ECONNREFUSED 127.0.0.1:5432 / ::1:5432`: no Postgres was running
(`pg_isready`: no response; the Docker/colima socket was missing), so this is an environment failure, not a verified
product regression. I did not start Postgres. Running only the pure suites
(`suggestion-rules`, `context-adjacency`, `contextual-progress`, `curriculum`, `data/*`, `safety-policy`) gave **99
passed, 1 failed**; the one failure
(`safety-policy.test.ts` "runs the guarded callback with an empty decision and its lock-owned clock") needs the DB.
So the engine's pure logic is green; the route/DB layer is unverified by me.

Coverage observations (from file inventory, not from a coverage run):
- Pure rules, adjacency, contextual progress and advancement evaluation have dedicated tests; routes have large
  integration suites (dogs 2841 lines, guided-setup 2643, focus 1418, contextual 1404).
- No test asserts catalog prose against dimension metadata (4.1 / 2.1 bite-inhibition mismatch).
- No test of non-UUID path ids returning 404 on the ~40 unguarded routes (grep for "uuid" in `dogs.test.ts` finds none
  for that purpose).
- Nothing tests age/stage-based behavior because none exists.
- Tests are DB-bound; there is no in-memory/pg-mem or pglite path, so the suite cannot run in sandboxed CI without
  Postgres (CI uses a service container, per README/DEPLOY).

---

## 5. Prioritized recommendations

Principle: reuse the existing safety, audit, evidence and advancement machinery; add a *plan layer on top*; do not add
a third recommender. Keep the plan generator a **pure function** so it is unit-testable and deterministic.

P0 (unblock the vision, small)
1. **Decide the product contract**: write a short spec of "program" = ordered phases of skills with weekly targets,
   generated from `(dog profile, intake, safety state, evidence, catalog version)`. Reconcile with the ROADMAP non-goal
   ("another suggestion engine") by declaring the plan generator the single source and having suggestions read from it.
2. **Wire existing dog fields into rules now**: compute life stage from `dateOfBirth` (and `adoptedAt`), use
   `vaccineStage` to gate outdoor/social contexts, and use size/weight for exercise intensity. Smallest change:
   extend `RuleInputs` (`suggestion-rules.ts:15-25`) and `loadSuggestion`.
3. **Fix the verified bugs**: do not null `catalogSkillKey` on rename (`dogs.ts:531`); remove `confidence` from
   create-skill or route it through `setSkillLevel` (`dogs.ts:513-516`); add a unique guard for duplicate template
   application; add one shared UUID param guard (middleware) returning 404.

P1 (model + content)
4. **Add intake**: a small structured `dog_intake` (household, schedule/time budget, primary goal, trigger list as
   enums, experience, equipment, health flags) captured in guided setup; keep it enum/boolean-only for the same privacy
   posture as the audit tables.
5. **Add plan tables**: `training_plans` (dog, version, generated-from inputs hash, catalog/curriculum version,
   status) and `training_plan_items` (skill key, phase, target level, week index, session target, rationale code).
   Store rationale codes, not prose, matching `training_suggestions`.
6. **Prerequisite graph and phases** as data (skill key -> prerequisites, min age, contraindicated safety states),
   validated by a unit test that the graph is acyclic and every key has metadata.
7. **Grow and restructure the catalog**: 21 skills -> target 60-100 with per-level steps, rewards, criteria, and
   troubleshooting; consolidate duplicate keys (`sit`); add potty/crate/handling/socialization/impulse-control/enrichment
   domains from `docs/research/canine-behavior`. Add a test that level prose count, dimension metadata length and
   strategy arrays are consistent for every skill.

P2 (behavior of the plan)
8. **Graded safety modes** instead of all-or-nothing suppression (vet-clearance mode, husbandry-only mode), still
   evaluated under the shared safety lock.
9. **Scheduling**: sessions per week and minutes from intake, rest days, maintenance revisits (use
   `lastPracticeAt`, already computed), plus plateau handling (cap on `hold_after_mixed` streak) and automatic
   *proposed* regression (owner-confirmed, like advancement).
10. **Merge recommenders**: feed contextual-progress adjacency (`context-adjacency.ts` is solid) into plan item
    generation and retire the parallel `nextPracticeAction` path.

P3 (hygiene)
11. Remove legacy focus compat tables/routes after rollout window; stop calling `claimLegacyFocus` per read.
12. Split `routes/dogs.ts` into sub-apps (training, journal, brief) as ROADMAP T8 already requires.
13. Make suggestion/plan reads side-effect-free (generate on write events or via explicit "refresh plan"), and add a
    pglite or testcontainer path so the suite can run without a manual Postgres.
14. Paginate and validate public directory queries.
