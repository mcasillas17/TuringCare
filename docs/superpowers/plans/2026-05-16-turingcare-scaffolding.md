# TuringCare Session 1 — Scaffolding, Data Model & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a pnpm-workspace monorepo with a Hono+Drizzle+Better Auth backend, a Vite+React 19 frontend with end-to-end-typed Hono RPC, the full TuringCare Postgres schema, and a working register/login/logout flow — verified end-to-end against Dockerized Postgres.

**Architecture:** Three workspaces (`@turingcare/api`, `@turingcare/web`, `@turingcare/shared`). The API exports `AppType` for `hc<AppType>` RPC. The web app reaches the API same-origin through a Vite dev proxy so Better Auth's httpOnly cookies stay first-party. Drizzle owns the schema; Better Auth uses the Drizzle adapter with its default singular table names. Shared Zod schemas are the single validation source for both apps.

**Tech Stack:** pnpm 11 workspaces, Node 22 (runs on installed 24), Hono + @hono/node-server, Drizzle ORM + drizzle-kit, Better Auth, Zod, Vite + React 19 + TypeScript, Tailwind CSS v4 (Vite plugin, CSS-first), shadcn/ui, TanStack Query, React Router v7, Biome, Vitest, Docker Compose Postgres 16.

**Spec:** `docs/superpowers/specs/2026-05-16-turingcare-scaffolding-design.md`

**Conventions for every commit step:** commits are gpg-unsigned and end with the trailer:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
Use `git -c commit.gpgsign=false commit -m "<subject>" -m "<trailer>"`. The repo currently has exactly one commit (the design doc). Do not push unless the user asks.

**Version policy:** install latest stable (late-2025/early-2026) via the `pnpm add`/`create` commands shown; the lockfile pins exact versions. Expected majors: React 19, Tailwind 4, React Router 7, Hono 4, Better Auth 1.x, Drizzle ORM 0.3x/drizzle-kit 0.3x, Vitest 2/3, Biome 1.9+. If a command's flags differ from what's shown, prefer the tool's current docs over guessing — flag the deviation in the final summary.

---

## File Structure

```
/
  package.json                         root scripts, concurrently
  pnpm-workspace.yaml                  workspace globs
  tsconfig.base.json                   shared compiler options
  biome.json                           root lint/format config
  .gitignore
  .nvmrc                               "22"
  .env.example
  docker-compose.yml                   Postgres 16
  README.md
  packages/shared/
    package.json
    tsconfig.json
    src/index.ts                       barrel
    src/dog.ts                         dogProfileSchema + DogProfile
    src/auth.ts                        registerSchema, loginSchema
    src/dog.test.ts                    Vitest
  apps/api/
    package.json
    tsconfig.json
    drizzle.config.ts
    vitest.config.ts
    src/env.ts                         validated env access
    src/db/schema.ts                   Better Auth + domain tables + relations
    src/db/index.ts                    pg pool + drizzle client
    src/auth.ts                        Better Auth instance
    src/app.ts                         Hono app, chained routes, export AppType
    src/index.ts                       node-server bootstrap
    src/app.test.ts                    Vitest (/health)
  apps/web/
    package.json
    tsconfig.json / tsconfig.node.json
    vite.config.ts                     react + tailwind plugin + /api,/health,/me proxy
    components.json                    shadcn config
    index.html
    src/main.tsx                       providers + router
    src/index.css                      @import "tailwindcss"
    src/lib/utils.ts                   shadcn cn()
    src/lib/api.ts                     hc<AppType> client
    src/lib/auth-client.ts             Better Auth React client
    src/components/ui/*                shadcn components
    src/routes/{landing,login,register,app}.tsx
    src/routes/require-auth.tsx        guard
```

---

## Task 1: Repo root scaffolding

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `biome.json`, `.gitignore`, `.nvmrc`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "turingcare",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "packageManager": "pnpm@11.1.2",
  "scripts": {
    "dev": "concurrently -n api,web -c blue,magenta \"pnpm --filter @turingcare/api dev\" \"pnpm --filter @turingcare/web dev\"",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "lint": "biome check .",
    "format": "biome format --write .",
    "test": "pnpm -r test",
    "db:generate": "pnpm --filter @turingcare/api db:generate",
    "db:migrate": "pnpm --filter @turingcare/api db:migrate",
    "db:push": "pnpm --filter @turingcare/api db:push"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "concurrently": "^9.1.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true
  }
}
```

- [ ] **Step 4: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignore": ["**/dist/**", "**/drizzle/**", "**/node_modules/**", "**/components/ui/**"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "double", "semicolons": "always" } }
}
```

- [ ] **Step 5: Create `.nvmrc`**

```
22
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
build/
.vite/
*.tsbuildinfo
coverage/
.env
.env.*
!.env.example
apps/api/drizzle/meta/_journal.json.bak
.DS_Store
Thumbs.db
.idea/
.vscode/*
!.vscode/extensions.json
*.log
npm-debug.log*
pnpm-debug.log*
```

- [ ] **Step 7: Verify and commit**

Run: `pnpm install`
Expected: completes, creates `pnpm-lock.yaml`, installs Biome/concurrently/typescript at root.

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json biome.json .gitignore .nvmrc pnpm-lock.yaml
git -c commit.gpgsign=false commit -m "chore: monorepo root scaffolding" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Local infrastructure (Docker + env)

**Files:**
- Create: `docker-compose.yml`, `.env.example`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    container_name: turingcare-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: turingcare
    ports:
      - "5432:5432"
    volumes:
      - turingcare_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d turingcare"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  turingcare_pgdata:
```

- [ ] **Step 2: Create `.env.example`**

```bash
# ---- Database ----
# Local dev points at the Docker Compose Postgres (Task 2).
# Production: a Neon connection string (sslmode=require).
DATABASE_URL=postgres://postgres:postgres@localhost:5432/turingcare

# ---- API server ----
# Port the Hono backend listens on.
PORT=3001

# Origin of the web app, used for CORS allow-list and Better Auth trustedOrigins.
WEB_ORIGIN=http://localhost:3000

# ---- Better Auth ----
# Random 32+ char secret. Generate: openssl rand -base64 32
BETTER_AUTH_SECRET=dev-only-insecure-change-me-0123456789abcdef
# Public base URL of the auth server (the API).
BETTER_AUTH_URL=http://localhost:3001
```

- [ ] **Step 3: Verify Postgres boots**

Run: `cp .env.example .env && docker compose up -d`
Then: `docker compose ps`
Expected: `turingcare-postgres` listed with state `running` and health `healthy` (re-run after ~10s if still `starting`).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git -c commit.gpgsign=false commit -m "chore: docker compose postgres + env template" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `packages/shared` — Zod schemas (TDD)

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/dog.ts`, `packages/shared/src/auth.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/dog.test.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@turingcare/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^3.24.0" },
  "devDependencies": { "typescript": "^5.7.0", "vitest": "^2.1.0" }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src"]
}
```

- [ ] **Step 3: Install workspace deps**

Run: `pnpm install`
Expected: links `@turingcare/shared`, installs zod + vitest.

- [ ] **Step 4: Write the failing test — `packages/shared/src/dog.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { dogProfileSchema } from "./dog";

describe("dogProfileSchema", () => {
  it("accepts a valid profile", () => {
    const r = dogProfileSchema.safeParse({
      name: "Biscuit",
      size: "medium",
      sex: "female",
      source: "rescue",
      vaccineStage: "in_progress",
      spayedNeutered: true,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid size enum", () => {
    const r = dogProfileSchema.safeParse({
      name: "Biscuit",
      size: "enormous",
      sex: "female",
      source: "rescue",
      vaccineStage: "in_progress",
    });
    expect(r.success).toBe(false);
  });

  it("requires a name", () => {
    const r = dogProfileSchema.safeParse({
      size: "small",
      sex: "male",
      source: "breeder",
      vaccineStage: "unknown",
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 5: Run the test, verify it fails**

Run: `pnpm --filter @turingcare/shared test`
Expected: FAIL — cannot resolve `./dog`.

- [ ] **Step 6: Implement `packages/shared/src/dog.ts`**

```ts
import { z } from "zod";

export const dogSize = z.enum(["small", "medium", "large", "giant"]);
export const dogSex = z.enum(["male", "female"]);
export const dogSource = z.enum(["breeder", "rescue", "shelter", "other"]);
export const vaccineStage = z.enum(["in_progress", "complete", "unknown"]);

export const dogProfileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  breed: z.string().min(1).nullable().optional(),
  dateOfBirth: z.string().date().nullable().optional(),
  size: dogSize,
  weightLbs: z.number().positive().nullable().optional(),
  sex: dogSex,
  spayedNeutered: z.boolean().default(false),
  source: dogSource,
  adoptedAt: z.string().date().nullable().optional(),
  vaccineStage: vaccineStage,
  notes: z.string().nullable().optional(),
});

export type DogProfile = z.infer<typeof dogProfileSchema>;
```

- [ ] **Step 7: Implement `packages/shared/src/auth.ts`**

```ts
import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 8: Implement `packages/shared/src/index.ts`**

```ts
export * from "./dog";
export * from "./auth";
```

- [ ] **Step 9: Run the test, verify it passes**

Run: `pnpm --filter @turingcare/shared test`
Expected: PASS — 3 passing.

- [ ] **Step 10: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git -c commit.gpgsign=false commit -m "feat(shared): zod schemas for dog profile and auth" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `apps/api` package + Drizzle DB layer

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/env.ts`, `apps/api/src/db/index.ts`, `apps/api/drizzle.config.ts`

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@turingcare/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/app.ts",
  "exports": { ".": "./src/app.ts" },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "@hono/zod-validator": "^0.4.0",
    "@turingcare/shared": "workspace:*",
    "better-auth": "^1.1.0",
    "drizzle-orm": "^0.38.0",
    "hono": "^4.6.0",
    "pg": "^8.13.0",
    "zod": "^3.24.0",
    "@react-pdf/renderer": "^4.1.0"
  },
  "devDependencies": {
    "@types/pg": "^8.11.0",
    "drizzle-kit": "^0.30.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

Note: `@react-pdf/renderer` is installed per spec but **not imported anywhere** this session. `types`/`exports` point at `src/app.ts` so the web app imports only `AppType` (type-only, no runtime).

- [ ] **Step 2: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"],
    "lib": ["ES2023"]
  },
  "include": ["src", "drizzle.config.ts"]
}
```

- [ ] **Step 3: Install**

Run: `pnpm install`
Expected: installs Hono, Better Auth, Drizzle, pg, tsx, drizzle-kit, @react-pdf/renderer. (`@types/node` is pulled transitively by tsx; if `tsc` later complains about missing node types, add `pnpm --filter @turingcare/api add -D @types/node@^22` and note it in the summary.)

- [ ] **Step 4: Create `apps/api/src/env.ts`**

```ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3001),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3001"),
});

export const env = schema.parse(process.env);
```

- [ ] **Step 5: Create `apps/api/src/db/index.ts`**

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

export const pool = new Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export type DB = typeof db;
```

- [ ] **Step 6: Create `apps/api/drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

- [ ] **Step 7: Commit** (schema.ts comes next task; this commit is the DB plumbing)

```bash
git add apps/api/package.json apps/api/tsconfig.json apps/api/drizzle.config.ts apps/api/src/env.ts apps/api/src/db/index.ts pnpm-lock.yaml
git -c commit.gpgsign=false commit -m "feat(api): package, env validation, drizzle db client" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Drizzle schema — Better Auth + domain tables + relations

**Files:**
- Create: `apps/api/src/db/schema.ts`

- [ ] **Step 1: Create `apps/api/src/db/schema.ts`**

Better Auth's default core tables (singular `user/session/account/verification`) plus all domain tables. Enums via `pgEnum`. Cascade delete on every dog-owned table. `check` on `journal_entries.intensity`.

```ts
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/* ---------- Better Auth core tables (adapter defaults) ---------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Domain enums ---------- */

export const dogSizeEnum = pgEnum("dog_size", ["small", "medium", "large", "giant"]);
export const dogSexEnum = pgEnum("dog_sex", ["male", "female"]);
export const dogSourceEnum = pgEnum("dog_source", ["breeder", "rescue", "shelter", "other"]);
export const vaccineStageEnum = pgEnum("vaccine_stage", ["in_progress", "complete", "unknown"]);
export const concernSeverityEnum = pgEnum("concern_severity", ["mild", "moderate", "severe"]);
export const briefStatusEnum = pgEnum("brief_status", ["draft", "finalized"]);

/* ---------- Domain tables ---------- */

export const dogs = pgTable("dogs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  breed: text("breed"),
  dateOfBirth: date("date_of_birth"),
  size: dogSizeEnum("size").notNull(),
  weightLbs: numeric("weight_lbs"),
  sex: dogSexEnum("sex").notNull(),
  spayedNeutered: boolean("spayed_neutered").notNull().default(false),
  source: dogSourceEnum("source").notNull(),
  adoptedAt: date("adopted_at"),
  vaccineStage: vaccineStageEnum("vaccine_stage").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const behaviorConcerns = pgTable("behavior_concerns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dogId: uuid("dog_id")
    .notNull()
    .references(() => dogs.id, { onDelete: "cascade" }),
  concern: text("concern").notNull(),
  severity: concernSeverityEnum("severity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trainingGoals = pgTable("training_goals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dogId: uuid("dog_id")
    .notNull()
    .references(() => dogs.id, { onDelete: "cascade" }),
  goal: text("goal").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    dogId: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    antecedent: text("antecedent").notNull(),
    behavior: text("behavior").notNull(),
    consequence: text("consequence").notNull(),
    intensity: integer("intensity").notNull(),
    durationSeconds: integer("duration_seconds"),
    recoverySeconds: integer("recovery_seconds"),
    location: text("location"),
    peoplePresent: text("people_present"),
    ownerResponse: text("owner_response"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("intensity_range", sql`${t.intensity} BETWEEN 1 AND 5`)],
);

export const briefs = pgTable("briefs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dogId: uuid("dog_id")
    .notNull()
    .references(() => dogs.id, { onDelete: "cascade" }),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  status: briefStatusEnum("status").notNull().default("draft"),
  summary: text("summary").notNull(),
  version: integer("version").notNull().default(1),
});

export const trainers = pgTable("trainers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  businessName: text("business_name"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  methodologyTags: text("methodology_tags").array().notNull().default(sql`'{}'`),
  certifications: text("certifications").array().notNull().default(sql`'{}'`),
  specialties: text("specialties").array().notNull().default(sql`'{}'`),
  website: text("website"),
  email: text("email"),
  phone: text("phone"),
  notesInternal: text("notes_internal"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Relations ---------- */

export const userRelations = relations(user, ({ many }) => ({
  dogs: many(dogs),
}));

export const dogsRelations = relations(dogs, ({ one, many }) => ({
  owner: one(user, { fields: [dogs.ownerId], references: [user.id] }),
  behaviorConcerns: many(behaviorConcerns),
  trainingGoals: many(trainingGoals),
  journalEntries: many(journalEntries),
  briefs: many(briefs),
}));

export const behaviorConcernsRelations = relations(behaviorConcerns, ({ one }) => ({
  dog: one(dogs, { fields: [behaviorConcerns.dogId], references: [dogs.id] }),
}));

export const trainingGoalsRelations = relations(trainingGoals, ({ one }) => ({
  dog: one(dogs, { fields: [trainingGoals.dogId], references: [dogs.id] }),
}));

export const journalEntriesRelations = relations(journalEntries, ({ one }) => ({
  dog: one(dogs, { fields: [journalEntries.dogId], references: [dogs.id] }),
}));

export const briefsRelations = relations(briefs, ({ one }) => ({
  dog: one(dogs, { fields: [briefs.dogId], references: [dogs.id] }),
}));
```

- [ ] **Step 2: Verify schema typechecks**

Run: `pnpm --filter @turingcare/api typecheck`
Expected: PASS, no errors.

- [ ] **Step 3: Push schema to the running Postgres**

Run: `pnpm --filter @turingcare/api db:push`
Expected: drizzle-kit connects via `DATABASE_URL`, creates enums + all tables, prints applied changes, exits 0.
(If `DATABASE_URL` is not picked up, prefix the command: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/turingcare pnpm --filter @turingcare/api db:push`, and note this in the summary.)

- [ ] **Step 4: Confirm tables exist**

Run: `docker compose exec -T postgres psql -U postgres -d turingcare -c "\dt"`
Expected: lists `user, session, account, verification, dogs, behavior_concerns, training_goals, journal_entries, briefs, trainers`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts
git -c commit.gpgsign=false commit -m "feat(api): full drizzle schema with relations and constraints" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Better Auth instance

**Files:**
- Create: `apps/api/src/auth.ts`

- [ ] **Step 1: Create `apps/api/src/auth.ts`**

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";
import { env } from "./env";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  trustedOrigins: [env.WEB_ORIGIN],
  emailAndPassword: { enabled: true },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
});

export type Auth = typeof auth;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @turingcare/api typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/auth.ts
git -c commit.gpgsign=false commit -m "feat(api): better auth with drizzle adapter" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Hono app with RPC, /health, /me (TDD on /health)

**Files:**
- Create: `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/vitest.config.ts`
- Test: `apps/api/src/app.test.ts`

- [ ] **Step 1: Create `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
```

- [ ] **Step 2: Write the failing test — `apps/api/src/app.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { app } from "./app";

describe("api", () => {
  it("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("GET /me without a session returns 401", async () => {
    const res = await app.request("/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `pnpm --filter @turingcare/api test`
Expected: FAIL — cannot resolve `./app`.

- [ ] **Step 4: Implement `apps/api/src/app.ts`**

Routes are method-chained so `AppType` carries full route types into the RPC client. `/me` reads the Better Auth session from request headers.

```ts
import { zValidator } from "@hono/zod-validator";
import { loginSchema, registerSchema } from "@turingcare/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth";
import { env } from "./env";

const app = new Hono()
  .use(
    "*",
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      allowHeaders: ["Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
  )
  .get("/health", (c) => c.json({ status: "ok" } as const))
  .get("/me", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "unauthorized" } as const, 401);
    return c.json({ user: session.user });
  })
  // Zod schemas wired through @hono/zod-validator so client+server validate
  // identically. Better Auth performs the actual credential handling; these
  // routes 200 only when input is well-formed (used by the web forms today).
  .post("/api/validate/register", zValidator("json", registerSchema), (c) =>
    c.json({ ok: true } as const),
  )
  .post("/api/validate/login", zValidator("json", loginSchema), (c) =>
    c.json({ ok: true } as const),
  )
  .on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export { app };
export type AppType = typeof app;
```

- [ ] **Step 5: Implement `apps/api/src/index.ts`**

```ts
import { serve } from "@hono/node-server";
import { app } from "./app";
import { env } from "./env";

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `pnpm --filter @turingcare/api test`
Expected: PASS — both tests green. (The `/me` test exercises Better Auth's no-session path; it needs the DB up from Task 2. If Postgres is down, `docker compose up -d` first.)

- [ ] **Step 7: Boot the API and curl it**

Run (background): `pnpm --filter @turingcare/api dev`
Then: `curl -s http://localhost:3001/health`
Expected: `{"status":"ok"}`
Then: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/me`
Expected: `401`
Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/index.ts apps/api/vitest.config.ts apps/api/src/app.test.ts
git -c commit.gpgsign=false commit -m "feat(api): hono app with rpc, health, me, auth handler" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `apps/web` — Vite + React 19 + Tailwind v4 base

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/tsconfig.node.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/index.css`, `apps/web/src/lib/utils.ts`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@turingcare/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 3000 --strictPort",
    "build": "tsc -b && vite build",
    "preview": "vite preview --port 3000",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.62.0",
    "@turingcare/api": "workspace:*",
    "@turingcare/shared": "workspace:*",
    "better-auth": "^1.1.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "hono": "^4.6.0",
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.54.0",
    "@hookform/resolvers": "^3.9.1",
    "react-router-dom": "^7.1.0",
    "sonner": "^1.7.0",
    "tailwind-merge": "^2.5.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `apps/web/tsconfig.node.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "composite": true, "noEmit": true, "types": ["node"] },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `apps/web/vite.config.ts`**

Proxy `/api`, `/health`, `/me` to the API so Better Auth cookies stay first-party.

```ts
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API = "http://localhost:3001";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": { target: API, changeOrigin: true },
      "/health": { target: API, changeOrigin: true },
      "/me": { target: API, changeOrigin: true },
    },
  },
});
```

- [ ] **Step 5: Create `apps/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TuringCare</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `apps/web/src/index.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 7: Create `apps/web/src/lib/utils.ts`** (shadcn `cn` helper)

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 8: Create `apps/web/src/main.tsx`** (placeholder; router added Task 10)

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <h1 className="p-8 text-2xl font-bold">TuringCare</h1>
  </StrictMode>,
);
```

- [ ] **Step 9: Install and verify dev server boots**

Run: `pnpm install`
Run (background): `pnpm --filter @turingcare/web dev`
Then: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: `200`. Stop the dev server.

- [ ] **Step 10: Commit**

```bash
git add apps/web pnpm-lock.yaml
git -c commit.gpgsign=false commit -m "feat(web): vite + react 19 + tailwind v4 base" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: shadcn/ui + API client + auth client

**Files:**
- Create: `apps/web/components.json`, `apps/web/src/components/ui/*`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/auth-client.ts`

- [ ] **Step 1: Initialize shadcn/ui**

Run: `cd apps/web && pnpm dlx shadcn@latest init` then return to repo root.
When prompted choose: style = default, base color = slate, CSS file = `src/index.css`, CSS variables = yes, import alias `@/components` and `@/lib/utils` (matches the `@/*` path from Task 8). This writes `components.json` and Tailwind v4 theme tokens into `src/index.css`.
(If the CLI flags differ in the installed version, follow its prompts to the equivalent choices and note any deviation in the summary.)

- [ ] **Step 2: Add the starter components**

Run: `cd apps/web && pnpm dlx shadcn@latest add button input label card form sonner` then return to repo root.
Expected: creates `src/components/ui/{button,input,label,card,form,sonner}.tsx` and installs Radix deps + `@hookform/resolvers`/`react-hook-form` if missing.

- [ ] **Step 3: Create `apps/web/src/lib/api.ts`** (Hono RPC client, relative base → proxied)

```ts
import type { AppType } from "@turingcare/api";
import { hc } from "hono/client";

export const api = hc<AppType>("/");
```

- [ ] **Step 4: Create `apps/web/src/lib/auth-client.ts`** (Better Auth React client)

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/auth",
});

export const { signIn, signUp, signOut, useSession } = authClient;
```

- [ ] **Step 5: Typecheck (validates the cross-package `AppType` import)**

Run: `pnpm --filter @turingcare/web typecheck`
Expected: PASS — `AppType` resolves from `@turingcare/api` with no runtime import.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components.json apps/web/src/components apps/web/src/lib apps/web/src/index.css apps/web/package.json pnpm-lock.yaml
git -c commit.gpgsign=false commit -m "feat(web): shadcn ui, hono rpc client, better auth client" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Router, providers, and the auth flow

**Files:**
- Create: `apps/web/src/routes/landing.tsx`, `apps/web/src/routes/register.tsx`, `apps/web/src/routes/login.tsx`, `apps/web/src/routes/app.tsx`, `apps/web/src/routes/require-auth.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Create `apps/web/src/routes/require-auth.tsx`**

```tsx
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "@/lib/auth-client";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  if (isPending) return <p className="p-8">Loading…</p>;
  if (!data) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 2: Create `apps/web/src/routes/landing.tsx`**

```tsx
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function Landing() {
  return (
    <div className="p-8 space-y-4">
      <h1 className="text-3xl font-bold">TuringCare</h1>
      <p className="text-muted-foreground">
        Humane, force-free dog-training support. Journal behavior, build a Brief.
      </p>
      <div className="flex gap-3">
        <Button asChild><Link to="/register">Get started</Link></Button>
        <Button asChild variant="outline"><Link to="/login">Log in</Link></Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/src/routes/register.tsx`**

```tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/lib/auth-client";

export function Register() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    const { error } = await signUp.email({
      name: String(fd.get("name")),
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setPending(false);
    if (error) return toast.error(error.message ?? "Registration failed");
    toast.success("Account created");
    navigate("/app");
  }

  return (
    <div className="p-8 max-w-sm mx-auto">
      <Card>
        <CardHeader><CardTitle>Create account</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" minLength={8} required />
            </div>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Creating…" : "Create account"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Have an account? <Link className="underline" to="/login">Log in</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/web/src/routes/login.tsx`**

```tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";

export function Login() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    const { error } = await signIn.email({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setPending(false);
    if (error) return toast.error(error.message ?? "Login failed");
    navigate("/app");
  }

  return (
    <div className="p-8 max-w-sm mx-auto">
      <Card>
        <CardHeader><CardTitle>Log in</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Signing in…" : "Log in"}
            </Button>
            <p className="text-sm text-muted-foreground">
              No account? <Link className="underline" to="/register">Register</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Create `apps/web/src/routes/app.tsx`** (calls the typed RPC `/me`)

```tsx
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { signOut } from "@/lib/auth-client";

export function AppHome() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await api.me.$get();
      if (!res.ok) throw new Error("unauthorized");
      return res.json();
    },
  });

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Your dashboard</h1>
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <pre className="bg-muted p-4 rounded text-sm">{JSON.stringify(data, null, 2)}</pre>
      )}
      <Button
        variant="outline"
        onClick={async () => {
          await signOut();
          toast.success("Signed out");
          navigate("/login");
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: Replace `apps/web/src/main.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AppHome } from "@/routes/app";
import { Landing } from "@/routes/landing";
import { Login } from "@/routes/login";
import { Register } from "@/routes/register";
import { RequireAuth } from "@/routes/require-auth";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/app"
            element={
              <RequireAuth>
                <AppHome />
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm --filter @turingcare/web typecheck`
Expected: PASS (notably `api.me.$get()` is typed from `AppType`).
Run: `pnpm lint`
Expected: PASS (or auto-fixable; run `pnpm format` then re-run if Biome reports formatting only).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git -c commit.gpgsign=false commit -m "feat(web): router, providers, register/login/logout flow" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# TuringCare

TuringCare is a humane, force-free dog-training support platform for puppy owners and
people with newly adopted dogs. Owners keep a structured behavior journal and find
science-based trainers; the keystone artifact is an exportable **Behavior Brief** PDF
they can share with a trainer.

## Prerequisites

- Node 22 (`.nvmrc` provided; the repo also runs on Node 24)
- pnpm 11 (`corepack enable` recommended)
- Docker (for local Postgres)

## Local setup

```bash
git clone https://github.com/mcasillas17/TuringCare.git
cd TuringCare
pnpm install
cp .env.example .env
docker compose up -d                       # Postgres 16 on :5432
pnpm --filter @turingcare/api db:push      # apply the schema
pnpm dev                                   # api :3001, web :3000
```

Open http://localhost:3000, register an account, and you land on `/app`.

## Architecture

- **apps/api** — Hono on Node 22 (`@hono/node-server`), Drizzle ORM, Better Auth
  (email/password, Postgres sessions, httpOnly cookies). Exports `AppType` for
  end-to-end-typed RPC.
- **apps/web** — Vite + React 19, Tailwind v4 (CSS-first), shadcn/ui, TanStack Query,
  React Router v7. Talks to the API same-origin via a Vite dev proxy so auth cookies
  stay first-party. Uses `hc<AppType>` for typed API calls.
- **packages/shared** — Zod schemas shared by both apps.
- **Postgres 16** — Docker Compose locally, Neon in production.

## Directory layout

```
apps/api      Hono backend
apps/web      Vite + React frontend
packages/shared  Shared Zod schemas / types
docker-compose.yml  Local Postgres
```

## What's next

- Dog profile CRUD (schema already in place)
- ABC behavior journal (antecedent / behavior / consequence)
- Behavior Brief generation (`@react-pdf/renderer`, installed, unused so far)
- Force-free trainer directory & search
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git -c commit.gpgsign=false commit -m "docs: project readme with setup and roadmap" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Full end-to-end verification

No code changes — this gate must pass before declaring the session done. Fix any failure and re-run before continuing.

- [ ] **Step 1: Clean DB boot**

Run: `docker compose down -v && docker compose up -d`
Wait, then: `docker compose ps`
Expected: `turingcare-postgres` `running`/`healthy`.

- [ ] **Step 2: Apply schema**

Run: `pnpm --filter @turingcare/api db:push`
Expected: all enums + 10 tables created, exit 0.

- [ ] **Step 3: Boot both apps**

Run (background): `pnpm dev`
Expected: api logs `api listening on http://localhost:3001`; Vite logs `http://localhost:3000`. No errors in either stream.

- [ ] **Step 4: Health endpoint**

Run: `curl -s http://localhost:3001/health`
Expected: `{"status":"ok"}`

- [ ] **Step 5: Web loads**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: `200`

- [ ] **Step 6: Register → session cookie → /me (through the proxy, as the browser does)**

```bash
curl -s -c /tmp/tc.cookies -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"supersecret"}'
```
Expected: JSON containing the new user; `/tmp/tc.cookies` now holds a Better Auth session cookie.

```bash
curl -s -b /tmp/tc.cookies http://localhost:3000/me
```
Expected: `{"user":{...,"email":"test@example.com",...}}`

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/me
```
Expected: `401` (no cookie → unauthorized).

- [ ] **Step 7: Browser smoke (manual, recommended)**

Open http://localhost:3000 → Register → redirected to `/app` showing the `/me` JSON → Sign out → `/app` redirects to `/login`.

- [ ] **Step 8: Static gates**

Run: `pnpm typecheck` → all workspaces PASS.
Run: `pnpm lint` → PASS.
Run: `pnpm test` → shared + api suites PASS.

- [ ] **Step 9: Stop background processes**

Stop `pnpm dev`. Leave Postgres running or `docker compose down` per preference (volume persists).

- [ ] **Step 10: Final summary to the user**

Report: (a) what was built, (b) decisions to review (workspace names, Better Auth singular tables, Vite-proxy cookie strategy, relative RPC base, pinned dependency versions, `weight_lbs` as `numeric`/string, Node engines `>=22`), (c) exact fresh-clone commands (the README block), (d) expected output at each verified step (Steps 1–7 above).

---

## Self-Review

**Spec coverage:** monorepo scaffolding (T1) ✓; docker + .env (T2) ✓; shared Zod incl. `dogProfileSchema` (T3) ✓; api Hono+node-server, Drizzle config + db:* scripts, Better Auth email/password + Drizzle adapter + httpOnly + mounted `/api/auth/*`, CORS w/ credentials, `/health`, protected `/me` 401, `@hono/zod-validator`, `AppType` RPC export (T4–T7) ✓; web Vite+React19, Tailwind v4 CSS-first, shadcn (Button/Input/Label/Card/Form/Sonner), RR v7 routes incl. guarded `/app`, TanStack Query, `hc<AppType>`, Better Auth React client, working register/login/logout (T8–T10) ✓; full schema with FKs/cascade/check/relations (T5) ✓; README (T11) ✓; .gitignore (T1) ✓; end-to-end verification (T12) ✓. Out-of-scope items (no journal/trainer/PDF endpoints; `@react-pdf/renderer` installed-unused) respected.

**Placeholder scan:** no TBD/TODO; every code step has full content; CLI-driven steps (shadcn) specify exact selections with a documented fallback.

**Type consistency:** `AppType` exported from `apps/api/src/app.ts`, package `types`/`exports` point there, imported type-only in `apps/web/src/lib/api.ts`; `api.me.$get()` matches the chained `.get("/me")`; shared schema camelCase fields align with Drizzle column property names; Better Auth `schema` keys match exported table consts.
