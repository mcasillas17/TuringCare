# Security Hardening — Planned (Next Phases)

These were **consciously deferred** during session-1 scope (scaffolding/auth/deploy)
and the landing page phase. They are not bugs — they are the planned account-security
roadmap. Tackle roughly in this priority order. Each item should go through the normal
brainstorm → spec → plan → build flow.

## P1 — Brute-force / abuse protection
- Enable Better Auth's built-in **rate limiting** on `/api/auth/*` (login, sign-up,
  any future reset endpoints).
- Add edge-level limits (Cloudflare rules and/or Fly) as defense in depth.
- Rationale: today login/signup have no throttling — highest-risk gap.

## P2 — Password reset / account recovery
- Better Auth password-reset flow (request + token + set-new-password).
- Requires transactional email (see P4).

## P3 — Email verification
- Set `requireEmailVerification` and add the verify-email flow.
- Until then, accounts are usable immediately with unverified addresses.

## P4 — Transactional email provider
- Needed by P2 and P3. No email is wired today (explicitly out of session-1 scope).
- Pick a provider, store credentials as Fly secrets, never in the repo.

## P5 — Multi-factor auth (2FA)
- Better Auth TOTP/2FA plugin for opt-in MFA.

## P6 — Audit logging
- Record auth events (login success/failure, password change, session revoke)
  for traceability.

## P7 — Operational secret hygiene
- Verify the production `BETTER_AUTH_SECRET` Fly secret is a real
  `openssl rand -base64 32` value, not the `.env.example` dev placeholder.
- Periodic secret rotation policy (BETTER_AUTH_SECRET, DATABASE_URL).
- Consider session inactivity/absolute expiry tuning.

## Already in place (for context — see the security walkthrough)
- Passwords hashed by Better Auth (scrypt, salted), stored in `account.password`.
- DB-backed sessions; opaque token in an httpOnly cookie.
- Prod cookies: `Secure` + `SameSite=None` + `domain=.turingcare.dog`
  (cross-subdomain, env-driven via `COOKIE_DOMAIN`).
- DB connections over TLS for managed Postgres; secrets in Fly, not the repo.
- CORS restricted to `FRONTEND_URL`; Better Auth origin/`trustedOrigins` checks.
- Minimum password length enforced server-side (8).
