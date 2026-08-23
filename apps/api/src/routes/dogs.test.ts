import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { practiceSessions, trainingGoals, trainingSkills } from "../db/schema";
import { createMonitoringErrorHandler } from "../monitoring/error-handler";
import { type ApiEnv, requestIdMiddleware } from "../monitoring/request-id";
import { type TestUser, createTestUser } from "../test-helpers";
import { sendFailedException } from "./dogs";

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
    await makeFinalizedBrief(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ recipient: "sarah@example.com", message: "Hi Sarah" }),
    });
    expect(r.status).toBe(201);
    const { send } = (await r.json()) as {
      send: { recipient: string; message: string | null };
    };
    expect(send.recipient).toBe("sarah@example.com");
    expect(send.message).toBe("Hi Sarah");
  });

  it("POST send: uses the stored brief locale instead of the current request locale", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    await makeFinalizedBriefWithHeaders(u, dog.id, { "X-TuringCare-Locale": "es" });
    const { sendEmail } = await import("../email/send-email");
    vi.mocked(sendEmail).mockClear();

    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: { ...u.authHeaders, "X-TuringCare-Locale": "en" },
      body: JSON.stringify({ recipient: "sarah@example.com", message: "Hola Sarah" }),
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
    await app.request(`/api/dogs/${dog.id}/brief`, {
      method: "POST",
      headers: u.authHeaders,
    });
    // do NOT finalize
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ recipient: "sarah@example.com" }),
    });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "not_finalized" });
  });

  it("POST send: returns 404 when no brief exists", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ recipient: "sarah@example.com" }),
    });
    expect(r.status).toBe(404);
  });

  it("POST send: returns 400 on invalid recipient", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    await makeFinalizedBrief(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ recipient: "not-an-email" }),
    });
    expect(r.status).toBe(400);
  });

  it("POST send: returns 400 when message > 500 chars", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    await makeFinalizedBrief(u, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
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
    await makeFinalizedBrief(a, dog.id);
    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: b.authHeaders,
      body: JSON.stringify({ recipient: "sarah@example.com" }),
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
    await makeFinalizedBrief(u, dog.id);

    const { sendEmail } = await import("../email/send-email");
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("resend-timeout-sentinel-do-not-leak"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const r = await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ recipient: "sarah@example.com" }),
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
    await makeFinalizedBrief(u, dog.id);
    // Send twice
    await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ recipient: "first@example.com" }),
    });
    await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ recipient: "second@example.com" }),
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

  it("persists template goal and skill display names in the request locale", async () => {
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
      skills: Array<{ name: string; catalogSkillKey: string | null }>;
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
    expect(progressBody.goals[0]?.goal).toBe("Modales básicos");
    expect(progressBody.goals[0]?.catalogGoalKey).toBe("basic-manners");
    expect(progressBody.goals[0]?.skills[0]?.name).toBe("Sentado");
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
