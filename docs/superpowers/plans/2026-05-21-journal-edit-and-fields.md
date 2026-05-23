# Journal: Edit + 4 missing capture fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Add a PUT endpoint + the four nullable `journal_entries` columns (`durationSeconds`, `recoverySeconds`, `peoplePresent`, `ownerResponse`) to the API and surface them in the UI behind an inline expand + edit-in-place card.

**Architecture:** Schema-down extension (shared zod → API POST/PUT → hono client RPC → web hook + component → page wire-up). Per-entry `<EntryCard>` owns `collapsed/expanded/editing` state internally. No DB migration (columns exist), no new deps, no infra changes.

**Tech Stack:** Zod, Hono, Drizzle, React 19, react-hook-form + `@hookform/resolvers/zod`, TanStack Query, Tailwind v4, vitest, sonner toasts.

**Spec:** `docs/superpowers/specs/2026-05-21-journal-edit-and-fields-design.md`

**Conventions:** Worktree `.claude/worktrees/journal-edit-and-fields`, branch `worktree-journal-edit-and-fields`, off `origin/main`. Ships as ONE PR. gpg-unsigned commits ending:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
Web cmds need env: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web <cmd>` from the worktree (`.env` is gitignored — never commit). API cmds: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api <cmd>`. `pnpm lint` from worktree root. **Pre-commit branch assertion:** `git branch --show-current` must equal `worktree-journal-edit-and-fields` before every commit; if not, STOP and report to the controller.

---

## File Structure

```
packages/shared/src/journal.ts                              MODIFY  +4 fields on schema
packages/shared/src/journal.test.ts                         MODIFY  +4 test cases
apps/api/src/routes/dogs.ts                                 MODIFY  POST extension + new PUT
apps/api/src/routes/dogs.test.ts                            MODIFY  +5 test cases
apps/web/src/i18n/en.ts                                     MODIFY  +11 journal keys
apps/web/src/i18n/es.ts                                     MODIFY  +11 journal keys
apps/web/src/lib/journal.ts                                 MODIFY  +useUpdateEntry hook
apps/web/src/components/journal/entry-card.tsx              CREATE  per-entry card (3 modes)
apps/web/src/components/journal/entry-card.test.tsx         CREATE  3 component tests
apps/web/src/routes/journal.tsx                             MODIFY  list uses EntryCard + 4 new create-form fields
docs/PROJECT-LOG.md                                         MODIFY  shipped entry
```

---

## Task 1: Shared schema — add 4 nullable optional fields

**Files:**
- Modify: `packages/shared/src/journal.ts`
- Modify: `packages/shared/src/journal.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these to `packages/shared/src/journal.test.ts` (inside the existing `describe("journalEntrySchema", ...)` block, before its closing `});`):

```ts
  it("accepts the four optional capture fields", () => {
    expect(
      journalEntrySchema.safeParse({
        ...base,
        durationSeconds: 12,
        recoverySeconds: 30,
        peoplePresent: "Owner + walker",
        ownerResponse: "Asked for sit",
      }).success,
    ).toBe(true);
  });
  it("treats the four capture fields as fully optional", () => {
    expect(
      journalEntrySchema.safeParse({ ...base, durationSeconds: null, recoverySeconds: null })
        .success,
    ).toBe(true);
    expect(
      journalEntrySchema.safeParse({ ...base, peoplePresent: null, ownerResponse: null }).success,
    ).toBe(true);
  });
  it("rejects negative durationSeconds / recoverySeconds", () => {
    expect(journalEntrySchema.safeParse({ ...base, durationSeconds: -5 }).success).toBe(false);
    expect(journalEntrySchema.safeParse({ ...base, recoverySeconds: -1 }).success).toBe(false);
  });
  it("rejects non-string peoplePresent / ownerResponse", () => {
    expect(journalEntrySchema.safeParse({ ...base, peoplePresent: 123 }).success).toBe(false);
    expect(journalEntrySchema.safeParse({ ...base, ownerResponse: 7 }).success).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/shared test
```
Expected: the first new case FAILS (current schema rejects unknown keys via strict? Actually zod's default `.object()` strips extras silently, so this test passes by accident — but the negative-number test FAILS because there's no nonnegative constraint). To make TDD honest, the implementation must add the four fields explicitly so the first test asserts coverage.

If the first test passes-by-coincidence, that's fine — proceed to Step 3 anyway; the negative-number and non-string tests are the discriminating ones.

- [ ] **Step 3: Implement the schema extension**

Replace the contents of `packages/shared/src/journal.ts`:

```ts
import { z } from "zod";

export const journalEntrySchema = z.object({
  occurredAt: z.string().min(1, "Date is required"),
  antecedent: z.string().min(1, "Antecedent is required"),
  behavior: z.string().min(1, "Behavior is required"),
  consequence: z.string().min(1, "Consequence is required"),
  intensity: z.number().int().min(1).max(5),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  durationSeconds: z.number().int().nonnegative().nullable().optional(),
  recoverySeconds: z.number().int().nonnegative().nullable().optional(),
  peoplePresent: z.string().nullable().optional(),
  ownerResponse: z.string().nullable().optional(),
});
export type JournalEntryInput = z.infer<typeof journalEntrySchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @turingcare/shared test
```
Expected: all journal-schema tests PASS (existing 5 + 4 new = 9).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: worktree-journal-edit-and-fields
git add packages/shared/src/journal.ts packages/shared/src/journal.test.ts
git -c commit.gpgsign=false commit -m "feat(shared): extend journalEntrySchema with durationSeconds/recoverySeconds/peoplePresent/ownerResponse" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: API — POST extension to write the 4 new fields

**Files:**
- Modify: `apps/api/src/routes/dogs.ts` (POST `/:id/journal` handler at lines 114–132)
- Modify: `apps/api/src/routes/dogs.test.ts` (extend the `describe("dogs: journal", ...)` block)

- [ ] **Step 1: Write the failing test**

Append this `it(…)` inside the existing `describe("dogs: journal", …)` block in `apps/api/src/routes/dogs.test.ts`, after the existing "owner isolation" test, before the closing `});`:

```ts
  it("POST persists the four optional capture fields", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const r = await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        ...entry,
        durationSeconds: 12,
        recoverySeconds: 45,
        peoplePresent: "Owner + walker",
        ownerResponse: "Asked for sit",
      }),
    });
    expect(r.status).toBe(201);
    const list = await app.request(`/api/dogs/${dog.id}/journal`, { headers: u.authHeaders });
    const { entries } = (await list.json()) as {
      entries: {
        durationSeconds: number | null;
        recoverySeconds: number | null;
        peoplePresent: string | null;
        ownerResponse: string | null;
      }[];
    };
    expect(entries[0].durationSeconds).toBe(12);
    expect(entries[0].recoverySeconds).toBe(45);
    expect(entries[0].peoplePresent).toBe("Owner + walker");
    expect(entries[0].ownerResponse).toBe("Asked for sit");
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api test -- --reporter=verbose dogs.test
```
Expected: the new test FAILS because the POST handler doesn't write the four new columns (they default to NULL in DB → assertion fails on `.toBe(12)`).

- [ ] **Step 3: Extend the POST handler**

In `apps/api/src/routes/dogs.ts`, replace the existing POST `/:id/journal` handler block (currently at lines 114–132) with:

```ts
  .post("/:id/journal", zValidator("json", journalEntrySchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const b = c.req.valid("json");
    const [entry] = await db
      .insert(journalEntries)
      .values({
        dogId: dog.id,
        occurredAt: new Date(b.occurredAt),
        antecedent: b.antecedent,
        behavior: b.behavior,
        consequence: b.consequence,
        intensity: b.intensity,
        location: b.location ?? null,
        notes: b.notes ?? null,
        durationSeconds: b.durationSeconds ?? null,
        recoverySeconds: b.recoverySeconds ?? null,
        peoplePresent: b.peoplePresent ?? null,
        ownerResponse: b.ownerResponse ?? null,
      })
      .returning();
    return c.json({ entry }, 201);
  })
```

(Everything except the four new lines is byte-identical to the existing handler.)

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @turingcare/api test -- --reporter=verbose dogs.test
```
Expected: the new "POST persists…" test PASSES; all pre-existing dogs.test cases still PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts
git -c commit.gpgsign=false commit -m "feat(api): journal POST writes the four new capture columns" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: API — new PUT `/:id/journal/:entryId` handler

**Files:**
- Modify: `apps/api/src/routes/dogs.ts` (insert new `.put(…)` between the existing POST and DELETE journal handlers)
- Modify: `apps/api/src/routes/dogs.test.ts` (add a new `describe("dogs: journal PUT", …)` block at the end of file, before the final closing brace if any — actually it's at file level so just append)

- [ ] **Step 1: Write the failing tests**

Append a new `describe(…)` block to `apps/api/src/routes/dogs.test.ts` (at the bottom of the file):

```ts
describe("dogs: journal PUT", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });
  async function makeDog(u: TestUser, body = validDog) {
    const r = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(body),
    });
    return ((await r.json()) as { dog: { id: string } }).dog;
  }
  async function makeEntry(u: TestUser, dogId: string) {
    const r = await app.request(`/api/dogs/${dogId}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        occurredAt: "2026-05-19T10:00",
        antecedent: "Doorbell",
        behavior: "Barked 8s",
        consequence: "Scatter fed",
        intensity: 3,
      }),
    });
    return ((await r.json()) as { entry: { id: string } }).entry;
  }

  it("PUT updates an existing entry incl. the four new fields", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const e = await makeEntry(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/journal/${e.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({
        occurredAt: "2026-05-19T10:00",
        antecedent: "Doorbell",
        behavior: "Barked, recovered fast",
        consequence: "Scatter fed",
        intensity: 2,
        durationSeconds: 8,
        recoverySeconds: 20,
        peoplePresent: "Just owner",
        ownerResponse: "Stayed calm",
      }),
    });
    expect(r.status).toBe(200);
    const { entry: updated } = (await r.json()) as {
      entry: {
        behavior: string;
        intensity: number;
        durationSeconds: number | null;
        peoplePresent: string | null;
        ownerResponse: string | null;
      };
    };
    expect(updated.behavior).toBe("Barked, recovered fast");
    expect(updated.intensity).toBe(2);
    expect(updated.durationSeconds).toBe(8);
    expect(updated.peoplePresent).toBe("Just owner");
    expect(updated.ownerResponse).toBe("Stayed calm");
  });

  it("PUT 400 on invalid intensity", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const e = await makeEntry(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/journal/${e.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({
        occurredAt: "2026-05-19T10:00",
        antecedent: "Doorbell",
        behavior: "x",
        consequence: "y",
        intensity: 9,
      }),
    });
    expect(r.status).toBe(400);
  });

  it("PUT owner-isolation: other user → 404", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    const e = await makeEntry(a, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/journal/${e.id}`, {
      method: "PUT",
      headers: b.authHeaders,
      body: JSON.stringify({
        occurredAt: "2026-05-19T10:00",
        antecedent: "Doorbell",
        behavior: "x",
        consequence: "y",
        intensity: 3,
      }),
    });
    expect(r.status).toBe(404);
  });

  it("PUT cross-dog: entryId from a different dog of same user → 404", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog1 = await makeDog(u);
    const dog2 = await makeDog(u, { ...validDog, name: "Pancake" });
    const e1 = await makeEntry(u, dog1.id);
    const r = await app.request(`/api/dogs/${dog2.id}/journal/${e1.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({
        occurredAt: "2026-05-19T10:00",
        antecedent: "Doorbell",
        behavior: "x",
        consequence: "y",
        intensity: 3,
      }),
    });
    expect(r.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @turingcare/api test -- --reporter=verbose dogs.test
```
Expected: the four new "PUT …" cases FAIL (PUT route doesn't exist yet → Hono returns 404 for happy-path → assertion `200` fails; etc.). The 400-invalid-intensity test may accidentally pass because the missing route also returns 404 (not 400) — that one is OK to leave failing for now; impl will fix.

- [ ] **Step 3: Implement the PUT handler**

In `apps/api/src/routes/dogs.ts`, **insert** this `.put(…)` block between the existing `.post("/:id/journal", …)` (which ends with `return c.json({ entry }, 201); })`) and `.delete("/:id/journal/:entryId", …)`:

```ts
  .put(
    "/:id/journal/:entryId",
    zValidator("json", journalEntrySchema),
    async (c) => {
      const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
      if (!dog) return c.json({ error: "not_found" } as const, 404);
      const b = c.req.valid("json");
      const [entry] = await db
        .update(journalEntries)
        .set({
          occurredAt: new Date(b.occurredAt),
          antecedent: b.antecedent,
          behavior: b.behavior,
          consequence: b.consequence,
          intensity: b.intensity,
          location: b.location ?? null,
          notes: b.notes ?? null,
          durationSeconds: b.durationSeconds ?? null,
          recoverySeconds: b.recoverySeconds ?? null,
          peoplePresent: b.peoplePresent ?? null,
          ownerResponse: b.ownerResponse ?? null,
        })
        .where(
          and(
            eq(journalEntries.id, c.req.param("entryId")),
            eq(journalEntries.dogId, dog.id),
          ),
        )
        .returning();
      if (!entry) return c.json({ error: "not_found" } as const, 404);
      return c.json({ entry });
    },
  )
```

The `if (!entry)` branch covers the cross-dog case (where `findOwnedDog` succeeds but the entry isn't owned by that dog) — the `.returning()` array is empty when no rows match the `where`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @turingcare/api test -- --reporter=verbose dogs.test
```
Expected: all four new "PUT …" tests PASS; all pre-existing dogs.test cases still PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts
git -c commit.gpgsign=false commit -m "feat(api): PUT /api/dogs/:id/journal/:entryId (owner + dog double-scoped)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: i18n — 11 new journal keys (en + es)

**Files:**
- Modify: `apps/web/src/i18n/en.ts` (extend the `journal:` section)
- Modify: `apps/web/src/i18n/es.ts` (extend with parity)

- [ ] **Step 1: Extend en.ts**

In `apps/web/src/i18n/en.ts`, replace the entire `journal:` section (currently lines 209–228) with:

```ts
  journal: {
    title: "Behavior Journal",
    pickDog: "Choose a dog",
    noDogs: "Add a dog first to start journaling.",
    empty: "No entries yet.",
    add: "Add entry",
    occurredAt: "When",
    antecedent: "Antecedent",
    behavior: "Behavior",
    consequence: "Consequence",
    intensity: "Intensity (1–5)",
    location: "Location",
    notes: "Notes",
    duration: "Duration (seconds)",
    recovery: "Recovery (seconds)",
    peoplePresent: "People present",
    ownerResponse: "Your response",
    optional: "optional",
    save: "Save entry",
    saving: "Saving…",
    update: "Save changes",
    cancel: "Cancel",
    edit: "Edit",
    expand: "Expand entry",
    collapse: "Collapse entry",
    remove: "Remove",
    loadError: "Couldn't load the journal.",
    saved: "Entry saved",
    savedEdit: "Entry updated",
    saveFailed: "Save failed",
  },
```

- [ ] **Step 2: Extend es.ts with parity**

In `apps/web/src/i18n/es.ts`, replace the entire `journal:` section (currently lines 211–230) with:

```ts
  journal: {
    title: "Diario de conducta",
    pickDog: "Elige un perro",
    noDogs: "Agrega un perro primero para empezar el diario.",
    empty: "Aún no hay entradas.",
    add: "Agregar entrada",
    occurredAt: "Cuándo",
    antecedent: "Antecedente",
    behavior: "Conducta",
    consequence: "Consecuencia",
    intensity: "Intensidad (1–5)",
    location: "Lugar",
    notes: "Notas",
    duration: "Duración (segundos)",
    recovery: "Recuperación (segundos)",
    peoplePresent: "Personas presentes",
    ownerResponse: "Tu respuesta",
    optional: "opcional",
    save: "Guardar entrada",
    saving: "Guardando…",
    update: "Guardar cambios",
    cancel: "Cancelar",
    edit: "Editar",
    expand: "Expandir entrada",
    collapse: "Contraer entrada",
    remove: "Quitar",
    loadError: "No se pudo cargar el diario.",
    saved: "Entrada guardada",
    savedEdit: "Entrada actualizada",
    saveFailed: "No se pudo guardar",
  },
```

- [ ] **Step 3: Run the i18n parity gate**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm --filter @turingcare/web test -- i18n
```
Expected: tsc 0 errors (the `es satisfies Messages` compile-time check enforces structural parity); the i18n runtime test (no-untranslated etc.) PASSES.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git -c commit.gpgsign=false commit -m "i18n: +11 journal keys for edit + 4 new capture fields (en+es)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Web hook — `useUpdateEntry`

**Files:**
- Modify: `apps/web/src/lib/journal.ts`

- [ ] **Step 1: Add the hook**

Append this function to `apps/web/src/lib/journal.ts` (after the existing `useDeleteEntry`):

```ts
export function useUpdateEntry(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { entryId: string; body: JournalEntryInput }) => {
      const res = await j[":entryId"].$put({
        param: { id: dogId, entryId: args.entryId },
        json: args.body,
      });
      if (!res.ok) throw new Error("update_failed");
      return (await res.json()).entry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal", dogId] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}
```

No new imports needed — `useMutation`, `useQueryClient`, `JournalEntryInput`, and `j` are all already imported at the top of the file.

- [ ] **Step 2: Verify it typechecks**

```bash
pnpm --filter @turingcare/web exec tsc --noEmit
```
Expected: 0 errors. The hono client `j[":entryId"].$put` shape is inferred from the new PUT handler shipped in Task 3.

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add apps/web/src/lib/journal.ts
git -c commit.gpgsign=false commit -m "feat(web): useUpdateEntry hook (PUT /api/dogs/:id/journal/:entryId)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Web — `<EntryCard>` component (collapsed / expanded / editing modes)

**Files:**
- Create: `apps/web/src/components/journal/entry-card.tsx`
- Create: `apps/web/src/components/journal/entry-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/journal/entry-card.test.tsx`:

```tsx
import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryCard } from "./entry-card";

const baseEntry = {
  id: "e1",
  occurredAt: "2026-05-19T10:00:00.000Z",
  antecedent: "Doorbell rang",
  behavior: "Lunged at door",
  consequence: "Treat redirect",
  intensity: 4,
  location: "Front door",
  notes: null,
  durationSeconds: 12,
  recoverySeconds: 45,
  peoplePresent: "Owner + walker",
  ownerResponse: "Asked for sit",
};

afterEach(() => vi.unstubAllGlobals());

function setup(entry = baseEntry) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <ul>
          <EntryCard entry={entry} dogId="d1" />
        </ul>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("EntryCard", () => {
  it("renders collapsed by default; clicking row expands and reveals all four new fields", async () => {
    setup();
    // Collapsed shows behavior line; does NOT show the new fields' labels.
    expect(screen.getByText(/Lunged at door/)).toBeInTheDocument();
    expect(screen.queryByText(/Duration \(seconds\)/)).not.toBeInTheDocument();

    // Click row to expand.
    fireEvent.click(screen.getByRole("button", { name: /Expand entry/i }));

    // Expanded shows all four new field labels + their values.
    expect(await screen.findByText(/Duration \(seconds\)/)).toBeInTheDocument();
    expect(screen.getByText(/Recovery \(seconds\)/)).toBeInTheDocument();
    expect(screen.getByText(/People present/)).toBeInTheDocument();
    expect(screen.getByText(/Your response/)).toBeInTheDocument();
    expect(screen.getByText(/Owner \+ walker/)).toBeInTheDocument();
    expect(screen.getByText(/Asked for sit/)).toBeInTheDocument();
  });

  it("clicking Edit enters editing mode with the form pre-populated", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Expand entry/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^✎ Edit$|^Edit$/i }));

    // Antecedent field pre-populated with the entry's value.
    const ant = (await screen.findByDisplayValue("Doorbell rang")) as HTMLInputElement;
    expect(ant).toBeInTheDocument();
    expect(screen.getByDisplayValue("Lunged at door")).toBeInTheDocument();
    // Numeric pre-population for the new fields.
    expect(screen.getByDisplayValue("12")).toBeInTheDocument();
    expect(screen.getByDisplayValue("45")).toBeInTheDocument();
    // Save Changes + Cancel buttons present.
    expect(screen.getByRole("button", { name: /Save changes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeInTheDocument();
  });

  it("save flow PUTs and returns to expanded with the new value", async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method, body: init?.body as string });
        if (init?.method === "PUT") {
          const updated = { ...baseEntry, behavior: "Recovered fast" };
          return new Response(JSON.stringify({ entry: updated }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Expand entry/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^✎ Edit$|^Edit$/i }));

    const behaviorInput = (await screen.findByDisplayValue(
      "Lunged at door",
    )) as HTMLInputElement;
    fireEvent.change(behaviorInput, { target: { value: "Recovered fast" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "PUT" && c.url.includes("/journal/e1"))).toBe(true),
    );
    // After save the card returns to expanded read-only with the new value rendered.
    await waitFor(() => expect(screen.getByText(/Recovered fast/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Save changes/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web test -- entry-card
```
Expected: ALL three tests FAIL (module `./entry-card` doesn't exist).

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/journal/entry-card.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDeleteEntry, useUpdateEntry } from "@/lib/journal";
import { zodResolver } from "@hookform/resolvers/zod";
import { type JournalEntryInput, journalEntrySchema } from "@turingcare/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type Entry = {
  id: string;
  occurredAt: string;
  antecedent: string;
  behavior: string;
  consequence: string;
  intensity: number;
  location: string | null;
  notes: string | null;
  durationSeconds: number | null;
  recoverySeconds: number | null;
  peoplePresent: string | null;
  ownerResponse: string | null;
};

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";
const fmt = (v: string | number | null) => (v == null || v === "" ? "—" : String(v));

export function EntryCard({ entry, dogId }: { entry: Entry; dogId: string }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"collapsed" | "expanded" | "editing">("collapsed");
  const del = useDeleteEntry(dogId);
  const upd = useUpdateEntry(dogId);

  const occurredText = String(entry.occurredAt).slice(0, 16).replace("T", " ");
  const toggleLabel = mode === "collapsed" ? t("journal.expand") : t("journal.collapse");
  const toggle = () => setMode(mode === "collapsed" ? "expanded" : "collapsed");

  return (
    <li className="rounded border border-silver bg-white text-sm">
      <div
        role="button"
        tabIndex={0}
        aria-label={toggleLabel}
        className="w-full cursor-pointer p-3 text-left"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <div className="flex justify-between">
          <span className="text-slate-soft">
            {occurredText} · {t("journal.intensity")}: {entry.intensity}
          </span>
          <Button
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              del.mutate(entry.id);
            }}
          >
            {t("journal.remove")}
          </Button>
        </div>
        <div>A: {entry.antecedent}</div>
        <div>B: {entry.behavior}</div>
        <div>C: {entry.consequence}</div>
      </div>

      {mode === "expanded" && (
        <div
          className="space-y-1 border-t border-silver p-3"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div>
            {t("journal.occurredAt")}: {occurredText}
          </div>
          <div>
            {t("journal.location")}: {fmt(entry.location)}
          </div>
          <div>
            {t("journal.duration")}: {fmt(entry.durationSeconds)}
          </div>
          <div>
            {t("journal.recovery")}: {fmt(entry.recoverySeconds)}
          </div>
          <div>
            {t("journal.peoplePresent")}: {fmt(entry.peoplePresent)}
          </div>
          <div>
            {t("journal.ownerResponse")}: {fmt(entry.ownerResponse)}
          </div>
          <div>
            {t("journal.notes")}: {fmt(entry.notes)}
          </div>
          <Button
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              setMode("editing");
            }}
          >
            ✎ {t("journal.edit")}
          </Button>
        </div>
      )}

      {mode === "editing" && (
        <EditForm
          entry={entry}
          submitting={upd.isPending}
          onCancel={() => setMode("expanded")}
          onSave={async (body) => {
            try {
              await upd.mutateAsync({ entryId: entry.id, body });
              toast.success(t("journal.savedEdit"));
              setMode("expanded");
            } catch {
              toast.error(t("journal.saveFailed"));
            }
          }}
        />
      )}
    </li>
  );
}

function EditForm({
  entry,
  submitting,
  onSave,
  onCancel,
}: {
  entry: Entry;
  submitting: boolean;
  onSave: (body: JournalEntryInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<JournalEntryInput>({
    resolver: zodResolver(journalEntrySchema),
    defaultValues: {
      occurredAt: String(entry.occurredAt).slice(0, 16),
      antecedent: entry.antecedent,
      behavior: entry.behavior,
      consequence: entry.consequence,
      intensity: entry.intensity,
      location: entry.location ?? undefined,
      notes: entry.notes ?? undefined,
      durationSeconds: entry.durationSeconds ?? undefined,
      recoverySeconds: entry.recoverySeconds ?? undefined,
      peoplePresent: entry.peoplePresent ?? undefined,
      ownerResponse: entry.ownerResponse ?? undefined,
    },
  });

  const onSubmit = handleSubmit((v) => onSave({ ...v, intensity: Number(v.intensity) }));
  const optional = <span className="text-slate-soft"> ({t("journal.optional")})</span>;

  return (
    <form
      onSubmit={(e) => {
        e.stopPropagation();
        onSubmit();
      }}
      onClick={(e) => e.stopPropagation()}
      className="space-y-3 border-t border-silver p-3"
    >
      <label className="block">
        <span className="text-sm">{t("journal.occurredAt")}</span>
        <input type="datetime-local" className={input} {...register("occurredAt")} />
        {errors.occurredAt && (
          <span className="text-xs text-red-600">{errors.occurredAt.message}</span>
        )}
      </label>
      <label className="block">
        <span className="text-sm">{t("journal.antecedent")}</span>
        <input className={input} {...register("antecedent")} />
      </label>
      <label className="block">
        <span className="text-sm">{t("journal.behavior")}</span>
        <input className={input} {...register("behavior")} />
      </label>
      <label className="block">
        <span className="text-sm">{t("journal.consequence")}</span>
        <input className={input} {...register("consequence")} />
      </label>
      <label className="block">
        <span className="text-sm">{t("journal.intensity")}</span>
        <select className={input} {...register("intensity", { valueAsNumber: true })}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm">
          {t("journal.location")}
          {optional}
        </span>
        <input
          className={input}
          {...register("location", { setValueAs: (v) => v || undefined })}
        />
      </label>
      <label className="block">
        <span className="text-sm">
          {t("journal.duration")}
          {optional}
        </span>
        <input
          type="number"
          min={0}
          className={input}
          {...register("durationSeconds", {
            setValueAs: (v) =>
              v === "" || v == null || Number.isNaN(Number(v)) ? undefined : Number(v),
          })}
        />
      </label>
      <label className="block">
        <span className="text-sm">
          {t("journal.recovery")}
          {optional}
        </span>
        <input
          type="number"
          min={0}
          className={input}
          {...register("recoverySeconds", {
            setValueAs: (v) =>
              v === "" || v == null || Number.isNaN(Number(v)) ? undefined : Number(v),
          })}
        />
      </label>
      <label className="block">
        <span className="text-sm">
          {t("journal.peoplePresent")}
          {optional}
        </span>
        <input
          className={input}
          {...register("peoplePresent", { setValueAs: (v) => v || undefined })}
        />
      </label>
      <label className="block">
        <span className="text-sm">
          {t("journal.ownerResponse")}
          {optional}
        </span>
        <textarea
          rows={2}
          className={input}
          {...register("ownerResponse", { setValueAs: (v) => v || undefined })}
        />
      </label>
      <label className="block">
        <span className="text-sm">
          {t("journal.notes")}
          {optional}
        </span>
        <textarea
          rows={2}
          className={input}
          {...register("notes", { setValueAs: (v) => v || undefined })}
        />
      </label>
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={isSubmitting || submitting}
          className="bg-slate text-cream"
        >
          {isSubmitting || submitting ? t("journal.saving") : t("journal.update")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("journal.cancel")}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @turingcare/web test -- entry-card
```
Expected: all three EntryCard tests PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/src/components/journal/entry-card.tsx apps/web/src/components/journal/entry-card.test.tsx
git -c commit.gpgsign=false commit -m "feat(web): EntryCard component (collapsed/expanded/edit-in-place)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Web — `journal.tsx` wire-up + create-form gains 4 new optional fields

**Files:**
- Modify: `apps/web/src/routes/journal.tsx`

- [ ] **Step 1: Replace the inline list rendering with `<EntryCard>` and extend the create-form**

Replace the entire contents of `apps/web/src/routes/journal.tsx` with:

```tsx
import { EntryCard } from "@/components/journal/entry-card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDogs } from "@/lib/dogs";
import { useAddEntry, useJournal } from "@/lib/journal";
import { zodResolver } from "@hookform/resolvers/zod";
import { type JournalEntryInput, journalEntrySchema } from "@turingcare/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function Journal() {
  const { t } = useI18n();
  const { data: dogs } = useDogs();
  const [dogId, setDogId] = useState("");
  const selected = dogId || dogs?.[0]?.id || "";
  const { data: entries, isError } = useJournal(selected);
  const add = useAddEntry(selected);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<JournalEntryInput>({
    resolver: zodResolver(journalEntrySchema),
    defaultValues: { intensity: 3 },
  });

  if (dogs && dogs.length === 0) return <p className="text-slate-soft">{t("journal.noDogs")}</p>;

  const onSubmit = handleSubmit(async (v) => {
    try {
      await add.mutateAsync({ ...v, intensity: Number(v.intensity) });
      toast.success(t("journal.saved"));
      reset({ intensity: 3 });
    } catch {
      toast.error(t("journal.saveFailed"));
    }
  });

  const optional = <span className="text-slate-soft"> ({t("journal.optional")})</span>;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-slate">{t("journal.title")}</h1>
      <label className="block">
        <span className="text-sm font-medium text-slate">{t("journal.pickDog")}</span>
        <select className={input} value={selected} onChange={(e) => setDogId(e.target.value)}>
          {dogs?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      {isError && <p className="text-red-600">{t("journal.loadError")}</p>}
      {entries?.length === 0 && <p className="text-slate-soft">{t("journal.empty")}</p>}
      <ul className="space-y-2">
        {entries?.map((e) => (
          <EntryCard
            key={e.id}
            dogId={selected}
            entry={{
              ...e,
              occurredAt: String(e.occurredAt),
              durationSeconds: e.durationSeconds ?? null,
              recoverySeconds: e.recoverySeconds ?? null,
              peoplePresent: e.peoplePresent ?? null,
              ownerResponse: e.ownerResponse ?? null,
              location: e.location ?? null,
              notes: e.notes ?? null,
            }}
          />
        ))}
      </ul>

      <form onSubmit={onSubmit} className="space-y-3 rounded border border-silver bg-white p-4">
        <h2 className="font-semibold text-slate">{t("journal.add")}</h2>
        <label className="block">
          <span className="text-sm">{t("journal.occurredAt")}</span>
          <input type="datetime-local" className={input} {...register("occurredAt")} />
          {errors.occurredAt && (
            <span className="text-xs text-red-600">{errors.occurredAt.message}</span>
          )}
        </label>
        <label className="block">
          <span className="text-sm">{t("journal.antecedent")}</span>
          <input className={input} {...register("antecedent")} />
        </label>
        <label className="block">
          <span className="text-sm">{t("journal.behavior")}</span>
          <input className={input} {...register("behavior")} />
        </label>
        <label className="block">
          <span className="text-sm">{t("journal.consequence")}</span>
          <input className={input} {...register("consequence")} />
        </label>
        <label className="block">
          <span className="text-sm">{t("journal.intensity")}</span>
          <select
            className={input}
            {...register("intensity", { valueAsNumber: true })}
            defaultValue={3}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm">
            {t("journal.location")}
            {optional}
          </span>
          <input
            className={input}
            {...register("location", { setValueAs: (v) => v || undefined })}
          />
        </label>
        <label className="block">
          <span className="text-sm">
            {t("journal.duration")}
            {optional}
          </span>
          <input
            type="number"
            min={0}
            className={input}
            {...register("durationSeconds", {
              setValueAs: (v) =>
                v === "" || v == null || Number.isNaN(Number(v)) ? undefined : Number(v),
            })}
          />
        </label>
        <label className="block">
          <span className="text-sm">
            {t("journal.recovery")}
            {optional}
          </span>
          <input
            type="number"
            min={0}
            className={input}
            {...register("recoverySeconds", {
              setValueAs: (v) =>
                v === "" || v == null || Number.isNaN(Number(v)) ? undefined : Number(v),
            })}
          />
        </label>
        <label className="block">
          <span className="text-sm">
            {t("journal.peoplePresent")}
            {optional}
          </span>
          <input
            className={input}
            {...register("peoplePresent", { setValueAs: (v) => v || undefined })}
          />
        </label>
        <label className="block">
          <span className="text-sm">
            {t("journal.ownerResponse")}
            {optional}
          </span>
          <textarea
            rows={2}
            className={input}
            {...register("ownerResponse", { setValueAs: (v) => v || undefined })}
          />
        </label>
        <label className="block">
          <span className="text-sm">
            {t("journal.notes")}
            {optional}
          </span>
          <textarea
            className={input}
            rows={2}
            {...register("notes", { setValueAs: (v) => v || undefined })}
          />
        </label>
        <Button type="submit" disabled={isSubmitting} className="bg-slate text-cream">
          {isSubmitting ? t("journal.saving") : t("journal.save")}
        </Button>
      </form>
    </div>
  );
}
```

Notes on the change:
- `useDeleteEntry` is no longer imported here — moved into `EntryCard`.
- The `<ul>` now renders `<EntryCard>` per entry; the explicit type-shape narrowing in the prop (`durationSeconds: e.durationSeconds ?? null`, etc.) is a defensive coalesce for any older entries returned with `undefined`-not-null.
- The four new create-form fields use the same `setValueAs` pattern as the existing `location`/`notes` (string → undefined when empty; number → undefined when blank/NaN).

- [ ] **Step 2: Run gates**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm --filter @turingcare/web test
```
Expected: `tsc` 0 errors; ALL web tests pass — incl. the existing `journal.test.tsx` ("renders existing entries and the add-entry form") which still asserts on the behavior text and the "Add entry" heading (both still rendered).

If `journal.test.tsx` fails because the stubbed entry lacks the four new fields and an EntryCard branch errors on null vs undefined, **fix it inline** by adding `durationSeconds: null, recoverySeconds: null, peoplePresent: null, ownerResponse: null` to the stub entry in `apps/web/src/routes/journal.test.tsx` lines 42–53. This is the only acceptable edit to that test in this task.

- [ ] **Step 3: Build + lint gates**

```bash
pnpm --filter @turingcare/web build
pnpm lint
```
Expected: build succeeds; lint 0 errors.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add apps/web/src/routes/journal.tsx apps/web/src/routes/journal.test.tsx
git -c commit.gpgsign=false commit -m "feat(web): journal page uses EntryCard; create-form gains 4 optional fields" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: PROJECT-LOG entry + finish as PR

**Files:**
- Modify: `docs/PROJECT-LOG.md`

- [ ] **Step 1: Full-repo gate (sanity)**

```bash
set -a && . ./.env && set +a
pnpm -r exec tsc --noEmit          # 0
pnpm -r test                       # all workspaces green
pnpm -r build                      # all succeed
pnpm lint                          # 0
git status --porcelain             # clean except untracked .claude/ .env
```

- [ ] **Step 2: Append `docs/PROJECT-LOG.md`** (bottom; match the file's heading style; prior entries byte-intact):

```markdown
## 2026-05-21 — Behavior Journal: edit + 4 missing capture fields — SHIPPED
Extended the per-dog ABC journal with a PUT endpoint and surfaced the four
nullable `journal_entries` columns the schema was designed to capture:
`durationSeconds`, `recoverySeconds`, `peoplePresent`, `ownerResponse`. The
journal page lists entries as compact rows; clicking a row expands the card to
show all 11 capture fields; a pencil affordance toggles inline edit-in-place
(RHF + zodResolver, Save/Cancel). Create-form gained the four new optional
fields. API gates: PUT is owner-scoped + double-scoped by dogId (cross-dog
entryId returns 404, mirrors the DELETE pattern). 11 new i18n keys with en/es
parity; one new component test file (3 cases) + 5 new api/shared cases. No DB
migration (columns already nullable), no new deps, no infra changes.
- Spec/plan: `specs/2026-05-21-journal-edit-and-fields-design.md`,
  `plans/2026-05-21-journal-edit-and-fields.md`
- Commits: this branch (see `git log`). Shipped as a PR from
  worktree-journal-edit-and-fields.
```

- [ ] **Step 3: Commit (only docs/PROJECT-LOG.md)**

```bash
git branch --show-current
git add docs/PROJECT-LOG.md
git -c commit.gpgsign=false commit -m "docs: PROJECT-LOG entry for journal edit + 4 new fields" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: superpowers:finishing-a-development-branch → Push and create a Pull Request** (do NOT merge to main locally; worktree preserved for PR iteration).

---

## Self-Review

**Spec coverage:**
- Shared schema +4 fields → T1.
- API POST extension → T2. PUT new handler with owner+double-scope → T3.
- i18n +11 keys with parity → T4.
- `useUpdateEntry` hook → T5.
- `<EntryCard>` with three modes → T6.
- `journal.tsx` list wire-up + create-form +4 fields → T7.
- PROJECT-LOG entry + PR → T8.
- Out of scope (Brief composer, filter/search, charts, attachments, tags) → not touched by any task; flagged in spec. ✓ No gap.

**Placeholder scan:** No "TBD"/"TODO"/"implement later". Every step has the actual code or exact commands an engineer needs. The one conditional in T7 Step 2 ("if `journal.test.tsx` fails because the stubbed entry lacks the four new fields") is bounded with the exact remediation, lines, and the explicit "only acceptable edit" rail.

**Type consistency:**
- Shared field names: `durationSeconds`, `recoverySeconds`, `peoplePresent`, `ownerResponse` — used identically in T1, T2, T3, T5, T6, T7. ✓
- Hook signature `{ entryId, body }` (T5) matches what `EntryCard` calls (T6 `upd.mutateAsync({ entryId: entry.id, body })`). ✓
- `Entry` type in EntryCard treats all four new fields as `number | null` / `string | null` — matches the DB columns and the schema's `.nullable().optional()`. The `journal.tsx` mapper (T7) explicitly coalesces `undefined → null` so EntryCard's `Entry` type contract is satisfied. ✓
- PUT path `j[":entryId"].$put` in T5 matches the route `/:id/journal/:entryId` declared in T3 (Hono `AppType` chain inference makes this typecheck only after T3 lands). ✓
- i18n key set in T4 matches every `t("journal.<key>")` call in T6 + T7. ✓
