import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "./app";
import { db } from "./db";
import { events, user } from "./db/schema";

const email = `evt_${Date.now()}@example.com`;

function requestHeaders() {
  const id = randomUUID();
  const octet = (start: number) => (Number.parseInt(id.slice(start, start + 2), 16) % 254) + 1;
  return {
    "Content-Type": "application/json",
    "fly-client-ip": `198.${octet(0)}.${octet(2)}.${octet(4)}`,
  };
}

afterAll(async () => {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  for (const r of rows) {
    await db.delete(events).where(eq(events.userId, r.id));
    await db.delete(user).where(eq(user.id, r.id));
  }
});

describe("auth lifecycle telemetry", () => {
  it("emits user.signed_up and user.signed_in on registration", async () => {
    const headers = requestHeaders();
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Evt", email, password: "password-123" }),
    });
    expect(res.status).toBeLessThan(400);

    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    expect(u).toBeTruthy();
    if (!u) throw new Error("expected user row");

    const evts = await db.select().from(events).where(eq(events.userId, u.id));
    const names = evts.map((e) => e.name);
    expect(names).toContain("user.signed_up");
    expect(names).toContain("user.signed_in");

    const signedIn = evts.find((e) => e.name === "user.signed_in");
    expect(signedIn?.sessionId).toBeTruthy();
  });

  it("emits owner churn only after account deletion succeeds", async () => {
    const deleteEmail = `del_${Date.now()}@example.com`;
    const headers = requestHeaders();
    const signUp = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Delete", email: deleteEmail, password: "password-123" }),
    });
    expect(signUp.status).toBeLessThan(400);
    const cookie = signUp.headers.get("set-cookie") ?? "";
    const before = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.name, "user.deleted"));
    const deleted = await app.request("/api/auth/delete-user", {
      method: "POST",
      headers: { ...headers, cookie },
      body: JSON.stringify({}),
    });
    expect(deleted.status).toBe(200);
    expect(await db.select().from(user).where(eq(user.email, deleteEmail))).toHaveLength(0);
    const previousIds = new Set(before.map(({ id }) => id));
    const rows = (await db.select().from(events).where(eq(events.name, "user.deleted"))).filter(
      ({ id }) => !previousIds.has(id),
    );
    try {
      expect(rows).toHaveLength(1);
      expect(rows[0]?.props).toMatchObject({ role: "user" });
    } finally {
      await db.delete(events).where(
        inArray(
          events.id,
          rows.map(({ id }) => id),
        ),
      );
    }
  });
});
