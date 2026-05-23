# TuringCare — Training Progress Tracking (goals → skills → sessions)

**Date:** 2026-05-22
**Status:** Approved (model: 3-level hierarchy goal→skills→sessions; confidence
5-level named; UI: dog-detail panel only; Brief: yes, training-progress section).
Ready for plan.
**Implementer:** Copilot CLI (handed off as a parallel PR from
`worktree-training-progress` off `origin/main`).
**Scope:** Add a "Training progress" subsystem to the dog-detail page. Goals
decompose into skills, each skill has a 1–5 confidence and a session log, the
Behavior Brief gains a per-goal/per-skill progress section. Strictly additive
— no existing functionality removed.

## Goal

Today, training goals are static text labels with no progress mechanism. An
owner can declare "Calm greetings" but has no way to track how they're working
on it. This PR makes goals actionable:

1. Each goal decomposes into one or more **skills**. New goals automatically
   get a default same-named skill so casual users see "Calm greetings —
   Sometimes (3/5) — 8 sessions" without ever thinking about decomposition.
2. Each skill has a 1–5 **confidence** (owner self-rated, named levels: 1 Not
   yet, 2 Learning, 3 Sometimes, 4 Usually, 5 Consistently). Owners adjust
   confidence over time.
3. Owners **log practice sessions** against a skill: date, optional duration in
   minutes, optional notes.
4. The dog-detail page gains a **Training progress** panel that summarizes
   goals, skills, confidence chips, session counts, and "log session"
   affordance.
5. The Behavior Brief composer extends to render a **Training progress**
   section — per goal, average confidence; per skill, confidence + session
   count + last session note. This is the biggest single jump in Brief value to
   date: trainers see what the owner has actually tried.

## Data model

```
dogs (existing)
  └── training_goals (existing) — owner-named, high-level
        └── training_skills (NEW) — name, confidence
              └── practice_sessions (NEW) — occurredAt, durationMinutes?, notes?
```

### New tables (`apps/api/src/db/schema.ts`)

```ts
export const trainingSkills = pgTable(
  "training_skills",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => trainingGoals.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    confidence: integer("confidence").notNull().default(1),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("confidence_range", sql`${t.confidence} BETWEEN 1 AND 5`)],
);

export const practiceSessions = pgTable("practice_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => trainingSkills.id, { onDelete: "cascade" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### Existing-data migration

The drizzle migration creates both tables AND backfills a default same-named
skill for every existing training_goals row:

```sql
INSERT INTO training_skills (goal_id, name, confidence, position)
SELECT id, goal, 1, 0 FROM training_goals
WHERE id NOT IN (SELECT DISTINCT goal_id FROM training_skills);
```

(Idempotent: skips goals that already have skills.)

### Auto-create default skill on goal creation

Extend the existing `POST /api/dogs/:id/goals` handler in
`apps/api/src/routes/dogs.ts` so that after inserting the goal it also inserts
one default skill: `{ goalId: goal.id, name: goal.goal, confidence: 1, position: 0 }`.
Return both `{ goal, skill }` from the endpoint. The existing
`dogs: concerns & goals > adds and removes a goal` test must be updated to
assert the response shape change.

## Shared validation (`packages/shared/src/progress.ts`)

```ts
import { z } from "zod";

export const CONFIDENCE_MIN = 1;
export const CONFIDENCE_MAX = 5;

export const trainingSkillSchema = z.object({
  name: z.string().trim().min(1, "Skill name is required").max(120),
  confidence: z.number().int().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX),
});
export type TrainingSkillInput = z.infer<typeof trainingSkillSchema>;

// Smaller payload for the most common edit (confidence chip click).
export const skillConfidenceSchema = z.object({
  confidence: z.number().int().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX),
});

export const practiceSessionSchema = z.object({
  occurredAt: z.string().min(1, "Date is required"),
  durationMinutes: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type PracticeSessionInput = z.infer<typeof practiceSessionSchema>;
```

Export from `packages/shared/src/index.ts`.

## API endpoints

All endpoints under `apps/api/src/routes/dogs.ts`, chained on the existing
`dogsApp`. All require auth + owner-scope via `findOwnedDog`.

### GET `/api/dogs/:id/progress`

Returns the full progress overview for a dog. Computed server-side; web layer
just renders.

```ts
{
  goals: Array<{
    id: string;
    goal: string;
    avgConfidence: number | null;   // null when goal has zero skills (edge case)
    skills: Array<{
      id: string;
      name: string;
      confidence: number;            // 1-5
      sessionCount: number;
      lastSessionAt: string | null;  // ISO
      lastNote: string | null;
    }>;
  }>;
}
```

Implementation: 3 drizzle queries (goals for dog, skills for those goals,
aggregate per-skill from practice_sessions: `COUNT(*)`, `MAX(occurred_at)`,
latest `notes` via subquery). Compose in JS rather than complex SQL.

### Skill endpoints (double-scoped — skill's goal must belong to the dog)

- **POST** `/api/dogs/:id/goals/:goalId/skills` — body `trainingSkillSchema`.
  Verify goal belongs to owned dog. Returns 201 `{ skill }`. `position`
  defaults to next free slot for that goal.
- **PUT** `/api/dogs/:id/skills/:skillId` — body `trainingSkillSchema`.
  Triple-scope: dog → goal → skill. Returns 200 `{ skill }`.
- **PATCH** `/api/dogs/:id/skills/:skillId/confidence` — body
  `skillConfidenceSchema`. Returns 200 `{ skill }`.
- **DELETE** `/api/dogs/:id/skills/:skillId` — cascade deletes sessions via
  `onDelete: "cascade"`. Returns 200 `{ ok: true }`.

### Session endpoints

- **POST** `/api/dogs/:id/skills/:skillId/sessions` — body
  `practiceSessionSchema`. Returns 201 `{ session }`.
- **DELETE** `/api/dogs/:id/skills/:skillId/sessions/:sessionId` — returns 200
  `{ ok: true }`.

(Edit a session — deferred. Delete-and-re-log instead.)

### Owner-scope helper (`apps/api/src/db/owned-skill.ts` — NEW)

```ts
// Returns the skill row only if:
//   1. it exists
//   2. its goal belongs to a dog owned by userId
//   3. dogId matches the path param
// Otherwise returns null → handler returns 404.
export async function findOwnedSkill(
  userId: string,
  dogId: string,
  skillId: string,
): Promise<{ id: string; goalId: string } | null>;
```

Implemented via drizzle inner join on skills + goals + dogs. All skill/session
endpoints use this; null → 404.

## UX — `<ProgressPanel dogId>` on dog-detail

New component at `apps/web/src/components/progress/progress-panel.tsx`.
Rendered below the existing Goals section on `/my/dogs/:id`.

```
Training progress
  Calm greetings — Sometimes (3.0/5)
    ▸ Door-knock threshold        [3/5]  8 sessions · 2d ago  [Log session]
    ▸ Greeting strangers          [2/5]  4 sessions · 5d ago  [Log session]
    ▸ Settling on mat             [4/5]  12 sessions · today  [Log session]
    [+ Add skill]
  Loose leash — Learning (2.0/5)
    ▸ Check-in cues               [2/5]  5 sessions · 3d ago  [Log session]
    [+ Add skill]
```

- **Confidence chip** `[3/5]` is a button. Click → small popover with 5
  labeled buttons (Not yet / Learning / Sometimes / Usually / Consistently) →
  selecting one calls PATCH `/confidence` → refetch.
- **Skill row** is expandable. Expanded shows the most recent ~5 sessions
  (date · duration · notes) with a per-row Remove button + a "Log session"
  form below.
- **Add skill** opens a small inline form: name input + confidence select
  (defaults to 1). Submit → POST.
- **Log session** form fields: occurredAt (`datetime-local`, defaults to now),
  durationMinutes (number input, optional), notes (textarea, optional). Save /
  Cancel.

Empty states:
- Dog with no goals → "No training goals yet — add one in the Goals section
  above." Anchor link to goals section.
- A goal with only the default skill → render the same shape; default skill
  carries the goal's name; "Add skill" affordance always visible.
- A skill with zero sessions → "No sessions yet — log your first one below."

### Files (NEW unless noted)

```
apps/web/src/components/progress/progress-panel.tsx
apps/web/src/components/progress/progress-panel.test.tsx
apps/web/src/components/progress/session-form.tsx
apps/web/src/components/progress/confidence-chip.tsx
apps/web/src/routes/dog-detail.tsx                        MODIFY: render <ProgressPanel dogId={id} />
apps/web/src/lib/progress.ts
```

### Hooks (`apps/web/src/lib/progress.ts`)

```ts
useProgress(dogId)                                 // GET /api/dogs/:id/progress
useAddSkill(dogId, goalId)                         // POST .../goals/:goalId/skills
useUpdateSkill(dogId, skillId)                     // PUT  .../skills/:skillId
useUpdateSkillConfidence(dogId, skillId)           // PATCH .../skills/:skillId/confidence
useDeleteSkill(dogId, skillId)                     // DELETE .../skills/:skillId
useLogSession(dogId, skillId)                      // POST .../skills/:skillId/sessions
useDeleteSession(dogId, skillId)                   // DELETE .../skills/:skillId/sessions/:sessionId
```

All mutations invalidate `["progress", dogId]` on success. Matches existing
patterns (`useUpdateEntry` etc.). No optimistic updates; rely on refetch.

## i18n (en + es with parity)

Add a new `progress:` section to both `apps/web/src/i18n/en.ts` and
`apps/web/src/i18n/es.ts`. The compile-time `es satisfies Messages` check
enforces structural parity.

### English (`en.ts`)

```ts
progress: {
  title: "Training progress",
  empty: "No training goals yet — add one in the Goals section above.",
  addSkill: "Add skill",
  skillName: "Skill name",
  skillNamePh: "e.g. Door-knock threshold",
  confidence: "Confidence",
  level1: "Not yet",
  level2: "Learning",
  level3: "Sometimes",
  level4: "Usually",
  level5: "Consistently",
  sessions: "sessions",
  session: "session",
  noSessions: "No sessions yet — log your first one below.",
  lastSession: "Last session",
  logSession: "Log session",
  occurredAt: "When",
  duration: "Duration (min)",
  durationOptional: "optional",
  notes: "Notes",
  notesOptional: "optional",
  save: "Save session",
  saving: "Saving…",
  cancel: "Cancel",
  saved: "Session logged",
  saveFailed: "Couldn't save",
  removeSkill: "Remove skill",
  removeSession: "Remove",
  edit: "Edit skill",
  saveSkill: "Save changes",
  loadError: "Couldn't load training progress",
  avgConfidence: "avg",
}
```

### Spanish (`es.ts`, with parity)

```ts
progress: {
  title: "Progreso de entrenamiento",
  empty: "Aún no hay objetivos — agrega uno en la sección Objetivos.",
  addSkill: "Agregar habilidad",
  skillName: "Nombre de habilidad",
  skillNamePh: "ej. Tolerar el timbre",
  confidence: "Confianza",
  level1: "Aún no",
  level2: "Aprendiendo",
  level3: "A veces",
  level4: "Generalmente",
  level5: "Consistentemente",
  sessions: "sesiones",
  session: "sesión",
  noSessions: "Aún no hay sesiones — registra la primera abajo.",
  lastSession: "Última sesión",
  logSession: "Registrar sesión",
  occurredAt: "Cuándo",
  duration: "Duración (min)",
  durationOptional: "opcional",
  notes: "Notas",
  notesOptional: "opcional",
  save: "Guardar sesión",
  saving: "Guardando…",
  cancel: "Cancelar",
  saved: "Sesión registrada",
  saveFailed: "No se pudo guardar",
  removeSkill: "Quitar habilidad",
  removeSession: "Quitar",
  edit: "Editar habilidad",
  saveSkill: "Guardar cambios",
  loadError: "No se pudo cargar el progreso",
  avgConfidence: "prom",
}
```

## Brief integration

Extend `apps/api/src/lib/brief.ts`. The current `composeBrief({ dog, concerns, goals, entries })`
signature gains a parallel structure:

```ts
composeBrief({
  dog, concerns, goals, entries,
  progress: Array<{
    goal: string;
    avgConfidence: number | null;
    skills: Array<{
      name: string;
      confidence: number;
      sessionCount: number;
      lastSessionAt: string | null;
      lastNote: string | null;
    }>;
  }>;
})
```

The `POST /api/dogs/:id/brief` handler already queries `concerns`, `goals`,
`entries` — extend it to also load progress. Extract a `loadProgress(dogId)`
helper shared with the GET `/progress` endpoint so both call sites use the same
query.

### Brief text rendering

```
Training progress:
  Calm greetings — Sometimes (3.0/5)
    • Door-knock threshold — 3/5, 8 sessions over 3 wks
      last: "held sit through 2 knocks"
    • Greeting strangers — 2/5, 4 sessions
    • Settling on mat — 4/5, 12 sessions, last today
  Loose leash — Learning (2.0/5)
    • Check-in cues — 2/5, 5 sessions
```

Rules:
- If a goal has zero skills (edge case — should not happen post-auto-create),
  skip the goal in this section.
- If a skill has zero sessions, render `<name> — <confidence>/5, no sessions yet`.
- "over N wks" span derived from first-session and last-session dates;
  rounded; omit for fewer than 2 sessions.
- Notes truncated to 80 chars (with `…` ellipsis).
- Section omitted entirely when dog has zero goals.

Confidence labels in the Brief are NUMERIC for compactness in plain text
(`3/5`). Named labels live in the UI. Goal lines show 1-decimal avg + label
(`Sometimes (3.0/5)`).

## Tests

### Shared (`packages/shared/src/progress.test.ts` — NEW)
- `trainingSkillSchema` accepts valid {name, confidence}
- rejects empty name (post-trim), >120 char name, confidence outside 1–5
- `skillConfidenceSchema` rejects non-integer / out-of-range
- `practiceSessionSchema` accepts {occurredAt} + optional duration + optional notes
- rejects negative duration, non-string notes

### API (`apps/api/src/routes/dogs.test.ts` — extend with new describe blocks)
- `POST /api/dogs/:id/goals` now also returns a default skill (existing test
  updated)
- `GET /api/dogs/:id/progress` returns the goal with one default skill after
  goal create
- POST a second skill under that goal works; GET reflects it; positions are 0, 1
- PUT skill updates name + confidence; PATCH-confidence variant works
- DELETE skill cascades sessions (verify via subsequent GET)
- POST session attaches to skill; GET shows sessionCount=1, lastSessionAt set,
  lastNote populated
- DELETE session removes it; sessionCount decrements
- Owner-isolation: user B → 404 on add/update/delete of user A's skill
- Cross-dog isolation: user A can't POST a skill to a goal belonging to
  another of their dogs (path mismatch)
- Cross-skill isolation: user A can't POST a session against a skill that
  doesn't belong to the dogId in the path
- Brief composer renders training-progress section when goals + skills +
  sessions exist
- Brief omits training-progress section when no goals

### Web (`apps/web/src/components/progress/progress-panel.test.tsx` — NEW)
- Renders goals with default skills and numeric confidence chips
- Clicking confidence chip opens popover with 5 named levels; selecting one
  triggers PATCH
- "Add skill" opens form; submit POSTs; new skill appears
- "Log session" form on a skill: filling + submit POSTs; sessionCount
  increments visibly after refetch
- "Remove skill" triggers DELETE; skill disappears from the panel
- Empty state: dog with no goals renders the empty message

### Web (`apps/web/src/routes/dogs.test.tsx`)
- Existing dog-detail test continues to render with `<ProgressPanel>` mounted
  (no broken imports / missing data).

## Migration / data lifecycle

- One drizzle migration creates `training_skills` + `practice_sessions` and
  runs the idempotent backfill INSERT.
- For the beta deployment (effectively one user), running migration on
  production directly is safe.
- No data loss path — strictly additive.

## Out of scope

- Editing a logged session (delete + re-log)
- Reordering skills via drag (position stored but no reorder UI)
- Trainer-set goals / trainer view (separate slice when the trainer portal
  lands)
- Progress charts / line graphs over time
- Streaks / badges / gamification
- Reminders / notifications
- Sharing progress externally (lives in the Brief)
- Per-session confidence delta (e.g., "after this session, confidence is
  now 4") — owner adjusts confidence manually
- Importing/exporting progress data
- Customizing the 5 confidence labels beyond what i18n already provides

## Flagged decisions (reasonable; reviewable)

- **Sessions are always tied to a skill, never directly to a goal.** Casual
  users still get the same UX because new goals auto-create a default
  same-named skill. Eliminates the awkward "is this session for the skill or
  the goal as a whole?" question.
- **Confidence is per-skill, owner-set.** Goal-level confidence is computed
  average (not stored). Trade-off: owners who want "the goal as a whole is
  mastered" can't override; they must mark each underlying skill. Intentional
  — confidence at the goal level usually IS just the average of its parts;
  overrides would create drift.
- **5-level named scale** (1=Not yet, 2=Learning, 3=Sometimes, 4=Usually,
  5=Consistently). Stored as int; rendered via i18n. Avoids false precision of
  percentages and the meaning-ambiguity of 1-10.
- **No "session done" checkmark.** Logging IS the action. A session in the
  log = a session that happened.
- **PATCH `/confidence` is a separate endpoint** from PUT for the full skill.
  Tiny extra route — but the most common edit (chip click → adjust
  confidence) is a 1-field write; full PUT is for "Edit skill" (rename). The
  small separation maps to UI affordances cleanly.
- **Existing goals get a default backfilled skill** with the goal's text as
  the skill name. Owners rename later. No new UI for "decomposing" — the
  default skill IS the goal's first decomposition.
- **No per-session confidence rating.** Sessions are facts; confidence is
  state. Owners adjust confidence in their own rhythm.
- **`position` integer on `training_skills`** for future drag-reorder; this
  PR doesn't add a reorder UI, but the field is there so we don't migrate
  again.

## For the Copilot implementer (handoff notes)

This spec is delegation-ready. Repo conventions:

- **Worktree + PR per round** (user's stated preference, see `MEMORY.md`):
  - Create from main: `git worktree add .claude/worktrees/training-progress -b worktree-training-progress origin/main`
  - One PR off this branch; do NOT merge to main locally.
  - Worktree dir is gitignored (`.claude/` is in `.gitignore`).
- **Pre-commit branch assertion**: before every `git commit`, run
  `git branch --show-current` and verify it equals `worktree-training-progress`.
  If anything else (especially `main`), STOP — do not commit.
- **gpg-unsigned commits** with the Co-Authored-By trailer:
  ```
  git -c commit.gpgsign=false commit -m "<msg>" -m "Co-Authored-By: <your identity>"
  ```
- **pnpm 11 monorepo.** Per-workspace commands via `pnpm --filter`. Env
  required for api/web tests: `set -a && . ./.env && set +a` (the `.env` lives
  in the worktree root; copy from a sibling worktree if missing — never
  `git add` it).
- **Strict TypeScript + biome lint.** `pnpm -r exec tsc --noEmit` and
  `pnpm lint` (biome) must BOTH be 0 before commit. Biome forbids non-null
  assertions (`!`); use the `const [first] = arr; if (!first) throw new Error("…")`
  pattern instead.
- **i18n parity** enforced at compile time (`es satisfies Messages`). Every
  key added to `en.ts` must exist with the same path in `es.ts`.
- **PROJECT-LOG.md** gets a tail-appended entry on the same date the PR is
  opened. Match the existing entry style.
- **Two-stage review per task** (subagent-driven-development). If subagent
  dispatch isn't available, simulate with a fresh-eyes self-review per task:
  did I implement exactly what was specified? Is the code clean?
- **Use the existing skill flow** if available:
  `superpowers:brainstorming` → `superpowers:writing-plans` →
  `superpowers:subagent-driven-development` →
  `superpowers:finishing-a-development-branch`. Brainstorming step is largely
  done here — confirm scope, write the plan, execute.
- **CLAUDE.md** at the repo root and `MEMORY.md` at the user's memory path
  contain additional context.

### Suggested task decomposition

1. Shared schemas + tests (skill + skillConfidence + session)
2. DB schema additions + migration (table creation + backfill insert)
3. `findOwnedSkill` helper
4. API `GET /:id/progress` + tests
5. API skill POST/PUT/PATCH/DELETE + tests
6. API session POST/DELETE + tests
7. Extend `POST /:id/goals` to auto-create default skill + update existing test
8. Extract `loadProgress(dogId)` helper; extend Brief composer + tests
9. i18n keys (en + es parity)
10. `useProgress` + skill/session mutation hooks
11. `<ConfidenceChip>` + `<SessionForm>` + `<ProgressPanel>` + tests
12. Wire `<ProgressPanel>` into `dog-detail.tsx`
13. PROJECT-LOG entry + finish as PR

13 tasks; bite-sized; same pattern as the journal-edit PR. Each step ships
TDD-style (test first, impl, run, commit) and stays within scope.
