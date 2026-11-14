# TuringCare improvement plan (2026-11-08)

Sources:
- [backend-and-engine.md](backend-and-engine.md)
- [frontend-and-flows.md](frontend-and-flows.md)
- research index in [../research/canine-behavior/README.md](../research/canine-behavior/README.md)
- **authoritative engine spec: [../research/canine-behavior/ENGINE-SPEC.md](../research/canine-behavior/ENGINE-SPEC.md)**. Where this plan and the spec differ, the spec wins.

## Where we are

TuringCare is a well-built **tracker with a deterministic next-exercise suggestion**. It has a journal, a weekly focus, practice logging, owner-approved advancement, a safety lock that suppresses exercises and refers out, a Behavior Brief PDF and share link, a trainer directory, and EN/ES. It is **not yet a program generator**:

- **The dog profile is ignored by the engine.** Age, weight, neuter status, vaccine stage, source, adoption date and notes change nothing, and every skill starts at level 1.
- **Intake is thin.** Date of birth, weight and adoption date exist in the schema, but no web form collects them.
- **There is no plan entity.** Nothing records phases, schedule, planned vs. done, or plan versions. `weekly_focus` holds one skill per dog per week.
- **There are two recommenders.** `suggestion.ts` and `contextual-progress.ts` follow different rules.
- **The catalog is small and shallow.** 5 templates and 21 skills, one-sentence level text, no prerequisites, no numeric pass criteria. Handling, socialization, house training, crate and enrichment are missing.
- **Safety is all-or-nothing.** It has no bite-severity tiers, no medical triggers for sudden onset or senior dogs, and worsening cases route to a *trainer* instead of a vet or vet behaviorist (02 NOTES §5).
- **UX buries training.** A dog opens on Journal, and Week is the last tab. Nothing on `/my` leads to training. There is no session timer, rep counter or success rate; outcomes have only 3 states.

## Verified/reported defects (fix first)

| # | Issue | Where | Status |
|---|---|---|---|
| 1 | Renaming a skill sets `catalogSkillKey: null`, which silently stops suggestions | `apps/api/src/routes/dogs.ts:531` | confirmed in code (may be intentional; then the UI must warn) |
| 2 | Create-skill accepts level 1–5 with no milestone rows | `dogs.ts:513-516` | reported by audit |
| 3 | Applying a template twice duplicates goals | template apply route | reported |
| 4 | Non-UUID path ids likely 500 instead of 404 | owned-dog/skill lookups | reported, not run |
| 5 | `GET /suggestion` writes to the DB | `lib/suggestion.ts` | reported |
| 6 | Web tests: 338 failures, mostly `localStorage` undefined on Node 26 (repo pins 22) | `apps/web` test env | run on Node 22 before judging |
| 7 | API tests need Postgres; no DB-free path for pure logic | `apps/api` | add pure-logic test target |
| 8 | Accessibility/mobile: 32px week-grid buttons, popover lacks Escape/focus handling, horizontal scroll, `DogLayout` renders `null` while loading, placeholder-only filter labels | `apps/web` (see frontend audit) | reported |

## Roadmap

### Phase 0: Quick wins (days)
- Fix defects 1–5 and 8 (defect 8, accessibility/mobile, stays here: it needs no schema change). Run the test suites on Node 22 and add a Postgres-free unit target.
- Collect date of birth, weight and adoption date in setup and the dog form (+ `adoptedAt ≥ DOB`).
- Make Week the default dog tab and add a "next action" card on `/my` (reuse `SuggestionCard`).

### Phase 1: Plan engine core (2–4 weeks)
1. **One engine.** Write a pure `buildPlan(input)` (ENGINE-SPEC §3) next to `lib/curriculum.ts`. Fold `suggestion-rules.ts` and the `contextual-progress.ts` action path into it and delete the legacy focus-compat code.
2. **Rules as data.** Put the research thresholds in one constants module; each rule gets `{id, value, sources, confidence, basis}` (ENGINE-SPEC §2). Plans carry rationale codes, not prose.
3. **Tables** (ENGINE-SPEC §4). `dog_intakes` (versioned answers), append-only `dog_aggression_reports`, `plan_checkins`, `dog_safety_clearances`; `practice_sessions` gains trials/successes/stress flags (incl. a pain flag)/protocol stage. No stored plan table in v1: the plan is computed on read.
4. **Safety gate v2.** Modes `CLEAR / CAUTION / VET_CHECK / REFER_BEHAVIOR / SAFETY_ONLY` (ENGINE-SPEC §6) with bite tiers, children and vulnerable adults, sudden-onset and senior triggers, legacy-signal floors, sticky signals, and an owner-attested clearance that can resolve only medical (VET_CHECK) triggers.
5. **Determinism test.** Golden-file suite of synthetic dogs (ENGINE-SPEC §13.2; safety/legacy goldens in Phase 1, graph/protocol goldens in Phase 2) plus property tests.
5b. **Safety routing (moved from Phase 0, ships with the one migration and the clearance route).** Route worsening by `problem_domain` (G21 vet/behaviorist, G22 trainer only for jumping, mouthing, pulling, barking and chasing; `other` and unlabelled moments go to the vet route) and stop injury signals from expiring. The same phase ships the web `problemDomain` picker (quick composer, journal edit) and a minimal "record a vet check" form; the migration is drained pre-deploy (`POSTDEPLOY_MIGRATIONS` stays empty; add its `DEPLOY.md` §6 row and rollout-test entry). Sudden-onset and medical-change answers stay until a vet check is recorded.
6. **Runbook.** Extend `docs/operations/safety-signal-correction.md` to cover aggression reports, transition signals and clearances (ENGINE-SPEC §14.1).
7. **Legacy injury signals.** No 90-day expiry: existing `injury_or_pain` signals stay until a vet check is recorded (ENGINE-SPEC §6.5); the referral screen prompts owners at rollout.

### Phase 2: Content (parallel with Phase 1)
- Expand the catalog toward the skill graph in ENGINE-SPEC §9.1 (derived from research 05 §3; merges recorded in ENGINE-SPEC §15.3), with prerequisites, stages and observable pass criteria.
- Add protocol modules as stage ladders: settling plan, socialization checklist, house training, relaxation, graded absence, noise DS/CC, LAT/engage-disengage, handling/cooperative care, muzzle.
- Each level gets how-to steps, rewards, success criteria and troubleshooting, in EN and ES.
- Have a DACVB/IAABC advisor review safety and DS/CC defaults before launch (the main credibility lever).

### Phase 3: Experience
- **Intake v2.** About 30 questions in short pages (reuse `SetupShell`), with a skip-able "advanced" section.
- **Program overview.** Phases and why each item exists (from the rationale codes). No timelines or typical-weeks ranges (no source; ENGINE-SPEC N5).
- **Guided Today** as home: today's 1–3 micro-sessions with anchors, plus the enrichment floor.
- **Session runner.** Timer, rep counter, success tap and stress-flag chips, finished in under 20 s. Ends with an advance / hold / step-back message.
- **Referral screen.** Management steps plus filtered directory (behavior credentials ranked first) plus a one-tap Brief send to the professional.
- **Check-ins** at days 7/30/90/180 for adoptees, and a weekly re-plan.

### Phase 4: Learn from data
Use anonymized session logs to recalibrate the low-confidence constants (session length, advance thresholds, budget factor) per ENGINE-SPEC §2. Safety constants are only ever tightened from logs. That is the honest way to turn convention into evidence.

## Not recommended
- Using breed as a gate (it explains ~9% of variance).
- Copying C-BARQ/DIAS/LSSS items without permission.
- Any "fear period" calendar or 3-3-3/5-min-per-month rules presented as science.
- Re-adding AI to generate plans. Deterministic rules plus a reviewed content catalog are auditable, testable and safer for a welfare product.
