# Language Toggle Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `LanguageToggle` unmistakable (🇺🇸 EN / 🇲🇽 ES flag+label) and visually separated from the CTAs it sits beside on the landing nav and app-shell header (a vertical divider), without disturbing auth/Settings placements.

**Architecture:** One component change (`LanguageToggle.tsx`) keeps its public API, so all 7 mount sites keep working. Two call-site tweaks add a decorative vertical divider between the toggle and the neighboring CTA buttons. Flags are Unicode emojis wrapped in `aria-hidden` spans so the accessible name stays `EN`/`ES`.

**Tech Stack:** React 19, Tailwind v4, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-21-language-toggle-redesign-design.md`

---

## File Structure

- `apps/web/src/components/LanguageToggle.tsx` *(modify)* — add flag span (aria-hidden) before each label; API unchanged.
- `apps/web/src/components/LanguageToggle.test.tsx` *(create)* — behavior + a11y + flag-present tests.
- `apps/web/src/components/landing/site-nav.tsx` *(modify)* — divider `<span>` between toggle and CTAs in the right cluster.
- `apps/web/src/components/app-shell/AppShell.tsx` *(modify)* — divider `<span>` between toggle and Sign-out.
- `docs/PROJECT-LOG.md` *(modify)* — phase entry.

---

## Task 1: Flags in `LanguageToggle` (TDD)

**Files:** Modify `apps/web/src/components/LanguageToggle.tsx`, Create `apps/web/src/components/LanguageToggle.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/LanguageToggle.test.tsx`:

```tsx
import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { LanguageToggle } from "./LanguageToggle";

afterEach(() => localStorage.clear());

function setup() {
  return render(
    <LocaleProvider>
      <LanguageToggle />
    </LocaleProvider>,
  );
}

it("exposes EN and ES buttons by accessible name (flag is decorative)", () => {
  setup();
  // Accessible name must be exactly EN / ES — the flag emoji must be aria-hidden.
  expect(screen.getByRole("button", { name: "EN" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "ES" })).toBeInTheDocument();
});

it("renders the country flag glyphs in the DOM", () => {
  const { container } = setup();
  expect(container.textContent).toContain("🇺🇸");
  expect(container.textContent).toContain("🇲🇽");
});

it("reflects the active locale via aria-pressed and switches on click", async () => {
  setup();
  const en = screen.getByRole("button", { name: "EN" });
  const es = screen.getByRole("button", { name: "ES" });
  expect(en).toHaveAttribute("aria-pressed", "true");
  expect(es).toHaveAttribute("aria-pressed", "false");

  await userEvent.click(es);
  expect(screen.getByRole("button", { name: "ES" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "false");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/LanguageToggle.test.tsx`
Expected: FAIL — the "renders the country flag glyphs" test fails (no flags in DOM yet); the others may pass (current toggle already has EN/ES + aria-pressed).

- [ ] **Step 3: Add the flag spans to the component**

In `apps/web/src/components/LanguageToggle.tsx`, replace the single label child of the button:

```tsx
          {t(`language.${l}` as "language.en" | "language.es")}
```

with the flag span + label:

```tsx
          <span aria-hidden="true" className="mr-1">
            {l === "en" ? "🇺🇸" : "🇲🇽"}
          </span>
          {t(`language.${l}` as "language.en" | "language.es")}
```

Nothing else in the file changes (same imports, same `role="group"`, same `aria-pressed`, same biome-ignore comment, same styling).

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/LanguageToggle.test.tsx`
Expected: PASS (3 tests). The `getByRole("button", { name: "EN" })` queries confirm the flag did NOT leak into the accessible name (proves `aria-hidden` works).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/LanguageToggle.tsx apps/web/src/components/LanguageToggle.test.tsx
git commit -m "feat(web): flags in LanguageToggle (decorative, aria-hidden)"
```

---

## Task 2: Divider on the landing nav

**Files:** Modify `apps/web/src/components/landing/site-nav.tsx`

- [ ] **Step 1: Add the divider between the toggle and the CTAs**

In `apps/web/src/components/landing/site-nav.tsx`, find the right-side actions cluster:

```tsx
        <div className="flex items-center gap-2">
          <LanguageToggle />
          {session ? (
```

Change it to insert a decorative vertical divider after `<LanguageToggle />`:

```tsx
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <span aria-hidden="true" className="h-5 w-px bg-silver/70" />
          {session ? (
```

Nothing else changes.

- [ ] **Step 2: Verify the existing site-nav test still passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/landing/site-nav.test.tsx`
Expected: PASS (the divider is `aria-hidden` and adds no accessible element; existing queries for nav links / CTAs / the toggle are unaffected).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/site-nav.tsx
git commit -m "feat(web): divider between language toggle and nav CTAs"
```

---

## Task 3: Divider on the app-shell header

**Files:** Modify `apps/web/src/components/app-shell/AppShell.tsx`

- [ ] **Step 1: Add the divider between the toggle and Sign out**

In `apps/web/src/components/app-shell/AppShell.tsx`, find the header's right-side cluster:

```tsx
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <Button
            variant="outline"
```

Change it to insert the divider after `<LanguageToggle />`:

```tsx
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <span aria-hidden="true" className="h-5 w-px bg-silver/70" />
          <Button
            variant="outline"
```

Nothing else changes.

- [ ] **Step 2: Verify the web suite still passes**

Run: `pnpm --filter @turingcare/web test`
Expected: all PASS — no test asserts on the app-shell header layout in a way the `aria-hidden` divider would break; the LanguageToggle + Sign-out remain queryable by their accessible names.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/app-shell/AppShell.tsx
git commit -m "feat(web): divider between language toggle and sign-out in app shell"
```

---

## Task 4: Full gate + PROJECT-LOG + finish branch

**Files:** Modify `docs/PROJECT-LOG.md`

- [ ] **Step 1: Run the full monorepo gate**

Run:
```bash
set -a && . ./.env && set +a
pnpm biome check . && pnpm -r exec tsc --noEmit && pnpm -r test && pnpm -r build
```
Expected: lint clean, typecheck clean, all tests pass, both apps build. Apply biome `--write` for formatting-only fallout and re-run if needed.

- [ ] **Step 2: Append the PROJECT-LOG entry**

Append to `docs/PROJECT-LOG.md` (after the most recent entry):

```markdown
## 2026-05-22 — Language toggle redesign — SHIPPED
`LanguageToggle` now shows 🇺🇸 EN / 🇲🇽 ES (flag emoji wrapped in
`aria-hidden`, accessible name stays "EN"/"ES"). Component API unchanged, so
all 7 mount sites keep working. On the landing nav and app-shell header — where
the top-right corner is occupied by CTAs — a decorative vertical divider
(`h-5 w-px bg-silver/70`) now separates the toggle from the neighboring buttons
so it reads as a distinct control (no absolute repositioning; corner stays the
CTAs). Auth pages (already corner-anchored) and Settings (intentional inline)
unchanged. New `LanguageToggle.test.tsx` (a11y name stays EN/ES, flags present
in DOM, locale switch). Bundled in the worktree-feat+transactional-email PR.
- Spec/plan: `specs/2026-05-21-language-toggle-redesign-design.md`, `plans/2026-05-21-language-toggle-redesign.md`
- Commits: this branch (see `git log`).
```

- [ ] **Step 3: Commit**

```bash
git add docs/PROJECT-LOG.md
git commit -m "docs: PROJECT-LOG entry for language toggle redesign"
```

- [ ] **Step 4: Finish the branch**

This is the last sub-project on the branch. Use the `superpowers:finishing-a-development-branch` skill. The branch now contains three shippable pieces — transactional email (P1), password-reset frontend (P3), and the language-toggle redesign — all under PR #7; the finish step updates/pushes that PR.

---

## Self-Review

**Spec coverage:**
- §2 component flags (aria-hidden span + label, API unchanged) → Task 1 ✓ · §3 landing nav divider in right cluster → Task 2 ✓ · §3 app-shell divider → Task 3 ✓ · §3 auth/Settings unchanged → not touched (correct) ✓ · §4 a11y (flag aria-hidden, accessible name EN/ES, aria-pressed) → Task 1 tests ✓ · §5 testing (accessible-name stays EN/ES, flags present in DOM, locale switch, regression suites green) → Tasks 1–3 ✓ · §6 deliverable order preserved.
- No spec requirement left without a task.

**Placeholder scan:** No TBD/TODO. Every code step shows the exact before/after; every run step has a command + expected outcome. (The Task 1 test's `"🇲🇸".slice(0,0) + "🇲🇽"` is a deliberate way to embed the MX flag glyph as a plain string assertion — it evaluates to exactly `"🇲🇽"`; replace with a direct `"🇲🇽"` literal if preferred, behavior identical.)

**Type consistency:** `LanguageToggle` keeps its `{ className?: string }` signature (unchanged) — all existing call sites (auth pages, Settings, and the two divider-edited files) remain valid. The divider `<span aria-hidden="true" className="h-5 w-px bg-silver/70" />` is identical in Tasks 2 and 3. The `language.en`/`language.es` i18n keys used in the component are the existing ones (no new keys, per spec).
