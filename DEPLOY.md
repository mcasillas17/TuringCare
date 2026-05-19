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
2. Dashboard **`Connect`** button (or Project Settings → Database →
   Connection string) → choose the **Session pooler**. Copy it. Format
   (username is `postgres.<project-ref>`, port **5432**):
   `postgresql://postgres.<project-ref>:<url-encoded-password>@aws-1-<region>.pooler.supabase.com:5432/postgres`
   - Use the **Session pooler (5432)**, not Transaction pooler (6543): both are
     IPv4 (the direct `db.<ref>.supabase.co` connection is IPv6-only and
     unreachable from GitHub Actions / Fly), but the Session pooler has no
     PgBouncer prepared-statement caveat for `drizzle-kit migrate`.
   - **URL-encode** the password if it contains `@ : / ? # [ ] %` (e.g.
     `@`→`%40`). Reset it at Settings → Database → Database password if unknown.
3. This single value is used as `DATABASE_URL` in **both** the GitHub Actions
   secret (for the `migrate` job) and the Fly secret (for the running API).
   It is **not** committed anywhere — secrets only.

No tables yet — the `migrate` job creates them from
`apps/api/drizzle/` on the first deploy.

---

## 2. Fly.io API app

### 2a. Create the app (no deploy yet)

From the repo root:

```bash
fly launch --no-deploy --name turingcare-api --config apps/api/fly.toml
```

- App name **`turingcare-api`** (must match `apps/api/fly.toml`'s `app`).
- Decline Postgres/Redis when prompted (we use Supabase).
- This generates `apps/api/fly.toml`.

### 2b. `fly.toml` + `Dockerfile.api` (already committed)

Both files are **already in the repo** (committed), so there's nothing to write
by hand — just confirm them:

- **`apps/api/fly.toml`** — `fly launch` generated it with the wrong region
  (`lax`) and port (`8080`) and no build section. It has been corrected to
  `primary_region = 'iad'`, `internal_port = 3001`, `[env] PORT = '3001'`, and
  `[build] dockerfile = '../../Dockerfile.api'`. **Change `primary_region` if
  you want a different region.**
- **`Dockerfile.api`** (repo root, build context = repo root) — runs the API
  with **`tsx`**, not `tsc` + `node dist`. This is deliberate and required: the
  project uses `moduleResolution: "Bundler"` (extensionless relative imports)
  and `@turingcare/shared` is consumed as TypeScript source — Node's native ESM
  loader can run neither, so `node dist/index.js` crashes with
  `ERR_MODULE_NOT_FOUND`. `tsx` transpiles + resolves both, exactly like local
  dev. Verified: the image builds, boots, and serves `/health` + register +
  `/me` against Postgres.

`flyctl deploy --remote-only` builds the image on Fly's builders from
`Dockerfile.api`; `internal_port` (3001) matches the `PORT` the app binds via
`@hono/node-server` on `0.0.0.0`.

> If you ever want a leaner `node dist` image instead of `tsx`, that's a real
> change: switch the API tsconfig to `NodeNext`, add `.js` extensions to all
> relative imports, and add a build step to `@turingcare/shared` (emit JS +
> types, point its `exports` at `dist`). Out of scope for this deploy setup.

### 2c. Set Fly secrets

```bash
fly secrets set --app turingcare-api \
  DATABASE_URL='postgresql://postgres.<ref>:<url-encoded-pw>@aws-1-<region>.pooler.supabase.com:5432/postgres' \
  BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  BETTER_AUTH_URL='https://api.turingcare.dog' \
  FRONTEND_URL='https://turingcare.dog' \
  COOKIE_DOMAIN='.turingcare.dog' \
  RESEND_API_KEY='re_...' \
  EMAIL_FROM='TuringCare <noreply@send.turingcare.dog>'
```

**Fly secrets required:**

| Secret | Value |
|---|---|
| `DATABASE_URL` | Supabase Session-pooler URL |
| `BETTER_AUTH_SECRET` | 32+ random chars (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | `https://api.turingcare.dog` |
| `FRONTEND_URL` | `https://turingcare.dog` |
| `COOKIE_DOMAIN` | `.turingcare.dog` |
| `RESEND_API_KEY` | Resend API key (domain `send.turingcare.dog` verified) |
| `EMAIL_FROM` | `TuringCare <noreply@send.turingcare.dog>` |

> `COOKIE_DOMAIN` was added during the deploy audit. The frontend and API are
> different subdomains, so without it Better Auth's default `SameSite=Lax`
> cookie is **not** sent on cross-site requests and login won't persist.
> Setting it makes Better Auth issue cross-subdomain `SameSite=None; Secure`
> cookies. Leave it **unset** locally.

### Transactional email (Resend) — one-time setup

Until these are done, production runs email in **log-only mode** (no crash, no
mail). Deploy is not blocked by DNS propagation.

1. Create a Resend account; create an API key.
2. In Resend, add domain `send.turingcare.dog`. Add the generated **SPF**,
   **DKIM**, and a **DMARC** record to Cloudflare DNS for `turingcare.dog`
   (Resend's dashboard shows the exact record names/hostnames to enter).
   Wait until Resend shows the domain **Verified**.
3. Set the Fly secrets:
   ```bash
   # (skip if you already set these in §2c)
   fly secrets set --app turingcare-api \
     RESEND_API_KEY='re_...' \
     EMAIL_FROM='TuringCare <noreply@send.turingcare.dog>'
   ```
4. Verify: trigger `/api/auth/request-password-reset` for a test account and
   confirm delivery (check Resend dashboard logs).

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
| `DATABASE_URL` | Supabase Session-pooler URL (used by the `migrate` job) |
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
| Fly (`turingcare-api`) | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `FRONTEND_URL`, `COOKIE_DOMAIN`, `RESEND_API_KEY`, `EMAIL_FROM` |

| Name | Must equal |
|---|---|
| Fly app | `turingcare-api` (in `apps/api/fly.toml`) |
| Pages project | `turingcare-web` (in `deploy.yml`) |
| API domain | `api.turingcare.dog` |
| Frontend domains | `turingcare.dog`, `www.turingcare.dog` |
