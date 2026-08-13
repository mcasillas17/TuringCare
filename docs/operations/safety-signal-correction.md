# Correcting a safety-signal selection mistake

Use this procedure only when support has confirmed that an owner selected a
safety signal by mistake. It must never be used to decide that a real safety
event is resolved.

Before making a change, collect the support ticket ID, dog ID, signal ID, a
second operator's approval, and a database backup. Confirm that the ticket
identifies exactly one signal and that both operators agree the owner made a
selection mistake.

Run this with `psql`, replacing only the two UUID placeholders:

```bash
psql "$DATABASE_URL" \
  --set=ON_ERROR_STOP=1 \
  --set=signal_id='approved-signal-uuid' \
  --set=dog_id='approved-dog-uuid'
```

Then paste the following transaction. The `\gset`/`\if` guard aborts with a
non-zero exit if the exact two-key lookup does not lock one row:

```sql
BEGIN;
SELECT "id", "dog_id", "type", "source", "reported_at"
FROM "dog_safety_signals"
WHERE "id" = :'signal_id'::uuid AND "dog_id" = :'dog_id'::uuid
FOR UPDATE
\gset correction_

\if :{?correction_id}
\echo Locked signal :correction_id for dog :correction_dog_id
\else
ROLLBACK;
\echo No exact signal/dog match; nothing was changed.
\quit 1
\endif

DELETE FROM "dog_safety_signals"
WHERE "id" = :'signal_id'::uuid AND "dog_id" = :'dog_id'::uuid
RETURNING "id", "dog_id", "type", "source", "reported_at";
COMMIT;
```

Abort the transaction if the selected row does not exactly match the ticket.
Attach the returned row to the internal ticket. Then make a new suggestion
request for the dog and confirm that it still evaluates every remaining safety
signal.
