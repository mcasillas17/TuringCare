# Windowed, Trend-Aware Behavior Brief — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dog behavior brief recency-aware — generate it over a chosen time window (7/30/90 days or all-time, default 30), surface the daily check-in trend as a tally, and list up to 10 recent entries.

**Architecture:** Add a `window` enum to the brief-generate request. The API route maps it to a cutoff date, date-filters the journal query, and passes `windowDays` + each entry's `kind`/`trend` to the existing deterministic `composeBrief` text template. The web brief page gains a segmented window control. No schema/migration; the email-send flow is untouched (it reuses the stored summary).

**Tech Stack:** Hono + Drizzle + Zod (`apps/api`), Vite/React 19 + TanStack Query + hono RPC client (`apps/web`), shared Zod schemas (`packages/shared`), Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-05-25-brief-windowed-trend-design.md`

---

## File Structure

- `packages/shared/src/brief.ts` — **Modify**: add `briefWindows`, `briefGenerateSchema`, `BriefWindow`, `BriefGenerateInput`.
- `packages/shared/src/brief.test.ts` — **Create**: schema default/validation tests.
- `apps/api/src/lib/brief.ts` — **Modify**: `BriefInput` gains `windowDays` + per-entry `kind`/`trend`; new Journal line wording, check-ins tally line, 10-entry cap.
- `apps/api/src/lib/brief.test.ts` — **Modify**: update 3 existing cases to the new contract; **add** trend-tally/10-cap and all-time/zero-checkins cases.
- `apps/api/src/routes/dogs.ts` — **Modify**: `POST /:id/brief` parses `window`, date-filters the journal query, passes `windowDays`/`kind`/`trend`.
- `apps/api/src/routes/dogs.test.ts` — **Modify**: send `{}` body on existing brief POSTs; **add** a windowing + trend route test.
- `apps/web/src/lib/brief.ts` — **Modify**: `useGenerateBrief` takes a `BriefWindow` and sends it as JSON.
- `apps/web/src/routes/brief.tsx` — **Modify**: add the segmented window control; pass the choice to the mutation.
- `apps/web/src/routes/brief.test.tsx` — **Modify**: assert the selected window reaches the mutation.
- `apps/web/src/i18n/en.ts` + `apps/web/src/i18n/es.ts` — **Modify**: add window-control labels.

---

## Task 1: Shared `window` schema

**Files:**
- Modify: `packages/shared/src/brief.ts`
- Test: `packages/shared/src/brief.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/brief.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { briefGenerateSchema } from "./brief";

describe("briefGenerateSchema", () => {
  it("defaults window to 30d when omitted", () => {
    expect(briefGenerateSchema.parse({})).toEqual({ window: "30d" });
  });

  it("accepts each allowed window", () => {
    for (const w of ["7d", "30d", "90d", "all"] as const) {
      expect(briefGenerateSchema.parse({ window: w }).window).toBe(w);
    }
  });

  it("rejects an unknown window", () => {
    expect(briefGenerateSchema.safeParse({ window: "1y" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @turingcare/shared test -- brief`
Expected: FAIL — `briefGenerateSchema` is not exported.

- [ ] **Step 3: Implement the schema**

In `packages/shared/src/brief.ts`, add below the existing `briefSendSchema` block:

```ts
export const briefWindows = ["7d", "30d", "90d", "all"] as const;
export type BriefWindow = (typeof briefWindows)[number];

export const briefGenerateSchema = z.object({
  window: z.enum(briefWindows).default("30d"),
});
export type BriefGenerateInput = z.infer<typeof briefGenerateSchema>;
```

(`z` is already imported at the top of the file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @turingcare/shared test -- brief`
Expected: PASS (3 tests).

- [ ] **Step 5: Confirm the package still builds (web/api import from it)**

Run: `pnpm --filter @turingcare/shared build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/brief.ts packages/shared/src/brief.test.ts
git commit -m "feat(shared): brief generate schema with time-window enum"
```

---

## Task 2: `composeBrief` — window label, trend tally, 10-entry cap

**Files:**
- Modify: `apps/api/src/lib/brief.ts`
- Test: `apps/api/src/lib/brief.test.ts`

This task is pure (no DB) — its tests run without the test Postgres.

- [ ] **Step 1: Update existing tests + add new ones (write the failing tests)**

In `apps/api/src/lib/brief.test.ts`:

(a) In the first test (`"includes name, concerns, goals, and note-first journal stats deterministically"`), add `kind: "moment"` to **both** entries, add `windowDays: 30` to the input, change the `"2 journal"` assertion, and add `windowDays: 30` to the determinism pair. The full updated test body:

```ts
  it("includes name, concerns, goals, and note-first journal stats deterministically", () => {
    const out = composeBrief({
      dog,
      concerns: [{ concern: "Leash reactivity", severity: "moderate" }],
      goals: [{ goal: "Calm greetings" }],
      windowDays: 30,
      entries: [
        {
          note: "Barked at delivery truck",
          kind: "moment",
          behavior: "Barked",
          intensity: 4,
          occurredAt: "2026-05-18T10:00:00.000Z",
        },
        {
          note: "Recovered faster on walk",
          kind: "moment",
          behavior: null,
          intensity: null,
          occurredAt: "2026-05-17T10:00:00.000Z",
        },
      ],
    });
    expect(out).toContain("Biscuit");
    expect(out).toContain("Leash reactivity (moderate)");
    expect(out).toContain("Calm greetings");
    expect(out).toContain("2 entries in the last 30 days");
    expect(out).toContain("average intensity 4.0");
    expect(out).toContain("Barked at delivery truck");
    expect(out).toContain("Recovered faster on walk");
    expect(composeBrief({ dog, concerns: [], goals: [], entries: [], windowDays: 30 })).toBe(
      composeBrief({ dog, concerns: [], goals: [], entries: [], windowDays: 30 }),
    );
  });
```

(b) In the second test (`"renders training progress and omits zero-skill goals"`) and the third (`"omits training progress when no goals exist"`), add `windowDays: 30` to each `composeBrief({ ... })` call's input object (alongside `entries: []`). Example for the third:

```ts
  it("omits training progress when no goals exist", () => {
    const out = composeBrief({ dog, concerns: [], goals: [], entries: [], windowDays: 30, progress: [] });
    expect(out).not.toContain("Training progress:");
  });
```

(c) Add two new tests at the end of the `describe("composeBrief", ...)` block, before its closing `});`:

```ts
  it("tallies check-in trends and caps the entry list at 10 within the window", () => {
    const entries = [];
    for (let n = 0; n < 12; n++) {
      entries.push({
        note: `moment ${n}`,
        kind: "moment" as const,
        occurredAt: `2026-05-${String(10 + n).padStart(2, "0")}T10:00:00.000Z`,
      });
    }
    entries.push({ note: "good", kind: "daily_checkin" as const, trend: "better" as const, occurredAt: "2026-05-23T09:00:00.000Z" });
    entries.push({ note: "good2", kind: "daily_checkin" as const, trend: "better" as const, occurredAt: "2026-05-22T09:00:00.000Z" });
    entries.push({ note: "meh", kind: "daily_checkin" as const, trend: "same" as const, occurredAt: "2026-05-24T09:00:00.000Z" });
    entries.push({ note: "rough", kind: "daily_checkin" as const, trend: "harder" as const, occurredAt: "2026-05-25T09:00:00.000Z" });

    const out = composeBrief({ dog, concerns: [], goals: [], entries, windowDays: 30 });

    expect(out).toContain("16 entries in the last 30 days");
    expect(out).toContain("Check-ins: 2 better, 1 same, 1 harder.");
    const listed = out.split("\n").filter((line) => /^- \d{4}-\d{2}-\d{2}:/.test(line));
    expect(listed).toHaveLength(10);
  });

  it("labels all-time and omits the check-ins line when there are none", () => {
    const out = composeBrief({
      dog,
      concerns: [],
      goals: [],
      windowDays: null,
      entries: [{ note: "solo moment", kind: "moment", occurredAt: "2026-05-20T10:00:00.000Z" }],
    });
    expect(out).toContain("1 entry (all time)");
    expect(out).not.toContain("Check-ins:");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @turingcare/api test -- brief`
Expected: FAIL — type error / missing `windowDays`, and `"2 entries in the last 30 days"` / `"Check-ins:"` not found.

- [ ] **Step 3: Implement the composer changes**

In `apps/api/src/lib/brief.ts`:

(a) Replace the `BriefInput` type (lines 3-16) with:

```ts
type BriefInput = {
  dog: { name: string; breed?: string | null; size: string; sex: string };
  concerns: { concern: string; severity: string }[];
  goals: { goal: string }[];
  entries: {
    note: string;
    kind: "moment" | "daily_checkin";
    trend?: "better" | "same" | "harder" | null;
    behavior?: string | null;
    antecedent?: string | null;
    consequence?: string | null;
    intensity?: number | null;
    occurredAt: string;
  }[];
  windowDays: number | null;
  progress?: ProgressGoal[];
};
```

(b) Change the destructure line (currently `const { dog, concerns, goals, entries, progress = [] } = i;`) to:

```ts
  const { dog, concerns, goals, entries, progress = [], windowDays } = i;
```

(c) Replace the Journal-line block (current lines 71-73, the single `lines.push(\`Journal: ...\`)`) and add the check-ins line. Replace:

```ts
  lines.push(
    `Journal: ${entries.length} journal ${entries.length === 1 ? "entry" : "entries"}, ${avg}.`,
  );
```

with:

```ts
  const windowPhrase = windowDays === null ? "(all time)" : `in the last ${windowDays} days`;
  lines.push(
    `Journal: ${entries.length} ${entries.length === 1 ? "entry" : "entries"} ${windowPhrase}, ${avg}.`,
  );
  const checkins = entries.filter((entry) => entry.kind === "daily_checkin");
  if (checkins.length > 0) {
    const tally = { better: 0, same: 0, harder: 0 };
    for (const entry of checkins) {
      if (entry.trend) tally[entry.trend] += 1;
    }
    lines.push(`Check-ins: ${tally.better} better, ${tally.same} same, ${tally.harder} harder.`);
  }
```

(d) Change the entry-list cap from 5 to 10 — replace `for (const e of sorted.slice(0, 5)) {` with:

```ts
  for (const e of sorted.slice(0, 10)) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @turingcare/api test -- brief`
Expected: PASS (all `composeBrief` cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/brief.ts apps/api/src/lib/brief.test.ts
git commit -m "feat(api): windowed journal line, check-in trend tally, 10-entry cap in composeBrief"
```

---

## Task 3: API route — accept `window`, date-filter the query

**Files:**
- Modify: `apps/api/src/routes/dogs.ts`
- Test: `apps/api/src/routes/dogs.test.ts`

The new route test needs the test Postgres (see `apps/api` README / shared test-DB notes). If it fails on a unique-constraint/rate-limit error from shared-DB drift, recreate the DB from migrations and re-run.

- [ ] **Step 1: Update existing brief POSTs + add the new route test (write the failing tests)**

In `apps/api/src/routes/dogs.test.ts`:

(a) In `"generates, fetches, finalizes a brief"`, the two generate POSTs currently have no body. Add an empty JSON body to each so the new validator path is exercised with the default window. Change both occurrences of:

```ts
    const gen = await app.request(`/api/dogs/${dog.id}/brief`, {
      method: "POST",
      headers: u.authHeaders,
    });
```
and
```ts
    const gen2 = await app.request(`/api/dogs/${dog.id}/brief`, {
      method: "POST",
      headers: u.authHeaders,
    });
```
to include `body: JSON.stringify({})` (i.e. add the `body` line after `headers: u.authHeaders,`).

(b) In `"owner isolation: other user 404"`, the brief POST also needs a body so it reaches the ownership check. Change:

```ts
      (await app.request(`/api/dogs/${dog.id}/brief`, { method: "POST", headers: b.authHeaders }))
```
to:
```ts
      (await app.request(`/api/dogs/${dog.id}/brief`, { method: "POST", headers: b.authHeaders, body: JSON.stringify({}) }))
```

(c) Add a new test after the `"owner isolation: other user 404"` test, before the closing `});` of that `describe` block:

```ts
  it("scopes the brief to the selected window and tallies check-in trends", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const old = new Date(Date.now() - 100 * 86_400_000).toISOString();

    await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ kind: "moment", note: "recent walk", occurredAt: recent }),
    });
    await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ kind: "moment", note: "ancient incident", occurredAt: old }),
    });
    await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ kind: "daily_checkin", note: "good day", trend: "better", occurredAt: recent }),
    });

    const res = await app.request(`/api/dogs/${dog.id}/brief`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ window: "7d" }),
    });
    expect(res.status).toBe(201);
    const { brief } = (await res.json()) as { brief: { summary: string } };
    expect(brief.summary).toContain("2 entries in the last 7 days");
    expect(brief.summary).toContain("recent walk");
    expect(brief.summary).not.toContain("ancient incident");
    expect(brief.summary).toContain("Check-ins: 1 better, 0 same, 0 harder.");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @turingcare/api test -- dogs`
Expected: FAIL — the window is not applied yet (`"ancient incident"` still present; `"in the last 7 days"` / `"Check-ins:"` missing).

- [ ] **Step 3: Implement the route changes**

In `apps/api/src/routes/dogs.ts`:

(a) Add `gte` to the drizzle-orm import (currently `import { and, desc, eq, max } from "drizzle-orm";`):

```ts
import { and, desc, eq, gte, max } from "drizzle-orm";
```

(b) Add `briefGenerateSchema` to the `@turingcare/shared` import list (it currently imports `briefSendSchema` among others). Insert `briefGenerateSchema,` alphabetically before `briefSendSchema,`.

(c) Replace the whole `POST /:id/brief` handler (currently `.post("/:id/brief", async (c) => { ... })`, lines 396-430) with:

```ts
  .post("/:id/brief", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const parsed = briefGenerateSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "invalid_window" } as const, 400);
    const windowDays = parsed.data.window === "all" ? null : Number(parsed.data.window.replace("d", ""));
    const cutoff = windowDays === null ? null : new Date(Date.now() - windowDays * 86_400_000);
    const journalWhere = cutoff
      ? and(eq(journalEntries.dogId, dog.id), gte(journalEntries.occurredAt, cutoff))
      : eq(journalEntries.dogId, dog.id);
    const [concerns, goals, entries, progress, [last]] = await Promise.all([
      db.select().from(behaviorConcerns).where(eq(behaviorConcerns.dogId, dog.id)),
      db.select().from(trainingGoals).where(eq(trainingGoals.dogId, dog.id)),
      db.select().from(journalEntries).where(journalWhere),
      loadProgress(dog.id),
      db
        .select()
        .from(briefs)
        .where(eq(briefs.dogId, dog.id))
        .orderBy(desc(briefs.version))
        .limit(1),
    ]);
    const summary = composeBrief({
      dog: { name: dog.name, breed: dog.breed, size: dog.size, sex: dog.sex },
      concerns: concerns.map((x) => ({ concern: x.concern, severity: x.severity })),
      goals: goals.map((x) => ({ goal: x.goal })),
      entries: entries.map((e) => ({
        note: e.note,
        kind: e.kind,
        trend: e.trend,
        behavior: e.behavior,
        antecedent: e.antecedent,
        consequence: e.consequence,
        intensity: e.intensity,
        occurredAt: e.occurredAt.toISOString(),
      })),
      windowDays,
      progress: progress.goals,
    });
    const [brief] = await db
      .insert(briefs)
      .values({ dogId: dog.id, summary, version: (last?.version ?? 0) + 1, status: "draft" })
      .returning();
    return c.json({ brief }, 201);
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @turingcare/api test -- dogs`
Expected: PASS — including the new windowing test and the unchanged existing brief tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts
git commit -m "feat(api): date-filter brief journal query by requested window"
```

---

## Task 4: Web data layer — `useGenerateBrief(window)`

**Files:**
- Modify: `apps/web/src/lib/brief.ts`

- [ ] **Step 1: Update the hook to send the window**

In `apps/web/src/lib/brief.ts`:

(a) Add the type import at the top (after `import { api } from "./api";`):

```ts
import type { BriefWindow } from "@turingcare/shared";
```

(b) Replace the `useGenerateBrief` function (lines 17-30) with:

```ts
export function useGenerateBrief(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (window: BriefWindow) => {
      const res = await b.$post({ param: { id: dogId }, json: { window } });
      if (!res.ok) throw new Error("gen_failed");
      return (await res.json()).brief;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brief", dogId] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}
```

- [ ] **Step 2: Verify types (the RPC client now requires `json`)**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit`
Expected: a type error in `apps/web/src/routes/brief.tsx` at `gen.mutateAsync()` (now requires a `BriefWindow` argument). That error is fixed in Task 5. No error in `brief.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/brief.ts
git commit -m "feat(web): useGenerateBrief sends the chosen time window"
```

---

## Task 5: Web UI — segmented window control + i18n

**Files:**
- Modify: `apps/web/src/routes/brief.tsx`
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`
- Test: `apps/web/src/routes/brief.test.tsx`

NOTE: the component already references the global `window` (`window.location.origin`, `window.print()`). The new state MUST be named `windowChoice`, never `window`.

- [ ] **Step 1: Add i18n keys (en + es)**

In `apps/web/src/i18n/en.ts`, inside the `brief: { ... }` object, immediately after `genFailed: "Generation failed",` add:

```ts
    windowLabel: "Time window",
    window7d: "7 days",
    window30d: "30 days",
    window90d: "90 days",
    windowAll: "All time",
```

In `apps/web/src/i18n/es.ts`, inside its `brief: { ... }` object, immediately after `genFailed: "No se pudo generar",` add:

```ts
    windowLabel: "Periodo",
    window7d: "7 días",
    window30d: "30 días",
    window90d: "90 días",
    windowAll: "Todo el tiempo",
```

- [ ] **Step 2: Write the failing web test**

In `apps/web/src/routes/brief.test.tsx`:

(a) Add `fireEvent` to the Testing Library import (currently `import { render, screen, waitFor } from "@testing-library/react";`):

```ts
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
```

(b) Add `useGenerateBrief` to the `vi.mock("@/lib/brief", ...)` factory return (alongside the other `vi.fn(actual.*)` entries):

```ts
    useGenerateBrief: vi.fn(actual.useGenerateBrief),
```

(c) Add a restore line inside `beforeEach` (next to the other `mockImplementation` restores):

```ts
  vi.mocked(briefLib.useGenerateBrief).mockImplementation(realBrief.useGenerateBrief);
```

(d) Add this test inside `describe("Brief", ...)`, before its closing `});`:

```ts
  it("passes the selected time window to the generate mutation", async () => {
    stubFetch();
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(briefLib.useGenerateBrief).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof briefLib.useGenerateBrief>);
    renderBrief();
    fireEvent.click(await screen.findByRole("button", { name: /^7 days$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Regenerate|Generate Brief/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith("7d"));
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/web test -- brief`
Expected: FAIL — no `7 days` button rendered / `mutateAsync` not called with `"7d"`.

- [ ] **Step 4: Implement the selector in `brief.tsx`**

(a) Add the shared import near the top (after the existing `@/lib/*` imports):

```ts
import { type BriefWindow, briefWindows } from "@turingcare/shared";
```

(b) Add window state inside the component, right after `const dogId = routeId ?? picked ?? "";`:

```ts
  const [windowChoice, setWindowChoice] = useState<BriefWindow>("30d");
```

(c) Add a label map after `const shareUrl = ...;` (it must be inside the component so `t` is in scope):

```ts
  const windowLabels: Record<BriefWindow, string> = {
    "7d": t("brief.window7d"),
    "30d": t("brief.window30d"),
    "90d": t("brief.window90d"),
    all: t("brief.windowAll"),
  };
```

(d) Inside the `{dogId && ( <> ... )}` fragment, immediately after the opening `<>` and before `<div className="flex flex-wrap gap-2">`, insert the control:

```tsx
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("brief.windowLabel")}>
            <span className="text-sm font-medium text-slate">{t("brief.windowLabel")}</span>
            {briefWindows.map((w) => (
              <Button
                key={w}
                type="button"
                variant={windowChoice === w ? "default" : "outline"}
                onClick={() => setWindowChoice(w)}
              >
                {windowLabels[w]}
              </Button>
            ))}
          </div>
```

(e) Change the generate button's call from `await gen.mutateAsync();` to:

```tsx
                  await gen.mutateAsync(windowChoice);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/web test -- brief`
Expected: PASS — including the existing brief tests and the new selector test.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/brief.tsx apps/web/src/routes/brief.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): time-window selector on the brief page"
```

---

## Task 6: Full gates + push

**Files:** none (verification only)

- [ ] **Step 1: Type-check both apps**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit && pnpm --filter @turingcare/api exec tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 2: Run all unit/integration suites**

Run: `pnpm --filter @turingcare/shared test && pnpm --filter @turingcare/web test && pnpm --filter @turingcare/api test`
Expected: all green. (If the api suite hits shared-test-DB drift — e.g. rate_limit/unique errors unrelated to this change — recreate the test DB from migrations and re-run.)

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: exit 0. (Biome forbids non-null assertions; none introduced here.)

- [ ] **Step 4: Build the web app (catches prod-only type/bundle issues)**

Run: `pnpm --filter @turingcare/web build`
Expected: exit 0.

- [ ] **Step 5: Update the project log**

Append a dated entry to `docs/PROJECT-LOG.md` summarizing the windowed/trend-aware brief (window enum default 30, check-in tally, 10-entry cap, no migration, email-send unchanged) and listing the spec + this plan. Then:

```bash
git add docs/PROJECT-LOG.md
git commit -m "docs: log windowed trend-aware brief"
```

- [ ] **Step 6: Push the branch**

```bash
git push -u origin feature/brief-windowed-trend
```

Open a PR from `feature/brief-windowed-trend` into `main`.

---

## Self-Review (completed during planning)

- **Spec coverage:** window enum + default 30 (Tasks 1, 3, 5); SQL date filter (Task 3); windowed Journal line + check-ins tally + 10-cap (Task 2); web segmented control (Task 5); tests (Tasks 1-5); no migration / email-send unchanged (no task needed — confirmed untouched). All spec sections map to a task.
- **Placeholders:** none — every code step shows the exact code.
- **Type consistency:** `BriefWindow`/`briefWindows`/`briefGenerateSchema` defined in Task 1 are used verbatim in Tasks 3-5; `composeBrief` gains `windowDays: number | null` and per-entry `kind`/`trend` in Task 2 and is called with exactly those in Task 3; `useGenerateBrief(window)` signature (Task 4) matches `gen.mutateAsync(windowChoice)` (Task 5).
- **Known gotchas baked in:** body parsed *after* ownership check (preserves 404); state named `windowChoice` to avoid shadowing the global `window`.
