# Admin Portal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin portal a dedicated, on-brand shell (slate sidebar + cream header) that mirrors the user portal, and restyle its pages/panels to the brand palette.

**Architecture:** A new `AdminShell` layout component (modeled on `AppShell`) wraps the admin routes via a nested React Router layout route. The three admin pages drop their ad-hoc headers and the dead language toggle, lists become brand-styled tables, and the five dashboard panels swap generic shadcn tokens + sky-blue charts for brand tokens + copper. `apps/web` only — no API/schema changes.

**Tech Stack:** React 19, React Router v7, Tailwind v4 (brand tokens in `index.css`), lucide-react, recharts, Vitest + Testing Library, Biome.

---

## Reference: brand palette (`apps/web/src/index.css`)

`cream #faf6ef` · `white #ffffff` · `slate #28323d` · `slate-soft #4a5c6e` · `silver #c9d4dd` · `copper #c8893b` · `gold #e0a85a` · `ice #7fb8d6`. Tailwind utilities (`bg-slate`, `text-slate-soft`, `border-silver`, `bg-copper`, `text-gold`, …) are generated from these. Recharts `fill`/`stroke` need hex strings, not classes.

## File Structure

**New**
- `apps/web/src/components/admin-shell/admin-nav-items.ts` — admin sidebar nav config (Dashboard/Trainers/Courses).
- `apps/web/src/components/admin-shell/AdminShell.tsx` — admin layout (header + slate rail + mobile drawer + `<Outlet/>`).
- `apps/web/src/components/admin-shell/AdminShell.test.tsx` — unit tests for the shell.

**Modified**
- `apps/web/src/main.tsx` — nest the admin routes under `AdminShell`.
- `apps/web/src/routes/admin/index.tsx` — remove header/links/toggle; brand title row.
- `apps/web/src/routes/admin/trainers.tsx` — remove header; list → table; brand tokens.
- `apps/web/src/routes/admin/courses.tsx` — remove header; list → table; brand tokens.
- `apps/web/src/routes/admin/panels/{kpi-strip,growth,funnel,active-usage,activity-feed}.tsx` — brand tokens + copper charts.
- `apps/web/src/routes/admin/index.test.tsx` — drop the language-chip test.
- `apps/web/src/routes/admin/trainers.test.tsx` — drop the language-chip test; add a table test.
- `apps/web/src/routes/admin/courses.test.tsx` — add a table test.

---

## Task 1: `AdminShell` layout + nav config

**Files:**
- Create: `apps/web/src/components/admin-shell/admin-nav-items.ts`
- Create: `apps/web/src/components/admin-shell/AdminShell.tsx`
- Test: `apps/web/src/components/admin-shell/AdminShell.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/admin-shell/AdminShell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AdminShell } from "./AdminShell";

function setup(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AdminShell />}>
          <Route path="/admin" element={<div>DASH-CONTENT</div>} />
          <Route path="/admin/trainers" element={<div>TRAINERS-CONTENT</div>} />
          <Route path="/admin/courses" element={<div>COURSES-CONTENT</div>} />
        </Route>
        <Route path="/my" element={<div>APP-HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminShell", () => {
  it("renders the admin badge, nav, back-to-app, sign out, and the routed outlet", () => {
    setup("/admin");
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("DASH-CONTENT")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /trainers/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /courses/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to app/i })).toHaveAttribute("href", "/my");
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("marks the active section with aria-current", () => {
    setup("/admin/trainers");
    expect(screen.getByRole("link", { name: /trainers/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /dashboard/i })).not.toHaveAttribute("aria-current");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/web test src/components/admin-shell/AdminShell.test.tsx`
Expected: FAIL — cannot resolve `./AdminShell`.

- [ ] **Step 3: Create the nav config**

Create `apps/web/src/components/admin-shell/admin-nav-items.ts`:

```ts
import { GraduationCap, LayoutDashboard, Users } from "lucide-react";

export type AdminNavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/trainers", label: "Trainers", icon: Users },
  { to: "/admin/courses", label: "Courses", icon: GraduationCap },
];
```

- [ ] **Step 4: Create the shell component**

Create `apps/web/src/components/admin-shell/AdminShell.tsx`:

```tsx
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { ArrowLeft, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Suspense, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ADMIN_NAV_ITEMS } from "./admin-nav-items";

const STORAGE_KEY = "tc-admin-nav-expanded";

export function AdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  const current = ADMIN_NAV_ITEMS.find((i) =>
    i.end ? location.pathname === i.to : location.pathname.startsWith(i.to),
  );

  function toggleExpanded() {
    setExpanded((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const rail = (
    <nav
      aria-label="Admin menu"
      className={cn(
        "flex h-full flex-col gap-1 bg-slate p-2 text-cream",
        expanded ? "w-52" : "w-14",
      )}
    >
      <div className="mb-1 flex items-center gap-2 px-3 py-2">
        <span className="rounded bg-copper px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Admin
        </span>
      </div>
      {ADMIN_NAV_ITEMS.map((i) => {
        const Icon = i.icon;
        return (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            onClick={() => setDrawerOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors",
                isActive ? "bg-cream/15 text-gold" : "text-cream/80 hover:bg-cream/10",
              )
            }
          >
            <Icon className="size-5 shrink-0" />
            {expanded && <span>{i.label}</span>}
          </NavLink>
        );
      })}
      <NavLink
        to="/my"
        onClick={() => setDrawerOpen(false)}
        className="mt-auto flex items-center gap-3 rounded px-3 py-2 text-sm text-cream/70 hover:bg-cream/10"
      >
        <ArrowLeft className="size-5 shrink-0" />
        {expanded && <span>Back to app</span>}
      </NavLink>
      <button
        type="button"
        onClick={toggleExpanded}
        aria-label={expanded ? "Collapse menu" : "Expand menu"}
        className="flex items-center gap-3 rounded px-3 py-2 text-sm text-cream/70 hover:bg-cream/10"
      >
        {expanded ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
        {expanded && <span>Collapse</span>}
      </button>
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="flex h-16 items-center justify-between border-b border-silver/60 bg-cream px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="md:hidden"
            aria-label="Admin menu"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="size-6 text-slate" />
          </button>
          <Link to="/admin">
            <BrandMark />
          </Link>
          <span className="hidden text-slate-soft sm:inline">·</span>
          <span className="hidden font-semibold text-slate sm:inline">
            {current ? current.label : "Admin"}
          </span>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            await signOut();
            toast.success("Signed out");
            navigate("/login");
          }}
        >
          Sign out
        </Button>
      </header>
      <div className="flex flex-1">
        <div className="hidden md:block">{rail}</div>
        {drawerOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-slate/40"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full">{rail}</div>
          </div>
        )}
        <main className="flex-1 overflow-auto p-6">
          <Suspense fallback={<p className="p-8">Loading…</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/web test src/components/admin-shell/AdminShell.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + lint the new files**

Run: `pnpm --filter @turingcare/web typecheck && pnpm exec biome check apps/web/src/components/admin-shell`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/admin-shell
git commit -m "feat(admin): add AdminShell layout and nav config" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Wire admin routes under `AdminShell`

**Files:**
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Add the import**

In `apps/web/src/main.tsx`, add near the other component imports:

```tsx
import { AdminShell } from "@/components/admin-shell/AdminShell";
```

- [ ] **Step 2: Drop the now-unused `Suspense` import**

Change:

```tsx
import { StrictMode, Suspense, lazy } from "react";
```

to:

```tsx
import { StrictMode, lazy } from "react";
```

- [ ] **Step 3: Replace the three standalone admin routes**

Replace this block:

```tsx
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <Suspense fallback={<p className="p-8">Loading…</p>}>
                    <AdminDashboard />
                  </Suspense>
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/trainers"
              element={
                <RequireAdmin>
                  <Suspense fallback={<p className="p-8">Loading…</p>}>
                    <AdminTrainers />
                  </Suspense>
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/courses"
              element={
                <RequireAdmin>
                  <Suspense fallback={<p className="p-8">Loading…</p>}>
                    <AdminCourses />
                  </Suspense>
                </RequireAdmin>
              }
            />
```

with:

```tsx
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <AdminShell />
                </RequireAdmin>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="trainers" element={<AdminTrainers />} />
              <Route path="courses" element={<AdminCourses />} />
            </Route>
```

(The `AdminDashboard`/`AdminTrainers`/`AdminCourses` `lazy` imports stay; the single `Suspense` boundary now lives inside `AdminShell`.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @turingcare/web typecheck`
Expected: no errors (no remaining references to `Suspense` in `main.tsx`).

- [ ] **Step 5: Confirm the guard test still passes**

Run: `pnpm --filter @turingcare/web test src/routes/admin/require-admin.test.tsx`
Expected: PASS (3 tests) — `RequireAdmin` is unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/main.tsx
git commit -m "feat(admin): nest admin routes under AdminShell" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Restyle the dashboard page + drop its language-chip test

**Files:**
- Modify: `apps/web/src/routes/admin/index.tsx`
- Test: `apps/web/src/routes/admin/index.test.tsx`

- [ ] **Step 1: Remove the obsolete language-chip test**

In `apps/web/src/routes/admin/index.test.tsx`, delete this test entirely:

```tsx
it("renders the language chip in the header", () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  renderDashboard();
  expect(screen.getByRole("button", { name: "Language" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the dashboard test to confirm the remaining 3 still pass**

Run: `pnpm --filter @turingcare/web test src/routes/admin/index.test.tsx`
Expected: PASS (3 tests) — the deleted test no longer runs; the rest are unaffected.

- [ ] **Step 3: Replace `index.tsx` with the de-chromed, brand-styled version**

Replace the entire contents of `apps/web/src/routes/admin/index.tsx` with:

```tsx
import { useState } from "react";
import { ActiveUsage } from "./panels/active-usage";
import { ActivityFeed } from "./panels/activity-feed";
import { Funnel } from "./panels/funnel";
import { Growth } from "./panels/growth";
import { KpiStrip } from "./panels/kpi-strip";
import { useActivity, useMetrics } from "./use-metrics";

const RANGES = [7, 30, 90] as const;

export function AdminDashboard() {
  const [days, setDays] = useState<number>(30);
  const metrics = useMetrics(days);
  const activity = useActivity();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate">Admin dashboard</h1>
        <div>
          <label htmlFor="range-select" className="sr-only">
            Date range
          </label>
          <select
            id="range-select"
            className="rounded border border-silver bg-white px-2 py-1 text-sm text-slate"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                Last {r}d
              </option>
            ))}
          </select>
        </div>
      </div>

      {metrics.isPending ? (
        <p className="p-8">Loading metrics…</p>
      ) : metrics.isError || !metrics.data ? (
        <p className="p-8 text-red-600">Failed to load metrics.</p>
      ) : (
        <>
          <KpiStrip kpis={metrics.data.kpis} />
          <Growth signups={metrics.data.signups} />
          <div className="grid gap-4 md:grid-cols-2">
            <ActiveUsage active={metrics.data.active} kpis={metrics.data.kpis} />
            <Funnel funnel={metrics.data.funnel} />
          </div>
          {activity.isError ? (
            <p className="rounded-lg border border-silver bg-white p-4 text-sm text-red-600">
              Activity feed unavailable.
            </p>
          ) : (
            <ActivityFeed activity={activity.data ?? { items: [] }} />
          )}
        </>
      )}
    </div>
  );
}
```

(Removed: the `<header>` with `<h1>TuringCare · Admin</h1>`, the "Manage trainers/courses" `Link`s, the `LanguageToggle`, and the `max-w-5xl p-6` wrapper. The range select moved into the title row. `text-destructive` → `text-red-600`; card tokens → `border-silver bg-white`. The `LanguageToggle`/`Link`/`useState`-unrelated imports are gone.)

- [ ] **Step 4: Run the dashboard test again**

Run: `pnpm --filter @turingcare/web test src/routes/admin/index.test.tsx`
Expected: PASS (3 tests) — asserts "Total users" → "7", "signups over time", "activation funnel".

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter @turingcare/web typecheck && pnpm exec biome check apps/web/src/routes/admin/index.tsx apps/web/src/routes/admin/index.test.tsx`
Expected: no errors (no unused imports).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/admin/index.tsx apps/web/src/routes/admin/index.test.tsx
git commit -m "feat(admin): brand-style dashboard, remove ad-hoc header" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Trainers page → brand table

**Files:**
- Modify: `apps/web/src/routes/admin/trainers.tsx`
- Test: `apps/web/src/routes/admin/trainers.test.tsx`

- [ ] **Step 1: Add a failing table test and remove the language-chip test**

In `apps/web/src/routes/admin/trainers.test.tsx`:

(a) Delete this test:

```tsx
it("renders the language chip in the header", async () => {
  setup();
  expect(await screen.findByRole("button", { name: "Language" })).toBeInTheDocument();
});
```

(b) Add this test in its place:

```tsx
it("renders trainers as a table", async () => {
  listTrainers.mockResolvedValue({
    ok: true,
    json: async () => ({
      trainers: [
        {
          id: "t1",
          name: "Jane Rivera",
          businessName: "Pawsitive K9",
          city: "Seattle",
          state: "WA",
          methodologyTags: [],
          certifications: [],
          specialties: [],
          website: null,
          email: null,
          phone: null,
        },
      ],
    }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminTrainers />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("table")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: /organization/i })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Jane Rivera" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Pawsitive K9" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify the new test fails**

Run: `pnpm --filter @turingcare/web test src/routes/admin/trainers.test.tsx`
Expected: FAIL on "renders trainers as a table" — no `table` role yet (current markup is a `<ul>`).

- [ ] **Step 3: Remove the header imports**

In `apps/web/src/routes/admin/trainers.tsx`, delete these two import lines:

```tsx
import { LanguageToggle } from "@/components/LanguageToggle";
```

```tsx
import { Link } from "react-router-dom";
```

- [ ] **Step 4: Replace the container open + header block**

Replace:

```tsx
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
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

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-card p-4">
```

with:

```tsx
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold text-slate">Trainers</h1>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-silver bg-white p-4">
```

- [ ] **Step 5: Recolor the form error line**

Replace:

```tsx
        {create.isError || update.isError ? (
          <p className="text-sm text-destructive">Could not save the trainer. Try again.</p>
        ) : null}
```

with:

```tsx
        {create.isError || update.isError ? (
          <p className="text-sm text-red-600">Could not save the trainer. Try again.</p>
        ) : null}
```

- [ ] **Step 6: Replace the list section with a table**

Replace:

```tsx
      <section className="space-y-2">
        <h2 className="font-semibold">Trainers</h2>
        {list.isPending ? (
          <p>Loading trainers…</p>
        ) : list.isError ? (
          <p className="text-destructive">Failed to load trainers.</p>
        ) : list.data && list.data.length > 0 ? (
          <ul className="divide-y rounded-lg border bg-card">
            {list.data.map((t) => (
              <li key={t.id} className="flex items-center justify-between p-3">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[t.businessName, `${t.city}, ${t.state}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => startEdit(t)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(t.id)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No trainers yet. Add one above.</p>
        )}
      </section>
```

with:

```tsx
      <section className="space-y-2">
        <h2 className="font-semibold text-slate">Trainers</h2>
        {list.isPending ? (
          <p className="text-slate-soft">Loading trainers…</p>
        ) : list.isError ? (
          <p className="text-red-600">Failed to load trainers.</p>
        ) : list.data && list.data.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-silver bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-silver text-left text-xs uppercase tracking-wide text-slate-soft">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Organization</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((t) => (
                  <tr key={t.id} className="border-b border-silver/60 last:border-0">
                    <td className="px-3 py-2 font-medium text-slate">{t.name}</td>
                    <td className="px-3 py-2 text-slate-soft">{t.businessName ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-soft">
                      {t.city}, {t.state}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(t)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(t.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-soft">No trainers yet. Add one above.</p>
        )}
      </section>
```

- [ ] **Step 7: Run the trainers tests**

Run: `pnpm --filter @turingcare/web test src/routes/admin/trainers.test.tsx`
Expected: PASS — form-field test, create-endpoint test, and the new table test all green.

- [ ] **Step 8: Typecheck + lint**

Run: `pnpm --filter @turingcare/web typecheck && pnpm exec biome check apps/web/src/routes/admin/trainers.tsx apps/web/src/routes/admin/trainers.test.tsx`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/routes/admin/trainers.tsx apps/web/src/routes/admin/trainers.test.tsx
git commit -m "feat(admin): table layout + brand styling for trainers" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Courses page → brand table

**Files:**
- Modify: `apps/web/src/routes/admin/courses.tsx`
- Test: `apps/web/src/routes/admin/courses.test.tsx`

- [ ] **Step 1: Add a failing table test**

In `apps/web/src/routes/admin/courses.test.tsx`, add this test after the existing ones:

```tsx
it("renders courses as a table", async () => {
  listCourses.mockResolvedValue({
    ok: true,
    json: async () => ({
      courses: [
        {
          id: "c1",
          organizationName: "Seattle Humane",
          city: "Bellevue",
          state: "WA",
          name: "Puppy Start Right",
          description: null,
          format: "group",
          ageGroup: "any",
          ageRange: null,
          durationWeeks: null,
          sessionMinutes: null,
          prerequisites: null,
          skillsTaught: [],
          isOnline: false,
          coursePageUrl: null,
        },
      ],
    }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminCourses />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("table")).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Puppy Start Right" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Seattle Humane" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @turingcare/web test src/routes/admin/courses.test.tsx`
Expected: FAIL on "renders courses as a table" — no `table` role yet.

- [ ] **Step 3: Remove the header imports**

In `apps/web/src/routes/admin/courses.tsx`, delete these two import lines:

```tsx
import { LanguageToggle } from "@/components/LanguageToggle";
```

```tsx
import { Link } from "react-router-dom";
```

- [ ] **Step 4: Replace the container open + header block**

Replace:

```tsx
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">TuringCare · Courses</h1>
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-sm underline">
            ← Back to dashboard
          </Link>
          <span aria-hidden="true" className="h-5 w-px bg-silver/70" />
          <LanguageToggle />
        </div>
      </header>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-card p-4">
```

with:

```tsx
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold text-slate">Courses</h1>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-silver bg-white p-4">
```

- [ ] **Step 5: Recolor the form error line**

Replace:

```tsx
        {create.isError || update.isError ? (
          <p className="text-sm text-destructive">Could not save the course. Try again.</p>
        ) : null}
```

with:

```tsx
        {create.isError || update.isError ? (
          <p className="text-sm text-red-600">Could not save the course. Try again.</p>
        ) : null}
```

- [ ] **Step 6: Replace the list section with a table**

Replace:

```tsx
      <section className="space-y-2">
        <h2 className="font-semibold">Courses</h2>
        {list.isPending ? (
          <p>Loading courses…</p>
        ) : list.isError ? (
          <p className="text-destructive">Failed to load courses.</p>
        ) : list.data && list.data.length > 0 ? (
          <ul className="divide-y rounded-lg border bg-card">
            {list.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between p-3">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[c.organizationName, `${c.city}, ${c.state}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => startEdit(c)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(c.id)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No courses yet. Add one above.</p>
        )}
      </section>
```

with:

```tsx
      <section className="space-y-2">
        <h2 className="font-semibold text-slate">Courses</h2>
        {list.isPending ? (
          <p className="text-slate-soft">Loading courses…</p>
        ) : list.isError ? (
          <p className="text-red-600">Failed to load courses.</p>
        ) : list.data && list.data.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-silver bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-silver text-left text-xs uppercase tracking-wide text-slate-soft">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Organization</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((c) => (
                  <tr key={c.id} className="border-b border-silver/60 last:border-0">
                    <td className="px-3 py-2 font-medium text-slate">{c.name}</td>
                    <td className="px-3 py-2 text-slate-soft">{c.organizationName}</td>
                    <td className="px-3 py-2 text-slate-soft">
                      {c.city}, {c.state}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(c)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(c.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-soft">No courses yet. Add one above.</p>
        )}
      </section>
```

- [ ] **Step 7: Run the courses tests**

Run: `pnpm --filter @turingcare/web test src/routes/admin/courses.test.tsx`
Expected: PASS — form-field, create-endpoint, and the new table test all green.

- [ ] **Step 8: Typecheck + lint**

Run: `pnpm --filter @turingcare/web typecheck && pnpm exec biome check apps/web/src/routes/admin/courses.tsx apps/web/src/routes/admin/courses.test.tsx`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/routes/admin/courses.tsx apps/web/src/routes/admin/courses.test.tsx
git commit -m "feat(admin): table layout + brand styling for courses" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Restyle the dashboard panels to brand tokens

**Files:**
- Modify: `apps/web/src/routes/admin/panels/kpi-strip.tsx`
- Modify: `apps/web/src/routes/admin/panels/growth.tsx`
- Modify: `apps/web/src/routes/admin/panels/funnel.tsx`
- Modify: `apps/web/src/routes/admin/panels/active-usage.tsx`
- Modify: `apps/web/src/routes/admin/panels/activity-feed.tsx`

No behavior changes — only `className` tokens and chart hex colors. `panels.test.tsx` asserts text only, so it stays green.

- [ ] **Step 1: `kpi-strip.tsx` — card tokens**

Replace:

```tsx
        <div key={c.key} className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">{c.label}</div>
          <div className="mt-1 text-2xl font-bold">
            {c.format ? c.format(kpis[c.key]) : kpis[c.key]}
          </div>
        </div>
```

with:

```tsx
        <div key={c.key} className="rounded-lg border border-silver bg-white p-4">
          <div className="text-xs uppercase text-slate-soft">{c.label}</div>
          <div className="mt-1 text-2xl font-bold text-slate">
            {c.format ? c.format(kpis[c.key]) : kpis[c.key]}
          </div>
        </div>
```

- [ ] **Step 2: `growth.tsx` — card tokens + copper bars**

Replace:

```tsx
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
        Signups over time
      </h2>
```

with:

```tsx
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-soft">
        Signups over time
      </h2>
```

And replace:

```tsx
          <Bar dataKey="count" fill="#38bdf8" />
```

with:

```tsx
          <Bar dataKey="count" fill="#c8893b" />
```

- [ ] **Step 3: `funnel.tsx` — card tokens + copper bars**

Replace the whole returned JSX:

```tsx
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
        Activation funnel
      </h2>
      <div className="space-y-2">
        {funnel.map((f) => (
          <div key={f.step} className="flex items-center gap-3">
            <div className="w-32 text-sm">{f.step}</div>
            <div className="h-5 flex-1 rounded bg-muted">
              <div
                className="h-5 rounded bg-sky-500"
                style={{ width: `${Math.max(2, (f.users / top) * 100)}%` }}
              />
            </div>
            <div className="w-12 text-right text-sm tabular-nums">{f.users}</div>
          </div>
        ))}
      </div>
    </section>
```

with:

```tsx
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-soft">
        Activation funnel
      </h2>
      <div className="space-y-2">
        {funnel.map((f) => (
          <div key={f.step} className="flex items-center gap-3">
            <div className="w-32 text-sm text-slate">{f.step}</div>
            <div className="h-5 flex-1 rounded bg-silver/40">
              <div
                className="h-5 rounded bg-copper"
                style={{ width: `${Math.max(2, (f.users / top) * 100)}%` }}
              />
            </div>
            <div className="w-12 text-right text-sm tabular-nums text-slate">{f.users}</div>
          </div>
        ))}
      </div>
    </section>
```

- [ ] **Step 4: `active-usage.tsx` — card tokens + copper line**

Replace:

```tsx
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-1 text-sm font-semibold uppercase text-muted-foreground">Active users</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        DAU {kpis.dau} · WAU {kpis.wau} · MAU {kpis.mau}
      </p>
```

with:

```tsx
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold uppercase text-slate-soft">Active users</h2>
      <p className="mb-3 text-xs text-slate-soft">
        DAU {kpis.dau} · WAU {kpis.wau} · MAU {kpis.mau}
      </p>
```

And replace:

```tsx
          <Line type="monotone" dataKey="count" stroke="#b45309" strokeWidth={2} dot={false} />
```

with:

```tsx
          <Line type="monotone" dataKey="count" stroke="#c8893b" strokeWidth={2} dot={false} />
```

- [ ] **Step 5: `activity-feed.tsx` — card tokens**

Replace:

```tsx
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Live activity</h2>
      <ul className="divide-y text-sm">
        {activity.items.map((e) => (
          <li key={e.id} className="flex items-center justify-between py-1.5">
            <span className="font-mono text-xs text-muted-foreground">
              {e.userId ? e.userId.slice(0, 8) : "anon"}
            </span>
            <span>{e.name}</span>
            <span className="text-xs text-muted-foreground">{formatWhen(e.createdAt)}</span>
          </li>
        ))}
      </ul>
    </section>
```

with:

```tsx
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-soft">Live activity</h2>
      <ul className="divide-y divide-silver/60 text-sm">
        {activity.items.map((e) => (
          <li key={e.id} className="flex items-center justify-between py-1.5">
            <span className="font-mono text-xs text-slate-soft">
              {e.userId ? e.userId.slice(0, 8) : "anon"}
            </span>
            <span className="text-slate">{e.name}</span>
            <span className="text-xs text-slate-soft">{formatWhen(e.createdAt)}</span>
          </li>
        ))}
      </ul>
    </section>
```

- [ ] **Step 6: Run the panel tests + dashboard test**

Run: `pnpm --filter @turingcare/web test src/routes/admin/panels/panels.test.tsx src/routes/admin/index.test.tsx`
Expected: PASS — panels assert text only; nothing text-level changed.

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm --filter @turingcare/web typecheck && pnpm exec biome check apps/web/src/routes/admin/panels`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/routes/admin/panels
git commit -m "feat(admin): brand tokens + copper charts for dashboard panels" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole web test suite**

Run: `pnpm --filter @turingcare/web test`
Expected: PASS — all admin tests plus the rest of the web suite.

- [ ] **Step 2: Lint, typecheck, and build the web app**

Run: `pnpm lint && pnpm --filter @turingcare/web typecheck && pnpm --filter @turingcare/web build`
Expected: Biome clean; `tsc --noEmit` clean; Vite build succeeds.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run `pnpm dev`, sign in as an admin (an email in `ADMIN_EMAILS`), open `/admin`, and confirm: slate sidebar with ADMIN badge + Dashboard/Trainers/Courses, active-tab highlight, "Back to app" → `/my`, Sign out works, charts render in copper, and Trainers/Courses show tables with working Edit/Delete.

- [ ] **Step 4: Final commit (only if Step 3 surfaced fixes)**

```bash
git add -A
git commit -m "chore(admin): redesign polish from smoke test" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-Review notes

- **Spec coverage:** AdminShell (Task 1) ↔ spec §1; routing (Task 2) ↔ §2; page de-chrome + tables (Tasks 3–5) ↔ §3; panel restyle (Task 6) ↔ §4; test add/remove (Tasks 1,3,4,5) ↔ spec "Testing"; full gate (Task 7) ↔ spec "Testing".
- **English-only / no toggle:** the `LanguageToggle` import and usage are removed from `index.tsx`, `trainers.tsx`, `courses.tsx`; the two `"language chip"` tests are deleted. No i18n catalog work.
- **No API/schema changes:** all touched files are under `apps/web/src`.
