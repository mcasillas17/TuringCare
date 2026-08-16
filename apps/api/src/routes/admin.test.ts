import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { auth } from "../auth";
import { db } from "../db";
import { events, user } from "../db/schema";
import { createTestUser } from "../test-helpers";

const email = `adm_${Date.now()}@example.com`;

afterAll(async () => {
  await db.delete(user).where(eq(user.email, email));
});

describe("/api/admin", () => {
  it("returns 401 when anonymous", async () => {
    const res = await app.request("/api/admin/metrics");
    expect(res.status).toBe(401);
  });

  it("returns 200 with metrics for an admin (role seeded)", async () => {
    await auth.api.signUpEmail({ body: { name: "Adm", email, password: "password-123" } });
    await db.update(user).set({ role: "admin" }).where(eq(user.email, email));
    const signIn = await auth.api.signInEmail({
      body: { email, password: "password-123" },
      asResponse: true,
    });
    const cookie = signIn.headers.get("set-cookie") ?? "";

    const res = await app.request("/api/admin/metrics?days=30", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("kpis");
    expect(body).toHaveProperty("signups");
    expect(body).toHaveProperty("active");
    expect(body).toHaveProperty("featureAdoption");
    expect(body).toHaveProperty("topPages");
    expect(body).toHaveProperty("activityByDay");
    expect(Array.isArray((body as { activityByDay: unknown[] }).activityByDay)).toBe(true);
    expect(Array.isArray((body as { topPages: unknown[] }).topPages)).toBe(true);
    expect(body).toHaveProperty("funnel");
    expect(body).toHaveProperty("journeyTimes");
    expect(typeof (body as { kpis: { totalUsers: number } }).kpis.totalUsers).toBe("number");
    expect((body as { funnel: unknown[] }).funnel).toHaveLength(7);
    expect(["number", "object"]).toContain(
      typeof (body as { kpis: { activationRate: number | null } }).kpis.activationRate,
    );

    const owner = await createTestUser();
    try {
      await db.insert(events).values([
        { userId: owner.userId, name: "dog.created" },
        { userId: owner.userId, name: "training.goal_added" },
      ]);
      const after = await app.request("/api/admin/metrics?days=30", { headers: { cookie } });
      const afterBody = (await after.json()) as {
        funnel: { step: string; users: number }[];
      };
      const beforeCounts = new Map(
        (body as { funnel: { step: string; users: number }[] }).funnel.map((row) => [
          row.step,
          row.users,
        ]),
      );
      const afterCounts = new Map(afterBody.funnel.map((row) => [row.step, row.users]));
      expect(afterCounts.get("signup")).toBe((beforeCounts.get("signup") ?? 0) + 1);
      expect(afterCounts.get("first_dog")).toBe((beforeCounts.get("first_dog") ?? 0) + 1);
      expect(afterCounts.get("first_journal")).toBe(beforeCounts.get("first_journal"));
      expect(afterCounts.get("first_goal")).toBe(beforeCounts.get("first_goal"));
    } finally {
      await owner.cleanup();
    }
  });
});
