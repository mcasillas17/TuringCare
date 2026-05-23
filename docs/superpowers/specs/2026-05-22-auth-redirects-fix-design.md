# Auth Redirects Fix — Design Spec

**Date:** 2026-05-22
**Status:** Approved (bug fix; root cause confirmed via systematic-debugging)
**Topic:** Login/register don't land the user on `/my`. Two related defects in the authenticated-redirect behavior.

---

## 1. Defects & root cause

### Defect A — after submitting valid credentials, the page stays on `/login`
**Root cause (confirmed):** a session-atom timing race.
- `login.tsx` does `await signIn.email(...)` then **synchronously** `navigate("/my")`.
- `/my` is gated by `RequireAuth`, which reads Better Auth's `useSession()` and
  redirects to `/login` when `data` is null.
- Better Auth refreshes the `useSession` atom on a **deferred `setTimeout(…, 10)`**
  after a successful auth call (`better-auth/dist/client/proxy.mjs`). So at the
  moment `navigate("/my")` runs, the atom still holds its previous value.
- That previous value is `{ data: null, isPending: false }` — already resolved to
  null because the **landing page's `site-nav.tsx` mounts `useSession`** (for its
  "Open app" vs "Log in" CTA) and nanostores retains the last value after unmount.
- `RequireAuth` therefore sees `data: null, isPending: false` and bounces straight
  back to `/login` before the atom catches up.

**Confirmation:** manually loading `/my` right after the "failed" login shows the
app — i.e. the session cookie *is* set; only the in-app redirect raced. (The fix
is to do programmatically what that manual load does.)

### Defect B — an already-authenticated user visiting `/login` (or `/register`) sees the form
There is no guard; `login.tsx`/`register.tsx` always render the form. Standard
behavior is to redirect authenticated users to `/my`.

---

## 2. Fixes

### Fix A — full-load navigation after auth success
In `login.tsx` and `register.tsx`, replace the post-success
`navigate("/my")` with `window.location.assign("/my")`. A full document load
re-initializes `useSession` from scratch (`isPending: true` → fetch
`/get-session` with the now-present cookie → real session), so `RequireAuth`
never reads a stale null. Bulletproof on local (same-origin) and prod
(cross-subdomain cookie already verified working). The unused `useNavigate`
import is removed from both files.

### Fix B — `RedirectIfAuthed` guard (mirror of `RequireAuth`)
New `apps/web/src/routes/redirect-if-authed.tsx`:
```tsx
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  const { t } = useI18n();
  if (isPending) return <p className="p-8">{t("common.loading")}</p>;
  if (data) return <Navigate to="/my" replace />;
  return <>{children}</>;
}
```
Wrap `/login` and `/register` with it in `main.tsx`. (Not `/forgot-password`
or `/reset-password`: a logged-in user following a reset link should still be
able to set a new password.)

These compose cleanly: after Fix A's full load to `/my`, the user is on `/my`
(guard not involved); typing `/login` while logged in hits the guard →
redirect to `/my`. Fix B uses a *fresh* session evaluation (page load), so it
is not subject to Defect A's post-`signIn` atom staleness.

---

## 3. Scope boundaries (YAGNI)
- No change to `RequireAuth`, Better Auth config, or the session cookie setup
  (cookie persistence is already correct — verified).
- `/forgot-password` / `/reset-password` keep no auth guard.
- No retry/polling logic; the full-load nav removes the race outright.

---

## 4. Testing
- **`redirect-if-authed.test.tsx`** (new): mock `useSession` →
  authed (`data`) renders `<Navigate to="/my">` (assert `/my` content via a
  `Routes` harness); `isPending` renders the loading text; unauthenticated
  renders children.
- **`login.test.tsx`** (extend): on a successful `signIn.email`, the app calls
  `window.location.assign("/my")` (spy on `window.location.assign`); error path
  still shows a toast and does NOT navigate. Keep the existing
  "Forgot password? link" test.
- **`register.test.tsx`** (new): on a successful `signUp.email`,
  `window.location.assign("/my")` is called.
- Full gate green (biome, tsc, `pnpm -r test`, build).

---

## 5. Deliverable order
1. `RedirectIfAuthed` component + test.
2. `login.tsx` (hard-nav + remove `useNavigate`) + test.
3. `register.tsx` (hard-nav + remove `useNavigate`) + test.
4. Wrap `/login` + `/register` in `main.tsx`.
5. Full gate + PROJECT-LOG entry; ship as a PR off current `main`.
