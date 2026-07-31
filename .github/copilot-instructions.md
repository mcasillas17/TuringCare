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
pnpm --filter @turingcare/shared exec vitest run src/dog.test.ts
```

Add `-t "test name"` to run one matching test. API tests load the root `.env` via `apps/api/vitest.setup.ts` and still need a migrated/pushed local database; manual shell export is for API dev and Drizzle commands, not Vitest.

## Architecture

- This is a pnpm monorepo with three workspaces: `apps/api`, `apps/web`, and `packages/shared`.
- `packages/shared` is the contract boundary. It exports Zod schemas and their inferred TypeScript types directly from source for both applications.
- `apps/api` composes typed Hono sub-apps in `src/app.ts`, validates request bodies with shared schemas, persists through Drizzle/Postgres, and exports `AppType`. Better Auth supplies cookie sessions; authenticated route groups use `requireUser` to place `userId` in Hono context.
- `apps/web` is a Vite/React 19 SPA. `src/main.tsx` owns route composition and auth/admin layout guards. `src/lib/api.ts` creates `hc<AppType>` so API paths and payloads remain end-to-end typed; local calls use the Vite proxy while production uses `VITE_API_URL`, always with `credentials: "include"`. Domain data access normally lives in `src/lib/*` TanStack Query hooks rather than directly in route components.
- Postgres runs in Docker locally and Supabase in production. Drizzle schema is in `apps/api/src/db/schema.ts`; committed migrations are in `apps/api/drizzle/`. Production deploys the web app to Cloudflare Pages and the API to Fly.io after migrations succeed.
- The production API intentionally runs TypeScript with `tsx`. The codebase uses `moduleResolution: "Bundler"`, extensionless imports, and consumes `@turingcare/shared` as TypeScript source, so changing the container to `node dist/index.js` requires a coordinated NodeNext/shared-package build migration.

## Repository conventions

- Define cross-app request validation and DTO types in `packages/shared`, export them from its `src/index.ts`, and reuse them with `zValidator` in Hono and form/client code in React. Do not create parallel API payload interfaces.
- Preserve owner isolation for authenticated domain resources. Scope reads and mutations through the signed-in user (reuse helpers such as `findOwnedDog` and `findOwnedSkill`), including nested IDs. Return `404`, not `403`, for records the caller does not own so existence is not leaked; tests explicitly cover cross-user access.
- Extend the API through a Hono sub-app mounted in `apps/api/src/app.ts` so `AppType` and the web RPC client learn the route. On the web, keep query keys stable and invalidate every affected aggregate/detail cache after mutations (for example dog changes can affect `dogs`, `dogs-overview`, `overview`, or `onboarding`).
- All user-facing web copy goes through the typed i18n catalogs. Add matching keys to both `apps/web/src/i18n/en.ts` and `es.ts`; English is the literal source used to derive `MessageKey`, and catalog shape parity is compile-time checked.
- Change database structure in `apps/api/src/db/schema.ts`, generate a committed migration with `pnpm db:generate`, and use `db:migrate` for committed migrations/CI. `db:push` is for applying the current schema during local setup.
- API integration tests call `app.request()` directly. Use `createTestUser()` for authenticated requests and clean users in `afterEach`; cascading deletes remove owned test data. Tests that touch domain routes assume real Postgres.
- Product telemetry is recorded server-side with `recordEvent`; never trust a client-supplied user/session identity. Keep telemetry properties scalar and update the route telemetry tests when changing an already tracked action.
- Biome enforces 2-space indentation, double quotes, semicolons, and a 100-column line width. `components/ui/**` is generated shadcn code and is intentionally excluded from Biome checks. TypeScript is strict with `noUncheckedIndexedAccess`; avoid weakening types when extending the typed API boundary.
