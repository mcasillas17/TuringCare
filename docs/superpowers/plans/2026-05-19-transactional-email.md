# Transactional Email Provider (P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the API a reusable, provider-isolated `sendEmail` capability (Resend) and wire Better Auth's verification + password-reset email callbacks — with no user-facing behavior change (`requireEmailVerification` stays OFF).

**Architecture:** One provider seam: `email/send-email.ts` (only file importing the `resend` SDK; dependency-injectable; logs instead of sending when `RESEND_API_KEY` is unset) + pure `email/templates.ts`. Better Auth callbacks call `sendEmail` wrapped in swallow-on-error so a flaky provider can't break sign-up or `/forget-password`.

**Tech Stack:** Hono, Better Auth, Drizzle, Zod, `resend` SDK, Vitest. Vitest auto-loads `.env`; Postgres `turingcare-postgres` running. No network in tests; CI never sends.

**Spec:** `docs/superpowers/specs/2026-05-19-transactional-email-design.md`

---

## File Structure

- `apps/api/package.json` *(modify)* — add `resend` dependency.
- `apps/api/src/env.ts` *(modify)* — `RESEND_API_KEY` (optional), `EMAIL_FROM` (defaulted).
- `.env.example` *(modify)* — document both, key blank locally.
- `apps/api/src/email/templates.ts` *(create)* — pure `verificationEmail` / `passwordResetEmail` builders.
- `apps/api/src/email/templates.test.ts` *(create)*.
- `apps/api/src/email/send-email.ts` *(create)* — `sendEmail` + `EmailSendError`, DI seam, dev log fallback.
- `apps/api/src/email/send-email.test.ts` *(create)*.
- `apps/api/src/auth.ts` *(modify)* — wire `sendResetPassword` + `emailVerification.sendVerificationEmail`, swallow-on-error.
- `apps/api/src/auth-email.test.ts` *(create)* — integration: callback fires on sign-up; throw doesn't fail sign-up.
- `DEPLOY.md` *(modify)* — secrets table + operator DNS/secret checklist.
- `docs/PROJECT-LOG.md` *(modify)* — phase entry.

---

## Task 1: Dependency + env + .env.example

**Files:** Modify `apps/api/package.json` (via pnpm), `apps/api/src/env.ts`, `.env.example`

- [ ] **Step 1: Add the Resend SDK**

Run: `pnpm --filter @turingcare/api add resend`
Expected: `resend` appears in `apps/api/package.json` dependencies; root `pnpm-lock.yaml` updates.

- [ ] **Step 2: Add env vars**

In `apps/api/src/env.ts`, add inside the `z.object({ … })` immediately after the `EVENT_RETENTION_DAYS` line:

```ts
  // Resend API key. UNSET locally/CI → email runs in log-only mode (no network,
  // no real send). Set as a Fly secret in production.
  RESEND_API_KEY: z.string().optional(),
  // From address for all transactional email. Prod uses the verified
  // send.turingcare.dog subdomain; local default is a harmless placeholder.
  EMAIL_FROM: z.string().default("TuringCare <noreply@send.turingcare.dog>"),
```

- [ ] **Step 3: Document in `.env.example`**

Append to `.env.example`:

```
# ---- Transactional email (Resend) ----
# Leave BLANK locally/CI → emails are logged, not sent. In prod set as a Fly
# secret (see DEPLOY.md). Domain send.turingcare.dog must be verified in Resend.
RESEND_API_KEY=
EMAIL_FROM=TuringCare <noreply@send.turingcare.dog>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @turingcare/api typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/env.ts .env.example
git commit -m "feat(api): add resend dep + RESEND_API_KEY/EMAIL_FROM env"
```

---

## Task 2: Email templates (TDD)

**Files:** Create `apps/api/src/email/templates.ts`, `apps/api/src/email/templates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/email/templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { passwordResetEmail, verificationEmail } from "./templates";

const URL = "https://api.turingcare.dog/api/auth/verify?token=abc123";

function assertShape(out: { subject: string; html: string; text: string }) {
  expect(out.subject.trim().length).toBeGreaterThan(0);
  expect(out.html.trim().length).toBeGreaterThan(0);
  expect(out.text.trim().length).toBeGreaterThan(0);
  // URL embedded exactly once in both bodies
  expect(out.html.split(URL).length - 1).toBe(1);
  expect(out.text.split(URL).length - 1).toBe(1);
  // no unsubstituted template markers
  expect(out.html).not.toMatch(/\$\{|\{\{|TODO/);
  expect(out.text).not.toMatch(/\$\{|\{\{|TODO/);
}

describe("email templates", () => {
  it("verificationEmail has subject/html/text and embeds the url once", () => {
    assertShape(verificationEmail(URL));
  });
  it("passwordResetEmail has subject/html/text and embeds the url once", () => {
    assertShape(passwordResetEmail(URL));
  });
  it("the two templates have distinct subjects", () => {
    expect(verificationEmail(URL).subject).not.toBe(passwordResetEmail(URL).subject);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/api exec vitest run src/email/templates.test.ts`
Expected: FAIL — cannot find module `./templates`.

- [ ] **Step 3: Implement**

Create `apps/api/src/email/templates.ts`:

```ts
export interface EmailBody {
  subject: string;
  html: string;
  text: string;
}

function layout(heading: string, intro: string, cta: string, url: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f5f3;font-family:ui-sans-serif,system-ui,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">${heading}</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6">${intro}</p>
<p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#b45309;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600">${cta}</a></p>
<p style="margin:0;font-size:12px;color:#6b7280;word-break:break-all">If the button does not work, paste this link into your browser:<br>${url}</p>
</td></tr></table>
<p style="margin:16px 0 0;font-size:11px;color:#9ca3af">TuringCare · humane, reward-based dog training support</p>
</td></tr></table></body></html>`;
}

export function verificationEmail(url: string): EmailBody {
  return {
    subject: "Verify your TuringCare email",
    html: layout(
      "Confirm your email",
      "Welcome to TuringCare. Confirm this address to secure your account.",
      "Verify email",
      url,
    ),
    text: `Welcome to TuringCare.\n\nConfirm your email address:\n${url}\n\nIf you didn't create an account, you can ignore this message.`,
  };
}

export function passwordResetEmail(url: string): EmailBody {
  return {
    subject: "Reset your TuringCare password",
    html: layout(
      "Reset your password",
      "We received a request to reset your TuringCare password. This link expires soon.",
      "Reset password",
      url,
    ),
    text: `Reset your TuringCare password:\n${url}\n\nIf you didn't request this, you can safely ignore this message.`,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @turingcare/api exec vitest run src/email/templates.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/email/templates.ts apps/api/src/email/templates.test.ts
git commit -m "feat(api): verification + password-reset email templates"
```

---

## Task 3: `sendEmail` with DI seam + dev log fallback (TDD)

**Files:** Create `apps/api/src/email/send-email.ts`, `apps/api/src/email/send-email.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/email/send-email.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailSendError, type ResendLike, sendEmail } from "./send-email";

const ARGS = { to: "u@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" };

afterEach(() => vi.restoreAllMocks());

describe("sendEmail", () => {
  it("logs and does NOT call a client when no api key", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const client: ResendLike = { emails: { send: vi.fn() } };
    await sendEmail(ARGS, { client, apiKey: undefined, from: "F <f@x.com>" });
    expect(client.emails.send).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("[email:dev]", { to: ARGS.to, subject: ARGS.subject });
  });

  it("sends via the client when an api key is present", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null });
    await sendEmail(ARGS, { client: { emails: { send } }, apiKey: "re_x", from: "F <f@x.com>" });
    expect(send).toHaveBeenCalledWith({
      from: "F <f@x.com>",
      to: ARGS.to,
      subject: ARGS.subject,
      html: ARGS.html,
      text: ARGS.text,
    });
  });

  it("throws EmailSendError when the provider returns an error", async () => {
    const send = vi.fn().mockResolvedValue({ data: null, error: { message: "bad", statusCode: 422 } });
    await expect(
      sendEmail(ARGS, { client: { emails: { send } }, apiKey: "re_x", from: "F <f@x.com>" }),
    ).rejects.toBeInstanceOf(EmailSendError);
  });

  it("throws EmailSendError when the client rejects", async () => {
    const send = vi.fn().mockRejectedValue(new Error("network"));
    await expect(
      sendEmail(ARGS, { client: { emails: { send } }, apiKey: "re_x", from: "F <f@x.com>" }),
    ).rejects.toBeInstanceOf(EmailSendError);
  });

  it("throws EmailSendError on empty to/subject and never calls the client", async () => {
    const send = vi.fn();
    await expect(
      sendEmail({ ...ARGS, to: "" }, { client: { emails: { send } }, apiKey: "re_x", from: "f" }),
    ).rejects.toBeInstanceOf(EmailSendError);
    expect(send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/api exec vitest run src/email/send-email.test.ts`
Expected: FAIL — cannot find module `./send-email`.

- [ ] **Step 3: Implement**

Create `apps/api/src/email/send-email.ts`:

```ts
import { Resend } from "resend";
import { env } from "../env";

export class EmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailSendError";
  }
}

/** Minimal seam over the Resend SDK so the provider is swappable + testable. */
export interface ResendLike {
  emails: {
    send(args: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    }): Promise<{ data: unknown; error: unknown }>;
  };
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailDeps {
  client?: ResendLike;
  apiKey?: string;
  from?: string;
}

/**
 * Deliver one transactional email. Provider-isolated. With no API key
 * (local/CI) it logs and resolves — no network, never throws. With a key it
 * sends via Resend and throws EmailSendError on any provider/transport failure.
 */
export async function sendEmail(args: SendEmailArgs, deps: SendEmailDeps = {}): Promise<void> {
  if (!args.to.trim() || !args.subject.trim()) {
    throw new EmailSendError("sendEmail: 'to' and 'subject' are required");
  }

  const apiKey = "apiKey" in deps ? deps.apiKey : env.RESEND_API_KEY;
  const from = deps.from ?? env.EMAIL_FROM;

  if (!apiKey) {
    console.info("[email:dev]", { to: args.to, subject: args.subject });
    return;
  }

  const client: ResendLike = deps.client ?? (new Resend(apiKey) as unknown as ResendLike);

  let result: { data: unknown; error: unknown };
  try {
    result = await client.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
  } catch (cause) {
    throw new EmailSendError(
      `sendEmail: transport failure: ${cause instanceof Error ? cause.message : "unknown"}`,
    );
  }
  if (result.error) {
    const e = result.error as { message?: string; statusCode?: number };
    throw new EmailSendError(`sendEmail: provider error ${e.statusCode ?? "?"}: ${e.message ?? "unknown"}`);
  }
}
```

> Note the `"apiKey" in deps` check: tests pass `apiKey: undefined` explicitly to force log mode even while injecting a client; production callers pass no `deps` so it falls back to `env.RESEND_API_KEY`.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @turingcare/api exec vitest run src/email/send-email.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/email/send-email.ts apps/api/src/email/send-email.test.ts
git commit -m "feat(api): provider-isolated sendEmail with dev log fallback"
```

---

## Task 4: Wire Better Auth callbacks + integration test (TDD)

**Files:** Modify `apps/api/src/auth.ts`; Create `apps/api/src/auth-email.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/src/auth-email.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.fn();
vi.mock("./email/send-email", () => ({
  EmailSendError: class EmailSendError extends Error {},
  sendEmail: (...a: unknown[]) => sendEmailMock(...a),
}));

// Imported AFTER the mock is registered.
const { app } = await import("./app");
const { db } = await import("./db");
const { user } = await import("./db/schema");

const email = `mail_${Date.now()}@example.com`;

afterEach(() => sendEmailMock.mockReset());
afterAll(async () => {
  await db.delete(user).where(eq(user.email, email));
});

describe("auth email wiring", () => {
  it("sends a verification email to the new user on sign-up", async () => {
    sendEmailMock.mockResolvedValue(undefined);
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Mail", email, password: "password-123" }),
    });
    expect(res.status).toBeLessThan(400);
    expect(sendEmailMock).toHaveBeenCalled();
    const firstArg = sendEmailMock.mock.calls[0]?.[0] as { to: string; subject: string };
    expect(firstArg.to).toBe(email);
    expect(firstArg.subject.length).toBeGreaterThan(0);
  });

  it("a failing sendEmail does NOT break sign-up", async () => {
    const email2 = `mail2_${Date.now()}@example.com`;
    sendEmailMock.mockRejectedValue(new Error("provider down"));
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Mail2", email: email2, password: "password-123" }),
    });
    expect(res.status).toBeLessThan(400);
    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email2));
    expect(u).toBeTruthy();
    await db.delete(user).where(eq(user.email, email2));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/api exec vitest run src/auth-email.test.ts`
Expected: FAIL — `sendEmailMock` not called (no callbacks wired yet).

- [ ] **Step 3: Wire the callbacks**

In `apps/api/src/auth.ts`, add the import near the other local imports:

```ts
import { sendEmail } from "./email/send-email";
import { passwordResetEmail, verificationEmail } from "./email/templates";
```

Change `emailAndPassword: { enabled: true },` to:

```ts
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      try {
        await sendEmail({ to: user.email, ...passwordResetEmail(url) });
      } catch (err) {
        console.error("[auth] sendResetPassword failed", {
          userId: user.id,
          err: err instanceof Error ? err.message : "unknown",
        });
      }
    },
  },
```

Add this top-level option to the `betterAuth({ … })` config, immediately after the `emailAndPassword` block:

```ts
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      try {
        await sendEmail({ to: user.email, ...verificationEmail(url) });
      } catch (err) {
        console.error("[auth] sendVerificationEmail failed", {
          userId: user.id,
          err: err instanceof Error ? err.message : "unknown",
        });
      }
    },
  },
```

> Do NOT add `requireEmailVerification`. Behavior stays: accounts usable immediately; this only makes the senders fire.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @turingcare/api exec vitest run src/auth-email.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Full API suite + typecheck (no regressions)**

Run: `pnpm --filter @turingcare/api test && pnpm --filter @turingcare/api typecheck`
Expected: all PASS (existing auth-events / require-admin / admin / events-route suites still green), no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth.ts apps/api/src/auth-email.test.ts
git commit -m "feat(api): wire Better Auth verification + reset email callbacks"
```

---

## Task 5: DEPLOY.md secrets + operator checklist

**Files:** Modify `DEPLOY.md`

- [ ] **Step 1: Add the two secrets to the Fly secrets table**

In `DEPLOY.md`, in the **"Fly secrets required:"** table (the one with `DATABASE_URL` / `BETTER_AUTH_SECRET` / …), add two rows:

```
| `RESEND_API_KEY` | Resend API key (domain `send.turingcare.dog` verified) |
| `EMAIL_FROM` | `TuringCare <noreply@send.turingcare.dog>` |
```

And add `RESEND_API_KEY` + `EMAIL_FROM` to the `fly secrets set --app turingcare-api \` example block (append two `\`-continued lines mirroring the table values).

- [ ] **Step 2: Add the operator checklist**

In `DEPLOY.md`, add a new subsection (place it right after the Fly-secrets section):

```markdown
### Transactional email (Resend) — one-time setup

Until these are done, production runs email in **log-only mode** (no crash, no
mail). Deploy is not blocked by DNS propagation.

1. Create a Resend account; create an API key.
2. In Resend, add domain `send.turingcare.dog`. Add the generated **SPF**,
   **DKIM**, and a **DMARC** record to Cloudflare DNS for `turingcare.dog`.
   Wait until Resend shows the domain **Verified**.
3. Set the Fly secrets:
   ```bash
   fly secrets set --app turingcare-api \
     RESEND_API_KEY='re_...' \
     EMAIL_FROM='TuringCare <noreply@send.turingcare.dog>'
   ```
4. Verify: trigger `/forget-password` for a test account and confirm delivery
   (check Resend dashboard logs).
```

- [ ] **Step 3: Commit**

```bash
git add DEPLOY.md
git commit -m "docs: Resend secrets + domain-verification deploy checklist"
```

---

## Task 6: Full gate + PROJECT-LOG + finish branch

**Files:** Modify `docs/PROJECT-LOG.md`

- [ ] **Step 1: Run the full gate (mirrors CI)**

Run:
```bash
set -a && . ./.env && set +a
pnpm biome check . && pnpm -r exec tsc --noEmit && pnpm -r test && pnpm -r build
```
Expected: lint clean, no type errors, all tests pass, both apps build. Fix any failure (re-run after biome `--write` if it only reformats) before continuing — do not proceed with a red gate.

- [ ] **Step 2: Add the PROJECT-LOG entry**

Append to `docs/PROJECT-LOG.md` (newest at the bottom):

```markdown
## 2026-05-19 — Transactional email provider (P1) — SHIPPED
Provider-isolated `sendEmail` (Resend SDK) with a log-only no-op fallback when
`RESEND_API_KEY` is unset (local/CI never send, no network); pure
verification/reset HTML+text templates; Better Auth `sendResetPassword` +
`emailVerification.sendVerificationEmail` (`sendOnSignUp:true`) wired with
swallow-on-error so a flaky provider can't break sign-up or `/forget-password`.
`requireEmailVerification` stays OFF — no user-facing change. `RESEND_API_KEY`
+ `EMAIL_FROM` env/Fly secrets + DEPLOY.md domain-verification checklist.
Unblocks P2 (email verification) and P3 (password recovery).
- Spec/plan: `specs/2026-05-19-transactional-email-design.md`, `plans/2026-05-19-transactional-email.md`
- Commits: this branch (see `git log`).
```

- [ ] **Step 3: Commit**

```bash
git add docs/PROJECT-LOG.md
git commit -m "docs: PROJECT-LOG entry for transactional email provider (P1)"
```

- [ ] **Step 4: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to open the PR (worktree/PR workflow — no direct-to-main). Note in the PR body: no behavior change until the operator completes the Resend/Cloudflare/Fly checklist and P2/P3 land.

---

## Self-Review

**Spec coverage:**
- §2 `send-email.ts` (DI, dev fallback, EmailSendError) → Task 3 ✓ · §2 `templates.ts` → Task 2 ✓ · §2 env (`RESEND_API_KEY`, `EMAIL_FROM`) + `resend` dep → Task 1 ✓ · §3 Better Auth `sendResetPassword` + `emailVerification.sendVerificationEmail` + `sendOnSignUp`, no `requireEmailVerification` → Task 4 ✓ · §4 swallow-on-error in callbacks, no secrets logged → Task 4 ✓ · §4 dev path never throws/networks, provider error → `EmailSendError` → Task 3 ✓ · §5 `.env.example` + `DEPLOY.md` table + operator checklist → Tasks 1, 5 ✓ · §6 templates/send-email/auth-email tests → Tasks 2,3,4 ✓ · §6 full gate → Task 6 ✓ · §7 deliverable order preserved.
- No spec requirement left without a task.

**Placeholder scan:** No TBD/TODO/"handle errors" — every code step has complete code; every run step has an exact command + expected result. (The template test asserts the *absence* of literal `TODO`/`${`/`{{` markers — intentional, not a plan placeholder.)

**Type consistency:** `EmailBody` (templates.ts) consumed via spread into `SendEmailArgs` (`{ subject, html, text }` + `to`) — shapes align. `ResendLike.emails.send` signature identical in `send-email.ts` and its test. `SendEmailDeps` (`client?`, `apiKey?`, `from?`) consistent across impl + tests. `sendEmail(args, deps?)` call shape in Task 4 (`sendEmail({ to, ...templateBody })`, no deps → uses env) matches the Task 3 signature. The `vi.mock("./email/send-email")` in Task 4 mirrors the real export names (`sendEmail`, `EmailSendError`).
