# Turing — "Quiet Turing" Hide Setting (phase 2e) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let users hide Turing via a Settings toggle, persisted per-device.

**Architecture:** A `hidden` preference on `TuringProvider` (localStorage-backed); `TuringCompanion` returns null when hidden; a Settings checkbox flips it.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest + Testing Library, Biome.

## Global Constraints

- `apps/web`; run from there. No new dependencies (no Switch component — use a native labeled checkbox).
- Persist in `localStorage` key `tc-turing-hidden` (guarded read/write, try/catch). Default `false` (shown).
- i18n: new keys in BOTH `src/i18n/en.ts` and `src/i18n/es.ts` (`settings` section), es differs from en; parity test enforces.
- Rules of Hooks: any early `return null` goes AFTER all hook calls.
- TDD. Final gate: `pnpm test` green, `pnpm exec tsc -b` 0, **root** `pnpm biome check .` clean, `pnpm build` OK.

---

### Task 1: `hidden` preference on the provider + hide the companion

**Files:**
- Modify: `apps/web/src/components/turing/turing-context.tsx`
- Modify: `apps/web/src/components/turing/turing-context.test.tsx`
- Modify: `apps/web/src/components/turing-companion.tsx`
- Modify: `apps/web/src/components/turing-companion.test.tsx`

**Interfaces:**
- Produces: `useTuring()` gains `hidden: boolean` + `setHidden: (v: boolean) => void`.

- [ ] **Step 1: Write failing context tests.** Add to `turing-context.test.tsx` (fake timers + `renderHook` + `TuringProvider` wrapper; clears localStorage in afterEach — confirm/add):

```tsx
it("hidden defaults to false and setHidden persists", () => {
  const { result } = renderHook(() => useTuring(), { wrapper: wrap });
  expect(result.current.hidden).toBe(false);
  act(() => result.current.setHidden(true));
  expect(result.current.hidden).toBe(true);
  expect(localStorage.getItem("tc-turing-hidden")).toBe("true");
});

it("reads an existing hidden preference on init", () => {
  localStorage.setItem("tc-turing-hidden", "true");
  const { result } = renderHook(() => useTuring(), { wrapper: wrap });
  expect(result.current.hidden).toBe(true);
});
```
Add `afterEach(() => localStorage.clear())` if the file doesn't already clear it.

- [ ] **Step 2: Run, verify fail.** `pnpm test turing-context` → FAIL (`hidden`/`setHidden` missing).

- [ ] **Step 3: Implement in `turing-context.tsx`.**
  - Add a constant `const HIDDEN_KEY = "tc-turing-hidden";` and a guarded reader:
```tsx
function readHidden(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(HIDDEN_KEY) === "true";
  } catch {
    return false;
  }
}
```
  - In the type `TuringApi`, add `hidden: boolean;` and `setHidden: (v: boolean) => void;`.
  - In `TuringProvider`: `const [hidden, setHiddenState] = useState<boolean>(readHidden);` and
```tsx
  const setHidden = useCallback((v: boolean) => {
    setHiddenState(v);
    try {
      localStorage.setItem(HIDDEN_KEY, String(v));
    } catch {
      /* ignore */
    }
  }, []);
```
  - In the activity `useEffect`, early-return when hidden so no listeners/timers run:
    `useEffect(() => { if (hidden) return; resetIdle(); … existing body …; return () => { … existing cleanup … }; }, [resetIdle, hidden]);`
  - Add `hidden`, `setHidden` to the `useMemo` value + dep array.
  - Add `hidden: false, setHidden: () => {}` to the `useTuring` no-op fallback.

- [ ] **Step 4: Write the failing component test.** In `turing-companion.test.tsx` (follow its existing `useTuring` mocking style; it already spies/mocks `useTuring`):
```tsx
it("renders nothing when hidden", () => {
  vi.spyOn(turingCtx, "useTuring").mockReturnValue({
    eventPose: null, eventMessage: null, asleep: false, hidden: true,
    celebrate: vi.fn(), setHidden: vi.fn(),
  });
  render(<LocaleProvider><MemoryRouter><TuringCompanion /></MemoryRouter></LocaleProvider>);
  expect(screen.queryByRole("button", { name: /turing/i })).toBeNull();
});
```
(Match the file's actual mock approach — if it mocks the module at top scope, set `hidden:true` through that mock instead. Read the file first.)

- [ ] **Step 5: Run, verify fail.** `pnpm test turing-companion` → FAIL (still renders the button).

- [ ] **Step 6: Implement in `turing-companion.tsx`.**
  - Destructure `hidden` from `useTuring()` (line ~38).
  - Add `hidden` to the early-return guard of the eye-follow and blink effects: `if (reduceMotion || hidden) return;` and add `hidden` to those effects' dep arrays.
  - Immediately before the final `return (<button …>)`, add: `if (hidden) return null;` (after ALL hook calls).

- [ ] **Step 7: Run + gates.** `pnpm test turing-context turing-companion` PASS; `pnpm exec tsc -b` 0; `pnpm exec biome check --write` on the 4 files. (Full suite: `settings.test.tsx` is unaffected yet; should stay green — run `pnpm test` to confirm.)

- [ ] **Step 8: Commit.**
```bash
git add apps/web/src/components/turing/turing-context.tsx apps/web/src/components/turing/turing-context.test.tsx apps/web/src/components/turing-companion.tsx apps/web/src/components/turing-companion.test.tsx
git commit -m "feat(turing): hidden preference (localStorage) + hide the companion"
```

---

### Task 2: Settings toggle + i18n

**Files:**
- Modify: `apps/web/src/routes/settings.tsx`
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`
- Modify: `apps/web/src/routes/settings.test.tsx`

**Interfaces:**
- Consumes: `useTuring().hidden` + `setHidden` (Task 1).

- [ ] **Step 1: Add i18n keys.** In the `settings` section of `src/i18n/en.ts`:
```ts
    companion: "Companion",
    showTuring: "Show Turing",
    showTuringHint: "Your training companion in the corner",
```
and `src/i18n/es.ts`:
```ts
    companion: "Compañero",
    showTuring: "Mostrar a Turing",
    showTuringHint: "Tu compañero de entrenamiento en la esquina",
```

- [ ] **Step 2: Write the failing settings test.** In `settings.test.tsx` (read it first for its render/wrapper style — it will now need `useTuring`; either wrap in `TuringProvider` or mock `@/components/turing/turing-context`). Add:
```tsx
it("toggles Turing visibility", () => {
  const setHidden = vi.fn();
  vi.spyOn(turingCtx, "useTuring").mockReturnValue({
    eventPose: null, eventMessage: null, asleep: false, hidden: false,
    celebrate: vi.fn(), setHidden,
  });
  renderSettings(); // existing helper
  fireEvent.click(screen.getByLabelText(/show turing/i));
  expect(setHidden).toHaveBeenCalledWith(true);
});
```

- [ ] **Step 3: Run, verify fail.** `pnpm test settings` → FAIL (no such control).

- [ ] **Step 4: Implement in `settings.tsx`.** Add `import { useTuring } from "@/components/turing/turing-context";`, read `const { hidden, setHidden } = useTuring();`, and add a section (place it after Language, before Account):
```tsx
      <section className="space-y-2">
        <h2 className="font-semibold text-slate">{t("settings.companion")}</h2>
        <label className="flex items-center gap-2 text-slate">
          <input
            type="checkbox"
            checked={!hidden}
            onChange={(e) => setHidden(!e.target.checked)}
          />
          {t("settings.showTuring")}
        </label>
        <p className="text-sm text-slate-soft">{t("settings.showTuringHint")}</p>
      </section>
```
(Checked = shown; unchecking hides → `setHidden(true)`.)

- [ ] **Step 5: Run + full gates.** `pnpm test settings i18n` PASS; `pnpm test` FULL suite green; `pnpm exec tsc -b` 0; `pnpm exec biome check --write src/routes/settings.tsx src/routes/settings.test.tsx src/i18n/en.ts src/i18n/es.ts`.

- [ ] **Step 6: Commit.**
```bash
git add apps/web/src/routes/settings.tsx apps/web/src/routes/settings.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(turing): Settings toggle to show/hide Turing (en+es)"
```

---

## Final verification (after all tasks)

- [ ] `pnpm test` green; `pnpm exec tsc -b` 0; **root** `pnpm biome check .` clean; `pnpm build` OK.
- [ ] `npx react-doctor@latest --diff` — no new findings on changed files.
- [ ] Update `docs/PROJECT-LOG.md` with a phase-2e entry.
- [ ] Open PR to `main`.

## Self-review notes

- **Spec coverage:** provider hidden+persistence+idle-skip (T1), component null-when-hidden + ambient-skip (T1), settings toggle + copy (T2). Covered.
- **Type consistency:** `hidden: boolean` + `setHidden: (v: boolean) => void` consistent across context, fallback, component, settings, and all mocks; `tc-turing-hidden` key identical in reader/writer/tests.
- **Rules of Hooks:** `if (hidden) return null` is placed after all hooks in TuringCompanion.
