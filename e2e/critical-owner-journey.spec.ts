import { type APIRequestContext, type Page, expect, test } from "@playwright/test";

/**
 * Critical Owner Journey — end-to-end happy-path covering:
 * registration → email verification → guided setup → moment logging →
 * training template → practice session → Brief generation → share link.
 */

const PASSWORD = "Maple2024!xQ"; // satisfies min-8 + mixed-case + digit + special
const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://localhost:3311";
const WEB_ORIGIN = "http://localhost:3310";

function captureApiClientRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest()) return;
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || url.pathname === "/me" || url.pathname === "/health") {
      requests.push(request.url());
    }
  });
  return requests;
}

function expectApiClientRequestsUseViteProxy(requests: string[]): void {
  expect(requests.length, "the browser made API requests").toBeGreaterThan(0);
  expect(
    requests.every((requestUrl) => new URL(requestUrl).origin === WEB_ORIGIN),
    "browser API requests use the web origin and Vite proxy",
  ).toBe(true);
  const paths = [...new Set(requests.map((requestUrl) => new URL(requestUrl).pathname))].sort();
  console.info(
    `[proxy] ${requests.length} browser API requests via ${WEB_ORIGIN}: ${paths.join(", ")}`,
  );
}

function makeEmail(project: string): string {
  const ts = Date.now();
  const slug = project.replace(/[^a-z0-9]/gi, "");
  return `e2e+${slug}${ts}@turingcare.test`;
}

function localDateTimeDaysAgo(
  daysAgo: number,
  reference = new Date(Date.now() - 10 * 60_000),
): string {
  const date = new Date(reference);
  date.setDate(date.getDate() - daysAgo);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function logManualContextSession(
  page: Page,
  outcome: "went_well" | "too_hard",
  daysAgo: number,
  reference?: Date,
) {
  const trainingUrl = page.url();
  const expandedSkill = page.getByRole("button", { name: "Collapse Sit", exact: true });
  if ((await expandedSkill.count()) === 0) {
    await expect(page.getByRole("button", { name: "Expand Sit", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Expand Sit", exact: true }).click();
  }
  await expect(expandedSkill).toBeVisible();
  await page.getByRole("button", { name: "Log session", exact: true }).click();
  await page.getByLabel("When", { exact: true }).fill(localDateTimeDaysAgo(daysAgo, reference));
  await page.getByLabel("How did it go?", { exact: true }).selectOption(outcome);
  await page.getByLabel("How much help did you give?", { exact: true }).selectOption("hand_signal");
  await page.getByLabel("Where were you?", { exact: true }).selectOption("home_quiet");
  await page.getByLabel("What else was going on?", { exact: true }).selectOption("mild");
  await page
    .getByRole("checkbox", { name: "I practiced this at the current Level 1.", exact: true })
    .check();
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.getByText("Session logged", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(trainingUrl);
  await expect(expandedSkill).toBeVisible();
}

async function verifyEmail(page: Page, request: APIRequestContext, email: string) {
  const outboxUrl = new URL("/api/test/emails/latest", API_BASE_URL);
  outboxUrl.searchParams.set("to", email);
  let emailBody = "";
  await expect
    .poll(
      async () => {
        const res = await request.get(outboxUrl.toString());
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

test("full owner journey: register → guided setup → training → brief → share", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const apiClientRequests = captureApiClientRequests(page);

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

  // ─── 7. Contextual progress: exact evidence and adjacent next practice ───
  await page.getByRole("link", { name: "Training", exact: true }).click();
  const contextReference = new Date(Date.now() - 10 * 60_000);
  await logManualContextSession(page, "went_well", 2, contextReference);
  await logManualContextSession(page, "went_well", 1, contextReference);

  await page.getByRole("link", { name: "This Week", exact: true }).click();
  const contextualSummary = page
    .locator('section[aria-labelledby^="week-context-"]')
    .filter({ has: page.getByRole("heading", { name: "Sit", exact: true }) });
  await expect(contextualSummary).toHaveCount(1);
  await expect(contextualSummary).toBeVisible();
  await expect(contextualSummary.getByText("Reliable", { exact: true })).toBeVisible();
  await expect(
    contextualSummary.getByRole("heading", { name: "Practice next", level: 3 }),
  ).toBeVisible();
  await expect(
    contextualSummary.getByRole("link", { name: "Use this practice plan", exact: true }),
  ).toBeVisible();

  await contextualSummary.getByRole("link", { name: "View all evidence", exact: true }).click();
  await expect(page).toHaveURL(/\/my\/dogs\/[^/]+\/training#skill-[^/]+$/);
  const contextualDetail = page
    .getByRole("heading", { name: "Context progress", exact: true })
    .locator("xpath=ancestor::section[1]");
  await expect(contextualDetail).toBeVisible();
  await expect(
    contextualDetail.getByRole("heading", { name: "Strongest recent context", level: 6 }),
  ).toBeVisible();
  const reliableContext = contextualDetail
    .getByRole("heading", { name: "Strongest recent context", level: 6 })
    .locator("xpath=ancestor::section[1]");
  await expect(reliableContext.getByText("Reliable", { exact: true })).toBeVisible();
  await expect(reliableContext.getByText("2 successful days", { exact: true })).toBeVisible();

  await expect(reliableContext.locator("dl dd")).toHaveText([
    "Hand signal",
    "Quiet room at home",
    "Not recorded",
    "Not recorded",
    "A little",
  ]);

  await contextualDetail
    .getByRole("button", { name: "Use this practice plan", exact: true })
    .click();
  await expect(page.getByLabel("How much help did you give?", { exact: true })).toHaveValue(
    "verbal_cue",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await logManualContextSession(page, "too_hard", 0, contextReference);
  await expect(reliableContext.getByText("Developing", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    reliableContext.getByText("This context needs more support.", { exact: true }),
  ).toBeVisible();
  const easierAction = contextualDetail
    .getByRole("heading", { name: "Practice next", level: 6 })
    .locator("xpath=ancestor::section[1]");
  await expect(easierAction.getByText("Easier", { exact: true })).toBeVisible();
  await expect(easierAction.locator("dl dd")).toHaveText([
    "Food lure",
    "Quiet room at home",
    "Not recorded",
    "Not recorded",
    "A little",
  ]);
  if (testInfo.project.name === "phone-chromium") {
    const viewport = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(
      Math.max(viewport.documentScrollWidth, viewport.bodyScrollWidth),
      "context evidence does not clip horizontally",
    ).toBeLessThanOrEqual(viewport.viewportWidth);
  }

  // ─── 8. Brief: generate, share, finalize ───────────────────────────────
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
  expectApiClientRequestsUseViteProxy(apiClientRequests);
});

test("[phone] guided training setup resumes after reload", async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  const apiClientRequests = captureApiClientRequests(page);

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

  const preview = page
    .getByRole("heading", { name: "This week's suggestion" })
    .locator("xpath=ancestor::section[1]");
  const safetyNotice = page.getByRole("alert", { name: "Let's pause training suggestions" });
  await expect(preview).toBeVisible();
  await expect(
    preview.getByText("Lures into a sit with food in a quiet room", { exact: true }),
  ).toHaveCount(2);
  await expect(safetyNotice).toHaveCount(0);
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
  await expect(page.getByRole("heading", { name: "This week", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Juniper", exact: true })).toBeVisible();
  expectApiClientRequestsUseViteProxy(apiClientRequests);
});
