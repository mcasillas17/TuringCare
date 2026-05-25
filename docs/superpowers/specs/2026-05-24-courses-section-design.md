# TuringCare — Courses section (browsable training-course directory)

**Date:** 2026-05-24
**Status:** Approved. Build now. Courses are a separate explore/navigate section.
NO journal/plan adoption in-platform for MVP. No price stored, no schedules,
logged-in only. A course is **offered by an organization / training center**
(provider) described by **inline fields on the course itself** — NOT a row in
the `trainers` table and NOT FK-linked to trainers (Option 1: self-contained
courses). The Trainers section (individual people) stays fully independent; there
is no cross-link between the two for MVP. Course inquiry = `mailto:` to the
course's contact email with the course name in the subject. Ready for plan.

## Goal

Owners can discover concrete training classes ("a 6-week reactive-dog program in
Bellevue") offered by training centers. A course is a Goal-with-Skills package
authored by an organization — but for MVP it is **display-only discovery**.
Adopting a course into a dog's training plan (materializing its skills into the
Goal→Skill→Session model) is explicitly OUT of scope; it's the eventual Level-2
wedge, gated on real tester signal. `skillsTaught[]` will seed that future
materializer without building it now.

**Model correction (important):** an organization like *Seattle Humane Dog
Training Center* is the **provider** of courses — not a "trainer." Courses do
NOT reference the `trainers` table. Each course carries its provider info inline
(`organizationName`, `city`, `state`, `website`, `contactEmail`). Individual
trainers (people) remain a separate, independent directory.

## Data model

One new table, **self-contained** (no FK to trainers). Strictly additive.

```ts
// apps/api/src/db/schema.ts
export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  // provider (the organization offering the course) — inline, no FK
  organizationName: text("organization_name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  website: text("website"),
  contactEmail: text("contact_email"),
  // course details
  name: text("name").notNull(),
  description: text("description"),
  format: text("format").notNull(),          // group|workshop|seminar|private|drop_in
  ageGroup: text("age_group").notNull(),      // puppy|adolescent|adult|any (canonical, filterable)
  ageRange: text("age_range"),                // display string, e.g. "8-14 weeks"
  durationWeeks: integer("duration_weeks"),
  sessionMinutes: integer("session_minutes"),
  prerequisites: text("prerequisites"),
  skillsTaught: text("skills_taught").array().notNull().default(sql`'{}'`),
  isOnline: boolean("is_online").notNull().default(false),
  registrationUrl: text("registration_url"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

No `coursesRelations` (no FK). No `price` column (link out to registration). No
schedule columns.

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
  website: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
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
  registrationUrl: z.string().nullable().optional(),
});
export type CourseInput = z.infer<typeof courseInputSchema>;
```

Export from `packages/shared/src/index.ts`. Co-located `course.test.ts`: valid
course, missing organizationName, missing name, bad format enum, bad ageGroup
enum, negative durationWeeks rejected, skillsTaught defaults to `[]`, invalid
contactEmail rejected.

## API

### Public read route (`apps/api/src/routes/courses.ts`, NEW)

Mirrors `trainers.ts` (auth-gated via `requireUser`), but simpler — no join, and
every course column is public (there's no internal-notes equivalent), so no
projection const is needed.

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

Filters: `ageGroup`, `format`, `state` (direct on `courses.state`), `online`.
No trainer join, no `trainerId` filter.

### Admin CRUD route (`apps/api/src/routes/admin-courses.ts`, NEW)

Mirrors `admin-trainers.ts` exactly — `requireAdmin`, `zValidator("json", courseInputSchema)`,
POST (201) / PUT (200 / 404) / DELETE (200 / 404). No trainer relationship.

### Mounting (`apps/api/src/app.ts`)

Add to the chained `.route(...)` calls (preserves `AppType` inference):
```ts
.route("/api/courses", coursesApp)
.route("/api/admin/courses", adminCoursesApp)
```

### Tests (`courses.test.ts` + `admin-courses.test.ts`, NEW)

Public:
- GET / requires auth (401 anon)
- GET / lists courses
- filter by ageGroup / format / state / online each narrows correctly
- GET /:id returns the course
- GET /:id → 404 unknown id

Admin:
- 401 anon / 403 non-admin on POST
- 201 create → appears in public GET /
- 200 update / 404 unknown id
- 200 delete + removal from public list / 404 unknown id
- 400 invalid body (bad format enum, missing organizationName, bad email)

Use the existing `createTestUser` + admin-user pattern from `admin-trainers.test.ts`.
No trainer setup needed — courses stand alone.

## Web

### Hooks (`apps/web/src/lib/courses.ts`, NEW)

```ts
useCourses(filters)   // GET /api/courses?ageGroup=&format=&state=&online= → Course[]
useCourse(id)         // GET /api/courses/:id → Course
```

Admin hooks (`apps/web/src/routes/admin/use-courses.ts`, NEW):
`useAdminCreateCourse`, `useAdminUpdateCourse`, `useAdminDeleteCourse` — mirror
`use-trainers.ts`.

### Browse page (`apps/web/src/routes/courses.tsx`, NEW) at `/my/courses`

- Title + subtitle.
- Filter row: ageGroup `<select>` (puppy/adolescent/adult/any), format `<select>`,
  state `<input>`, online `<input type=checkbox>`, Clear button.
- `isError` → load error. Empty (no filter) → `courses.empty`. Empty (filtered) →
  `courses.emptyFiltered`.
- **A compact table** (not cards) — minimal columns, one row per course, the row
  navigates to `/my/courses/:id` on click. Columns:

  | Course | Age | Format | Offered by |
  |---|---|---|---|
  | Puppy Manners 1 | Puppy | Group | Seattle Humane Dog Training Center · Bellevue, WA |

  - **Course** cell contains a real `<Link to="/my/courses/:id">{name}</Link>` —
    the keyboard-accessible / screen-reader affordance.
  - The whole `<tr>` is also clickable (cursor-pointer + hover) navigating to the
    same detail route, as a mouse/touch convenience. Implement without tripping
    biome's a11y rules (the Course-cell Link covers keyboard access; if a
    clickable `<tr>` fights biome, fall back to the Link-only affordance —
    full-row click is nice-to-have, not required).
  - **Age** = `ageGroup` label. **Format** = `format` label.
  - **Offered by** = `{organizationName} · {city}, {state}`.
  - Minimal — no description/skills/duration/price in the table; those live on
    detail. Table stays readable on narrow screens (mobile-QA pass will tune;
    horizontally-scrollable or stacked is acceptable for now).

### Detail page (`apps/web/src/routes/course-detail.tsx`, NEW) at `/my/courses/:id`

```
← Back to courses

Puppy Manners 1
Group class · 6 weeks · 1 hr/session
Ages: 15–20 weeks
Prerequisites: Dog Training Basics Seminar

[description paragraph]

Skills you'll learn:
  • polite greetings
  • basic skills
  • socialization

Offered by  Seattle Humane Dog Training Center · Bellevue, WA
            [Email about this course]   (mailto, only if contactEmail present)
            [Register ↗]                (registrationUrl, only if present, _blank rel=noopener)
            [Visit website ↗]           (website, only if present)
```

Inquiry mailto:
```ts
`mailto:${course.contactEmail}?subject=${encodeURIComponent(`Interested in ${course.name}`)}`
```
Hidden when `contactEmail` is null. Register / website buttons hidden when their
URLs are null. **No "View trainer" link** — courses are not linked to trainers.

### Admin page (`apps/web/src/routes/admin/courses.tsx`, NEW) at `/admin/courses`

Mirror `admin/trainers.tsx`: list + add + edit + delete. Fields (all inline — no
trainer selector): organizationName, city, state, website, contactEmail, name,
description, format `<select>`, ageGroup `<select>`, ageRange, durationWeeks
(number), sessionMinutes (number), prerequisites, skillsTaught (comma-separated
→ array), isOnline (checkbox), registrationUrl. Behind `RequireAdmin`. Linked
from the admin dashboard (`admin/index.tsx`) next to the Trainers link.

### Routing + nav

- `apps/web/src/main.tsx`: mount `/my/courses`, `/my/courses/:id`,
  `/admin/courses` (admin behind the existing admin guard).
- `apps/web/src/components/app-shell/nav-items.ts`: add
  `{ to: "/my/courses", labelKey: "shell.courses", icon: GraduationCap }`
  between Trainers and Profile (`GraduationCap` from lucide-react).

**No change to `trainer-detail.tsx`** — courses and trainers are independent.
`brief.tsx` also untouched.

## i18n (en + es, parity enforced by `es satisfies Messages`)

New `shell.courses` nav label. New `courses:` section (~28 keys): title, subtitle,
empty, emptyFiltered, loadError, filterAgeGroup, filterFormat, filterState,
filterOnline, clear, 4 ageGroup labels, 5 format labels, weeks, sessionMinutes,
online, prerequisites, skillsTaught, offeredBy, emailAboutCourse,
registerExternally, visitWebsite, back, colCourse, colAge, colFormat, colOfferedBy.
New `coursesAdmin:` section for the admin page labels (or reuse `courses.*`).
Full en + es.

## Seed data (`apps/api/scripts/seed-seattle-humane.ts`, NEW)

A committed, **idempotent** seed script loading the one real-world source we have:
the Seattle Humane Dog Training Center catalog as **19 self-contained course
rows** (each carrying `organizationName: "Seattle Humane Dog Training Center"`,
`city: "Bellevue"`, `state: "WA"`, `contactEmail: "dogtraining@seattlehumane.org"`,
`website: "https://www.seattlehumane.org/services/dog-training-center/"`, plus the
per-course fields). **No trainer record is created** — Seattle Humane is the
inline provider on each course, not a trainer.

Behavior:
- **Idempotent.** For each course, skip if a row with the same
  `(organizationName, name)` already exists; else insert. Safe to re-run and on a
  fresh DB.
- **Run:** `set -a && . ./.env && set +a && pnpm --filter @turingcare/api exec tsx scripts/seed-seattle-humane.ts`.
- The 19-course data is a typed array in the script; `isOnline: true` only for
  Dog Training Basics (virtual option), rest false; each `registrationUrl` points
  to the course's SuperSaaS / Seattle Humane page.
- File header comment marks it demo/seed data with source URL + date (2026-05-24).
  Public info; fine to commit; delete-able once a real provider-onboarding flow
  exists.
- Uses the app `db` client + `courses` table (not raw SQL). Validate each row
  against `courseInputSchema` before insert so the seed can't drift from schema.
- Test: `seed-seattle-humane.test.ts` asserts all 19 rows in the exported
  `seattleHumaneCourses` constant pass `courseInputSchema.safeParse` (no DB hit).

## Tests (web)

- `courses.test.tsx` (browse): renders a table row per course from stubbed fetch
  (assert course name + organizationName appear in a row); filters render; empty
  + filtered-empty states; the Course cell links to `/my/courses/:id`.
- `course-detail.test.tsx`: renders course + skills; "Email about this course"
  present when contactEmail exists, hidden when null; Register button gated on
  registrationUrl; no trainer link present.
- `admin/courses.test.tsx`: form renders all inline fields (incl. organizationName,
  format/ageGroup selects); create mutation fires (mock `@/lib/api`).

## Out of scope (deliberate)

- **Adopt course into the dog's journal / training plan** — the Level-2 wedge.
  Not built. `skillsTaught[]` is the future seed; nothing consumes it yet.
- **`organizations` table / org profile pages** — Option 2, deferred. Provider
  info is inline on each course for MVP. Normalize later if multiple providers +
  org pages are wanted.
- **Linking courses to trainers** — the two sections are independent for MVP.
- **Price, schedules, enrollment, payment** — directory only; link out to
  registration.
- **Public (anonymous) browse** — `/my/courses` is auth-gated like Trainers.
- **Trainer/provider self-service** — admin-managed; no provider portal.
- **Course reviews / ratings.**
- **Brief-send from a course** — inquiry is a plain mailto; Brief-send stays on
  trainer profiles (PR #30). `brief.tsx` untouched.

## Flagged decisions (reasonable; reviewable)

- **Self-contained courses, provider info inline (Option 1).** No FK to trainers,
  no `organizations` table. Simplest correct model for one provider. Slight
  denormalization (19 rows repeat the provider fields) is invisible — the seed
  writes it programmatically. Normalize to an `organizations` table later if we
  onboard multiple providers and want org profile pages.
- **Seattle Humane is the course provider, never a trainer row.** Corrects the
  earlier conflation. The Trainers directory holds individual people only.
- **Course inquiry = `mailto:` with the course name in the subject**, using the
  course's `contactEmail`. Not a Brief send (a course question isn't a behavior
  Brief). Keeps `brief.tsx` untouched.
- **`ageGroup` (filterable enum) + `ageRange` (free-text display)** are separate —
  enum drives the filter, the string shows the precise range.
- **`format`/`ageGroup` validated by zod enums, stored as plain text** (not pg
  enums) — matches the codebase (only `briefStatus` is a pg enum).
- **No projection const** on the public route — every course column is public
  (no internal-notes field), unlike trainers.
- **No price** — directory pricing goes stale; real price lives at registration.
- **Admin-only management** — consistent with trainers (PR #15).
