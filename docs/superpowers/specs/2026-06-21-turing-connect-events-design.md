# Spec: Turing — connect all the events — phase 2c

**Date:** 2026-06-21
**Branch:** `worktree-feat+turing-connect-events` (off `main` @ `8695cbc`)
**Status:** Design — pending user review
**Predecessor:** phase 2b living mascot (PR #50)

## Why

2b shipped the reaction machinery but only wired a handful of events — and the common
ones (journal/training saves) use the subtle **wag**, so day-to-day it reads as "not
reacting." This phase connects Turing to the rest of the meaningful events and reserves
the eye-catching **hop** for genuine milestones, so the celebration is *earned and
proportional*.

## Intensity philosophy

- **wag** (small, ~1.6s): routine logging + setup — frequent, lightweight "I saw that."
- **hop** (big, ~2.6s): achievements/milestones — rarer, unmistakable.

## Full trigger map (after this phase)

| Event | Hook / source | Intensity | Status |
|---|---|---|---|
| Journal entry saved | `useAddEntry` (lib/journal.ts) | wag | ✅ 2b |
| Practice session logged | `useLogSession` (lib/progress.ts) | wag | ✅ 2b |
| Training template applied | `useApplyTemplate` (lib/training-catalog.ts) | wag | ✅ 2b |
| **Add a dog** | `useCreateDog` (lib/dogs.ts:37) | **hop** | NEW |
| **Add a goal** | `useAddGoal` (lib/dogs.ts:105) | **wag** | NEW |
| **Skill confidence raised** | `useUpdateSkillConfidence` (lib/progress.ts:100) | **wag**, or **hop** at max (mastery) | NEW |
| **Weekly focus completed** | derived in routes/dog-week.tsx | **hop** (once per completion) | NEW |
| **Onboarding completed** | derived in components/onboarding/checklist.tsx | **hop** (once) | NEW |
| Brief finalized / shared / sent | `useFinalizeBrief`/`useShareBrief`/`useSendBrief` | hop | ✅ 2b |

Out of scope (low signal / fatigue): adding a concern, profile/settings edits, navigation,
deletes. Also out: a celebratory text bubble on hop (a nice follow-up, but this phase is
purely "connect the events").

## Design

### A. Mutation-based triggers (simple)
Mirror the 2b pattern: `const { celebrate } = useTuring();` at the top of the hook, call it
in the existing `onSuccess` (preserve all invalidates).

- `useCreateDog` → `celebrate(true)`.
- `useAddGoal` → `celebrate(false)`.
- `useUpdateSkillConfidence` → use the mutation **variables** to read the new value:
  `onSuccess: (_data, variables) => celebrate(variables.body.confidence >= CONFIDENCE_MAX)`.
  `CONFIDENCE_MAX` comes from the shared package (value 5 — implementer confirms the import).
  So reaching mastery hops; any other bump wags.

### B. Derived-state triggers (fire once on transition)
These have no mutation — celebrate when a derived boolean flips false→true. Use a **ref to
track the previous value, initialized to `undefined`**, and fire only on a genuine
`prev === false && now === true` transition. Initializing to `undefined` means an
already-complete state on mount does **not** fire (so returning users who finished long ago
don't hop on every load) — only a live completion during the session fires.

- **Onboarding** (`components/onboarding/checklist.tsx`): the component already computes
  `allDone = items.every(i => i.done)` (line 59). Add a `useTuring()` + an effect that fires
  `celebrate(true)` on the `allDone` false→true transition. (Transition-only is sufficient;
  no localStorage needed because the checklist collapses once done and `allDone` won't
  re-transition within a session.)
- **Weekly focus** (`routes/dog-week.tsx`): completion is `doneCount === skills.length &&
  skills.length > 0` (derived ~line 30-31). Add `useTuring()` + an effect firing
  `celebrate(true)` on that condition's false→true transition, **gated to the current week**
  (only when the viewed week is the current one — paging back to an already-complete past
  week must not fire). Reset the tracking ref when the viewed week changes (so each week can
  celebrate its own completion). Implementer: identify the current-week predicate already in
  the component (week offset / "can't page forward" state).

## Test plan (TDD)

- **Mutation triggers** (extend `lib/turing-triggers.test.tsx`, mock `@/lib/api` +
  `useTuring`): `useCreateDog` → `celebrate(true)`; `useAddGoal` → `celebrate(false)`;
  `useUpdateSkillConfidence` with `confidence: 5` → `celebrate(true)`, with `confidence: 3`
  → `celebrate(false)`; error path → no celebrate.
- **Onboarding transition** (component test): render the checklist with `useTuring` mocked
  and the onboarding query returning incomplete → rerender complete → `celebrate(true)`
  called once; mounting already-complete → not called; complete staying complete across a
  rerender → not called again.
- **Weekly-focus transition** (component test or extracted helper): current week going
  incomplete → complete fires once; paging to an already-complete past week does not fire.
  If the effect logic is non-trivial, extract a small pure `justCompleted(prev, now)` helper
  and unit-test it, keeping the component effect thin.
- Regression: existing turing suites + full suite stay green; i18n parity unaffected (no new
  strings this phase).

## Verification

- `pnpm test` green; `tsc` 0; root `pnpm biome check .` clean; build OK; react-doctor no new
  findings on changed files.
- Manual (demo harness or real app): add a dog → hop; bump a skill to 5 → hop; finish the
  onboarding checklist → hop; train the last focus skill of the week → hop; add a goal → wag.
