import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
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
