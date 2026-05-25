# TuringCare — Courses section (browsable training-course directory)

**Date:** 2026-05-24
**Status:** Approved (user: build now; courses as a separate explore/navigate
section; NO journal/plan adoption in-platform for MVP; no price stored; no
schedules; logged-in only; course inquiry = mailto with course name in subject).
Ready for plan.
**Scope:** A new first-class **Courses** section: each course belongs to one
trainer, is admin-managed, and is browsable/filterable by logged-in users. Pure
discovery — no coupling to the dog journal, Brief, or training-progress plan.
Mirrors the existing Trainers directory patterns (public read route +
admin CRUD route + shared zod schema + admin UI + browse/detail UI).

## Goal

Owners can discover concrete training classes ("a 6-week reactive-dog program in
Bellevue") rather than only trainer profiles. A course is a Goal-with-Skills
package authored by a trainer — but for MVP it is **display-only discovery**.
Adopting a course into a dog's training plan (materializing its skills into the
Goal→Skill→Session model) is explicitly OUT of scope; it's the eventual Level-2
wedge, gated on real tester signal. The data model here leaves room for it
(`skillsTaught[]` will seed the future materializer) without building it now.

The single action on a course is "Email about this course" — a `mailto:` to the
trainer with the course name pre-filled in the subject. No Brief involved (a
course inquiry is not a behavior Brief; the Brief-send button lives on the
trainer profile, PR #30).

## Data model

One new table. Strictly additive.

```ts
// apps/api/src/db/schema.ts — after the trainers table
export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  trainerId: uuid("trainer_id")
    .notNull()
    .references(() => trainers.id, { onDelete: "cascade" }),
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

export const coursesRelations = relations(courses, ({ one }) => ({
  trainer: one(trainers, { fields: [courses.trainerId], references: [trainers.id] }),
}));
```

No `price` column (per locked decision — link out to the trainer's registration
page where the real, current price lives). No schedule columns.

Migration: `pnpm --filter @turingcare/api db:generate` produces the next
sequential migration; spot-check it creates `courses` with the FK cascade.

## Shared validation (`packages/shared/src/course.ts`, NEW)

```ts
import { z } from "zod";

export const courseFormats = ["group", "workshop", "seminar", "private", "drop_in"] as const;
export const courseAgeGroups = ["puppy", "adolescent", "adult", "any"] as const;

export const courseInputSchema = z.object({
  trainerId: z.string().uuid(),
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

Export from `packages/shared/src/index.ts`. Co-located test file
(`course.test.ts`) covering: valid course, missing trainerId, bad format enum,
bad ageGroup enum, negative durationWeeks, skillsTaught default.

## API

### Public read route (`apps/api/src/routes/courses.ts`, NEW)

Mirrors `trainers.ts`: `requireUser`, a projected `COURSE_COLS`, list + detail.
The list/detail JOIN `trainers` so each course carries a trainer summary (so the
UI shows "Offered by X — City, ST" without N+1 and so detail has the email for
the inquiry mailto).

```ts
export const coursesApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    // filters: ageGroup, format, state (on joined trainer), online ("true")
    // JOIN trainers; SELECT course cols + { trainer: {id,name,city,state} }
    // return { courses: [...] }
  })
  .get("/:id", async (c) => {
    // JOIN trainers; SELECT course cols + { trainer: {id,name,city,state,email,website} }
    // 404 if not found; return { course }
  });
```

Filter semantics:
- `ageGroup` → `eq(courses.ageGroup, q)`
- `format` → `eq(courses.format, q)`
- `state` → `eq(trainers.state, q)` (via join)
- `online` === "true" → `eq(courses.isOnline, true)`

Detail response includes `trainer.email` + `trainer.website` (needed for the
inquiry mailto + a "view trainer" link); the list response omits email (not
needed for cards, keeps payload lean).

### Admin CRUD route (`apps/api/src/routes/admin-courses.ts`, NEW)

Mirrors `admin-trainers.ts` exactly: `requireAdmin`, `zValidator("json", courseInputSchema)`.

```ts
export const adminCoursesApp = new Hono<{ Variables: AdminVars }>()
  .use("*", requireAdmin)
  .post("/", zValidator("json", courseInputSchema), async (c) => {
    const [course] = await db.insert(courses).values(c.req.valid("json")).returning();
    return c.json({ course }, 201);
  })
  .put("/:id", zValidator("json", courseInputSchema), async (c) => {
    const [course] = await db.update(courses)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(eq(courses.id, c.req.param("id"))).returning();
    if (!course) return c.json({ error: "not_found" } as const, 404);
    return c.json({ course });
  })
  .delete("/:id", async (c) => {
    const [deleted] = await db.delete(courses)
      .where(eq(courses.id, c.req.param("id"))).returning({ id: courses.id });
    if (!deleted) return c.json({ error: "not_found" } as const, 404);
    return c.json({ ok: true } as const);
  });
```

### Mounting (`apps/api/src/app.ts`)

Add to the chained `.route(...)` calls (preserving `AppType` inference for the
hono client):
```ts
.route("/api/courses", coursesApp)
.route("/api/admin/courses", adminCoursesApp)
```

### Tests (`apps/api/src/routes/courses.test.ts` + `admin-courses.test.ts`, NEW)

Public (`courses.test.ts`):
- GET / requires auth (401 anon)
- GET / lists courses with the trainer summary attached
- filter by ageGroup / format / state / online each narrow correctly
- GET /:id returns the course + trainer summary incl. email
- GET /:id → 404 unknown id

Admin (`admin-courses.test.ts`):
- 401 anon / 403 non-admin on POST
- 201 create → appears in public GET /
- 200 update / 404 unknown id
- 200 delete + removal from public list / 404 unknown id
- 400 invalid body (bad format enum, missing trainerId)
- cascade: deleting the parent trainer removes its courses (verify via public GET)

Use the existing `createTestUser` + an admin test user pattern from
`admin-trainers.test.ts`. Create a trainer first (admin), then courses under it.

## Web

### Hooks (`apps/web/src/lib/courses.ts`, NEW)

```ts
useCourses(filters)            // GET /api/courses?... → Course[] (with trainer summary)
useCourse(id)                  // GET /api/courses/:id → Course (with trainer + email)
useCoursesByTrainer(trainerId) // GET /api/courses?trainerId=... → for trainer-detail section
```

(Add `trainerId` as a supported filter on the public GET / for the
trainer-detail cross-section — `eq(courses.trainerId, q)`.)

Admin hooks (`apps/web/src/routes/admin/use-courses.ts`, NEW): `useAdminCreateCourse`,
`useAdminUpdateCourse`, `useAdminDeleteCourse` — mirror `use-trainers.ts`.

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
  | Puppy Manners 1 | Puppy | Group | Seattle Humane · Bellevue, WA |

  - **Course** cell contains a real `<Link to="/my/courses/:id">{name}</Link>` —
    this is the keyboard-accessible / screen-reader affordance.
  - The whole `<tr>` is also clickable (cursor-pointer + hover) navigating to the
    same detail route, as a convenience for mouse/touch. Implement the row-click
    without tripping biome's a11y rules (the Link in the Course cell satisfies
    keyboard access; if a clickable `<tr>` fights biome, fall back to making only
    the Course-cell Link navigable — full-row click is a nice-to-have, not a
    requirement).
  - **Age** = the `ageGroup` label (Puppy / Adolescent / Adult / Any).
  - **Format** = the `format` label (Group / Workshop / Seminar / Private / Drop-in).
  - **Offered by** = `{trainer.name} · {city}, {state}`.
  - Keep it minimal — no description, skills, duration, or price in the table;
    those live on the detail page. On narrow screens the table should remain
    readable (the mobile-QA pass will tune this; for now, a horizontally-scrollable
    or stacked-on-mobile table is acceptable).

### Detail page (`apps/web/src/routes/course-detail.tsx`, NEW) at `/my/courses/:id`

```
← Back to courses

Puppy Manners 1
Group class · 6 weeks · 1 hr/session · Online? no
Ages: 15–20 weeks
Prerequisites: Dog Training Basics Seminar

[description paragraph]

Skills you'll learn:
  • polite greetings
  • basic skills
  • socialization

Offered by  Seattle Humane Dog Training Center · Bellevue, WA
            [View trainer →]   (Link to /my/trainers/:trainerId)
            [Email about this course]   (mailto, only if trainer.email present)
            [Register ↗]   (registrationUrl, only if present, target=_blank rel=noopener)
```

The inquiry mailto:
```ts
`mailto:${trainer.email}?subject=${encodeURIComponent(`Interested in ${course.name}`)}`
```
Hidden when `trainer.email` is null. The Register button is hidden when
`registrationUrl` is null.

### Trainer-detail cross-section (`apps/web/src/routes/trainer-detail.tsx`, MODIFY)

Add a "Courses offered" section listing this trainer's courses (via
`useCoursesByTrainer(trainer.id)`), each a Link to `/my/courses/:id`. Hidden if
the trainer has zero courses. This is the only change to an existing route.

### Admin page (`apps/web/src/routes/admin/courses.tsx`, NEW) at `/admin/courses`

Mirror `admin/trainers.tsx`: list + add + edit + delete. Fields: a **trainer
`<select>`** (populated from `useTrainers()` so the admin picks the parent),
name, description, format `<select>`, ageGroup `<select>`, ageRange, durationWeeks
(number), sessionMinutes (number), prerequisites, skillsTaught (comma-separated
input → array), isOnline (checkbox), registrationUrl. Behind `RequireAdmin`.
Linked from the admin dashboard (`admin/index.tsx`) next to the Trainers link.

### Routing + nav

- `apps/web/src/main.tsx`: mount `/my/courses`, `/my/courses/:id`, `/admin/courses`
  (admin one behind the existing admin guard wrapper).
- `apps/web/src/components/app-shell/nav-items.ts`: add
  `{ to: "/my/courses", labelKey: "shell.courses", icon: GraduationCap }`
  between Trainers and Profile. (`GraduationCap` from lucide-react.)

## i18n (en + es, parity enforced by `es satisfies Messages`)

New `shell.courses` nav label. New `courses:` section (~30 keys): title, subtitle,
empty, emptyFiltered, loadError, filterAgeGroup, filterFormat, filterState,
filterOnline, clear, the 4 ageGroup labels, the 5 format labels, weeks,
sessionMinutes, online, prerequisites, skillsTaught, offeredBy, viewTrainer,
emailAboutCourse, registerExternally, back. New `coursesAdmin:` section for the
admin page labels (or reuse `courses.*` where sensible). Full en + es.

## Tests (web)

- `courses.test.tsx` (browse): renders a table row per course from stubbed
  fetch (assert course name + trainer name appear in a row); filters render;
  empty + filtered-empty states; the Course cell links to `/my/courses/:id`.
- `course-detail.test.tsx`: renders course + skills; "Email about this course"
  present when trainer.email exists, hidden when null; Register button gated on
  registrationUrl; View-trainer link points to `/my/trainers/:trainerId`.
- `admin/courses.test.tsx`: form renders incl. the trainer selector; create
  mutation fires (mock `@/lib/api`).
- `trainer-detail.test.tsx`: extend — "Courses offered" section shows when the
  trainer has courses, hidden when none.

## Seed data (`apps/api/scripts/seed-seattle-humane.ts`, NEW)

A committed, **idempotent** seed script that loads the one real-world source we
have today: Seattle Humane + its 19-course catalog. This is the only sane way to
load 19 courses (hand-entry through `/admin/courses` is 19 forms) and it makes
`/my/courses` feel real the moment a tester opens it.

Behavior:
- **Idempotent.** Upsert the trainer by a stable key (e.g. match on
  `name = "Seattle Humane Dog Training Center"`; if it exists, reuse its id,
  else insert). Then for each of the 19 courses, skip if a course with that
  `(trainerId, name)` already exists, else insert. Safe to run repeatedly and on
  a fresh DB.
- **Run:** `set -a && . ./.env && set +a && pnpm --filter @turingcare/api exec tsx scripts/seed-seattle-humane.ts`.
- **Source of truth for the data:** the 19-course mapping (name, format,
  ageGroup, ageRange, durationWeeks, sessionMinutes, prerequisites,
  skillsTaught[], isOnline, registrationUrl) — encoded as a typed array in the
  script. All `registrationUrl`s point to the respective SuperSaaS / Seattle
  Humane course page. `isOnline: true` only for Dog Training Basics (has a
  virtual option); the rest false.
- **Clearly marked as demo/seed data** in a file header comment, with the source
  URL and the date sourced (2026-05-24). Public info; fine to commit. Delete-able
  later once a real trainer-onboarding flow exists.
- Uses the same `db` client + `trainers`/`courses` tables as the app (not raw
  SQL). Validate each course row against `courseInputSchema` before insert so the
  seed can't drift from the schema.
- A tiny test (`apps/api/scripts/seed-seattle-humane.test.ts` or a unit on an
  extracted `seattleHumaneCourses` constant) asserting all 19 rows pass
  `courseInputSchema.safeParse`. (Don't hit the DB in the test — just validate
  the data array.)

## Out of scope (deliberate)

- **Adopt course into the dog's journal / training plan** — the Level-2 wedge.
  Not built. `skillsTaught[]` is the future seed; nothing consumes it yet.
- **Price** — not stored; link out to registration.
- **Schedules / class calendars** — link out to the trainer's external booking.
- **Enrollment / payment** — none. We are a directory, not a booking system.
- **Public (anonymous) browse** — `/my/courses` is auth-gated like Trainers.
  Public/SEO version deferred.
- **Trainer self-service** — admins manage courses; no trainer-side portal.
- **Course reviews / ratings.**
- **Brief-send from a course** — course inquiry is a plain mailto; the
  Brief-send deep-link stays on the trainer profile (PR #30). `brief.tsx`
  untouched.

## Flagged decisions (reasonable; reviewable)

- **Course inquiry = `mailto:` with subject, not a Brief send.** A course
  question ("is there a spot?") isn't a behavior Brief. Keeps `brief.tsx`
  untouched and the semantics honest.
- **`ageGroup` (canonical enum) + `ageRange` (free-text display)** are separate:
  the enum drives the filter, the string shows the precise range ("8-14 weeks").
  Avoids trying to parse free-text ranges into filter buckets.
- **`format` + `ageGroup` are stored as plain text validated by zod enums**, not
  Postgres enums — matches how `briefStatus` is the only pg enum and the rest of
  the codebase validates at the zod layer. Cheaper to evolve.
- **List omits `trainer.email`, detail includes it** — least-privilege payload;
  the inquiry action only exists on detail.
- **1:N trainer→courses, cascade on trainer delete** — orphan courses are
  meaningless. No co-taught (M:N) modeling; premature.
- **No price** — directory pricing goes stale fast and the real price lives at
  the registration link. Revisit only if testers ask to filter by price.
- **Admin-only management** — consistent with trainers (PR #15). Trainer
  self-service waits for the trainer portal.
