# Admin Portal Redesign — Design

- **Date:** 2026-06-21
- **Status:** Approved (design); ready for implementation plan
- **Scope:** `apps/web` only. No API, schema, or data changes.

## Goal

Make the admin portal look professional and consistent with the user portal.
Today the admin pages are bare and off-brand: an ad-hoc heading, gray shadcn
cards, a sky-blue chart, and underlined text links for navigation. They do not
share the user portal's chrome.

## Decision

- **Structure: a dedicated admin shell (Option B).** A new `AdminShell` layout
  mirrors the user portal's `AppShell` (slate sidebar + cream header, brand
  cards, collapsible rail, mobile drawer) but with an admin-only nav
  (Dashboard / Trainers / Courses), an **ADMIN** badge, and a **Back to app**
  link. This keeps the admin visually identical to the user portal while
  cleanly separating operator navigation from user navigation.
- **Language: English-only operator tool.** Remove the (non-functional)
  `LanguageToggle` from the admin pages. No en/es catalog work.

## Background — current state

- Routes are three independent top-level routes in `apps/web/src/main.tsx`
  (`/admin`, `/admin/trainers`, `/admin/courses`), each wrapped individually in
  `RequireAdmin` + `Suspense`. There is no shared layout.
- Each page renders its own `<header>` with an `<h1>` like `TuringCare · Admin`,
  underline `<Link>`s ("Manage trainers", "← Back to dashboard"), a
  `LanguageToggle`, and (on the dashboard) the range `<select>`.
- Panels and pages use generic shadcn tokens (`bg-card`, `bg-background`,
  `text-muted-foreground`, `text-destructive`) and off-brand chart colors
  (`#38bdf8` sky bars, `bg-sky-500` funnel bars).
- The user portal, by contrast, uses the brand palette (`slate`, `slate-soft`,
  `cream`, `silver`, `copper`, `gold`, `white`) and the `AppShell` chrome.

## Design

### 1. New component: `AdminShell`

`apps/web/src/components/admin-shell/AdminShell.tsx` — a layout route component
modeled on `AppShell.tsx`, reused verbatim where possible:

- **Header** (`h-16`, `bg-cream`, `border-b border-silver/60`): mobile hamburger
  (drawer toggle), `BrandMark` linking to `/admin`, a `·` separator, and the
  current page label (`text-slate`). Right side: **Sign out** `Button`
  (`variant="outline"`) using `signOut()` → toast → `navigate("/login")`,
  identical to `AppShell`. **No `LanguageToggle`.**
- **Sidebar rail** (`bg-slate text-cream`, collapsible `w-52`/`w-14`): a brand
  line `TuringCare` with a copper **ADMIN** badge, then the nav items. Active
  item uses `bg-cream/15 text-gold`; inactive `text-cream/80 hover:bg-cream/10`
  (same classes as `AppShell`). A bottom **Back to app** `NavLink` to `/my`
  (with an icon, e.g. `ArrowLeft`), above the existing expand/collapse control.
- **Collapse persistence:** localStorage key `tc-admin-nav-expanded` (separate
  from the user shell's `tc-nav-expanded`).
- **Mobile drawer:** same pattern as `AppShell` (overlay + left rail, closes on
  nav click).
- **Content:** `<main className="flex-1 overflow-auto p-6">` wrapping
  `<Suspense fallback={<p className="p-8">Loading…</p>}><Outlet /></Suspense>`.

`apps/web/src/components/admin-shell/admin-nav-items.ts` — nav config with plain
English labels (no i18n), e.g.:

```ts
export const ADMIN_NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/trainers", label: "Trainers", icon: Users },
  { to: "/admin/courses", label: "Courses", icon: GraduationCap },
];
```

### 2. Routing (`apps/web/src/main.tsx`)

Replace the three standalone admin routes with one nested layout route:

```tsx
<Route path="/admin" element={<RequireAdmin><AdminShell /></RequireAdmin>}>
  <Route index element={<AdminDashboard />} />
  <Route path="trainers" element={<AdminTrainers />} />
  <Route path="courses" element={<AdminCourses />} />
</Route>
```

`AdminDashboard`, `AdminTrainers`, `AdminCourses` stay `lazy`-loaded; the single
`Suspense` boundary now lives inside `AdminShell` (around `<Outlet />`), so the
per-route `Suspense` wrappers are removed. `RequireAdmin` is unchanged and still
gates the whole subtree (redirects non-admins to `/my`).

### 3. Page changes (chrome removal + brand styling)

- **`routes/admin/index.tsx` (dashboard):** delete the `<header>` (h1, the
  "Manage trainers/courses" links, and `LanguageToggle`). Keep the range
  `<select>`; place it in a title row: a `text-2xl font-bold text-slate` heading
  ("Admin dashboard") on the left, the range select on the right. Drop the
  `mx-auto max-w-5xl p-6` wrapper (the shell `main` supplies padding); use a
  `space-y-4` container at full width within the shell. Panels render unchanged
  except for their own restyle (below).
- **`routes/admin/trainers.tsx` and `routes/admin/courses.tsx`:** delete the
  `<header>` (h1, back link, `LanguageToggle`). Wrap the page in
  `mx-auto max-w-5xl space-y-6` and add a simple `text-2xl font-bold text-slate`
  page heading. Restyle the form card from
  `rounded-lg border bg-card` → `rounded-lg border border-silver bg-white`.
  Convert the results **`<ul>` list into a `<table>`** with a header row and
  brand styling:
  - Trainers columns: **Name · Organization · Location · Actions**.
  - Courses columns: **Name · Organization · Location · Actions**.
  - Each row's Actions cell keeps the existing Edit / Delete `Button`s
    (`variant="outline" size="sm"`), preserving current behavior.
  - Keep loading / error / empty states; swap error text `text-destructive` →
    `text-red-600` (the palette the user portal uses). Keep the shared `Field`
    helper component as-is.

### 4. Panel restyle (`routes/admin/panels/*`)

Token + chart-color migration only; no logic changes:

| File | Change |
|------|--------|
| `kpi-strip.tsx` | card `bg-card`→`bg-white`, `border`→`border border-silver`; label `text-muted-foreground`→`text-slate-soft`; value `text-slate` |
| `growth.tsx` | card tokens as above; heading→`text-slate-soft`; bar `fill="#38bdf8"`→`fill="#c8893b"` (copper) |
| `funnel.tsx` | card tokens; heading→`text-slate-soft`; track `bg-muted`→`bg-silver/40`; bar `bg-sky-500`→`bg-copper` |
| `active-usage.tsx` | card tokens; muted text→`text-slate-soft`; line `stroke="#b45309"`→`stroke="#c8893b"` |
| `activity-feed.tsx` | card tokens; muted text→`text-slate-soft`; `divide-y`→`divide-y divide-silver/60` |

Brand palette reference (`apps/web/src/index.css`): `cream #faf6ef`,
`white #ffffff`, `slate #28323d`, `slate-soft #4a5c6e`, `silver #c9d4dd`,
`copper #c8893b`, `gold #e0a85a`, `ice #7fb8d6`. Recharts `fill`/`stroke` take
hex strings (not utility classes); Tailwind utilities like `bg-copper`/
`text-copper` are generated from the `@theme` tokens and used elsewhere
(e.g. `overview.tsx`).

## Testing

- **Remove** the now-invalid `"renders the language chip in the header"` tests in
  `routes/admin/index.test.tsx` and `routes/admin/trainers.test.tsx` (the toggle
  no longer lives on these pages; the header moved to `AdminShell`). The
  remaining assertions (KPI numbers, "signups over time", "activation funnel",
  form fields, create-endpoint calls) stay valid because pages are rendered in
  isolation and the form markup is unchanged.
- **Add** `components/admin-shell/AdminShell.test.tsx`: with `useMe` mocked to an
  admin and `signOut` mocked, assert the three nav links render, the **Back to
  app** link points to `/my`, the **Sign out** button is present, and the active
  route gets the active styling. Render inside `MemoryRouter` with an `Outlet`
  child sentinel.
- **Verify** `routes/admin/panels/panels.test.tsx` and
  `routes/admin/courses.test.tsx` still pass (changes are className/markup-level;
  list mocks are empty so the list→table swap is not exercised by existing
  assertions).
- Gate locally with `pnpm --filter @turingcare/web test` and
  `pnpm lint && pnpm typecheck`.

## Non-goals

- No API, route, schema, or telemetry changes.
- No new admin functionality (no search, pagination, sorting, or new metrics).
- No i18n for admin; the dead `LanguageToggle` is removed, not translated.
- Keep recharts and the existing `useMetrics` / `useTrainers` / `useCourses`
  hooks as-is.

## Files

**New**
- `apps/web/src/components/admin-shell/AdminShell.tsx`
- `apps/web/src/components/admin-shell/admin-nav-items.ts`
- `apps/web/src/components/admin-shell/AdminShell.test.tsx`

**Modified**
- `apps/web/src/main.tsx` (nested admin layout route)
- `apps/web/src/routes/admin/index.tsx` (remove chrome, title row)
- `apps/web/src/routes/admin/trainers.tsx` (remove chrome, table, brand tokens)
- `apps/web/src/routes/admin/courses.tsx` (remove chrome, table, brand tokens)
- `apps/web/src/routes/admin/panels/{kpi-strip,growth,funnel,active-usage,activity-feed}.tsx`
- `apps/web/src/routes/admin/index.test.tsx` (drop language-chip test)
- `apps/web/src/routes/admin/trainers.test.tsx` (drop language-chip test)

## Risks

- **Visual drift from `AppShell`.** Mitigate by copying `AppShell`'s rail/header
  classes rather than reinventing them; the two shells should stay near-identical
  in structure.
- **Lost navigation affordance.** The old pages cross-linked Dashboard ↔
  Trainers ↔ Courses via text links; the new sidebar must cover all three plus
  Back to app so no destination is orphaned.
