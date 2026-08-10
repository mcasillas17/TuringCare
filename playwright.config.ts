import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "critical-owner-journey.spec.ts",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI ? [["github"], ["html"]] : [["list"], ["html"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @turingcare/api dev",
      url: "http://127.0.0.1:3001/health",
      timeout: 120_000,
      reuseExistingServer: !isCI,
      env: { E2E_TEST_MODE: "true" },
    },
    {
      command: "pnpm --filter @turingcare/web dev --host 127.0.0.1",
      url: "http://127.0.0.1:3000",
      timeout: 120_000,
      reuseExistingServer: !isCI,
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "phone-chromium",
      use: { ...devices["Pixel 7"], browserName: "chromium" },
    },
  ],
});
