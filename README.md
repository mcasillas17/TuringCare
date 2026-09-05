# TuringCare

TuringCare is a humane, force-free dog-training support platform for puppy owners and
people with newly adopted dogs. Owners keep a structured behavior journal and find
science-based trainers; the keystone artifact is an exportable **Behavior Brief** PDF
they can share with a trainer.

## Prerequisites

- Node 22 for local development, CI, and the API image (`.nvmrc` provided).
  See the [API monitoring runbook](docs/runbooks/api-monitoring.md) for the runtime
  support contract and pending production capture acceptance.
- pnpm 11 (`corepack enable` recommended)
- Docker (for local Postgres)

## Local setup

```bash
git clone https://github.com/mcasillas17/TuringCare.git
cd TuringCare
pnpm install --frozen-lockfile
test -e .env || cp .env.example .env
docker compose up -d --wait                # Postgres 18 on :5432 (waits for healthy)
# For synthetic no-provider email, set E2E_TEST_MODE=true in .env first (see below).
set -a && . ./.env && set +a               # export env for this shell
pnpm --filter @turingcare/api db:migrate   # apply committed migrations
pnpm dev                                   # api :3001, web :3000
```

> **Port 5432 already in use?** If you have a local Postgres (Postgres.app, Homebrew,
> another project) bound to 5432, `docker compose up -d` will fail. Change the host
> port mapping in `docker-compose.yml` (e.g. `"5433:5432"`) and update `DATABASE_URL`
> in `.env` to match.

> **Why `set -a && . ./.env && set +a`?** Neither drizzle-kit (`db:migrate`) nor the
> API server (`pnpm dev`) auto-loads `.env`. That line exports the variables into
> your shell so both pick them up. Run it once per shell session (or use a tool
> like `direnv` to automate it). Alternative one-offs:
> `DATABASE_URL=... pnpm --filter @turingcare/api db:migrate`.

Use an isolated local database and a development auth secret, never production credentials.
Do not overwrite an existing `.env` or remove shared database volumes.

### Signup and verified access

Open http://localhost:3000 and register. Registration opens `/verify-email` without an
authenticated session. Open the email link, press **Verify email**, then sign in. A new
owner can then continue to `/my/setup`; safe internal destinations are retained.

Opening a link alone does not verify ownership, so automated mail scanners cannot enable
an account. Verification never automatically signs in or switches accounts. Existing
unverified sessions use the same recovery screen and cannot access owner data, profile
mutations, trainer contacts or admin privileges. Public directories and finalized public
Brief links remain available.

To request another link without a session, enter the account's email and password. A
legacy session can request its own link without entering credentials. Server-side limits
and localized cooldowns apply; acceptance means the provider accepted the request, not
confirmed inbox delivery. Invalid/expired links and password recovery remain usable.
Password reset does not implicitly verify an account.

Duplicate registration intentionally has a privacy-neutral success response and may not
send another email. The original password still applies; use **Forgot password?** if
needed. If an address was mistyped, register with the correct address. Existing data is
not transferred or deleted by this flow; inaccessible legacy accounts require separately
authorized ownership recovery.

### Local email without a provider

For synthetic local accounts, set `E2E_TEST_MODE=true` in the local `.env` **before**
exporting it and starting the API. The test-only outbox then captures email instead of
contacting a provider. Its local endpoint is
`GET /api/test/emails/latest?to=<URL-encoded synthetic address>`; open the verification
link from that captured message and explicitly confirm it. Outbox responses contain
local authentication links: do not publish them or use real account data in this mode.
Keep this API local and unexposed. Production rejects test mode and independently disables
both capture and the outbox route.

When neither a provider key nor capture mode is configured, local signup does not deliver email; its
success response is not delivery evidence. Credential-proven resend returns
`verification_send_failed` (503), not a successful no-op.

Existing-account inventory, controlled admin/smoke preparation, API-first cutover and
forward-only recovery are documented in
[`DEPLOY.md`](DEPLOY.md#6a-verified-email-ownership-cutover), including the verification
state diagram. Production cutover evidence is still required.

## Architecture

- **apps/api** — Hono (`@hono/node-server`) on Node 22, with
  preloaded monitoring, Drizzle ORM and Better Auth
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
uses a valid `tc-locale` preference, an exact language hint carried by the verification
flow when no local preference exists, then browser language and English. After verified
authentication, a non-null account preference takes precedence; a null preference is
seeded from the resolved local choice. Unverified recovery does not query the protected
profile. A storage-denied continuation carries only a validated language hint, never
credentials or arbitrary redirect queries. Explicit switches remain usable locally if
account persistence fails. See [`docs/LOCALIZATION.md`](docs/LOCALIZATION.md) for the exact
precedence and failure behavior.

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
- **Public trainer + course directories** — trainer details are public, but email/phone
  require verified access and are always hidden in trainer lists. Course lists and
  details are public. Seeded with real Seattle-area trainers and Seattle Humane courses.
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

Use Node 22 and a migrated, disposable local Postgres database. The API image uses
the same supported runtime. The main repository gates are:

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
is built and boot-smoked in PR CI and the post-merge deployment gate.

API Vitest captures emails automatically without disabling verification. `createTestUser()`
follows a real captured link, explicitly confirms it and signs in;
`createUnverifiedTestUser()` and `createLegacySessionUser()` provide explicit negative
fixtures. CI uses PostgreSQL 16; local Compose uses PostgreSQL 18. Keep the verification
counter/retention tests compatible with both. Useful focused checks:

```bash
pnpm --filter @turingcare/api exec vitest run src/auth-verification.test.ts src/auth/verification-proof.test.ts
pnpm --filter @turingcare/web exec vitest run src/routes/verify-email.test.tsx src/lib/auth-refresh.test.tsx
```

On a busy development host, `pnpm test --maxWorkers=2` runs the same complete suite with
bounded concurrency; it does not skip tests.
CI and predeploy validation additionally run workspace suites sequentially so independent
test pools do not starve database/subprocess checks. The equivalent local command is
`pnpm -r --workspace-concurrency=1 test --maxWorkers=2`.

### API error monitoring

The API preserves `tsx` startup with `src/instrument.ts` preloaded. Monitoring is
network-free when unconfigured; configured capture is supported only on Node 22
with a full 40-character Git SHA release. The API generates fresh request IDs and
returns them in `X-Request-ID`; client-supplied IDs are never copied into monitoring.
The image gate uses the real SDK and an isolated local HTTPS sink to verify sanitized
request/startup/process events, flush failures, and exit behavior:

```bash
docker build --file Dockerfile.api --tag turingcare-api:t2 .
scripts/smoke-api-monitoring-image.sh turingcare-api:t2
```

No Sentry project, email provider, or database is needed for this monitoring check.
Operator-only diagnostics and the startup/capture diagram are in the
[API monitoring runbook](docs/runbooks/api-monitoring.md). Live capture from the approved
production release remains pending under [#98](https://github.com/mcasillas17/TuringCare/issues/98).

## Browser tests

Playwright covers the **critical owner journey** (register → explicitly verify → sign in →
add dog → log moments →
finalize and share a Behavior Brief) at two viewports: `desktop-chromium`
(Desktop Chrome) and `phone-chromium` (Pixel 7 / Chromium).

Tests run against the local dev servers with a local Postgres database and a
**test-only captured email outbox** (`E2E_TEST_MODE=true` on the API) so no real
email is sent and no external services are required.

The verification journeys also cover denied pre-verification access, legacy persisted
admins, fresh-browser Spanish continuation, password-reset non-bypass, real resend and
confirmation limits, stale receipt clearing, focus-preserved drafts, stalled status
recovery and token-free throttled email navigation.

### Run locally

```bash
# 1. Configure environment as described in Local setup above (preserve any existing .env,
#    start Docker Compose Postgres, export env vars).
pnpm --filter @turingcare/api db:migrate # migrate DB
pnpm exec playwright install chromium   # install the pinned runner's browser once
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
complete production monitoring, a measured backup/restore drill, in-app feedback and cohort
analytics.
Guided Today follows measurement readiness; final release-candidate QA then gates beta
recruitment. T1 implementation is ready, but authorized production cutover remains pending.

Account-security details remain in
[`docs/SECURITY-BACKLOG.md`](docs/SECURITY-BACKLOG.md).
