# Courses Section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** A curated, filterable Courses directory. Each course is self-contained (inline provider fields, no FK), shows a small overview, and links out to the canonical provider course page. Admin-managed; seeded with Seattle Humane's 19-course catalog.

**Architecture:** Mirrors the existing Trainers patterns end-to-end — shared zod schema (like `trainer.ts`), public read route (like `trainers.ts`), admin CRUD route (like `admin-trainers.ts`), admin hooks (like `use-trainers.ts`), admin UI (like `admin/trainers.tsx`), public browse + detail pages. Plus an idempotent seed script. No org table, no trainer link, no dynamic data.

**Tech Stack:** Zod, Hono, Drizzle (pg), React 19, TanStack Query, react-router v7, Tailwind v4, lucide-react, vitest.

**Spec:** `docs/superpowers/specs/2026-05-24-courses-section-design.md`

**Conventions:** Worktree `.claude/worktrees/courses-section`, branch `worktree-courses-section`, off `origin/main`. ONE PR. gpg-unsigned commits ending:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
Env: `set -a && . ./.env && set +a`. Per-workspace cmds via `pnpm --filter`. `pnpm lint` from worktree root. **Pre-commit branch assertion:** `git branch --show-current` must equal `worktree-courses-section`; else STOP.

---

## File Structure

```
packages/shared/src/course.ts                          CREATE  schema + enums
packages/shared/src/course.test.ts                     CREATE  schema tests
packages/shared/src/index.ts                           MODIFY  export course.ts
apps/api/src/db/schema.ts                              MODIFY  +courses table
apps/api/drizzle/<n>_*.sql                             CREATE  generated migration
apps/api/src/routes/courses.ts                         CREATE  public read route
apps/api/src/routes/courses.test.ts                    CREATE  public route tests
apps/api/src/routes/admin-courses.ts                   CREATE  admin CRUD route
apps/api/src/routes/admin-courses.test.ts              CREATE  admin route tests
apps/api/src/app.ts                                    MODIFY  mount both routes
apps/api/scripts/seed-seattle-humane.ts                CREATE  seed script + data array
apps/api/scripts/seed-seattle-humane.test.ts           CREATE  data validation test
apps/web/src/i18n/en.ts                                MODIFY  +shell.courses +courses section
apps/web/src/i18n/es.ts                                MODIFY  parity
apps/web/src/lib/courses.ts                            CREATE  useCourses, useCourse
apps/web/src/routes/admin/use-courses.ts               CREATE  admin hooks
apps/web/src/routes/courses.tsx                        CREATE  browse (table + filters)
apps/web/src/routes/courses.test.tsx                   CREATE  browse tests
apps/web/src/routes/course-detail.tsx                  CREATE  detail page
apps/web/src/routes/course-detail.test.tsx             CREATE  detail tests
apps/web/src/routes/admin/courses.tsx                  CREATE  admin CRUD UI
apps/web/src/routes/admin/courses.test.tsx             CREATE  admin UI test
apps/web/src/components/app-shell/nav-items.ts         MODIFY  +Courses nav item
apps/web/src/main.tsx                                  MODIFY  +3 routes
apps/web/src/routes/admin/index.tsx                    MODIFY  +Manage courses link
docs/PROJECT-LOG.md                                    MODIFY  shipped entry
```

---

## Task T1: Shared schema

**Files:** Create `packages/shared/src/course.ts`, `packages/shared/src/course.test.ts`; modify `packages/shared/src/index.ts`.

- [ ] **Step 1: Write failing tests** — `packages/shared/src/course.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { courseInputSchema } from "./course";

const base = {
  organizationName: "Seattle Humane Dog Training Center",
  city: "Bellevue",
  state: "WA",
  name: "Puppy Manners 1",
  format: "group",
  ageGroup: "puppy",
};

describe("courseInputSchema", () => {
  it("accepts a valid course", () => {
    expect(courseInputSchema.safeParse(base).success).toBe(true);
  });
  it("defaults skillsTaught to [] and isOnline to false", () => {
    const r = courseInputSchema.parse(base);
    expect(r.skillsTaught).toEqual([]);
    expect(r.isOnline).toBe(false);
  });
  it("rejects missing organizationName", () => {
    const { organizationName, ...rest } = base;
    expect(courseInputSchema.safeParse(rest).success).toBe(false);
  });
  it("rejects missing name", () => {
    const { name, ...rest } = base;
    expect(courseInputSchema.safeParse(rest).success).toBe(false);
  });
  it("rejects a bad format enum", () => {
    expect(courseInputSchema.safeParse({ ...base, format: "lecture" }).success).toBe(false);
  });
  it("rejects a bad ageGroup enum", () => {
    expect(courseInputSchema.safeParse({ ...base, ageGroup: "senior" }).success).toBe(false);
  });
  it("rejects negative durationWeeks", () => {
    expect(courseInputSchema.safeParse({ ...base, durationWeeks: -1 }).success).toBe(false);
  });
  it("accepts optional fields incl. skillsTaught + coursePageUrl", () => {
    expect(
      courseInputSchema.safeParse({
        ...base,
        description: "A 6-week class.",
        ageRange: "15-20 weeks",
        durationWeeks: 6,
        sessionMinutes: 60,
        prerequisites: "Dog Training Basics",
        skillsTaught: ["polite greetings", "basic skills"],
        isOnline: true,
        coursePageUrl: "https://example.com/course",
      }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `pnpm --filter @turingcare/shared test` → fails (module missing).

- [ ] **Step 3: Implement** — `packages/shared/src/course.ts`:

```ts
import { z } from "zod";

export const courseFormats = ["group", "workshop", "seminar", "private", "drop_in"] as const;
export const courseAgeGroups = ["puppy", "adolescent", "adult", "any"] as const;

export const courseInputSchema = z.object({
  organizationName: z.string().min(1, "Organization is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  format: z.enum(courseFormats),
  ageGroup: z.enum(courseAgeGroups),
  ageRange: z.string().nullable().optional(),
  durationWeeks: z.number().int().positive().nullable().optional(),
  sessionMinutes: z.number().int().positive().nullable().optional(),
  prerequisites: z.string().nullable().optional(),
  skillsTaught: z.array(z.string().min(1)).default([]),
  isOnline: z.boolean().default(false),
  coursePageUrl: z.string().nullable().optional(),
});
export type CourseInput = z.infer<typeof courseInputSchema>;
```

Append to `packages/shared/src/index.ts` (alphabetical with the other exports): `export * from "./course";`

- [ ] **Step 4: Run, verify pass** — `pnpm --filter @turingcare/shared test` → all green.

- [ ] **Step 5: Commit** — branch assertion, then:
```bash
git add packages/shared/src/course.ts packages/shared/src/course.test.ts packages/shared/src/index.ts
git -c commit.gpgsign=false commit -m "feat(shared): courseInputSchema + format/ageGroup enums" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T2: DB table + migration

**Files:** Modify `apps/api/src/db/schema.ts`; generated migration under `apps/api/drizzle/`.

- [ ] **Step 1: Add the table** — in `apps/api/src/db/schema.ts`, after the `trainers` table:

```ts
export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationName: text("organization_name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  format: text("format").notNull(),
  ageGroup: text("age_group").notNull(),
  ageRange: text("age_range"),
  durationWeeks: integer("duration_weeks"),
  sessionMinutes: integer("session_minutes"),
  prerequisites: text("prerequisites"),
  skillsTaught: text("skills_taught").array().notNull().default(sql`'{}'`),
  isOnline: boolean("is_online").notNull().default(false),
  coursePageUrl: text("course_page_url"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

(Confirm `integer`, `boolean`, `text`, `uuid`, `timestamp`, `sql` are already imported in schema.ts — they are, used by existing tables.)

- [ ] **Step 2: Generate migration**
```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api db:generate
```
Spot-check the new `apps/api/drizzle/000N_*.sql` creates `courses` with **no foreign keys**, `skills_taught` as a text[] default `'{}'`, `is_online` default false. If it differs materially, STOP and report (don't hand-edit).

- [ ] **Step 3: Apply + verify existing tests**
```bash
pnpm --filter @turingcare/api db:migrate
pnpm --filter @turingcare/api test
```
Existing tests still pass; no new tests yet.

- [ ] **Step 4: Commit**
```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/
git -c commit.gpgsign=false commit -m "feat(api): courses table (self-contained, inline provider)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T3: Public read route

**Files:** Create `apps/api/src/routes/courses.ts`, `apps/api/src/routes/courses.test.ts`; modify `apps/api/src/app.ts`.

- [ ] **Step 1: Write failing tests** — `apps/api/src/routes/courses.test.ts`. Use the `createTestUser` + admin pattern from `admin-trainers.test.ts` (read it for the exact helper imports). A helper inserts a course via the admin route. Cases:
  - GET `/api/courses` without auth → 401
  - admin creates 2 courses (different ageGroup/format/state/isOnline) → GET `/api/courses` (as a normal user) returns both
  - `?ageGroup=puppy` returns only the puppy one; `?format=workshop`; `?state=WA`; `?online=true` each narrow correctly
  - GET `/api/courses/:id` returns the course; unknown id → 404

(Pattern: create via `app.request("/api/admin/courses", { method:"POST", headers: admin.authHeaders, body: JSON.stringify(courseBody) })`, read via `app.request("/api/courses", { headers: user.authHeaders })`.)

- [ ] **Step 2: Run, verify fail** — `pnpm --filter @turingcare/api test courses.test` → fails (route not mounted).

- [ ] **Step 3: Implement** — `apps/api/src/routes/courses.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { courses } from "../db/schema";
import { type Vars, requireUser } from "../middleware/require-user";

export const coursesApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const ageGroup = c.req.query("ageGroup");
    const format = c.req.query("format");
    const state = c.req.query("state");
    const online = c.req.query("online");
    const conds = [];
    if (ageGroup) conds.push(eq(courses.ageGroup, ageGroup));
    if (format) conds.push(eq(courses.format, format));
    if (state) conds.push(eq(courses.state, state));
    if (online === "true") conds.push(eq(courses.isOnline, true));
    const rows = await db
      .select()
      .from(courses)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(courses.organizationName, courses.position);
    return c.json({ courses: rows });
  })
  .get("/:id", async (c) => {
    const [course] = await db.select().from(courses).where(eq(courses.id, c.req.param("id")));
    if (!course) return c.json({ error: "not_found" } as const, 404);
    return c.json({ course });
  });
```

Mount in `apps/api/src/app.ts` — add to the chained `.route(...)` calls (near `/api/trainers`), import `coursesApp`:
```ts
.route("/api/courses", coursesApp)
```

- [ ] **Step 4: Run, verify pass** — `pnpm --filter @turingcare/api test courses.test` (+ full api suite stays green).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/routes/courses.ts apps/api/src/routes/courses.test.ts apps/api/src/app.ts
git -c commit.gpgsign=false commit -m "feat(api): GET /api/courses (list + filters) and /:id" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T4: Admin CRUD route

**Files:** Create `apps/api/src/routes/admin-courses.ts`, `apps/api/src/routes/admin-courses.test.ts`; modify `apps/api/src/app.ts`.

- [ ] **Step 1: Write failing tests** — `admin-courses.test.ts`, mirroring `admin-trainers.test.ts`:
  - 401 anon / 403 non-admin on POST
  - 201 create → appears in public `GET /api/courses`
  - 200 update changes a field / 404 unknown id
  - 200 delete + removal from public list / 404 unknown id
  - 400 invalid body (bad `format` enum; missing `organizationName`)

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — `apps/api/src/routes/admin-courses.ts` (mirror `admin-trainers.ts`):

```ts
import { zValidator } from "@hono/zod-validator";
import { courseInputSchema } from "@turingcare/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { courses } from "../db/schema";
import { type AdminVars, requireAdmin } from "../middleware/require-admin";

export const adminCoursesApp = new Hono<{ Variables: AdminVars }>()
  .use("*", requireAdmin)
  .post("/", zValidator("json", courseInputSchema), async (c) => {
    const [course] = await db.insert(courses).values(c.req.valid("json")).returning();
    return c.json({ course }, 201);
  })
  .put("/:id", zValidator("json", courseInputSchema), async (c) => {
    const [course] = await db
      .update(courses)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(eq(courses.id, c.req.param("id")))
      .returning();
    if (!course) return c.json({ error: "not_found" } as const, 404);
    return c.json({ course });
  })
  .delete("/:id", async (c) => {
    const [deleted] = await db
      .delete(courses)
      .where(eq(courses.id, c.req.param("id")))
      .returning({ id: courses.id });
    if (!deleted) return c.json({ error: "not_found" } as const, 404);
    return c.json({ ok: true } as const);
  });
```

Mount in `apps/api/src/app.ts` (near `/api/admin/trainers`):
```ts
.route("/api/admin/courses", adminCoursesApp)
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/routes/admin-courses.ts apps/api/src/routes/admin-courses.test.ts apps/api/src/app.ts
git -c commit.gpgsign=false commit -m "feat(api): admin courses CRUD (POST/PUT/DELETE)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T5: i18n keys

**Files:** Modify `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`.

- [ ] **Step 1: Add `shell.courses` + a `courses:` section to en.ts.** Place `courses:` after the `trainersDir:` section. Keys:

```ts
  courses: {
    title: "Courses",
    subtitle: "Browse training classes from local providers.",
    empty: "No courses yet.",
    emptyFiltered: "No courses match your filters.",
    loadError: "Couldn't load courses.",
    filterAgeGroup: "Age",
    filterFormat: "Format",
    filterState: "State",
    filterOnline: "Online only",
    clear: "Clear",
    agePuppy: "Puppy",
    ageAdolescent: "Adolescent",
    ageAdult: "Adult",
    ageAny: "Any age",
    formatGroup: "Group class",
    formatWorkshop: "Workshop",
    formatSeminar: "Seminar",
    formatPrivate: "Private",
    formatDropIn: "Drop-in",
    weeks: "weeks",
    minutesPerSession: "min/session",
    online: "Online",
    prerequisites: "Prerequisites",
    skillsTaught: "Skills you'll learn",
    offeredBy: "Offered by",
    viewCoursePage: "View full details & register",
    back: "Back to courses",
    colCourse: "Course",
    colAge: "Age",
    colFormat: "Format",
    colOfferedBy: "Offered by",
  },
```

Add `courses: "Courses"` to the existing `shell:` section.

- [ ] **Step 2: Add the same to es.ts (parity).**

```ts
  courses: {
    title: "Cursos",
    subtitle: "Explora clases de entrenamiento de proveedores locales.",
    empty: "Aún no hay cursos.",
    emptyFiltered: "Ningún curso coincide con tus filtros.",
    loadError: "No se pudieron cargar los cursos.",
    filterAgeGroup: "Edad",
    filterFormat: "Formato",
    filterState: "Estado",
    filterOnline: "Solo en línea",
    clear: "Limpiar",
    agePuppy: "Cachorro",
    ageAdolescent: "Adolescente",
    ageAdult: "Adulto",
    ageAny: "Cualquier edad",
    formatGroup: "Clase grupal",
    formatWorkshop: "Taller",
    formatSeminar: "Seminario",
    formatPrivate: "Privada",
    formatDropIn: "Sin cita",
    weeks: "semanas",
    minutesPerSession: "min/sesión",
    online: "En línea",
    prerequisites: "Requisitos",
    skillsTaught: "Habilidades que aprenderás",
    offeredBy: "Ofrecido por",
    viewCoursePage: "Ver detalles y registrarse",
    back: "Volver a cursos",
    colCourse: "Curso",
    colAge: "Edad",
    colFormat: "Formato",
    colOfferedBy: "Ofrecido por",
  },
```

Add `courses: "Cursos"` to the `shell:` section in es.ts.

- [ ] **Step 3: Gate** — `pnpm --filter @turingcare/web exec tsc --noEmit` (the `es satisfies Messages` check enforces parity) + `pnpm --filter @turingcare/web test -- i18n`.

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git -c commit.gpgsign=false commit -m "i18n: +courses section + shell.courses (en+es)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T6: Web hooks

**Files:** Create `apps/web/src/lib/courses.ts` (consumer hooks) + `apps/web/src/routes/admin/use-courses.ts` (admin hooks, mirror `use-trainers.ts`).

- [ ] **Step 1: Implement consumer hooks** — `apps/web/src/lib/courses.ts`:

```ts
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export type Course = {
  id: string;
  organizationName: string;
  city: string;
  state: string;
  name: string;
  description: string | null;
  format: string;
  ageGroup: string;
  ageRange: string | null;
  durationWeeks: number | null;
  sessionMinutes: number | null;
  prerequisites: string | null;
  skillsTaught: string[];
  isOnline: boolean;
  coursePageUrl: string | null;
};

export type CourseFilters = {
  ageGroup?: string;
  format?: string;
  state?: string;
  online?: boolean;
};

export function useCourses(filters: CourseFilters) {
  return useQuery({
    queryKey: ["courses", filters],
    queryFn: async () => {
      const res = await api.api.courses.$get({
        query: {
          ageGroup: filters.ageGroup || undefined,
          format: filters.format || undefined,
          state: filters.state || undefined,
          online: filters.online ? "true" : undefined,
        },
      });
      if (!res.ok) throw new Error("load_failed");
      return ((await res.json()) as { courses: Course[] }).courses;
    },
  });
}

export function useCourse(id: string) {
  return useQuery({
    queryKey: ["course", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await api.api.courses[":id"].$get({ param: { id } });
      if (!res.ok) throw new Error("load_failed");
      return ((await res.json()) as { course: Course }).course;
    },
  });
}
```

- [ ] **Step 2: Implement admin hooks** — `apps/web/src/routes/admin/use-courses.ts`, mirroring `use-trainers.ts` exactly but for courses: `useAdminCourses` (reads `api.api.courses.$get`, key `["admin","courses"]`), `useCreateCourse` (`api.api.admin.courses.$post`), `useUpdateCourse` (`api.api.admin.courses[":id"].$put`), `useDeleteCourse` (`api.api.admin.courses[":id"].$delete`). Reuse the `Course` type from `@/lib/courses` and `CourseInput` from `@turingcare/shared`.

- [ ] **Step 3: Typecheck** — `pnpm --filter @turingcare/web exec tsc --noEmit` → 0 (RPC shapes inferred from T3+T4).

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/lib/courses.ts apps/web/src/routes/admin/use-courses.ts
git -c commit.gpgsign=false commit -m "feat(web): course hooks (consumer + admin)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T7: Browse page (table + filters) + nav + route

**Files:** Create `apps/web/src/routes/courses.tsx`, `apps/web/src/routes/courses.test.tsx`; modify `apps/web/src/components/app-shell/nav-items.ts`, `apps/web/src/main.tsx`.

- [ ] **Step 1: Write failing test** — `courses.test.tsx`: stub fetch returning `{ courses: [<two courses>] }`; render `<Courses/>` inside `QueryClientProvider + LocaleProvider + MemoryRouter` (mirror `trainers.test.tsx`). Assert: a table row shows course name + organizationName; the Course cell is a link to `/my/courses/:id`; filter controls render. Add an empty-state case (`{ courses: [] }` → `courses.empty`).

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — `apps/web/src/routes/courses.tsx`. Mirror `trainers.tsx` structure (filter state via `useState`, `useCourses(filters)`), but render a **table**:

```tsx
import { useI18n } from "@/i18n";
import { type CourseFilters, useCourses } from "@/lib/courses";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const input = "rounded border border-silver bg-white px-2 py-1 text-sm";

export function Courses() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<CourseFilters>({});
  const { data: courses, isError } = useCourses(filters);
  const hasFilters = !!(filters.ageGroup || filters.format || filters.state || filters.online);

  const ageLabel: Record<string, string> = {
    puppy: t("courses.agePuppy"), adolescent: t("courses.ageAdolescent"),
    adult: t("courses.ageAdult"), any: t("courses.ageAny"),
  };
  const fmtLabel: Record<string, string> = {
    group: t("courses.formatGroup"), workshop: t("courses.formatWorkshop"),
    seminar: t("courses.formatSeminar"), private: t("courses.formatPrivate"),
    drop_in: t("courses.formatDropIn"),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-slate">{t("courses.title")}</h1>
      <p className="text-slate-soft">{t("courses.subtitle")}</p>
      <div className="flex flex-wrap gap-2">
        <select className={input} value={filters.ageGroup ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, ageGroup: e.target.value || undefined }))}>
          <option value="">{t("courses.filterAgeGroup")}</option>
          <option value="puppy">{t("courses.agePuppy")}</option>
          <option value="adolescent">{t("courses.ageAdolescent")}</option>
          <option value="adult">{t("courses.ageAdult")}</option>
          <option value="any">{t("courses.ageAny")}</option>
        </select>
        <select className={input} value={filters.format ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, format: e.target.value || undefined }))}>
          <option value="">{t("courses.filterFormat")}</option>
          <option value="group">{t("courses.formatGroup")}</option>
          <option value="workshop">{t("courses.formatWorkshop")}</option>
          <option value="seminar">{t("courses.formatSeminar")}</option>
          <option value="private">{t("courses.formatPrivate")}</option>
          <option value="drop_in">{t("courses.formatDropIn")}</option>
        </select>
        <input className={input} placeholder={t("courses.filterState")} value={filters.state ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value || undefined }))} />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={!!filters.online}
            onChange={(e) => setFilters((f) => ({ ...f, online: e.target.checked || undefined }))} />
          {t("courses.filterOnline")}
        </label>
        <button type="button" className={input} onClick={() => setFilters({})}>
          {t("courses.clear")}
        </button>
      </div>

      {isError && <p className="text-red-600">{t("courses.loadError")}</p>}
      {courses?.length === 0 && (
        <p className="text-slate-soft">{hasFilters ? t("courses.emptyFiltered") : t("courses.empty")}</p>
      )}
      {courses && courses.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-silver text-left text-slate-soft">
              <th className="py-2">{t("courses.colCourse")}</th>
              <th className="py-2">{t("courses.colAge")}</th>
              <th className="py-2">{t("courses.colFormat")}</th>
              <th className="py-2">{t("courses.colOfferedBy")}</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((co) => (
              <tr key={co.id} className="cursor-pointer border-b border-silver hover:bg-surface-sand"
                onClick={() => navigate(`/my/courses/${co.id}`)}>
                <td className="py-2 font-medium text-slate">
                  <Link to={`/my/courses/${co.id}`} onClick={(e) => e.stopPropagation()}>{co.name}</Link>
                </td>
                <td className="py-2 text-slate-soft">{ageLabel[co.ageGroup] ?? co.ageGroup}</td>
                <td className="py-2 text-slate-soft">{fmtLabel[co.format] ?? co.format}</td>
                <td className="py-2 text-slate-soft">{co.organizationName} · {co.city}, {co.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

If biome flags the clickable `<tr>` (a11y), keep the Course-cell `<Link>` and remove the `<tr onClick>` + cursor/hover (Link-only fallback per spec). Re-run `pnpm lint`.

- [ ] **Step 4: Nav item** — `apps/web/src/components/app-shell/nav-items.ts`: import `GraduationCap` from `lucide-react`; add `{ to: "/my/courses", labelKey: "shell.courses", icon: GraduationCap }` between the Trainers and Profile entries.

- [ ] **Step 5: Route** — `apps/web/src/main.tsx`: add `<Route path="/my/courses" element={<Courses />} />` (import `Courses`) inside the RequireAuth group, after the trainers routes.

- [ ] **Step 6: Run gates** — `pnpm --filter @turingcare/web exec tsc --noEmit`, `pnpm --filter @turingcare/web test -- courses`, `pnpm lint`.

- [ ] **Step 7: Commit**
```bash
git add apps/web/src/routes/courses.tsx apps/web/src/routes/courses.test.tsx apps/web/src/components/app-shell/nav-items.ts apps/web/src/main.tsx
git -c commit.gpgsign=false commit -m "feat(web): /my/courses browse table + filters + nav item" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T8: Detail page

**Files:** Create `apps/web/src/routes/course-detail.tsx`, `apps/web/src/routes/course-detail.test.tsx`; modify `apps/web/src/main.tsx`.

- [ ] **Step 1: Write failing test** — `course-detail.test.tsx`: stub fetch `{ course: {...} }`; assert name, a skill, prerequisites render; the "View full details & register" link present with the `coursePageUrl` href + `target="_blank"`; when `coursePageUrl` is null the link is absent; assert no email/contact action and no trainer link.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — `apps/web/src/routes/course-detail.tsx`:

```tsx
import { useI18n } from "@/i18n";
import { useCourse } from "@/lib/courses";
import { Link, useParams } from "react-router-dom";

export function CourseDetail() {
  const { t } = useI18n();
  const { id = "" } = useParams();
  const { data: co, isLoading, isError } = useCourse(id);
  if (isLoading) return <p>{t("common.loading")}</p>;
  if (isError || !co) return <p className="text-red-600">{t("courses.loadError")}</p>;

  const ageLabel: Record<string, string> = {
    puppy: t("courses.agePuppy"), adolescent: t("courses.ageAdolescent"),
    adult: t("courses.ageAdult"), any: t("courses.ageAny"),
  };
  const fmtLabel: Record<string, string> = {
    group: t("courses.formatGroup"), workshop: t("courses.formatWorkshop"),
    seminar: t("courses.formatSeminar"), private: t("courses.formatPrivate"),
    drop_in: t("courses.formatDropIn"),
  };
  const meta = [
    fmtLabel[co.format] ?? co.format,
    co.durationWeeks ? `${co.durationWeeks} ${t("courses.weeks")}` : null,
    co.sessionMinutes ? `${co.sessionMinutes} ${t("courses.minutesPerSession")}` : null,
    co.isOnline ? t("courses.online") : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/my/courses" className="text-sm text-slate-soft hover:underline">← {t("courses.back")}</Link>
      <h1 className="text-2xl font-bold text-slate">{co.name}</h1>
      <p className="text-slate-soft">{meta}{co.ageRange ? ` · ${ageLabel[co.ageGroup] ?? co.ageGroup} (${co.ageRange})` : ` · ${ageLabel[co.ageGroup] ?? co.ageGroup}`}</p>
      <p className="text-sm text-slate">{t("courses.offeredBy")}: {co.organizationName} · {co.city}, {co.state}</p>
      {co.description && <p className="text-slate">{co.description}</p>}
      {co.skillsTaught.length > 0 && (
        <div>
          <h2 className="font-semibold text-slate">{t("courses.skillsTaught")}</h2>
          <ul className="list-disc pl-5 text-sm text-slate">
            {co.skillsTaught.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
      )}
      {co.prerequisites && (
        <p className="text-sm text-slate"><span className="font-semibold">{t("courses.prerequisites")}:</span> {co.prerequisites}</p>
      )}
      {co.coursePageUrl && (
        <a href={co.coursePageUrl} target="_blank" rel="noopener noreferrer"
          className="inline-block rounded bg-slate px-4 py-2 text-cream">
          {t("courses.viewCoursePage")} ↗
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Route** — `apps/web/src/main.tsx`: `<Route path="/my/courses/:id" element={<CourseDetail />} />` (import it), after `/my/courses`.

- [ ] **Step 5: Run gates** (tsc, test -- course-detail, lint).

- [ ] **Step 6: Commit**
```bash
git add apps/web/src/routes/course-detail.tsx apps/web/src/routes/course-detail.test.tsx apps/web/src/main.tsx
git -c commit.gpgsign=false commit -m "feat(web): /my/courses/:id detail page (overview + course-page link)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T9: Admin CRUD UI

**Files:** Create `apps/web/src/routes/admin/courses.tsx`, `apps/web/src/routes/admin/courses.test.tsx`; modify `apps/web/src/main.tsx`, `apps/web/src/routes/admin/index.tsx`.

- [ ] **Step 1: Write failing test** — `admin/courses.test.tsx`: mirror `admin/trainers.test.tsx` — mock `@/lib/api`; assert the add-form renders the inline fields (organizationName, name, format `<select>`, ageGroup `<select>`, skillsTaught input) and that submitting a valid form calls the create mutation.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — `apps/web/src/routes/admin/courses.tsx`, mirroring `apps/web/src/routes/admin/trainers.tsx` (read it for the exact list+form+edit+delete structure). Differences: the fields are the course fields (organizationName, city, state, name, description, format `<select>` over `courseFormats`, ageGroup `<select>` over `courseAgeGroups`, ageRange, durationWeeks number, sessionMinutes number, prerequisites, skillsTaught comma-separated→array, isOnline checkbox, coursePageUrl). Numbers parse with `Number(...)` → `undefined` when blank. Uses `useAdminCourses`/`useCreateCourse`/`useUpdateCourse`/`useDeleteCourse` from `use-courses.ts`. Export `AdminCourses`. English-only (admin internal, same as admin/trainers).

- [ ] **Step 4: Route + dashboard link**
  - `apps/web/src/main.tsx`: lazy-import `AdminCourses` (mirror the `AdminTrainers` lazy import at line ~38) and add a `<Route path="/admin/courses">` wrapped in `<RequireAdmin>` + `<Suspense>`, mirroring the `/admin/trainers` block.
  - `apps/web/src/routes/admin/index.tsx`: add `<Link to="/admin/courses" className="text-sm underline">Manage courses</Link>` next to the existing "Manage trainers" link.

- [ ] **Step 5: Run gates** (tsc, test -- admin/courses, lint).

- [ ] **Step 6: Commit**
```bash
git add apps/web/src/routes/admin/courses.tsx apps/web/src/routes/admin/courses.test.tsx apps/web/src/routes/admin/use-courses.ts apps/web/src/main.tsx apps/web/src/routes/admin/index.tsx
git -c commit.gpgsign=false commit -m "feat(web): /admin/courses CRUD UI + dashboard link" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T10: Seed script + Seattle Humane data

**Files:** Create `apps/api/scripts/seed-seattle-humane.ts`, `apps/api/scripts/seed-seattle-humane.test.ts`.

- [ ] **Step 1: Write the data + script** — `apps/api/scripts/seed-seattle-humane.ts`. Header comment: demo/seed data, source `https://www.seattlehumane.org/services/dog-training-center/`, sourced 2026-05-24. Export `seattleHumaneCourses: CourseInput[]` and a `main()` that idempotently inserts.

```ts
// Demo/seed data — Seattle Humane Dog Training Center course catalog.
// Source: https://www.seattlehumane.org/services/dog-training-center/  (sourced 2026-05-24)
// Public info; safe to commit. Remove once a real provider-onboarding flow exists.
import { courseInputSchema, type CourseInput } from "@turingcare/shared";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { courses } from "../src/db/schema";

const ORG = "Seattle Humane Dog Training Center";
const base = { organizationName: ORG, city: "Bellevue", state: "WA" } as const;

export const seattleHumaneCourses: CourseInput[] = [
  { ...base, name: "Dog Training Basics", format: "seminar", ageGroup: "any", ageRange: "All dogs", sessionMinutes: 90, description: "Required orientation seminar: how dogs learn and positive-reinforcement marker training.", skillsTaught: ["how dogs learn", "positive reinforcement", "marker training"], isOnline: true, coursePageUrl: "https://www.seattlehumane.org/dog-training-center/behavior-basics-seminar" },
  { ...base, name: "Welcome Home", format: "seminar", ageGroup: "any", ageRange: "New dogs & puppies", sessionMinutes: 120, description: "Guidance for helping a new or newly adopted dog settle in.", skillsTaught: ["settling in", "early good behavior"], coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Welcome_Home" },
  { ...base, name: "Pet First Aid Basics", format: "seminar", ageGroup: "any", ageRange: "All pets", sessionMinutes: 120, description: "Prevention and handling of common pet emergencies.", skillsTaught: ["bleeding control", "CPR", "choking response"], coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Pet_First_Aid_Basics" },
  { ...base, name: "Loose Leash Walking Workshop", format: "workshop", ageGroup: "any", durationWeeks: 3, sessionMinutes: 45, prerequisites: "Dog Training Basics", description: "Build calm, focused leash manners with real-life practice.", skillsTaught: ["calm walking", "focus around distractions", "real-life walking"], coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Loose_Leash_Walking_Workshop" },
  { ...base, name: "Recall Workshop", format: "workshop", ageGroup: "any", durationWeeks: 3, sessionMinutes: 60, prerequisites: "Dog Training Basics", description: "Turn unreliable responses into consistent check-ins; ends with a field trip.", skillsTaught: ["reliable recall", "recall around distractions"], coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Recall_Workshop" },
  { ...base, name: "Puppy Play Skills", format: "drop_in", ageGroup: "puppy", ageRange: "8-24 weeks", sessionMinutes: 45, description: "Supervised off-leash play, grouped by age and size.", skillsTaught: ["off-leash play", "social skills"], coursePageUrl: "https://www.seattlehumane.org/dog-training-center/puppy-play-skills/" },
  { ...base, name: "Puppy Head Start", format: "group", ageGroup: "puppy", ageRange: "8-14 weeks", durationWeeks: 6, sessionMinutes: 60, prerequisites: "Dog Training Basics", description: "Early socialization and the foundations of manners.", skillsTaught: ["polite greetings", "leash foundations", "recall foundations", "socialization"], coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Puppy_Head_Start" },
  { ...base, name: "Puppy Manners 1", format: "group", ageGroup: "puppy", ageRange: "15-20 weeks", durationWeeks: 6, sessionMinutes: 60, prerequisites: "Dog Training Basics", description: "Real-life skills, confidence and socialization for young puppies.", skillsTaught: ["polite greetings", "basic skills", "socialization", "off-leash play"], coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Puppy_Manners_1" },
  { ...base, name: "Puppy Manners 2", format: "group", ageGroup: "puppy", ageRange: "Up to 12 months", durationWeeks: 6, sessionMinutes: 60, prerequisites: "Puppy Manners 1", description: "Progress recall and leash work; add stay, leave-it, targeting and wait.", skillsTaught: ["recall", "leash walking", "stay", "leave-it", "hand targeting", "wait"], coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Puppy_Manners_2" },
  { ...base, name: "Teen Play Skills", format: "drop_in", ageGroup: "adolescent", ageRange: "6-12 months", sessionMinutes: 45, description: "Structured play to burn energy and build social skills.", skillsTaught: ["structured play", "regulating excitement"], coursePageUrl: "https://www.seattlehumane.org/services/dog-training-center/teen-play-skills-sessions/" },
  { ...base, name: "Teen Dog Manners", format: "group", ageGroup: "adolescent", ageRange: "5-12 months", durationWeeks: 6, sessionMinutes: 60, prerequisites: "Dog Training Basics", description: "Manners support through the tricky adolescent stage.", skillsTaught: ["loose leash walking", "hand targeting", "polite greetings"], coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Teen_Dog_Manners" },
  { ...base, name: "Dog Manners 1", format: "group", ageGroup: "adult", ageRange: "12 months & older", durationWeeks: 6, sessionMinutes: 60, prerequisites: "Dog Training Basics", description: "Build the dog/handler relationship through training and communication.", skillsTaught: ["polite greetings", "basic skills", "prevention of unwanted behavior"], coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Dog_Manners_1" },
  { ...base, name: "Dog Manners 2", format: "group", ageGroup: "adult", ageRange: "7 months & older", durationWeeks: 6, sessionMinutes: 60, prerequisites: "Puppy Manners 2 / Teen Dog Manners / Shy Dog Manners / Dog Manners 1, or instructor permission", description: "Reliability around distractions, at distance and for longer durations.", skillsTaught: ["distraction reliability", "distance responsiveness", "duration"], coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Dog_Manners_2" },
  { ...base, name: "Dog Manners 3: Manners About Town", format: "drop_in", ageGroup: "adult", prerequisites: "Dog Manners 2 or instructor permission", description: "Drop-in practice in rotating real-world locations.", skillsTaught: ["real-world focus", "loose-leash walking", "polite greetings", "long line handling"], coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Dog_Manners_3" },
  { ...base, name: "Shy Dog Manners", format: "group", ageGroup: "any", ageRange: "5.5 months & older", durationWeeks: 6, sessionMinutes: 60, prerequisites: "Dog Training Basics", description: "Basic manners for fearful dogs, at their own pace.", skillsTaught: ["confidence for fearful dogs", "basic manners"], coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Shy_Dog_Manners" },
  { ...base, name: "Reactive Rover", format: "group", ageGroup: "any", ageRange: "Leash-reactive dogs", description: "Progressive program for dogs who bark, lunge or growl on leash.", skillsTaught: ["manage reactivity", "build confidence", "handling skills"], coursePageUrl: "https://www.seattlehumane.org/services/dog-training/reactive-rover" },
  { ...base, name: "It's Tricky: Trick Training", format: "group", ageGroup: "any", ageRange: "5 months & older", durationWeeks: 6, sessionMinutes: 60, prerequisites: "Dog Training Basics", description: "Clear-communication trick training; optional AKC Trick Dog title.", skillsTaught: ["tricks", "AKC Trick Dog title prep"], coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Its_Tricky_Trick_Training" },
  { ...base, name: "Canine Good Citizen", format: "group", ageGroup: "any", ageRange: "8 months & older", durationWeeks: 6, sessionMinutes: 60, prerequisites: "Dog Manners 2 or instructor permission", description: "Prep + test for the AKC Canine Good Citizen certification.", skillsTaught: ["AKC Canine Good Citizen test prep"], coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Canine_Good_Citizen_Prep_&_Test" },
  { ...base, name: "Nose Work for Fun", format: "group", ageGroup: "any", ageRange: "15 weeks & older", durationWeeks: 3, sessionMinutes: 60, prerequisites: "Dog Training Basics (Reactive Rover 1 if leash-reactive)", description: "Confidence and enrichment through scent games.", skillsTaught: ["scent games", "confidence", "enrichment"], coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Nose_Work_For_Fun" },
];

export async function main() {
  let inserted = 0;
  for (let i = 0; i < seattleHumaneCourses.length; i++) {
    const data = courseInputSchema.parse(seattleHumaneCourses[i]);
    const existing = await db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.organizationName, data.organizationName), eq(courses.name, data.name)));
    if (existing.length > 0) continue;
    await db.insert(courses).values({ ...data, position: i });
    inserted++;
  }
  console.log(`Seeded ${inserted} new course(s); ${seattleHumaneCourses.length - inserted} already present.`);
}

// Run when invoked directly (tsx scripts/seed-seattle-humane.ts)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 2: Write the data-validation test** — `apps/api/scripts/seed-seattle-humane.test.ts` (no DB):

```ts
import { courseInputSchema } from "@turingcare/shared";
import { describe, expect, it } from "vitest";
import { seattleHumaneCourses } from "./seed-seattle-humane";

describe("seattleHumaneCourses", () => {
  it("has 19 courses", () => {
    expect(seattleHumaneCourses).toHaveLength(19);
  });
  it("every course passes courseInputSchema", () => {
    for (const c of seattleHumaneCourses) {
      expect(courseInputSchema.safeParse(c).success).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run, verify pass** — `pnpm --filter @turingcare/api test seed-seattle-humane`. (Importing the script must not run `main()` — the `import.meta.url` guard prevents that. Confirm the test doesn't hit the DB.)

- [ ] **Step 4: Run the seed against the dev DB (optional but recommended)** —
```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api exec tsx scripts/seed-seattle-humane.ts
```
Expected: "Seeded 19 new course(s); 0 already present." Re-run → "Seeded 0 new course(s); 19 already present." (idempotent).

- [ ] **Step 5: Commit**
```bash
git add apps/api/scripts/seed-seattle-humane.ts apps/api/scripts/seed-seattle-humane.test.ts
git -c commit.gpgsign=false commit -m "feat(api): idempotent Seattle Humane course seed (19 courses)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T11: PROJECT-LOG + finish as PR

**Files:** Modify `docs/PROJECT-LOG.md`.

- [ ] **Step 1: Full-repo gate**
```bash
set -a && . ./.env && set +a
pnpm -r exec tsc --noEmit          # 0
pnpm -r test                       # all green (if api hits a Better Auth sign-up rate-limit, wait 90s + re-run)
pnpm -r build                      # all succeed
pnpm lint                          # 0
git status --porcelain             # clean except untracked .env
```

- [ ] **Step 2: Append `docs/PROJECT-LOG.md`** (bottom; today 2026-05-24):

```markdown
## 2026-05-24 — Courses section (curated directory) — SHIPPED
New first-class Courses section: a curated, filterable directory of training
classes, separate from Trainers. Each course is self-contained (inline
provider fields — organizationName/city/state — no FK to trainers, no org
table) with a small overview and a single deep link to the provider's
canonical course page; nothing dynamic (schedule/instructor/price/spots) is
replicated. New `courses` table + migration; public `GET /api/courses`
(filters: ageGroup/format/state/online) + `/:id`; admin CRUD at
`/api/admin/courses`. Web: `/my/courses` browse (compact table, row → detail),
`/my/courses/:id` detail (overview + skills + "View full details & register
↗"), `/admin/courses` CRUD, new Courses nav item. ~26 i18n keys en/es.
Idempotent seed script loads Seattle Humane's 19-course catalog
(`scripts/seed-seattle-humane.ts`). No journal/plan adoption (deferred
Level-2). `brief.tsx`/`trainer-detail.tsx` untouched. Gates green: tsc 0,
lint 0, web + api + shared tests pass, build OK.
- Spec/plan: `specs/2026-05-24-courses-section-design.md`,
  `plans/2026-05-24-courses-section.md`
- Commits: this branch. Shipped as a PR from worktree-courses-section.
```

- [ ] **Step 3: Commit**
```bash
git add docs/PROJECT-LOG.md
git -c commit.gpgsign=false commit -m "docs: PROJECT-LOG entry for courses section" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: superpowers:finishing-a-development-branch → push + open PR (DRAFT).** Do NOT merge locally.

---

## Self-Review

**Spec coverage:** shared schema → T1; table+migration → T2; public route+filters → T3; admin CRUD → T4; i18n → T5; hooks → T6; browse table+nav → T7; detail+link-only action → T8; admin UI → T9; seed (19 courses) → T10; PROJECT-LOG+PR → T11. Out-of-scope items (org table, trainer link, schedule/instructor/price, contact action, journal adoption) — not implemented by any task. No gap.

**Placeholder scan:** no TBD/TODO. The `<n>` in the migration filename is drizzle's autonumber (real). T9 references "mirror admin/trainers.tsx" — the implementer reads that file; the field list + hooks are fully enumerated, so it's bounded, not a placeholder.

**Type/consistency:** `courseInputSchema` fields (T1) == `courses` columns (T2) == `Course` type (T6) == seed data keys (T10). Enum values `courseFormats`/`courseAgeGroups` (T1) match the `<select>` options (T7/T9) and the label maps (T7/T8). RPC paths `api.api.courses.$get` / `api.api.admin.courses[...]` (T6) match the mounts `/api/courses` + `/api/admin/courses` (T3/T4). i18n keys in T5 cover every `t("courses.*")` used in T7/T8. `coursePageUrl` consistent across schema/detail/seed.
