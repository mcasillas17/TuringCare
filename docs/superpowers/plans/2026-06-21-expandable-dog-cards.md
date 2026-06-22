# Expandable Dog Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `/my/dogs` list with expandable dog cards — a collapsed glance line per dog, expanding inline to a rich summary (training goals with level badges, recent activity, concerns) plus links into the hub.

**Architecture:** A new batched `GET /api/dogs/overview` endpoint (`loadDogsOverview`) returns each dog with summary aggregates, powering all collapsed glance lines in one request. The card's expanded body is a separate child component that only mounts (and fetches) when opened, reusing existing per-dog hooks. No new write paths.

**Tech Stack:** Hono + Drizzle (Postgres) API, typed `hc<AppType>` RPC, React 19 + Tailwind v4 + TanStack Query web, Vitest, Biome, typed i18n (en/es).

**Conventions:**
- Work in this git worktree; before each commit run `git branch --show-current` → must print `feat/dog-cards`.
- The worktree has a gitignored `.env` (copied from the main checkout). Prefix API test/migrate commands with `set -a && . ./.env && set +a`. API vitest needs the Docker Postgres (running); web/shared run without it.
- Each task ends green. Web: `pnpm --filter @turingcare/web exec tsc --noEmit`, `pnpm --filter @turingcare/web test`, `pnpm exec biome check apps/web/src`. API: `pnpm --filter @turingcare/api exec tsc --noEmit` (+ vitest with the DB up).
- API test harness: see `apps/api/src/routes/focus.test.ts` (`app.request` + `createTestUser` from `../test-helpers`).
- i18n parity test requires equal key sets and every es value ≠ its en value.
- Tailwind tokens: `slate`, `slate-soft`, `cream`, `silver`, `copper` (support `/opacity`); `green-*`/`red-*` are stock.

---

## Task 1: `loadDogsOverview` (batched summary aggregates)

**Files:**
- Create: `apps/api/src/lib/dogs-overview.ts`
- Test: `apps/api/src/lib/dogs-overview.test.ts`

- [ ] **Step 1: Write the failing test** `apps/api/src/lib/dogs-overview.test.ts`

```ts
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { briefs, journalEntries, trainingGoals, trainingSkills } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";
import { loadDogsOverview } from "./dogs-overview";

const validDog = {
  name: "Biscuit", size: "medium", sex: "female", source: "rescue",
  vaccineStage: "in_progress", spayedNeutered: true,
};
async function makeDog(u: TestUser) {
  const r = await app.request("/api/dogs", { method: "POST", headers: u.authHeaders, body: JSON.stringify(validDog) });
  return ((await r.json()) as { dog: { id: string } }).dog;
}

describe("loadDogsOverview", () => {
  const users: TestUser[] = [];
  afterEach(async () => { for (let u = users.pop(); u; u = users.pop()) await u.cleanup(); });

  it("returns per-dog summary aggregates", async () => {
    const u = await createTestUser(); users.push(u);
    const dog = await makeDog(u);
    const [goal] = await db.insert(trainingGoals).values({ dogId: dog.id, goal: "Recall" }).returning();
    if (!goal) throw new Error("goal");
    await db.insert(trainingSkills).values([
      { goalId: goal.id, name: "Sit", confidence: 3, position: 0 },
      { goalId: goal.id, name: "Down", confidence: 2, position: 1 },
    ]);
    await db.insert(journalEntries).values({ dogId: dog.id, kind: "moment", note: "barked", occurredAt: new Date("2026-06-10T10:00:00Z") });
    await db.insert(briefs).values({ dogId: dog.id, status: "draft", summary: "x", version: 2 });

    const overview = await loadDogsOverview(u.userId);
    const row = overview.find((d) => d.id === dog.id);
    expect(row?.summary).toMatchObject({
      journalCount: 1, goalCount: 1, skillCount: 2, avgLevel: 2.5,
      briefStatus: "draft", briefVersion: 2,
    });
    expect(typeof row?.summary.lastActivityAt).toBe("string");
  });

  it("returns zeros/nulls for a dog with no goals/journal/brief", async () => {
    const u = await createTestUser(); users.push(u);
    const dog = await makeDog(u);
    const overview = await loadDogsOverview(u.userId);
    const row = overview.find((d) => d.id === dog.id);
    expect(row?.summary).toEqual({
      journalCount: 0, lastActivityAt: null, goalCount: 0, skillCount: 0,
      avgLevel: null, briefStatus: null, briefVersion: null,
    });
  });

  it("only includes the owner's dogs", async () => {
    const a = await createTestUser(); const b = await createTestUser(); users.push(a, b);
    const dogA = await makeDog(a);
    const overview = await loadDogsOverview(b.userId);
    expect(overview.find((d) => d.id === dogA.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api exec vitest run src/lib/dogs-overview.test.ts
```
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `apps/api/src/lib/dogs-overview.ts`**

```ts
import { avg, count, desc, eq, inArray, max } from "drizzle-orm";
import { db } from "../db";
import { briefs, dogs, journalEntries, trainingGoals, trainingSkills } from "../db/schema";

export type DogSummary = {
  journalCount: number;
  lastActivityAt: string | null;
  goalCount: number;
  skillCount: number;
  avgLevel: number | null;
  briefStatus: "draft" | "finalized" | null;
  briefVersion: number | null;
};

export type DogOverview = typeof dogs.$inferSelect & { summary: DogSummary };

export async function loadDogsOverview(ownerId: string): Promise<DogOverview[]> {
  const rows = await db
    .select()
    .from(dogs)
    .where(eq(dogs.ownerId, ownerId))
    .orderBy(desc(dogs.createdAt));
  const ids = rows.map((d) => d.id);
  if (ids.length === 0) return [];

  const [journalAgg, goalAgg, skillAgg, briefRows] = await Promise.all([
    db
      .select({ dogId: journalEntries.dogId, n: count(), last: max(journalEntries.occurredAt) })
      .from(journalEntries)
      .where(inArray(journalEntries.dogId, ids))
      .groupBy(journalEntries.dogId),
    db
      .select({ dogId: trainingGoals.dogId, n: count() })
      .from(trainingGoals)
      .where(inArray(trainingGoals.dogId, ids))
      .groupBy(trainingGoals.dogId),
    db
      .select({ dogId: trainingGoals.dogId, n: count(trainingSkills.id), avg: avg(trainingSkills.confidence) })
      .from(trainingSkills)
      .innerJoin(trainingGoals, eq(trainingSkills.goalId, trainingGoals.id))
      .where(inArray(trainingGoals.dogId, ids))
      .groupBy(trainingGoals.dogId),
    db
      .select({ dogId: briefs.dogId, status: briefs.status, version: briefs.version, generatedAt: briefs.generatedAt })
      .from(briefs)
      .where(inArray(briefs.dogId, ids))
      .orderBy(desc(briefs.generatedAt)),
  ]);

  const jMap = new Map(journalAgg.map((r) => [r.dogId, r]));
  const gMap = new Map(goalAgg.map((r) => [r.dogId, r]));
  const sMap = new Map(skillAgg.map((r) => [r.dogId, r]));
  const bMap = new Map<string, (typeof briefRows)[number]>();
  for (const b of briefRows) if (!bMap.has(b.dogId)) bMap.set(b.dogId, b); // ordered desc → first is latest

  return rows.map((d) => {
    const j = jMap.get(d.id);
    const s = sMap.get(d.id);
    const b = bMap.get(d.id);
    return {
      ...d,
      summary: {
        journalCount: Number(j?.n ?? 0),
        lastActivityAt: j?.last ? new Date(j.last).toISOString() : null,
        goalCount: Number(gMap.get(d.id)?.n ?? 0),
        skillCount: Number(s?.n ?? 0),
        avgLevel: s?.avg != null ? Number(Number(s.avg).toFixed(1)) : null,
        briefStatus: b?.status ?? null,
        briefVersion: b?.version ?? null,
      },
    };
  });
}
```

- [ ] **Step 4: Run it, expect PASS** + typecheck

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api exec vitest run src/lib/dogs-overview.test.ts
pnpm --filter @turingcare/api exec tsc --noEmit
```
Expected: 3 pass / clean.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write apps/api/src/lib/dogs-overview.ts apps/api/src/lib/dogs-overview.test.ts
git add apps/api/src/lib/dogs-overview.ts apps/api/src/lib/dogs-overview.test.ts
git commit -m "feat(api): loadDogsOverview batched summary aggregates"
```

---

## Task 2: `GET /api/dogs/overview` route

**Files:**
- Modify: `apps/api/src/routes/dogs.ts`
- Test: `apps/api/src/routes/dogs.test.ts` (append a case)

- [ ] **Step 1: Write the failing test** — append inside the existing top-level `describe` in `apps/api/src/routes/dogs.test.ts` (it already has `createTestUser`, `makeDog`, `makeGoal`, `makeSkill` helpers):

```ts
  it("GET /overview returns dogs with summary", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    await makeSkill(goal.id);

    const res = await app.request("/api/dogs/overview", { headers: u.authHeaders });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      dogs: Array<{ id: string; summary: { goalCount: number; skillCount: number } }>;
    };
    const row = body.dogs.find((d) => d.id === dog.id);
    expect(row?.summary.goalCount).toBe(1);
    expect(row?.summary.skillCount).toBe(1);
  });
```

(If the local `makeGoal`/`makeSkill` helpers aren't already present in this file, add them mirroring `focus.test.ts`: `db.insert(trainingGoals).values({ dogId, goal: "Recall" }).returning()` and `db.insert(trainingSkills).values({ goalId, name: "Sit", confidence: 1, position: 0 }).returning()`, each throwing on missing.)

- [ ] **Step 2: Run it, expect FAIL** (route returns 404 — `/overview` falls through, or is captured by `/:id`)

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api exec vitest run src/routes/dogs.test.ts -t "overview"
```

- [ ] **Step 3: Add the route** — in `apps/api/src/routes/dogs.ts`:

Add the import near the other `../lib/*` imports:
```ts
import { loadDogsOverview } from "../lib/dogs-overview";
```
Insert the route **immediately after the `.post("/", …)` block and BEFORE `.get("/:id", …)`** (ordering matters — otherwise `/overview` is matched as `:id`):
```ts
  .get("/overview", async (c) => {
    return c.json({ dogs: await loadDogsOverview(c.get("userId")) });
  })
```

- [ ] **Step 4: Run it, expect PASS** + typecheck + smoke the dogs router

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api exec vitest run src/routes/dogs.test.ts
pnpm --filter @turingcare/api exec tsc --noEmit
```
Expected: all pass / clean. (Confirm the existing `GET /:id` tests still pass — proves the ordering didn't break them.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts
git commit -m "feat(api): GET /dogs/overview route"
```

---

## Task 3: Web `useDogsOverview` hook + types + invalidation

**Files:**
- Modify: `apps/web/src/lib/dogs.ts`

- [ ] **Step 1: Add types + hook** — in `apps/web/src/lib/dogs.ts`, after the `useDog` hook, add:

```ts
export type DogSummary = {
  journalCount: number;
  lastActivityAt: string | null;
  goalCount: number;
  skillCount: number;
  avgLevel: number | null;
  briefStatus: "draft" | "finalized" | null;
  briefVersion: number | null;
};

export type DogOverview = {
  id: string;
  name: string;
  breed: string | null;
  summary: DogSummary;
};

export function useDogsOverview() {
  return useQuery({
    queryKey: ["dogs-overview"],
    queryFn: async () => {
      const res = await dogs.overview.$get();
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).dogs as DogOverview[];
    },
  });
}
```
(`dogs` is the existing `api.api.dogs` reference. The `.overview.$get` is typed because Task 2 added the route to `AppType`.)

- [ ] **Step 2: Invalidate `["dogs-overview"]` on dog create/delete** — so a new/removed dog updates the list immediately. In `useCreateDog` `onSuccess`, add `qc.invalidateQueries({ queryKey: ["dogs-overview"] });` alongside the existing `["dogs"]` invalidation. Do the same in `useDeleteDog` and `useUpdateDog` `onSuccess`. (Other summary changes — goals, journal, brief — refresh on the next `/my/dogs` mount since the query is stale-on-mount by default; no further wiring needed.)

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check --write apps/web/src/lib/dogs.ts
git add apps/web/src/lib/dogs.ts
git commit -m "feat(web): useDogsOverview hook + types"
```

---

## Task 4: `timeAgo` helper

**Files:**
- Create: `apps/web/src/lib/time-ago.ts`
- Test: `apps/web/src/lib/time-ago.test.ts`

A localized "time ago" used by the card stat strip (mirrors the inline helper in `dog-hub.tsx`, which can be migrated to this later — out of scope here).

- [ ] **Step 1: Write the failing test** `apps/web/src/lib/time-ago.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { timeAgo } from "./time-ago";

// fake translate: echoes key + n
const t = ((key: string, vars?: { n?: number }) => (vars?.n != null ? `${key}:${vars.n}` : key)) as never;
const now = new Date("2026-06-21T12:00:00Z").getTime();

describe("timeAgo", () => {
  it("returns null for nullish input", () => {
    expect(timeAgo(t, null, now)).toBeNull();
  });
  it("today for <1 day", () => {
    expect(timeAgo(t, "2026-06-21T08:00:00Z", now)).toBe("dogHub.today");
  });
  it("days, weeks, months buckets", () => {
    expect(timeAgo(t, "2026-06-18T12:00:00Z", now)).toBe("dogHub.daysAgo:3");
    expect(timeAgo(t, "2026-06-01T12:00:00Z", now)).toBe("dogHub.weeksAgo:2");
    expect(timeAgo(t, "2026-04-01T12:00:00Z", now)).toBe("dogHub.monthsAgo:2");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/web exec vitest run src/lib/time-ago.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `apps/web/src/lib/time-ago.ts`**

```ts
import type { useI18n } from "@/i18n";

type Translate = ReturnType<typeof useI18n>["t"];

/** Localized relative time ("today" / "{n}d ago" / "{n}w ago" / "{n}mo ago"). */
export function timeAgo(t: Translate, iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const ms = now - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return t("dogHub.today");
  if (days < 7) return t("dogHub.daysAgo", { n: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return t("dogHub.weeksAgo", { n: weeks });
  const months = Math.floor(days / 30);
  return t("dogHub.monthsAgo", { n: Math.max(months, 1) });
}
```

- [ ] **Step 4: Run it, expect PASS**

Run: `pnpm --filter @turingcare/web exec vitest run src/lib/time-ago.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write apps/web/src/lib/time-ago.ts apps/web/src/lib/time-ago.test.ts
git add apps/web/src/lib/time-ago.ts apps/web/src/lib/time-ago.test.ts
git commit -m "feat(web): localized timeAgo helper"
```

---

## Task 5: i18n keys for the cards

**Files:**
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`
- Test: `apps/web/src/i18n/i18n.test.tsx` (parity)

- [ ] **Step 1: Add to the `dogs:` object in `en.ts`:**
```ts
    expandCard: "Expand {name}",
    collapseCard: "Collapse {name}",
    glanceSkills: "{skills} skills · avg {avg}/5",
    glanceGoals: "{goals} goals",
    glanceEntries: "{entries} entries",
    glanceNoActivity: "No activity yet",
    briefDraft: "Draft v{version}",
    briefFinal: "Final v{version}",
    noBrief: "No brief yet",
    statJournal: "journal",
    statLevel: "avg level",
    statBrief: "brief",
    cardTraining: "Training",
    cardRecent: "Recent activity",
    cardNoGoals: "No goals yet",
    cardNoActivity: "Nothing logged yet",
    openTraining: "Open Training →",
    journalLink: "Journal →",
    actLogMoment: "＋ Log moment",
    actBrief: "Brief →",
    actWeek: "This Week →",
    actEdit: "Edit",
```

- [ ] **Step 2: Add the SAME keys to the `dogs:` object in `es.ts` (translated, each ≠ en):**
```ts
    expandCard: "Expandir {name}",
    collapseCard: "Contraer {name}",
    glanceSkills: "{skills} habilidades · prom {avg}/5",
    glanceGoals: "{goals} objetivos",
    glanceEntries: "{entries} entradas",
    glanceNoActivity: "Sin actividad aún",
    briefDraft: "Borrador v{version}",
    briefFinal: "Definitivo v{version}",
    noBrief: "Sin resumen aún",
    statJournal: "diario",
    statLevel: "nivel prom",
    statBrief: "resumen",
    cardTraining: "Entrenamiento",
    cardRecent: "Actividad reciente",
    cardNoGoals: "Sin objetivos aún",
    cardNoActivity: "Nada registrado aún",
    openTraining: "Abrir Entrenamiento →",
    journalLink: "Diario →",
    actLogMoment: "＋ Registrar momento",
    actBrief: "Resumen →",
    actWeek: "Esta semana →",
    actEdit: "Editar",
```

- [ ] **Step 3: Run parity + tsc**

```bash
pnpm --filter @turingcare/web exec vitest run src/i18n/i18n.test.tsx
pnpm --filter @turingcare/web exec tsc --noEmit
```
Expected: PASS / clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): i18n keys for dog cards"
```

---

## Task 6: `DogCardBody` (expanded detail, lazy-loaded)

**Files:**
- Create: `apps/web/src/components/dogs/dog-card-body.tsx`
- Test: `apps/web/src/components/dogs/dog-card-body.test.tsx`

This component mounts only when a card is expanded (Task 7), so its hooks fetch lazily.

- [ ] **Step 1: Write the failing test** `dog-card-body.test.tsx`

```tsx
import { LocaleProvider } from "@/i18n";
import * as dogsLib from "@/lib/dogs";
import type { DogOverview } from "@/lib/dogs";
import * as journalLib from "@/lib/journal";
import * as progressLib from "@/lib/progress";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DogCardBody } from "./dog-card-body";

vi.mock("@/lib/dogs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dogs")>("@/lib/dogs");
  return { ...actual, useDog: vi.fn() };
});
vi.mock("@/lib/progress", () => ({ useProgress: vi.fn() }));
vi.mock("@/lib/journal", () => ({ useJournal: vi.fn() }));

const overview: DogOverview = {
  id: "d1", name: "Turing", breed: "Mini Aussie",
  summary: { journalCount: 12, lastActivityAt: new Date().toISOString(), goalCount: 1, skillCount: 2, avgLevel: 3, briefStatus: "draft", briefVersion: 2 },
};

function setup() {
  vi.mocked(progressLib.useProgress).mockReturnValue({ data: [{ id: "g1", goal: "Basic Manners", catalogGoalKey: null, avgConfidence: 3, skills: [{ id: "s1", name: "Sit", confidence: 3, position: 0, catalogSkillKey: null, sessionCount: 0, firstSessionAt: null, lastSessionAt: null, lastNote: null, sessions: [], milestones: [] }] }] } as unknown as ReturnType<typeof progressLib.useProgress>);
  vi.mocked(journalLib.useJournal).mockReturnValue({ data: [{ id: "e1", dogId: "d1", kind: "moment", occurredAt: new Date().toISOString(), note: "barked at bushes", trend: null, antecedent: null, behavior: null, consequence: null, intensity: null, location: null, notes: null, durationSeconds: null, recoverySeconds: null, peoplePresent: null, ownerResponse: null }] } as unknown as ReturnType<typeof journalLib.useJournal>);
  vi.mocked(dogsLib.useDog).mockReturnValue({ data: { dog: { id: "d1" }, concerns: [{ id: "c1", concern: "Leash reactivity", severity: "moderate" }] } } as unknown as ReturnType<typeof dogsLib.useDog>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><DogCardBody dog={overview} /></MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("DogCardBody", () => {
  it("renders training goals with level badges, recent activity, and concerns", () => {
    setup();
    expect(screen.getByText("Basic Manners")).toBeInTheDocument();
    expect(screen.getByText(/Sit/)).toBeInTheDocument();
    expect(screen.getByText("barked at bushes")).toBeInTheDocument();
    expect(screen.getByText("Leash reactivity")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Training/i })).toHaveAttribute("href", "/my/dogs/d1/training");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/dogs/dog-card-body.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `apps/web/src/components/dogs/dog-card-body.tsx`**

```tsx
import { useI18n } from "@/i18n";
import { type DogOverview, useDog } from "@/lib/dogs";
import { useJournal } from "@/lib/journal";
import { useProgress } from "@/lib/progress";
import { timeAgo } from "@/lib/time-ago";
import { humanTime } from "@/lib/when";
import { Link } from "react-router-dom";

export function DogCardBody({ dog }: { dog: DogOverview }) {
  const { t, locale } = useI18n();
  const { summary } = dog;
  const { data: goals } = useProgress(dog.id);
  const { data: entries } = useJournal(dog.id);
  const { data: detail } = useDog(dog.id);
  const recent = (entries ?? []).slice(0, 2);
  const concerns = detail?.concerns ?? [];

  return (
    <div className="space-y-4 border-t border-silver bg-cream/40 p-4">
      {/* stat strip */}
      <div className="flex gap-2">
        <div className="flex-1 rounded-xl border border-silver bg-white p-3">
          <div className="text-base font-bold text-slate">{summary.journalCount}</div>
          <div className="text-xs text-slate-soft">
            {t("dogs.statJournal")}
            {summary.lastActivityAt ? ` · ${timeAgo(t, summary.lastActivityAt)}` : ""}
          </div>
        </div>
        <div className="flex-1 rounded-xl border border-silver bg-white p-3">
          <div className="text-base font-bold text-slate">{summary.avgLevel != null ? `${summary.avgLevel}/5` : "—"}</div>
          <div className="text-xs text-slate-soft">{t("dogs.statLevel")}</div>
        </div>
        <div className="flex-1 rounded-xl border border-silver bg-white p-3">
          <div className="text-base font-bold text-slate">
            {summary.briefStatus === "finalized" ? t("dogs.briefFinal", { version: summary.briefVersion ?? 1 }) : summary.briefStatus === "draft" ? t("dogs.briefDraft", { version: summary.briefVersion ?? 1 }) : "—"}
          </div>
          <div className="text-xs text-slate-soft">{t("dogs.statBrief")}</div>
        </div>
      </div>

      {/* training */}
      <section>
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-soft">
          <span>{t("dogs.cardTraining")}</span>
          <Link to={`/my/dogs/${dog.id}/training`} className="font-bold text-[#3a6ea5]">{t("dogs.openTraining")}</Link>
        </div>
        {(goals ?? []).length === 0 ? (
          <p className="text-sm text-slate-soft">{t("dogs.cardNoGoals")}</p>
        ) : (
          (goals ?? []).map((g) => (
            <div key={g.id} className="mb-2 rounded-xl border border-silver bg-white p-3">
              <div className="mb-1.5 text-sm font-semibold text-slate">{g.goal}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.skills.map((s) => (
                  <span key={s.id} className="rounded-full border border-silver bg-cream px-2 py-0.5 text-xs text-slate">
                    {s.name} <span className="font-bold text-copper">L{s.confidence}</span>
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      {/* recent activity */}
      <section>
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-soft">
          <span>{t("dogs.cardRecent")}</span>
          <Link to={`/my/dogs/${dog.id}/journal`} className="font-bold text-[#3a6ea5]">{t("dogs.journalLink")}</Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-soft">{t("dogs.cardNoActivity")}</p>
        ) : (
          recent.map((e) => (
            <div key={e.id} className="border-b border-silver/60 py-1.5 text-sm text-slate last:border-0">
              {e.note} <span className="text-slate-soft">· {humanTime(e.occurredAt, locale)}</span>
            </div>
          ))
        )}
      </section>

      {/* concerns */}
      {concerns.length > 0 && (
        <section>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-soft">{t("dogs.concernsTitle")}</div>
          <div className="flex flex-wrap gap-1.5">
            {concerns.map((cn) => (
              <span key={cn.id} className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">{cn.concern}</span>
            ))}
          </div>
        </section>
      )}

      {/* actions */}
      <div className="flex flex-wrap gap-2">
        <Link to={`/my/dogs/${dog.id}/journal?compose=moment`} className="rounded-lg bg-slate px-3 py-2 text-sm font-bold text-cream">{t("dogs.actLogMoment")}</Link>
        <Link to={`/my/dogs/${dog.id}/brief`} className="rounded-lg border border-silver bg-white px-3 py-2 text-sm font-bold text-slate">{t("dogs.actBrief")}</Link>
        <Link to={`/my/dogs/${dog.id}/week`} className="rounded-lg border border-silver bg-white px-3 py-2 text-sm font-bold text-slate">{t("dogs.actWeek")}</Link>
        <Link to={`/my/dogs/${dog.id}/edit`} className="rounded-lg border border-silver bg-white px-3 py-2 text-sm font-bold text-slate">{t("dogs.actEdit")}</Link>
      </div>
    </div>
  );
}
```

> NOTE: `humanTime` and `useProgress`/`useJournal`/`useDog` already exist. `dogs.concernsTitle` is an existing key (reused for the concerns heading). The `[#3a6ea5]` link color matches the journal/brief "see all" links; if Biome objects to the arbitrary value, use `text-copper` instead.

- [ ] **Step 4: Run it, expect PASS** + typecheck + lint

```bash
pnpm --filter @turingcare/web exec vitest run src/components/dogs/dog-card-body.test.tsx
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check --write apps/web/src/components/dogs/dog-card-body.tsx apps/web/src/components/dogs/dog-card-body.test.tsx
```
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dogs/dog-card-body.tsx apps/web/src/components/dogs/dog-card-body.test.tsx
git commit -m "feat(web): DogCardBody expanded detail"
```

---

## Task 7: `DogCard` (header + glance + expand toggle)

**Files:**
- Create: `apps/web/src/components/dogs/dog-card.tsx`
- Test: `apps/web/src/components/dogs/dog-card.test.tsx`

- [ ] **Step 1: Write the failing test** `dog-card.test.tsx`

```tsx
import { LocaleProvider } from "@/i18n";
import type { DogOverview } from "@/lib/dogs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DogCard } from "./dog-card";

// Body is lazy + fetches; stub it so this test focuses on the header/toggle.
vi.mock("./dog-card-body", () => ({ DogCardBody: ({ dog }: { dog: { name: string } }) => <div>body:{dog.name}</div> }));

const dog: DogOverview = {
  id: "d1", name: "Turing", breed: "Mini Aussie",
  summary: { journalCount: 12, lastActivityAt: null, goalCount: 1, skillCount: 5, avgLevel: 3, briefStatus: "draft", briefVersion: 2 },
};

function setup() {
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><DogCard dog={dog} /></MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("DogCard", () => {
  it("shows name, breed, and a glance line; body hidden until expanded", () => {
    setup();
    expect(screen.getByText("Turing")).toBeInTheDocument();
    expect(screen.getByText(/Mini Aussie/)).toBeInTheDocument();
    expect(screen.getByText(/5 skills · avg 3\/5/)).toBeInTheDocument();
    expect(screen.queryByText("body:Turing")).not.toBeInTheDocument();
  });

  it("expands to mount the body when the header is clicked", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Expand Turing/i }));
    expect(screen.getByText("body:Turing")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/dogs/dog-card.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `apps/web/src/components/dogs/dog-card.tsx`**

```tsx
import { useI18n } from "@/i18n";
import type { DogOverview } from "@/lib/dogs";
import { useState } from "react";
import { DogCardBody } from "./dog-card-body";

export function DogCard({ dog }: { dog: DogOverview }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { summary } = dog;

  const training =
    summary.skillCount > 0
      ? t("dogs.glanceSkills", { skills: summary.skillCount, avg: summary.avgLevel ?? 0 })
      : summary.goalCount > 0
        ? t("dogs.glanceGoals", { goals: summary.goalCount })
        : null;
  const entries = t("dogs.glanceEntries", { entries: summary.journalCount });
  const glance = [training, entries].filter(Boolean).join(" · ");
  const briefPill =
    summary.briefStatus === "finalized"
      ? t("dogs.briefFinal", { version: summary.briefVersion ?? 1 })
      : summary.briefStatus === "draft"
        ? t("dogs.briefDraft", { version: summary.briefVersion ?? 1 })
        : t("dogs.noBrief");

  return (
    <div className="overflow-hidden rounded-2xl border border-silver bg-white">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? t("dogs.collapseCard", { name: dog.name }) : t("dogs.expandCard", { name: dog.name })}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-slate text-lg font-bold text-cream" aria-hidden="true">
          {dog.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-slate">
            {dog.name}
            {dog.breed ? <span className="font-medium text-slate-soft"> · {dog.breed}</span> : null}
          </span>
          <span className="mt-0.5 block text-sm text-slate-soft">
            {glance}
            <span className="ml-1.5 rounded-full bg-slate/5 px-2 py-0.5 text-xs font-semibold text-slate-soft">{briefPill}</span>
          </span>
        </span>
        <span className="text-slate-soft" aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>
      {open && <DogCardBody dog={dog} />}
    </div>
  );
}
```

- [ ] **Step 4: Run it, expect PASS** + typecheck + lint

```bash
pnpm --filter @turingcare/web exec vitest run src/components/dogs/dog-card.test.tsx
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check --write apps/web/src/components/dogs/dog-card.tsx apps/web/src/components/dogs/dog-card.test.tsx
```
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dogs/dog-card.tsx apps/web/src/components/dogs/dog-card.test.tsx
git commit -m "feat(web): DogCard header + glance + expand toggle"
```

---

## Task 8: Rewrite `dogs-list.tsx` to render cards

**Files:**
- Modify: `apps/web/src/routes/dogs-list.tsx`
- Test: `apps/web/src/routes/dogs-list.test.tsx` (create if absent)

- [ ] **Step 1: Write the failing test** `apps/web/src/routes/dogs-list.test.tsx`

```tsx
import { LocaleProvider } from "@/i18n";
import * as dogsLib from "@/lib/dogs";
import type { DogOverview } from "@/lib/dogs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DogsList } from "./dogs-list";

vi.mock("@/lib/dogs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dogs")>("@/lib/dogs");
  return { ...actual, useDogsOverview: vi.fn() };
});
vi.mock("./../components/dogs/dog-card", () => ({ DogCard: ({ dog }: { dog: { name: string } }) => <div>card:{dog.name}</div> }));

const dogs: DogOverview[] = [
  { id: "d1", name: "Turing", breed: "Mini Aussie", summary: { journalCount: 0, lastActivityAt: null, goalCount: 0, skillCount: 0, avgLevel: null, briefStatus: null, briefVersion: null } },
];

function setup(data: DogOverview[] | undefined) {
  vi.mocked(dogsLib.useDogsOverview).mockReturnValue({ data, isLoading: false, isError: false } as unknown as ReturnType<typeof dogsLib.useDogsOverview>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><DogsList /></MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("DogsList", () => {
  it("renders a card per dog", () => {
    setup(dogs);
    expect(screen.getByText("card:Turing")).toBeInTheDocument();
  });
  it("shows the empty state when there are no dogs", () => {
    setup([]);
    expect(screen.getByText(/No dogs yet/i)).toBeInTheDocument();
  });
});
```
> The `vi.mock("./../components/dogs/dog-card", …)` path must resolve to the same module the route imports — use the matching relative/alias path (e.g. `@/components/dogs/dog-card`). Match whatever import the implementation uses.

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/dogs-list.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite `apps/web/src/routes/dogs-list.tsx`**

```tsx
import { DogCard } from "@/components/dogs/dog-card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDogsOverview } from "@/lib/dogs";
import { useNavigate } from "react-router-dom";

export function DogsList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: dogs, isLoading, isError } = useDogsOverview();
  const isEmpty = dogs && dogs.length === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-slate">{t("dogs.listTitle")}</h1>
      {isLoading && <p>{t("common.loading")}</p>}
      {isError && <p className="text-red-600">{t("dogs.loadError")}</p>}
      {isEmpty && (
        <section className="space-y-3 rounded-2xl border border-silver bg-white p-6 text-center">
          <h2 className="text-lg font-semibold text-slate">{t("dogs.emptyTitle")}</h2>
          <p className="text-slate-soft">{t("dogs.emptyBody")}</p>
          <button
            type="button"
            onClick={() => navigate("/my/dogs/new")}
            className="inline-block rounded bg-slate px-4 py-2 text-cream"
          >
            {t("dogs.emptyCta")}
          </button>
        </section>
      )}
      <div className="space-y-3">
        {dogs?.map((d) => (
          <DogCard key={d.id} dog={d} />
        ))}
      </div>
      {!isEmpty && (
        <Button onClick={() => navigate("/my/dogs/new")} className="w-full border border-dashed border-silver bg-transparent text-slate-soft">
          {t("dogs.add")}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it, expect PASS**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/dogs-list.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check --write apps/web/src/routes/dogs-list.tsx apps/web/src/routes/dogs-list.test.tsx
git add apps/web/src/routes/dogs-list.tsx apps/web/src/routes/dogs-list.test.tsx
git commit -m "feat(web): render expandable dog cards on /my/dogs"
```

---

## Task 9: Full verification + polish

- [ ] **Step 1: Full gates**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api exec tsc --noEmit
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm --filter @turingcare/api exec vitest run
pnpm --filter @turingcare/web test
pnpm --filter @turingcare/web exec vitest run src/i18n/i18n.test.tsx
pnpm exec biome check apps/web/src apps/api/src
pnpm --filter @turingcare/web build
```
Expected: all green. (If the Docker Postgres is unhealthy, `docker restart turingcare-postgres`, wait healthy, re-run the api suite — this is a known flake, not a code failure.)

- [ ] **Step 2: react-doctor regression check**

```bash
cd apps/web && npx react-doctor@latest --scope changed 2>&1 | tail -20 ; cd ../..
```
Report the score; fix real, cheap issues, leave SPA false-positives.

- [ ] **Step 3: Manual smoke (document result)** — `pnpm dev`, open `/my/dogs`: cards render with glance lines; clicking a header expands inline (stat strip, training goals with L-badges, recent activity, concerns, actions) and collapses; the action links/`Open Training →` navigate to the right routes; add-a-dog works; a brand-new dog (no goals/journal/brief) shows a sensible glance ("0 entries · No brief yet") and empty sections. Note anything off; fix.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify expandable dog cards green"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** expandable cards on `/my/dogs` (T8) ✓; collapsed glance line (T7, glance built from `summary`) ✓; batched `/dogs/overview` + `loadDogsOverview` (T1, T2) ✓ — no N+1; lazy expanded detail mounting on open (T7 renders `DogCardBody` only when `open`; T6 hooks fetch on mount) ✓; training goals with level badges, recent activity, concerns, stat strip, action row + hub links (T6) ✓; header toggles expand, nav only via explicit links (T7) ✓; initial avatar, no photos (T7) ✓; hub untouched, dropdowns untouched (no changes there) ✓; `["dogs-overview"]` invalidation on dog mutations (T3) ✓; i18n parity (T5) ✓; tests across api/web (every task) ✓.

**Placeholder scan:** none — all steps have concrete code/commands. The only "match the import path" note (T8 step 1) is a real instruction, not a code gap.

**Type consistency:** `DogSummary`/`DogOverview` defined identically in `dogs-overview.ts` (api, T1) and `lib/dogs.ts` (web, T3) and consumed by `DogCard`/`DogCardBody` (T6/T7) and `dogs-list` (T8); `useDogsOverview` (T3) returns `DogOverview[]`; `timeAgo(t, iso, now?)` signature (T4) matches its use in T6; the `summary` field names line up across the API response, the web type, and both components.

**Scope:** single full-stack feature (one endpoint + the card UI). No decomposition needed.
