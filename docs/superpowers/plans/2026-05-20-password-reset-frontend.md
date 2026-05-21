# Password Reset Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user-facing password-recovery flow — `/forgot-password` (anti-enumeration entry) and `/reset-password` (the page the reset email links to), plus a `Forgot password?` link from `/login`.

**Architecture:** Two thin public pages that mirror `login.tsx`/`register.tsx` (`BrandMark` + `LanguageToggle` + shadcn `Card`, sonner toasts, `useI18n`). Both call Better Auth's React client (`forgetPassword`, `resetPassword`) via the existing `authClient`. No backend changes — PR #7 already wired the email pipe. No new deps. i18n en+es with the existing compile-time parity guard.

**Tech Stack:** Vite + React 19, React Router v7, Better Auth React client, shadcn/ui, sonner, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-20-password-reset-frontend-design.md`

---

## File Structure

- `apps/web/src/lib/auth-client.ts` *(modify)* — also re-export `forgetPassword`, `resetPassword`.
- `apps/web/src/i18n/en.ts` *(modify)* — new `auth.*` keys.
- `apps/web/src/i18n/es.ts` *(modify)* — Spanish parity for those keys.
- `apps/web/src/routes/forgot-password.tsx` *(create)*.
- `apps/web/src/routes/forgot-password.test.tsx` *(create)*.
- `apps/web/src/routes/reset-password.tsx` *(create)*.
- `apps/web/src/routes/reset-password.test.tsx` *(create)*.
- `apps/web/src/routes/login.tsx` *(modify)* — add `Forgot password?` link.
- `apps/web/src/routes/login.test.tsx` *(create)* — link assertion.
- `apps/web/src/main.tsx` *(modify)* — register `/forgot-password` and `/reset-password` as public routes.
- `docs/PROJECT-LOG.md` *(modify)* — phase entry.

---

## Task 1: Re-export `forgetPassword` + `resetPassword`

**Files:** Modify `apps/web/src/lib/auth-client.ts`

- [ ] **Step 1: Add the two methods to the destructured re-export**

Current last line:
```ts
export const { signIn, signUp, signOut, useSession } = authClient;
```
Replace with:
```ts
export const { signIn, signUp, signOut, useSession, forgetPassword, resetPassword } = authClient;
```
Nothing else in the file changes.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @turingcare/web typecheck`
Expected: no errors (Better Auth's React client exposes both methods on `authClient`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/auth-client.ts
git commit -m "feat(web): re-export forgetPassword + resetPassword from auth-client"
```

---

## Task 2: i18n keys (en + es parity)

**Files:** Modify `apps/web/src/i18n/en.ts` and `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Add new keys to `apps/web/src/i18n/en.ts`**

In the existing `auth: { … }` group, add these lines (place them at the end of the group, just before the closing `},`):

```ts
    forgotTitle: "Reset your password",
    forgotIntro: "Enter the email for your account and we'll send a reset link.",
    forgotSubmit: "Send reset link",
    forgotPending: "Sending…",
    forgotSuccessTitle: "Check your inbox",
    forgotSuccessBody:
      "If that email is registered, you'll receive a reset link shortly. Check your spam folder too.",
    forgotLink: "Forgot password?",
    backToLogin: "Back to log in",
    resetTitle: "Set a new password",
    resetSubmit: "Update password",
    resetPending: "Updating…",
    newPassword: "New password",
    confirmPassword: "Confirm password",
    passwordTooShort: "Must be at least 8 characters",
    passwordsMismatch: "Passwords don't match",
    resetSuccess: "Password updated. Sign in with your new password.",
    resetInvalidLink: "This reset link is missing or invalid. Request a new one.",
    resetFailed: "Could not reset the password.",
```

- [ ] **Step 2: Add parity in `apps/web/src/i18n/es.ts`**

In the `auth: { … }` group of `es.ts`, append (matching positions/order; same final-position-before-`},` as in en.ts):

```ts
    forgotTitle: "Restablecer contraseña",
    forgotIntro: "Ingresa el correo de tu cuenta y te enviaremos un enlace para restablecerla.",
    forgotSubmit: "Enviar enlace",
    forgotPending: "Enviando…",
    forgotSuccessTitle: "Revisa tu correo",
    forgotSuccessBody:
      "Si ese correo está registrado, recibirás un enlace en breve. Revisa también la carpeta de spam.",
    forgotLink: "¿Olvidaste tu contraseña?",
    backToLogin: "Volver a iniciar sesión",
    resetTitle: "Define una nueva contraseña",
    resetSubmit: "Actualizar contraseña",
    resetPending: "Actualizando…",
    newPassword: "Nueva contraseña",
    confirmPassword: "Confirmar contraseña",
    passwordTooShort: "Debe tener al menos 8 caracteres",
    passwordsMismatch: "Las contraseñas no coinciden",
    resetSuccess: "Contraseña actualizada. Inicia sesión con tu nueva contraseña.",
    resetInvalidLink: "Este enlace no es válido o ya expiró. Solicita uno nuevo.",
    resetFailed: "No se pudo restablecer la contraseña.",
```

- [ ] **Step 3: Typecheck (parity guard)**

Run: `pnpm --filter @turingcare/web typecheck`
Expected: no errors. The existing `i18n/types.ts` parity infrastructure enforces that every key in `en` exists in `es` and vice-versa; if a key is missing on one side, tsc fails with a structural-type mismatch.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): i18n keys for password reset flow (en+es parity)"
```

---

## Task 3: `/forgot-password` page (TDD)

**Files:** Create `apps/web/src/routes/forgot-password.tsx`, `apps/web/src/routes/forgot-password.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/routes/forgot-password.test.tsx`:

```tsx
import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const forgetPasswordMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  forgetPassword: (...a: unknown[]) => forgetPasswordMock(...a),
}));

const { ForgotPassword } = await import("./forgot-password");

beforeEach(() => forgetPasswordMock.mockReset());
afterEach(() => vi.restoreAllMocks());

function setup() {
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

it("renders the form with a back-to-login link", () => {
  setup();
  expect(screen.getByRole("heading", { name: /reset your password/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /send reset link/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /back to log in/i })).toHaveAttribute("href", "/login");
});

it("submits with email + redirectTo, then shows the success view (resolved)", async () => {
  forgetPasswordMock.mockResolvedValue({ data: null, error: null });
  setup();
  await userEvent.type(screen.getByLabelText(/email/i), "u@example.com");
  await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

  expect(forgetPasswordMock).toHaveBeenCalledOnce();
  const arg = forgetPasswordMock.mock.calls[0]?.[0] as { email: string; redirectTo: string };
  expect(arg.email).toBe("u@example.com");
  expect(arg.redirectTo).toMatch(/\/reset-password$/);

  expect(await screen.findByRole("heading", { name: /check your inbox/i })).toBeInTheDocument();
});

it("shows the same success view even if the API rejects (anti-enumeration)", async () => {
  forgetPasswordMock.mockRejectedValue(new Error("not found"));
  setup();
  await userEvent.type(screen.getByLabelText(/email/i), "u@example.com");
  await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));
  expect(await screen.findByRole("heading", { name: /check your inbox/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/forgot-password.test.tsx`
Expected: FAIL — cannot find module `./forgot-password`.

- [ ] **Step 3: Implement**

Create `apps/web/src/routes/forgot-password.tsx`:

```tsx
import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { forgetPassword } from "@/lib/auth-client";
import { useState } from "react";
import { Link } from "react-router-dom";

export function ForgotPassword() {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    setPending(true);
    // Anti-enumeration: we don't surface API errors — the success view renders
    // regardless of whether the email is registered.
    try {
      await forgetPassword({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // intentionally swallowed
    }
    setPending(false);
    setSent(true);
  }

  return (
    <div className="relative p-8 max-w-sm mx-auto">
      <LanguageToggle className="absolute right-4 top-4" />
      <Link to="/" className="mb-6 flex justify-center">
        <BrandMark />
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{sent ? t("auth.forgotSuccessTitle") : t("auth.forgotTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("auth.forgotSuccessBody")}</p>
              <Link className="underline text-sm" to="/login">
                {t("auth.backToLogin")}
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("auth.forgotIntro")}</p>
              <div className="space-y-1">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
                {pending ? t("auth.forgotPending") : t("auth.forgotSubmit")}
              </Button>
              <p className="text-sm text-muted-foreground">
                <Link className="underline" to="/login">
                  {t("auth.backToLogin")}
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/forgot-password.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/forgot-password.tsx apps/web/src/routes/forgot-password.test.tsx
git commit -m "feat(web): /forgot-password page (anti-enumeration)"
```

---

## Task 4: `/reset-password` page (TDD)

**Files:** Create `apps/web/src/routes/reset-password.tsx`, `apps/web/src/routes/reset-password.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/routes/reset-password.test.tsx`:

```tsx
import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const resetPasswordMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  resetPassword: (...a: unknown[]) => resetPasswordMock(...a),
}));
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
}));

const { ResetPassword } = await import("./reset-password");

beforeEach(() => {
  resetPasswordMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

function setup(initialPath: string) {
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/login" element={<div>login-page</div>} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  );
}

it("with no token: shows invalid-link state + link to /forgot-password; no API call", () => {
  setup("/reset-password");
  expect(screen.getByText(/this reset link is missing or invalid/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /forgot password\?|reset your password/i })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
  expect(screen.queryByLabelText(/new password/i)).toBeNull();
  expect(resetPasswordMock).not.toHaveBeenCalled();
});

it("with token: form renders", () => {
  setup("/reset-password?token=abc");
  expect(screen.getByRole("heading", { name: /set a new password/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
});

it("short password: inline error, no API call", async () => {
  setup("/reset-password?token=abc");
  await userEvent.type(screen.getByLabelText(/new password/i), "short");
  await userEvent.type(screen.getByLabelText(/confirm password/i), "short");
  await userEvent.click(screen.getByRole("button", { name: /update password/i }));
  expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
  expect(resetPasswordMock).not.toHaveBeenCalled();
});

it("mismatched confirm: inline error, no API call", async () => {
  setup("/reset-password?token=abc");
  await userEvent.type(screen.getByLabelText(/new password/i), "password-123");
  await userEvent.type(screen.getByLabelText(/confirm password/i), "different-456");
  await userEvent.click(screen.getByRole("button", { name: /update password/i }));
  expect(screen.getByText(/passwords don't match/i)).toBeInTheDocument();
  expect(resetPasswordMock).not.toHaveBeenCalled();
});

it("valid submit: calls resetPassword and navigates to /login on success", async () => {
  resetPasswordMock.mockResolvedValue({ data: { status: true }, error: null });
  setup("/reset-password?token=abc");
  await userEvent.type(screen.getByLabelText(/new password/i), "password-123");
  await userEvent.type(screen.getByLabelText(/confirm password/i), "password-123");
  await userEvent.click(screen.getByRole("button", { name: /update password/i }));
  expect(resetPasswordMock).toHaveBeenCalledWith({ newPassword: "password-123", token: "abc" });
  expect(await screen.findByText("login-page")).toBeInTheDocument();
  expect(toastSuccessMock).toHaveBeenCalled();
});

it("API error: surfaces a toast and stays on the page", async () => {
  resetPasswordMock.mockResolvedValue({ data: null, error: { message: "bad" } });
  setup("/reset-password?token=abc");
  await userEvent.type(screen.getByLabelText(/new password/i), "password-123");
  await userEvent.type(screen.getByLabelText(/confirm password/i), "password-123");
  await userEvent.click(screen.getByRole("button", { name: /update password/i }));
  expect(toastErrorMock).toHaveBeenCalledWith(expect.stringContaining("bad"));
  expect(screen.queryByText("login-page")).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/reset-password.test.tsx`
Expected: FAIL — cannot find module `./reset-password`.

- [ ] **Step 3: Implement**

Create `apps/web/src/routes/reset-password.tsx`:

```tsx
import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { resetPassword } from "@/lib/auth-client";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

export function ResetPassword() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");

  const [pending, setPending] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="relative p-8 max-w-sm mx-auto">
        <LanguageToggle className="absolute right-4 top-4" />
        <Link to="/" className="mb-6 flex justify-center">
          <BrandMark />
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>{t("auth.forgotTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("auth.resetInvalidLink")}</p>
            <Link className="underline text-sm" to="/forgot-password">
              {t("auth.forgotTitle")}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwError(null);
    setConfirmError(null);
    const fd = new FormData(e.currentTarget);
    const newPassword = String(fd.get("newPassword"));
    const confirm = String(fd.get("confirmPassword"));

    if (newPassword.length < 8) {
      setPwError(t("auth.passwordTooShort"));
      return;
    }
    if (newPassword !== confirm) {
      setConfirmError(t("auth.passwordsMismatch"));
      return;
    }

    setPending(true);
    const { error } = await resetPassword({ newPassword, token: token! });
    setPending(false);
    if (error) {
      toast.error(error.message ?? t("auth.resetFailed"));
      return;
    }
    toast.success(t("auth.resetSuccess"));
    navigate("/login");
  }

  return (
    <div className="relative p-8 max-w-sm mx-auto">
      <LanguageToggle className="absolute right-4 top-4" />
      <Link to="/" className="mb-6 flex justify-center">
        <BrandMark />
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.resetTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1">
              <Label htmlFor="newPassword">{t("auth.newPassword")}</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                minLength={8}
                aria-invalid={pwError ? true : undefined}
                aria-describedby={pwError ? "newPassword-error" : undefined}
                required
              />
              {pwError && (
                <p id="newPassword-error" className="text-sm text-destructive">
                  {pwError}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                aria-invalid={confirmError ? true : undefined}
                aria-describedby={confirmError ? "confirmPassword-error" : undefined}
                required
              />
              {confirmError && (
                <p id="confirmPassword-error" className="text-sm text-destructive">
                  {confirmError}
                </p>
              )}
            </div>
            <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
              {pending ? t("auth.resetPending") : t("auth.resetSubmit")}
            </Button>
            <p className="text-sm text-muted-foreground">
              <Link className="underline" to="/login">
                {t("auth.backToLogin")}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

> Note: the `noValidate` on the form is intentional — we want our client-side
> rules (min 8 + matches) to fire deterministically in tests instead of the
> browser's HTML5 validation popup.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/reset-password.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/reset-password.tsx apps/web/src/routes/reset-password.test.tsx
git commit -m "feat(web): /reset-password page (token-driven, validated)"
```

---

## Task 5: `Forgot password?` link on `/login` (TDD)

**Files:** Modify `apps/web/src/routes/login.tsx`, Create `apps/web/src/routes/login.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/routes/login.test.tsx`:

```tsx
import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
  signIn: { email: vi.fn() },
}));

const { Login } = await import("./login");

it("renders a Forgot password? link pointing at /forgot-password", () => {
  render(
    <LocaleProvider>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </LocaleProvider>,
  );
  expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/login.test.tsx`
Expected: FAIL — no link with name `/forgot password/i`.

- [ ] **Step 3: Add the link to `login.tsx`**

In `apps/web/src/routes/login.tsx`, locate the password-field `<div className="space-y-1">…<Input id="password" …/></div>` block. Immediately AFTER that closing `</div>` (and BEFORE the `<Button type="submit" …>` line), insert:

```tsx
            <div className="text-right -mt-2">
              <Link className="underline text-sm text-muted-foreground" to="/forgot-password">
                {t("auth.forgotLink")}
              </Link>
            </div>
```

The existing imports already include `Link` from `react-router-dom` and `useI18n` — no new imports needed.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/login.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/login.tsx apps/web/src/routes/login.test.tsx
git commit -m "feat(web): add Forgot password? link on /login"
```

---

## Task 6: Register routes in `main.tsx`

**Files:** Modify `apps/web/src/main.tsx`

- [ ] **Step 1: Add imports**

In `apps/web/src/main.tsx`, near the other route imports (the `import { Login } from "@/routes/login";` style block), add:

```ts
import { ForgotPassword } from "@/routes/forgot-password";
import { ResetPassword } from "@/routes/reset-password";
```

- [ ] **Step 2: Register the two routes**

In the `<Routes>` block, after the existing `<Route path="/register" element={<Register />} />` line and BEFORE the `<Route element={<RequireAuth>…` block (so they stay public), add:

```tsx
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
```

- [ ] **Step 3: Typecheck + full web suite**

Run: `pnpm --filter @turingcare/web typecheck && pnpm --filter @turingcare/web test`
Expected: typecheck clean; all web tests green (forgot/reset/login + every existing suite).

- [ ] **Step 4: Build**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web build`
Expected: vite build succeeds (the chunk-size warning from recharts is pre-existing, not a failure).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/main.tsx
git commit -m "feat(web): register /forgot-password + /reset-password routes"
```

---

## Task 7: Full gate + PROJECT-LOG entry

**Files:** Modify `docs/PROJECT-LOG.md`

- [ ] **Step 1: Run the full monorepo gate**

Run:
```bash
set -a && . ./.env && set +a
pnpm biome check . && pnpm -r exec tsc --noEmit && pnpm -r test && pnpm -r build
```
Expected: lint clean, typecheck clean, all tests pass, both apps build. Apply biome `--write` for formatting-only fallout and re-run if needed.

- [ ] **Step 2: Append the PROJECT-LOG entry**

Append to `docs/PROJECT-LOG.md` (after the most recent entry, before the trailing newline):

```markdown
## 2026-05-20 — Password reset frontend (P3) — SHIPPED
Security backlog P3. `/forgot-password` (single email field, calls
`forgetPassword({ email, redirectTo: <origin>/reset-password })`, anti-
enumeration generic success view) + `/reset-password` (token from `?token=`,
two-field form min-8 + matches, calls `resetPassword({ newPassword, token })`,
toast + redirect `/login` on success, invalid-link state when no token) +
`Forgot password?` link on `/login`. Re-exports `forgetPassword` +
`resetPassword` from `auth-client.ts`; new i18n keys with en+es parity (typed
guard). No backend changes — uses the email pipe shipped in P1. Full TDD.
- Spec/plan: `specs/2026-05-20-password-reset-frontend-design.md`, `plans/2026-05-20-password-reset-frontend.md`
- Commits: this branch (see `git log`). Bundled in the worktree-feat+transactional-email PR.
```

- [ ] **Step 3: Commit**

```bash
git add docs/PROJECT-LOG.md
git commit -m "docs: PROJECT-LOG entry for password reset frontend (P3)"
```

> The branch is **not** finished here. The unrelated language-toggle redesign (top-right + 🇺🇸/🇲🇽 flags) ships in the same PR via its own brainstorm/plan/build cycle next; the `finishing-a-development-branch` step runs once *that* work is also in.

---

## Self-Review

**Spec coverage:**
- §2 `auth-client.ts` re-exports → Task 1 ✓ · §2 i18n keys en+es → Task 2 ✓ · §2/§3.1 `/forgot-password` page (anti-enumeration, redirectTo, success view, back-to-login) → Task 3 ✓ · §2/§3.2 `/reset-password` (no-token invalid state, token form, min-8, match, success→/login, toast on error) → Task 4 ✓ · §3.3 `/login` link → Task 5 ✓ · §2 routes registered as public → Task 6 ✓ · §4 a11y (`aria-invalid`/`aria-describedby`/`aria-busy`) → Tasks 3, 4 ✓ · §5 testing — forgot (renders, calls with redirectTo, anti-enumeration both branches), reset (no-token, form, short, mismatch, valid→/login+toast, error→toast+stays), login (link) — Tasks 3, 4, 5 ✓ · §6 scope kept (no auto-sign-in, no rate-limit countdown, no strength meter) ✓ · §7 deliverable order preserved.
- No spec requirement left without a task.

**Placeholder scan:** No TBD/TODO/"handle edge cases". Every code step is complete; every run step has an exact command + expected outcome.

**Type consistency:** `forgetPassword` / `resetPassword` referenced as `authClient` properties in Task 1 and consumed in Tasks 3, 4 (and mocked at the same import paths in their tests). `t("auth.X")` keys used in pages (Tasks 3, 4, 5) all exist in the en/es definitions added in Task 2. The `ResetPassword`/`ForgotPassword` component names and their file paths match across creation (Tasks 3, 4) and registration (Task 6).
