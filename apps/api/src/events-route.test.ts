import { desc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { app } from "./app";
import { auth } from "./auth";
import { db } from "./db";
import { events, user } from "./db/schema";

describe("POST /api/events", () => {
  it("rejects an event name not on the client allowlist", async () => {
    const res = await app.request("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "user.signed_in", props: {} }),
    });
    expect(res.status).toBe(400);
  });

  it("persists an anonymous page.viewed (userId null)", async () => {
    const path = `/test-${Date.now()}`;
    const res = await app.request("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "page.viewed", props: { path } }),
    });
    expect(res.status).toBe(202);

    const [row] = await db
      .select()
      .from(events)
      .where(eq(events.name, "page.viewed"))
      .orderBy(desc(events.createdAt))
      .limit(1);
    expect(row?.props).toMatchObject({ path });
    expect(row?.userId).toBeNull();
  });

  it("attributes an authenticated page.viewed to the user + session", async () => {
    const email = `evtr_${Date.now()}@example.com`;
    await auth.api.signUpEmail({ body: { name: "EvtR", email, password: "password-123" } });
    const signIn = await auth.api.signInEmail({
      body: { email, password: "password-123" },
      asResponse: true,
    });
    const cookie = signIn.headers.get("set-cookie") ?? "";
    const path = `/auth-${Date.now()}`;
    const res = await app.request("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ name: "page.viewed", props: { path } }),
    });
    expect(res.status).toBe(202);

    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (!u) throw new Error("expected user row");
    const [row] = await db
      .select()
      .from(events)
      .where(eq(events.name, "page.viewed"))
      .orderBy(desc(events.createdAt))
      .limit(1);
    expect(row?.userId).toBe(u.id);
    expect(row?.sessionId).toBeTruthy();

    // cleanup: events first (FK is set null, rows would linger), then user
    await db.delete(events).where(eq(events.userId, u.id));
    await db.delete(user).where(eq(user.id, u.id));
  });

  it("rejects oversized props at the endpoint (400)", async () => {
    const res = await app.request("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "page.viewed", props: { path: "x".repeat(2000) } }),
    });
    expect(res.status).toBe(400);
  });
});
