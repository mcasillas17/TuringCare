# TuringCare — Auth Rate Limiting (Security P1)

**Date:** 2026-05-17
**Status:** Approved design (brainstormed + user-approved) — ready for implementation plan
**Sub-project:** A of the A→B→C sequence (B = i18n, C = dog-profile CRUD). Independent of B and D; the highest-priority item in `docs/SECURITY-BACKLOG.md`.
**Scope:** `apps/api` only. No web/landing/i18n/dog changes, no new runtime deps, no Cloudflare/DNS changes.

## Problem

The production auth endpoints (`/api/auth/*` — sign-in, sign-up) are publicly
live with **zero throttling**. Brute-force / credential-stuffing / signup-spam
have no defense. `SECURITY-BACKLOG.md` P1.

Architectural constraint (decided during brainstorming): `api.turingcare.dog` is
Cloudflare **DNS-only (grey cloud)** so Fly can terminate TLS, therefore
Cloudflare WAF/rate-limiting **does not see API traffic**. Edge limiting is not
available without re-proxying the API (rejected — would rework the working Fly
TLS setup). So protection must be **application-level**.

## Approved Decisions

- **Auth limiter:** Better Auth's built-in rate limiter, `storage: "database"`
  (Postgres via the existing Drizzle adapter). DB-backed so counters survive Fly
  machine auto-stop/restart and are correct if the API ever runs >1 instance.
- **Global net:** a thin **in-memory** Hono middleware applying a lenient
  per-IP limit to non-auth API routes. In-memory is acceptable here because it
  is only a coarse safety net; the security-critical limiter (auth) is the
  DB-backed one. (Explicitly approved trade-off.)
- **No Cloudflare proxy / no DNS change.**
- **Limits:** auth ≈ 5 requests / 60 s per IP on the sensitive routes; global
  net ≈ 300 requests / 60 s per IP; Better Auth global default ≈ 100 / 60 s.

## Architecture

Two layers in `apps/api`:

### 1. Better Auth limiter (the security-critical layer)

In `apps/api/src/auth.ts`, add to the `betterAuth({...})` config:

- `rateLimit: { enabled: true, window: 60, max: 100, storage: "database", modelName: "rateLimit", customRules: { "/sign-in/email": { window: 60, max: 5 }, "/sign-up/email": { window: 60, max: 5 }, "/forget-password": { window: 60, max: 3 } } }`
  - `enabled: true` unconditionally (Better Auth disables it outside production
    by default; we enable always so it is testable and active in every env).
  - Paths in `customRules` are relative to the auth `basePath` (`/api/auth`),
    matching Better Auth's documented rule-key convention.
- `advanced: { ipAddress: { ipAddressHeaders: ["fly-client-ip", "x-forwarded-for"] } }`
  — Fly terminates TLS and forwards the real client IP in `Fly-Client-IP`;
  without this Better Auth logs *"Rate limiting skipped: could not determine
  client IP"* (observed in production logs) and limits would be ineffective or
  keyed on the proxy. This must merge with the existing `advanced` block
  (`crossSubDomainCookies`/`defaultCookieAttributes` from the cookie work) — add
  the `ipAddress` key, do not replace `advanced`.
- Better Auth returns `429` with a `Retry-After` header and a JSON body when a
  rule is exceeded — its native behavior, kept as-is.

### 2. Global in-memory net (best-effort safety)

`apps/api/src/middleware/rate-limit.ts` — a small fixed-window per-IP limiter:

- Keyed by client IP resolved from `Fly-Client-IP` then `X-Forwarded-For` (first
  hop) then a fallback constant.
- Window 60 s, max 300. In-memory `Map<ip, { count, windowStart }>` with lazy
  pruning of expired entries (no timers, no unbounded growth).
- On exceed: `429` JSON `{ error: "rate_limited", retryAfter }` + `Retry-After`
  header (seconds), mirroring Better Auth's shape for consistency.
- Mounted in `apps/api/src/app.ts` via `app.use("*", globalRateLimit)` placed
  **after** CORS but **excluding** `/health` (liveness must never be throttled)
  and **excluding** `/api/auth/*` (Better Auth's own limiter owns those, no
  double-limiting). Implementation: the middleware early-returns `next()` for
  `/health` and any path starting with `/api/auth/`.

### Schema / migration

Better Auth `storage: "database"` requires a rate-limit table. Add the model to
`apps/api/src/db/schema.ts` matching Better Auth's expected `rateLimit` shape:

- `rateLimit` table: `id text primary key`, `key text not null`,
  `count integer not null`, `lastRequest bigint not null` (epoch ms).
  No relations. Drizzle `pgTable` consistent with the existing hand-defined
  Better Auth tables; pass it into the `drizzleAdapter` schema map as
  `rateLimit`.

Generate migration `apps/api/drizzle/0001_*.sql` via `drizzle-kit generate`
(same flow as `0000`). The existing `migrate` CI job applies it on push —
**no migrate-job changes needed**. Verify it applies cleanly to a fresh DB.

## Error Handling

- Auth over-limit → Better Auth `429` + `Retry-After` (native, unchanged shape).
- Global over-limit → middleware `429` `{ error: "rate_limited", retryAfter }`
  + `Retry-After`.
- `/health` and `/api/auth/*` never hit the global middleware.
- DB unavailable for the Better Auth limiter: Better Auth fails the limited
  request (fail-closed for the protected auth routes is acceptable/desirable);
  document this behavior, do not add custom fallback logic.

## Testing (proportionate, Vitest in `apps/api`, existing Postgres test service)

- **Global middleware unit test:** N requests under `max` pass; the `max+1`th
  within the window → `429` + numeric `Retry-After`; a request after the window
  resets. Pure function/Map — no DB.
- **App-level test:** `/health` is never throttled regardless of volume; a
  non-auth route past the global `max` → `429`.
- **Better Auth limiter integration test:** exceed the `/sign-in/email`
  custom rule → `429` with `Retry-After`; a normal single sign-in attempt under
  the limit is not throttled. Runs against the existing CI Postgres service
  (the limiter writes to the `rateLimit` table); reuses the api test env setup.
- Existing api tests (`/health` 200, `/me` 401) must still pass (the global
  middleware must not break them — `/health` exempt, `/me` under the lenient
  global max).

## Verification

- `pnpm --filter @turingcare/api test` green (new + existing).
- `pnpm --filter @turingcare/api typecheck`, `pnpm lint`,
  `pnpm --filter @turingcare/api build`, `pnpm -r exec tsc --noEmit`,
  `pnpm -r build` all green.
- `drizzle-kit generate` produced `0001`, and `db:migrate` applies it cleanly
  to a fresh Dockerized Postgres (10 → 11 tables, `rateLimit` present).
- No new entries in `package.json`/`pnpm-lock.yaml`. No changes outside
  `apps/api` (+ the spec/plan docs).
- Manual sanity (local, optional): rapid repeated `POST /api/auth/sign-in/email`
  returns `429`+`Retry-After` after the 5th within 60 s.

## Out of Scope

Password reset / email verification / 2FA / audit logging (later
`SECURITY-BACKLOG.md` items P2–P7), Cloudflare/edge WAF, CAPTCHA, account
lockout/notification, distributed rate-limit store for the *global* net
(in-memory accepted by decision). No web changes.

## Flagged Choices (reasonable defaults; reviewable)

- Global net is in-memory and per-instance/non-persistent **by explicit
  approval** — the security-critical limiter (auth) is the DB-backed one.
- Exact thresholds (auth 5/60s, global 300/60s, BA default 100/60s) are
  conservative starting points; tunable later without schema change.
- `customRules` keyed at `/sign-in/email`, `/sign-up/email`,
  `/forget-password`; the last is pre-provisioned for the future P2 reset flow
  and is harmless until that endpoint exists.
- Better Auth `rateLimit` left `enabled: true` in all environments (so tests
  exercise it); thresholds are not environment-branched (YAGNI) unless a future
  need arises.
