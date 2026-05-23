# TuringCare — Email a Behavior Brief to a Trainer

**Date:** 2026-05-22
**Status:** Approved (gating: finalized-only; UI: optional personal note above
the brief; sender: From=EMAIL_FROM, Reply-To=owner's email). Ready for plan.
**Scope:** Add a send-to-email path for the Behavior Brief. Owner generates →
marks finalized → sends to any email address with an optional personal note.
A new audit table records every send and is surfaced as a history list on the
Brief page. Strictly additive — no existing behavior changed.

## Goal

The Brief composer produces a deterministic text summary today. Owners can
generate, regenerate, mark finalized, print, copy to clipboard, and (after
PR #17) download a PDF. They cannot **send** the Brief to a trainer from
within the app — that's the last broken link in the MVP loop (sign up → log
ABC entries → generate Brief → **share with trainer**). This PR closes that
loop. Resend infra is already shipped (PR #7); this PR plumbs it to a new
endpoint, adds an audit table, a small UI panel on the Brief page, and an
email template.

The thesis-testing question this PR unblocks: *do trainers, on receiving a
real Brief from a real owner, find it useful enough to engage back?*

## Data model

One new table. No migration touches existing data.

```ts
// apps/api/src/db/schema.ts
export const briefSends = pgTable("brief_sends", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  briefId: uuid("brief_id")
    .notNull()
    .references(() => briefs.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(),       // email as typed (trimmed)
  message: text("message"),                     // owner's optional note
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  sentByUserId: text("sent_by_user_id").notNull(), // owner; audit clarity
});
// Note: confirm `sent_by_user_id` typing matches the existing user-FK
// convention used by `dogs.ownerId` (Better Auth user IDs are text in this
// codebase). If `dogs.ownerId` uses a different shape, mirror it.
```

Cascade-on-brief-delete keeps the audit trail consistent. No `updatedAt` (a
send is an immutable event). `sentByUserId` is stored even though it's
derivable via brief → dog → owner, because it shortcuts audit queries and
makes the row self-explanatory.

## Shared validation (`packages/shared/src/brief.ts`, NEW)

```ts
import { z } from "zod";

export const briefSendSchema = z.object({
  recipient: z.string().trim().email("Enter a valid email address"),
  message: z.string().trim().max(500, "Note is too long").nullable().optional(),
});
export type BriefSendInput = z.infer<typeof briefSendSchema>;
```

Export from `packages/shared/src/index.ts`. Co-located test file with the
usual accept/reject coverage.

## API

Two new endpoints on the existing chained `dogsApp` in
`apps/api/src/routes/dogs.ts`. All require auth + owner-scope via
`findOwnedDog`.

### POST `/api/dogs/:id/brief/send`

```
Body: briefSendSchema → { recipient, message? }
Behavior:
  1. findOwnedDog(userId, dogId) → 404 not_found if missing
  2. Load the latest brief for the dog (ORDER BY version DESC LIMIT 1)
     → 404 not_found if none exists
  3. If brief.status !== "finalized" → 409 { error: "not_finalized" }
  4. Load the owner's email and name from Better Auth's user table. The
     `userId` is in scope via `c.get("userId")`; query the user row by id and
     read `email` + `name`. Use the same import shape as other handlers that
     read user fields (e.g. profile route). If the row is missing — which
     shouldn't happen post-auth — fall through to 500/404.
  5. Render the email via renderBriefEmail({ dogName, ownerName, message, summary })
  6. Call sendEmail({ to: recipient, replyTo: ownerEmail, subject, html, text })
     - If sendEmail throws (EmailSendError) → 502 { error: "send_failed" }
       (do NOT swallow — owner needs feedback; matches the spec's "explicit
       click needs explicit result" design)
     - On success, proceed
  7. Insert into brief_sends with sentByUserId=ownerId
  8. Return 201 { send }
```

The 502 branch deliberately departs from the swallow-on-error pattern used
by Better Auth's reset/verification hooks. Those are background flows where
the user can retry by re-requesting. Here the user explicitly clicked Send
and is staring at the UI — silence would be worse than an error toast.

### GET `/api/dogs/:id/brief/sends`

```
Returns { sends: BriefSend[] } scoped to this dog's briefs, newest-first.
Used by the history list. No pagination for MVP (sends are low-frequency).
```

Implementation: `db.select().from(briefSends).innerJoin(briefs, eq(briefSends.briefId, briefs.id)).where(eq(briefs.dogId, dog.id)).orderBy(desc(briefSends.sentAt))`.

### `sendEmail` extension (`apps/api/src/email/send-email.ts`)

The existing `SendEmailArgs` doesn't carry a Reply-To. Add it:

```ts
export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;   // ← new, optional
}

export interface ResendLike {
  emails: {
    send(args: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
      reply_to?: string;   // ← Resend's wire field is snake_case
    }): Promise<{ data: unknown; error: unknown }>;
  };
}
```

In `sendEmail`'s call site, pass `reply_to: args.replyTo` when present.
Existing call sites (verification, password reset) don't pass `replyTo` —
they retain the same behavior (no Reply-To header, replies go to the From
address).

Add one log-mode test that asserts the `replyTo` value is correctly passed
to a stub client when supplied.

## Email template (`apps/api/src/email/brief-email.ts`, NEW)

Pure function. Co-located with `templates.ts` but separate because the brief
layout doesn't fit the existing CTA-button shape.

```ts
export interface BriefEmailInputs {
  dogName: string;
  ownerName: string;
  message: string | null;   // owner's personal note
  summary: string;          // brief.summary, plain text
}

export function renderBriefEmail(args: BriefEmailInputs): EmailBody;
```

- **Subject:** `Behavior Brief: ${dogName}`.
- **HTML:** inline-styled layout matching the brand palette of the existing
  `templates.ts` (cream background, white card, slate body text). Structure:
  - H1 `Behavior Brief: <dogName>` + small subline "Shared by <ownerName>"
  - Optional `<blockquote>` for `message` (only rendered when truthy)
  - `<pre>` block (or `<div>` with `white-space: pre-wrap`) containing
    `summary` — preserves the deterministic line breaks from `composeBrief`
  - Footer: "TuringCare · humane, reward-based dog training support"
- **Text:** plain text equivalent, paste-friendly. Format:
  ```
  Behavior Brief: <dogName>
  Shared by <ownerName>

  <message, if present, indented or quoted>

  ---

  <summary, verbatim>

  --
  TuringCare · humane, reward-based dog training support
  ```

When `message` is null/empty, the blockquote (HTML) and indented block
(text) are omitted entirely — no empty visual residue.

## Web UI — `<SendPanel>` on the Brief page

New component at `apps/web/src/components/brief/send-panel.tsx`. Rendered
below the brief content area on the Brief page.

```
┌─ Send to a trainer ─────────────────────────────────┐
│ Recipient email                                      │
│ ┌────────────────────────────────────────────────┐  │
│ │ sarah@example.com                               │  │
│ └────────────────────────────────────────────────┘  │
│                                                      │
│ Personal note  (optional)                            │
│ ┌────────────────────────────────────────────────┐  │
│ │ Hi Sarah, here's the brief I mentioned…         │  │
│ │                                                 │  │
│ └────────────────────────────────────────────────┘  │
│                                                      │
│ [Send]   ← visible only when status === "finalized"  │
│ ⓘ Mark the brief finalized to send it.               │
│         ← visible when status !== "finalized"        │
│                                                      │
│ ─── Sent ───                                         │
│ sarah@example.com — 2 days ago                       │
│ mark@trainer.dog  — 5 days ago                       │
└─────────────────────────────────────────────────────┘
```

### Behavior

- Props: `{ dogId: string, briefStatus: "draft" | "finalized" | null }`.
- When `briefStatus === null` (no brief generated yet): hide the entire
  `<SendPanel>`. The Brief page already shows a "Generate a brief" prompt
  in this state; there's nothing to send.
- When `briefStatus === "draft"`: form inputs are still visible (owner
  can pre-fill while reviewing) but the Send button is replaced by the
  i18n hint `briefSend.needsFinalized`. The 409 server check is defense
  in depth.
- When `briefStatus === "finalized"`: form is fully active.
- When `briefStatus === "finalized"`: Send is active. `useSendBrief.mutateAsync`
  → on success: toast `briefSend.sent` + clear the form + invalidate
  `["brief-sends", dogId]`. On failure (502): toast `briefSend.sendFailed`,
  preserve the form inputs.
- History list is rendered via `useBriefSends(dogId)`. Empty state: "No
  sends yet." (i18n key `briefSend.historyEmpty`). Each row renders the
  recipient and a locale-aware date via
  `new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)`.
  The hook can read locale from `useI18n()`.

### Hooks (`apps/web/src/lib/brief-send.ts`, NEW)

```ts
useSendBrief(dogId)    // POST /api/dogs/:id/brief/send → returns { send }
useBriefSends(dogId)   // GET  /api/dogs/:id/brief/sends → returns BriefSend[]
```

Both invalidate `["brief-sends", dogId]` on mutation success. The send
mutation also invalidates `["overview"]` so the dashboard can pick up "you
sent a brief recently" (future enhancement; today the dashboard ignores
this key, which is fine).

### Files

```
apps/api/src/db/schema.ts                              MODIFY  +briefSends table
apps/api/src/db/migrations/<n>_brief_sends.sql         NEW
apps/api/src/email/send-email.ts                       MODIFY  +replyTo
apps/api/src/email/send-email.test.ts                  MODIFY  +replyTo test
apps/api/src/email/brief-email.ts                      NEW
apps/api/src/email/brief-email.test.ts                 NEW
apps/api/src/routes/dogs.ts                            MODIFY  +send +sends endpoints
apps/api/src/routes/dogs.test.ts                       MODIFY  +tests for both
packages/shared/src/brief.ts                           NEW
packages/shared/src/brief.test.ts                      NEW
packages/shared/src/index.ts                           MODIFY  export brief.ts
apps/web/src/lib/brief-send.ts                         NEW
apps/web/src/components/brief/send-panel.tsx           NEW
apps/web/src/components/brief/send-panel.test.tsx      NEW
apps/web/src/routes/brief.tsx                          MODIFY  render <SendPanel>
apps/web/src/i18n/en.ts                                MODIFY  +briefSend section
apps/web/src/i18n/es.ts                                MODIFY  +briefSend section
docs/PROJECT-LOG.md                                    MODIFY  shipped entry
```

## i18n (~12 keys, en + es with parity)

### English

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
}
```

### Spanish

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
}
```

Parity enforced by `es satisfies Messages` at compile time.

## Testing / verification

### Shared (`packages/shared/src/brief.test.ts`)
- briefSendSchema accepts valid {recipient, optional message}
- rejects invalid email (e.g. "not-an-email", "")
- rejects message > 500 chars
- accepts message null / undefined / empty after trim

### API (`apps/api/src/routes/dogs.test.ts`, extend with `describe("dogs: brief send")`)
- POST send: happy path on a **finalized** brief — 201 + brief_sends row
  created + stubbed sendEmail invoked with the right `to` and `replyTo`
- POST send: status is "draft" → 409 `{ error: "not_finalized" }` + no
  brief_sends row + sendEmail NOT called
- POST send: no brief exists for the dog → 404 `{ error: "not_found" }`
- POST send: invalid recipient email → 400 (zod)
- POST send: message > 500 chars → 400 (zod)
- POST send: owner-isolation — user B → 404 on user A's dog
- POST send: when stubbed sendEmail throws EmailSendError → 502
  `{ error: "send_failed" }` + no brief_sends row created
- GET sends: returns newest-first, scoped to this dog only (verify a sibling
  dog's sends don't appear)
- GET sends: owner-isolation — user B → 404
- GET sends: empty dog → 200 `{ sends: [] }`

### Email layer (`apps/api/src/email/brief-email.test.ts`, NEW)
- renderBriefEmail produces subject `Behavior Brief: <dogName>`
- HTML contains owner name + summary
- HTML omits blockquote when message is null
- text fallback includes summary verbatim and omits the message block when
  null
- HTML doesn't include unsafe injection vectors (basic escape check on
  message + summary — both are owner-authored but defense in depth)

### `sendEmail` (`apps/api/src/email/send-email.test.ts`, extend)
- When `replyTo` is supplied, the stub Resend client receives `reply_to`
- When `replyTo` is omitted, no `reply_to` field is sent (existing
  callers preserve behavior)

### Web (`apps/web/src/components/brief/send-panel.test.tsx`, NEW)
- briefStatus="draft": Send button not rendered; needsFinalized hint
  visible; recipient + message inputs still rendered (pre-fill OK)
- briefStatus="finalized": Send button rendered
- Submitting with valid email POSTs and clears the form
- Successful send → toast "Sent" + history list refetches and shows the new
  row
- 502 from API → toast "Couldn't send" + form inputs preserved
- 400 from API (server-side zod) → form shows field-level error message
- History list: renders newest-first
- History list: empty state shows "No sends yet."

### Gates
- `pnpm -r exec tsc --noEmit` → 0
- `pnpm -r test` → all green (existing + new)
- `pnpm -r build` → succeeds
- `pnpm lint` → 0 (biome 141+ files)

## Out of scope

- **Trainer-directory picker** — free-text email input only for MVP. The
  existing trainers directory has emails; a future enhancement could
  surface those as autocomplete.
- **Multi-recipient send** — single `recipient` per POST. Owners send
  twice if they want CC.
- **Public shareable link** — separate slice. Email body inlines the brief.
- **PDF attachment** — PR #17 makes the brief downloadable as PDF; a
  future enhancement could attach it. For now, email body is HTML inline.
- **Read receipts / open tracking** — privacy-loaded; out of MVP.
- **Editing a sent brief** — sends are immutable. Owner generates a new
  Brief version and re-sends if needed.
- **Custom subject line** — fixed at `Behavior Brief: <dogName>`.
- **Rate limiting** — no per-user limit in this PR. If abuse appears,
  follow-up adds a custom rule (e.g. 20 sends/hour/user) to the existing
  middleware. Not blocking for one-user beta.
- **Auto-purge of brief_sends** — audit grows monotonically. Not a problem
  at MVP scale.
- **Server-side rendering with the dog name in subject for i18n** — the
  subject is currently English-only. Could be localized via the owner's
  saved locale preference in a follow-up; trainers receiving from a
  Spanish-speaking owner would see `Resumen de conducta: <dogName>`.

## Flagged decisions (reasonable; reviewable)

- **Finalized-only gating** (locked). 409 on the server is defense in
  depth — the UI also hides the Send button when status≠finalized, but
  any direct POST is blocked.
- **No swallow on send failure** — explicit user click → explicit feedback.
  Departs from the existing email pattern, which is right for background
  flows but wrong here.
- **Reply-To = owner's email** — trainer replies go directly to the
  owner, not to TuringCare. The owner's email is exposed to the trainer;
  this is intended and matches the "personal connection" thesis of the
  product.
- **`message ≤ 500 chars`** — arbitrary; tunable. Keeps email bodies
  sensible without being restrictive.
- **`sentByUserId` is stored redundantly** — derivable from brief → dog
  → owner, but storing it makes audit queries trivial and the row
  self-explanatory.
- **No throttle on form submit** — clicking Send rapidly multiple times
  could double-send. The mutation hook's `isPending` disables the button
  during in-flight requests, which is sufficient for a single-tab user.
  A distributed lock isn't worth it for MVP.
- **`brief_sends` cascades on brief delete** — if a brief is removed, its
  send records go with it. Alternative: keep sends with `briefId` set to
  null. Cascade is simpler; orphan audit records aren't useful.
- **`recipient` stored as typed** — no canonicalization beyond `.trim()`.
  Owners typing "sarah+briefs@example.com" or "Sarah <sarah@example.com>"
  (latter rejected by zod's `.email()`) get exactly what they typed in the
  history.
- **One subject per locale defaulting to English** — covered in Out of
  scope. Acceptable for MVP.
