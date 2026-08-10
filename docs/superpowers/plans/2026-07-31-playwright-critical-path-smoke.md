# Playwright Beta Smoke Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable desktop/mobile browser coverage for TuringCare's critical owner journey and a read-only production smoke that runs after deployment and daily.

**Architecture:** Add Playwright at the monorepo root. Local/CI E2E starts the existing API and web apps against disposable Postgres and captures verification emails through an environment-gated in-memory outbox exposed only by a guarded test route. Production smoke uses a separate config, a dedicated verified account from GitHub secrets, and performs no mutations.

**Tech Stack:** Playwright Test, React/Vite, Hono, Better Auth, Postgres, GitHub Actions

---

## File Structure

- Modify: `package.json` — Playwright dependency and E2E scripts.
- Modify: `pnpm-lock.yaml` — resolved Playwright dependency.
- Create: `playwright.config.ts` — local/CI desktop and phone projects plus web servers.
- Create: `playwright.production.config.ts` — production-only read-only configuration.
- Create: `e2e/critical-owner-journey.spec.ts` — registration through private Brief link.
- Create: `e2e/production-smoke.spec.ts` — public health and authenticated read-only checks.
- Modify: `apps/api/src/env.ts` — validated `E2E_TEST_MODE`.
- Create: `apps/api/src/email/test-outbox.ts` — bounded in-memory email capture.
- Create: `apps/api/src/email/test-outbox.test.ts` — outbox behavior.
- Modify: `apps/api/src/email/send-email.ts` — capture instead of send in E2E mode.
- Modify: `apps/api/src/email/send-email.test.ts` — injected capture behavior.
- Create: `apps/api/src/routes/test-email.ts` — guarded test-only email lookup.
- Create: `apps/api/src/routes/test-email.test.ts` — disabled/enabled route behavior.
- Modify: `apps/api/src/app.ts` — mount the guarded test route.
- Modify: `.github/workflows/ci.yml` — disposable-Postgres E2E job.
- Create: `.github/workflows/production-smoke.yml` — post-deploy, daily, and manual smoke.
- Modify: `README.md` — document E2E commands and required production secrets.

### Task 1: Add Playwright Configuration

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `playwright.config.ts`
- Create: `playwright.production.config.ts`

- [ ] **Step 1: Install Playwright Test**

Run:

```bash
pnpm add -D @playwright/test
```

Expected: `package.json` contains `@playwright/test` in `devDependencies` and the
lockfile updates.

- [ ] **Step 2: Add root scripts**

Add these scripts to `package.json`:

```json
{
  "test:e2e": "playwright test --config playwright.config.ts",
  "test:e2e:production": "playwright test --config playwright.production.config.ts",
  "test:e2e:report": "playwright show-report"
}
```

- [ ] **Step 3: Create the local/CI config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "critical-owner-journey.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @turingcare/api dev",
      url: "http://127.0.0.1:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ...process.env, E2E_TEST_MODE: "true" },
    },
    {
      command: "pnpm --filter @turingcare/web dev",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: process.env,
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "phone-chromium",
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
      },
    },
  ],
});
```

- [ ] **Step 4: Create the production config**

Create `playwright.production.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "production-smoke.spec.ts",
  forbidOnly: true,
  retries: 2,
  workers: 1,
  reporter: [["github"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? "https://turingcare.dog",
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
```

- [ ] **Step 5: Verify Playwright discovers both configs**

Run:

```bash
pnpm exec playwright test --config playwright.config.ts --list
pnpm exec playwright test --config playwright.production.config.ts --list
```

Expected initially: both commands exit successfully and report zero tests.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts playwright.production.config.ts
git commit -m "test: add Playwright configurations"
```

### Task 2: Add the Guarded Test Email Outbox

**Files:**
- Modify: `apps/api/src/env.ts`
- Create: `apps/api/src/email/test-outbox.ts`
- Create: `apps/api/src/email/test-outbox.test.ts`
- Modify: `apps/api/src/email/send-email.ts`
- Modify: `apps/api/src/email/send-email.test.ts`

- [ ] **Step 1: Write the outbox tests**

Create `apps/api/src/email/test-outbox.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { captureTestEmail, findLatestTestEmail, resetTestOutbox } from "./test-outbox";

describe("test email outbox", () => {
  beforeEach(resetTestOutbox);

  it("returns the latest email for a recipient", () => {
    captureTestEmail({
      to: "owner@example.com",
      subject: "first",
      html: "<p>first</p>",
      text: "first",
    });
    captureTestEmail({
      to: "owner@example.com",
      subject: "second",
      html: "<p>second</p>",
      text: "second",
    });

    expect(findLatestTestEmail("OWNER@example.com")).toMatchObject({
      to: "owner@example.com",
      subject: "second",
    });
  });

  it("keeps at most 50 captured emails", () => {
    for (let i = 0; i < 55; i++) {
      captureTestEmail({
        to: `owner-${i}@example.com`,
        subject: String(i),
        html: "<p>test</p>",
        text: "test",
      });
    }

    expect(findLatestTestEmail("owner-0@example.com")).toBeNull();
    expect(findLatestTestEmail("owner-54@example.com")?.subject).toBe("54");
  });
});
```

- [ ] **Step 2: Run the outbox tests to verify failure**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/email/test-outbox.test.ts
```

Expected: FAIL because `./test-outbox` does not exist.

- [ ] **Step 3: Implement the bounded outbox**

Create `apps/api/src/email/test-outbox.ts`:

```ts
import type { SendEmailArgs } from "./send-email";

export type CapturedTestEmail = SendEmailArgs & { capturedAt: string };

const MAX_EMAILS = 50;
const messages: CapturedTestEmail[] = [];

export function captureTestEmail(args: SendEmailArgs): void {
  messages.push({ ...args, capturedAt: new Date().toISOString() });
  if (messages.length > MAX_EMAILS) messages.splice(0, messages.length - MAX_EMAILS);
}

export function findLatestTestEmail(to: string): CapturedTestEmail | null {
  const normalized = to.trim().toLowerCase();
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.to.trim().toLowerCase() === normalized) return message;
  }
  return null;
}

export function resetTestOutbox(): void {
  messages.length = 0;
}
```

- [ ] **Step 4: Add the E2E environment flag**

Add to the Zod object in `apps/api/src/env.ts`:

```ts
E2E_TEST_MODE: z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true"),
```

- [ ] **Step 5: Write the send-email capture test**

Add to `apps/api/src/email/send-email.test.ts`:

```ts
it("captures through an injected dev sink without contacting Resend", async () => {
  const captured: SendEmailArgs[] = [];
  const client = {
    emails: {
      send: vi.fn(),
    },
  };
  const email = {
    to: "owner@example.com",
    subject: "Verify",
    html: "<p>Verify</p>",
    text: "https://example.com/verify",
  };

  await sendEmail(email, {
    apiKey: "unused",
    client,
    capture: (message) => captured.push(message),
  });

  expect(captured).toEqual([email]);
  expect(client.emails.send).not.toHaveBeenCalled();
});
```

Update imports to include `type SendEmailArgs`.

- [ ] **Step 6: Run the capture test to verify failure**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/email/send-email.test.ts -t "captures through"
```

Expected: FAIL because `SendEmailDeps` does not accept `capture`.

- [ ] **Step 7: Implement capture-first delivery**

In `apps/api/src/email/send-email.ts`:

```ts
import { captureTestEmail } from "./test-outbox";
```

Extend `SendEmailDeps`:

```ts
capture?: (args: SendEmailArgs) => void;
```

Immediately after input validation, before reading the API key, add:

```ts
const capture =
  "capture" in deps ? deps.capture : env.E2E_TEST_MODE ? captureTestEmail : undefined;
if (capture) {
  capture(args);
  return;
}
```

This guarantees E2E mode never contacts Resend even if a key is present.

- [ ] **Step 8: Run focused tests**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run \
  src/email/test-outbox.test.ts \
  src/email/send-email.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/env.ts apps/api/src/email/test-outbox.ts \
  apps/api/src/email/test-outbox.test.ts apps/api/src/email/send-email.ts \
  apps/api/src/email/send-email.test.ts
git commit -m "test(api): capture verification emails for e2e"
```

### Task 3: Expose the Outbox Only in E2E Mode

**Files:**
- Create: `apps/api/src/routes/test-email.ts`
- Create: `apps/api/src/routes/test-email.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write guarded route tests**

Create `apps/api/src/routes/test-email.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { captureTestEmail, resetTestOutbox } from "../email/test-outbox";
import { createTestEmailApp } from "./test-email";

describe("test email route", () => {
  beforeEach(resetTestOutbox);

  it("is hidden when E2E mode is disabled", async () => {
    const res = await createTestEmailApp({ enabled: false }).request(
      "/emails/latest?to=owner@example.com",
    );
    expect(res.status).toBe(404);
  });

  it("requires a recipient", async () => {
    const res = await createTestEmailApp({ enabled: true }).request("/emails/latest");
    expect(res.status).toBe(400);
  });

  it("returns the latest captured email", async () => {
    captureTestEmail({
      to: "owner@example.com",
      subject: "Verify",
      html: "<p>verify</p>",
      text: "Visit https://example.com/verify",
    });

    const res = await createTestEmailApp({ enabled: true }).request(
      "/emails/latest?to=owner%40example.com",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      email: {
        to: "owner@example.com",
        subject: "Verify",
      },
    });
  });
});
```

- [ ] **Step 2: Run route tests to verify failure**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/routes/test-email.test.ts
```

Expected: FAIL because `./test-email` does not exist.

- [ ] **Step 3: Implement the guarded route factory**

Create `apps/api/src/routes/test-email.ts`:

```ts
import { Hono } from "hono";
import { findLatestTestEmail } from "../email/test-outbox";

export function createTestEmailApp({ enabled }: { enabled: boolean }) {
  return new Hono().get("/emails/latest", (c) => {
    if (!enabled) return c.notFound();
    const to = c.req.query("to")?.trim();
    if (!to) return c.json({ error: "recipient_required" } as const, 400);
    const email = findLatestTestEmail(to);
    if (!email) return c.json({ error: "not_found" } as const, 404);
    return c.json({ email });
  });
}
```

- [ ] **Step 4: Mount the guarded route**

In `apps/api/src/app.ts`, import:

```ts
import { createTestEmailApp } from "./routes/test-email";
```

Mount before the Better Auth wildcard route:

```ts
.route("/api/test", createTestEmailApp({ enabled: env.E2E_TEST_MODE }))
```

- [ ] **Step 5: Run route and API tests**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run \
  src/routes/test-email.test.ts \
  src/app.test.ts \
  src/auth-email.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/test-email.ts apps/api/src/routes/test-email.test.ts \
  apps/api/src/app.ts
git commit -m "test(api): expose guarded email outbox"
```

### Task 4: Add the Critical Owner Journey

**Files:**
- Create: `e2e/critical-owner-journey.spec.ts`

- [ ] **Step 1: Create the critical-path spec**

Create `e2e/critical-owner-journey.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

function verificationUrl(text: string): string {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) throw new Error("verification URL missing from captured email");
  return match[0];
}

test("owner can activate and create a shareable behavior brief", async ({
  page,
  request,
}, testInfo) => {
  const unique = `${Date.now()}-${testInfo.project.name.replace(/\W+/g, "-")}`;
  const email = `e2e-${unique}@example.com`;
  const password = "playwright-test-password";

  await page.goto("/register");
  await page.getByLabel("Name").fill("Playwright Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/my/);
  await expect(page.getByRole("alert")).toContainText("Please verify your email");

  let capturedText = "";
  await expect
    .poll(async () => {
      const res = await request.get(
        `http://127.0.0.1:3001/api/test/emails/latest?to=${encodeURIComponent(email)}`,
      );
      if (!res.ok()) return false;
      const body = (await res.json()) as { email: { text: string } };
      capturedText = body.email.text;
      return true;
    })
    .toBe(true);

  await page.goto(verificationUrl(capturedText));
  await page.goto("/my");
  await expect(page.getByText("Please verify your email")).toHaveCount(0);

  await page.goto("/my/dogs/new");
  await page.getByLabel("Name").fill("Maple");
  await page.getByLabel("Breed").fill("Australian Shepherd");
  await page.getByLabel("Size").selectOption("medium");
  await page.getByLabel("Sex").selectOption("female");
  await page.getByLabel("Source").selectOption("rescue");
  await page.getByLabel("Vaccine stage").selectOption("complete");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/my\/dogs\/[^/]+\/journal/);

  await page.getByRole("button", { name: /Log moment/ }).click();
  await page.getByLabel("Quick note").fill("Stayed calm when the delivery arrived.");
  await page.getByRole("button", { name: "Save moment" }).click();
  await expect(page.getByText("Stayed calm when the delivery arrived.")).toBeVisible();

  await page.getByRole("link", { name: "Training" }).click();
  await page.getByRole("button", { name: "Templates" }).click();
  await page.getByRole("button", { name: /Basic Manners/ }).click();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Basic Manners")).toBeVisible();

  const expandSkill = page.getByRole("button", { name: /Expand /i }).first();
  await expandSkill.click();
  await page.getByRole("button", { name: "Log session" }).click();
  await page.getByLabel("Duration").fill("5");
  await page.getByRole("button", { name: "Save session" }).click();
  await expect(page.getByText(/1 session/)).toBeVisible();

  await page.getByRole("link", { name: "Brief" }).click();
  await page.getByRole("button", { name: "Generate Brief" }).click();
  await expect(page.getByText("Draft · v1")).toBeVisible();
  await page.getByRole("button", { name: /Share this brief/ }).click();
  await page.getByRole("button", { name: /Copy a private link/ }).click();
  await expect(page.getByLabel("Share")).toHaveValue(/\/b\//);
  await expect(page.getByText("Final · v1")).toBeVisible();
});
```

If an accessible label differs from the current English catalog, adjust the
locator to the exact rendered label rather than adding test-only IDs.

- [ ] **Step 2: Install Chromium**

Run:

```bash
pnpm exec playwright install chromium
```

Expected: Chromium installs successfully.

- [ ] **Step 3: Prepare the local database**

Run:

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api db:migrate
```

Expected: migrations apply successfully.

- [ ] **Step 4: Run desktop first**

Run:

```bash
pnpm test:e2e --project desktop-chromium
```

Expected: PASS. If a locator fails, inspect the trace and correct only the
locator or an actual accessibility gap; do not use arbitrary sleeps.

- [ ] **Step 5: Run both viewports**

Run:

```bash
pnpm test:e2e
```

Expected: 2 passing tests, one per project.

- [ ] **Step 6: Commit**

```bash
git add e2e/critical-owner-journey.spec.ts
git commit -m "test(e2e): cover the critical owner journey"
```

### Task 5: Add Read-Only Production Smoke

**Files:**
- Create: `e2e/production-smoke.spec.ts`

- [ ] **Step 1: Create the production spec**

Create `e2e/production-smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;

test("public production surfaces are healthy", async ({ page, request }) => {
  const health = await request.get("https://api.turingcare.dog/health");
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toEqual({ status: "ok" });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Understand your dog/i })).toBeVisible();

  await page.goto("/trainers");
  await expect(page.getByRole("heading", { name: /trainers/i })).toBeVisible();

  await page.goto("/courses");
  await expect(page.getByRole("heading", { name: /courses/i })).toBeVisible();
});

test("verified smoke account can open the authenticated app without mutations", async ({
  page,
}) => {
  test.skip(!email || !password, "SMOKE_EMAIL and SMOKE_PASSWORD are required");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/my/);
  await expect(page.getByRole("navigation", { name: "Menu" })).toBeVisible();
  await expect(page.getByText("Please verify your email")).toHaveCount(0);
});
```

The dedicated smoke account must be verified before its secrets are added and
must not be used for any mutating assertion.

- [ ] **Step 2: List the production tests**

Run:

```bash
SMOKE_EMAIL=smoke@example.com SMOKE_PASSWORD=placeholder \
  pnpm exec playwright test --config playwright.production.config.ts --list
```

Expected: 2 tests listed.

- [ ] **Step 3: Run only the public smoke locally**

Run:

```bash
pnpm test:e2e:production --grep "public production"
```

Expected: PASS against `https://turingcare.dog`.

- [ ] **Step 4: Commit**

```bash
git add e2e/production-smoke.spec.ts
git commit -m "test(e2e): add read-only production smoke"
```

### Task 6: Run E2E in Pull Requests

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add an E2E job**

Add a second job named `e2e` to `.github/workflows/ci.yml`:

```yaml
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: turingcare
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres -d turingcare"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      CI: true
      DATABASE_URL: ${{ format('postgresql://{0}:{0}@localhost:5432/turingcare', 'postgres') }}
      BETTER_AUTH_SECRET: ci-only-insecure-secret-0123456789abcdef
      BETTER_AUTH_URL: http://localhost:3001
      FRONTEND_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @turingcare/api db:migrate
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e
      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

- [ ] **Step 2: Validate workflow syntax**

Run:

```bash
pnpm exec prettier --version >/dev/null 2>&1 || true
git diff --check
```

Also inspect the workflow indentation manually; do not add a new YAML tool.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run Playwright owner journey"
```

### Task 7: Run Production Smoke After Deploy and Daily

**Files:**
- Create: `.github/workflows/production-smoke.yml`

- [ ] **Step 1: Create the production smoke workflow**

Create `.github/workflows/production-smoke.yml`:

```yaml
name: Production smoke

on:
  workflow_dispatch:
  schedule:
    - cron: "17 15 * * *"
  workflow_run:
    workflows: ["Deploy"]
    types: [completed]

jobs:
  smoke:
    if: >-
      github.event_name != 'workflow_run' ||
      github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    env:
      SMOKE_BASE_URL: https://turingcare.dog
      SMOKE_EMAIL: ${{ secrets.SMOKE_EMAIL }}
      SMOKE_PASSWORD: ${{ secrets.SMOKE_PASSWORD }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e:production
      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: production-smoke-report
          path: playwright-report/
          retention-days: 14
```

- [ ] **Step 2: Document required GitHub secrets**

Before enabling the authenticated assertion, create a dedicated verified
production account with no admin role, then set:

```bash
gh secret set SMOKE_EMAIL
gh secret set SMOKE_PASSWORD
```

Do not put the credentials in repository files or workflow literals.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/production-smoke.yml
git commit -m "ci: add scheduled production smoke"
```

### Task 8: Document and Run the Full Gate

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add E2E documentation**

Add a concise `## Browser tests` section after local setup:

```markdown
## Browser tests

Playwright covers the critical owner journey at desktop and phone viewport
sizes. It uses local Postgres and a test-only captured email outbox.

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api db:migrate
pnpm exec playwright install chromium
pnpm test:e2e
```

Run one project with `pnpm test:e2e --project desktop-chromium`. Production
smoke is read-only and requires the `SMOKE_EMAIL` and `SMOKE_PASSWORD` GitHub
secrets for a dedicated verified account.
```

- [ ] **Step 2: Run the targeted API tests**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run \
  src/email/test-outbox.test.ts \
  src/email/send-email.test.ts \
  src/routes/test-email.test.ts \
  src/app.test.ts \
  src/auth-email.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the repository gate**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all commands pass.

- [ ] **Step 4: Run local browser coverage**

Run:

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api db:migrate
pnpm test:e2e
```

Expected: desktop and phone projects pass.

- [ ] **Step 5: Run public production smoke**

Run:

```bash
pnpm test:e2e:production --grep "public production"
```

Expected: PASS.

- [ ] **Step 6: Commit documentation**

```bash
git add README.md
git commit -m "docs: document Playwright smoke coverage"
```

## Follow-Up Projects

This plan intentionally does not implement:

- enforced email verification;
- feedback capture/admin inbox;
- cohort-retention dashboards;
- error monitoring;
- Guided Today.

Each is an independently shippable Beta Readiness or owner-retention project
from `docs/superpowers/specs/2026-07-31-public-beta-roadmap-design.md`.
