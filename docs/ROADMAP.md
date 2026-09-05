# TuringCare Roadmap

Last updated: 2026-09-05. T1 implementation is ready for rollout; production cutover
evidence has not yet been recorded.

This is the canonical source for current product priorities, implementation guidance, dependencies,
and delivery gates.

## North star and current boundary

Every dog should have one humane, understandable training plan shared by the owner and a trusted
positive-reinforcement professional.

TuringCare already has a strong owner-side tracking system. Its professional side is currently an
admin-curated trainer and course directory with one-way Brief/email and external-link handoffs. It
is not yet a trainer workspace, shelter platform, or marketplace.

The current cycle validates owner activation and weekly return before expanding the professional
network. The first evidence-gated connection candidate is a tracked, revocable Behavior Brief
handoff to a listed trainer. Trainer accounts, shelter organizations, booking, payments, ratings,
and broad marketplace work stay outside the public-beta critical path.

## Public beta goal

Prepare TuringCare for a public beta with 10-20 dog owners, learn what drives weekly return, and
use observed behavior to choose the next major retention or collaboration investment.

The primary success behaviors are:

- owners return weekly to log behavior and practice training;
- owners generate, finalize, share, or email a Behavior Brief;
- trainer and course outbound engagement provides a secondary signal.

Initial beta targets:

- at least 60% create a dog and make a first log within seven days;
- at least 40% are active during days 7-13 after signup;
- at least 25% are active during days 21-27 after signup;
- at least 25% finalize, share, or email a Brief.

An active owner has at least one journal or practice event in the measured week. Brief success is a
separate outcome and does not substitute for weekly training activity.

## Current status

| Area | Status | What is complete | Remaining gap |
|---|---|---|---|
| Work tracking | Partial - tracking established | T1-T11 have owned issues with dependencies and acceptance criteria. | Keep runtime, repository and production status truthful as each gate is delivered. |
| Critical owner journey | Complete foundation | Desktop and Pixel 7 journeys cover denied access before explicit email confirmation, verified sign-in, guided setup, journaling, training, progress and Brief sharing. | Keep coverage current and complete final post-T8 release-candidate QA. |
| Production smoke | Partial | Scheduled and post-deploy checks cover API health, landing, directories, sign-in, verified-account state, and the authenticated shell. | Add one stable authenticated owner-domain read and keep it running while the remaining gates land. |
| Email ownership | Partial - implementation ready | Verified-only owner/admin gates, passive email landing with explicit confirmation, and en/es no-session/legacy recovery are implemented. | Authorized aggregate inventory, controlled admin/smoke ownership preparation, production cutover and recorded evidence remain blocking. |
| Production monitoring | Ineffective in production - P0 | API request IDs, privacy-safe sanitization, capture adapters, and web configuration parsing are shipped. | The production image runs Node 26 while the API guard enables Sentry only on Node 22, so API capture is disabled. Browser capture, React recovery, hidden source maps, alerts, diagnostics, and rollout evidence are also missing. |
| Backup and restore | Not started | The recovery design and implementation plan are committed. | Add the provider-confirmed runbook and verifier, then complete a measured isolated restore drill. |
| In-app feedback | Not started | A feedback email link exists. | Add a privacy-bounded form, server persistence, durable prompt suppression, admin triage, and non-blocking milestone prompts. |
| Beta analytics | Partial | First-party lifecycle events, DAU/WAU/MAU, event totals, and an admin dashboard are shipped. | Add signup cohorts, target-aligned activation and week-2/week-4 retention, distinct-owner lifecycle views, and actual trainer/course outbound-click events. |
| Guided Today | Not started - foundation available | Guided setup, weekly focus, deterministic training suggestions, training deferral, and contextual progress are shipped. | Replace `/my` with one cross-domain next action, dog switching, durable daily deferral, stable reason codes, and compact weekly context. |
| Release QA | Partial | Automated phone viewport, keyboard, localization, and reduced-motion coverage exists. | Extend continuous smoke early, then run and record final real-device, screen-reader, zoom/reflow, contrast, Spanish, verification, recovery, and monitoring QA after Guided Today. |
| Professional network | Directory only | Public trainer/course browse, protected trainer contact details, course link-outs, and admin CRUD are shipped. | There are no trainer or shelter accounts, shared dog permissions, acknowledgments, assignments, rosters, booking, or payments. |
| Four-week beta loop | Not started | Product targets and cohort size are defined. | Recruit the cohort, run weekly reviews, interview five owners, and record the week-4 decision. |

The obsolete LLM Brief proposal in PR #23 is closed without merge.

## Program gates and parallel lanes

| ID | Work item | Depends on | Can run in parallel with | Hard gate |
|---|---|---|---|---|
| T0 | Establish execution baseline | None | Initial research for every lane | Every remaining item has an owned GitHub issue and truthful status. |
| T1 | Enforce verified email ownership | T0 | T2 | No unverified account reaches owner data or admin promotion. |
| T2 | Restore API monitoring runtime truth | T0 | T1, T4 implementation, T5, T6 | A controlled production API failure is captured from the running image. |
| T3 | Finish browser monitoring and operations | T2 | T4, T5, T6, T7 | API and browser failures are privacy-safe, symbolicated, and actionable. |
| T4 | Prove backup and restore readiness | T0; drill after T2 | T1, T3, T5, T6 | A measured isolated restore is verified and destroyed. |
| T5 | Add private in-app feedback | T1 | T3, T4, T6, T7 | Owners can submit bounded feedback and admins can triage it. |
| T6 | Add beta cohorts and outcome measurement | T0 | T1-T5, T7 | All beta targets are readable as distinct-owner metrics before T8. |
| T7 | Extend continuous production smoke | T1 | T3-T6 | Post-deploy smoke proves a verified authenticated domain read. |
| T8 | Implement Guided Today | T1, T6 | Final work in T3-T5 | `/my` presents one explainable next action and measurable response. |
| T9 | Complete final release-candidate QA | T1-T8 | None | The actual post-T8 release candidate has no blocking finding. |
| T10 | Run the four-week beta | T9 | Small evidence-led fixes only | Four weeks of metrics, feedback, health data, and interviews exist. |
| T11 | Select one next investment | T10 | None | A dated decision names one direction and rejects the alternatives. |

T2 is the first operational implementation task. T1 is the independent security P0. T3-T7 are
parallelizable after their stated dependencies. T8 cannot merge before T6 can measure it. T9 runs
after T8 so the final QA report covers the primary screen owners will actually use.

## Implementation backlog

### T0 - Establish the execution baseline

**Status:** Partial - owned tracking established; ongoing runtime/status obligations remain.

**Goal:** Make ownership, runtime support, status, and documentation truthful before feature work
fans out.

**Implementation seams:**

- Owned issues for T1-T11 now include status, dependencies, acceptance evidence and roadmap links.
- Keep implementation branches, local `main`, and `origin/main` unambiguous before each project
  starts.
- Keep `README.md`, `DEPLOY.md`, `docs/SECURITY-BACKLOG.md`, and `docs/PROJECT-LOG.md` aligned with
  shipped behavior.
- Freeze runtime upgrades during the beta-readiness cycle unless the affected production paths,
  image boot, and monitoring are re-proven.

**Verification and exit:** The issue tracker contains owned non-PR issues for T1-T11; roadmap status
matches repository and production evidence; no planning-only commit is stranded outside review.

**Non-goals:** Rewriting historical specs or creating issues for already shipped features.

**Owned issue map:** All items are assigned to `mcasillas17`; creating tracking does not
complete their delivery or all remaining T0 obligations.

| Item | Issue | Current delivery status |
|---|---|---|
| T1 | [#97](https://github.com/mcasillas17/TuringCare/issues/97) | Implementation ready; production cutover pending |
| T2 | [#98](https://github.com/mcasillas17/TuringCare/issues/98) | Not started |
| T3 | [#99](https://github.com/mcasillas17/TuringCare/issues/99) | Configuration foundation only |
| T4 | [#100](https://github.com/mcasillas17/TuringCare/issues/100) | Not started; drill follows T2 |
| T5 | [#101](https://github.com/mcasillas17/TuringCare/issues/101) | Not started; depends on T1 |
| T6 | [#102](https://github.com/mcasillas17/TuringCare/issues/102) | Partial foundation |
| T7 | [#103](https://github.com/mcasillas17/TuringCare/issues/103) | Partial foundation; depends on T1 |
| T8 | [#104](https://github.com/mcasillas17/TuringCare/issues/104) | Not started; depends on T1 and T6 |
| T9 | [#106](https://github.com/mcasillas17/TuringCare/issues/106) | Final post-T8 QA not started |
| T10 | [#105](https://github.com/mcasillas17/TuringCare/issues/105) | Not started; depends on T9 |
| T11 | [#107](https://github.com/mcasillas17/TuringCare/issues/107) | Blocked on T10 evidence |

### T1 - Enforce verified email ownership

**Status:** Partial - implementation ready; P0 production cutover evidence pending.
Tracked in [#97](https://github.com/mcasillas17/TuringCare/issues/97).

**Goal:** Require proven email ownership before any owner-domain access or allowlist-based admin
promotion.

**Delivered implementation:**

- Better Auth requires verified email before issuing a new sign-in session. Uncached
  server session checks independently protect owner routes, native account mutations,
  trainer contacts, admin entry and allowlist promotion, including persisted unverified admins.
- `/me` remains available for recovery, is non-cacheable, and masks unusable admin roles.
  Public directories, finalized public Briefs, password recovery and sign-out remain available.
- Email-link GETs only stage a ten-minute encrypted receipt. Explicit trusted-origin
  confirmation validates ownership; neither opening a link nor a query flag grants access.
- The public `/verify-email` route handles no-session and legacy-session users in en/es.
  Credential-proven resend has durable server limits, provider-aware feedback and bounded
  cooldowns. Password reset does not verify ownership.
- Session/cache/locale boundaries preserve benign-focus drafts, clear genuine authorization
  changes, and do not block unverified recovery on a protected profile query.
- Production forbids test email capture. Counter maintenance is bounded, expires inactive
  verification counters and reports incomplete work without exposing identity or content.

**Rollout:** No migration or temporary enforcement flag was needed. Before merge-triggered
deployment, an authorized operator must inventory affected accounts with aggregate information
and genuinely verify controlled admin/smoke accounts. Preserve API-first ordering and reload
old tabs after the web bundle is published. There is no administrative grace path or rollback
to unverified access. The blocking checklist, recovery constraints and state diagram are in
[`DEPLOY.md`](../DEPLOY.md#6a-verified-email-ownership-cutover).

**Telemetry and privacy:** Existing server-derived signup/sign-in and public event attribution
remain; no new auth audit system was added. Emails, tokens, locale and authored content do not
enter telemetry. Application redirects contain only safe paths and bounded display/retry hints.

**Tests and exit:**

- API tests cover new sign-in behavior, existing unverified sessions, verified sessions, resend and
  recovery, and unverified allowlisted admin accounts.
- Web tests cover confirmation, resend/service failures, locale continuity, focus/cache transitions
  and recovery without redirect loops.
- Playwright proves registration cannot reach owner data before verification and can proceed after
  explicit confirmation and sign-in, at desktop and phone sizes.
- Local gates and PostgreSQL 16/18 maintenance coverage are complete. Production evidence is not.
- Exit remains: deployed enforcement and recorded cutover evidence show that no unverified account
  can read or mutate owner data or gain usable admin privileges.

**Non-goals:** OAuth, 2FA, auth audit logging, or session-expiry redesign.

### T2 - Restore API monitoring runtime truth

**Status:** Not started - P0 operational gate.

**Goal:** Make API error capture effective in the production runtime before relying on monitoring
or running the restore drill.

**Current conflict:** `Dockerfile.api` uses `node:26-slim`, while
`apps/api/src/monitoring/sentry.ts` deliberately leaves monitoring disabled for every Node major
other than 22.

**Implementation seams:**

- Default to restoring the production image to Node 22 so it matches `.nvmrc`, CI, and the
  monitoring support contract. Keep Node 26 only if a reproducible image test proves
  `@sentry/node` plus the current `tsx` runtime boots, captures, flushes, and exits correctly.
- Update `Dockerfile.api`, `apps/api/src/monitoring/sentry.ts` and tests, the production image smoke,
  and runtime documentation as one change.
- Add an operator-only, content-free diagnostic path from the existing monitoring plan.

**Telemetry and privacy:** Preserve the existing deny-by-default event sanitizer. Diagnostics may
contain release, normalized route, status, and request ID only.

**Tests and exit:** Build and boot-smoke the exact production image, deploy it, trigger controlled
request and process diagnostic events, and record that each reaches the API Sentry project with the
expected release and sanitized metadata. Exit only when the running release, not a local mock,
proves capture.

**Non-goals:** Performance tracing, session replay, or broad auto-instrumentation.

### T3 - Finish browser monitoring and monitoring operations

**Status:** Not started beyond configuration parsing.

**Goal:** Detect recoverable browser and React failures without sending owner-authored content or
public Brief tokens to Sentry.

**Implementation seams:**

- Add the web sanitizer, Sentry adapter, and monitored fetch under
  `apps/web/src/monitoring/`; wire both typed API and Better Auth clients.
- Add a localized React error boundary around the application in `apps/web/src/main.tsx`.
- Configure the Vite Sentry plugin, shared release SHA, hidden source-map upload, and deletion of
  all `.map` files before Cloudflare Pages publication.
- Add separate API/web diagnostics, alert rules, deduplicated GitHub issue routing, and
  `docs/runbooks/production-monitoring.md`.

**Telemetry and privacy:** Normalize raw URLs through the existing public-Brief path protection.
Allow only application, release, normalized route, API route, status, request ID, stack module/path,
and safe mechanism metadata. No identity, query, cookies, headers, form values, journal/Brief text,
or arbitrary exception values.

**Tests and exit:** Unit-test both sanitizers, monitored fetch, build options, and error recovery.
Prove hidden maps are absent from the public deploy. Controlled API and React failures must each
produce one symbolicated, privacy-safe, actionable issue without duplicate events.

**Non-goals:** Replay, performance transactions, Sentry's user-feedback widget, or global browser
handlers that duplicate the explicit capture paths.

### T4 - Prove backup and restore readiness

**Status:** Not started; detailed plan exists.

**Goal:** Demonstrate that the Supabase production database can be restored into an isolated target,
validated without exposing owner content, measured, and destroyed.

**Implementation seams:**

- Add the disposable-database test harness and count-only baseline/verifier CLIs under
  `apps/api/src/recovery/`.
- Verify committed migration state, required schema, critical-table aggregate counts, constraints,
  and referential integrity. Treat migration lag and count deltas as explicit operator-review
  results rather than silent success or automatic corruption.
- Add `docs/runbooks/database-recovery.md` and a non-sensitive drill-evidence template.
- Confirm the production Supabase plan, backup mode, restore mechanism, encryption, access controls,
  and cost before the live drill.

**Rollout and privacy:** The verifier must refuse the source production URL and require explicit
isolated-target confirmation. Never emit row values or owner-authored content. Disable outbound
side effects on the restored target.

**Tests and exit:** Recovery tests use per-test throwaway databases. After T2, perform one dated
provider restore, record measured RPO/RTO and count deltas, obtain operator review, and confirm target
destruction. The first drill measures targets; it does not claim preselected RPO/RTO guarantees.

**Non-goals:** Continuous failover, cross-cloud replication, or a recovery UI.

### T5 - Add private in-app feedback

**Status:** Not started.

**Goal:** Let owners submit bounded feedback without leaving the app and let admins triage it without
exposing unrelated owner content.

**Data and contracts:**

- Add feedback category/status enums, a `feedback` table, and a `feedback_prompt_states` table keyed
  by user and milestone prompt in `apps/api/src/db/schema.ts`.
- Include category, bounded message, contact permission, normalized route, server-derived user ID,
  deployed app version, status, internal notes, and server timestamps.
- Put create/update validation and DTO types in `packages/shared`, then generate the next committed
  migration, enable RLS, and update migration rollout/predeploy tests.

**Implementation seams:**

- Add an authenticated `POST /api/feedback` Hono sub-app and admin list/update routes mounted from
  `apps/api/src/app.ts`.
- Normalize the submitted pathname server-side and strip query strings and public Brief tokens.
  Derive identity, timestamps, and release server-side; never accept them as authority from the
  browser.
- Add a globally available authenticated feedback sheet and TanStack Query hooks.
- Add a localized `/admin/feedback` inbox with status filters and internal notes.
- Prompt non-blockingly after the first journal save, first completed week, and first Brief share.
  Use server-backed prompt state as the source of truth so prompts do not repeat across devices.

**Telemetry and privacy:** `feedback.submitted` may contain category and contact-permission booleans
only. Feedback text, internal notes, route query data, and owner content never enter telemetry or
monitoring.

**Tests and exit:** Cover validation, rate limits, verified-user access, admin-only triage, migration
and RLS behavior, prompt deduplication, route normalization, and content-exclusion sentinels. Exit
when submission and triage work in en/es and prompts remain non-blocking and durable.

**Non-goals:** Attachments, screenshots, session replay, public forums, or automated sentiment
analysis.

### T6 - Add beta cohorts and outcome measurement

**Status:** Partial foundation.

**Goal:** Make every beta target readable as a distinct-owner metric before Guided Today ships.

**Definitions:**

- Activation: owner creates a dog and a first journal entry within days 0-6 after signup.
- Week-2 retention: owner has a journal or practice event during days 7-13.
- Week-4 retention: owner has a journal or practice event during days 21-27.
- Brief success: distinct owner finalizes, shares, or emails a Brief.
- Directory engagement: distinct owner clicks the trainer-contact action or the external course
  page; views remain separate.

**Implementation seams:**

- Define the metrics once in `docs/operations/telemetry-definitions.md` and pure query helpers under
  `apps/api/src/telemetry/` rather than growing `apps/api/src/routes/admin.ts`.
- Extend the admin API with signup cohorts, activation, week-2/week-4 retained owners, weekly
  journal/practice owners, and distinct Brief lifecycle owners alongside raw event totals.
- Add `trainer.contact_clicked` and `course.outbound_clicked` to the bounded client event allowlist,
  emitted from the trainer and course detail CTAs with opaque entity ID and target type only.
- Add cohort, retention, Brief outcome, and directory engagement panels under
  `apps/web/src/routes/admin/panels/`.

**Telemetry and privacy:** Identity remains server-derived from the session. Client events are
directional signals and may be spoofed; never use them for authorization or billing. Properties are
scalar and exclude email, recipient, authored content, tokens, dog names, and locale.

**Tests and exit:** Seed timestamps at cohort boundaries, verify distinct-owner math and zero
denominators, and test that event totals are never labeled as people. Exit when all four beta targets
and secondary directory engagement are readable on `/admin` without manual joins.

**Non-goals:** Third-party analytics, per-owner surveillance views, warehouse work, or additional
funnels unrelated to the beta decision.

### T7 - Extend continuous production smoke

**Status:** Partial foundation.

**Goal:** Keep stable beta-readiness foundations continuously tested while the product work
continues.

**Implementation seams:**

- Extend `e2e/production-smoke.spec.ts` after sign-in with a same-origin, credentialed read of one
  stable owner-domain endpoint such as `/api/overview`, asserting only the bounded response shape.
- Add the verification wall and monitoring recovery shell to focused automated coverage as they
  land.
- Keep the workflow read-only, scheduled, post-deploy, and safe for a dedicated verified non-admin
  smoke account.

**Tests and exit:** The smoke account, secrets, and fixture state are documented and monitored.
Post-deploy smoke proves health, public surfaces, verified sign-in, authenticated shell, and one
owner-domain read without creating or changing data.

**Non-goals:** Turning production smoke into the full mutating critical journey.

### T8 - Implement Guided Today

**Status:** Not started; reusable foundations are shipped.

**Goal:** Replace `/my` with one selected dog's explainable next action and compact current-week
context, creating a measurable daily return loop without a second recommendation engine.

**Stable contract and data seams:**

- Define bounded `actionType` and `reasonCode` enums plus dog ID, CTA destination, and compact-week
  DTOs in `packages/shared`. Map localized title/rationale/CTA copy in `packages/i18n`.
- Use one server-backed daily deferral record keyed by owner, dog, owner-local day, and action. The
  dedicated feature spec chooses the final table shape and thresholds before migration generation.
- Candidate actions cover first dog, first/next moment, weekly focus, focused practice, daily
  check-in, Brief generation, Brief finalization, and Brief share.

**Implementation seams:**

- Add a focused Hono sub-app and pure orchestration module that reuse existing focus, suggestion,
  safety, contextual-progress, journal, and Brief loaders. Do not add more branches to the dog route
  monolith or create a second training recommender.
- Replace the legacy `apps/web/src/routes/overview.tsx` dashboard with one action card, dog switcher,
  daily defer control, and compact week strip. Keep quick capture secondary.
- Invalidate all affected overview, onboarding, dog, focus, suggestion, contextual-progress, and
  Brief query keys after an action.

**Telemetry and privacy:** Record shown, CTA, switch, and defer events with action type and stable
reason code only. Identity is server-derived. Do not send dog ID/name, prose, journal/Brief content,
or locale.

**Tests and exit:** The dedicated spec sets action precedence and thresholds. Unit and route tests
cover every action, owner isolation, owner-local day boundaries, deferral, safety suppression,
loading/error states, and cache authority. Component and Playwright tests prove exactly one primary
action and one direct CTA. Exit when `/my` is explainable, deterministic, localized, and measurable.

**Non-goals:** A multi-card command center, LLM ranking, notifications, reminders, or another
training suggestion engine.

### T9 - Complete final release-candidate QA

**Status:** Not started as a recorded gate.

**Goal:** Validate the actual release candidate after Guided Today changes the primary owner surface.

**Implementation seams:**

- Run the complete critical owner journey at desktop and phone sizes against the release candidate.
- Record real-device iOS/Android, keyboard-only, VoiceOver on iOS, TalkBack on Android,
  200% zoom/reflow, contrast, reduced-motion, English/Spanish, verification/resend/reset, monitoring
  recovery, and read-only production-smoke results.
- Save a dated report under `docs/operations/` naming devices, browsers, assistive technology,
  release SHA, findings, fixes, reruns, and residual risk.

**Exit:** Current CI, deploy, image smoke, and production smoke pass; every blocking finding is fixed
and rerun; the report covers the post-T8 `/my` experience.

**Non-goals:** Formal WCAG certification or automated screen-reader substitution for human testing.

### T10 - Run the four-week beta

**Status:** Not started.

**Goal:** Learn whether TuringCare creates an owner return loop and which problem deserves the next
investment.

**Execution:**

- Recruit 10-20 owners with puppies or newly adopted dogs and assign signup-week cohorts.
- If fewer than 10 owners can be recruited within two weeks, pause feature development and treat
  distribution or target-user fit as the constraint.
- Review activation, week-2/week-4 retention, Brief outcomes, feedback, directory engagement,
  errors, and operational health weekly.
- Ship small usability or blocking fixes. Select at most one larger retention change after week-2
  evidence.
- Interview five owners spanning activated, retained, sporadic, and churned participants.

**Exit:** Four weeks of cohort data, weekly review notes, categorized feedback, operational evidence,
and five interview records exist.

**Non-goals:** Paid acquisition, national directory expansion, unrelated feature work, or changing
multiple major variables during the cohort.

### T11 - Select one next investment

**Status:** Blocked on T10 evidence.

**Goal:** Convert beta evidence into one focused post-beta project.

**Decision set:**

1. deepen Guided Today and progress intelligence;
2. validate professional demand with C1, the tracked Brief handoff;
3. change the target user or distribution strategy.

Consider an opt-in weekly summary only if Guided Today measurably improves repeat use. Record the
chosen direction, evidence, rejected alternatives, success metric, and next focused specification.

**Exit:** A dated decision record selects exactly one direction and names its owner and measurable
outcome.

**Non-goals:** Doing all three or starting marketplace infrastructure without evidence.

## Evidence-gated connection path

These stages explain how the owner-first beta can grow toward the north star. Only T11 can activate
one of them.

### C1 - Tracked Behavior Brief handoff

Test the smallest professional connection: an owner sends a finalized Brief to a listed trainer
through a durable handoff intent; the trainer receives a revocable, scoped magic link; the system
records sent, opened, acknowledged, and revoked states without exposing owner data beyond the
finalized Brief projection.

Reuse the existing Brief send/share privacy and idempotency patterns. Keep the recipient surface
read-only apart from a bounded acknowledgment. Measure distinct owners handing off, distinct
trainers opening, and acknowledgment rate. Do not require trainer accounts, a role enum change,
chat, booking, or payments.

### C2 - Permissioned trainer collaboration

Only after repeated C1 engagement, add trainer profile claiming, verified professional identity,
explicit owner consent, a client roster, a read-only shared dog/progress view, and structured focus
recommendations. Design authorization around explicit owner-trainer grants rather than broad role
access.

Do not add free-form messaging, scheduling, billing, or public self-service supply until the
collaboration loop itself repeats.

### C3 - Shelter and class-provider continuity

Only after the trainer collaboration model proves useful, introduce organizations and memberships.
Start with shelter-to-adopter continuity for the first 30 days and class-to-training-plan adoption,
not a general shelter CMS or replicated class inventory. Preserve authored-data, consent, deletion,
and owner-isolation rules across every handoff.

### Marketplace scale

Matching, geo expansion, live availability, reviews, booking, payments, subscriptions, and provider
self-service require repeated collaboration demand plus separate trust, moderation, legal, support,
and monetization designs. They are not active roadmap items.

## Explicitly deferred

Dog photos, PWA/offline capture, 2FA, auth audit logging, broad reminder campaigns, monetization, and
LLM Brief narration remain outside the active beta path. Reconsider them only when T11 evidence
shows they solve the selected constraint.

## Status governance

- `Complete` requires merged code, passing repository gates, deployed behavior where applicable,
  and the named operational evidence.
- `Partial` means a reusable foundation exists but the exit criterion is not met.
- `Not started` means no implementation is merged, even when a design or plan exists.
- Production claims must describe the running release, not only local tests or adapters.
- Every status change updates this document and the linked issue in the same change.

## Relevant repository records

- Account-security details: [`docs/SECURITY-BACKLOG.md`](SECURITY-BACKLOG.md)
- Shipped history: [`docs/PROJECT-LOG.md`](PROJECT-LOG.md)
