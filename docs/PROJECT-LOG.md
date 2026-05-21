# TuringCare — Project Log

Chronological record of shipped phases. One entry per phase: what changed, the
commit range, and where the design/plan live. Newest at the bottom.

Each phase also has a committed design spec (`docs/superpowers/specs/`) and
implementation plan (`docs/superpowers/plans/`); this log is the index.

---

## 2026-05-16 — Session 1: scaffolding, data model & auth
Monorepo (pnpm workspaces: api/web/shared), Hono + Drizzle + Better Auth
(email/password, Postgres sessions, httpOnly cookies), Vite + React 19 +
Tailwind v4 + shadcn, full Drizzle schema, end-to-end auth verified.
- Spec/plan: `specs/2026-05-16-turingcare-scaffolding-design.md`, `plans/2026-05-16-turingcare-scaffolding.md`
- Merged to `main` as `66e1383` (branch `feat/session-1-scaffolding`).

## 2026-05-17 — CI/CD deploy pipeline
GitHub Actions `ci.yml` + `deploy.yml` (push→ci→migrate→deploy-api[Fly]
+ deploy-web[Cloudflare Pages]), Supabase Postgres, `DEPLOY.md`, initial
Drizzle migration `0000`, env-driven URLs/cookies (FRONTEND_URL, VITE_API_URL,
COOKIE_DOMAIN), Fly `fly.toml`/`Dockerfile.api` (tsx runtime), Supabase
session-pooler + TLS. Live: turingcare.dog / api.turingcare.dog.
- Commits ~`10a313f`..`2a447d8` (+ `de9ebd1` wrangler fix).

## 2026-05-17 — Landing page
Warm, animated marketing landing in Turing's blue-merle/copper palette: 9
section components, `useInView`/`Reveal` (reduced-motion safe), shadcn
accordion FAQ, WCAG-AA color placement.
- Spec/plan: `specs/2026-05-17-landing-page-design.md`, `plans/2026-05-17-landing-page.md`
- Commits to `e5ecea0` (pushed to `main`).

## 2026-05-17 — Social share preview (sub-project D)
Open Graph + Twitter + favicon meta in `index.html`, brand `og.png`
(1200×630) + favicon assets, metadata contract test.
- Spec/plan: `specs/2026-05-17-social-share-preview-design.md`, `plans/2026-05-17-social-share-preview.md`
- Commits `5e21b23`..`41a70b7` (pushed). Post-deploy: FB Sharing Debugger re-scrape.

## 2026-05-17 — Ops & docs
Security hardening backlog (`docs/SECURITY-BACKLOG.md`, `cf33af2`). Fly VM
right-sized to 512MB then reverted to 1GB at user request (`4ce8b28` →
`d9f33f4`). No billing changed by the agent (not possible).

## 2026-05-17 — Rate limiting (sub-project A) — SHIPPED
Better Auth DB-backed limiter on /api/auth/* (sign-in/sign-up 5/60s,
forget-password 3/60s, global 100/60s) keyed on Fly-forwarded client IP, +
in-memory lenient global net (300/60s, exempts /health and /api/auth/*).
New `rate_limit` table (migration 0001). Both 429 layers emit `X-Retry-After`
(matches Better Auth 1.6.11). Tests: middleware unit/integration + DB-backed
sign-in 429.
- Spec/plan: `specs/2026-05-17-rate-limiting-design.md`, `plans/2026-05-17-rate-limiting.md`
- Commits: 572aa4e (table/0001), 5de7c41 (middleware), eb43de0 (mount),
  6d2f03a (Better Auth limiter+IP), ce5f60c (X-Retry-After consistency),
  this log entry.

## 2026-05-17 — Copy rephrase ("force-free" → positive framing) — SHIPPED
Replaced "force-free" / "Train without force" with positive-reinforcement /
reward-based phrasing across the 7 landing components, footer, FAQ, trainers
tag/heading, `index.html` description/og/twitter/og:image:alt, and regenerated
`og.png` (tagline + font-size 44→40). Tests updated red→green; full gate green.
- Spec/plan: `specs/2026-05-17-copy-rephrase-design.md`, `plans/2026-05-17-copy-rephrase.md`
- Commits: `758cf46` (copy+tests), `05ecb13` (OG image), this log entry.

## 2026-05-17 — Landing tweaks (CTAs top-bar-only + Turing photo) — SHIPPED
Removed all in-page CTAs (hero buttons, deleted CtaBand section, footer login
link) — CTAs live only in the sticky SiteNav. Added Turing's real photo to the
hero caption + footer, served as a 640×850, ~109 KB, EXIF/GPS/XMP-stripped
derivative; the GPS-tagged original is gitignored and never enters the public
repo (verified at JPEG-marker level).
- Spec/plan: `specs/2026-05-17-landing-tweaks-design.md`, `plans/2026-05-17-landing-tweaks.md`
- Commits: ecaf0e0 (CTA removal), 79060e4 (scrubbed image+gitignore),
  1827d86 (hero+footer photo), this log entry.

## 2026-05-17 — Hero photo enlarge/center — SHIPPED
Hero Turing photo enlarged 48px→160px (`size-40`), re-laid-out as a centered
vertical stack above the caption (`flex-col items-center`, ring-4 + shadow-lg).
Footer avatar / OG image unchanged.
- Spec/plan: `specs/2026-05-17-hero-photo-enlarge-design.md`, `plans/2026-05-17-hero-photo-enlarge.md`
- Commit: e16ed82 (hero.tsx), this log entry.

## 2026-05-17 — Spanish / i18n (sub-project B) — SHIPPED
In-house typed i18n (en/es catalogs with compile-time parity), LocaleProvider +
useI18n + t(), browser-locale detection + localStorage persistence, EN|ES
LanguageToggle in the nav and on auth/app pages, all landing + auth/app copy
localized. No backend, no deps; meta/OG stay English (<html lang> flips).
- Spec/plan: `specs/2026-05-17-i18n-spanish-design.md`, `plans/2026-05-17-i18n-spanish.md`
- Commits: this cycle (see `git log`).

## 2026-05-17 — Nav paw-mark contrast fix — SHIPPED
Replaced the OS 🐾 color-emoji in the site-nav brand badge with the lucide
`PawPrint` vector icon (cream stroke via `currentColor` on the slate badge) —
strong, device-independent contrast. No deps (lucide already present); single
component change.
- Spec/plan: `specs/2026-05-17-nav-paw-contrast-design.md`, `plans/2026-05-17-nav-paw-contrast.md`
- Commits: this cycle (see `git log`).

## 2026-05-17 — Dog Profile CRUD (sub-project C) — SHIPPED
Multi-dog, owner-scoped CRUD over the session-1 tables: 9 Hono endpoints
(`/api/dogs` list/create/get/update/delete + concern & goal sub-lists), every
mutating route owner-isolation-tested (404, no existence leak). Web: list →
detail (concern/goal sub-lists + delete-confirm) → create/edit forms replacing
the `/app` JSON placeholder; typed TanStack Query hooks via hc<AppType>. All
copy localized (en+es parity). No DB migration, no new deps, no apps/api infra
change. Shipped as a PR from the worktree-dog-profile-crud worktree.
- Spec/plan: `specs/2026-05-17-dog-profile-crud-design.md`, `plans/2026-05-17-dog-profile-crud.md`
- Commits: this branch (see `git log`).

## 2026-05-18 — API cold-start / 502 fix — SHIPPED
Fly `min_machines_running` 0→1 (keep one machine warm — no cold-start race) and
explicit `serve({ hostname: "0.0.0.0" })` + corrected log. Root cause: scale-to-
zero + slow `tsx` boot exceeding Fly proxy patience → 502 (the earlier trial
5-min cap was a separate, now-resolved cause). No deps, no schema, apps/api only.
- Spec/plan: `specs/2026-05-18-api-coldstart-fix-design.md`, `plans/2026-05-18-api-coldstart-fix.md`
- Commits: see `git log` (merged via #1; this branch carries it forward through the merge).

## 2026-05-18 — Admin portal & usage telemetry — SHIPPED
Self-hosted first-party telemetry: `events` table + `user.role` enum (migration
`0002`); error-safe `recordEvent` wired into Better Auth (`user.signed_up`,
`user.signed_in`) + `role` surfaced on the session; rate-limited
`POST /api/events` (scalar-only, byte-capped, identity resolved server-side)
with web `page.viewed` tracking on every route incl. pre-auth. `requireAdmin`
(role + `ADMIN_EMAILS` self-healing, promote-only) gating
`GET /api/admin/metrics` + `/activity` (parallelized aggregate queries, JS-ISO
timestamps). Single-page `/admin` Recharts dashboard (Layout A): KPI strip,
signups, active-usage, activation funnel, live activity feed; range selector;
admin-guarded + code-split (recharts kept out of the main bundle — landing
entry chunk −47%). 180-day retention via a scheduled GitHub Actions workflow
(`telemetry:purge`). Full TDD; 60 tests (API 30 / web 30), gate green.
- Spec/plan: `specs/2026-05-17-admin-telemetry-design.md`, `plans/2026-05-17-admin-telemetry.md`
- Commits: this cycle (see `git log`; branch `worktree-feat+admin-telemetry`).

## 2026-05-19 — API client cross-origin credentials fix — SHIPPED
`apps/web/src/lib/api.ts` hono client now sends `credentials: "include"`, so the
session cookie is attached on cross-origin (`turingcare.dog` → `api.turingcare.dog`)
calls. Root cause of the prod 401 on `/api/dogs` (CORS/COOKIE_DOMAIN were already
correct; the client just wasn't sending the cookie). Dev unaffected (same-origin
via Vite proxy). One-line change, no deps.
- Spec/plan: `specs/2026-05-19-api-client-credentials-design.md`, `plans/2026-05-19-api-client-credentials.md`
- Commits: this branch (see `git log`). Shipped as a PR from worktree-fix-api-credentials.

## 2026-05-18 — Admin bootstrap self-heal (hotfix) — SHIPPED
Fixed a bootstrap deadlock from the admin-telemetry ship (#3): the web
`RequireAdmin` guard reads `GET /me` for `role`, but `/me` never ran the
`ADMIN_EMAILS` lazy-promotion — it lived only in `requireAdmin` (gating
`/api/admin/*`), which the guard never reaches because it redirects to `/app`
first. A freshly-allowlisted user could never become admin via the UI.
Extracted a shared `resolveAdminRole` helper (promote-only, DI-testable) now
called by BOTH `requireAdmin` and `/me`, so the allowlist self-heals on the
first authenticated request. `requireAdmin` behavior unchanged (401/403/
adminUser). Tests: 4 unit (DI fakes) + real-DB self-heal + 2 `/me` integration;
full gate green (91 tests). Immediate prod unblock was a manual
`UPDATE "user" SET role='admin'`.
- Spec/plan: `specs/2026-05-18-admin-bootstrap-selfheal-design.md`, `plans/2026-05-18-admin-bootstrap-selfheal.md`
- Commits: this branch (see `git log`). Shipped as a PR from worktree-fix+admin-bootstrap-selfheal.

## 2026-05-19 — App Shell + Journal/Brief/Trainers/Profile/Settings (sub-project D) — SHIPPED
Persistent app shell (icon rail + shared <BrandMark/> banner + responsive
drawer, layout route behind RequireAuth, Admin link admin-only) + Overview
aggregate, re-homed Dogs (chrome stripped), owner-scoped Behavior Journal,
deterministic Behavior Brief (generate/finalize/print/copy, no AI), Trainers
directory (filter/detail), Profile (edit name) + Settings (language/sign-out).
All copy en+es with parity. One PR; internally ~18 reviewed TDD tasks; no
migration, no new deps, no apps/api infra change.
- Spec/plan: `specs/2026-05-19-app-shell-design.md`, `plans/2026-05-19-app-shell.md`
- Commits: this branch (see `git log`). Shipped as a PR from worktree-app-shell-redesign.

## 2026-05-19 — Landing logged-in CTA — SHIPPED
Landing `site-nav` shows a single "Open app" button → `/app` when the user is
logged in (Better Auth `useSession`, cached — no extra round-trip); the
existing Log in / Get started pair renders for anonymous visitors. One new
i18n key (`nav.openApp`) in both en + es. Focused `site-nav.test.tsx` covers
the logged-in path via `vi.mock`; landing.test stays green for logged-out.
- Spec/plan: `specs/2026-05-19-landing-loggedin-cta-design.md`, `plans/2026-05-19-landing-loggedin-cta.md`
- Commits: this branch (see `git log`). Shipped as a PR from worktree-landing-loggedin-cta.

## 2026-05-19 — Transactional email provider (P1) — SHIPPED
Security backlog P1. Provider-isolated `email/send-email.ts` (Resend SDK; only
file importing it) with a log-only no-op fallback when `RESEND_API_KEY` is
unset (local/CI never send, no network, never throw); `EmailSendError` chains
cause; body/identity guards. Pure `email/templates.ts`
(verification + reset, inline-styled HTML + text, paste-link fallback). Better
Auth `emailAndPassword.sendResetPassword` + `emailVerification`
(`sendOnSignUp:true`, `sendVerificationEmail`) wired with swallow-on-error so a
flaky provider can't break sign-up or password-reset (logs only userId + err
message — no token/url/PII). `requireEmailVerification` stays OFF — zero
user-facing change. `RESEND_API_KEY` + `EMAIL_FROM` env/Fly secrets + DEPLOY.md
domain-verification checklist (verify endpoint is
`/api/auth/request-password-reset`). Full TDD; gate green (API 63 / web 34 /
shared 8). Unblocks P2 (email verification) and P3 (password recovery).
- Spec/plan: `specs/2026-05-19-transactional-email-design.md`, `plans/2026-05-19-transactional-email.md`
- Commits: this branch (see `git log`). Shipped as a PR from worktree-feat+transactional-email.
- Cleanup follow-up (not a gap): the `"/forget-password"` rate-limit customRule
  in `auth.ts` is exact-match and does not hit the real `/request-password-reset`
  route — but Better Auth's built-in default special rule already enforces 3/60s
  on `/request-password-reset`, so reset IS rate-limited. The custom rule is just
  redundant/misleading; a later task should drop it or rename to the real path.
