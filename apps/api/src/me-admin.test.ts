import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "./app";
import { auth } from "./auth";
import { db } from "./db";
import { user } from "./db/schema";

const adminEmail = `me_adm_${Date.now()}@example.com`;
const plainEmail = `me_usr_${Date.now()}@example.com`;

afterAll(async () => {
  await db.delete(user).where(eq(user.email, adminEmail));
  await db.delete(user).where(eq(user.email, plainEmail));
});

async function signInCookie(email: string) {
  await auth.api.signUpEmail({ body: { name: "Me", email, password: "password-123" } });
  const res = await auth.api.signInEmail({
    body: { email, password: "password-123" },
    asResponse: true,
  });
  return res.headers.get("set-cookie") ?? "";
}

describe("GET /me surfaces effective role", () => {
  it("returns role 'admin' for a DB-seeded admin", async () => {
    const cookie = await signInCookie(adminEmail);
    await db.update(user).set({ role: "admin" }).where(eq(user.email, adminEmail));
    const res = await app.request("/me", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { role?: string } };
    expect(body.user.role).toBe("admin");
  });

  it("returns role 'user' for a normal account", async () => {
    const cookie = await signInCookie(plainEmail);
    const res = await app.request("/me", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { role?: string } };
    expect(body.user.role).toBe("user");
  });
});
