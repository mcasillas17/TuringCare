import { expect, test } from "@playwright/test";

/**
 * Critical Owner Journey — end-to-end happy-path covering:
 * registration → email verification → dog creation → moment logging →
 * training template → practice session → Brief generation → share link.
 */

const PASSWORD = "Maple2024!xQ"; // satisfies min-8 + mixed-case + digit + special

function makeEmail(project: string): string {
  const ts = Date.now();
  const slug = project.replace(/[^a-z0-9]/gi, "");
  return `e2e+${slug}${ts}@turingcare.test`;
}

test("full owner journey: register → verify → dog → moment → training → brief → share", async ({
  page,
  request,
}, testInfo) => {
  const email = makeEmail(testInfo.project.name);

  // ─── 1. Register ────────────────────────────────────────────────────────
  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // Redirect to /my and verification banner visible
  await page.waitForURL("**/my", { timeout: 15_000 });
  const banner = page.getByRole("alert");
  await expect(banner).toContainText("verify your email");

  // ─── 2. Email verification via test outbox ──────────────────────────────
  const outboxUrl = `http://127.0.0.1:3001/api/test/emails/latest?to=${encodeURIComponent(email)}`;
  let emailBody = "";
  await expect
    .poll(
      async () => {
        const res = await request.get(outboxUrl);
        if (res.status() !== 200) return null;
        const json = await res.json();
        emailBody = json.text ?? json.html ?? "";
        return emailBody;
      },
      { timeout: 15_000, intervals: [500, 1000, 2000] },
    )
    .toBeTruthy();

  // Extract verification URL — handle trailing punctuation/HTML
  const urlMatch = emailBody.match(/https?:\/\/[^\s"<>)]+\/api\/auth\/verify[^\s"<>)]*/);
  expect(urlMatch, "verification URL found in email").toBeTruthy();
  const verifyUrl = urlMatch![0].replace(/[.,;!?)>]+$/, "");

  // Visit verification link
  await page.goto(verifyUrl);
  // Return to dashboard
  await page.goto("/my");
  await page.waitForURL("**/my");
  // Banner should be gone
  await expect(banner).not.toBeVisible({ timeout: 10_000 });

  // ─── 3. Create dog ─────────────────────────────────────────────────────
  await page.goto("/my/dogs/new");
  await page.getByLabel("Name").fill("Maple");
  await page.getByLabel("Breed").fill("Australian Shepherd");
  await page.getByLabel("Size").selectOption("medium");
  await page.getByLabel("Sex").selectOption("female");
  await page.getByLabel("Source").selectOption("rescue");
  await page.getByLabel("Vaccination").selectOption("complete");
  await page.getByRole("button", { name: "Save" }).click();

  // Redirects to dog journal route /my/dogs/:id(/journal)
  await expect(page).toHaveURL(/\/my\/dogs\/[^/]+/, { timeout: 10_000 });

  // ─── 4. Log a quick moment ─────────────────────────────────────────────
  // Navigate to journal tab (may already be there)
  const journalTab = page.getByRole("link", { name: "Journal" });
  if (await journalTab.isVisible()) await journalTab.click();

  // Open moment composer
  await page.getByRole("button", { name: /Log moment/i }).click();

  // Fill note
  await page.getByLabel("Quick note").fill("Barked at doorbell");
  // Save
  await page.getByRole("button", { name: "Save moment" }).click();

  // Assert entry visible
  await expect(page.getByText("Barked at doorbell")).toBeVisible({ timeout: 10_000 });

  // ─── 5. Training: apply Basic Manners template ─────────────────────────
  await page.getByRole("link", { name: "Training" }).click();
  await page.getByRole("button", { name: "Templates" }).click();
  // Pick "Basic Manners" from the dropdown
  await page.getByRole("button", { name: "Basic Manners" }).click();
  // Confirm apply
  await page.getByRole("button", { name: "Apply" }).click();
  // Wait for skills to appear
  await expect(page.getByText("Sit")).toBeVisible({ timeout: 10_000 });

  // Expand first skill ("Sit")
  await page.getByRole("button", { name: /Expand Sit/i }).click();

  // Log a session
  await page.getByRole("button", { name: "Log session" }).click();
  await page.getByLabel("Duration (min)").fill("5");
  await page.getByRole("button", { name: "Save session" }).click();

  // Assert "1 session" visible
  await expect(page.getByText(/1 session/)).toBeVisible({ timeout: 10_000 });

  // ─── 6. Brief: generate, share, finalize ───────────────────────────────
  await page.getByRole("link", { name: "Brief" }).click();
  await page.getByRole("button", { name: "Generate Brief" }).click();

  // Assert draft v1
  await expect(page.getByText("Draft · v1")).toBeVisible({ timeout: 30_000 });

  // Open share sheet
  await page.getByRole("button", { name: /Share this brief/i }).click();

  // Choose "Copy a private link"
  await page.getByRole("button", { name: /Copy a private link/i }).click();

  // Assert share input contains /b/
  const shareInput = page.getByRole("textbox", { name: /share/i });
  await expect(shareInput).toBeVisible({ timeout: 10_000 });
  await expect(shareInput).toHaveValue(/\/b\//);

  // Sharing finalizes the brief — assert Final v1
  await page.getByRole("button", { name: /Back to brief/i }).click();
  // Close the share sheet by clicking the Close button
  const closeBtn = page.getByRole("button", { name: "Close" });
  try {
    await closeBtn.waitFor({ state: "visible", timeout: 2000 });
    await closeBtn.click();
  } catch {
    // Sheet already closed or Close button not present
  }
  await expect(page.getByText("Final · v1")).toBeVisible({ timeout: 10_000 });
});
