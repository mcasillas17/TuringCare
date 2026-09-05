import { randomUUID } from "node:crypto";
import { type APIRequestContext, type Page, expect, test } from "@playwright/test";
import { verificationLimitKey } from "../apps/api/src/auth/verification-rate-limit";
import { pool } from "../apps/api/src/db";
import {
  confirmEmailOwnership,
  localClientHeaders,
  refreshSessionOnFocus,
} from "./verification-helpers";

const PASSWORD = "Verification2026!local";
const WEB_ORIGIN = "http://localhost:3310";
const API_ORIGIN = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://localhost:3311";
const createdEmails: string[] = [];

function emailForTest() {
  const email = `verification-${randomUUID()}@turingcare.test`;
  createdEmails.push(email);
  return email;
}

function requireLocalDatabase() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "::1"].includes(database.hostname)) {
    throw new Error("Verification fixtures require an isolated local database");
  }
}

test.beforeAll(() => {
  requireLocalDatabase();
});

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(localClientHeaders());
});

test.afterEach(async () => {
  requireLocalDatabase();
  for (const email of createdEmails.splice(0)) {
    await pool.query('DELETE FROM "user" WHERE email = $1', [email]);
  }
});

test.afterAll(async () => {
  await pool.end();
});

async function capturedLink(request: APIRequestContext, email: string, kind = "verify-email") {
  const outbox = new URL("/api/test/emails/latest", API_ORIGIN);
  outbox.searchParams.set("to", email);
  const response = await request.get(outbox.toString());
  expect(response.status()).toBe(200);
  const message = (await response.json()) as { email: { text: string; html: string } };
  const links = message.email.text.match(/https?:\/\/[^\s"<>)]+/g) ?? [];
  const link = links.find((value) => new URL(value).pathname.includes(kind));
  if (!link) throw new Error("Expected captured recovery link");
  return { link, html: message.email.html, text: message.email.text };
}

async function registerThroughApi(
  request: APIRequestContext,
  email: string,
  locale: "en" | "es" = "en",
) {
  const response = await request.post(`${WEB_ORIGIN}/api/auth/sign-up/email`, {
    headers: { "X-TuringCare-Locale": locale },
    data: {
      name: "Verification fixture",
      email,
      password: PASSWORD,
      callbackURL: `${WEB_ORIGIN}/verify-email?next=/my/profile`,
    },
  });
  expect(response.ok()).toBe(true);
  expect((await request.get(`${WEB_ORIGIN}/me`)).status()).toBe(401);
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login?next=/my/profile");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

async function legacySession(page: Page, email: string) {
  await registerThroughApi(page.request, email);
  const { link } = await capturedLink(page.request, email);
  await page.goto(link);
  await confirmEmailOwnership(page);
  await signIn(page, email);
  await expect(page).toHaveURL((url) => url.pathname === "/my/profile");
  requireLocalDatabase();
  const result = await pool.query(
    "UPDATE \"user\" SET email_verified = false, role = 'admin' WHERE email = $1",
    [email],
  );
  expect(result.rowCount).toBe(1);
}

test("unverified credentials have no owner access; a fresh browser can verify in Spanish", async ({
  page,
  browser,
}) => {
  const email = emailForTest();
  await registerThroughApi(page.request, email, "es");
  const signInResponse = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password: PASSWORD },
  });
  expect(signInResponse.status()).toBe(403);
  expect((await page.request.get("/api/profile")).status()).toBe(401);
  const { link, html } = await capturedLink(page.request, email);
  expect(html).toContain('<html lang="es">');

  const freshContext = await browser.newContext({
    locale: "en-US",
    extraHTTPHeaders: localClientHeaders(),
  });
  const freshPage = await freshContext.newPage();
  try {
    await freshPage.goto(link);
    await expect(freshPage).toHaveURL(/\/verify-email\?/);
    await expect(freshPage.locator("html")).toHaveAttribute("lang", "es");
    const url = new URL(freshPage.url());
    expect(url.searchParams.has("token")).toBe(false);
    expect(url.searchParams.has("email")).toBe(false);
    expect((await freshContext.request.get(`${WEB_ORIGIN}/me`)).status()).toBe(401);
    const passiveSignIn = await page.request.post(`${WEB_ORIGIN}/api/auth/sign-in/email`, {
      data: { email, password: PASSWORD },
    });
    expect(passiveSignIn.status()).toBe(403);
    await confirmEmailOwnership(freshPage, "es");
    await freshPage.reload();
    await expect(freshPage.locator("html")).toHaveAttribute("lang", "es");
    expect(
      await freshPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    // A reused ownership link is safe and never mints another session.
    await freshPage.goto(link);
    await expect(freshPage).toHaveURL(/\/verify-email\?/);
    await confirmEmailOwnership(freshPage, "es");
    expect((await freshContext.request.get(`${WEB_ORIGIN}/me`)).status()).toBe(401);
    await freshPage
      .getByRole("link", { name: "Iniciar sesión para continuar", exact: true })
      .click();
    await freshPage.getByLabel("Correo electrónico", { exact: true }).fill(email);
    await freshPage.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await freshPage.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
    await expect(freshPage).toHaveURL((destination) => destination.pathname === "/my/profile");
    await expect(freshPage.getByRole("heading", { name: "Perfil", level: 1 })).toBeVisible();
    await expect(freshPage.locator("html")).toHaveAttribute("lang", "es");
    const profile = await freshContext.request.get(`${WEB_ORIGIN}/api/profile`);
    expect(await profile.json()).toMatchObject({ user: { locale: "es" } });
  } finally {
    await freshContext.close();
  }

  await signIn(page, email);
  await expect(page).toHaveURL((url) => url.pathname === "/my/profile");
  expect((await page.request.get("/api/profile")).status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  const name = page.getByLabel("Nombre", { exact: true });
  await name.fill("Unsaved owner draft");
  await refreshSessionOnFocus(page);
  await expect(name).toHaveValue("Unsaved owner draft");
  await page.request.post("/api/auth/sign-out", {
    headers: { Origin: WEB_ORIGIN },
    data: {},
  });
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/profile")).status()).toBe(401);
});

test("legacy unverified admins are blocked and recover after another tab verifies", async ({
  page,
  context,
}) => {
  const email = emailForTest();
  await legacySession(page, email);
  const denied = await page.request.get("/api/overview");
  expect(denied.status()).toBe(403);
  expect(await denied.json()).toMatchObject({ error: "email_unverified" });
  const adminDenied = await page.request.get("/api/admin/metrics");
  expect(adminDenied.status()).toBe(403);
  const me = await page.request.get("/me");
  expect(await me.json()).toMatchObject({ user: { emailVerified: false, role: "user" } });

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/verify-email/);
  await page.goto("/my/profile");
  await expect(page).toHaveURL(/\/verify-email/);
  await page.reload();
  await expect(page).toHaveURL(/\/verify-email/);
  await expect(page.getByRole("button", { name: "Request a new link", exact: true })).toBeVisible();
  // Advance only this fixture's signup-send window, not shared/IP counters.
  await pool.query("UPDATE rate_limit SET last_request = 0 WHERE id = $1", [
    verificationLimitKey("send", email),
  ]);
  const resend = await page.request.post("/api/verification/resend", {
    headers: { Origin: WEB_ORIGIN },
    data: { returnTo: "/my/profile" },
  });
  expect(resend.status()).toBe(200);
  const { link } = await capturedLink(page.request, email);
  const otherTab = await context.newPage();
  await otherTab.goto(link);
  await expect(otherTab).toHaveURL(/\/verify-email/);
  await confirmEmailOwnership(otherTab);
  await otherTab.close();
  await page.bringToFront();
  await page.goto("/my/profile");
  await expect(page).toHaveURL((url) => url.pathname === "/my/profile");
  expect((await page.request.get("/api/profile")).status()).toBe(200);
});

test("password reset preserves the verification requirement and invalid links remain recoverable", async ({
  page,
}) => {
  const email = emailForTest();
  await registerThroughApi(page.request, email);
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(email);
  const resetRequested = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/auth/request-password-reset",
  );
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  expect((await resetRequested).status()).toBe(200);
  await expect(page.getByRole("link", { name: /Back to log ?in/i })).toBeVisible();
  const { link } = await capturedLink(page.request, email, "reset-password");
  await page.goto(link);
  await page.getByLabel("New password", { exact: true }).fill(`${PASSWORD}-reset`);
  await page.getByLabel(/Confirm.*password/i).fill(`${PASSWORD}-reset`);
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, email, `${PASSWORD}-reset`);
  await expect(page).toHaveURL(/\/verify-email/);
  expect((await page.request.get("/api/profile")).status()).toBe(401);

  const invalid = new URL("/api/auth/verify-email", API_ORIGIN);
  invalid.searchParams.set("token", "invalid-local-test-token");
  invalid.searchParams.set("callbackURL", `${WEB_ORIGIN}/verify-email?status=verified`);
  await page.goto(invalid.toString());
  await expect(page).toHaveURL((url) => url.pathname === "/verify-email");
  expect(new URL(page.url()).searchParams.has("token")).toBe(false);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("invalid or expired");
  expect((await page.request.get("/api/profile")).status()).toBe(401);
  await expect(page.getByRole("link", { name: /password/i })).toBeVisible();
});

test("anonymous resend form survives focus and reports actual throttling and acceptance", async ({
  page,
}) => {
  const email = emailForTest();
  await registerThroughApi(page.request, email);
  await page.goto("/verify-email");
  const emailField = page.getByLabel("Email", { exact: true });
  const passwordField = page.getByLabel("Password", { exact: true });
  const resendButton = page.getByRole("button", { name: "Request a new link", exact: true });
  await emailField.fill(email);
  await passwordField.fill(PASSWORD);
  await refreshSessionOnFocus(page);
  await expect(emailField).toHaveValue(email);
  await expect(passwordField).toHaveValue(PASSWORD);

  await resendButton.click();
  await expect(page.getByRole("alert")).toContainText("Too many requests");
  await expect(resendButton).toBeDisabled();
  await expect(passwordField).toHaveValue("");
  await pool.query("UPDATE rate_limit SET last_request = 0 WHERE id = $1", [
    verificationLimitKey("send", email),
  ]);
  await page.clock.fastForward(61_000);
  await expect(resendButton).toBeEnabled();
  await passwordField.fill(PASSWORD);
  await resendButton.click();
  await expect(page.getByRole("status").filter({ hasText: "Request accepted" })).toBeVisible();
  await expect(resendButton).toBeDisabled();
  await expect(passwordField).toHaveValue("");
  expect((await page.request.get("/api/profile")).status()).toBe(401);
});

test("a previous verification receipt cannot claim success for a new signup", async ({ page }) => {
  const firstEmail = emailForTest();
  await registerThroughApi(page.request, firstEmail);
  const { link } = await capturedLink(page.request, firstEmail);
  await page.goto(link);
  await confirmEmailOwnership(page);

  await registerThroughApi(page.request, emailForTest());
  await page.goto("/verify-email?status=verified");
  await expect(
    page.getByRole("heading", { name: "Verify your email", level: 1, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Email verified", level: 1, exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/profile")).status()).toBe(401);
});

test("confirmation shows the real server rate limit and disables retry until its deadline", async ({
  page,
}) => {
  const email = emailForTest();
  await registerThroughApi(page.request, email);
  const { link } = await capturedLink(page.request, email);
  await page.goto(link);
  await expect(page.getByRole("button", { name: "Verify email", exact: true })).toBeVisible();
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await page.request.post("/api/verification/resend", {
      headers: { Origin: WEB_ORIGIN },
      data: {},
    });
    expect(result.status()).toBe(401);
  }
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Too many requests");
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeDisabled();
  await expect(page.getByText(/Time until another request:/)).toBeVisible();
  expect((await page.request.get("/api/profile")).status()).toBe(401);
});

test("an email landing waits for its receipt without flashing resend credentials", async ({
  page,
}) => {
  const email = emailForTest();
  await registerThroughApi(page.request, email);
  const { link } = await capturedLink(page.request, email);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/verification/status", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(link);
  try {
    await expect(page.getByText("Checking verification link…", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  } finally {
    release();
  }
  await confirmEmailOwnership(page);
});

test("a stalled verification-status request reaches bounded retry recovery", async ({ page }) => {
  test.setTimeout(20_000);
  // Deliberately leave this intercepted request unanswered; the application must abort it.
  await page.route("**/api/verification/status", () => {});
  await page.goto("/verify-email");
  await expect(page.getByText("Checking verification link…", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible({
    timeout: 12_000,
  });
  await expect(page.getByRole("alert")).toContainText("couldn't check your verification link");
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeEnabled();
});

test("an exhausted staging budget redirects email links into token-free recovery", async ({
  page,
}) => {
  const email = emailForTest();
  await registerThroughApi(page.request, email);
  const { link } = await capturedLink(page.request, email);
  let exhausted = false;
  for (let request = 0; request < 301; request++) {
    const result = await page.request.get("/api/staging-budget-fixture");
    if (result.status() === 429) {
      exhausted = true;
      break;
    }
  }
  expect(exhausted).toBe(true);
  const response = await page.goto(link);
  expect(new URL(page.url()).pathname).toBe("/verify-email");
  expect(new URL(page.url()).searchParams.has("token")).toBe(false);
  const redirect = await response?.request().redirectedFrom()?.response();
  expect(redirect?.status()).toBe(303);
  await expect(page.getByRole("alert")).toContainText("Too many requests");
  await expect(
    page.getByRole("button", { name: "Continue to recovery", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Verify email", exact: true })).toHaveCount(0);
});
