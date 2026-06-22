# Per-Dog Hub Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De-bloat the per-dog hub: move Log-moment/Daily-check-in dialogs + concern management onto the dog card, tighten Training and Brief, then drop the now-redundant Overview tab and fix the "All dogs" nav.

**Architecture:** Sequenced to avoid regression windows — first enrich the dog card (so it owns concerns + capture), then de-bloat Training/Brief and stop auto-creating a goal-named skill, and only **last** remove the Overview tab + route. No new endpoints.

**Tech Stack:** Hono + Drizzle (Postgres) API, typed `hc<AppType>` RPC, React 19 + Tailwind v4 + TanStack Query + react-router-dom v7 web, Vitest, Biome, typed i18n (en/es).

**Conventions:**
- Work in this worktree; before each commit `git branch --show-current` MUST print `feat/dog-hub-redesign`.
- Worktree has a gitignored `.env`; prefix API test/migrate with `set -a && . ./.env && set +a`. API vitest needs Docker Postgres (running). If it goes unhealthy: `docker restart turingcare-postgres`, wait healthy, re-run.
- Each task ends green: web `tsc`/`test`/`biome check apps/web/src`; api `tsc`/vitest.
- ONLY touch the files a task names; `git add` only those. Do NOT recreate/delete unrelated files.
- Tailwind tokens: slate/slate-soft/cream/silver/copper (support `/opacity`).

---

## Task 1: Dog card — in-place capture dialogs + concern management

The card replaces what the Overview tab did. Reuses the journal `Sheet` + composers and the existing concern hooks. (Additive — Overview still exists.)

**Files:**
- Modify: `apps/web/src/components/dogs/dog-card-body.tsx`
- Test: `apps/web/src/components/dogs/dog-card-body.test.tsx`

- [ ] **Step 1: Extend the test** — replace `apps/web/src/components/dogs/dog-card-body.test.tsx` with:

```tsx
import { LocaleProvider } from "@/i18n";
import * as dogsLib from "@/lib/dogs";
import type { DogOverview } from "@/lib/dogs";
import * as journalLib from "@/lib/journal";
import * as progressLib from "@/lib/progress";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DogCardBody } from "./dog-card-body";

vi.mock("@/lib/dogs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dogs")>("@/lib/dogs");
  return { ...actual, useDog: vi.fn(), useAddConcern: vi.fn(), useRemoveConcern: vi.fn() };
});
vi.mock("@/lib/progress", () => ({ useProgress: vi.fn() }));
vi.mock("@/lib/journal", () => ({ useJournal: vi.fn(), useAddEntry: vi.fn() }));

const overview: DogOverview = {
  id: "d1", name: "Turing", breed: "Mini Aussie",
  summary: { journalCount: 12, lastActivityAt: new Date().toISOString(), goalCount: 1, skillCount: 2, avgLevel: 3, briefStatus: "draft", briefVersion: 2 },
};

function setup() {
  vi.mocked(progressLib.useProgress).mockReturnValue({ data: [] } as unknown as ReturnType<typeof progressLib.useProgress>);
  vi.mocked(journalLib.useJournal).mockReturnValue({ data: [] } as unknown as ReturnType<typeof journalLib.useJournal>);
  vi.mocked(journalLib.useAddEntry).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof journalLib.useAddEntry>);
  const removeConcern = { mutate: vi.fn() };
  const addConcern = { mutateAsync: vi.fn().mockResolvedValue({}) };
  vi.mocked(dogsLib.useRemoveConcern).mockReturnValue(removeConcern as unknown as ReturnType<typeof dogsLib.useRemoveConcern>);
  vi.mocked(dogsLib.useAddConcern).mockReturnValue(addConcern as unknown as ReturnType<typeof dogsLib.useAddConcern>);
  vi.mocked(dogsLib.useDog).mockReturnValue({ data: { dog: { id: "d1" }, concerns: [{ id: "c1", concern: "Leash reactivity", severity: "moderate" }] } } as unknown as ReturnType<typeof dogsLib.useDog>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><DogCardBody dog={overview} /></MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
  return { removeConcern };
}

describe("DogCardBody", () => {
  it("opens the Log moment dialog in place (no navigation)", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /log moment/i }));
    expect(screen.getByRole("dialog", { name: /log moment/i })).toBeInTheDocument();
  });

  it("opens the Daily check-in dialog in place", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /daily check-in/i }));
    expect(screen.getByRole("dialog", { name: /daily check-in/i })).toBeInTheDocument();
  });

  it("lists concerns with a remove control and an add row", () => {
    const { removeConcern } = setup();
    expect(screen.getByText("Leash reactivity")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /remove leash reactivity/i }));
    expect(removeConcern.mutate).toHaveBeenCalledWith("c1");
    expect(screen.getByPlaceholderText(/concern/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/dogs/dog-card-body.test.tsx`
Expected: FAIL (no dialog, no remove control / add row; Log moment is currently a link).

- [ ] **Step 3: Rewrite `apps/web/src/components/dogs/dog-card-body.tsx`**

```tsx
import { DailyCheckInComposer } from "@/components/journal/daily-check-in-composer";
import { QuickMomentComposer } from "@/components/journal/quick-moment-composer";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n";
import { type DogOverview, useAddConcern, useDog, useRemoveConcern } from "@/lib/dogs";
import { useJournal } from "@/lib/journal";
import { useProgress } from "@/lib/progress";
import { timeAgo } from "@/lib/time-ago";
import { humanTime } from "@/lib/when";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

type Sev = "mild" | "moderate" | "severe";

export function DogCardBody({ dog }: { dog: DogOverview }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const { summary } = dog;
  const { data: goals } = useProgress(dog.id);
  const { data: entries } = useJournal(dog.id);
  const { data: detail } = useDog(dog.id);
  const addConcern = useAddConcern(dog.id);
  const removeConcern = useRemoveConcern(dog.id);
  const recent = (entries ?? []).slice(0, 2);
  const concerns = detail?.concerns ?? [];

  const [sheet, setSheet] = useState<"moment" | "daily_checkin" | null>(null);
  const [concern, setConcern] = useState("");
  const [severity, setSeverity] = useState<Sev>("mild");

  const closeSheet = () => {
    setSheet(null);
    qc.invalidateQueries({ queryKey: ["dogs-overview"] });
  };
  const dogList = [{ id: dog.id, name: dog.name }];

  return (
    <div className="space-y-4 border-t border-silver bg-cream/40 p-4">
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

      <section>
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-soft">
          <span>{t("dogs.cardTraining")}</span>
          <Link to={`/my/dogs/${dog.id}/training`} className="font-bold text-copper">{t("dogs.openTraining")}</Link>
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

      <section>
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-soft">
          <span>{t("dogs.cardRecent")}</span>
          <Link to={`/my/dogs/${dog.id}/journal`} className="font-bold text-copper">{t("dogs.journalLink")}</Link>
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

      <section>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-soft">{t("dogs.concernsTitle")}</div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {concerns.map((cn) => (
            <span key={cn.id} className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              {cn.concern}
              <button type="button" aria-label={t("dogs.removeConcern", { name: cn.concern })} onClick={() => removeConcern.mutate(cn.id)} className="text-red-500 hover:text-red-800">✕</button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="flex-1 rounded border border-silver bg-white px-2 py-1.5 text-sm" placeholder={t("dogs.concernPlaceholder")} value={concern} onChange={(e) => setConcern(e.target.value)} />
          <select className="rounded border border-silver bg-white px-2 text-sm" value={severity} onChange={(e) => setSeverity(e.target.value as Sev)}>
            <option value="mild">{t("dogs.severityMild")}</option>
            <option value="moderate">{t("dogs.severityModerate")}</option>
            <option value="severe">{t("dogs.severitySevere")}</option>
          </select>
          <button type="button" disabled={!concern.trim()} className="rounded-lg border border-silver bg-white px-3 py-1.5 text-sm font-bold text-slate disabled:opacity-50" onClick={async () => { await addConcern.mutateAsync({ concern, severity }); setConcern(""); }}>
            {t("dogs.addConcern")}
          </button>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setSheet("moment")} className="rounded-lg bg-slate px-3 py-2 text-sm font-bold text-cream">＋ {t("journal.logMoment")}</button>
        <button type="button" onClick={() => setSheet("daily_checkin")} className="rounded-lg border border-silver bg-white px-3 py-2 text-sm font-bold text-slate">📋 {t("journal.dailyCheckIn")}</button>
        <Link to={`/my/dogs/${dog.id}/brief`} className="rounded-lg border border-silver bg-white px-3 py-2 text-sm font-bold text-slate">{t("dogs.actBrief")}</Link>
        <Link to={`/my/dogs/${dog.id}/week`} className="rounded-lg border border-silver bg-white px-3 py-2 text-sm font-bold text-slate">{t("dogs.actWeek")}</Link>
        <Link to={`/my/dogs/${dog.id}/edit`} className="rounded-lg border border-silver bg-white px-3 py-2 text-sm font-bold text-slate">{t("dogs.actEdit")}</Link>
      </div>

      <Sheet open={sheet === "moment"} title={t("journal.logMoment")} closeLabel={t("journal.closeSheet")} onClose={closeSheet}>
        <QuickMomentComposer dogs={dogList} selectedDogId={dog.id} onDogChange={() => {}} autoFocus onSaved={closeSheet} />
      </Sheet>
      <Sheet open={sheet === "daily_checkin"} title={t("journal.dailyCheckIn")} closeLabel={t("journal.closeSheet")} onClose={closeSheet}>
        <DailyCheckInComposer dogs={dogList} selectedDogId={dog.id} onDogChange={() => {}} autoFocus onSaved={closeSheet} />
      </Sheet>
    </div>
  );
}
```

> NOTE: add a `dogs.removeConcern: "Remove {name}"` i18n key (Step 3b). All other keys exist (`dogs.concernsTitle/concernPlaceholder/severity*/addConcern`, `journal.logMoment/dailyCheckIn/closeSheet`, `dogs.stat*/brief*/card*/openTraining/journalLink/actBrief/actWeek/actEdit`). `useAddConcern`/`useRemoveConcern`/`useDog` already exist in `@/lib/dogs`. The composers + `Sheet` already exist.

- [ ] **Step 3b: Add the one new i18n key** — in `apps/web/src/i18n/en.ts` `dogs:` add `removeConcern: "Remove {name}",`; in `es.ts` `dogs:` add `removeConcern: "Quitar {name}",`.

- [ ] **Step 4: Run tests, expect PASS** + i18n parity + tsc + lint

```bash
pnpm --filter @turingcare/web exec vitest run src/components/dogs/dog-card-body.test.tsx src/i18n/i18n.test.tsx
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check --write apps/web/src/components/dogs/dog-card-body.tsx apps/web/src/components/dogs/dog-card-body.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
```
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dogs/dog-card-body.tsx apps/web/src/components/dogs/dog-card-body.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): dog card in-place capture dialogs + concern management"
```

---

## Task 2: API — adding a goal no longer auto-creates a skill

**Files:**
- Modify: `apps/api/src/routes/dogs.ts` (the `.post("/:id/goals", …)` handler)
- Test: `apps/api/src/routes/dogs.test.ts` (the "adds and removes a goal" case)

- [ ] **Step 1: Update the failing test** — in `apps/api/src/routes/dogs.test.ts`, find the `it("adds and removes a goal", …)` test. It currently asserts a default skill is created (`skill.name === "Calm greetings"`, `progress.goals[0].skills` length 1). Change it to assert **no** skill is created:

```ts
  it("adds a goal with no default skill, then removes it", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const add = await app.request(`/api/dogs/${dog.id}/goals`, {
      method: "POST", headers: u.authHeaders, body: JSON.stringify({ goal: "Calm greetings" }),
    });
    expect(add.status).toBe(201);
    const body = (await add.json()) as { goal: { id: string }; skill?: unknown };
    expect(body.goal).toBeTruthy();
    expect(body.skill).toBeUndefined();
    const progress = await app.request(`/api/dogs/${dog.id}/progress`, { headers: u.authHeaders });
    const progressBody = (await progress.json()) as { goals: Array<{ skills: unknown[] }> };
    expect(progressBody.goals[0]?.skills).toEqual([]);
    const del = await app.request(`/api/dogs/${dog.id}/goals/${body.goal.id}`, {
      method: "DELETE", headers: u.authHeaders,
    });
    expect(del.status).toBe(200);
  });
```
(Keep the rest of the original test's structure if it asserted removal; the key change is no skill + empty skills.)

- [ ] **Step 2: Run it, expect FAIL**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api exec vitest run src/routes/dogs.test.ts -t "adds a goal"
```
Expected: FAIL (a skill is still created → `skill` present, skills length 1).

- [ ] **Step 3: Remove the auto-skill insert** — in `apps/api/src/routes/dogs.ts`, the `.post("/:id/goals", …)` handler currently inserts the goal AND a default skill. Delete the skill insert so it returns just the goal:

```ts
  .post("/:id/goals", zValidator("json", trainingGoalSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const body = c.req.valid("json");
    const [goal] = await db
      .insert(trainingGoals)
      .values({ ...body, dogId: dog.id })
      .returning();
    if (!goal) throw new Error("failed to create training goal");
    await recordEvent("training.goal_added", {
      userId: c.get("userId"),
      props: { source: "custom" },
    });
    return c.json({ goal }, 201);
  })
```
(The `from-template` route is unchanged — it still creates the template's skills. `trainingSkills` may become unused in this file's imports only if nothing else uses it — leave the import; the `from-template` handler still uses `trainingSkills`.)

- [ ] **Step 4: Run it, expect PASS** + the whole dogs suite + tsc

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api exec vitest run src/routes/dogs.test.ts
pnpm --filter @turingcare/api exec tsc --noEmit
```
Expected: all pass / clean.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts
git add apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts
git commit -m "feat(api): adding a goal no longer auto-creates a skill"
```

---

## Task 3: Brief — remove the repeated heading/first line

**Files:**
- Modify: `apps/web/src/routes/brief.tsx` (drop the page `<h1>`)
- Modify: `apps/api/src/lib/brief.ts` (drop the redundant summary first line)
- Test: `apps/api/src/lib/brief.test.ts` (assert the first line is gone)

- [ ] **Step 1: Update the brief lib test** — in `apps/api/src/lib/brief.test.ts`, add an assertion to the existing `composeBrief` test that the redundant first line is absent:

```ts
    expect(out).not.toMatch(/^Behavior Brief — /m);
```
(Add it alongside the existing `expect(out).toContain("Biscuit")` assertions — "Biscuit" still appears in the description line, so those stay green.)

- [ ] **Step 2: Run it, expect FAIL**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api exec vitest run src/lib/brief.test.ts
```
Expected: FAIL (the `Behavior Brief — {name}` line is still emitted).

- [ ] **Step 3: Drop the redundant line in `composeBrief`** — in `apps/api/src/lib/brief.ts`, delete this line (currently the first `lines.push`):

```ts
  lines.push(`Behavior Brief — ${dog.name}`);
```
Keep the following `lines.push(\`${dog.name} is a ${dog.size}…\`)` description line.

- [ ] **Step 4: Remove the page heading in `apps/web/src/routes/brief.tsx`** — delete the line:

```tsx
      <h1 className="text-2xl font-bold text-slate">{t("brief.title")}</h1>
```
(The branded document card header + the tab already identify the brief. `t("brief.title")` may become unused in this file — Biome will flag the import only if truly unused; it isn't removed elsewhere.)

- [ ] **Step 5: Run + verify**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api exec vitest run src/lib/brief.test.ts
pnpm --filter @turingcare/api exec tsc --noEmit
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm --filter @turingcare/web exec vitest run src/routes/brief.test.tsx
```
Expected: all pass / clean. (If a web brief test asserted the page `<h1>` text, update it to assert the document card instead.)

- [ ] **Step 6: Commit**

```bash
pnpm exec biome check --write apps/web/src/routes/brief.tsx apps/api/src/lib/brief.ts
git add apps/web/src/routes/brief.tsx apps/api/src/lib/brief.ts apps/api/src/lib/brief.test.ts
git commit -m "feat: de-duplicate the Behavior Brief heading"
```

---

## Task 4: Training tab — one clean goal→skills hierarchy

Remove the duplicate top goals list; move Add goal / Templates into a toolbar; give each goal card a Remove; drop the "Training progress / Confidence 1‑5" header.

**Files:**
- Modify: `apps/web/src/routes/dog-training.tsx`
- Modify: `apps/web/src/components/progress/progress-panel.tsx`
- Test: `apps/web/src/components/progress/progress-panel.test.tsx` (extend), `apps/web/src/routes/dog-training.test.tsx` (create if absent)

- [ ] **Step 1: Extend `progress-panel.test.tsx`** — add a case asserting the goal card has a Remove control and the "Confidence: 1-5" header is gone. Append inside the existing `describe`:

```tsx
  it("each goal card has a Remove control and no Confidence header", () => {
    setup();
    expect(screen.queryByText(/Confidence: 1-5/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove goal/i })).toBeInTheDocument();
  });
```
(The existing `setup()` mocks `useProgress` with one goal "Basic Manners". Also mock `useRemoveGoal` — add `vi.mock("@/lib/dogs", …)` returning `{ useRemoveGoal: vi.fn(() => ({ mutate: vi.fn() })) }` if not already mocked.)

- [ ] **Step 2: Run it, expect FAIL.**
Run: `pnpm --filter @turingcare/web exec vitest run src/components/progress/progress-panel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Edit `progress-panel.tsx`**

(a) Remove the panel's header block:
```tsx
      <div>
        <h2 className="font-semibold text-slate">{t("progress.title")}</h2>
        <p className="text-sm text-slate-soft">{t("progress.confidence")}: 1-5</p>
      </div>
```
…and drop the surrounding `<section className="space-y-3 rounded border border-silver p-4">` wrapper — render the goal sections directly in a `<div className="space-y-3">`.

(b) Add `useRemoveGoal` to the `@/lib/dogs` import and give `GoalSection` a Remove button:
```tsx
import { useRemoveGoal } from "@/lib/dogs";
```
In `GoalSection`, add the hook and a Remove button next to the avg badge:
```tsx
function GoalSection({ dogId, goal }: { dogId: string; goal: ProgressGoal }) {
  const { t } = useI18n();
  const removeGoal = useRemoveGoal(dogId);
  return (
    <article className="space-y-3 rounded-xl border border-silver bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate">{goal.goal}</h3>
          {goal.avgConfidence != null && (
            <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-semibold text-slate-soft">
              {t("progress.avgConfidence")} {goal.avgConfidence.toFixed(1)}/5
            </span>
          )}
        </div>
        <Button variant="outline" aria-label={t("progress.removeGoal", { name: goal.goal })} onClick={() => removeGoal.mutate(goal.id)}>
          {t("dogs.remove")}
        </Button>
      </div>
      {goal.skills.length === 0 ? (
        <p className="text-sm text-slate-soft">{t("progress.noSkillsYet")}</p>
      ) : (
        <ul className="space-y-2">
          {goal.skills.map((skill) => (
            <SkillCard key={skill.id} dogId={dogId} skill={skill} />
          ))}
        </ul>
      )}
      <AddSkillForm dogId={dogId} goalId={goal.id} />
    </article>
  );
}
```
Add i18n keys: `progress.removeGoal: "Remove {name}"` and `progress.noSkillsYet: "No skills yet — add one below."` to en.ts + es.ts (es: `"Quitar {name}"`, `"Sin habilidades aún — agrega una abajo."`). `dogs.remove` already exists.

(c) The empty-state (`goals.length === 0`) keeps `t("progress.empty")` but render it in the new `<div>` wrapper.

- [ ] **Step 4: Create `dog-training.test.tsx`** and rewrite `dog-training.tsx`.

Test `apps/web/src/routes/dog-training.test.tsx`:
```tsx
import { LocaleProvider } from "@/i18n";
import * as dogsLib from "@/lib/dogs";
import * as progressLib from "@/lib/progress";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DogTraining } from "./dog-training";

vi.mock("@/lib/dogs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dogs")>("@/lib/dogs");
  return { ...actual, useDog: vi.fn(), useAddGoal: vi.fn(), useRemoveGoal: vi.fn() };
});
vi.mock("@/lib/progress", () => ({ useProgress: vi.fn(), useAddSkill: vi.fn(), useDeleteSkill: vi.fn(), useDeleteSession: vi.fn(), useUpdateSkill: vi.fn(), useSetSkillLevel: vi.fn(), LEVEL_KEYS: ["progress.level1","progress.level2","progress.level3","progress.level4","progress.level5"] }));
vi.mock("@/lib/training-catalog", async () => {
  const actual = await vi.importActual<typeof import("@/lib/training-catalog")>("@/lib/training-catalog");
  return { ...actual, useTrainingCatalog: vi.fn(() => ({ data: [] })) };
});

function setup() {
  vi.mocked(dogsLib.useDog).mockReturnValue({ data: { dog: { id: "d1" }, concerns: [], goals: [] } } as unknown as ReturnType<typeof dogsLib.useDog>);
  vi.mocked(dogsLib.useAddGoal).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof dogsLib.useAddGoal>);
  vi.mocked(dogsLib.useRemoveGoal).mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof dogsLib.useRemoveGoal>);
  vi.mocked(progressLib.useProgress).mockReturnValue({ data: [], isLoading: false, isError: false } as unknown as ReturnType<typeof progressLib.useProgress>);
  for (const h of ["useAddSkill","useDeleteSkill","useDeleteSession","useUpdateSkill","useSetSkillLevel"] as const) {
    vi.mocked(progressLib[h]).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, data: undefined } as never);
  }
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/my/dogs/d1/training"]}>
          <Routes><Route path="/my/dogs/:id/training" element={<DogTraining />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("DogTraining", () => {
  it("shows a toolbar (Add goal + Templates) and no duplicate goals list", () => {
    setup();
    expect(screen.getByRole("button", { name: /add goal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /templates/i })).toBeInTheDocument();
  });
});
```

Rewrite `apps/web/src/routes/dog-training.tsx`:
```tsx
import { ProgressPanel } from "@/components/progress/progress-panel";
import { TemplatePicker } from "@/components/training/template-picker";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useAddGoal } from "@/lib/dogs";
import { useState } from "react";
import { useParams } from "react-router-dom";

const inputCls = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function DogTraining() {
  const { t } = useI18n();
  const { id = "" } = useParams();
  const addGoal = useAddGoal(id);
  const [adding, setAdding] = useState(false);
  const [goal, setGoal] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate">{t("progress.goalsAndSkills")}</h2>
        <div className="flex gap-2">
          <TemplatePicker dogId={id} />
          <Button onClick={() => setAdding((v) => !v)} className="bg-slate text-cream">
            ＋ {t("dogs.addGoal")}
          </Button>
        </div>
      </div>

      {adding && (
        <div className="flex flex-wrap items-start gap-2 rounded-xl border border-silver bg-cream p-3">
          <input
            // biome-ignore lint/a11y/noAutofocus: focus the new-goal field when opened
            autoFocus
            className={inputCls}
            placeholder={t("dogs.goalPlaceholder")}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <Button
            disabled={!goal.trim() || addGoal.isPending}
            onClick={async () => {
              await addGoal.mutateAsync({ goal });
              setGoal("");
              setAdding(false);
            }}
          >
            {t("dogs.addGoal")}
          </Button>
          <Button variant="outline" onClick={() => { setGoal(""); setAdding(false); }}>
            {t("dogs.cancel")}
          </Button>
        </div>
      )}

      <ProgressPanel dogId={id} />
    </div>
  );
}
```
Add i18n keys `progress.goalsAndSkills: "Goals & skills"` (es: `"Objetivos y habilidades"`). `dogs.addGoal`, `dogs.goalPlaceholder`, `dogs.cancel` already exist; `TemplatePicker` already renders a "Templates" button.

- [ ] **Step 5: Run the training tests + parity + tsc + lint**

```bash
pnpm --filter @turingcare/web exec vitest run src/components/progress src/routes/dog-training.test.tsx src/i18n/i18n.test.tsx
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check --write apps/web/src/routes/dog-training.tsx apps/web/src/components/progress/progress-panel.tsx apps/web/src/routes/dog-training.test.tsx apps/web/src/components/progress/progress-panel.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
```
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/dog-training.tsx apps/web/src/components/progress/progress-panel.tsx apps/web/src/routes/dog-training.test.tsx apps/web/src/components/progress/progress-panel.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): de-bloat Training tab (single goal→skills hierarchy)"
```

---

## Task 5: Hub shell — drop the Overview tab + fix the "All dogs" nav

Done LAST (the card now owns concerns + capture). Removes the Overview tab and the `DogHub` route.

**Files:**
- Modify: `apps/web/src/components/dog-layout.tsx`
- Modify: `apps/web/src/main.tsx`
- Delete: `apps/web/src/routes/dog-hub.tsx` (+ `apps/web/src/routes/dog-hub.test.tsx` if it exists)
- Test: `apps/web/src/components/dog-layout.test.tsx` (extend if present, else create)

- [ ] **Step 1: Write/extend `dog-layout.test.tsx`**

```tsx
import { LocaleProvider } from "@/i18n";
import * as dogsLib from "@/lib/dogs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DogLayout } from "./dog-layout";

vi.mock("@/lib/dogs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dogs")>("@/lib/dogs");
  return { ...actual, useDog: vi.fn(), useDeleteDog: vi.fn() };
});

function setup() {
  vi.mocked(dogsLib.useDog).mockReturnValue({ data: { dog: { id: "d1", name: "Turing", size: "medium", sex: "male", breed: "Aussie" }, concerns: [], goals: [] }, isLoading: false, isError: false } as unknown as ReturnType<typeof dogsLib.useDog>);
  vi.mocked(dogsLib.useDeleteDog).mockReturnValue({ mutateAsync: vi.fn() } as unknown as ReturnType<typeof dogsLib.useDeleteDog>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/my/dogs/d1/journal"]}>
          <Routes><Route path="/my/dogs/:id" element={<DogLayout />}><Route path="journal" element={<div>journal</div>} /></Route></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("DogLayout", () => {
  it("has no Overview tab and links 'All dogs' to /my/dogs", () => {
    setup();
    expect(screen.queryByRole("link", { name: /overview/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /journal/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /all dogs/i })).toHaveAttribute("href", "/my/dogs");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.**
Run: `pnpm --filter @turingcare/web exec vitest run src/components/dog-layout.test.tsx`
Expected: FAIL (Overview tab present; All dogs → /my).

- [ ] **Step 3: Edit `dog-layout.tsx`**
- Remove the first `tabs` entry (the Overview one): the array becomes
```tsx
  const tabs = [
    { to: `/my/dogs/${dog.id}/journal`, label: t("dogHub.tabJournal"), end: false },
    { to: `/my/dogs/${dog.id}/training`, label: t("dogHub.tabTraining"), end: false },
    { to: `/my/dogs/${dog.id}/brief`, label: t("dogHub.tabBrief"), end: false },
    { to: `/my/dogs/${dog.id}/week`, label: t("dogHub.tabWeek"), end: false },
  ];
```
- Change BOTH `<Link to="/my">` (the error-state one and the sticky-header "← All dogs" one) to `to="/my/dogs"`.
- Change the delete `navigate("/my")` to `navigate("/my/dogs")`.
- Change the nav's `aria-label={t("dogHub.tabOverview")}` to `aria-label={t("dogHub.backToDashboard")}` (it labelled the tablist "Overview", which is gone).

- [ ] **Step 4: Edit `apps/web/src/main.tsx`**
- Remove `import { DogHub } from "@/routes/dog-hub";`.
- Add `Navigate` to the `react-router-dom` import (`import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";`).
- Replace the index child route:
```tsx
                <Route index element={<Navigate to="journal" replace />} />
```

- [ ] **Step 5: Delete the Overview component** (only after confirming it's unreferenced)
```bash
grep -rn "dog-hub\|DogHub\|SpokeCard\|RecentActivity" apps/web/src
```
If the only remaining references are the dog-hub files themselves (no other importers): `git rm apps/web/src/routes/dog-hub.tsx` and its test if present. If `SpokeCard`/`RecentActivity` (under `components/dog-hub/`) are now unused, `git rm` them too; if anything still imports them, leave them.

- [ ] **Step 6: Run + verify**
```bash
pnpm --filter @turingcare/web exec vitest run src/components/dog-layout.test.tsx
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check --write apps/web/src/components/dog-layout.tsx apps/web/src/main.tsx apps/web/src/components/dog-layout.test.tsx
```
Expected: PASS / clean (tsc proves nothing still imports the deleted `DogHub`).

- [ ] **Step 7: Commit**
```bash
git add -A apps/web/src
git commit -m "feat(web): drop Overview tab; land on Journal; fix All-dogs nav"
```

---

## Task 6: Full verification

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
Expected: all green. (Docker flake → restart Postgres, re-run api suite.)

- [ ] **Step 2: react-doctor** — `cd apps/web && npx react-doctor@latest --scope changed 2>&1 | tail -20 ; cd ../..`. Fix real cheap issues; leave SPA false-positives.

- [ ] **Step 3: Manual smoke (document)** — `pnpm dev`: visit a dog → lands on **Journal** (no Overview tab); tabs Journal/Training/Brief/This Week; "← All dogs" → `/my/dogs`. Training shows one goal card per goal (Remove + skills once, no "Confidence 1-5"); adding a goal → empty goal + Add skill (no auto-skill). Brief has no page heading + no "Behavior Brief — Turing" first line. On `/my/dogs`, expand a card → **Log moment** + **Daily check-in** open dialogs in place (save closes + glance updates); concern chips have ✕ remove + an add row. Note anything off; fix.

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "chore: verify per-dog hub redesign green"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** drop Overview tab + land on Journal (T5) ✓; cohesive tab strip / All-dogs → /my/dogs (T5) ✓; Training de-bloat (single hierarchy, Remove on goal card, no Confidence header) (T4) ✓; stop auto goal-named skill (T2) ✓; Brief de-dup (page h1 + first line) (T3) ✓; card Log moment + Daily check-in dialogs in place (T1) ✓; concern add/remove on card (T1) ✓; sequencing card-first / Overview-last (task order) ✓; i18n parity (T1/T4 add keys) ✓; tests across api/web (every task) ✓. Brief styled-section blocks = explicitly out of scope per spec.

**Placeholder scan:** none — concrete code/commands throughout. "Keep the rest of the original test's structure" (T2 step 1) and "if a web brief test asserted the page h1, update it" (T3) are conditional real instructions, not gaps.

**Type consistency:** card `onSaved`/`closeSheet` flows; composers' `{dogs, selectedDogId, onDogChange, onSaved, autoFocus}` props match their existing signatures; `useAddConcern({concern, severity})` / `useRemoveConcern(id)` match `@/lib/dogs`; `POST /goals` returns `{ goal }` (no skill) consumed by `useAddGoal` (already returns `.goal`); new i18n keys (`dogs.removeConcern`, `progress.removeGoal/noSkillsYet/goalsAndSkills`) added in both en+es.

**Scope:** one cohesive redesign; sequenced into 6 tasks; no decomposition needed.
