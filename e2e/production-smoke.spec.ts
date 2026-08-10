import { expect, test } from "@playwright/test";

// ── Public smoke ─────────────────────────────────────────────────────────────

test("public smoke: health check, landing, trainers, and courses", async ({ page, request }) => {
  // 1. Health endpoint
  const health = await request.get("https://api.turingcare.dog/health");
  expect(health.ok()).toBe(true);
  const body = await health.json();
  expect(body).toEqual({ status: "ok" });

  // 2. Landing headline
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Understand your dog." })).toBeVisible();

  // 3. Trainers directory
  await page.goto("/trainers");
  await expect(page.getByRole("heading", { level: 1, name: "Trainers" })).toBeVisible();

  // 4. Courses directory
  await page.goto("/courses");
  await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
});

// ── Authenticated smoke ───────────────────────────────────────────────────────

test("authenticated smoke: login and verify dashboard surface", async ({ page }) => {
  const email = process.env.SMOKE_EMAIL;
  const password = process.env.SMOKE_PASSWORD;

  if (!email || !password) {
    test.skip(
      true,
      "SMOKE_EMAIL and SMOKE_PASSWORD are not set — skipping authenticated smoke test",
    );
    return;
  }

  // Login
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();

  // Must land on /my
  await page.waitForURL("**/my", { timeout: 20_000 });

  // App shell navigation must be visible (role=navigation, aria-label="Menu")
  await expect(page.getByRole("navigation", { name: "Menu" })).toBeVisible();

  // Verification banner must NOT be present (email already verified)
  const banner = page.getByRole("alert");
  await expect(banner).not.toBeVisible();
});
