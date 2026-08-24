# TuringCare repository instructions

## Build, test, and lint

- Use Node 22 and pnpm 11 (`corepack enable`; the pinned version is in `package.json`). Install with `pnpm install --frozen-lockfile`.
- Local API work needs Postgres and exported root environment variables:

```bash
cp .env.example .env
docker compose up -d --wait
set -a && . ./.env && set +a
pnpm --filter @turingcare/api db:push
```

The API and Drizzle do not auto-load `.env`. API tests use the root `.env` through `apps/api/vitest.setup.ts` and exercise a real Postgres database.
- Run both apps with `pnpm dev` (web `:3000`, API `:3001`). The standard repository checks are:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

CI additionally runs `pnpm --filter @turingcare/api db:migrate` before tests.
- Scope a command with a workspace filter, for example `pnpm --filter @turingcare/web test` or `pnpm --filter @turingcare/api typecheck`.
- Run one Vitest file with:

```bash
pnpm --filter @turingcare/web exec vitest run src/lib/week.test.ts
pnpm --filter @turingcare/api exec vitest run src/routes/dogs.test.ts
pnpm --filter @turingcare/i18n exec vitest run src/index.test.ts
pnpm --filter @turingcare/shared exec vitest run src/dog.test.ts
```

Add `-t "test name"` to run one matching test. API tests load the root `.env` via `apps/api/vitest.setup.ts` and still need a migrated/pushed local database; manual shell export is for API dev and Drizzle commands, not Vitest.

## Architecture

- This is a pnpm monorepo with four workspaces: `apps/api`, `apps/web`, `packages/i18n`, and `packages/shared`.
- `packages/i18n` owns the exact `en`/`es` allowlist, typed catalogs, i18next factories,
  browser-locale resolution, server translators, and UTC artifact-date helpers. The web uses
  it through `react-i18next`; the API imports it directly through i18next core.
- `packages/shared` is the contract boundary. It exports Zod schemas and their inferred TypeScript types directly from source for both applications.
- `apps/api` composes typed Hono sub-apps in `src/app.ts`, validates request bodies with shared schemas, persists through Drizzle/Postgres, and exports `AppType`. Better Auth supplies cookie sessions; authenticated route groups use `requireUser` to place `userId` in Hono context.
- `apps/web` is a Vite/React 19 SPA. `src/main.tsx` owns route composition and auth/admin layout guards. `src/lib/api.ts` creates `hc<AppType>` so API paths and payloads remain end-to-end typed; local calls use the Vite proxy while production uses `VITE_API_URL`, always with `credentials: "include"`. Domain data access normally lives in `src/lib/*` TanStack Query hooks rather than directly in route components.
- Postgres runs in Docker locally and Supabase in production. Drizzle schema is in `apps/api/src/db/schema.ts`; committed migrations are in `apps/api/drizzle/`. Production rollouts are queued: drain the legacy API, apply the full current history, deploy and verify the dual-protocol Fly API, idempotently verify migrations, then publish Cloudflare Pages. See [`DEPLOY.md`](../DEPLOY.md) before changing the migration tail or deployment DAG.
- The production API intentionally runs TypeScript with `tsx`. The codebase uses `moduleResolution: "Bundler"`, extensionless imports, and consumes `@turingcare/shared` and `@turingcare/i18n` as TypeScript source, so changing the container to `node dist/index.js` requires a coordinated NodeNext/workspace-package build migration.

## Repository conventions

- Define cross-app request validation and DTO types in `packages/shared`, export them from its `src/index.ts`, and reuse them with `zValidator` in Hono and form/client code in React. Do not create parallel API payload interfaces.
- Preserve owner isolation for authenticated domain resources. Scope reads and mutations through the signed-in user (reuse helpers such as `findOwnedDog` and `findOwnedSkill`), including nested IDs. Return `404`, not `403`, for records the caller does not own so existence is not leaked; tests explicitly cover cross-user access.
- Extend the API through a Hono sub-app mounted in `apps/api/src/app.ts` so `AppType` and the web RPC client learn the route. On the web, keep query keys stable and invalidate every affected aggregate/detail cache after mutations (for example dog changes can affect `dogs`, `dogs-overview`, `overview`, or `onboarding`).
- Put fixed system copy in both `packages/i18n/src/en.ts` and `es.ts`; English derives the typed `MessageKey`, and catalog parity is compile-time and runtime checked. This includes web/admin/accessibility copy, curated training display fields, stable API-error feedback, auth/Brief email chrome, and generated Brief/PDF chrome. Do not machine-translate user-authored or trainer/course database content. See [`docs/LOCALIZATION.md`](../docs/LOCALIZATION.md).
- Preserve the locale contract: exact `en`/`es`; account preference → valid `tc-locale` → browser language → English on the web; validated `X-TuringCare-Locale` → weighted supported `Accept-Language` → English in the API. Do not add locale to telemetry. Stable Brief artifacts render from `briefs.locale`, never current browser state.
- Change database structure in `apps/api/src/db/schema.ts`, generate a committed migration with `pnpm db:generate`, and use `db:migrate` for committed migrations/CI. `db:push` is for applying the current schema during local setup. The complete current history through 0026 is applied while the API is drained; any later migration must choose and test a rollout phase and update `migrate-predeploy.ts` plus workflow contract tests.
- Brief email delivery is an intent-first protocol. New clients supply exact `briefId` and `idempotencyKey`; the API writes the audit before provider I/O and reuses the durable send UUID at the provider. Keep the legacy `{ recipient, message }` decoder narrow and ambiguity-failing until its rollout compatibility is deliberately removed. Never expire `brief_sends` deletion protection by claim age: stale/null-time claims are recovered by retry, while any non-null claim blocks dog/account cascades.
- Production configuration requires a non-empty `RESEND_API_KEY`; never turn missing-provider delivery into a successful no-op. Local/CI no-key mode may remain no-network, but its fallback diagnostics must not contain recipient, subject, message, or other authored content.
- API integration tests call `app.request()` directly. Use `createTestUser()` for authenticated requests and clean users in `afterEach`; cascading deletes remove owned test data. Tests that touch domain routes assume real Postgres.
- Product telemetry is recorded server-side with `recordEvent`; never trust a client-supplied user/session identity. Keep telemetry properties scalar and update the route telemetry tests when changing an already tracked action. Normalize every public Brief path through `normalizeTelemetryPagePath` so bearer tokens never reach persistence or admin output.
- Biome enforces 2-space indentation, double quotes, semicolons, and a 100-column line width. `components/ui/**` is generated shadcn code and is intentionally excluded from Biome checks. TypeScript is strict with `noUncheckedIndexedAccess`; avoid weakening types when extending the typed API boundary.
