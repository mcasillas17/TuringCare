# Turing Living Mascot (phase 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Turing react to user wins (wag/hop), doze off when idle, and offer tips relevant to the current page.

**Architecture:** A `TuringProvider` context (mirrors `LocaleProvider`) exposes `celebrate(big?)` and tracks 60s idle→sleep; the artwork gains a single `pose` prop driving the 8-pose handoff visuals; `TuringCompanion` resolves an effective pose and picks route-contextual tips; mutation `onSuccess` hooks call `celebrate`.

**Tech Stack:** React 19, TypeScript, Vite, react-router 7, TanStack Query, Tailwind v4 + plain CSS keyframes, Vitest + Testing Library, Biome.

## Global Constraints

- Web app lives in `apps/web`; run all commands from `apps/web`.
- No new dependencies.
- All user-facing copy goes through the i18n catalogs (`src/i18n/en.ts` + `src/i18n/es.ts`) with en/es **parity** (enforced by `src/i18n/i18n.test.tsx`); es values must differ from en.
- i18n keys are two-level (`section.leaf`); add to the existing `turing` section.
- Honor `prefers-reduced-motion`: no ambient/hop/zzz/idle-sleep loops when set (reuse the existing `matchMedia` check pattern).
- TDD: write the failing test first, watch it fail, minimal code, watch it pass, commit. `pnpm test` = `vitest run`.
- Biome must stay clean: `pnpm exec biome check --write <files>`; typecheck `pnpm exec tsc -b`.
- Turing artwork geometry is owner-approved — copy SVG verbatim from `Turing.dc.html`; do not alter path data.

---

### Task 1: Pure pose → presentation mapping (`turing-poses.ts`)

**Files:**
- Create: `apps/web/src/components/turing/turing-poses.ts`
- Test: `apps/web/src/components/turing/turing-poses.test.ts`

**Interfaces:**
- Produces:
  - `type TuringPose = "idle" | "tilt" | "bark" | "wag" | "celebrate" | "sleep"`
  - `type PosePresentation = { wrapperAnim: string; bodyAnim: string; tailAnim: string; headTransform: string; earLrot: number; earRrot: number; mouthOpen: boolean; sleeping: boolean }`
  - `function posePresentation(pose: TuringPose, reduceMotion: boolean): PosePresentation`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/components/turing/turing-poses.test.ts
import { describe, expect, it } from "vitest";
import { posePresentation } from "./turing-poses";

describe("posePresentation", () => {
  it("idle: slow breathe + sway, mouth closed, awake", () => {
    const p = posePresentation("idle", false);
    expect(p.bodyAnim).toContain("tg-breathe-slow");
    expect(p.tailAnim).toContain("tg-sway");
    expect(p.mouthOpen).toBe(false);
    expect(p.sleeping).toBe(false);
    expect(p.wrapperAnim).toBe("none");
  });

  it("tilt: head rotates and ears splay", () => {
    const p = posePresentation("tilt", false);
    expect(p.headTransform).toBe("rotate(-13deg)");
    expect(p.earLrot).toBe(-7);
    expect(p.earRrot).toBe(6);
  });

  it("wag: faster tail + open mouth", () => {
    const p = posePresentation("wag", false);
    expect(p.tailAnim).toContain("tg-wag ");
    expect(p.mouthOpen).toBe(true);
  });

  it("celebrate: hop wrapper + fast wag + open mouth, body still", () => {
    const p = posePresentation("celebrate", false);
    expect(p.wrapperAnim).toContain("tg-hop");
    expect(p.tailAnim).toContain("tg-wag-fast");
    expect(p.mouthOpen).toBe(true);
    expect(p.bodyAnim).toBe("none");
  });

  it("sleep: slowest breathe, tail still, head droops, sleeping flag", () => {
    const p = posePresentation("sleep", false);
    expect(p.bodyAnim).toContain("5.8s");
    expect(p.tailAnim).toBe("none");
    expect(p.headTransform).toBe("rotate(9deg) translateY(7px)");
    expect(p.sleeping).toBe(true);
  });

  it("reduced motion: no looping animations, but pose semantics intact", () => {
    const p = posePresentation("celebrate", true);
    expect(p.wrapperAnim).toBe("none");
    expect(p.bodyAnim).toBe("none");
    expect(p.tailAnim).toBe("none");
    expect(p.mouthOpen).toBe(true); // static pose still "open mouth"
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test turing-poses`
Expected: FAIL — `posePresentation` not exported / module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/components/turing/turing-poses.ts
/**
 * Pure mapping from a Turing pose to the CSS animation/transform values the
 * artwork applies. Values are copied from the 8-pose handoff (`Turing.dc.html`).
 * Looping animations collapse to "none" under reduced motion; pose semantics
 * (mouth open, sleeping, head transform) are preserved as a static frame.
 */
export type TuringPose = "idle" | "tilt" | "bark" | "wag" | "celebrate" | "sleep";

export type PosePresentation = {
  /** Outer wrapper animation (the celebrate hop). */
  wrapperAnim: string;
  /** Body group breathe animation. */
  bodyAnim: string;
  /** Tail group sway/wag animation. */
  tailAnim: string;
  /** Head group transform (tilt / sleep droop). */
  headTransform: string;
  earLrot: number;
  earRrot: number;
  /** Open (barking/wagging) mouth + tongue shown. */
  mouthOpen: boolean;
  /** Eyes closed + sleep smile lines + floating "zzz" shown. */
  sleeping: boolean;
};

export function posePresentation(pose: TuringPose, reduceMotion: boolean): PosePresentation {
  const sleeping = pose === "sleep";
  const mouthOpen = pose === "wag" || pose === "bark" || pose === "celebrate";

  let bodyAnim = "tg-breathe-slow 4.6s ease-in-out infinite";
  if (pose === "wag" || pose === "bark") bodyAnim = "tg-breathe 2.3s ease-in-out infinite";
  if (pose === "sleep") bodyAnim = "tg-breathe-slow 5.8s ease-in-out infinite";
  if (pose === "celebrate") bodyAnim = "none";

  let tailAnim = "tg-sway 3.6s ease-in-out infinite";
  if (pose === "wag") tailAnim = "tg-wag .5s ease-in-out infinite";
  if (pose === "bark") tailAnim = "tg-wag .58s ease-in-out infinite";
  if (pose === "celebrate") tailAnim = "tg-wag-fast .3s ease-in-out infinite";
  if (pose === "sleep") tailAnim = "none";

  let headTransform = "rotate(0deg)";
  if (pose === "tilt") headTransform = "rotate(-13deg)";
  if (pose === "sleep") headTransform = "rotate(9deg) translateY(7px)";

  const wrapperAnim = pose === "celebrate" ? "tg-hop .72s ease-in-out infinite" : "none";

  if (reduceMotion) {
    bodyAnim = "none";
    tailAnim = "none";
    return {
      wrapperAnim: "none",
      bodyAnim,
      tailAnim,
      headTransform,
      earLrot: pose === "tilt" ? -7 : 0,
      earRrot: pose === "tilt" ? 6 : 0,
      mouthOpen,
      sleeping,
    };
  }

  return {
    wrapperAnim,
    bodyAnim,
    tailAnim,
    headTransform,
    earLrot: pose === "tilt" ? -7 : 0,
    earRrot: pose === "tilt" ? 6 : 0,
    mouthOpen,
    sleeping,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test turing-poses`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/turing/turing-poses.ts apps/web/src/components/turing/turing-poses.test.ts
git commit -m "feat(turing): pure pose->presentation mapping for 8 poses"
```

---

### Task 2: Pose-aware artwork + new keyframes

**Files:**
- Modify: `apps/web/src/index.css` (add `tg-wag-fast`, `tg-hop`, `tg-zzz` keyframes after the existing `tg-bubble` keyframe ~line 211)
- Modify: `apps/web/src/components/turing-head.tsx` (add `sleeping` prop → sleep smile-lines + floating "zzz"; keep `mouthOpen`)
- Modify: `apps/web/src/components/turing-art.tsx` (take `pose` + `reduceMotion`; wrap figure in a hop wrapper `<g>`; derive presentation via `posePresentation`)
- Test: `apps/web/src/components/turing-art.test.tsx` (new)

**Interfaces:**
- Consumes: `posePresentation`, `TuringPose`, `PosePresentation` (Task 1).
- Produces:
  - `TuringArt` new props: `{ pose: TuringPose; reduceMotion: boolean; pupilStyle: CSSProperties; eyesClosed: boolean }` (replaces the old `bodyAnim/tailAnim/headTransform/earLrot/earRrot/mouthOpen/lidRy` prop set).
  - `TuringHead` gains `sleeping: boolean`; keeps `headTransform, earLrot, earRrot, pupilStyle, lidRy, mouthOpen`.

- [ ] **Step 1: Add the keyframes to `index.css`**

Insert after the `@keyframes tg-bubble { … }` block (the existing Turing keyframes group):

```css
@keyframes tg-wag-fast {
  0%,
  100% {
    transform: rotate(-24deg);
  }
  50% {
    transform: rotate(28deg);
  }
}
@keyframes tg-hop {
  0%,
  100% {
    transform: translateY(0);
  }
  28% {
    transform: translateY(-20px);
  }
  50% {
    transform: translateY(0);
  }
  64% {
    transform: translateY(-10px);
  }
  80% {
    transform: translateY(0);
  }
}
@keyframes tg-zzz {
  0% {
    opacity: 0;
    transform: translateY(2px) scale(0.6);
  }
  25% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(-30px) scale(1.15);
  }
}
```

- [ ] **Step 2: Write the failing test**

```tsx
// apps/web/src/components/turing-art.test.tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TuringArt } from "./turing-art";

const base = {
  pupilStyle: { transform: "translate(0px,0px)" },
  eyesClosed: false,
};

describe("TuringArt poses", () => {
  it("celebrate wraps the figure in a hop animation", () => {
    const { container } = render(
      <TuringArt {...base} pose="celebrate" reduceMotion={false} />,
    );
    const hop = Array.from(container.querySelectorAll("g")).some((g) =>
      (g.getAttribute("style") ?? "").includes("tg-hop"),
    );
    expect(hop).toBe(true);
  });

  it("sleep shows the floating zzz text", () => {
    const { container } = render(<TuringArt {...base} pose="sleep" eyesClosed reduceMotion={false} />);
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts.filter((t) => t === "z").length).toBeGreaterThanOrEqual(3);
  });

  it("idle does not render zzz", () => {
    const { container } = render(<TuringArt {...base} pose="idle" reduceMotion={false} />);
    expect(container.querySelectorAll("text").length).toBe(0);
  });

  it("reduced motion removes looping animations", () => {
    const { container } = render(<TuringArt {...base} pose="celebrate" reduceMotion />);
    const anyLoop = Array.from(container.querySelectorAll("g, svg")).some((el) => {
      const s = el.getAttribute("style") ?? "";
      return /tg-(hop|wag|sway|breathe)/.test(s);
    });
    expect(anyLoop).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test turing-art`
Expected: FAIL — `TuringArt` does not accept `pose`/`reduceMotion`; no `text`/`tg-hop`.

- [ ] **Step 4: Update `TuringHead` for sleep extras**

In `apps/web/src/components/turing-head.tsx`, add `sleeping: boolean` to `TuringHeadProps` and destructure it. Render the sleep smile-lines (display gated) right after each eyelid ellipse, and the "zzz" group near the end of the head `<g>` (before its closing tag). Copy the path/text geometry verbatim from `Turing.dc.html` lines 114, 124, 144-148:

```tsx
// after the left eyelid <ellipse ... /> (the #232830 lid):
<path
  d="M85 104 Q96 112 107 104"
  fill="none"
  stroke="#0e1216"
  strokeWidth="3"
  strokeLinecap="round"
  style={{ display: sleeping ? "block" : "none" }}
/>
// after the right eyelid <ellipse ... /> (the #9aa7b2 lid):
<path
  d="M133 104 Q144 112 155 104"
  fill="none"
  stroke="#4a4036"
  strokeWidth="3"
  strokeLinecap="round"
  style={{ display: sleeping ? "block" : "none" }}
/>
// just before the head group's closing </g>:
<g
  style={{ display: sleeping ? "block" : "none" }}
  fontFamily="'Hanken Grotesk', monospace"
  fontWeight="700"
  fill="#7f8d99"
>
  <text x="176" y="46" fontSize="13" style={{ animation: "tg-zzz 2.4s ease-in-out infinite" }}>
    z
  </text>
  <text x="189" y="31" fontSize="17" style={{ animation: "tg-zzz 2.4s ease-in-out infinite .8s" }}>
    z
  </text>
  <text x="204" y="14" fontSize="21" style={{ animation: "tg-zzz 2.4s ease-in-out infinite 1.6s" }}>
    z
  </text>
</g>
```

Note: under reduced motion the zzz still *shows* (static) but the parent passes `sleeping=false` for reduced motion at the `TuringArt` level only if asleep is suppressed; sleep itself is suppressed by the provider (Task 3) under reduced motion, so zzz won't appear. Keep the `<text>` `animation` inline — acceptable since sleep never triggers under reduced motion.

- [ ] **Step 5: Update `TuringArt` to be pose-driven**

Rewrite `apps/web/src/components/turing-art.tsx` props and body:

```tsx
import type { CSSProperties } from "react";
import { posePresentation, type TuringPose } from "./turing/turing-poses";
import { TuringHead } from "./turing-head";

export type TuringArtProps = {
  pose: TuringPose;
  reduceMotion: boolean;
  pupilStyle: CSSProperties;
  eyesClosed: boolean;
};

export function TuringArt({ pose, reduceMotion, pupilStyle, eyesClosed }: TuringArtProps) {
  const p = posePresentation(pose, reduceMotion);
  const lidRy = eyesClosed ? 21 : 0;
  return (
    <svg
      viewBox="0 0 240 270"
      width="100%"
      height="100%"
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
      preserveAspectRatio="xMidYMax meet"
    >
      <ellipse cx="120" cy="259" rx="80" ry="9" fill="#000000" opacity="0.11" />
      {/* NEW outer wrapper carries the celebrate hop */}
      <g style={{ transformBox: "view-box", transformOrigin: "120px 256px", animation: p.wrapperAnim }}>
        <g style={{ transformBox: "view-box", transformOrigin: "120px 256px", animation: p.bodyAnim }}>
          {/* …existing tail group (use p.tailAnim) and body paths unchanged… */}
          {/* …existing tail <g> animation prop becomes p.tailAnim… */}
          <TuringHead
            headTransform={p.headTransform}
            earLrot={p.earLrot}
            earRrot={p.earRrot}
            pupilStyle={pupilStyle}
            lidRy={lidRy}
            mouthOpen={p.mouthOpen}
            sleeping={p.sleeping}
          />
        </g>
      </g>
    </svg>
  );
}
```

Keep all existing body/tail SVG path markup; only (a) wrap the existing body `<g>` in the new hop wrapper `<g>`, (b) change the body group's `animation` to `p.bodyAnim`, (c) change the tail group's `animation` to `p.tailAnim`, (d) pass `sleeping` to `TuringHead`.

- [ ] **Step 6: Run tests**

Run: `pnpm test turing-art turing-poses`
Expected: PASS. Then `pnpm exec biome check --write src/components/turing-art.tsx src/components/turing-head.tsx src/index.css` and `pnpm exec tsc -b` (note: `TuringCompanion` still passes old props — it is updated in Task 5; if running tsc now shows errors only in `turing-companion.tsx`, that's expected and resolved in Task 5).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/index.css apps/web/src/components/turing-art.tsx apps/web/src/components/turing-head.tsx apps/web/src/components/turing-art.test.tsx
git commit -m "feat(turing): pose-aware artwork (sleep zzz, celebrate hop, wag) + keyframes"
```

---

### Task 3: `TuringProvider` / `useTuring()` context

**Files:**
- Create: `apps/web/src/components/turing/turing-context.tsx`
- Test: `apps/web/src/components/turing/turing-context.test.tsx`

**Interfaces:**
- Produces:
  - `type EventPose = "wag" | "celebrate"`
  - `function TuringProvider({ children }: { children: ReactNode })`
  - `function useTuring(): { eventPose: EventPose | null; asleep: boolean; celebrate: (big?: boolean) => void }`
  - Durations: wag 1600ms, celebrate 2600ms; idle 60000ms.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/turing/turing-context.test.tsx
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TuringProvider, useTuring } from "./turing-context";

const wrap = ({ children }: { children: ReactNode }) => <TuringProvider>{children}</TuringProvider>;

afterEach(() => vi.useRealTimers());

describe("useTuring", () => {
  it("no-op fallback without a provider", () => {
    const { result } = renderHook(() => useTuring());
    expect(result.current.eventPose).toBeNull();
    expect(result.current.asleep).toBe(false);
    expect(() => result.current.celebrate()).not.toThrow();
  });

  it("celebrate(false) sets wag then clears after 1.6s", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTuring(), { wrapper: wrap });
    act(() => result.current.celebrate(false));
    expect(result.current.eventPose).toBe("wag");
    act(() => vi.advanceTimersByTime(1600));
    expect(result.current.eventPose).toBeNull();
  });

  it("celebrate(true) sets celebrate then clears after 2.6s", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTuring(), { wrapper: wrap });
    act(() => result.current.celebrate(true));
    expect(result.current.eventPose).toBe("celebrate");
    act(() => vi.advanceTimersByTime(2600));
    expect(result.current.eventPose).toBeNull();
  });

  it("falls asleep after 60s idle and wakes on celebrate", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTuring(), { wrapper: wrap });
    act(() => vi.advanceTimersByTime(60000));
    expect(result.current.asleep).toBe(true);
    act(() => result.current.celebrate(false));
    expect(result.current.asleep).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test turing-context`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/web/src/components/turing/turing-context.tsx
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type EventPose = "wag" | "celebrate";

type TuringApi = {
  eventPose: EventPose | null;
  asleep: boolean;
  celebrate: (big?: boolean) => void;
};

const WAG_MS = 1600;
const CELEBRATE_MS = 2600;
const IDLE_MS = 60000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const Ctx = createContext<TuringApi | null>(null);

export function TuringProvider({ children }: { children: ReactNode }) {
  const [eventPose, setEventPose] = useState<EventPose | null>(null);
  const [asleep, setAsleep] = useState(false);
  const poseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reduce = prefersReducedMotion();

  const resetIdle = useCallback(() => {
    setAsleep(false);
    clearTimeout(idleTimer.current);
    if (reduce) return; // never auto-sleep under reduced motion
    idleTimer.current = setTimeout(() => setAsleep(true), IDLE_MS);
  }, [reduce]);

  const celebrate = useCallback(
    (big = false) => {
      resetIdle();
      clearTimeout(poseTimer.current);
      setEventPose(big ? "celebrate" : "wag");
      poseTimer.current = setTimeout(() => setEventPose(null), big ? CELEBRATE_MS : WAG_MS);
    },
    [resetIdle],
  );

  useEffect(() => {
    resetIdle();
    const onActivity = () => resetIdle();
    window.addEventListener("pointermove", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    return () => {
      window.removeEventListener("pointermove", onActivity);
      window.removeEventListener("keydown", onActivity);
      clearTimeout(idleTimer.current);
      clearTimeout(poseTimer.current);
    };
  }, [resetIdle]);

  const value = useMemo<TuringApi>(
    () => ({ eventPose, asleep, celebrate }),
    [eventPose, asleep, celebrate],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTuring(): TuringApi {
  return useContext(Ctx) ?? { eventPose: null, asleep: false, celebrate: () => {} };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test turing-context`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/turing/turing-context.tsx apps/web/src/components/turing/turing-context.test.tsx
git commit -m "feat(turing): TuringProvider/useTuring context (celebrate + idle sleep)"
```

---

### Task 4: Contextual tip buckets (i18n + helper)

**Files:**
- Modify: `apps/web/src/i18n/en.ts` (extend the `turing` section)
- Modify: `apps/web/src/i18n/es.ts` (extend the `turing` section — parity)
- Modify: `apps/web/src/components/turing-tips.ts` (buckets + `tipContextForPath`)
- Test: `apps/web/src/components/turing-tips.test.ts` (new)

**Interfaces:**
- Consumes: `MessageKey` (`@/i18n/types`).
- Produces:
  - `type TipContext = "general" | "training" | "journal" | "week" | "brief"`
  - `const TURING_TIP_BUCKETS: Record<TipContext, MessageKey[]>`
  - `function tipContextForPath(pathname: string): TipContext`
  - (keep `TURING_TIP_KEYS` as an alias for the general bucket so existing imports/tests still resolve.)

- [ ] **Step 1: Add catalog keys (en).** In `apps/web/src/i18n/en.ts`, replace the `turing` block with:

```ts
  turing: {
    tipAria: "Turing — tap for a training tip",
    tip1: "Catch him being good — then reward it.",
    tip2: "Mark the moment, then treat.",
    tip3: "Short sessions beat long ones.",
    tip4: "Reward what you want repeated.",
    tip5: "Calm earns the treat, not the jump.",
    tip6: "End every session on a win.",
    trainingTip1: "Break each skill into tiny, winnable steps.",
    trainingTip2: "Practice one cue per short session.",
    trainingTip3: "Raise difficulty only after three easy wins.",
    journalTip1: "Note what happened right before the behavior.",
    journalTip2: "Log the small wins, not just the rough days.",
    journalTip3: "A quick note now beats a perfect one later.",
    weekTip1: "Pick two focus skills and rep them daily.",
    weekTip2: "A few minutes a day adds up fast.",
    briefTip1: "Share the brief so your trainer sees the pattern.",
    briefTip2: "Finalize before you send — it locks the version.",
  },
```

- [ ] **Step 2: Add catalog keys (es) — parity.** In `apps/web/src/i18n/es.ts`, replace the `turing` block with:

```ts
  turing: {
    tipAria: "Turing — toca para ver un consejo",
    tip1: "Sorpréndelo portándose bien y prémialo.",
    tip2: "Marca el momento y luego premia.",
    tip3: "Las sesiones cortas funcionan mejor que las largas.",
    tip4: "Premia lo que quieras que se repita.",
    tip5: "La calma gana el premio, no el salto.",
    tip6: "Termina cada sesión con un logro.",
    trainingTip1: "Divide cada habilidad en pasos pequeños y alcanzables.",
    trainingTip2: "Practica una señal por sesión corta.",
    trainingTip3: "Sube la dificultad solo tras tres logros fáciles.",
    journalTip1: "Anota qué pasó justo antes del comportamiento.",
    journalTip2: "Registra los pequeños logros, no solo los días difíciles.",
    journalTip3: "Una nota rápida ahora vale más que una perfecta después.",
    weekTip1: "Elige dos habilidades de enfoque y practícalas a diario.",
    weekTip2: "Unos minutos al día suman rápido.",
    briefTip1: "Comparte el resumen para que tu entrenador vea el patrón.",
    briefTip2: "Finaliza antes de enviar — eso fija la versión.",
  },
```

- [ ] **Step 3: Write the failing test**

```ts
// apps/web/src/components/turing-tips.test.ts
import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { TURING_TIP_BUCKETS, tipContextForPath } from "./turing-tips";

describe("tipContextForPath", () => {
  it.each([
    ["/my/dogs/abc/training", "training"],
    ["/my/dogs/abc/journal", "journal"],
    ["/my/journal", "journal"],
    ["/my/dogs/abc/week", "week"],
    ["/my/dogs/abc/brief", "brief"],
    ["/my/brief", "brief"],
    ["/my", "general"],
    ["/my/dogs/abc", "general"],
  ] as const)("%s -> %s", (path, ctx) => {
    expect(tipContextForPath(path)).toBe(ctx);
  });
});

describe("TURING_TIP_BUCKETS", () => {
  it("every key resolves to a real en catalog string", () => {
    for (const keys of Object.values(TURING_TIP_BUCKETS)) {
      for (const k of keys) {
        const leaf = k.split(".")[1] as keyof typeof en.turing;
        expect(typeof en.turing[leaf]).toBe("string");
      }
    }
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test turing-tips`
Expected: FAIL — `TURING_TIP_BUCKETS` / `tipContextForPath` missing.

- [ ] **Step 5: Implement buckets + helper.** Replace `apps/web/src/components/turing-tips.ts` with:

```ts
import type { MessageKey } from "@/i18n/types";

export type TipContext = "general" | "training" | "journal" | "week" | "brief";

/** i18n catalog keys for each tip context. Strings live in the `turing` section
 *  of the en/es catalogs (parity enforced by the i18n test). */
export const TURING_TIP_BUCKETS: Record<TipContext, MessageKey[]> = {
  general: ["turing.tip1", "turing.tip2", "turing.tip3", "turing.tip4", "turing.tip5", "turing.tip6"],
  training: ["turing.trainingTip1", "turing.trainingTip2", "turing.trainingTip3"],
  journal: ["turing.journalTip1", "turing.journalTip2", "turing.journalTip3"],
  week: ["turing.weekTip1", "turing.weekTip2"],
  brief: ["turing.briefTip1", "turing.briefTip2"],
};

/** Back-compat alias for the default (general) tips. */
export const TURING_TIP_KEYS = TURING_TIP_BUCKETS.general;

/** Pick the tip bucket for the current route. */
export function tipContextForPath(pathname: string): TipContext {
  if (/\/training(\/|$)/.test(pathname)) return "training";
  if (/\/journal(\/|$)/.test(pathname)) return "journal";
  if (/\/week(\/|$)/.test(pathname)) return "week";
  if (/\/brief(\/|$)/.test(pathname)) return "brief";
  return "general";
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm test turing-tips i18n`
Expected: PASS (helper + buckets + i18n parity 9 tests still green with the new keys).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts apps/web/src/components/turing-tips.ts apps/web/src/components/turing-tips.test.ts
git commit -m "feat(turing): route-contextual tip buckets (en+es)"
```

---

### Task 5: `TuringCompanion` integration + mount provider

**Files:**
- Modify: `apps/web/src/components/turing-companion.tsx` (consume `useTuring`, resolve pose, contextual tips, new `TuringArt` props)
- Modify: `apps/web/src/components/turing-companion.test.tsx` (update for pose + provider-driven behaviors)
- Modify: `apps/web/src/components/app-shell/AppShell.tsx` (wrap content in `TuringProvider`)

**Interfaces:**
- Consumes: `useTuring`/`TuringProvider` (Task 3), `posePresentation`/`TuringPose` (Task 1, via `TuringArt`), `TURING_TIP_BUCKETS`/`tipContextForPath` (Task 4), `useI18n` + `useLocation`.
- Produces: the rendered mascot; `pose` precedence: `eventPose` > `bark` > `tilt` > `sleep` > `idle`.

- [ ] **Step 1: Update the component.** Edit `apps/web/src/components/turing-companion.tsx`:

Imports — add:
```tsx
import { useLocation } from "react-router-dom";
import type { TuringPose } from "./turing/turing-poses";
import { useTuring } from "./turing/turing-context";
import { TURING_TIP_BUCKETS, tipContextForPath } from "./turing-tips";
```
Remove the old `TURING_TIP_KEYS` import and the per-element animation props.

In the component body, after `const { t } = useI18n();`:
```tsx
  const { eventPose, asleep } = useTuring();
  const { pathname } = useLocation();
```
Replace the tip-pick in `onClick`:
```tsx
  const onClick = useCallback(() => {
    clearTimeout(bubbleTimer.current);
    const bucket = TURING_TIP_BUCKETS[tipContextForPath(pathname)];
    const key = bucket[Math.floor(Math.random() * bucket.length)] ?? "turing.tip1";
    setTipKey(key);
    setMode("bark");
    bubbleTimer.current = setTimeout(() => {
      setTipKey(null);
      setMode("idle");
    }, BUBBLE_MS);
  }, [pathname]);
```
Replace the derived render values + `<TuringArt>` usage:
```tsx
  const sleeping = asleep && mode === "idle" && !eventPose;
  const eyesClosed = blink || sleeping;
  const pose: TuringPose =
    eventPose ?? (mode === "bark" ? "bark" : mode === "tilt" ? "tilt" : sleeping ? "sleep" : "idle");

  const px = eyesClosed ? 0 : pupil.x;
  const py = eyesClosed ? 0 : pupil.y;
  const pupilStyle: CSSProperties = {
    transform: `translate(${px}px,${py}px)`,
    transition: "transform .09s linear",
  };
```
And the JSX art element:
```tsx
      <TuringArt pose={pose} reduceMotion={reduceMotion} pupilStyle={pupilStyle} eyesClosed={eyesClosed} />
```
(Keep the existing `<button className="turing-companion" aria-label={t("turing.tipAria")} …>` and the `{tipKey && (<output className="turing-bubble">{t(tipKey)}…)}` bubble unchanged.)

- [ ] **Step 2: Update the test file** `apps/web/src/components/turing-companion.test.tsx` — the existing tests need a router (`useLocation`) and provider. Replace the render helpers:

```tsx
import { MemoryRouter } from "react-router-dom";
import { TuringProvider } from "./turing/turing-context";
import { TURING_TIP_BUCKETS } from "./turing-tips";
// ...
function renderAt(path = "/my", locale?: "es") {
  if (locale) localStorage.setItem("tc-locale", locale);
  return render(
    <LocaleProvider>
      <TuringProvider>
        <MemoryRouter initialEntries={[path]}>
          <TuringCompanion />
        </MemoryRouter>
      </TuringProvider>
    </LocaleProvider>,
  );
}
```
Update existing cases to use `renderAt()`. Keep: renders aria-label; bubble hidden until click; click shows a tip (now assert the tip is in the union of all bucket-resolved en strings); hides after 3.6s; es localizes label+tip; reduced-motion disables animation. Add:

```tsx
it("shows a training-context tip on the training route", () => {
  renderAt("/my/dogs/abc/training");
  fireEvent.click(screen.getByRole("button", { name: en.turing.tipAria }));
  const trainingTips = TURING_TIP_BUCKETS.training.map(
    (k) => en.turing[k.split(".")[1] as keyof typeof en.turing],
  );
  expect(trainingTips).toContain(screen.getByRole("status").textContent);
});
```

- [ ] **Step 3: Mount the provider in AppShell.** In `apps/web/src/components/app-shell/AppShell.tsx`, import `TuringProvider` and wrap the outermost returned element's children so both the page content and `<TuringCompanion />` are inside it:

```tsx
import { TuringProvider } from "@/components/turing/turing-context";
// wrap the existing return:
return (
  <TuringProvider>
    {/* …existing root <div> … <TuringCompanion /> … */}
  </TuringProvider>
);
```

- [ ] **Step 4: Run tests + typecheck + lint**

Run: `pnpm test turing && pnpm exec tsc -b && pnpm exec biome check --write src/components/turing-companion.tsx src/components/app-shell/AppShell.tsx`
Expected: PASS; tsc 0 errors; Biome clean.

- [ ] **Step 5: Full suite**

Run: `pnpm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/turing-companion.tsx apps/web/src/components/turing-companion.test.tsx apps/web/src/components/app-shell/AppShell.tsx
git commit -m "feat(turing): pose resolution + contextual tips + mount TuringProvider"
```

---

### Task 6: Wire celebrate into mutation hooks

**Files:**
- Modify: `apps/web/src/lib/journal.ts` (`useAddEntry` onSuccess ~line 65 → `celebrate(false)`)
- Modify: `apps/web/src/lib/progress.ts` (`useLogSession` onSuccess ~line 126 → `celebrate(false)`)
- Modify: `apps/web/src/lib/training-catalog.ts` (`useApplyTemplate` onSuccess ~line 59 → `celebrate(false)`)
- Modify: `apps/web/src/lib/brief.ts` (`useFinalizeBrief` ~line 42, `useShareBrief` ~line 57 → `celebrate(true)`)
- Modify: `apps/web/src/lib/brief-send.ts` (`useSendBrief` onSuccess ~line 27 → `celebrate(true)`)
- Test: `apps/web/src/lib/turing-triggers.test.tsx` (new — representative coverage)

**Interfaces:**
- Consumes: `useTuring` (Task 3). Each hook calls `useTuring()` at its top level (Rules of Hooks) and invokes `celebrate(...)` inside its existing `onSuccess`.

- [ ] **Step 1: Write the failing test** (representative: journal small + brief big)

```tsx
// apps/web/src/lib/turing-triggers.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const celebrate = vi.fn();
vi.mock("@/components/turing/turing-context", () => ({
  useTuring: () => ({ eventPose: null, asleep: false, celebrate }),
}));
vi.mock("@/lib/api", () => ({
  api: {
    dogs: {
      ":id": {
        journal: { $post: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "e1" }) }) },
      },
    },
  },
}));

import { useAddEntry } from "./journal";

const wrap = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

afterEach(() => vi.clearAllMocks());

describe("turing celebrate triggers", () => {
  it("journal save fires a small wag", async () => {
    const { result } = renderHook(() => useAddEntry("d1"), { wrapper: wrap });
    await act(async () => {
      await result.current.mutateAsync({ kind: "moment", note: "good sit" } as never);
    });
    await waitFor(() => expect(celebrate).toHaveBeenCalledWith(false));
  });
});
```

Note: the exact `api` mock shape must match how `journal.ts` calls the client — open `src/lib/journal.ts` and mirror its `api...$post` call path in the mock. Adjust the mock to the real call (the structure above is illustrative).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test turing-triggers`
Expected: FAIL — `celebrate` not called (hook doesn't trigger it yet).

- [ ] **Step 3: Wire the hooks.** In each file, add at the top of the hook body:
```ts
const { celebrate } = useTuring();
```
(import: `import { useTuring } from "@/components/turing/turing-context";`)
and call it in the existing `onSuccess`. Small (`false`) for journal/session/template; big (`true`) for brief finalize/share/send. Example for `useAddEntry` (`lib/journal.ts`):

```ts
export function useAddEntry(dogId: string) {
  const qc = useQueryClient();
  const { celebrate } = useTuring();
  return useMutation({
    mutationFn: async (body: JournalEntryCreateInput) => {
      /* …unchanged… */
    },
    onSuccess: () => {
      celebrate(false);
      /* …existing invalidate calls unchanged… */
    },
  });
}
```
Repeat the pattern in `useLogSession` (progress.ts, `celebrate(false)` — note its `onSuccess` is the arrow `() => invalidateProgress(qc, dogId)`; expand to a block that also calls `celebrate(false)`), `useApplyTemplate` (`celebrate(false)`), `useFinalizeBrief` + `useShareBrief` (`celebrate(true)`), `useSendBrief` (`celebrate(true)`).

- [ ] **Step 4: Run test + full suite**

Run: `pnpm test turing-triggers && pnpm test`
Expected: PASS; full suite green.

- [ ] **Step 5: typecheck + lint + build**

Run: `pnpm exec tsc -b && pnpm exec biome check --write src/lib/journal.ts src/lib/progress.ts src/lib/training-catalog.ts src/lib/brief.ts src/lib/brief-send.ts && pnpm build`
Expected: clean; build OK.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/journal.ts apps/web/src/lib/progress.ts apps/web/src/lib/training-catalog.ts apps/web/src/lib/brief.ts apps/web/src/lib/brief-send.ts apps/web/src/lib/turing-triggers.test.tsx
git commit -m "feat(turing): celebrate on journal/training (wag) and brief milestones (hop)"
```

---

## Final verification (after all tasks)

- [ ] `pnpm test` (web) all green; `pnpm exec tsc -b` 0 errors; `pnpm exec biome check` clean; `pnpm build` OK.
- [ ] `npx react-doctor@latest --diff` — no new findings attributable to changed files (the intentional bounce easing is pre-existing/owner-approved).
- [ ] Update `docs/PROJECT-LOG.md` with a phase-2b entry.
- [ ] Manual QA: journal save→wag; finalize/share brief→hop; idle ~60s→sleep + zzz, wake on move; tap on /training→training tip; ES toggle→Spanish tips/label; narrow window→bubble on-screen.
- [ ] Open PR to `main`.

## Self-review notes

- **Spec coverage:** provider+celebrate (T3), idle sleep (T3), 8-pose artwork incl. sleep/celebrate/wag (T1+T2), tiered celebrate (T6 small vs big), contextual tips (T4+T5), reduced-motion (T1/T2/T3). All covered.
- **Type consistency:** `TuringPose` (T1) used by `TuringArt` (T2) and `TuringCompanion` (T5); `EventPose` (T3) is the celebrate subset; `celebrate(big?: boolean)` signature consistent across T3/T5/T6; `TipContext`/`TURING_TIP_BUCKETS`/`tipContextForPath` consistent T4→T5.
- **Out of scope confirmed:** no `sit`/`lie`, no sound, no settings toggle.
