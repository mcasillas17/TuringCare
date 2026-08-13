# Correcting a safety-signal selection mistake

Use this procedure only when support has confirmed that an owner selected a
safety signal by mistake. It must never be used to decide that a real safety
event is resolved.

Before making a change, collect the support ticket ID, dog ID, signal ID, a
second operator's approval, and a database backup. Confirm that the ticket
identifies exactly one signal and that both operators agree the owner made a
selection mistake.

Run the following transaction with the approved signal and dog IDs:

```sql
BEGIN;
SELECT "id", "dog_id", "type", "source", "reported_at"
FROM "dog_safety_signals"
WHERE "id" = :'signal_id'::uuid AND "dog_id" = :'dog_id'::uuid
FOR UPDATE;

DELETE FROM "dog_safety_signals"
WHERE "id" = :'signal_id'::uuid AND "dog_id" = :'dog_id'::uuid
RETURNING "id", "dog_id", "type", "source", "reported_at";
COMMIT;
```

Abort the transaction if the selected row does not exactly match the ticket.
Attach the returned row to the internal ticket. Then make a new suggestion
request for the dog and confirm that it still evaluates every remaining safety
signal.
