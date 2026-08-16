import { zValidator } from "@hono/zod-validator";
import {
  type GuidedSetupCompletionReason,
  type GuidedSetupRecord,
  type GuidedSetupStatus,
  guidedSetupIntentInputSchema,
  guidedSetupStartSchema,
} from "@turingcare/shared";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { dogs, guidedSetups } from "../db/schema";
import { createDog } from "../lib/dog-writes";
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

async function loadLatestSetup(
  tx: TransactionType,
  userId: string,
): Promise<SetupDogJoinRow | null> {
  const [row] = await selectSetupRows(tx, userId);
  if (!row) return null;
  if (row.setup.completedAt === null && (row.setup.dogId === null || row.dogName === null)) {
    throw new Error("active guided setup has no dog");
  }
  return row;
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

async function completeSetup(
  tx: TransactionType,
  active: ActiveSetupWithDogRow,
  completionReason: "skipped" | "abandoned",
) {
  const completedAt = new Date();
  const [setup] = await tx
    .update(guidedSetups)
    .set({
      completedAt,
      completionReason,
      firstActionType: null,
      firstActionId: null,
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
    const intent = c.req.valid("json").intent;
    const result = await db.transaction(async (tx) => {
      await lockSetupFlow(tx, userId);

      const active = await loadActiveSetup(tx, userId);
      if (!active) {
        const latest = await loadLatestSetup(tx, userId);
        if (latest && latest.setup.completedAt !== null) {
          return { kind: "already_completed" } as const;
        }
        return { kind: "not_active" } as const;
      }

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

    if (result.kind === "not_active") {
      return c.json({ error: "setup_not_active" } as const, 409);
    }
    if (result.kind === "already_completed") {
      return c.json({ error: "setup_already_completed" } as const, 409);
    }

    await recordEvent("guided_setup.intent_selected", {
      userId,
      props: { intent, step: "action" },
    });
    return c.json({ setup: result.setup });
  })
  .post("/skip", async (c) => {
    const userId = c.get("userId");
    const result = await db.transaction(async (tx) => {
      await lockSetupFlow(tx, userId);

      const active = await loadActiveSetup(tx, userId);
      if (!active) {
        const latest = await loadLatestSetup(tx, userId);
        if (!latest || latest.setup.completedAt === null) return { kind: "not_active" } as const;
        return resolveCompletedSetupReplay(latest, "skipped");
      }
      if (active.setup.currentStep !== "action" || active.setup.intent === null) {
        return { kind: "not_ready" } as const;
      }

      return {
        kind: "completed",
        intent: active.setup.intent,
        setup: await completeSetup(tx, active, "skipped"),
      } as const;
    });

    if (result.kind === "not_active") {
      return c.json({ error: "setup_not_active" } as const, 409);
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
  .post("/abandon", async (c) => {
    const userId = c.get("userId");
    const result = await db.transaction(async (tx) => {
      await lockSetupFlow(tx, userId);

      const active = await loadActiveSetup(tx, userId);
      if (!active) {
        const latest = await loadLatestSetup(tx, userId);
        if (!latest || latest.setup.completedAt === null) return { kind: "not_active" } as const;
        return resolveCompletedSetupReplay(latest, "abandoned");
      }

      return {
        kind: "completed",
        setup: await completeSetup(tx, active, "abandoned"),
      } as const;
    });

    if (result.kind === "not_active") {
      return c.json({ error: "setup_not_active" } as const, 409);
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
  });
