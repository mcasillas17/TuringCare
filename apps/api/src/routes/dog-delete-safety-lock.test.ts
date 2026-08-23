import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { practiceSessions, trainingGoals, trainingSkills } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";

const lockGate = vi.hoisted(() => ({
  hold: Promise.resolve(),
  lockCalls: 0,
  markReady: undefined as (() => void) | undefined,
  markSecondCall: undefined as (() => void) | undefined,
  pauseNextCall: false,
  release: undefined as (() => void) | undefined,
}));

vi.mock("../lib/safety-lock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/safety-lock")>();
  return {
    ...actual,
    lockDogSafety: async (...args: Parameters<typeof actual.lockDogSafety>): Promise<void> => {
      lockGate.lockCalls += 1;
      if (lockGate.lockCalls === 2) lockGate.markSecondCall?.();
      await actual.lockDogSafety(...args);
      if (!lockGate.pauseNextCall) return;
      lockGate.pauseNextCall = false;
      lockGate.markReady?.();
      await lockGate.hold;
    },
  };
});

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

function resetLockGate() {
  lockGate.pauseNextCall = false;
  lockGate.lockCalls = 0;
  lockGate.markReady = undefined;
  lockGate.markSecondCall = undefined;
  lockGate.release?.();
  lockGate.release = undefined;
  lockGate.hold = Promise.resolve();
}

function pauseNextDogSafetyLock() {
  resetLockGate();
  lockGate.pauseNextCall = true;

  let releaseHold: () => void = () => {};
  lockGate.hold = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });

  const ready = new Promise<void>((resolve) => {
    lockGate.markReady = resolve;
  });
  const secondLockAttempt = new Promise<void>((resolve) => {
    lockGate.markSecondCall = resolve;
  });

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    lockGate.markReady = undefined;
    lockGate.markSecondCall = undefined;
    releaseHold();
  };
  lockGate.release = release;

  return { ready, release, secondLockAttempt };
}

describe("dog deletion safety lock ordering", () => {
  const users: TestUser[] = [];

  beforeEach(() => {
    resetLockGate();
  });

  afterEach(async () => {
    resetLockGate();
    for (let user = users.pop(); user; user = users.pop()) await user.cleanup();
  });

  async function setup() {
    const user = await createTestUser();
    users.push(user);

    const dogResponse = await app.request("/api/dogs", {
      method: "POST",
      headers: user.authHeaders,
      body: JSON.stringify(validDog),
    });
    expect(dogResponse.status).toBe(201);
    const { dog } = (await dogResponse.json()) as { dog: { id: string } };

    const [goal] = await db
      .insert(trainingGoals)
      .values({ dogId: dog.id, goal: "Calm greetings" })
      .returning();
    if (!goal) throw new Error("expected goal");

    const [skill] = await db
      .insert(trainingSkills)
      .values({ goalId: goal.id, name: "Door knock", confidence: 2 })
      .returning();
    if (!skill) throw new Error("expected skill");

    return { dog, skill, user };
  }

  it("serializes dog delete behind a safety-signaled practice write without deadlock", async () => {
    const { dog, skill, user } = await setup();
    const { ready, release, secondLockAttempt } = pauseNextDogSafetyLock();

    let practiceCompleted = false;
    const practiceWrite = Promise.resolve(
      app.request(`/api/dogs/${dog.id}/skills/${skill.id}/sessions`, {
        method: "POST",
        headers: user.authHeaders,
        body: JSON.stringify({
          occurredAt: "2026-05-22T10:00:00.000Z",
          safetySignal: "injury_or_pain",
        }),
      }),
    ).then((response) => {
      practiceCompleted = true;
      return response;
    });

    let deleteCompleted = false;
    let deleteDog: Promise<Response> | undefined;
    let practiceResponse: Response | undefined;
    let deleteResponse: Response | undefined;

    try {
      await ready;
      expect(practiceCompleted).toBe(false);

      deleteDog = Promise.resolve(
        app.request(`/api/dogs/${dog.id}`, {
          method: "DELETE",
          headers: user.authHeaders,
        }),
      ).then((response) => {
        deleteCompleted = true;
        return response;
      });

      expect(
        await Promise.race([
          secondLockAttempt.then(() => "attempted-lock" as const),
          deleteDog.then(() => "deleted-without-lock" as const),
        ]),
      ).toBe("attempted-lock");
      expect(deleteCompleted).toBe(false);

      release();
      [practiceResponse, deleteResponse] = await Promise.all([practiceWrite, deleteDog]);
    } finally {
      release();
      await Promise.allSettled(deleteDog ? [practiceWrite, deleteDog] : [practiceWrite]);
    }

    expect(practiceResponse?.status).toBe(201);
    expect(deleteResponse?.status).toBe(200);
    expect(
      await db.select().from(practiceSessions).where(eq(practiceSessions.skillId, skill.id)),
    ).toEqual([]);
    expect((await app.request(`/api/dogs/${dog.id}`, { headers: user.authHeaders })).status).toBe(
      404,
    );
  });
});
