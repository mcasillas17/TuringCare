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
  it("is public — lists without auth", async () => {
    expect((await app.request("/api/trainers")).status).toBe(200);
  });
  it("lists, filters, fetches one (no auth)", async () => {
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
    const all = await app.request("/api/trainers");
    expect(all.status).toBe(200);
    expect(((await all.json()) as { trainers: unknown[] }).trainers.length).toBeGreaterThan(0);
    const filtered = await app.request("/api/trainers?state=TX&specialty=reactivity");
    expect(
      ((await filtered.json()) as { trainers: { id: string }[] }).trainers.some(
        (x) => x.id === tr.id,
      ),
    ).toBe(true);
    const miss = await app.request("/api/trainers?state=ZZ");
    expect(((await miss.json()) as { trainers: unknown[] }).trainers).toEqual([]);
    const one = await app.request(`/api/trainers/${tr.id}`);
    const oneBody = (await one.json()) as { trainer: Record<string, unknown> };
    expect(oneBody.trainer.name).toBe("Pat R+");
    expect(oneBody.trainer.notesInternal).toBeUndefined();
    expect((await app.request("/api/trainers/00000000-0000-0000-0000-000000000000")).status).toBe(
      404,
    );
  });
  it("LIST never returns email/phone — even when authenticated", async () => {
    const u = await createTestUser();
    users.push(u);
    const [tr] = await db
      .insert(trainers)
      .values({
        name: "Contact Haver",
        city: "Austin",
        state: "TX",
        email: "trainer@example.com",
        phone: "+1-555-0100",
      })
      .returning();
    if (!tr) throw new Error("insert failed");
    made.push(tr.id);

    // Anonymous list: contact nulled.
    const anon = (await (await app.request("/api/trainers")).json()) as {
      trainers: { id: string; email: string | null; phone: string | null }[];
    };
    const anonRow = anon.trainers.find((x) => x.id === tr.id);
    expect(anonRow?.email).toBeNull();
    expect(anonRow?.phone).toBeNull();

    // Authed list: contact STILL nulled (bulk-scrape surface).
    const authed = (await (
      await app.request("/api/trainers", { headers: u.authHeaders })
    ).json()) as { trainers: { id: string; email: string | null; phone: string | null }[] };
    const authedRow = authed.trainers.find((x) => x.id === tr.id);
    expect(authedRow?.email).toBeNull();
    expect(authedRow?.phone).toBeNull();
  });
  it("DETAIL nulls contact for anon, reveals it for authed", async () => {
    const u = await createTestUser();
    users.push(u);
    const [tr] = await db
      .insert(trainers)
      .values({
        name: "Reveal Me",
        city: "Denver",
        state: "CO",
        email: "reveal@example.com",
        phone: "+1-555-0199",
      })
      .returning();
    if (!tr) throw new Error("insert failed");
    made.push(tr.id);

    // Anonymous detail: contact nulled.
    const anon = (await (await app.request(`/api/trainers/${tr.id}`)).json()) as {
      trainer: { email: string | null; phone: string | null };
    };
    expect(anon.trainer.email).toBeNull();
    expect(anon.trainer.phone).toBeNull();

    // Authenticated detail: real contact values.
    const authed = (await (
      await app.request(`/api/trainers/${tr.id}`, { headers: u.authHeaders })
    ).json()) as { trainer: { email: string | null; phone: string | null } };
    expect(authed.trainer.email).toBe("reveal@example.com");
    expect(authed.trainer.phone).toBe("+1-555-0199");
  });
});
