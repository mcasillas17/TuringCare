import type { GuidedSetupRecord, GuidedSetupStatus } from "@turingcare/shared";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import {
  events,
  behaviorConcerns,
  dogs,
  guidedSetups,
  journalEntries,
  practiceSessions,
  trainingGoals,
  trainingSkills,
  weeklyFocus,
} from "../db/schema";
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
  intent: "understand_behavior" | "train_skill" | "track_progress",
) {
  return app.request("/api/guided-setup/intent", {
    method: "PUT",
    headers: user.authHeaders,
    body: JSON.stringify({ intent }),
  });
}

async function skipSetup(user: TestUser) {
  return app.request("/api/guided-setup/skip", {
    method: "POST",
    headers: user.authHeaders,
  });
}

async function abandonSetup(user: TestUser) {
  return app.request("/api/guided-setup/abandon", {
    method: "POST",
    headers: user.authHeaders,
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

describe("guided setup lifecycle", () => {
  const users: TestUser[] = [];

  afterEach(async () => {
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

    const beforeStart = await saveIntent(owner, "train_skill");
    expect(beforeStart.status).toBe(409);
    expect(await beforeStart.json()).toEqual({ error: "setup_not_active" });

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

    const firstIntent = await saveIntent(owner, "understand_behavior");
    expect(firstIntent.status).toBe(200);
    const firstSetup = (await firstIntent.json()) as SetupBody;
    expect(firstSetup.setup).toEqual(
      expect.objectContaining({
        currentStep: "action",
        intent: "understand_behavior",
        completedAt: null,
      }),
    );

    const secondIntent = await saveIntent(owner, "track_progress");
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
      setup: { dogId },
    } = (await started.json()) as SetupBody;
    if (!dogId) throw new Error("missing dogId");

    const tooEarly = await skipSetup(user);
    expect(tooEarly.status).toBe(409);

    const intent = await saveIntent(user, "track_progress");
    expect(intent.status).toBe(200);

    const skipped = await skipSetup(user);
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

    const replay = await skipSetup(user);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(skippedBody);

    const wrongCompletion = await abandonSetup(user);
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
        const intent = await saveIntent(user, "train_skill");
        expect(intent.status).toBe(200);
      }

      const abandoned = await abandonSetup(user);
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

      const replay = await abandonSetup(user);
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(abandonedBody);

      const wrongCompletion = await skipSetup(user);
      expect(wrongCompletion.status).toBe(409);
      expect(await wrongCompletion.json()).toEqual({ error: "setup_already_completed" });

      const postCompleteIntent = await saveIntent(user, "track_progress");
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
    expect((await abandonSetup(user)).status).toBe(200);

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
    expect((await saveIntent(user, "track_progress")).status).toBe(200);
    expect((await skipSetup(user)).status).toBe(200);

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
});
