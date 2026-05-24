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
