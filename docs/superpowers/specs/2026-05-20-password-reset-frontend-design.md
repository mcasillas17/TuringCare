# Password Reset Frontend — Design Spec

**Date:** 2026-05-20
**Status:** Approved (brainstorming)
**Topic:** Security backlog **P3** — the user-facing password-reset flow (the page users land on from the reset email, plus the "Forgot password?" entry from `/login`). The backend (Better Auth `request-password-reset` + the `sendResetPassword` callback that emits the email) shipped in P1.

---

## 1. Goal & scope

Make password recovery a fully usable flow. Today an account whose password is
forgotten is effectively locked out because no UI exists to request or complete
a reset — the backend will *send* the email but there's nowhere for the user
to go from it. This spec adds the two missing pages and a single link.

**In scope:**
- `/forgot-password` — email entry, calls `forgetPassword`, shows generic
  anti-enumeration success.
- `/reset-password` — reads `?token=` from the URL, two-field form (new
  password + confirm), calls `resetPassword`, redirects to `/login`.
- `/login` — add a `Forgot password?` link to `/forgot-password`.
- i18n (en + es parity), accessibility, tests.

**Out of scope (separate concerns):** P2 (enabling
`requireEmailVerification` + a verify-email UX), the in-app "change my
password while signed in" flow, account deletion. No backend changes — the
backend already exposes everything we need.

### Decisions locked during brainstorming

| Decision | Choice |
|---|---|
| Reveal policy on `/forgot-password` | **Always show success** (anti-enumeration; matches Better Auth's 2xx-regardless API behavior) |
| Route paths | `/forgot-password` + `/reset-password` (public, alongside `/login`/`/register`) |
| Reset email link target | `${window.location.origin}/reset-password?token=…` (Better Auth appends `token` to our `redirectTo`) |
| Post-success behavior on `/reset-password` | `toast.success` + `navigate("/login")` (no auto sign-in) |
| Forms library | Native `<form>` + local `useState` (same as `login.tsx`/`register.tsx`); no react-hook-form here — only 1–2 fields per page |
| Validation | HTML5 `required`/`type=email` + client-side `minLength=8` and confirm-matches; no shared Zod schema for one-field forms |

---

## 2. Architecture

Three small, focused files (two new, one tiny modify), plus a one-line
re-export and route registration:

| File | Action | Purpose |
|---|---|---|
| `apps/web/src/routes/forgot-password.tsx` | create | Public page: email field → `forgetPassword` → generic success view |
| `apps/web/src/routes/reset-password.tsx` | create | Public page: reads `?token=` → 2-field form → `resetPassword` → redirect `/login` |
| `apps/web/src/routes/login.tsx` | modify | Add `Forgot password?` link below the password field |
| `apps/web/src/lib/auth-client.ts` | modify | Re-export `forgetPassword` and `resetPassword` from `authClient` |
| `apps/web/src/main.tsx` | modify | Register the two new routes as public (peers of `/login`/`/register`) |
| `apps/web/src/i18n/en.ts` + `es.ts` | modify | New `auth.*` copy keys; compile-time parity guard already in place |

Both new pages reuse the existing shell (`BrandMark`, `LanguageToggle`,
shadcn `Card`/`Input`/`Label`/`Button`, sonner toasts, `useI18n`) — the file
shape mirrors `login.tsx`/`register.tsx`. No new dependencies. No backend
changes.

---

## 3. UX flow

### 3.1 `/forgot-password`

Single field (Email). Submit:

1. Pending = true; call `forgetPassword({ email, redirectTo: \`${window.location.origin}/reset-password\` })`.
2. **Ignore `error`** (anti-enumeration; the API always 2xxs anyway).
3. Replace the form with a static success view: heading "Check your inbox" +
   body "If that email is registered, you'll receive a reset link shortly.
   Check your spam folder too." + a "Back to log in" link to `/login`.

A "Back to log in" link is also shown beneath the form (pre-submit) for users
who landed here by mistake.

### 3.2 `/reset-password`

Reads `?token` via `useSearchParams()`.

- **No token in URL** → render the invalid-link state: heading "This reset
  link is missing or invalid" + body "Request a new one." + link to
  `/forgot-password`. No form, no API call.
- **Token present** → two-field form: `New password` (type=password, min 8) +
  `Confirm new password`. Submit handler:
  1. Client-side validation. `newPassword.length < 8` → inline error;
     `confirm !== newPassword` → inline error. Either prevents the API call.
  2. `resetPassword({ newPassword, token })`.
  3. On `error`: `toast.error(error.message ?? t("auth.resetFailed"))`.
  4. On success: `toast.success(t("auth.resetSuccess"))` and
     `navigate("/login")`. (No auto sign-in.)

### 3.3 `/login` link

Below the password input, before the Submit button (or directly after, see
existing component for the natural slot), a small right-aligned link:
`{t("auth.forgotLink")}` → `/forgot-password`. Same `<Link className="underline">`
pattern already used by the "Register" link.

---

## 4. Errors, accessibility, i18n

**Error surfaces**
- Field errors → inline `<p className="text-sm text-destructive">` under the
  input, set via local `useState<string | null>`; the input gets `aria-invalid`
  + `aria-describedby` pointing at the `<p>`'s id.
- API errors on `/reset-password` (token expired/invalid, rate-limited, etc.) →
  `toast.error(…)` (same pattern as `signIn.email` in `login.tsx`).
- API errors on `/forgot-password` are intentionally swallowed for
  anti-enumeration; the generic success view always renders.

**Accessibility**
- Every input has a `<Label htmlFor>`; inline errors are linked via
  `aria-describedby`.
- Submit buttons set `aria-busy={pending}` while in-flight.
- Same `LanguageToggle` placement as the other auth pages.

**i18n (en + es; parity guard enforced at compile time)**

New keys under `auth.*`:
```
forgotTitle / forgotIntro / forgotSubmit / forgotPending
forgotSuccessTitle / forgotSuccessBody
forgotLink / backToLogin
resetTitle / resetSubmit / resetPending
newPassword / confirmPassword
passwordTooShort / passwordsMismatch
resetSuccess / resetInvalidLink / resetFailed
```
Spanish copies follow the same warm, plain-language voice as the rest of
`es.ts` (no formal "Usted"; matches existing auth strings).

---

## 5. Testing

Web Vitest + Testing Library (jsdom). No network, no real Better Auth — mock
`@/lib/auth-client` per test (`vi.mock`).

- **`forgot-password.test.tsx`**
  - Renders the form (email input + submit + back-to-login link).
  - Submit → mocked `forgetPassword` called with `{ email, redirectTo }`,
    `redirectTo` ending in `/reset-password`.
  - Success view renders regardless of mock outcome (both `mockResolvedValue`
    and `mockRejectedValue` paths produce the same anti-enumeration UI).
- **`reset-password.test.tsx`**
  - No `?token` → invalid-link state, link to `/forgot-password`, no API call.
  - `?token=abc` → form renders.
  - Submit with mismatched passwords → inline error, `resetPassword` NOT called.
  - Submit with short password → inline error, `resetPassword` NOT called.
  - Submit with valid input → `resetPassword({ newPassword, token: "abc" })`
    called; on success navigates to `/login`; on `error` a sonner toast fires
    (spy on `toast.error`).
- **`login.test.tsx`** (new or extension) — assert the "Forgot password?"
  link is present and points to `/forgot-password`.
- The existing `i18n.test.tsx` already enforces compile-time en/es parity; new
  keys must satisfy it. No extra parity test needed.

Full web suite + monorepo gate stay green.

---

## 6. Scope boundaries (YAGNI)

Out of scope: in-app password change while signed-in; rate-limit *display*
(Better Auth already rate-limits 3/60s and the existing toast surfaces the
429 message — no separate countdown UI); strength meters or zxcvbn; password
manager hint integration; OAuth/social-login resets (no OAuth wired);
auto-sign-in after reset; explicit "show password" toggles (can add later if
asked).

---

## 7. Deliverable order

1. Re-export `forgetPassword` + `resetPassword` from `auth-client.ts`.
2. i18n keys (en + es, parity).
3. `/forgot-password` page + test (TDD).
4. `/reset-password` page + test (TDD).
5. `/login.tsx` link + test (TDD).
6. Register both routes in `main.tsx`.
7. Full gate green + PROJECT-LOG entry.

Shipped as part of the in-flight `worktree-feat+transactional-email` branch /
PR #7 so the email pipe and the UI it links to land together. A separate small
spec covers the unrelated language-toggle redesign (top-right + flags) being
queued for the same PR.
