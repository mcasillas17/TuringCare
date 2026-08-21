import { and, eq, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const contextualProgressSummaryControl = vi.hoisted(() => ({
  captureNow: undefined as ((now: Date) => void) | undefined,
  rejection: undefined as Error | undefined,
}));

vi.mock("../lib/contextual-progress-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/contextual-progress-data")>();
  return {
    ...actual,
    loadContextualProgressSummaries: vi.fn(
      async (...args: Parameters<typeof actual.loadContextualProgressSummaries>) => {
        contextualProgressSummaryControl.captureNow?.(args[1]);
        if (contextualProgressSummaryControl.rejection) {
          throw contextualProgressSummaryControl.rejection;
        }
        return actual.loadContextualProgressSummaries(...args);
      },
    ),
  };
});

import { app } from "../app";
import { CURRICULUM_VERSION } from "../data/training-curriculum";
import { db, pool } from "../db";
import {
  dogSafetySignals,
  dogs,
  focusCompatibilityWeeks,
  legacyFocusClaims,
  practiceSessions,
  trainingSkills,
  weeklyFocus,
} from "../db/schema";
import { loadContextualProgressSummaries } from "../lib/contextual-progress-data";
import { claimLegacyFocus, legacyFocusWeekKey, rememberLegacyFocusWeek } from "../lib/focus";
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

async function waitForAdvisoryLockWaiter() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ waiting: boolean }>(
      "select exists (select 1 from pg_locks where locktype = 'advisory' and not granted and database = (select oid from pg_database where datname = current_database())) as waiting",
    );
    if (result.rows[0]?.waiting) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("timed out waiting for a focus advisory lock waiter");
}

function beginHeldSafetyWrite(dogId: string) {
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
      type: "aggression_or_bite_risk",
      source: "practice_session",
      reportedAt: new Date(),
    });
    markReady?.();
    await hold;
  });

  return { ready, release: () => release?.(), write };
}

describe("dogs: weekly focus", () => {
  let u: TestUser;
  beforeAll(async () => {
    u = await createTestUser();
  });
  afterEach(async () => {
    contextualProgressSummaryControl.captureNow = undefined;
    contextualProgressSummaryControl.rejection = undefined;
    vi.clearAllMocks();
    vi.restoreAllMocks();
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

  it("setWeeklyFocus rejects a skill from another dog and leaves focus empty", async () => {
    const { dog } = await setupDogWithSkill(u);
    const { dog: otherDog, skill: otherSkill } = await setupDogWithSkill(u, "Stay");
    const focusModule = await import("../lib/focus");

    await expect(
      db.transaction((tx) => focusModule.setWeeklyFocus(tx, dog.id, otherSkill.id, WEEK_KEY)),
    ).rejects.toMatchObject({ name: "FocusSkillDogMismatchError" });
    expect(focusModule.FocusSkillDogMismatchError).toBeTypeOf("function");

    expect(await db.select().from(weeklyFocus).where(eq(weeklyFocus.dogId, dog.id))).toEqual([]);
    expect(await db.select().from(weeklyFocus).where(eq(weeklyFocus.dogId, otherDog.id))).toEqual(
      [],
    );
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
        currentLevel: number;
        dimensions: string[];
        name: string;
        goalName: string;
        sessions: Array<{ occurredAt: string }>;
        contextualProgress: {
          status: string;
          summary: { strongestContext: unknown; nextPracticeAction: unknown };
        };
      }>;
    };
    expect(body.focusSkills).toHaveLength(1);
    const [focusSkill] = body.focusSkills;
    expect(focusSkill?.name).toBe("Sit");
    expect(focusSkill?.goalName).toBe("Recall");
    expect(focusSkill?.currentLevel).toBe(1);
    expect(focusSkill?.dimensions).toEqual([]);
    expect(focusSkill?.sessions).toHaveLength(1);
    expect(focusSkill?.sessions[0]?.occurredAt).toContain("2026-06-03");
    expect(focusSkill?.contextualProgress).toEqual({
      status: "ready",
      summary: { strongestContext: null, nextPracticeAction: null, safety: null },
    });
    expect(
      await db
        .select()
        .from(weeklyFocus)
        .where(and(eq(weeklyFocus.dogId, dog.id), isNull(weeklyFocus.weekStart))),
    ).toEqual([]);
  });

  it("returns no summaries without querying evidence when no skills are provided", async () => {
    const selectSpy = vi.spyOn(db, "select");

    const summaries = await loadContextualProgressSummaries([], new Date());

    expect(summaries).toEqual(new Map());
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("loads current contextual summaries in one batched query and keeps skill groups independent", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    const { skill: customSkill } = await setupDogWithSkillForDog(u, dog.id, "Down");
    await db
      .update(trainingSkills)
      .set({ catalogSkillKey: "basic-manners.sit" })
      .where(eq(trainingSkills.id, skill.id));
    await db
      .update(trainingSkills)
      .set({ confidence: 2 })
      .where(eq(trainingSkills.id, customSkill.id));

    const now = new Date();
    const older = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const recent = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sentinel = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const catalogCurrentLevel = 1;
    const customCurrentLevel = 2;
    const context = {
      cueSupport: "hand_signal" as const,
      environment: "home_quiet" as const,
      distance: "across_room" as const,
      durationBand: "about_30_seconds" as const,
      distraction: "mild" as const,
    };
    await db.insert(practiceSessions).values([
      {
        skillId: skill.id,
        occurredAt: older,
        outcome: "went_well",
        practiceDay: older.toISOString().slice(0, 10),
        curriculumLevel: catalogCurrentLevel,
        curriculumVersion: CURRICULUM_VERSION,
        ...context,
      },
      {
        skillId: skill.id,
        occurredAt: recent,
        outcome: "went_well",
        practiceDay: recent.toISOString().slice(0, 10),
        curriculumLevel: catalogCurrentLevel,
        curriculumVersion: CURRICULUM_VERSION,
        ...context,
      },
      {
        skillId: customSkill.id,
        occurredAt: older,
        outcome: "went_well",
        practiceDay: older.toISOString().slice(0, 10),
        curriculumLevel: customCurrentLevel,
        curriculumVersion: CURRICULUM_VERSION,
        ...context,
      },
      {
        skillId: customSkill.id,
        occurredAt: recent,
        outcome: "went_well",
        practiceDay: recent.toISOString().slice(0, 10),
        curriculumLevel: customCurrentLevel,
        curriculumVersion: CURRICULUM_VERSION,
        ...context,
      },
      {
        skillId: customSkill.id,
        occurredAt: sentinel,
        outcome: "too_hard",
        practiceDay: sentinel.toISOString().slice(0, 10),
        curriculumLevel: catalogCurrentLevel,
        curriculumVersion: CURRICULUM_VERSION,
        ...context,
      },
      {
        skillId: skill.id,
        occurredAt: sentinel,
        outcome: "went_well",
        practiceDay: sentinel.toISOString().slice(0, 10),
        curriculumLevel: catalogCurrentLevel,
        curriculumVersion: "obsolete-version",
        ...context,
      },
    ]);

    const selectSpy = vi.spyOn(db, "select");
    const summaries = await loadContextualProgressSummaries(
      [
        {
          id: skill.id,
          confidence: catalogCurrentLevel,
          catalogSkillKey: "basic-manners.sit",
        },
        { id: customSkill.id, confidence: customCurrentLevel, catalogSkillKey: null },
      ],
      now,
    );
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(summaries.get(skill.id)).toEqual({
      strongestContext: {
        context,
        status: "reliable",
        successfulDistinctDays: 2,
        latestOutcome: "went_well",
        lastObservedAt: recent.toISOString(),
        lastSuccessfulAt: recent.toISOString(),
      },
      nextPracticeAction: {
        ruleId: "advance_reliable_context",
        direction: "harder",
        context: { ...context, cueSupport: "verbal_cue" },
        changedDimension: "cue_support",
      },
      safety: null,
    });
    expect(summaries.get(customSkill.id)).toEqual({
      strongestContext: {
        context,
        status: "reliable",
        successfulDistinctDays: 2,
        latestOutcome: "went_well",
        lastObservedAt: recent.toISOString(),
        lastSuccessfulAt: recent.toISOString(),
      },
      nextPracticeAction: null,
      safety: null,
    });
  });

  it("uses request time for current summaries even when the focus week is historical", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    await db
      .update(trainingSkills)
      .set({ catalogSkillKey: "basic-manners.sit" })
      .where(eq(trainingSkills.id, skill.id));
    await db.insert(weeklyFocus).values({
      dogId: dog.id,
      skillId: skill.id,
      weekStart: WEEK_KEY,
      position: 0,
    });
    const evidenceNow = new Date();
    const older = new Date(evidenceNow.getTime() - 2 * 24 * 60 * 60 * 1000);
    const recent = new Date(evidenceNow.getTime() - 24 * 60 * 60 * 1000);
    const context = {
      cueSupport: "hand_signal" as const,
      environment: "home_quiet" as const,
      distance: "across_room" as const,
      durationBand: "about_30_seconds" as const,
      distraction: "mild" as const,
    };
    await db.insert(practiceSessions).values([
      {
        skillId: skill.id,
        occurredAt: older,
        outcome: "went_well",
        practiceDay: older.toISOString().slice(0, 10),
        curriculumLevel: 1,
        curriculumVersion: CURRICULUM_VERSION,
        ...context,
      },
      {
        skillId: skill.id,
        occurredAt: recent,
        outcome: "went_well",
        practiceDay: recent.toISOString().slice(0, 10),
        curriculumLevel: 1,
        curriculumVersion: CURRICULUM_VERSION,
        ...context,
      },
    ]);

    let summaryNow: Date | undefined;
    contextualProgressSummaryControl.captureNow = (now) => {
      summaryNow = now;
    };
    const beforeRequest = Date.now();
    const response = await app.request(`/api/dogs/${dog.id}/focus?${FOCUS_QUERY}`, {
      headers: u.authHeaders,
    });
    const afterRequest = Date.now();

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      focusSkills: Array<{
        contextualProgress: {
          status: string;
          summary: {
            strongestContext: { status: string } | null;
            nextPracticeAction: unknown;
          };
        };
      }>;
    };
    const summary = body.focusSkills[0]?.contextualProgress;
    expect(summary?.status).toBe("ready");
    expect(summary?.summary).toEqual({
      strongestContext: expect.objectContaining({ status: "reliable" }),
      nextPracticeAction: expect.objectContaining({ direction: "harder" }),
      safety: null,
    });
    expect(body.focusSkills).toHaveLength(1);
    expect(summaryNow?.getTime()).toBeGreaterThanOrEqual(beforeRequest);
    expect(summaryNow?.getTime()).toBeLessThanOrEqual(afterRequest);
  });

  it("preserves focus sessions and controls when contextual summaries are unavailable", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    await db.insert(weeklyFocus).values({
      dogId: dog.id,
      skillId: skill.id,
      weekStart: WEEK_KEY,
      position: 0,
    });
    await logSession(u, dog.id, skill.id, "2026-06-03T12:00:00.000Z");
    const rawError = "summary-owner-content-sentinel";
    contextualProgressSummaryControl.rejection = new TypeError(rawError);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await app.request(`/api/dogs/${dog.id}/focus?${FOCUS_QUERY}`, {
      headers: u.authHeaders,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      focusSkills: Array<{
        skillId: string;
        name: string;
        sessions: Array<{ occurredAt: string }>;
        contextualProgress: { status: string };
      }>;
    };
    expect(body.focusSkills).toEqual([
      expect.objectContaining({
        skillId: skill.id,
        name: "Sit",
        sessions: [expect.objectContaining({ occurredAt: expect.stringContaining("2026-06-03") })],
        contextualProgress: { status: "unavailable" },
      }),
    ]);
    expect(vi.mocked(loadContextualProgressSummaries)).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("[contextual-progress] focus_summary_failed", {
      dogId: dog.id,
      weekKey: WEEK_KEY,
      errorType: "Unexpected TypeError",
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(rawError);
  });

  it("suppresses batched next actions while the dog has active safety", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    await db.insert(weeklyFocus).values({
      dogId: dog.id,
      skillId: skill.id,
      weekStart: currentFocusWindow().weekKey,
      position: 0,
    });
    const now = new Date();
    const first = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const second = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await db.insert(practiceSessions).values([
      {
        skillId: skill.id,
        occurredAt: first,
        outcome: "went_well",
        practiceDay: first.toISOString().slice(0, 10),
        curriculumLevel: 1,
        curriculumVersion: CURRICULUM_VERSION,
        cueSupport: "hand_signal",
        environment: "home_quiet",
        distance: "few_steps",
        durationBand: "about_15_seconds",
        distraction: "none",
      },
      {
        skillId: skill.id,
        occurredAt: second,
        outcome: "went_well",
        practiceDay: second.toISOString().slice(0, 10),
        curriculumLevel: 1,
        curriculumVersion: CURRICULUM_VERSION,
        cueSupport: "hand_signal",
        environment: "home_quiet",
        distance: "few_steps",
        durationBand: "about_15_seconds",
        distraction: "none",
      },
    ]);
    await db.insert(dogSafetySignals).values({
      dogId: dog.id,
      type: "injury_or_pain",
      source: "practice_session",
      reportedAt: now,
    });

    const response = await app.request(`/api/dogs/${dog.id}/focus?${currentFocusWindow().query}`, {
      headers: u.authHeaders,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      focusSkills: Array<{
        contextualProgress:
          | {
              status: "ready";
              summary: {
                strongestContext: { status: string } | null;
                nextPracticeAction: unknown;
                safety: { ruleId: string; referral: string } | null;
              };
            }
          | { status: "unavailable" };
      }>;
    };
    expect(body.focusSkills[0]?.contextualProgress).toEqual({
      status: "ready",
      summary: {
        strongestContext: expect.objectContaining({ status: "reliable" }),
        nextPracticeAction: null,
        safety: {
          suppressed: true,
          ruleId: "reported_injury_or_pain",
          referral: "veterinarian",
        },
      },
    });
  });

  it("waits for a concurrent aggression report before deriving batched contextual progress", async () => {
    const { dog, skill } = await setupDogWithSkill(u);
    const focusWindow = currentFocusWindow();
    await db.insert(weeklyFocus).values({
      dogId: dog.id,
      skillId: skill.id,
      weekStart: focusWindow.weekKey,
      position: 0,
    });
    const now = new Date();
    const context = {
      cueSupport: "hand_signal" as const,
      environment: "home_quiet" as const,
      distance: "few_steps" as const,
      durationBand: "about_15_seconds" as const,
      distraction: "none" as const,
    };
    for (const daysAgo of [2, 1]) {
      const occurredAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      await db.insert(practiceSessions).values({
        skillId: skill.id,
        occurredAt,
        outcome: "went_well",
        practiceDay: occurredAt.toISOString().slice(0, 10),
        curriculumLevel: 1,
        curriculumVersion: CURRICULUM_VERSION,
        ...context,
      });
    }

    const safetyWrite = beginHeldSafetyWrite(dog.id);
    await safetyWrite.ready;
    let completed = false;
    const responsePromise = Promise.resolve(
      app.request(`/api/dogs/${dog.id}/focus?${focusWindow.query}`, {
        headers: u.authHeaders,
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
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        focusSkills: Array<{
          contextualProgress:
            | {
                status: "ready";
                summary: {
                  nextPracticeAction: unknown;
                  safety: { ruleId: string; referral: string } | null;
                };
              }
            | { status: "unavailable" };
        }>;
      };
      expect(body.focusSkills[0]?.contextualProgress).toEqual({
        status: "ready",
        summary: {
          strongestContext: expect.any(Object),
          nextPracticeAction: null,
          safety: {
            suppressed: true,
            ruleId: "reported_aggression_or_bite_risk",
            referral: "veterinary_behaviorist",
          },
        },
      });
    } finally {
      safetyWrite.release();
      await Promise.allSettled([safetyWrite.write, responsePromise]);
    }
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
