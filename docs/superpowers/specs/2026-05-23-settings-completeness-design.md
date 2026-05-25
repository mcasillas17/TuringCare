# Settings Completeness — Design

## Why
The `/my/settings` page is a stub: language toggle, sign-out button, and a
link to profile. Users have no way to change their password from inside the
app (only "forgot password" via email round-trip) and no way to delete their
account at all. We're shipping a real Settings page.

## What ships
1. **Change password** form (current + new + confirm), calls Better Auth's
   client `changePassword({ currentPassword, newPassword, revokeOtherSessions })`.
2. **Delete account** with a double-confirm UX: click the danger button →
   panel expands → user types `delete` to unlock the Confirm button → calls
   Better Auth's client `deleteUser()`, signs out, navigates to `/`.
3. **Sectioned Settings layout**: Language / Account / Change password /
   Danger zone — same `max-w-md` container, `space-y-8` between sections.

## How
- **Better Auth wiring**. `apps/web/src/lib/auth-client.ts` currently
  re-exports `signIn`, `signUp`, `signOut`, `useSession`,
  `requestPasswordReset`, `resetPassword`, `sendVerificationEmail`. Add
  `changePassword` and `deleteUser` (proxy methods on the same
  `createAuthClient` instance — Better Auth 1.6.11 exposes both as
  endpoints under `/api/auth/change-password` and `/api/auth/delete-user`).
- **Server config**. Better Auth's `deleteUser` endpoint short-circuits with
  a 400 unless `user.deleteUser.enabled: true`. We flip that one config
  flag in `apps/api/src/auth.ts`. We do NOT set `sendDeleteAccountVerification`
  or `beforeDelete`, so deletion is one-shot: the call removes the user row
  and the existing Drizzle FK cascades clean up dogs, briefs, journal,
  training progress, brief sends.
- **Forms**. `ChangePasswordForm` uses `react-hook-form` + `zodResolver`
  (matches `<SendPanel>` style). Three required password fields, zod schema
  enforces length-8 + "new differs from current" + "confirm matches new".
  On success: toast + reset. On failure (typed Better Auth error → wrong
  current password): toast.
- **Delete UX**. Component owns local state: `collapsed | expanded |
  submitting`. `expanded` shows the intro, a typed-confirm input, and a
  Confirm button disabled until the input === `"delete"` (kept untranslated
  on purpose — both locales). Cancel returns to collapsed. Confirm calls
  `deleteUser()`, then `signOut()`, then `navigate("/")`.
- **i18n**. ~20 new `settings.*` keys. en + es parity. The single shared
  literal `"delete"` (the confirm word) is added to the existing
  `i18n.test.tsx` allowlist of intentionally-equal en/es entries.
- **Settings page rewrite**. Four sections; the existing Language toggle
  and Sign out button stay; the new components are dropped in.

## Out of scope (deferred)
- `revokeOtherSessions: true` toggle (we always pass `false` — safer
  default for the primary "I changed my password" use case; a separate
  session-management panel can land later).
- `changeEmail` (verification round-trip UX is its own design).
- Notification preferences (no notifications shipped yet).
- 2FA / security audit log.

## Tests
- `change-password-form.test.tsx` — validation paths + success/error.
- `delete-account-button.test.tsx` — collapsed → expanded → unlock →
  call → sign-out + navigate.
- `settings.test.tsx` — renders all four section headings and mounts
  both new components.
- i18n parity test continues to pass (allowlist updated for one literal).
