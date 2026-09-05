import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "./app";
import { db } from "./db";
import { events, user } from "./db/schema";
import { createUnverifiedTestUser, verifyTestEmail } from "./test-helpers";

const email = `evt_${Date.now()}@example.com`;

afterAll(async () => {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  for (const r of rows) {
    await db.delete(events).where(eq(events.userId, r.id));
    await db.delete(user).where(eq(user.id, r.id));
  }
});

describe("auth lifecycle telemetry", () => {
  it("emits signup without signin until ownership is verified and the user signs in", async () => {
    const fixture = await createUnverifiedTestUser({ email });

    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    expect(u).toBeTruthy();
    if (!u) throw new Error("expected user row");

    const evts = await db.select().from(events).where(eq(events.userId, u.id));
    const names = evts.map((e) => e.name);
    expect(names).toContain("user.signed_up");
    expect(names).not.toContain("user.signed_in");
    await verifyTestEmail(email);
    const afterVerification = await db.select().from(events).where(eq(events.userId, u.id));
    expect(afterVerification.map((e) => e.name)).not.toContain("user.signed_in");
    const signIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: fixture.authHeaders,
      body: JSON.stringify({ email, password: fixture.password }),
    });
    expect(signIn.status).toBe(200);

    const afterSignIn = await db.select().from(events).where(eq(events.userId, u.id));
    const signedIn = afterSignIn.find((e) => e.name === "user.signed_in");
    expect(signedIn?.sessionId).toBeTruthy();
  });
});
