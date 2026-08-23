# Brief Share Privacy Hardening Design

**Date:** 2026-08-22
**Status:** Approved for implementation planning

## Summary

TuringCare will enforce one active public Behavior Brief link per dog. Generating a new
Brief revokes any existing public link, and the new Brief stays private until its owner
explicitly shares it.

Brief snapshots remain immutable. A public URL always identifies the exact Brief version
that was shared; it never silently moves to a newer version. Selecting a 7-, 30-, 90-day,
or all-time window does not generate or persist anything until the owner explicitly
chooses Generate or Regenerate.

The implementation keeps `shareToken` on `briefs`, adds a database invariant for one
active token per dog, and serializes Brief generation, sharing, and revocation with a
dog-scoped PostgreSQL advisory lock.

## Problem

The current share token belongs to an individual `briefs` row. Share and revoke operate
only on the newest Brief, while the public route accepts a token from any Brief row.
Consequently:

- an older Brief can remain public after a newer Brief is generated;
- revoking the newest Brief does not revoke a hidden token on an older version;
- concurrent generation, sharing, and revocation can leave an unintended token active;
- changing the time-window selector immediately creates another persisted Brief version;
- the share sheet can temporarily retain a locally cached token after the Brief changes.

The public response is already appropriately narrow: dog name, summary, status, version,
and generation date. This design preserves that whitelist and the indistinguishable 404
response for unknown and revoked tokens.

## Goals

- Enforce at most one active public Brief token per dog.
- Revoke all active tokens when a new Brief version is explicitly generated.
- Require an explicit share action for every newly generated Brief.
- Make revoke operate across every Brief version for the owned dog.
- Preserve immutable snapshot semantics for public links.
- Serialize conflicting Brief lifecycle operations so their result matches commit order.
- Prevent time-window browsing from creating Brief versions.
- Keep owner isolation and public-field minimization intact.
- Clean up pre-existing hidden tokens safely during migration.

## Non-goals

- Stable links that automatically follow the newest Brief.
- Multiple simultaneous links, recipient-specific links, expiry, or access analytics.
- A dedicated share table.
- Deleting historical Brief rows.
- Changing emailed or downloaded Brief behavior.
- Adding Supabase-specific APIs; Supabase continues to provide standard production
  PostgreSQL.

## Product Semantics

### Public-link lifecycle

1. A newly generated Brief is private.
2. Sharing mints a token for the latest Brief only.
3. Repeating Share for the same latest Brief is idempotent and returns the same token.
4. Generating another Brief revokes every active token for the dog before the new version
   commits.
5. The owner must explicitly share the new Brief to create another public link.
6. Stop Sharing revokes every token for the dog and is idempotent once a Brief exists.
7. Unknown, superseded, and revoked tokens all return the same `404`.

The URL remains bound to the shared snapshot. It does not update to newer data or reveal
that a newer Brief exists.

### Window selection

The 7-day, 30-day, 90-day, and all-time controls update local selection state only. They
do not call the API.

- With no Brief, the owner selects a window and presses **Generate brief**.
- With an existing Brief, the owner selects a window and presses **Regenerate brief**.
- The selected window remains visually active while the displayed Brief stays unchanged
  until generation succeeds.
- A generation failure leaves the existing Brief, share state, and selected window
  available for retry.

If the current Brief has an active token, Regenerate opens a localized confirmation that
states the existing public link will stop working. Cancel makes no request. Continue
performs generation; the API revokes the link even if a non-web client omits the warning.

## Data Model and Migration

`briefs.shareToken` remains nullable and globally unique. Convert the `briefs` declaration
to use a table callback and add a partial unique index:

```sql
CREATE UNIQUE INDEX briefs_one_active_share_per_dog_idx
ON briefs (dog_id)
WHERE share_token IS NOT NULL;
```

The existing global uniqueness on `share_token` remains. Together, the constraints mean:

- a token cannot identify more than one Brief;
- a dog cannot have more than one active token.

Before creating the partial index, the migration ranks every dog's Briefs by
`version DESC`, then `generated_at DESC`, then `id DESC`. It clears `share_token` from
every row except rank 1. If the latest row is private, all older tokens are cleared. If
the latest row is shared, its token is preserved and all older tokens are cleared.

The migration does not mint tokens, move tokens between versions, or delete Briefs. It is
privacy-biased: ambiguous or superseded sharing state becomes private.

No new database, service, or table is introduced.

## Concurrency and Transactions

Add a small Brief lifecycle helper that runs a callback inside a transaction after taking:

```sql
SELECT pg_advisory_xact_lock(hashtext('brief-lifecycle:' || dogId))
```

All code paths acquire locks in the same order:

1. resolve the dog through `findOwnedDog`;
2. begin a transaction;
3. acquire the dog-scoped Brief lifecycle lock;
4. read or mutate Brief rows;
5. commit;
6. record telemetry after the committed result is known.

The lock is transaction-scoped, so connection loss or rollback releases it automatically.
Different dogs remain independent.

### Generate transaction

The potentially expensive source-data reads and deterministic summary composition may
happen before the lifecycle lock. The authoritative latest-version read and all Brief
writes happen after acquiring it:

1. clear every non-null `shareToken` for the dog;
2. select the latest Brief version inside the transaction;
3. insert the new private draft at `latest.version + 1`;
4. commit and return the inserted Brief.

This ordering serializes concurrent generations and ensures that a Share committed before
Generate is revoked, while a Share that begins after Generate commits targets the new
version.

### Share transaction

1. select the latest Brief inside the locked transaction;
2. return `404 no_brief` if none exists;
3. if the latest Brief already has a token, return it unchanged;
4. otherwise clear all tokens for the dog defensively;
5. mint a cryptographically random token and assign it to the latest Brief;
6. commit and return the token and public URL.

The existing unique-token constraint protects against an extremely unlikely random-token
collision. A collision surfaces as a failed request rather than weakening privacy; it is
not converted into a success-shaped response.

### Revoke transaction

1. confirm at least one Brief exists for the owned dog;
2. clear every non-null token for that dog;
3. commit and return `{ ok: true }`.

The endpoint preserves the current `404` behavior when no Brief exists and otherwise
remains idempotent.

### Public lookup

The unauthenticated lookup remains a single token query and does not take the lifecycle
lock. PostgreSQL transaction visibility guarantees it sees either the pre-commit or
post-commit state, never a partial token update.

## API Behavior

Existing routes and response shapes remain:

| Route | Behavior |
| --- | --- |
| `GET /api/dogs/:id/brief` | Return the latest owned Brief, including its current `shareToken`. |
| `POST /api/dogs/:id/brief?window=…` | Explicitly generate a private version and revoke all existing links. |
| `POST /api/dogs/:id/brief/share` | Idempotently share only the latest owned Brief. |
| `DELETE /api/dogs/:id/brief/share` | Revoke all tokens for the owned dog. |
| `GET /api/share/brief/:token` | Return only the existing public whitelist or `404`. |

Authenticated routes continue returning `404`, not `403`, for a dog owned by another
user. Tokens and identity are generated or derived server-side; no client-supplied owner,
dog, or session identity is trusted.

## Web Behavior

### Brief page

- Window buttons only call `setWindowChoice`.
- Generate and Regenerate are the only controls that call `useGenerateBrief`.
- Regenerate requires confirmation only when `brief.shareToken` is non-null.
- Generation success writes the returned private Brief into the
  `["brief", dogId]` cache immediately, then invalidates the existing Brief, overview, and
  other affected aggregate keys according to current conventions.
- The new Brief renders with no active link.

### Share sheet and query cache

Remove the share sheet's independent `createdToken` as a source of durable truth. Mutation
success updates the `["brief", dogId]` cache synchronously:

- Share merges the returned token into the cached latest Brief before invalidation.
- Revoke sets the cached token to `null` before invalidation.
- Generate replaces the cached Brief with the returned private version before
  invalidation.

The sheet derives its visible URL from the Brief prop. This prevents a token returned for
one Brief version from surviving a version change or server-confirmed revocation.

All new warning, confirmation, cancel, and continue copy is added to both typed English
and Spanish catalogs.

## Telemetry

Keep telemetry server-side and emit it only after a successful commit:

- `brief.generated` retains the scalar `window` property.
- `brief.shared` is emitted after an idempotent existing-token return or a successful new
  token commit, matching current action semantics.
- Revocation remains untracked unless product analytics explicitly adds a separate event;
  privacy correctness does not depend on telemetry.

No token, public URL, summary, dog identifier, or recipient information is added to event
properties.

## Failure Handling

- A failed generation transaction rolls back both token revocation and Brief insertion,
  so the old link remains valid and the existing Brief remains current.
- A failed share transaction cannot leave an older token cleared without assigning the
  intended latest token.
- A failed revoke transaction leaves the prior state intact and reports failure to the
  owner.
- The web shows localized failure feedback and does not optimistically claim success.
- Database constraint violations and unexpected errors reach the existing API error
  handling; they are not swallowed or mapped to successful responses.
- Public responses never distinguish revoked, superseded, malformed, or unknown tokens.

## Test Strategy

### Migration and schema

- Seed multiple versions and tokens for one dog; migration preserves a token only when it
  is on the latest ranked Brief and clears all older tokens.
- Seed a private latest Brief with a shared older Brief; migration clears every token.
- Verify the partial unique index rejects two active tokens for the same dog.
- Verify different dogs can each hold an active token.

### API integration

- Generate a new version while an older token is active; the old public URL becomes 404
  and the new Brief is private.
- Revoke clears tokens from every historical version.
- Share targets only the latest Brief and remains idempotent.
- Cross-owner share, revoke, and generation retain 404 owner isolation.
- The public route returns exactly the whitelisted fields and never returns IDs, owner
  data, or tokens.
- Deterministic concurrent tests hold the advisory lock and prove commit-order behavior
  for Generate versus Share, Share versus Revoke, and two simultaneous Generates.
- A forced transaction failure proves generation rollback preserves the prior link.

### Web

- Clicking a window option makes no generation request.
- Explicit Generate/Regenerate sends the selected window exactly once.
- Regenerating a private Brief does not show a warning.
- Regenerating a shared Brief shows the warning; Cancel makes no request and Continue
  generates.
- Generation success immediately removes the old link from rendered share state.
- Share and revoke update the real QueryClient cache without retaining a component-local
  stale token.
- English and Spanish catalogs remain shape-compatible.

## Rollout

1. Apply the committed migration before deploying the API, matching the existing CI and
   production deployment order.
2. Deploy the API with transactional lifecycle enforcement.
3. Deploy the web UX that separates selection from generation and warns before revocation.

Because the migration clears superseded links before the stricter API runs, no hidden old
token survives the rollout window. Rollback of application code remains possible, but the
privacy-biased token cleanup is intentionally not reversed.
