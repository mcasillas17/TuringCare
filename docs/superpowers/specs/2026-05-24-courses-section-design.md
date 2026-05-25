# TuringCare — Courses section (curated training-course directory)

**Date:** 2026-05-24
**Status:** Approved. Build now. Courses are a separate explore/navigate section.
**Lean model (locked):** TuringCare's course entry is a **curated overview + a
single deep link to the canonical course page** on the provider's site. We do
NOT replicate anything dynamic — schedule, instructor, price, spots all live,
always-current, behind that link. Courses are **self-contained** (inline
provider fields, no FK to `trainers`, no `organizations` table). NO
journal/plan adoption. NO contact/email action — the one action is "View full
details & register ↗". Logged-in only. Ready for plan.

## Goal

Owners discover concrete training classes ("a 6-week reactive-dog program in
Bellevue"), see a small overview of what each is about, and click through to the
provider's page to see live dates, who's teaching, price, and to register.
TuringCare is a **curated, filterable index that teases and points** — it owns
static catalog data only; the provider's page owns everything dynamic. Nothing
to keep in sync.

Out of scope by design: adopting a course into a dog's training plan (the
Level-2 wedge, gated on tester signal — `skillsTaught[]` is its future seed);
schedules; instructors; price; an `organizations` table; any contact action
beyond the link.

## Data model

One new table, **self-contained** (no FK). Strictly additive.

```ts
// apps/api/src/db/schema.ts
export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  // provider (inline — the org offering the course; not a trainer, no FK)
  organizationName: text("organization_name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  // course overview
  name: text("name").notNull(),
  description: text("description"),
  format: text("format").notNull(),          // group|workshop|seminar|private|drop_in
  ageGroup: text("age_group").notNull(),      // puppy|adolescent|adult|any (filterable)
  ageRange: text("age_range"),                // display string, e.g. "8-14 weeks"
  durationWeeks: integer("duration_weeks"),
  sessionMinutes: integer("session_minutes"),
  prerequisites: text("prerequisites"),
  skillsTaught: text("skills_taught").array().notNull().default(sql`'{}'`),
  isOnline: boolean("is_online").notNull().default(false),
  coursePageUrl: text("course_page_url"),     // the single deep link to the provider's course page
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

No FK, no relations, no price, no schedule, no contact email, no separate
website field (the `coursePageUrl` is the link).

Migration: `pnpm --filter @turingcare/api db:generate` → spot-check it creates
`courses` with no foreign keys.

## Shared validation (`packages/shared/src/course.ts`, NEW)

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

Export from `packages/shared/src/index.ts`. Co-located `course.test.ts`: valid
course, missing organizationName, missing name, bad format enum, bad ageGroup
enum, negative durationWeeks rejected, skillsTaught defaults to `[]`.

## API

### Public read route (`apps/api/src/routes/courses.ts`, NEW)

Auth-gated via `requireUser`. No join, every column public, so no projection const.

```ts
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
    const rows = await db.select().from(courses)
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

Filters: `ageGroup`, `format`, `state` (direct), `online`.

### Admin CRUD route (`apps/api/src/routes/admin-courses.ts`, NEW)

Mirrors `admin-trainers.ts` exactly — `requireAdmin`, `zValidator("json", courseInputSchema)`,
POST (201) / PUT (200 / 404) / DELETE (200 / 404).

### Mounting (`apps/api/src/app.ts`)

```ts
.route("/api/courses", coursesApp)
.route("/api/admin/courses", adminCoursesApp)
```

### Tests (`courses.test.ts` + `admin-courses.test.ts`, NEW)

Public: 401 anon; GET / lists; each filter (ageGroup/format/state/online) narrows;
GET /:id returns; GET /:id 404. Admin: 401 anon / 403 non-admin; 201 create →
appears in public list; 200 update / 404 unknown; 200 delete + removal / 404
unknown; 400 invalid body (bad format enum, missing organizationName). No trainer
setup — courses stand alone.

## Web

### Hooks (`apps/web/src/lib/courses.ts`, NEW)

```ts
useCourses(filters)   // GET /api/courses?ageGroup=&format=&state=&online= → Course[]
useCourse(id)         // GET /api/courses/:id → Course
```

Admin hooks (`apps/web/src/routes/admin/use-courses.ts`, NEW): create/update/delete,
mirror `use-trainers.ts`.

### Browse page (`apps/web/src/routes/courses.tsx`, NEW) at `/my/courses`

- Title + subtitle.
- Filter row: ageGroup `<select>`, format `<select>`, state `<input>`, online
  `<input type=checkbox>`, Clear.
- `isError` → load error. Empty → `courses.empty`. Filtered-empty →
  `courses.emptyFiltered`.
- **A compact table** (not cards), one row per course, row navigates to
  `/my/courses/:id`:

  | Course | Age | Format | Offered by |
  |---|---|---|---|
  | Puppy Manners 1 | Puppy | Group | Seattle Humane Dog Training Center · Bellevue, WA |

  - **Course** cell = real `<Link to="/my/courses/:id">{name}</Link>` (keyboard /
    screen-reader affordance). Whole `<tr>` also clickable for mouse/touch; if a
    clickable `<tr>` fights biome a11y rules, fall back to the Link-only
    affordance (full-row click is nice-to-have).
  - **Age** = `ageGroup` label. **Format** = `format` label.
  - **Offered by** = `{organizationName} · {city}, {state}`.
  - Minimal — no description/skills/duration in the table; those are on detail.
  - Stays readable on narrow screens (mobile-QA pass tunes; scrollable/stacked OK).

### Detail page (`apps/web/src/routes/course-detail.tsx`, NEW) at `/my/courses/:id`

```
← Back to courses

Puppy Manners 1
Group · 6 weeks · 1 hr/session · Ages 15–20 weeks
Offered by Seattle Humane Dog Training Center · Bellevue, WA

[description — the small overview]

Skills you'll learn:
  • polite greetings
  • basic skills
  • socialization

Prerequisites: Dog Training Basics Seminar

[ View full details & register on Seattle Humane ↗ ]   ← coursePageUrl, the ONE action
```

- The single action is `<a href={coursePageUrl} target="_blank" rel="noopener noreferrer">{t("courses.viewCoursePage")} ↗</a>`,
  rendered only when `coursePageUrl` is present. **No email/contact action, no
  "view trainer" link.**
- Render `description`, `skillsTaught` (bulleted), `prerequisites`, and the
  format/duration/age line. Omit blank optional fields cleanly.

### Admin page (`apps/web/src/routes/admin/courses.tsx`, NEW) at `/admin/courses`

Mirror `admin/trainers.tsx`: list + add + edit + delete. Fields (all inline):
organizationName, city, state, name, description, format `<select>`, ageGroup
`<select>`, ageRange, durationWeeks (number), sessionMinutes (number),
prerequisites, skillsTaught (comma-separated → array), isOnline (checkbox),
coursePageUrl. Behind `RequireAdmin`. Linked from the admin dashboard next to
Trainers.

### Routing + nav

- `apps/web/src/main.tsx`: mount `/my/courses`, `/my/courses/:id`, `/admin/courses`.
- `apps/web/src/components/app-shell/nav-items.ts`: add
  `{ to: "/my/courses", labelKey: "shell.courses", icon: GraduationCap }`
  between Trainers and Profile.

**No change to `trainer-detail.tsx` or `brief.tsx`** — courses are independent.

## i18n (en + es, parity)

New `shell.courses` nav label. New `courses:` section (~26 keys): title, subtitle,
empty, emptyFiltered, loadError, filterAgeGroup, filterFormat, filterState,
filterOnline, clear, 4 ageGroup labels, 5 format labels, weeks, sessionMinutes,
online, prerequisites, skillsTaught, offeredBy, viewCoursePage, back, colCourse,
colAge, colFormat, colOfferedBy. New `coursesAdmin:` section for admin labels (or
reuse `courses.*`). Full en + es.

## Seed data (`apps/api/scripts/seed-seattle-humane.ts`, NEW)

Committed, **idempotent** seed loading the one real source: the Seattle Humane Dog
Training Center catalog as **19 self-contained course rows**. Each row carries
`organizationName: "Seattle Humane Dog Training Center"`, `city: "Bellevue"`,
`state: "WA"`, a `coursePageUrl` to that course's page on
seattlehumane.org / SuperSaaS, plus the per-course overview fields. **No trainer
record, no contact email, no org table.**

- **Idempotent:** skip if a row with the same `(organizationName, name)` exists;
  else insert. Safe to re-run + on a fresh DB.
- **Run:** `set -a && . ./.env && set +a && pnpm --filter @turingcare/api exec tsx scripts/seed-seattle-humane.ts`.
- 19-course data is a typed `seattleHumaneCourses` array in the script;
  `isOnline: true` only for Dog Training Basics (virtual option), rest false.
- File header marks it demo/seed data with source URL + date (2026-05-24). Public
  info; fine to commit; delete-able once a real provider-onboarding flow exists.
- Uses the app `db` client + `courses` table (not raw SQL). Validate each row
  against `courseInputSchema` before insert.
- Test (`seed-seattle-humane.test.ts`): assert all 19 rows in `seattleHumaneCourses`
  pass `courseInputSchema.safeParse` (no DB hit).

## Tests (web)

- `courses.test.tsx` (browse): renders a table row per course (assert course name
  + organizationName in a row); filters render; empty + filtered-empty; Course
  cell links to `/my/courses/:id`.
- `course-detail.test.tsx`: renders overview + skills + prerequisites; the
  "View full details & register" link present with `coursePageUrl` and
  `target=_blank`, hidden when `coursePageUrl` is null; no email/contact action;
  no trainer link.
- `admin/courses.test.tsx`: form renders all inline fields (incl. organizationName
  + format/ageGroup selects); create mutation fires (mock `@/lib/api`).

## Out of scope (deliberate)

- **Adopt course into the dog's journal / training plan** — Level-2 wedge. Not
  built. `skillsTaught[]` is the future seed.
- **Schedule / instructor / price / spots** — all dynamic; live behind the
  `coursePageUrl`, never replicated or synced.
- **`organizations` table / org profile pages / methodology / trainer roster** —
  not modeled; the provider's own site has the "about us / our trainers" content.
- **Linking courses to trainers** — the two sections are independent.
- **Contact / email action** — the single action is the course-page link.
- **Public (anonymous) browse** — auth-gated like Trainers.
- **Provider self-service, reviews/ratings, enrollment/payment.**
- **`brief.tsx` / `trainer-detail.tsx` untouched.**

## Flagged decisions (reasonable; reviewable)

- **Curated overview + single deep link; nothing dynamic replicated.** The
  provider's course page is the source of truth for schedule/instructor/price/
  registration. We never sync it; we point to it (always fresh, zero maintenance).
- **Self-contained courses, inline provider, no org table (Option 1).** One
  provider today; `organizationName` is the natural backfill key if we ever
  normalize to an `organizations` table. No dangling `organizationId`.
- **Seattle Humane is the inline course provider, never a trainer row.** Trainers
  directory holds individual people only; the two sections don't cross-link.
- **Link-only action** (`coursePageUrl`) — no email/mailto. The provider page has
  its own contact/register options.
- **`ageGroup` (filterable enum) + `ageRange` (free-text display)** are separate.
- **`format`/`ageGroup` validated by zod enums, stored as plain text** (matches
  the codebase; only `briefStatus` is a pg enum).
- **No price** — stale fast; the real price lives at the course page.
- **Admin-only management** — consistent with trainers (PR #15).
