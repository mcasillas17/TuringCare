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

An outcome with no context dimensions remains valid anchored practice history
but cannot answer where the skill is reliable. Contextual status requires at
least one recorded context dimension.

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
difficulty rather than suggest progression. If the reviewed easier context is
already Reliable, the API emits no support-oriented next action: the original
failed context may still show its accurate support note, but a known-successful
context is never relabeled as Developing.

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

When the server-owned active safety decision blocks exercises, the summary
preserves its strongest evidence but returns no practice action and includes
the existing safety/referral decision for accessible guidance. This is distinct
from a genuine sparse response with no safety decision. Action-derived synthetic
`not_observed` rows are removed under suppression, while observed Reliable and
Developing evidence remains available for guidance.

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

1. If the latest relevant result is `too_hard`, an unobserved reviewed adjacent
   context may reduce exactly one difficulty dimension. If that adjacent target
   is already non-Reliable or contains any recent `too_hard`, do not recommend
   it. Instead, repeat only another recorded Developing context proven no
   harder than the original failed context on every controlled dimension,
   excluding both the original failed key and the rejected adjacent key. It may
   be equal or easier across multiple dimensions, but a changed null/unknown
   value or an unreviewed or ambiguous distance direction is not proven safe.
   If no such Developing context exists, return no action. An already Reliable
   adjacent target also returns no action rather than being recast with
   support-oriented copy.
2. Otherwise, if a Reliable context has a reviewed adjacent harder context,
   recommend that single-step progression only when the exact harder target is
   not already observed as non-Reliable or with a `too_hard` result. A failed
   harder target is excluded from fallback repeats.
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
- the existing `SuggestionSafety`/referral contract for server-owned exercise
  suppression;
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
  safety: SuggestionSafety | null;
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
missing resources. Validate both route parameters with the repository UUID
schema before either ownership query; malformed IDs use the same
`{ error: "not_found" }` `404` response and must not reach Drizzle. The route
uses `evaluateSafetyWithLock` to derive the safety decision and full contextual
evidence/action through the lock-held transaction executor, so a safety write
cannot commit between the decision and the returned action or synthetic row.
That helper samples one authoritative `lockedNow` immediately after acquiring
the dog safety lock, passes it to both `loadSafetyInputs` and the callback, and
the contextual loader uses that same instance for its evidence bounds. Callers
must not capture a pre-lock clock.

Expose `POST /api/dogs/:id/contextual-progress/events` beneath the same owned
dog route. Its UUID guard runs before JSON validation, the ownership query, and
telemetry recording, so a malformed dog ID plus an invalid body still returns
the same privacy-safe `{ error: "not_found" }` `404` and records no event.
`training.context_next_action_used` re-evaluates safety under the dog safety
lock; when exercises are suppressed, it returns the normal `202 { ok: true }`
acknowledgment without a telemetry record. `training.context_insight_viewed`
remains recordable while safety is active.

The existing focus response adds one compact `contextualProgressSummary` per
returned focus skill. The loader derives all returned summaries from one
bounded evidence query rather than issuing one query per skill. Focus evaluates
the dog's active safety decision once per request under the dog safety lock and
passes the same post-lock `lockedNow` plus transaction executor to the one
batched evidence read, sharing the result across all returned summaries. A
contextual evidence-read failure
returns the explicit `unavailable` summary state; failures acquiring,
evaluating, or committing the safety transaction propagate instead of yielding
an unsafe ready result. The expanded skill card fetches the full skill-scoped
route only when opened.

## Web Architecture

Add TanStack Query hooks and stable keys for:

- dog/focus contextual summaries;
- skill contextual detail.

Safety-derived training caches use one shared web invalidation boundary:
`invalidateTrainingSafetyData(queryClient, dogId)` invalidates the dog-scoped
prefixes `["suggestion", dogId]`, `["focus", dogId]`, and
`["contextual-progress", dogId]`. The helper is independent of the query hooks
that consume those keys, and every mutation callback returns or awaits its
promise so `mutateAsync` cannot resolve before invalidation scheduling and
active refetches complete.

Apply that boundary after every web mutation that can add, change, or remove
an active safety input:

- practice session creation, evidence updates, and session deletion;
- behavior-concern add/remove;
- journal entry add/update/delete;
- guided setup behavior and progress actions;
- dog deletion, which removes the dog and its safety inputs.

The profile update hook is not included because the current
`evaluateSafety` policy reads persisted safety signals and bounded journal
fields, not dog profile fields. Practice-derived invalidation reuses the
focused helper and adds progress and overview caches without creating an
import cycle.

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
- An initial weekly-focus failure is a distinct retry/edit state and must not
  render the genuine empty-focus state. Cached focus data remains usable during
  a background error. An unavailable per-skill contextual summary exposes an
  inline retry without disabling the week grid.
- Weekly recommendation suppression is fail-closed for a relevant focus query
  error or a current-week suggestion query error, including when cached data is
  still present. Cached evidence, the week grid, and practice logging remain
  usable; Retry remains available, but suggestion/context action CTAs and
  telemetry stay suppressed until a successful response settles. A cold focus
  load shows loading only, not the pick-focus empty state. Action suppression
  and insight telemetry readiness remain separate: query uncertainty defers a
  weekly view event, while settled safety records one view with
  `hasNextAction: false`.
- Active safety suppression removes `nextPracticeAction` and action-derived
  synthetic `not_observed` rows, preserves observed evidence/status rows,
  renders the existing localized safety/referral guidance, and records no
  next-action-use telemetry. It does not suppress
  `training.context_insight_viewed`: after focus and suggestion state settle,
  each mounted weekly summary records its strongest status once with
  `hasNextAction: false`. Server action-use ingestion independently repeats
  this safety check under the dog lock and returns its unchanged acknowledgment
  without recording when suppressed.
- `DogWeek` derives one `activeSafety` from the current-week suggestion or any
  ready contextual summary. It renders exactly one page-level referral notice,
  hides stale exercise suggestions, and passes page-owned notice/action
  ownership to each summary card.
- During background revalidation, `isFetching` on either suggestion or focus
  query conservatively suppresses cached suggestion exercise/action controls
  and all contextual next-action CTAs and telemetry. A cached weekly
  suggestion retains a busy, neutral card shell while fetching, but never
  exposes stale primary/fallback exercise text or interactive controls. A
  cached error instead uses neutral retry copy without `aria-busy`; the
  page-level safety notice owns safety rendering and stale suggestion controls
  disappear. The week grid and practice logging controls remain available.
  Skill detail receives its own `isFetching` state: cached evidence and session
  controls remain visible while its next-practice CTA and action telemetry are
  suppressed, then restore after a settled safe result. A detail query error
  with cached data preserves that evidence and Retry but fails closed on actions
  until a successful retry.
- After weekly session creation awaits, `DogWeek` reads authoritative
  QueryClient snapshots through `suggestionKey(id, weekKey)` and
  `focusKey(id, weekKey)`, rather than using render-written recommendation
  refs. Both query states must be `status: "success"`, `fetchStatus: "idle"`,
  and error-free; their current cached data must still describe the current
  dog, week, skill, non-dismissed exercise, suggestion ID, and active-safety
  calculation. Otherwise the capture is manual with `suggestionId: null` and
  `usesAuditedSuggestion: false`, allowing explicit current-level
  confirmation and never submitting `practicedTarget`. Once an audited capture
  is open, a transient `fetchStatus: "fetching"` state is pending rather than
  permanently invalid: a same-safe settled response preserves its
  primary/fallback anchor. A settled safety decision, query error, dismissal or
  changed suggestion, wrong scope, or any other failed eligibility check
  permanently downgrades it to manual. Evidence save repeats the same scoped
  cache-authority check before attaching `practicedTarget`, so saving while a
  query remains unsettled or invalid still fails closed to manual capture.
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
small enum payload. Action-use telemetry is persisted only after a lock-held
safety re-evaluation confirms exercises remain available; suppressed requests
receive the same successful acknowledgment without revealing the decision.
View telemetry remains recordable while safety is active. The weekly summary
records at most one view event per mounted card after insight state settles,
independently of action suppression. Fetching or error state records no view;
settled safety records the strongest status with `hasNextAction: false`, and a
settled safe result records action availability accurately. Skill detail records
each distinct settled result once per mount, keyed by policy version, curriculum
level, strongest context and status, and action availability. Existing route
telemetry tests are updated for the changed `training.practice_logged`
properties.

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
- latest-`too_hard` selection reducing one difficulty dimension only to an
  unobserved target, rejecting a failed adjacent target in favor of a proven
  safe Developing fallback, returning null when none exists, and omitting a
  support action for an already Reliable adjacent target;
- Reliable progression increasing only one reviewed dimension;
- an observed non-Reliable or `too_hard` harder target never being recommended,
  with safe Developing fallback selection;
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
- injury, aggression/bite, severe-fear, severe-concern, and sustained-worsening
  safety suppression on detail and batched focus responses, including removal
  of synthetic `not_observed` rows, preservation of observed evidence, and no
  action telemetry; deterministic advisory-lock interleavings prove a response
  completing after a safety write cannot expose an action or synthetic row;
- practice save succeeding independently from later insight loading;
- server-side telemetry identity and scalar properties.

### Web

Cover:

- decision-first summary with Reliable evidence;
- Developing-only and sparse-evidence states;
- `too_hard` support-oriented copy;
- safety/referral guidance with no practice CTA for every exercise-suppressing
  safety class;
- full exact-context rows in skill detail;
- Reliable rows label `lastSuccessfulAt` as the supporting practice date,
  while Developing rows use `lastObservedAt`;
- compact weekly labels omit null context values, while full detail retains all
  five labels; hash expansion scrolls without moving focus or adding a tab stop;
- Not observed never presented as failure;
- inline insight errors preserving practice controls;
- weekly cold-error Retry/Edit focus state and per-skill unavailable Retry;
- cached skill-detail evidence with `isFetching` or an error suppressing its
  next-practice CTA and action telemetry, then restoring the CTA after a safe
  retry;
- session form structured-field submission and optional omission;
- current-level confirmation copy, submission, and conflict handling;
- all safety-producing mutation families invalidate the three dog-scoped
  suggestion/focus/contextual-progress prefixes and await completion;
- stale exercise suggestion plus contextual safety renders one alert, no
  exercise/CTA, no next-action telemetry, and one accurate settled view event;
- either recommendation query's `isFetching` suppresses cached CTAs and view
  telemetry, while settled safe data restores them and records one view;
- suggestion/focus errors suppress cached CTAs and view/action telemetry while
  preserving cached evidence, Retry, and practice logging; settled retry
  restores one view with the correct `hasNextAction` value;
- an open audited capture survives transient revalidation, preserves its
  primary/fallback target after a same-safe settled response, and still fails
  closed when evidence is saved before settlement;
- a settled safety decision, error, dismissal, changed suggestion, or scope
  mismatch downgrades that audited capture to manual evidence without
  `practicedTarget`;
- malformed dog/skill UUIDs on the two contextual routes return privacy-safe
  `404` responses before database access and record no telemetry; the event
  route returns that `404` before JSON-body validation;
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
