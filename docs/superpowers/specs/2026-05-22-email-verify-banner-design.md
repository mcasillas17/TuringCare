# Spec: Soft email-verification banner

**Date:** 2026-05-22
**Status:** Shipped

## Problem
Users who sign up receive a verification email (already wired via Better Auth `sendOnSignUp:true`), but there is no in-app reminder if they skip verifying. `requireEmailVerification` must stay off (no lock-out) to preserve existing accounts.

## Approach
A slim dismissible banner shown to authenticated users whose `emailVerified` flag is `false`. The banner offers a one-click Resend flow and disappears on dismiss or if the user is verified.

## Key decisions
- `emailVerified` read via `(data.user as { emailVerified?: boolean }).emailVerified` — mirrors the `(session.user as { role?: string })` cast pattern already used in `apps/api/src/middleware/require-admin.ts`.
- `sendVerificationEmail` added to the named re-exports of `apps/web/src/lib/auth-client.ts`.
- Dismiss is in-memory `useState` only (no sessionStorage); adequate for the use-case.
- Banner mounts inside `AppShell` below the `<header>`, above `<main>` — global chrome, affects all authenticated pages.

## Files changed
- `apps/web/src/lib/auth-client.ts` — re-export `sendVerificationEmail`
- `apps/web/src/components/verify-email-banner.tsx` — new component
- `apps/web/src/components/app-shell/AppShell.tsx` — mounts `<VerifyEmailBanner />`
- `apps/web/src/i18n/en.ts` + `es.ts` — `verifyBanner.*` keys (en/es parity)
- `apps/web/src/components/verify-email-banner.test.tsx` — 5 unit tests
