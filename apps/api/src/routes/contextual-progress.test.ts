import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { CURRICULUM_VERSION } from "../data/training-curriculum";
import { db } from "../db";
import { dogs, practiceSessions, trainingGoals, trainingSkills } from "../db/schema";
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

async function getDetail(setupValue: Setup) {
  return app.request(detailPath(setupValue.dogId, setupValue.skillId), {
    headers: setupValue.user.authHeaders,
  });
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

  it("excludes outside-window, mismatched-anchor, incomplete, and all-null-context evidence", async () => {
    const setupValue = await setup(users);
    const now = Date.now();
    const inside = new Date(now - 60 * 60 * 1000);
    await insertSession(setupValue.skillId, { occurredAt: inside, practiceDay: "2026-08-20" });
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

  it("does not synthesize adjacency or Not observed evidence for a custom skill", async () => {
    const setupValue = await setup(users, { catalogSkillKey: null });
    await insertSession(setupValue.skillId);

    const response = await getDetail(setupValue);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      nextPracticeAction: unknown;
      exactContexts: Array<{ status: string }>;
    };
    expect(body.nextPracticeAction).toMatchObject({
      ruleId: "repeat_developing_context",
      direction: "repeat",
      changedDimension: null,
    });
    expect(body.exactContexts).toEqual([expect.objectContaining({ status: "developing" })]);
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
    await insertSession(setupValue.skillId, {
      id: "00000000-0000-4000-8000-000000000001",
      occurredAt,
      outcome: "went_well",
      practiceDay: "2026-08-20",
    });
    await insertSession(setupValue.skillId, {
      id: "00000000-0000-4000-8000-000000000002",
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
      "strongestContext",
      "window",
    ]);
    expect(JSON.stringify(body)).not.toContain("owner-only note");
    expect(JSON.stringify(body)).not.toContain("durationMinutes");
  });
});
