# Copilot Instructions Design

## Goal

Create a concise `.github/copilot-instructions.md` that gives future Copilot
sessions the repository-specific context needed to make safe, consistent
changes without duplicating discoverable directory listings or generic
engineering advice.

## Structure

The file will use three sections:

1. **Build, test, and lint** — prerequisites, local database/environment setup,
   repository-wide commands, package-scoped commands, and Vitest syntax for a
   single file or test name.
2. **Architecture** — the pnpm workspace boundaries and the end-to-end flow from
   shared Zod contracts through the Hono/Drizzle API and exported `AppType` to
   the React/TanStack Query frontend.
3. **Repository conventions** — cross-cutting patterns confirmed across
   multiple files, including authorization scoping, typed RPC usage, cache
   invalidation, localization parity, migrations, database-backed API tests,
   telemetry, and formatting/type constraints.

## Content Sources

Use `README.md`, `DEPLOY.md`, root and workspace package manifests, CI
workflows, TypeScript/Biome/Vitest configuration, API composition and route
helpers, frontend routing/API/query modules, shared schemas, localization
catalogs, and representative tests. No existing Copilot or other AI assistant
configuration is present to merge.

## Constraints

- Keep the guide operational and concise.
- Include only commands that exist in the repository.
- Distinguish API tests, which require Postgres and the root `.env`, from
  frontend/shared unit tests.
- Preserve important security behavior: authenticated domain resources are
  owner-scoped and return `404` for inaccessible records.
- Avoid generic practices, exhaustive file maps, and deployment setup details
  that are already documented elsewhere.

## Validation

Confirm the documented command forms against the installed package scripts and
Vitest CLI, then review the final file for accuracy against the referenced
source files.
