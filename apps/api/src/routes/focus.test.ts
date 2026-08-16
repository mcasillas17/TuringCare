import { and, eq, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { dogs, focusCompatibilityWeeks, legacyFocusClaims, weeklyFocus } from "../db/schema";
import { claimLegacyFocus, legacyFocusWeekKey, rememberLegacyFocusWeek } from "../lib/focus";
import { type TestUser, createTestUser } from "../test-helpers";

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};
const WEEK_KEY = "2026-06-01";
const NEXT_WEEK_KEY = "2026-06-08";
const FOCUS_QUERY = `weekKey=${WEEK_KEY}&timezoneOffsetMinutes=0&weekEndTimezoneOffsetMinutes=0`;
const dogIds = new Set<string>();

async function makeDog(u: TestUser) {
  const res = await app.request("/api/dogs", {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify(validDog),
  });
  const dog = ((await res.json()) as { dog: { id: string } }).dog;
  dogIds.add(dog.id);
  return dog;
}

async function setupDogWithSkill(u: TestUser, name = "Sit") {
  const dog = await makeDog(u);
  const goalRes = await app.request(`/api/dogs/${dog.id}/goals`, {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify({ goal: "Recall" }),
  });
  const goal = ((await goalRes.json()) as { goal: { id: string } }).goal;
  const skillRes = await app.request(`/api/dogs/${dog.id}/goals/${goal.id}/skills`, {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify({ name, confidence: 1 }),
  });
  return { dog, skill: ((await skillRes.json()) as { skill: { id: string } }).skill };
}

async function logSession(u: TestUser, dogId: string, skillId: string, occurredAt: string) {
  const res = await app.request(`/api/dogs/${dogId}/skills/${skillId}/sessions`, {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify({ occurredAt }),
  });
  expect(res.status).toBe(201);
}

function currentLegacyWindow() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return `weekStart=${encodeURIComponent(start.toISOString())}&weekEnd=${encodeURIComponent(end.toISOString())}`;
}

function currentFocusWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return {
    weekKey: [
      start.getFullYear(),
      String(start.getMonth() + 1).padStart(2, "0"),
      String(start.getDate()).padStart(2, "0"),
    ].join("-"),
    query: new URLSearchParams({
      weekKey: [
        start.getFullYear(),
        String(start.getMonth() + 1).padStart(2, "0"),
        String(start.getDate()).padStart(2, "0"),
      ].join("-"),
      timezoneOffsetMinutes: String(start.getTimezoneOffset()),
      weekEndTimezoneOffsetMinutes: String(end.getTimezoneOffset()),
    }).toString(),
  };
}

async function expectDatabaseError(operation: Promise<unknown>, message: string) {
  try {
    await operation;
    throw new Error("expected database operation to fail");
  } catch (error) {
    if (error instanceof Error && error.message === "expected database operation to fail")
      throw error;
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    const actual = error instanceof Error ? `${error.message} ${cause}` : String(error);
    expect(actual).toContain(message);
  }
}

describe("dogs: weekly focus", () => {
  let u: TestUser;
  beforeAll(async () => {
    u = await createTestUser();
  });
  afterEach(async () => {
    for (const dogId of dogIds) {
      await db.delete(dogs).where(eq(dogs.id, dogId));
    }
    dogIds.clear();
  });
  afterAll(async () => {
    await u.cleanup();
  });

  it("keeps separate week rows and deleting one leaves the next week", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    const { skill: nextSkill } = await setupDogWithSkillForDog(u, dog.id, "Stay");
    expect(
      (
        await app.request(`/api/dogs/${dog.id}/focus`, {
          method: "POST",
          headers: u.authHeaders,
          body: JSON.stringify({ skillId: skill.id, weekKey: WEEK_KEY }),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await app.request(`/api/dogs/${dog.id}/focus`, {
          method: "POST",
          headers: u.authHeaders,
          body: JSON.stringify({ skillId: nextSkill.id, weekKey: NEXT_WEEK_KEY }),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await app.request(`/api/dogs/${dog.id}/focus/${skill.id}?weekKey=${WEEK_KEY}`, {
          method: "DELETE",
          headers: u.authHeaders,
        })
      ).status,
    ).toBe(200);
    const deleted = await app.request(`/api/dogs/${dog.id}/focus?${FOCUS_QUERY}`, {
      headers: u.authHeaders,
    });
    expect(((await deleted.json()) as { focusSkills: unknown[] }).focusSkills).toEqual([]);
    const next = await app.request(
      `/api/dogs/${dog.id}/focus?weekKey=${NEXT_WEEK_KEY}&timezoneOffsetMinutes=0&weekEndTimezoneOffsetMinutes=0`,
      { headers: u.authHeaders },
    );
    const nextBody = (await next.json()) as { focusSkills: Array<{ skillId: string }> };
    expect(nextBody.focusSkills[0]?.skillId).toBe(nextSkill.id);
  });

  it("rejects a non-Monday POST and malformed legacy range", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    const invalidNewContract = await app.request(`/api/dogs/${dog.id}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ skillId: skill.id, weekKey: "2026-06-02" }),
    });
    expect(invalidNewContract.status).toBe(400);
    expect(await invalidNewContract.json()).toMatchObject({ success: false });
    const legacy = await app.request(
      `/api/dogs/${dog.id}/focus?weekStart=2026-06-02T00%3A00%3A00.000Z&weekEnd=2026-06-09T00%3A00%3A00.000Z`,
      { headers: u.authHeaders },
    );
    expect(legacy.status).toBe(400);
    expect(await legacy.json()).toEqual({ error: "invalid_focus_week" });
  });

  it("enforces the database Monday constraint", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    await expectDatabaseError(
      db.insert(weeklyFocus).values({
        dogId: dog.id,
        skillId: skill.id,
        weekStart: "2026-06-02",
        position: 0,
      }),
      "weekly_focus_week_start_monday",
    );
  });

  it("replaces a different skill in the same week and makes duplicates idempotent", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    const { skill: replacement } = await setupDogWithSkillForDog(u, dog.id, "Stay");
    const add = (id: string) =>
      app.request(`/api/dogs/${dog.id}/focus`, {
        method: "POST",
        headers: u.authHeaders,
        body: JSON.stringify({ skillId: id, weekKey: WEEK_KEY }),
      });
    const initial = await add(skill.id);
    expect(initial.status).toBe(201);
    expect(await initial.json()).toEqual({
      focus: expect.objectContaining({
        id: expect.any(String),
        dogId: dog.id,
        skillId: skill.id,
        weekStart: WEEK_KEY,
        position: 0,
      }),
    });
    const replaced = await add(replacement.id);
    expect(replaced.status).toBe(200);
    expect(await replaced.json()).toEqual({
      focus: expect.objectContaining({
        id: expect.any(String),
        dogId: dog.id,
        skillId: replacement.id,
        weekStart: WEEK_KEY,
        position: 0,
      }),
    });
    const duplicate = await add(replacement.id);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual({ ok: true, unchanged: true });
  });

  it("setWeeklyFocus returns the existing row for unchanged writes", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    const focusModule = await import("../lib/focus");
    const setWeeklyFocus = (
      focusModule as {
        setWeeklyFocus?: (
          tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
          dogId: string,
          skillId: string,
          weekKey: string,
        ) => Promise<unknown>;
      }
    ).setWeeklyFocus;

    expect(setWeeklyFocus).toBeTypeOf("function");
    if (!setWeeklyFocus) return;

    const created = await db.transaction((tx) => setWeeklyFocus(tx, dog.id, skill.id, WEEK_KEY));
    expect(created).toMatchObject({
      kind: "created",
      focus: { dogId: dog.id, skillId: skill.id, weekStart: WEEK_KEY, position: 0 },
    });

    const unchanged = await db.transaction((tx) => setWeeklyFocus(tx, dog.id, skill.id, WEEK_KEY));
    expect(unchanged).toMatchObject({
      kind: "unchanged",
      focus: { dogId: dog.id, skillId: skill.id, weekStart: WEEK_KEY, position: 0 },
    });
  });

  it("claims the exact earliest retained NULL row into the requested week only once", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    const { skill: auditSkill } = await setupDogWithSkillForDog(u, dog.id, "Stay");
    await db.insert(weeklyFocus).values([
      { dogId: dog.id, skillId: skill.id, position: 0 },
      { dogId: dog.id, skillId: auditSkill.id, position: 1 },
    ]);
    await claimLegacyFocus(dog.id, WEEK_KEY);
    await claimLegacyFocus(dog.id, NEXT_WEEK_KEY);
    const claimed = await db.select().from(weeklyFocus).where(eq(weeklyFocus.dogId, dog.id));
    expect(claimed.find((row) => row.skillId === skill.id)?.weekStart).toBe(WEEK_KEY);
    expect(claimed.find((row) => row.skillId === auditSkill.id)?.weekStart).toBeNull();
    expect(
      await db.select().from(legacyFocusClaims).where(eq(legacyFocusClaims.dogId, dog.id)),
    ).toHaveLength(1);
  });

  it("claims a retained NULL row when the current new-contract GET reads focus", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    const current = currentFocusWindow();
    await db.insert(weeklyFocus).values({ dogId: dog.id, skillId: skill.id, position: 0 });

    const get = await app.request(`/api/dogs/${dog.id}/focus?${current.query}`, {
      headers: u.authHeaders,
    });

    expect(get.status).toBe(200);
    const [claimed] = await db
      .select()
      .from(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dog.id), eq(weeklyFocus.skillId, skill.id)));
    expect(claimed?.weekStart).toBe(current.weekKey);
  });

  it("scopes compatibility context by dog and session", async () => {
    const { dog } = await setupDogWithSkill(u);
    const { dog: anotherDog } = await setupDogWithSkill(u, "Down");
    await rememberLegacyFocusWeek(dog.id, "session-a", WEEK_KEY);
    expect(await legacyFocusWeekKey(dog.id, "session-a")).toBe(WEEK_KEY);
    expect(await legacyFocusWeekKey(dog.id, "session-b")).toBeNull();
    expect(await legacyFocusWeekKey(anotherDog.id, "session-a")).toBeNull();
  });

  it("removes expired compatibility context while retaining the current context", async () => {
    const { dog } = await setupDogWithSkill(u);
    const { dog: anotherDog } = await setupDogWithSkill(u, "Down");
    await db.insert(focusCompatibilityWeeks).values({
      dogId: anotherDog.id,
      sessionId: "expired-session",
      weekStart: NEXT_WEEK_KEY,
      expiresAt: new Date(Date.now() - 1),
    });

    await rememberLegacyFocusWeek(dog.id, "current-session", WEEK_KEY);

    expect(
      await db
        .select()
        .from(focusCompatibilityWeeks)
        .where(eq(focusCompatibilityWeeks.dogId, anotherDog.id)),
    ).toEqual([]);
    expect(await legacyFocusWeekKey(dog.id, "current-session")).toBe(WEEK_KEY);
  });

  it("serializes claim versus replacement and concurrent replacements", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    const { skill: replacement } = await setupDogWithSkillForDog(u, dog.id, "Stay");
    await db.insert(weeklyFocus).values({ dogId: dog.id, skillId: skill.id, position: 0 });
    const post = (skillId: string) =>
      app.request(`/api/dogs/${dog.id}/focus`, {
        method: "POST",
        headers: u.authHeaders,
        body: JSON.stringify({ skillId, weekKey: WEEK_KEY }),
      });
    const [claim, set] = await Promise.all([
      claimLegacyFocus(dog.id, WEEK_KEY),
      post(replacement.id),
    ]);
    expect([200, 201]).toContain(set.status);
    expect(claim).toBeUndefined();
    const claimedRows = await db
      .select()
      .from(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dog.id), eq(weeklyFocus.weekStart, WEEK_KEY)));
    expect(claimedRows).toHaveLength(1);
    expect(claimedRows[0]?.skillId).toBe(replacement.id);
    const replacements = await Promise.all([post(skill.id), post(replacement.id)]);
    expect(replacements.map((response) => response.status)).toEqual([200, 200]);
    const rows = await db
      .select()
      .from(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dog.id), eq(weeklyFocus.weekStart, WEEK_KEY)));
    expect(rows).toHaveLength(1);
  });

  it("rejects direct unscoped history deletion and cascades focus through skills and dogs", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    await db
      .insert(weeklyFocus)
      .values({ dogId: dog.id, skillId: skill.id, weekStart: WEEK_KEY, position: 0 });
    await expectDatabaseError(
      db
        .delete(weeklyFocus)
        .where(and(eq(weeklyFocus.dogId, dog.id), eq(weeklyFocus.skillId, skill.id))),
      "week-scoped focus delete requires app.allow_weekly_focus_delete",
    );
    expect(
      (
        await app.request(`/api/dogs/${dog.id}/skills/${skill.id}`, {
          method: "DELETE",
          headers: u.authHeaders,
        })
      ).status,
    ).toBe(200);
    expect(await db.select().from(weeklyFocus).where(eq(weeklyFocus.dogId, dog.id))).toEqual([]);
    expect(
      (await app.request(`/api/dogs/${dog.id}`, { method: "DELETE", headers: u.authHeaders }))
        .status,
    ).toBe(200);
  });

  it("serializes clear versus replacement without throwing", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    const { skill: replacement } = await setupDogWithSkillForDog(u, dog.id, "Stay");
    await app.request(`/api/dogs/${dog.id}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ skillId: skill.id, weekKey: WEEK_KEY }),
    });
    const [clear, set] = await Promise.all([
      app.request(`/api/dogs/${dog.id}/focus/${skill.id}?weekKey=${WEEK_KEY}`, {
        method: "DELETE",
        headers: u.authHeaders,
      }),
      app.request(`/api/dogs/${dog.id}/focus`, {
        method: "POST",
        headers: u.authHeaders,
        body: JSON.stringify({ skillId: replacement.id, weekKey: WEEK_KEY }),
      }),
    ]);
    expect([200, 404]).toContain(clear.status);
    expect([200, 201]).toContain(set.status);
    const rows = await db
      .select()
      .from(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dog.id), eq(weeklyFocus.weekStart, WEEK_KEY)));
    expect(rows.length).toBeLessThanOrEqual(1);
    if (rows.length === 1) expect(rows[0]?.skillId).toBe(replacement.id);
  });

  it("supports current legacy GET, POST and DELETE only after the GET context", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    const post = () =>
      app.request(`/api/dogs/${dog.id}/focus`, {
        method: "POST",
        headers: u.authHeaders,
        body: JSON.stringify({ skillId: skill.id }),
      });
    expect((await post()).status).toBe(409);
    const historical = await app.request(
      `/api/dogs/${dog.id}/focus?weekStart=2026-06-01T00%3A00%3A00.000Z&weekEnd=2026-06-08T00%3A00%3A00.000Z`,
      { headers: u.authHeaders },
    );
    expect(historical.status).toBe(200);
    expect((await post()).status).toBe(409);
    expect(
      (
        await app.request(`/api/dogs/${dog.id}/focus?${currentLegacyWindow()}`, {
          headers: u.authHeaders,
        })
      ).status,
    ).toBe(200);
    expect((await post()).status).toBe(201);
    expect(
      (
        await app.request(`/api/dogs/${dog.id}/focus/${skill.id}`, {
          method: "DELETE",
          headers: u.authHeaders,
        })
      ).status,
    ).toBe(200);
  });

  it("loads sessions using the requested offset-bounded week", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    await db.insert(weeklyFocus).values({
      dogId: dog.id,
      skillId: skill.id,
      weekStart: WEEK_KEY,
      position: 0,
    });
    await logSession(u, dog.id, skill.id, "2026-06-03T12:00:00.000Z");
    await logSession(u, dog.id, skill.id, "2026-06-15T12:00:00.000Z");
    const get = await app.request(`/api/dogs/${dog.id}/focus?${FOCUS_QUERY}`, {
      headers: u.authHeaders,
    });
    expect(get.status).toBe(200);
    const body = (await get.json()) as {
      focusSkills: Array<{
        name: string;
        goalName: string;
        sessions: Array<{ occurredAt: string }>;
      }>;
    };
    expect(body.focusSkills).toHaveLength(1);
    const [focusSkill] = body.focusSkills;
    expect(focusSkill?.name).toBe("Sit");
    expect(focusSkill?.goalName).toBe("Recall");
    expect(focusSkill?.sessions).toHaveLength(1);
    expect(focusSkill?.sessions[0]?.occurredAt).toContain("2026-06-03");
    expect(
      await db
        .select()
        .from(weeklyFocus)
        .where(and(eq(weeklyFocus.dogId, dog.id), isNull(weeklyFocus.weekStart))),
    ).toEqual([]);
  });

  it("returns 404 when a new-contract POST names an unowned skill", async () => {
    const { dog } = await setupDogWithSkill(u);

    const res = await app.request(`/api/dogs/${dog.id}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        skillId: "00000000-0000-4000-8000-000000000001",
        weekKey: WEEK_KEY,
      }),
    });

    expect(res.status).toBe(404);
  });

  it("returns ok for the first new-contract DELETE and 404 for the second", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    await app.request(`/api/dogs/${dog.id}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ skillId: skill.id, weekKey: WEEK_KEY }),
    });

    const first = await app.request(`/api/dogs/${dog.id}/focus/${skill.id}?weekKey=${WEEK_KEY}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });

    const second = await app.request(`/api/dogs/${dog.id}/focus/${skill.id}?weekKey=${WEEK_KEY}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });
    expect(second.status).toBe(404);
    expect(await second.json()).toEqual({ error: "not_found" });
  });
});

async function setupDogWithSkillForDog(u: TestUser, dogId: string, name: string) {
  const goalRes = await app.request(`/api/dogs/${dogId}/goals`, {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify({ goal: `${name} goal` }),
  });
  const goal = ((await goalRes.json()) as { goal: { id: string } }).goal;
  const skillRes = await app.request(`/api/dogs/${dogId}/goals/${goal.id}/skills`, {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify({ name, confidence: 1 }),
  });
  return { skill: ((await skillRes.json()) as { skill: { id: string } }).skill };
}
