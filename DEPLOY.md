# Deploying TuringCare

End-to-end deploy on every push to `main`:

```
push main → ci → migrate ─→ deploy-api (Fly,  api.turingcare.dog)
                └─────────→ deploy-web (Pages, turingcare.dog + www)
```

- **Frontend** → Cloudflare Pages (`turingcare.dog`, `www.turingcare.dog`)
- **Backend** → Fly.io (`api.turingcare.dog`)
- **Database** → Supabase Postgres

`deploy-web` runs in parallel with `migrate`/`deploy-api` (independent). The API
never deploys until production migrations succeed.

> Nothing here is automated by the repo. Do every step below **once**, by hand,
> before the first push to `main`. The workflows (`.github/workflows/ci.yml`,
> `deploy.yml`) only run after the secrets and platform projects exist.

---

## 0. Prerequisites

- `flyctl` installed and logged in (`fly auth login`)
- A Cloudflare account with the `turingcare.dog` zone added
- A Supabase project
- `gh` CLI (optional, for setting GitHub secrets from the terminal)

The API package is `@turingcare/api` (pnpm filter name used everywhere below —
**not** `api`).

---

## 1. Database (Supabase)

1. Create/open the Supabase project.
2. **Project Settings → Database → Connection string → Transaction pooler.**
   Copy it. Format:
   `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`
3. This single value is used as `DATABASE_URL` in **both** the GitHub Actions
   secret (for the `migrate` job) and the Fly secret (for the running API).

No tables yet — the `migrate` job creates them from
`apps/api/drizzle/` on the first deploy.

---

## 2. Fly.io API app

### 2a. Create the app (no deploy yet)

From the repo root:

```bash
fly launch --no-deploy --name turingcare-api --config apps/api/fly.toml
```

- App name **`turingcare-api`** (must match `--config apps/api/fly.toml`'s `app`).
- Decline Postgres/Redis when prompted (we use Supabase).
- This generates `apps/api/fly.toml` (and possibly a `Dockerfile`).

### 2b. Commit `fly.toml` and a working `Dockerfile`

`flyctl deploy --remote-only` builds on Fly's builders but still needs a
**Dockerfile that builds the pnpm workspace**. `fly launch`'s autodetected
Dockerfile usually does **not** handle a pnpm monorepo. Use these:

`apps/api/fly.toml`:

```toml
app = "turingcare-api"
primary_region = "iad"   # pick your region

[build]
  dockerfile = "../../Dockerfile.api"   # path relative to apps/api/

[http_service]
  internal_port = 3001                  # must match the app's PORT
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  size = "shared-cpu-1x"
```

`Dockerfile.api` (repo root — build context is the repo root):

```dockerfile
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @turingcare/api build

FROM base AS deploy
ENV NODE_ENV=production
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/apps/api/dist apps/api/dist
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
```

`git add apps/api/fly.toml Dockerfile.api && git commit`. Both must be on
`main` before the first deploy or `deploy-api` fails.

> The app reads `PORT` (default `3001`) and binds `0.0.0.0` via
> `@hono/node-server`. Keep `internal_port` equal to `PORT`.

### 2c. Set Fly secrets

```bash
fly secrets set --app turingcare-api \
  DATABASE_URL='postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres' \
  BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  BETTER_AUTH_URL='https://api.turingcare.dog' \
  FRONTEND_URL='https://turingcare.dog' \
  COOKIE_DOMAIN='.turingcare.dog'
```

**Fly secrets required:**

| Secret | Value |
|---|---|
| `DATABASE_URL` | Supabase Transaction-pooler URL |
| `BETTER_AUTH_SECRET` | 32+ random chars (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | `https://api.turingcare.dog` |
| `FRONTEND_URL` | `https://turingcare.dog` |
| `COOKIE_DOMAIN` | `.turingcare.dog` |

> `COOKIE_DOMAIN` was added during the deploy audit. The frontend and API are
> different subdomains, so without it Better Auth's default `SameSite=Lax`
> cookie is **not** sent on cross-site requests and login won't persist.
> Setting it makes Better Auth issue cross-subdomain `SameSite=None; Secure`
> cookies. Leave it **unset** locally.

---

## 3. Cloudflare Pages project

Create the project **empty** (the workflow uploads builds; do not connect a Git
repo in the dashboard):

```bash
# Wrangler (npx wrangler), or Dashboard → Workers & Pages → Create → Pages →
# "Direct Upload". Project name MUST be exactly:
npx wrangler pages project create turingcare-web --production-branch main
```

Project name **`turingcare-web`** must match `--project-name` in `deploy.yml`.

---

## 4. Tokens

- **Fly:** `fly tokens create deploy -a turingcare-api` → `FLY_API_TOKEN`.
- **Cloudflare API token:** Dashboard → My Profile → API Tokens → Create →
  permission **Account › Cloudflare Pages › Edit** → `CLOUDFLARE_API_TOKEN`.
- **Cloudflare Account ID:** Dashboard → any domain → right sidebar →
  `CLOUDFLARE_ACCOUNT_ID`.

---

## 5. GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions → New repository secret.

**GitHub Actions secrets required:**

| Secret | Value |
|---|---|
| `DATABASE_URL` | Supabase Transaction-pooler URL (used by the `migrate` job) |
| `FLY_API_TOKEN` | from `fly tokens create deploy` |
| `CLOUDFLARE_API_TOKEN` | Pages-edit token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

CLI:

```bash
gh secret set DATABASE_URL
gh secret set FLY_API_TOKEN
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
```

---

## 6. First deploy

Push to `main`. `ci` → `migrate` → `deploy-api`, and `deploy-web` in parallel.
On success: API at the Fly app's `*.fly.dev`, frontend at the Pages
`*.pages.dev`. Attach the real domains next.

---

## 7. Custom domains (after the first successful deploy)

### API → `api.turingcare.dog` (Fly)

```bash
fly certs add api.turingcare.dog --app turingcare-api
```

In Cloudflare DNS for `turingcare.dog`:

- `CNAME  api  turingcare-api.fly.dev`  — **proxy status: DNS only (grey
  cloud)**. Fly terminates TLS; the orange cloud would break cert issuance.

Wait for `fly certs show api.turingcare.dog` to report the cert as issued.

### Frontend → `turingcare.dog` + `www` (Pages)

Cloudflare Pages → `turingcare-web` → **Custom domains** → add:

- `turingcare.dog`
- `www.turingcare.dog`

Pages manages these DNS records automatically (apex + `www`, proxied/orange is
fine for Pages).

Verify end-to-end: open `https://turingcare.dog`, register, confirm you land on
`/app` (session cookie set on `.turingcare.dog`, accepted cross-subdomain by
`api.turingcare.dog`).

---

## 8. Rollback

### API (Fly)

```bash
fly releases --app turingcare-api          # list versions (vN) + image refs
fly deploy --app turingcare-api --image <previous-image-ref> --config apps/api/fly.toml
```

Or Fly Dashboard → `turingcare-api` → **Monitoring → Releases →** select a
previous release → **Rollback**. (Schema rollbacks are separate: write a new
down migration; don't roll the API back past a schema change without it.)

### Frontend (Cloudflare Pages)

Dashboard → Workers & Pages → `turingcare-web` → **Deployments** → pick the last
known-good deployment → **⋯ → Rollback to this deployment**. Instant; no rebuild.

---

## Quick reference

| Where | Secrets |
|---|---|
| GitHub Actions | `DATABASE_URL`, `FLY_API_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| Fly (`turingcare-api`) | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `FRONTEND_URL`, `COOKIE_DOMAIN` |

| Name | Must equal |
|---|---|
| Fly app | `turingcare-api` (in `apps/api/fly.toml`) |
| Pages project | `turingcare-web` (in `deploy.yml`) |
| API domain | `api.turingcare.dog` |
| Frontend domains | `turingcare.dog`, `www.turingcare.dog` |
