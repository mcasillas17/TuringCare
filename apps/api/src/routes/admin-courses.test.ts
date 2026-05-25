import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { courses, user } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";

const adminEmail = `course_adm_${Date.now()}@example.com`;
const createdCourseIds: string[] = [];

afterAll(async () => {
  for (const id of createdCourseIds) {
    await db.delete(courses).where(eq(courses.id, id));
  }
  await db.delete(user).where(eq(user.email, adminEmail));
});

/** Sign up a user, promote to admin in the DB, return its session cookie. */
async function adminCookie(): Promise<string> {
  const u = await createTestUser();
  await db.update(user).set({ role: "admin" }).where(eq(user.id, u.userId));
  return u.authHeaders.cookie as string;
}

const validCourse = {
  organizationName: "Seattle Humane Dog Training Center",
  city: "Bellevue",
  state: "WA",
  name: "Puppy Manners 1",
  description: "A 6-week class.",
  format: "group",
  ageGroup: "puppy",
  ageRange: "15-20 weeks",
  durationWeeks: 6,
  sessionMinutes: 60,
  prerequisites: "Dog Training Basics",
  skillsTaught: ["polite greetings", "basic skills"],
  isOnline: false,
  coursePageUrl: "https://example.com/course",
};

describe("admin courses: auth", () => {
  it("POST returns 401 when anonymous", async () => {
    const res = await app.request("/api/admin/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validCourse),
    });
    expect(res.status).toBe(401);
  });

  it("POST returns 403 for a non-admin user", async () => {
    const u = await createTestUser();
    try {
      const res = await app.request("/api/admin/courses", {
        method: "POST",
        headers: u.authHeaders,
        body: JSON.stringify(validCourse),
      });
      expect(res.status).toBe(403);
    } finally {
      await u.cleanup();
    }
  });
});

describe("admin courses: CRUD", () => {
  let cookie: string;
  const cleanups: TestUser[] = [];
  afterEach(async () => {
    for (let u = cleanups.pop(); u; u = cleanups.pop()) await u.cleanup();
  });

  async function getCookie(): Promise<string> {
    if (!cookie) cookie = await adminCookie();
    return cookie;
  }

  it("creates a course (201) and the public directory lists it", async () => {
    const c = await getCookie();
    const res = await app.request("/api/admin/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: c },
      body: JSON.stringify(validCourse),
    });
    expect(res.status).toBe(201);
    const { course } = (await res.json()) as { course: { id: string; name: string } };
    createdCourseIds.push(course.id);
    expect(course.name).toBe("Puppy Manners 1");

    const viewer = await createTestUser();
    cleanups.push(viewer);
    const list = await app.request("/api/courses", { headers: viewer.authHeaders });
    expect(list.status).toBe(200);
    const { courses: rows } = (await list.json()) as { courses: { id: string }[] };
    expect(rows.some((x) => x.id === course.id)).toBe(true);
  });

  it("updates a course (200)", async () => {
    const c = await getCookie();
    const created = await app.request("/api/admin/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: c },
      body: JSON.stringify(validCourse),
    });
    const { course } = (await created.json()) as { course: { id: string } };
    createdCourseIds.push(course.id);

    const res = await app.request(`/api/admin/courses/${course.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: c },
      body: JSON.stringify({ ...validCourse, name: "Puppy Manners 1 (Updated)" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { course: { name: string } }).course.name).toBe(
      "Puppy Manners 1 (Updated)",
    );
  });

  it("deletes a course (200) and removes it from the directory", async () => {
    const c = await getCookie();
    const created = await app.request("/api/admin/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: c },
      body: JSON.stringify(validCourse),
    });
    const { course } = (await created.json()) as { course: { id: string } };

    const del = await app.request(`/api/admin/courses/${course.id}`, {
      method: "DELETE",
      headers: { cookie: c },
    });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ ok: true });

    const viewer = await createTestUser();
    cleanups.push(viewer);
    const after = await app.request(`/api/courses/${course.id}`, { headers: viewer.authHeaders });
    expect(after.status).toBe(404);
  });

  it("rejects an invalid body with 400 (bad format enum)", async () => {
    const c = await getCookie();
    const res = await app.request("/api/admin/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: c },
      body: JSON.stringify({ ...validCourse, format: "lecture" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid body with 400 (missing organizationName)", async () => {
    const c = await getCookie();
    const { organizationName, ...rest } = validCourse;
    const res = await app.request("/api/admin/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: c },
      body: JSON.stringify(rest),
    });
    expect(res.status).toBe(400);
  });

  it("PUT unknown id → 404", async () => {
    const c = await getCookie();
    const res = await app.request("/api/admin/courses/00000000-0000-0000-0000-000000000000", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: c },
      body: JSON.stringify(validCourse),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE unknown id → 404", async () => {
    const c = await getCookie();
    const res = await app.request("/api/admin/courses/00000000-0000-0000-0000-000000000000", {
      method: "DELETE",
      headers: { cookie: c },
    });
    expect(res.status).toBe(404);
  });
});
