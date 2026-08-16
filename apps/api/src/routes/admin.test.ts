import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { auth } from "../auth";
import { db } from "../db";
import { events, user } from "../db/schema";

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

    const churnedUsers = (body as { kpis: { churnedUsers: number } }).kpis.churnedUsers;
    const insertedEvents = await db
      .insert(events)
      .values([
        { name: "user.deleted", props: {} },
        { name: "user.deleted", props: { role: "user" } },
        { name: "user.deleted", props: { role: "admin" } },
      ])
      .returning({ id: events.id });
    let updatedChurnedUsers: number;
    try {
      const updatedRes = await app.request("/api/admin/metrics?days=30", {
        headers: { cookie },
      });
      const updatedBody = await updatedRes.json();
      updatedChurnedUsers = (updatedBody as { kpis: { churnedUsers: number } }).kpis.churnedUsers;
    } finally {
      await db.delete(events).where(
        inArray(
          events.id,
          insertedEvents.map(({ id }) => id),
        ),
      );
    }
    expect(updatedChurnedUsers).toBe(churnedUsers + 2);

    const funnel = (body as { funnel: { users: number }[] }).funnel;
    for (let index = 1; index < funnel.length; index += 1) {
      expect(funnel[index]?.users ?? 0).toBeLessThanOrEqual(funnel[index - 1]?.users ?? 0);
    }
  });
});
