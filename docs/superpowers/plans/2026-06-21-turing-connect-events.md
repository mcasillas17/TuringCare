# Turing — Connect All The Events (phase 2c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Turing's `celebrate()` into the remaining meaningful events — tiered wag/hop — so he reacts across the app, with the hop reserved for milestones.

**Architecture:** Three new mutation-based triggers (celebrate in `onSuccess`, mirroring phase 2b) plus two derived-state triggers that fire once on a false→true completion transition via a previous-value ref.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest + Testing Library, Biome.

## Global Constraints

- Web app in `apps/web`; run commands from `apps/web`. No new dependencies.
- `useTuring()` (from `@/components/turing/turing-context`) returns `{ eventPose, asleep, celebrate(big?: boolean) }`. Call `useTuring()` at the TOP of a hook/component (Rules of Hooks); never conditionally.
- Intensity: **wag** = `celebrate(false)`, **hop** = `celebrate(true)`.
- Preserve all existing `invalidateQueries`/behavior — only ADD celebrate.
- Derived-state triggers must NOT fire on mount for already-complete state, and must fire only on a genuine in-session false→true transition (use a `useRef<boolean | undefined>(undefined)` baseline, set the baseline on the first loaded render without firing).
- TDD: failing test first. Final gate: `pnpm test` green, `pnpm exec tsc -b` 0, **root** `pnpm biome check .` clean (run from repo root — CI lints from root and can differ from the package-scoped run), `pnpm build` OK.

---

### Task 1: Mutation-based triggers (add dog, add goal, skill confidence)

**Files:**
- Modify: `apps/web/src/lib/dogs.ts` — `useCreateDog` (onSuccess) → `celebrate(true)`; `useAddGoal` (onSuccess) → `celebrate(false)`
- Modify: `apps/web/src/lib/progress.ts` — `useUpdateSkillConfidence` (onSuccess) → `celebrate(variables.body.confidence >= CONFIDENCE_MAX)`
- Modify: `apps/web/src/lib/turing-triggers.test.tsx` — add cases

**Interfaces:**
- Consumes: `useTuring` (`@/components/turing/turing-context`), `CONFIDENCE_MAX` (`@turingcare/shared`, value 5).

- [ ] **Step 1: Add failing tests.** In `apps/web/src/lib/turing-triggers.test.tsx`, read the existing mock setup (it already mocks `@/lib/api` and `@/components/turing/turing-context` with a `celebrate` spy, and uses a QueryClient wrapper). Add cases mirroring the real api call shapes (read `dogs.ts`/`progress.ts` for the exact client paths — `dogs.$post`, `dogs[":id"].goals.$post`, `dogSkills[":skillId"].confidence.$patch`):

```tsx
// useCreateDog → hop
it("add dog fires a big hop", async () => {
  const { result } = renderHook(() => useCreateDog(), { wrapper: wrap });
  await act(async () => {
    await result.current.mutateAsync({ name: "Rex" } as never);
  });
  await waitFor(() => expect(celebrate).toHaveBeenCalledWith(true));
});

// useAddGoal → wag
it("add goal fires a small wag", async () => {
  const { result } = renderHook(() => useAddGoal("d1"), { wrapper: wrap });
  await act(async () => {
    await result.current.mutateAsync({ title: "Loose-leash walking" } as never);
  });
  await waitFor(() => expect(celebrate).toHaveBeenCalledWith(false));
});

// useUpdateSkillConfidence → hop at max, wag otherwise
it("reaching max confidence hops; a lower bump wags", async () => {
  const { result } = renderHook(() => useUpdateSkillConfidence("d1"), { wrapper: wrap });
  await act(async () => {
    await result.current.mutateAsync({ skillId: "s1", body: { confidence: 5 } });
  });
  await waitFor(() => expect(celebrate).toHaveBeenCalledWith(true));
  celebrate.mockClear();
  await act(async () => {
    await result.current.mutateAsync({ skillId: "s1", body: { confidence: 3 } });
  });
  await waitFor(() => expect(celebrate).toHaveBeenCalledWith(false));
});
```

Extend the `@/lib/api` mock so `dogs.$post`, `dogs[":id"].goals.$post`, and `dogSkills[":skillId"].confidence.$patch` resolve `{ ok: true, json: async () => ({ dog/goal/skill: {...} }) }` matching each hook's `(await res.json()).X` destructure. Import the three hooks.

- [ ] **Step 2: Run tests, verify they fail.** `pnpm test turing-triggers` → FAIL (celebrate not called for the new hooks).

- [ ] **Step 3: Wire the hooks.**

`lib/dogs.ts` — add `import { useTuring } from "@/components/turing/turing-context";`. In `useCreateDog`:
```ts
export function useCreateDog() {
  const qc = useQueryClient();
  const { celebrate } = useTuring();
  return useMutation({
    mutationFn: async (body: DogProfile) => {
      const res = await dogs.$post({ json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).dog;
    },
    onSuccess: () => {
      celebrate(true);
      qc.invalidateQueries({ queryKey: ["dogs"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });
}
```
In `useAddGoal`, add `const { celebrate } = useTuring();` at the top and `celebrate(false);` as the first line of `onSuccess` (keep both invalidates).

`lib/progress.ts` — add `import { useTuring } from "@/components/turing/turing-context";` and ensure `CONFIDENCE_MAX` is imported from `@turingcare/shared` (it may already be imported in this file or in progress utils; if not, add it). In `useUpdateSkillConfidence`:
```ts
export function useUpdateSkillConfidence(dogId: string) {
  const qc = useQueryClient();
  const { celebrate } = useTuring();
  return useMutation({
    mutationFn: async (args: { skillId: string; body: SkillConfidenceInput }) => {
      const res = await dogSkills[":skillId"].confidence.$patch({
        param: { id: dogId, skillId: args.skillId },
        json: args.body,
      });
      if (!res.ok) throw new Error("update_failed");
      return (await res.json()).skill;
    },
    onSuccess: (_data, variables) => {
      celebrate(variables.body.confidence >= CONFIDENCE_MAX);
      invalidateProgress(qc, dogId);
    },
  });
}
```

- [ ] **Step 4: Run tests + gates.** `pnpm test turing-triggers` → PASS; `pnpm test` full suite green; `pnpm exec tsc -b` 0; `pnpm exec biome check --write src/lib/dogs.ts src/lib/progress.ts src/lib/turing-triggers.test.tsx`.

- [ ] **Step 5: Commit.**
```bash
git add apps/web/src/lib/dogs.ts apps/web/src/lib/progress.ts apps/web/src/lib/turing-triggers.test.tsx
git commit -m "feat(turing): celebrate on add-dog (hop), add-goal (wag), skill mastery (hop)"
```

---

### Task 2: Onboarding completion → hop (once, on transition)

**Files:**
- Modify: `apps/web/src/components/onboarding/checklist.tsx`
- Test: `apps/web/src/components/onboarding/checklist.test.tsx` (create if absent; else extend)

**Interfaces:**
- Consumes: `useTuring`. The component already computes `allDone = items.every(i => i.done)` and early-returns `null` when `!status`.

- [ ] **Step 1: Write the failing test.** Mock `@/lib/onboarding`'s `useOnboardingStatus` and `@/components/turing/turing-context`'s `useTuring` (celebrate spy). Drive a not-complete → complete rerender:

```tsx
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as onboarding from "@/lib/onboarding";
import { OnboardingChecklist } from "./checklist";

const celebrate = vi.fn();
vi.mock("@/components/turing/turing-context", () => ({ useTuring: () => ({ celebrate }) }));
vi.mock("@/lib/onboarding");

const complete = { hasDog: true, momentsCount: 3, hasGoal: true, hasFinalizedBrief: true, hasSentBrief: true, mostRecentDogId: "d1" };
const incomplete = { ...complete, hasSentBrief: false };

function renderChecklist() {
  return render(<MemoryRouter><OnboardingChecklist /></MemoryRouter>);
}

afterEach(() => { vi.clearAllMocks(); localStorage.clear(); });

it("hops once when onboarding flips to complete", () => {
  vi.mocked(onboarding.useOnboardingStatus).mockReturnValue({ data: incomplete } as never);
  const { rerender } = renderChecklist();
  expect(celebrate).not.toHaveBeenCalled();
  vi.mocked(onboarding.useOnboardingStatus).mockReturnValue({ data: complete } as never);
  rerender(<MemoryRouter><OnboardingChecklist /></MemoryRouter>);
  expect(celebrate).toHaveBeenCalledExactlyOnceWith(true);
});

it("does not hop when already complete on mount", () => {
  vi.mocked(onboarding.useOnboardingStatus).mockReturnValue({ data: complete } as never);
  renderChecklist();
  expect(celebrate).not.toHaveBeenCalled();
});
```

(If `toHaveBeenCalledExactlyOnceWith` is unavailable in this vitest version, use `expect(celebrate).toHaveBeenCalledTimes(1); expect(celebrate).toHaveBeenCalledWith(true);`.)

- [ ] **Step 2: Run test, verify it fails.** `pnpm test checklist` → FAIL.

- [ ] **Step 3: Implement.** In `checklist.tsx`, add imports (`useEffect`, `useRef` from react; `useTuring`). Move the celebrate effect ABOVE the `if (!status) return null;` early return (Rules of Hooks). Compute `allDone` defensively so it can run before the guard:

```tsx
export function OnboardingChecklist() {
  const { t } = useI18n();
  const { data: status } = useOnboardingStatus();
  const { celebrate } = useTuring();
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);

  const items = status ? buildItems(status) : [];
  const allDone = !!status && items.every((item) => item.done);

  const prevAllDone = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (!status) return; // wait for load — establishes baseline below
    if (prevAllDone.current === false && allDone) celebrate(true);
    prevAllDone.current = allDone;
  }, [status, allDone, celebrate]);

  if (!status) return null;

  // …existing render uses `items` and `allDone` (now computed above)…
}
```
Remove the now-duplicate `const items = buildItems(status);` / `const allDone = …` lines that were below the guard (they're computed above). Keep the rest of the render identical.

- [ ] **Step 4: Run tests + gates.** `pnpm test checklist` → PASS; `pnpm test` green; `pnpm exec tsc -b` 0; `pnpm exec biome check --write src/components/onboarding/checklist.tsx src/components/onboarding/checklist.test.tsx`.

- [ ] **Step 5: Commit.**
```bash
git add apps/web/src/components/onboarding/checklist.tsx apps/web/src/components/onboarding/checklist.test.tsx
git commit -m "feat(turing): hop once when the onboarding checklist is completed"
```

---

### Task 3: Weekly focus completion → hop (once per completion, current week only)

**Files:**
- Modify: `apps/web/src/routes/dog-week.tsx`
- Test: `apps/web/src/routes/dog-week.test.tsx` (extend if present; else create)

**Interfaces:**
- Consumes: `useTuring`. Existing in the component: `skills` (`focusSkills ?? []`), `doneCount`, `sameWeek(monday, today)` (current-week predicate), `dayKey(monday)` (stable per-week key), `focusSkills` (undefined until loaded).

- [ ] **Step 1: Write the failing test.** The cleanest unit is a pure helper. Extract the transition decision and test it directly:

```ts
// in dog-week.test.tsx (or a small helper test)
import { describe, expect, it } from "vitest";
import { shouldCelebrateWeek } from "./dog-week";

describe("shouldCelebrateWeek", () => {
  it("fires only on an incomplete→complete transition for the current week", () => {
    // prev incomplete, now complete, current week, loaded → true
    expect(shouldCelebrateWeek({ prev: false, complete: true, isCurrentWeek: true })).toBe(true);
  });
  it("does not fire on baseline (prev undefined)", () => {
    expect(shouldCelebrateWeek({ prev: undefined, complete: true, isCurrentWeek: true })).toBe(false);
  });
  it("does not fire for a past week", () => {
    expect(shouldCelebrateWeek({ prev: false, complete: true, isCurrentWeek: false })).toBe(false);
  });
  it("does not fire when staying complete", () => {
    expect(shouldCelebrateWeek({ prev: true, complete: true, isCurrentWeek: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails.** `pnpm test dog-week` → FAIL (`shouldCelebrateWeek` missing).

- [ ] **Step 3: Implement.** In `dog-week.tsx`, export the pure helper and add the effect:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useTuring } from "@/components/turing/turing-context";

export function shouldCelebrateWeek(o: {
  prev: boolean | undefined;
  complete: boolean;
  isCurrentWeek: boolean;
}): boolean {
  return o.isCurrentWeek && o.prev === false && o.complete;
}
```
Inside the component (after `doneCount`/`skills` are computed):
```tsx
  const { celebrate } = useTuring();
  const isCurrentWeek = sameWeek(monday, today);
  const weekComplete = skills.length > 0 && doneCount === skills.length;
  const weekKey = dayKey(monday);
  const prevComplete = useRef<boolean | undefined>(undefined);
  const prevWeekKey = useRef(weekKey);
  useEffect(() => {
    if (focusSkills === undefined) return; // not loaded yet
    if (prevWeekKey.current !== weekKey) {
      prevWeekKey.current = weekKey;
      prevComplete.current = undefined; // new week → re-baseline, no fire
    }
    if (shouldCelebrateWeek({ prev: prevComplete.current, complete: weekComplete, isCurrentWeek })) {
      celebrate(true);
    }
    prevComplete.current = weekComplete;
  }, [focusSkills, weekKey, weekComplete, isCurrentWeek, celebrate]);
```
This establishes the baseline on the first loaded render (prev `undefined` → no fire), fires on a real incomplete→complete transition in the current week, and re-baselines (no fire) when the viewed week changes — so paging to an already-complete past week is silent.

- [ ] **Step 4: Run tests + gates.** `pnpm test dog-week` → PASS; `pnpm test` full suite green; `pnpm exec tsc -b` 0; `pnpm exec biome check --write src/routes/dog-week.tsx src/routes/dog-week.test.tsx`.

- [ ] **Step 5: Commit.**
```bash
git add apps/web/src/routes/dog-week.tsx apps/web/src/routes/dog-week.test.tsx
git commit -m "feat(turing): hop when the current week's focus skills are all trained"
```

---

## Final verification (after all tasks)

- [ ] `pnpm test` green; `pnpm exec tsc -b` 0; **from repo root** `pnpm biome check .` clean; `pnpm build` OK.
- [ ] `npx react-doctor@latest --diff` — no new findings attributable to changed files.
- [ ] Update `docs/PROJECT-LOG.md` with a phase-2c entry.
- [ ] Open PR to `main`.

## Self-review notes

- **Spec coverage:** add dog (T1 hop), add goal (T1 wag), skill mastery vs bump (T1 hop/wag), onboarding complete (T2 hop once), week complete (T3 hop once, current week). All covered.
- **Type consistency:** `celebrate(big?: boolean)` used everywhere; `CONFIDENCE_MAX` from shared; `shouldCelebrateWeek` signature matches its test and call site.
- **No-fire-on-mount:** both derived triggers baseline with `undefined` and only fire on `prev === false → true`.
