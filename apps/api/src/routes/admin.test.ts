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
    expect(body).toHaveProperty("eventVolume");
    expect(body).toHaveProperty("topPages");
    expect(body).toHaveProperty("eventsByDay");
    expect(Array.isArray((body as { eventsByDay: unknown[] }).eventsByDay)).toBe(true);
    expect(Array.isArray((body as { topPages: unknown[] }).topPages)).toBe(true);
    expect(body).toHaveProperty("funnel");
    expect(typeof (body as { kpis: { totalUsers: number } }).kpis.totalUsers).toBe("number");
    expect((body as { kpis: { totalUsers: number } }).kpis.totalUsers).toBeGreaterThanOrEqual(1);
    expect((body as { funnel: unknown[] }).funnel).toHaveLength(4);
  });

  it("never exposes stored public Brief segments and preserves their aggregate count", async () => {
    const privacyAdminEmail = `adm_privacy_${Date.now()}@example.com`;
    let privacyAdminId: string | undefined;
    const storedPaths = [
      ...Array.from({ length: 8 }, () => "/b/fixture-share-segment"),
      ...Array.from({ length: 8 }, () => "/B/fixture%2Fencoded-segment///"),
      ...Array.from({ length: 9 }, () => "/b/fixture-share-segment?source=fixture"),
    ];
    const inserted = await db
      .insert(events)
      .values(
        storedPaths.map((path) => ({
          name: "page.viewed",
          props: { path },
        })),
      )
      .returning({ id: events.id });

    try {
      const adminAccount = await auth.api.signUpEmail({
        body: { name: "Privacy admin fixture", email: privacyAdminEmail, password: "password-123" },
      });
      privacyAdminId = adminAccount.user.id;
      await db.update(user).set({ role: "admin" }).where(eq(user.id, adminAccount.user.id));
      const signIn = await auth.api.signInEmail({
        body: { email: privacyAdminEmail, password: "password-123" },
        asResponse: true,
      });
      const cookie = signIn.headers.get("set-cookie") ?? "";
      const res = await app.request("/api/admin/metrics?days=1", { headers: { cookie } });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { topPages: { path: string; count: number }[] };
      const publicBrief = body.topPages.find(({ path }) => path === "/b/:token");
      expect(publicBrief?.count).toBeGreaterThanOrEqual(storedPaths.length);
      expect(body.topPages).not.toContainEqual(
        expect.objectContaining({ path: "/b/fixture-share-segment" }),
      );
      expect(body.topPages).not.toContainEqual(
        expect.objectContaining({ path: "/B/fixture%2Fencoded-segment///" }),
      );
      expect(body.topPages).not.toContainEqual(
        expect.objectContaining({ path: "/b/fixture-share-segment?source=fixture" }),
      );
    } finally {
      await db.delete(events).where(
        inArray(
          events.id,
          inserted.map(({ id }) => id),
        ),
      );
      if (privacyAdminId) await db.delete(events).where(eq(events.userId, privacyAdminId));
      await db.delete(user).where(eq(user.email, privacyAdminEmail));
    }
  });
});
