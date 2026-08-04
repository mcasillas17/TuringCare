# Interaction Correctness (UX/A11y Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the app's broken/inaccessible interactive controls — hand-rolled menus that never dismiss, a mobile drawer with no focus trap, destructive actions with no confirmation or error feedback, silent inline-add failures, and three Behavior Brief control bugs — before an invited beta.

**Architecture:** Add four thin brand-styled wrappers over the already-installed `radix-ui` (`dropdown-menu`, `popover`, `sheet`, `alert-dialog`) plus a composed `confirm-dialog`, then migrate the three floating menus + mobile drawer to them and route destructive/inline mutations through a tiered confirm-or-error-toast pattern. No API, schema, or data-layer changes — purely web component behavior.

**Tech Stack:** React 19, `radix-ui` v1.4.3 (unified package), Tailwind v4, TanStack Query, Sonner toasts, Vitest + Testing Library, typed i18n (en/es).

## Global Constraints

- **No new dependencies.** Use the unified `radix-ui` package (import style: `import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"`), exactly as `components/LanguageToggle.tsx` does.
- **i18n parity:** every new key added to BOTH `apps/web/src/i18n/en.ts` and `apps/web/src/i18n/es.ts`; es value must differ from en (compile-time parity test enforces equal key sets AND es≠en).
- **No API / schema / Drizzle / route changes.** Web `apps/web/src` only.
- **Brand classes** for all new UI: surfaces `bg-surface`/`bg-white`, borders `border-silver`, text `text-slate`/`text-slate-soft`, hover `bg-cream`, `shadow-md`, `z-50` on overlays/menus (match `LanguageToggle.tsx:81`).
- **Test setup is ready:** `apps/web/src/test/setup.ts` already polyfills `ResizeObserver`, `hasPointerCapture`, `releasePointerCapture`, `scrollIntoView`, `matchMedia`, `IntersectionObserver`. Do NOT re-add these.
- **Gates before any "done" claim:** `pnpm biome check .` (from repo root), `pnpm -r exec tsc --noEmit`, `pnpm --filter @turingcare/web test`, `pnpm --filter @turingcare/web build`. (API/shared suites unaffected — no backend changes.)
- **TDD:** failing test first, observe red, minimal impl, observe green, commit. One task = one reviewable deliverable.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Mutation hook names (already exist, `apps/web/src/lib/`):** `useDeleteDog()` (dogs.ts:92), `useAddConcern(id)`/`useRemoveConcern(id)` (dogs.ts:107/119), `useAddGoal(id)`/`useRemoveGoal(id)` (dogs.ts:133/150), `useAddSkill`/`useDeleteSkill(dogId)`/`useDeleteSession(dogId)` (progress.ts:68/121/152), `useAddEntry`/`useDeleteEntry(dogId)` (journal.ts:58/77). Each mutation exposes `.mutate`, `.mutateAsync`, `.isPending`.

---

### Task 1: `DropdownMenu` primitive + migrate `ConfidenceChip`

**Files:**
- Create: `apps/web/src/components/ui/dropdown-menu.tsx`
- Modify: `apps/web/src/components/progress/confidence-chip.tsx` (whole file)
- Test: `apps/web/src/components/progress/confidence-chip.test.tsx`

**Interfaces:**
- Produces: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` from `@/components/ui/dropdown-menu`. `DropdownMenu` = Radix Root (props `open?`, `onOpenChange?`, `modal?`); `DropdownMenuTrigger` accepts `asChild`; `DropdownMenuContent` accepts `align`/`sideOffset`; `DropdownMenuItem` accepts `onSelect`.

- [ ] **Step 1: Write the failing test** — `confidence-chip.test.tsx`:

```tsx
import { ConfidenceChip } from "@/components/progress/confidence-chip";
import { I18nProvider } from "@/i18n"; // use the app's provider; adjust import to match existing test helpers
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/progress", async (orig) => ({
  ...(await orig<typeof import("@/lib/progress")>()),
  useUpdateSkillConfidence: () => ({ mutate: mockMutate }),
}));
const mockMutate = vi.fn();

function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>{ui}</I18nProvider>
    </QueryClientProvider>,
  );
}

describe("ConfidenceChip", () => {
  it("opens on click, selects a level, and closes", async () => {
    const user = userEvent.setup();
    wrap(<ConfidenceChip dogId="d1" skillId="s1" confidence={2} />);
    await user.click(screen.getByRole("button", { name: "2/5" }));
    const item = await screen.findByRole("menuitem", { name: /level 4|responds/i });
    await user.click(item);
    expect(mockMutate).toHaveBeenCalledWith({ skillId: "s1", body: { confidence: 4 } });
  });

  it("closes on Escape without selecting", async () => {
    const user = userEvent.setup();
    wrap(<ConfidenceChip dogId="d1" skillId="s1" confidence={2} />);
    await user.click(screen.getByRole("button", { name: "2/5" }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
```

> Note: match the exact i18n provider/test-wrapper the repo already uses (grep an existing `*.test.tsx`, e.g. `confidence-chip` neighbors, for the canonical `render` helper) rather than hand-rolling if one exists.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @turingcare/web test confidence-chip`
Expected: FAIL (no `menu` role yet — current impl is a bare `<div>`).

- [ ] **Step 3: Create the primitive** — `ui/dropdown-menu.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[8rem] rounded-md border border-silver bg-surface p-1 text-sm shadow-md",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex w-full cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-left text-slate-soft outline-none transition-colors focus:bg-cream focus:text-slate data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 4: Migrate `confidence-chip.tsx`** — replace the `useState(open)` + absolute `<div>` with the primitive. The trigger stays the `{confidence}/5` button (`asChild`); drop the manual `aria-haspopup`/`aria-expanded`/`stopPropagation` toggle (Radix supplies ARIA + open state). Each level → `DropdownMenuItem` with `onSelect={() => update.mutate({ skillId, body: { confidence: level.value } })}`. Keep the `useUpdateSkillConfidence` import and the `levels` array. New body:

```tsx
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import { useUpdateSkillConfidence } from "@/lib/progress";

// ...levels array unchanged...

export function ConfidenceChip({ dogId, skillId, confidence }: { dogId: string; skillId: string; confidence: number; }) {
  const { t } = useI18n();
  const update = useUpdateSkillConfidence(dogId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">{confidence}/5</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {levels.map((level) => (
          <DropdownMenuItem
            key={level.value}
            onSelect={() => update.mutate({ skillId, body: { confidence: level.value } })}
          >
            {t(level.key)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

> `SkillCard` may rely on `stopPropagation` to avoid toggling the card when the chip is clicked. Verify: open `progress-panel.tsx`, confirm the chip sits inside a click-to-expand region; if so, wrap the trigger click with `onClick={(e) => e.stopPropagation()}` on the `Button`. Radix menu-item selection is portalled, so it won't bubble to the card.

- [ ] **Step 5: Run tests** — `pnpm --filter @turingcare/web test confidence-chip` → PASS. Then run the existing `progress-panel` test if present to catch regressions.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ui/dropdown-menu.tsx apps/web/src/components/progress/confidence-chip.tsx apps/web/src/components/progress/confidence-chip.test.tsx
git commit -m "feat(web): DropdownMenu primitive; migrate ConfidenceChip to Radix"
```

---

### Task 2: Migrate `TemplatePicker` open-list to `DropdownMenu`

**Files:**
- Modify: `apps/web/src/components/training/template-picker.tsx` (the `phase.kind === "open"` branch only, lines ~69-93)
- Test: `apps/web/src/components/training/template-picker.test.tsx` (extend existing if present)

**Interfaces:**
- Consumes: `DropdownMenu*` from Task 1.

- [ ] **Step 1: Write the failing test** — assert the template list dismisses on Escape/outside-click and that choosing a template advances to the preview:

```tsx
it("closes the template menu on Escape", async () => {
  const user = userEvent.setup();
  // render <TemplatePicker dogId="d1" /> with useTrainingCatalog mocked to 2 templates
  await user.click(screen.getByRole("button", { name: /templates/i }));
  expect(await screen.findByRole("menu")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
});

it("selecting a template shows its preview", async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /templates/i }));
  await user.click(await screen.findByRole("menuitem", { name: /basic manners/i }));
  expect(screen.getByText(/will add|willAdd/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm --filter @turingcare/web test template-picker` → FAIL (no `menu` role).

- [ ] **Step 3: Implement** — keep the `Phase` state machine. Replace the `phase.kind === "open"` return (the `relative inline-block` div + `<ul>`) with a `DropdownMenu` whose trigger is the "Templates" button and whose items set `phase` to `preview`. The `closed` and `preview` branches are unchanged. Because selection must transition to `preview`, drive `DropdownMenu` open state off `phase`:

```tsx
if (phase.kind === "open") {
  return (
    <DropdownMenu open onOpenChange={(o) => !o && setPhase({ kind: "closed" })}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">{t("training.templatesButton")}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <div className="px-2 py-1 text-xs font-medium text-slate-soft">{t("training.templatesPicking")}</div>
        {catalog.map((template) => (
          <DropdownMenuItem
            key={template.key}
            className="flex-col items-start"
            onSelect={() => setPhase({ kind: "preview", template })}
          >
            <div className="font-medium text-slate">{template.name}</div>
            <div className="text-xs text-slate-soft">{template.description}</div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Add the `DropdownMenu*` import. The `closed` branch's button still does `onClick={() => setPhase({ kind: "open" })}`.

- [ ] **Step 4: Run tests** — `pnpm --filter @turingcare/web test template-picker` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/training/template-picker.tsx apps/web/src/components/training/template-picker.test.tsx
git commit -m "feat(web): migrate TemplatePicker menu to Radix DropdownMenu"
```

---

### Task 3: `Popover` primitive + migrate `WeekGrid` cell popover

**Files:**
- Create: `apps/web/src/components/ui/popover.tsx`
- Modify: `apps/web/src/components/week/week-grid.tsx` (the `open` state + the `isOpen && <div>` popover, lines ~20, ~59-116)
- Test: `apps/web/src/components/week/week-grid.test.tsx` (create)

**Interfaces:**
- Produces: `Popover`, `PopoverTrigger`, `PopoverContent` from `@/components/ui/popover`.

**Preserve dual behavior:** an EMPTY cell (`count === 0`) still calls `onLog` directly (no popover). Only `count > 0` cells open a `Popover`. Future cells stay disabled.

- [ ] **Step 1: Write the failing test** — `week-grid.test.tsx`. Build `focusSkills` with one skill having one session today; assert clicking the filled cell opens a popover with the remove (✕) and "log another" controls, that ✕ calls `onRemove`, and Escape closes it. Empty-cell click calls `onLog`.

```tsx
it("filled cell opens a dismissible popover with remove + log-another", async () => {
  const user = userEvent.setup();
  const onRemove = vi.fn();
  const onLog = vi.fn();
  // render <WeekGrid> with a skill that has 1 session in the `today` column
  await user.click(screen.getByRole("button", { name: /1 session|cellFilled/i }));
  const remove = await screen.findByRole("button", { name: /remove/i });
  await user.click(remove);
  expect(onRemove).toHaveBeenCalled();
});
it("empty cell logs directly without a popover", async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /log|cellLog/i }));
  expect(onLog).toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm --filter @turingcare/web test week-grid` → FAIL.

- [ ] **Step 3: Create the primitive** — `ui/popover.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  className,
  align = "center",
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-44 rounded-md border border-silver bg-white p-2 text-left shadow-md",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
```

- [ ] **Step 4: Implement in `week-grid.tsx`** — remove the `open` `useState` and the `isOpen`/`setOpen` logic. For each cell, branch on `count > 0`:
  - `count > 0`: wrap in `<Popover>` — `PopoverTrigger asChild` = the count button (no `onLog` on click; Radix toggles); `PopoverContent` = the session list + remove + "log another" (unchanged markup, minus the manual positioning `div`). Keep `onRemove(skill.skillId, s.id)` on ✕ and `onLog(skill.skillId, d)` on "log another".
  - `count === 0`: keep a plain `<button disabled={isFuture} onClick={() => onLog(skill.skillId, d)}>`.

Representative filled-cell structure:

```tsx
<Popover>
  <PopoverTrigger asChild>
    <button type="button" aria-label={t("week.cellFilled", { skill: skill.name, day: key, n: count })}
      className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-copper/15 text-copper hover:bg-copper/25">
      {count > 1 ? count : "●"}
    </button>
  </PopoverTrigger>
  <PopoverContent className="space-y-1">
    {cellSessions.map((s) => ( /* time + ✕ remove, unchanged */ ))}
    <button type="button" className="w-full rounded bg-slate px-2 py-1 text-xs text-cream"
      onClick={() => onLog(skill.skillId, d)}>{t("week.logAnother")}</button>
  </PopoverContent>
</Popover>
```

The wrapping `<td className="relative ...">` no longer needs `relative` (Radix portals), but leaving it is harmless.

- [ ] **Step 5: Run tests** — `pnpm --filter @turingcare/web test week-grid` → PASS. Run any existing `dog-week`/focus route test for regressions.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ui/popover.tsx apps/web/src/components/week/week-grid.tsx apps/web/src/components/week/week-grid.test.tsx
git commit -m "feat(web): Popover primitive; migrate WeekGrid cell popover to Radix"
```

---

### Task 4: `Sheet` primitive + migrate mobile nav drawer

**Files:**
- Create: `apps/web/src/components/ui/sheet.tsx`
- Modify: `apps/web/src/components/app-shell/AppShell.tsx` (drawer, ~lines 126-136; and the hamburger trigger)
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts` (add `nav.closeMenu`)
- Test: `apps/web/src/components/app-shell/AppShell.test.tsx` (extend existing if present, else create)

**Interfaces:**
- Produces: `Sheet`, `SheetTrigger`, `SheetContent`, `SheetClose` from `@/components/ui/sheet` (built on Radix `Dialog`). `SheetContent` accepts `side?: "left" | "right"` (default `"left"`).

- [ ] **Step 1: Write the failing test** — assert the drawer traps focus / closes on Escape and that the close control has a localized accessible name:

```tsx
it("mobile drawer opens, closes on Escape, and has a localized close label", async () => {
  const user = userEvent.setup();
  // render AppShell at a mobile width (the hamburger is visible); mock session/hooks as existing tests do
  await user.click(screen.getByRole("button", { name: /menu/i }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("button", { name: /close|cerrar/i })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm --filter @turingcare/web test AppShell` → FAIL.

- [ ] **Step 3: Add i18n** — `nav.closeMenu`: en `"Close menu"`, es `"Cerrar menú"`. Place beside the existing `nav.*` keys in both files.

- [ ] **Step 4: Create the primitive** — `ui/sheet.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  className,
  side = "left",
  children,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: "left" | "right" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate/40" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-0 z-50 flex w-72 max-w-[80%] flex-col gap-2 border-silver bg-surface p-4 shadow-lg focus:outline-none",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
```

> `Dialog.Content` warns if it has no accessible title. Add a visually-hidden `<DialogPrimitive.Title className="sr-only">` inside the drawer (e.g. reuse an existing app/nav label key), or pass `aria-label`. Keep it localized.

- [ ] **Step 5: Migrate the drawer** in `AppShell.tsx` — replace the hand-rolled overlay + drawer with `Sheet`/`SheetTrigger`(hamburger)/`SheetContent`(side="left"). The nav items render inside `SheetContent`; wrap each in `SheetClose asChild` (or call the existing close handler on click) so navigating closes the sheet. Replace the hardcoded `aria-label="Close menu"` with `t("nav.closeMenu")`. Remove the now-dead `open`/`setOpen` overlay markup (Radix owns open state; keep a controlled `open`/`onOpenChange` if other code reads it).

- [ ] **Step 6: Run tests** — `pnpm --filter @turingcare/web test AppShell` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/ui/sheet.tsx apps/web/src/components/app-shell/AppShell.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts apps/web/src/components/app-shell/AppShell.test.tsx
git commit -m "feat(web): Sheet primitive; mobile drawer gets focus-trap + localized close"
```

---

### Task 5: `AlertDialog` + `ConfirmDialog` + migrate dog delete

**Files:**
- Create: `apps/web/src/components/ui/alert-dialog.tsx`
- Create: `apps/web/src/components/ui/confirm-dialog.tsx`
- Modify: `apps/web/src/components/dog-layout.tsx` (replace the inline `confirming` two-button block, lines ~14, ~66-94)
- Modify: `apps/web/src/i18n/en.ts`, `es.ts` (add delete-dog dialog copy if not reusing existing)
- Test: `apps/web/src/components/dog-layout.test.tsx` (extend existing if present) + `apps/web/src/components/ui/confirm-dialog.test.tsx`

**Interfaces:**
- Produces: styled `AlertDialog*` parts, and `ConfirmDialog` with this exact signature (later tasks depend on it):

```tsx
type ConfirmDialogProps = {
  trigger: React.ReactNode;      // rendered as the AlertDialog.Trigger (asChild)
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;         // red confirm styling; default true
  onConfirm: () => Promise<void>; // awaited; dialog shows pending while in-flight,
                                  // closes on resolve, STAYS OPEN on reject (caller toasts)
};
export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test** — `confirm-dialog.test.tsx`:

```tsx
it("confirms: awaits onConfirm and closes", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  render(<ConfirmDialog trigger={<button>del</button>} title="Delete?" description="gone"
    confirmLabel="Yes" cancelLabel="No" onConfirm={onConfirm} />);
  await user.click(screen.getByText("del"));
  await user.click(await screen.findByRole("button", { name: "Yes" }));
  expect(onConfirm).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
});
it("cancel: does not call onConfirm", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  render(<ConfirmDialog trigger={<button>del</button>} title="Delete?" description="gone"
    confirmLabel="Yes" cancelLabel="No" onConfirm={onConfirm} />);
  await user.click(screen.getByText("del"));
  await user.click(await screen.findByRole("button", { name: "No" }));
  expect(onConfirm).not.toHaveBeenCalled();
});
it("stays open when onConfirm rejects", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn().mockRejectedValue(new Error("x"));
  render(<ConfirmDialog trigger={<button>del</button>} title="Delete?" description="gone"
    confirmLabel="Yes" cancelLabel="No" onConfirm={onConfirm} />);
  await user.click(screen.getByText("del"));
  await user.click(await screen.findByRole("button", { name: "Yes" }));
  await waitFor(() => expect(onConfirm).toHaveBeenCalled());
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm --filter @turingcare/web test confirm-dialog` → FAIL (module doesn't exist).

- [ ] **Step 3: Create `ui/alert-dialog.tsx`:**

```tsx
import { cn } from "@/lib/utils";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;
export const AlertDialogTitle = AlertDialogPrimitive.Title;
export const AlertDialogDescription = AlertDialogPrimitive.Description;

export function AlertDialogContent({ className, children, ...props }: ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate/40" />
      <AlertDialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[90%] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-lg border border-silver bg-surface p-5 shadow-lg focus:outline-none",
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}
```

- [ ] **Step 4: Create `ui/confirm-dialog.tsx`:**

```tsx
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function ConfirmDialog({
  trigger, title, description, confirmLabel, cancelLabel, onConfirm, destructive = true,
}: {
  trigger: React.ReactNode; title: string; description: string;
  confirmLabel: string; cancelLabel: string; destructive?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle className="text-lg font-semibold text-slate">{title}</AlertDialogTitle>
        <AlertDialogDescription className="text-sm text-slate-soft">{description}</AlertDialogDescription>
        <div className="flex justify-end gap-2 pt-1">
          <AlertDialogCancel asChild>
            <Button type="button" variant="outline" disabled={pending}>{cancelLabel}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              type="button"
              disabled={pending}
              className={destructive ? "bg-red-600 text-white hover:bg-red-700" : undefined}
              onClick={async (e) => {
                e.preventDefault(); // keep dialog mounted while awaiting
                setPending(true);
                try { await onConfirm(); setOpen(false); }
                catch { /* caller toasts; leave open */ }
                finally { setPending(false); }
              }}
            >
              {pending ? `${confirmLabel}…` : confirmLabel}
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 5: Run `confirm-dialog` test** → PASS.

- [ ] **Step 6: Migrate `dog-layout.tsx`** — remove the `confirming` `useState` and the two-button/`<p>` block. Replace the delete `Button` with:

```tsx
<ConfirmDialog
  trigger={<Button variant="outline">{t("dogs.delete")}</Button>}
  title={t("dogs.delete")}
  description={t("dogHub.deleteConfirm")}
  confirmLabel={t("dogs.deleteYes")}
  cancelLabel={t("dogs.deleteCancel")}
  onConfirm={async () => {
    try { await del.mutateAsync(dog.id); toast.success(t("dogs.deleted")); navigate("/my"); }
    catch (e) { toast.error(t("dogs.saveFailed")); throw e; } // rethrow keeps dialog open
  }}
/>
```

Reuses existing keys `dogs.delete`/`dogHub.deleteConfirm`/`dogs.deleteYes`/`dogs.deleteCancel`/`dogs.deleted`/`dogs.saveFailed` — no new i18n. Keep the `toast`/`useNavigate` imports.

- [ ] **Step 7: Run tests** — `pnpm --filter @turingcare/web test dog-layout confirm-dialog` → PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/ui/alert-dialog.tsx apps/web/src/components/ui/confirm-dialog.tsx apps/web/src/components/ui/confirm-dialog.test.tsx apps/web/src/components/dog-layout.tsx apps/web/src/components/dog-layout.test.tsx
git commit -m "feat(web): AlertDialog + ConfirmDialog; migrate dog delete to tiered confirm"
```

---

### Task 6: Goal delete (confirm) + Add-goal correctness

**Files:**
- Modify: `apps/web/src/routes/dog-training.tsx` (the `useRemoveGoal` delete ~line 31; the add-goal inline row ~lines 38-52)
- Modify: `apps/web/src/i18n/en.ts`, `es.ts` (add `progress.deleteGoalTitle`, `progress.deleteGoalBody`)
- Test: `apps/web/src/routes/dog-training.test.tsx` (create/extend)

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 5).

- [ ] **Step 1: Add i18n keys** — `progress.deleteGoalTitle` en `"Delete this goal?"` / es `"¿Eliminar este objetivo?"`; `progress.deleteGoalBody` en `"This removes the goal and all its skills and logged sessions."` / es `"Esto elimina el objetivo y todas sus habilidades y sesiones registradas."`. (Reuse `dogs.deleteYes`/`dogs.deleteCancel` for the buttons.)

- [ ] **Step 2: Write the failing tests:**

```tsx
it("delete goal asks for confirmation before removing", async () => {
  const user = userEvent.setup();
  // render dog-training with useRemoveGoal mocked
  await user.click(screen.getByRole("button", { name: /delete goal|remove/i }));
  expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  expect(mockRemoveGoal).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /yes|delete/i }));
  await waitFor(() => expect(mockRemoveGoal).toHaveBeenCalled());
});
it("add goal: disables while pending, toasts on error, keeps text on failure", async () => {
  // mutateAsync rejects → toast.error called, input still holds the typed value
});
```

- [ ] **Step 3: Run to verify fail** — `pnpm --filter @turingcare/web test dog-training` → FAIL.

- [ ] **Step 4: Implement.** Wrap the goal Remove control in `ConfirmDialog` (title/body from Step 1, `onConfirm` = `try { await removeGoal.mutateAsync(goal.id) } catch (e) { toast.error(t("journal.saveFailed")); throw e }`). For Add-goal: convert the `onClick` to `try/catch`, add `disabled={!value.trim() || addGoal.isPending}`, and clear the field only inside the `try` after success. (Mirror the existing disciplined pattern in `dog-card-body.tsx` add-concern.)

- [ ] **Step 5: Run tests** → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/dog-training.tsx apps/web/src/routes/dog-training.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): confirm goal deletion; harden add-goal (pending + error + clear-on-success)"
```

---

### Task 7: Skill delete (confirm) + Session delete (Tier-B)

**Files:**
- Modify: `apps/web/src/components/progress/progress-panel.tsx` (`useDeleteSkill` remove ~204-210; `useDeleteSession` remove ~337-343)
- Modify: `apps/web/src/i18n/en.ts`, `es.ts` (`progress.deleteSkillTitle`, `progress.deleteSkillBody`)
- Test: `apps/web/src/components/progress/progress-panel.test.tsx` (extend)

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 5).

- [ ] **Step 1: Add i18n** — `progress.deleteSkillTitle` en `"Delete this skill?"` / es `"¿Eliminar esta habilidad?"`; `progress.deleteSkillBody` en `"This removes the skill and its logged practice sessions."` / es `"Esto elimina la habilidad y sus sesiones de práctica registradas."`.

- [ ] **Step 2: Write failing tests** — (a) skill delete opens `alertdialog`; confirm → `useDeleteSkill` mutate called; cancel → not called. (b) session delete: no dialog, button disabled while pending, `toast.error` on rejection.

- [ ] **Step 3: Run to verify fail** → FAIL.

- [ ] **Step 4: Implement** — wrap the skill Remove button in `ConfirmDialog` (`onConfirm` = mutateAsync + catch→`toast.error(t("journal.saveFailed"))`+rethrow). For session delete (both the progress-panel session list AND, if applicable, confirm the WeekGrid ✕ already routes through `onRemove` → the parent's `useDeleteSession`): convert bare `.mutate(...)` to a handler that sets no dialog but adds `disabled={del.isPending}` and `.mutateAsync().catch(() => toast.error(t("journal.saveFailed")))`.

- [ ] **Step 5: Run tests** → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/progress/progress-panel.tsx apps/web/src/components/progress/progress-panel.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): confirm skill deletion; error-handle session deletion"
```

---

### Task 8: Journal entry delete (confirm)

**Files:**
- Modify: `apps/web/src/components/journal/entry-card.tsx` (`del.mutate` ~63-70)
- Modify: `apps/web/src/i18n/en.ts`, `es.ts` (`journal.deleteEntryTitle`, `journal.deleteEntryBody`)
- Test: `apps/web/src/components/journal/entry-card.test.tsx` (create/extend)

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 5). Uses `useDeleteEntry(dogId)`.

- [ ] **Step 1: Add i18n** — `journal.deleteEntryTitle` en `"Delete this entry?"` / es `"¿Eliminar esta entrada?"`; `journal.deleteEntryBody` en `"This permanently removes the logged moment."` / es `"Esto elimina permanentemente el momento registrado."`.

- [ ] **Step 2: Write the failing test** — clicking delete opens `alertdialog`; confirm calls the delete mutation; a rejected delete toasts and keeps the dialog open.

- [ ] **Step 3: Run to verify fail** → FAIL.

- [ ] **Step 4: Implement** — wrap the entry delete control in `ConfirmDialog` with `onConfirm = async () => { try { await del.mutateAsync(entry.id) } catch (e) { toast.error(t("journal.saveFailed")); throw e } }`. Confirm `del` is `useDeleteEntry(dogId)`; add the `toast` import if missing.

- [ ] **Step 5: Run tests** → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/journal/entry-card.tsx apps/web/src/components/journal/entry-card.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): confirm journal entry deletion"
```

---

### Task 9: Concern remove (Tier-B) + Add-concern correctness

**Files:**
- Modify: `apps/web/src/routes/dog-hub.tsx` (`useRemoveConcern` ~112; add-concern row ~119-142)
- Test: `apps/web/src/routes/dog-hub.test.tsx` (create/extend)

> Note: if the concern add/remove UI actually lives in `components/dogs/dog-card-body.tsx` (the redesign moved it there), modify that file instead — grep `useRemoveConcern`/`useAddConcern` usage to confirm the exact host before editing.

- [ ] **Step 1: Write failing tests** — remove-concern: button `disabled` while pending + `toast.error` on rejection (no dialog). add-concern: `disabled` unless `trim()` and while pending; clears only on success; toasts on error. (Add-concern may already be hardened from the dog-hub redesign — if so, only add the missing remove-error handling and keep the test as a guard.)

- [ ] **Step 2: Run to verify fail** → FAIL.

- [ ] **Step 3: Implement** — convert the concern chip ✕ from bare `.mutate` to `disabled={removeConcern.isPending}` + `.mutateAsync().catch(() => toast.error(t("journal.saveFailed")))`. Ensure add-concern matches the disciplined pattern (try/catch, pending-disable, clear-on-success). Reuse existing i18n; no new keys expected.

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/dog-hub.tsx apps/web/src/routes/dog-hub.test.tsx
git commit -m "feat(web): error-handle concern removal; verify add-concern discipline"
```

---

### Task 10: Behavior Brief control fixes

**Files:**
- Modify: `apps/web/src/routes/brief.tsx` (generate toast ~88; finalize ~102; copy failure ~127)
- Modify: `apps/web/src/i18n/en.ts`, `es.ts` (`brief.generated`, `brief.copyFailed`, `brief.finalizeTitle`, `brief.finalizeBody`)
- Test: `apps/web/src/routes/brief.test.tsx` (extend existing)

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 5).

- [ ] **Step 1: Add i18n** — `brief.generated` en `"Brief updated"` / es `"Informe actualizado"`; `brief.copyFailed` en `"Couldn't copy to clipboard"` / es `"No se pudo copiar al portapapeles"`; `brief.finalizeTitle` en `"Finalize this brief?"` / es `"¿Finalizar este informe?"`; `brief.finalizeBody` en `"Finalizing locks this version so you can share or send it."` / es `"Al finalizar se bloquea esta versión para compartirla o enviarla."`.

- [ ] **Step 2: Write the failing tests:**

```tsx
it("generate success toasts 'Brief updated', not the page title", async () => {
  // mock useGenerateBrief.mutateAsync resolve; click Generate
  expect(toastSuccess).toHaveBeenCalledWith("Brief updated");
});
it("finalize requires confirmation", async () => {
  await user.click(screen.getByRole("button", { name: /finalize/i }));
  expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  expect(mockFinalize).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /finalize/i, hidden: false }));
  // (the dialog's confirm button)
  await waitFor(() => expect(mockFinalize).toHaveBeenCalled());
});
it("copy failure toasts copyFailed", async () => {
  // navigator.clipboard.writeText rejects → toast.error("Couldn't copy to clipboard")
});
```

- [ ] **Step 3: Run to verify fail** → FAIL.

- [ ] **Step 4: Implement three edits in `brief.tsx`:**
  1. Line ~88: `toast.success(t("brief.title"))` → `toast.success(t("brief.generated"))`.
  2. Lines ~101-105: replace the finalize `Button` with a `ConfirmDialog` (`trigger` = the Finalize button, `title=t("brief.finalizeTitle")`, `description=t("brief.finalizeBody")`, `confirmLabel=t("brief.finalize")`, `cancelLabel=t("dogs.deleteCancel")`, `destructive={false}`, `onConfirm = async () => { try { await fin.mutateAsync() } catch (e) { toast.error(t("brief.genFailed")); throw e } }`). Note: `useFinalizeBrief` currently used as `fin.mutate()`; use `fin.mutateAsync()` and confirm the hook returns a promise (it does — TanStack mutation).
  3. Line ~127: the copy-summary catch `toast.error(t("brief.genFailed"))` → `toast.error(t("brief.copyFailed"))`. (Leave the share-link copy at line ~148 using `brief.shareFailed`.)

- [ ] **Step 5: Run tests** — `pnpm --filter @turingcare/web test brief` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/brief.tsx apps/web/src/routes/brief.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): brief fixes — correct generate/copy toasts, confirm finalize"
```

---

### Task 11: Whole-slice verification + project log

**Files:**
- Modify: `docs/PROJECT-LOG.md` (append a ship entry)

- [ ] **Step 1: Full gate** — from repo root:
  - `pnpm biome check .` → clean
  - `pnpm -r exec tsc --noEmit` → 0 errors
  - `pnpm --filter @turingcare/web test` → all pass
  - `pnpm --filter @turingcare/web build` → OK (verify no new large chunks; primitives are tiny)
- [ ] **Step 2: Manual smoke (optional but recommended)** — run the web app and verify: each migrated menu closes on Escape + outside click; the mobile drawer traps focus + Escape; a delete shows the confirm dialog; a forced mutation error shows a toast. Use the `verify`/`run` skill if available.
- [ ] **Step 3: Append `docs/PROJECT-LOG.md`** — a dated entry summarizing the slice, referencing this plan + the spec.
- [ ] **Step 4: Commit**

```bash
git add docs/PROJECT-LOG.md
git commit -m "docs: log interaction-correctness (UX/a11y slice 1) ship"
```

---

## Self-Review

**Spec coverage:**
- §1 primitives → Tasks 1 (dropdown-menu), 3 (popover), 4 (sheet), 5 (alert-dialog + confirm-dialog). ✓
- §2 menu migrations → Tasks 1 (confidence-chip), 2 (template-picker), 3 (week-grid). ✓
- §3 mobile drawer → Task 4. ✓
- §4 tiered deletes → dog (T5), goal (T6), skill (T7), journal entry (T8) as AlertDialog; concern chip + session as Tier-B (T7 session, T9 concern). ✓
- §5 inline adds → add-goal (T6), add-concern (T9). ✓
- §6 brief fixes → Task 10. ✓
- §7 i18n → keys added per task in both locales; §7 testing → per-task tests + jsdom setup already present. ✓
- §Non-goals → no undo/soft-delete, no redesign, nothing from Slice 2/3. ✓

**Placeholder scan:** primitive code is complete; each migration cites exact file + hook + pattern; test bodies show real assertions. Where a host file's exact structure must be confirmed at edit time (confidence-chip stopPropagation; dog-hub vs dog-card-body concern host; finalize hook promise), the step says how to verify — not "handle it later."

**Type consistency:** `ConfirmDialog` signature defined in Task 5 is consumed unchanged in Tasks 6, 8, 10 (and the skill/finalize confirms). Hook names match the grep in Global Constraints. Primitive export names (`DropdownMenuContent`, `PopoverContent`, `SheetContent`, `AlertDialogContent`, `ConfirmDialog`) are used consistently across tasks.
