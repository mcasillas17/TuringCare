import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, describe, expect, it } from "vitest";
import { auth } from "../auth";
import { db } from "../db";
import { user } from "../db/schema";
import { requireAdmin } from "./require-admin";

// ADMIN_EMAILS is loaded from .env at parse time; this test asserts behavior
// for an email NOT in the list (normal user) and anonymous. The positive
// admin path is covered end-to-end in the admin-routes test (Task 8) where
// the test seeds the user's role directly.

const probe = new Hono().use("*", requireAdmin).get("/x", (c) => c.json({ ok: true }));
const email = `radm_${Date.now()}@example.com`;

afterAll(async () => {
  await db.delete(user).where(eq(user.email, email));
});

describe("requireAdmin", () => {
  it("returns 401 when there is no session", async () => {
    const res = await probe.request("/x");
    expect(res.status).toBe(401);
  });

  it("returns 403 for an authenticated non-admin", async () => {
    await auth.api.signUpEmail({
      body: { name: "RA", email, password: "password-123" },
    });
    const signIn = await auth.api.signInEmail({
      body: { email, password: "password-123" },
      asResponse: true,
    });
    const cookie = signIn.headers.get("set-cookie") ?? "";
    const res = await probe.request("/x", { headers: { cookie } });
    expect(res.status).toBe(403);
    const [row] = await db.select({ role: user.role }).from(user).where(eq(user.email, email));
    expect(row?.role).toBe("user");
  });
});
