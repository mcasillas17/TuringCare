# Settings Completeness — Plan

Spec: `docs/superpowers/specs/2026-05-23-settings-completeness-design.md`

Branch: `worktree-settings-completeness`. TDD per task, one commit each.

## T0 — Wire Better Auth methods & enable server-side delete
- `apps/web/src/lib/auth-client.ts`: re-export `changePassword`,
  `deleteUser` from `authClient`.
- `apps/api/src/auth.ts`: add `user.deleteUser.enabled: true` (preserves
  the existing `user.additionalFields.role` config — merge into the same
  `user` block).
- Commit: `feat(auth): enable Better Auth changePassword + deleteUser`.

## T1 — `ChangePasswordForm`
- Tests first (`apps/web/src/components/settings/change-password-form.test.tsx`):
  - renders 3 password inputs + Save button
  - inline error: current empty / new too short / confirm mismatch /
    new equals current
  - success path: calls mocked `changePassword` with the right args,
    toast success, form reset
  - failure path: mock returns `{ error }`, toast error
- Impl (`apps/web/src/components/settings/change-password-form.tsx`):
  RHF + zodResolver inline schema, same input class as `<SendPanel>`,
  primary Button. Pass `revokeOtherSessions: false`.
- i18n: 11 new `settings.*` keys (en + es parity).
- Commit: `feat(web): ChangePasswordForm component`.

## T2 — `DeleteAccountButton`
- Tests first (`apps/web/src/components/settings/delete-account-button.test.tsx`):
  - starts collapsed (outline Delete button)
  - clicking expands; Confirm is disabled
  - typing the wrong word keeps it disabled; typing `delete` enables it
  - Cancel collapses back
  - Confirm calls mocked `deleteUser` + `signOut`, navigates to `/`
  - failure stays expanded, toasts error
- Impl (`apps/web/src/components/settings/delete-account-button.tsx`):
  React `useState` for `expanded` + `confirmText` + `submitting`. On
  Confirm: `await deleteUser(); await signOut(); navigate("/")`.
- i18n: 9 new `settings.*` keys; add `"delete"` to the i18n untranslated
  allowlist (one literal we want identical in both locales).
- Commit: `feat(web): DeleteAccountButton with double-confirm flow`.

## T3 — Sectioned `/my/settings` page
- Tests first (`apps/web/src/routes/settings.test.tsx`): renders title +
  4 section headings; both new components mounted.
- Impl: rewrite `apps/web/src/routes/settings.tsx` with 4 sections; keep
  existing sign-out behavior; `max-w-md`, `space-y-8`.
- Commit: `feat(web): sectioned Settings layout with change-password + danger-zone`.

## T4 — Wrap
- Append `docs/PROJECT-LOG.md` entry (2026-05-23).
- Full gate: `pnpm -r exec tsc --noEmit`, `pnpm -r test`, `pnpm lint`,
  `pnpm -r build`.
- Commit: `docs: PROJECT-LOG entry for Settings completeness PR`.
- Push as DRAFT PR.
