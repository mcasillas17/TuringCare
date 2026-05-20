import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { trainers } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";

describe("trainers", () => {
  const users: TestUser[] = [];
  const made: string[] = [];
  afterEach(async () => {
    for (const id of made.splice(0)) await db.delete(trainers).where(eq(trainers.id, id));
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });
  it("requires auth", async () => {
    expect((await app.request("/api/trainers")).status).toBe(401);
  });
  it("lists, filters, fetches one", async () => {
    const u = await createTestUser();
    users.push(u);
    const [tr] = await db
      .insert(trainers)
      .values({
        name: "Pat R+",
        city: "Austin",
        state: "TX",
        methodologyTags: ["reward-based"],
        certifications: ["CCPDT"],
        specialties: ["reactivity"],
      })
      .returning();
    if (!tr) throw new Error("insert failed");
    made.push(tr.id);
    const all = await app.request("/api/trainers", { headers: u.authHeaders });
    expect(all.status).toBe(200);
    expect(((await all.json()) as { trainers: unknown[] }).trainers.length).toBeGreaterThan(0);
    const filtered = await app.request("/api/trainers?state=TX&specialty=reactivity", {
      headers: u.authHeaders,
    });
    expect(
      ((await filtered.json()) as { trainers: { id: string }[] }).trainers.some(
        (x) => x.id === tr.id,
      ),
    ).toBe(true);
    const miss = await app.request("/api/trainers?state=ZZ", { headers: u.authHeaders });
    expect(((await miss.json()) as { trainers: unknown[] }).trainers).toEqual([]);
    const one = await app.request(`/api/trainers/${tr.id}`, { headers: u.authHeaders });
    const oneBody = (await one.json()) as { trainer: Record<string, unknown> };
    expect(oneBody.trainer.name).toBe("Pat R+");
    expect(oneBody.trainer.notesInternal).toBeUndefined();
    expect(
      (
        await app.request("/api/trainers/00000000-0000-0000-0000-000000000000", {
          headers: u.authHeaders,
        })
      ).status,
    ).toBe(404);
  });
});
