import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { trainingGoals, trainingSkills } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

const WEEK_START = "2026-06-01T00:00:00.000Z";
const WEEK_END = "2026-06-08T00:00:00.000Z";

async function makeDog(u: TestUser) {
  const res = await app.request("/api/dogs", {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify(validDog),
  });
  return ((await res.json()) as { dog: { id: string } }).dog;
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

async function logSession(u: TestUser, dogId: string, skillId: string, occurredAt: string) {
  const res = await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions`, {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify({ occurredAt }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { session: { id: string } }).session;
}

describe("dogs: weekly focus", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  // Case 1: POST adds a skill to focus (201); GET returns it in focusSkills.
  it("POST adds a skill to focus and GET returns it", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    const skill = await makeSkill(goal.id);

    const add = await app.request(`/api/dogs/${dog.id}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ skillId: skill.id }),
    });
    expect(add.status).toBe(201);
    const { focus } = (await add.json()) as { focus: { skillId: string; dogId: string } };
    expect(focus.skillId).toBe(skill.id);
    expect(focus.dogId).toBe(dog.id);

    const get = await app.request(
      `/api/dogs/${dog.id}/focus?weekStart=${WEEK_START}&weekEnd=${WEEK_END}`,
      { headers: u.authHeaders },
    );
    expect(get.status).toBe(200);
    const body = (await get.json()) as {
      focusSkills: Array<{ skillId: string; name: string; goalName: string; sessions: unknown[] }>;
    };
    expect(body.focusSkills).toHaveLength(1);
    expect(body.focusSkills[0]?.skillId).toBe(skill.id);
    expect(body.focusSkills[0]?.name).toBe("Sit");
    expect(body.focusSkills[0]?.goalName).toBe("Recall");
    expect(body.focusSkills[0]?.sessions).toEqual([]);
  });

  // Case 2: POST the same skill twice → 409 { error: "already_focused" }.
  it("POST the same skill twice returns 409 already_focused", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    const skill = await makeSkill(goal.id);

    const first = await app.request(`/api/dogs/${dog.id}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ skillId: skill.id }),
    });
    expect(first.status).toBe(201);

    const second = await app.request(`/api/dogs/${dog.id}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ skillId: skill.id }),
    });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "already_focused" });
  });

  // Case 3: POST a skillId that doesn't belong to the dog → 404.
  it("POST a skillId that doesn't belong to the dog returns 404", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);

    // Use a random UUID that doesn't exist as a skill
    const fakeSkillId = "00000000-0000-4000-8000-000000000001";
    const res = await app.request(`/api/dogs/${dog.id}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ skillId: fakeSkillId }),
    });
    expect(res.status).toBe(404);
  });

  // Case 4: GET only returns sessions inside the week window.
  it("GET only returns sessions inside the week window", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    const skill = await makeSkill(goal.id, "Sit");

    // Add skill to focus
    const add = await app.request(`/api/dogs/${dog.id}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ skillId: skill.id }),
    });
    expect(add.status).toBe(201);

    // Log one session inside the window (Jun 3) and one outside (Jun 15)
    await logSession(u, dog.id, skill.id, "2026-06-03T12:00:00Z");
    await logSession(u, dog.id, skill.id, "2026-06-15T12:00:00Z");

    // GET with window June 1–8 (exclusive end)
    const get = await app.request(
      `/api/dogs/${dog.id}/focus?weekStart=${WEEK_START}&weekEnd=${WEEK_END}`,
      { headers: u.authHeaders },
    );
    expect(get.status).toBe(200);
    const body = (await get.json()) as {
      focusSkills: Array<{
        skillId: string;
        sessions: Array<{ id: string; occurredAt: string }>;
      }>;
    };
    expect(body.focusSkills).toHaveLength(1);
    const focusSkill = body.focusSkills[0];
    if (!focusSkill) throw new Error("expected focusSkill");
    expect(focusSkill.sessions).toHaveLength(1);
    // The Jun 3 session should be returned
    expect(focusSkill.sessions[0]?.occurredAt).toContain("2026-06-03");
  });

  // Case 5: DELETE removes the focus skill (ok); DELETE again → 404.
  it("DELETE removes focus skill; second DELETE returns 404", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    const skill = await makeSkill(goal.id);

    const add = await app.request(`/api/dogs/${dog.id}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ skillId: skill.id }),
    });
    expect(add.status).toBe(201);

    const del = await app.request(`/api/dogs/${dog.id}/focus/${skill.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ ok: true });

    const del2 = await app.request(`/api/dogs/${dog.id}/focus/${skill.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });
    expect(del2.status).toBe(404);
    expect(await del2.json()).toEqual({ error: "not_found" });
  });

  // Case 6: Deleting the underlying skill cascades the focus row; GET focus → empty.
  it("deleting the underlying skill cascades the focus row", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const goal = await makeGoal(dog.id);
    const skill = await makeSkill(goal.id);

    const add = await app.request(`/api/dogs/${dog.id}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ skillId: skill.id }),
    });
    expect(add.status).toBe(201);

    // Delete the underlying skill
    const delSkill = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });
    expect(delSkill.status).toBe(200);

    // GET focus should now be empty (cascade deleted the weeklyFocus row)
    const get = await app.request(
      `/api/dogs/${dog.id}/focus?weekStart=${WEEK_START}&weekEnd=${WEEK_END}`,
      { headers: u.authHeaders },
    );
    expect(get.status).toBe(200);
    const body = (await get.json()) as { focusSkills: unknown[] };
    expect(body.focusSkills).toEqual([]);
  });
});
