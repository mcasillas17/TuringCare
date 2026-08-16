import { zValidator } from "@hono/zod-validator";
import {
  type GuidedSetupActionType,
  type GuidedSetupCompletionReason,
  type GuidedSetupRecord,
  type GuidedSetupStatus,
  guidedSetupBehaviorActionSchema,
  guidedSetupIntentInputSchema,
  guidedSetupMutationSchema,
  guidedSetupProgressActionSchema,
  guidedSetupStartSchema,
} from "@turingcare/shared";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { behaviorConcerns, dogs, guidedSetups, journalEntries } from "../db/schema";
import { createBehaviorConcern } from "../lib/behavior-concern-writes";
import { createDog } from "../lib/dog-writes";
import { createJournalEntry } from "../lib/journal-writes";
import type { TransactionType } from "../lib/safety-lock";
import { type Vars, requireUser } from "../middleware/require-user";
import { recordEvent } from "../telemetry/record-event";

type SetupRow = typeof guidedSetups.$inferSelect;
type SetupDogJoinRow = {
  setup: SetupRow;
  dogName: string | null;
};
type ActiveSetupWithDogRow = {
  setup: SetupRow & { dogId: string };
  dogName: string;
};
type GuidedBehaviorActionResponse =
  | {
      setup: GuidedSetupRecord;
      concern: typeof behaviorConcerns.$inferSelect;
      actionDeleted: false;
    }
  | {
      setup: GuidedSetupRecord;
      concern: null;
      actionDeleted: true;
    };
type GuidedProgressActionResponse =
  | {
      setup: GuidedSetupRecord;
      entry: typeof journalEntries.$inferSelect;
      actionDeleted: false;
    }
  | {
      setup: GuidedSetupRecord;
      entry: null;
      actionDeleted: true;
    };
type CompletedActionReplay<T> = { kind: "already_completed" } | { kind: "idempotent"; response: T };

function toSetupDto(row: SetupDogJoinRow): GuidedSetupRecord {
  if (row.setup.completedAt === null && (row.setup.dogId === null || row.dogName === null)) {
    throw new Error("active guided setup has no dog");
  }

  return {
    id: row.setup.id,
    dogId: row.setup.dogId,
    dogName: row.dogName,
    currentStep: row.setup.currentStep,
    intent: row.setup.intent,
    startedAt: row.setup.startedAt.toISOString(),
    completedAt: row.setup.completedAt?.toISOString() ?? null,
    completionReason: row.setup.completionReason,
    firstActionType: row.setup.firstActionType,
    firstActionId: row.setup.firstActionId,
  };
}

async function lockSetupFlow(tx: Pick<TransactionType, "execute">, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`guided-setup:${userId}`}))`);
}

async function selectSetupRows(
  executor: Pick<typeof db, "select">,
  userId: string,
  where = eq(guidedSetups.userId, userId),
) {
  return executor
    .select({ setup: guidedSetups, dogName: dogs.name })
    .from(guidedSetups)
    .leftJoin(dogs, eq(guidedSetups.dogId, dogs.id))
    .where(where)
    .orderBy(desc(guidedSetups.startedAt));
}

async function loadActiveSetup(
  tx: TransactionType,
  userId: string,
): Promise<ActiveSetupWithDogRow | null> {
  const [row] = await selectSetupRows(
    tx,
    userId,
    and(eq(guidedSetups.userId, userId), isNull(guidedSetups.completedAt)),
  );
  if (!row) return null;
  if (!row.setup.dogId || !row.dogName) throw new Error("active guided setup has no dog");
  return {
    setup: { ...row.setup, dogId: row.setup.dogId },
    dogName: row.dogName,
  };
}

async function loadOwnedSetup(
  tx: TransactionType,
  userId: string,
  setupId: string,
): Promise<SetupDogJoinRow | null> {
  const [row] = await selectSetupRows(
    tx,
    userId,
    and(eq(guidedSetups.id, setupId), eq(guidedSetups.userId, userId)),
  );
  return row ?? null;
}

function requireActiveSetupDog(row: SetupDogJoinRow): ActiveSetupWithDogRow {
  if (row.setup.completedAt !== null) {
    throw new Error("completed guided setup cannot be used as active");
  }
  if (!row.setup.dogId || !row.dogName) throw new Error("active guided setup has no dog");
  return {
    setup: { ...row.setup, dogId: row.setup.dogId },
    dogName: row.dogName,
  };
}

async function loadStatus(userId: string): Promise<GuidedSetupStatus> {
  const [rows, dogCountRows] = await Promise.all([
    selectSetupRows(db, userId),
    db.select({ value: count() }).from(dogs).where(eq(dogs.ownerId, userId)),
  ]);
  const active = rows.find(({ setup }) => setup.completedAt === null) ?? null;
  const dogCount = Number(dogCountRows[0]?.value ?? 0);

  return {
    active: active ? toSetupDto(active) : null,
    latest: rows[0] ? toSetupDto(rows[0]) : null,
    autoStartEligible: dogCount === 0 && rows.length === 0 && active === null,
  };
}

function resolveCompletedSetupReplay(setup: SetupDogJoinRow, reason: GuidedSetupCompletionReason) {
  if (setup.setup.completionReason === reason) {
    return { kind: "idempotent", setup: toSetupDto(setup) } as const;
  }
  return { kind: "already_completed" } as const;
}

async function resolveCompletedActionReplay(
  tx: TransactionType,
  row: SetupDogJoinRow,
  actionType: "behavior",
): Promise<CompletedActionReplay<GuidedBehaviorActionResponse>>;
async function resolveCompletedActionReplay(
  tx: TransactionType,
  row: SetupDogJoinRow,
  actionType: "progress",
): Promise<CompletedActionReplay<GuidedProgressActionResponse>>;
async function resolveCompletedActionReplay(
  tx: TransactionType,
  row: SetupDogJoinRow,
  actionType: "behavior" | "progress",
): Promise<CompletedActionReplay<GuidedBehaviorActionResponse | GuidedProgressActionResponse>> {
  const setup = toSetupDto(row);
  const actionId = row.setup.firstActionId;
  if (
    row.setup.completionReason !== "first_action_completed" ||
    row.setup.firstActionType !== actionType ||
    actionId === null
  ) {
    return { kind: "already_completed" } as const;
  }

  if (actionType === "behavior") {
    const [concern] = await tx
      .select()
      .from(behaviorConcerns)
      .where(eq(behaviorConcerns.id, actionId))
      .limit(1);
    if (!concern) {
      return {
        kind: "idempotent",
        response: {
          setup,
          concern: null,
          actionDeleted: true,
        } satisfies GuidedBehaviorActionResponse,
      } as const;
    }
    return {
      kind: "idempotent",
      response: { setup, concern, actionDeleted: false } satisfies GuidedBehaviorActionResponse,
    } as const;
  }

  const [entry] = await tx
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, actionId))
    .limit(1);
  if (!entry) {
    return {
      kind: "idempotent",
      response: { setup, entry: null, actionDeleted: true } satisfies GuidedProgressActionResponse,
    } as const;
  }
  return {
    kind: "idempotent",
    response: { setup, entry, actionDeleted: false } satisfies GuidedProgressActionResponse,
  } as const;
}

type SetupCompletion =
  | { reason: "skipped" | "abandoned" }
  | {
      reason: "first_action_completed";
      actionType: GuidedSetupActionType;
      actionId: string;
    };

async function completeSetup(
  tx: TransactionType,
  active: ActiveSetupWithDogRow,
  completion: SetupCompletion,
) {
  const completedAt = new Date();
  const [setup] = await tx
    .update(guidedSetups)
    .set({
      completedAt,
      completionReason: completion.reason,
      firstActionType:
        completion.reason === "first_action_completed" ? completion.actionType : null,
      firstActionId: completion.reason === "first_action_completed" ? completion.actionId : null,
      updatedAt: completedAt,
    })
    .where(eq(guidedSetups.id, active.setup.id))
    .returning();
  if (!setup) throw new Error("failed to complete guided setup");
  return toSetupDto({ setup, dogName: active.dogName });
}

export const guidedSetupApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/", async (c) => c.json(await loadStatus(c.get("userId"))))
  .post("/", zValidator("json", guidedSetupStartSchema), async (c) => {
    const userId = c.get("userId");
    const result = await db.transaction(async (tx) => {
      await lockSetupFlow(tx, userId);

      const active = await loadActiveSetup(tx, userId);
      if (active) return { kind: "active_setup_exists" } as const;

      const dog = await createDog(tx, userId, c.req.valid("json"));
      const [setup] = await tx
        .insert(guidedSetups)
        .values({
          userId,
          dogId: dog.id,
        })
        .returning();
      if (!setup) throw new Error("failed to create guided setup");

      return {
        kind: "created",
        setup: toSetupDto({ setup, dogName: dog.name }),
      } as const;
    });

    if (result.kind === "active_setup_exists") {
      return c.json({ error: "active_setup_exists" } as const, 409);
    }

    await recordEvent("dog.created", { userId });
    await recordEvent("guided_setup.started", { userId, props: { step: "intent" } });
    await recordEvent("guided_setup.dog_basics_completed", {
      userId,
      props: { step: "intent" },
    });
    return c.json({ setup: result.setup }, 201);
  })
  .put("/intent", zValidator("json", guidedSetupIntentInputSchema), async (c) => {
    const userId = c.get("userId");
    const { setupId, intent } = c.req.valid("json");
    const result = await db.transaction(async (tx) => {
      await lockSetupFlow(tx, userId);

      const row = await loadOwnedSetup(tx, userId, setupId);
      if (!row) return { kind: "not_found" } as const;
      if (row.setup.completedAt !== null) {
        return { kind: "already_completed" } as const;
      }
      if (row.setup.currentStep === "action" && row.setup.intent === intent) {
        return {
          kind: "unchanged",
          setup: toSetupDto(row),
        } as const;
      }
      const active = requireActiveSetupDog(row);

      const [setup] = await tx
        .update(guidedSetups)
        .set({
          currentStep: "action",
          intent,
          updatedAt: new Date(),
        })
        .where(eq(guidedSetups.id, active.setup.id))
        .returning();
      if (!setup) throw new Error("failed to update guided setup intent");

      return {
        kind: "updated",
        setup: toSetupDto({ setup, dogName: active.dogName }),
      } as const;
    });

    if (result.kind === "not_found") {
      return c.json({ error: "not_found" } as const, 404);
    }
    if (result.kind === "already_completed") {
      return c.json({ error: "setup_already_completed" } as const, 409);
    }
    if (result.kind === "unchanged") {
      return c.json({ setup: result.setup });
    }

    await recordEvent("guided_setup.intent_selected", {
      userId,
      props: { intent, step: "action" },
    });
    return c.json({ setup: result.setup });
  })
  .post("/skip", zValidator("json", guidedSetupMutationSchema), async (c) => {
    const userId = c.get("userId");
    const { setupId } = c.req.valid("json");
    const result = await db.transaction(async (tx) => {
      await lockSetupFlow(tx, userId);

      const row = await loadOwnedSetup(tx, userId, setupId);
      if (!row) return { kind: "not_found" } as const;
      if (row.setup.completedAt !== null) return resolveCompletedSetupReplay(row, "skipped");
      const active = requireActiveSetupDog(row);
      if (active.setup.currentStep !== "action" || active.setup.intent === null) {
        return { kind: "not_ready" } as const;
      }

      return {
        kind: "completed",
        intent: active.setup.intent,
        setup: await completeSetup(tx, active, { reason: "skipped" }),
      } as const;
    });

    if (result.kind === "not_found") {
      return c.json({ error: "not_found" } as const, 404);
    }
    if (result.kind === "already_completed") {
      return c.json({ error: "setup_already_completed" } as const, 409);
    }
    if (result.kind === "not_ready") {
      return c.json({ error: "setup_not_ready_for_completion" } as const, 409);
    }
    if (result.kind === "idempotent") {
      return c.json({ setup: result.setup });
    }

    await recordEvent("guided_setup.first_action_skipped", {
      userId,
      props: { intent: result.intent, step: "action" },
    });
    await recordEvent("guided_setup.completed", {
      userId,
      props: {
        intent: result.intent,
        step: "action",
        completionReason: "skipped",
      },
    });
    return c.json({ setup: result.setup });
  })
  .post("/abandon", zValidator("json", guidedSetupMutationSchema), async (c) => {
    const userId = c.get("userId");
    const { setupId } = c.req.valid("json");
    const result = await db.transaction(async (tx) => {
      await lockSetupFlow(tx, userId);

      const row = await loadOwnedSetup(tx, userId, setupId);
      if (!row) return { kind: "not_found" } as const;
      if (row.setup.completedAt !== null) {
        return resolveCompletedSetupReplay(row, "abandoned");
      }
      const active = requireActiveSetupDog(row);

      return {
        kind: "completed",
        setup: await completeSetup(tx, active, { reason: "abandoned" }),
      } as const;
    });

    if (result.kind === "not_found") {
      return c.json({ error: "not_found" } as const, 404);
    }
    if (result.kind === "already_completed") {
      return c.json({ error: "setup_already_completed" } as const, 409);
    }
    if (result.kind === "idempotent") {
      return c.json({ setup: result.setup });
    }

    const props: Record<string, string> = {
      step: result.setup.currentStep,
      completionReason: "abandoned",
    };
    if (result.setup.intent) props.intent = result.setup.intent;
    await recordEvent("guided_setup.completed", { userId, props });
    return c.json({ setup: result.setup });
  })
  .post("/action/behavior", zValidator("json", guidedSetupBehaviorActionSchema), async (c) => {
    const userId = c.get("userId");
    const input = c.req.valid("json");
    const result = await db.transaction(async (tx) => {
      await lockSetupFlow(tx, userId);

      const row = await loadOwnedSetup(tx, userId, input.setupId);
      if (!row) return { kind: "not_found" } as const;
      if (row.setup.completedAt !== null) {
        return resolveCompletedActionReplay(tx, row, "behavior");
      }

      const active = requireActiveSetupDog(row);
      if (active.setup.currentStep !== "action" || active.setup.intent !== "understand_behavior") {
        return { kind: "intent_mismatch" } as const;
      }

      const { setupId: _setupId, safetyConfirmed: _safetyConfirmed, ...concernInput } = input;
      const { concern, reportedSignals } = await createBehaviorConcern(
        tx,
        active.setup.dogId,
        concernInput,
      );
      const setup = await completeSetup(tx, active, {
        reason: "first_action_completed",
        actionType: "behavior",
        actionId: concern.id,
      });
      return {
        kind: "completed",
        setup,
        concern,
        reportedSignals,
      } as const;
    });

    if (result.kind === "not_found") {
      return c.json({ error: "not_found" } as const, 404);
    }
    if (result.kind === "intent_mismatch") {
      return c.json({ error: "intent_mismatch" } as const, 409);
    }
    if (result.kind === "already_completed") {
      return c.json({ error: "setup_already_completed" } as const, 409);
    }
    if (result.kind === "idempotent") {
      return c.json(result.response);
    }

    for (const signal of result.reportedSignals) {
      await recordEvent("safety.signal_reported", {
        userId,
        props: { signal, source: "behavior_concern" },
      });
    }
    await recordEvent("guided_setup.first_action_completed", {
      userId,
      props: {
        intent: "understand_behavior",
        actionType: "behavior",
      },
    });
    await recordEvent("guided_setup.completed", {
      userId,
      props: {
        intent: "understand_behavior",
        actionType: "behavior",
        completionReason: "first_action_completed",
      },
    });
    return c.json(
      {
        setup: result.setup,
        concern: result.concern,
        actionDeleted: false,
      } satisfies GuidedBehaviorActionResponse,
      201,
    );
  })
  .post("/action/progress", zValidator("json", guidedSetupProgressActionSchema), async (c) => {
    const userId = c.get("userId");
    const input = c.req.valid("json");
    const result = await db.transaction(async (tx) => {
      await lockSetupFlow(tx, userId);

      const row = await loadOwnedSetup(tx, userId, input.setupId);
      if (!row) return { kind: "not_found" } as const;
      if (row.setup.completedAt !== null) {
        return resolveCompletedActionReplay(tx, row, "progress");
      }

      const active = requireActiveSetupDog(row);
      if (active.setup.currentStep !== "action" || active.setup.intent !== "track_progress") {
        return { kind: "intent_mismatch" } as const;
      }

      const entry = await createJournalEntry(tx, active.setup.dogId, {
        kind: "daily_checkin",
        trend: input.trend,
        note: input.note,
      });
      const setup = await completeSetup(tx, active, {
        reason: "first_action_completed",
        actionType: "progress",
        actionId: entry.id,
      });
      return { kind: "completed", setup, entry } as const;
    });

    if (result.kind === "not_found") {
      return c.json({ error: "not_found" } as const, 404);
    }
    if (result.kind === "intent_mismatch") {
      return c.json({ error: "intent_mismatch" } as const, 409);
    }
    if (result.kind === "already_completed") {
      return c.json({ error: "setup_already_completed" } as const, 409);
    }
    if (result.kind === "idempotent") {
      return c.json(result.response);
    }

    await recordEvent("journal.entry_created", {
      userId,
      props: { kind: "daily_checkin" },
    });
    await recordEvent("guided_setup.first_action_completed", {
      userId,
      props: {
        intent: "track_progress",
        actionType: "progress",
      },
    });
    await recordEvent("guided_setup.completed", {
      userId,
      props: {
        intent: "track_progress",
        actionType: "progress",
        completionReason: "first_action_completed",
      },
    });
    return c.json(
      {
        setup: result.setup,
        entry: result.entry,
        actionDeleted: false,
      } satisfies GuidedProgressActionResponse,
      201,
    );
  });
