# TuringCare

TuringCare is a humane, force-free dog-training support platform for puppy owners and
people with newly adopted dogs. Owners keep a structured behavior journal and find
science-based trainers; the keystone artifact is an exportable **Behavior Brief** PDF
they can share with a trainer.

## Prerequisites

- Node 22 for local development and CI (`.nvmrc` provided). The deployed API
  image currently uses Node 26; [`docs/ROADMAP.md`](docs/ROADMAP.md) tracks the
  production-monitoring runtime mismatch this creates.
- pnpm 11 (`corepack enable` recommended)
- Docker (for local Postgres)

## Local setup

```bash
git clone https://github.com/mcasillas17/TuringCare.git
cd TuringCare
pnpm install
cp .env.example .env
docker compose up -d --wait                # Postgres 18 on :5432 (waits for healthy)
set -a && . ./.env && set +a               # export env for this shell
pnpm --filter @turingcare/api db:push      # apply the schema
pnpm dev                                   # api :3001, web :3000
```

> **Port 5432 already in use?** If you have a local Postgres (Postgres.app, Homebrew,
> another project) bound to 5432, `docker compose up -d` will fail. Change the host
> port mapping in `docker-compose.yml` (e.g. `"5433:5432"`) and update `DATABASE_URL`
> in `.env` to match.

> **Why `set -a && . ./.env && set +a`?** Neither drizzle-kit (`db:push`) nor the
> API server (`pnpm dev`) auto-loads `.env`. That line exports the variables into
> your shell so both pick them up. Run it once per shell session (or use a tool
> like `direnv` to automate it). Alternative one-offs:
> `DATABASE_URL=... pnpm --filter @turingcare/api db:push`.

Open http://localhost:3000, register an account, and you land on `/my/setup`.

## Architecture

- **apps/api** — Hono (`@hono/node-server`) on Node 22 locally/in CI and
  currently Node 26 in the production image, with Drizzle ORM and Better Auth
  (email/password, Postgres sessions, httpOnly cookies). Exports `AppType` for
  end-to-end-typed RPC.
- **apps/web** — Vite + React 19, Tailwind v4 (CSS-first), shadcn/ui, TanStack Query,
  React Router v7. Talks to the API same-origin via a Vite dev proxy so auth cookies
  stay first-party. Uses `hc<AppType>` for typed API calls and `react-i18next` for
  reactive English/Spanish rendering.
- **packages/i18n** — Framework-neutral i18next runtime, exact `en`/`es` allowlist,
  typed catalogs, browser-locale resolution, server translators, and locale-safe date
  helpers shared by the web app and API.
- **packages/shared** — Zod schemas shared by both apps.
- **Postgres** — Docker Compose locally, Supabase in production. Deploy: see `DEPLOY.md`.

## Directory layout

```text
apps/api      Hono backend
apps/web      Vite + React frontend
packages/i18n  Shared en/es catalogs and i18next runtime
packages/shared  Shared Zod schemas / types
docker-compose.yml  Local Postgres
```

## Localization

TuringCare supports exactly English (`en`) and Spanish (`es`). On first load the web app
uses a valid `tc-locale` browser preference, then the first supported value in
`navigator.languages` / `navigator.language`, and finally English. After authentication,
a non-null account preference takes precedence over that local result; a new account with
no preference is seeded from the already-resolved browser choice. Explicit language
changes remain usable locally if account persistence fails.

The web and Better Auth clients send the active locale as `X-TuringCare-Locale`. The API
accepts only `en` or `es`, falls back to a supported weighted `Accept-Language` value and
then English, and returns `Content-Language`. The shared catalogs drive the regular app,
admin and accessibility copy, curated training templates, auth email chrome, and generated
artifacts.

Catalog tests enforce exact key and interpolation-placeholder parity. A TypeScript AST audit
also rejects uncatalogued production TypeScript UI copy, hardcoded accessibility/toast copy,
including Sonner option aliases, spreads, shorthand properties, and callback methods, plus
direct `toLocale*` calls and local date formatters. Unresolved imported or dynamically
produced toast options fail closed. Shared date helpers require an explicit supported locale
and safely reject malformed dates.

Every Behavior Brief stores its generation locale. Its prose, dates, status/enum labels,
owned and public views, email, and PDF therefore stay in that language even if the owner or
viewer later changes UI language. Course/trainer records and user-authored journal, message,
name, and contact fields are authored data and are never machine-translated.

Brief email delivery is durable and retry-safe. New clients bind each request to an exact
Brief version and idempotency key. During the web rollout, the API also accepts the former
`{ recipient, message }` payload only when one exact Brief can be established; an ambiguous
old tab is asked to refresh without sending. Pending sends can be retried with the same
provider idempotency key, and dog/account deletion pauses with a localized recovery link
while delivery state is unresolved. Production refuses to start without its Resend key, so
provider-free fallback can never be recorded as a successful delivery.

This end-to-end localization work was implemented for
[PR #70](https://github.com/mcasillas17/TuringCare/pull/70). See
[`docs/LOCALIZATION.md`](docs/LOCALIZATION.md) for the current precedence and request
contracts, content boundaries, failure/privacy behavior, and instructions for adding copy.

## What's built

Full chronological log in [`docs/PROJECT-LOG.md`](docs/PROJECT-LOG.md). Highlights:

- **Owner-scoped dog profiles** organized as a shared dog workspace:
  `/my/dogs/:id` opens the journal and provides focused Journal / Training /
  Brief / This Week tabs under a shared layout. Training covers goals, skills
  (collapsed per-skill detail), and per-skill practice sessions.
- **Behavior journal** — quick-capture moments (note + optional 1-5 intensity
  slider) and daily check-ins (note + better/same/harder trend). Structured ABC
  fields stay as optional enrichment.
- **Behavior Brief** — deterministic text + PDF (`@react-pdf/renderer`), windowed
  by 7/30/90 days or all-time, includes a daily-check-in trend tally. Email a
  finalized brief to any recipient; create a public share link.
- **Public trainer + course directories** with scrape protection (list strips
  contact info; detail requires auth). Seeded with real Seattle-area trainers
  and Seattle Humane courses.
- **Onboarding checklist** on `/my` — 5-step path (add dog → log 3 moments →
  set a goal → finalize a brief → share with a trainer), live-computed.
- **Curated training curriculum** — opt-in templates that pre-populate a goal
  with skills, each with 5 progressive milestone definitions surfaced in the
  progress panel.
- **Weekly skill focus** — a per-dog **This Week** tab: pick the skills to work
  on this week and see a Mon–Sun grid of which days you practiced each one, with
  tap-to-log. Page back through prior weeks; the grid is computed from your dated
  practice sessions.
- **Weekly personalized suggestions** — one primary exercise and an easier
  fallback are based on the focused skill and structured practice evidence;
  safety signals pause exercises and refer owners to appropriate support.
- **i18n** — shared i18next-backed en/es catalogs with compile-time/runtime parity,
  browser detection, account sync, request propagation, localized training content,
  locale-stable artifacts, placeholder parity, and AST copy/date guardrails.
- **Telemetry + admin dashboard** with rate-limited event ingestion.

## Developer verification

Use Node 22 (the local and CI runtime) and a migrated local Postgres database. The
production image currently runs Node 26; the roadmap tracks reconciliation with
the monitoring support contract. The main repository gates are:

```bash
nvm use
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Focused localization coverage can be inspected without adding repository artifacts:

```bash
pnpm --filter @turingcare/i18n exec vitest run --coverage \
  --coverage.reporter=text --coverage.reportsDirectory=/tmp/turingcare-i18n-coverage
pnpm --filter @turingcare/api exec vitest run --coverage \
  --coverage.reporter=text --coverage.reportsDirectory=/tmp/turingcare-api-coverage
pnpm --filter @turingcare/web exec vitest run --coverage \
  --coverage.reporter=text --coverage.reportsDirectory=/tmp/turingcare-web-coverage
```

API tests use the real local Postgres database through the root `.env`; apply migrations
first. The production API image also includes `packages/i18n` as a workspace dependency and
is built and boot-smoked in CI.

## Browser tests

Playwright covers the **critical owner journey** (register → add dog → log moments →
finalize a Behavior Brief → email and share it) at two viewports: `desktop-chromium`
(Desktop Chrome) and `phone-chromium` (Pixel 7 / Chromium).

Tests run against the local dev servers with a local Postgres database and a
**test-only captured email outbox** (`E2E_TEST_MODE=true` on the API) so no real
email is sent and no external services are required.

### Run locally

```bash
# 1. Configure environment as described in Local setup above (copy .env.example → .env,
#    start Docker Compose Postgres, export env vars).
pnpm --filter @turingcare/api db:migrate # migrate DB
pnpm dlx playwright install chromium    # install Chromium once
pnpm test:e2e                           # run all projects (desktop + phone)
```

Run a single project:

```bash
pnpm test:e2e --project desktop-chromium
```

### Production smoke

`pnpm test:e2e:production` runs the read-only smoke suite against
`https://turingcare.dog`. It is **read-only** — no data is written.

GitHub Actions runs this automatically after each deploy, on a daily schedule
(`cron: '17 15 * * *'`), and on manual `workflow_dispatch`. The workflow
requires two **repository secrets** for a dedicated, verified non-admin smoke
account:

| Secret | Purpose |
|---|---|
| `SMOKE_EMAIL` | Email of the smoke account |
| `SMOKE_PASSWORD` | Password of the smoke account |

Do not commit credentials; configure them in **Settings → Secrets and
variables → Actions**.

## Roadmap

The canonical delivery order and current public-beta status live in
[`docs/ROADMAP.md`](docs/ROADMAP.md). The immediate gates are enforced email ownership,
complete production monitoring, a measured backup/restore drill, in-app feedback, cohort
analytics, and release-candidate QA before Guided Today and beta recruitment.

Account-security details remain in
[`docs/SECURITY-BACKLOG.md`](docs/SECURITY-BACKLOG.md).
