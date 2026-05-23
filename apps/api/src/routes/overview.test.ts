import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { type TestUser, createTestUser } from "../test-helpers";

describe("overview", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });
  it("requires auth", async () => {
    expect((await app.request("/api/overview")).status).toBe(401);
  });
  it("returns owner-scoped aggregates", async () => {
    const u = await createTestUser();
    users.push(u);
    const empty = await app.request("/api/overview", { headers: u.authHeaders });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({
      dogCount: 0,
      journalEntryCount: 0,
      latestBrief: null,
      recentActivity: [],
    });
    const dr = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        name: "Biscuit",
        size: "medium",
        sex: "female",
        source: "rescue",
        vaccineStage: "in_progress",
        spayedNeutered: true,
      }),
    });
    const dog = ((await dr.json()) as { dog: { id: string } }).dog;
    await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        kind: "moment",
        note: "Barked",
        intensity: 3,
      }),
    });
    const r = await app.request("/api/overview", { headers: u.authHeaders });
    const body = (await r.json()) as {
      dogCount: number;
      journalEntryCount: number;
      recentActivity: { dogName: string; behavior: string }[];
    };
    expect(body.dogCount).toBe(1);
    expect(body.journalEntryCount).toBe(1);
    expect(body.recentActivity[0]).toMatchObject({ dogName: "Biscuit", behavior: "Barked" });
  });
});
