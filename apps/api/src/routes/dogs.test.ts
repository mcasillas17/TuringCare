import { randomUUID } from "node:crypto";
import { and, count, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { db, pool } from "../db";
import {
  events,
  briefSends,
  briefs,
  guidedSetups,
  practiceSessions,
  trainingGoals,
  trainingSkills,
} from "../db/schema";
import { createMonitoringErrorHandler } from "../monitoring/error-handler";
import { type ApiEnv, requestIdMiddleware } from "../monitoring/request-id";
import { type TestUser, createTestUser } from "../test-helpers";
import { waitForBlockingChain, waitForSessionBlocked } from "../test-pg-concurrency";
import { resolveBriefSendIntent, sendFailedException } from "./dogs";

// Wraps the real `sendEmail` so its normal (log-mode, no RESEND_API_KEY)
// behavior is unchanged for every other test in this file; only the
// dedicated "send_failed" test below overrides it for a single call via
// `mockRejectedValueOnce`. This mocks the documented provider-swap seam
// (see email/send-email.ts's `ResendLike`/`SendEmailDeps`), not the whole
// dogs route module, so it stays robust across vitest's module cache.
vi.mock("../email/send-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../email/send-email")>();
  return { ...actual, sendEmail: vi.fn(actual.sendEmail) };
});

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

function briefSendBody(input: Record<string, unknown>) {
  return JSON.stringify({ idempotencyKey: randomUUID(), ...input });
}

describe("resolveBriefSendIntent", () => {
  const existing = {
    id: "send-1",
    briefId: "brief-1",
    recipient: "trainer@example.com",
    message: null,
  };

  it("distinguishes a replay, a conflicting intent, and a missing recovery row", () => {
    expect(
      resolveBriefSendIntent(existing, {
        briefId: "brief-1",
        recipient: "trainer@example.com",
      }),
    ).toEqual({ kind: "matched", send: existing });
    expect(
      resolveBriefSendIntent(existing, { briefId: "brief-1", recipient: "other@example.com" }),
    ).toEqual({ kind: "idempotency_conflict" });
    expect(
      resolveBriefSendIntent(existing, {
        briefId: "brief-2",
        recipient: "trainer@example.com",
      }),
    ).toEqual({ kind: "idempotency_conflict" });
    expect(
      resolveBriefSendIntent(undefined, {
        briefId: "brief-1",
        recipient: "trainer@example.com",
      }),
    ).toBeNull();
  });
});

function expectValidationIssue(body: unknown, path: string, message?: string) {
  const result = body as {
    success?: boolean;
    error?: { issues?: Array<{ path?: Array<string | number>; message?: string }> };
  };
  expect(result.success).toBe(false);
  expect(
    result.error?.issues?.some(
      (issue) => issue.path?.includes(path) && (message === undefined || issue.message === message),
    ),
  ).toBe(true);
}

describe("dogs: list & create", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  it("GET /api/dogs requires auth", async () => {
    const res = await app.request("/api/dogs");
    expect(res.status).toBe(401);
  });

  it("creates and lists the caller's dogs", async () => {
    const u = await createTestUser();
    users.push(u);

    const empty = await app.request("/api/dogs", { headers: u.authHeaders });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ dogs: [] });

    const created = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    expect(created.status).toBe(201);
    const { dog } = (await created.json()) as { dog: { id: string; name: string } };
    expect(dog.name).toBe("Biscuit");

    const list = await app.request("/api/dogs", { headers: u.authHeaders });
    expect(((await list.json()) as { dogs: unknown[] }).dogs).toHaveLength(1);
  });

  it("rejects an invalid body with 400", async () => {
    const u = await createTestUser();
    users.push(u);
    const res = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("does not list another user's dogs", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    await app.request("/api/dogs", {
      method: "POST",
      headers: a.authHeaders,
      body: JSON.stringify(validDog),
    });
    const bList = await app.request("/api/dogs", { headers: b.authHeaders });
    expect(((await bList.json()) as { dogs: unknown[] }).dogs).toEqual([]);
  });
});

describe("dogs: get/update/delete", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  async function makeDog(u: TestUser) {
    const res = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    return ((await res.json()) as { dog: { id: string } }).dog;
  }

  it("GET /api/dogs/:id returns the dog with empty concerns & goals", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const res = await app.request(`/api/dogs/${dog.id}`, { headers: u.authHeaders });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      dog: { id: dog.id, name: "Biscuit" },
      concerns: [],
      goals: [],
    });
  });

  it("PUT updates the core profile", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const res = await app.request(`/api/dogs/${dog.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ ...validDog, name: "Biscuit II" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { dog: { name: string } }).dog.name).toBe("Biscuit II");
  });

  it("DELETE removes the dog", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const del = await app.request(`/api/dogs/${dog.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });
    expect(del.status).toBe(200);
    const after = await app.request(`/api/dogs/${dog.id}`, { headers: u.authHeaders });
    expect(after.status).toBe(404);
  });

  it("DELETE returns 409 when an active guided setup still references the dog", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    await db.insert(guidedSetups).values({ userId: u.userId, dogId: dog.id });

    const del = await app.request(`/api/dogs/${dog.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });

    expect(del.status).toBe(409);
    expect(await del.json()).toEqual({ error: "active_guided_setup" });
    expect((await app.request(`/api/dogs/${dog.id}`, { headers: u.authHeaders })).status).toBe(200);
  });

  it("DELETE preserves completed guided setup history with dogId null", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    await db.insert(guidedSetups).values({
      userId: u.userId,
      dogId: dog.id,
      currentStep: "action",
      intent: "train_skill",
      completedAt: new Date(),
      completionReason: "skipped",
    });

    const del = await app.request(`/api/dogs/${dog.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });

    expect(del.status).toBe(200);
    const [historical] = await db
      .select()
      .from(guidedSetups)
      .where(eq(guidedSetups.userId, u.userId));
    expect(historical).toMatchObject({
      userId: u.userId,
      dogId: null,
      currentStep: "action",
      intent: "train_skill",
      completionReason: "skipped",
    });
    expect(historical?.completedAt).toBeInstanceOf(Date);
  });

  it("owner isolation: another user gets 404 on get/put/delete", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    expect((await app.request(`/api/dogs/${dog.id}`, { headers: b.authHeaders })).status).toBe(404);
    expect(
      (
        await app.request(`/api/dogs/${dog.id}`, {
          method: "PUT",
          headers: b.authHeaders,
          body: JSON.stringify(validDog),
        })
      ).status,
    ).toBe(404);
    expect(
      (await app.request(`/api/dogs/${dog.id}`, { method: "DELETE", headers: b.authHeaders }))
        .status,
    ).toBe(404);
  });
});

describe("dogs: concerns & goals", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });
  async function makeDog(u: TestUser) {
    const res = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    return ((await res.json()) as { dog: { id: string } }).dog;
  }

  it("adds and removes a concern; appears in GET", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const add = await app.request(`/api/dogs/${dog.id}/concerns`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ concern: "Leash reactivity", severity: "moderate" }),
    });
    expect(add.status).toBe(201);
    const { concern } = (await add.json()) as { concern: { id: string } };

    const got = await app.request(`/api/dogs/${dog.id}`, { headers: u.authHeaders });
    expect(((await got.json()) as { concerns: unknown[] }).concerns).toHaveLength(1);

    const del = await app.request(`/api/dogs/${dog.id}/concerns/${concern.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });
    expect(del.status).toBe(200);
    const after = await app.request(`/api/dogs/${dog.id}`, { headers: u.authHeaders });
    expect(((await after.json()) as { concerns: unknown[] }).concerns).toEqual([]);
  });

  it("adds a goal with no default skill, then removes it", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const add = await app.request(`/api/dogs/${dog.id}/goals`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ goal: "Calm greetings" }),
    });
    expect(add.status).toBe(201);
    const body = (await add.json()) as { goal: { id: string }; skill?: unknown };
    expect(body.goal).toBeTruthy();
    expect(body.skill).toBeUndefined();
    const progress = await app.request(`/api/dogs/${dog.id}/progress`, { headers: u.authHeaders });
    const progressBody = (await progress.json()) as { goals: Array<{ skills: unknown[] }> };
    expect(progressBody.goals[0]?.skills).toEqual([]);
    const del = await app.request(`/api/dogs/${dog.id}/goals/${body.goal.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });
    expect(del.status).toBe(200);
  });

  it("invalid concern body → 400", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const res = await app.request(`/api/dogs/${dog.id}/concerns`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ concern: "", severity: "nope" }),
    });
    expect(res.status).toBe(400);
  });

  it("owner isolation: cannot add a concern to another user's dog", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    const res = await app.request(`/api/dogs/${dog.id}/concerns`, {
      method: "POST",
      headers: b.authHeaders,
      body: JSON.stringify({ concern: "x", severity: "mild" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("dogs: journal", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });
  async function makeDog(u: TestUser) {
    const r = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    return ((await r.json()) as { dog: { id: string } }).dog;
  }
  const entry = {
    kind: "moment",
    note: "Barked at the doorbell",
    intensity: 3,
  };

  it("adds, lists, updates, and deletes a note-first moment", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const add = await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(entry),
    });
    expect(add.status).toBe(201);
    const { entry: created } = (await add.json()) as {
      entry: {
        id: string;
        note: string;
        kind: string;
        occurredAt: string;
        antecedent: string | null;
        behavior: string | null;
        consequence: string | null;
        intensity: number | null;
      };
    };
    expect(created).toMatchObject({
      note: "Barked at the doorbell",
      kind: "moment",
      antecedent: null,
      behavior: null,
      consequence: null,
      intensity: 3,
    });
    expect(new Date(created.occurredAt).toString()).not.toBe("Invalid Date");

    const update = await app.request(`/api/dogs/${dog.id}/journal/${created.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ antecedent: "Doorbell rang" }),
    });
    expect(update.status).toBe(200);
    expect(((await update.json()) as { entry: { antecedent: string } }).entry.antecedent).toBe(
      "Doorbell rang",
    );

    const list = await app.request(`/api/dogs/${dog.id}/journal`, { headers: u.authHeaders });
    expect(((await list.json()) as { entries: unknown[] }).entries).toHaveLength(1);
    const del = await app.request(`/api/dogs/${dog.id}/journal/${created.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });
    expect(del.status).toBe(200);
    const after = await app.request(`/api/dogs/${dog.id}/journal`, { headers: u.authHeaders });
    expect(((await after.json()) as { entries: unknown[] }).entries).toEqual([]);
  });
  it("rejects invalid entry (400)", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const r = await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ ...entry, intensity: 9 }),
    });
    expect(r.status).toBe(400);
  });
  it("rejects invalid occurredAt on POST without inserting", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const r = await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ ...entry, occurredAt: "not-a-date" }),
    });
    expect(r.status).toBe(400);
    expectValidationIssue(await r.json(), "occurredAt", "validation.dateInvalid");

    const list = await app.request(`/api/dogs/${dog.id}/journal`, { headers: u.authHeaders });
    expect(((await list.json()) as { entries: unknown[] }).entries).toEqual([]);
  });
  it("creates a daily check-in with trend and no intensity", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const add = await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        kind: "daily_checkin",
        trend: "better",
        note: "Settled faster after lunch.",
      }),
    });
    expect(add.status).toBe(201);
    const body = (await add.json()) as {
      entry: { kind: string; trend: string; note: string; intensity: number | null };
    };
    expect(body.entry).toMatchObject({
      kind: "daily_checkin",
      trend: "better",
      note: "Settled faster after lunch.",
      intensity: null,
    });
  });
  it("owner isolation: other user 404 on list/add", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    expect(
      (await app.request(`/api/dogs/${dog.id}/journal`, { headers: b.authHeaders })).status,
    ).toBe(404);
    expect(
      (
        await app.request(`/api/dogs/${dog.id}/journal`, {
          method: "POST",
          headers: b.authHeaders,
          body: JSON.stringify(entry),
        })
      ).status,
    ).toBe(404);
  });
  it("POST persists the four optional capture fields", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const r = await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        ...entry,
        durationSeconds: 12,
        recoverySeconds: 45,
        peoplePresent: "Owner + walker",
        ownerResponse: "Asked for sit",
      }),
    });
    expect(r.status).toBe(201);
    const list = await app.request(`/api/dogs/${dog.id}/journal`, { headers: u.authHeaders });
    const { entries } = (await list.json()) as {
      entries: {
        durationSeconds: number | null;
        recoverySeconds: number | null;
        peoplePresent: string | null;
        ownerResponse: string | null;
      }[];
    };
    expect(entries).toHaveLength(1);
    const [first] = entries;
    if (!first) throw new Error("expected one entry");
    expect(first.durationSeconds).toBe(12);
    expect(first.recoverySeconds).toBe(45);
    expect(first.peoplePresent).toBe("Owner + walker");
    expect(first.ownerResponse).toBe("Asked for sit");
  });
});

describe("dogs: progress overview", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });
  async function makeDog(u: TestUser) {
    const r = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    return ((await r.json()) as { dog: { id: string } }).dog;
  }

  it("GET /progress returns goals, skills, averages, and recent sessions", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const [goal] = await db
      .insert(trainingGoals)
      .values({ dogId: dog.id, goal: "Calm greetings" })
      .returning();
    if (!goal) throw new Error("expected goal");
    const [skill] = await db
      .insert(trainingSkills)
      .values({ goalId: goal.id, name: "Door-knock threshold", confidence: 3, position: 1 })
      .returning();
    if (!skill) throw new Error("expected skill");
    await db.insert(practiceSessions).values({
      skillId: skill.id,
      occurredAt: new Date("2026-05-22T10:00:00.000Z"),
      durationMinutes: 12,
      notes: "Held sit through two knocks",
    });

    const res = await app.request(`/api/dogs/${dog.id}/progress`, { headers: u.authHeaders });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      goals: Array<{
        goal: string;
        avgConfidence: number | null;
        skills: Array<{
          name: string;
          confidence: number;
          sessionCount: number;
          lastNote: string | null;
          sessions: Array<{ id: string; notes: string | null }>;
        }>;
      }>;
    };
    expect(body.goals).toHaveLength(1);
    expect(body.goals[0]?.goal).toBe("Calm greetings");
    expect(body.goals[0]?.avgConfidence).toBe(3);
    expect(
      body.goals[0]?.skills.some(
        (s) =>
          s.name === "Door-knock threshold" &&
          s.sessionCount === 1 &&
          s.lastNote === "Held sit through two knocks" &&
          s.sessions.length === 1,
      ),
    ).toBe(true);
  });

  it("GET /progress is owner scoped", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    const res = await app.request(`/api/dogs/${dog.id}/progress`, { headers: b.authHeaders });
    expect(res.status).toBe(404);
  });
});

describe("dogs: progress skills", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  async function makeDog(u: TestUser, name = validDog.name) {
    const r = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ ...validDog, name }),
    });
    return ((await r.json()) as { dog: { id: string } }).dog;
  }

  async function makeGoal(dogId: string, goalName = "Calm greetings") {
    const [goal] = await db.insert(trainingGoals).values({ dogId, goal: goalName }).returning();
    if (!goal) throw new Error("expected goal");
    return goal;
  }

  async function makeSkill(goalId: string, name = "Calm greetings", position = 0) {
    const [skill] = await db
      .insert(trainingSkills)
      .values({ goalId, name, confidence: 1, position })
      .returning();
    if (!skill) throw new Error("expected skill");
    return skill;
  }

  it("POST /goals/:goalId/skills creates the next-position skill", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    await makeSkill(goal.id, "Calm greetings", 0);

    const res = await app.request(`/api/dogs/${dog.id}/goals/${goal.id}/skills`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ name: "Door-knock threshold", confidence: 3 }),
    });

    expect(res.status).toBe(201);
    const { skill } = (await res.json()) as {
      skill: { name: string; confidence: number; position: number };
    };
    expect(skill.name).toBe("Door-knock threshold");
    expect(skill.confidence).toBe(3);
    expect(skill.position).toBe(1);
  });

  it("PUT /skills/:skillId updates the name only; confidence is owned by the level route", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    const skill = await makeSkill(goal.id); // created at confidence 1

    const res = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ name: "Greet on mat", confidence: 4 }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { skill: { name: string; confidence: number } };
    expect(body.skill.name).toBe("Greet on mat");
    // confidence in the body is ignored — level changes go through PUT .../level
    expect(body.skill.confidence).toBe(1);
  });

  it("DELETE /skills/:skillId removes the skill from progress", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    const skill = await makeSkill(goal.id, "Door-knock threshold");

    const res = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });

    expect(res.status).toBe(200);
    const progress = await app.request(`/api/dogs/${dog.id}/progress`, { headers: u.authHeaders });
    const body = (await progress.json()) as { goals: Array<{ skills: unknown[] }> };
    expect(body.goals[0]?.skills).toEqual([]);
  });

  it("returns 404 for another owner's skill", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    const goal = await makeGoal(dog.id);
    const skill = await makeSkill(goal.id);

    const res = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}`, {
      method: "PUT",
      headers: b.authHeaders,
      body: JSON.stringify({ name: "Nope", confidence: 2 }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 when adding a skill to another dog's goal through this dog path", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u, "Biscuit");
    const otherDog = await makeDog(u, "Pancake");
    const otherGoal = await makeGoal(otherDog.id);

    const res = await app.request(`/api/dogs/${dog.id}/goals/${otherGoal.id}/skills`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ name: "Wrong dog", confidence: 2 }),
    });

    expect(res.status).toBe(404);
  });

  it("allows PUT in CORS preflight for the skill level route", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    const skill = await makeSkill(goal.id);

    const options = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}/level`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "PUT" },
    });

    expect(options.headers.get("access-control-allow-methods")).toContain("PUT");
  });
});

describe("dogs: progress sessions", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  async function makeDog(u: TestUser, name = validDog.name) {
    const r = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ ...validDog, name }),
    });
    return ((await r.json()) as { dog: { id: string } }).dog;
  }

  async function makeGoal(dogId: string) {
    const [goal] = await db
      .insert(trainingGoals)
      .values({ dogId, goal: "Calm greetings" })
      .returning();
    if (!goal) throw new Error("expected goal");
    return goal;
  }

  async function makeSkill(goalId: string) {
    const [skill] = await db
      .insert(trainingSkills)
      .values({ goalId, name: "Door-knock threshold", confidence: 3 })
      .returning();
    if (!skill) throw new Error("expected skill");
    return skill;
  }

  it("POST /skills/:skillId/sessions logs a session and progress summarizes it", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    const skill = await makeSkill(goal.id);

    const res = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}/sessions`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        occurredAt: "2026-05-22T10:00:00.000Z",
        durationMinutes: 12,
        notes: "Held sit through two knocks",
      }),
    });

    expect(res.status).toBe(201);
    const { session } = (await res.json()) as { session: { id: string; notes: string | null } };
    expect(session.notes).toBe("Held sit through two knocks");

    const progress = await app.request(`/api/dogs/${dog.id}/progress`, { headers: u.authHeaders });
    const body = (await progress.json()) as {
      goals: Array<{
        skills: Array<{
          sessionCount: number;
          lastSessionAt: string | null;
          lastNote: string | null;
          sessions: unknown[];
        }>;
      }>;
    };
    const firstSkill = body.goals[0]?.skills[0];
    if (!firstSkill) throw new Error("expected progress skill");
    expect(firstSkill.sessionCount).toBe(1);
    expect(firstSkill.lastSessionAt).toBe("2026-05-22T10:00:00.000Z");
    expect(firstSkill.lastNote).toBe("Held sit through two knocks");
    expect(firstSkill.sessions).toHaveLength(1);
  });

  it("DELETE /skills/:skillId/sessions/:sessionId removes a session from progress", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    const skill = await makeSkill(goal.id);
    const [session] = await db
      .insert(practiceSessions)
      .values({
        skillId: skill.id,
        occurredAt: new Date("2026-05-22T10:00:00.000Z"),
        notes: "Held sit",
      })
      .returning();
    if (!session) throw new Error("expected session");

    const res = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}/sessions/${session.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });

    expect(res.status).toBe(200);
    const progress = await app.request(`/api/dogs/${dog.id}/progress`, { headers: u.authHeaders });
    const body = (await progress.json()) as {
      goals: Array<{ skills: Array<{ sessionCount: number }> }>;
    };
    expect(body.goals[0]?.skills[0]?.sessionCount).toBe(0);
  });

  it("returns 404 when logging a session for a skill from another dog path", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u, "Biscuit");
    const otherDog = await makeDog(u, "Pancake");
    const otherGoal = await makeGoal(otherDog.id);
    const otherSkill = await makeSkill(otherGoal.id);

    const res = await app.request(`/api/dogs/${dog.id}/skills/${otherSkill.id}/sessions`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ occurredAt: "2026-05-22T10:00:00.000Z" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("dogs: brief", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });
  async function makeDog(u: TestUser) {
    const r = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    return ((await r.json()) as { dog: { id: string } }).dog;
  }
  it("generates, fetches, finalizes a brief", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const none = await app.request(`/api/dogs/${dog.id}/brief`, { headers: u.authHeaders });
    expect(none.status).toBe(200);
    expect(((await none.json()) as { brief: unknown }).brief).toBeNull();
    const goalRes = await app.request(`/api/dogs/${dog.id}/goals`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ goal: "Calm greetings" }),
    });
    const { goal } = (await goalRes.json()) as { goal: { id: string } };
    const skillRes = await app.request(`/api/dogs/${dog.id}/goals/${goal.id}/skills`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ name: "Calm greetings", confidence: 1 }),
    });
    const { skill } = (await skillRes.json()) as { skill: { id: string } };
    await app.request(`/api/dogs/${dog.id}/skills/${skill.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ name: "Door-knock threshold", confidence: 3 }),
    });
    await app.request(`/api/dogs/${dog.id}/skills/${skill.id}/sessions`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        occurredAt: "2026-05-22T10:00:00.000Z",
        durationMinutes: 12,
        notes: "Held sit through two knocks",
      }),
    });
    const gen = await app.request(`/api/dogs/${dog.id}/brief`, {
      method: "POST",
      headers: u.authHeaders,
    });
    expect(gen.status).toBe(201);
    const { brief } = (await gen.json()) as {
      brief: { id: string; version: number; status: string; summary: string };
    };
    expect(brief.version).toBe(1);
    expect(brief.status).toBe("draft");
    expect(brief.summary).toContain("Biscuit");
    expect(brief.summary).toContain("Training progress:");
    expect(brief.summary).toContain("Door-knock threshold");
    const gen2 = await app.request(`/api/dogs/${dog.id}/brief`, {
      method: "POST",
      headers: u.authHeaders,
    });
    expect(((await gen2.json()) as { brief: { version: number } }).brief.version).toBe(2);
    const fin = await app.request(`/api/dogs/${dog.id}/brief`, {
      method: "PUT",
      headers: u.authHeaders,
    });
    expect(fin.status).toBe(200);
    expect(((await fin.json()) as { brief: { status: string } }).brief.status).toBe("finalized");
  });

  it("serializes concurrent generations and keeps every latest-brief consumer deterministic", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);

    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        app.request(`/api/dogs/${dog.id}/brief`, {
          method: "POST",
          headers: {
            ...u.authHeaders,
            "X-TuringCare-Locale": index % 2 === 0 ? "en" : "es",
          },
        }),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual(Array(8).fill(201));

    const generated = await Promise.all(
      responses.map(
        async (response) =>
          (await response.json()) as {
            brief: { id: string; version: number; locale: "en" | "es"; summary: string };
          },
      ),
    );
    const briefsByVersion = generated
      .map(({ brief }) => brief)
      .sort((a, b) => a.version - b.version);
    expect(briefsByVersion.map(({ version }) => version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(briefsByVersion.map(({ id }) => id))).toHaveLength(8);
    const latest = briefsByVersion.at(-1);
    if (!latest) throw new Error("expected a latest generated brief");

    const fetched = await app.request(`/api/dogs/${dog.id}/brief`, { headers: u.authHeaders });
    expect((await fetched.json()) as object).toMatchObject({ brief: latest });

    const finalized = await app.request(`/api/dogs/${dog.id}/brief`, {
      method: "PUT",
      headers: u.authHeaders,
    });
    expect((await finalized.json()) as object).toMatchObject({
      brief: { id: latest.id, version: latest.version, locale: latest.locale, status: "finalized" },
    });

    const shared = await app.request(`/api/dogs/${dog.id}/brief/share`, {
      method: "POST",
      headers: u.authHeaders,
    });
    const { token } = (await shared.json()) as { token: string };
    const publicBrief = await app.request(`/api/share/brief/${token}`);
    expect((await publicBrief.json()) as object).toMatchObject({
      brief: {
        version: latest.version,
        locale: latest.locale,
        summary: latest.summary,
        status: "finalized",
      },
    });

    const { sendEmail } = await import("../email/send-email");
    vi.mocked(sendEmail).mockClear();
    const sent = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: {
        ...u.authHeaders,
        "X-TuringCare-Locale": latest.locale === "en" ? "es" : "en",
      },
      body: briefSendBody({ briefId: latest.id, recipient: "trainer@example.com" }),
    });
    expect(sent.status).toBe(201);
    const email = vi.mocked(sendEmail).mock.calls[0]?.[0];
    expect(email?.subject).toBe(
      latest.locale === "es" ? "Resumen de conducta: Biscuit" : "Behavior Brief: Biscuit",
    );
    expect(email?.html).toContain(`<html lang="${latest.locale}">`);
  });

  it("returns 404 when the dog is deleted before the generation transaction locks it", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const deleter = await pool.connect();
    let deleterOpen = false;

    try {
      await deleter.query("BEGIN");
      deleterOpen = true;
      await deleter.query(`SELECT "id" FROM "dogs" WHERE "id" = $1 FOR UPDATE`, [dog.id]);
      const pidResult = await deleter.query<{ pid: number }>(
        "SELECT pg_backend_pid()::integer AS pid",
      );
      const deleterPid = Number(pidResult.rows[0]?.pid);

      const generation = app.request(`/api/dogs/${dog.id}/brief`, {
        method: "POST",
        headers: u.authHeaders,
      });
      await waitForBlockingChain(pool, deleterPid, 1);
      await deleter.query(`DELETE FROM "dogs" WHERE "id" = $1`, [dog.id]);
      await deleter.query("COMMIT");
      deleterOpen = false;

      const response = await generation;
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    } finally {
      if (deleterOpen) await deleter.query("ROLLBACK");
      deleter.release();
    }
  });

  it("finalizes the newest Brief when generation queued first on the dog lifecycle lock", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    await app.request(`/api/dogs/${dog.id}/brief`, { method: "POST", headers: u.authHeaders });
    const blocker = await pool.connect();
    let blockerOpen = false;

    try {
      await blocker.query("BEGIN");
      blockerOpen = true;
      await blocker.query(`SELECT "id" FROM "dogs" WHERE "id" = $1 FOR UPDATE`, [dog.id]);
      const pidResult = await blocker.query<{ pid: number }>(
        "SELECT pg_backend_pid()::integer AS pid",
      );
      const blockerPid = Number(pidResult.rows[0]?.pid);

      const generation = app.request(`/api/dogs/${dog.id}/brief`, {
        method: "POST",
        headers: u.authHeaders,
      });
      await waitForBlockingChain(pool, blockerPid, 1);
      const finalization = app.request(`/api/dogs/${dog.id}/brief`, {
        method: "PUT",
        headers: u.authHeaders,
      });
      await waitForBlockingChain(pool, blockerPid, 2);
      await blocker.query("COMMIT");
      blockerOpen = false;

      const [generatedResponse, finalizedResponse] = await Promise.all([generation, finalization]);
      const generated = (await generatedResponse.json()) as {
        brief: { id: string; version: number };
      };
      const finalized = (await finalizedResponse.json()) as {
        brief: { id: string; version: number; status: string };
      };
      expect(finalizedResponse.status).toBe(200);
      expect(finalized.brief).toMatchObject({
        id: generated.brief.id,
        version: generated.brief.version,
        status: "finalized",
      });
    } finally {
      if (blockerOpen) await blocker.query("ROLLBACK");
      blocker.release();
    }
  });

  it("returns 404 when dog deletion queued before finalization", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    await app.request(`/api/dogs/${dog.id}/brief`, { method: "POST", headers: u.authHeaders });
    const blocker = await pool.connect();
    let blockerOpen = false;

    try {
      await blocker.query("BEGIN");
      blockerOpen = true;
      await blocker.query(`SELECT "id" FROM "dogs" WHERE "id" = $1 FOR UPDATE`, [dog.id]);
      const pidResult = await blocker.query<{ pid: number }>(
        "SELECT pg_backend_pid()::integer AS pid",
      );
      const blockerPid = Number(pidResult.rows[0]?.pid);

      const deletion = app.request(`/api/dogs/${dog.id}`, {
        method: "DELETE",
        headers: u.authHeaders,
      });
      await waitForBlockingChain(pool, blockerPid, 1);
      const finalization = app.request(`/api/dogs/${dog.id}/brief`, {
        method: "PUT",
        headers: u.authHeaders,
      });
      await waitForBlockingChain(pool, blockerPid, 2);
      await blocker.query("COMMIT");
      blockerOpen = false;

      const [deletedResponse, finalizedResponse] = await Promise.all([deletion, finalization]);
      expect(deletedResponse.status).toBe(200);
      expect(finalizedResponse.status).toBe(404);
      expect(await finalizedResponse.json()).toEqual({ error: "not_found" });
    } finally {
      if (blockerOpen) await blocker.query("ROLLBACK");
      blocker.release();
    }
  });

  it("enforces unique Brief versions per dog at the database boundary", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    await db.insert(briefs).values({ dogId: dog.id, summary: "version one", version: 1 });

    let duplicateError: unknown;
    try {
      await db.insert(briefs).values({ dogId: dog.id, summary: "duplicate version", version: 1 });
    } catch (error) {
      duplicateError = error;
    }
    expect(duplicateError).toBeInstanceOf(Error);
    expect((duplicateError as { cause?: { constraint?: string } }).cause?.constraint).toBe(
      "briefs_dog_id_version_unique",
    );
  });

  it("fails every latest-Brief consumer closed on a legacy duplicate maximum", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const legacyToken = `legacy-duplicate-${Date.now()}`;
    let constraintDropped = false;

    try {
      await pool.query(`ALTER TABLE "briefs" DROP CONSTRAINT "briefs_dog_id_version_unique"`);
      constraintDropped = true;
      await db.insert(briefs).values([
        {
          dogId: dog.id,
          summary: "older finalized artifact",
          version: 7,
          status: "finalized",
          locale: "en",
          generatedAt: new Date("2026-08-22T12:00:00Z"),
          shareToken: legacyToken,
        },
        {
          dogId: dog.id,
          summary: "newer draft artifact",
          version: 7,
          status: "draft",
          locale: "es",
          generatedAt: new Date("2026-08-23T12:00:00Z"),
        },
      ]);
      const { sendEmail } = await import("../email/send-email");
      vi.mocked(sendEmail).mockClear();

      const responses = await Promise.all([
        app.request(`/api/dogs/${dog.id}/brief`, { headers: u.authHeaders }),
        app.request(`/api/dogs/${dog.id}/brief`, { method: "PUT", headers: u.authHeaders }),
        app.request(`/api/dogs/${dog.id}/brief/share`, {
          method: "POST",
          headers: u.authHeaders,
        }),
        app.request(`/api/dogs/${dog.id}/brief/share`, {
          method: "DELETE",
          headers: u.authHeaders,
        }),
        app.request(`/api/dogs/${dog.id}/brief/send`, {
          method: "POST",
          headers: u.authHeaders,
          body: briefSendBody({ briefId: randomUUID(), recipient: "legacy-conflict@example.com" }),
        }),
      ]);

      expect(responses.map(({ status }) => status)).toEqual([409, 409, 409, 409, 409]);
      for (const response of responses) {
        expect(await response.json()).toEqual({ error: "brief_version_conflict" });
      }
      expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();

      const [accountOverview, dogsOverview] = await Promise.all([
        app.request("/api/overview", { headers: u.authHeaders }),
        app.request("/api/dogs/overview", { headers: u.authHeaders }),
      ]);
      expect(accountOverview.status).toBe(200);
      expect(await accountOverview.json()).toMatchObject({
        latestBrief: null,
        latestBriefAmbiguous: true,
      });
      expect(dogsOverview.status).toBe(200);
      const dogsOverviewBody = (await dogsOverview.json()) as {
        dogs: Array<{
          id: string;
          summary: {
            briefStatus: "draft" | "finalized" | null;
            briefVersion: number | null;
            briefAmbiguous: boolean;
          };
        }>;
      };
      expect(dogsOverviewBody.dogs.find(({ id }) => id === dog.id)?.summary).toMatchObject({
        briefStatus: null,
        briefVersion: null,
        briefAmbiguous: true,
      });

      const repaired = await app.request(`/api/dogs/${dog.id}/brief`, {
        method: "POST",
        headers: u.authHeaders,
      });
      expect(repaired.status).toBe(201);
      expect((await repaired.json()) as object).toMatchObject({ brief: { version: 8 } });
      const latestAfterRepair = await app.request(`/api/dogs/${dog.id}/brief`, {
        headers: u.authHeaders,
      });
      expect(latestAfterRepair.status).toBe(200);
      expect((await latestAfterRepair.json()) as object).toMatchObject({ brief: { version: 8 } });
      expect(
        await db
          .select({ status: briefs.status, shareToken: briefs.shareToken })
          .from(briefs)
          .where(eq(briefs.dogId, dog.id)),
      ).toEqual(
        expect.arrayContaining([
          { status: "finalized", shareToken: null },
          { status: "draft", shareToken: null },
        ]),
      );
      expect(
        await db
          .select({ id: briefSends.id })
          .from(briefSends)
          .where(eq(briefSends.sentByUserId, u.userId)),
      ).toEqual([]);
    } finally {
      if (constraintDropped) {
        await db.delete(briefs).where(eq(briefs.dogId, dog.id));
        await pool.query(
          `ALTER TABLE "briefs" ADD CONSTRAINT "briefs_dog_id_version_unique" UNIQUE ("dog_id", "version")`,
        );
      }
    }
  });

  it("owner isolation: other user 404", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    expect(
      (await app.request(`/api/dogs/${dog.id}/brief`, { method: "POST", headers: b.authHeaders }))
        .status,
    ).toBe(404);
    expect(
      (await app.request(`/api/dogs/${dog.id}/brief`, { headers: b.authHeaders })).status,
    ).toBe(404);
  });

  it("scopes the brief to the selected window and tallies check-in trends", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const old = new Date(Date.now() - 100 * 86_400_000).toISOString();

    await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ kind: "moment", note: "recent walk", occurredAt: recent }),
    });
    await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ kind: "moment", note: "ancient incident", occurredAt: old }),
    });
    await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        kind: "daily_checkin",
        note: "good day",
        trend: "better",
        occurredAt: recent,
      }),
    });

    const res = await app.request(`/api/dogs/${dog.id}/brief?window=7d`, {
      method: "POST",
      headers: u.authHeaders,
    });
    expect(res.status).toBe(201);
    const { brief } = (await res.json()) as { brief: { summary: string } };
    expect(brief.summary).toContain("2 entries in the last 7 days");
    expect(brief.summary).toContain("recent walk");
    expect(brief.summary).not.toContain("ancient incident");
    expect(brief.summary).toContain("Check-ins: 1 better, 0 same, 0 harder.");
  });

  it("stores the validated request locale when generating a Spanish brief", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);

    const res = await app.request(`/api/dogs/${dog.id}/brief`, {
      method: "POST",
      headers: { ...u.authHeaders, "X-TuringCare-Locale": "es" },
    });

    expect(res.status).toBe(201);
    const { brief } = (await res.json()) as {
      brief: { locale: string; summary: string };
    };
    expect(brief.locale).toBe("es");
    expect(brief.summary).toContain("Preocupaciones:");
    expect(brief.summary).toContain("Diario: 0 entradas en los últimos 30 días");
  });

  it("keeps the English default for briefs generated without a locale header", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);

    const res = await app.request(`/api/dogs/${dog.id}/brief`, {
      method: "POST",
      headers: u.authHeaders,
    });

    expect(res.status).toBe(201);
    const { brief } = (await res.json()) as {
      brief: { locale: string; summary: string };
    };
    expect(brief.locale).toBe("en");
    expect(brief.summary).toContain("Concerns:");
    expect(brief.summary).toContain("Journal: 0 entries in the last 30 days");
  });
});

describe("dogs: journal PUT", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });
  async function makeDog(u: TestUser, body = validDog) {
    const r = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(body),
    });
    return ((await r.json()) as { dog: { id: string } }).dog;
  }
  async function makeEntry(u: TestUser, dogId: string) {
    const r = await app.request(`/api/dogs/${dogId}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        kind: "moment",
        note: "Barked at the doorbell",
        occurredAt: "2026-05-19T10:00:00.000Z",
        antecedent: "Doorbell",
        behavior: "Barked 8s",
        consequence: "Scatter fed",
        intensity: 3,
        location: "Front hall",
        notes: "Loud but short",
        durationSeconds: 8,
        recoverySeconds: 20,
        peoplePresent: "Owner",
        ownerResponse: "Scatter fed",
      }),
    });
    expect(r.status).toBe(201);
    return ((await r.json()) as { entry: { id: string } }).entry;
  }
  async function makeDailyCheckinEntry(u: TestUser, dogId: string) {
    const r = await app.request(`/api/dogs/${dogId}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        kind: "daily_checkin",
        note: "Easier morning overall",
        trend: "same",
        occurredAt: "2026-05-19T11:00:00.000Z",
      }),
    });
    expect(r.status).toBe(201);
    return ((await r.json()) as { entry: { id: string } }).entry;
  }

  it("PUT updates an existing entry incl. the four new fields", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const e = await makeEntry(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/journal/${e.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({
        occurredAt: "2026-05-19T10:00",
        antecedent: "Doorbell",
        behavior: "Barked, recovered fast",
        consequence: "Scatter fed",
        intensity: 2,
        durationSeconds: 8,
        recoverySeconds: 20,
        peoplePresent: "Just owner",
        ownerResponse: "Stayed calm",
      }),
    });
    expect(r.status).toBe(200);
    const { entry: updated } = (await r.json()) as {
      entry: {
        behavior: string;
        intensity: number;
        durationSeconds: number | null;
        peoplePresent: string | null;
        ownerResponse: string | null;
      };
    };
    expect(updated.behavior).toBe("Barked, recovered fast");
    expect(updated.intensity).toBe(2);
    expect(updated.durationSeconds).toBe(8);
    expect(updated.peoplePresent).toBe("Just owner");
    expect(updated.ownerResponse).toBe("Stayed calm");
  });

  it("PUT 400 on invalid intensity", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const e = await makeEntry(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/journal/${e.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({
        occurredAt: "2026-05-19T10:00",
        antecedent: "Doorbell",
        behavior: "x",
        consequence: "y",
        intensity: 9,
      }),
    });
    expect(r.status).toBe(400);
  });

  it("PUT rejects converting a moment to daily_checkin without a trend", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const e = await makeEntry(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/journal/${e.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ kind: "daily_checkin" }),
    });
    expect(r.status).toBe(400);
    expectValidationIssue(await r.json(), "trend", "validation.dailyCheckInTrendRequired");

    const list = await app.request(`/api/dogs/${dog.id}/journal`, { headers: u.authHeaders });
    const { entries } = (await list.json()) as {
      entries: Array<{ id: string; kind: string; trend: string | null }>;
    };
    expect(entries.find((entry) => entry.id === e.id)).toMatchObject({
      kind: "moment",
      trend: null,
    });
  });

  it("PUT converting a moment to daily_checkin with a trend clears moment-only fields", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const e = await makeEntry(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/journal/${e.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({
        kind: "daily_checkin",
        trend: "better",
        antecedent: "New antecedent",
        behavior: "New behavior",
        consequence: "New consequence",
        intensity: 5,
        location: "Kitchen",
        notes: "Should be cleared",
        durationSeconds: 3,
        recoverySeconds: 7,
        peoplePresent: "Owner and trainer",
        ownerResponse: "Marked and rewarded",
      }),
    });
    expect(r.status).toBe(200);
    const { entry: updated } = (await r.json()) as {
      entry: {
        kind: string;
        trend: string | null;
        antecedent: string | null;
        behavior: string | null;
        consequence: string | null;
        intensity: number | null;
        location: string | null;
        notes: string | null;
        durationSeconds: number | null;
        recoverySeconds: number | null;
        peoplePresent: string | null;
        ownerResponse: string | null;
      };
    };
    expect(updated).toMatchObject({
      kind: "daily_checkin",
      trend: "better",
      antecedent: null,
      behavior: null,
      consequence: null,
      intensity: null,
      location: null,
      notes: null,
      durationSeconds: null,
      recoverySeconds: null,
      peoplePresent: null,
      ownerResponse: null,
    });
  });

  it("PUT converting a daily_checkin to moment clears trend", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const e = await makeDailyCheckinEntry(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/journal/${e.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ kind: "moment", antecedent: "Doorbell" }),
    });
    expect(r.status).toBe(200);
    const { entry: updated } = (await r.json()) as {
      entry: { kind: string; trend: string | null; antecedent: string | null };
    };
    expect(updated).toMatchObject({ kind: "moment", trend: null, antecedent: "Doorbell" });
  });

  it("PUT rejects invalid occurredAt without updating", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const e = await makeEntry(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/journal/${e.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ occurredAt: "not-a-date", note: "Should not persist" }),
    });
    expect(r.status).toBe(400);
    expectValidationIssue(await r.json(), "occurredAt", "validation.dateInvalid");

    const list = await app.request(`/api/dogs/${dog.id}/journal`, { headers: u.authHeaders });
    const { entries } = (await list.json()) as {
      entries: Array<{ id: string; note: string; occurredAt: string }>;
    };
    expect(entries.find((entry) => entry.id === e.id)).toMatchObject({
      note: "Barked at the doorbell",
      occurredAt: "2026-05-19T10:00:00.000Z",
    });
  });

  it("PUT owner-isolation: other user → 404", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    const e = await makeEntry(a, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/journal/${e.id}`, {
      method: "PUT",
      headers: b.authHeaders,
      body: JSON.stringify({
        occurredAt: "2026-05-19T10:00",
        antecedent: "Doorbell",
        behavior: "x",
        consequence: "y",
        intensity: 3,
      }),
    });
    expect(r.status).toBe(404);
  });

  it("PUT cross-dog: entryId from a different dog of same user → 404", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog1 = await makeDog(u);
    const dog2 = await makeDog(u, { ...validDog, name: "Pancake" });
    const e1 = await makeEntry(u, dog1.id);
    const r = await app.request(`/api/dogs/${dog2.id}/journal/${e1.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({
        occurredAt: "2026-05-19T10:00",
        antecedent: "Doorbell",
        behavior: "x",
        consequence: "y",
        intensity: 3,
      }),
    });
    expect(r.status).toBe(404);
  });
});

describe("dogs: brief send", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  async function makeDog(u: TestUser) {
    const r = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    return ((await r.json()) as { dog: { id: string } }).dog;
  }
  async function makeFinalizedBrief(u: TestUser, dogId: string) {
    await app.request(`/api/dogs/${dogId}/brief`, {
      method: "POST",
      headers: u.authHeaders,
    });
    const fin = await app.request(`/api/dogs/${dogId}/brief`, {
      method: "PUT",
      headers: u.authHeaders,
    });
    return ((await fin.json()) as { brief: { id: string; status: string } }).brief;
  }

  async function makeFinalizedBriefWithHeaders(
    u: TestUser,
    dogId: string,
    headers: Record<string, string>,
  ) {
    await app.request(`/api/dogs/${dogId}/brief`, {
      method: "POST",
      headers: { ...u.authHeaders, ...headers },
    });
    const fin = await app.request(`/api/dogs/${dogId}/brief`, {
      method: "PUT",
      headers: u.authHeaders,
    });
    return ((await fin.json()) as { brief: { id: string; status: string } }).brief;
  }

  it("POST send: happy path on a finalized brief", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const brief = await makeFinalizedBrief(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: briefSendBody({
        briefId: brief.id,
        recipient: "sarah@example.com",
        message: "Hi Sarah",
      }),
    });
    expect(r.status).toBe(201);
    const { send } = (await r.json()) as {
      send: { recipient: string; message: string | null };
    };
    expect(send.recipient).toBe("sarah@example.com");
    expect(send.message).toBe("Hi Sarah");
  });

  it("POST send: replays a committed idempotency key without duplicate delivery", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const brief = await makeFinalizedBrief(u, dog.id);
    const { sendEmail } = await import("../email/send-email");
    vi.mocked(sendEmail).mockClear();
    const body = JSON.stringify({
      briefId: brief.id,
      recipient: "idempotent@example.com",
      idempotencyKey: "95acbb6a-9189-4614-9a6e-c732efcc5d1d",
    });

    const first = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body,
    });
    const second = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body,
    });
    const firstBody = (await first.json()) as { send: { id: string } };
    const secondBody = (await second.json()) as { send: { id: string } };

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(firstBody.send.id).toBe("95acbb6a-9189-4614-9a6e-c732efcc5d1d");
    expect(secondBody.send.id).toBe(firstBody.send.id);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0]?.[0].idempotencyKey).toBe(firstBody.send.id);
    expect(
      await db
        .select({ id: briefSends.id })
        .from(briefSends)
        .where(eq(briefSends.id, firstBody.send.id)),
    ).toHaveLength(1);
    const emailedEvents = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.userId, u.userId), eq(events.name, "brief.emailed")));
    expect(emailedEvents).toHaveLength(1);
  });

  it("POST send: keeps a durable intent after provider failure and retries the same key", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const brief = await makeFinalizedBrief(u, dog.id);
    const { sendEmail } = await import("../email/send-email");
    vi.mocked(sendEmail).mockClear();
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("provider unavailable"));
    const idempotencyKey = "96acbb6a-9189-4614-9a6e-c732efcc5d1d";
    const body = JSON.stringify({
      briefId: brief.id,
      recipient: "durable@example.com",
      idempotencyKey,
    });

    const failed = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body,
    });

    expect(failed.status).toBe(502);
    expect(
      await db
        .select({ id: briefSends.id })
        .from(briefSends)
        .where(eq(briefSends.id, idempotencyKey)),
    ).toEqual([{ id: idempotencyKey }]);
    const recoverablePending = await app.request(`/api/dogs/${dog.id}/brief/sends`, {
      headers: u.authHeaders,
    });
    expect(await recoverablePending.json()).toEqual({
      sends: [
        expect.objectContaining({
          id: idempotencyKey,
          recipient: "durable@example.com",
          status: "pending",
        }),
      ],
    });

    const retried = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body,
    });

    expect(retried.status).toBe(201);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendEmail).mock.calls.map(([request]) => request.idempotencyKey)).toEqual([
      idempotencyKey,
      idempotencyKey,
    ]);
    expect(
      await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.userId, u.userId), eq(events.name, "brief.emailed"))),
    ).toHaveLength(1);
  });

  it("POST send: reclaims a stale delivery claim with the same provider idempotency key", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const brief = await makeFinalizedBrief(u, dog.id);
    const idempotencyKey = "76acbb6a-9189-4614-9a6e-c732efcc5d1d";
    await db.insert(briefSends).values({
      id: idempotencyKey,
      briefId: brief.id,
      recipient: "stale-claim@example.com",
      sentByUserId: u.userId,
      deliveryClaimId: "abandoned-worker",
      deliveryClaimedAt: new Date(Date.now() - 31_000),
    });
    const { sendEmail } = await import("../email/send-email");
    vi.mocked(sendEmail).mockClear();

    const response = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        briefId: brief.id,
        recipient: "stale-claim@example.com",
        idempotencyKey,
      }),
    });

    expect(response.status).toBe(201);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0]?.[0].idempotencyKey).toBe(idempotencyKey);
    const [stored] = await db
      .select({
        deliveredAt: briefSends.deliveredAt,
        deliveryClaimId: briefSends.deliveryClaimId,
        deliveryClaimedAt: briefSends.deliveryClaimedAt,
      })
      .from(briefSends)
      .where(eq(briefSends.id, idempotencyKey));
    expect(stored?.deliveredAt).toBeInstanceOf(Date);
    expect(stored?.deliveryClaimId).toBeNull();
    expect(stored?.deliveryClaimedAt).toBeNull();
  });

  it("POST send: never recovers an old pending key for a newer Brief", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const firstBrief = await makeFinalizedBrief(u, dog.id);
    const { sendEmail } = await import("../email/send-email");
    vi.mocked(sendEmail).mockClear();
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("provider unavailable"));
    const oldKey = "86acbb6a-9189-4614-9a6e-c732efcc5d1d";

    const failed = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        briefId: firstBrief.id,
        recipient: "versioned@example.com",
        idempotencyKey: oldKey,
      }),
    });
    expect(failed.status).toBe(502);

    const secondBrief = await makeFinalizedBrief(u, dog.id);
    const staleRecovery = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        briefId: secondBrief.id,
        recipient: "versioned@example.com",
        idempotencyKey: oldKey,
      }),
    });

    expect(staleRecovery.status).toBe(409);
    expect(await staleRecovery.json()).toEqual({ error: "idempotency_conflict" });
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);

    const freshSend = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: briefSendBody({
        briefId: secondBrief.id,
        recipient: "versioned@example.com",
      }),
    });
    expect(freshSend.status).toBe(201);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(2);
  });

  it("POST send: rejects a stale client that omits the Brief id after a newer version exists", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    await makeFinalizedBrief(u, dog.id);
    await makeFinalizedBrief(u, dog.id);
    const { sendEmail } = await import("../email/send-email");
    vi.mocked(sendEmail).mockClear();

    const response = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: briefSendBody({ recipient: "stale-client@example.com" }),
    });

    expect(response.status).toBe(400);
    expectValidationIssue(await response.json(), "briefId");
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("POST send: concurrent replay records one provider delivery, audit, and emailed event", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const brief = await makeFinalizedBrief(u, dog.id);
    const { sendEmail } = await import("../email/send-email");
    let releaseProvider: (() => void) | undefined;
    let markProviderStarted: (() => void) | undefined;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    const providerRelease = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    vi.mocked(sendEmail).mockClear();
    vi.mocked(sendEmail).mockImplementationOnce(async () => {
      markProviderStarted?.();
      await providerRelease;
    });
    const body = JSON.stringify({
      briefId: brief.id,
      recipient: "concurrent-replay@example.com",
      idempotencyKey: "0aacbb6a-9189-4614-9a6e-c732efcc5d1d",
    });

    const first = app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body,
    });
    await providerStarted;
    const second = app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body,
    });
    const secondResponse = await second;
    releaseProvider?.();
    const firstResponse = await first;

    expect([firstResponse.status, secondResponse.status]).toEqual([201, 409]);
    expect(await secondResponse.json()).toEqual({ error: "send_in_progress" });
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    expect(
      await db
        .select({ id: briefSends.id })
        .from(briefSends)
        .where(eq(briefSends.sentByUserId, u.userId)),
    ).toHaveLength(1);
    expect(
      await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.userId, u.userId), eq(events.name, "brief.emailed"))),
    ).toHaveLength(1);
  });

  it("POST send: conflicting replay preserves one provider delivery, audit, and emailed event", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const brief = await makeFinalizedBrief(u, dog.id);
    const { sendEmail } = await import("../email/send-email");
    vi.mocked(sendEmail).mockClear();
    const idempotencyKey = "1aacbb6a-9189-4614-9a6e-c732efcc5d1d";
    const first = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        briefId: brief.id,
        recipient: "original@example.com",
        idempotencyKey,
      }),
    });
    const conflict = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        briefId: brief.id,
        recipient: "different@example.com",
        idempotencyKey,
      }),
    });

    expect(first.status).toBe(201);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: "idempotency_conflict" });
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    expect(
      await db
        .select({ id: briefSends.id })
        .from(briefSends)
        .where(eq(briefSends.sentByUserId, u.userId)),
    ).toHaveLength(1);
    expect(
      await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.userId, u.userId), eq(events.name, "brief.emailed"))),
    ).toHaveLength(1);
  });

  it("POST send: concurrent global-key collision delivers, audits, and records exactly once", async () => {
    const firstUser = await createTestUser();
    const secondUser = await createTestUser();
    users.push(firstUser, secondUser);
    const firstDog = await makeDog(firstUser);
    const secondDog = await makeDog(secondUser);
    const firstBrief = await makeFinalizedBrief(firstUser, firstDog.id);
    const secondBrief = await makeFinalizedBrief(secondUser, secondDog.id);
    const { sendEmail } = await import("../email/send-email");
    vi.mocked(sendEmail).mockClear();
    const idempotencyKey = "2aacbb6a-9189-4614-9a6e-c732efcc5d1d";

    const responses = await Promise.all([
      app.request(`/api/dogs/${firstDog.id}/brief/send`, {
        method: "POST",
        headers: firstUser.authHeaders,
        body: JSON.stringify({
          briefId: firstBrief.id,
          recipient: "first-owner@example.com",
          idempotencyKey,
        }),
      }),
      app.request(`/api/dogs/${secondDog.id}/brief/send`, {
        method: "POST",
        headers: secondUser.authHeaders,
        body: JSON.stringify({
          briefId: secondBrief.id,
          recipient: "second-owner@example.com",
          idempotencyKey,
        }),
      }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const conflict = responses.find(({ status }) => status === 409);
    expect(await conflict?.json()).toEqual({ error: "idempotency_conflict" });
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    expect(
      await db
        .select({ id: briefSends.id })
        .from(briefSends)
        .where(eq(briefSends.id, idempotencyKey)),
    ).toHaveLength(1);
    const participatingEvents = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.name, "brief.emailed"),
          or(eq(events.userId, firstUser.userId), eq(events.userId, secondUser.userId)),
        ),
      );
    expect(participatingEvents).toHaveLength(1);
  });

  it("POST send: serializes the daily quota across two dogs owned by one user", async () => {
    const u = await createTestUser();
    users.push(u);
    const firstDog = await makeDog(u);
    const secondDog = await makeDog(u);
    const firstBrief = await makeFinalizedBrief(u, firstDog.id);
    const secondBrief = await makeFinalizedBrief(u, secondDog.id);
    await db.insert(briefSends).values(
      Array.from({ length: 9 }, (_, index) => ({
        briefId: firstBrief.id,
        recipient: `previous-${index}@example.com`,
        sentByUserId: u.userId,
      })),
    );
    const { sendEmail } = await import("../email/send-email");
    vi.mocked(sendEmail).mockClear();
    const blocker = await pool.connect();
    let blockerOpen = false;

    try {
      await blocker.query("BEGIN");
      blockerOpen = true;
      await blocker.query(`SELECT "id" FROM "user" WHERE "id" = $1 FOR UPDATE`, [u.userId]);
      const pidResult = await blocker.query<{ pid: number }>(
        "SELECT pg_backend_pid()::integer AS pid",
      );
      const blockerPid = Number(pidResult.rows[0]?.pid);
      const sends = [
        { briefId: firstBrief.id, dog: firstDog },
        { briefId: secondBrief.id, dog: secondDog },
      ].map(({ briefId, dog }, index) =>
        app.request(`/api/dogs/${dog.id}/brief/send`, {
          method: "POST",
          headers: u.authHeaders,
          body: briefSendBody({ briefId, recipient: `concurrent-${index}@example.com` }),
        }),
      );
      await waitForBlockingChain(pool, blockerPid, 2);
      await blocker.query("COMMIT");
      blockerOpen = false;

      const responses = await Promise.all(sends);
      expect(responses.map(({ status }) => status).sort()).toEqual([201, 429]);
      expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
      const [{ value: sendCount } = { value: 0 }] = await db
        .select({ value: count() })
        .from(briefSends)
        .where(eq(briefSends.sentByUserId, u.userId));
      expect(Number(sendCount)).toBe(10);
    } finally {
      if (blockerOpen) await blocker.query("ROLLBACK");
      blocker.release();
    }
  });

  it("POST send: takes the user lock before dog rows so account deletion cannot deadlock", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const brief = await makeFinalizedBrief(u, dog.id);
    const { sendEmail } = await import("../email/send-email");
    vi.mocked(sendEmail).mockClear();
    const deleter = await pool.connect();
    let deleterOpen = false;

    try {
      await deleter.query("BEGIN");
      deleterOpen = true;
      await deleter.query(`SELECT "id" FROM "user" WHERE "id" = $1 FOR UPDATE`, [u.userId]);
      const pidResult = await deleter.query<{ pid: number }>(
        "SELECT pg_backend_pid()::integer AS pid",
      );
      const deleterPid = Number(pidResult.rows[0]?.pid);
      const send = app.request(`/api/dogs/${dog.id}/brief/send`, {
        method: "POST",
        headers: u.authHeaders,
        body: briefSendBody({ briefId: brief.id, recipient: "account-delete@example.com" }),
      });
      await waitForBlockingChain(pool, deleterPid, 1);

      await deleter.query(`DELETE FROM "user" WHERE "id" = $1`, [u.userId]);
      await deleter.query("COMMIT");
      deleterOpen = false;

      const response = await send;
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
      expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
    } finally {
      if (deleterOpen) await deleter.query("ROLLBACK");
      deleter.release();
    }
  });

  it("POST send: uses the stored brief locale instead of the current request locale", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const brief = await makeFinalizedBriefWithHeaders(u, dog.id, {
      "X-TuringCare-Locale": "es",
    });
    const { sendEmail } = await import("../email/send-email");
    vi.mocked(sendEmail).mockClear();

    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: { ...u.authHeaders, "X-TuringCare-Locale": "en" },
      body: briefSendBody({
        briefId: brief.id,
        recipient: "sarah@example.com",
        message: "Hola Sarah",
      }),
    });

    expect(r.status).toBe(201);
    const sent = vi.mocked(sendEmail).mock.calls[0]?.[0] as {
      subject: string;
      html: string;
      text: string;
    };
    expect(sent.subject).toBe("Resumen de conducta: Biscuit");
    expect(sent.html).toContain("Compartido por");
    expect(sent.text).toContain("Resumen de conducta: Biscuit");
    expect(sent.text).toContain("Preocupaciones:");
  });

  it("POST send: returns 409 when brief is draft", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const generated = await app.request(`/api/dogs/${dog.id}/brief`, {
      method: "POST",
      headers: u.authHeaders,
    });
    const draft = ((await generated.json()) as { brief: { id: string } }).brief;
    // do NOT finalize
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: briefSendBody({ briefId: draft.id, recipient: "sarah@example.com" }),
    });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "not_finalized" });
  });

  it("POST send: blocks dog deletion during provider delivery without holding a transaction", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const brief = await makeFinalizedBrief(u, dog.id);
    const { sendEmail } = await import("../email/send-email");
    let releaseProvider: (() => void) | undefined;
    let markProviderStarted: (() => void) | undefined;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    const providerRelease = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    vi.mocked(sendEmail).mockImplementationOnce(async () => {
      markProviderStarted?.();
      await providerRelease;
    });
    try {
      const send = app.request(`/api/dogs/${dog.id}/brief/send`, {
        method: "POST",
        headers: u.authHeaders,
        body: briefSendBody({ briefId: brief.id, recipient: "race@example.com" }),
      });
      await providerStarted;

      const blockedDelete = await app.request(`/api/dogs/${dog.id}`, {
        method: "DELETE",
        headers: u.authHeaders,
      });
      expect(blockedDelete.status).toBe(409);
      expect(await blockedDelete.json()).toEqual({ error: "brief_delivery_in_progress" });

      releaseProvider?.();

      const sendResponse = await send;
      expect(sendResponse.status).toBe(201);
      const completedDelete = await app.request(`/api/dogs/${dog.id}`, {
        method: "DELETE",
        headers: u.authHeaders,
      });
      expect(completedDelete.status).toBe(200);
    } finally {
      releaseProvider?.();
    }
  });

  it("POST send: clears a failed claim before allowing dog deletion", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const brief = await makeFinalizedBrief(u, dog.id);
    const { sendEmail } = await import("../email/send-email");
    let rejectProvider: ((reason: Error) => void) | undefined;
    let markProviderStarted: (() => void) | undefined;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    const providerResult = new Promise<void>((_resolve, reject) => {
      rejectProvider = reject;
    });
    vi.mocked(sendEmail).mockImplementationOnce(async () => {
      markProviderStarted?.();
      await providerResult;
    });
    try {
      const send = app.request(`/api/dogs/${dog.id}/brief/send`, {
        method: "POST",
        headers: u.authHeaders,
        body: briefSendBody({ briefId: brief.id, recipient: "failed-race@example.com" }),
      });
      await providerStarted;

      const blockedDelete = await app.request(`/api/dogs/${dog.id}`, {
        method: "DELETE",
        headers: u.authHeaders,
      });
      expect(blockedDelete.status).toBe(409);
      expect(await blockedDelete.json()).toEqual({ error: "brief_delivery_in_progress" });

      rejectProvider?.(new Error("deferred-provider-failure"));

      const sendResponse = await send;
      expect(sendResponse.status).toBe(502);
      const completedDelete = await app.request(`/api/dogs/${dog.id}`, {
        method: "DELETE",
        headers: u.authHeaders,
      });
      expect(completedDelete.status).toBe(200);
      const audits = await db
        .select({ id: briefSends.id, deliveredAt: briefSends.deliveredAt })
        .from(briefSends)
        .where(eq(briefSends.recipient, "failed-race@example.com"));
      expect(audits).toEqual([]);
    } finally {
      rejectProvider?.(new Error("test cleanup"));
    }
  });

  it("POST send: blocks account cascade deletion until provider delivery finishes", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const brief = await makeFinalizedBrief(u, dog.id);
    const { sendEmail } = await import("../email/send-email");
    let releaseProvider: (() => void) | undefined;
    let markProviderStarted: (() => void) | undefined;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    const providerRelease = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    vi.mocked(sendEmail).mockImplementationOnce(async () => {
      markProviderStarted?.();
      await providerRelease;
    });
    const deleter = await pool.connect();
    try {
      const send = app.request(`/api/dogs/${dog.id}/brief/send`, {
        method: "POST",
        headers: u.authHeaders,
        body: briefSendBody({ briefId: brief.id, recipient: "account-race@example.com" }),
      });
      await providerStarted;

      await expect(
        deleter.query(`DELETE FROM "user" WHERE "id" = $1`, [u.userId]),
      ).rejects.toMatchObject({ constraint: "brief_sends_delivery_in_progress" });

      releaseProvider?.();
      expect((await send).status).toBe(201);
      const deleted = await deleter.query(`DELETE FROM "user" WHERE "id" = $1`, [u.userId]);
      expect(deleted.rowCount).toBe(1);
    } finally {
      releaseProvider?.();
      deleter.release();
    }
  });

  it("POST send: returns 404 when no brief exists", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: briefSendBody({ briefId: randomUUID(), recipient: "sarah@example.com" }),
    });
    expect(r.status).toBe(404);
  });

  it("POST send: returns 400 on invalid recipient", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const brief = await makeFinalizedBrief(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: briefSendBody({ briefId: brief.id, recipient: "not-an-email" }),
    });
    expect(r.status).toBe(400);
  });

  it("POST send: returns 400 when message > 500 chars", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const brief = await makeFinalizedBrief(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: briefSendBody({
        briefId: brief.id,
        recipient: "sarah@example.com",
        message: "x".repeat(501),
      }),
    });
    expect(r.status).toBe(400);
  });

  it("POST send: owner-isolation — user B → 404", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    const brief = await makeFinalizedBrief(a, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: b.authHeaders,
      body: briefSendBody({ briefId: brief.id, recipient: "sarah@example.com" }),
    });
    expect(r.status).toBe(404);
  });

  it("POST send: 502 + monitored capture when sendEmail fails (no raw log, request ID present)", async () => {
    // createTestUser triggers its own verification-email send through the
    // same `sendEmail` seam (see auth.ts), so the user/dog/brief setup must
    // happen before arming `mockRejectedValueOnce` — otherwise that
    // unrelated verification send would consume the one-time rejection.
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const brief = await makeFinalizedBrief(u, dog.id);

    const { sendEmail } = await import("../email/send-email");
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("resend-timeout-sentinel-do-not-leak"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: briefSendBody({ briefId: brief.id, recipient: "sarah@example.com" }),
    });
    const text = await r.text();

    expect(r.status).toBe(502);
    expect(JSON.parse(text)).toEqual({ error: "send_failed" });
    expect(r.headers.get("X-Request-ID")).toBeTruthy();

    // Exactly one privacy-safe structured log — never the removed raw
    // `console.error("brief send failed", err)` line, and never the
    // original provider failure detail.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [line, meta] = errorSpy.mock.calls[0] ?? [];
    expect(line).toBe("[monitoring] unexpected server error");
    expect(meta).toMatchObject({
      route: "/api/dogs/:id/brief/send",
      method: "POST",
      status: 502,
    });
    expect(meta).toHaveProperty("requestId");

    const serializedLog = JSON.stringify(errorSpy.mock.calls[0]);
    expect(serializedLog).not.toContain("resend-timeout-sentinel-do-not-leak");
    expect(serializedLog).not.toContain("brief send failed");
    expect(text).not.toContain("resend-timeout-sentinel-do-not-leak");

    errorSpy.mockRestore();
  });

  it("GET sends: returns newest-first", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const brief = await makeFinalizedBrief(u, dog.id);
    // Send twice
    await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: briefSendBody({ briefId: brief.id, recipient: "first@example.com" }),
    });
    await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: briefSendBody({ briefId: brief.id, recipient: "second@example.com" }),
    });
    const r = await app.request(`/api/dogs/${dog.id}/brief/sends`, {
      headers: u.authHeaders,
    });
    expect(r.status).toBe(200);
    const { sends } = (await r.json()) as { sends: Array<{ recipient: string }> };
    expect(sends).toHaveLength(2);
    const [first, second] = sends;
    if (!first || !second) throw new Error("expected two sends");
    expect(first.recipient).toBe("second@example.com"); // newest
    expect(second.recipient).toBe("first@example.com");
  });

  it("GET sends: owner-isolation — user B → 404", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    const r = await app.request(`/api/dogs/${dog.id}/brief/sends`, {
      headers: b.authHeaders,
    });
    expect(r.status).toBe(404);
  });

  it("GET sends: empty when no sends exist", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const r = await app.request(`/api/dogs/${dog.id}/brief/sends`, {
      headers: u.authHeaders,
    });
    expect(r.status).toBe(200);
    const { sends } = (await r.json()) as { sends: unknown[] };
    expect(sends).toEqual([]);
  });
});

describe("dogs: overview", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  async function makeDog(u: TestUser) {
    const r = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    return ((await r.json()) as { dog: { id: string } }).dog;
  }

  async function makeGoal(dogId: string, goalName = "Recall") {
    const [goal] = await db.insert(trainingGoals).values({ dogId, goal: goalName }).returning();
    if (!goal) throw new Error("expected goal");
    return goal;
  }

  async function makeSkill(goalId: string, name = "Sit", position = 0) {
    const [skill] = await db
      .insert(trainingSkills)
      .values({ goalId, name, confidence: 1, position })
      .returning();
    if (!skill) throw new Error("expected skill");
    return skill;
  }

  it("GET /overview returns dogs with summary", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    await makeSkill(goal.id);

    const res = await app.request("/api/dogs/overview", { headers: u.authHeaders });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      dogs: Array<{ id: string; summary: { goalCount: number; skillCount: number } }>;
    };
    const row = body.dogs.find((d) => d.id === dog.id);
    expect(row?.summary.goalCount).toBe(1);
    expect(row?.summary.skillCount).toBe(1);
  });
});

describe("dogs: POST /:id/goals/from-template", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  async function makeDog(u: TestUser) {
    const r = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    return ((await r.json()) as { dog: { id: string } }).dog;
  }

  it("creates a goal + all template skills atomically", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const r = await app.request(`/api/dogs/${dog.id}/goals/from-template`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ templateKey: "basic-manners" }),
    });
    expect(r.status).toBe(201);
    const body = (await r.json()) as {
      goal: { id: string; goal: string; catalogGoalKey: string | null };
      skills: {
        id: string;
        name: string;
        catalogSkillKey: string | null;
        position: number;
        confidence: number;
      }[];
    };
    expect(body.goal.goal).toBe("Basic Manners");
    expect(body.goal.catalogGoalKey).toBe("basic-manners");
    expect(body.skills).toHaveLength(5);
    expect(body.skills[0]?.name).toBe("Sit");
    expect(body.skills[0]?.catalogSkillKey).toBe("basic-manners.sit");
    expect(body.skills[0]?.confidence).toBe(1);
    expect(body.skills[0]?.position).toBe(0);
    expect(body.skills.map((s) => s.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it("persists template labels but resolves catalog-backed reads in the request locale", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const r = await app.request(`/api/dogs/${dog.id}/goals/from-template`, {
      method: "POST",
      headers: { ...u.authHeaders, "X-TuringCare-Locale": "es" },
      body: JSON.stringify({ templateKey: "basic-manners" }),
    });

    expect(r.status).toBe(201);
    expect(r.headers.get("Content-Language")).toBe("es");
    const body = (await r.json()) as {
      goal: { id: string; goal: string; catalogGoalKey: string | null };
      skills: Array<{ id: string; name: string; catalogSkillKey: string | null }>;
    };
    expect(body.goal.goal).toBe("Modales básicos");
    expect(body.goal.catalogGoalKey).toBe("basic-manners");
    expect(body.skills[0]?.name).toBe("Sentado");
    expect(body.skills[0]?.catalogSkillKey).toBe("basic-manners.sit");

    const progress = await app.request(`/api/dogs/${dog.id}/progress`, { headers: u.authHeaders });
    const progressBody = (await progress.json()) as {
      goals: Array<{
        goal: string;
        catalogGoalKey: string | null;
        skills: Array<{ name: string }>;
      }>;
    };
    expect(progressBody.goals[0]?.goal).toBe("Basic Manners");
    expect(progressBody.goals[0]?.catalogGoalKey).toBe("basic-manners");
    expect(progressBody.goals[0]?.skills[0]?.name).toBe("Sit");

    const spanishProgress = await app.request(`/api/dogs/${dog.id}/progress`, {
      headers: { ...u.authHeaders, "X-TuringCare-Locale": "es" },
    });
    const spanishProgressBody = (await spanishProgress.json()) as {
      goals: Array<{ goal: string; skills: Array<{ name: string }> }>;
    };
    expect(spanishProgressBody.goals[0]?.goal).toBe("Modales básicos");
    expect(spanishProgressBody.goals[0]?.skills[0]?.name).toBe("Sentado");

    const briefResponse = await app.request(`/api/dogs/${dog.id}/brief?window=30d`, {
      method: "POST",
      headers: u.authHeaders,
    });
    expect(briefResponse.status).toBe(201);
    const briefBody = (await briefResponse.json()) as { brief: { summary: string } };
    expect(briefBody.brief.summary).toContain("- Basic Manners");
    expect(briefBody.brief.summary).toContain("Sit");
    expect(briefBody.brief.summary).not.toContain("Modales básicos");
    expect(briefBody.brief.summary).not.toContain("Sentado");

    const catalogSkill = body.skills[0];
    if (!catalogSkill) throw new Error("expected template skill");
    const rename = await app.request(`/api/dogs/${dog.id}/skills/${catalogSkill.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ name: "My custom sit", confidence: 1 }),
    });
    const renamed = (await rename.json()) as {
      skill: { name: string; catalogSkillKey: string | null };
    };
    expect(renamed.skill).toMatchObject({ name: "My custom sit", catalogSkillKey: null });

    const renamedSpanishProgress = await app.request(`/api/dogs/${dog.id}/progress`, {
      headers: { ...u.authHeaders, "X-TuringCare-Locale": "es" },
    });
    const renamedSpanishBody = (await renamedSpanishProgress.json()) as {
      goals: Array<{ skills: Array<{ name: string }> }>;
    };
    expect(renamedSpanishBody.goals[0]?.skills[0]?.name).toBe("My custom sit");
  });

  it("returns 400 for an unknown templateKey, and does not create anything", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const r = await app.request(`/api/dogs/${dog.id}/goals/from-template`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ templateKey: "does-not-exist" }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()) as { error: string }).toEqual({ error: "invalid_template" });
    // Verify no goal was created.
    const dogR = await app.request(`/api/dogs/${dog.id}`, { headers: u.authHeaders });
    const dogBody = (await dogR.json()) as { goals: { id: string }[] };
    expect(dogBody.goals).toHaveLength(0);
  });

  it("owner isolation: another user's dog returns 404", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    const r = await app.request(`/api/dogs/${dog.id}/goals/from-template`, {
      method: "POST",
      headers: b.authHeaders,
      body: JSON.stringify({ templateKey: "basic-manners" }),
    });
    expect(r.status).toBe(404);
  });
});

describe("sendFailedException (brief send-failed monitoring seam)", () => {
  /**
   * Throwaway probe app: exercises the exported `sendFailedException` helper
   * directly, wired through the same `requestIdMiddleware` +
   * `createMonitoringErrorHandler` used by the real `app` (see app.ts), so
   * the 502 path is proven end-to-end without dynamically re-mocking the
   * whole `dogs.ts` module.
   */
  function buildProbeApp(capture: ReturnType<typeof vi.fn>) {
    const probe = new Hono<ApiEnv>()
      .use("*", requestIdMiddleware)
      .get("/probe", (c) => {
        throw sendFailedException(c, new Error("provider-sentinel-do-not-leak"));
      })
      .get("/not-found-ish", (c) => c.json({ error: "not_found" } as const, 404));
    probe.onError(createMonitoringErrorHandler(capture));
    return probe;
  }

  it("preserves the exact { error: 'send_failed' } 502 response and request ID", async () => {
    const res = await buildProbeApp(vi.fn()).request("/probe");
    const text = await res.text();

    expect(res.status).toBe(502);
    expect(JSON.parse(text)).toEqual({ error: "send_failed" });
    expect(res.headers.get("X-Request-ID")).toBeTruthy();
  });

  it("routes through the global monitoring handler: captured exactly once", async () => {
    const capture = vi.fn();
    const res = await buildProbeApp(capture).request("/probe");

    expect(res.status).toBe(502);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]?.[1]).toMatchObject({ status: 502, method: "GET" });
  });

  it("preserves the original provider error as HTTPException#cause for Sentry's linked-errors chain, without it ever reaching the response", async () => {
    const capture = vi.fn();
    const res = await buildProbeApp(capture).request("/probe");
    const capturedError = capture.mock.calls[0]?.[0];

    expect(res.status).toBe(502);
    // Documents that the cause is present on the captured error — Sentry's
    // `linkedErrorsIntegration` (see sentry.ts) walks this `cause` chain and
    // `sanitizeApiEvent` (see sanitize-event.ts) normalizes it — without
    // asserting that the raw message is ever sent anywhere: `capture` here
    // is a bare mock, not the real Sentry adapter, so this test cannot and
    // does not claim the raw message reaches Sentry.
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as { cause?: unknown } | undefined)?.cause).toBeInstanceOf(Error);
    expect(((capturedError as { cause?: Error } | undefined)?.cause as Error)?.message).toBe(
      "provider-sentinel-do-not-leak",
    );
    expect(JSON.parse(await res.text())).toEqual({ error: "send_failed" });
  });

  it("logs exactly one privacy-safe structured line and never the original cause", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await buildProbeApp(vi.fn()).request("/probe");

    expect(res.status).toBe(502);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [line, meta] = errorSpy.mock.calls[0] ?? [];
    expect(line).toBe("[monitoring] unexpected server error");
    expect(meta).toMatchObject({ status: 502 });
    expect(meta).toHaveProperty("requestId");

    const serialized = JSON.stringify(errorSpy.mock.calls[0]);
    expect(serialized).not.toContain("provider-sentinel-do-not-leak");
    errorSpy.mockRestore();
  });

  it("does not capture or log a preserved 4xx response (4xx behavior unaffected)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const capture = vi.fn();
    const res = await buildProbeApp(capture).request("/not-found-ish");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(capture).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
