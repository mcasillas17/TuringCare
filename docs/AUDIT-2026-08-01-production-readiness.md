# Production-Readiness Audit — 2026-08-01

Five parallel read-only audits (UX, performance/reliability, code health, accessibility,
security/privacy) run to prepare TuringCare for an invited beta (dog owners; trainers as a
referral channel, not app users). This is the prioritized punch-list. Each finding is tagged
with its source audit and a rough **impact × effort**. Grouped into workstreams — each
workstream becomes its own spec → plan → build via the normal flow.

**Headline:** No critical data-exposure bugs. Authorization is a strength (every user-data
route owner-scoped, 404 on cross-owner, admin gated, PII projections clean). Biome clean, no
`any`/`@ts-ignore` in prod source. This is hardening + polish, not a rescue.

**Cross-audit convergence (fix once, satisfy many):**
- Hand-rolled popovers/dropdowns (template-picker, week-grid cell, confidence-chip) lack
  outside-click/Escape dismissal, focus management, and ARIA state — flagged by UX, code-health,
  AND a11y. Replacing them with the already-installed Radix primitives resolves ~6 findings.
- Password-reset rate-limit key mismatch — flagged by both code-health and security.
- Errors swallowed into generic toasts — UX + code-health.
- Missing `<h1>` / heading hierarchy — code-health + a11y.
- Destructive deletes with no confirm/error — UX + a11y.

---

## Workstream A — Security & dependency hardening  (recommended first; beta gate)
- **A1 · Upgrade `better-auth` ≥1.6.13** (installed `^1.1.0`). Published HIGH advisories: account
  takeover via pre-account, stored XSS via `javascript:` redirect_uri. Auth is the whole trust
  boundary. [security] · High · S
- **A2 · Enforce email verification** — set `requireEmailVerification: true`; gate
  `resolveAdminRole` promotion on `emailVerified`. Closes the `ADMIN_EMAILS` self-promotion gap
  (register an allowlisted address before its owner → admin). [security, backlog P2] · High · M
- **A3 · Upgrade `hono` ≥4.12.25 + `@hono/node-server`** (CORS-reflect advisory; mitigated by
  fixed FRONTEND_URL but version is vulnerable). [security] · High · S
- **A4 · Upgrade `react-router-dom` ≥7.18.0** (DoS/RSC-XSS/injection advisories). [security] · Med · S
- **A5 · Fix password-reset rate-limit key** — `/forget-password` → `/request-password-reset`;
  today reset falls back to the 100/60s global instead of 3/60s → email-flood vector. Add a test.
  [code-health, security] · High · S
- **A6 · Global `bodyLimit` (413 before parse)** — anonymous `POST /api/events` buffers unbounded
  JSON before the 1 KB check → memory-exhaustion DoS. [security] · Med · S
- **A7 · Reject `BETTER_AUTH_SECRET` placeholder in production** — the `.env.example` dev value
  passes `min(32)`, so a forgotten Fly secret silently signs sessions with a known key. Guard in
  `env.ts`. [security, backlog P6] · Med · S
- **A8 · Strip share token from telemetry path** — `/b/<shareToken>` is recorded verbatim in
  `events` (180-day retention) and shown in `/api/admin/activity`; the token is an unauth bearer
  capability. Send the route pattern `/b/:token`. [security] · Med · S
- **A9 · Protect trainer contact harvest** — any free (unverified) account can pull all trainer
  IDs then fetch each detail for email/phone. Rate-limit `/api/trainers/:id` and/or require a
  verified account. [security] · Med · M
- **A10 · Re-auth on account deletion** — `POST /api/auth/delete-user` irreversibly cascades all
  data on one authenticated request, no password/fresh-session check. [security] · Med · M
- **A11 · Tighter `/api/events` limit** + skip `getSession` for anon; consider DB-backed limiter
  for multi-instance correctness. [security] · Med · M
- **A12 · Purge user's `events` on deletion, or disclose anonymized-analytics retention** on the
  privacy page. [security/privacy] · Low · S

## Workstream B — Reliability & observability baseline
- **B1 · Error monitoring (Sentry web + api)** — none today; every crash/500 is invisible in beta.
  [perf] · High · M
- **B2 · Global React error boundary** — a render throw white-screens the whole SPA. [perf] · High · S
- **B3 · QueryClient defaults** — `new QueryClient()` uses `staleTime:0` → refetch storms on every
  mount + window-focus across most queries. Set `staleTime`, `retry:1`, `refetchOnWindowFocus:false`.
  [perf] · High · S
- **B4 · Centralized mutation error handling** — parse the API `{ error }` body; global
  `MutationCache.onError` → specific toast + Sentry. Replaces ~10 generic `catch` toasts.
  [perf, UX, code-health] · Med · M
- **B5 · Web API client timeout + retry** — `hc` client has no AbortController; slow API hangs the
  UI on a permanent spinner. [perf] · Med · S
- **B6 · DB pool timeouts/sizing** — `new Pool` has no `connectionTimeoutMillis`/`idleTimeoutMillis`/
  `statement_timeout`; one hung query can exhaust the pool silently. [perf] · Med · S
- **B7 · Health check DB probe** — `/health` returns ok unconditionally; a machine with a dead DB
  stays in rotation. Add `SELECT 1` (or `/health/ready`). [perf] · Low-Med · S

## Workstream C — Performance & data-layer
- **C1 · FK indexes** — Postgres doesn't auto-index FKs; the hottest list queries (journal, sessions,
  goals, concerns, briefs) are seq-scans. Add indexes + migration. [perf] · Med (High as data grows) · S
- **C2 · Overview loads entire journal** to count + take 5 → two cheap queries (`count()` +
  `limit(5)`). [perf] · Med · S
- **C3 · Pagination on list endpoints** (journal, brief sends, progress) with a default cap. [perf] · Med · M
- **C4 · Route-level lazy loading** — main chunk is 696 KB / 208 KB gz; landing/auth visitors download
  the whole authed app. `React.lazy` the routes (as admin already is). [perf] · Med-High · M

## Workstream D — Interaction correctness & polish (UX)
- **D1 · Migrate hand-rolled menus to Radix** (template-picker, week-grid cell popover, confidence-chip)
  — fixes outside-click/Escape/focus/ARIA in one move. [UX, code-health, a11y] · High · M
- **D2 · Confirm + pending + error on destructive/inline mutations** — journal-entry / skill / goal
  / concern deletes fire instantly with no confirm, no undo, silent on failure; inline add buttons
  swallow errors and lack pending state. [UX, a11y] · High · S-M
- **D3 · Brief page fixes** — generate success toasts the page title; finalize has no confirm/pending/
  error; copy-failure shows the wrong message. [UX] · High · S
- **D4 · Loading states** — dog hub/tabs render blank `null` while loading; app-wide bare "Loading…".
  Add skeletons/shell. [UX] · Med · S-M
- **D5 · Mobile** — courses table doesn't reflow (no `overflow-x-auto`/card layout); landing nav has
  no hamburger (Trainers/Courses unreachable on phone). [UX] · Med · M
- **D6 · Actionable trainer contact** — website/email/phone render as plain text, not `mailto:`/`tel:`/
  anchor. [UX] · Med · S
- **D7 · Localize + format** — raw enum brief status + ISO dates on overview/recent-activity. [UX] · Med · S
- **D8 · Debounce directory filters + add loading state** (trainers/courses refetch per keystroke). [UX] · Med · S
- **D9 · Post-save follow-ups** has two buttons (Skip/Done) doing the same thing. [UX] · Low-Med · S

## Workstream E — Accessibility (WCAG 2.1 AA)
- **E1 · Accessible names on collapsed sidebar nav links** (icon-only, label unmounted). [a11y] · High · S
- **E2 · Label the concern/goal/severity form controls** (placeholder-only / bare select). [a11y] · High · S
- **E3 · Sync `<html lang>` on load** (currently only on manual toggle). [a11y] · High · S
- **E4 · Mobile drawer → Radix Dialog/Sheet** (focus trap/Escape/return/inert; localize close label).
  [a11y, UX] · High · M
- **E5 · Contrast fixes** — copper text on white ≈2.97:1, silver cell glyph ≈1.5:1, copper focus ring
  on cream ≈2.75:1. Introduce a darker `copper-ink` token; darken enabled empty-cell glyph. [a11y] · High · S
- **E6 · `<h1>` on auth pages + first-run overview** (CardTitle is a div; new-user branch starts at h2).
  [a11y, code-health] · Med · S
- **E7 · Form error `aria-describedby` + `role="alert"`** on hand-rolled forms (change-password,
  session-form). [a11y] · Med · S-M
- **E8 · Skip-to-main link** in AppShell + PublicLayout. [a11y] · Med · S
- **E9 · Dog tab-strip `nav` mislabeled** ("Overview navigation"). [a11y] · Low · S
- (D1/E4 overlap: the Radix migrations resolve most keyboard/focus a11y items too.)

## Workstream F — Code structure & tech debt (internal quality)
- **F1 · Delete ~20 dead i18n keys per locale** + CI key-diff guard to prevent regrowth. [code-health] · Med · S
- **F2 · Split `dogs.ts` (619 lines, 75 handlers)** into sub-routers + a `loadOwnedDog`/`loadOwnedSkill`
  middleware (removes ~26 repeated guard blocks — each a potential IDOR if missed). [code-health] · High · L
- **F3 · Split `progress-panel.tsx` (7 components / 348 lines)** into a folder. [code-health] · Med · M
- **F4 · Shared session/user type** (drop `emailVerified`/`role` + response-shape casts). [code-health] · Med · S
- **F5 · Component tests** for journal composers, session-form, dog-form (untested primary flows).
  [code-health] · Med · M
- **F6 · `useApplyTemplate` typed client** (only hook using raw `fetch`). [code-health] · Low · S

## Workstream G — Ops, legal & launch readiness  (added 2026-08-02, from external pre-launch checklist review)
Source: a "pre-launch checklist for vibe-coded apps" thread (Prajwal Tomar / r/vibecoding
"read this first"). Its three pillars — legal/privacy, security posture, cost/abuse — largely
*validate* Workstreams A–F. These five are the genuinely-new items the code-focused audits
structurally missed (each grep-confirmed absent from the repo):
- **G1 · Database backups + tested restore** — nothing verifies Supabase backups exist or that a
  restore works. Confirm backup cadence/retention (or enable PITR) and do one real restore drill.
  [new] · High · S-M (ops)
- **G2 · External uptime monitoring + alerting** — only an in-app `/health`; no off-box monitor
  pages you when the site/API is down. Add an external monitor (hits `/health`, alerts on failure).
  Pairs with B7 (DB-aware health check). [new] · Med · S (ops)
- **G3 · Cost/abuse spend guardrails** — the "$200 Supabase bill" risk. No budget caps or usage
  alerts on Supabase/Fly. Set spend/usage alerts; the rate-limit + body-limit work (A6/A9/A11) is
  the enforcement half, this is the safety-net half. [new] · Med · S (ops)
- **G4 · Cookie/analytics consent** — first-party telemetry (`events`) sets no consent gate; GDPR
  needs a legitimate-interest disclosure or a light consent banner. Decide posture; at minimum
  strengthen the privacy page (folds in A12). [new] · Med · S-M
- **G5 · Legal entity + ToS/DPA** — non-code/business: an LLC and data-processing agreements with
  sub-processors (Supabase, Resend, Cloudflare). Flagged for awareness; out of build scope. [new] · — · —

**Already covered by the tweet's checklist (do not re-add):** privacy policy + terms (shipped),
SPF/DKIM/DMARC email auth (documented in `DEPLOY.md`), RLS/secrets/owner-scoping/rate-limiting
(shipped + Workstream A), error monitoring (B1), data-deletion cascade (exists).

---

## Recommended sequence
1. **A — Security & dependency hardening** (the literal gate to inviting strangers; dep upgrades are
   near-trivial and close known CVEs).
2. **B — Reliability & observability** (so beta failures are visible, not silent).
3. **D + E — Interaction & accessibility polish** (most user-visible; the Radix migration is high-leverage
   across both).
4. **C — Performance** (cheap wins now: C1/C2; the rest matters more as data grows).
5. **F — Code structure** (internal; do opportunistically, F2 pairs well with any API work).

Each workstream ships as its own worktree + PR, TDD, following the documented workflow.
