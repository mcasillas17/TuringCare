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
