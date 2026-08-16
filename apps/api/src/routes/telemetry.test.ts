import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { events } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

async function countEvents(userId: string, name: string): Promise<number> {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), eq(events.name, name)));
  return rows.length;
}

async function createDog(u: TestUser): Promise<string> {
  const res = await app.request("/api/dogs", {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify(validDog),
  });
  const { dog } = (await res.json()) as { dog: { id: string } };
  return dog.id;
}

describe("server-side telemetry emission", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  it("records dog.created", async () => {
    const u = await createTestUser();
    users.push(u);
    await createDog(u);
    expect(await countEvents(u.userId, "dog.created")).toBe(1);
  });

  it("records successful dog update and delete actions", async () => {
    const u = await createTestUser();
    users.push(u);
    const dogId = await createDog(u);
    const update = await app.request(`/api/dogs/${dogId}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ ...validDog, name: "Updated Biscuit" }),
    });
    expect(update.status).toBe(200);
    const remove = await app.request(`/api/dogs/${dogId}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });
    expect(remove.status).toBe(200);
    expect(await countEvents(u.userId, "dog.updated")).toBe(1);
    expect(await countEvents(u.userId, "dog.deleted")).toBe(1);
  });

  it("records journal.entry_created", async () => {
    const u = await createTestUser();
    users.push(u);
    const dogId = await createDog(u);
    await app.request(`/api/dogs/${dogId}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ kind: "moment", note: "chewed a shoe" }),
    });
    expect(await countEvents(u.userId, "journal.entry_created")).toBe(1);
  });

  it("records training.goal_added, practice_logged, focus telemetry and level_set", async () => {
    const u = await createTestUser();
    users.push(u);
    const dogId = await createDog(u);
    const goalRes = await app.request(`/api/dogs/${dogId}/goals`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ goal: "Calm greetings" }),
    });
    const { goal } = (await goalRes.json()) as { goal: { id: string } };
    const skillRes = await app.request(`/api/dogs/${dogId}/goals/${goal.id}/skills`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ name: "Door-knock threshold", confidence: 1 }),
    });
    const { skill } = (await skillRes.json()) as { skill: { id: string } };
    await app.request(`/api/dogs/${dogId}/skills/${skill.id}/sessions`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ occurredAt: new Date().toISOString() }),
    });
    await app.request(`/api/dogs/${dogId}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ skillId: skill.id, weekKey: "2026-08-10" }),
    });
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    await app.request(
      `/api/dogs/${dogId}/focus?weekStart=${encodeURIComponent(start.toISOString())}&weekEnd=${encodeURIComponent(end.toISOString())}`,
      { headers: u.authHeaders },
    );
    await app.request(`/api/dogs/${dogId}/skills/${skill.id}/level`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ level: 3 }),
    });
    expect(await countEvents(u.userId, "training.goal_added")).toBe(1);
    expect(await countEvents(u.userId, "training.practice_logged")).toBe(1);
    expect(await countEvents(u.userId, "focus.week_set")).toBe(1);
    expect(await countEvents(u.userId, "focus.legacy_compat_used")).toBe(1);
    expect(await countEvents(u.userId, "training.level_set")).toBe(1);
  });

  it("requires legacy POST context before emitting compatibility telemetry", async () => {
    const u = await createTestUser();
    users.push(u);
    const dogId = await createDog(u);
    const writeWithoutContext = await app.request(`/api/dogs/${dogId}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ skillId: "00000000-0000-4000-8000-000000000001" }),
    });
    expect(writeWithoutContext.status).toBe(409);
    expect(await countEvents(u.userId, "focus.legacy_compat_used")).toBe(0);

    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    const read = await app.request(
      `/api/dogs/${dogId}/focus?weekStart=${encodeURIComponent(start.toISOString())}&weekEnd=${encodeURIComponent(end.toISOString())}`,
      { headers: u.authHeaders },
    );
    expect(read.status).toBe(200);

    const write = await app.request(`/api/dogs/${dogId}/focus`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ skillId: "00000000-0000-4000-8000-000000000001" }),
    });

    expect(write.status).toBe(404);
    expect(await countEvents(u.userId, "focus.legacy_compat_used")).toBe(2);
  });

  it("records the brief lifecycle (generated, finalized, shared)", async () => {
    const u = await createTestUser();
    users.push(u);
    const dogId = await createDog(u);
    await app.request(`/api/dogs/${dogId}/brief?window=30d`, {
      method: "POST",
      headers: u.authHeaders,
    });
    await app.request(`/api/dogs/${dogId}/brief`, { method: "PUT", headers: u.authHeaders });
    await app.request(`/api/dogs/${dogId}/brief/share`, { method: "POST", headers: u.authHeaders });
    expect(await countEvents(u.userId, "brief.generated")).toBe(1);
    expect(await countEvents(u.userId, "brief.finalized")).toBe(1);
    expect(await countEvents(u.userId, "brief.shared")).toBe(1);
  });
});
