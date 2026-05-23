# LLM-Powered Behavior Brief (Narrative Layer) — Design Spec

**Date:** 2026-05-22
**Status:** Approved (brainstorming)
**Topic:** Add an optional, AI-written prose ("narrative") version of the
Behavior Brief on top of the existing deterministic `composeBrief`. Builds on
the merged Brief, Brief PDF (#17), brief sharing (#21), and email-a-brief (#20).

---

## 1. Goal & scope

The Behavior Brief is currently a deterministic, template-composed text
(`apps/api/src/lib/brief.ts` → `composeBrief`). It reads like a structured
report. This feature adds an **optional, more readable prose version** generated
by an LLM, so the document an owner hands to a trainer reads naturally — without
sacrificing trust.

### Decisions locked during brainstorming
| Decision | Choice |
|---|---|
| LLM role | **Polish only** — rewrite the deterministic brief into prose; facts are fixed by `composeBrief`, the model only rewords. No invented facts, no new insight sections. |
| Trigger | **Opt-in + regenerable** — explicit "✨ Generate narrative" button; owner can re-roll. Not automatic. |
| Source of truth | The deterministic `composeBrief` summary stays canonical and is always the fallback. |
| Sync model | **Synchronous** request with a loading state (no async job queue this phase). |
| Model | Claude **Haiku 4.5** (`claude-haiku-4-5`) — fast/cheap, ample for rewriting. |
| Caching | Generated **once per brief version, stored on the row**; viewing never re-calls the model. |
| Editing | Regenerate only; **no manual hand-editing** this phase (YAGNI). |

**Out of scope (YAGNI):** insight/recommendation generation (interpreting the
data, not just rewording), full synthesis from raw rows, streaming output,
async/background job queue, auto-generate-on-every-brief, manual rich-text
editing of the narrative, multi-language *generation* (UI strings stay i18n;
the prose follows whatever language the brief content is in).

---

## 2. Architecture & data flow

The narrative is a **cached, additive layer** on each versioned `briefs` row.
`composeBrief` remains the source of truth and the universal fallback.

```
Owner clicks "✨ Generate narrative" on brief vN
  → POST /api/dogs/:id/brief/narrative      (owner + ownership scoped)
  → server loads brief vN, reads its existing `summary` (deterministic text)
  → polishBrief(summary)  →  llm/ wrapper  →  Anthropic (Haiku 4.5)
  → store { narrative, narrativeModel, narrativeGeneratedAt } on the SAME row vN
  → return the updated brief
Consumers render:  narrative ?? summary
  (brief page, public share page, PDF, email)
```

Because briefs are immutable versioned snapshots, the narrative is generated
once per version and cached. A regenerate overwrites vN's narrative fields. A
brand-new brief version starts with `narrative = null` (private/structured until
the owner opts in again). This also keeps existing share links stable: a link
shows the narrative that existed when it was shared, same as the summary today.

### Units & boundaries
- `apps/api/src/llm/anthropic.ts` — thin `AnthropicLike` seam over
  `@anthropic-ai/sdk` (one method we need), so the provider is swappable and
  injectable in tests. Mirrors `email/send-email.ts`'s `ResendLike` pattern.
- `apps/api/src/llm/polish-brief.ts` — owns the prompt assembly + the call;
  exposes `polishBrief(summary, deps?) → Promise<string>`. Pure-ish: given a
  summary and a client, returns prose or throws `LLMError`.
- `apps/api/src/routes/dogs.ts` — new `POST /:id/brief/narrative` route.
- `apps/web/src/routes/brief.tsx` — the Generate/Regenerate/Show-structured UI.
- Consumers already exist; they switch to `narrative ?? summary`.

---

## 3. Data model

Migration (additive, all nullable — no backfill needed) on the existing
`briefs` table:
- `narrative` (`text`) — the AI prose, or `null` (default; structured-only).
- `narrativeModel` (`text`) — model id used, e.g. `claude-haiku-4-5`
  (provenance/debugging).
- `narrativeGeneratedAt` (`timestamp with time zone`).

No new tables. Snapshot/versioning semantics are already handled by the
existing `briefs.version` rows.

---

## 4. API

### New env (`apps/api/src/env.ts`, mirroring `RESEND_API_KEY`)
- `ANTHROPIC_API_KEY` (`z.string().optional()`) — **unset locally/CI → the
  narrative feature is unavailable**. Unlike fire-and-forget email (which logs
  and skips), this route is user-triggered, so with no key it returns a clear
  `503 llm_not_configured` rather than silently succeeding. Set as a Fly secret
  in prod.
- `BRIEF_LLM_MODEL` (`z.string().default("claude-haiku-4-5")`).

### LLM wrapper (`apps/api/src/llm/`)
- `class LLMError extends Error` (dedicated, like `EmailSendError`).
- `interface AnthropicLike` — the minimal `messages.create`-shaped method we
  use, so tests inject a fake.
- `polishBrief(summary: string, deps?: { client?; apiKey?; model? }): Promise<string>`:
  - No key and no injected client → throw `LLMError` with `code:
    "not_configured"` (a discriminable field on the error). The route maps this
    code to `503`; all other `LLMError`s map to `502`.
  - With a key/client → call Anthropic with the system + user prompt
    (Section 6), return the text. Any provider/transport error → `LLMError`
    (default `code: "failed"`).
  - The `"apiKey" in deps` test-seam convention matches `send-email.ts`.

### Route — `POST /api/dogs/:id/brief/narrative`
Added to the owner-scoped `dogsApp` (session + dog ownership, like the other
`/:id/brief*` routes).
1. `findOwnedDog` → `404 not_found` if not owned.
2. Load the dog's latest brief (`orderBy version desc limit 1`) → `404 no_brief`
   if none.
3. `polishBrief(brief.summary)`:
   - success → `db.update(briefs).set({ narrative, narrativeModel,
     narrativeGeneratedAt: now }).where(id = brief.id)`; return the updated brief.
   - not-configured (no key) → `503 llm_not_configured` (clear, actionable;
     never pretend success).
   - `LLMError` (provider failure) → `502 llm_failed` (mirrors the email-send
     502 contract — explicit feedback, no silent swallow).
4. Re-calling regenerates (overwrites the narrative fields).

`GET /:id/brief` and the public `GET /api/share/brief/:token` whitelist gain
`narrative` (the public endpoint exposes `narrative` only — still no userId/dog
id/token/email/raw journal).

### Dependency
Add `@anthropic-ai/sdk` to `apps/api`.

---

## 5. Web

### Brief page (`apps/web/src/routes/brief.tsx`)
Below the structured brief, a narrative control driven by `brief.narrative`:
- `narrative == null` → **"✨ Generate narrative"** button + a one-line note:
  *"Generates a readable version using AI from your logged data."*
- generating → button shows a spinner / disabled (sync, ~3–6s).
- `narrative` present → render the prose; show **"↻ Regenerate"** and a
  **"Show structured"** toggle (so the owner can always see the underlying
  facts). Typed `hc<AppType>` mutation → invalidate `["brief", dogId]`.
- `503 llm_not_configured` / `502 llm_failed` → a friendly toast (sonner):
  *"Couldn't generate the readable version right now — the structured brief is
  still available."* The structured brief is never blocked.
- New i18n keys, **en + es parity**.

### Consumers prefer narrative, fall back to summary
- Public share page (`shared-brief.tsx`) and its PDF: render `narrative ??
  summary`.
- Brief PDF (`brief-download-button.tsx` / pdf document): `narrative ?? summary`.
- Email-a-brief body (`email/brief-email.ts`): `narrative ?? summary`.
No contract changes to those components beyond the fallback expression.

---

## 6. Prompt & safety

Input to the model is the **deterministic brief text** (`brief.summary`), not
raw DB rows — this bounds the facts the model can see.

- **System prompt** (low temperature): "You rewrite a structured dog Behavior
  Brief into warm, plain-language prose for a professional dog trainer. Use ONLY
  the facts in the provided brief — do not invent behaviors, numbers, breeds, or
  events. Do not give veterinary, medical, or diagnostic advice. Keep a
  positive-reinforcement, encouraging tone. Be concise (a few short
  paragraphs). Do not add headings the brief doesn't have."
- **User message**: the `summary` text.
- **Output**: capped length; plain text. Stored verbatim as `narrative`.

Rationale: polish-only + facts-in-the-prompt + explicit "invent nothing"
minimizes hallucination for a document a trainer acts on.

---

## 7. Error handling, cost & privacy

- **Never blocks brief creation/finalization** — narrative is a separate,
  optional call; `composeBrief`'s `summary` always exists first.
- **Fallback everywhere** — `narrative ?? summary` means a missing key, a
  provider outage, or a 502/503 simply shows the structured version.
- **Cost** — one Haiku call per Generate/Regenerate click; cached after, never
  re-called on view. Fractions of a cent per brief.
- **Privacy** — the deterministic summary (dog name + logged behaviors) is sent
  to Anthropic. Consistent with the project's privacy posture, this is
  **opt-in** (explicit button) with a **visible note** at the point of action,
  and documented here + in `docs/SECURITY-BACKLOG.md` notes. No data beyond
  what's already in the brief text leaves the system; no GPS/PII is added.

---

## 8. Testing

- **API**
  - `llm/polish-brief`: injected fake `AnthropicLike` → returns prose on
    success; no-key path → typed not-configured; client error → `LLMError`.
  - prompt assembly: a unit test asserts the system prompt forbids invented
    facts and the user message carries the summary.
  - route `POST /:id/brief/narrative`: `401` anon, `404 not_found` cross-owner,
    `404 no_brief`, `200` owner happy-path stores narrative + model + timestamp,
    `502` on `LLMError`, `503` when not configured. `GET …/brief` and public
    share whitelist include `narrative`.
- **Web**
  - `brief.tsx`: button → prose shown; Regenerate re-calls; Show-structured
    toggles; failure → toast and structured still visible (mocked `api`).
  - fallback: share page / PDF render `narrative` when present, `summary` when
    null.
- Full monorepo gate green (biome, tsc, api + web + shared tests, build).

---

## 9. Deliverable order

1. Migration — `briefs.narrative`, `narrativeModel`, `narrativeGeneratedAt`
   (additive, nullable). Add `@anthropic-ai/sdk` + env vars.
2. `llm/` wrapper: `AnthropicLike`, `LLMError`, `polishBrief` (+ unit tests,
   no-key + error paths).
3. `POST /:id/brief/narrative` route + `narrative` in `GET …/brief` and the
   public share whitelist (+ API tests).
4. Web Share/Generate control in `brief.tsx` (+ i18n en/es, + test).
5. `narrative ?? summary` fallback in share page, PDF, and email body (+ tests).
6. Full gate + PROJECT-LOG entry; ship as a PR off `main`.
