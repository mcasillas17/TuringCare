# Onboarding Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single welcome card on `/my` with a 5-item onboarding checklist (add dog → log 3 moments → set goal → finalize brief → share with a trainer) that nudges a new user through the core product loop, computed live from existing data, with a dismissible celebration banner on completion.

**Architecture:** A new `GET /api/onboarding` endpoint returns five derived booleans/counts + `mostRecentDogId`. A new `<OnboardingChecklist />` component renders the rows on `/my` overview; localStorage holds the per-device "celebration banner dismissed" bit. No DB migration. No change to any existing route or mutation.

**Tech Stack:** Hono + Drizzle (apps/api), Vite/React 19 + TanStack Query + hono RPC client + react-router-dom (apps/web), shared Zod is unaffected, Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-05-27-onboarding-checklist-design.md`

---

## File Structure

- `apps/api/src/routes/onboarding.ts` — **Create**: single `GET /` returning the status object.
- `apps/api/src/routes/onboarding.test.ts` — **Create**: route tests (fresh user, dog-only, moments counting, all flips, owner isolation, 401).
- `apps/api/src/app.ts` — **Modify**: import `onboardingApp` and mount with `.route("/api/onboarding", onboardingApp)`.
- `apps/web/src/lib/onboarding.ts` — **Create**: `useOnboardingStatus()` hook + `OnboardingStatus` type.
- `apps/web/src/components/onboarding/checklist.tsx` — **Create**: `<OnboardingChecklist />` (handles all three UX states + localStorage dismissal).
- `apps/web/src/components/onboarding/checklist.test.tsx` — **Create**: component tests.
- `apps/web/src/routes/overview.tsx` — **Modify**: render `<OnboardingChecklist />` at the top; remove the standalone "new user" welcome card.
- `apps/web/src/i18n/en.ts` + `apps/web/src/i18n/es.ts` — **Modify**: add `onboarding: { ... }` section.

---

## Task 1: API route — `GET /api/onboarding`

**Files:**
- Create: `apps/api/src/routes/onboarding.ts`
- Create: `apps/api/src/routes/onboarding.test.ts`
- Modify: `apps/api/src/app.ts` (mount)

This task requires the test Postgres. If gates fail with shared-test-DB drift (rate_limit/unique-constraint errors unrelated to this change), recreate the local test DB from migrations and re-run.

- [ ] **Step 1: Write the failing tests** — create `apps/api/src/routes/onboarding.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { type TestUser, createTestUser } from "../test-helpers";

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

type OnboardingBody = {
  hasDog: boolean;
  momentsCount: number;
  hasGoal: boolean;
  hasFinalizedBrief: boolean;
  hasSentBrief: boolean;
  mostRecentDogId: string | null;
};

describe("onboarding: GET /api/onboarding", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  it("returns 401 without auth", async () => {
    const r = await app.request("/api/onboarding", {});
    expect(r.status).toBe(401);
  });

  it("returns all-false + null for a fresh user with no dogs", async () => {
    const u = await createTestUser();
    users.push(u);
    const r = await app.request("/api/onboarding", { headers: u.authHeaders });
    expect(r.status).toBe(200);
    const body = (await r.json()) as OnboardingBody;
    expect(body).toEqual({
      hasDog: false,
      momentsCount: 0,
      hasGoal: false,
      hasFinalizedBrief: false,
      hasSentBrief: false,
      mostRecentDogId: null,
    });
  });

  it("flips hasDog and returns mostRecentDogId once a dog exists", async () => {
    const u = await createTestUser();
    users.push(u);
    const created = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    const { dog } = (await created.json()) as { dog: { id: string } };
    const r = await app.request("/api/onboarding", { headers: u.authHeaders });
    const body = (await r.json()) as OnboardingBody;
    expect(body.hasDog).toBe(true);
    expect(body.mostRecentDogId).toBe(dog.id);
    expect(body.momentsCount).toBe(0);
    expect(body.hasGoal).toBe(false);
    expect(body.hasFinalizedBrief).toBe(false);
    expect(body.hasSentBrief).toBe(false);
  });

  it("counts only kind='moment' entries, ignoring daily_checkin", async () => {
    const u = await createTestUser();
    users.push(u);
    const created = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    const { dog } = (await created.json()) as { dog: { id: string } };
    for (let i = 0; i < 3; i++) {
      await app.request(`/api/dogs/${dog.id}/journal`, {
        method: "POST",
        headers: u.authHeaders,
        body: JSON.stringify({ kind: "moment", note: `m${i}` }),
      });
    }
    await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ kind: "daily_checkin", note: "good", trend: "better" }),
    });
    const r = await app.request("/api/onboarding", { headers: u.authHeaders });
    const body = (await r.json()) as OnboardingBody;
    expect(body.momentsCount).toBe(3);
  });

  it("flips hasGoal / hasFinalizedBrief / hasSentBrief as those actions happen", async () => {
    const u = await createTestUser();
    users.push(u);
    const created = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    const { dog } = (await created.json()) as { dog: { id: string } };

    await app.request(`/api/dogs/${dog.id}/goals`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ goal: "Calm greetings" }),
    });

    await app.request(`/api/dogs/${dog.id}/brief?window=all`, {
      method: "POST",
      headers: u.authHeaders,
    });
    await app.request(`/api/dogs/${dog.id}/brief`, {
      method: "PUT",
      headers: u.authHeaders,
    });

    await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ recipient: "trainer@example.com" }),
    });

    const r = await app.request("/api/onboarding", { headers: u.authHeaders });
    const body = (await r.json()) as OnboardingBody;
    expect(body.hasGoal).toBe(true);
    expect(body.hasFinalizedBrief).toBe(true);
    expect(body.hasSentBrief).toBe(true);
  });

  it("owner isolation: another user's data doesn't leak", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    await app.request("/api/dogs", {
      method: "POST",
      headers: a.authHeaders,
      body: JSON.stringify(validDog),
    });
    const r = await app.request("/api/onboarding", { headers: b.authHeaders });
    const body = (await r.json()) as OnboardingBody;
    expect(body.hasDog).toBe(false);
    expect(body.mostRecentDogId).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @turingcare/api test -- onboarding`
Expected: FAIL — route doesn't exist (every request 404 / connection refused on app, depending on Hono routing — at minimum the body comparisons fail).

- [ ] **Step 3: Create the route module** at `apps/api/src/routes/onboarding.ts`:

```ts
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { briefSends, briefs, dogs, journalEntries, trainingGoals } from "../db/schema";
import { type Vars, requireUser } from "../middleware/require-user";

export const onboardingApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const userId = c.get("userId");
    const owned = await db
      .select({ id: dogs.id })
      .from(dogs)
      .where(eq(dogs.ownerId, userId))
      .orderBy(desc(dogs.createdAt));
    const dogIds = owned.map((d) => d.id);
    const mostRecentDogId = owned[0]?.id ?? null;

    if (dogIds.length === 0) {
      return c.json({
        hasDog: false,
        momentsCount: 0,
        hasGoal: false,
        hasFinalizedBrief: false,
        hasSentBrief: false,
        mostRecentDogId: null,
      });
    }

    const [momentsResult, goalRow, briefRow, sendRow] = await Promise.all([
      db
        .select({ value: count() })
        .from(journalEntries)
        .where(
          and(inArray(journalEntries.dogId, dogIds), eq(journalEntries.kind, "moment")),
        ),
      db
        .select({ id: trainingGoals.id })
        .from(trainingGoals)
        .where(inArray(trainingGoals.dogId, dogIds))
        .limit(1),
      db
        .select({ id: briefs.id })
        .from(briefs)
        .where(and(inArray(briefs.dogId, dogIds), eq(briefs.status, "finalized")))
        .limit(1),
      db
        .select({ id: briefSends.id })
        .from(briefSends)
        .where(eq(briefSends.sentByUserId, userId))
        .limit(1),
    ]);

    const [firstMoment] = momentsResult;
    return c.json({
      hasDog: true,
      momentsCount: Number(firstMoment?.value ?? 0),
      hasGoal: goalRow.length > 0,
      hasFinalizedBrief: briefRow.length > 0,
      hasSentBrief: sendRow.length > 0,
      mostRecentDogId,
    });
  });
```

- [ ] **Step 4: Mount the route** in `apps/api/src/app.ts`:

(a) Add the import alongside the existing `routes/*` imports (alphabetical position — between `journalApp` and `overviewApp`):

```ts
import { onboardingApp } from "./routes/onboarding";
```

(b) Add the mount call. The current chain ends `…/api/journal … /api/share … /api/events … /api/overview …`. Insert the new mount between `/api/share` and the `/api/events` handler so onboarding sits next to its sibling endpoints:

Change this section:
```ts
  .route("/api/journal", journalApp)
  .route("/api/share", shareApp)
  .post("/api/events", zValidator("json", eventIngestSchema), async (c) => {
```

to:
```ts
  .route("/api/journal", journalApp)
  .route("/api/share", shareApp)
  .route("/api/onboarding", onboardingApp)
  .post("/api/events", zValidator("json", eventIngestSchema), async (c) => {
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @turingcare/api test -- onboarding`
Expected: PASS — all 6 tests green.

- [ ] **Step 6: Lint + tsc**

Run: `pnpm exec biome check apps/api/src/routes/onboarding.ts apps/api/src/routes/onboarding.test.ts apps/api/src/app.ts`
Expected: clean. (If biome flags import order in `app.ts`, accept its auto-fix; otherwise re-sort manually.)

Run: `pnpm --filter @turingcare/api exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/onboarding.ts apps/api/src/routes/onboarding.test.ts apps/api/src/app.ts
git commit -m "feat(api): GET /api/onboarding returns first-run progress booleans"
```

---

## Task 2: Web hook + types

**Files:**
- Create: `apps/web/src/lib/onboarding.ts`

Hooks in this codebase are thin wrappers around the typed RPC client. Behaviour is exercised by the component test in Task 3, so this task has no dedicated test.

- [ ] **Step 1: Create the hook file** at `apps/web/src/lib/onboarding.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

const o = api.api.onboarding;

export type OnboardingStatus = {
  hasDog: boolean;
  momentsCount: number;
  hasGoal: boolean;
  hasFinalizedBrief: boolean;
  hasSentBrief: boolean;
  mostRecentDogId: string | null;
};

export function useOnboardingStatus() {
  return useQuery({
    queryKey: ["onboarding"],
    staleTime: 10_000,
    queryFn: async (): Promise<OnboardingStatus> => {
      const res = await o.$get();
      if (!res.ok) throw new Error("load_failed");
      return await res.json();
    },
  });
}
```

- [ ] **Step 2: tsc**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit`
Expected: 0 errors. (If `api.api.onboarding` isn't resolved, the api side's Task 1 didn't ship — go back and confirm.)

- [ ] **Step 3: Lint**

Run: `pnpm exec biome check apps/web/src/lib/onboarding.ts`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/onboarding.ts
git commit -m "feat(web): useOnboardingStatus hook"
```

---

## Task 3: Checklist component + i18n + tests

**Files:**
- Create: `apps/web/src/components/onboarding/checklist.tsx`
- Create: `apps/web/src/components/onboarding/checklist.test.tsx`
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Add i18n keys (en + es)**

In `apps/web/src/i18n/en.ts`, immediately after the closing `},` of the `nav: { ... }` section (around line 19), add a new sibling section:

```ts
  onboarding: {
    title: "Get started",
    addDog: "Add your first dog",
    logMoments: "Log 3 moments",
    setGoal: "Set a training goal",
    finalizeBrief: "Finalize a brief",
    shareWithTrainer: "Share with a trainer",
    allSetUp: "You're all set up. 🎉",
    dismiss: "Dismiss",
  },
```

In `apps/web/src/i18n/es.ts`, in the same position (after `nav: { ... },`):

```ts
  onboarding: {
    title: "Comencemos",
    addDog: "Agrega a tu primer perro",
    logMoments: "Registra 3 momentos",
    setGoal: "Define un objetivo de entrenamiento",
    finalizeBrief: "Finaliza un resumen",
    shareWithTrainer: "Compártelo con un entrenador",
    allSetUp: "¡Todo listo! 🎉",
    dismiss: "Descartar",
  },
```

(Every Spanish value differs from English — the i18n no-untranslated test will pass.)

- [ ] **Step 2: Write the failing component test** — create `apps/web/src/components/onboarding/checklist.test.tsx`:

```tsx
import { LocaleProvider } from "@/i18n";
import * as onboardingLib from "@/lib/onboarding";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingChecklist } from "./checklist";

vi.mock("@/lib/onboarding", () => ({
  useOnboardingStatus: vi.fn(),
}));

const fresh = {
  hasDog: false,
  momentsCount: 0,
  hasGoal: false,
  hasFinalizedBrief: false,
  hasSentBrief: false,
  mostRecentDogId: null,
} satisfies onboardingLib.OnboardingStatus;

const complete = {
  hasDog: true,
  momentsCount: 7,
  hasGoal: true,
  hasFinalizedBrief: true,
  hasSentBrief: true,
  mostRecentDogId: "d1",
} satisfies onboardingLib.OnboardingStatus;

function setStatus(data: onboardingLib.OnboardingStatus | null) {
  vi.mocked(onboardingLib.useOnboardingStatus).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof onboardingLib.useOnboardingStatus>);
}

function renderChecklist() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter>
          <OnboardingChecklist />
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("OnboardingChecklist", () => {
  it("renders five rows with open circles when nothing is done", () => {
    setStatus(fresh);
    renderChecklist();
    expect(screen.getByText(/Add your first dog/i)).toBeInTheDocument();
    expect(screen.getByText(/Log 3 moments/i)).toBeInTheDocument();
    expect(screen.getByText(/Set a training goal/i)).toBeInTheDocument();
    expect(screen.getByText(/Finalize a brief/i)).toBeInTheDocument();
    expect(screen.getByText(/Share with a trainer/i)).toBeInTheDocument();
    // No celebration banner in this state.
    expect(screen.queryByText(/all set up/i)).not.toBeInTheDocument();
  });

  it("link for 'Log 3 moments' points to the most-recent dog's journal", () => {
    setStatus({ ...fresh, hasDog: true, mostRecentDogId: "d-abc" });
    renderChecklist();
    const link = screen.getByRole("link", { name: /Log 3 moments/i });
    expect(link).toHaveAttribute("href", "/my/journal?dogId=d-abc");
  });

  it("when all five complete and not dismissed, renders the celebration banner only", () => {
    setStatus(complete);
    renderChecklist();
    expect(screen.getByText(/all set up/i)).toBeInTheDocument();
    expect(screen.queryByText(/Log 3 moments/i)).not.toBeInTheDocument();
  });

  it("Dismiss button writes the localStorage flag and hides the banner", () => {
    setStatus(complete);
    renderChecklist();
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
    expect(window.localStorage.getItem("turingcare.onboarding.celebrationDismissed")).toBe("true");
    expect(screen.queryByText(/all set up/i)).not.toBeInTheDocument();
  });

  it("when complete + flag pre-set, renders nothing", () => {
    window.localStorage.setItem("turingcare.onboarding.celebrationDismissed", "true");
    setStatus(complete);
    const { container } = renderChecklist();
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing while the status is loading", () => {
    setStatus(null);
    const { container } = renderChecklist();
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/web test -- checklist`
Expected: FAIL — component file doesn't exist.

- [ ] **Step 4: Create the component** at `apps/web/src/components/onboarding/checklist.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { type OnboardingStatus, useOnboardingStatus } from "@/lib/onboarding";
import { useState } from "react";
import { Link } from "react-router-dom";

const DISMISSED_KEY = "turingcare.onboarding.celebrationDismissed";

type ItemKey = "addDog" | "logMoments" | "setGoal" | "finalizeBrief" | "shareWithTrainer";

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "true");
  } catch {
    // Storage may be unavailable (private mode); silently no-op.
  }
}

function buildItems(status: OnboardingStatus): { key: ItemKey; done: boolean; href: string }[] {
  const dogId = status.mostRecentDogId;
  return [
    { key: "addDog", done: status.hasDog, href: "/my/dogs/new" },
    {
      key: "logMoments",
      done: status.momentsCount >= 3,
      href: dogId ? `/my/journal?dogId=${dogId}` : "/my/journal",
    },
    {
      key: "setGoal",
      done: status.hasGoal,
      href: dogId ? `/my/dogs/${dogId}` : "/my/dogs/new",
    },
    {
      key: "finalizeBrief",
      done: status.hasFinalizedBrief,
      href: dogId ? `/my/dogs/${dogId}/brief` : "/my/brief",
    },
    { key: "shareWithTrainer", done: status.hasSentBrief, href: "/trainers" },
  ];
}

export function OnboardingChecklist() {
  const { t } = useI18n();
  const { data: status } = useOnboardingStatus();
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);

  if (!status) return null;

  const items = buildItems(status);
  const allDone = items.every((item) => item.done);

  if (allDone && dismissed) return null;

  if (allDone) {
    return (
      <section className="flex items-center justify-between rounded border border-silver bg-white p-4">
        <p className="text-slate">✓ {t("onboarding.allSetUp")}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            writeDismissed();
            setDismissed(true);
          }}
        >
          {t("onboarding.dismiss")}
        </Button>
      </section>
    );
  }

  const labels: Record<ItemKey, string> = {
    addDog: t("onboarding.addDog"),
    logMoments: t("onboarding.logMoments"),
    setGoal: t("onboarding.setGoal"),
    finalizeBrief: t("onboarding.finalizeBrief"),
    shareWithTrainer: t("onboarding.shareWithTrainer"),
  };

  return (
    <section className="space-y-3 rounded border border-silver bg-white p-4">
      <h2 className="font-semibold text-slate">{t("onboarding.title")}</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              to={item.href}
              className={`flex items-center gap-2 hover:underline ${
                item.done ? "text-slate-soft" : "text-slate"
              }`}
            >
              <span aria-hidden="true" className="w-4 text-center">
                {item.done ? "✓" : "○"}
              </span>
              <span>{labels[item.key]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/web test -- checklist`
Expected: PASS — all 6 tests green.

- [ ] **Step 6: i18n parity test**

Run: `pnpm --filter @turingcare/web test -- i18n`
Expected: PASS — no untranslated-key warnings for `onboarding.*`.

- [ ] **Step 7: Lint + tsc**

Run: `pnpm exec biome check apps/web/src/components/onboarding/checklist.tsx apps/web/src/components/onboarding/checklist.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts`
Expected: clean.

Run: `pnpm --filter @turingcare/web exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/onboarding/checklist.tsx apps/web/src/components/onboarding/checklist.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): OnboardingChecklist component + i18n"
```

---

## Task 4: Overview integration

**Files:**
- Modify: `apps/web/src/routes/overview.tsx`

The current overview has an early-return that renders a "Welcome to TuringCare" card for users with zero dogs (`stage === "new"`). We replace that early-return with the `<OnboardingChecklist />` and continue to render the dashboard below for non-new users. The remaining first-run nudge blocks (`stage === "noBrief"`, `stage === "noEntries"`) stay as-is — they overlap with the checklist content but their CTAs differ slightly and removing them is out of scope.

- [ ] **Step 1: Modify `apps/web/src/routes/overview.tsx`**

(a) Add the import (with the other `@/components/...` imports — there's currently none from that path, so place it after the `@/i18n` import):

```ts
import { OnboardingChecklist } from "@/components/onboarding/checklist";
```

(b) Replace the `stage === "new"` early-return (currently lines 29-41):

```tsx
  if (stage === "new") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <section className="space-y-4 rounded border border-silver bg-white p-6 text-center">
          <h1 className="text-2xl font-bold text-slate">{t("overview.welcomeTitle")}</h1>
          <p className="text-slate-soft">{t("overview.welcomeBody")}</p>
          <Link to="/my/dogs/new" className="inline-block rounded bg-slate px-4 py-2 text-cream">
            {t("overview.startHereCta")}
          </Link>
        </section>
      </div>
    );
  }
```

with:

```tsx
  if (stage === "new") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <OnboardingChecklist />
      </div>
    );
  }
```

(c) In the non-new return, render the checklist at the top of the dashboard. The current return starts:

```tsx
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate">{t("overview.greeting")} 👋</h1>
```

Change it to:

```tsx
  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-2xl">
        <OnboardingChecklist />
      </div>
      <h1 className="text-2xl font-bold text-slate">{t("overview.greeting")} 👋</h1>
```

- [ ] **Step 2: Run all web tests**

Run: `pnpm --filter @turingcare/web test`
Expected: all tests pass — the existing overview tests (if any) still pass; the new checklist test still passes.

- [ ] **Step 3: tsc + biome**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit`
Expected: 0 errors.

Run: `pnpm exec biome check apps/web/src/routes/overview.tsx`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/overview.tsx
git commit -m "feat(web): render OnboardingChecklist on /my overview"
```

---

## Task 5: Full gates + PROJECT-LOG + push

**Files:** none for code; modify `docs/PROJECT-LOG.md`.

- [ ] **Step 1: Type-check both apps**

Run: `pnpm --filter @turingcare/web exec tsc --noEmit && pnpm --filter @turingcare/api exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: All test suites**

Run: `pnpm --filter @turingcare/shared test && pnpm --filter @turingcare/web test && pnpm --filter @turingcare/api test`
Expected: all green. (If api gates fail with shared-test-DB drift unrelated to onboarding, recreate the test DB and re-run.)

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: exit 0.

- [ ] **Step 4: Web build**

Run: `pnpm --filter @turingcare/web build`
Expected: exit 0.

- [ ] **Step 5: PROJECT-LOG entry**

Append a dated section to `docs/PROJECT-LOG.md` describing the onboarding checklist (5 items live-computed; new `GET /api/onboarding`; localStorage celebration dismissal; no migration) and listing the spec + this plan. Then:

```bash
git add docs/PROJECT-LOG.md
git commit -m "docs: log onboarding checklist"
```

- [ ] **Step 6: Push the branch**

```bash
git push -u origin feature/onboarding-checklist
```

Then open a PR from `feature/onboarding-checklist` into `main` (the URL is in the push output).

---

## Self-Review (run during planning)

- **Spec coverage:** every spec section maps to a task — items table → Task 1 (predicates) + Task 3 (rows); per-user scope → Task 1 (owner-scoped queries); UX states → Task 3 (component branches); localStorage dismissal → Task 3; new endpoint → Task 1; web hook → Task 2; component placement → Task 4; tests → Task 1 (API), Task 3 (component); no-migration / no-other-change → no task needed (verified by the lack of schema/route changes elsewhere).
- **Placeholders:** none — every code step shows the exact code.
- **Type consistency:** `OnboardingStatus` defined in Task 2 is consumed verbatim by Task 3's component and tests; the API response shape in Task 1 matches it field-for-field (hasDog, momentsCount, hasGoal, hasFinalizedBrief, hasSentBrief, mostRecentDogId).
- **Gotchas baked in:** `count()` result coerced to `Number` defensively (postgres `bigint` mapping varies); localStorage `try/catch` for private-mode safety; component returns `null` while loading so the empty render is graceful.
