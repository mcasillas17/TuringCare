import type { GuidedSetupRecord, GuidedSetupStatus } from "@turingcare/shared";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

const behaviorConcernWriteControl = vi.hoisted(() => ({ fail: false }));
const suggestionLoadControl = vi.hoisted(() => ({
  currentWeekKeyOverride: undefined as string | undefined,
  pauseLoad: false,
  loadHold: Promise.resolve(),
  markLoadStarted: undefined as (() => void) | undefined,
  releaseLoad: undefined as (() => void) | undefined,
}));

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

vi.mock("../lib/suggestion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/suggestion")>();
  return {
    ...actual,
    currentWeekKey: (...args: Parameters<typeof actual.currentWeekKey>) =>
      suggestionLoadControl.currentWeekKeyOverride ?? actual.currentWeekKey(...args),
    loadSuggestion: async (
      input: Parameters<typeof actual.loadSuggestion>[0],
    ): ReturnType<typeof actual.loadSuggestion> => {
      if (suggestionLoadControl.pauseLoad) {
        suggestionLoadControl.pauseLoad = false;
        suggestionLoadControl.markLoadStarted?.();
        await suggestionLoadControl.loadHold;
      }
      return actual.loadSuggestion(input);
    },
  };
});

import { app } from "../app";
import { db, pool } from "../db";
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
  trainingSuggestions,
  weeklyFocus,
} from "../db/schema";
import { currentWeekKey } from "../lib/suggestion";
import { type TestUser, createTestUser } from "../test-helpers";
import { durationBucket } from "./guided-setup";

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

async function createTrainingAction(
  user: TestUser,
  input: {
    setupId: string;
    templateKey: string;
    weekKey: string;
    timezoneOffsetMinutes: number;
  },
) {
  return app.request("/api/guided-setup/action/training", {
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

async function trainingActionEvents(userId: string) {
  return db
    .select({ name: events.name, props: events.props })
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        inArray(events.name, [
          "training.goal_added",
          "focus.week_set",
          "training.suggestion_shown",
          "guided_setup.first_action_completed",
          "guided_setup.completed",
        ]),
      ),
    )
    .orderBy(asc(events.createdAt));
}

async function suggestionTelemetryEvents(userId: string) {
  return db
    .select({ name: events.name })
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        inArray(events.name, ["training.suggestion_shown", "safety.suppression_shown"]),
      ),
    )
    .orderBy(asc(events.createdAt));
}

function pauseSuggestionLoad() {
  let releaseHold: () => void = () => {};
  suggestionLoadControl.loadHold = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });
  const loadStarted = new Promise<void>((resolve) => {
    suggestionLoadControl.markLoadStarted = resolve;
  });
  suggestionLoadControl.pauseLoad = true;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    suggestionLoadControl.markLoadStarted = undefined;
    suggestionLoadControl.releaseLoad = undefined;
    releaseHold();
  };
  suggestionLoadControl.releaseLoad = release;
  return { loadStarted, release };
}

async function waitForTrainingGoalLockWaiter() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ waiting: boolean }>(
      "select exists (" +
        "select 1 from pg_locks l " +
        "join pg_stat_activity a on a.pid = l.pid " +
        "where not l.granted " +
        "and a.wait_event_type = 'Lock' " +
        "and a.wait_event = 'transactionid' " +
        "and a.query ilike '%training_goals%'" +
        ") as waiting",
    );
    if (result.rows[0]?.waiting) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("timed out waiting for a training goal lock waiter");
}

async function waitForSetupAdvisoryLockWaiter() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ waiting: boolean }>(
      "select exists (" +
        "select 1 from pg_locks l " +
        "join pg_stat_activity a on a.pid = l.pid " +
        "where not l.granted " +
        "and l.locktype = 'advisory' " +
        "and a.query ilike '%pg_advisory_xact_lock%'" +
        ") as waiting",
    );
    if (result.rows[0]?.waiting) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("timed out waiting for a guided setup advisory lock waiter");
}

describe("guided setup lifecycle", () => {
  const users: TestUser[] = [];

  afterEach(async () => {
    behaviorConcernWriteControl.fail = false;
    suggestionLoadControl.currentWeekKeyOverride = undefined;
    suggestionLoadControl.pauseLoad = false;
    suggestionLoadControl.releaseLoad?.();
    for (let user = users.pop(); user; user = users.pop()) await user.cleanup();
  });

  it.each([
    ["under_2m", 0],
    ["under_2m", 1.999],
    ["2_to_5m", 2],
    ["2_to_5m", 4.999],
    ["5_to_10m", 5],
    ["5_to_10m", 9.999],
    ["over_10m", 10],
  ] as const)("buckets a %s duration at %s minutes", (expected, minutes) => {
    const startedAt = new Date("2026-08-16T00:00:00.000Z");
    const completedAt = new Date(startedAt.getTime() + minutes * 60_000);
    expect(durationBucket(startedAt, completedAt)).toBe(expected);
  });

  it("rejects a completed event duration derived from client input", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    expect(started.status).toBe(201);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "track_progress")).status).toBe(200);
    expect((await skipSetup(user, setup.id)).status).toBe(200);

    const rows = await setupEvents(user.userId);
    const completed = rows.find(({ name }) => name === "guided_setup.completed");
    expect(completed).toEqual({
      name: "guided_setup.completed",
      props: {
        intent: "track_progress",
        step: "action",
        completionReason: "skipped",
        durationBucket: "under_2m",
      },
    });
    expect(JSON.stringify(completed?.props)).not.toContain("startedAt");
    expect(JSON.stringify(completed?.props)).not.toContain("completedAt");
    expect(completed?.props).not.toHaveProperty("duration");
    expect(completed?.props).not.toHaveProperty("durationMinutes");
  });

  it("keeps every guided lifecycle, action, and replay telemetry prop scalar and private", async () => {
    const user = await createTestUser();
    users.push(user);

    const forbidden = new Set<string>([
      validDog.name,
      validDog.breed,
      validDog.notes,
      "Snapped when touched",
      "Settled after dinner",
    ]);
    const forbiddenIdentifiers = new Set<string>();
    const rememberSetupIdentifiers = (setup: GuidedSetupRecord) => {
      for (const value of [setup.id, setup.dogId, setup.firstActionId]) {
        if (value) forbiddenIdentifiers.add(value);
      }
    };
    const setupTimestamps: string[] = [];

    const skippedStart = await startSetup(user);
    const skipped = ((await skippedStart.json()) as SetupBody).setup;
    rememberSetupIdentifiers(skipped);
    setupTimestamps.push(skipped.startedAt);
    expect((await saveIntent(user, skipped.id, "track_progress")).status).toBe(200);
    expect((await skipSetup(user, skipped.id)).status).toBe(200);
    expect((await skipSetup(user, skipped.id)).status).toBe(200);

    const abandonedStart = await startSetup(user);
    const abandoned = ((await abandonedStart.json()) as SetupBody).setup;
    rememberSetupIdentifiers(abandoned);
    setupTimestamps.push(abandoned.startedAt);
    expect((await abandonSetup(user, abandoned.id)).status).toBe(200);
    expect((await abandonSetup(user, abandoned.id)).status).toBe(200);

    const behaviorStart = await startSetup(user);
    const behavior = ((await behaviorStart.json()) as SetupBody).setup;
    rememberSetupIdentifiers(behavior);
    setupTimestamps.push(behavior.startedAt);
    expect((await saveIntent(user, behavior.id, "understand_behavior")).status).toBe(200);
    const behaviorCreated = await createBehaviorAction(user, {
      setupId: behavior.id,
      concern: "Snapped when touched",
      severity: "mild",
      safetyConfirmed: false,
    });
    expect(behaviorCreated.status).toBe(201);
    const behaviorBody = (await behaviorCreated.json()) as {
      setup: GuidedSetupRecord;
      concern: { id: string; dogId: string };
    };
    rememberSetupIdentifiers(behaviorBody.setup);
    forbiddenIdentifiers.add(behaviorBody.concern.id);
    forbiddenIdentifiers.add(behaviorBody.concern.dogId);
    expect(
      (
        await createBehaviorAction(user, {
          setupId: behavior.id,
          concern: "A different concern",
          severity: "mild",
          safetyConfirmed: false,
        })
      ).status,
    ).toBe(200);

    const progressStart = await startSetup(user);
    const progress = ((await progressStart.json()) as SetupBody).setup;
    rememberSetupIdentifiers(progress);
    setupTimestamps.push(progress.startedAt);
    expect((await saveIntent(user, progress.id, "track_progress")).status).toBe(200);
    const progressCreated = await createProgressAction(user, {
      setupId: progress.id,
      trend: "better",
      note: "Settled after dinner",
    });
    expect(progressCreated.status).toBe(201);
    const progressBody = (await progressCreated.json()) as {
      setup: GuidedSetupRecord;
      entry: { id: string; dogId: string };
    };
    rememberSetupIdentifiers(progressBody.setup);
    forbiddenIdentifiers.add(progressBody.entry.id);
    forbiddenIdentifiers.add(progressBody.entry.dogId);
    expect(
      (
        await createProgressAction(user, {
          setupId: progress.id,
          trend: "harder",
          note: "Another private note",
        })
      ).status,
    ).toBe(200);

    const trainingStart = await startSetup(user);
    const training = ((await trainingStart.json()) as SetupBody).setup;
    rememberSetupIdentifiers(training);
    setupTimestamps.push(training.startedAt);
    expect((await saveIntent(user, training.id, "train_skill")).status).toBe(200);
    const trainingInput = {
      setupId: training.id,
      templateKey: "puppy-fundamentals",
      weekKey: currentWeekKey(new Date(), 420),
      timezoneOffsetMinutes: 420,
    } as const;
    const trainingCreated = await createTrainingAction(user, trainingInput);
    expect(trainingCreated.status).toBe(201);
    const trainingBody = (await trainingCreated.json()) as {
      setup: GuidedSetupRecord;
      goal: { id: string };
      skills: Array<{ id: string }>;
      focus: { id: string } | null;
      suggestion: {
        suggestionId: string;
        dogId: string;
        skill: { id: string; goalId: string } | null;
      };
    };
    rememberSetupIdentifiers(trainingBody.setup);
    for (const value of [
      trainingBody.goal.id,
      ...trainingBody.skills.map((skill) => skill.id),
      trainingBody.focus?.id,
      trainingBody.suggestion.suggestionId,
      trainingBody.suggestion.dogId,
      trainingBody.suggestion.skill?.id,
      trainingBody.suggestion.skill?.goalId,
    ]) {
      if (value) forbiddenIdentifiers.add(value);
    }
    expect((await createTrainingAction(user, trainingInput)).status).toBe(200);

    const rows = await db
      .select({ name: events.name, props: events.props })
      .from(events)
      .where(eq(events.userId, user.userId));
    const completedRows = rows.filter(({ name }) => name === "guided_setup.completed");
    expect(completedRows).toHaveLength(5);

    for (const row of rows) {
      const props = row.props as Record<string, unknown>;
      expect(
        Object.values(props).every((value) => {
          const type = typeof value;
          return type === "string" || type === "number" || type === "boolean";
        }),
      ).toBe(true);
      for (const key of [
        "setupId",
        "dogId",
        "firstActionId",
        "id",
        "concernId",
        "entryId",
        "goalId",
        "skillId",
        "focusId",
        "suggestionId",
        "entityId",
        "resourceId",
      ]) {
        expect(props).not.toHaveProperty(key);
      }
      expect(props).not.toHaveProperty("startedAt");
      expect(props).not.toHaveProperty("completedAt");
      expect(props).not.toHaveProperty("duration");
      expect(props).not.toHaveProperty("durationMinutes");
      for (const value of [...forbidden, ...forbiddenIdentifiers, ...setupTimestamps]) {
        expect(JSON.stringify(props)).not.toContain(value);
      }
      if (row.name === "guided_setup.completed") {
        expect(props.durationBucket).toBe("under_2m");
      }
      if (row.name === "safety.signal_reported") {
        expect([
          "aggression_or_bite_risk",
          "injury_or_pain",
          "severe_fear_or_panic",
          "severe_behavior_concern",
        ]).toContain(props.signal);
        expect(props.source).toBe("behavior_concern");
      }
    }
  });

  it("uses the persisted setup start timestamp for a non-default completion duration bucket", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    expect(started.status).toBe(201);
    const setup = ((await started.json()) as SetupBody).setup;
    const backdatedStartedAt = new Date(Date.now() - 6 * 60_000);
    await db
      .update(guidedSetups)
      .set({ startedAt: backdatedStartedAt })
      .where(eq(guidedSetups.id, setup.id));

    expect((await saveIntent(user, setup.id, "track_progress")).status).toBe(200);
    expect((await skipSetup(user, setup.id)).status).toBe(200);

    const [persisted] = await db
      .select({ startedAt: guidedSetups.startedAt, completedAt: guidedSetups.completedAt })
      .from(guidedSetups)
      .where(eq(guidedSetups.id, setup.id));
    expect(persisted?.startedAt).toEqual(backdatedStartedAt);
    expect(persisted?.completedAt).toEqual(expect.any(Date));

    const completed = (await setupEvents(user.userId)).find(
      ({ name }) => name === "guided_setup.completed",
    );
    expect(completed?.props).toEqual({
      intent: "track_progress",
      step: "action",
      completionReason: "skipped",
      durationBucket: "5_to_10m",
    });
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
          durationBucket: "under_2m",
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
      safetySignal: "injury_or_pain",
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
    ).toEqual([
      { type: "severe_behavior_concern", source: "behavior_concern" },
      { type: "injury_or_pain", source: "behavior_concern" },
    ]);

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
        name: "safety.signal_reported",
        props: { signal: "injury_or_pain", source: "behavior_concern" },
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
          durationBucket: "under_2m",
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
          durationBucket: "under_2m",
        },
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain(note);
    expect(JSON.stringify(rows)).not.toContain(validDog.name);
    expect(JSON.stringify(rows)).not.toContain(validDog.breed);
  });

  it("applies a starter training template, focuses the first skill, and returns a suggestion", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);
    const weekKey = currentWeekKey(new Date(), 420);

    const response = await createTrainingAction(user, {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey,
      timezoneOffsetMinutes: 420,
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      setup: GuidedSetupRecord;
      goal: { id: string; catalogGoalKey: string };
      skills: Array<{ id: string; position: number }>;
      focus: { skillId: string; weekStart: string };
      suggestion: { type: string; skill: { id: string } | null };
      actionDeleted: false;
    };
    expect(body.actionDeleted).toBe(false);
    expect(body.goal.catalogGoalKey).toBe("puppy-fundamentals");
    expect(body.skills.map((skill) => skill.position)).toEqual(
      body.skills.map((_, index) => index),
    );
    expect(body.focus).toMatchObject({ skillId: body.skills[0]?.id, weekStart: weekKey });
    expect(body.suggestion).toMatchObject({
      type: "exercise",
      skill: { id: body.skills[0]?.id },
    });
    expect(body.setup).toMatchObject({
      id: setup.id,
      completionReason: "first_action_completed",
      firstActionType: "training",
      firstActionId: body.goal.id,
    });
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      goals: 1,
      skills: body.skills.length,
      focus: 1,
    });

    expect(await trainingActionEvents(user.userId)).toEqual([
      { name: "training.goal_added", props: { source: "template" } },
      { name: "focus.week_set", props: { replaced: false } },
      {
        name: "guided_setup.first_action_completed",
        props: { intent: "train_skill", actionType: "training" },
      },
      {
        name: "guided_setup.completed",
        props: {
          intent: "train_skill",
          actionType: "training",
          completionReason: "first_action_completed",
          durationBucket: "under_2m",
        },
      },
      {
        name: "training.suggestion_shown",
        props: {
          suggestionType: "exercise",
          ruleId: "cold_start_curriculum_level",
          level: 1,
          suppressed: false,
          curriculumVersion: expect.any(String),
        },
      },
    ]);
    expect(JSON.stringify(await trainingActionEvents(user.userId))).not.toContain(validDog.name);
  });

  it("does not duplicate suggestion telemetry on an immediate training replay", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);
    const input = {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    };

    const created = await createTrainingAction(user, input);
    expect(created.status).toBe(201);
    const replay = await createTrainingAction(user, {
      ...input,
      templateKey: "basic-manners",
    });
    expect(replay.status).toBe(200);

    expect(
      (await suggestionTelemetryEvents(user.userId)).filter(
        ({ name }) => name === "training.suggestion_shown",
      ),
    ).toHaveLength(1);
  });

  it("rejects an invalid training template without writing or completing the setup", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);

    const response = await createTrainingAction(user, {
      setupId: setup.id,
      templateKey: "missing-template",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_template" });
    expect((await readStatus(user)).active).toMatchObject({
      id: setup.id,
      completedAt: null,
      intent: "train_skill",
    });
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      goals: 0,
      skills: 0,
      focus: 0,
    });
    expect(await trainingActionEvents(user.userId)).toEqual([]);
  });

  it("rejects catalog templates outside the guided starter set", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);

    const response = await createTrainingAction(user, {
      setupId: setup.id,
      templateKey: "reactivity-work",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_template" });
    expect((await readStatus(user)).active).toMatchObject({
      id: setup.id,
      completedAt: null,
      intent: "train_skill",
    });
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      goals: 0,
      skills: 0,
      focus: 0,
    });
  });

  it("rejects a historical training week before writing", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);
    const current = currentWeekKey(new Date(), 0);
    const historical = new Date(`${current}T00:00:00.000Z`);
    historical.setUTCDate(historical.getUTCDate() - 7);

    const response = await createTrainingAction(user, {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey: historical.toISOString().slice(0, 10),
      timezoneOffsetMinutes: 0,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "historical_suggestion_unavailable" });
    expect((await readStatus(user)).active?.completedAt).toBeNull();
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      goals: 0,
      skills: 0,
      focus: 0,
    });
    expect(await trainingActionEvents(user.userId)).toEqual([]);
  });

  it("rechecks the training week after waiting for the setup lock", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);
    suggestionLoadControl.currentWeekKeyOverride = "2026-08-17";

    const holder = await pool.connect();
    let holderTransactionOpen = false;
    try {
      await holder.query("begin");
      holderTransactionOpen = true;
      await holder.query("select pg_advisory_xact_lock(hashtext($1))", [
        `guided-setup:${user.userId}`,
      ]);

      const responsePromise = createTrainingAction(user, {
        setupId: setup.id,
        templateKey: "puppy-fundamentals",
        weekKey: "2026-08-17",
        timezoneOffsetMinutes: 0,
      });
      await waitForSetupAdvisoryLockWaiter();
      suggestionLoadControl.currentWeekKeyOverride = "2026-08-24";
      await holder.query("commit");
      holderTransactionOpen = false;

      const response = await responsePromise;
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "historical_suggestion_unavailable" });
      expect(await countActionRows(setup.dogId as string)).toMatchObject({
        goals: 0,
        skills: 0,
        focus: 0,
      });
      expect(await trainingActionEvents(user.userId)).toEqual([]);
    } finally {
      if (holderTransactionOpen) await holder.query("rollback");
      holder.release();
    }
  });

  it("replays a completed training action after its week becomes historical", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);
    const current = currentWeekKey(new Date(), 0);
    const created = await createTrainingAction(user, {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey: current,
      timezoneOffsetMinutes: 0,
    });
    const createdBody = (await created.json()) as { goal: { id: string } };
    const [suggestionsBeforeReplay] = await db
      .select({ value: count() })
      .from(trainingSuggestions)
      .where(eq(trainingSuggestions.dogId, setup.dogId as string));
    const telemetryBeforeReplay = await suggestionTelemetryEvents(user.userId);
    const historical = new Date(`${current}T00:00:00.000Z`);
    historical.setUTCDate(historical.getUTCDate() - 7);
    const historicalWeekKey = historical.toISOString().slice(0, 10);
    await db
      .update(weeklyFocus)
      .set({ weekStart: historicalWeekKey })
      .where(eq(weeklyFocus.dogId, setup.dogId as string));

    const replay = await createTrainingAction(user, {
      setupId: setup.id,
      templateKey: "basic-manners",
      weekKey: historicalWeekKey,
      timezoneOffsetMinutes: 0,
    });

    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      setup: { id: setup.id },
      goal: { id: createdBody.goal.id },
      suggestion: null,
      actionDeleted: false,
    });
    const [suggestionsAfterReplay] = await db
      .select({ value: count() })
      .from(trainingSuggestions)
      .where(eq(trainingSuggestions.dogId, setup.dogId as string));
    expect(suggestionsAfterReplay?.value).toBe(suggestionsBeforeReplay?.value);
    expect(await suggestionTelemetryEvents(user.userId)).toEqual(telemetryBeforeReplay);
  });

  it("returns not found for a cross-owner setup before historical-week validation", async () => {
    const owner = await createTestUser();
    const attacker = await createTestUser();
    users.push(owner, attacker);

    const started = await startSetup(owner);
    const setup = ((await started.json()) as SetupBody).setup;
    const current = currentWeekKey(new Date(), 0);
    const historical = new Date(`${current}T00:00:00.000Z`);
    historical.setUTCDate(historical.getUTCDate() - 7);

    const response = await createTrainingAction(attacker, {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey: historical.toISOString().slice(0, 10),
      timezoneOffsetMinutes: 0,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("returns the normal safety suggestion instead of an exercise for a safety-suppressed dog", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);
    await db.insert(dogSafetySignals).values({
      dogId: setup.dogId as string,
      type: "aggression_or_bite_risk",
      source: "behavior_concern",
    });

    const response = await createTrainingAction(user, {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      suggestion: {
        type: string;
        primary: unknown;
        fallback: unknown;
        safety: { suppressed: boolean } | null;
      };
    };
    expect(body.suggestion).toMatchObject({
      type: "safety_suppressed",
      primary: null,
      fallback: null,
      safety: { suppressed: true },
    });
  });

  it("serializes concurrent first training submits without duplicate rows or telemetry", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);
    const input = {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    };

    const [concurrentA, concurrentB] = await Promise.all([
      createTrainingAction(user, input),
      createTrainingAction(user, input),
    ]);
    expect([concurrentA.status, concurrentB.status].sort((a, b) => a - b)).toEqual([200, 201]);

    const [bodyA, bodyB] = await Promise.all([concurrentA.json(), concurrentB.json()]);
    expect(bodyA).toMatchObject({
      actionDeleted: false,
      goal: { id: expect.any(String) },
    });
    expect(bodyB).toMatchObject({
      actionDeleted: false,
      goal: { id: expect.any(String) },
    });
    expect((bodyA as { goal: { id: string } }).goal.id).toBe(
      (bodyB as { goal: { id: string } }).goal.id,
    );
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      goals: 1,
      skills: 5,
      focus: 1,
    });

    const rows = await trainingActionEvents(user.userId);
    expect(rows.filter(({ name }) => name === "training.goal_added")).toHaveLength(1);
    expect(rows.filter(({ name }) => name === "focus.week_set")).toHaveLength(1);
    expect(rows.filter(({ name }) => name === "training.suggestion_shown")).toHaveLength(1);
    expect(rows.filter(({ name }) => name === "guided_setup.first_action_completed")).toHaveLength(
      1,
    );
    expect(rows.filter(({ name }) => name === "guided_setup.completed")).toHaveLength(1);
  });

  it("does not duplicate suggestion telemetry when normal loading wins the audit before guided loading", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);
    await db.insert(dogSafetySignals).values({
      dogId: setup.dogId as string,
      type: "injury_or_pain",
      source: "behavior_concern",
    });
    const input = {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    };
    const guidedLoad = pauseSuggestionLoad();
    const guidedCreate = createTrainingAction(user, input);

    try {
      await guidedLoad.loadStarted;
      const normalSuggestion = await app.request(
        `/api/dogs/${setup.dogId}/suggestion?weekKey=${input.weekKey}&timezoneOffsetMinutes=0`,
        { headers: user.authHeaders },
      );
      expect(normalSuggestion.status).toBe(200);
      expect(
        ((await normalSuggestion.json()) as { suggestion: { type: string } }).suggestion,
      ).toMatchObject({
        type: "safety_suppressed",
      });
      expect(await suggestionTelemetryEvents(user.userId)).toEqual([
        { name: "training.suggestion_shown" },
        { name: "safety.suppression_shown" },
      ]);

      guidedLoad.release();
      const guidedResponse = await guidedCreate;
      expect(guidedResponse.status).toBe(201);
      expect(await suggestionTelemetryEvents(user.userId)).toEqual([
        { name: "training.suggestion_shown" },
        { name: "safety.suppression_shown" },
      ]);
    } finally {
      guidedLoad.release();
      await guidedCreate.catch(() => undefined);
    }
  });

  it("does not duplicate suggestion telemetry when guided creation wins the audit before normal loading", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);
    const input = {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    };
    const normalLoad = pauseSuggestionLoad();
    const normalGet = Promise.resolve(
      app.request(
        `/api/dogs/${setup.dogId}/suggestion?weekKey=${input.weekKey}&timezoneOffsetMinutes=0`,
        { headers: user.authHeaders },
      ),
    );

    try {
      await normalLoad.loadStarted;
      const guidedCreate = await createTrainingAction(user, input);
      expect(guidedCreate.status).toBe(201);
      expect(
        (await suggestionTelemetryEvents(user.userId)).filter(
          ({ name }) => name === "training.suggestion_shown",
        ),
      ).toHaveLength(1);

      normalLoad.release();
      const normalResponse = await normalGet;
      expect(normalResponse.status).toBe(200);
      expect(
        (await suggestionTelemetryEvents(user.userId)).filter(
          ({ name }) => name === "training.suggestion_shown",
        ),
      ).toHaveLength(1);
    } finally {
      normalLoad.release();
      await normalGet.catch(() => undefined);
    }
  });

  it("rejects training actions before intent selection and for a different intent without writes", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    const input = {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    };

    const beforeIntent = await createTrainingAction(user, input);
    expect(beforeIntent.status).toBe(409);
    expect(await beforeIntent.json()).toEqual({ error: "intent_mismatch" });
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      goals: 0,
      skills: 0,
      focus: 0,
    });

    expect((await saveIntent(user, setup.id, "understand_behavior")).status).toBe(200);
    const wrongIntent = await createTrainingAction(user, input);
    expect(wrongIntent.status).toBe(409);
    expect(await wrongIntent.json()).toEqual({ error: "intent_mismatch" });
    expect((await readStatus(user)).active).toMatchObject({
      id: setup.id,
      currentStep: "action",
      intent: "understand_behavior",
      completedAt: null,
    });
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      goals: 0,
      skills: 0,
      focus: 0,
    });
    expect(await trainingActionEvents(user.userId)).toEqual([]);
  });

  it("keeps a completed training goal live when its current-week focus is removed", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);
    const input = {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    };
    const created = await createTrainingAction(user, input);
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      goal: { id: string };
      skills: Array<{ id: string }>;
    };

    const deleted = await app.request(
      `/api/dogs/${setup.dogId}/focus/${createdBody.skills[0]?.id}?weekKey=${input.weekKey}`,
      {
        method: "DELETE",
        headers: user.authHeaders,
      },
    );
    expect(deleted.status).toBe(200);

    const replay = await createTrainingAction(user, {
      ...input,
      templateKey: "basic-manners",
    });
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as {
      goal: { id: string } | null;
      skills: Array<{ id: string }>;
      focus: { skillId: string } | null;
      suggestion: { skill: { id: string } | null } | null;
      actionDeleted: boolean;
    };
    expect(replayBody).toMatchObject({
      goal: { id: createdBody.goal.id },
      focus: null,
      actionDeleted: false,
      suggestion: { skill: null },
    });
    expect(replayBody.skills.map(({ id }) => id)).toEqual(createdBody.skills.map(({ id }) => id));
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      goals: 1,
      skills: createdBody.skills.length,
      focus: 0,
    });
  });

  it("keeps a completed training goal live when its current-week focus changes", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);
    const input = {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    };
    const created = await createTrainingAction(user, input);
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      goal: { id: string };
      skills: Array<{ id: string }>;
    };
    expect(
      (await suggestionTelemetryEvents(user.userId)).filter(
        ({ name }) => name === "training.suggestion_shown",
      ),
    ).toHaveLength(1);
    const replacementSkill = createdBody.skills[1];
    if (!replacementSkill) throw new Error("training template did not create a replacement skill");

    const changed = await app.request(`/api/dogs/${setup.dogId}/focus`, {
      method: "POST",
      headers: user.authHeaders,
      body: JSON.stringify({ skillId: replacementSkill.id, weekKey: input.weekKey }),
    });
    expect(changed.status).toBe(200);

    const replay = await createTrainingAction(user, {
      ...input,
      templateKey: "basic-manners",
    });
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as {
      goal: { id: string } | null;
      skills: Array<{ id: string }>;
      focus: { skillId: string } | null;
      suggestion: { skill: { id: string } | null } | null;
      actionDeleted: boolean;
    };
    expect(replayBody).toMatchObject({
      goal: { id: createdBody.goal.id },
      focus: { skillId: replacementSkill.id },
      actionDeleted: false,
      suggestion: { skill: { id: replacementSkill.id } },
    });
    expect(replayBody.skills.map(({ id }) => id)).toEqual(createdBody.skills.map(({ id }) => id));
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      goals: 1,
      skills: createdBody.skills.length,
      focus: 1,
    });
    expect(
      (await suggestionTelemetryEvents(user.userId)).filter(
        ({ name }) => name === "training.suggestion_shown",
      ),
    ).toHaveLength(2);

    const normalSuggestion = await app.request(
      `/api/dogs/${setup.dogId}/suggestion?weekKey=${input.weekKey}&timezoneOffsetMinutes=0`,
      { headers: user.authHeaders },
    );
    expect(normalSuggestion.status).toBe(200);
    expect(
      ((await normalSuggestion.json()) as { suggestion: { skill: { id: string } | null } })
        .suggestion,
    ).toMatchObject({ skill: { id: replacementSkill.id } });

    const replayAgain = await createTrainingAction(user, {
      ...input,
      templateKey: "basic-manners",
    });
    expect(replayAgain.status).toBe(200);
    expect(
      (await suggestionTelemetryEvents(user.userId)).filter(
        ({ name }) => name === "training.suggestion_shown",
      ),
    ).toHaveLength(2);
  });

  it("replays a live training goal after an owned skill is deleted and another is renamed", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    expect(started.status).toBe(201);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);
    const input = {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    };
    const created = await createTrainingAction(user, input);
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      setup: GuidedSetupRecord;
      goal: { id: string };
      skills: Array<{ id: string; name: string; position: number; confidence: number }>;
    };
    const focusedSkill = createdBody.skills[0];
    const renamedSkill = createdBody.skills[1];
    if (!focusedSkill || !renamedSkill) throw new Error("training template created too few skills");
    const beforeReplayEvents = await trainingActionEvents(user.userId);

    const deleted = await app.request(`/api/dogs/${setup.dogId}/skills/${focusedSkill.id}`, {
      method: "DELETE",
      headers: user.authHeaders,
    });
    expect(deleted.status).toBe(200);

    const renamedName = "Wait at the doorway";
    const renamed = await app.request(`/api/dogs/${setup.dogId}/skills/${renamedSkill.id}`, {
      method: "PUT",
      headers: user.authHeaders,
      body: JSON.stringify({ name: renamedName, confidence: renamedSkill.confidence }),
    });
    expect(renamed.status).toBe(200);
    expect(await trainingActionEvents(user.userId)).toEqual(beforeReplayEvents);

    const replay = await createTrainingAction(user, {
      ...input,
      templateKey: "basic-manners",
    });
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as {
      setup: GuidedSetupRecord;
      goal: { id: string } | null;
      skills: Array<{ id: string; name: string; position: number }>;
      focus: { skillId: string } | null;
      suggestion: { skill: { id: string } | null } | null;
      actionDeleted: boolean;
    };
    expect(replayBody).toMatchObject({
      setup: createdBody.setup,
      goal: { id: createdBody.goal.id },
      focus: null,
      suggestion: { skill: null },
      actionDeleted: false,
    });
    expect(replayBody.skills.map(({ id, name, position }) => ({ id, name, position }))).toEqual(
      createdBody.skills.slice(1).map(({ id, name, position }) => ({
        id,
        name: id === renamedSkill.id ? renamedName : name,
        position,
      })),
    );
    expect(replayBody.skills.some(({ id }) => id === focusedSkill.id)).toBe(false);
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      goals: 1,
      skills: createdBody.skills.length - 1,
      focus: 0,
    });
    expect(await trainingActionEvents(user.userId)).toEqual([
      ...beforeReplayEvents,
      {
        name: "training.suggestion_shown",
        props: {
          suggestionType: "needs_focus_skill",
          ruleId: "needs_focus_skill",
          level: 0,
          suppressed: false,
          curriculumVersion: expect.any(String),
        },
      },
    ]);
  });

  it("returns not found for unknown or cross-owner training setup ids without changing active setups", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    users.push(owner, other);

    const ownerStarted = await startSetup(owner);
    const ownerSetup = ((await ownerStarted.json()) as SetupBody).setup;
    const otherStarted = await startSetup(other, { ...validDog, name: "Other Biscuit" });
    const otherSetup = ((await otherStarted.json()) as SetupBody).setup;
    const input = {
      templateKey: "puppy-fundamentals",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    };

    for (const setupId of [ownerSetup.id, "00000000-0000-4000-8000-000000000001"]) {
      const response = await createTrainingAction(other, { setupId, ...input });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }

    expect((await readStatus(owner)).active).toEqual(ownerSetup);
    expect((await readStatus(other)).active).toEqual(otherSetup);
    expect(await countActionRows(ownerSetup.dogId as string)).toMatchObject({
      goals: 0,
      focus: 0,
    });
    expect(await countActionRows(otherSetup.dogId as string)).toMatchObject({
      goals: 0,
      focus: 0,
    });
  });

  it("replays a stale training action against its completed setup after a newer setup starts", async () => {
    const user = await createTestUser();
    users.push(user);

    const firstStart = await startSetup(user);
    const first = ((await firstStart.json()) as SetupBody).setup;
    expect((await saveIntent(user, first.id, "train_skill")).status).toBe(200);
    const input = {
      setupId: first.id,
      templateKey: "puppy-fundamentals",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    };
    const firstAction = await createTrainingAction(user, input);
    expect(firstAction.status).toBe(201);
    const firstBody = await firstAction.json();

    const secondStart = await startSetup(user, { ...validDog, name: "Second Biscuit" });
    const second = ((await secondStart.json()) as SetupBody).setup;

    const stale = await createTrainingAction(user, {
      ...input,
      templateKey: "basic-manners",
    });
    expect(stale.status).toBe(200);
    expect(await stale.json()).toEqual(firstBody);
    expect((await readStatus(user)).active).toEqual(second);
  });

  it("returns a tombstone after the referenced training goal is deleted without telemetry", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);
    const input = {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    };
    const created = await createTrainingAction(user, input);
    expect(created.status).toBe(201);
    const body = (await created.json()) as { goal: { id: string } };
    const beforeReplayEvents = await trainingActionEvents(user.userId);

    const deleted = await app.request(`/api/dogs/${setup.dogId}/goals/${body.goal.id}`, {
      method: "DELETE",
      headers: user.authHeaders,
    });
    expect(deleted.status).toBe(200);

    const replay = await createTrainingAction(user, {
      ...input,
      templateKey: "basic-manners",
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({
      setup: expect.objectContaining({
        id: setup.id,
        firstActionType: "training",
        firstActionId: body.goal.id,
      }),
      goal: null,
      skills: [],
      focus: null,
      suggestion: null,
      actionDeleted: true,
    });
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      goals: 0,
      skills: 0,
      focus: 0,
    });
    expect(await trainingActionEvents(user.userId)).toEqual(beforeReplayEvents);
  });

  it("returns a tombstone after completed dog deletion without telemetry", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);
    const input = {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    };
    const created = await createTrainingAction(user, input);
    expect(created.status).toBe(201);
    const beforeReplayEvents = await trainingActionEvents(user.userId);

    const deleted = await app.request(`/api/dogs/${setup.dogId}`, {
      method: "DELETE",
      headers: user.authHeaders,
    });
    expect(deleted.status).toBe(200);

    const replay = await createTrainingAction(user, {
      ...input,
      templateKey: "basic-manners",
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({
      setup: expect.objectContaining({
        id: setup.id,
        dogId: null,
        dogName: null,
        firstActionType: "training",
      }),
      goal: null,
      skills: [],
      focus: null,
      suggestion: null,
      actionDeleted: true,
    });
    expect(await countActionRows(setup.dogId as string)).toMatchObject({
      goals: 0,
      skills: 0,
      focus: 0,
    });
    expect(await trainingActionEvents(user.userId)).toEqual(beforeReplayEvents);
  });

  it("holds the referenced training goal lock across replay graph reads", async () => {
    const user = await createTestUser();
    users.push(user);

    const started = await startSetup(user);
    const setup = ((await started.json()) as SetupBody).setup;
    expect((await saveIntent(user, setup.id, "train_skill")).status).toBe(200);
    const input = {
      setupId: setup.id,
      templateKey: "puppy-fundamentals",
      weekKey: currentWeekKey(new Date(), 0),
      timezoneOffsetMinutes: 0,
    };
    const created = await createTrainingAction(user, input);
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      goal: { id: string };
      skills: Array<{ id: string }>;
    };

    const holder = await pool.connect();
    let holderInTransaction = false;
    let deleteCompleted = false;
    try {
      await holder.query("begin");
      holderInTransaction = true;
      await holder.query("select id from training_goals where id = $1 for update", [
        createdBody.goal.id,
      ]);

      const replayPromise = createTrainingAction(user, {
        ...input,
        templateKey: "basic-manners",
      });
      await waitForTrainingGoalLockWaiter();

      const deletePromise = Promise.resolve(
        app.request(`/api/dogs/${setup.dogId}/goals/${createdBody.goal.id}`, {
          method: "DELETE",
          headers: user.authHeaders,
        }),
      ).then((response) => {
        deleteCompleted = true;
        return response;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(deleteCompleted).toBe(false);

      await holder.query("commit");
      holderInTransaction = false;
      const [replay, deleted] = await Promise.all([replayPromise, deletePromise]);
      expect(replay.status).toBe(200);
      expect(await replay.json()).toMatchObject({
        goal: { id: createdBody.goal.id },
        skills: createdBody.skills,
        actionDeleted: false,
      });
      expect(deleted.status).toBe(200);
    } finally {
      if (holderInTransaction) await holder.query("rollback");
      holder.release();
    }
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
