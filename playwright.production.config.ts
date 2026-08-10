import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "production-smoke.spec.ts",
  forbidOnly: true,
  retries: 2,
  workers: 1,
  reporter: [["github"], ["html"]],
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? "https://turingcare.dog",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
