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

## 2026-05-20 — Authenticated route prefix /app → /my — SHIPPED
Mechanical rename of every authenticated route literal across the web app +
tests (21 files, 63/-63): `/app` → `/my`, `/app/dogs` → `/my/dogs`, etc.
AppShell nav-items + NavLink active check + brand `<Link to>`, landing
"Open app" CTA, post-login/register navigation, admin redirect target, and
every in-app `<Link>`/`navigate(…)`/test fixture retargeted in one pass via
a regex-precise sed (zero `/app` route literals remain). No backend, no i18n
strings, no deps, no infra; `/login`/`/register`/`/`/`/admin` untouched.
Tests pass at 44/17 (string fixtures updated in place).
- Spec/plan: `specs/2026-05-20-rename-app-to-my-design.md`, `plans/2026-05-20-rename-app-to-my.md`
- Commits: this branch (see `git log`). Shipped as a PR from worktree-rename-app-to-my.

## 2026-05-21 — Behavior Journal: edit + 4 missing capture fields — SHIPPED
Extended the per-dog ABC journal with a PUT endpoint and surfaced the four
nullable `journal_entries` columns the schema was designed to capture:
`durationSeconds`, `recoverySeconds`, `peoplePresent`, `ownerResponse`. The
journal page lists entries as compact rows; clicking a row expands the card
to show all 11 capture fields; a pencil affordance toggles inline edit-in-place
(RHF + zodResolver, Save / Cancel). Create-form gained the four new optional
fields with an "optional" hint. API: PUT is owner-scoped + double-scoped by
dogId (cross-dog entryId returns 404, mirrors the DELETE pattern). Each
EntryCard derives its displayed entry from `useUpdateEntry.data ?? entry` so
the cache stays the single source of truth (no useState mirror, no stale-prop
bug after refetch). 11 new i18n keys with en/es parity; one new component
test file (3 cases) + 5 new api/shared cases. No DB migration (columns
already nullable), no new deps, no infra changes. Gates green: API 80/80,
web 47/47, shared 19/19, tsc 0, lint 0, build OK.
- Spec/plan: `specs/2026-05-21-journal-edit-and-fields-design.md`,
  `plans/2026-05-21-journal-edit-and-fields.md`
- Commits: this branch (see `git log`). Shipped as a PR from
  worktree-journal-edit-and-fields.

## 2026-05-21 — Password reset frontend (P3) — SHIPPED
Security backlog P3 (the email pipe P1 shipped separately via PR #7).
`/forgot-password` (single email field, calls Better Auth's
`requestPasswordReset({ email, redirectTo: <origin>/reset-password })`,
anti-enumeration generic success view regardless of API outcome) +
`/reset-password` (token from `?token=`, two-field form min-8 +
matches-confirm, calls `resetPassword({ newPassword, token })`, toast +
redirect to `/login` on success, invalid-link state when token is missing) +
`Forgot password?` link on `/login`. Re-exports `requestPasswordReset` +
`resetPassword` from `auth-client.ts`; new i18n keys en+es with parity
(compile-time guard); accessible `<h2>` headings inside shadcn `CardTitle`.
Full TDD.
- Spec/plan: `specs/2026-05-20-password-reset-frontend-design.md`, `plans/2026-05-20-password-reset-frontend.md`
- Naming note: the plan said `forgetPassword` for the Better Auth client method;
  the real name in 1.6.11 is `requestPasswordReset` (verified against the
  installed package). The code uses `requestPasswordReset`; the spec/plan docs
  retain the historical naming.

## 2026-05-22 — Language toggle redesign — SHIPPED
`LanguageToggle` now shows 🇺🇸 EN / 🇲🇽 ES (flag emoji wrapped in
`aria-hidden`, so the accessible name stays "EN"/"ES"). Component API unchanged
— all 7 mount sites keep working. On the landing nav and app-shell header
(where the top-right corner is occupied by CTAs) a decorative vertical divider
(`h-5 w-px bg-silver/70`) now separates the toggle from the neighboring buttons
so it reads as a distinct control — no absolute repositioning. Auth pages
(already corner-anchored) and Settings (intentional inline) unchanged. New
`LanguageToggle.test.tsx` (accessible name stays EN/ES proving aria-hidden,
flags present in DOM, locale switch). Full TDD.
- Spec/plan: `specs/2026-05-21-language-toggle-redesign-design.md`, `plans/2026-05-21-language-toggle-redesign.md`

## 2026-05-22 — Auth redirects fix — SHIPPED
Two related defects in authenticated-redirect behavior. (A) After a valid
login, the page stayed on `/login`: `signIn.email` → synchronous
`navigate("/my")` raced Better Auth's `useSession` atom, which it refreshes on
a deferred `setTimeout(…,10)` after auth; `RequireAuth` read the still-stale
`{data:null,isPending:false}` (the landing `site-nav` had already resolved the
atom to null) and bounced back to `/login`. Fix: `login.tsx`/`register.tsx`
now do a full-load `window.location.assign("/my")` after success, so the
session re-initializes from the set cookie with no race (root-caused via
systematic-debugging; cookie persistence confirmed fine — manual `/my` load
worked). (B) Authenticated users hitting `/login`/`/register` saw the form —
added `RedirectIfAuthed` (mirror of `RequireAuth`) wrapping both routes →
redirect to `/my`. Full TDD (new `redirect-if-authed`/`register` tests +
extended `login` test). Gate green (API 80 / web 66 / shared 19).
- Spec: `specs/2026-05-22-auth-redirects-fix-design.md`
- Commits: this branch (see `git log`). Shipped as a PR from worktree-fix+auth-redirects.

## 2026-05-22 — Behavior Brief PDF export — SHIPPED

The Behavior Brief page could only Print or Copy plain text; trainers/owners
wanted a branded, shareable artifact. Added a one-click **Download PDF** control
that renders a branded TuringCare PDF entirely client-side from data already on
the page — no API endpoints, no DB changes, strictly additive (Print + Copy
untouched). Built on `@react-pdf/renderer`, which was already in the monorepo
lockfile (a dep of `apps/api`, `^4.1.0` → resolved 4.5.1); wired the same
specifier into `apps/web` so install reused the existing resolution (3-line
lockfile diff, zero new external packages).

Three pieces: (1) a **pure model builder** `buildBriefPdfModel(...)`
(`apps/web/src/lib/brief-pdf-model.ts`) mapping brief + dog → a flat
serializable model (title, dog profile, age derived from DOB as "N yr"/"N mo",
`Intl`-formatted generated date, summary, safe `behavior-brief-<slug>.pdf`
filename; missing fields → `null`, no dog → "Unknown"); (2) a branded
**`BriefPdfDocument`** component (copper-accented header, white dog-profile card,
summary, fixed version/date footer; brand palette mirrors `index.css`; default
fonts only — no external assets); (3) a **`BriefDownloadButton`** wrapping
`PDFDownloadLink`, **lazy-loaded** in `brief.tsx` via `React.lazy` + `Suspense`
so the ~1.5 MB @react-pdf bundle code-splits out of the main app chunk and only
loads when a brief is shown. New i18n keys `brief.downloadPdf` /
`brief.preparingPdf` added to en + es (parity guard preserved).

Concerns/goals are not separately rendered: the brief page only loads
`useDogs()` + `useBrief()` (not `useDog(:id)`), so per "only fields actually
available" the PDF shows the dog profile + the brief summary text (which the
server composer already fills with concerns/goals/journal).

TDD: model test written first and observed red, then implemented (7 cases:
mapping, age in yr/mo, date format, missing fields, no-dog fallback, filename
slug). @react-pdf's `PDFDownloadLink` throws "web specific API" under jsdom
(Node build), so `brief.test.tsx` mocks the lazy `brief-download-button` module
to a plain anchor whose filename comes from the real `buildBriefPdfModel`;
`brief-pdf-document.test.tsx` asserts the document builds a valid React tree
without throwing (no PDF-byte assertions — jsdom can't render @react-pdf).

Gate green: biome clean, `tsc --noEmit` clean, web tests 76 pass (26 files),
build green (PDF lib confirmed split into its own `brief-download-button`
chunk).
- Spec: `specs/2026-05-22-brief-pdf-design.md`
- Commits: this branch (see `git log`). Shipped as a PR from feat/brief-pdf.

## 2026-05-22 — Trainer admin management — SHIPPED
Admin-only trainer CRUD so the public directory has real data to show. New
shared Zod `trainerInputSchema` (`packages/shared/src/trainer.ts`, exported
from the index) mirroring the `trainers` columns — `name`/`city`/`state`
required, `methodologyTags`/`certifications`/`specialties` string arrays
defaulting to `[]`, the rest nullable/optional. New admin sub-app
`apps/api/src/routes/admin-trainers.ts` (`requireAdmin`) mounted in `app.ts`
under `/api/admin/trainers`, chained off the app so `AppType` stays typed for
the web `hc<AppType>` client: `POST /api/admin/trainers` (201 create),
`PUT /api/admin/trainers/:id` (200 / 404 unknown), `DELETE
/api/admin/trainers/:id` (200 / 404 unknown). Bodies validated with the shared
schema (zValidator → 400). Public `GET /api/trainers` + `/:id` unchanged. Web:
internal English-only `/admin/trainers` page (`apps/web/src/routes/admin/
trainers.tsx` + `use-trainers.ts` hooks) behind `RequireAdmin`, list + add +
edit + delete, arrays as comma-separated inputs, linked from the admin
dashboard. No fabricated data shipped — admins enter real trainers. Full TDD
(red→green): API `admin-trainers.test.ts` covers 401 anon / 403 non-admin /
201 create + public list / 200 update / 200 delete + directory removal / 400
invalid / 404 PUT+DELETE unknown id; web `trainers.test.tsx` covers form render
+ create-mutation call (mock `@/lib/api`). Gate green (biome clean, tsc clean,
API 88 / web 68, build incl. code-split `trainers` chunk).
- Spec: `specs/2026-05-22-trainer-admin-design.md`
- Endpoints: `POST/PUT/DELETE /api/admin/trainers[/:id]`

## 2026-05-22 — Email verification soft banner (P2) — SHIPPED
Soft email-verification banner for logged-in users whose address is not yet
verified. No lock-out (`requireEmailVerification` stays off). Shows a slim
dismissible banner "Please verify your email — check your inbox" with a Resend
button (calls `sendVerificationEmail` via Better Auth) and a dismiss (×). Toast
feedback on send success/failure. All copy i18n'd in en+es. `emailVerified`
accessed via type cast `(data.user as { emailVerified?: boolean }).emailVerified`
(mirrors the `role?` cast in `require-admin.ts`). `VerifyEmailBanner` mounted in
`AppShell` below the header, above page content. 5 TDD unit tests (all green).
Gate: biome clean, tsc clean, web tests 71/71, build clean.
- Spec: `specs/2026-05-22-email-verify-banner-design.md`
- Commits: branch `feat/verify-email-banner`.

## 2026-05-22 — Behavior Brief sharing (read-only link) — SHIPPED
MVP #4. Owners share a dog's Behavior Brief via a revocable, read-only public
link `/b/<token>` (no recipient login). `briefs.shareToken` (unique, nullable;
migration 0005 after merging training-progress and email-a-brief) snapshots the
shared brief version. Owner-scoped `POST/DELETE /api/dogs/:id/brief/share` mint
(idempotent, crypto-random base64url) / revoke; existing `GET …/brief` now
carries `shareToken`. Public `GET /api/share/brief/:token` returns a strict
whitelist (dogName, summary, status, version, generatedAt) — no userId/dog
id/token; revoked + unknown both 404. Web: Share control on the brief page
(create/copy/stop) + public `SharedBrief` page reusing the PDF download (with
generatedAt). en+es parity. Full TDD; gate green (API 126 / web 100 / shared 28).
- Spec/plan: `specs/2026-05-22-brief-sharing-design.md`, `plans/2026-05-22-brief-sharing.md`
- Commits: this branch (see `git log`). Shipped as a PR from feat+brief-sharing.

## 2026-05-22 — Email a Behavior Brief to a trainer — SHIPPED
Closes the last broken link in the MVP test loop. Owner generates → marks
finalized → sends to any email address with an optional personal note. New
`brief_sends` audit table (cascade-on-brief-delete); new POST
`/api/dogs/:id/brief/send` (409 if draft, 502 if Resend fails — no swallow,
owner needs explicit feedback); new GET `/api/dogs/:id/brief/sends` for the
history list (innerJoin scoped by dog ownership; `sentByUserId` omitted from
the response projection). Reply-To is the owner's email so trainers reply
directly to the owner. `sendEmail` wrapper extended with a `replyTo` arg
piped to Resend's `reply_to`; existing callers unchanged. New `<SendPanel>`
on the Brief page: form is finalized-gated (Send button hidden + hint shown
on drafts; defense-in-depth 409 on server), history list below; hidden
entirely when no brief exists. RHF + zodResolver with `noValidate` so zod
owns validation. 13 new `briefSend` i18n keys with en/es parity. 502 test
deferred with TODO (vi.doMock + module re-import vs. one-line branch — not
worth the cost; flagged for follow-up if a DI seam emerges). Gates green:
api 105/105, web 90/90, shared 23/23, tsc 0, lint 0, build OK.
- Spec/plan: `specs/2026-05-22-email-a-brief-design.md`,
  `plans/2026-05-22-email-a-brief.md`
- Commits: this branch (see `git log`). Shipped as a PR from
  worktree-email-a-brief.

## 2026-05-23 — Training progress tracking — SHIPPED
Full Goal → Skills → Sessions training-progress subsystem: two new Drizzle
tables (`training_skills`, `practice_sessions`) with idempotent backfill,
owner-scoped Hono routes under `/api/dogs/:id`, default same-named skills for
new goals, `loadProgress()` shared by the progress endpoint and Behavior Brief,
and a dog-detail `<ProgressPanel>` with confidence chips, skill CRUD, session
logging/deletion, and en/es parity. No new deps; package manifests unchanged.
Gates green: API 97/97 (+17), web 72/72 (+6), shared 24/24 (+5), tsc 0,
lint 0, build OK. Shipped as a PR from worktree-training-progress.
- Spec/plan: `specs/2026-05-22-training-progress-design.md`,
  `plans/2026-05-22-training-progress.md`
- Commits: this branch (see `git log`).

## 2026-05-23 — MVP coverage: 404 + Privacy + Terms — SHIPPED
Three small but MVP-blocking additions: friendly `/`-catchall NotFound page
(any unknown URL no longer shows a blank screen); public `/privacy` page
with a beta-honest privacy notice (what we collect, why, how to delete);
public `/terms` page with brief beta terms (no warranty, acceptable use,
changes). Landing footer + register form link to both. ~22 new i18n keys
with en/es parity. Pure additive — no existing behavior changed. Gates
green: tsc 0, lint 0, web tests all pass, build OK.
- Commits: this branch (see `git log`). Shipped as a PR from
  worktree-mvp-legal-pages.

## 2026-05-23 — Empty-state polish + first-run wayfinding — SHIPPED
A first-time tester now lands on a welcoming `/my` Overview with a clear
"Add your first dog" CTA instead of cold zeros. Adaptive greeting swaps in
based on state: `new` → welcome + CTA; `noEntries` → "Log your first
entry" nudge; `noBrief` → "Generate your first Brief" nudge; `ready` →
today's layout unchanged. Stronger empty states across `/my/dogs`,
`/my/journal`, `/my/brief`, `/my/trainers` (filtered-empty), each with the
warm, encouraging voice the product wants. Steady-state users see no
change. ~14 new i18n keys with en/es parity. Gates green: tsc 0, lint 0,
web tests all pass, build OK.
- Commits: this branch (see `git log`). Shipped as a PR from
  worktree-empty-state-polish.

## 2026-05-23 — Settings completeness: change-password + delete-account — SHIPPED
The Settings page was a skeleton: language toggle, sign-out, link to
profile. Now it's a real page. **Change password** form (current + new +
confirm, zod-validated, calls Better Auth's `changePassword` client
method; toast on success, helpful error on wrong-current). **Delete
account** double-confirm flow (intro panel → expand → type "delete" to
unlock the Confirm button → call Better Auth's `deleteUser` → sign out →
navigate home). Sectioned layout: Language / Account / Change password /
Danger zone. ~20 new i18n keys with en/es parity (one shared literal
`"delete"` is allowlisted in the parity test). Server-side: a single-line
config flip in `apps/api/src/auth.ts` (`user.deleteUser.enabled: true`)
to satisfy Better Auth's opt-in requirement on `POST /delete-user`; no
schema changes — the existing FK cascades from `user` → `dogs` (and
through to journal/briefs/training/concerns/goals/brief_sends) handle
all data cleanup. Gates green: tsc 0, lint 0, web tests 116/116 (+16),
build OK.
- Spec/plan: `specs/2026-05-23-settings-completeness-design.md`,
  `plans/2026-05-23-settings-completeness.md`
- Commits: this branch (see `git log`). Shipped as a PR from
  worktree-settings-completeness.

## 2026-05-23 — Language toggle: flag popover — SHIPPED
Reworked `LanguageToggle` from the single click-flip pill (PR #22) into a compact
flag-only trigger (`🇺🇸 ▾`) that opens a small Radix `Popover` listing the
language(s) you're not in, which you click to switch — so the other language is
shown explicitly. Opens on desktop mouse hover OR click/tap + keyboard
everywhere; closes on select / Escape / outside-click (Radix) / pointer-leave
(120ms grace). a11y-first: click + keyboard always work, hover (`pointerType
=== "mouse"`) is a desktop-only enhancement, and a hover-open suppresses Radix's
auto-focus so a mouseover never steals focus. Drop-in (same export + `className`
on the trigger; the 5 call sites unchanged). New `language.label` i18n key
(en "Language" / es "Idioma"); reuses `switchTo`/`nameEn`/`nameEs`. Radix Popover
needed a `ResizeObserver` (+ element no-op) test polyfill under jsdom. Built on
the already-installed `radix-ui` (no new dep, no `ui/` wrapper). TDD via
subagent-driven development; the component had two independent opus code reviews
(double-click-dismiss, test-bent pointer guard, timer cleanup, hover focus-steal
all fixed). 5 call-site tests updated for the new trigger name/flow. Gate green:
biome 198, web 38 files / 132 tests, tsc 0, build OK.
- Spec/plan: `specs/2026-05-23-language-toggle-popover-design.md`,
  `plans/2026-05-23-language-toggle-popover.md`
- Commits: this branch (see `git log`). Shipped as a PR from worktree-lang-toggle.

## 2026-05-23 — Feedback channel — SHIPPED
"Send feedback" mailto link added in two places: landing footer
(alongside Privacy + Terms) and Settings → Account section. Opens the
user's email client with `feedback@turingcare.dog` pre-filled and a
TuringCare subject line. No form, no widget, no backend — minimal
friction for testers to tell us what broke. One new i18n key
(`footer.feedback`) with en/es parity. Owner is setting up
`feedback@turingcare.dog` forwarding to their inbox on the DNS side
(out-of-band). Gates green: tsc 0, lint 0, web tests all pass, build OK.
- Commits: this branch (see `git log`). Shipped as a PR from
  worktree-feedback-channel.

## 2026-05-23 — Trainer-detail → Brief cross-link — SHIPPED
Tightens the trainer-to-Brief send loop. Trainer-detail page now shows a
"Send my Brief to this trainer" button (only when the trainer has an email
on file). Deep-links to `/my/brief?recipient=<email>`; SendPanel reads the
new optional `initialRecipient` prop and pre-fills its recipient field.
Owner flow: browse trainer → click button → SendPanel is ready, click
Send. Strictly additive — no existing behavior changed. ~1 new i18n key
with en/es parity. Gates green: tsc 0, lint 0, web tests all pass,
build OK.
- Commits: this branch (see `git log`). Shipped as a PR from
  worktree-trainer-cross-link.

## 2026-05-24 — Courses section (curated directory) — SHIPPED
New first-class Courses section: a curated, filterable directory of training
classes, separate from Trainers. Each course is self-contained (inline
provider fields — organizationName/city/state — no FK to trainers, no org
table) with a small overview and a single deep link to the provider's
canonical course page; nothing dynamic (schedule/instructor/price/spots) is
replicated. New `courses` table + migration; public `GET /api/courses`
(filters: ageGroup/format/state/online) + `/:id`; admin CRUD at
`/api/admin/courses`. Web: `/my/courses` browse (compact table, row → detail),
`/my/courses/:id` detail (overview + skills + "View full details & register
↗"), `/admin/courses` CRUD, new Courses nav item. ~26 i18n keys en/es.
Idempotent seed script loads Seattle Humane's 19-course catalog
(`scripts/seed-seattle-humane.ts`). No journal/plan adoption (deferred
Level-2). `brief.tsx`/`trainer-detail.tsx` untouched. Gates green: tsc 0,
lint 0, web + api + shared tests pass, build OK.
- Spec/plan: `specs/2026-05-24-courses-section-design.md`,
  `plans/2026-05-24-courses-section.md`
- Commits: this branch. Shipped as a PR from worktree-courses-section.

## 2026-05-24 — Public Trainers + Courses directory — SHIPPED
Moved Trainers + Courses out of `/my/*` to public top-level routes
(`/trainers`, `/courses`, + `/:id`) — browsable by anyone, no login. New
`optionalUser` middleware (session if present, never 401). Trainer contact is
scrape-protected: the public list NEVER returns email/phone (even to authed
users), and detail reveals them ONLY to authenticated requests; anonymous
visitors see the profile + a "Sign up to contact" CTA. Courses are fully
public (no PII; link-out to the provider page). Pages render in a new
`PublicLayout` (auth-aware SiteNav + footer); SiteNav gains Trainers/Courses
links (section anchors → `/#…`). Sidebar + all internal links + route-move
test fixtures repointed. Admin CRUD unchanged. Gates green: tsc 0, lint 0,
web + api + shared tests pass, build OK.
- Spec/plan: `specs/2026-05-24-public-directory-design.md`,
  `plans/2026-05-24-public-directory.md`
- Commits: this branch. Shipped as a PR from worktree-public-directory.

## 2026-05-25 — Seattle independent trainers seed — SHIPPED
Idempotent seed (`scripts/seed-seattle-trainers.ts`) for 4 independent
Seattle-area positive-reinforcement trainers, each sourced from their own
public business site + Seattle Humane instructor bio: Cathy Madson (Cathy
Madson Dog Training — aggression/reactivity, CPDT-KA/CBCC-KA/Fear Free),
Olivia Petersen (Sound Connection — separation anxiety/reactivity, CCS/SAPro),
Suzi McCaslin (Laying Down the Paw — basic manners, CPDT-KA), Laura Garzon
(Kinfolk Canine — puppy fundamentals/boarding). Website always populated;
email/phone only where publicly confirmed (missing contact fields left empty
per product call). Idempotent by trainer name; validates each row against
`trainerInputSchema`. Run: `pnpm --filter @turingcare/api exec tsx
scripts/seed-seattle-trainers.ts`. Org staff with no independent practice
(Christi Montgomery, Michelle Reindal) deliberately excluded — the Trainers
directory is for independent practitioners. Data tooling only; no schema/API
change. Test validates the 4-row array.
- Commits: this branch. Shipped as a PR from worktree-seed-trainers.

## 2026-05-25 — Directory chrome fix (adaptive layout) — SHIPPED
Bugfix: a logged-in user opening a public directory page (e.g. "Find a
trainer" from /my) lost their app shell — sidebar + top bar vanished —
because /trainers and /courses always rendered in PublicLayout. New
`DirectoryLayout` picks chrome by session: signed in → AppShell (sidebar +
top bar; AppShell's own Outlet renders the page), anonymous → PublicLayout
(SiteNav + footer). Brief null render while the session resolves avoids
flashing the wrong chrome; in-app navigations are cached so the signed-in
path is flicker-free. Zero AppShell changes. 3 new tests. Gates green.
- Commits: this branch. Shipped as a PR from worktree-directory-chrome.

## 2026-05-25 — Journal quick-capture redesign — SHIPPED (revived)
Makes logging fast: primary "Log a moment" (dog + plain `note` + optional
intensity, <30s), secondary "Daily check-in" (better/same/harder + note), with
ABC + the structured fields demoted to optional post-save enrichment instead of
prerequisites. Schema migration relaxes ABC/intensity to optional, adds `kind`
(moment|daily_checkin), required `note`, and `trend` enums, with data-safe
backfill of `note` from existing ABC + CHECK constraints (intensity-nullable
range, daily_checkin requires trend, moment forbids trend). New dedicated
`/api/journal` route module; new web composers (quick-moment, daily-check-in,
post-save-follow-ups, structured-details-editor) + entry-card rewrite +
dog-specific entry points from `/my/dogs/:id`. This branch was built in an
earlier session and orphaned during the MVP/courses/trainers work; revived by
merging current `origin/main` (through #34) — renumbered its migration 0005 →
0007 (preserving the hand-crafted data backfill; drizzle-generated the snapshot),
unioned the journal i18n keys, and took the quick-capture journal.tsx over the
superseded #25 empty-state tweaks. Gates green: tsc 0, lint 0, api 154 / web
157 / shared 35, build OK, migration applies cleanly.
- Spec/plan: `specs/2026-05-22-journal-quick-capture-design.md`,
  `plans/2026-05-23-journal-quick-capture.md`
- Refinement: quick-moment intensity is now an opt-in snapping 1–5 slider
  instead of a `<select>`. Default state is "none" (a "+ Add intensity" button);
  clicking reveals a `range` input (min 1 / max 5 / step 1, default 3) with a
  value readout, 1–5 tick labels, and a ✕ to clear back to none — keeping
  intensity genuinely optional while making the 1–5 scale tappable. Added
  `quick-moment-composer.test.tsx` (default-hidden, reveal-on-click, clear) and
  i18n keys `addIntensity`/`clearIntensity`. Gates: tsc 0, lint 0, web 160.
- Follow-ups: a few superseded #25 i18n keys (emptyTitle/emptyBody/noDogsCta/add)
  are now unused.
- Commits: this branch. Shipped as a PR from feature/journal-quick-capture-implementation.

## 2026-05-25 — Windowed, trend-aware behavior brief — SHIPPED
Makes the brief recency-aware now that quick-capture fills the journal fast.
`composeBrief` gains a time window — the Journal line reads
`N entries in the last 30 days` (or `(all time)`) and the intensity average is
computed over that window — plus a check-in trend tally line
(`Check-ins: 5 better, 2 same, 1 harder.`) from daily check-ins' `trend`, and the
recent-entry list cap goes 5 → 10. `POST /api/dogs/:id/brief` takes an optional
`?window=7d|30d|90d|all` (default `30d`) validated with `zValidator("query", …)`
and date-filters the journal query (`gte(occurredAt, cutoff)`); the web brief page
gets a segmented `7d/30d/90d/All` control. Still a deterministic text template (no
LLM). No schema/migration; email-a-brief send flow untouched (reuses the stored
summary, so it inherits the chosen window). Built via subagent-driven development
(implementer + spec + quality review per task). Gates green: tsc 0, lint 0,
shared 38 / web 158 / api 157, web build OK.
- Transport note: window is a query param, not a JSON body — the typed hono RPC
  client needs a route validator, and a json-body validator would break every
  no-body `POST /:id/brief` caller. See the spec's implementation note.
- Spec/plan: `docs/superpowers/specs/2026-05-25-brief-windowed-trend-design.md`,
  `docs/superpowers/plans/2026-05-25-brief-windowed-trend.md`
- Commits: this branch. Shipped as a PR from feature/brief-windowed-trend.

## 2026-05-30 — Onboarding checklist on /my overview — SHIPPED
Replaces the single "Welcome to TuringCare" card with a 5-item progress
checklist: ✓ add your first dog / log 3 moments / set a training goal /
finalize a brief / share with a trainer. Each item is computed live from
existing tables (no new schema, no migration) by a new owner-scoped
`GET /api/onboarding` returning `{hasDog, momentsCount, hasGoal,
hasFinalizedBrief, hasSentBrief, mostRecentDogId}`. Rows are clickable and
deep-link to the right route (per-dog where it makes sense, using
mostRecentDogId; safe fallbacks when null). Once all 5 are done, the
checklist collapses to a one-line celebration banner the user can dismiss
(persisted per-device in localStorage). The five progress-flipping mutations
(useCreateDog, useAddGoal, useCreateEntry, useFinalizeBrief, useSendBrief)
each invalidate the `["onboarding"]` query so the checklist updates the
moment the user returns to /my. Built via subagent-driven-development
(implementer + spec + quality review per task). Gates green: tsc 0, lint 0,
shared 38 / web 167 / api 163, web build OK.
- Open follow-ups (minor, non-blocking): the `stage==="new"` branch now has
  no page-level `<h1>` (the checklist's heading is `<h2>`) — heading
  hierarchy quirk for screen-reader users; the existing `overview.test.tsx`
  fetch stub returns `{}` for `/api/onboarding` (the checklist test mocks
  the hook directly, so coverage is fine, but the route-level stub could
  be tightened).
- Spec/plan: `docs/superpowers/specs/2026-05-27-onboarding-checklist-design.md`,
  `docs/superpowers/plans/2026-05-27-onboarding-checklist.md`
- Commits: this branch. Shipped as a PR from feature/onboarding-checklist.

## 2026-05-31 — Training goal templates (curated curriculum) — SHIPPED
Curated training-curriculum templates a user can apply to a dog in one click.
Five starter templates — basic-manners, puppy-fundamentals, reactivity-work,
separation-comfort, recall-reliability — covering 21 skills with 105 progressive
level definitions (L1 → L5 per skill) all in humane positive-reinforcement
language. From the dog detail page the user clicks a new `Templates ▼` button
next to "Add Goal", picks a template, previews the goal + skills it'll create,
and Apply atomically creates the goal + N skills (`confidence: 1`,
`catalogGoalKey` / `catalogSkillKey` persisted). The progress panel then renders
each catalog-applied skill's description + current-level milestone (e.g.,
"Level 3 — Responds in mild distractions") below the confidence selector;
user-created skills render unchanged. Catalog lives as a static `const` in
`apps/api/src/data/training-catalog.ts` — no DB content, no editorial pipeline.
Two new owner-scoped API endpoints: `GET /api/training/templates` and atomic
`POST /api/dogs/:id/goals/from-template`. Single migration (0008) adds two
nullable text columns; no backfill. The apply mutation invalidates
`["onboarding"]` so the onboarding checklist's "Set a training goal" row ticks
immediately. Built via subagent-driven development (7 implementation tasks,
implementer + spec + quality review per task). Gates green: tsc 0, lint 0
(241 files), shared 38 / web 172 / api 173, web build OK.
- Catalog scope: English-only for MVP; the picker chrome (en + es) is localised.
  Catalog can be localised later without further schema/UX work.
- Transport note: `useApplyTemplate` uses raw `fetch` instead of the typed hc
  client because the from-template route uses manual body parsing (no zValidator,
  to preserve the 404-before-400 ownership ordering). Inline comment explains
  the constraint.
- Open follow-ups (minor, non-blocking): the dropdown lacks outside-click +
  Escape dismissal; API error details are squashed into a generic toast; the
  same template can be applied twice (intentional per spec, but a unique
  constraint on `(dog_id, catalog_goal_key)` would close the gap).
- Spec/plan: `docs/superpowers/specs/2026-05-30-training-goal-templates-design.md`,
  `docs/superpowers/plans/2026-05-30-training-goal-templates.md`
- Commits: this branch. Shipped as a PR from feature/training-goal-templates.

## 2026-05-31 — Dog-hub redesign (hub + spokes) — SHIPPED
Restructured the bloated single-page dog detail view into a hub-and-spoke IA.
The old `/my/dogs/:id` crammed profile, concerns, every goal, and every skill
(with inline log/edit/session forms — 50+ interactive elements for a dog with a
few goals) onto one screen. Now `/my/dogs/:id` is a thin **Overview** hub and the
density is split across three focused spokes, all under a shared `<DogLayout>`
(sticky banner with the dog's name + Edit/Delete, plus a 4-tab strip: Overview /
Journal / Training / Brief):
- **Overview** (`dog-hub.tsx`): three `SpokeCard`s with at-a-glance metrics
  (journal entry count + last activity, goals/skills/avg-confidence, brief
  status/version), the concerns add/list block, a top-3 RecentActivity list, and
  a single "Log a moment" CTA → `…/journal?compose=moment`.
- **Journal** spoke (`dog-journal.tsx`): mounts a new shared `<JournalView>`
  extracted from `/my/journal` (scoped to the dog; reads `?compose=`).
- **Training** spoke (`dog-training.tsx`): goal-add row + `TemplatePicker` +
  `ProgressPanel`, where each `SkillCard` is now **collapsed by default** and
  expands on a chevron (name + description + session count + level milestone +
  confidence stay visible; log/edit/session-list/forms hide until expanded).
- **Brief** spoke: the existing `Brief` route, now layout-wrapped.
`edit` renders inside the layout (keeps banner + tabs context). `/my/dogs` keeps
its dedicated **all-my-dogs list** (`dogs-list.tsx`), reachable from the sidebar
"Dogs" nav — the redesign only declutters the per-dog *detail* page, not the
list. Deleted `dog-detail.tsx`; removed 3 genuinely-orphaned `dogs.*` i18n keys
(empty/back/deleteConfirm). No DB, API, or Hono changes — purely a web IA +
component refactor. Built via subagent-driven development (8 tasks; Task 1
carried implementer + spec + quality review, which caught a real bug: skill
`mode` lingered after collapse, so re-expanding reopened a stale form — fixed by
resetting mode on collapse).

**Follow-up (post-merge, shipped as a separate fix PR off `main`):** the initial
pass deleted the dogs-list page and redirected `/my/dogs` → `/my`, which broke
the sidebar "Dogs" nav (it bounced to the dashboard). Restored the dedicated
dogs list so "Dogs" works again. That surfaced a second issue — the dashboard
(`/my`) also rendered a "Your dogs" widget, so dogs were listed in two places.
Resolved by making `/my/dogs` the single home for the dog list and removing the
dashboard's duplicate widget (the dashboard keeps its "Dogs" stat count and the
"Add dog" quick-action; `overview.yourDogs` i18n key removed).
- Gates: web tsc 0, api tsc 0, lint 0 (248 files), shared 38 / web 180, web
  build OK. The api vitest suite could not run locally — Postgres at
  localhost:5432 was refusing connections (ECONNREFUSED); this is the documented
  shared-test-DB environment drift and is unrelated to this frontend-only change
  (the diff touches zero `apps/api`/migration/schema files). CI runs the api
  suite against its own database.
- Spec/plan: `docs/superpowers/specs/2026-05-31-dog-hub-redesign-design.md`,
  `docs/superpowers/plans/2026-05-31-dog-hub-redesign.md`
- Commits: this branch. Shipped as a PR from feature/dog-hub-redesign.

## 2026-06-07 — Weekly skill focus ("This Week" tab) — SHIPPED
A per-dog **This Week** tab (5th tab in the dog layout) for committing to which
skills to train each week and seeing whether the reps landed. The owner keeps a
single evolving **focus list** per dog; the tab renders a Mon–Sun **grid** of
focus skills × days where a filled cell means a practice session was logged that
day. **Tap an empty cell to log** a quick session for that skill on that day
(today → now, a past day → noon local); tap a filled cell for a popover of that
day's sessions with remove + "log another". Future cells are disabled. Page ◀ to
prior weeks (forward capped at the current week); history is free because the
grid re-buckets the dog's existing dated `practice_sessions` for whichever week
is in view. Presence-only — no targets/streaks; the header reads "Trained X of N
focus skills · Y sessions".

New `weekly_focus` table (migration 0009): one row per focused skill per dog,
unique `(dog_id, skill_id)`, cascade on dog/skill delete. New owner-scoped API:
`GET /api/dogs/:id/focus?weekStart&weekEnd` (focus skills + their in-window
sessions), `POST …/focus { skillId }` (404 cross-dog, 409 duplicate),
`DELETE …/focus/:skillId`. Tap-to-log reuses the existing session endpoints — no
new logging route. All week math is done client-side in local time
(`lib/week.ts`, pure + unit-tested): the client sends local-midnight week bounds
as instants and buckets sessions by local day, so a session lands in exactly one
column regardless of timezone.

Built via subagent-driven development (8 tasks; implementer + spec + quality
review; a final whole-feature review confirmed ownership scoping is tight and
the timezone window/bucketing are internally consistent — the one "tz bug" the
reviewer raised was a false positive). Gates: web tsc 0, api tsc 0, lint 0 (261
files), shared 42 / web 190 passing, web build OK. The api vitest suite could not
run locally — Postgres was down (ECONNREFUSED, same documented shared-test-DB
drift; even unrelated suites fail identically) — so the new `focus.test.ts` (6
cases: add/GET, 409 dup, 404 cross-dog, week-window filtering, delete + re-delete
404, skill-delete cascade) runs in CI. No change to existing session/journal
flows.
- Spec/plan: `docs/superpowers/specs/2026-06-07-weekly-skill-focus-design.md`,
  `docs/superpowers/plans/2026-06-07-weekly-skill-focus.md`
- Commits: this branch. Shipped as a PR from feature/weekly-skill-focus.

## 2026-06-09 — Postgres RLS hardening (Supabase Data API exposure) — SHIPPED
A Supabase lint flagged `public.account` as exposed via the PostgREST Data API
without Row Level Security. Root cause: Supabase auto-exposes the `public` schema
and grants `anon`/`authenticated` by default, so the **public anon key** could
read sensitive tables (`account` password hashes, `session` tokens, `user`
emails, all owner data) over REST — even though this app never uses PostgREST
(it talks to Postgres only via a direct `pg` connection through Better Auth +
Drizzle). Fixed in two layers: (1) the Supabase **Data API was disabled** in the
dashboard (primary mitigation — the API was pure attack surface here); (2)
migration **`0011_enable_rls`** `ENABLE`s RLS on all 17 app tables as
defense-in-depth, with a guarded `REVOKE … FROM anon, authenticated`.

No policies and no `FORCE` — deliberately: the API connects as the table-owner
role, which bypasses non-FORCE RLS, so the app is unaffected, while any other
role (e.g. PostgREST `anon`) is denied every row even with table grants. We did
**not** apply Supabase's suggested `auth.uid()` policies — those assume Supabase
Auth, but this app uses Better Auth (`auth.uid()` is always null here); access
control lives in the Hono API layer (owner-scoped queries). Verified locally on
Docker Postgres: migration applies cleanly (17/17 tables `relrowsecurity`), the
full api suite stays green (179/179), and an adversarial check confirmed a
`GRANT SELECT` non-owner role sees 0 rows under RLS while the owner sees the row.
The `REVOKE` loop is portable — it skips when `anon`/`authenticated` roles are
absent (local/CI). Migration deploys via CI `db:migrate` as the owner role.
- Backlog note: `docs/SECURITY-BACKLOG.md` (Shipped — Row Level Security).
- Commits: this branch. Shipped as a PR from security/enable-rls.

## 2026-06-20 — Journal & Brief redesign (phone-first capture) — IN REVIEW
The Behavior Journal and Behavior Brief looked unfinished and were clunky to use
(raw machine timestamps, every entry a tall white box with a lone "Remove", no
day grouping, hidden ABC fields, a two-step intensity slider, a post-save nag
dialog, and a 5–6 step brief flow whose "Finalize" gate silently disabled email).
Redesigned both around phone-first, fast capture with a single tile/sheet visual
language. **Frontend-only — no API/DB/schema changes** (the create schema already
accepted `occurredAt` + ABC fields; the brief already returns `generatedAt`).

Journal: two big tiles (Log moment / Daily check-in) open focused capture
`Sheet`s — one-tap intensity dots, backdate-before-save time chip, inline
"Add detail" (ABC) and "Add place", no post-save dialog. The list became a clean
day-grouped timeline (humanized "Today · 4:46 AM", intensity/trend badges, status
dot); tap a row to edit/remove. Brief: a single living-document review screen
(branded card, status pill "Draft · v{n}" / "Final · v{n}", period chips that
regenerate, humanized generated date) plus a "Share this brief" `Sheet` with three
explained big tiles (✉️ email / 🔗 private link / ⬇️ PDF). The old hidden Finalize
gate became an explicit finalize-on-share. Removed `post-save-follow-ups.tsx` and
its 5 i18n keys; folded the send-panel into the share sheet.

New units: `lib/when.ts` (humanized date/time + day grouping, unit-tested) and a
`components/ui/sheet.tsx` modal primitive (Esc/backdrop close, scroll-lock, labelled
dialog). Built via subagent-driven development (10 tasks; implementer + spec +
quality review each). Gates: web tsc 0, biome 0 (160 files), **199/199 web tests**,
web build OK. react-doctor (changed-scope) 74→77 after fixing the Sheet keydown
re-subscribe and a dead `new Date()` fallback; remaining warnings are SPA
false-positives (no SSR hydration), a readable-flat-state preference, and the
native-`<dialog>` a11y upgrade — deferred because jsdom can't run `showModal()`
(would break the test suite). Manual mobile/visual QA on a device still pending
(controller has no browser).
- Spec/plan: `docs/superpowers/specs/2026-06-20-journal-brief-redesign-design.md`,
  `docs/superpowers/plans/2026-06-20-journal-brief-redesign.md`
- Commits: branch `worktree-journal-brief-redesign`. Shipping as a PR.

## 2026-06-20 — Turing companion mascot (phase 1) — SHIPPED
Added **Turing**, the animated companion mascot, from Claude Design's handoff
(`Turing the companion animation.zip`). Ported the "corner widget" natively into the
React app — no iframe, no `support.js`, no new deps. New `TuringCompanion` component
(`apps/web/src/components/turing-companion.tsx`): the inline SVG artwork is copied
verbatim from the owner-approved handoff (blue-merle Mini American Shepherd,
heterochromia eyes, teal hex tag), and the original ~60-line vanilla logic is
reimplemented as React state — ambient breathe/blink/tail-sway, cursor eye-follow,
hover head-tilt + ear rotation, and a tap-for-a-training-tip speech bubble (random tip,
3.6s). Rendered as an accessible `<button>` (aria-label); the tip bubble is an
`<output>` (implicit `role="status"`). Honors `prefers-reduced-motion` (disables ambient
loops + eye-follow), reusing the repo's existing `matchMedia` pattern. Keyframes
(`tg-breathe`/`tg-breathe-slow`/`tg-sway`/`tg-wag`/`tg-bubble`) added to `index.css`
next to the `tc-drift` convention. Mounted once in `AppShell`, so Turing appears across
the **authenticated app (`/my/*`) only** — not on public/auth pages — at `z-30`, below
the sonner Toaster and the mobile nav drawer overlay. Full TDD (6 new web tests). Gates
green: web tsc 0, lint 0 (Biome), web 196 passing, web build OK.
- **Scope/variant decisions (confirmed with owner):** authenticated-app-only placement;
  the simpler corner widget for phase 1.
- **Deferred to phase 2:** the 8-pose `state`-driven variant (`celebrate`/`sleep`/`wag`/…)
  wired to journal / training / week-completion events (e.g. `celebrate` on a finished
  week); i18n of the 6 English tips (currently hardcoded).
- Spec: `docs/superpowers/specs/2026-06-20-turing-companion-mascot-design.md`
- Commits: this branch. Shipped as a PR from `worktree-feat+turing-companion-mascot`.

## 2026-06-21 — Turing companion: polish (bubble-fit + Spanish) — phase 2a — SHIPPED
Two fixes to the live phase-1 mascot. (1) **Bubble fits the window:** the tip bubble was
centered on Turing and grew rightward, spilling off the right edge (he sits in the
bottom-right corner). Re-anchored `.turing-bubble` to `right:0; left:auto` so it opens
up-and-left, capped `max-width: min(184px, calc(100vw - 24px))`, moved the pointer tail to
the right side, and dropped the now-wrong `translateX(-40%)` from the `tg-bubble` keyframe.
(2) **Spanish:** the 6 tips + the button `aria-label` now live in the `turing` section of
the en/es i18n catalogs (parity test enforces es↔en); `turing-tips.ts` became a list of
catalog **keys** and `TuringCompanion` resolves them via `useI18n().t()` (storing the key,
not the resolved string, so the bubble stays locale-correct). Full TDD — updated/added
component tests (incl. an es-locale render asserting Spanish label + tip) and the existing
i18n parity test covers the new keys. Gates: web tsc 0, Biome clean, **207 web tests**,
build OK. react-doctor: my changed files add zero findings (the worktree `--diff` re-scores
already-merged #46/#47 code; the lone turing finding is the phase-1 intentional bounce
easing).
- **Out of scope (phase 2b):** the 8-pose `state`-driven mascot + a `TuringProvider`/
  `playPose()` trigger wired to app events — `celebrate` on journal save / training session
  / brief finalize-send (owner-selected), idle→`sleep`, and contextual per-route tips.
- Spec: `docs/superpowers/specs/2026-06-21-turing-polish-i18n-design.md`
- Commits: this branch. Shipped as a PR from `worktree-feat+turing-polish-i18n`.

## 2026-06-21 — Turing companion: living, event-driven mascot — phase 2b — SHIPPED
Turing now reacts to wins, dozes when idle, and gives page-relevant tips — the 8-pose
handoff variant wired into the app. Built via subagent-driven development (6 TDD tasks,
implementer + task-review each, plus a whole-branch opus review → ready to merge, no
Critical/Important findings). Pieces:
- **`turing-poses.ts`** — pure `posePresentation(pose, reduceMotion)` mapping the 6 poses
  (idle/tilt/bark/wag/celebrate/sleep) to CSS anim/transform values (handoff-exact); loops
  collapse to `none` under reduced motion.
- **Artwork** (`turing-art.tsx`/`turing-head.tsx` + 3 new keyframes `tg-hop`/`tg-wag-fast`/
  `tg-zzz`) — pose-driven; sleep = closed-eye lines + floating "zzz", celebrate = hop on a
  new outer wrapper + fast wag + tongue. SVG geometry copied verbatim.
- **`TuringProvider`/`useTuring()`** (`components/turing/turing-context.tsx`) — mirrors
  `LocaleProvider`; exposes `celebrate(big?)`, tracks 60s idle→`asleep` (suppressed under
  reduced motion), no-op fallback when unmounted. Mounted once in `AppShell` wrapping both
  content and the mascot (single shared instance).
- **`TuringCompanion`** — effective-pose precedence `eventPose > bark > tilt > sleep > idle`;
  route-contextual tips via `tipContextForPath` + `TURING_TIP_BUCKETS`.
- **Contextual tips** — general (the original 6) + training/journal/week/brief buckets, en+es
  (parity test enforced).
- **Event wiring** — tiered `celebrate`: small **wag** on journal save / training session /
  template apply; big **hop** on brief finalize / share / send. Added first in each existing
  `onSuccess`, never awaited, can't break invalidation.
Gates: web **234/234** tests, tsc 0, Biome clean, build OK. react-doctor: the few findings on
new files are the intentional handoff animation values (head-tilt bounce, 2.4s zzz) + a
false-positive effect-deps flag (deps verified correct); the score is the stale-base artifact
re-scoring already-merged code.
- **Out of scope (future):** `sit`/`lie` poses, sound, a disable-Turing setting. Minor
  follow-ups noted in review: throttle the provider pointermove handler; symmetrize es/en
  tip derivation in the companion test.
- Spec/plan: `docs/superpowers/specs/2026-06-21-turing-living-mascot-design.md`,
  `docs/superpowers/plans/2026-06-21-turing-living-mascot.md`
- Commits: this branch. Shipped as a PR from `worktree-feat+turing-living-mascot`.

## 2026-06-21 — Turing companion: connect all the events — phase 2c — SHIPPED
2b's reactions only fired on a few events (and the common ones use the subtle wag), so Turing
felt inert. This connects him to the rest of the meaningful events, reserving the **hop** for
milestones. Built via subagent-driven development (3 TDD tasks + 1 refactor, implementer +
task-review each, whole-branch opus review → ready to merge). New triggers:
- **Add a dog** (`useCreateDog`) → hop · **Add a goal** (`useAddGoal`) → wag.
- **Skill confidence raised** (`useUpdateSkillConfidence`) → wag, or **hop at mastery**
  (`variables.body.confidence >= CONFIDENCE_MAX`).
- **Onboarding checklist completed** (`checklist.tsx`) → hop **once**, on a real false→true
  transition (undefined-baseline ref avoids firing on mount for already-onboarded users).
- **Weekly focus completed** (`dog-week.tsx`) → hop **once** for the **current** week, via a
  pure `shouldCelebrateWeek` helper (moved to `lib/week.ts`) + a transition ref that
  re-baselines on week change (paging to a complete past week is silent).
Existing 2b triggers unchanged (journal/session/template → wag; brief finalize·share·send →
hop). The two derived-state triggers use an effect-watching-query-state (the completion comes
from refetched/cumulative data, not a single event) — react-doctor's "event logic in an
effect" warning was reviewed and is a **false positive**; documented with inline comments.
Gates: web **244/244** tests, tsc 0, **root** `biome check .` clean, build OK.
- **Out of scope:** concern-adds / profile / settings / deletes (low signal); a celebratory
  text bubble on hop (good follow-up). Optional: an error-path test per new mutation trigger.
- Spec/plan: `docs/superpowers/specs/2026-06-21-turing-connect-events-design.md`,
  `docs/superpowers/plans/2026-06-21-turing-connect-events.md`
- Commits: this branch. Shipped as a PR from `worktree-feat+turing-connect-events`.

## 2026-06-21 — Skill milestones (checkable training levels) — IN REVIEW
First of three sequenced training-tracking sub-projects (milestones → progress-
over-time → dashboard). Turned each skill's 5 levels into **checkable milestones**:
the manual 1–5 confidence chip is gone; you advance by tapping a level in a new
**milestone stepper** in the Training panel, and we record the **date** each level
is reached. `trainingSkills.confidence` is reinterpreted as the "current level"
(set via a new `PUT /dogs/:id/skills/:skillId/level` route → `setSkillLevel`, which
also inserts dated rows in the new `skill_milestones` table), so everything that
already reads `confidence` — goal avg-confidence rollup, the This Week grid, the
Brief — keeps working untouched. "Reached" is derived (`level <= confidence`) so no
backfill; the dated history is the seed for the next sub-project (progress-over-time).
Template skills show their catalog milestone descriptions; free-form skills use the
generic labels. Skill edit is now name-only (level is owned solely by the level
route). Brief now reads "Sit — Level 3: Sometimes (reached Jun 3)".

Built via subagent-driven development (10 tasks: shared schema → migration → API
lib+route → web hook/i18n/stepper/panel → brief → cleanup; implementer + spec +
quality review each). A final whole-feature review caught two real cross-cutting
bugs (both fixed): the panel rendered `updateSkill.data` (a bare DB row without
`milestones`/`sessions`) after a name edit, crashing the stepper — now always uses
the full progress prop; and the skill-edit route wrote `confidence` from the request
body, which could silently reset the level — it now edits the name only.
Gates: shared/api/web tsc 0, **228 web + 184 api tests** green, i18n parity green,
biome 0 (262 files), web build OK, react-doctor unchanged (no new errors). New
migration `0012_absent_hercules` (table only). Manual device QA on the Training tab
still pending.
**Merge note (rebased onto `main` after #51):** the mascot's "celebrate at mastery"
moved off the removed `useUpdateSkillConfidence` onto the new `useSetSkillLevel` —
reaching level 5 via the stepper now triggers the hop (`celebrate(level >= CONFIDENCE_MAX)`).
- Spec/plan: `docs/superpowers/specs/2026-06-21-skill-milestones-design.md`,
  `docs/superpowers/plans/2026-06-21-skill-milestones.md`
- Commits: branch `feat/skill-milestones`. Shipping as a PR.

## 2026-06-21 — Turing companion: celebration bubbles + cooldown — phase 2d — SHIPPED
2c connected Turing to many events, but every hop was silent/identical and frequent wags
risked becoming noise. This gives **milestones a short contextual message** and **throttles
wags**. Built via subagent-driven development (3 TDD tasks + a test-hygiene fix, each
task-reviewed, whole-branch opus review → ready to merge). Changes:
- **`celebrate(big?, messageKey?)`** + `eventMessage` on the context. Messages show on
  **hops only** (a wag forces `eventMessage` null); the message clears with the pose. Shown
  even under reduced motion (the hop is suppressed but the text isn't — an a11y win).
- **Wag cooldown** (`WAG_COOLDOWN_MS = 8000`): a wag is skipped if one played within 8s; a
  **hop always plays** and re-arms the cooldown. Ref-based, cleaned up on unmount.
- **Bubble** renders `eventMessage ?? tipKey` (a live celebration wins over a tap tip).
- **Copy** (en/es, parity-enforced): New pup! 🐾 / Mastered it! 🎉 / You're all set! 🎉 /
  Week done! 🏅 / Brief ready! 📋 (+ Spanish).
- **Wired** the message key at each hop: add-dog, skill **mastery** (`useSetSkillLevel`,
  `level >= CONFIDENCE_MAX` = level 5 — verified the ceiling), onboarding-complete,
  week-complete, brief finalize/share/send. Wags (journal/session/template/goal) unchanged
  and silent; all invalidates preserved.
Gates: web **245/245** tests, tsc 0, **root** `biome check .` clean, build OK. react-doctor
findings on changed files are pre-existing/adjudicated (derived-state effect; intentional
handoff easing) — none new.
- **Out of scope / future:** streaks & first-of-day greeting, a "quiet Turing" setting,
  state-aware tips, ambient micro-animations, centralizing triggers into a reaction registry.
- Spec/plan: `docs/superpowers/specs/2026-06-21-turing-celebration-bubbles-design.md`,
  `docs/superpowers/plans/2026-06-21-turing-celebration-bubbles.md`
- Commits: this branch. Shipped as a PR from `worktree-feat+turing-celebration-bubbles`.

## 2026-06-21 — Turing companion: "Quiet Turing" hide setting — phase 2e — SHIPPED
Turing was a persistent animated element with no off-switch — a real gap for users who find a
mascot distracting. Added a **Settings show/hide toggle**. Built via subagent-driven
development (2 TDD tasks, each task-reviewed, whole-branch review → ready to merge). Changes:
- **`TuringProvider`** gains `hidden` + `setHidden`, persisted per-device in localStorage
  (`tc-turing-hidden`, default shown). When hidden, the idle/activity listeners are skipped.
- **`TuringCompanion`** returns `null` when hidden (after all hooks) and short-circuits its
  ambient effects.
- **Settings** has a new "Companion" section with an accessible checkbox (checked = shown),
  driving the live mascot through the shared provider; en/es copy (parity-enforced).
- Mutation hooks still call `celebrate()` when hidden — harmless no-op.
Gates: web **261/261** tests, tsc 0, **root** `biome check .` clean, build OK. react-doctor:
no new findings on changed files (pre-existing/adjudicated only).
- **Per-device, not account-synced** (localStorage), matching the app's other client prefs.
- **Future ideas (unbuilt):** streaks + first-of-day greeting, state-aware tips, ambient
  micro-animations, empathetic reactions, centralizing triggers into a reaction registry.
- Spec/plan: `docs/superpowers/specs/2026-06-21-turing-quiet-setting-design.md`,
  `docs/superpowers/plans/2026-06-21-turing-quiet-setting.md`
- Commits: this branch. Shipped as a PR from `worktree-feat+turing-quiet-setting`.

## 2026-08-12 — Weekly focus week-start versioning — MIGRATION VERIFICATION
Gate 1 Task 7 versions `weekly_focus` by owner-local Monday `week_start`, adds
compatibility/claim tables, and preserves legacy rows as `week_start = NULL` so
Task 8 can claim at most one preserved row per dog into the owner's real local
week without guessing from the database timezone. The current push-created
local `turingcare` database had **0** `weekly_focus` rows when inventoried and
was not used for `db:migrate` because its Drizzle migration journal is empty.
Migration `0013` was instead applied with `db:migrate` to a dedicated throwaway
database seeded with a legacy focus row after migrations `0000`–`0012`; the row
was preserved with `week_start = NULL`, and the constraints, RLS, direct-delete
guard, authorized deletion, and FK cascade behavior were verified there.

## 2026-08-13 — Personalized training Gate 1 — launch evidence
Weekly focus is versioned by local week; practice sessions now retain structured
outcome/context and the curriculum level. A bounded per-skill dimension metadata
table turns the authored catalog into deterministic targets. Rule-based weekly
suggestions offer one primary exercise plus one easier fallback, while advancement
is proposed and then requires the owner's confirmation. Structured safety inputs
suppress exercises and refer owners out. Suggestion/advancement audit rows and
eight new telemetry names cover focus, practice outcome, suggestion,
advancement, and safety decisions, including legacy focus compatibility use.
- The owner confirmation is intentionally two-step (a proposal followed by an
  explicit decision); `operations/safety-signal-correction.md` records the
  support-confirmed input-mistake correction runbook and its exact two-key
  transaction.
- Launch follow-up: after rollout telemetry confirms `focus.legacy_compat_used`
  is unused, remove the legacy focus and legacy `datetime-local` session
  compatibility branches.
- Out of scope for Gate 1: Gate 2 dashboards, custom-skill suggestions, and
  Behavior Brief integration.
- Spec/plan: `specs/2026-08-11-personalized-training-progress-design.md`,
  `plans/2026-08-11-personalized-training-gate-1.md`.
- Commits: `9095ed4..HEAD` on `feat/personalized-training-gate-1`.

## 2026-08-15 — First-run guided setup — IMPLEMENTED
A resumable three-step first-run flow now creates a dog, captures the owner's
immediate intent, and completes one real platform action: record a behavior
concern, log a progress check-in, or apply a starter training plan with a
personalized weekly suggestion. Setup state persists across reloads and tabs,
reconciles stale retries by owner-scoped setup ID, and hands owners into the
normal journal or weekly workspace without duplicating domain logic.

The API performs each first action and setup completion atomically, preserves
privacy-safe deletion tombstones and idempotent replays, serializes concurrent
submissions, and records scalar telemetry without owner prose or identifiers.
Safety signals suppress training exercises through the normal policy path.
Historical training replays remain idempotent without generating suggestion
audits, telemetry, or stale exercise previews, and starter-template choices are
enforced server-side.
The localized English/Spanish UI includes keyboard/focus/reduced-motion
coverage, active-dog deletion recovery, checklist suppression, and additional-
dog entry. Status reads are bounded to one active setup, one latest setup, and
one dog-existence row, backed by `dogs_owner_idx`.

Playwright covers the complete owner journey at Desktop Chrome and Pixel 7
viewports, plus a phone reload/resume training journey. Browser API traffic is
verified through isolated same-origin Vite proxy servers on ports 3310/3311.
- Spec/plan: `docs/superpowers/specs/2026-08-15-first-run-guided-setup-design.md`,
  `docs/superpowers/plans/2026-08-15-first-run-guided-setup.md`
- Commits: `d52d82b..34b25de` on `feat/first-run-guided-setup`.

## 2026-08-21 — Personalized training Gate 2 — contextual progress
Exact-context, current-level reliability is derived from recent practice evidence.
Owners can manually confirm current-level practice; one evidence-derived adjacent
next context is offered for the next attempt. This Week presents a decision-first
summary, while expanded skill detail shows the supporting evidence. There is no
universal completion score and no automatic advancement. Round-two hardening
coordinates one safety referral alert across weekly surfaces, keeps safety
headings semantically nested, and removes action-derived synthetic
`not_observed` rows while preserving observed evidence. Final safety-cache
hardening centralizes the three dog-scoped suggestion/focus/contextual-progress
prefix invalidations across safety-producing web mutations, awaits their
refetches, and conservatively suppresses stale recommendations during
`isFetching` revalidation or relevant query errors while preserving practice
logging. Awaited weekly session creation now re-checks the latest suggestion
eligibility and fails closed to manual capture when safety or another settled
cache-authority check fails. Skill detail preserves cached evidence while failing closed on
revalidation/error actions, and both new contextual routes reject malformed
UUIDs with privacy-safe `404` responses before database access.

Follow-up timing hardening makes that session and evidence decision
cache-authoritative: `DogWeek` reads the settled QueryClient suggestion/focus
state and data through stable keys instead of render-written fetch flags and
re-checks before evidence save. Round-three web hardening separates action
suppression from insight readiness: settled safety records one accurate weekly
view (`hasNextAction: false`) without exposing actions, while fetching/error
state defers view telemetry until it settles. The weekly suggestion shell is
busy only while fetching, uses neutral retry copy after a cached error, and
defers safety rendering to the page-level notice. An open audited capture stays
pending through a transient refetch and preserves its anchor after a same-safe
result; a settled safety decision, error, or changed suggestion downgrades to
manual capture, and evidence save remains fail-closed while cache authority is
unsettled.

Round-three API hardening moves the authoritative contextual-detail skill
snapshot under dog safety, then the existing skill advisory lock and a shared
skill-row lock, so level changes serialize with current-level evidence. Focus
now reads its weekly-focus/skill snapshot under the same dog safety transaction,
then the focus-week advisory lock and shared row locks; a focus replacement
committed while the request waits is reflected coherently. The evidence loader
remains one batched query and degrades only contextual summaries to unavailable.
View telemetry now accepts only `reliable`, `developing`, or `null` for
`strongestStatus`, matching the observable-evidence contract.

Final launch-minor hardening gives a successful evidence save explicit partial
feedback when client cache authority omits an originally audited suggestion
target; server anchor-rejection copy remains reserved for actual server
rejections. Training progress now coordinates one page-level referral alert
from expanded contextual details while retaining each detail's evidence and
controls. Telemetry documentation distinguishes weekly recommendation
intent/navigation from skill-detail application of a recommended context.
- Spec/plan: `docs/superpowers/specs/2026-08-19-contextual-progress-insights-design.md`,
  `docs/superpowers/plans/2026-08-20-contextual-progress-insights.md`
- Commits: `59c26a2..62d1569` on `feat/contextual-progress-insights`.
