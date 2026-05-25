import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { courses } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";

describe("courses", () => {
  const users: TestUser[] = [];
  const made: string[] = [];
  afterEach(async () => {
    for (const id of made.splice(0)) await db.delete(courses).where(eq(courses.id, id));
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  it("is public — anonymous access succeeds", async () => {
    const [co] = await db
      .insert(courses)
      .values({
        organizationName: "Anon Provider",
        city: "Reno",
        state: "NV",
        name: "Anon Visible Class",
        format: "group",
        ageGroup: "adult",
        isOnline: false,
      })
      .returning();
    if (!co) throw new Error("insert failed");
    made.push(co.id);

    const list = await app.request("/api/courses");
    expect(list.status).toBe(200);
    const one = await app.request(`/api/courses/${co.id}`);
    expect(one.status).toBe(200);
    expect(((await one.json()) as { course: { name: string } }).course.name).toBe(
      "Anon Visible Class",
    );
  });

  it("lists, filters, fetches one", async () => {
    const u = await createTestUser();
    users.push(u);

    const [puppy] = await db
      .insert(courses)
      .values({
        organizationName: "Seattle Humane Dog Training Center",
        city: "Bellevue",
        state: "WA",
        name: "Puppy Manners 1",
        format: "group",
        ageGroup: "puppy",
        isOnline: false,
      })
      .returning();
    if (!puppy) throw new Error("insert failed");
    made.push(puppy.id);

    const [workshop] = await db
      .insert(courses)
      .values({
        organizationName: "Other Provider",
        city: "Portland",
        state: "OR",
        name: "Recall Workshop",
        format: "workshop",
        ageGroup: "adult",
        isOnline: true,
      })
      .returning();
    if (!workshop) throw new Error("insert failed");
    made.push(workshop.id);

    // Lists both.
    const all = await app.request("/api/courses", { headers: u.authHeaders });
    expect(all.status).toBe(200);
    const allBody = (await all.json()) as { courses: { id: string }[] };
    expect(allBody.courses.some((x) => x.id === puppy.id)).toBe(true);
    expect(allBody.courses.some((x) => x.id === workshop.id)).toBe(true);

    // ageGroup filter narrows to the puppy course.
    const byAge = await app.request("/api/courses?ageGroup=puppy", { headers: u.authHeaders });
    const byAgeBody = (await byAge.json()) as { courses: { id: string }[] };
    expect(byAgeBody.courses.some((x) => x.id === puppy.id)).toBe(true);
    expect(byAgeBody.courses.some((x) => x.id === workshop.id)).toBe(false);

    // format filter.
    const byFormat = await app.request("/api/courses?format=workshop", { headers: u.authHeaders });
    const byFormatBody = (await byFormat.json()) as { courses: { id: string }[] };
    expect(byFormatBody.courses.some((x) => x.id === workshop.id)).toBe(true);
    expect(byFormatBody.courses.some((x) => x.id === puppy.id)).toBe(false);

    // state filter.
    const byState = await app.request("/api/courses?state=WA", { headers: u.authHeaders });
    const byStateBody = (await byState.json()) as { courses: { id: string }[] };
    expect(byStateBody.courses.some((x) => x.id === puppy.id)).toBe(true);
    expect(byStateBody.courses.some((x) => x.id === workshop.id)).toBe(false);

    // online filter.
    const byOnline = await app.request("/api/courses?online=true", { headers: u.authHeaders });
    const byOnlineBody = (await byOnline.json()) as { courses: { id: string }[] };
    expect(byOnlineBody.courses.some((x) => x.id === workshop.id)).toBe(true);
    expect(byOnlineBody.courses.some((x) => x.id === puppy.id)).toBe(false);

    // GET /:id returns the course.
    const one = await app.request(`/api/courses/${puppy.id}`, { headers: u.authHeaders });
    const oneBody = (await one.json()) as { course: { name: string } };
    expect(oneBody.course.name).toBe("Puppy Manners 1");

    // Unknown id → 404.
    expect(
      (
        await app.request("/api/courses/00000000-0000-0000-0000-000000000000", {
          headers: u.authHeaders,
        })
      ).status,
    ).toBe(404);
  });
});
