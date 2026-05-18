import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "./app";
import { db } from "./db";
import { events, user } from "./db/schema";

const email = `evt_${Date.now()}@example.com`;

afterAll(async () => {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  for (const r of rows) {
    await db.delete(events).where(eq(events.userId, r.id));
    await db.delete(user).where(eq(user.id, r.id));
  }
});

describe("auth lifecycle telemetry", () => {
  it("emits user.signed_up and user.signed_in on registration", async () => {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
});
