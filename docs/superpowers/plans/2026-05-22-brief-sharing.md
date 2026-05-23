# Behavior Brief Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner share a dog's Behavior Brief via a revocable, read-only public link (`/b/<token>`) that anyone can open to view the brief + download its PDF.

**Architecture:** A nullable unique `shareToken` on the `briefs` row (migration `0003`) — non-null = that snapshot is shared. Owner-only mint/revoke endpoints on the existing owner-scoped `dogs` sub-app; a new **public** `GET /api/share/brief/:token` (no auth) returning a strict field whitelist; a public `/b/:token` web page reusing the existing PDF components.

**Tech Stack:** Hono, Drizzle, Better Auth, Zod, `node:crypto`, Vite/React 19, React Router v7, TanStack Query, Vitest. Vitest auto-loads `.env`; Postgres `turingcare-postgres` running.

**Spec:** `docs/superpowers/specs/2026-05-22-brief-sharing-design.md`

---

## File Structure
- `apps/api/src/db/schema.ts` *(modify)* — `briefs.shareToken` (unique, nullable).
- `apps/api/drizzle/0003_*.sql` *(generated)*.
- `apps/api/src/routes/dogs.ts` *(modify)* — `POST`/`DELETE /:id/brief/share` (owner-scoped).
- `apps/api/src/routes/share.ts` *(create)* — public `GET /brief/:token`.
- `apps/api/src/app.ts` *(modify)* — mount `.route("/api/share", shareApp)`.
- `apps/api/src/routes/share.test.ts` *(create)* — mint/revoke + public read tests.
- `apps/web/src/lib/brief.ts` *(modify)* — `useShareBrief` / `useRevokeShare` hooks.
- `apps/web/src/lib/shared-brief.ts` *(create)* — public fetch hook.
- `apps/web/src/routes/brief.tsx` *(modify)* — Share control.
- `apps/web/src/routes/brief.test.tsx` *(modify)* — Share control test.
- `apps/web/src/routes/shared-brief.tsx` *(create)* — public page.
- `apps/web/src/routes/shared-brief.test.tsx` *(create)*.
- `apps/web/src/main.tsx` *(modify)* — public `/b/:token` route.
- `apps/web/src/i18n/en.ts` + `es.ts` *(modify)* — share keys (parity).
- `docs/PROJECT-LOG.md` *(modify)*.

---

## Task 1: Migration — `briefs.shareToken`

**Files:** Modify `apps/api/src/db/schema.ts`; Generate `apps/api/drizzle/0003_*.sql`

- [ ] **Step 1: Add the column.** In `apps/api/src/db/schema.ts`, inside the `briefs` pgTable definition, add after the `version` line:

```ts
  shareToken: text("share_token").unique(),
```

(`text` is already imported.)

- [ ] **Step 2: Generate the migration.**

Run: `pnpm --filter @turingcare/api db:generate`
Expected: new `apps/api/drizzle/0003_*.sql` containing `ALTER TABLE "briefs" ADD COLUMN "share_token" text;` + a unique constraint/index; `_journal.json` gains `idx: 3`.

- [ ] **Step 3: Apply it.**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api db:migrate`
Expected: migration `0003` applies clean.

- [ ] **Step 4: Typecheck.** `pnpm --filter @turingcare/api typecheck` → no errors.

- [ ] **Step 5: Commit.**
```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/
git commit -m "feat(api): briefs.shareToken column (migration 0003)"
```

---

## Task 2: Owner mint + revoke endpoints (TDD)

**Files:** Modify `apps/api/src/routes/dogs.ts`; Test `apps/api/src/routes/share.test.ts` (create — covers mint/revoke; public read added in Task 3)

- [ ] **Step 1: Write the failing test.** Create `apps/api/src/routes/share.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { auth } from "../auth";
import { db } from "../db";
import { user } from "../db/schema";

async function signedUpCookie(email: string) {
  await auth.api.signUpEmail({ body: { name: "Sh", email, password: "password-123" } });
  const res = await auth.api.signInEmail({
    body: { email, password: "password-123" },
    asResponse: true,
  });
  return res.headers.get("set-cookie") ?? "";
}

async function createDogWithBrief(cookie: string) {
  const dogRes = await app.request("/api/dogs", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ name: "Rex", size: "medium", sex: "male", source: "shelter", vaccineStage: "unknown" }),
  });
  const { dog } = await dogRes.json();
  await app.request(`/api/dogs/${dog.id}/brief`, { method: "POST", headers: { cookie } });
  return dog.id as string;
}

const emails: string[] = [];
afterEach(async () => {
  for (const e of emails.splice(0)) await db.delete(user).where(eq(user.email, e));
});

describe("brief share mint/revoke", () => {
  it("requires a session (401)", async () => {
    const res = await app.request("/api/dogs/whatever/brief/share", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("mints a token + url, is idempotent, and revoke clears it", async () => {
    const email = `share_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDogWithBrief(cookie);

    const r1 = await app.request(`/api/dogs/${dogId}/brief/share`, { method: "POST", headers: { cookie } });
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { token: string; url: string };
    expect(b1.token.length).toBeGreaterThan(10);
    expect(b1.url).toMatch(/\/b\/.+$/);

    const r2 = await app.request(`/api/dogs/${dogId}/brief/share`, { method: "POST", headers: { cookie } });
    const b2 = (await r2.json()) as { token: string };
    expect(b2.token).toBe(b1.token); // idempotent

    const del = await app.request(`/api/dogs/${dogId}/brief/share`, { method: "DELETE", headers: { cookie } });
    expect(del.status).toBe(200);
  });

  it("404 when minting for a dog with no brief", async () => {
    const email = `nobrief_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogRes = await app.request("/api/dogs", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ name: "NoBrief", size: "small", sex: "female", source: "breeder", vaccineStage: "unknown" }),
    });
    const { dog } = await dogRes.json();
    const res = await app.request(`/api/dogs/${dog.id}/brief/share`, { method: "POST", headers: { cookie } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** `pnpm --filter @turingcare/api exec vitest run src/routes/share.test.ts` → mint returns 404 (route missing).

- [ ] **Step 3: Implement.** In `apps/api/src/routes/dogs.ts`: add imports near the top (with the existing imports) —
```ts
import { randomBytes } from "node:crypto";
import { env } from "../env";
```
Then, immediately AFTER the existing `.get("/:id/brief", …)` handler block and BEFORE `.post("/:id/brief", …)`, insert the two routes:
```ts
  .post("/:id/brief/share", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [brief] = await db
      .select()
      .from(briefs)
      .where(eq(briefs.dogId, dog.id))
      .orderBy(desc(briefs.version))
      .limit(1);
    if (!brief) return c.json({ error: "no_brief" } as const, 404);
    let token = brief.shareToken;
    if (!token) {
      token = randomBytes(18).toString("base64url");
      await db.update(briefs).set({ shareToken: token }).where(eq(briefs.id, brief.id));
    }
    return c.json({ token, url: `${env.FRONTEND_URL}/b/${token}` });
  })
  .delete("/:id/brief/share", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [brief] = await db
      .select()
      .from(briefs)
      .where(eq(briefs.dogId, dog.id))
      .orderBy(desc(briefs.version))
      .limit(1);
    if (!brief) return c.json({ error: "not_found" } as const, 404);
    await db.update(briefs).set({ shareToken: null }).where(eq(briefs.id, brief.id));
    return c.json({ ok: true } as const);
  })
```

> The existing `GET /:id/brief` uses `db.select()` (all columns), so it now
> automatically returns `shareToken` — no change needed there.

- [ ] **Step 4: Run — expect PASS** (3 tests). `pnpm --filter @turingcare/api exec vitest run src/routes/share.test.ts`

- [ ] **Step 5: Commit.**
```bash
git add apps/api/src/routes/dogs.ts apps/api/src/routes/share.test.ts
git commit -m "feat(api): owner mint/revoke brief share token"
```

---

## Task 3: Public read endpoint (TDD)

**Files:** Create `apps/api/src/routes/share.ts`; Modify `apps/api/src/app.ts`; extend `apps/api/src/routes/share.test.ts`

- [ ] **Step 1: Add failing tests.** Append inside `share.test.ts` a new `describe`:

```ts
describe("public GET /api/share/brief/:token", () => {
  it("returns whitelisted fields for a valid token and 404 after revoke/for unknown", async () => {
    const email = `pub_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDogWithBrief(cookie);
    const mint = await app.request(`/api/dogs/${dogId}/brief/share`, { method: "POST", headers: { cookie } });
    const { token } = (await mint.json()) as { token: string };

    const pub = await app.request(`/api/share/brief/${token}`);
    expect(pub.status).toBe(200);
    const body = (await pub.json()) as { brief: Record<string, unknown> };
    expect(body.brief.dogName).toBe("Rex");
    expect(typeof body.brief.summary).toBe("string");
    expect(body.brief).toHaveProperty("version");
    // whitelist: no owner/userId/dog id leakage
    expect(body.brief).not.toHaveProperty("userId");
    expect(body.brief).not.toHaveProperty("dogId");
    expect(body.brief).not.toHaveProperty("shareToken");

    expect((await app.request("/api/share/brief/does-not-exist")).status).toBe(404);

    await app.request(`/api/dogs/${dogId}/brief/share`, { method: "DELETE", headers: { cookie } });
    expect((await app.request(`/api/share/brief/${token}`)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (public route 404 for the valid token too). `pnpm --filter @turingcare/api exec vitest run src/routes/share.test.ts`

- [ ] **Step 3: Implement.** Create `apps/api/src/routes/share.ts`:

```ts
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { briefs, dogs } from "../db/schema";

/** Public, unauthenticated read of a shared brief by token. Returns a strict
 * whitelist (no userId / dog id / token). Revoked + unknown tokens both 404. */
export const shareApp = new Hono().get("/brief/:token", async (c) => {
  const [row] = await db
    .select({
      dogName: dogs.name,
      summary: briefs.summary,
      status: briefs.status,
      version: briefs.version,
      generatedAt: briefs.generatedAt,
    })
    .from(briefs)
    .innerJoin(dogs, eq(briefs.dogId, dogs.id))
    .where(eq(briefs.shareToken, c.req.param("token")))
    .limit(1);
  if (!row) return c.json({ error: "not_found" } as const, 404);
  return c.json({ brief: row });
});
```

In `apps/api/src/app.ts`: add `import { shareApp } from "./routes/share";` with the other route imports, and mount it in the chain (e.g. right after `.route("/api/dogs", dogsApp)`):
```ts
  .route("/api/share", shareApp)
```

- [ ] **Step 4: Run — expect PASS.** `pnpm --filter @turingcare/api exec vitest run src/routes/share.test.ts` (4 tests total). Then full api suite + typecheck: `pnpm --filter @turingcare/api test && pnpm --filter @turingcare/api typecheck`.

> If the api auth tests 429 (shared local Postgres accumulates `rate_limit`
> rows across runs), clear them: `docker exec turingcare-postgres psql -U postgres -d turingcare -c "DELETE FROM rate_limit;"` and re-run. Not a code issue.

- [ ] **Step 5: Commit.**
```bash
git add apps/api/src/routes/share.ts apps/api/src/app.ts apps/api/src/routes/share.test.ts
git commit -m "feat(api): public GET /api/share/brief/:token (read-only)"
```

---

## Task 4: Web — share hooks + Share control on brief.tsx (TDD)

**Files:** Modify `apps/web/src/lib/brief.ts`, `apps/web/src/routes/brief.tsx`, `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`; Modify test `apps/web/src/routes/brief.test.tsx`

- [ ] **Step 1: i18n keys.** In `apps/web/src/i18n/en.ts`, inside the `brief: { … }` group (after `genFailed`), add:
```ts
    share: "Share link",
    createShareLink: "Create share link",
    stopSharing: "Stop sharing",
    copyLink: "Copy link",
    linkCopied: "Link copied",
    shareFailed: "Couldn't update sharing",
```
In `apps/web/src/i18n/es.ts`, same group, add:
```ts
    share: "Enlace para compartir",
    createShareLink: "Crear enlace",
    stopSharing: "Dejar de compartir",
    copyLink: "Copiar enlace",
    linkCopied: "Enlace copiado",
    shareFailed: "No se pudo actualizar el enlace",
```

- [ ] **Step 2: Hooks.** In `apps/web/src/lib/brief.ts`, add (using the existing `b = api.api.dogs[":id"].brief`):
```ts
export function useShareBrief(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await b.share.$post({ param: { id: dogId } });
      if (!res.ok) throw new Error("share_failed");
      return (await res.json()) as { token: string; url: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brief", dogId] }),
  });
}
export function useRevokeShare(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await b.share.$delete({ param: { id: dogId } });
      if (!res.ok) throw new Error("revoke_failed");
      return (await res.json()) as { ok: true };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brief", dogId] }),
  });
}
```

- [ ] **Step 3: Failing test.** In `apps/web/src/routes/brief.test.tsx`, add a test that with a shared brief (`shareToken` present) the Share section shows the link + Stop sharing, and that "Create share link" appears when not shared. Read the existing `brief.test.tsx` to mirror its mocking of `@/lib/brief` + `@/lib/dogs`; mock `useShareBrief`/`useRevokeShare` to return `{ mutateAsync: vi.fn(), isPending: false }` and `useBrief` to return a brief with/without `shareToken`. Assert:
  - brief without `shareToken` → button named `/create share link/i` present.
  - brief with `shareToken: "tok123"` → an element showing the link text containing `/b/tok123` and a `/stop sharing/i` control.

- [ ] **Step 4: Run — expect FAIL.** `pnpm --filter @turingcare/web exec vitest run src/routes/brief.test.tsx`

- [ ] **Step 5: Implement the Share control.** In `apps/web/src/routes/brief.tsx`:
  - Add to imports: `useRevokeShare, useShareBrief` from `@/lib/brief`.
  - In the component (after `const fin = …`): `const share = useShareBrief(dogId); const revoke = useRevokeShare(dogId);`
  - The brief object now carries `shareToken` (string | null) from the API. Compute `const shareUrl = brief?.shareToken ? \`${window.location.origin}/b/${brief.shareToken}\` : null;`
  - Inside the `{brief && ( <> … </> )}` actions block, after the Copy button, add a Share area:
```tsx
                {shareUrl ? (
                  <>
                    <input
                      readOnly
                      aria-label={t("brief.share")}
                      value={shareUrl}
                      className="rounded border border-silver bg-white px-2 py-1 text-sm w-64"
                    />
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(shareUrl);
                          toast.success(t("brief.linkCopied"));
                        } catch {
                          toast.error(t("brief.shareFailed"));
                        }
                      }}
                    >
                      {t("brief.copyLink")}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={revoke.isPending}
                      onClick={async () => {
                        try {
                          await revoke.mutateAsync();
                        } catch {
                          toast.error(t("brief.shareFailed"));
                        }
                      }}
                    >
                      {t("brief.stopSharing")}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    disabled={share.isPending}
                    onClick={async () => {
                      try {
                        await share.mutateAsync();
                      } catch {
                        toast.error(t("brief.shareFailed"));
                      }
                    }}
                  >
                    {t("brief.createShareLink")}
                  </Button>
                )}
```

- [ ] **Step 6: Run — expect PASS** + full web suite. `pnpm --filter @turingcare/web exec vitest run src/routes/brief.test.tsx && pnpm --filter @turingcare/web test`

- [ ] **Step 7: Commit.**
```bash
git add apps/web/src/lib/brief.ts apps/web/src/routes/brief.tsx apps/web/src/routes/brief.test.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): Share link control on the brief page"
```

---

## Task 5: Web — public `/b/:token` page (TDD)

**Files:** Create `apps/web/src/lib/shared-brief.ts`, `apps/web/src/routes/shared-brief.tsx`, `apps/web/src/routes/shared-brief.test.tsx`; Modify `apps/web/src/main.tsx`

- [ ] **Step 1: Public fetch hook.** Create `apps/web/src/lib/shared-brief.ts`:
```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type SharedBrief = {
  dogName: string;
  summary: string;
  status: string;
  version: number;
  generatedAt: string;
};

export function useSharedBrief(token: string) {
  return useQuery({
    queryKey: ["shared-brief", token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      const res = await api.api.share.brief[":token"].$get({ param: { token } });
      if (!res.ok) throw new Error("not_found");
      return (await res.json()).brief as SharedBrief;
    },
  });
}
```

- [ ] **Step 2: Failing test.** Create `apps/web/src/routes/shared-brief.test.tsx`:
```tsx
import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
  );
}
beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

const { SharedBrief } = await import("./shared-brief");

function setup() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/b/tok123"]}>
          <Routes>
            <Route path="/b/:token" element={<SharedBrief />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

it("renders the shared brief from the public endpoint", async () => {
  mockFetch(200, { brief: { dogName: "Rex", summary: "Behavior Brief — Rex\n...", status: "finalized", version: 2, generatedAt: "2026-05-22T00:00:00Z" } });
  setup();
  await waitFor(() => expect(screen.getByText(/Rex/)).toBeInTheDocument());
  expect(screen.getByText(/Behavior Brief — Rex/)).toBeInTheDocument();
});

it("shows a not-available view on 404", async () => {
  mockFetch(404, { error: "not_found" });
  setup();
  await waitFor(() => expect(screen.getByText(/isn't available|no está disponible/i)).toBeInTheDocument());
});
```

- [ ] **Step 3: Run — expect FAIL.** `pnpm --filter @turingcare/web exec vitest run src/routes/shared-brief.test.tsx`

- [ ] **Step 4: i18n keys** for the public page. In `en.ts` brief group add:
```ts
    sharedTitle: "Shared Behavior Brief",
    shareUnavailable: "This share link isn't available.",
```
In `es.ts` brief group add:
```ts
    sharedTitle: "Resumen de conducta compartido",
    shareUnavailable: "Este enlace no está disponible.",
```

- [ ] **Step 5: Implement the page.** Create `apps/web/src/routes/shared-brief.tsx`:
```tsx
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useSharedBrief } from "@/lib/shared-brief";
import { Suspense, lazy } from "react";
import { useParams } from "react-router-dom";

const BriefDownloadButton = lazy(() => import("@/components/brief-download-button"));

export function SharedBrief() {
  const { t } = useI18n();
  const { token } = useParams();
  const { data, isPending, isError } = useSharedBrief(token ?? "");

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="flex justify-center">
        <BrandMark />
      </div>
      {isPending ? (
        <p className="p-4 text-slate-soft">{t("common.loading")}</p>
      ) : isError || !data ? (
        <p className="p-4 text-slate-soft">{t("brief.shareUnavailable")}</p>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-slate">{t("brief.sharedTitle")}</h1>
          <div className="flex flex-wrap gap-2">
            <Suspense
              fallback={
                <Button variant="outline" disabled>
                  {t("brief.preparingPdf")}
                </Button>
              }
            >
              <BriefDownloadButton
                brief={{ summary: data.summary, status: data.status, version: data.version }}
                dog={{ name: data.dogName }}
              />
            </Suspense>
          </div>
          <article className="brief-print whitespace-pre-wrap rounded border border-silver bg-white p-4 text-sm text-slate">
            <div className="mb-2 font-semibold text-copper">
              {t("brief.version")} {data.version}
            </div>
            {data.summary}
          </article>
        </>
      )}
    </div>
  );
}
```

> `BriefDownloadButton` is fed a minimal brief-like object + `{ name: dogName }`.
> `buildBriefPdfModel` already tolerates missing dog fields (renders "Unknown"
> for absent ones) and only needs `summary` + dog name. If the prop types are
> stricter than this minimal shape, widen `BriefDownloadButton`'s props to accept
> the fields it actually reads (`brief.summary/status/version`, `dog.name`) rather
> than the full DB row types — keep it a structural subset, no `any`. Report the
> exact prop adjustment if one is needed.

- [ ] **Step 6: Route.** In `apps/web/src/main.tsx`: add `import { SharedBrief } from "@/routes/shared-brief";` and a PUBLIC route (alongside `/login` etc., NOT under `RequireAuth`/`RedirectIfAuthed`):
```tsx
            <Route path="/b/:token" element={<SharedBrief />} />
```

- [ ] **Step 7: Run — expect PASS** + full web suite + typecheck. `pnpm --filter @turingcare/web exec vitest run src/routes/shared-brief.test.tsx && pnpm --filter @turingcare/web test && pnpm --filter @turingcare/web typecheck`

- [ ] **Step 8: Commit.**
```bash
git add apps/web/src/lib/shared-brief.ts apps/web/src/routes/shared-brief.tsx apps/web/src/routes/shared-brief.test.tsx apps/web/src/main.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): public /b/:token shared brief page"
```

---

## Task 6: Full gate + PROJECT-LOG + PR

**Files:** Modify `docs/PROJECT-LOG.md`

- [ ] **Step 1: Full gate.**
```bash
set -a && . ./.env && set +a
docker exec turingcare-postgres psql -U postgres -d turingcare -c "DELETE FROM rate_limit;"
pnpm biome check . && pnpm -r exec tsc --noEmit && pnpm -r test && pnpm -r build
```
All green (apply biome `--write` for formatting-only fallout, re-run). The `rate_limit` clear avoids spurious 429s in the auth tests on the shared local DB.

- [ ] **Step 2: PROJECT-LOG entry.** Append to `docs/PROJECT-LOG.md`:
```markdown
## 2026-05-22 — Behavior Brief sharing (read-only link) — SHIPPED
MVP #4. Owners share a dog's Behavior Brief via a revocable, read-only public
link `/b/<token>` (no recipient login). `briefs.shareToken` (unique, nullable;
migration 0003) snapshots the shared brief version. Owner-scoped
`POST/DELETE /api/dogs/:id/brief/share` mint (idempotent, crypto-random
base64url) / revoke; existing `GET …/brief` now carries `shareToken`. Public
`GET /api/share/brief/:token` returns a strict whitelist (dogName, summary,
status, version, generatedAt) — no userId/dog id/token; revoked + unknown both
404. Web: Share control on the brief page (create/copy/stop), public
`SharedBrief` page reusing the PDF download. en+es parity. Full TDD; gate green.
- Spec/plan: `specs/2026-05-22-brief-sharing-design.md`, `plans/2026-05-22-brief-sharing.md`
- Commits: this branch (see `git log`). Shipped as a PR from feat+brief-sharing.
```

- [ ] **Step 3: Commit + finish.**
```bash
git add docs/PROJECT-LOG.md
git commit -m "docs: PROJECT-LOG entry for brief sharing"
```
Then use `superpowers:finishing-a-development-branch` to push + open the PR.

---

## Self-Review
**Spec coverage:** §2 `shareToken` migration → T1 ✓ · §3 mint/revoke (owner, idempotent, 404-no-brief) → T2 ✓ · §3 `GET …/brief` includes shareToken → T2 (automatic via `select()`) ✓ · §3 public `GET /api/share/brief/:token` whitelist + 404 parity → T3 ✓ · §4 owner Share control → T4 ✓ · §4 public `/b/:token` page reusing PDF → T5 ✓ · §5 security (whitelist, revoke=404, owner-scoped, rate-limited) → T2/T3 ✓ · §6 tests (api mint/revoke/public + web brief control + shared page incl. 404) → T2/T3/T4/T5 ✓ · en+es parity → T4/T5 ✓.
**Placeholder scan:** none — every step has complete code + exact commands. (The one judgement note — widening `BriefDownloadButton` props if its types are too strict — is bounded with an explicit "structural subset, no `any`" rule + report-back, not a vague placeholder.)
**Type consistency:** `shareToken` (schema) flows to the brief row consumed in T2/T4; hooks `useShareBrief`/`useRevokeShare` call `b.share.$post`/`$delete` matching the `/:id/brief/share` routes; public path `api.api.share.brief[":token"].$get` matches the `.route("/api/share", shareApp)` mount + `share.ts` `/brief/:token`; `SharedBrief` type matches the public endpoint's whitelist; `/b/:token` route param matches `useParams().token`.
