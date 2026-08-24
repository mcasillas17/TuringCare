# Security Hardening — Planned (Next Phases)

These were **consciously deferred** during session-1 scope (scaffolding/auth/deploy)
and the landing page phase. They are not bugs — they are the planned account-security
roadmap. Tackle roughly in this priority order. Each item should go through the normal
brainstorm → spec → plan → build flow.

> **Reprioritized 2026-05-18.** Email verification + account recovery moved to the
> top of the remaining roadmap. Driver: the admin portal grants access via the
> `ADMIN_EMAILS` allowlist, and `resolveAdminRole` promotes any authenticated
> account whose email matches. Because email verification is **not** enforced,
> the allowlist's trust currently rests on email-to-account ownership being
> assumed rather than proven — an allowlisted address with no account yet could
> be registered by someone else and self-promote. Verification closes this for
> admin *and* every other account. Password recovery is bundled because it
> shares the same hard dependency (transactional email) and is a baseline
> account-security expectation.

## P1 — Transactional email provider
- Hard dependency for P2 and P3 — must land first. No email is wired today
  (explicitly out of session-1 scope).
- Pick a provider, store credentials as Fly secrets, never in the repo.

## P2 — Email verification
- Set `requireEmailVerification` and add the verify-email flow.
- **Security rationale:** until this lands, accounts are usable immediately with
  unverified addresses, so the `ADMIN_EMAILS` admin-bootstrap allowlist (and any
  future email-trust decision) is only as strong as the assumption that an email
  maps to its rightful owner. Enforced verification makes that assumption real.
- Operational guard until shipped: only add already-registered, controlled
  accounts to `ADMIN_EMAILS`.

## P3 — Password reset / account recovery
- Better Auth password-reset flow (request + token + set-new-password).
- Depends on P1 (transactional email). Baseline account-security expectation;
  today a forgotten password = a permanently locked-out account.

## P4 — Multi-factor auth (2FA)
- Better Auth TOTP/2FA plugin for opt-in MFA.

## P5 — Audit logging
- Record auth events (login success/failure, password change, session revoke)
  for traceability.

## P6 — Operational secret hygiene
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
  (sign-in/sign-up 5/60s, forget-password 3/60s) + in-memory global net,
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
- Admin access is promote-only via the server-side `ADMIN_EMAILS` allowlist
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
- Legacy web payloads remain rollout-compatible only when one exact Brief can be established
  or a canonical stored intent matches. Ambiguous old tabs fail closed without sending.
- The onboarding "shared" milestone counts only rows with confirmed `delivered_at`.
