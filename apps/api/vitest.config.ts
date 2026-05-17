import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Load the root .env into process.env before any test module is imported,
    // so that env-validated modules (src/env.ts) work without manual export.
    setupFiles: ["./vitest.setup.ts"],
  },
});
