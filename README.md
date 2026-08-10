# TuringCare

TuringCare is a humane, force-free dog-training support platform for puppy owners and
people with newly adopted dogs. Owners keep a structured behavior journal and find
science-based trainers; the keystone artifact is an exportable **Behavior Brief** PDF
they can share with a trainer.

## Prerequisites

- Node 22 (`.nvmrc` provided; the repo also runs on Node 24)
- pnpm 11 (`corepack enable` recommended)
- Docker (for local Postgres)

## Local setup

```bash
git clone https://github.com/mcasillas17/TuringCare.git
cd TuringCare
pnpm install
cp .env.example .env
docker compose up -d --wait                # Postgres 16 on :5432 (waits for healthy)
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

Open http://localhost:3000, register an account, and you land on `/app`.

## Architecture

- **apps/api** — Hono on Node 22 (`@hono/node-server`), Drizzle ORM, Better Auth
  (email/password, Postgres sessions, httpOnly cookies). Exports `AppType` for
  end-to-end-typed RPC.
- **apps/web** — Vite + React 19, Tailwind v4 (CSS-first), shadcn/ui, TanStack Query,
  React Router v7. Talks to the API same-origin via a Vite dev proxy so auth cookies
  stay first-party. Uses `hc<AppType>` for typed API calls.
- **packages/shared** — Zod schemas shared by both apps.
- **Postgres** — Docker Compose locally, Supabase in production. Deploy: see `DEPLOY.md`.

## Directory layout

```text
apps/api      Hono backend
apps/web      Vite + React frontend
packages/shared  Shared Zod schemas / types
docker-compose.yml  Local Postgres
```

## What's built

Full chronological log in [`docs/PROJECT-LOG.md`](docs/PROJECT-LOG.md). Highlights:

- **Owner-scoped dog profiles** organized as a hub-and-spoke experience: a thin
  Overview hub (`/my/dogs/:id`) with at-a-glance metrics + concerns, and focused
  Journal / Training / Brief spokes under a shared layout (sticky banner + tabs).
  Training covers goals, skills (collapsed per-skill detail), and per-skill
  practice sessions.
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
- **i18n** — typed en/es catalogs with compile-time parity.
- **Telemetry + admin dashboard** with rate-limited event ingestion.

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
pnpm --filter @turingcare/api db:push   # migrate DB
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

## What's next

- Dog profile photos (storage + upload + thumbnail on cards/brief).
- Production smoke + mobile QA on `turingcare.dog` before the first round of
  real-user testing.
- Security backlog (password reset is shipped; email verification, 2FA, etc.) —
  see [`docs/SECURITY-BACKLOG.md`](docs/SECURITY-BACKLOG.md).
