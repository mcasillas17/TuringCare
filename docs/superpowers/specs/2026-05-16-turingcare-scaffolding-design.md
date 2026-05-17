# TuringCare — Session 1: Scaffolding, Data Model & Auth

**Date:** 2026-05-16
**Status:** Approved design — ready for implementation plan
**Scope:** Monorepo scaffolding + full data model + working end-to-end email/password auth. Nothing more.

## Project Context

TuringCare is a humane, force-free dog-training support platform for puppy owners and people
with newly adopted dogs. The MVP helps owners keep a structured behavior journal and find
science-based trainers. The keystone artifact is the **Behavior Brief** — an exportable PDF
summary owners share with trainers (built in a later session).

This is session 1 of several. The repo (`github.com/mcasillas17/TuringCare`) is an empty git
repo with `origin` set and no commits.

## Locked Stack (no substitutions)

- **Package manager:** pnpm 11 with workspaces
- **Frontend:** Vite + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui + TanStack Query + React Router v7
- **Backend:** Hono on Node 22 (`@hono/node-server`) + Drizzle ORM + Zod + Better Auth
- **Database:** Postgres 16 (prod: Neon; local dev: Docker Compose)
- **PDF:** `@react-pdf/renderer` — installed as a dependency, **not used** this session
- **Lint/format:** Biome
- **Testing:** Vitest

## Resolved Decisions

| Topic | Decision |
|---|---|
| Local DB / verification | Docker Compose Postgres 16. Docker verified present (29.4.3, Compose v5.1.3, daemon up). Full end-to-end verification runs this session. |
| Node runtime | `engines: ">=22"`, `.nvmrc` = `22`. Code targets Node 22 APIs; runs on the installed Node 24 (superset). |
| Better Auth tables | Better Auth Drizzle adapter defaults: singular `user`, `session`, `account`, `verification`. `dogs.owner_id` FK → `user.id`. |
| Dev cookie strategy | Vite dev proxy: web calls same-origin `/api/*`, Vite proxies to `:3001`. Auth cookies stay first-party (`SameSite=Lax`, httpOnly). CORS still configured for production. Hono RPC client uses a relative base URL. |

## Architecture

### Monorepo Layout

```
/
  apps/
    api/        # @turingcare/api — Hono backend, port 3001
    web/        # @turingcare/web — Vite + React, dev port 3000
  packages/
    shared/     # @turingcare/shared — Zod schemas + inferred TS types
  docker-compose.yml
  .env.example
  README.md
  .gitignore
  pnpm-workspace.yaml
  package.json        # root scripts
  biome.json          # root Biome config
  tsconfig.base.json  # shared compiler options
```

Workspace packages: `@turingcare/api`, `@turingcare/web`, `@turingcare/shared`.

Root `package.json` scripts:
- `dev` — `concurrently` runs `api` and `web` in parallel
- `build` — builds all workspaces
- `lint` / `format` — Biome across the repo
- `typecheck` — `tsc --noEmit` across workspaces
- `db:generate` / `db:migrate` / `db:push` — delegate to `@turingcare/api`

### `packages/shared`

Single source of truth for cross-cutting validation. Exports:
- `dogProfileSchema` — Zod schema derived from the `dogs` data model, with enums
  (`size`, `sex`, `source`, `vaccine_stage`) that exactly match the DB enums. Includes the
  inferred `DogProfile` type.
- `registerSchema`, `loginSchema` — consumed by both the API request validators and the web
  forms so client and server validate identically.

Built as a types+runtime package consumed via `workspace:*`. No DB or framework imports.

### `apps/api` — Hono backend (port 3001)

- **Entry `src/index.ts`:** constructs the Hono app with **method-chained route
  definitions** so types flow into the RPC client, and `export type AppType = typeof app`.
  Started via `@hono/node-server` on `PORT` (default 3001).
- **Routes:**
  - `GET /health` → `{ status: 'ok' }`
  - `GET /me` → reads the Better Auth session from the request; returns the authenticated
    user, or HTTP 401 `{ error: 'unauthorized' }` when no valid session.
  - `ALL /api/auth/*` → delegated to Better Auth's handler (`auth.handler(c.req.raw)`).
- **CORS:** `hono/cors`, `origin` from `WEB_ORIGIN` env, `credentials: true`. (Dev traffic
  is same-origin via the Vite proxy; CORS matters for prod and is configured regardless.)
- **Validation:** `@hono/zod-validator` using schemas from `@turingcare/shared` where the
  session needs request-body validation.
- **Better Auth:** `src/auth.ts` — email/password enabled, Drizzle adapter (Postgres),
  sessions persisted in Postgres, httpOnly cookies, `trustedOrigins` includes `WEB_ORIGIN`.
- **Drizzle:**
  - `src/db/schema.ts` — Better Auth tables + domain tables + `relations()`
  - `src/db/index.ts` — `pg` pool + `drizzle()` client from `DATABASE_URL`
  - `drizzle.config.ts` — drizzle-kit config (schema path, dialect `postgresql`, `DATABASE_URL`)
  - scripts: `db:generate`, `db:migrate`, `db:push`

### `apps/web` — Vite + React 19 (dev port 3000)

- **Tailwind v4:** `@tailwindcss/vite` plugin; CSS-first config — `@import "tailwindcss";`
  in `src/index.css`. No `tailwind.config.js`.
- **shadcn/ui:** initialized; starter components only — Button, Input, Label, Card, Form, Sonner.
- **Routing (React Router v7):** `/` (landing), `/login`, `/register`,
  `/app` (guarded — redirects to `/login` when the Better Auth session is absent).
- **Data:** `QueryClientProvider` at the root (TanStack Query).
- **Typed API client:** `hc<AppType>` where
  `import type { AppType } from '@turingcare/api'` — type-only import, erased at build, so
  no backend code is bundled. Base URL is relative (`/`) so the Vite dev proxy handles it.
- **Vite dev proxy:** `/api` → `http://localhost:3001`, keeping auth cookies first-party.
- **Better Auth client:** `createAuthClient` (better-auth/react) with a relative base URL;
  provides register/login/logout/session.
- **Auth flow:** functional register, login, and logout on the placeholder pages — enough
  to verify end-to-end auth. No styling beyond shadcn defaults.

### Database Schema (`apps/api/src/db/schema.ts`)

Better Auth-managed (adapter defaults, not hand-redefined beyond what the adapter needs):
`user`, `session`, `account`, `verification`.

Domain tables (all UUID PKs via `gen_random_uuid()`, snake_case columns):

- **`dogs`** — `id`, `owner_id` FK → `user.id`, `name`, `breed?`, `date_of_birth?`,
  `size` enum(small/medium/large/giant), `weight_lbs?` numeric, `sex` enum(male/female),
  `spayed_neutered` bool default false, `source` enum(breeder/rescue/shelter/other),
  `adopted_at?` date, `vaccine_stage` enum(in_progress/complete/unknown), `notes?`,
  `created_at` timestamptz, `updated_at` timestamptz.
- **`behavior_concerns`** — `id`, `dog_id` FK → `dogs` (cascade delete), `concern`,
  `severity` enum(mild/moderate/severe), `created_at`.
- **`training_goals`** — `id`, `dog_id` FK → `dogs` (cascade delete), `goal`, `created_at`.
- **`journal_entries`** — `id`, `dog_id` FK → `dogs` (cascade delete), `occurred_at` tstz,
  `antecedent`, `behavior`, `consequence`, `intensity` int **CHECK between 1 and 5**,
  `duration_seconds?` int, `recovery_seconds?` int, `location?`, `people_present?`,
  `owner_response?`, `notes?`, `created_at`.
- **`briefs`** — `id`, `dog_id` FK → `dogs` (cascade delete), `generated_at` tstz,
  `status` enum(draft/finalized), `summary`, `version` int.
- **`trainers`** — `id`, `name`, `business_name?`, `city`, `state`,
  `methodology_tags` text[], `certifications` text[], `specialties` text[], `website?`,
  `email?`, `phone?`, `notes_internal?`, `created_at`, `updated_at`.

`relations()` defined: `user`→`dogs`, `dogs`→(`user`, `behavior_concerns`,
`training_goals`, `journal_entries`, `briefs`) so the relational query API is usable later.

### Local Infrastructure

- **`docker-compose.yml`:** Postgres 16, db name `turingcare`, named persistent volume,
  healthcheck (`pg_isready`), port 5432 mapped.
- **`.env.example`:** every required var with sensible local defaults + comments —
  `DATABASE_URL`, `PORT` (3001), `WEB_ORIGIN` (http://localhost:3000),
  `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and any web-side var needed by Vite.

### Documentation & Hygiene

- **`README.md`:** one-paragraph description; prerequisites (Node 22, pnpm, Docker);
  setup steps (clone → `pnpm install` → `cp .env.example .env` → `docker compose up -d` →
  `pnpm --filter api db:push` → `pnpm dev`); architecture overview; directory layout;
  "What's next" (dog profile, ABC journal, brief generation, trainer directory).
- **`.gitignore`:** Node, Vite, env files, build outputs, IDE, OS junk.

## Out of Scope (this session)

No Sentry/analytics/email/OAuth/rate-limiting. No journal CRUD endpoints, trainer directory
pages, or PDF generation — those domains are **schema-only**. `@react-pdf/renderer` is
installed but unused. Only auth-verifying endpoints (`/health`, `/me`, `/api/auth/*`).

## Error Handling

- `/me` returns 401 JSON when unauthenticated (no throw/stack leak).
- Better Auth surfaces its own validation/auth errors via its handler.
- CORS misconfig fails closed (origin not in allowlist → blocked).
- Zod validation failures return 400 with field errors via `@hono/zod-validator`.

## Verification (must pass before "done")

1. `docker compose up -d` — Postgres healthy.
2. `pnpm --filter api db:push` — schema applied with no errors.
3. `pnpm dev` — both apps boot, no errors.
4. `GET http://localhost:3001/health` → `{ status: 'ok' }`.
5. React app loads at `http://localhost:3000`.
6. Register a test account → log in → `GET /me` returns the user; logout clears session.
7. `pnpm typecheck` and `pnpm lint` pass.

Any failure is fixed before declaring done.

## Workflow

Atomic git commits with clear messages per logical unit (scaffold, infra, api, schema,
auth, web, docs). Final summary covers: (a) what was built, (b) decisions to review,
(c) exact fresh-clone commands, (d) expected output at each verified step.

## Flagged Choices (reasonable defaults; review)

- Workspace package names `@turingcare/*`.
- App tables plural/snake_case; Better Auth tables singular (adapter default).
- RPC client + Better Auth client use relative base URLs behind the Vite proxy.
- Dependency versions pinned to current latest (late 2025 / early 2026) at implementation time.
- `weight_lbs` as Drizzle `numeric` (string in TS) to preserve precision.
