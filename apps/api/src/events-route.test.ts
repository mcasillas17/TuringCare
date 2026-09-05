import { and, desc, eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { app } from "./app";
import { auth } from "./auth";
import { db } from "./db";
import { events, user } from "./db/schema";
import { createLegacySessionUser, createTestUser } from "./test-helpers";

describe("POST /api/events", () => {
  it("uses an authoritative legacy session for public telemetry without granting owner access", async () => {
    const fixture = await createLegacySessionUser();
    const getSession = vi.spyOn(auth.api, "getSession");
    try {
      const path = `/legacy-${fixture.userId}`;
      const res = await app.request("/api/events", {
        method: "POST",
        headers: fixture.authHeaders,
        body: JSON.stringify({ name: "page.viewed", props: { path } }),
      });
      expect(res.status).toBe(202);
      expect(getSession).toHaveBeenCalledWith({
        headers: expect.any(Headers),
        query: { disableCookieCache: true },
      });
      const [stored] = await db
        .select()
        .from(events)
        .where(and(eq(events.userId, fixture.userId), eq(events.name, "page.viewed")));
      expect(stored?.userId).toBe(fixture.userId);
      expect(stored?.sessionId).toBeTruthy();
      expect((await app.request("/api/dogs", { headers: fixture.authHeaders })).status).toBe(403);
    } finally {
      getSession.mockRestore();
      await db.delete(events).where(eq(events.userId, fixture.userId));
      await fixture.cleanup();
    }
  });
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

  it.each([
    ["page.viewed", "/%62/fixture-share-segment"],
    ["trainer.viewed", "/%42/fixture-share-segment"],
    ["course.viewed", "/%62/fixture%"],
  ] as const)(
    "normalizes an encoded public Brief prefix before persistence for %s at %s",
    async (name, path) => {
      const fixture = `round-14-${Date.now()}-${name}`;
      try {
        const res = await app.request("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            props: { path, fixture },
          }),
        });
        expect(res.status).toBe(202);

        const [row] = await db
          .select()
          .from(events)
          .where(and(eq(events.name, name), sql`${events.props}->>'fixture' = ${fixture}`))
          .limit(1);
        expect(row?.props).toEqual({ path: "/b/:token", fixture });
      } finally {
        await db.delete(events).where(sql`${events.props}->>'fixture' = ${fixture}`);
      }
    },
  );

  it("normalizes a literal public Brief segment before persistence", async () => {
    const fixture = `round-14-literal-${Date.now()}`;
    try {
      const res = await app.request("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "page.viewed",
          props: { path: "/B/fixture%2Fshare-segment///", fixture },
        }),
      });
      expect(res.status).toBe(202);

      const [row] = await db
        .select()
        .from(events)
        .where(and(eq(events.name, "page.viewed"), sql`${events.props}->>'fixture' = ${fixture}`))
        .limit(1);
      expect(row?.props).toEqual({ path: "/b/:token", fixture });
    } finally {
      await db.delete(events).where(sql`${events.props}->>'fixture' = ${fixture}`);
    }
  });

  it("attributes an authenticated page.viewed to the user + session", async () => {
    const email = `evtr_${Date.now()}@example.com`;
    const fixture = await createTestUser({ email });
    const path = `/auth-${Date.now()}`;
    const res = await app.request("/api/events", {
      method: "POST",
      headers: fixture.authHeaders,
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
