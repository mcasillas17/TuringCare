# Account Security and Rollout Readiness

This file tracks security-specific details. The canonical cross-functional priority order and
public-beta status live in [`ROADMAP.md`](ROADMAP.md).

Prioritize the remaining account-security work within the canonical roadmap gates.

> **Updated 2026-09-05.** T1 verified-email enforcement is implemented, but authorized
> existing-account preparation and production cutover evidence remain pending. Do not
> interpret local readiness or passing PR checks as a deployed security guarantee.

## Shipped — Transactional email and password recovery

- Resend delivery is wired through Fly secrets. Production fails startup when
  `RESEND_API_KEY` is absent or blank; local/CI environments without a key emit only a fixed
  redacted diagnostic and perform no delivery.
- Better Auth password-reset email generation and the web forgot/reset-password routes are
  implemented with localized English/Spanish chrome.
- Verification delivery is retained by the T1 implementation below.

## P0 — Verified email ownership: implementation ready, rollout pending

- `emailAndPassword.requireEmailVerification` prevents new unverified sign-in sessions.
  Independent uncached session checks protect existing owner sessions, native account
  mutations and admin routes. Only explicit `emailVerified === true` grants access.
- Allowlist promotion requires verified ownership; an unverified persisted admin role is
  ineffective. `/me` masks that role and uses `Cache-Control: no-store`.
  Removing an address from the allowlist does not revoke an already-persisted admin role;
  revocation is a separate authorized operation, and verification is still required.
- Email GETs are non-consuming, including scanner visits. A short-lived encrypted,
  HttpOnly API-host receipt and trusted-origin confirmation POST perform verification.
  Query flags cannot forge success; confirmation never creates or switches sessions.
- Resend requires a same-account session or password proof, preventing anonymous
  email-existence probing through provider-error responses. Pre-work quotas are
  5/email-IP pair and 20/IP per minute, plus one outbound send/email per minute.
  Failed/uncertain sends do not refund the allowance.
- HMAC counter keys do not store addresses. Bounded indexed cleanup scales with new
  credential pairs; per-page commits preserve active/native counters. Daily maintenance
  queues through ordinary contention and fails visibly on prolonged/incomplete work.
- Passive staging uses the global request net. Throttled email navigation is token-free;
  programmatic callers retain 429. Production credential/send/confirm actions require
  trusted Fly IP metadata; session reads and sign-out remain recoverable.
- Production rejects `E2E_TEST_MODE`, and capture/outbox code independently refuses it.
  Unexpected auth diagnostics are sanitized; no raw tokens, credentials or provider
  payloads are logged.
- Password reset remains available but does not verify ownership. Owner isolation,
  public-share projections, Brief idempotency and pending-send deletion guards are unchanged.

Before production enablement, an authorized operator must inventory affected accounts
using aggregate data and prove control of all admin/smoke mailboxes. No blanket flag
updates, password resets, bulk mail or admin grace bypass are permitted. See
[`DEPLOY.md`](../DEPLOY.md#6a-verified-email-ownership-cutover) and
[T1 #97](https://github.com/mcasillas17/TuringCare/issues/97).

Residual work includes self-service email correction and a separately authorized recovery
policy for inaccessible legacy mailboxes. A claimed typo or possession of a password alone
does not authorize account/data transfer. MFA, auth audit logging, secret hygiene and
session-expiry tuning remain separate work below.

## P2 — Multi-factor auth (2FA)
- Better Auth TOTP/2FA plugin for opt-in MFA.

## P3 — Audit logging
- Record auth events (login success/failure, password change, session revoke)
  for traceability.

## P4 — Operational secret hygiene
- Verify the production `BETTER_AUTH_SECRET` Fly secret is a real
  `openssl rand -base64 32` value, not the `.env.example` dev placeholder.
- Periodic secret rotation policy (BETTER_AUTH_SECRET, DATABASE_URL).
- Consider session inactivity/absolute expiry tuning.

## Shipped — Postgres exposure / Row Level Security (2026-06-09)
- ✅ **RLS enabled on all 17 public tables** (migration `0011_enable_rls`).
  Supabase's PostgREST "Data API" exposes the `public` schema and grants
  `anon`/`authenticated` access by default — meaning the public anon key could
  read sensitive tables (`account` password hashes, `session` tokens, `user`
  emails, all owner data) over REST. A Supabase lint flagged `public.account`.
  Two layers shipped:
  1. **Data API disabled** in the Supabase dashboard (the app uses a direct
     `pg` connection via Better Auth + Drizzle, never PostgREST — so the Data
     API was pure attack surface). This is the primary mitigation.
  2. **RLS `ENABLE`d (no policies, no `FORCE`)** on every app table as
     defense-in-depth. The API connects as the table-owner role, which bypasses
     non-FORCE RLS, so the app is unaffected (verified: full api suite 179/179
     green post-migration); any non-owner role (e.g. PostgREST `anon`) is denied
     all rows even with table grants (verified directly: owner sees a row, a
     `GRANT SELECT` non-owner sees 0). A guarded `REVOKE … FROM anon,
     authenticated` also strips PostgREST grants where those roles exist
     (skipped on local/CI Postgres, which lack them).
  - NOT used: Supabase's suggested `auth.uid()` policies — those assume Supabase
    Auth; this app uses Better Auth, so `auth.uid()` is always null here. Access
    control lives in the Hono API layer (owner-scoped queries), not RLS.
  - Follow-up (optional): a non-owner least-privilege app role + explicit
    policies if we ever want RLS to be the primary enforcement layer.

## Shipped (was P1 — brute-force / abuse protection)
- ✅ **Rate limiting** — Better Auth DB-backed limiter on `/api/auth/*`
  (sign-in/sign-up 5/60s, password-reset requests 3/60s) + in-memory global net,
  keyed on Fly-forwarded client IP. Shipped 2026-05-17 (sub-project A; see
  `docs/PROJECT-LOG.md`). Edge-level limits (Cloudflare/Fly) as added
  defense-in-depth remain optional, not blocking.

## Already in place (for context — see the security walkthrough)
- Passwords hashed by Better Auth (scrypt, salted), stored in `account.password`.
- DB-backed sessions; opaque token in an httpOnly cookie.
- Prod cookies: `Secure` + `SameSite=None` + `domain=.turingcare.dog`
  (cross-subdomain, env-driven via `COOKIE_DOMAIN`).
- DB connections over TLS for managed Postgres; secrets in Fly, not the repo.
- CORS restricted to `FRONTEND_URL`; Better Auth origin/`trustedOrigins` checks.
- Minimum password length enforced server-side (8).
- Admin access is verified-only and promote-only via the server-side `ADMIN_EMAILS` allowlist
  (no client-settable role; `role` is `input:false` at sign-up).

## Shipped — Brief delivery durability and deletion privacy (2026-08-23)

- Brief sends persist an owner-scoped, exact-version intent before contacting the email
  provider and reuse the durable send UUID as the provider idempotency key.
- Delivery provider I/O runs outside database transactions. A bounded claim coordinates
  retries; stale or timestamp-less claims are recoverable only through the same stored
  intent, so server-secret rotation cannot change delivery identity.
- A database trigger blocks deletion of every claimed send regardless of claim age. Dog and
  account deletion expose localized active/recovery states instead of silently cascading
  away evidence while provider outcome is uncertain.
- Legacy web payloads remain rollout-compatible only when exactly one Brief version can be
  established. Every multi-version ID-less request fails closed without sending because
  recipient/message content cannot prove the tab's intended version.
- The onboarding "shared" milestone counts only rows with confirmed `delivered_at`.
