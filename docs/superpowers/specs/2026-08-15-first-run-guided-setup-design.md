# First-Run Guided Setup Design

## Goal

Help a new owner reach one meaningful outcome within their first ten minutes:

- capture a behavior concern;
- start reward-based skill training; or
- begin a lightweight progress record.

The experience replaces the current checklist-only first run with a short,
resumable setup that creates real product data and hands the owner directly into
the relevant dog workspace.

## Scope

This project delivers:

- a three-step first-dog setup:
  1. dog basics;
  2. owner intent;
  3. one tailored first action;
- resumable server-side onboarding state;
- tailored behavior, training, and progress paths;
- a clear completion handoff into the dog workspace;
- a way to intentionally restart guided setup for another dog;
- localized, accessible, mobile-first UX;
- scalar-only first-run telemetry.

This project does not redesign the complete authenticated navigation, replace
the existing dog workspace, add notifications, introduce an LLM, or build a
general-purpose onboarding engine.

## Experience

### Entry

Registration continues to create an authenticated account. A new account with
no dog enters guided setup instead of landing on a checklist-only dashboard.

Existing owners and owners adding another dog use the normal dog form. They may
choose a separate **Guided setup** action when they want the same assistance for
another dog.

### Step 1: Dog basics

Collect only information that improves the immediate experience:

- name, required;
- breed or mix, optional.
- the existing required profile facts: size, sex, source, and vaccine stage.

Use compact selectors and explain why the required facts matter. Date of birth,
weight, adoption date, sterilization status, and notes remain optional profile
details that can be added later. Saving this step creates the dog and the
account-level onboarding record through the existing dog profile contract.

### Step 2: Owner intent

Ask: **What would help most with {dog}?**

The owner chooses one starting intent:

1. **Understand a behavior** — something happened that the owner wants to
   understand or improve.
2. **Train a skill** — build a useful skill through small, reward-based steps.
3. **Track progress** — keep a simple record of good days, hard days, and
   changes.

Copy must clarify that this choice selects a starting point rather than hiding
other product capabilities.

### Step 3: Tailored first action

Step 3 embeds a real product task. It is not a plan preview or tutorial.

#### Understand a behavior

Open a focused moment capture for the setup dog:

- short description of what happened, required;
- mild, moderate, or severe concern level, required;
- optional structured safety signal;
- explicit confirmation when a safety signal or severe concern is selected.

Saving creates a real behavior concern through the existing domain contract.
Safety behavior remains identical to the established Gate 1 policy: confirmed
structured signals may suppress training suggestions and display professional
referral guidance.

#### Train a skill

Offer a small curated set of starter goals appropriate for first-run use. The
owner selects one goal, and the system:

1. applies the existing catalog template or goal through its normal API;
2. selects the first suitable catalog skill as the current week's focus;
3. loads the existing deterministic weekly suggestion;
4. presents its primary exercise and easier fallback.

No new instructional prose is generated. The path reuses professionally
reviewed curriculum content and existing suggestion safety gates.

#### Track progress

Open a lightweight daily check-in for the setup dog:

- better, same, or harder;
- a short note.

The screen explains that repeated check-ins build a useful record over time.
Saving uses the existing journal daily-check-in contract.

### Skip and completion

The first action may be skipped. Skipping completes guided setup without
creating placeholder journal, concern, goal, focus, or practice rows.

A successful first action or explicit skip records completion and shows a short
handoff:

- confirm what was saved;
- explain one relevant next step;
- link to the dog's canonical workspace.

Hide the persistent onboarding checklist while guided setup is active. After
setup completes, the checklist may remain for broader activation tasks and
derives progress from the real dog, journal, training, and brief records.

## State Model

Add an account-level guided-setup record linked to the selected dog. It contains:

- user ID;
- dog ID;
- current step;
- selected intent, nullable until Step 2;
- started timestamp;
- completed timestamp, nullable;
- completion reason: first action completed, skipped, or abandoned;
- first action type and created domain record ID, nullable.

The record is orchestration state, not permanent dog profile data. Intent does
not constrain later recommendations or navigation.

Only one incomplete guided setup may exist per owner. Starting guided setup for
another dog requires completing or abandoning the current record first.
Enforce this with a database constraint rather than a read-then-write check.
Abandoning setup preserves the already-created dog and creates no other domain
data.

An active setup must retain its dog link, so deleting that dog is blocked until
setup is completed or abandoned. A completed setup remains as account-level
eligibility history if its dog is later deleted; the historical dog link becomes
null rather than cascading away the setup record.

The API is the source of truth. Refreshing, signing out, or switching devices
resumes the latest incomplete setup. Client state may hold unsaved form values
but must not be the only record of the current step.

## Architecture

### Shared contracts

Define typed shared schemas for:

- intent selection;
- setup progress and completion;
- each tailored first-action request;
- the setup status DTO returned to the web application.

Do not create parallel web-only payload interfaces.

### API

Expose owner-scoped guided-setup routes through a Hono sub-app mounted in the
existing application:

- read the current incomplete or latest setup;
- create the first dog and setup atomically;
- save intent and advance to Step 3;
- execute and complete a tailored first action;
- skip the first action;
- abandon an incomplete setup before intentionally starting another.

All dog and setup lookups are scoped by the signed-in user. Cross-owner dog or
setup identifiers return `404`.

Every mutation after setup creation includes the opaque `setupId` returned by the
status/start response. The server scopes that identifier to the signed-in owner before
reading or writing. This binds retries to the original setup, so a delayed request cannot
mutate a newer active setup.

Extract reusable domain services from existing route handlers where needed.
Normal domain routes and guided setup call those same services, so setup does
not duplicate journal, training, focus, suggestion, or safety business rules.

Each tailored first-action endpoint performs the domain write and marks setup
complete in one database transaction. The training action applies the selected
catalog template, selects its first suitable skill as the current owner-local
week's focus, and completes setup atomically. The deterministic suggestion is
loaded after commit through the normal read path.

Submitting a completed setup by its `setupId` returns the already-created result instead of
repeating the domain write. This idempotency is enforced by the setup row's
completion state inside the transaction, not by client timing.

Behavior, training, and progress action creates and replays use typed,
discriminated response contracts:

- available behavior: `{ setup, concern, actionDeleted: false }`;
- deleted behavior: `{ setup, concern: null, actionDeleted: true }`;
- available training: `{ setup, goal, skills, focus: Focus | null, suggestion, actionDeleted: false }`;
- deleted training: `{ setup, goal: null, skills: [], focus: null, suggestion: null, actionDeleted: true }`;
- available progress: `{ setup, entry, actionDeleted: false }`;
- deleted progress: `{ setup, entry: null, actionDeleted: true }`.

If a completed setup still matches the endpoint's completion reason and action
type but its referenced concern, training goal, or journal row is missing, the
endpoint returns the corresponding deleted tombstone with HTTP `200`. For
training, the tombstone is based on the referenced goal row (including a
cascaded dog deletion), not on missing skills or a missing/changed weekly
focus. A live goal returns its current ordered skills, the requested week's
focus or `null`, and a fresh suggestion. The endpoint does not persist a
snapshot, expose deleted prose, recreate the domain row, or emit replay
telemetry. Skipped, abandoned, and different-action replays remain `409`.
Future web hooks and UI must branch on `actionDeleted` before rendering a
concern, goal/skills/focus/suggestion, or journal entry and must show only the
setup completion state for a deleted result.

### Web

Add a dedicated authenticated guided-setup route with a mobile-first step shell:

- progress indicator;
- one primary heading and action per step;
- back navigation where it cannot invalidate saved domain data;
- explicit skip only on Step 3;
- language toggle and existing authenticated identity/session behavior.

Route guards redirect:

- a brand-new owner with no dog to Step 1;
- an owner with an incomplete setup to its saved step;
- a completed setup to the normal authenticated experience;
- an invalid or cross-owner setup to the normal safe destination.

After completion, invalidate onboarding, dogs, overview, journal, progress,
focus, and suggestion queries affected by the selected path.

## Error and Recovery Behavior

- Each step saves independently before navigation advances.
- A failed save retains entered values and shows localized actionable feedback.
- Duplicate submission controls are disabled while mutations are pending.
- Refreshing after a successful save resumes the next step.
- Domain data creation and setup completion commit or roll back together.
- A replay after deletion is a successful `200` tombstone; consumers must not
  display deleted concern or journal prose.
- Training setup never displays an exercise while the suggestion query is
  loading, failed, historical, dismissed, or safety-suppressed.
- Safety referral notices have no dismiss control that restores exercises.
- Skipping Step 3 never creates fake completion data in domain tables.

## Accessibility and Localization

- All owner-facing copy is added to both typed English and Spanish catalogs.
- The step indicator communicates the current and total steps to screen readers.
- Intent cards are a single-select radio group, not clickable visual-only cards.
- Every form has visible labels, keyboard operation, focus management, and an
  error summary or field association.
- Completion messages use a polite live region.
- Reduced motion disables non-essential transition animation.
- Desktop and phone layouts preserve the same content order and action priority.

## Telemetry and Privacy

Record server-trusted events for:

- setup started;
- dog basics completed;
- intent selected;
- first action completed;
- first action skipped;
- setup completed.

Properties are scalar and bounded:

- intent;
- step;
- completion reason;
- duration bucket;
- starter template or action type identifier when applicable.

Never send dog names, breed text, journal notes, concern text, owner input,
request bodies, or safety details as telemetry properties.

Measure:

- setup start-to-completion rate;
- median time to first saved value;
- completion and skip rates by intent;
- seven-day owner return by selected intent;
- first-week journal, practice, and check-in activity.

## Testing

### Shared and API

- contract parsing and enum coverage;
- owner isolation and `404` behavior;
- one incomplete setup per owner;
- atomic first-dog/setup creation;
- resume after each saved step;
- idempotent completion/retry behavior;
- no placeholder domain rows on skip;
- training path reuse of catalog, focus, suggestion, and safety rules;
- telemetry contains only approved scalar fields.

API integration tests use the real Postgres test database and existing
authenticated-user helpers.

### Web

- new owner routing into setup;
- existing owner and additional-dog behavior;
- refresh/resume for every step;
- each intent's first action and completion handoff;
- pending controls and retained form values after failure;
- safety confirmation and suppressed-suggestion rendering;
- Spanish catalog parity;
- keyboard and accessible-name coverage.

### End to end

Extend the critical owner journey with one first-run path on desktop and phone.
Add focused journeys for the other two intents if they cannot be covered
reliably in the same test without making the critical path brittle.

## Rollout

Ship behind an authenticated first-run eligibility rule rather than a permanent
feature flag. Accounts with a dog are not forced through setup. An account with
no dog and no prior guided-setup record enters the flow on its next authenticated
visit, including an older empty account.

Before judging retention impact:

1. complete the remaining production monitoring work;
2. verify the guided-setup telemetry definitions;
3. run phone, Spanish, keyboard, and reduced-motion QA;
4. confirm professionally reviewed training and safety content remains
   unchanged by the orchestration.

The first-run project is successful when more new owners save one meaningful
piece of data in their first session without increasing safety-policy bypasses,
duplicate records, or support confusion.
