# Journal & Brief Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Behavior Journal and Behavior Brief feel like a polished, phone-first product — fast in-the-moment capture and a clean readable timeline/brief — without losing any existing capability.

**Architecture:** Frontend-only redesign in `apps/web`. Two new presentational primitives (a `Sheet` modal and humanized date/time helpers) plus rewrites of the journal composers/timeline and the brief review/share surfaces. All data flows through existing hooks and API endpoints; the create schema already accepts `occurredAt` + ABC fields, and the brief already returns `generatedAt`, so **no API/DB/schema changes**.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (tokens: `slate`, `slate-soft`, `cream`, `silver`, `copper`), TanStack Query, react-hook-form + zod, react-router-dom v7, Vitest + @testing-library/react, Biome, typed i18n (`en`/`es`).

**Design tokens (use existing Tailwind classes, NOT raw hex):** primary surface `bg-white border border-silver`, primary action `bg-slate text-cream`, secondary `variant="outline"`, accent `text-copper`, muted `text-slate-soft`.

**Conventions:**
- Every task ends green: `pnpm --filter @turingcare/web test` + `pnpm --filter @turingcare/web exec tsc --noEmit` + `pnpm exec biome check <files>`.
- i18n parity test (`src/i18n/i18n.test.tsx`) requires en/es to share the exact key set AND every es value to differ from its en value. When you add an en key, add the es key with a genuinely translated (different) value.
- Test harness pattern (copy from `src/routes/dog-week.test.tsx`): wrap in `<LocaleProvider><QueryClientProvider client={new QueryClient()}><MemoryRouter>…`, mock lib hooks with `vi.mock`.

---

## Task 1: Humanized date/time helpers (`lib/when.ts`)

Pure, unit-testable helpers for the timeline (grouping + labels) and for backdating in the composer.

**Files:**
- Create: `apps/web/src/lib/when.ts`
- Test: `apps/web/src/lib/when.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/when.test.ts
import { describe, expect, it } from "vitest";
import { dateLabel, dayKindOf, groupByDay, humanTime, localDayKey, toLocalInputValue } from "./when";

const NOW = new Date(2026, 5, 21, 9, 0); // Jun 21 2026, 09:00 local

describe("when helpers", () => {
  it("localDayKey is local YYYY-MM-DD", () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("dayKindOf classifies today / yesterday / date", () => {
    expect(dayKindOf(new Date(2026, 5, 21, 4, 46), NOW)).toBe("today");
    expect(dayKindOf(new Date(2026, 5, 20, 23, 0), NOW)).toBe("yesterday");
    expect(dayKindOf(new Date(2026, 5, 1, 6, 30), NOW)).toBe("date");
  });

  it("dateLabel omits year in-year, includes it across years", () => {
    expect(dateLabel(new Date(2026, 5, 1), NOW, "en")).toBe("Jun 1");
    expect(dateLabel(new Date(2025, 11, 31), NOW, "en")).toBe("Dec 31, 2025");
  });

  it("humanTime formats a wall-clock time", () => {
    expect(humanTime(new Date(2026, 5, 21, 16, 5), "en")).toMatch(/4:05/);
  });

  it("toLocalInputValue round-trips local wall clock", () => {
    expect(toLocalInputValue(new Date(2026, 5, 21, 4, 46))).toBe("2026-06-21T04:46");
  });

  it("groupByDay buckets newest-first and preserves input order within a day", () => {
    const items = [
      { id: "a", at: new Date(2026, 5, 21, 4, 46) },
      { id: "b", at: new Date(2026, 5, 1, 6, 30) },
      { id: "c", at: new Date(2026, 5, 21, 1, 0) },
    ];
    const groups = groupByDay(items, (i) => i.at, NOW);
    expect(groups.map((g) => g.key)).toEqual(["2026-06-21", "2026-06-01"]);
    expect(groups[0]?.kind).toBe("today");
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["a", "c"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/lib/when.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/when.ts`**

```ts
// apps/web/src/lib/when.ts
// Local-time humanized date/time helpers for the journal timeline and capture.

/** Local YYYY-MM-DD key for a date. */
export function localDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type DayKind = "today" | "yesterday" | "date";

/** Classify a date relative to `now` (local days). */
export function dayKindOf(value: string | Date, now: Date = new Date()): DayKind {
  const d = new Date(value);
  const key = localDayKey(d);
  if (key === localDayKey(now)) return "today";
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === localDayKey(y)) return "yesterday";
  return "date";
}

/** "Jun 1" in-year, "Dec 31, 2025" across years. */
export function dateLabel(value: string | Date, now: Date = new Date(), locale = "en"): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }).format(d);
}

/** "4:05 PM" — localized wall-clock time. */
export function humanTime(value: string | Date, locale = "en"): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(d);
}

/** "YYYY-MM-DDTHH:mm" in LOCAL time, for <input type="datetime-local">. */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type DayGroup<T> = { key: string; kind: DayKind; sample: Date; items: T[] };

/** Group items by local day, newest day first; input order preserved within a day. */
export function groupByDay<T>(
  items: T[],
  getDate: (item: T) => string | Date,
  now: Date = new Date(),
): DayGroup<T>[] {
  const buckets = new Map<string, DayGroup<T>>();
  for (const item of items) {
    const d = new Date(getDate(item));
    const key = localDayKey(d);
    let group = buckets.get(key);
    if (!group) {
      group = { key, kind: dayKindOf(d, now), sample: d, items: [] };
      buckets.set(key, group);
    }
    group.items.push(item);
  }
  return [...buckets.values()].sort((a, b) => b.key.localeCompare(a.key));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/lib/when.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/when.ts apps/web/src/lib/when.test.ts
git commit -m "feat(web): humanized date/time + day-grouping helpers"
```

---

## Task 2: Sheet primitive (`components/ui/sheet.tsx`)

A lightweight accessible modal used by the journal composers and the brief share surface. No new dependency.

**Files:**
- Create: `apps/web/src/components/ui/sheet.tsx`
- Test: `apps/web/src/components/ui/sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/ui/sheet.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "./sheet";

describe("Sheet", () => {
  it("renders title + children when open and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Log a moment" onClose={onClose}>
        <p>body</p>
      </Sheet>,
    );
    expect(screen.getByRole("dialog", { name: "Log a moment" })).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <Sheet open={false} title="x" onClose={() => {}}>
        <p>body</p>
      </Sheet>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("closes when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="x" onClose={onClose}>
        <p>body</p>
      </Sheet>,
    );
    fireEvent.click(screen.getByTestId("sheet-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/ui/sheet.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `components/ui/sheet.tsx`**

```tsx
// apps/web/src/components/ui/sheet.tsx
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

type SheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Optional close-button label for screen readers. */
  closeLabel?: string;
};

/**
 * Minimal modal sheet: full-screen on phone (bottom-anchored), centered card on
 * larger screens. Closes on Escape and backdrop click. Locks body scroll while open.
 */
export function Sheet({ open, title, onClose, children, closeLabel = "Close" }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        data-testid="sheet-backdrop"
        aria-label={closeLabel}
        className="absolute inset-0 bg-slate/40"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-silver bg-cream p-5 outline-none sm:max-w-md sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold text-slate">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="px-1 text-xl text-slate-soft hover:text-slate"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/ui/sheet.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/sheet.tsx apps/web/src/components/ui/sheet.test.tsx
git commit -m "feat(web): add Sheet modal primitive"
```

---

## Task 3: i18n keys for the redesign

Add all new keys up front so component tasks can reference them. Remove the obsolete post-save keys.

**Files:**
- Modify: `apps/web/src/i18n/en.ts` (journal + brief blocks)
- Modify: `apps/web/src/i18n/es.ts` (journal + brief blocks)
- Test: `apps/web/src/i18n/i18n.test.tsx` (existing parity test)

- [ ] **Step 1: Add new keys to `en.ts`**

In the `journal:` object, REMOVE these now-obsolete keys: `postSaveTitle`, `postSaveAntecedent`, `postSaveAnswer`, `postSaveSkip`, `postSaveDone`. Then ADD:

```ts
    summaryCount: "{moments} moments · {checkins} check-ins",
    dayToday: "Today",
    dayYesterday: "Yesterday",
    openEntry: "Open entry",
    closeSheet: "Close",
    timeNow: "Now",
    timeToday: "Today",
    changeTime: "Change time",
    addPlace: "Add place",
    placePlaceholder: "Where?",
    addDetail: "Add detail",
    detailHint: "before / after, who was there…",
    intensityHint: "optional, one tap",
    howWasToday: "How did today go?",
    checkInNotePlaceholder: "A line about today…",
```

In the `brief:` object, ADD:

```ts
    shareThisBrief: "Share this brief",
    shareHeading: "Share {name}'s brief",
    backToBrief: "Back to brief",
    finalizeShareNote:
      "Sharing locks this as v{version} (final) so your trainer always sees the same thing. You can regenerate a new version anytime.",
    shareEmailTitle: "Send to your trainer",
    shareEmailDesc: "Email it directly with a personal note.",
    shareLinkTitle: "Copy a private link",
    shareLinkDesc: "A view-only web link. Revoke anytime.",
    sharePdfTitle: "Download PDF",
    sharePdfDesc: "Save or share the file yourself.",
    generatedOn: "Generated {date}",
    draftVersion: "Draft · v{version}",
    finalVersion: "Final · v{version}",
```

- [ ] **Step 2: Add the SAME keys to `es.ts` with translated (different) values**

Journal — remove the same five `postSave*` keys, then add:

```ts
    summaryCount: "{moments} momentos · {checkins} registros",
    dayToday: "Hoy",
    dayYesterday: "Ayer",
    openEntry: "Abrir entrada",
    closeSheet: "Cerrar",
    timeNow: "Ahora",
    timeToday: "Hoy",
    changeTime: "Cambiar hora",
    addPlace: "Agregar lugar",
    placePlaceholder: "¿Dónde?",
    addDetail: "Agregar detalle",
    detailHint: "antes / después, quién estaba…",
    intensityHint: "opcional, un toque",
    howWasToday: "¿Cómo fue hoy?",
    checkInNotePlaceholder: "Una línea sobre hoy…",
```

Brief:

```ts
    shareThisBrief: "Compartir este resumen",
    shareHeading: "Compartir el resumen de {name}",
    backToBrief: "Volver al resumen",
    finalizeShareNote:
      "Al compartir se fija como v{version} (definitivo) para que tu entrenador siempre vea lo mismo. Puedes regenerar una nueva versión cuando quieras.",
    shareEmailTitle: "Enviar a tu entrenador",
    shareEmailDesc: "Envíalo directo por correo con una nota personal.",
    shareLinkTitle: "Copiar un enlace privado",
    shareLinkDesc: "Un enlace web de solo lectura. Revócalo cuando quieras.",
    sharePdfTitle: "Descargar PDF",
    sharePdfDesc: "Guarda o comparte el archivo tú mismo.",
    generatedOn: "Generado {date}",
    draftVersion: "Borrador · v{version}",
    finalVersion: "Definitivo · v{version}",
```

- [ ] **Step 3: Run the parity test**

Run: `pnpm --filter @turingcare/web exec vitest run src/i18n/i18n.test.tsx`
Expected: PASS (same key set; every es value differs from en).

- [ ] **Step 4: Typecheck (the `Messages` type derives from `en`, so new keys must exist everywhere they're used later — fine now)**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): i18n keys for journal/brief redesign"
```

---

## Task 4: Moment composer as sheet content (`quick-moment-composer.tsx`)

One-tap intensity, backdate-before-save time chip, inline "Add place" + "Add detail" (ABC), no post-save dialog. Sends `occurredAt` (when changed) and ABC fields on create — all already accepted by `journalMomentCreateSchema`.

**Files:**
- Rewrite: `apps/web/src/components/journal/quick-moment-composer.tsx`
- Test: `apps/web/src/components/journal/quick-moment-composer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/journal/quick-moment-composer.test.tsx
import { LocaleProvider } from "@/i18n";
import * as journalLib from "@/lib/journal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickMomentComposer } from "./quick-moment-composer";

vi.mock("@/lib/journal", () => ({ useAddEntry: vi.fn() }));

function setup() {
  const mutateAsync = vi.fn().mockResolvedValue({ id: "e1", kind: "moment" });
  vi.mocked(journalLib.useAddEntry).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof journalLib.useAddEntry>);
  const onSaved = vi.fn();
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <QuickMomentComposer dogs={[{ id: "d1", name: "Turing" }]} selectedDogId="d1" onDogChange={() => {}} onSaved={onSaved} />
      </QueryClientProvider>
    </LocaleProvider>,
  );
  return { mutateAsync, onSaved };
}

describe("QuickMomentComposer", () => {
  it("saves a moment with one-tap intensity", async () => {
    const { mutateAsync } = setup();
    fireEvent.change(screen.getByLabelText(/quick note/i), { target: { value: "barked at bushes" } });
    fireEvent.click(screen.getByRole("button", { name: /intensity 3/i }));
    fireEvent.click(screen.getByRole("button", { name: /save moment/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ kind: "moment", note: "barked at bushes", intensity: 3 }));
  });

  it("reveals ABC fields under Add detail and sends them", async () => {
    const { mutateAsync } = setup();
    fireEvent.change(screen.getByLabelText(/quick note/i), { target: { value: "lunged" } });
    fireEvent.click(screen.getByRole("button", { name: /add detail/i }));
    fireEvent.change(screen.getByLabelText(/antecedent/i), { target: { value: "doorbell rang" } });
    fireEvent.click(screen.getByRole("button", { name: /save moment/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ antecedent: "doorbell rang" }));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/journal/quick-moment-composer.test.tsx`
Expected: FAIL (current component has no "Add detail"/one-tap intensity).

- [ ] **Step 3: Rewrite the component**

```tsx
// apps/web/src/components/journal/quick-moment-composer.tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { type JournalEntry, useAddEntry } from "@/lib/journal";
import { toLocalInputValue } from "@/lib/when";
import { useState } from "react";
import { toast } from "sonner";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

type DogOption = { id: string; name: string };

type Props = {
  dogs: DogOption[];
  selectedDogId: string;
  onDogChange: (dogId: string) => void;
  onSaved: (entry: JournalEntry) => void;
  /** Focus the note on mount (when shown inside a sheet). */
  autoFocus?: boolean;
};

export function QuickMomentComposer({ dogs, selectedDogId, onDogChange, onSaved, autoFocus }: Props) {
  const { t } = useI18n();
  const add = useAddEntry(selectedDogId);
  const [note, setNote] = useState("");
  const [intensity, setIntensity] = useState<number | null>(null);
  const [customTime, setCustomTime] = useState<string | null>(null);
  const [showTime, setShowTime] = useState(false);
  const [place, setPlace] = useState("");
  const [showPlace, setShowPlace] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [antecedent, setAntecedent] = useState("");
  const [behavior, setBehavior] = useState("");
  const [consequence, setConsequence] = useState("");
  const [ownerResponse, setOwnerResponse] = useState("");

  const save = async () => {
    const trimmed = note.trim();
    if (!selectedDogId) return toast.error(t("journal.dogRequired"));
    if (!trimmed) return toast.error(t("journal.noteRequired"));
    try {
      const entry = await add.mutateAsync({
        kind: "moment",
        note: trimmed,
        intensity: intensity ?? undefined,
        occurredAt: customTime ? new Date(customTime).toISOString() : undefined,
        location: place.trim() || undefined,
        antecedent: antecedent.trim() || undefined,
        behavior: behavior.trim() || undefined,
        consequence: consequence.trim() || undefined,
        ownerResponse: ownerResponse.trim() || undefined,
      });
      toast.success(t("journal.saved"));
      onSaved(entry);
    } catch {
      toast.error(t("journal.saveFailed"));
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {dogs.length > 1 && (
        <label className="block" htmlFor="quick-moment-dog">
          <span className="text-sm font-medium text-slate">{t("journal.pickDog")}</span>
          <select id="quick-moment-dog" className={input} value={selectedDogId} onChange={(e) => onDogChange(e.target.value)}>
            <option value="">{t("journal.pickDog")}</option>
            {dogs.map((dog) => (
              <option key={dog.id} value={dog.id}>{dog.name}</option>
            ))}
          </select>
        </label>
      )}

      <label className="block" htmlFor="quick-moment-note">
        <span className="text-sm font-medium text-slate">{t("journal.quickNote")}</span>
        <textarea
          id="quick-moment-note"
          // biome-ignore lint/a11y/noAutofocus: intentional focus when opened in a sheet
          autoFocus={autoFocus}
          className={input}
          rows={3}
          placeholder={t("journal.quickNotePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div className="space-y-1">
        <span className="text-sm font-medium text-slate">
          {t("journal.intensity")} <span className="font-normal text-slate-soft">· {t("journal.intensityHint")}</span>
        </span>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${t("journal.intensity")} ${n}`}
              aria-pressed={intensity === n}
              onClick={() => setIntensity(intensity === n ? null : n)}
              className={`h-10 w-10 rounded-full border text-sm font-semibold ${
                intensity === n ? "border-copper bg-copper/15 text-copper" : "border-silver bg-white text-slate-soft"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {showTime ? (
          <input
            type="datetime-local"
            aria-label={t("journal.changeTime")}
            className="rounded border border-silver bg-white px-2 py-1 text-sm text-slate"
            value={customTime ?? toLocalInputValue(new Date())}
            onChange={(e) => setCustomTime(e.target.value)}
          />
        ) : (
          <Button type="button" variant="outline" onClick={() => { setShowTime(true); setCustomTime(toLocalInputValue(new Date())); }}>
            🕐 {t("journal.timeNow")}
          </Button>
        )}
        {!showPlace && (
          <Button type="button" variant="outline" onClick={() => setShowPlace(true)}>
            + {t("journal.addPlace")}
          </Button>
        )}
      </div>

      {showPlace && (
        <label className="block" htmlFor="quick-moment-place">
          <span className="text-sm font-medium text-slate">{t("journal.location")}</span>
          <input id="quick-moment-place" className={input} placeholder={t("journal.placePlaceholder")} value={place} onChange={(e) => setPlace(e.target.value)} />
        </label>
      )}

      {!showDetail ? (
        <button type="button" className="text-sm font-medium text-copper" onClick={() => setShowDetail(true)}>
          + {t("journal.addDetail")} <span className="font-normal text-slate-soft">— {t("journal.detailHint")}</span>
        </button>
      ) : (
        <div className="space-y-3 rounded border border-silver bg-white p-3">
          <label className="block" htmlFor="quick-moment-antecedent">
            <span className="text-sm font-medium text-slate">{t("journal.antecedent")}</span>
            <input id="quick-moment-antecedent" className={input} value={antecedent} onChange={(e) => setAntecedent(e.target.value)} />
          </label>
          <label className="block" htmlFor="quick-moment-behavior">
            <span className="text-sm font-medium text-slate">{t("journal.behavior")}</span>
            <input id="quick-moment-behavior" className={input} value={behavior} onChange={(e) => setBehavior(e.target.value)} />
          </label>
          <label className="block" htmlFor="quick-moment-consequence">
            <span className="text-sm font-medium text-slate">{t("journal.consequence")}</span>
            <input id="quick-moment-consequence" className={input} value={consequence} onChange={(e) => setConsequence(e.target.value)} />
          </label>
          <label className="block" htmlFor="quick-moment-owner-response">
            <span className="text-sm font-medium text-slate">{t("journal.ownerResponse")}</span>
            <textarea id="quick-moment-owner-response" rows={2} className={input} value={ownerResponse} onChange={(e) => setOwnerResponse(e.target.value)} />
          </label>
        </div>
      )}

      <Button type="submit" disabled={add.isPending} className="w-full bg-slate text-cream">
        {add.isPending ? t("journal.saving") : t("journal.saveMoment")}
      </Button>
    </form>
  );
}
```

> NOTE: the existing intensity-related keys (`optionalIntensity`, `addIntensity`, `clearIntensity`) and the old slider are no longer used here — leave the keys in the catalog (other code/tests may reference them; removing risks the parity set). The new control uses `journal.intensity` + `journal.intensityHint`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/journal/quick-moment-composer.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check apps/web/src/components/journal/quick-moment-composer.tsx apps/web/src/components/journal/quick-moment-composer.test.tsx
git add apps/web/src/components/journal/quick-moment-composer.tsx apps/web/src/components/journal/quick-moment-composer.test.tsx
git commit -m "feat(web): one-tap intensity, backdate, inline ABC in moment composer"
```

---

## Task 5: Daily check-in composer (`daily-check-in-composer.tsx`)

Big segmented trend + note + optional backdate; styled for the sheet. Logic largely unchanged (already sends `kind`, `trend`, `note`; now also optional `occurredAt`).

**Files:**
- Rewrite: `apps/web/src/components/journal/daily-check-in-composer.tsx`
- Test: `apps/web/src/components/journal/daily-check-in-composer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/journal/daily-check-in-composer.test.tsx
import { LocaleProvider } from "@/i18n";
import * as journalLib from "@/lib/journal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DailyCheckInComposer } from "./daily-check-in-composer";

vi.mock("@/lib/journal", () => ({ useAddEntry: vi.fn() }));

function setup() {
  const mutateAsync = vi.fn().mockResolvedValue({ id: "c1", kind: "daily_checkin" });
  vi.mocked(journalLib.useAddEntry).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof journalLib.useAddEntry>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <DailyCheckInComposer dogs={[{ id: "d1", name: "Turing" }]} selectedDogId="d1" onDogChange={() => {}} onSaved={() => {}} />
      </QueryClientProvider>
    </LocaleProvider>,
  );
  return { mutateAsync };
}

describe("DailyCheckInComposer", () => {
  it("saves a check-in with the chosen trend", async () => {
    const { mutateAsync } = setup();
    fireEvent.click(screen.getByRole("button", { name: /better/i }));
    fireEvent.change(screen.getByLabelText(/how did today go/i), { target: { value: "calmer walk" } });
    fireEvent.click(screen.getByRole("button", { name: /save check-in/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ kind: "daily_checkin", trend: "better", note: "calmer walk" }));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/journal/daily-check-in-composer.test.tsx`
Expected: FAIL (label "how did today go" not present yet).

- [ ] **Step 3: Rewrite the component**

```tsx
// apps/web/src/components/journal/daily-check-in-composer.tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { type JournalEntry, useAddEntry } from "@/lib/journal";
import { toLocalInputValue } from "@/lib/when";
import type { JournalTrend } from "@turingcare/shared";
import { useState } from "react";
import { toast } from "sonner";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";
const trends: JournalTrend[] = ["better", "same", "harder"];

type DogOption = { id: string; name: string };

type Props = {
  dogs: DogOption[];
  selectedDogId: string;
  onDogChange: (dogId: string) => void;
  onSaved: (entry: JournalEntry) => void;
  autoFocus?: boolean;
};

export function DailyCheckInComposer({ dogs, selectedDogId, onDogChange, onSaved, autoFocus }: Props) {
  const { t } = useI18n();
  const add = useAddEntry(selectedDogId);
  const [trend, setTrend] = useState<JournalTrend>("same");
  const [note, setNote] = useState("");
  const [customTime, setCustomTime] = useState<string | null>(null);
  const [showTime, setShowTime] = useState(false);

  const trendLabel: Record<JournalTrend, string> = {
    better: t("journal.trendBetter"),
    same: t("journal.trendSame"),
    harder: t("journal.trendHarder"),
  };

  const save = async () => {
    const trimmed = note.trim();
    if (!selectedDogId) return toast.error(t("journal.dogRequired"));
    if (!trimmed) return toast.error(t("journal.noteRequired"));
    try {
      const entry = await add.mutateAsync({
        kind: "daily_checkin",
        trend,
        note: trimmed,
        occurredAt: customTime ? new Date(customTime).toISOString() : undefined,
      });
      toast.success(t("journal.saved"));
      onSaved(entry);
    } catch {
      toast.error(t("journal.saveFailed"));
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {dogs.length > 1 && (
        <label className="block" htmlFor="daily-check-in-dog">
          <span className="text-sm font-medium text-slate">{t("journal.pickDog")}</span>
          <select id="daily-check-in-dog" className={input} value={selectedDogId} onChange={(e) => onDogChange(e.target.value)}>
            <option value="">{t("journal.pickDog")}</option>
            {dogs.map((dog) => (
              <option key={dog.id} value={dog.id}>{dog.name}</option>
            ))}
          </select>
        </label>
      )}

      <fieldset className="space-y-1" aria-label={t("journal.trend")}>
        <span className="text-sm font-medium text-slate">{t("journal.howWasToday")}</span>
        <div className="grid grid-cols-3 gap-2">
          {trends.map((value) => (
            <Button
              key={value}
              type="button"
              variant={trend === value ? "default" : "outline"}
              aria-pressed={trend === value}
              className="justify-center"
              onClick={() => setTrend(value)}
            >
              {trendLabel[value]}
            </Button>
          ))}
        </div>
      </fieldset>

      <label className="block" htmlFor="daily-check-in-note">
        <span className="text-sm font-medium text-slate">{t("journal.howWasToday")}</span>
        <textarea
          id="daily-check-in-note"
          // biome-ignore lint/a11y/noAutofocus: intentional focus when opened in a sheet
          autoFocus={autoFocus}
          className={input}
          rows={3}
          placeholder={t("journal.checkInNotePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        {showTime ? (
          <input
            type="datetime-local"
            aria-label={t("journal.changeTime")}
            className="rounded border border-silver bg-white px-2 py-1 text-sm text-slate"
            value={customTime ?? toLocalInputValue(new Date())}
            onChange={(e) => setCustomTime(e.target.value)}
          />
        ) : (
          <Button type="button" variant="outline" onClick={() => { setShowTime(true); setCustomTime(toLocalInputValue(new Date())); }}>
            🕐 {t("journal.timeToday")}
          </Button>
        )}
      </div>

      <Button type="submit" disabled={add.isPending} className="w-full bg-slate text-cream">
        {add.isPending ? t("journal.saving") : t("journal.saveCheckIn")}
      </Button>
    </form>
  );
}
```

> NOTE: the note label intentionally reuses `journal.howWasToday` as the field label; the test queries it via `getByLabelText(/how did today go/i)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/journal/daily-check-in-composer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check apps/web/src/components/journal/daily-check-in-composer.tsx apps/web/src/components/journal/daily-check-in-composer.test.tsx
git add apps/web/src/components/journal/daily-check-in-composer.tsx apps/web/src/components/journal/daily-check-in-composer.test.tsx
git commit -m "feat(web): restyle daily check-in composer with backdate"
```

---

## Task 6: Compact timeline row (`entry-card.tsx`) + remove post-save dialog

Row = status dot + note + humanized meta + intensity/trend badge. Tap the row to open view/edit (existing `StructuredDetailsEditor`); Remove lives inside the opened panel. Delete `post-save-follow-ups.tsx`.

**Files:**
- Rewrite: `apps/web/src/components/journal/entry-card.tsx`
- Delete: `apps/web/src/components/journal/post-save-follow-ups.tsx`
- Test: `apps/web/src/components/journal/entry-card.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/journal/entry-card.test.tsx
import { LocaleProvider } from "@/i18n";
import * as journalLib from "@/lib/journal";
import type { JournalEntry } from "@/lib/journal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntryCard } from "./entry-card";

vi.mock("@/lib/journal", async () => {
  const actual = await vi.importActual<typeof import("@/lib/journal")>("@/lib/journal");
  return { ...actual, useDeleteEntry: vi.fn(), useUpdateEntry: vi.fn() };
});

const base: JournalEntry = {
  id: "e1", dogId: "d1", kind: "moment", occurredAt: new Date(2026, 5, 21, 4, 46).toISOString(),
  note: "barked at bushes", trend: null, antecedent: null, behavior: null, consequence: null,
  intensity: 2, location: null, notes: null, durationSeconds: null, recoverySeconds: null,
  peoplePresent: null, ownerResponse: null, dog: { id: "d1", name: "Turing" },
};

function renderCard(entry: JournalEntry) {
  const del = { mutate: vi.fn() };
  vi.mocked(journalLib.useDeleteEntry).mockReturnValue(del as unknown as ReturnType<typeof journalLib.useDeleteEntry>);
  vi.mocked(journalLib.useUpdateEntry).mockReturnValue({ isPending: false, data: undefined, mutateAsync: vi.fn() } as unknown as ReturnType<typeof journalLib.useUpdateEntry>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <ul><EntryCard entry={entry} dogId="d1" /></ul>
      </QueryClientProvider>
    </LocaleProvider>,
  );
  return { del };
}

describe("EntryCard", () => {
  it("renders note, humanized time, and intensity badge; hides Remove until opened", () => {
    const { del } = renderCard(base);
    expect(screen.getByText("barked at bushes")).toBeInTheDocument();
    expect(screen.getByText(/4:46/)).toBeInTheDocument();
    expect(screen.getByText(/intensity.*2/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    expect(del.mutate).not.toHaveBeenCalled();
  });

  it("opens the entry and exposes Remove", () => {
    renderCard(base);
    fireEvent.click(screen.getByRole("button", { name: /open entry/i }));
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/journal/entry-card.test.tsx`
Expected: FAIL (current card shows Remove always + raw timestamp).

- [ ] **Step 3: Rewrite `entry-card.tsx`**

```tsx
// apps/web/src/components/journal/entry-card.tsx
import { StructuredDetailsEditor } from "@/components/journal/structured-details-editor";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { type JournalEntry, useDeleteEntry, useUpdateEntry } from "@/lib/journal";
import { humanTime } from "@/lib/when";
import { useState } from "react";
import { toast } from "sonner";

const trendDot: Record<string, string> = {
  better: "bg-green-400",
  same: "bg-silver",
  harder: "bg-red-400",
};

export function EntryCard({ entry, dogId }: { entry: JournalEntry; dogId: string }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const del = useDeleteEntry(dogId);
  const upd = useUpdateEntry(dogId);
  const e = upd.data ?? entry;

  const isCheckIn = e.kind === "daily_checkin";
  const dotClass = isCheckIn && e.trend ? trendDot[e.trend] : "bg-silver";
  const trendLabel = { better: t("journal.trendBetter"), same: t("journal.trendSame"), harder: t("journal.trendHarder") };
  const meta = [
    e.dog?.name,
    humanTime(e.occurredAt, locale),
    isCheckIn ? t("journal.kindDailyCheckIn") : t("journal.kindMoment"),
  ].filter(Boolean).join(" · ");

  return (
    <li className="rounded-xl border border-silver bg-white text-sm">
      <button
        type="button"
        aria-label={t("journal.openEntry")}
        className="flex w-full items-start gap-3 p-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate">{e.note}</span>
            {isCheckIn && e.trend && (
              <span className="rounded-full bg-slate/5 px-2 py-0.5 text-xs font-semibold text-slate-soft">{trendLabel[e.trend]}</span>
            )}
            {e.intensity != null && (
              <span className="rounded-full bg-copper/15 px-2 py-0.5 text-xs font-semibold text-copper">
                {t("journal.intensity")}: {e.intensity}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-slate-soft">{meta}</span>
        </span>
      </button>

      {open && !editing && (
        <div className="flex gap-2 border-t border-silver p-3">
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            {t("journal.editDetails")}
          </Button>
          <Button type="button" variant="outline" onClick={() => del.mutate(e.id)}>
            {t("journal.remove")}
          </Button>
        </div>
      )}

      {open && editing && (
        <StructuredDetailsEditor
          entry={e}
          submitting={upd.isPending}
          onCancel={() => setEditing(false)}
          onSave={async (body) => {
            try {
              await upd.mutateAsync({ entryId: e.id, body });
              toast.success(t("journal.savedEdit"));
              setEditing(false);
            } catch {
              toast.error(t("journal.saveFailed"));
            }
          }}
        />
      )}
    </li>
  );
}
```

- [ ] **Step 4: Delete the post-save dialog component**

```bash
git rm apps/web/src/components/journal/post-save-follow-ups.tsx
```

(Its only importer, `journal-view.tsx`, is rewritten in Task 7. If a `post-save-follow-ups.test.tsx` exists, `git rm` it too.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/journal/entry-card.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + lint + commit**

```bash
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check apps/web/src/components/journal/entry-card.tsx apps/web/src/components/journal/entry-card.test.tsx
git add -A apps/web/src/components/journal/
git commit -m "feat(web): compact journal timeline rows; remove post-save dialog"
```

---

## Task 7: JournalView — tiles + sheets + grouped timeline

Replace the segmented mode toggle with two tiles that open `Sheet`-hosted composers, and group the entry list by day. Removes `PostSaveFollowUps` usage and the `mode`/`followUpEntry` state.

**Files:**
- Rewrite: `apps/web/src/components/journal/journal-view.tsx`
- Test: `apps/web/src/components/journal/journal-view.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/journal/journal-view.test.tsx
import { LocaleProvider } from "@/i18n";
import * as dogsLib from "@/lib/dogs";
import * as journalLib from "@/lib/journal";
import type { JournalEntry } from "@/lib/journal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { JournalView } from "./journal-view";

vi.mock("@/lib/dogs", () => ({ useDogs: vi.fn() }));
vi.mock("@/lib/journal", async () => {
  const actual = await vi.importActual<typeof import("@/lib/journal")>("@/lib/journal");
  return { ...actual, useJournal: vi.fn(), useAddEntry: vi.fn(), useDeleteEntry: vi.fn(), useUpdateEntry: vi.fn() };
});

const entries: JournalEntry[] = [
  { id: "e1", dogId: "d1", kind: "moment", occurredAt: new Date(2026, 5, 21, 4, 46).toISOString(), note: "barked at bushes", trend: null, antecedent: null, behavior: null, consequence: null, intensity: null, location: null, notes: null, durationSeconds: null, recoverySeconds: null, peoplePresent: null, ownerResponse: null, dog: { id: "d1", name: "Turing" } },
];

function setup() {
  vi.mocked(dogsLib.useDogs).mockReturnValue({ data: [{ id: "d1", name: "Turing" }] } as unknown as ReturnType<typeof dogsLib.useDogs>);
  vi.mocked(journalLib.useJournal).mockReturnValue({ data: entries, isError: false } as unknown as ReturnType<typeof journalLib.useJournal>);
  vi.mocked(journalLib.useAddEntry).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof journalLib.useAddEntry>);
  vi.mocked(journalLib.useDeleteEntry).mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof journalLib.useDeleteEntry>);
  vi.mocked(journalLib.useUpdateEntry).mockReturnValue({ isPending: false, data: undefined, mutateAsync: vi.fn() } as unknown as ReturnType<typeof journalLib.useUpdateEntry>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><JournalView scopedDogId="d1" /></MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("JournalView", () => {
  it("shows day-grouped entries with a Today label", () => {
    setup();
    expect(screen.getByText(/today/i)).toBeInTheDocument();
    expect(screen.getByText("barked at bushes")).toBeInTheDocument();
  });

  it("opens the Log a moment sheet from the tile", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /log a moment/i }));
    expect(screen.getByRole("dialog", { name: /log/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/journal/journal-view.test.tsx`
Expected: FAIL (no tiles/dialog yet; current uses a segmented toggle).

- [ ] **Step 3: Rewrite `journal-view.tsx`**

```tsx
// apps/web/src/components/journal/journal-view.tsx
import { DailyCheckInComposer } from "@/components/journal/daily-check-in-composer";
import { EntryCard } from "@/components/journal/entry-card";
import { QuickMomentComposer } from "@/components/journal/quick-moment-composer";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n";
import { useDogs } from "@/lib/dogs";
import { type JournalEntry, useJournal } from "@/lib/journal";
import { dateLabel, groupByDay } from "@/lib/when";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

type Mode = "moment" | "daily_checkin";

type JournalViewProps = { scopedDogId?: string; composeMode?: Mode };

function normalizeEntry(entry: JournalEntry): JournalEntry {
  return {
    ...entry,
    occurredAt: String(entry.occurredAt),
    trend: entry.trend ?? null,
    antecedent: entry.antecedent ?? null,
    behavior: entry.behavior ?? null,
    consequence: entry.consequence ?? null,
    intensity: entry.intensity ?? null,
    location: entry.location ?? null,
    notes: entry.notes ?? null,
    durationSeconds: entry.durationSeconds ?? null,
    recoverySeconds: entry.recoverySeconds ?? null,
    peoplePresent: entry.peoplePresent ?? null,
    ownerResponse: entry.ownerResponse ?? null,
  };
}

export function JournalView({ scopedDogId, composeMode }: JournalViewProps) {
  const { t, locale } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterDogId = scopedDogId ?? searchParams.get("dogId") ?? "";
  const { data: dogs } = useDogs();
  const dogList = useMemo(() => dogs ?? [], [dogs]);
  const { data: entries, isError } = useJournal(filterDogId || undefined);
  const [selectedDogId, setSelectedDogId] = useState(filterDogId);
  const [sheet, setSheet] = useState<Mode | null>(composeMode ?? null);

  const dogNameById = useMemo(() => new Map(dogList.map((d) => [d.id, d.name] as const)), [dogList]);

  useEffect(() => {
    setSelectedDogId((current) => {
      if (filterDogId) return filterDogId;
      const onlyDog = dogList[0];
      if (!current && dogList.length === 1 && onlyDog) return onlyDog.id;
      return current;
    });
  }, [dogList, filterDogId]);

  const updateFilter = (dogId: string) => {
    const next = new URLSearchParams(searchParams);
    if (dogId) next.set("dogId", dogId);
    else next.delete("dogId");
    setSearchParams(next);
  };

  const counts = useMemo(() => {
    const list = entries ?? [];
    return {
      moments: list.filter((e) => e.kind === "moment").length,
      checkins: list.filter((e) => e.kind === "daily_checkin").length,
    };
  }, [entries]);

  const groups = useMemo(
    () => groupByDay((entries ?? []).map(normalizeEntry), (e) => e.occurredAt),
    [entries],
  );

  const dayHeading = (kind: string, sample: Date) =>
    kind === "today" ? t("journal.dayToday") : kind === "yesterday" ? t("journal.dayYesterday") : dateLabel(sample, new Date(), locale);

  if (dogs && dogs.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-slate-soft">{t("journal.noDogs")}</p>
        <Button asChild className="bg-slate text-cream">
          <Link to="/my/dogs/new">{t("journal.addDog")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!scopedDogId && (
        <label className="block" htmlFor="journal-filter-dog">
          <span className="text-sm font-medium text-slate">{t("journal.pickDog")}</span>
          <select id="journal-filter-dog" className={input} value={filterDogId} onChange={(e) => updateFilter(e.target.value)}>
            <option value="">{t("journal.filterAllDogs")}</option>
            {dogList.map((dog) => (
              <option key={dog.id} value={dog.id}>{dog.name}</option>
            ))}
          </select>
        </label>
      )}

      {(counts.moments > 0 || counts.checkins > 0) && (
        <p className="text-sm text-slate-soft">
          {t("journal.summaryCount", { moments: counts.moments, checkins: counts.checkins })}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setSheet("moment")}
          className="flex items-center gap-3 rounded-xl bg-slate p-4 text-left font-semibold text-cream"
        >
          ＋ {t("journal.logMoment")}
        </button>
        <button
          type="button"
          onClick={() => setSheet("daily_checkin")}
          className="flex items-center gap-3 rounded-xl border border-silver bg-white p-4 text-left font-semibold text-slate"
        >
          📋 {t("journal.dailyCheckIn")}
        </button>
      </div>

      <Sheet open={sheet === "moment"} title={t("journal.logMoment")} closeLabel={t("journal.closeSheet")} onClose={() => setSheet(null)}>
        <QuickMomentComposer
          dogs={dogList}
          selectedDogId={selectedDogId}
          onDogChange={setSelectedDogId}
          autoFocus
          onSaved={() => setSheet(null)}
        />
      </Sheet>
      <Sheet open={sheet === "daily_checkin"} title={t("journal.dailyCheckIn")} closeLabel={t("journal.closeSheet")} onClose={() => setSheet(null)}>
        <DailyCheckInComposer
          dogs={dogList}
          selectedDogId={selectedDogId}
          onDogChange={setSelectedDogId}
          autoFocus
          onSaved={() => setSheet(null)}
        />
      </Sheet>

      {isError && <p className="text-red-600">{t("journal.loadError")}</p>}
      {entries?.length === 0 && (
        <section className="space-y-2 rounded-xl border border-silver bg-white p-6 text-center">
          <h2 className="text-lg font-semibold text-slate">{t("journal.emptyTitle")}</h2>
          <p className="text-slate-soft">{t("journal.emptyBody")}</p>
        </section>
      )}

      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.key} className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-soft">
              {dayHeading(group.kind, group.sample)}
            </h3>
            <ul className="space-y-2">
              {group.items.map((entry) => {
                const withDog: JournalEntry = { ...entry, dog: entry.dog ?? { id: entry.dogId, name: dogNameById.get(entry.dogId) ?? "" } };
                return <EntryCard key={entry.id} entry={withDog} dogId={entry.dogId} />;
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
```

> NOTE: `useI18n().t` supports `{var}` interpolation, so `t("journal.summaryCount", { moments, checkins })` works. `composeMode` (passed by `dog-journal.tsx` via `?compose=`) now opens the matching sheet on mount.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/journal/journal-view.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full journal test set + typecheck + lint**

```bash
pnpm --filter @turingcare/web exec vitest run src/components/journal
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check apps/web/src/components/journal/journal-view.tsx apps/web/src/components/journal/journal-view.test.tsx
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/journal/journal-view.tsx apps/web/src/components/journal/journal-view.test.tsx
git commit -m "feat(web): journal tiles + capture sheets + day-grouped timeline"
```

---

## Task 8: Brief review screen (`brief.tsx`)

Status pill, period chips that regenerate on change, a styled document-preview card (brand header + dog name + status pill + summary + humanized `generatedOn`), and a single primary "Share this brief" that opens the share sheet (Task 9). Keep dog-picker (global route), generate/empty/error states.

**Files:**
- Rewrite: `apps/web/src/routes/brief.tsx`
- Test: `apps/web/src/routes/brief.test.tsx`

> Depends on Task 9's `BriefShareSheet`. Implement Task 9 first if executing strictly TDD, OR stub the import and fill in Task 9. Recommended order: do Task 9, then Task 8. (Listed in this order for narrative; executor may swap.)

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/routes/brief.test.tsx
import { LocaleProvider } from "@/i18n";
import * as briefLib from "@/lib/brief";
import * as sendLib from "@/lib/brief-send";
import * as dogsLib from "@/lib/dogs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Brief } from "./brief";

vi.mock("@/lib/dogs", () => ({ useDogs: vi.fn() }));
vi.mock("@/lib/brief-send", () => ({ useBriefSends: vi.fn(), useSendBrief: vi.fn() }));
vi.mock("@/lib/brief", () => ({
  useBrief: vi.fn(), useGenerateBrief: vi.fn(), useFinalizeBrief: vi.fn(), useShareBrief: vi.fn(), useRevokeShare: vi.fn(),
}));

function setup(brief: unknown) {
  vi.mocked(dogsLib.useDogs).mockReturnValue({ data: [{ id: "d1", name: "Turing" }] } as unknown as ReturnType<typeof dogsLib.useDogs>);
  vi.mocked(briefLib.useBrief).mockReturnValue({ data: brief, isError: false } as unknown as ReturnType<typeof briefLib.useBrief>);
  vi.mocked(briefLib.useGenerateBrief).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof briefLib.useGenerateBrief>);
  vi.mocked(briefLib.useFinalizeBrief).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof briefLib.useFinalizeBrief>);
  vi.mocked(briefLib.useShareBrief).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof briefLib.useShareBrief>);
  vi.mocked(briefLib.useRevokeShare).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof briefLib.useRevokeShare>);
  vi.mocked(sendLib.useBriefSends).mockReturnValue({ data: [] } as unknown as ReturnType<typeof sendLib.useBriefSends>);
  vi.mocked(sendLib.useSendBrief).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof sendLib.useSendBrief>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/my/dogs/d1/brief"]}>
          <Routes><Route path="/my/dogs/:id/brief" element={<Brief />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("Brief review", () => {
  it("renders the document preview with status and a Share action", () => {
    setup({ status: "draft", version: 2, summary: "Turing summary text", generatedAt: new Date(2026, 5, 21).toISOString(), shareToken: null });
    expect(screen.getByText("Turing summary text")).toBeInTheDocument();
    expect(screen.getByText(/draft · v2/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /share this brief/i })).toBeInTheDocument();
  });

  it("opens the share sheet", () => {
    setup({ status: "finalized", version: 3, summary: "x", generatedAt: new Date(2026, 5, 21).toISOString(), shareToken: null });
    fireEvent.click(screen.getByRole("button", { name: /share this brief/i }));
    expect(screen.getByRole("dialog", { name: /share/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/brief.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite `brief.tsx`**

```tsx
// apps/web/src/routes/brief.tsx
import { BriefShareSheet } from "@/components/brief/share-sheet";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useBrief, useGenerateBrief } from "@/lib/brief";
import { useDogs } from "@/lib/dogs";
import { type BriefWindow, briefWindows } from "@turingcare/shared";
import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

export function Brief() {
  const { t, locale } = useI18n();
  const { id: routeId } = useParams();
  const [params] = useSearchParams();
  const recipientParam = params.get("recipient") ?? undefined;
  const { data: dogs } = useDogs();
  const [picked, setPicked] = useState("");
  const dogId = routeId ?? picked ?? "";
  const [windowChoice, setWindowChoice] = useState<BriefWindow>("30d");
  const { data: brief, isError } = useBrief(dogId);
  const dog = dogs?.find((d) => d.id === dogId);
  const gen = useGenerateBrief(dogId);
  const [shareOpen, setShareOpen] = useState(false);

  const windowLabels: Record<BriefWindow, string> = {
    "7d": t("brief.window7d"), "30d": t("brief.window30d"), "90d": t("brief.window90d"), all: t("brief.windowAll"),
  };

  const generatedOn = brief
    ? (() => {
        const d = new Date(brief.generatedAt);
        if (Number.isNaN(d.getTime())) return "";
        return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(d);
      })()
    : "";

  const statusLabel = brief
    ? brief.status === "finalized"
      ? t("brief.finalVersion", { version: brief.version })
      : t("brief.draftVersion", { version: brief.version })
    : "";

  const regenerate = async (w: BriefWindow) => {
    setWindowChoice(w);
    try {
      await gen.mutateAsync(w);
    } catch {
      toast.error(t("brief.genFailed"));
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-slate">{t("brief.title")}</h1>

      {!routeId && (
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("brief.pickDog")}</span>
          <select className="w-full rounded border border-silver bg-white px-3 py-2 text-sm" value={picked} onChange={(e) => setPicked(e.target.value)}>
            <option value="">—</option>
            {dogs?.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
          </select>
        </label>
      )}

      {dogId && (
        <>
          <fieldset className="m-0 min-w-0 space-y-1 border-0 p-0">
            <legend className="p-0 text-sm font-medium text-slate">{t("brief.windowLabel")}</legend>
            <div className="flex flex-wrap items-center gap-2">
              {briefWindows.map((w) => (
                <Button key={w} type="button" variant={windowChoice === w ? "default" : "outline"} disabled={gen.isPending} onClick={() => regenerate(w)}>
                  {windowLabels[w]}
                </Button>
              ))}
            </div>
          </fieldset>

          {!brief && (
            <Button disabled={gen.isPending} onClick={() => regenerate(windowChoice)} className="bg-slate text-cream">
              {gen.isPending ? t("brief.generating") : t("brief.generate")}
            </Button>
          )}

          {isError && <p className="text-red-600">{t("brief.loadError")}</p>}

          {!brief && !isError && (
            <section className="space-y-2 rounded-xl border border-silver bg-white p-6 text-center">
              <h2 className="text-lg font-semibold text-slate">{t("brief.emptyTitle")}</h2>
              <p className="text-slate-soft">{t("brief.emptyBodyWithEntries")}</p>
            </section>
          )}

          {brief && (
            <>
              <article className="brief-print overflow-hidden rounded-xl border border-silver bg-white text-sm text-slate">
                <header className="flex items-center justify-between border-b-2 border-copper px-5 py-3">
                  <span className="text-lg font-bold text-slate">
                    Turing<span className="text-copper">Care</span>
                  </span>
                  <span className="text-xs uppercase tracking-wide text-slate-soft">{t("brief.title")}</span>
                </header>
                <div className="space-y-3 p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate">{dog?.name}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${brief.status === "finalized" ? "bg-green-100 text-green-800" : "bg-slate/5 text-slate-soft"}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed text-slate">{brief.summary}</p>
                  {generatedOn && <p className="border-t border-silver pt-3 text-xs text-slate-soft">{t("brief.generatedOn", { date: generatedOn })}</p>}
                </div>
              </article>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setShareOpen(true)} className="bg-slate text-cream">
                  {t("brief.shareThisBrief")} ▸
                </Button>
                <Button variant="outline" disabled={gen.isPending} onClick={() => regenerate(windowChoice)}>
                  {t("brief.regenerate")}
                </Button>
              </div>

              <BriefShareSheet
                open={shareOpen}
                onClose={() => setShareOpen(false)}
                dogId={dogId}
                dogName={dog?.name ?? ""}
                dog={dog}
                brief={brief}
                initialRecipient={recipientParam}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/brief.test.tsx`
Expected: PASS (after Task 9 exists).

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check apps/web/src/routes/brief.tsx apps/web/src/routes/brief.test.tsx
git add apps/web/src/routes/brief.tsx apps/web/src/routes/brief.test.tsx
git commit -m "feat(web): brief review screen with document preview + period chips"
```

---

## Task 9: Brief share sheet (`components/brief/share-sheet.tsx`)

Big tiles: ✉️ email (finalize-on-share, then `SendPanel` form), 🔗 copy private link (create/copy/revoke), ⬇️ download PDF. Folds the old scattered buttons + the hidden finalize gate into one explained surface.

**Files:**
- Create: `apps/web/src/components/brief/share-sheet.tsx`
- Modify: `apps/web/src/components/brief/send-panel.tsx` (drop the `needsFinalized` gate text; the share flow guarantees finalized)
- Test: `apps/web/src/components/brief/share-sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/brief/share-sheet.test.tsx
import { LocaleProvider } from "@/i18n";
import * as briefLib from "@/lib/brief";
import * as sendLib from "@/lib/brief-send";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BriefShareSheet } from "./share-sheet";

vi.mock("@/lib/brief-send", () => ({ useBriefSends: vi.fn(), useSendBrief: vi.fn() }));
vi.mock("@/lib/brief", () => ({ useFinalizeBrief: vi.fn(), useShareBrief: vi.fn(), useRevokeShare: vi.fn() }));
// PDF button is lazy + heavy; stub it.
vi.mock("@/components/brief-download-button", () => ({ default: () => <button type="button">Download PDF</button> }));

const brief = { status: "draft", version: 2, summary: "x", generatedAt: new Date().toISOString(), shareToken: null } as const;

function setup(over: Partial<typeof brief> = {}) {
  const finalize = vi.fn().mockResolvedValue({});
  vi.mocked(briefLib.useFinalizeBrief).mockReturnValue({ mutateAsync: finalize, isPending: false } as unknown as ReturnType<typeof briefLib.useFinalizeBrief>);
  vi.mocked(briefLib.useShareBrief).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof briefLib.useShareBrief>);
  vi.mocked(briefLib.useRevokeShare).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof briefLib.useRevokeShare>);
  vi.mocked(sendLib.useBriefSends).mockReturnValue({ data: [] } as unknown as ReturnType<typeof sendLib.useBriefSends>);
  vi.mocked(sendLib.useSendBrief).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof sendLib.useSendBrief>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <BriefShareSheet open onClose={() => {}} dogId="d1" dogName="Turing" dog={undefined} brief={{ ...brief, ...over }} />
      </QueryClientProvider>
    </LocaleProvider>,
  );
  return { finalize };
}

describe("BriefShareSheet", () => {
  it("lists the three share options with explanations", () => {
    setup();
    expect(screen.getByRole("button", { name: /send to your trainer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy a private link/i })).toBeInTheDocument();
  });

  it("finalizes a draft when opening the email option", async () => {
    const { finalize } = setup({ status: "draft" });
    fireEvent.click(screen.getByRole("button", { name: /send to your trainer/i }));
    await waitFor(() => expect(finalize).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/brief/share-sheet.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `components/brief/share-sheet.tsx`**

```tsx
// apps/web/src/components/brief/share-sheet.tsx
import { SendPanel } from "@/components/brief/send-panel";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n";
import { useFinalizeBrief, useRevokeShare, useShareBrief } from "@/lib/brief";
import type { DogForPdf } from "@/lib/brief-pdf-model";
import { Suspense, lazy, useState } from "react";
import { toast } from "sonner";

const BriefDownloadButton = lazy(() => import("@/components/brief-download-button"));

type BriefLike = { status: "draft" | "finalized"; version: number; summary: string; generatedAt: string; shareToken?: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  dogId: string;
  dogName: string;
  dog?: DogForPdf | null;
  brief: BriefLike;
  initialRecipient?: string;
};

type Panel = "menu" | "email" | "link";

export function BriefShareSheet({ open, onClose, dogId, dogName, dog, brief, initialRecipient }: Props) {
  const { t } = useI18n();
  const fin = useFinalizeBrief(dogId);
  const share = useShareBrief(dogId);
  const revoke = useRevokeShare(dogId);
  const [panel, setPanel] = useState<Panel>("menu");
  const shareUrl = brief.shareToken ? `${window.location.origin}/b/${brief.shareToken}` : null;

  const ensureFinalized = async () => {
    if (brief.status !== "finalized") await fin.mutateAsync();
  };

  const openEmail = async () => {
    try {
      await ensureFinalized();
      setPanel("email");
    } catch {
      toast.error(t("brief.genFailed"));
    }
  };

  const openLink = async () => {
    try {
      await ensureFinalized();
      if (!shareUrl) await share.mutateAsync();
      setPanel("link");
    } catch {
      toast.error(t("brief.shareFailed"));
    }
  };

  const tile = "flex w-full items-center gap-3 rounded-xl border border-silver bg-white p-4 text-left";

  return (
    <Sheet open={open} title={panel === "menu" ? t("brief.shareHeading", { name: dogName }) : t("brief.shareHeading", { name: dogName })} closeLabel={t("journal.closeSheet")} onClose={() => { setPanel("menu"); onClose(); }}>
      {panel !== "menu" && (
        <button type="button" className="mb-3 text-sm font-medium text-slate-soft" onClick={() => setPanel("menu")}>
          ‹ {t("brief.backToBrief")}
        </button>
      )}

      {panel === "menu" && (
        <div className="space-y-3">
          <p className="rounded-lg border border-copper/40 bg-copper/10 p-3 text-sm text-slate">
            {t("brief.finalizeShareNote", { version: brief.version })}
          </p>
          <button type="button" className={`${tile} bg-slate text-cream`} onClick={() => void openEmail()}>
            <span className="text-xl">✉️</span>
            <span><span className="block font-semibold">{t("brief.shareEmailTitle")}</span><span className="block text-xs text-cream/80">{t("brief.shareEmailDesc")}</span></span>
          </button>
          <button type="button" className={tile} onClick={() => void openLink()}>
            <span className="text-xl">🔗</span>
            <span><span className="block font-semibold text-slate">{t("brief.shareLinkTitle")}</span><span className="block text-xs text-slate-soft">{t("brief.shareLinkDesc")}</span></span>
          </button>
          <div className={tile}>
            <span className="text-xl">⬇️</span>
            <span className="flex-1">
              <span className="block font-semibold text-slate">{t("brief.sharePdfTitle")}</span>
              <span className="block text-xs text-slate-soft">{t("brief.sharePdfDesc")}</span>
              <span className="mt-2 block">
                <Suspense fallback={<Button variant="outline" disabled>{t("brief.preparingPdf")}</Button>}>
                  <BriefDownloadButton brief={{ ...brief, status: brief.status }} dog={dog ?? undefined} />
                </Suspense>
              </span>
            </span>
          </div>
        </div>
      )}

      {panel === "email" && (
        <SendPanel dogId={dogId} briefStatus="finalized" initialRecipient={initialRecipient} />
      )}

      {panel === "link" && (
        <div className="space-y-3">
          {shareUrl ? (
            <>
              <input readOnly aria-label={t("brief.share")} value={shareUrl} className="w-full rounded border border-silver bg-white px-2 py-2 text-sm" />
              <div className="flex gap-2">
                <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(shareUrl); toast.success(t("brief.linkCopied")); } catch { toast.error(t("brief.shareFailed")); } }}>
                  {t("brief.copyLink")}
                </Button>
                <Button variant="outline" disabled={revoke.isPending} onClick={async () => { try { await revoke.mutateAsync(); setPanel("menu"); } catch { toast.error(t("brief.shareFailed")); } }}>
                  {t("brief.stopSharing")}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-soft">{t("brief.generating")}</p>
          )}
        </div>
      )}
    </Sheet>
  );
}
```

> NOTE on the PDF button: `BriefDownloadButton` expects `brief` shaped as `BriefForPdf` (`{ generatedAt, status, summary, version }`) and `dog?: DogForPdf`. The `brief` prop already has those fields. Confirm the existing prop names by reading `apps/web/src/components/brief-download-button.tsx` before wiring; adjust the spread if needed.

- [ ] **Step 4: Simplify `send-panel.tsx`**

In `send-panel.tsx`, since the share flow only mounts it when finalized, replace the conditional submit/`needsFinalized` block (lines ~86-92) with an always-enabled submit button:

```tsx
        <Button type="submit" disabled={isSubmitting} className="w-full bg-slate text-cream">
          {isSubmitting ? t("briefSend.sending") : t("briefSend.send")}
        </Button>
```

Remove the now-unused `briefStatus === "finalized" ? … : …` ternary. Keep the `briefStatus` prop (still passed) but it no longer gates the button. Leave `briefSend.needsFinalized` key in the catalog (harmless).

- [ ] **Step 5: Run test + typecheck + lint**

```bash
pnpm --filter @turingcare/web exec vitest run src/components/brief/share-sheet.test.tsx
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm exec biome check apps/web/src/components/brief/share-sheet.tsx apps/web/src/components/brief/send-panel.tsx apps/web/src/components/brief/share-sheet.test.tsx
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/brief/
git commit -m "feat(web): brief share sheet with finalize-on-share + explained options"
```

---

## Task 10: Full verification + polish

**Files:** none new — verification and any small fixes surfaced.

- [ ] **Step 1: Full web test suite**

Run: `pnpm --filter @turingcare/web test`
Expected: all green (existing 190 + new tests). Fix any suite that referenced the removed `PostSaveFollowUps` or old journal/brief markup.

- [ ] **Step 2: Typecheck the whole web app**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Biome across the app**

Run: `pnpm exec biome check apps/web/src`
Expected: 0 errors (run `--write` to auto-fix formatting, then re-check).

- [ ] **Step 4: i18n parity**

Run: `pnpm --filter @turingcare/web exec vitest run src/i18n/i18n.test.tsx`
Expected: PASS.

- [ ] **Step 5: react-doctor regression check**

Run: `pnpm --filter @turingcare/web exec react-doctor --staged --fail-on warning` (or the repo's documented invocation)
Expected: no NEW accessibility/architecture regressions vs. baseline. Address any introduced by the new Sheet/tiles (e.g., ensure dialog has an accessible name, buttons have labels).

- [ ] **Step 6: Manual responsive smoke (document result)**

Run `pnpm dev`, open `/my/journal` and `/my/dogs/:id/brief` at 390px (mobile) and desktop widths. Confirm: tiles tappable, sheet opens/closes (Esc, backdrop, ✕), one-tap intensity, backdate, Add detail, timeline day grouping + humanized times, brief preview + share tiles + finalize-on-share + link copy + PDF. Note anything off; fix.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore(web): verify journal/brief redesign green (tests, tsc, biome, a11y)"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** Journal home tiles + summary (T7) ✓; capture sheets/one-tap intensity/backdate/inline ABC/no nag (T2,T4,T5,T6,T7) ✓; compact day-grouped timeline w/ humanized time + badges (T1,T6,T7) ✓; entry view/edit + internal remove (T6) ✓; brief review document preview + period chips + status pill + humanized generatedAt (T8) ✓; share sheet big tiles + finalize-on-share + explained options + link/email/PDF (T9) ✓; i18n parity (T3, all tasks) ✓; responsive/a11y + testing (T10) ✓.

**Scope:** Single cohesive frontend plan; no decomposition needed.

**Deviation from mockups (intentional, called out):** the brief preview renders the existing single `summary` text in a styled document card (brand header, dog name, status pill, humanized date) rather than newly-parsed Summary/Working-on/Trend sections — those would require API changes and are out of the frontend-only scope. Logged as a follow-up in the spec.

**Type consistency:** `groupByDay`/`dayKindOf`/`dateLabel`/`humanTime`/`toLocalInputValue` signatures consistent across T1/T6/T7; `Sheet` props (`open`,`title`,`onClose`,`closeLabel`) consistent T2/T7/T9; composer props gain `autoFocus?` consistently; `BriefShareSheet` props match `brief.tsx` usage in T8.

**Placeholders:** none — every step has concrete code/commands.
