import { type APIRequestContext, type Page, expect, test } from "@playwright/test";

/**
 * Critical Owner Journey — end-to-end happy-path covering:
 * registration → email verification → guided setup → moment logging →
 * training template → practice session → Brief generation → share link.
 */

const PASSWORD = "Maple2024!xQ"; // satisfies min-8 + mixed-case + digit + special

function makeEmail(project: string): string {
  const ts = Date.now();
  const slug = project.replace(/[^a-z0-9]/gi, "");
  return `e2e+${slug}${ts}@turingcare.test`;
}

async function verifyEmail(page: Page, request: APIRequestContext, email: string) {
  const outboxUrl = `http://127.0.0.1:3001/api/test/emails/latest?to=${encodeURIComponent(email)}`;
  let emailBody = "";
  await expect
    .poll(
      async () => {
        const res = await request.get(outboxUrl);
        if (res.status() !== 200) return null;
        const json = (await res.json()) as { email: { text?: string; html?: string } };
        emailBody = json.email.text ?? json.email.html ?? "";
        return emailBody;
      },
      { timeout: 15_000, intervals: [500, 1000, 2000] },
    )
    .toBeTruthy();

  const urlMatch = emailBody.match(/https?:\/\/[^\s"<>)]+\/api\/auth\/verify[^\s"<>)]*/);
  expect(urlMatch, "verification URL found in email").toBeTruthy();
  if (!urlMatch) throw new Error("verification URL not found in email");
  const verifyUrl = urlMatch[0].replace(/[.,;!?)>]+$/, "");
  await page.goto(verifyUrl);
}

test("[desktop] full owner journey: register → guided setup → training → brief → share", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);

  const email = makeEmail(testInfo.project.name);

  // ─── 1. Register ────────────────────────────────────────────────────────
  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // Redirect to guided setup and verification banner visible
  await page.waitForURL("**/my/setup", { timeout: 15_000 });
  const banner = page.getByRole("alert");
  await expect(banner).toContainText("verify your email");

  // ─── 2. Email verification via test outbox ──────────────────────────────
  await verifyEmail(page, request, email);

  // Return to dashboard; eligible owners are redirected back to guided setup.
  await page.goto("/my");
  await page.waitForURL("**/my/setup");
  await expect(page).toHaveURL(/\/my\/setup$/);
  // Banner should be gone
  await expect(banner).not.toBeVisible({ timeout: 10_000 });

  // ─── 3. Guided setup ────────────────────────────────────────────────────
  await page.getByLabel("Name").fill("Maple");
  await page.getByLabel("Breed", { exact: true }).fill("Australian Shepherd");
  await page.getByLabel("Size").selectOption("medium");
  await page.getByLabel("Sex").selectOption("female");
  await page.getByLabel("Source").selectOption("rescue");
  await page.getByLabel("Vaccination").selectOption("unknown");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose your first focus" })).toBeVisible();

  await page.getByRole("radio", { name: /Understand behavior/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: /understanding behavior/i })).toBeVisible();
  await page
    .getByLabel("What concern would you like to understand?")
    .fill("Barking at the doorbell");
  await page.getByLabel("Severity").selectOption("mild");
  await page.getByRole("button", { name: "Save first step", exact: true }).click();

  const completion = page.getByRole("status");
  await expect(completion).toContainText("Your first step was saved.");
  await completion.getByRole("link", { name: "Continue to the journal" }).click();
  await expect(page).toHaveURL(/\/my\/dogs\/[^/]+\/journal$/, { timeout: 10_000 });

  // ─── 4. Log a quick moment ─────────────────────────────────────────────
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
  const expandSit = page.getByRole("button", { name: "Expand Sit" });
  await expect(expandSit).toBeVisible({ timeout: 10_000 });

  // Expand first skill ("Sit")
  await expandSit.click();

  // Log a session
  await page.getByRole("button", { name: "Log session" }).click();
  await page.getByLabel("Duration (min)").fill("5");
  await page.getByRole("button", { name: "Save session" }).click();

  // Assert "1 session" visible
  await expect(page.getByText(/1 session/)).toBeVisible({ timeout: 10_000 });

  // ─── 6. Weekly focus: suggestion and one-tap outcome ───────────────────
  await page.getByRole("link", { name: "This Week" }).click();
  await expect(page).toHaveURL(/\/my\/dogs\/[^/]+\/week$/);
  await page.getByRole("button", { name: "Edit focus" }).first().click();
  const sitFocus = page.getByRole("radio", { name: "Sit" });
  await sitFocus.click();
  await expect(sitFocus).toBeChecked();

  const suggestionCard = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "This week's suggestion" }) });
  await expect(suggestionCard.getByText("Lures into a sit with food in a quiet room")).toHaveCount(
    2,
  );
  await expect(suggestionCard.getByText("If that looks like too much")).toBeVisible();
  await expect(suggestionCard.getByText(/give more help/i)).toBeVisible();

  await page.getByRole("button", { name: /^Sit on .*: 1 sessions$/ }).click();
  await page.getByRole("button", { name: "Log another" }).click();

  const outcomeCapture = page.getByLabel("How did it go?");
  await outcomeCapture.getByRole("button", { name: "Went well" }).click();
  await outcomeCapture.getByRole("button", { name: "Save response" }).click();
  await expect(page.getByText("Thanks — logged.")).toBeVisible({ timeout: 10_000 });

  // ─── 7. Brief: generate, share, finalize ───────────────────────────────
  await page.getByRole("link", { name: "Brief", exact: true }).click();
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

test("[phone] guided training setup resumes after reload", async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);

  const email = makeEmail(testInfo.project.name);

  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E Phone Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/my/setup", { timeout: 15_000 });

  await verifyEmail(page, request, email);
  await page.goto("/my/setup");
  await expect(page.getByRole("heading", { name: "Tell us about your dog" })).toBeVisible();

  await page.getByLabel("Name").fill("Juniper");
  await page.getByLabel("Breed", { exact: true }).fill("Australian Shepherd");
  await page.getByLabel("Size").selectOption("medium");
  await page.getByLabel("Sex").selectOption("female");
  await page.getByLabel("Source").selectOption("rescue");
  await page.getByLabel("Vaccination").selectOption("unknown");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Choose your first focus" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/my\/setup$/);
  await expect(page.getByRole("heading", { name: "Choose your first focus" })).toBeVisible();
  await expect(page.getByText("What would help most with Juniper?")).toBeVisible();

  await page.getByRole("radio", { name: /Train a skill/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: /training a skill/i })).toBeVisible();

  await page.getByRole("radio", { name: /Basic Manners/ }).check();
  await page.getByRole("button", { name: "Save first step", exact: true }).click();

  const completion = page.getByRole("status");
  await expect(completion).toContainText("Your first step was saved.");

  const authoredPreview = page.getByText("Lures into a sit with food in a quiet room", {
    exact: true,
  });
  const safetyNotice = page.getByRole("alert", { name: "Let's pause training suggestions" });
  await expect
    .poll(async () => {
      const authored = (await authoredPreview.count()) > 0;
      const safety = (await safetyNotice.count()) > 0;
      return Number(authored) + Number(safety);
    })
    .toBe(1);
  const authoredCount = await authoredPreview.count();
  const safetyCount = await safetyNotice.count();
  expect(Boolean(authoredCount) !== Boolean(safetyCount)).toBe(true);

  const preview = authoredCount
    ? page.locator("section").filter({
        has: page.getByRole("heading", { name: "This week's suggestion" }),
      })
    : safetyNotice;
  await expect(preview.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "We did this", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Skip today", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Helpful", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Not helpful", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Choose a different focus", exact: true }),
  ).toHaveCount(0);

  await completion.getByRole("link", { name: "Continue to This Week" }).click();
  await expect(page).toHaveURL(/\/my\/dogs\/[^/]+\/week$/, { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "This Week", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Juniper", exact: true })).toBeVisible();
});
