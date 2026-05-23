import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { practiceSessions, trainingGoals, trainingSkills } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

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

  it("adds and removes a goal", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const add = await app.request(`/api/dogs/${dog.id}/goals`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ goal: "Calm greetings" }),
    });
    expect(add.status).toBe(201);
    const { goal, skill } = (await add.json()) as {
      goal: { id: string };
      skill: { name: string; confidence: number; position: number };
    };
    expect(skill.name).toBe("Calm greetings");
    expect(skill.confidence).toBe(1);
    expect(skill.position).toBe(0);
    const progress = await app.request(`/api/dogs/${dog.id}/progress`, { headers: u.authHeaders });
    const progressBody = (await progress.json()) as { goals: Array<{ skills: unknown[] }> };
    expect(progressBody.goals[0]?.skills).toHaveLength(1);
    const del = await app.request(`/api/dogs/${dog.id}/goals/${goal.id}`, {
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
    occurredAt: "2026-05-19T10:00",
    antecedent: "Doorbell",
    behavior: "Barked 8s",
    consequence: "Scatter fed",
    intensity: 3,
  };

  it("adds, lists, deletes a journal entry", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const add = await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(entry),
    });
    expect(add.status).toBe(201);
    const { entry: created } = (await add.json()) as { entry: { id: string } };
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

  it("PUT /skills/:skillId updates name and confidence", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    const skill = await makeSkill(goal.id);

    const res = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ name: "Greet on mat", confidence: 4 }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { skill: { name: string; confidence: number } };
    expect(body.skill.name).toBe("Greet on mat");
    expect(body.skill.confidence).toBe(4);
  });

  it("PATCH /skills/:skillId/confidence updates only confidence", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    const skill = await makeSkill(goal.id, "Door-knock threshold");

    const res = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}/confidence`, {
      method: "PATCH",
      headers: u.authHeaders,
      body: JSON.stringify({ confidence: 5 }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { skill: { name: string; confidence: number } };
    expect(body.skill.name).toBe("Door-knock threshold");
    expect(body.skill.confidence).toBe(5);
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

  it("allows PATCH in CORS preflight for confidence updates", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    const skill = await makeSkill(goal.id);

    const options = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}/confidence`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "PATCH" },
    });

    expect(options.headers.get("access-control-allow-methods")).toContain("PATCH");
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
        occurredAt: "2026-05-19T10:00",
        antecedent: "Doorbell",
        behavior: "Barked 8s",
        consequence: "Scatter fed",
        intensity: 3,
      }),
    });
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
