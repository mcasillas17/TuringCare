import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load the root .env so that env-validated modules (src/env.ts) work in tests
// without requiring the developer to manually export vars before running `pnpm test`.
const envPath = resolve(__dirname, "../../.env");
try {
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    // Don't override vars that are already set in the environment
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
} catch {
  // .env not found — tests that need env vars will fail with clear Zod messages
}
