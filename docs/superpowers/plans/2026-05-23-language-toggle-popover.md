# LanguageToggle → Compact Flag Popover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single click-flip language pill with a compact flag-only trigger that opens a small popover listing the language(s) you're not in — opening on hover (desktop) or click/tap + keyboard (everywhere) — keeping it a drop-in for all five call sites.

**Architecture:** Rewrite `apps/web/src/components/LanguageToggle.tsx` to use the Radix `Popover` primitive (from the already-installed `radix-ui` package, the same one `ui/accordion.tsx` uses) directly — no new `ui/` wrapper file. Controlled `open` state lets us layer desktop-only hover-open on top of Radix's built-in click/keyboard/Escape/outside-click/focus handling. One new i18n key for the trigger's accessible name; a test-env polyfill so Radix Popper renders under jsdom.

**Tech Stack:** React 19, `radix-ui` Popover, lucide-react, Tailwind v4, Vitest + Testing Library + jsdom, Biome.

> **Note on current state:** `main` already replaced the old segmented two-button toggle (PR #22). The current `LanguageToggle` is a single pill showing the *current* flag + code (`🇺🇸 EN`) that flips on click, with aria-label `t("language.switchTo", {lang})`. This plan replaces *that*.

---

## File Structure

**Modify:**
- `apps/web/src/test/setup.ts` — add a `ResizeObserver` polyfill (+ `Element.prototype` no-ops `hasPointerCapture`/`releasePointerCapture`/`scrollIntoView`) so Radix Popover's Popper renders under jsdom. Mirrors the existing direct-assignment IntersectionObserver stub.
- `apps/web/src/i18n/en.ts` — add `language.label: "Language"`.
- `apps/web/src/i18n/es.ts` — add `language.label: "Idioma"`.
- `apps/web/src/components/LanguageToggle.tsx` — rewrite to the flag-trigger + Radix popover model.
- `apps/web/src/components/LanguageToggle.test.tsx` — rewrite for the new behavior.

**No new files. No changes to the 5 call sites** (`landing/site-nav.tsx`, `app-shell/AppShell.tsx`, `routes/login.tsx`, `routes/register.tsx`, `routes/settings.tsx`) — the export name and `{ className }` prop are unchanged, and `className` still lands on the trigger button.

**Existing i18n keys reused:** `language.switchTo` (`"Switch to {lang}"`), `language.nameEn` (`"English"`), `language.nameEs` (`"Español"`).

---

## Task 1: Test-env polyfills for Radix Popover

**Files:**
- Modify: `apps/web/src/test/setup.ts`

Radix `Popover` uses Popper (floating positioning), which calls `ResizeObserver` and a few element methods jsdom lacks. Without these the rewritten test throws. The accordion didn't need them (no Popper), so they're not present yet.

- [ ] **Step 1: Add the polyfills**

In `apps/web/src/test/setup.ts`, inside the existing `if (typeof window !== "undefined") { ... }` block, after the IntersectionObserver stub, add:

```ts
  // Radix Popover/Popper needs ResizeObserver under jsdom; direct assignment
  // (not vi.stubGlobal) so vi.unstubAllGlobals() in test afterEach hooks keeps it.
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as Record<string, unknown>).ResizeObserver = RO;

  // jsdom lacks these element methods that Radix's dismissable layer / popper call.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
```

- [ ] **Step 2: Verify nothing breaks**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/LanguageToggle.test.tsx`
Expected: PASS (the current test still passes — this change only adds globals). Also a quick `pnpm --filter @turingcare/web exec tsc --noEmit` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/test/setup.ts
git commit -m "test(web): polyfill ResizeObserver + element methods for Radix Popover"
```
(No Co-Authored-By line.)

---

## Task 2: i18n `language.label` key

**Files:**
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`

The flag-only trigger opens a menu, so its accessible name should be "Language", not "Switch to …". `MessageKey` is derived from `en` (see `i18n/types.ts`), so the key must exist in BOTH catalogs.

- [ ] **Step 1: en.ts**

In `apps/web/src/i18n/en.ts`, the `language` block is:
```ts
  language: {
    en: "EN",
    es: "ES",
    switchTo: "Switch to {lang}",
    nameEn: "English",
    nameEs: "Español",
  },
```
Add `label`:
```ts
  language: {
    en: "EN",
    es: "ES",
    switchTo: "Switch to {lang}",
    nameEn: "English",
    nameEs: "Español",
    label: "Language",
  },
```

- [ ] **Step 2: es.ts (parity)**

In `apps/web/src/i18n/es.ts`, the `language` block has the same keys; add:
```ts
    label: "Idioma",
```
(immediately after the `nameEs` line, matching en.ts's ordering).

- [ ] **Step 3: Verify the type picked it up**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit`
Expected: exit 0. (`t("language.label")` will now be a valid `MessageKey`.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "i18n(web): add language.label for the toggle trigger (en/es)"
```

---

## Task 3: Rewrite LanguageToggle to the flag popover (TDD)

**Files:**
- Modify: `apps/web/src/components/LanguageToggle.tsx`
- Test: `apps/web/src/components/LanguageToggle.test.tsx`

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `apps/web/src/components/LanguageToggle.test.tsx` with:

```tsx
import { LocaleProvider } from "@/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { LanguageToggle } from "./LanguageToggle";

afterEach(() => localStorage.clear());

function setup(className?: string) {
  return render(
    <LocaleProvider>
      <LanguageToggle className={className} />
    </LocaleProvider>,
  );
}

// jsdom navigator.language is en-US, so the default locale is English.

it("shows a flag-only trigger labelled 'Language' and hides the other language until opened", () => {
  const { container } = setup();
  const trigger = screen.getByRole("button", { name: "Language" });
  expect(trigger).toBeInTheDocument();
  expect(container.textContent).toContain("🇺🇸");
  // The other language's option is not rendered before opening.
  expect(screen.queryByRole("button", { name: /español/i })).not.toBeInTheDocument();
});

it("opens on click and switches locale when the other language is picked", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: "Language" }));
  const option = await screen.findByRole("button", { name: /español/i });
  expect(option).toBeInTheDocument();

  await userEvent.click(option);
  // Trigger now reflects Spanish; the option is gone (popover closed).
  expect(screen.getByRole("button", { name: "Language" }).textContent).toContain("🇲🇽");
  expect(screen.queryByRole("button", { name: /español/i })).not.toBeInTheDocument();
});

it("opens via keyboard (Enter) and closes on Escape", async () => {
  setup();
  const trigger = screen.getByRole("button", { name: "Language" });
  trigger.focus();
  await userEvent.keyboard("{Enter}");
  expect(await screen.findByRole("button", { name: /español/i })).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("button", { name: /español/i })).not.toBeInTheDocument();
});

it("opens on desktop mouse hover (pointerType mouse)", async () => {
  setup();
  const trigger = screen.getByRole("button", { name: "Language" });
  fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
  expect(await screen.findByRole("button", { name: /español/i })).toBeInTheDocument();
});

it("passes className through to the trigger button", () => {
  setup("absolute right-4 top-4");
  expect(screen.getByRole("button", { name: "Language" })).toHaveClass(
    "absolute",
    "right-4",
    "top-4",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/LanguageToggle.test.tsx`
Expected: FAIL — the current component has no button named "Language" (its name is "Switch to Español") and no popover.

- [ ] **Step 3: Implement the popover component**

Replace the entire contents of `apps/web/src/components/LanguageToggle.tsx` with:

```tsx
import { useI18n } from "@/i18n";
import type { Locale } from "@/i18n/types";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { type PointerEvent, useRef, useState } from "react";

const FLAGS: Record<Locale, string> = { en: "🇺🇸", es: "🇲🇽" };
const LOCALES: readonly Locale[] = ["en", "es"];
const NAME_KEY = { en: "language.nameEn", es: "language.nameEs" } as const;

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const others = LOCALES.filter((l) => l !== locale);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  // Desktop hover only: ignore touch/pen so tap uses the Radix click path.
  const hoverOpen = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    cancelClose();
    setOpen(true);
  };
  const hoverClose = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={t("language.label")}
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
          className={cn(
            "group inline-flex items-center gap-1 rounded-full border border-silver/70 bg-surface px-2.5 py-1 text-xs font-semibold text-slate-soft transition-colors hover:border-silver hover:text-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper",
            className,
          )}
        >
          <span aria-hidden="true">{FLAGS[locale]}</span>
          <ChevronDownIcon
            aria-hidden="true"
            className="size-3 transition-transform group-data-[state=open]:rotate-180"
          />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          onPointerEnter={cancelClose}
          onPointerLeave={hoverClose}
          className="z-50 min-w-[8rem] rounded-md border border-silver bg-surface p-1 text-xs font-semibold shadow-md"
        >
          {others.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              aria-label={t("language.switchTo", { lang: t(NAME_KEY[l]) })}
              className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-slate-soft transition-colors hover:bg-cream hover:text-slate"
            >
              <span aria-hidden="true">{FLAGS[l]}</span>
              {t(NAME_KEY[l])}
            </button>
          ))}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
```

Notes for the implementer:
- `Locale` is exported from `apps/web/src/i18n/types.ts` (import path `@/i18n/types`). If tsc reports it's also re-exported from `@/i18n`, either import is fine.
- The option's accessible name is `"Switch to Español"` (en) / `"Cambiar a English"` (es) via `language.switchTo`, and its visible text is the language name — the test matches on `/español/i`, which both satisfy.
- `group-data-[state=open]:rotate-180` keys off Radix's `data-state` on the trigger (Tailwind v4). Cosmetic; if the toolchain rejects the arbitrary variant, drop that one class — do not block on it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/LanguageToggle.test.tsx`
Expected: PASS (5 tests). If the hover test is flaky under jsdom, confirm the click/keyboard/className tests pass and report it; do not weaken the click/keyboard assertions.

- [ ] **Step 5: Typecheck + lint**

```
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm biome check apps/web/src/components/LanguageToggle.tsx apps/web/src/components/LanguageToggle.test.tsx
```
Expected: tsc exit 0; biome clean (run `pnpm biome check --write <files>` then re-check if it wants formatting).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/LanguageToggle.tsx apps/web/src/components/LanguageToggle.test.tsx
git commit -m "feat(web): flag-only LanguageToggle with hover/click language popover"
```

---

## Task 4: Full web gate, PROJECT-LOG, PR

**Files:**
- Modify: `docs/PROJECT-LOG.md`

- [ ] **Step 1: Full web gate**

```
pnpm biome check .
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm --filter @turingcare/web test
pnpm --filter @turingcare/web build
```
Expected: biome clean; tsc exit 0; all web tests pass; build OK. (This change is web-only; no api/shared/DB involvement.)

- [ ] **Step 2: PROJECT-LOG entry**

Append a `## 2026-05-23 — Language toggle: flag popover — SHIPPED` entry to `docs/PROJECT-LOG.md` (after the latest dated entry) summarizing: `LanguageToggle` rewritten from a single click-flip pill into a flag-only trigger that opens a Radix popover (hover on desktop, click/tap + keyboard everywhere) listing the non-active language; drop-in for the 5 call sites; new `language.label` i18n key (en/es); ResizeObserver test polyfill; web gate counts. Reference `specs/2026-05-23-language-toggle-popover-design.md` and `plans/2026-05-23-language-toggle-popover.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/PROJECT-LOG.md
git commit -m "docs: PROJECT-LOG entry for language toggle popover"
```

- [ ] **Step 4: Push + open PR off main**

Use `superpowers:finishing-a-development-branch` (push the branch, open a PR with base `main`, keep the worktree). Title: `feat(web): flag-popover LanguageToggle (hover/click)`. Body: summarize the flag-only trigger + popover, the desktop-hover/click/keyboard a11y behavior, the drop-in nature (5 call sites unchanged), the new i18n key, and the ResizeObserver test polyfill.

---

## Notes for the implementer

- **Drop-in contract:** keep the export name `LanguageToggle` and the `{ className }` prop, and ensure `className` lands on the trigger `<button>` (the auth pages pass `absolute right-4 top-4` to position it; Radix portals the popover content so it floats correctly regardless).
- **a11y is the point:** click + keyboard must always work; hover is a desktop-only (`pointerType === "mouse"`) enhancement, never the sole path.
- **Two languages today:** the popover lists exactly one option now; the `LOCALES.filter` keeps it correct if a third language is added later (just add its flag + name keys).
- **Don't** add a `ui/popover.tsx` wrapper — use the Radix primitive directly in this one component.
