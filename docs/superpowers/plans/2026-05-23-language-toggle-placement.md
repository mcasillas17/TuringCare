# Language Toggle Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the EN/ES `LanguageToggle` into a single compact flag chip (current language shown, tap to switch, flags kept) placed as the literal rightmost element of the top-right corner on every screen — including the two admin screens that lack it today.

**Architecture:** One shared `LanguageToggle` component, refactored from a two-button group to a single `<button>` chip, integrated into each of the four header surfaces (SiteNav, AppShell, auth pages, admin). Placement = the chip is the last child of each top-right cluster, after any action buttons, separated by the existing divider span. Auth pages already position the chip absolutely in the corner and need no edit. No global overlay, no API/DB/deps changes.

**Tech Stack:** React 19 + React Router 7 + Vite, Tailwind CSS v4 (brand tokens in `apps/web/src/index.css` `@theme`), custom context i18n (`apps/web/src/i18n`), Vitest + Testing Library, Biome. Monorepo via pnpm; web package is `@turingcare/web`.

**Conventions for every run command below:**
- Single test file: `pnpm --filter @turingcare/web exec vitest run <path-relative-to-apps/web>`
- Full web suite: `pnpm --filter @turingcare/web test`
- Typecheck: `pnpm --filter @turingcare/web typecheck`
- Lint: `pnpm lint` (from repo root; runs `biome check .`)
- Build: `pnpm --filter @turingcare/web build`
- Baseline before starting: 31 files / 100 tests green.
- The `useI18n()` hook has a no-provider fallback (locale `en`, working `t`), so the chip renders even in tests without a `LocaleProvider`.
- Every commit message ends with: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

---

## File Structure

- `apps/web/src/i18n/en.ts` — add `language.switchTo`, `language.nameEn`, `language.nameEs`; remove `language.label`. `MessageKey` is auto-derived from `typeof en`, so **`types.ts` needs no edits**.
- `apps/web/src/i18n/es.ts` — same key changes (parity is enforced by the `Messages` type; missing/extra keys = TS error).
- `apps/web/src/components/LanguageToggle.tsx` — refactor to the single chip; keep the component name and the `className` passthrough.
- `apps/web/src/components/LanguageToggle.test.tsx` — rewrite for the chip.
- `apps/web/src/routes/landing.test.tsx` — update the one test that clicks the old `ES` button.
- `apps/web/src/components/app-shell/AppShell.tsx` + `AppShell.test.tsx` — reorder right cluster; add order assertion.
- `apps/web/src/components/landing/site-nav.tsx` + `site-nav.test.tsx` — reorder right cluster; add order assertion.
- `apps/web/src/routes/admin/index.tsx` + `admin/index.test.tsx` — add chip to header; add presence assertion.
- `apps/web/src/routes/admin/trainers.tsx` + `admin/trainers.test.tsx` — add chip to header; add presence assertion.

---

## Task 1: Add the three new i18n keys (keep `language.label` for now)

Adding keys without removing `label` keeps every existing reference valid and the build green. `label` is removed in Task 2 together with its only consumer.

**Files:**
- Modify: `apps/web/src/i18n/en.ts:2`
- Modify: `apps/web/src/i18n/es.ts:4`

- [ ] **Step 1: Add keys to the English catalog**

In `apps/web/src/i18n/en.ts`, replace line 2:

```ts
  language: { label: "Language", en: "EN", es: "ES" },
```

with:

```ts
  language: {
    label: "Language",
    en: "EN",
    es: "ES",
    switchTo: "Switch to {lang}",
    nameEn: "English",
    nameEs: "Español",
  },
```

- [ ] **Step 2: Add keys to the Spanish catalog**

In `apps/web/src/i18n/es.ts`, replace line 4:

```ts
  language: { label: "Idioma", en: "EN", es: "ES" },
```

with:

```ts
  language: {
    label: "Idioma",
    en: "EN",
    es: "ES",
    switchTo: "Cambiar a {lang}",
    nameEn: "English",
    nameEs: "Español",
  },
```

- [ ] **Step 3: Verify types still compile (es/en parity)**

Run: `pnpm --filter @turingcare/web typecheck`
Expected: PASS (no errors). If `es` is missing a key it errors here.

- [ ] **Step 4: Verify the suite is still green**

Run: `pnpm --filter @turingcare/web test`
Expected: 100 tests pass (no behavior changed yet).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "$(cat <<'EOF'
i18n: add language.switchTo + endonym keys for the language chip

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Refactor `LanguageToggle` into the single flag chip

**Files:**
- Test: `apps/web/src/components/LanguageToggle.test.tsx` (rewrite)
- Modify: `apps/web/src/components/LanguageToggle.tsx`
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts` (remove `label`)
- Modify: `apps/web/src/routes/landing.test.tsx` (update Spanish-switch test)

- [ ] **Step 1: Rewrite the component test for the chip**

Replace the entire contents of `apps/web/src/components/LanguageToggle.test.tsx` with:

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

it("shows only the current language (flag + code) and labels the switch action", () => {
  const { container } = setup();
  // jsdom navigator.language is en-US, so the default locale is English.
  const chip = screen.getByRole("button", { name: /switch to español/i });
  expect(chip).toHaveTextContent("EN");
  expect(container.textContent).toContain("🇺🇸");
  expect(container.textContent).not.toContain("🇲🇽");
});

it("switches locale on click and updates flag, code, and label", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: /switch to español/i }));
  const chip = screen.getByRole("button", { name: /cambiar a english/i });
  expect(chip).toHaveTextContent("ES");
  expect(chip.textContent).toContain("🇲🇽");
});

it("passes className through to the button", () => {
  render(
    <LocaleProvider>
      <LanguageToggle className="absolute right-4 top-4" />
    </LocaleProvider>,
  );
  const chip = screen.getByRole("button", { name: /switch to/i });
  expect(chip).toHaveClass("absolute", "right-4", "top-4");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/LanguageToggle.test.tsx`
Expected: FAIL — the current component renders two buttons named `EN`/`ES`, so `getByRole("button", { name: /switch to español/i })` is not found.

- [ ] **Step 3: Rewrite the component as the chip**

Replace the entire contents of `apps/web/src/components/LanguageToggle.tsx` with:

```tsx
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

const FLAGS = { en: "🇺🇸", es: "🇲🇽" } as const;

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const next = locale === "en" ? "es" : "en";
  const targetName = next === "en" ? t("language.nameEn") : t("language.nameEs");
  const label = t("language.switchTo", { lang: targetName });
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-silver/70 bg-surface px-2.5 py-1 text-xs font-semibold text-slate-soft transition-colors hover:border-silver hover:text-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper",
        className,
      )}
    >
      <span aria-hidden="true">{FLAGS[locale]}</span>
      {t(`language.${locale}` as "language.en" | "language.es")}
    </button>
  );
}
```

- [ ] **Step 4: Remove the now-unused `language.label` key**

The chip no longer uses `language.label`. Remove the `label` line from both catalogs.

In `apps/web/src/i18n/en.ts`, the `language` object becomes:

```ts
  language: {
    en: "EN",
    es: "ES",
    switchTo: "Switch to {lang}",
    nameEn: "English",
    nameEs: "Español",
  },
```

In `apps/web/src/i18n/es.ts`, the `language` object becomes:

```ts
  language: {
    en: "EN",
    es: "ES",
    switchTo: "Cambiar a {lang}",
    nameEn: "English",
    nameEs: "Español",
  },
```

- [ ] **Step 5: Run the component test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/LanguageToggle.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Update the landing Spanish-switch test**

In `apps/web/src/routes/landing.test.tsx`, the test "switches the landing copy to Spanish via the toggle" currently does:

```tsx
  const esButton = screen.getAllByRole("button", { name: "ES" })[0];
  if (!esButton) throw new Error("ES toggle button not found");
  await userEvent.click(esButton);
```

Replace those three lines with (the chip, while in English, is labelled "Switch to Español"):

```tsx
  const chip = screen.getAllByRole("button", { name: /switch to español/i })[0];
  if (!chip) throw new Error("language chip not found");
  await userEvent.click(chip);
```

- [ ] **Step 7: Run full suite + typecheck + lint**

Run: `pnpm --filter @turingcare/web test`
Expected: 100 tests pass.
Run: `pnpm --filter @turingcare/web typecheck`
Expected: PASS (confirms no dangling `language.label` reference and `es` parity).
Run: `pnpm lint`
Expected: PASS (the old `biome-ignore` for `role="group"` is gone with the group).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/LanguageToggle.tsx apps/web/src/components/LanguageToggle.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts apps/web/src/routes/landing.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): language toggle becomes a single flag chip

Shows the current language (flag + code), tap to switch; aria-label
names the target language. Removes the unused language.label key.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: AppShell — move the chip to the literal corner (after Sign out)

**Files:**
- Test: `apps/web/src/components/app-shell/AppShell.test.tsx`
- Modify: `apps/web/src/components/app-shell/AppShell.tsx:108-121`

- [ ] **Step 1: Add an order assertion to the AppShell test**

Append this test inside the `describe("AppShell", () => { ... })` block in `apps/web/src/components/app-shell/AppShell.test.tsx`, before the closing `});`:

```tsx
  it("places the language chip after Sign out (literal top-right corner)", () => {
    mockMe("user");
    setup();
    const signOut = screen.getByRole("button", { name: /sign out/i });
    const chip = screen.getByRole("button", { name: /switch to/i });
    // The chip must come AFTER the Sign out button in document order.
    expect(
      signOut.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/app-shell/AppShell.test.tsx`
Expected: FAIL — today the chip is rendered before Sign out, so it does not follow it.

- [ ] **Step 3: Reorder the AppShell right cluster**

In `apps/web/src/components/app-shell/AppShell.tsx`, replace the right-cluster block (currently lines 108–121):

```tsx
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <span aria-hidden="true" className="h-5 w-px bg-silver/70" />
          <Button
            variant="outline"
            onClick={async () => {
              await signOut();
              toast.success(t("app.signedOut"));
              navigate("/login");
            }}
          >
            {t("app.signOut")}
          </Button>
        </div>
```

with (Sign out first, chip last):

```tsx
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              await signOut();
              toast.success(t("app.signedOut"));
              navigate("/login");
            }}
          >
            {t("app.signOut")}
          </Button>
          <span aria-hidden="true" className="h-5 w-px bg-silver/70" />
          <LanguageToggle />
        </div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/app-shell/AppShell.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/app-shell/AppShell.tsx apps/web/src/components/app-shell/AppShell.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): language chip to the corner in the app shell header

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: SiteNav (landing) — move the chip to the literal corner (after CTAs)

**Files:**
- Test: `apps/web/src/components/landing/site-nav.test.tsx`
- Modify: `apps/web/src/components/landing/site-nav.tsx:53-70`

- [ ] **Step 1: Add an order assertion to the SiteNav test**

Append this test inside the `describe("SiteNav (logged in)", () => { ... })` block in `apps/web/src/components/landing/site-nav.test.tsx`, before the closing `});`. The module mock at the top of that file already provides a logged-in session, so exactly one "Open app" link and one chip render:

```tsx
  it("places the language chip after the primary action (literal corner)", () => {
    render(
      <LocaleProvider>
        <MemoryRouter>
          <SiteNav />
        </MemoryRouter>
      </LocaleProvider>,
    );
    const openApp = screen.getByRole("link", { name: /open app/i });
    const chip = screen.getByRole("button", { name: /switch to/i });
    expect(
      openApp.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/landing/site-nav.test.tsx`
Expected: FAIL — today the chip precedes the "Open app" button.

- [ ] **Step 3: Reorder the SiteNav right cluster**

In `apps/web/src/components/landing/site-nav.tsx`, replace the right-cluster block (currently lines 53–70):

```tsx
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <span aria-hidden="true" className="h-5 w-px bg-silver/70" />
          {session ? (
            <Button asChild className="bg-slate text-cream hover:bg-slate/90">
              <Link to="/my">{t("nav.openApp")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="text-slate hover:bg-surface-sand">
                <Link to="/login">{t("nav.login")}</Link>
              </Button>
              <Button asChild className="bg-slate text-cream hover:bg-slate/90">
                <Link to="/register">{t("nav.getStarted")}</Link>
              </Button>
            </>
          )}
        </div>
```

with (CTAs first, chip last):

```tsx
        <div className="flex items-center gap-2">
          {session ? (
            <Button asChild className="bg-slate text-cream hover:bg-slate/90">
              <Link to="/my">{t("nav.openApp")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="text-slate hover:bg-surface-sand">
                <Link to="/login">{t("nav.login")}</Link>
              </Button>
              <Button asChild className="bg-slate text-cream hover:bg-slate/90">
                <Link to="/register">{t("nav.getStarted")}</Link>
              </Button>
            </>
          )}
          <span aria-hidden="true" className="h-5 w-px bg-silver/70" />
          <LanguageToggle />
        </div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/landing/site-nav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/site-nav.tsx apps/web/src/components/landing/site-nav.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): language chip to the corner in the landing header

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Admin — add the chip to both admin headers (close the coverage gap)

**Files:**
- Test: `apps/web/src/routes/admin/index.test.tsx`
- Modify: `apps/web/src/routes/admin/index.tsx`
- Test: `apps/web/src/routes/admin/trainers.test.tsx`
- Modify: `apps/web/src/routes/admin/trainers.tsx`

- [ ] **Step 1: Add a presence test to the admin dashboard test**

Append this test to `apps/web/src/routes/admin/index.test.tsx` (after the last `it(...)`). A pending fetch is fine — the `<header>` (with the chip) renders regardless of metrics state:

```tsx
it("renders the language chip in the header", () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  renderDashboard();
  expect(screen.getByRole("button", { name: /switch to/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/admin/index.test.tsx`
Expected: FAIL — no language control on the admin dashboard yet.

- [ ] **Step 3: Add the chip to the admin dashboard header**

In `apps/web/src/routes/admin/index.tsx`:

Add the import near the top (after the existing `react-router-dom` import on line 2):

```tsx
import { LanguageToggle } from "@/components/LanguageToggle";
```

Then, inside the header's right cluster `<div className="flex items-center gap-3">`, immediately after the `</select>` element, add:

```tsx
          <span aria-hidden="true" className="h-5 w-px bg-silver/70" />
          <LanguageToggle />
```

The full right cluster becomes:

```tsx
        <div className="flex items-center gap-3">
          <Link to="/admin/trainers" className="text-sm underline">
            Manage trainers
          </Link>
          <label htmlFor="range-select" className="sr-only">
            Date range
          </label>
          <select
            id="range-select"
            className="rounded border bg-background px-2 py-1 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                Last {r}d
              </option>
            ))}
          </select>
          <span aria-hidden="true" className="h-5 w-px bg-silver/70" />
          <LanguageToggle />
        </div>
```

- [ ] **Step 4: Run the dashboard test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/admin/index.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add a presence test to the admin trainers test**

Append this test to `apps/web/src/routes/admin/trainers.test.tsx` (after the last `it(...)`). It reuses the file's existing `setup()` helper and trainer-list mocks:

```tsx
it("renders the language chip in the header", async () => {
  setup();
  expect(await screen.findByRole("button", { name: /switch to/i })).toBeInTheDocument();
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/admin/trainers.test.tsx`
Expected: FAIL — no language control on the admin trainers page yet.

- [ ] **Step 7: Add the chip to the admin trainers header**

In `apps/web/src/routes/admin/trainers.tsx`:

Add the import near the top (alongside the other imports):

```tsx
import { LanguageToggle } from "@/components/LanguageToggle";
```

Then replace the header (currently lines 121–126):

```tsx
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">TuringCare · Trainers</h1>
        <Link to="/admin" className="text-sm underline">
          ← Back to dashboard
        </Link>
      </header>
```

with (right side wrapped so the chip is the literal last element):

```tsx
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">TuringCare · Trainers</h1>
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-sm underline">
            ← Back to dashboard
          </Link>
          <span aria-hidden="true" className="h-5 w-px bg-silver/70" />
          <LanguageToggle />
        </div>
      </header>
```

- [ ] **Step 8: Run the trainers test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/admin/trainers.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/routes/admin/index.tsx apps/web/src/routes/admin/index.test.tsx apps/web/src/routes/admin/trainers.tsx apps/web/src/routes/admin/trainers.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): add language chip to admin dashboard + trainers headers

Closes the coverage gap — the chip now appears on every screen.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Full verification + manual QA

**Files:** none (verification only)

- [ ] **Step 1: Run the whole web suite**

Run: `pnpm --filter @turingcare/web test`
Expected: all tests pass (was 100; now 100 + 4 new = 104, assuming no other suite changes).

- [ ] **Step 2: Typecheck, lint, build**

Run: `pnpm --filter @turingcare/web typecheck` → PASS
Run: `pnpm lint` → PASS
Run: `pnpm --filter @turingcare/web build` → PASS (tsc -b && vite build)

- [ ] **Step 3: Manual QA in the browser**

Run: `pnpm --filter @turingcare/web dev` (serves on port 3000), then verify the chip is the rightmost element in the top-right corner on:
- `/` landing (logged out: after "Get started"; logged in: after "Open app")
- `/login`, `/register`, `/forgot-password`, `/reset-password` (top-right corner)
- a `/my/*` screen (after "Sign out")
- `/admin` and `/admin/trainers` (after the range selector / back link)

For each: confirm the chip shows the current language's flag + code, tapping it switches EN↔ES (and that the visible app copy changes on translated screens), and that at a mobile width (~375px) the chip stays compact and in the corner.

- [ ] **Step 4: Finish the branch**

Use the superpowers:finishing-a-development-branch skill to open the PR (per the project's worktree + PR workflow).

---

## Self-Review

**Spec coverage:**
- Component → chip (spec §1) → Task 2. ✓
- Placement, chip last on every surface (spec §2): SiteNav → Task 4; AppShell → Task 3; admin → Task 5; auth pages need no edit (spec §2) → covered by Task 2 refactor + verified in Task 6 step 3. ✓
- Interaction & a11y (spec §3): aria-label/title naming the target, focus ring, current-flag-only → Task 2 (component + tests). ✓
- i18n (spec §4): add switchTo/nameEn/nameEs, remove label → Tasks 1 & 2. Note: spec listed `types.ts`, but `MessageKey` is auto-derived from `en.ts`, so no `types.ts` edit is needed (the spec will be corrected). ✓
- Testing (spec §5): rewrite `LanguageToggle.test.tsx` (Task 2), update `landing.test.tsx` (Task 2); plus added order/presence guards for the placement requirement (Tasks 3–5). ✓
- Non-goals (spec §6): no admin content translation, no 3rd language, no overlay, no persistence change — none introduced. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; every run step shows the command and expected result. ✓

**Type/name consistency:** `LanguageToggle` name and `className` prop unchanged across all call sites; new i18n keys `switchTo`/`nameEn`/`nameEs` used exactly as defined; chip accessible name `/switch to/i` (and `/switch to español/i`, `/cambiar a english/i`) used consistently in every test. Divider span markup identical (`h-5 w-px bg-silver/70`) on all surfaces. ✓
