# TuringCare Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `/` route with a warm, modern, subtly-animated marketing landing page in Turing's blue-merle/copper palette, scoped strictly to the public route.

**Architecture:** `routes/landing.tsx` becomes a thin composition of nine presentational section components under `components/landing/`, plus a `Reveal` wrapper and a `useInView` hook for scroll-reveal that fails safe under `prefers-reduced-motion`. Brand colors are added as Tailwind v4 `@theme` tokens alongside the existing shadcn tokens. One new shadcn component (`accordion`) for the FAQ. No new runtime dependencies.

**Tech Stack:** React 19 + TypeScript, Tailwind CSS v4 (CSS-first), shadcn/ui, lucide-react (existing), Vitest + Testing Library (test infra added this plan).

**Spec:** `docs/superpowers/specs/2026-05-17-landing-page-design.md`

**Conventions:** gpg-unsigned commits ending with the trailer:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
Use `git -c commit.gpgsign=false commit -m "<subject>" -m "<trailer>"`. Work on `main` (project is continuously deployed; the user will push at the end). Run web commands from repo root with `pnpm --filter @turingcare/web …`.

---

## File Structure

```
apps/web/
  src/
    index.css                      MODIFY: append brand @theme tokens + 2 keyframes
    routes/landing.tsx             REPLACE: thin composition of sections
    hooks/use-in-view.ts           CREATE: IntersectionObserver hook (reduced-motion safe)
    components/landing/
      reveal.tsx                   CREATE: scroll-reveal wrapper
      site-nav.tsx                 CREATE
      hero.tsx                     CREATE
      how-it-works.tsx             CREATE
      brief-spotlight.tsx          CREATE
      philosophy.tsx               CREATE
      trainers-teaser.tsx          CREATE
      faq.tsx                      CREATE (uses ui/accordion)
      cta-band.tsx                 CREATE
      site-footer.tsx              CREATE
    components/ui/accordion.tsx    CREATE (shadcn add)
    test/setup.ts                  CREATE: jest-dom + matchMedia stub
    routes/landing.test.tsx        CREATE: composition + FAQ test
    hooks/use-in-view.test.ts      CREATE: reduced-motion fallback test
  vitest.config.ts                 CREATE: jsdom env + setup
  package.json                     MODIFY: add test devDeps + ensure test script
```

Each section component is self-contained and presentational (no props, no data fetching). `Reveal` + `useInView` are the only logic units and are unit-tested.

---

## Task 1: Brand palette tokens + keyframes

**Files:** Modify `apps/web/src/index.css`

- [ ] **Step 1: Inspect the current file**

Run: `sed -n '1,20p' apps/web/src/index.css`
Expected: it starts with `@import "tailwindcss";` (and shadcn imports/`@theme`/`:root` blocks below). Do not remove anything.

- [ ] **Step 2: Append a brand `@theme` block + keyframes at the END of the file**

Tailwind v4 merges multiple `@theme` blocks, so appending is safe and non-destructive. Append exactly:

```css

/* ---- TuringCare brand palette (Turing: blue-merle + copper points) ---- */
@theme {
  --color-cream: #faf6ef;
  --color-surface: #ffffff;
  --color-surface-sand: #f4eee3;
  --color-slate: #28323d;
  --color-slate-soft: #4a5c6e;
  --color-silver: #c9d4dd;
  --color-copper: #c8893b;
  --color-gold: #e0a85a;
  --color-ice: #7fb8d6;
}

@keyframes tc-drift {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(2%, -3%, 0) scale(1.06); }
}
@keyframes tc-fade-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .tc-drift { animation: none !important; }
}
.tc-drift { animation: tc-drift 14s ease-in-out infinite; }
```

- [ ] **Step 3: Verify build still works and tokens generate utilities**

Run: `pnpm --filter @turingcare/web build`
Expected: `tsc -b && vite build` succeeds, `dist/` produced (no CSS errors).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/index.css
git -c commit.gpgsign=false commit -m "feat(web): add TuringCare brand palette tokens" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Web test infrastructure (Vitest + jsdom + Testing Library)

**Files:** Modify `apps/web/package.json`; Create `apps/web/vitest.config.ts`, `apps/web/src/test/setup.ts`

- [ ] **Step 1: Add test devDependencies**

Run:
```bash
pnpm --filter @turingcare/web add -D vitest@^2.1.0 jsdom@^25.0.0 @testing-library/react@^16.1.0 @testing-library/jest-dom@^6.6.0 @testing-library/user-event@^14.5.0
```
Expected: installs; `pnpm-lock.yaml` updated. If pnpm 11 prints `ERR_PNPM_IGNORED_BUILDS` for a new native dep, add that dep name set to `false` under `allowBuilds` in `pnpm-workspace.yaml` (test deps don't need build scripts) and note it.

- [ ] **Step 2: Create `apps/web/vitest.config.ts`**

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

- [ ] **Step 3: Create `apps/web/src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom has no matchMedia; default to "no reduced-motion preference".
// Individual tests override window.matchMedia as needed.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// jsdom has no IntersectionObserver.
class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("IntersectionObserver", IO);
```

- [ ] **Step 4: Ensure the test script exists**

Confirm `apps/web/package.json` `scripts.test` is `"vitest run --passWithNoTests"`. If not, set it to exactly that.

- [ ] **Step 5: Verify the runner starts green (no tests yet)**

Run: `pnpm --filter @turingcare/web test`
Expected: Vitest runs, "No test files found" → exit 0 (`--passWithNoTests`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts apps/web/src/test/setup.ts pnpm-lock.yaml pnpm-workspace.yaml
git -c commit.gpgsign=false commit -m "test(web): vitest jsdom + testing-library setup" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `useInView` hook (TDD)

**Files:** Create `apps/web/src/hooks/use-in-view.ts`, `apps/web/src/hooks/use-in-view.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/src/hooks/use-in-view.test.ts`:

```ts
import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useInView } from "./use-in-view";

afterEach(() => vi.unstubAllGlobals());

it("is visible immediately when reduced motion is preferred", () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;

  const { result } = renderHook(() => useInView<HTMLDivElement>());
  expect(result.current.isInView).toBe(true);
});

it("starts hidden when motion is allowed and not yet intersecting", () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;

  const { result } = renderHook(() => useInView<HTMLDivElement>());
  expect(result.current.isInView).toBe(false);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @turingcare/web test use-in-view`
Expected: FAIL — cannot resolve `./use-in-view`.

- [ ] **Step 3: Implement `apps/web/src/hooks/use-in-view.ts`**

```ts
import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Returns a ref to attach and whether it has scrolled into view (fires once).
 * When the user prefers reduced motion, or IntersectionObserver is
 * unavailable, returns visible immediately so content is never hidden.
 */
export function useInView<T extends Element>(options?: IntersectionObserverInit) {
  const ref = useRef<T>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, ...options },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [options]);

  return { ref, isInView };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm --filter @turingcare/web test use-in-view`
Expected: PASS — 2 passing.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @turingcare/web typecheck` → 0 errors.

```bash
git add apps/web/src/hooks/use-in-view.ts apps/web/src/hooks/use-in-view.test.ts
git -c commit.gpgsign=false commit -m "feat(web): useInView hook (reduced-motion safe)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `Reveal` wrapper

**Files:** Create `apps/web/src/components/landing/reveal.tsx`

- [ ] **Step 1: Implement `apps/web/src/components/landing/reveal.tsx`**

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "@/hooks/use-in-view";

export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const { ref, isInView } = useInView<HTMLElement>();
  return (
    <Tag
      ref={ref as never}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none",
        isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @turingcare/web typecheck` → 0 errors.

```bash
git add apps/web/src/components/landing/reveal.tsx
git -c commit.gpgsign=false commit -m "feat(web): Reveal scroll animation wrapper" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Add shadcn `accordion`

**Files:** Create `apps/web/src/components/ui/accordion.tsx`

- [ ] **Step 1: Add the component**

Run: `cd apps/web && pnpm dlx shadcn@latest add accordion --yes ; cd -`
Expected: creates `apps/web/src/components/ui/accordion.tsx` and installs its Radix dependency (`@radix-ui/react-accordion` or via the `radix-ui` meta-package already present). If the CLI is interactive, accept defaults equivalent to the other `ui/*` components.

- [ ] **Step 2: Verify typecheck + build**

Run: `pnpm --filter @turingcare/web typecheck && pnpm --filter @turingcare/web build`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/accordion.tsx apps/web/package.json pnpm-lock.yaml
git -c commit.gpgsign=false commit -m "feat(web): add shadcn accordion (FAQ)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `SiteNav`

**Files:** Create `apps/web/src/components/landing/site-nav.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#brief", label: "Behavior Brief" },
  { href: "#trainers", label: "Trainers" },
  { href: "#faq", label: "FAQ" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled
          ? "bg-cream/85 backdrop-blur border-b border-silver/60"
          : "bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="#top" className="flex items-center gap-2 font-bold text-slate">
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-full bg-slate text-cream"
          >
            🐾
          </span>
          <span className="text-lg tracking-tight">TuringCare</span>
        </a>
        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-slate-soft transition-colors hover:text-copper"
            >
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="text-slate hover:text-copper">
            <Link to="/login">Log in</Link>
          </Button>
          <Button
            asChild
            className="bg-copper text-white hover:bg-copper/90"
          >
            <Link to="/register">Get started</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @turingcare/web typecheck` → 0 errors.

```bash
git add apps/web/src/components/landing/site-nav.tsx
git -c commit.gpgsign=false commit -m "feat(web): landing SiteNav" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `Hero`

**Files:** Create `apps/web/src/components/landing/hero.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden bg-cream px-5 pt-32 pb-24 md:pt-40 md:pb-32"
    >
      {/* merle-gradient accent */}
      <div
        aria-hidden
        className="tc-drift pointer-events-none absolute -right-24 -top-24 size-[34rem] rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, #7fb8d6 0%, #4a5c6e 45%, #c9d4dd 70%, transparent 100%)",
        }}
      />
      <div className="relative mx-auto max-w-3xl text-center">
        <Reveal>
          <span className="inline-block rounded-full border border-silver bg-surface px-4 py-1 text-xs font-semibold tracking-wide text-slate-soft uppercase">
            Force-free · Science-based
          </span>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate md:text-6xl">
            Understand your dog.
            <br />
            <span className="text-copper">Train without force.</span>
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mx-auto mt-6 max-w-xl text-lg text-slate-soft">
            TuringCare helps puppy owners and new adopters keep a structured
            behavior journal — then turns it into a shareable Behavior Brief your
            force-free trainer can actually use.
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="bg-copper px-7 text-white hover:bg-copper/90"
            >
              <Link to="/register">Get started — it's free</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-slate/20 text-slate hover:bg-surface-sand"
            >
              <Link to="/login">Log in</Link>
            </Button>
          </div>
        </Reveal>
        <Reveal delay={320}>
          <p className="mt-6 text-sm text-slate-soft/80">
            Built by dog people — and named after Turing, a blue-merle Mini
            American Shepherd. 🐾
          </p>
        </Reveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @turingcare/web typecheck` → 0 errors.

```bash
git add apps/web/src/components/landing/hero.tsx
git -c commit.gpgsign=false commit -m "feat(web): landing Hero" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `HowItWorks`

**Files:** Create `apps/web/src/components/landing/how-it-works.tsx`

- [ ] **Step 1: Implement**

```tsx
import { ClipboardList, FileText, NotebookPen } from "lucide-react";
import { Reveal } from "./reveal";

const STEPS = [
  {
    icon: ClipboardList,
    title: "Build your dog's profile",
    body: "Breed, age, history, concerns and goals — the context every trainer asks for, in one place.",
  },
  {
    icon: NotebookPen,
    title: "Log behavior with the ABC journal",
    body: "Capture Antecedent → Behavior → Consequence with intensity and context. Patterns surface fast.",
  },
  {
    icon: FileText,
    title: "Generate a Behavior Brief",
    body: "One tap turns your journal into a clean, shareable summary your force-free trainer can act on.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="bg-cream px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-slate md:text-4xl">
            From confusion to a plan in three steps
          </h2>
          <p className="mt-4 text-slate-soft">
            No jargon, no choke chains. Just structured observation that makes
            training measurable.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 110}>
              <div className="h-full rounded-2xl border border-silver/70 bg-surface p-7 shadow-sm">
                <div className="grid size-12 place-items-center rounded-xl bg-surface-sand text-copper">
                  <s.icon className="size-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-soft">
                  {s.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @turingcare/web typecheck` → 0 errors.

```bash
git add apps/web/src/components/landing/how-it-works.tsx
git -c commit.gpgsign=false commit -m "feat(web): landing HowItWorks" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `BriefSpotlight`

**Files:** Create `apps/web/src/components/landing/brief-spotlight.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Check } from "lucide-react";
import { Reveal } from "./reveal";

const BENEFITS = [
  "Structured ABC entries, not vague notes",
  "Severity and trends a trainer can read in seconds",
  "Exportable PDF — share before the first session",
  "Keeps owner and trainer aligned on the plan",
];

export function BriefSpotlight() {
  return (
    <section id="brief" className="bg-surface-sand px-5 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
        <Reveal>
          <h2 className="text-3xl font-bold text-slate md:text-4xl">
            The Behavior Brief
          </h2>
          <p className="mt-4 text-slate-soft">
            Your keystone artifact. Everything you've logged, distilled into a
            calm, professional summary a force-free trainer can act on
            immediately.
          </p>
          <ul className="mt-7 space-y-3">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-copper/15 text-copper">
                  <Check className="size-3.5" />
                </span>
                <span className="text-sm text-slate-soft">{b}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120}>
          {/* Illustrative mock — not real data */}
          <div className="rounded-2xl border border-silver bg-surface p-6 shadow-md">
            <div className="flex items-center justify-between border-b border-silver/70 pb-4">
              <div>
                <p className="text-xs font-semibold tracking-wide text-slate-soft uppercase">
                  Behavior Brief
                </p>
                <p className="text-lg font-bold text-slate">Maple · Aussie · 1y</p>
              </div>
              <span className="rounded-full bg-slate px-3 py-1 text-xs font-medium text-cream">
                Draft
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { t: "Leash reactivity", s: "Moderate", c: "bg-gold/25 text-slate" },
                { t: "Separation distress", s: "Mild", c: "bg-ice/25 text-slate" },
              ].map((row) => (
                <div
                  key={row.t}
                  className="flex items-center justify-between rounded-lg bg-surface-sand px-4 py-3"
                >
                  <span className="text-sm font-medium text-slate">{row.t}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs ${row.c}`}>
                    {row.s}
                  </span>
                </div>
              ))}
              <div className="rounded-lg border border-dashed border-silver px-4 py-3 text-xs text-slate-soft">
                A · "Doorbell rings" → B · "Barks, lunges 8s" → C · "Owner
                redirects with scatter feed"
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @turingcare/web typecheck` → 0 errors.

```bash
git add apps/web/src/components/landing/brief-spotlight.tsx
git -c commit.gpgsign=false commit -m "feat(web): landing BriefSpotlight" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `Philosophy`

**Files:** Create `apps/web/src/components/landing/philosophy.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Reveal } from "./reveal";

const PRINCIPLES = [
  { h: "Behavior is information", p: "Every reaction tells you what your dog needs — we help you read it." },
  { h: "Reinforce, don't intimidate", p: "No prong, shock, or fear. Methods backed by behavioral science." },
  { h: "Measure, then adjust", p: "Structured logs turn guesswork into a plan you can evaluate." },
  { h: "Owner and trainer, aligned", p: "One shared source of truth so everyone pulls the same direction." },
];

export function Philosophy() {
  return (
    <section className="bg-slate px-5 py-24 text-cream">
      <div className="mx-auto max-w-5xl">
        <Reveal className="max-w-2xl">
          <h2 className="text-3xl font-bold md:text-4xl">
            Force-free isn't a feature. It's the whole point.
          </h2>
          <p className="mt-4 text-silver">
            TuringCare exists because dogs learn better — and live better —
            without fear. The product is built around methods the science
            actually supports.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {PRINCIPLES.map((pr, i) => (
            <Reveal key={pr.h} delay={i * 90}>
              <div className="border-l-2 border-copper pl-5">
                <h3 className="text-lg font-semibold text-gold">{pr.h}</h3>
                <p className="mt-1.5 text-sm text-silver">{pr.p}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @turingcare/web typecheck` → 0 errors.

```bash
git add apps/web/src/components/landing/philosophy.tsx
git -c commit.gpgsign=false commit -m "feat(web): landing Philosophy" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: `TrainersTeaser`

**Files:** Create `apps/web/src/components/landing/trainers-teaser.tsx`

- [ ] **Step 1: Implement** (clearly "coming soon" — no fake data)

```tsx
import { Reveal } from "./reveal";

const TAGS = [
  "Force-free",
  "Fear-Free certified",
  "CCPDT",
  "Positive reinforcement",
  "Separation anxiety",
  "Reactive dogs",
  "Puppy foundations",
];

export function TrainersTeaser() {
  return (
    <section id="trainers" className="bg-cream px-5 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <Reveal>
          <span className="inline-block rounded-full bg-ice/20 px-3 py-1 text-xs font-semibold tracking-wide text-slate uppercase">
            Coming soon
          </span>
          <h2 className="mt-5 text-3xl font-bold text-slate md:text-4xl">
            Find a force-free trainer who fits
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-soft">
            A curated directory of science-based trainers — filterable by
            methodology, certification and specialty — is on the way. Your
            Behavior Brief will plug straight into it.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-9 flex flex-wrap justify-center gap-2.5">
            {TAGS.map((t) => (
              <span
                key={t}
                className="rounded-full border border-silver bg-surface px-4 py-1.5 text-sm text-slate-soft"
              >
                {t}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @turingcare/web typecheck` → 0 errors.

```bash
git add apps/web/src/components/landing/trainers-teaser.tsx
git -c commit.gpgsign=false commit -m "feat(web): landing TrainersTeaser (coming soon)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: `Faq` (uses shadcn accordion)

**Files:** Create `apps/web/src/components/landing/faq.tsx`

- [ ] **Step 1: Implement**

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reveal } from "./reveal";

const QA = [
  {
    q: "Is it really force-free?",
    a: "Yes. TuringCare is built around reward-based, science-supported methods. We don't endorse prong collars, shock, or fear-based techniques.",
  },
  {
    q: "Do I need a trainer to start?",
    a: "No. Start the behavior journal on your own today. When you're ready, the Behavior Brief makes bringing in a trainer painless.",
  },
  {
    q: "What is a Behavior Brief?",
    a: "An exportable summary of your dog's profile, concerns, goals and ABC journal entries — formatted so a trainer can understand the situation in minutes.",
  },
  {
    q: "Is my data private?",
    a: "Your journal is tied to your account and only shared when you choose to export or send a Brief. We don't sell data.",
  },
  {
    q: "What does it cost?",
    a: "The core journal and Behavior Brief are free while we're early. Get started today and you'll keep your data as the product grows.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="bg-surface-sand px-5 py-24">
      <div className="mx-auto max-w-2xl">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold text-slate md:text-4xl">
            Questions, answered
          </h2>
        </Reveal>
        <Reveal delay={100} className="mt-10">
          <Accordion type="single" collapsible className="w-full">
            {QA.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger className="text-left text-slate">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-slate-soft">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @turingcare/web typecheck` → 0 errors.

```bash
git add apps/web/src/components/landing/faq.tsx
git -c commit.gpgsign=false commit -m "feat(web): landing FAQ" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: `CtaBand` + `SiteFooter`

**Files:** Create `apps/web/src/components/landing/cta-band.tsx`, `apps/web/src/components/landing/site-footer.tsx`

- [ ] **Step 1: `cta-band.tsx`**

```tsx
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";

export function CtaBand() {
  return (
    <section className="px-5 py-20">
      <Reveal className="mx-auto max-w-4xl">
        <div
          className="rounded-3xl px-8 py-14 text-center"
          style={{
            background: "linear-gradient(135deg, #c8893b 0%, #e0a85a 100%)",
          }}
        >
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Start understanding your dog today
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-white/90">
            Free to start. Your journal and first Behavior Brief are ready when
            you are.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 bg-slate px-8 text-cream hover:bg-slate/90"
          >
            <Link to="/register">Create your free account</Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
```

- [ ] **Step 2: `site-footer.tsx`**

```tsx
import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="bg-slate px-5 py-12 text-silver">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left">
        <div>
          <p className="text-lg font-bold text-cream">TuringCare</p>
          <p className="mt-1 text-sm">Humane, force-free dog training support.</p>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          <a href="#how" className="hover:text-gold">How it works</a>
          <a href="#brief" className="hover:text-gold">Behavior Brief</a>
          <a href="#faq" className="hover:text-gold">FAQ</a>
          <Link to="/login" className="hover:text-gold">Log in</Link>
        </nav>
      </div>
      <p className="mx-auto mt-8 max-w-6xl border-t border-white/10 pt-6 text-center text-xs text-silver/70 md:text-left">
        © {new Date().getFullYear()} TuringCare · Built for Turing 🐾
      </p>
    </footer>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @turingcare/web typecheck` → 0 errors.

```bash
git add apps/web/src/components/landing/cta-band.tsx apps/web/src/components/landing/site-footer.tsx
git -c commit.gpgsign=false commit -m "feat(web): landing CtaBand + SiteFooter" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Compose `landing.tsx` + tests + full verification

**Files:** Replace `apps/web/src/routes/landing.tsx`; Create `apps/web/src/routes/landing.test.tsx`

- [ ] **Step 1: Write the failing composition test**

`apps/web/src/routes/landing.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { Landing } from "./landing";

function setup() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

it("renders the key landing sections", () => {
  setup();
  expect(
    screen.getByRole("heading", { name: /train without force/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: /three steps/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: /the behavior brief/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: /questions, answered/i }),
  ).toBeInTheDocument();
  // Primary CTA points at the real register route.
  expect(
    screen.getAllByRole("link", { name: /get started|create your free account/i })
      .length,
  ).toBeGreaterThan(0);
});

it("expands an FAQ item on click", async () => {
  setup();
  const trigger = screen.getByRole("button", {
    name: /is it really force-free/i,
  });
  await userEvent.click(trigger);
  expect(
    screen.getByText(/reward-based, science-supported/i),
  ).toBeVisible();
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @turingcare/web test landing`
Expected: FAIL — current `landing.tsx` has none of these sections.

- [ ] **Step 3: Replace `apps/web/src/routes/landing.tsx`**

```tsx
import { BriefSpotlight } from "@/components/landing/brief-spotlight";
import { CtaBand } from "@/components/landing/cta-band";
import { Faq } from "@/components/landing/faq";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Philosophy } from "@/components/landing/philosophy";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { TrainersTeaser } from "@/components/landing/trainers-teaser";

export function Landing() {
  return (
    <div className="min-h-screen bg-cream text-slate">
      <SiteNav />
      <main>
        <Hero />
        <HowItWorks />
        <BriefSpotlight />
        <Philosophy />
        <TrainersTeaser />
        <Faq />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm --filter @turingcare/web test`
Expected: all tests pass (use-in-view 2, landing 2).

- [ ] **Step 5: Full verification gate**

Run each, all must pass:
- `pnpm --filter @turingcare/web typecheck` → 0 errors
- `pnpm lint` → 0 errors (run `pnpm format` then re-check if Biome flags formatting only; keep logic identical; `components/ui/**` is Biome-ignored)
- `pnpm --filter @turingcare/web test` → 4 passing
- `pnpm --filter @turingcare/web build` → `tsc -b && vite build` succeeds, `dist/` produced

- [ ] **Step 6: Visual smoke (manual, recommended)**

Start dev (`set -a && . ./.env && set +a && pnpm dev`), open `http://localhost:3000/`:
- All sections render top-to-bottom; nav turns solid on scroll; reveals animate in.
- `/login` and `/register` links navigate; `/app` still guards.
- Emulate reduced motion (DevTools → Rendering → "prefers-reduced-motion: reduce"): all content visible immediately, no transforms.
Stop the dev server afterward.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/landing.tsx apps/web/src/routes/landing.test.tsx
git -c commit.gpgsign=false commit -m "feat(web): compose new landing page + tests" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** palette tokens → T1; motion system (`useInView` reduced-motion safe, `Reveal`) → T3/T4; keyframes → T1; nine sections → T6 (nav), T7 (hero), T8 (how-it-works), T9 (brief-spotlight), T10 (philosophy), T11 (trainers-teaser, "coming soon"), T12 (faq + accordion T5), T13 (cta-band + footer); thin `landing.tsx` composition → T14; scope-guarded (only `/`, new landing components, palette tokens, test infra) — no `/login`,`/register`,`/app`/backend changes in any task; testing (Landing renders, FAQ expands, reduced-motion fallback) → T3/T14; no new runtime deps (only test devDeps + shadcn accordion) → T2/T5. All spec sections mapped.

**Placeholder scan:** no TBD/TODO; every component/test step contains complete code; commands have expected output.

**Type consistency:** component names match across tasks and the final composition (`SiteNav`, `Hero`, `HowItWorks`, `BriefSpotlight`, `Philosophy`, `TrainersTeaser`, `Faq`, `CtaBand`, `SiteFooter`); `Reveal` props (`children`, `delay`, `className`, `as`) used consistently; `useInView` returns `{ ref, isInView }` as consumed by `Reveal`; shadcn accordion exports (`Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`) match T12 usage; `Landing` named export preserved for `main.tsx`.
