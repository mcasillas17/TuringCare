# Contextual Progress Insights Design

## Goal

Make recent skill evidence understandable and actionable without implying that a
dog has universally mastered a behavior.

This first Personalized Training Gate 2 slice answers two questions:

1. In which exact recent context is this skill currently reliable?
2. What is the safest useful context to practice next?

The skill detail view is the source of truth. This Week shows a compact summary
derived from the same evidence and policy.

## Scope

This slice includes:

- a rolling 21-day evidence window;
- deterministic `reliable`, `developing`, and `not_observed` statuses;
- a decision-first summary on This Week;
- a full exact-context evidence view on skill detail;
- a conservative evidence-backed next-practice recommendation;
- reuse of Gate 1's optional structured practice capture;
- explicit owner confirmation when manual practice was performed at the
  current level;
- bilingual owner-facing copy;
- server-side derivation, owner isolation, telemetry, and focused tests.

This slice does not include:

- a universal completion percentage;
- automatic skill-level changes;
- AI-generated exercises or interpretations;
- custom-skill exercise generation;
- historical trend charts;
- trainer collaboration;
- Behavior Brief integration;
- changes to the existing five-level owner-confirmed skill model.

## Product Semantics

### Exact Context

A context is the complete combination recorded for one practice attempt:

- environment;
- distraction;
- cue support;
- distance;
- duration band.

Progress is derived for the exact combination rather than independently
claiming reliability for each dimension. For example, evidence for a quiet home
with no distractions must not imply reliability outdoors merely because both
attempts used the same cue support.

Only dimensions relevant to the practiced skill need to be recorded. Missing
optional dimensions remain absent in the context identity; they are not
silently converted into a lowest-difficulty value.

### Evidence Window

Only practice sessions whose `occurredAt` timestamp falls in the inclusive
interval from `now - 21 * 24 hours` through `now` affect current contextual
status. Evidence must also match the skill's current owner-confirmed curriculum
level and current curriculum version. Earlier levels and obsolete curriculum
versions remain history but cannot support a current reliability claim.

Older sessions remain visible as history through existing progress surfaces but
do not support a current reliability claim or next-practice decision.

Distinct-day calculations use Gate 1's persisted `practiceDay`, which is derived
once from the attempt's timestamp and submitted timezone offset. This preserves
the owner's local calendar day across later daylight-saving or timezone
changes.

### Status Rules

For each exact context:

- **Reliable:** at least two successful `went_well` attempts on two distinct
  days during the evidence window and no `too_hard` attempt in that context
  during the same window.
- **Developing:** the context has at least one recent structured outcome but
  does not meet Reliable.
- **Not observed:** there is no structured outcome for that exact context in
  the evidence window.

An attempt without an outcome may still be saved and shown in practice history,
but it does not change contextual status.

`Not observed` is neutral missing evidence, never failure. It appears in the
full skill-detail view only for at most one adjacent context derived from real
current-level evidence. The policy changes one dimension using the catalog
skill's reviewed easing or level-step strategy and an explicit controlled-value
order. If there is no observed context or no unambiguous adjacent value, no Not
observed row is shown. Custom skills without reviewed dimension metadata do not
synthesize Not observed rows. The interface does not generate an unbounded
list of every possible context combination.

If the latest attempt in a Developing context is `too_hard`, owner-facing copy
says the context needs more support. The next-practice action must reduce
difficulty rather than suggest progression.

## Owner Experience

### This Week

Each focused skill may show a compact decision-first insight beneath its
existing weekly practice controls:

- **Strongest recent context:** the best currently Reliable exact context;
- **Practice next:** one conservative, evidence-backed next action;
- a link to view all context evidence in skill detail.

The weekly summary does not list Not observed contexts and does not replace the
existing week grid. It helps the owner decide how to practice the selected
skill.

If no structured evidence exists, the summary uses neutral copy such as:

> Add an outcome and context after practice to see where this skill is becoming
> reliable.

If evidence exists but no context is Reliable, the strongest recent context is
replaced with a Developing summary. The UI must not manufacture a positive
reliability claim.

Strongest-context ranking is deterministic: Reliable precedes Developing, then
more successful distinct days, then `lastSuccessfulAt` for Reliable or
`lastObservedAt` for Developing, then a stable serialized-context tie-breaker.

Historical weeks continue to show their historically correct focus selection,
but contextual insights always describe the current rolling evidence window.
The UI labels the window explicitly so it cannot be mistaken for a historical
snapshot of that week.

### Skill Detail

Skill detail is the source of truth and contains:

- the owner-confirmed skill level;
- strongest recent context or neutral sparse-evidence state;
- one next-practice action;
- exact-context rows grouped for readability;
- status, supporting distinct-day count, latest outcome, and last supporting
  practice date for each row;
- existing session history and milestones.

The first release may group exact-context rows beneath headings such as
environment for scanning, but the displayed status belongs to the full
combination. The interface must preserve enough labels to make that distinction
clear.

### Existing Practice Capture

Gate 1 already lets the owner optionally record `went_well`, `mixed`, or
`too_hard` plus the skill-relevant cue support, environment, distance, duration
band, and distraction values. This slice reuses those shared controlled
vocabularies and does not add a second capture contract.

Suggestion-linked sessions retain their audited level and curriculum anchors.
For manual structured practice, the session form adds an optional positive
confirmation:

> I practiced this at the current Level {n}.

The request sends `confirmCurrentLevel: true`; it never sends a numeric level or
curriculum version. While holding the existing skill lock, the API stamps the
skill's current owner-confirmed level and server curriculum version. The
session remains without a suggestion ID or primary/fallback practice variant,
so it may support contextual progress but cannot become advancement evidence.

`confirmCurrentLevel` and `practicedTarget` are mutually exclusive. Once a
session has a curriculum anchor, a later evidence edit cannot replace that
anchor with a different manual or suggestion target. An unanchored historical
session may be anchored when evidence is added only after the owner explicitly
confirms the then-current level.

The current quick log remains available without confirmation. Free-text notes
remain supplemental and are never parsed for contextual status. Saving a
session is the primary action; a failure to derive or reload insights must
never discard or block a valid practice-session save.

## Next-Practice Policy

The next-practice action is deterministic and uses reviewed curriculum context
ordering where available.

The API owns explicit adjacency tables for cue support, environment, distance,
duration band, and distraction. Distance direction is never assumed globally:
the catalog's reviewed strategy decides whether easing means increasing trigger
distance or decreasing owner distance. Every proposed context is derived from
an observed exact context by changing one controlled value.

The policy applies these rules in order:

1. If the latest relevant result is `too_hard`, choose the nearest recorded or
   curriculum-supported context that reduces exactly one difficulty dimension.
2. Otherwise, if a Reliable context has a reviewed adjacent harder context,
   recommend that single-step progression.
3. Otherwise, recommend another attempt in the strongest Developing context.
4. If evidence is too sparse, ask the owner to record an outcome and context
   rather than inventing a progression.

The output is a practice-context action, not a new exercise. Existing reviewed
curriculum content remains responsible for exercise instructions.

If no reviewed context ordering exists for a custom skill, the policy may
recommend repeating a recorded context but must not infer a harder context from
the skill name or notes.

## Existing Data Foundation

Gate 1 already persists the required nullable fields on `practice_sessions`:

- `outcome`;
- `cue_support`;
- `environment`;
- `distance`;
- `duration_band`;
- `distraction`;
- `curriculum_level`;
- `curriculum_version`;
- `practice_variant`;
- `practice_day`.

The shared package already defines the controlled values and Zod contract.
`duration_minutes` remains the length of the practice session, while
`duration_band` is the practiced behavior target. Contextual progress must
reuse these honest existing names and types rather than introduce parallel
fields.

The existing `practice_sessions_skill_occurred_idx` supports the bounded recent
evidence read. No migration is required unless implementation evidence shows
the current index cannot support the final query. No derived status is
persisted; status remains a function of source evidence, current level,
curriculum version, the explicit window, and policy version.

## Shared Contract

The shared package exposes:

- the existing practice outcome, context, and practice-session schemas;
- a request-only `confirmCurrentLevel: true` option for session creation and
  evidence updates, mutually exclusive with `practicedTarget`;
- contextual status;
- exact-context evidence;
- contextual summary and next-practice action.

A contextual insight response has this conceptual shape:

```ts
type ContextualProgress = {
  window: {
    startsAt: string;
    endsAt: string;
    days: 21;
  };
  curriculumLevel: number;
  curriculumVersion: string;
  policyVersion: string;
  strongestContext: ExactContextEvidence | null;
  nextPracticeAction: NextPracticeAction | null;
  exactContexts: ExactContextEvidence[];
};

type ExactPracticeContext = {
  environment: string | null;
  distraction: string | null;
  cueSupport: string | null;
  distance: string | null;
  durationBand: string | null;
};

type ExactContextEvidence = {
  context: ExactPracticeContext;
  status: "reliable" | "developing" | "not_observed";
  successfulDistinctDays: number;
  latestOutcome: "went_well" | "mixed" | "too_hard" | null;
  lastObservedAt: string | null;
  lastSuccessfulAt: string | null;
};

type NextPracticeAction = {
  ruleId: string;
  direction: "easier" | "harder" | "repeat";
  context: ExactPracticeContext;
  changedDimension:
    | "cue_support"
    | "environment"
    | "distance"
    | "duration"
    | "distraction"
    | null;
};
```

The final implementation type uses controlled shared values instead of broad
strings.

## Server Architecture

Create a pure contextual-progress policy module with no authentication or HTTP
responsibilities. It accepts:

- a fixed `now`;
- the current owner-confirmed curriculum level and version;
- recent structured practice evidence;
- reviewed context adjacency where available.

It returns the shared contextual-progress contract. A fixed clock makes window
boundaries and distinct-day rules deterministic in tests.

The data-access layer:

- performs a bounded query for the skill's 21-day evidence;
- selects only columns required by the derivation;
- filters to the current owner-confirmed level and current curriculum version;
- requires persisted `practiceDay` for distinct-day claims;
- orders deterministically by occurrence and creation time;
- keeps owner authorization outside the pure policy.

Manual level anchoring reuses the transaction and skill row lock already used
by practice creation and evidence updates. The server supplies both
`curriculumLevel` and `curriculumVersion`; no client-supplied level or version
is trusted. No database migration is required for this anchor.

Expose `GET /api/dogs/:id/skills/:skillId/contextual-progress` beneath the
existing owned dog and skill hierarchy. It returns the full contract and must
call `findOwnedDog` and `findOwnedSkill`, returning `404` for cross-owner or
missing resources.

The existing focus response adds one compact `contextualProgressSummary` per
returned focus skill. The loader derives all returned summaries from one
bounded evidence query rather than issuing one query per skill. The expanded
skill card fetches the full skill-scoped route only when opened.

## Web Architecture

Add TanStack Query hooks and stable keys for:

- dog/focus contextual summaries;
- skill contextual detail.

Logging or deleting a practice session invalidates:

- dog progress;
- skill contextual detail;
- focus/week contextual summaries;
- overview caches affected by existing practice behavior.

UI responsibilities remain separated:

- a compact decision-first summary component for This Week;
- a full contextual evidence component for skill detail;
- the current-level confirmation in manual structured practice forms;
- localized status and empty/error copy.

All user-facing strings are added with matching keys to both typed i18n
catalogs.

## Failure and Empty States

- Practice-session validation errors are explicit and do not save malformed
  controlled values.
- A valid session may omit all structured evidence fields.
- Manual structured evidence without `confirmCurrentLevel` remains valid
  history but cannot support current contextual status.
- Combining `confirmCurrentLevel` with `practicedTarget` fails validation
  without mutating the session. Attempting to replace an existing curriculum
  anchor returns the existing explicit anchor-rejection result and leaves that
  anchor unchanged; other valid evidence fields may still be saved.
- Insight query failures show a retryable, localized inline state while
  existing practice controls remain usable.
- Sparse evidence shows a neutral capture prompt.
- A Developing context whose latest result is `too_hard` shows support-oriented
  language and never a harder next step.
- Missing curriculum adjacency produces a conservative repeat-context action or
  no action, not a fabricated fallback.
- Cross-owner dog, skill, and nested session identifiers return `404`.

## Telemetry

Server-side telemetry records scalar, privacy-safe events:

- the existing `training.practice_logged` event gains booleans indicating which
  structured fields were present and the controlled outcome;
- `training.context_insight_viewed`, with surface (`week` or `skill_detail`),
  strongest status, and whether a next action was available;
- `training.context_next_action_used`, with rule identifier and whether it
  repeated, increased, or reduced one difficulty dimension.

Telemetry never copies notes, context labels derived from free text, dog names,
or client-supplied identity. View and action events are accepted through an
authenticated server route that supplies the user identity and validates the
small enum payload. The web records at most one view event per mounted insight
surface. Existing route telemetry tests are updated for the changed
`training.practice_logged` properties.

## Testing

### Pure Policy

Cover:

- the inclusive/exclusive 21-day boundary;
- two successes on the same day remaining Developing;
- two successes on distinct days becoming Reliable;
- exact-context combinations remaining separate;
- at most one Not observed adjacent context derived from observed evidence;
- no Not observed row when adjacency is missing or ambiguous;
- any recent `too_hard` blocking Reliable in that exact context;
- latest-`too_hard` selection reducing one difficulty dimension;
- Reliable progression increasing only one reviewed dimension;
- sparse evidence producing no fabricated status or action;
- deterministic ordering when timestamps tie;
- custom skills without adjacency using conservative behavior.

### API and Persistence

Cover:

- optional structured session creation;
- rejection of invalid controlled values;
- manual current-level confirmation stamps the locked server level and
  curriculum version but no suggestion or practice variant;
- manual evidence without confirmation remains unanchored;
- manual confirmation and `practicedTarget` cannot be combined;
- existing curriculum anchors cannot be replaced;
- old evidence excluded from current derivation;
- earlier-level and obsolete-curriculum evidence excluded from current status;
- owner isolation for dog, skill, context detail, and nested session IDs;
- bounded query behavior using the existing relevant index;
- batched focus summaries without N+1 queries;
- practice save succeeding independently from later insight loading;
- server-side telemetry identity and scalar properties.

### Web

Cover:

- decision-first summary with Reliable evidence;
- Developing-only and sparse-evidence states;
- `too_hard` support-oriented copy;
- full exact-context rows in skill detail;
- Not observed never presented as failure;
- inline insight errors preserving practice controls;
- session form structured-field submission and optional omission;
- current-level confirmation copy, submission, and conflict handling;
- all affected query-key invalidations;
- English and Spanish catalog parity;
- keyboard, screen-reader, contrast, and mobile layout behavior.

### End-to-End

Add one critical owner journey that:

1. manually logs structured evidence on distinct days and confirms the current
   level;
2. sees the context become Reliable;
3. sees the same decision-first summary on This Week;
4. opens skill detail and verifies the supporting evidence;
5. records `too_hard` in that exact context;
6. sees the status return to Developing and the next action reduce difficulty.

## Acceptance Criteria

This slice is complete when:

- owners can optionally record structured outcome and context without losing
  the current quick-log path;
- manual evidence only supports contextual status after explicit current-level
  confirmation, stamped from server-owned level and curriculum data;
- all current status derives from an explicit rolling 21-day window;
- Reliable requires two successful distinct days in the exact context and no
  recent `too_hard`;
- This Week shows one compact decision-first summary from the shared policy;
- skill detail shows the full supporting exact-context evidence;
- Not observed is neutral and never framed as failure;
- next practice reduces difficulty after `too_hard` and never changes more than
  one reviewed dimension;
- owner isolation and `404` privacy behavior cover every new route;
- practice saves remain usable when insight loading fails;
- all owner-facing copy is localized and accessible;
- focused policy, persistence, API, web, and E2E tests pass.
