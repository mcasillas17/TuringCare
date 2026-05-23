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

async function makeDog(u: TestUser, name = "Biscuit") {
  const res = await app.request("/api/dogs", {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify({ ...validDog, name }),
  });
  return ((await res.json()) as { dog: { id: string; name: string } }).dog;
}

async function makeEntry(
  u: TestUser,
  dogId: string,
  note: string,
  overrides: { occurredAt?: string } = {},
) {
  const res = await app.request(`/api/dogs/${dogId}/journal`, {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify({ kind: "moment", note, ...overrides }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { entry: { id: string } }).entry;
}

describe("global journal", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  it("requires auth", async () => {
    expect((await app.request("/api/journal")).status).toBe(401);
  });

  it("lists entries across owned dogs with dog summaries newest first", async () => {
    const u = await createTestUser();
    users.push(u);
    const biscuit = await makeDog(u, "Biscuit");
    const pancake = await makeDog(u, "Pancake");
    await makeEntry(u, biscuit.id, "Older biscuit note", {
      occurredAt: "2026-05-20T10:00:00.000Z",
    });
    await makeEntry(u, pancake.id, "Newer pancake note", {
      occurredAt: "2026-05-22T10:00:00.000Z",
    });

    const res = await app.request("/api/journal", { headers: u.authHeaders });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: Array<{ note: string; dog: { id: string; name: string } }>;
    };
    expect(body.entries).toHaveLength(2);
    expect(body.entries.map((entry) => entry.note)).toEqual(["Newer pancake note", "Older biscuit note"]);
    expect(body.entries.map((entry) => entry.dog)).toEqual([
      { id: pancake.id, name: "Pancake" },
      { id: biscuit.id, name: "Biscuit" },
    ]);
  });

  it("filters by owned dogId and returns 404 for another user's dog", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    users.push(owner, other);
    const ownedDog = await makeDog(owner, "Biscuit");
    const otherDog = await makeDog(other, "Pancake");
    await makeEntry(owner, ownedDog.id, "Owned note");
    await makeEntry(other, otherDog.id, "Other note");

    const filtered = await app.request(`/api/journal?dogId=${ownedDog.id}`, {
      headers: owner.authHeaders,
    });
    expect(filtered.status).toBe(200);
    const filteredBody = (await filtered.json()) as { entries: Array<{ note: string }> };
    expect(filteredBody.entries).toEqual([expect.objectContaining({ note: "Owned note" })]);

    const notOwned = await app.request(`/api/journal?dogId=${otherDog.id}`, {
      headers: owner.authHeaders,
    });
    expect(notOwned.status).toBe(404);
  });
});
