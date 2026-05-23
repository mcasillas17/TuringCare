import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { trainers, user } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";

const adminEmail = `trainer_adm_${Date.now()}@example.com`;
const createdTrainerIds: string[] = [];

afterAll(async () => {
  for (const id of createdTrainerIds) {
    await db.delete(trainers).where(eq(trainers.id, id));
  }
  await db.delete(user).where(eq(user.email, adminEmail));
});

/** Sign up a user, promote to admin in the DB, return its session cookie. */
async function adminCookie(): Promise<string> {
  const u = await createTestUser();
  await db.update(user).set({ role: "admin" }).where(eq(user.id, u.userId));
  // require-admin reads the role fresh from the DB on each request, so the
  // existing session cookie is sufficient.
  return u.authHeaders.cookie as string;
}

const validTrainer = {
  name: "Jamie Trainer",
  businessName: "Calm Canines",
  city: "Austin",
  state: "TX",
  methodologyTags: ["positive-reinforcement"],
  certifications: ["CPDT-KA"],
  specialties: ["leash-reactivity"],
  website: "https://calmcanines.example",
  email: "jamie@calmcanines.example",
  phone: "555-0100",
  notesInternal: "Referred by vet network",
};

describe("admin trainers: auth", () => {
  it("POST returns 401 when anonymous", async () => {
    const res = await app.request("/api/admin/trainers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validTrainer),
    });
    expect(res.status).toBe(401);
  });

  it("POST returns 403 for a non-admin user", async () => {
    const u = await createTestUser();
    try {
      const res = await app.request("/api/admin/trainers", {
        method: "POST",
        headers: u.authHeaders,
        body: JSON.stringify(validTrainer),
      });
      expect(res.status).toBe(403);
    } finally {
      await u.cleanup();
    }
  });
});

describe("admin trainers: CRUD", () => {
  let cookie: string;
  const cleanups: TestUser[] = [];
  afterEach(async () => {
    for (let u = cleanups.pop(); u; u = cleanups.pop()) await u.cleanup();
  });

  async function getCookie(): Promise<string> {
    if (!cookie) cookie = await adminCookie();
    return cookie;
  }

  it("creates a trainer (201) and the public directory lists it", async () => {
    const c = await getCookie();
    const res = await app.request("/api/admin/trainers", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: c },
      body: JSON.stringify(validTrainer),
    });
    expect(res.status).toBe(201);
    const { trainer } = (await res.json()) as { trainer: { id: string; name: string } };
    createdTrainerIds.push(trainer.id);
    expect(trainer.name).toBe("Jamie Trainer");

    // Public GET (requires any authed user) should now include the trainer.
    const viewer = await createTestUser();
    cleanups.push(viewer);
    const list = await app.request("/api/trainers", { headers: viewer.authHeaders });
    expect(list.status).toBe(200);
    const { trainers: rows } = (await list.json()) as { trainers: { id: string }[] };
    expect(rows.some((t) => t.id === trainer.id)).toBe(true);
  });

  it("updates a trainer (200)", async () => {
    const c = await getCookie();
    const created = await app.request("/api/admin/trainers", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: c },
      body: JSON.stringify(validTrainer),
    });
    const { trainer } = (await created.json()) as { trainer: { id: string } };
    createdTrainerIds.push(trainer.id);

    const res = await app.request(`/api/admin/trainers/${trainer.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: c },
      body: JSON.stringify({ ...validTrainer, name: "Jamie Updated" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { trainer: { name: string } }).trainer.name).toBe(
      "Jamie Updated",
    );
  });

  it("deletes a trainer (200) and removes it from the directory", async () => {
    const c = await getCookie();
    const created = await app.request("/api/admin/trainers", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: c },
      body: JSON.stringify(validTrainer),
    });
    const { trainer } = (await created.json()) as { trainer: { id: string } };

    const del = await app.request(`/api/admin/trainers/${trainer.id}`, {
      method: "DELETE",
      headers: { cookie: c },
    });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ ok: true });

    const viewer = await createTestUser();
    cleanups.push(viewer);
    const after = await app.request(`/api/trainers/${trainer.id}`, { headers: viewer.authHeaders });
    expect(after.status).toBe(404);
  });

  it("rejects an invalid body with 400", async () => {
    const c = await getCookie();
    const res = await app.request("/api/admin/trainers", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: c },
      body: JSON.stringify({ name: "", city: "", state: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("PUT unknown id → 404", async () => {
    const c = await getCookie();
    const res = await app.request("/api/admin/trainers/00000000-0000-0000-0000-000000000000", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: c },
      body: JSON.stringify(validTrainer),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE unknown id → 404", async () => {
    const c = await getCookie();
    const res = await app.request("/api/admin/trainers/00000000-0000-0000-0000-000000000000", {
      method: "DELETE",
      headers: { cookie: c },
    });
    expect(res.status).toBe(404);
  });
});
