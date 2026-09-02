# TuringCare Roadmap

Last audited: 2026-09-01 against `origin/main` at `fcbddc3`.

This is the canonical source for current product priorities and delivery order. Dated design
documents in `docs/superpowers/specs/` record the decisions that produced the roadmap; they are
historical inputs rather than competing status documents.

## Public beta goal

Prepare TuringCare for a public beta with 10-20 dog owners, learn what drives weekly return, and
use observed behavior to choose the next major retention investment.

The primary success behaviors are:

- owners return weekly to log behavior and practice training;
- owners generate, finalize, share, or email a Behavior Brief;
- trainer and course outbound engagement provides a secondary signal.

Initial beta targets remain:

- at least 60% create a dog and make a first log;
- at least 40% return during week 2;
- at least 25% remain active during week 4;
- at least 25% finalize or share a Brief.

## Current status

| Area | Status | What is complete | Remaining gap |
|---|---|---|---|
| Critical owner journey | Complete | Playwright covers registration, email verification, guided dog setup, moment logging, training, practice, and Brief finalization/sharing at desktop and Pixel 7 viewports. | Keep the journey current as product flows change. |
| Production smoke | Partial | Scheduled and post-deploy checks cover API health, landing, directories, sign-in, verified-account state, and the authenticated shell. | Exercise one stable read-only owner domain surface after sign-in. |
| Email ownership | Blocked | Verification delivery, localized email chrome, resend controls, and the soft verification banner are shipped. | Unverified accounts can still use authenticated routes and qualify for `ADMIN_EMAILS` promotion. |
| Production monitoring | Partial | API request IDs, privacy-safe sanitization, and API Sentry capture are shipped. | Add browser capture, React error recovery, source-map handling, alerts, GitHub integration, controlled diagnostics, and rollout evidence. |
| Backup and restore | Not started | The recovery design and implementation plan are committed. | Add the provider-confirmed runbook and complete a measured isolated restore drill. |
| In-app feedback | Not started | A feedback email link exists. | Add a privacy-bounded in-app form, server persistence, admin triage, and non-blocking milestone prompts. |
| Beta analytics | Partial | First-party lifecycle events, DAU/WAU/MAU, event totals, and an admin dashboard are shipped. | Add signup cohorts, activation and week-1/2/4 retention, distinct-owner lifecycle views, and actual trainer/course outbound-click events. |
| Release QA | Partial | Automated phone viewport, keyboard, localization, and reduced-motion coverage exists. | Complete and record real-device, screen-reader, zoom/reflow, contrast, Spanish, verification, and recovery QA. |
| Guided Today | Partial foundation | Guided setup, weekly focus, deterministic training suggestions, daily training deferral, and contextual progress are shipped. | Replace the `/my` dashboard with one cross-domain next action, dog switching, generalized deferral, stable reason codes, and compact weekly context. |
| Four-week beta loop | Not started | Product targets and cohort size are defined. | Recruit the cohort, run weekly reviews, interview five owners, and record the week-4 decision. |

The obsolete LLM Brief proposal in PR #23 is closed without merge.

## Delivery order

### 1. Establish the beta execution baseline

- Keep the working branch and local `main` aligned with `origin/main`.
- Create durable GitHub issues with an owner and status for steps 2-10.
- Keep dog photos, 2FA, monetization, PWA/offline work, and LLM Brief narration outside the active
  beta critical path.

**Exit:** The baseline is current and every remaining beta gate is owned and tracked.

### 2. Enforce verified email ownership

- Define a migration-safe policy for existing unverified accounts.
- Require verification before owner-data access and allowlist-based admin promotion.
- Preserve localized resend, callback, expired-link, and recovery behavior.
- Cover registration and sign-in before and after verification, existing-account rollout, and
  admin promotion.

**Exit:** No unverified account can reach authenticated owner data or self-promote through
`ADMIN_EMAILS`; controlled existing users have an explicit recovery path.

### 3. Finish production monitoring

Continue from
[`docs/superpowers/plans/2026-08-10-sentry-production-monitoring.md`](superpowers/plans/2026-08-10-sentry-production-monitoring.md):

- finish browser monitoring and the localized React error boundary;
- upload hidden source maps and prove none are published;
- configure privacy-safe Sentry alerts and GitHub issue creation;
- run controlled API and browser diagnostics and record symbolication, release, correlation, and
  deduplication evidence.

**Exit:** Controlled API and browser failures appear in separate production projects and produce
one actionable, privacy-safe issue each.

### 4. Prove backup and restore readiness

Continue from
[`docs/superpowers/plans/2026-08-10-backup-restore-readiness.md`](superpowers/plans/2026-08-10-backup-restore-readiness.md):

- add the provider-confirmed Supabase recovery runbook;
- implement the isolated restore verifier;
- complete a dated restore drill against a temporary encrypted database;
- compare migration state and aggregate critical-table counts, record measured RPO/RTO and operator
  review, then confirm destruction of the temporary target.

**Exit:** The committed runbook contains measured drill evidence and no temporary restore target
remains.

### 5. Add private in-app feedback

- Store category, message, contact permission, normalized route, server-derived user ID, app
  version, status, internal notes, and server timestamp.
- Never collect journal, Brief, dog-note, or form content automatically.
- Add an authenticated global entry point and an admin inbox.
- Prompt without interrupting capture after the first journal save, first completed week, and first
  Brief share; suppress repeat prompts durably.

**Exit:** Owners can submit bounded feedback without leaving the app and admins can triage it
without exposing unrelated owner content.

### 6. Add cohort and retention measurement

- Define activation and active-owner rules once in telemetry documentation and SQL.
- Add signup cohorts with dog-created/first-log activation and week-1/2/4 retained-owner counts and
  rates.
- Add weekly distinct owners for journal and practice activity.
- Separate distinct owners from event totals for Brief generated/finalized/shared/emailed.
- Track actual trainer-contact and course-registration outbound clicks separately from profile
  views.

**Exit:** Every initial beta target is directly readable from the admin dashboard without manually
joining events or confusing events with people.

### 7. Complete the release-candidate QA gate

- Extend production smoke to one stable read-only authenticated owner domain surface.
- Run the critical owner journey at desktop and phone sizes against the release candidate.
- Record real-device phone, keyboard-only, screen-reader, zoom/reflow, contrast, reduced-motion,
  Spanish, verification, and error-recovery checks.
- Fix blocking findings and rerun affected checks.

**Exit:** A dated QA report identifies the tested devices and assistive technology, current
CI/deploy/smoke checks pass, and no blocking finding remains.

### 8. Implement Guided Today

- Replace `/my` with one selected dog's deterministic next action, localized rationale, and primary
  CTA.
- Support dog switching and daily deferral without creating a multi-card command center.
- Cover first-dog, journal, weekly-focus, practice, check-in, Brief generation, finalization, and
  share actions with stable action types and reason codes.
- Add a compact current-week strip for active days, practice sessions, moments/check-ins, and
  focused skills practiced.
- Reuse the existing training suggestion and skip behavior instead of creating a second training
  recommendation engine.
- Measure recommendation impression, CTA, switch, and defer without owner-authored content.

**Exit:** `/my` presents one explainable next action per selected dog and cohort analytics can
measure exposure and action.

### 9. Run the four-week beta

- Recruit 10-20 owners and assign signup-week cohorts.
- Review activation, retention, Brief use, feedback, errors, and operational health weekly.
- Ship small usability fixes; select at most one larger retention change after week-2 evidence.
- Interview five owners spanning activated, retained, and churned groups.

**Exit:** Four weeks of cohort data, weekly review notes, categorized feedback, and five interview
records exist.

### 10. Select the next investment from evidence

- Compare outcomes with the beta targets above.
- Choose exactly one direction: deepen Guided Today/progress, improve Brief/trainer handoff, or
  change the target user.
- Consider an opt-in weekly summary email only if Guided Today measurably improves repeat use.
- Keep dog photos, PWA/offline, monetization, and LLM narration gated behind the result.

**Exit:** A dated decision record names the selected investment, supporting evidence, rejected
alternatives, and next focused specification.

## Related records

- Original public-beta strategy:
  [`docs/superpowers/specs/2026-07-31-public-beta-roadmap-design.md`](superpowers/specs/2026-07-31-public-beta-roadmap-design.md)
- Production-readiness design:
  [`docs/superpowers/specs/2026-08-10-production-operational-readiness-design.md`](superpowers/specs/2026-08-10-production-operational-readiness-design.md)
- Account-security details: [`docs/SECURITY-BACKLOG.md`](SECURITY-BACKLOG.md)
- Shipped history: [`docs/PROJECT-LOG.md`](PROJECT-LOG.md)
