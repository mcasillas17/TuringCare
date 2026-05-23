# Email a Behavior Brief — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Owner generates a Behavior Brief → marks it finalized → sends it to any email address with an optional personal note. Audit recorded; trainer's Reply-To goes to the owner.

**Architecture:** Schema-down — shared zod → API POST/GET endpoints → hono RPC → web hook + `<SendPanel>` component → page wire-up. One new DB table (`brief_sends`), one drizzle migration, one new API endpoint pair, one extension to `sendEmail` (`replyTo`), one new email template, one new React component. No deps added.

**Tech Stack:** Zod, Hono, Drizzle (pg), Better Auth, Resend, React 19, react-hook-form + zodResolver, TanStack Query, Tailwind v4, vitest, sonner toasts.

**Spec:** `docs/superpowers/specs/2026-05-22-email-a-brief-design.md`

**Conventions:** Worktree `.claude/worktrees/email-a-brief`, branch `worktree-email-a-brief`, off `origin/main`. Ships as ONE PR. gpg-unsigned commits ending:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
Web cmds: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web <cmd>`. API cmds: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api <cmd>`. `pnpm lint` from worktree root. **Pre-commit branch assertion:** `git branch --show-current` must equal `worktree-email-a-brief`; if not, STOP and report.

---

## File Structure

```
packages/shared/src/brief.ts                              CREATE  briefSendSchema
packages/shared/src/brief.test.ts                         CREATE  +4 schema tests
packages/shared/src/index.ts                              MODIFY  export brief.ts
apps/api/src/db/schema.ts                                 MODIFY  +brief_sends table
apps/api/drizzle/0003_*.sql                               CREATE  generated migration
apps/api/drizzle/meta/_journal.json                       MODIFY  generated
apps/api/src/email/send-email.ts                          MODIFY  +replyTo arg
apps/api/src/email/send-email.test.ts                     MODIFY  +replyTo tests
apps/api/src/email/brief-email.ts                         CREATE  renderBriefEmail()
apps/api/src/email/brief-email.test.ts                    CREATE  +5 template tests
apps/api/src/routes/dogs.ts                               MODIFY  +POST send +GET sends
apps/api/src/routes/dogs.test.ts                          MODIFY  +10 endpoint tests
apps/web/src/lib/brief-send.ts                            CREATE  useSendBrief + useBriefSends
apps/web/src/components/brief/send-panel.tsx              CREATE  SendPanel component
apps/web/src/components/brief/send-panel.test.tsx         CREATE  +7 component tests
apps/web/src/routes/brief.tsx                             MODIFY  render <SendPanel>
apps/web/src/i18n/en.ts                                   MODIFY  +13 briefSend keys
apps/web/src/i18n/es.ts                                   MODIFY  +13 briefSend keys
docs/PROJECT-LOG.md                                       MODIFY  shipped entry
```

---

## Task B1: Shared schema — `briefSendSchema`

**Files:**
- Create: `packages/shared/src/brief.ts`
- Create: `packages/shared/src/brief.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/brief.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { briefSendSchema } from "./brief";

describe("briefSendSchema", () => {
  it("accepts a valid email + optional message", () => {
    expect(
      briefSendSchema.safeParse({ recipient: "sarah@example.com", message: "Hi" }).success,
    ).toBe(true);
  });
  it("accepts message null / undefined / missing", () => {
    expect(briefSendSchema.safeParse({ recipient: "a@b.co" }).success).toBe(true);
    expect(briefSendSchema.safeParse({ recipient: "a@b.co", message: null }).success).toBe(true);
    expect(briefSendSchema.safeParse({ recipient: "a@b.co", message: undefined }).success).toBe(
      true,
    );
  });
  it("rejects invalid email", () => {
    expect(briefSendSchema.safeParse({ recipient: "not-an-email" }).success).toBe(false);
    expect(briefSendSchema.safeParse({ recipient: "" }).success).toBe(false);
  });
  it("rejects message > 500 chars", () => {
    expect(
      briefSendSchema.safeParse({ recipient: "a@b.co", message: "x".repeat(501) }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @turingcare/shared test
```
Expected: all 4 cases FAIL because `./brief` doesn't exist.

- [ ] **Step 3: Implement the schema**

Create `packages/shared/src/brief.ts`:

```ts
import { z } from "zod";

export const briefSendSchema = z.object({
  recipient: z.string().trim().email("Enter a valid email address"),
  message: z.string().trim().max(500, "Note is too long").nullable().optional(),
});
export type BriefSendInput = z.infer<typeof briefSendSchema>;
```

Modify `packages/shared/src/index.ts` — append:

```ts
export * from "./brief";
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @turingcare/shared test
```
Expected: all shared tests PASS (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: worktree-email-a-brief
git add packages/shared/src/brief.ts packages/shared/src/brief.test.ts packages/shared/src/index.ts
git -c commit.gpgsign=false commit -m "feat(shared): briefSendSchema for trainer-email payloads" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B2: DB table — `brief_sends`

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0003_*.sql` (generated)
- Modify: `apps/api/drizzle/meta/_journal.json` (generated)

- [ ] **Step 1: Add the table to schema.ts**

In `apps/api/src/db/schema.ts`, after the `briefs` table definition (around line 159, before `briefsRelations`), insert:

```ts
export const briefSends = pgTable("brief_sends", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  briefId: uuid("brief_id")
    .notNull()
    .references(() => briefs.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(),
  message: text("message"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  sentByUserId: text("sent_by_user_id").notNull(),
});
```

The `sent_by_user_id` is text (matching the Better Auth `user.id` type used elsewhere; verify by checking how `dogs.ownerId` references the user table).

- [ ] **Step 2: Generate the migration**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api db:generate
```
Expected: a new file `apps/api/drizzle/0003_<adjective_name>.sql` is created with a `CREATE TABLE "brief_sends" ...` statement; `meta/_journal.json` is updated.

Spot-check the generated SQL — it should:
- Create `brief_sends` with the four columns + id + sentAt
- Add a FK constraint on `brief_id` with `ON DELETE CASCADE`
- Add a default `gen_random_uuid()` on `id`
- Add a `NOT NULL DEFAULT now()` on `sent_at`

If the generated SQL differs materially from this, STOP and report — don't hand-edit the SQL.

- [ ] **Step 3: Apply the migration locally + run API tests**

```bash
pnpm --filter @turingcare/api db:migrate
pnpm --filter @turingcare/api test
```
Expected: migration succeeds; existing 80 tests still PASS. No new tests yet — pure schema change.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add apps/api/src/db/schema.ts apps/api/drizzle/
git -c commit.gpgsign=false commit -m "feat(api): brief_sends table for trainer-email audit trail" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B3: Extend `sendEmail` with `replyTo`

**Files:**
- Modify: `apps/api/src/email/send-email.ts`
- Modify: `apps/api/src/email/send-email.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/email/send-email.test.ts`:

```ts
describe("sendEmail replyTo", () => {
  it("passes replyTo as reply_to to the Resend client", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const stubClient: ResendLike = {
      emails: {
        send: async (args) => {
          calls.push(args as Record<string, unknown>);
          return { data: {}, error: null };
        },
      },
    };
    await sendEmail(
      {
        to: "x@y.co",
        subject: "s",
        html: "<p>h</p>",
        text: "t",
        replyTo: "owner@example.com",
      },
      { client: stubClient, apiKey: "k", from: "noreply@x.co" },
    );
    expect(calls).toHaveLength(1);
    const [first] = calls;
    if (!first) throw new Error("expected one call");
    expect(first.reply_to).toBe("owner@example.com");
  });

  it("omits reply_to when replyTo is not supplied", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const stubClient: ResendLike = {
      emails: {
        send: async (args) => {
          calls.push(args as Record<string, unknown>);
          return { data: {}, error: null };
        },
      },
    };
    await sendEmail(
      { to: "x@y.co", subject: "s", html: "<p>h</p>", text: "t" },
      { client: stubClient, apiKey: "k", from: "noreply@x.co" },
    );
    const [first] = calls;
    if (!first) throw new Error("expected one call");
    expect(first.reply_to).toBeUndefined();
  });
});
```

If `ResendLike` is not exported from `send-email.ts`, add `export` to its declaration (small breaking change, but no external consumers).

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @turingcare/api test send-email
```
Expected: the new tests FAIL because `replyTo` is not in `SendEmailArgs` (TS error) and `reply_to` is not in `ResendLike.emails.send` args. Address both in step 3.

- [ ] **Step 3: Extend the interfaces and pass-through**

In `apps/api/src/email/send-email.ts`:

1. Add `replyTo?: string;` to `SendEmailArgs`.
2. Add `reply_to?: string;` to the `ResendLike.emails.send` arg type.
3. In the `sendEmail` impl, build the Resend payload conditionally:

```ts
// inside sendEmail, where the client.emails.send call is made:
const sendArgs: Parameters<ResendLike["emails"]["send"]>[0] = {
  from,
  to: args.to,
  subject: args.subject,
  html: args.html,
  text: args.text,
};
if (args.replyTo) sendArgs.reply_to = args.replyTo;
const result = await client.emails.send(sendArgs);
```

(Adapt to the existing shape of the call — likely keep the rest unchanged and only conditionally add `reply_to`.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @turingcare/api test send-email
```
Expected: both new tests PASS; existing send-email tests still PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/api/src/email/send-email.ts apps/api/src/email/send-email.test.ts
git -c commit.gpgsign=false commit -m "feat(api): sendEmail accepts replyTo (passes Resend reply_to)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B4: Email template — `brief-email.ts`

**Files:**
- Create: `apps/api/src/email/brief-email.ts`
- Create: `apps/api/src/email/brief-email.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/email/brief-email.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderBriefEmail } from "./brief-email";

const base = {
  dogName: "Biscuit",
  ownerName: "Miguel",
  message: null as string | null,
  summary: "Behavior: barked at doorbell.\nIntensity: 3.",
};

describe("renderBriefEmail", () => {
  it("subject contains the dog name", () => {
    expect(renderBriefEmail(base).subject).toBe("Behavior Brief: Biscuit");
  });
  it("HTML contains owner name and brief summary", () => {
    const { html } = renderBriefEmail(base);
    expect(html).toContain("Miguel");
    expect(html).toContain("barked at doorbell");
  });
  it("HTML omits blockquote when message is null", () => {
    const { html } = renderBriefEmail({ ...base, message: null });
    expect(html).not.toContain("<blockquote");
  });
  it("HTML includes blockquote when message is present", () => {
    const { html } = renderBriefEmail({ ...base, message: "Hi Sarah" });
    expect(html).toContain("<blockquote");
    expect(html).toContain("Hi Sarah");
  });
  it("text fallback contains the summary verbatim", () => {
    expect(renderBriefEmail(base).text).toContain("barked at doorbell");
  });
  it("escapes HTML in dog name and summary (XSS defense)", () => {
    const { html } = renderBriefEmail({
      ...base,
      dogName: "<script>x</script>",
      summary: "<img src=x>",
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @turingcare/api test brief-email
```
Expected: all 6 tests FAIL (module doesn't exist).

- [ ] **Step 3: Implement the template**

Create `apps/api/src/email/brief-email.ts`:

```ts
import type { EmailBody } from "./templates";

export interface BriefEmailInputs {
  dogName: string;
  ownerName: string;
  message: string | null;
  summary: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderBriefEmail(args: BriefEmailInputs): EmailBody {
  const safeDog = escapeHtml(args.dogName);
  const safeOwner = escapeHtml(args.ownerName);
  const safeMessage = args.message ? escapeHtml(args.message) : null;
  const safeSummary = escapeHtml(args.summary);

  const messageBlock = safeMessage
    ? `<blockquote style="margin:0 0 20px;padding:12px 16px;border-left:3px solid #b45309;background:#fef9f0;font-size:14px;line-height:1.6;color:#0f172a;white-space:pre-wrap">${safeMessage}</blockquote>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f6f5f3;font-family:ui-sans-serif,system-ui,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<h1 style="margin:0 0 4px;font-size:20px;color:#0f172a">Behavior Brief: ${safeDog}</h1>
<p style="margin:0 0 20px;font-size:13px;color:#6b7280">Shared by ${safeOwner}</p>
${messageBlock}
<div style="font-size:14px;line-height:1.6;white-space:pre-wrap;color:#0f172a">${safeSummary}</div>
</td></tr></table>
<p style="margin:16px 0 0;font-size:11px;color:#9ca3af">TuringCare · humane, reward-based dog training support</p>
</td></tr></table></body></html>`;

  const textParts = [
    `Behavior Brief: ${args.dogName}`,
    `Shared by ${args.ownerName}`,
    "",
  ];
  if (args.message) {
    textParts.push(args.message, "", "---", "");
  }
  textParts.push(args.summary, "", "--", "TuringCare · humane, reward-based dog training support");

  return {
    subject: `Behavior Brief: ${args.dogName}`,
    html,
    text: textParts.join("\n"),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @turingcare/api test brief-email
```
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/api/src/email/brief-email.ts apps/api/src/email/brief-email.test.ts
git -c commit.gpgsign=false commit -m "feat(api): brief-email template (HTML + text, optional note blockquote)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B5: API endpoint — POST `/api/dogs/:id/brief/send`

**Files:**
- Modify: `apps/api/src/routes/dogs.ts`
- Modify: `apps/api/src/routes/dogs.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/routes/dogs.test.ts` (at the bottom of file, a new top-level describe block):

```ts
describe("dogs: brief send", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  async function makeDog(u: TestUser) {
    const r = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    return ((await r.json()) as { dog: { id: string } }).dog;
  }
  async function makeFinalizedBrief(u: TestUser, dogId: string) {
    await app.request(`/api/dogs/${dogId}/brief`, {
      method: "POST",
      headers: u.authHeaders,
    });
    const fin = await app.request(`/api/dogs/${dogId}/brief`, {
      method: "PUT",
      headers: u.authHeaders,
    });
    return ((await fin.json()) as { brief: { id: string; status: string } }).brief;
  }

  it("POST send: happy path on a finalized brief", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    await makeFinalizedBrief(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ recipient: "sarah@example.com", message: "Hi Sarah" }),
    });
    expect(r.status).toBe(201);
    const { send } = (await r.json()) as {
      send: { recipient: string; message: string | null };
    };
    expect(send.recipient).toBe("sarah@example.com");
    expect(send.message).toBe("Hi Sarah");
  });

  it("POST send: returns 409 when brief is draft", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    await app.request(`/api/dogs/${dog.id}/brief`, {
      method: "POST",
      headers: u.authHeaders,
    });
    // do NOT finalize
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ recipient: "sarah@example.com" }),
    });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "not_finalized" });
  });

  it("POST send: returns 404 when no brief exists", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ recipient: "sarah@example.com" }),
    });
    expect(r.status).toBe(404);
  });

  it("POST send: returns 400 on invalid recipient", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    await makeFinalizedBrief(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ recipient: "not-an-email" }),
    });
    expect(r.status).toBe(400);
  });

  it("POST send: returns 400 when message > 500 chars", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    await makeFinalizedBrief(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        recipient: "sarah@example.com",
        message: "x".repeat(501),
      }),
    });
    expect(r.status).toBe(400);
  });

  it("POST send: owner-isolation — user B → 404", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    await makeFinalizedBrief(a, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: b.authHeaders,
      body: JSON.stringify({ recipient: "sarah@example.com" }),
    });
    expect(r.status).toBe(404);
  });

  it("POST send: returns 502 when sendEmail throws", async () => {
    // Override the sendEmail module to throw for this single test.
    // Approach: use vi.doMock to swap the implementation before importing
    // the route module fresh. If this proves brittle, an alternative is to
    // run the test in a separate suite that imports a test build of the
    // route with a deps-injected sendEmail. Choose whichever the existing
    // codebase patterns support most cleanly. The branch under test:
    //   try { await sendEmail(...) } catch (err) { return c.json({error:"send_failed"}, 502); }
    // is small enough that an integration test isn't strictly required to
    // ship — if vi.doMock proves too invasive, leave a follow-up TODO and
    // move on, with the unit test for the catch branch via a smaller
    // helper if extracted. (Don't block the PR on this case.)
  });
});
```

Note the special handling of the 502 test. If `vi.doMock` works cleanly in this codebase's vitest config, write the test; otherwise leave a comment-only placeholder and add a TODO in PROJECT-LOG to revisit. The 502 branch is one line of code; the integration coverage is nice-to-have.

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @turingcare/api test dogs.test
```
Expected: the 6 new tests (plus the 502 if implemented) FAIL because the endpoint doesn't exist (Hono returns 404 for unknown routes).

- [ ] **Step 3: Implement the endpoint**

In `apps/api/src/routes/dogs.ts`:

1. Update imports — add `briefSends`, `user`, and the new email helpers:

```ts
import { briefs, briefSends, dogs, journalEntries, ... , user } from "../db/schema";
import { renderBriefEmail } from "../email/brief-email";
import { sendEmail } from "../email/send-email";
import { briefSendSchema, ... } from "@turingcare/shared";
```

(Adjust to match what's already imported; only add what's missing.)

2. Add the handler to the chained `dogsApp`, between the existing `.put("/:id/brief", ...)` (which finalizes a brief) and any subsequent endpoint:

```ts
.post("/:id/brief/send", zValidator("json", briefSendSchema), async (c) => {
  const userId = c.get("userId");
  const dog = await findOwnedDog(userId, c.req.param("id"));
  if (!dog) return c.json({ error: "not_found" } as const, 404);

  const [brief] = await db
    .select()
    .from(briefs)
    .where(eq(briefs.dogId, dog.id))
    .orderBy(desc(briefs.version))
    .limit(1);
  if (!brief) return c.json({ error: "not_found" } as const, 404);
  if (brief.status !== "finalized") {
    return c.json({ error: "not_finalized" } as const, 409);
  }

  const [owner] = await db
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!owner) return c.json({ error: "not_found" } as const, 404);

  const body = c.req.valid("json");
  const email = renderBriefEmail({
    dogName: dog.name,
    ownerName: owner.name ?? owner.email,
    message: body.message ?? null,
    summary: brief.summary,
  });

  try {
    await sendEmail({
      to: body.recipient,
      replyTo: owner.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (err) {
    console.error("brief send failed", err);
    return c.json({ error: "send_failed" } as const, 502);
  }

  const [send] = await db
    .insert(briefSends)
    .values({
      briefId: brief.id,
      recipient: body.recipient,
      message: body.message ?? null,
      sentByUserId: userId,
    })
    .returning();

  return c.json({ send }, 201);
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @turingcare/api test dogs.test
```
Expected: all 6 new tests PASS (or all 7, including 502 if implemented); all pre-existing tests still PASS. Total api tests should now be roughly 86–87.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts
git -c commit.gpgsign=false commit -m "feat(api): POST /api/dogs/:id/brief/send (finalized-only, 502 on send failure)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B6: API endpoint — GET `/api/dogs/:id/brief/sends`

**Files:**
- Modify: `apps/api/src/routes/dogs.ts`
- Modify: `apps/api/src/routes/dogs.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the `describe("dogs: brief send", ...)` block in `dogs.test.ts`:

```ts
  it("GET sends: returns newest-first", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    await makeFinalizedBrief(u, dog.id);
    // Send twice
    await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ recipient: "first@example.com" }),
    });
    await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ recipient: "second@example.com" }),
    });
    const r = await app.request(`/api/dogs/${dog.id}/brief/sends`, {
      headers: u.authHeaders,
    });
    expect(r.status).toBe(200);
    const { sends } = (await r.json()) as { sends: Array<{ recipient: string }> };
    expect(sends).toHaveLength(2);
    const [first, second] = sends;
    if (!first || !second) throw new Error("expected two sends");
    expect(first.recipient).toBe("second@example.com");  // newest
    expect(second.recipient).toBe("first@example.com");
  });

  it("GET sends: owner-isolation — user B → 404", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    const r = await app.request(`/api/dogs/${dog.id}/brief/sends`, {
      headers: b.authHeaders,
    });
    expect(r.status).toBe(404);
  });

  it("GET sends: empty when no sends exist", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const r = await app.request(`/api/dogs/${dog.id}/brief/sends`, {
      headers: u.authHeaders,
    });
    expect(r.status).toBe(200);
    const { sends } = (await r.json()) as { sends: unknown[] };
    expect(sends).toEqual([]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @turingcare/api test dogs.test
```
Expected: the 3 new GET tests FAIL (endpoint doesn't exist).

- [ ] **Step 3: Implement the endpoint**

In `apps/api/src/routes/dogs.ts`, add to the chained `dogsApp` after the POST handler:

```ts
.get("/:id/brief/sends", async (c) => {
  const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
  if (!dog) return c.json({ error: "not_found" } as const, 404);

  const sends = await db
    .select({
      id: briefSends.id,
      briefId: briefSends.briefId,
      recipient: briefSends.recipient,
      message: briefSends.message,
      sentAt: briefSends.sentAt,
    })
    .from(briefSends)
    .innerJoin(briefs, eq(briefSends.briefId, briefs.id))
    .where(eq(briefs.dogId, dog.id))
    .orderBy(desc(briefSends.sentAt));

  return c.json({ sends });
})
```

Notes:
- `sentByUserId` deliberately NOT in the projection — it's audit-only.
- Uses `innerJoin(briefs)` to scope by `dog.id` (the table-level scope is `brief_id → briefs → dogs`).

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @turingcare/api test dogs.test
```
Expected: all 3 new GET tests PASS; all pre-existing tests still PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts
git -c commit.gpgsign=false commit -m "feat(api): GET /api/dogs/:id/brief/sends (newest-first audit list)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B7: i18n — 13 new `briefSend` keys (en + es)

**Files:**
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Add the section to `en.ts`**

In `apps/web/src/i18n/en.ts`, add a new top-level section after the existing `brief:` section (and before whatever follows it):

```ts
  briefSend: {
    title: "Send to a trainer",
    recipient: "Recipient email",
    recipientPh: "sarah@example.com",
    message: "Personal note",
    messageOptional: "optional",
    messagePh: "Hi Sarah, here's the brief I mentioned…",
    send: "Send",
    sending: "Sending…",
    needsFinalized: "Mark the brief finalized to send it.",
    sent: "Sent",
    sendFailed: "Couldn't send. Try again.",
    historyTitle: "Sent",
    historyEmpty: "No sends yet.",
  },
```

- [ ] **Step 2: Add the same section to `es.ts` with parity**

In `apps/web/src/i18n/es.ts`, at the corresponding location:

```ts
  briefSend: {
    title: "Enviar a un adiestrador",
    recipient: "Email del destinatario",
    recipientPh: "sarah@ejemplo.com",
    message: "Nota personal",
    messageOptional: "opcional",
    messagePh: "Hola, te comparto el resumen que mencioné…",
    send: "Enviar",
    sending: "Enviando…",
    needsFinalized: "Marca el resumen como definitivo para enviarlo.",
    sent: "Enviado",
    sendFailed: "No se pudo enviar. Inténtalo de nuevo.",
    historyTitle: "Enviados",
    historyEmpty: "Aún no hay envíos.",
  },
```

- [ ] **Step 3: Run the i18n parity gate**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm --filter @turingcare/web test -- i18n
```
Expected: tsc 0 errors (the `es satisfies Messages` compile-time check enforces structural parity); the i18n runtime test passes.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git -c commit.gpgsign=false commit -m "i18n: +13 briefSend keys (en+es)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B8: Web hooks — `useSendBrief`, `useBriefSends`

**Files:**
- Create: `apps/web/src/lib/brief-send.ts`

- [ ] **Step 1: Add the hooks**

Create `apps/web/src/lib/brief-send.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BriefSendInput } from "@turingcare/shared";
import { api } from "./api";

const b = api.api.dogs[":id"].brief;

export function useBriefSends(dogId: string) {
  return useQuery({
    queryKey: ["brief-sends", dogId],
    enabled: !!dogId,
    queryFn: async () => {
      const res = await b.sends.$get({ param: { id: dogId } });
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).sends;
    },
  });
}

export function useSendBrief(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: BriefSendInput) => {
      const res = await b.send.$post({ param: { id: dogId }, json: body });
      if (!res.ok) throw new Error(res.status === 409 ? "not_finalized" : "send_failed");
      return (await res.json()).send;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brief-sends", dogId] });
    },
  });
}
```

- [ ] **Step 2: Verify it typechecks**

```bash
pnpm --filter @turingcare/web exec tsc --noEmit
```
Expected: 0 errors. The hono client shapes `b.send.$post` and `b.sends.$get` are inferred from the new API endpoints shipped in B5 + B6.

If `b.send.$post` or `b.sends.$get` don't resolve, double-check that the API endpoints were added inside the chained `.post(...).get(...)` expression that defines `AppType` — they need to flow through inference. If still broken, run `pnpm --filter @turingcare/api build` to confirm the api builds cleanly first.

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add apps/web/src/lib/brief-send.ts
git -c commit.gpgsign=false commit -m "feat(web): useSendBrief + useBriefSends hooks" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B9: Web component — `<SendPanel>`

**Files:**
- Create: `apps/web/src/components/brief/send-panel.tsx`
- Create: `apps/web/src/components/brief/send-panel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/brief/send-panel.test.tsx`:

```tsx
import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SendPanel } from "./send-panel";

afterEach(() => vi.unstubAllGlobals());

function setup(briefStatus: "draft" | "finalized" | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <SendPanel dogId="d1" briefStatus={briefStatus} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(handler));
}

describe("SendPanel", () => {
  it("renders nothing when briefStatus is null", () => {
    const { container } = setup(null);
    expect(container.firstChild).toBeNull();
  });

  it("renders form + hint when briefStatus is draft", async () => {
    stubFetch(async () => new Response(JSON.stringify({ sends: [] }), { status: 200 }));
    setup("draft");
    expect(await screen.findByLabelText(/Recipient email/i)).toBeInTheDocument();
    expect(screen.getByText(/Mark the brief finalized/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Send$/i })).not.toBeInTheDocument();
  });

  it("renders Send button when briefStatus is finalized", async () => {
    stubFetch(async () => new Response(JSON.stringify({ sends: [] }), { status: 200 }));
    setup("finalized");
    expect(await screen.findByRole("button", { name: /^Send$/i })).toBeInTheDocument();
  });

  it("validates email format", async () => {
    stubFetch(async () => new Response(JSON.stringify({ sends: [] }), { status: 200 }));
    setup("finalized");
    fireEvent.change(screen.getByLabelText(/Recipient email/i), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));
    await waitFor(() => expect(screen.getByText(/valid email/i)).toBeInTheDocument());
  });

  it("submits a valid send and clears the form", async () => {
    const calls: Array<{ method?: string }> = [];
    stubFetch(async (url, init) => {
      calls.push({ method: init?.method });
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({
            send: {
              id: "s1",
              recipient: "sarah@example.com",
              message: null,
              sentAt: new Date().toISOString(),
            },
          }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({ sends: [] }), { status: 200 });
    });
    setup("finalized");
    const input = (await screen.findByLabelText(/Recipient email/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sarah@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("renders history list when sends exist", async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({
            sends: [
              {
                id: "s1",
                recipient: "sarah@example.com",
                message: null,
                sentAt: "2026-05-20T10:00:00Z",
              },
              {
                id: "s2",
                recipient: "mark@trainer.dog",
                message: null,
                sentAt: "2026-05-15T10:00:00Z",
              },
            ],
          }),
          { status: 200 },
        ),
    );
    setup("finalized");
    expect(await screen.findByText(/sarah@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/mark@trainer.dog/)).toBeInTheDocument();
  });

  it("renders empty state when no sends", async () => {
    stubFetch(async () => new Response(JSON.stringify({ sends: [] }), { status: 200 }));
    setup("finalized");
    expect(await screen.findByText(/No sends yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web test -- send-panel
```
Expected: all 7 tests FAIL (module doesn't exist).

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/brief/send-panel.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useBriefSends, useSendBrief } from "@/lib/brief-send";
import { zodResolver } from "@hookform/resolvers/zod";
import { type BriefSendInput, briefSendSchema } from "@turingcare/shared";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

const inputCls = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function SendPanel({
  dogId,
  briefStatus,
}: {
  dogId: string;
  briefStatus: "draft" | "finalized" | null;
}) {
  const { t, locale } = useI18n();
  const send = useSendBrief(dogId);
  const { data: sends } = useBriefSends(dogId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BriefSendInput>({
    resolver: zodResolver(briefSendSchema),
  });

  if (briefStatus === null) return null;

  const onSubmit = handleSubmit(async (v) => {
    try {
      await send.mutateAsync(v);
      toast.success(t("briefSend.sent"));
      reset();
    } catch {
      toast.error(t("briefSend.sendFailed"));
    }
  });

  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <section className="space-y-3 rounded border border-silver bg-white p-4">
      <h2 className="font-semibold text-slate">{t("briefSend.title")}</h2>

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="text-sm">{t("briefSend.recipient")}</span>
          <input
            type="email"
            className={inputCls}
            placeholder={t("briefSend.recipientPh")}
            {...register("recipient")}
          />
          {errors.recipient && (
            <span className="text-xs text-red-600">{errors.recipient.message}</span>
          )}
        </label>
        <label className="block">
          <span className="text-sm">
            {t("briefSend.message")}{" "}
            <span className="text-slate-soft">({t("briefSend.messageOptional")})</span>
          </span>
          <textarea
            rows={3}
            className={inputCls}
            placeholder={t("briefSend.messagePh")}
            {...register("message", { setValueAs: (v) => v || undefined })}
          />
          {errors.message && (
            <span className="text-xs text-red-600">{errors.message.message}</span>
          )}
        </label>

        {briefStatus === "finalized" ? (
          <Button type="submit" disabled={isSubmitting} className="bg-slate text-cream">
            {isSubmitting ? t("briefSend.sending") : t("briefSend.send")}
          </Button>
        ) : (
          <p className="text-sm text-slate-soft">ⓘ {t("briefSend.needsFinalized")}</p>
        )}
      </form>

      {sends && sends.length > 0 && (
        <div className="border-t border-silver pt-3">
          <h3 className="mb-2 text-sm font-medium text-slate">{t("briefSend.historyTitle")}</h3>
          <ul className="space-y-1">
            {sends.map((s) => (
              <li key={s.id} className="text-sm text-slate-soft">
                {s.recipient} — {fmt.format(new Date(String(s.sentAt)))}
              </li>
            ))}
          </ul>
        </div>
      )}
      {sends && sends.length === 0 && (
        <p className="border-t border-silver pt-3 text-sm text-slate-soft">
          {t("briefSend.historyEmpty")}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @turingcare/web test -- send-panel
```
Expected: all 7 SendPanel tests PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/src/components/brief/send-panel.tsx apps/web/src/components/brief/send-panel.test.tsx
git -c commit.gpgsign=false commit -m "feat(web): SendPanel component (finalized-gated form + history)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B10: Brief page wire-up

**Files:**
- Modify: `apps/web/src/routes/brief.tsx`

- [ ] **Step 1: Wire `<SendPanel>` into the Brief page**

In `apps/web/src/routes/brief.tsx`:

1. Add the import at the top:

```ts
import { SendPanel } from "@/components/brief/send-panel";
```

2. Find where the `<article>` rendering the brief content ends (the read-only brief panel — around line 103+ in the current file). Below the `</article>` closing tag, render the SendPanel:

```tsx
<SendPanel dogId={dogId} briefStatus={brief?.status ?? null} />
```

The `dogId` and `brief` variables are already in scope in the Brief component.

- [ ] **Step 2: Run gates**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web exec tsc --noEmit
pnpm --filter @turingcare/web test
```
Expected: tsc 0 errors; ALL web tests PASS (existing + new SendPanel + brief page test if it asserts on the brief content rendering).

If `brief.test.tsx` fails because the stubbed fetch path doesn't include `/brief/sends`, extend its stub to return `{ sends: [] }` for that path. This is the only acceptable edit to that test in this task.

- [ ] **Step 3: Build + lint gates**

```bash
pnpm --filter @turingcare/web build
pnpm lint
```
Expected: build succeeds; lint 0 errors.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add apps/web/src/routes/brief.tsx
# If you had to update brief.test.tsx:
git add apps/web/src/routes/brief.test.tsx
git -c commit.gpgsign=false commit -m "feat(web): render SendPanel on the Brief page" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B11: PROJECT-LOG + finish as PR

**Files:**
- Modify: `docs/PROJECT-LOG.md`

- [ ] **Step 1: Full-repo gate (sanity)**

```bash
set -a && . ./.env && set +a
pnpm -r exec tsc --noEmit          # 0
pnpm -r test                       # all workspaces green
pnpm -r build                      # all succeed
pnpm lint                          # 0
git status --porcelain             # clean except untracked .env
```

- [ ] **Step 2: Append `docs/PROJECT-LOG.md`** (bottom, match the file's heading style; prior entries byte-intact):

```markdown
## 2026-05-22 — Email a Behavior Brief to a trainer — SHIPPED
Closes the last broken link in the MVP test loop. Owner generates → marks
finalized → sends to any email address with an optional personal note. New
`brief_sends` audit table; new POST `/api/dogs/:id/brief/send` (409 if draft,
502 if Resend fails — no swallow, owner needs explicit feedback); new GET
`/api/dogs/:id/brief/sends` for the history list. Reply-To is the owner's
email so trainers reply directly to the owner. `sendEmail` extended with a
`replyTo` arg piped to Resend's `reply_to`; existing callers unchanged. New
`<SendPanel>` on the Brief page: form is finalized-gated, history list
underneath; hidden entirely when no brief exists. 13 new i18n keys with
en/es parity. Gates green: api 86+/86+, web 54+/54+, shared 23/23, tsc 0,
lint 0.
- Spec/plan: `specs/2026-05-22-email-a-brief-design.md`,
  `plans/2026-05-22-email-a-brief.md`
- Commits: this branch (see `git log`). Shipped as a PR from
  worktree-email-a-brief.
```

(Adjust test counts to the actual final numbers after running the full suite.)

- [ ] **Step 3: Commit (only docs/PROJECT-LOG.md)**

```bash
git branch --show-current
git add docs/PROJECT-LOG.md
git -c commit.gpgsign=false commit -m "docs: PROJECT-LOG entry for email-a-brief" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: superpowers:finishing-a-development-branch → push and open PR** (do NOT merge to main locally; worktree preserved for PR iteration).

---

## Self-Review

**Spec coverage:**
- Shared schema → B1 ✓
- DB table + migration → B2 ✓
- `sendEmail` replyTo extension → B3 ✓
- Brief email template → B4 ✓
- POST send endpoint (gating + 502 + owner-iso) → B5 ✓
- GET sends endpoint (newest-first + owner-iso) → B6 ✓
- i18n parity → B7 ✓
- Web hooks → B8 ✓
- SendPanel component (null/draft/finalized + history) → B9 ✓
- Brief page wire-up → B10 ✓
- PROJECT-LOG + PR → B11 ✓
- Out of scope items (trainer picker, multi-recipient, PDF attachment, public link, rate limit, etc.) → none touched. ✓

**Placeholder scan:**
- No "TBD"/"TODO"/"implement later".
- The single conditional in B5 ("if `vi.doMock` proves too invasive, leave a follow-up TODO") is a bounded escape hatch with explicit guidance; the 502 branch is one line so coverage is nice-to-have, not blocking.
- The conditional in B10 ("if `brief.test.tsx` fails because the stubbed fetch path doesn't include `/brief/sends`") is bounded with an exact remediation.

**Type consistency:**
- Shared field names: `recipient`, `message`. Used identically across B1, B5, B6, B8, B9.
- Hook signatures: `useSendBrief.mutateAsync(body: BriefSendInput)` and `useBriefSends().data → BriefSend[]` — match what SendPanel consumes.
- API field shapes: `{ send: BriefSend }` from POST, `{ sends: BriefSend[] }` from GET — match what hooks expect.
- The endpoint paths `b.send.$post` and `b.sends.$get` match the chained `.post(":id/brief/send").get(":id/brief/sends")` declarations in B5/B6.
- `brief.status` is `"draft"|"finalized"` — matches the SendPanel prop type.
- All i18n keys mentioned in SendPanel (B9) are declared in B7.
