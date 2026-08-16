import type { GuidedSetupRecord, GuidedSetupStatus } from "@turingcare/shared";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

const behaviorConcernWriteControl = vi.hoisted(() => ({ fail: false }));

vi.mock("../lib/behavior-concern-writes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/behavior-concern-writes")>();
  return {
    ...actual,
    createBehaviorConcern: async (
      ...args: Parameters<typeof actual.createBehaviorConcern>
    ): ReturnType<typeof actual.createBehaviorConcern> => {
      const result = await actual.createBehaviorConcern(...args);
      if (behaviorConcernWriteControl.fail) {
        throw new Error("guided behavior writer failed");
      }
      return result;
    },
  };
});

import { app } from "../app";
import { db } from "../db";
import {
  events,
  behaviorConcerns,
  dogSafetySignals,
  dogs,
  guidedSetups,
  journalEntries,
  practiceSessions,
  trainingGoals,
  trainingSkills,
  weeklyFocus,
} from "../db/schema";
import { currentWeekKey } from "../lib/suggestion";
import { type TestUser, createTestUser } from "../test-helpers";

const validDog = {
  name: "Sensitive Biscuit",
  breed: "Corgi mix",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
  notes: "Whines when delivery trucks park outside.",
} as const;

type SetupBody = { setup: GuidedSetupRecord };

async function readStatus(user: TestUser): Promise<GuidedSetupStatus> {
  const res = await app.request("/api/guided-setup", { headers: user.authHeaders });
  expect(res.status).toBe(200);
  return (await res.json()) as GuidedSetupStatus;
}

async function startSetup(user: TestUser, body: unknown = validDog) {
  return app.request("/api/guided-setup", {
    method: "POST",
    headers: user.authHeaders,
    body: JSON.stringify(body),
  });
}

async function saveIntent(
  user: TestUser,
  setupId: string,
  intent: "understand_behavior" | "train_skill" | "track_progress",
) {
  return app.request("/api/guided-setup/intent", {
    method: "PUT",
    headers: user.authHeaders,
    body: JSON.stringify({ setupId, intent }),
  });
}

async function skipSetup(user: TestUser, setupId: string) {
  return app.request("/api/guided-setup/skip", {
    method: "POST",
    headers: user.authHeaders,
    body: JSON.stringify({ setupId }),
  });
}

async function abandonSetup(user: TestUser, setupId: string) {
  return app.request("/api/guided-setup/abandon", {
    method: "POST",
    headers: user.authHeaders,
    body: JSON.stringify({ setupId }),
  });
}

async function createBehaviorAction(
  user: TestUser,
  input: {
    setupId: string;
    concern: string;
    severity: "mild" | "moderate" | "severe";
    safetySignal?: "aggression_or_bite_risk" | "injury_or_pain" | "severe_fear_or_panic" | null;
    safetyConfirmed: boolean;
  },
) {
  return app.request("/api/guided-setup/action/behavior", {
    method: "POST",
    headers: user.authHeaders,
    body: JSON.stringify(input),
  });
}

async function createProgressAction(
  user: TestUser,
  input: { setupId: string; trend: "better" | "same" | "harder"; note: string },
) {
  return app.request("/api/guided-setup/action/progress", {
    method: "POST",
    headers: user.authHeaders,
    body: JSON.stringify(input),
  });
}

async function createDog(user: TestUser, body: unknown = validDog) {
  return app.request("/api/dogs", {
    method: "POST",
    headers: user.authHeaders,
    body: JSON.stringify(body),
  });
}

async function countOwnedDogs(userId: string) {
  const [row] = await db.select({ value: count() }).from(dogs).where(eq(dogs.ownerId, userId));
  return Number(row?.value ?? 0);
}

async function countOwnedSetups(userId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(guidedSetups)
    .where(eq(guidedSetups.userId, userId));
  return Number(row?.value ?? 0);
}

async function countActionRows(dogId: string) {
  const [concerns, journals, goals, skills, focusRows, practices] = await Promise.all([
    db.select({ value: count() }).from(behaviorConcerns).where(eq(behaviorConcerns.dogId, dogId)),
    db.select({ value: count() }).from(journalEntries).where(eq(journalEntries.dogId, dogId)),
    db.select({ value: count() }).from(trainingGoals).where(eq(trainingGoals.dogId, dogId)),
    db
      .select({ value: count() })
      .from(trainingSkills)
      .innerJoin(trainingGoals, eq(trainingSkills.goalId, trainingGoals.id))
      .where(eq(trainingGoals.dogId, dogId)),
    db.select({ value: count() }).from(weeklyFocus).where(eq(weeklyFocus.dogId, dogId)),
    db
      .select({ value: count() })
      .from(practiceSessions)
      .innerJoin(trainingSkills, eq(practiceSessions.skillId, trainingSkills.id))
      .innerJoin(trainingGoals, eq(trainingSkills.goalId, trainingGoals.id))
      .where(eq(trainingGoals.dogId, dogId)),
  ]);

  return {
    concerns: Number(concerns[0]?.value ?? 0),
    journals: Number(journals[0]?.value ?? 0),
    goals: Number(goals[0]?.value ?? 0),
    skills: Number(skills[0]?.value ?? 0),
    focus: Number(focusRows[0]?.value ?? 0),
    practices: Number(practices[0]?.value ?? 0),
  };
}

async function setupEvents(userId: string) {
  return db
    .select({ name: events.name, props: events.props })
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        inArray(events.name, [
          "dog.created",
          "guided_setup.started",
          "guided_setup.dog_basics_completed",
          "guided_setup.intent_selected",
          "guided_setup.first_action_skipped",
          "guided_setup.completed",
        ]),
      ),
    )
    .orderBy(asc(events.createdAt));
}

async function actionEvents(userId: string) {
  return db
    .select({ name: events.name, props: events.props })
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        inArray(events.name, [
          "journal.entry_created",
          "safety.signal_reported",
          "guided_setup.first_action_completed",
          "guided_setup.completed",
        ]),
      ),
    )
    .orderBy(asc(events.createdAt));
}

describe("guided setup lifecycle", () => {
  const users: TestUser[] = [];

  afterEach(async () => {
    behaviorConcernWriteControl.fail = false;
    for (let user = users.pop(); user; user = users.pop()) await user.cleanup();
  });

  it("returns fresh status only when the owner has no dogs and no setup history", async () => {
    const fresh = await createTestUser();
    const existingDogOwner = await createTestUser();
    users.push(fresh, existingDogOwner);

    expect(await readStatus(fresh)).toEqual({
      active: null,
      latest: null,
      autoStartEligible: true,
    });

    const created = await createDog(existingDogOwner);
    expect(created.status).toBe(201);

    expect(await readStatus(existingDogOwner)).toEqual({
      active: null,
      latest: null,
      autoStartEligible: false,
    });
  });

  it("starts atomically, resumes through status, and rejects duplicate active starts", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    expect(started.status).toBe(201);
    const { setup } = (await started.json()) as SetupBody;

    expect(setup).toEqual({
      id: expect.any(String),
      dogId: expect.any(String),
      dogName: validDog.name,
      currentStep: "intent",
      intent: null,
      startedAt: expect.any(String),
      completedAt: null,
      completionReason: null,
      firstActionType: null,
      firstActionId: null,
    });
    expect(await countOwnedDogs(user.userId)).toBe(1);
    expect(await countOwnedSetups(user.userId)).toBe(1);

    expect(await readStatus(user)).toEqual({
      active: setup,
      latest: setup,
      autoStartEligible: false,
    });

    const duplicate = await startSetup(user);
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "active_setup_exists" });
    expect(await countOwnedDogs(user.userId)).toBe(1);
    expect(await countOwnedSetups(user.userId)).toBe(1);
  });

  it("creates neither a dog nor a setup for invalid or identity-injected start payloads", async () => {
    const user = await createTestUser();
    users.push(user);

    const invalid = await startSetup(user, { name: "Biscuit" });
    expect(invalid.status).toBe(400);

    const injected = await startSetup(user, {
      ...validDog,
      userId: "someone-else",
      dogId: "00000000-0000-4000-8000-000000000001",
      setupId: "00000000-0000-4000-8000-000000000002",
    });
    expect(injected.status).toBe(400);

    expect(await countOwnedDogs(user.userId)).toBe(0);
    expect(await countOwnedSetups(user.userId)).toBe(0);
  });

  it("lets owners with existing dogs explicitly start another setup while auto-start remains false", async () => {
    const user = await createTestUser();
    users.push(user);

    expect((await createDog(user)).status).toBe(201);
    expect(await readStatus(user)).toEqual({
      active: null,
      latest: null,
      autoStartEligible: false,
    });

    const started = await startSetup(user, { ...validDog, name: "Second Biscuit" });
    expect(started.status).toBe(201);
    const { setup } = (await started.json()) as SetupBody;

    expect(await countOwnedDogs(user.userId)).toBe(2);
    expect(await countOwnedSetups(user.userId)).toBe(1);
    expect((await readStatus(user)).autoStartEligible).toBe(false);
    expect((await readStatus(user)).active?.id).toBe(setup.id);
  });

  it("requires an active setup to save intent, allows updating it, and never leaks another owner's rows", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    users.push(owner, other);

    const beforeStart = await saveIntent(
      owner,
      "00000000-0000-4000-8000-000000000001",
      "train_skill",
    );
    expect(beforeStart.status).toBe(404);
    expect(await beforeStart.json()).toEqual({ error: "not_found" });

    const strictIntent = await app.request("/api/guided-setup/intent", {
      method: "PUT",
      headers: owner.authHeaders,
      body: JSON.stringify({
        intent: "train_skill",
        userId: other.userId,
        dogId: "00000000-0000-4000-8000-000000000001",
        setupId: "00000000-0000-4000-8000-000000000002",
      }),
    });
    expect(strictIntent.status).toBe(400);

    const started = await startSetup(owner);
    expect(started.status).toBe(201);
    const startedSetup = ((await started.json()) as SetupBody).setup;

    const firstIntent = await saveIntent(owner, startedSetup.id, "understand_behavior");
    expect(firstIntent.status).toBe(200);
    const firstSetup = (await firstIntent.json()) as SetupBody;
    expect(firstSetup.setup).toEqual(
      expect.objectContaining({
        currentStep: "action",
        intent: "understand_behavior",
        completedAt: null,
      }),
    );

    const secondIntent = await saveIntent(owner, startedSetup.id, "track_progress");
    expect(secondIntent.status).toBe(200);
    const secondSetup = (await secondIntent.json()) as SetupBody;
    expect(secondSetup.setup).toEqual(
      expect.objectContaining({
        id: firstSetup.setup.id,
        currentStep: "action",
        intent: "track_progress",
      }),
    );

    expect((await readStatus(owner)).active).toEqual(secondSetup.setup);
    expect(await readStatus(other)).toEqual({
      active: null,
      latest: null,
      autoStartEligible: true,
    });
  });

  it("skips only from the action step, creates no domain rows, and is idempotent by reason", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    expect(started.status).toBe(201);
    const {
      setup: { id: setupId, dogId },
    } = (await started.json()) as SetupBody;
    if (!dogId) throw new Error("missing dogId");

    const tooEarly = await skipSetup(user, setupId);
    expect(tooEarly.status).toBe(409);

    const intent = await saveIntent(user, setupId, "track_progress");
    expect(intent.status).toBe(200);

    const skipped = await skipSetup(user, setupId);
    expect(skipped.status).toBe(200);
    const skippedBody = (await skipped.json()) as SetupBody;
    expect(skippedBody.setup).toEqual(
      expect.objectContaining({
        dogId,
        dogName: validDog.name,
        currentStep: "action",
        intent: "track_progress",
        completedAt: expect.any(String),
        completionReason: "skipped",
        firstActionType: null,
        firstActionId: null,
      }),
    );
    expect(await countActionRows(dogId as string)).toEqual({
      concerns: 0,
      journals: 0,
      goals: 0,
      skills: 0,
      focus: 0,
      practices: 0,
    });

    const replay = await skipSetup(user, setupId);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(skippedBody);

    const wrongCompletion = await abandonSetup(user, setupId);
    expect(wrongCompletion.status).toBe(409);
    expect(await wrongCompletion.json()).toEqual({ error: "setup_already_completed" });
  });

  it.each([
    { label: "intent", setIntent: false },
    { label: "action", setIntent: true },
  ])(
    "abandons from the $label step, preserves the dog, creates no domain rows, and is idempotent by reason",
    async ({ setIntent }) => {
      const user = await createTestUser();
      users.push(user);

      const started = await startSetup(user);
      expect(started.status).toBe(201);
      const {
        setup: { id, dogId },
      } = (await started.json()) as SetupBody;
      if (!dogId) throw new Error("missing dogId");

      if (setIntent) {
        const intent = await saveIntent(user, id, "train_skill");
        expect(intent.status).toBe(200);
      }

      const abandoned = await abandonSetup(user, id);
      expect(abandoned.status).toBe(200);
      const abandonedBody = (await abandoned.json()) as SetupBody;
      expect(abandonedBody.setup).toEqual(
        expect.objectContaining({
          id,
          dogId,
          dogName: validDog.name,
          currentStep: setIntent ? "action" : "intent",
          intent: setIntent ? "train_skill" : null,
          completedAt: expect.any(String),
          completionReason: "abandoned",
          firstActionType: null,
          firstActionId: null,
        }),
      );
      expect(await countOwnedDogs(user.userId)).toBe(1);
      expect(await countActionRows(dogId as string)).toEqual({
        concerns: 0,
        journals: 0,
        goals: 0,
        skills: 0,
        focus: 0,
        practices: 0,
      });

      const replay = await abandonSetup(user, id);
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(abandonedBody);

      const wrongCompletion = await skipSetup(user, id);
      expect(wrongCompletion.status).toBe(409);
      expect(await wrongCompletion.json()).toEqual({ error: "setup_already_completed" });

      const postCompleteIntent = await saveIntent(user, id, "track_progress");
      expect(postCompleteIntent.status).toBe(409);
      expect(await postCompleteIntent.json()).toEqual({ error: "setup_already_completed" });
    },
  );

  it("keeps completed history after dog deletion and never makes auto-start eligible again", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    expect(started.status).toBe(201);
    const { setup } = (await started.json()) as SetupBody;
    expect((await abandonSetup(user, setup.id)).status).toBe(200);

    const deleted = await app.request(`/api/dogs/${setup.dogId}`, {
      method: "DELETE",
      headers: user.authHeaders,
    });
    expect(deleted.status).toBe(200);

    const status = await readStatus(user);
    expect(status).toEqual({
      active: null,
      latest: expect.objectContaining({
        id: setup.id,
        dogId: null,
        dogName: null,
        currentStep: "intent",
        intent: null,
        startedAt: expect.any(String),
        completedAt: expect.any(String),
        completionReason: "abandoned",
        firstActionType: null,
        firstActionId: null,
      }),
      autoStartEligible: false,
    });

    const [row] = await db.select().from(guidedSetups).where(eq(guidedSetups.id, setup.id));
    expect(row).toMatchObject({ id: setup.id, dogId: null, completionReason: "abandoned" });
  });

  it("serializes concurrent starts to one setup and one dog without orphans", async () => {
    const user = await createTestUser();
    users.push(user);

    const [first, second] = await Promise.all([startSetup(user), startSetup(user)]);
    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const conflict = [first, second].find((response) => response.status === 409);
    if (!conflict) throw new Error("expected one conflicting start");
    expect(await conflict.json()).toEqual({ error: "active_setup_exists" });

    expect(await countOwnedDogs(user.userId)).toBe(1);
    expect(await countOwnedSetups(user.userId)).toBe(1);
    expect((await readStatus(user)).active?.dogId).toEqual(expect.any(String));
  });

  it("records exact bounded telemetry props without dog names, breed, or prose", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    expect(started.status).toBe(201);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "track_progress")).status).toBe(200);
    expect((await skipSetup(user, setup.id)).status).toBe(200);

    const rows = await setupEvents(user.userId);
    expect(rows).toEqual([
      { name: "dog.created", props: {} },
      { name: "guided_setup.started", props: { step: "intent" } },
      { name: "guided_setup.dog_basics_completed", props: { step: "intent" } },
      {
        name: "guided_setup.intent_selected",
        props: { intent: "track_progress", step: "action" },
      },
      {
        name: "guided_setup.first_action_skipped",
        props: { intent: "track_progress", step: "action" },
      },
      {
        name: "guided_setup.completed",
        props: {
          intent: "track_progress",
          step: "action",
          completionReason: "skipped",
        },
      },
    ]);

    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(validDog.name);
    expect(serialized).not.toContain(validDog.breed);
    expect(serialized).not.toContain(validDog.notes);
  });

  it("binds retries to the original setup instead of mutating a newer active setup", async () => {
    const user = await createTestUser();
    users.push(user);

    const firstStart = await startSetup(user);
    const first = ((await firstStart.json()) as SetupBody).setup;
    expect((await saveIntent(user, first.id, "track_progress")).status).toBe(200);
    const firstSkip = await skipSetup(user, first.id);
    expect(firstSkip.status).toBe(200);
    const firstCompleted = (await firstSkip.json()) as SetupBody;

    const secondStart = await startSetup(user, { ...validDog, name: "Second Biscuit" });
    const second = ((await secondStart.json()) as SetupBody).setup;

    const staleIntent = await saveIntent(user, first.id, "train_skill");
    expect(staleIntent.status).toBe(409);
    expect(await staleIntent.json()).toEqual({ error: "setup_already_completed" });

    const staleSkip = await skipSetup(user, first.id);
    expect(staleSkip.status).toBe(200);
    expect(await staleSkip.json()).toEqual(firstCompleted);

    const staleAbandon = await abandonSetup(user, first.id);
    expect(staleAbandon.status).toBe(409);
    expect(await staleAbandon.json()).toEqual({ error: "setup_already_completed" });

    expect((await readStatus(user)).active).toEqual(second);
  });

  it("returns not found for setup ids owned by another user", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    users.push(owner, other);

    const started = await startSetup(owner);
    const setup = ((await started.json()) as SetupBody).setup;
    const otherStarted = await startSetup(other, { ...validDog, name: "Other Biscuit" });
    const otherSetup = ((await otherStarted.json()) as SetupBody).setup;

    const intent = await saveIntent(other, setup.id, "track_progress");
    expect(intent.status).toBe(404);
    expect(await intent.json()).toEqual({ error: "not_found" });

    const skip = await skipSetup(other, setup.id);
    expect(skip.status).toBe(404);
    expect(await skip.json()).toEqual({ error: "not_found" });

    const abandon = await abandonSetup(other, setup.id);
    expect(abandon.status).toBe(404);
    expect(await abandon.json()).toEqual({ error: "not_found" });

    expect((await readStatus(owner)).active).toEqual(setup);
    expect((await readStatus(other)).active).toEqual(otherSetup);
  });

  it("rejects missing, malformed, or identity-injected completion bindings", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;

    for (const body of [
      {},
      { setupId: "not-a-uuid" },
      { setupId: setup.id, userId: user.userId },
      { setupId: setup.id, dogId: setup.dogId },
    ]) {
      const response = await app.request("/api/guided-setup/skip", {
        method: "POST",
        headers: user.authHeaders,
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }

    expect((await readStatus(user)).active).toEqual(setup);
  });

  it("does not write or emit telemetry when the saved intent is unchanged", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    const first = await saveIntent(user, setup.id, "track_progress");
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as SetupBody;
    const [beforeRepeat] = await db
      .select({ updatedAt: guidedSetups.updatedAt })
      .from(guidedSetups)
      .where(eq(guidedSetups.id, setup.id));
    if (!beforeRepeat) throw new Error("missing guided setup");

    const repeated = await saveIntent(user, setup.id, "track_progress");
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toEqual(firstBody);
    const [afterRepeat] = await db
      .select({ updatedAt: guidedSetups.updatedAt })
      .from(guidedSetups)
      .where(eq(guidedSetups.id, setup.id));
    expect(afterRepeat?.updatedAt).toEqual(beforeRepeat.updatedAt);

    const rows = await setupEvents(user.userId);
    expect(rows.filter(({ name }) => name === "guided_setup.intent_selected")).toHaveLength(1);
  });

  it("requires safety confirmation and atomically completes a severe behavior action", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "understand_behavior")).status).toBe(200);

    const rejected = await createBehaviorAction(user, {
      setupId: setup.id,
      concern: "Snapped when approached",
      severity: "severe",
      safetyConfirmed: false,
    });
    expect(rejected.status).toBe(400);
    expect((await readStatus(user)).active).toEqual(setupWithIntent(setup, "understand_behavior"));
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      concerns: 0,
      journals: 0,
    });

    const created = await createBehaviorAction(user, {
      setupId: setup.id,
      concern: "Snapped when approached",
      severity: "severe",
      safetyConfirmed: true,
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      setup: GuidedSetupRecord;
      concern: { id: string; dogId: string; concern: string; severity: string };
      actionDeleted: boolean;
    };
    expect(body.actionDeleted).toBe(false);
    expect(body.concern).toMatchObject({
      dogId: setup.dogId,
      concern: "Snapped when approached",
      severity: "severe",
    });
    expect(body.setup).toMatchObject({
      id: setup.id,
      completedAt: expect.any(String),
      completionReason: "first_action_completed",
      firstActionType: "behavior",
      firstActionId: body.concern.id,
    });
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      concerns: 1,
      journals: 0,
    });
    expect(
      await db
        .select({ type: dogSafetySignals.type, source: dogSafetySignals.source })
        .from(dogSafetySignals)
        .where(eq(dogSafetySignals.dogId, setup.dogId as string)),
    ).toEqual([{ type: "severe_behavior_concern", source: "behavior_concern" }]);

    const duplicate = await createBehaviorAction(user, {
      setupId: setup.id,
      concern: "Different prose must be ignored",
      severity: "mild",
      safetyConfirmed: false,
    });
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual(body);
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      concerns: 1,
      journals: 0,
    });
    const rows = await actionEvents(user.userId);
    expect(rows).toEqual([
      {
        name: "safety.signal_reported",
        props: { signal: "severe_behavior_concern", source: "behavior_concern" },
      },
      {
        name: "guided_setup.first_action_completed",
        props: { intent: "understand_behavior", actionType: "behavior" },
      },
      {
        name: "guided_setup.completed",
        props: {
          intent: "understand_behavior",
          actionType: "behavior",
          completionReason: "first_action_completed",
        },
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain("Snapped when approached");
  });

  it("persists behavior safety signals and keeps suggestion safety suppression active", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "understand_behavior")).status).toBe(200);

    const created = await createBehaviorAction(user, {
      setupId: setup.id,
      concern: "Growled near a visitor",
      severity: "moderate",
      safetySignal: "aggression_or_bite_risk",
      safetyConfirmed: true,
    });
    expect(created.status).toBe(201);
    expect((await created.json()) as { actionDeleted: boolean }).toMatchObject({
      actionDeleted: false,
    });

    expect(
      await db
        .select({ type: dogSafetySignals.type, source: dogSafetySignals.source })
        .from(dogSafetySignals)
        .where(eq(dogSafetySignals.dogId, setup.dogId as string)),
    ).toEqual([{ type: "aggression_or_bite_risk", source: "behavior_concern" }]);

    const weekKey = currentWeekKey(new Date(), 0);
    const suggestion = await app.request(
      `/api/dogs/${setup.dogId}/suggestion?weekKey=${weekKey}&timezoneOffsetMinutes=0`,
      { headers: user.authHeaders },
    );
    expect(suggestion.status).toBe(200);
    expect(
      (await suggestion.json()) as { suggestion: { safety: { suppressed: boolean } | null } },
    ).toMatchObject({
      suggestion: { safety: { suppressed: true } },
    });
  });

  it("replays a deleted behavior action as a tombstone without recreating the concern or telemetry", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "understand_behavior")).status).toBe(200);

    const created = await createBehaviorAction(user, {
      setupId: setup.id,
      concern: "Barked at a visitor",
      severity: "mild",
      safetyConfirmed: false,
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      setup: GuidedSetupRecord;
      concern: { id: string; dogId: string };
      actionDeleted: false;
    };
    expect(createdBody.actionDeleted).toBe(false);
    const beforeReplayEvents = await actionEvents(user.userId);

    const deleted = await app.request(
      `/api/dogs/${setup.dogId}/concerns/${createdBody.concern.id}`,
      {
        method: "DELETE",
        headers: user.authHeaders,
      },
    );
    expect(deleted.status).toBe(200);
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      concerns: 0,
      journals: 0,
    });

    const replay = await createBehaviorAction(user, {
      setupId: setup.id,
      concern: "Replacement prose must be ignored",
      severity: "severe",
      safetyConfirmed: true,
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({
      setup: createdBody.setup,
      concern: null,
      actionDeleted: true,
    });
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      concerns: 0,
      journals: 0,
    });
    expect(await actionEvents(user.userId)).toEqual(beforeReplayEvents);
  });

  it("creates one daily check-in and replays the exact existing result on duplicate progress submit", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "track_progress")).status).toBe(200);

    const input = {
      setupId: setup.id,
      trend: "better" as const,
      note: "Settled faster after dinner.",
    };
    const created = await createProgressAction(user, input);
    expect(created.status).toBe(201);
    const firstBody = (await created.json()) as {
      setup: GuidedSetupRecord;
      entry: { id: string; dogId: string; kind: string; trend: string; note: string };
      actionDeleted: false;
    };
    expect(firstBody.actionDeleted).toBe(false);
    expect(firstBody.entry).toMatchObject({
      dogId: setup.dogId,
      kind: "daily_checkin",
      trend: "better",
      note: input.note,
    });
    expect(firstBody.setup).toMatchObject({
      id: setup.id,
      completionReason: "first_action_completed",
      firstActionType: "progress",
      firstActionId: firstBody.entry.id,
    });

    const duplicate = await createProgressAction(user, input);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual(firstBody);
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      concerns: 0,
      journals: 1,
    });
    const rows = await actionEvents(user.userId);
    expect(rows.filter(({ name }) => name === "journal.entry_created")).toHaveLength(1);
    expect(rows.filter(({ name }) => name === "guided_setup.first_action_completed")).toHaveLength(
      1,
    );
    expect(rows.filter(({ name }) => name === "guided_setup.completed")).toHaveLength(1);
  });

  it("replays a deleted journal action as a tombstone without recreating the entry or telemetry", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "track_progress")).status).toBe(200);

    const created = await createProgressAction(user, {
      setupId: setup.id,
      trend: "same",
      note: "Settled after the walk.",
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      setup: GuidedSetupRecord;
      entry: { id: string; dogId: string };
      actionDeleted: false;
    };
    expect(createdBody.actionDeleted).toBe(false);
    const beforeReplayEvents = await actionEvents(user.userId);

    const deleted = await app.request(`/api/dogs/${setup.dogId}/journal/${createdBody.entry.id}`, {
      method: "DELETE",
      headers: user.authHeaders,
    });
    expect(deleted.status).toBe(200);
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      concerns: 0,
      journals: 0,
    });

    const replay = await createProgressAction(user, {
      setupId: setup.id,
      trend: "harder",
      note: "Replacement prose must be ignored.",
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({
      setup: createdBody.setup,
      entry: null,
      actionDeleted: true,
    });
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      concerns: 0,
      journals: 0,
    });
    expect(await actionEvents(user.userId)).toEqual(beforeReplayEvents);
  });

  it("replays a cascaded journal action as a tombstone while preserving completed history with null dog fields", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "track_progress")).status).toBe(200);

    const created = await createProgressAction(user, {
      setupId: setup.id,
      trend: "better",
      note: "Recovered after a quiet morning.",
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      setup: GuidedSetupRecord;
      entry: { id: string; dogId: string };
      actionDeleted: false;
    };
    expect(createdBody.actionDeleted).toBe(false);
    const beforeReplayEvents = await actionEvents(user.userId);

    const deleted = await app.request(`/api/dogs/${setup.dogId}`, {
      method: "DELETE",
      headers: user.authHeaders,
    });
    expect(deleted.status).toBe(200);
    expect(await countActionRows(setup.dogId as string)).toEqual({
      concerns: 0,
      journals: 0,
      goals: 0,
      skills: 0,
      focus: 0,
      practices: 0,
    });

    const status = await readStatus(user);
    expect(status.latest).toMatchObject({
      id: setup.id,
      dogId: null,
      dogName: null,
      completionReason: "first_action_completed",
      firstActionType: "progress",
      firstActionId: createdBody.entry.id,
    });
    const history = status.latest;
    if (!history) throw new Error("missing completed guided setup history");

    const replay = await createProgressAction(user, {
      setupId: setup.id,
      trend: "harder",
      note: "Replacement prose must be ignored.",
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({
      setup: history,
      entry: null,
      actionDeleted: true,
    });
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      concerns: 0,
      journals: 0,
    });
    expect(await actionEvents(user.userId)).toEqual(beforeReplayEvents);
  });

  it("rejects action intent mismatches without completing the setup", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "understand_behavior")).status).toBe(200);

    const progress = await createProgressAction(user, {
      setupId: setup.id,
      trend: "same",
      note: "No change today.",
    });
    expect(progress.status).toBe(409);
    expect(await progress.json()).toEqual({ error: "intent_mismatch" });
    expect((await readStatus(user)).active?.id).toBe(setup.id);
    expect((await readStatus(user)).active?.completedAt).toBeNull();
  });

  it("returns not found for unknown or cross-owner action setup ids without changing active setups", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    users.push(owner, other);

    const ownerStarted = await startSetup(owner);
    const ownerSetup = ((await ownerStarted.json()) as SetupBody).setup;
    const otherStarted = await startSetup(other, { ...validDog, name: "Other Biscuit" });
    const otherSetup = ((await otherStarted.json()) as SetupBody).setup;

    for (const action of [
      () =>
        createBehaviorAction(other, {
          setupId: ownerSetup.id,
          concern: "Barked",
          severity: "mild",
          safetyConfirmed: false,
        }),
      () =>
        createProgressAction(other, {
          setupId: ownerSetup.id,
          trend: "same",
          note: "No change.",
        }),
      () =>
        createProgressAction(other, {
          setupId: "00000000-0000-4000-8000-000000000001",
          trend: "same",
          note: "No change.",
        }),
    ]) {
      const response = await action();
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }

    expect((await readStatus(owner)).active).toEqual(ownerSetup);
    expect((await readStatus(other)).active).toEqual(otherSetup);
  });

  it("replays a stale behavior action against its completed setup after a newer setup starts", async () => {
    const user = await createTestUser();
    users.push(user);

    const firstStart = await startSetup(user);
    const first = ((await firstStart.json()) as SetupBody).setup;
    expect((await saveIntent(user, first.id, "understand_behavior")).status).toBe(200);
    const firstAction = await createBehaviorAction(user, {
      setupId: first.id,
      concern: "Barked at the window",
      severity: "mild",
      safetyConfirmed: false,
    });
    expect(firstAction.status).toBe(201);
    const firstBody = (await firstAction.json()) as {
      setup: GuidedSetupRecord;
      concern: { id: string };
      actionDeleted: false;
    };
    expect(firstBody.actionDeleted).toBe(false);

    const secondStart = await startSetup(user, { ...validDog, name: "Second Biscuit" });
    const second = ((await secondStart.json()) as SetupBody).setup;

    const stale = await createBehaviorAction(user, {
      setupId: first.id,
      concern: "Different prose must be ignored",
      severity: "severe",
      safetyConfirmed: true,
    });
    expect(stale.status).toBe(200);
    expect(await stale.json()).toEqual(firstBody);
    expect((await readStatus(user)).active).toEqual(second);

    const wrongEndpoint = await createProgressAction(user, {
      setupId: first.id,
      trend: "same",
      note: "Ignored.",
    });
    expect(wrongEndpoint.status).toBe(409);
    expect(await wrongEndpoint.json()).toEqual({ error: "setup_already_completed" });
  });

  it("rolls back behavior and safety rows and setup completion when the domain writer fails", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "understand_behavior")).status).toBe(200);

    behaviorConcernWriteControl.fail = true;
    const failed = await createBehaviorAction(user, {
      setupId: setup.id,
      concern: "Writer failure after insert",
      severity: "moderate",
      safetySignal: "aggression_or_bite_risk",
      safetyConfirmed: true,
    });
    expect(failed.status).toBe(500);

    const status = await readStatus(user);
    expect(status.active).toMatchObject({
      id: setup.id,
      currentStep: "action",
      intent: "understand_behavior",
      completedAt: null,
    });
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      concerns: 0,
      journals: 0,
    });
    expect(
      await db
        .select()
        .from(dogSafetySignals)
        .where(eq(dogSafetySignals.dogId, setup.dogId as string)),
    ).toEqual([]);
  });

  it("emits bounded action telemetry only after commit and never records owner prose", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "track_progress")).status).toBe(200);
    const note = "A private note that must never enter telemetry.";
    const created = await createProgressAction(user, {
      setupId: setup.id,
      trend: "harder",
      note,
    });
    expect(created.status).toBe(201);
    expect((await created.json()) as { actionDeleted: boolean }).toMatchObject({
      actionDeleted: false,
    });

    const rows = await actionEvents(user.userId);
    expect(rows).toEqual([
      { name: "journal.entry_created", props: { kind: "daily_checkin" } },
      {
        name: "guided_setup.first_action_completed",
        props: { intent: "track_progress", actionType: "progress" },
      },
      {
        name: "guided_setup.completed",
        props: {
          intent: "track_progress",
          actionType: "progress",
          completionReason: "first_action_completed",
        },
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain(note);
    expect(JSON.stringify(rows)).not.toContain(validDog.name);
    expect(JSON.stringify(rows)).not.toContain(validDog.breed);
  });
});

function setupWithIntent(setup: GuidedSetupRecord, intent: GuidedSetupRecord["intent"]) {
  return expect.objectContaining({
    ...setup,
    currentStep: "action",
    intent,
    completedAt: null,
  });
}
