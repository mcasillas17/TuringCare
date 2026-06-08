# Dog-hub redesign (hub + spokes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the dog experience as a thin **overview** (`/my/dogs/:id`) with three focused spokes (`/journal`, `/training`, `/brief`) wrapped by a shared `<DogLayout>` (sticky banner + tab strip), and collapse per-skill density inside the training spoke.

**Architecture:** New `<DogLayout>` outlet renders the banner + tab strip + `<Outlet />` for any of the four child routes. The hub is a presentational page showing at-a-glance metrics (via existing `useDogs`/`useJournal`/`useProgress`/`useBrief` hooks), concerns, recent activity, and a single primary CTA. The training spoke mounts the existing `<ProgressPanel>` (refactored internally so each `<SkillCard>` is collapsed by default and expand-on-click). The journal spoke reuses a `<JournalView>` extracted from today's `/my/journal` route. No DB, no API, no Hono changes.

**Tech Stack:** Vite/React 19, react-router-dom v7, Tailwind v4, TanStack Query, typed i18n (existing `t("key", { var: val })`), Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-05-31-dog-hub-redesign-design.md`

---

## File Structure

- **Existing files modified:**
  - `apps/web/src/main.tsx` — replace the dog routes block with the new layout-based config; add `/my/dogs` redirect.
  - `apps/web/src/components/progress/progress-panel.tsx` — refactor `<SkillCard>` to collapsed/expanded states.
  - `apps/web/src/routes/journal.tsx` — extract its body into `<JournalView>`; the route becomes a thin wrapper around it.
  - `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts` — add `dogHub` section, remove keys that no longer have a render site.

- **New files:**
  - `apps/web/src/components/dog-layout.tsx` — sticky banner + tab strip + `<Outlet />`. Includes the kebab/Delete and Edit affordances.
  - `apps/web/src/components/dog-hub/spoke-card.tsx` — small clickable card (icon, title, primary metric, optional secondary line).
  - `apps/web/src/components/dog-hub/recent-activity.tsx` — read-only list of top-3 journal entries with a "See all in Journal →" link.
  - `apps/web/src/components/journal/journal-view.tsx` — extracted shared journal UI (composers + entry list), takes `dogId?: string` and `composeMode?: "moment" | "daily_checkin"` props.
  - `apps/web/src/routes/dog-hub.tsx` — renamed/rewritten from `dog-detail.tsx`. Renders three spoke cards + concerns + recent activity + Log-a-moment CTA.
  - `apps/web/src/routes/dog-journal.tsx` — thin route wrapper: reads `:id` + `?compose=`, mounts `<JournalView dogId={id} composeMode={...} />`.
  - `apps/web/src/routes/dog-training.tsx` — thin route wrapper: renders goal-add row + `<TemplatePicker>` + `<ProgressPanel dogId={id} />`.

- **Existing file removed:**
  - `apps/web/src/routes/dog-detail.tsx` — replaced by `dog-hub.tsx` (the rename); the route is rewired in `main.tsx`.
  - `apps/web/src/routes/dogs-list.tsx` — no longer rendered (the `/my/dogs` route becomes a `<Navigate>`). The file stays in the repo for now so its tests + behaviour don't disappear silently; Task 7's main.tsx change is what makes it unreachable. We delete the file in Task 8's cleanup.

---

## Task 1: SkillCard collapsed/expanded refactor

**Files:**
- Modify: `apps/web/src/components/progress/progress-panel.tsx`
- Test: existing `apps/web/src/components/progress/progress-panel.test.tsx` (modify if it exists; otherwise create assertions in this PR's new tests)

The current `<SkillCard>` (~line 134-209 of `progress-panel.tsx`) renders every data point + the action buttons + edit/log forms inline. Refactor so the "expanded" content (last-note, action buttons, sessions list, edit form, log form) is hidden behind a chevron.

- [ ] **Step 1: Read the current `<SkillCard>`**

Read `apps/web/src/components/progress/progress-panel.tsx` lines 134-209 to remind yourself of the current structure. The collapsed state should always show: chevron + skill name + confidence chip + catalog description + level milestone + session count + last-session date. Everything else (action buttons, edit form, log form, sessions list) is conditional.

- [ ] **Step 2: Write the failing test additions**

In `apps/web/src/components/progress/progress-panel.test.tsx` (if a test file doesn't exist yet for this component, create one — see existing component tests like `apps/web/src/components/onboarding/checklist.test.tsx` for the QueryClient + LocaleProvider + MemoryRouter setup). Add tests inside an existing or new `describe("SkillCard collapse/expand", ...)` block:

```tsx
it("renders the skill name + confidence + level milestone always, action buttons hidden by default", () => {
  // Render ProgressPanel with one goal/skill stub. The exact stub shape and
  // mocking pattern follow the existing tests in this file.
  // Use the existing `useProgress` mock; pass one skill with name "Sit", confidence 3,
  // catalogSkillKey "basic-manners.sit", session count 2.
  // ...
  expect(screen.getByText("Sit")).toBeInTheDocument();
  expect(screen.getByText(/Level 3/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Log session/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
});

it("clicking the chevron expands the row to show action buttons + sessions", () => {
  // ...same setup
  fireEvent.click(screen.getByRole("button", { name: /Expand Sit/i }));
  expect(screen.getByRole("button", { name: /Log session/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Edit$/i })).toBeInTheDocument();
});

it("expanding one skill does not collapse another expanded skill", () => {
  // Render two skills. Expand both. Assert both expansion-only elements are visible.
});
```

NOTE: existing tests in `progress-panel.test.tsx` may now also assert presence of "Log session" / "Edit" buttons in the collapsed default — those assertions will need to be updated to either (a) expand the row first, or (b) assert their absence in the collapsed state. As you fix existing tests, mirror the pattern: any test that interacts with buttons on a skill must first click the chevron to expand that skill.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @turingcare/web test -- progress-panel`
Expected: FAIL — the new tests' "should be hidden" assertions fail (everything is visible today); existing tests may now also fail because they assume the action buttons are always visible.

- [ ] **Step 4: Refactor `<SkillCard>`**

Replace the entire `<SkillCard>` function body in `apps/web/src/components/progress/progress-panel.tsx`. Two key changes:
1. Add an `expanded` state local to the card.
2. Move the action button row + edit form + log form + sessions list into a block that renders only when `expanded === true`.

The new component (replace lines 134-209 verbatim):

```tsx
function SkillCard({ dogId, skill }: { dogId: string; skill: ProgressSkill }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"view" | "editing" | "logging">("view");
  const updateSkill = useUpdateSkill(dogId);
  const deleteSkill = useDeleteSkill(dogId);
  const displaySkill = (updateSkill.data as ProgressSkill | undefined) ?? skill;
  const lastSession = formatDate(displaySkill.lastSessionAt);
  const { data: catalog } = useTrainingCatalog();
  const catalogSkill = findCatalogSkill(catalog, displaySkill.catalogSkillKey);
  const currentLevel =
    catalogSkill?.levels.find((l) => l.level === displaySkill.confidence) ?? null;

  return (
    <li className="space-y-3 rounded border border-silver p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-1 items-start gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? t("progress.collapseSkill", { name: displaySkill.name })
                : t("progress.expandSkill", { name: displaySkill.name })
            }
            className="mt-0.5 text-slate-soft hover:text-slate"
          >
            {expanded ? "▼" : "▶"}
          </button>
          <div className="flex-1">
            <div className="font-medium text-slate">{displaySkill.name}</div>
            {catalogSkill && (
              <div className="text-xs text-slate-soft">{catalogSkill.description}</div>
            )}
            <div className="text-sm text-slate-soft">
              {sessionCountLabel(displaySkill, t)}
              {lastSession ? ` · ${t("progress.lastSession")}: ${lastSession}` : ""}
            </div>
            {currentLevel && (
              <p className="mt-1 text-xs italic text-copper">
                {t("training.levelPrefix")} {currentLevel.level} — {currentLevel.description}
              </p>
            )}
          </div>
        </div>
        <ConfidenceChip
          dogId={dogId}
          skillId={displaySkill.id}
          confidence={displaySkill.confidence}
        />
      </div>

      {expanded && (
        <>
          {displaySkill.lastNote && (
            <p className="text-sm text-slate-soft">{displaySkill.lastNote}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setMode("logging")}>
              {t("progress.logSession")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setMode("editing")}>
              {t("progress.edit")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => deleteSkill.mutate(displaySkill.id)}
            >
              {t("progress.removeSkill")}
            </Button>
          </div>

          {mode === "editing" && (
            <EditSkillForm
              dogId={dogId}
              skill={displaySkill}
              submitting={updateSkill.isPending}
              onCancel={() => setMode("view")}
              onSave={async (body) => {
                await updateSkill.mutateAsync({ skillId: displaySkill.id, body });
                setMode("view");
              }}
            />
          )}
          {mode === "logging" && (
            <SessionForm
              dogId={dogId}
              skillId={displaySkill.id}
              onCancel={() => setMode("view")}
              onSaved={() => setMode("view")}
            />
          )}
          <SessionList dogId={dogId} skill={displaySkill} />
        </>
      )}
    </li>
  );
}
```

Add imports at the top of the file if not already present:
```ts
import { findCatalogSkill, useTrainingCatalog } from "@/lib/training-catalog";
```
(One or both may already exist from PR #39 — verify and don't duplicate.)

- [ ] **Step 5: Add the i18n keys for expand/collapse**

In `apps/web/src/i18n/en.ts`, find the existing `progress: { ... }` section and add:

```ts
    expandSkill: "Expand {name}",
    collapseSkill: "Collapse {name}",
```

In `apps/web/src/i18n/es.ts`, in the same position:

```ts
    expandSkill: "Mostrar {name}",
    collapseSkill: "Ocultar {name}",
```

(Both Spanish values differ from English — i18n parity test passes.)

- [ ] **Step 6: Update any existing progress-panel tests that touched action buttons**

Any test that previously asserted on or clicked "Log session", "Edit", or "Remove skill" buttons now needs to first click the chevron to expand the row. Find each such test and prepend:

```ts
fireEvent.click(screen.getByRole("button", { name: /Expand <SkillName>/i }));
```

before the existing assertion/interaction. If a test doesn't exist for these flows, the new tests in Step 2 cover them.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @turingcare/web test -- progress-panel`
Expected: PASS — all collapse/expand tests + any existing tests pass.

Run: `pnpm --filter @turingcare/web test -- i18n`
Expected: PASS (parity).

- [ ] **Step 8: tsc + lint**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/web/src/components/progress/progress-panel.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts` (expect clean).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/progress/progress-panel.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts apps/web/src/components/progress/progress-panel.test.tsx
git commit -m "feat(web): collapse per-skill detail in SkillCard"
```

---

## Task 2: Extract `<JournalView>` from `/my/journal`

**Files:**
- Modify: `apps/web/src/routes/journal.tsx`
- Create: `apps/web/src/components/journal/journal-view.tsx`
- Test: existing journal tests should still pass; if there are tests for the route, they'll naturally cover the view too.

Goal: pure refactor. The cross-pet `/my/journal` keeps working identically. The new shared `<JournalView>` component is what `/my/dogs/:id/journal` will mount in a later task.

- [ ] **Step 1: Create `<JournalView>`**

Create `apps/web/src/components/journal/journal-view.tsx`. Move the body of the existing `Journal` component into it (everything inside `export function Journal()`). The component accepts these props:

```ts
type JournalViewProps = {
  scopedDogId?: string;     // when set, no dog-filter UI is rendered; entries filter to this dog
  composeMode?: "moment" | "daily_checkin"; // optional initial composer mode
};
```

The full component body:

```tsx
import { DailyCheckInComposer } from "@/components/journal/daily-check-in-composer";
import { EntryCard } from "@/components/journal/entry-card";
import { PostSaveFollowUps } from "@/components/journal/post-save-follow-ups";
import { QuickMomentComposer } from "@/components/journal/quick-moment-composer";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDogs } from "@/lib/dogs";
import { type JournalEntry, useJournal } from "@/lib/journal";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

type Mode = "moment" | "daily_checkin";

type JournalViewProps = {
  scopedDogId?: string;
  composeMode?: Mode;
};

function normalizeEntry(entry: JournalEntry): JournalEntry {
  return {
    ...entry,
    occurredAt: String(entry.occurredAt),
    trend: entry.trend ?? null,
    antecedent: entry.antecedent ?? null,
    behavior: entry.behavior ?? null,
    consequence: entry.consequence ?? null,
    intensity: entry.intensity ?? null,
    location: entry.location ?? null,
    notes: entry.notes ?? null,
    durationSeconds: entry.durationSeconds ?? null,
    recoverySeconds: entry.recoverySeconds ?? null,
    peoplePresent: entry.peoplePresent ?? null,
    ownerResponse: entry.ownerResponse ?? null,
  };
}

export function JournalView({ scopedDogId, composeMode = "moment" }: JournalViewProps) {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  // When scopedDogId is set, the filter is the scoped id; otherwise it's the URL param.
  const filterDogId = scopedDogId ?? searchParams.get("dogId") ?? "";
  const { data: dogs } = useDogs();
  const dogList = useMemo(() => dogs ?? [], [dogs]);
  const { data: entries, isError } = useJournal(filterDogId || undefined);
  const [selectedDogId, setSelectedDogId] = useState(filterDogId);
  const [mode, setMode] = useState<Mode>(composeMode);
  const [followUpEntry, setFollowUpEntry] = useState<JournalEntry | null>(null);

  const dogNameById = useMemo(
    () => new Map(dogList.map((dog) => [dog.id, dog.name] as const)),
    [dogList],
  );

  useEffect(() => {
    setSelectedDogId((currentDogId) => {
      if (filterDogId) return filterDogId;
      const onlyDog = dogList[0];
      if (!currentDogId && dogList.length === 1 && onlyDog) return onlyDog.id;
      return currentDogId;
    });
  }, [dogList, filterDogId]);

  const withDogSummary = (entry: JournalEntry): JournalEntry => ({
    ...entry,
    dog: entry.dog ?? { id: entry.dogId, name: dogNameById.get(entry.dogId) ?? "" },
  });

  const updateFilter = (dogId: string) => {
    const next = new URLSearchParams(searchParams);
    if (dogId) next.set("dogId", dogId);
    else next.delete("dogId");
    setSearchParams(next);
    setFollowUpEntry(null);
  };

  if (dogs && dogs.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-slate-soft">{t("journal.noDogs")}</p>
        <Button asChild className="bg-slate text-cream">
          <Link to="/my/dogs/new">{t("journal.addDog")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!scopedDogId && (
        <label className="block" htmlFor="journal-filter-dog">
          <span className="text-sm font-medium text-slate">{t("journal.pickDog")}</span>
          <select
            id="journal-filter-dog"
            className={input}
            value={filterDogId}
            onChange={(event) => updateFilter(event.target.value)}
          >
            <option value="">{t("journal.filterAllDogs")}</option>
            {dogList.map((dog) => (
              <option key={dog.id} value={dog.id}>
                {dog.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={mode === "moment" ? "default" : "outline"}
          onClick={() => setMode("moment")}
        >
          {t("journal.logMoment")}
        </Button>
        <Button
          type="button"
          variant={mode === "daily_checkin" ? "default" : "outline"}
          onClick={() => {
            setMode("daily_checkin");
            setFollowUpEntry(null);
          }}
        >
          {t("journal.dailyCheckIn")}
        </Button>
      </div>

      {mode === "moment" ? (
        <QuickMomentComposer
          dogs={dogList}
          selectedDogId={selectedDogId}
          onDogChange={setSelectedDogId}
          onSaved={(entry) => setFollowUpEntry(withDogSummary(entry))}
        />
      ) : (
        <DailyCheckInComposer
          dogs={dogList}
          selectedDogId={selectedDogId}
          onDogChange={setSelectedDogId}
          onSaved={() => setFollowUpEntry(null)}
        />
      )}

      {followUpEntry && (
        <PostSaveFollowUps
          entry={followUpEntry}
          dogId={followUpEntry.dogId}
          onDone={() => setFollowUpEntry(null)}
        />
      )}

      {isError && <p className="text-red-600">{t("journal.loadError")}</p>}
      {entries?.length === 0 && (
        <section className="space-y-2 rounded border border-silver bg-white p-6 text-center">
          <h2 className="text-lg font-semibold text-slate">{t("journal.emptyTitle")}</h2>
          <p className="text-slate-soft">{t("journal.emptyBody")}</p>
        </section>
      )}
      <ul className="space-y-2">
        {entries?.map((entry) => {
          const normalized = normalizeEntry(entry);
          return <EntryCard key={normalized.id} entry={normalized} dogId={normalized.dogId} />;
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Reduce `journal.tsx` to a wrapper**

Replace the contents of `apps/web/src/routes/journal.tsx` with:

```tsx
import { JournalView } from "@/components/journal/journal-view";
import { useI18n } from "@/i18n";

export function Journal() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-slate">{t("journal.title")}</h1>
      <JournalView />
    </div>
  );
}
```

- [ ] **Step 3: Run all web tests**

Run: `pnpm --filter @turingcare/web test`
Expected: all tests pass — pure refactor with no behaviour change. Existing journal tests should still pass without modification because the component tree's interactive elements are unchanged.

- [ ] **Step 4: tsc + lint**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/web/src/routes/journal.tsx apps/web/src/components/journal/journal-view.tsx` (expect clean).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/journal.tsx apps/web/src/components/journal/journal-view.tsx
git commit -m "refactor(web): extract <JournalView> from /my/journal for reuse"
```

---

## Task 3: `<DogLayout>` component

**Files:**
- Create: `apps/web/src/components/dog-layout.tsx`
- Test: `apps/web/src/components/dog-layout.test.tsx`
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Add the i18n keys**

In `apps/web/src/i18n/en.ts`, immediately after the existing `training: { ... },` section, add:

```ts
  dogHub: {
    backToDashboard: "All dogs",
    tabOverview: "Overview",
    tabJournal: "Journal",
    tabTraining: "Training",
    tabBrief: "Brief",
    notFound: "We couldn't find this dog.",
    deleteConfirm: "Delete this dog? This permanently removes the profile, journal entries, goals, and brief.",
    journalCard: "Journal",
    journalEmpty: "No entries yet — log your first",
    journalMetric: "{n} entries · last {ago}",
    trainingCard: "Training",
    trainingEmpty: "No goals yet — set your first",
    trainingMetric: "{goals} goals · {skills} skills · avg {avg}/5",
    briefCard: "Brief",
    briefEmpty: "No brief yet",
    briefMetric: "{status} v{version} · {ago}",
    recentActivity: "Recent activity",
    recentEmpty: "Nothing logged yet",
    seeAllJournal: "See all in Journal →",
    logAMoment: "+ Log a moment",
    today: "today",
    daysAgo: "{n}d ago",
    weeksAgo: "{n}w ago",
    monthsAgo: "{n}mo ago",
    statusDraft: "Draft",
    statusFinalized: "Final",
  },
```

In `apps/web/src/i18n/es.ts`, in the same position (after `training: { ... },`):

```ts
  dogHub: {
    backToDashboard: "Todos los perros",
    tabOverview: "Resumen",
    tabJournal: "Diario",
    tabTraining: "Entrenamiento",
    tabBrief: "Informe",
    notFound: "No pudimos encontrar este perro.",
    deleteConfirm: "¿Eliminar este perro? Esto borra el perfil, las entradas del diario, los objetivos y el informe de forma permanente.",
    journalCard: "Diario",
    journalEmpty: "Aún no hay entradas — registra la primera",
    journalMetric: "{n} entradas · último {ago}",
    trainingCard: "Entrenamiento",
    trainingEmpty: "Aún no hay objetivos — define el primero",
    trainingMetric: "{goals} objetivos · {skills} habilidades · prom. {avg}/5",
    briefCard: "Informe",
    briefEmpty: "Aún no hay informe",
    briefMetric: "{status} v{version} · {ago}",
    recentActivity: "Actividad reciente",
    recentEmpty: "Aún no hay registros",
    seeAllJournal: "Ver todo en el Diario →",
    logAMoment: "+ Registrar momento",
    today: "hoy",
    daysAgo: "hace {n}d",
    weeksAgo: "hace {n}sem",
    monthsAgo: "hace {n}m",
    statusDraft: "Borrador",
    statusFinalized: "Final",
  },
```

(All Spanish values differ from English — i18n parity holds.)

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/components/dog-layout.test.tsx`:

```tsx
import { LocaleProvider } from "@/i18n";
import * as dogsLib from "@/lib/dogs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DogLayout } from "./dog-layout";

vi.mock("@/lib/dogs", () => ({
  useDog: vi.fn(),
  useDeleteDog: vi.fn(),
}));

function setDog(data: { dog: { id: string; name: string; breed: string | null; size: string; sex: string } } | null, opts: { isLoading?: boolean; isError?: boolean } = {}) {
  vi.mocked(dogsLib.useDog).mockReturnValue({
    data,
    isLoading: opts.isLoading ?? false,
    isError: opts.isError ?? false,
  } as unknown as ReturnType<typeof dogsLib.useDog>);
  vi.mocked(dogsLib.useDeleteDog).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  } as unknown as ReturnType<typeof dogsLib.useDeleteDog>);
}

function renderLayoutAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/my/dogs/:id" element={<DogLayout />}>
              <Route index element={<p>OVERVIEW</p>} />
              <Route path="journal" element={<p>JOURNAL</p>} />
              <Route path="training" element={<p>TRAINING</p>} />
              <Route path="brief" element={<p>BRIEF</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setDog({
    dog: { id: "d1", name: "Biscuit", breed: "Aussie", size: "medium", sex: "female" },
  } as never);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("DogLayout", () => {
  it("renders the dog banner + 4 tabs + child route content", () => {
    renderLayoutAt("/my/dogs/d1");
    expect(screen.getByText("Biscuit")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Overview/i })).toHaveAttribute("href", "/my/dogs/d1");
    expect(screen.getByRole("link", { name: /Journal/i })).toHaveAttribute(
      "href",
      "/my/dogs/d1/journal",
    );
    expect(screen.getByRole("link", { name: /Training/i })).toHaveAttribute(
      "href",
      "/my/dogs/d1/training",
    );
    expect(screen.getByRole("link", { name: /Brief/i })).toHaveAttribute(
      "href",
      "/my/dogs/d1/brief",
    );
    expect(screen.getByText("OVERVIEW")).toBeInTheDocument();
  });

  it("highlights the active tab based on the URL", () => {
    renderLayoutAt("/my/dogs/d1/training");
    const trainingLink = screen.getByRole("link", { name: /Training/i });
    expect(trainingLink).toHaveAttribute("aria-current", "page");
    const overviewLink = screen.getByRole("link", { name: /Overview/i });
    expect(overviewLink).not.toHaveAttribute("aria-current", "page");
  });

  it("renders a 'not found' message when useDog returns isError", () => {
    setDog(null, { isError: true });
    renderLayoutAt("/my/dogs/missing");
    expect(screen.getByText(/couldn't find this dog/i)).toBeInTheDocument();
    expect(screen.queryByText("OVERVIEW")).not.toBeInTheDocument();
  });

  it("renders nothing visible while useDog is loading (no banner content)", () => {
    setDog(null, { isLoading: true });
    renderLayoutAt("/my/dogs/d1");
    expect(screen.queryByText("Biscuit")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @turingcare/web test -- dog-layout`
Expected: FAIL — `DogLayout` doesn't exist.

- [ ] **Step 4: Create `<DogLayout>`**

Create `apps/web/src/components/dog-layout.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDeleteDog, useDog } from "@/lib/dogs";
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

export function DogLayout() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const { data, isLoading, isError } = useDog(id);
  const del = useDeleteDog();
  const [confirming, setConfirming] = useState(false);

  if (isLoading) return null;
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <p className="text-red-600">{t("dogHub.notFound")}</p>
        <Button asChild variant="outline">
          <Link to="/my">{t("dogHub.backToDashboard")}</Link>
        </Button>
      </div>
    );
  }

  const dog = data.dog;
  const sizeLabel: Record<string, string> = {
    small: t("dogs.sizeSmall"),
    medium: t("dogs.sizeMedium"),
    large: t("dogs.sizeLarge"),
    giant: t("dogs.sizeGiant"),
  };
  const sexLabel: Record<string, string> = {
    male: t("dogs.sexMale"),
    female: t("dogs.sexFemale"),
  };
  const subtitle = [dog.breed, sizeLabel[dog.size], sexLabel[dog.sex]]
    .filter(Boolean)
    .join(" · ");

  const tabs = [
    { to: `/my/dogs/${dog.id}`, label: t("dogHub.tabOverview"), end: true },
    { to: `/my/dogs/${dog.id}/journal`, label: t("dogHub.tabJournal"), end: false },
    { to: `/my/dogs/${dog.id}/training`, label: t("dogHub.tabTraining"), end: false },
    { to: `/my/dogs/${dog.id}/brief`, label: t("dogHub.tabBrief"), end: false },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="sticky top-0 z-10 -mx-4 space-y-3 border-b border-silver bg-cream/95 px-4 pt-3 pb-2 backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <Link to="/my" className="text-xs text-slate-soft hover:underline">
            ← {t("dogHub.backToDashboard")}
          </Link>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate">{dog.name}</h1>
            {subtitle && <p className="text-sm text-slate-soft">{subtitle}</p>}
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to={`/my/dogs/${dog.id}/edit`}>{t("dogs.edit")}</Link>
            </Button>
            {confirming ? (
              <>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await del.mutateAsync(dog.id);
                      toast.success(t("dogs.deleted"));
                      navigate("/my");
                    } catch {
                      toast.error(t("dogs.saveFailed"));
                    }
                  }}
                  className="border-red-600 text-red-600"
                >
                  {t("dogs.deleteYes")}
                </Button>
                <Button variant="outline" onClick={() => setConfirming(false)}>
                  {t("dogs.deleteCancel")}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setConfirming(true)}>
                {t("dogs.delete")}
              </Button>
            )}
          </div>
        </div>
        {confirming && <p className="text-sm text-red-600">{t("dogHub.deleteConfirm")}</p>}
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label={t("dogHub.tabOverview")}>
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                isActive
                  ? "border-b-2 border-slate px-3 py-2 text-sm font-medium text-slate"
                  : "border-b-2 border-transparent px-3 py-2 text-sm text-slate-soft hover:text-slate"
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @turingcare/web test -- dog-layout`
Expected: PASS — all 4 tests.

Run: `pnpm --filter @turingcare/web test -- i18n`
Expected: PASS (parity holds).

- [ ] **Step 6: tsc + lint**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/web/src/components/dog-layout.tsx apps/web/src/components/dog-layout.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts` (expect clean).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/dog-layout.tsx apps/web/src/components/dog-layout.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): DogLayout (sticky banner + tab strip + outlet)"
```

---

## Task 4: Spoke card + recent activity components

**Files:**
- Create: `apps/web/src/components/dog-hub/spoke-card.tsx`
- Create: `apps/web/src/components/dog-hub/recent-activity.tsx`

Two small presentational components used by the hub. Pure render, no data fetching.

- [ ] **Step 1: Create `<SpokeCard>`**

Create `apps/web/src/components/dog-hub/spoke-card.tsx`:

```tsx
import { Link } from "react-router-dom";

type Props = {
  to: string;
  title: string;
  metric: string;
  isEmpty?: boolean;
};

export function SpokeCard({ to, title, metric, isEmpty }: Props) {
  return (
    <Link
      to={to}
      className="block rounded border border-silver bg-white p-4 transition hover:border-slate hover:shadow-sm"
    >
      <div className="text-sm font-semibold text-slate">{title}</div>
      <div className={`mt-2 text-sm ${isEmpty ? "text-slate-soft italic" : "text-slate-soft"}`}>
        {metric}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create `<RecentActivity>`**

Create `apps/web/src/components/dog-hub/recent-activity.tsx`:

```tsx
import { useI18n } from "@/i18n";
import type { JournalEntry } from "@/lib/journal";
import { Link } from "react-router-dom";

type Props = {
  entries: JournalEntry[];
  seeAllHref: string;
};

export function RecentActivity({ entries, seeAllHref }: Props) {
  const { t } = useI18n();
  const top = entries.slice(0, 3);

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate">{t("dogHub.recentActivity")}</h2>
      {top.length === 0 ? (
        <p className="text-sm text-slate-soft">{t("dogHub.recentEmpty")}</p>
      ) : (
        <ul className="space-y-1 text-sm text-slate-soft">
          {top.map((entry) => {
            const summary = entry.note ?? entry.behavior ?? "";
            const date = String(entry.occurredAt).slice(0, 10);
            return (
              <li key={entry.id}>
                <span className="text-slate">{summary}</span>
                <span> · {date}</span>
              </li>
            );
          })}
        </ul>
      )}
      <Link to={seeAllHref} className="text-sm text-copper hover:underline">
        {t("dogHub.seeAllJournal")}
      </Link>
    </section>
  );
}
```

- [ ] **Step 3: tsc + lint**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/web/src/components/dog-hub/spoke-card.tsx apps/web/src/components/dog-hub/recent-activity.tsx` (expect clean).

(No dedicated tests for these — they're tested via the hub test in Task 5.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/dog-hub/spoke-card.tsx apps/web/src/components/dog-hub/recent-activity.tsx
git commit -m "feat(web): SpokeCard + RecentActivity presentational components"
```

---

## Task 5: `DogHub` component (the overview page)

**Files:**
- Create: `apps/web/src/routes/dog-hub.tsx`
- Test: `apps/web/src/routes/dog-hub.test.tsx`

The hub renders inside `<DogLayout>` (which provides the banner + tabs). It shows: 3 spoke cards with metrics, concerns block, recent activity, "Log a moment" CTA.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/routes/dog-hub.test.tsx`:

```tsx
import { LocaleProvider } from "@/i18n";
import * as dogsLib from "@/lib/dogs";
import * as journalLib from "@/lib/journal";
import * as briefLib from "@/lib/brief";
import * as progressLib from "@/lib/progress";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DogHub } from "./dog-hub";

vi.mock("@/lib/dogs", () => ({
  useDog: vi.fn(),
  useAddConcern: vi.fn(),
  useRemoveConcern: vi.fn(),
}));
vi.mock("@/lib/journal", () => ({ useJournal: vi.fn() }));
vi.mock("@/lib/brief", () => ({ useBrief: vi.fn() }));
vi.mock("@/lib/progress", () => ({ useProgress: vi.fn() }));

function setupAll(overrides: {
  concerns?: { id: string; concern: string; severity: string }[];
  entries?: { id: string; note: string; occurredAt: string }[];
  goals?: { skills: { confidence: number }[] }[];
  brief?: { status: string; version: number; generatedAt: string } | null;
} = {}) {
  vi.mocked(dogsLib.useDog).mockReturnValue({
    data: {
      dog: { id: "d1", name: "Biscuit" },
      concerns: overrides.concerns ?? [],
      goals: [],
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof dogsLib.useDog>);
  vi.mocked(dogsLib.useAddConcern).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  } as unknown as ReturnType<typeof dogsLib.useAddConcern>);
  vi.mocked(dogsLib.useRemoveConcern).mockReturnValue({
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof dogsLib.useRemoveConcern>);
  vi.mocked(journalLib.useJournal).mockReturnValue({
    data: overrides.entries ?? [],
    isError: false,
  } as unknown as ReturnType<typeof journalLib.useJournal>);
  vi.mocked(briefLib.useBrief).mockReturnValue({
    data: overrides.brief ?? null,
    isError: false,
  } as unknown as ReturnType<typeof briefLib.useBrief>);
  vi.mocked(progressLib.useProgress).mockReturnValue({
    data: overrides.goals ?? [],
  } as unknown as ReturnType<typeof progressLib.useProgress>);
}

function renderHub() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/my/dogs/d1"]}>
          <Routes>
            <Route path="/my/dogs/:id" element={<DogHub />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => setupAll());

afterEach(() => vi.resetAllMocks());

describe("DogHub", () => {
  it("renders three spoke cards linking to the spokes", () => {
    renderHub();
    expect(screen.getByRole("link", { name: /Journal/i })).toHaveAttribute(
      "href",
      "/my/dogs/d1/journal",
    );
    expect(screen.getByRole("link", { name: /Training/i })).toHaveAttribute(
      "href",
      "/my/dogs/d1/training",
    );
    expect(screen.getByRole("link", { name: /Brief/i })).toHaveAttribute(
      "href",
      "/my/dogs/d1/brief",
    );
  });

  it("shows empty-state metric strings when there's no data", () => {
    renderHub();
    expect(screen.getByText(/No entries yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No goals yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No brief yet/i)).toBeInTheDocument();
  });

  it("renders the journal entry count when entries exist", () => {
    setupAll({
      entries: [
        {
          id: "e1",
          note: "Pulled at the gate",
          occurredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        } as never,
      ],
    });
    renderHub();
    expect(screen.getByText(/1 entries/i)).toBeInTheDocument();
  });

  it("renders the Log a moment CTA linking to the journal spoke with ?compose=moment", () => {
    renderHub();
    expect(screen.getByRole("link", { name: /\+ Log a moment/i })).toHaveAttribute(
      "href",
      "/my/dogs/d1/journal?compose=moment",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @turingcare/web test -- dog-hub`
Expected: FAIL — `DogHub` doesn't exist.

- [ ] **Step 3: Create the `DogHub` component**

Create `apps/web/src/routes/dog-hub.tsx`:

```tsx
import { RecentActivity } from "@/components/dog-hub/recent-activity";
import { SpokeCard } from "@/components/dog-hub/spoke-card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useBrief } from "@/lib/brief";
import { useAddConcern, useDog, useRemoveConcern } from "@/lib/dogs";
import { useJournal } from "@/lib/journal";
import { useProgress } from "@/lib/progress";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

const inputCls = "flex-1 rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

function timeAgo(t: (k: string, vars?: Record<string, string | number>) => string, iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return t("dogHub.today");
  if (days < 7) return t("dogHub.daysAgo", { n: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return t("dogHub.weeksAgo", { n: weeks });
  const months = Math.floor(days / 30);
  return t("dogHub.monthsAgo", { n: Math.max(months, 1) });
}

export function DogHub() {
  const { t } = useI18n();
  const { id = "" } = useParams();
  const { data: dogData } = useDog(id);
  const { data: entries } = useJournal(id || undefined);
  const { data: progressGoals } = useProgress(id);
  const { data: brief } = useBrief(id);
  const addConcern = useAddConcern(id);
  const removeConcern = useRemoveConcern(id);
  const [concern, setConcern] = useState("");
  const [severity, setSeverity] = useState<"mild" | "moderate" | "severe">("mild");

  if (!dogData) return null;
  const { dog, concerns } = dogData;

  const entryList = entries ?? [];
  const journalMetric = entryList.length
    ? t("dogHub.journalMetric", {
        n: entryList.length,
        ago: timeAgo(t, entryList[0]?.occurredAt ?? null) ?? "",
      })
    : t("dogHub.journalEmpty");

  const goals = progressGoals ?? [];
  const skillCount = goals.reduce((sum, g) => sum + g.skills.length, 0);
  const confidences = goals.flatMap((g) => g.skills.map((s) => s.confidence));
  const avg = confidences.length
    ? (confidences.reduce((sum, c) => sum + c, 0) / confidences.length).toFixed(1)
    : "0.0";
  const trainingMetric = goals.length
    ? t("dogHub.trainingMetric", { goals: goals.length, skills: skillCount, avg })
    : t("dogHub.trainingEmpty");

  const briefMetric = brief
    ? t("dogHub.briefMetric", {
        status: brief.status === "finalized" ? t("dogHub.statusFinalized") : t("dogHub.statusDraft"),
        version: brief.version,
        ago: timeAgo(t, brief.generatedAt) ?? "",
      })
    : t("dogHub.briefEmpty");

  const sevLabel: Record<string, string> = {
    mild: t("dogs.severityMild"),
    moderate: t("dogs.severityModerate"),
    severe: t("dogs.severitySevere"),
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <SpokeCard
          to={`/my/dogs/${dog.id}/journal`}
          title={t("dogHub.journalCard")}
          metric={journalMetric}
          isEmpty={entryList.length === 0}
        />
        <SpokeCard
          to={`/my/dogs/${dog.id}/training`}
          title={t("dogHub.trainingCard")}
          metric={trainingMetric}
          isEmpty={goals.length === 0}
        />
        <SpokeCard
          to={`/my/dogs/${dog.id}/brief`}
          title={t("dogHub.briefCard")}
          metric={briefMetric}
          isEmpty={!brief}
        />
      </div>

      <Button asChild className="bg-slate text-cream">
        <Link to={`/my/dogs/${dog.id}/journal?compose=moment`}>{t("dogHub.logAMoment")}</Link>
      </Button>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate">{t("dogs.concernsTitle")}</h2>
        {concerns.length === 0 && <p className="text-slate-soft">{t("dogs.concernsEmpty")}</p>}
        <ul className="space-y-1">
          {concerns.map((cn) => (
            <li key={cn.id} className="flex items-center justify-between">
              <span>
                {cn.concern} · {sevLabel[cn.severity]}
              </span>
              <Button variant="outline" onClick={() => removeConcern.mutate(cn.id)}>
                {t("dogs.remove")}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <input
            className={inputCls}
            placeholder={t("dogs.concernPlaceholder")}
            value={concern}
            onChange={(e) => setConcern(e.target.value)}
          />
          <select
            className="rounded border border-silver bg-white px-2 text-sm"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as "mild" | "moderate" | "severe")}
          >
            <option value="mild">{t("dogs.severityMild")}</option>
            <option value="moderate">{t("dogs.severityModerate")}</option>
            <option value="severe">{t("dogs.severitySevere")}</option>
          </select>
          <Button
            disabled={!concern.trim()}
            onClick={async () => {
              await addConcern.mutateAsync({ concern, severity });
              setConcern("");
            }}
          >
            {t("dogs.addConcern")}
          </Button>
        </div>
      </section>

      <RecentActivity entries={entryList} seeAllHref={`/my/dogs/${dog.id}/journal`} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @turingcare/web test -- dog-hub`
Expected: PASS (4 tests).

- [ ] **Step 5: tsc + lint**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/web/src/routes/dog-hub.tsx apps/web/src/routes/dog-hub.test.tsx` (expect clean).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/dog-hub.tsx apps/web/src/routes/dog-hub.test.tsx
git commit -m "feat(web): DogHub overview page (3 spoke cards + concerns + recent activity)"
```

---

## Task 6: `DogTraining` and `DogJournal` spoke routes

**Files:**
- Create: `apps/web/src/routes/dog-training.tsx`
- Create: `apps/web/src/routes/dog-journal.tsx`

Both are thin wrappers — the heavy lifting is in already-existing components.

- [ ] **Step 1: Create `DogTraining`**

Create `apps/web/src/routes/dog-training.tsx`:

```tsx
import { ProgressPanel } from "@/components/progress/progress-panel";
import { TemplatePicker } from "@/components/training/template-picker";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useAddGoal, useDog, useRemoveGoal } from "@/lib/dogs";
import { useState } from "react";
import { useParams } from "react-router-dom";

const inputCls = "flex-1 rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function DogTraining() {
  const { t } = useI18n();
  const { id = "" } = useParams();
  const { data: dogData } = useDog(id);
  const addGoal = useAddGoal(id);
  const removeGoal = useRemoveGoal(id);
  const [goal, setGoal] = useState("");

  if (!dogData) return null;
  const { goals } = dogData;

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="font-semibold text-slate">{t("dogs.goalsTitle")}</h2>
        {goals.length === 0 && <p className="text-slate-soft">{t("dogs.goalsEmpty")}</p>}
        <ul className="space-y-1">
          {goals.map((g) => (
            <li key={g.id} className="flex items-center justify-between">
              <span>{g.goal}</span>
              <Button variant="outline" onClick={() => removeGoal.mutate(g.id)}>
                {t("dogs.remove")}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-start gap-2">
          <input
            className={inputCls}
            placeholder={t("dogs.goalPlaceholder")}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <Button
            disabled={!goal.trim()}
            onClick={async () => {
              await addGoal.mutateAsync({ goal });
              setGoal("");
            }}
          >
            {t("dogs.addGoal")}
          </Button>
          <TemplatePicker dogId={id} />
        </div>
      </section>

      <ProgressPanel dogId={id} />
    </div>
  );
}
```

- [ ] **Step 2: Create `DogJournal`**

Create `apps/web/src/routes/dog-journal.tsx`:

```tsx
import { JournalView } from "@/components/journal/journal-view";
import { useParams, useSearchParams } from "react-router-dom";

export function DogJournal() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const composeRaw = params.get("compose");
  const composeMode: "moment" | "daily_checkin" | undefined =
    composeRaw === "daily_checkin" ? "daily_checkin" : composeRaw === "moment" ? "moment" : undefined;
  return <JournalView scopedDogId={id} composeMode={composeMode} />;
}
```

- [ ] **Step 3: tsc + lint**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/web/src/routes/dog-training.tsx apps/web/src/routes/dog-journal.tsx` (expect clean).

(No tests in this task — the routes' behaviour is tested via the integration in Task 7's main.tsx routing, and via the underlying `<ProgressPanel>`, `<TemplatePicker>`, and `<JournalView>` components which all already have their own tests.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/dog-training.tsx apps/web/src/routes/dog-journal.tsx
git commit -m "feat(web): DogTraining + DogJournal spoke routes"
```

---

## Task 7: Wire the new routing in `main.tsx` and remove the old hub

**Files:**
- Modify: `apps/web/src/main.tsx`
- Delete: `apps/web/src/routes/dog-detail.tsx`

This is the IA switchover. After this task, `/my/dogs/:id` renders the new layout + hub; `/my/dogs/:id/{journal,training,brief}` work; `/my/dogs` redirects to `/my`.

- [ ] **Step 1: Update `main.tsx`**

Edit `apps/web/src/main.tsx`:

(a) Remove these imports (the `DogDetail` and `DogsList` components are no longer used):

```ts
import { DogDetail } from "@/routes/dog-detail";
import { DogsList } from "@/routes/dogs-list";
```

(b) Add these imports (alphabetically with the other `@/routes/*` imports):

```ts
import { DogHub } from "@/routes/dog-hub";
import { DogJournal } from "@/routes/dog-journal";
import { DogLayout } from "@/components/dog-layout";
import { DogTraining } from "@/routes/dog-training";
import { Navigate } from "react-router-dom";
```

(`Navigate` from `react-router-dom` — add to the existing `react-router-dom` import: change `import { BrowserRouter, Route, Routes } from "react-router-dom";` to `import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";`.)

(c) Replace the existing block of dog routes (currently:

```tsx
<Route path="/my/dogs" element={<DogsList />} />
<Route path="/my/dogs/new" element={<DogForm mode="create" />} />
<Route path="/my/dogs/:id" element={<DogDetail />} />
<Route path="/my/dogs/:id/edit" element={<DogForm mode="edit" />} />
<Route path="/my/dogs/:id/brief" element={<Brief />} />
```

) with:

```tsx
<Route path="/my/dogs" element={<Navigate to="/my" replace />} />
<Route path="/my/dogs/new" element={<DogForm mode="create" />} />
<Route path="/my/dogs/:id" element={<DogLayout />}>
  <Route index element={<DogHub />} />
  <Route path="journal" element={<DogJournal />} />
  <Route path="training" element={<DogTraining />} />
  <Route path="brief" element={<Brief />} />
  <Route path="edit" element={<DogForm mode="edit" />} />
</Route>
```

NOTE: the `edit` child route is rendered INSIDE `<DogLayout>` — so the dog banner + tabs appear above the edit form. That's the intended behaviour (consistent header across all dog-scoped views). If we want edit to be standalone (no layout chrome), make it a sibling: pull `edit` out of the children and add `<Route path="/my/dogs/:id/edit" element={<DogForm mode="edit" />} />` as a sibling. For this plan, keep it inside the layout — the user benefits from "still on Biscuit" context while editing.

- [ ] **Step 2: Delete `dog-detail.tsx`**

```bash
git rm apps/web/src/routes/dog-detail.tsx
```

(Any imports of `DogDetail` outside `main.tsx`? Quick check: `grep -rn "DogDetail" apps/web/src/` should return nothing after the main.tsx edit.)

- [ ] **Step 3: Run all web tests**

Run: `pnpm --filter @turingcare/web test`
Expected: all tests pass — the routing change activates the new layout + hub; existing tests for `ProgressPanel`, `TemplatePicker`, `Brief`, `Journal`, `Overview`, etc. continue to pass because their components are unchanged.

If any test was importing or relying on `dog-detail.tsx`, update it to use `dog-hub.tsx` instead. (None should — the spec asserts no tests reference the old file directly.)

- [ ] **Step 4: tsc + lint**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit` (expect 0).
Run: `pnpm exec biome check apps/web/src/main.tsx` (expect clean).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/main.tsx
git commit -m "feat(web): wire DogLayout + spoke routes; redirect /my/dogs to /my"
```

(The `git rm` from Step 2 is already staged.)

---

## Task 8: Cleanup + PROJECT-LOG + push

**Files:**
- Delete: `apps/web/src/routes/dogs-list.tsx` and any `apps/web/src/routes/dogs-list.test.tsx` if it exists
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts` (remove orphaned keys)
- Modify: `docs/PROJECT-LOG.md`

- [ ] **Step 1: Delete the unreachable `DogsList` route**

```bash
git rm apps/web/src/routes/dogs-list.tsx
git rm apps/web/src/routes/dogs-list.test.tsx 2>/dev/null || true
```

Verify no remaining imports: `grep -rn "DogsList\|dogs-list" apps/web/src/` should return nothing.

- [ ] **Step 2: Audit and remove orphaned i18n keys**

Run a grep for each `dogs.*` key in `apps/web/src/i18n/en.ts` and check if it's still used in `apps/web/src/`. Likely candidates that may now be orphaned (because the dog-detail page is gone): `dogs.back`, `dogs.listTitle`, `dogs.listEmpty`, `dogs.listEmptyCta`. Verify each with:

```bash
for key in back listTitle listEmpty listEmptyCta; do
  echo "=== dogs.$key ==="
  grep -rn "dogs.$key\b" apps/web/src/ | grep -v "/i18n/"
done
```

For each key with no usage outside `/i18n/`, remove it from BOTH `en.ts` and `es.ts`. (The i18n parity test requires en/es key-set equality, so always remove from both files in the same commit.)

- [ ] **Step 3: Run full gate suite**

Run (load env first):
```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm --filter @turingcare/api exec tsc --noEmit
pnpm lint
pnpm --filter @turingcare/shared test
pnpm --filter @turingcare/web test
pnpm --filter @turingcare/api test
pnpm --filter @turingcare/web build
```
Expected: all green. The api suite may flake on shared-test-DB drift unrelated to this PR; if so, recreate the test DB from migrations and re-run.

- [ ] **Step 4: PROJECT-LOG entry**

Append a dated entry to `docs/PROJECT-LOG.md` summarizing the redesign: 4-route IA under `/my/dogs/:id/*`, shared DogLayout (banner + tabs), thin hub with 3 spoke cards + concerns + recent activity + Log-a-moment CTA, per-skill collapse in training spoke, `/my/dogs` redirect, no DB/API changes. List spec + plan paths.

```bash
git add docs/PROJECT-LOG.md apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "docs: log dog-hub redesign + remove orphaned i18n + DogsList route"
```

- [ ] **Step 5: Push**

```bash
git push -u origin feature/dog-hub-redesign
gh pr create --title "Dog-hub redesign (hub + spokes)" --body "(see PROJECT-LOG entry + spec)" --base main --head feature/dog-hub-redesign
```

---

## Self-Review (run during planning)

- **Spec coverage:**
  - IA + routes → Task 7 (main.tsx).
  - `<DogLayout>` → Task 3.
  - Hub content (3 cards + concerns + recent activity + Log CTA) → Tasks 4 + 5.
  - Training spoke (goal-add + ProgressPanel) → Task 6.
  - Per-skill collapse → Task 1.
  - Journal spoke (`<JournalView>` extraction + new route) → Tasks 2 + 6.
  - Brief spoke (unchanged content, layout-wrapped) → Task 7's routing.
  - `/my/dogs` redirect + cleanup of `DogsList` → Tasks 7 + 8.
  - i18n parity + orphaned keys → Tasks 1, 3, 8.
- **Placeholders:** none. Every step has exact code. The one "audit and remove" step in Task 8 has a grep recipe.
- **Type consistency:** `JournalViewProps` (`scopedDogId?: string`, `composeMode?: Mode`) in Task 2 is consumed verbatim by `DogJournal` in Task 6. `DogLayout` (Task 3) uses `useDog` / `useDeleteDog` whose return shapes match how `DogHub` (Task 5) uses `useDog`. `<SpokeCard>` props (Task 4) match Task 5's call sites. `timeAgo` helper uses i18n keys defined in Task 3.
- **Gotchas baked in:** per-row expand state in `SkillCard` is local (not URL or storage); each row is independent (test asserts this). The hub renders nothing while `dogData` is unresolved (avoids flicker; `<DogLayout>` already shows a loading null above us). `JournalView` keeps the URL-param dog-filter behaviour when `scopedDogId` is undefined (cross-pet route continues to work).
