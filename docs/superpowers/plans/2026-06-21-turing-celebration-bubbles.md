# Turing — Celebration Bubbles + Cooldown (phase 2d) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give Turing's milestone hops a short contextual message, and throttle frequent wags so reactions don't become noise.

**Architecture:** Extend the `TuringProvider` celebrate API to carry a message key + a wag cooldown; `TuringCompanion` renders the message in the existing bubble; hop trigger sites pass a message key.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest + Testing Library, Biome.

## Global Constraints

- `apps/web`; run commands from there. No new dependencies.
- Bubble messages appear on **hops only**; wags stay silent (no message) even if a key is passed.
- i18n: new keys in the `turing` section of BOTH `src/i18n/en.ts` and `src/i18n/es.ts`; en/es parity enforced by `src/i18n/i18n.test.tsx` (es must differ from en). Keys are two-level (`turing.leaf`).
- Message keys are `MessageKey` (from `@/i18n/types`); resolve with `t()` in the component (store the key, not the string).
- `prefers-reduced-motion`: the message still shows under reduced motion (only the hop motion is suppressed).
- TDD. Final gate: `pnpm test` green, `pnpm exec tsc -b` 0, **root** `pnpm biome check .` clean (run from repo root), `pnpm build` OK.

---

### Task 1: Message-carrying celebrate + wag cooldown (`turing-context.tsx`)

**Files:**
- Modify: `apps/web/src/components/turing/turing-context.tsx`
- Modify: `apps/web/src/components/turing/turing-context.test.tsx`

**Interfaces:**
- Produces: `useTuring()` now returns `{ eventPose, eventMessage: MessageKey | null, asleep, celebrate: (big?: boolean, messageKey?: MessageKey) => void }`. Constant `WAG_COOLDOWN_MS = 8000`.

- [ ] **Step 1: Write failing tests.** Add to `turing-context.test.tsx` (it uses fake timers + `renderHook`/`act` + a `TuringProvider` wrapper):

```tsx
it("a hop carries its message; the message clears with the pose", () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useTuring(), { wrapper: wrap });
  act(() => result.current.celebrate(true, "turing.celebrateDog"));
  expect(result.current.eventPose).toBe("celebrate");
  expect(result.current.eventMessage).toBe("turing.celebrateDog");
  act(() => vi.advanceTimersByTime(2600));
  expect(result.current.eventPose).toBeNull();
  expect(result.current.eventMessage).toBeNull();
});

it("a wag never shows a message even if a key is passed", () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useTuring(), { wrapper: wrap });
  act(() => result.current.celebrate(false, "turing.celebrateDog"));
  expect(result.current.eventPose).toBe("wag");
  expect(result.current.eventMessage).toBeNull();
});

it("throttles a second wag within the cooldown", () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useTuring(), { wrapper: wrap });
  act(() => result.current.celebrate(false));          // first wag plays
  act(() => vi.advanceTimersByTime(1600));               // pose clears
  expect(result.current.eventPose).toBeNull();
  act(() => result.current.celebrate(false));            // within 8s → suppressed
  expect(result.current.eventPose).toBeNull();
});

it("a hop always plays even during the wag cooldown, and re-throttles wags", () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useTuring(), { wrapper: wrap });
  act(() => result.current.celebrate(false));            // arms cooldown
  act(() => vi.advanceTimersByTime(1600));
  act(() => result.current.celebrate(true, "turing.celebrateBrief")); // hop bypasses
  expect(result.current.eventPose).toBe("celebrate");
  act(() => vi.advanceTimersByTime(2600));
  act(() => result.current.celebrate(false));            // still within 8s of the hop → suppressed
  expect(result.current.eventPose).toBeNull();
});
```

- [ ] **Step 2: Run, verify fail.** `pnpm test turing-context` → FAIL (`eventMessage` missing; cooldown not implemented).

- [ ] **Step 3: Implement.** In `turing-context.tsx`:
  - Add `import type { MessageKey } from "@/i18n/types";`.
  - Add `const WAG_COOLDOWN_MS = 8000;` near the other constants.
  - Extend `TuringApi`: `eventMessage: MessageKey | null;` and `celebrate: (big?: boolean, messageKey?: MessageKey) => void;`.
  - Add state `const [eventMessage, setEventMessage] = useState<MessageKey | null>(null);` and refs `const wagCooldown = useRef(false);` + `const wagCdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);`.
  - Rewrite `celebrate`:
```tsx
  const celebrate = useCallback(
    (big = false, messageKey?: MessageKey) => {
      if (!big && wagCooldown.current) return; // throttle repeat wags
      resetIdle();
      clearTimeout(poseTimer.current);
      setEventPose(big ? "celebrate" : "wag");
      setEventMessage(big ? (messageKey ?? null) : null); // messages on hops only
      wagCooldown.current = true; // both wag and hop suppress subsequent wags for a bit
      clearTimeout(wagCdTimer.current);
      wagCdTimer.current = setTimeout(() => {
        wagCooldown.current = false;
      }, WAG_COOLDOWN_MS);
      poseTimer.current = setTimeout(
        () => {
          setEventPose(null);
          setEventMessage(null);
        },
        big ? CELEBRATE_MS : WAG_MS,
      );
    },
    [resetIdle],
  );
```
  - In the cleanup of the activity `useEffect`, also `clearTimeout(wagCdTimer.current);`.
  - Add `eventMessage` to the `useMemo` value + its dep array; add `eventMessage: null` to the no-op fallback in `useTuring`.

- [ ] **Step 4: Run + gates.** `pnpm test turing-context` PASS; `pnpm exec tsc -b` 0; `pnpm exec biome check --write src/components/turing/turing-context.tsx src/components/turing/turing-context.test.tsx`. (Full suite will have failures in `turing-companion`/`turing-triggers` until Tasks 2-3 — that's expected; do NOT fix them here. Run only the focused test for this task.)

- [ ] **Step 5: Commit.**
```bash
git add apps/web/src/components/turing/turing-context.tsx apps/web/src/components/turing/turing-context.test.tsx
git commit -m "feat(turing): celebrate carries a message key + wag cooldown"
```

---

### Task 2: Bubble rendering + message copy (`turing-companion.tsx` + i18n)

**Files:**
- Modify: `apps/web/src/components/turing-companion.tsx`
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`
- Modify: `apps/web/src/components/turing-companion.test.tsx`

**Interfaces:**
- Consumes: `useTuring().eventMessage` (Task 1).

- [ ] **Step 1: Add the i18n keys.** In the `turing` section of `src/i18n/en.ts` add:
```ts
    celebrateDog: "New pup! 🐾",
    celebrateMastery: "Mastered it! 🎉",
    celebrateOnboarding: "You're all set! 🎉",
    celebrateWeek: "Week done! 🏅",
    celebrateBrief: "Brief ready! 📋",
```
and the matching keys in `src/i18n/es.ts`:
```ts
    celebrateDog: "¡Nuevo cachorro! 🐾",
    celebrateMastery: "¡Dominado! 🎉",
    celebrateOnboarding: "¡Todo listo! 🎉",
    celebrateWeek: "¡Semana completa! 🏅",
    celebrateBrief: "¡Resumen listo! 📋",
```

- [ ] **Step 2: Write the failing component test.** In `turing-companion.test.tsx` (it has a `renderAt` helper wrapping LocaleProvider + TuringProvider + MemoryRouter — note that helper uses the REAL provider; to inject an `eventMessage` you must mock `useTuring`). Add a test that mocks `useTuring` to return an active message and asserts the bubble shows it:

```tsx
import * as turingCtx from "./turing/turing-context";

it("shows the celebration message in the bubble", () => {
  vi.spyOn(turingCtx, "useTuring").mockReturnValue({
    eventPose: "celebrate",
    eventMessage: "turing.celebrateBrief",
    asleep: false,
    celebrate: vi.fn(),
  });
  render(
    <LocaleProvider>
      <MemoryRouter><TuringCompanion /></MemoryRouter>
    </LocaleProvider>,
  );
  expect(screen.getByRole("status").textContent).toBe(en.turing.celebrateBrief);
  vi.restoreAllMocks();
});
```
(Use the existing imports in the file; add `en` from `@/i18n/en` if not present. If the file already mocks `useTuring` at module scope, instead drive `eventMessage` through that existing mock — read the file first and follow its established mocking style.)

- [ ] **Step 3: Run, verify fail.** `pnpm test turing-companion` → FAIL (bubble doesn't read `eventMessage`).

- [ ] **Step 4: Implement.** In `turing-companion.tsx`:
  - Destructure `eventMessage` from `useTuring()` (line ~38: `const { eventPose, eventMessage, asleep } = useTuring();`).
  - Compute `const bubbleKey = eventMessage ?? tipKey;`.
  - Change the bubble render from `{tipKey && (… {t(tipKey)} …)}` to `{bubbleKey && (… {t(bubbleKey)} …)}`.

- [ ] **Step 5: Run + gates.** `pnpm test turing-companion i18n` PASS (component + parity); `pnpm exec tsc -b` 0; `pnpm exec biome check --write src/components/turing-companion.tsx src/components/turing-companion.test.tsx src/i18n/en.ts src/i18n/es.ts`. (turing-triggers may still fail until Task 3 — expected.)

- [ ] **Step 6: Commit.**
```bash
git add apps/web/src/components/turing-companion.tsx apps/web/src/components/turing-companion.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(turing): show the celebration message in the bubble (en+es)"
```

---

### Task 3: Wire messages into the hop triggers

**Files:**
- Modify: `apps/web/src/lib/dogs.ts`, `apps/web/src/lib/progress.ts`, `apps/web/src/lib/brief.ts`, `apps/web/src/lib/brief-send.ts`, `apps/web/src/components/onboarding/checklist.tsx`, `apps/web/src/routes/dog-week.tsx`
- Modify: `apps/web/src/lib/turing-triggers.test.tsx`

**Interfaces:**
- Consumes: the 2-arg `celebrate` (Task 1) and the message keys (Task 2).

- [ ] **Step 1: Update the failing tests.** In `turing-triggers.test.tsx`, change the **hop** assertions to the 2-arg form (leave wag/error assertions as-is):
  - send brief: `expect(celebrate).toHaveBeenCalledWith(true, "turing.celebrateBrief")`
  - add dog: `expect(celebrate).toHaveBeenCalledWith(true, "turing.celebrateDog")`
  - skill confidence 5: `expect(celebrate).toHaveBeenCalledWith(true, "turing.celebrateMastery")`
  - skill confidence 3: stays `expect(celebrate).toHaveBeenCalledWith(false)` (non-mastery wag, one arg)
  - add goal: stays `(false)`; journal: stays `(false)`; error: not called.

- [ ] **Step 2: Run, verify fail.** `pnpm test turing-triggers` → FAIL (hops still call `celebrate(true)` with no message).

- [ ] **Step 3: Wire the message keys.** Add the 2nd arg at each hop call site (keep all surrounding logic):
  - `lib/dogs.ts` `useCreateDog` onSuccess → `celebrate(true, "turing.celebrateDog");`
  - `lib/progress.ts` `useUpdateSkillConfidence` onSuccess → replace the single call with:
```ts
      const mastered = variables.body.confidence >= CONFIDENCE_MAX;
      if (mastered) celebrate(true, "turing.celebrateMastery");
      else celebrate(false);
      invalidateProgress(qc, dogId);
```
  - `components/onboarding/checklist.tsx` effect → `celebrate(true, "turing.celebrateOnboarding");`
  - `routes/dog-week.tsx` effect → `celebrate(true, "turing.celebrateWeek");`
  - `lib/brief.ts` `useFinalizeBrief` + `useShareBrief` → `celebrate(true, "turing.celebrateBrief");`
  - `lib/brief-send.ts` `useSendBrief` → `celebrate(true, "turing.celebrateBrief");`
  - Leave `useAddGoal`, `useAddEntry`, `useLogSession`, `useApplyTemplate` as `celebrate(false)`.

- [ ] **Step 4: Run + full gates.** `pnpm test turing-triggers` PASS; `pnpm test` FULL suite green; `pnpm exec tsc -b` 0; `pnpm exec biome check --write` on the 6 changed files.

- [ ] **Step 5: Commit.**
```bash
git add apps/web/src/lib/dogs.ts apps/web/src/lib/progress.ts apps/web/src/lib/brief.ts apps/web/src/lib/brief-send.ts apps/web/src/components/onboarding/checklist.tsx apps/web/src/routes/dog-week.tsx apps/web/src/lib/turing-triggers.test.tsx
git commit -m "feat(turing): contextual messages on milestone hops"
```

---

## Final verification (after all tasks)

- [ ] `pnpm test` green; `pnpm exec tsc -b` 0; **root** `pnpm biome check .` clean; `pnpm build` OK.
- [ ] `npx react-doctor@latest --diff` — no new findings on changed files.
- [ ] Update `docs/PROJECT-LOG.md` with a phase-2d entry.
- [ ] Open PR to `main`.

## Self-review notes

- **Spec coverage:** message-carrying celebrate (T1), hop-only message + reduced-motion-shows-message (T1/T2), cooldown wags/hops (T1), bubble render + precedence (T2), en/es copy (T2), wiring all hop sites (T3), updated trigger assertions (T3). Covered.
- **Type consistency:** `celebrate(big?, messageKey?: MessageKey)` and `eventMessage: MessageKey | null` consistent across T1/T2/T3; the 5 `turing.celebrate*` keys match between en.ts, es.ts, the wiring, and the tests.
- **No-regression:** wags unchanged (`celebrate(false)`, silent); cooldown can't suppress a hop; message clears with pose.
