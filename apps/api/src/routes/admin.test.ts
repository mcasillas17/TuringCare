import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { auth } from "../auth";
import { db } from "../db";
import { user } from "../db/schema";

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
    expect(body).toHaveProperty("funnel");
    expect(typeof (body as { kpis: { totalUsers: number } }).kpis.totalUsers).toBe("number");
    expect((body as { kpis: { totalUsers: number } }).kpis.totalUsers).toBeGreaterThanOrEqual(1);
    expect((body as { funnel: unknown[] }).funnel).toHaveLength(4);

    const act = await app.request("/api/admin/activity", { headers: { cookie } });
    expect(act.status).toBe(200);
    // app.request().json() is typed `unknown` in this Hono version (it does not
    // infer like the hc<AppType> client); narrow before property access.
    const actBody = (await act.json()) as { items: unknown[] };
    expect(Array.isArray(actBody.items)).toBe(true);
  });
});
