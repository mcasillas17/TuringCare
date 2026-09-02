# TuringCare Public Beta Roadmap Design

> **Historical strategy record.** Current status and delivery order are maintained in
> [`docs/ROADMAP.md`](../../ROADMAP.md).

## Goal

Prepare TuringCare for a public beta with an initial cohort of 10–20 dog owners,
learn what drives weekly return, and use observed behavior to choose the next
major retention investment.

The primary success behaviors are:

- owners return weekly to log behavior and practice training;
- owners generate or share a Behavior Brief;
- trainer/course outbound engagement is a secondary signal.

## Strategy

Use an **instrumented public beta** rather than adding more speculative features
before recruitment. First make the existing platform reliable, observable, and
easy to give feedback on. Then add one focused owner-return loop: a Guided Today
experience that recommends the most useful next action for each dog.

Do not prioritize monetization, broader marketplace supply, dog photos, 2FA, or
an LLM-generated Brief until owner retention evidence supports them.

## Phase 1: Beta Readiness

Target: one to two weeks.

### Browser-level confidence

Add Playwright coverage for the production-critical owner path:

1. register and verify email;
2. sign in;
3. add a dog;
4. log a moment;
5. create or apply a training goal;
6. log practice;
7. generate, finalize, and share a Brief.

Run the path at desktop and phone viewport sizes. Add a lightweight deployed
smoke check for the public landing page, API health endpoint, authentication,
and one authenticated owner flow.

### In-app feedback

Add a feedback entry available throughout authenticated routes. Use a small
sheet with:

- category: bug, confusing, idea, or other;
- free-text message;
- optional contact permission.

Store the route, app version, authenticated user ID, and timestamp
server-side. Do not automatically capture journal content, Brief content, dog
notes, or other sensitive owner data. Provide an admin feedback inbox with
status and internal notes.

### Pilot measurement

Extend the existing first-party telemetry and admin dashboard with cohort and
retention views:

- signup cohort;
- dog-created and first-log activation;
- active owner in week 1, 2, and 4;
- weekly journal and practice activity;
- Brief generated, finalized, shared, or emailed;
- trainer and course outbound clicks.

Document event definitions and ensure the dashboard distinguishes unique users
from event counts.

### Operational readiness

- Add application error monitoring and production alerts without sending
  sensitive journal or Brief content.
- Verify database backup and restore procedures.
- Complete real-device phone, accessibility, and reduced-motion QA.
- Enforce email ownership before open beta. The verification sender and banner
  already exist; turn verification into a complete, migration-safe account
  flow.
- Update `README.md` and `docs/SECURITY-BACKLOG.md` to match shipped behavior.
- Resolve or close obsolete PR #23 before reconsidering any LLM narrative layer.
- Remove ambiguity between local and remote `main`; planning-only commits must
  not remain as unpushed product state.

## Phase 2: Guided Today

Target: weeks two through six, beginning after beta-readiness foundations.

### Experience

Change `/my` from a dashboard into **Today with [dog]**. For the selected dog,
show one recommended next action, why it is recommended, and one direct CTA.
Quick capture remains available as secondary actions but the page must not
become a multi-card command center.

Owners can switch dogs and defer the recommendation for the current day.

### Recommendation rules

Compute recommendations using deterministic, explainable rules rather than an
LLM. Candidate actions, in priority order, include:

1. add the first dog;
2. log the first or next behavior moment;
3. choose a weekly focus;
4. practice an active focus skill;
5. complete a daily check-in;
6. generate a Brief once enough current evidence exists;
7. finalize or share a useful draft Brief.

The exact thresholds belong in the feature specification. Recommendation output
must include a stable action type, dog ID when applicable, localized rationale,
CTA destination, and a reason code suitable for telemetry.

### Weekly context

Show a compact current-week strip with:

- active days;
- practice sessions;
- moments and daily check-ins;
- focused skills practiced.

This is context for the recommendation, not a second analytics dashboard.

### Return communication

Do not launch reminders before validating the in-app recommendation. If Guided
Today improves repeat use, add an optional weekly email summary with explicit
preferences and unsubscribe controls.

## Subsequent Feature Order

Choose among these using beta evidence:

1. **Progress over time** — skill milestone history, journal/check-in trends,
   and weekly comparisons.
2. **Better Brief intelligence** — structured, evidence-linked sections before
   any LLM narrative layer.
3. **Trainer handoff** — share a Brief from a matched trainer profile and track
   outreach status.
4. **Dog photos** — identity and polish after the retention loop.
5. **PWA/offline capture** — real-world resilience after core return behavior
   is proven.

## Phase 3: Four-Week Beta Loop

Recruit 10–20 owners into the public beta and segment them by signup week.

Initial targets:

- at least 60% create a dog and make a first log;
- at least 40% return during week 2;
- at least 25% remain active during week 4;
- at least 25% finalize or share a Brief.

Treat trainer/course outbound clicks as secondary evidence.

Prompt for contextual feedback after the first journal save, first completed
week, and first Brief share, but never interrupt capture. Review cohort metrics
and feedback weekly. Ship small usability fixes weekly and select at most one
larger retention feature after week 2 evidence.

Interview five owners across activated, retained, and churned groups. At week 4,
decide whether to deepen Guided Today/progress, improve the Brief/trainer
handoff, or change the target user. Do not begin monetization work until a
repeat-use loop is visible.

## Delivery Order

1. Beta-readiness foundations.
2. Guided Today.
3. Recruit the public-beta cohort.
4. Weekly evidence-driven usability fixes.
5. Select progress, Brief, or trainer-handoff work from observed gaps.
