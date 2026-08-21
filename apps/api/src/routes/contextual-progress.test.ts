import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { CURRICULUM_VERSION } from "../data/training-curriculum";
import { db, pool } from "../db";
import {
  events,
  dogSafetySignals,
  dogs,
  journalEntries,
  practiceSessions,
  session,
  trainingGoals,
  trainingSkills,
} from "../db/schema";
import { lockDogSafety } from "../lib/safety-lock";
import { type TestUser, createTestUser } from "../test-helpers";

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

const baseContext = {
  cueSupport: "hand_signal" as const,
  environment: "home_quiet" as const,
  distance: "across_room" as const,
  durationBand: "about_30_seconds" as const,
  distraction: "mild" as const,
};

const activeSafetyCases = [
  {
    name: "injury",
    signal: "injury_or_pain" as const,
    referral: "veterinarian" as const,
    ruleId: "reported_injury_or_pain" as const,
  },
  {
    name: "aggression",
    signal: "aggression_or_bite_risk" as const,
    referral: "veterinary_behaviorist" as const,
    ruleId: "reported_aggression_or_bite_risk" as const,
  },
  {
    name: "severe fear",
    signal: "severe_fear_or_panic" as const,
    referral: "veterinary_behaviorist" as const,
    ruleId: "reported_severe_fear" as const,
  },
  {
    name: "severe recorded concern",
    signal: "severe_behavior_concern" as const,
    referral: "veterinary_behaviorist" as const,
    ruleId: "severe_recorded_concern" as const,
  },
  {
    name: "sustained worsening",
    signal: null,
    referral: "credentialed_trainer" as const,
    ruleId: "sustained_worsening_intensity" as const,
  },
] as const;

type Setup = {
  user: TestUser;
  dogId: string;
  skillId: string;
};

type SessionOverrides = Partial<typeof practiceSessions.$inferInsert>;

async function makeDog(user: TestUser, name = validDog.name) {
  const response = await app.request("/api/dogs", {
    method: "POST",
    headers: user.authHeaders,
    body: JSON.stringify({ ...validDog, name }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { dog: { id: string } };
  return body.dog;
}

async function makeSkill(
  dogId: string,
  values: { confidence?: number; catalogSkillKey?: string | null; name?: string } = {},
) {
  const [goal] = await db.insert(trainingGoals).values({ dogId, goal: "Reliable sit" }).returning();
  if (!goal) throw new Error("expected goal");
  const [skill] = await db
    .insert(trainingSkills)
    .values({
      goalId: goal.id,
      name: values.name ?? "Sit",
      confidence: values.confidence ?? 3,
      catalogSkillKey:
        values.catalogSkillKey === undefined ? "basic-manners.sit" : values.catalogSkillKey,
    })
    .returning();
  if (!skill) throw new Error("expected skill");
  return skill;
}

async function setup(
  users: TestUser[],
  values: { confidence?: number; catalogSkillKey?: string | null } = {},
): Promise<Setup> {
  const user = await createTestUser();
  users.push(user);
  const dog = await makeDog(user);
  const skill = await makeSkill(dog.id, values);
  return { user, dogId: dog.id, skillId: skill.id };
}

async function insertSession(skillId: string, overrides: SessionOverrides = {}) {
  const [session] = await db
    .insert(practiceSessions)
    .values({
      skillId,
      occurredAt: new Date(Date.now() - 60 * 60 * 1000),
      outcome: "went_well",
      practiceDay: new Date().toISOString().slice(0, 10),
      curriculumLevel: 3,
      curriculumVersion: CURRICULUM_VERSION,
      ...baseContext,
      notes: "private note that must not be exposed",
      ...overrides,
    })
    .returning();
  if (!session) throw new Error("expected practice session");
  return session;
}

function detailPath(dogId: string, skillId: string) {
  return `/api/dogs/${dogId}/skills/${skillId}/contextual-progress`;
}

function eventPath(dogId: string) {
  return `/api/dogs/${dogId}/contextual-progress/events`;
}

async function getDetail(setupValue: Setup) {
  return app.request(detailPath(setupValue.dogId, setupValue.skillId), {
    headers: setupValue.user.authHeaders,
  });
}

async function waitForAdvisoryLockWaiter() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ waiting: boolean }>(
      "select exists (select 1 from pg_locks where locktype = 'advisory' and not granted and database = (select oid from pg_database where datname = current_database())) as waiting",
    );
    if (result.rows[0]?.waiting) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("timed out waiting for a contextual-progress advisory lock waiter");
}

function beginHeldSafetyWrite(dogId: string, type: "injury_or_pain" | "aggression_or_bite_risk") {
  let markReady: (() => void) | undefined;
  let release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const write = db.transaction(async (tx) => {
    await lockDogSafety(tx, dogId);
    await tx.insert(dogSafetySignals).values({
      dogId,
      type,
      source: "practice_session",
      reportedAt: new Date(),
    });
    markReady?.();
    await hold;
  });

  return { ready, release: () => release?.(), write };
}

function beginHeldSafetyLock(dogId: string) {
  let markReady: (() => void) | undefined;
  let release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const lock = db.transaction(async (tx) => {
    await lockDogSafety(tx, dogId);
    markReady?.();
    await hold;
  });

  return { ready, release: () => release?.(), lock };
}

function beginHeldSafetyWorseningThresholdWrite(dogId: string) {
  let markReady: (() => void) | undefined;
  let release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const write = db.transaction(async (tx) => {
    await lockDogSafety(tx, dogId);
    markReady?.();
    await hold;
    await tx.insert(journalEntries).values({
      dogId,
      kind: "daily_checkin",
      occurredAt: new Date(),
      note: "threshold-crossing worsening",
      intensity: 4,
      trend: "harder",
    });
  });

  return { ready, release: () => release?.(), write };
}

async function activateSafety(
  dogId: string,
  safetyCase: (typeof activeSafetyCases)[number],
): Promise<void> {
  if (safetyCase.signal) {
    await db.insert(dogSafetySignals).values({
      dogId,
      type: safetyCase.signal,
      source: "practice_session",
      reportedAt: new Date(),
    });
    return;
  }

  const occurredAt = new Date();
  await db.insert(journalEntries).values([
    {
      dogId,
      kind: "moment",
      occurredAt,
      note: "high intensity",
      intensity: 4,
    },
    {
      dogId,
      kind: "moment",
      occurredAt,
      note: "high intensity again",
      intensity: 4,
    },
    {
      dogId,
      kind: "daily_checkin",
      occurredAt,
      note: "harder check-in",
      trend: "harder",
    },
    {
      dogId,
      kind: "daily_checkin",
      occurredAt,
      note: "harder check-in again",
      trend: "harder",
    },
  ]);
}

async function seedJustBelowWorseningThreshold(dogId: string): Promise<void> {
  const occurredAt = new Date();
  await db.insert(journalEntries).values([
    {
      dogId,
      kind: "moment",
      occurredAt,
      note: "high intensity below threshold",
      intensity: 4,
    },
    {
      dogId,
      kind: "daily_checkin",
      occurredAt,
      note: "harder below threshold",
      trend: "harder",
    },
  ]);
}

async function seedReliableContext(skillId: string): Promise<void> {
  const now = new Date();
  for (const daysAgo of [2, 1]) {
    const occurredAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    await insertSession(skillId, {
      occurredAt,
      practiceDay: occurredAt.toISOString().slice(0, 10),
    });
  }
}

describe("GET /api/dogs/:id/skills/:skillId/contextual-progress", () => {
  const users: TestUser[] = [];

  afterEach(async () => {
    for (let user = users.pop(); user; user = users.pop()) await user.cleanup();
  });

  it("returns the bounded full response for manual current-level evidence", async () => {
    const setupValue = await setup(users);
    const occurredAt = new Date(Date.now() - 60 * 60 * 1000);
    const sessionResponse = await app.request(
      `/api/dogs/${setupValue.dogId}/skills/${setupValue.skillId}/sessions`,
      {
        method: "POST",
        headers: setupValue.user.authHeaders,
        body: JSON.stringify({
          occurredAt: occurredAt.toISOString(),
          timezoneOffsetMinutes: 0,
          outcome: "went_well",
          ...baseContext,
          confirmCurrentLevel: true,
        }),
      },
    );
    expect(sessionResponse.status).toBe(201);
    expect((await sessionResponse.json()) as object).toMatchObject({
      session: {
        curriculumLevel: 3,
        curriculumVersion: CURRICULUM_VERSION,
        practiceVariant: null,
        suggestionId: null,
      },
    });

    const response = await getDetail(setupValue);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown> & {
      window: { startsAt: string; endsAt: string; days: number };
      curriculumLevel: number;
      curriculumVersion: string;
      policyVersion: string;
      strongestContext: {
        context: typeof baseContext;
        status: string;
        latestOutcome: string;
        lastObservedAt: string;
      } | null;
      nextPracticeAction: unknown;
      exactContexts: Array<Record<string, unknown>>;
    };

    expect(body.window.days).toBe(21);
    expect(Date.parse(body.window.endsAt) - Date.parse(body.window.startsAt)).toBe(
      21 * 24 * 60 * 60 * 1000,
    );
    expect(body.curriculumLevel).toBe(3);
    expect(body.curriculumVersion).toBe(CURRICULUM_VERSION);
    expect(body.policyVersion).toBe("2026-08-20");
    expect(body.strongestContext).toMatchObject({
      context: baseContext,
      status: "developing",
      latestOutcome: "went_well",
      lastObservedAt: occurredAt.toISOString(),
    });
    expect(body.nextPracticeAction).toMatchObject({
      ruleId: "repeat_developing_context",
      direction: "repeat",
      changedDimension: null,
    });
    expect(body.exactContexts).toHaveLength(1);
    expect(body.exactContexts[0]).toMatchObject({
      context: baseContext,
      status: "developing",
      latestOutcome: "went_well",
    });
    expect(Object.keys(body).sort()).toEqual([
      "curriculumLevel",
      "curriculumVersion",
      "exactContexts",
      "nextPracticeAction",
      "policyVersion",
      "safety",
      "strongestContext",
      "window",
    ]);
    expect(JSON.stringify(body)).not.toContain("private note");
    expect(JSON.stringify(body)).not.toContain("durationMinutes");
  });

  it("marks two successful distinct practice days as Reliable", async () => {
    const setupValue = await setup(users);
    await insertSession(setupValue.skillId, {
      occurredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      practiceDay: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    });
    await insertSession(setupValue.skillId, {
      occurredAt: new Date(Date.now() - 60 * 60 * 1000),
      practiceDay: new Date().toISOString().slice(0, 10),
    });

    const response = await getDetail(setupValue);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      strongestContext: { status: string; successfulDistinctDays: number } | null;
    };
    expect(body.strongestContext).toMatchObject({
      status: "reliable",
      successfulDistinctDays: 2,
    });
  });

  it.each(activeSafetyCases)(
    "suppresses the action and synthetic evidence for active $name safety",
    async (safetyCase) => {
      const setupValue = await setup(users);
      const now = new Date();
      const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      await insertSession(setupValue.skillId, {
        occurredAt: daysAgo(5),
        practiceDay: daysAgo(5).toISOString().slice(0, 10),
        cueSupport: "verbal_cue",
      });
      await insertSession(setupValue.skillId, {
        occurredAt: daysAgo(4),
        practiceDay: daysAgo(4).toISOString().slice(0, 10),
        cueSupport: "verbal_cue",
      });
      await insertSession(setupValue.skillId, {
        occurredAt: daysAgo(2),
        practiceDay: daysAgo(2).toISOString().slice(0, 10),
      });
      await insertSession(setupValue.skillId, {
        occurredAt: daysAgo(1),
        practiceDay: daysAgo(1).toISOString().slice(0, 10),
        outcome: "too_hard",
      });

      await activateSafety(setupValue.dogId, safetyCase);

      const response = await getDetail(setupValue);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        safety: { suppressed: true; ruleId: string; referral: string } | null;
        nextPracticeAction: unknown;
        exactContexts: Array<{ status: string }>;
      };
      expect(body.safety).toEqual({
        suppressed: true,
        ruleId: safetyCase.ruleId,
        referral: safetyCase.referral,
      });
      expect(body.nextPracticeAction).toBeNull();
      expect(body.exactContexts).toHaveLength(2);
      expect(body.exactContexts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: "reliable" }),
          expect.objectContaining({ status: "developing" }),
        ]),
      );
      expect(body.exactContexts).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ status: "not_observed" })]),
      );
    },
  );

  it("waits for a concurrent injury report before deriving contextual evidence", async () => {
    const setupValue = await setup(users);
    await seedReliableContext(setupValue.skillId);

    const before = await getDetail(setupValue);
    expect(before.status).toBe(200);
    const beforeBody = (await before.json()) as {
      nextPracticeAction: unknown;
      exactContexts: Array<{ status: string }>;
    };
    expect(beforeBody.nextPracticeAction).not.toBeNull();
    expect(beforeBody.exactContexts).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "not_observed" })]),
    );

    const safetyWrite = beginHeldSafetyWrite(setupValue.dogId, "injury_or_pain");
    await safetyWrite.ready;
    let completed = false;
    const responsePromise = getDetail(setupValue).then((response) => {
      completed = true;
      return response;
    });

    try {
      await waitForAdvisoryLockWaiter();
      expect(completed).toBe(false);
      safetyWrite.release();
      await safetyWrite.write;

      const response = await responsePromise;
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        safety: { ruleId: string } | null;
        nextPracticeAction: unknown;
        exactContexts: Array<{ status: string }>;
      };
      expect(body.safety).toEqual(expect.objectContaining({ ruleId: "reported_injury_or_pain" }));
      expect(body.nextPracticeAction).toBeNull();
      expect(body.exactContexts).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ status: "not_observed" })]),
      );
    } finally {
      safetyWrite.release();
      await Promise.allSettled([safetyWrite.write, responsePromise]);
    }
  });

  it("uses the post-lock safety clock when worsening crosses the threshold while detail waits", async () => {
    const setupValue = await setup(users);
    await seedReliableContext(setupValue.skillId);
    await seedJustBelowWorseningThreshold(setupValue.dogId);

    const before = await getDetail(setupValue);
    expect(before.status).toBe(200);
    const beforeBody = (await before.json()) as {
      safety: unknown;
      nextPracticeAction: unknown;
      exactContexts: Array<{ status: string }>;
    };
    expect(beforeBody.safety).toBeNull();
    expect(beforeBody.nextPracticeAction).not.toBeNull();
    expect(beforeBody.exactContexts).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "not_observed" })]),
    );

    const safetyWrite = beginHeldSafetyWorseningThresholdWrite(setupValue.dogId);
    await safetyWrite.ready;
    let completed = false;
    const responsePromise = getDetail(setupValue).then((response) => {
      completed = true;
      return response;
    });

    try {
      await waitForAdvisoryLockWaiter();
      expect(completed).toBe(false);
      safetyWrite.release();
      await safetyWrite.write;

      const response = await responsePromise;
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        safety: { ruleId: string } | null;
        nextPracticeAction: unknown;
        exactContexts: Array<{ status: string }>;
      };
      expect(body.safety).toEqual(
        expect.objectContaining({ ruleId: "sustained_worsening_intensity" }),
      );
      expect(body.nextPracticeAction).toBeNull();
      expect(body.exactContexts).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ status: "not_observed" })]),
      );
    } finally {
      safetyWrite.release();
      await Promise.allSettled([safetyWrite.write, responsePromise]);
    }
  });

  it("uses the new level when a level update commits while detail waits for safety", async () => {
    const setupValue = await setup(users);
    await seedReliableContext(setupValue.skillId);
    const safetyLock = beginHeldSafetyLock(setupValue.dogId);
    await safetyLock.ready;
    let completed = false;
    const responsePromise = getDetail(setupValue).then((response) => {
      completed = true;
      return response;
    });

    try {
      await waitForAdvisoryLockWaiter();
      expect(completed).toBe(false);

      const levelUpdate = await app.request(
        `/api/dogs/${setupValue.dogId}/skills/${setupValue.skillId}/level`,
        {
          method: "PUT",
          headers: setupValue.user.authHeaders,
          body: JSON.stringify({ level: 4 }),
        },
      );
      expect(levelUpdate.status).toBe(200);

      safetyLock.release();
      await safetyLock.lock;

      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        curriculumLevel: 4,
        strongestContext: null,
        nextPracticeAction: null,
        exactContexts: [],
      });
    } finally {
      safetyLock.release();
      await Promise.allSettled([safetyLock.lock, responsePromise]);
    }
  });

  it("returns the privacy-safe 404 for a malformed dog id", async () => {
    const user = await createTestUser();
    users.push(user);

    const response = await app.request(detailPath("not-a-uuid", randomUUID()), {
      headers: user.authHeaders,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("returns the privacy-safe 404 for a malformed skill id", async () => {
    const setupValue = await setup(users);

    const response = await app.request(detailPath(setupValue.dogId, "not-a-uuid"), {
      headers: setupValue.user.authHeaders,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  describe("POST /api/dogs/:id/contextual-progress/events", () => {
    const users: TestUser[] = [];

    afterEach(async () => {
      for (let user = users.pop(); user; user = users.pop()) await user.cleanup();
    });

    it("records an owned contextual event with authenticated identity and safe properties", async () => {
      const owner = await createTestUser();
      const otherOwner = await createTestUser();
      users.push(owner, otherOwner);
      const dog = await makeDog(owner);

      const response = await app.request(eventPath(dog.id), {
        method: "POST",
        headers: owner.authHeaders,
        body: JSON.stringify({
          name: "training.context_insight_viewed",
          surface: "skill_detail",
          strongestStatus: "developing",
          hasNextAction: true,
          userId: otherOwner.userId,
          sessionId: "forged-session",
          props: { note: "must not be stored" },
        }),
      });

      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ ok: true });

      const [stored] = await db
        .select({
          name: events.name,
          userId: events.userId,
          sessionId: events.sessionId,
          props: events.props,
        })
        .from(events)
        .where(
          and(eq(events.name, "training.context_insight_viewed"), eq(events.userId, owner.userId)),
        )
        .orderBy(events.createdAt)
        .limit(1);
      const [ownerSession] = await db
        .select({ id: session.id })
        .from(session)
        .where(eq(session.userId, owner.userId))
        .limit(1);

      expect(stored).toMatchObject({
        name: "training.context_insight_viewed",
        userId: owner.userId,
        sessionId: ownerSession?.id,
        props: {
          surface: "skill_detail",
          strongestStatus: "developing",
          hasNextAction: true,
        },
      });
      expect(stored?.userId).not.toBe(otherOwner.userId);
      expect(stored?.sessionId).not.toBe("forged-session");
      expect(stored?.props).not.toHaveProperty("userId");
      expect(stored?.props).not.toHaveProperty("sessionId");
      expect(stored?.props).not.toHaveProperty("props");
    });

    it("returns 404 for another owner's dog without recording an event", async () => {
      const owner = await createTestUser();
      const otherOwner = await createTestUser();
      users.push(owner, otherOwner);
      const dog = await makeDog(owner);

      const response = await app.request(eventPath(dog.id), {
        method: "POST",
        headers: otherOwner.authHeaders,
        body: JSON.stringify({
          name: "training.context_insight_viewed",
          surface: "week",
          strongestStatus: null,
          hasNextAction: false,
        }),
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
      const stored = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.name, "training.context_insight_viewed"),
            eq(events.userId, otherOwner.userId),
          ),
        );
      expect(stored).toEqual([]);
    });

    it("returns the privacy-safe 404 for a malformed dog id without recording telemetry", async () => {
      const owner = await createTestUser();
      users.push(owner);
      const body = {
        name: "training.context_insight_viewed",
        surface: "week",
        strongestStatus: null,
        hasNextAction: false,
      } as const;

      const response = await app.request(eventPath("not-a-uuid"), {
        method: "POST",
        headers: owner.authHeaders,
        body: JSON.stringify(body),
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
      const stored = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.name, body.name), eq(events.userId, owner.userId)));
      expect(stored).toEqual([]);
    });

    it("returns malformed-dog 404 before validating an invalid event body", async () => {
      const owner = await createTestUser();
      users.push(owner);

      const response = await app.request(eventPath("not-a-uuid"), {
        method: "POST",
        headers: owner.authHeaders,
        body: JSON.stringify({
          name: "training.context_not_real",
          surface: "dashboard",
          strongestStatus: "not-a-status",
        }),
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    });

    it("does not reveal whether an unowned dog exists", async () => {
      const owner = await createTestUser();
      const otherOwner = await createTestUser();
      users.push(owner, otherOwner);
      const dog = await makeDog(owner);
      const body = {
        name: "training.context_next_action_used",
        surface: "week",
        ruleId: "repeat_developing_context",
        direction: "repeat",
      };

      const ownedByOther = await app.request(eventPath(dog.id), {
        method: "POST",
        headers: otherOwner.authHeaders,
        body: JSON.stringify(body),
      });
      const missing = await app.request(eventPath(randomUUID()), {
        method: "POST",
        headers: otherOwner.authHeaders,
        body: JSON.stringify(body),
      });

      expect(ownedByOther.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(await ownedByOther.json()).toEqual(await missing.json());
    });

    it.each(activeSafetyCases)(
      "acknowledges action use without telemetry for active $name safety",
      async (safetyCase) => {
        const owner = await createTestUser();
        users.push(owner);
        const dog = await makeDog(owner);
        await activateSafety(dog.id, safetyCase);

        const response = await app.request(eventPath(dog.id), {
          method: "POST",
          headers: owner.authHeaders,
          body: JSON.stringify({
            name: "training.context_next_action_used",
            surface: "week",
            ruleId: "advance_reliable_context",
            direction: "harder",
          }),
        });

        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ ok: true });
        const stored = await db
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.name, "training.context_next_action_used"),
              eq(events.userId, owner.userId),
            ),
          );
        expect(stored).toEqual([]);
      },
    );

    it("continues recording insight views while safety suppresses action use", async () => {
      const owner = await createTestUser();
      users.push(owner);
      const dog = await makeDog(owner);
      await activateSafety(dog.id, activeSafetyCases[0]);

      const response = await app.request(eventPath(dog.id), {
        method: "POST",
        headers: owner.authHeaders,
        body: JSON.stringify({
          name: "training.context_insight_viewed",
          surface: "week",
          strongestStatus: "reliable",
          hasNextAction: false,
        }),
      });

      expect(response.status).toBe(202);
      const [stored] = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(eq(events.name, "training.context_insight_viewed"), eq(events.userId, owner.userId)),
        )
        .limit(1);
      expect(stored).toBeDefined();
    });

    it("waits for a concurrent aggression report before accepting action-use telemetry", async () => {
      const owner = await createTestUser();
      users.push(owner);
      const dog = await makeDog(owner);
      const safetyWrite = beginHeldSafetyWrite(dog.id, "aggression_or_bite_risk");
      await safetyWrite.ready;
      let completed = false;
      const responsePromise = Promise.resolve(
        app.request(eventPath(dog.id), {
          method: "POST",
          headers: owner.authHeaders,
          body: JSON.stringify({
            name: "training.context_next_action_used",
            surface: "week",
            ruleId: "advance_reliable_context",
            direction: "harder",
          }),
        }),
      ).then((response) => {
        completed = true;
        return response;
      });

      try {
        await waitForAdvisoryLockWaiter();
        expect(completed).toBe(false);
        safetyWrite.release();
        await safetyWrite.write;

        const response = await responsePromise;
        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ ok: true });
        const stored = await db
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.name, "training.context_next_action_used"),
              eq(events.userId, owner.userId),
            ),
          );
        expect(stored).toEqual([]);
      } finally {
        safetyWrite.release();
        await Promise.allSettled([safetyWrite.write, responsePromise]);
      }
    });

    it("does not record action-use telemetry when worsening crosses the threshold while it waits", async () => {
      const owner = await createTestUser();
      users.push(owner);
      const dog = await makeDog(owner);
      await seedJustBelowWorseningThreshold(dog.id);

      const safetyWrite = beginHeldSafetyWorseningThresholdWrite(dog.id);
      await safetyWrite.ready;
      let completed = false;
      const responsePromise = Promise.resolve(
        app.request(eventPath(dog.id), {
          method: "POST",
          headers: owner.authHeaders,
          body: JSON.stringify({
            name: "training.context_next_action_used",
            surface: "week",
            ruleId: "advance_reliable_context",
            direction: "harder",
          }),
        }),
      ).then((response) => {
        completed = true;
        return response;
      });

      try {
        await waitForAdvisoryLockWaiter();
        expect(completed).toBe(false);
        safetyWrite.release();
        await safetyWrite.write;

        const response = await responsePromise;
        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ ok: true });
        const stored = await db
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.name, "training.context_next_action_used"),
              eq(events.userId, owner.userId),
            ),
          );
        expect(stored).toEqual([]);
      } finally {
        safetyWrite.release();
        await Promise.allSettled([safetyWrite.write, responsePromise]);
      }
    });

    it("rejects unknown event names with 400", async () => {
      const owner = await createTestUser();
      users.push(owner);
      const dog = await makeDog(owner);

      const response = await app.request(eventPath(dog.id), {
        method: "POST",
        headers: owner.authHeaders,
        body: JSON.stringify({
          name: "training.context_not_real",
          surface: "week",
          strongestStatus: null,
          hasNextAction: false,
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects invalid contextual event properties with 400", async () => {
      const owner = await createTestUser();
      users.push(owner);
      const dog = await makeDog(owner);

      const response = await app.request(eventPath(dog.id), {
        method: "POST",
        headers: owner.authHeaders,
        body: JSON.stringify({
          name: "training.context_insight_viewed",
          surface: "dashboard",
          strongestStatus: "developing",
          hasNextAction: "yes",
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects Not observed insight telemetry without recording an event", async () => {
      const owner = await createTestUser();
      users.push(owner);
      const dog = await makeDog(owner);

      const response = await app.request(eventPath(dog.id), {
        method: "POST",
        headers: owner.authHeaders,
        body: JSON.stringify({
          name: "training.context_insight_viewed",
          surface: "week",
          strongestStatus: "not_observed",
          hasNextAction: false,
        }),
      });

      expect(response.status).toBe(400);
      const stored = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(eq(events.name, "training.context_insight_viewed"), eq(events.userId, owner.userId)),
        );
      expect(stored).toEqual([]);
    });
  });

  it("excludes outside-window, mismatched-anchor, incomplete, and all-null-context evidence", async () => {
    const setupValue = await setup(users);
    const siblingSkill = await makeSkill(setupValue.dogId, { name: "Down" });
    const now = Date.now();
    const inside = new Date(now - 60 * 60 * 1000);
    await insertSession(setupValue.skillId, { occurredAt: inside, practiceDay: "2026-08-20" });
    await insertSession(siblingSkill.id, {
      occurredAt: new Date(now - 30 * 60 * 1000),
      outcome: "too_hard",
      practiceDay: "2026-08-20",
    });
    await insertSession(setupValue.skillId, {
      occurredAt: new Date(now - 22 * 24 * 60 * 60 * 1000),
      practiceDay: "2026-07-30",
    });
    await insertSession(setupValue.skillId, {
      occurredAt: new Date(now + 60 * 60 * 1000),
      practiceDay: "2026-08-21",
    });
    await insertSession(setupValue.skillId, {
      occurredAt: new Date(now - 2 * 60 * 60 * 1000),
      practiceDay: "2026-08-20",
      curriculumLevel: 2,
    });
    await insertSession(setupValue.skillId, {
      occurredAt: new Date(now - 3 * 60 * 60 * 1000),
      practiceDay: "2026-08-20",
      curriculumVersion: "obsolete-version",
    });
    await insertSession(setupValue.skillId, {
      occurredAt: new Date(now - 4 * 60 * 60 * 1000),
      practiceDay: "2026-08-20",
      curriculumLevel: null,
      curriculumVersion: null,
    });
    await insertSession(setupValue.skillId, {
      occurredAt: new Date(now - 5 * 60 * 60 * 1000),
      practiceDay: "2026-08-20",
      outcome: null,
    });
    await insertSession(setupValue.skillId, {
      occurredAt: new Date(now - 6 * 60 * 60 * 1000),
      practiceDay: null,
    });
    await insertSession(setupValue.skillId, {
      occurredAt: new Date(now - 7 * 60 * 60 * 1000),
      cueSupport: null,
      environment: null,
      distance: null,
      durationBand: null,
      distraction: null,
    });

    const response = await getDetail(setupValue);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      strongestContext: { lastObservedAt: string } | null;
      exactContexts: Array<{ lastObservedAt: string | null }>;
    };
    expect(body.strongestContext?.lastObservedAt).toBe(inside.toISOString());
    expect(body.exactContexts).toHaveLength(1);
    expect(body.exactContexts[0]?.lastObservedAt).toBe(inside.toISOString());
  });

  it("uses catalog metadata for adjacency while custom skills suppress synthetic evidence", async () => {
    const catalogSetup = await setup(users);
    const customSetup = await setup(users, { catalogSkillKey: null });
    const firstOccurredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const secondOccurredAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const firstPracticeDay = firstOccurredAt.toISOString().slice(0, 10);
    const secondPracticeDay = secondOccurredAt.toISOString().slice(0, 10);

    for (const skillId of [catalogSetup.skillId, customSetup.skillId]) {
      await insertSession(skillId, {
        occurredAt: firstOccurredAt,
        practiceDay: firstPracticeDay,
      });
      await insertSession(skillId, {
        occurredAt: secondOccurredAt,
        practiceDay: secondPracticeDay,
      });
    }

    const catalogResponse = await getDetail(catalogSetup);
    expect(catalogResponse.status).toBe(200);
    const catalogBody = (await catalogResponse.json()) as {
      nextPracticeAction: {
        ruleId: string;
        direction: string;
        changedDimension: string | null;
        context: typeof baseContext;
      } | null;
      exactContexts: Array<{ context: typeof baseContext; status: string }>;
    };
    expect(catalogBody.nextPracticeAction).toEqual({
      ruleId: "advance_reliable_context",
      direction: "harder",
      context: { ...baseContext, environment: "home_busy" },
      changedDimension: "environment",
    });
    expect(catalogBody.exactContexts).toEqual([
      expect.objectContaining({ context: baseContext, status: "reliable" }),
      expect.objectContaining({
        context: { ...baseContext, environment: "home_busy" },
        status: "not_observed",
      }),
    ]);

    const customResponse = await getDetail(customSetup);
    expect(customResponse.status).toBe(200);
    const customBody = (await customResponse.json()) as {
      nextPracticeAction: unknown;
      exactContexts: Array<{ status: string }>;
    };
    expect(customBody.nextPracticeAction).toBeNull();
    expect(customBody.exactContexts).toEqual([expect.objectContaining({ status: "reliable" })]);
    expect(customBody.exactContexts.some(({ status }) => status === "not_observed")).toBe(false);
  });

  it("returns the neutral response when there is no eligible evidence", async () => {
    const setupValue = await setup(users);

    const response = await getDetail(setupValue);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      strongestContext: unknown;
      nextPracticeAction: unknown;
      exactContexts: unknown[];
    };
    expect(body.strongestContext).toBeNull();
    expect(body.nextPracticeAction).toBeNull();
    expect(body.exactContexts).toEqual([]);
  });

  it("returns 404 for another owner's dog", async () => {
    const owner = await createTestUser();
    const otherOwner = await createTestUser();
    users.push(owner, otherOwner);
    const dog = await makeDog(owner);
    const skill = await makeSkill(dog.id);

    const response = await app.request(detailPath(dog.id, skill.id), {
      headers: otherOwner.authHeaders,
    });
    expect(response.status).toBe(404);
  });

  it("returns 404 for another owner's skill under an owned dog", async () => {
    const owner = await createTestUser();
    const otherOwner = await createTestUser();
    users.push(owner, otherOwner);
    const foreignDog = await makeDog(owner);
    const foreignSkill = await makeSkill(foreignDog.id);
    const ownedDog = await makeDog(otherOwner);

    const response = await app.request(detailPath(ownedDog.id, foreignSkill.id), {
      headers: otherOwner.authHeaders,
    });
    expect(response.status).toBe(404);
  });

  it("returns 404 for a same-owner skill belonging to a different dog", async () => {
    const owner = await createTestUser();
    users.push(owner);
    const firstDog = await makeDog(owner, "First");
    const secondDog = await makeDog(owner, "Second");
    const skill = await makeSkill(firstDog.id);

    const response = await app.request(detailPath(secondDog.id, skill.id), {
      headers: owner.authHeaders,
    });
    expect(response.status).toBe(404);
  });

  it("uses the larger id as the deterministic latest row when timestamps tie", async () => {
    const setupValue = await setup(users);
    const occurredAt = new Date(Date.now() - 60 * 60 * 1000);
    const [lowerId, higherId] = [randomUUID(), randomUUID()].sort();
    if (!lowerId || !higherId) throw new Error("expected two practice session ids");
    await insertSession(setupValue.skillId, {
      id: lowerId,
      occurredAt,
      outcome: "went_well",
      practiceDay: "2026-08-20",
    });
    await insertSession(setupValue.skillId, {
      id: higherId,
      occurredAt,
      outcome: "too_hard",
      practiceDay: "2026-08-20",
    });

    const response = await getDetail(setupValue);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      strongestContext: { latestOutcome: string } | null;
      nextPracticeAction: { ruleId: string; direction: string } | null;
    };
    expect(body.strongestContext?.latestOutcome).toBe("too_hard");
    expect(body.nextPracticeAction).toMatchObject({
      ruleId: "ease_after_too_hard",
      direction: "easier",
    });
  });

  it("does not expose unrelated row properties in the response", async () => {
    const setupValue = await setup(users);
    await insertSession(setupValue.skillId, {
      id: randomUUID(),
      notes: "owner-only note",
      durationMinutes: 99,
    });

    const response = await getDetail(setupValue);
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      "curriculumLevel",
      "curriculumVersion",
      "exactContexts",
      "nextPracticeAction",
      "policyVersion",
      "safety",
      "strongestContext",
      "window",
    ]);
    expect(JSON.stringify(body)).not.toContain("owner-only note");
    expect(JSON.stringify(body)).not.toContain("durationMinutes");
  });
});
