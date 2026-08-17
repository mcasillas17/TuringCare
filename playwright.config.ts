import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

function loadLocalEnv(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const equals = trimmed.indexOf("=");
      if (equals === -1) continue;

      const key = trimmed.slice(0, equals).trim();
      let value = trimmed.slice(equals + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // The required-env check below reports a clear error when .env is absent.
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Playwright E2E requires ${name}; configure it in .env or the environment.`);
  }
  return value;
}

loadLocalEnv();

const isCI = !!process.env.CI;
const webPort = 3310;
const apiPort = 3311;
const webOrigin = `http://localhost:${webPort}`;
const apiOrigin = `http://localhost:${apiPort}`;
const databaseUrl = requiredEnv("DATABASE_URL");
const authSecret = requiredEnv("BETTER_AUTH_SECRET");

process.env.PLAYWRIGHT_API_BASE_URL = apiOrigin;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "critical-owner-journey.spec.ts",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI ? [["github"], ["html"]] : [["list"], ["html"]],
  use: {
    baseURL: webOrigin,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @turingcare/api dev",
      url: `${apiOrigin}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: authSecret,
        PORT: String(apiPort),
        FRONTEND_URL: webOrigin,
        BETTER_AUTH_URL: apiOrigin,
        COOKIE_DOMAIN: "",
        E2E_TEST_MODE: "true",
      },
    },
    {
      command: `pnpm --filter @turingcare/web exec vite --port ${webPort} --strictPort`,
      url: webOrigin,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        VITE_API_URL: apiOrigin,
        VITE_API_PROXY_TARGET: apiOrigin,
      },
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
      grep: /\[desktop\]/,
    },
    {
      name: "phone-chromium",
      use: { ...devices["Pixel 7"], browserName: "chromium" },
      grep: /\[phone\]/,
    },
  ],
});
