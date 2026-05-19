import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "./app";
import { auth } from "./auth";
import { resolveAdminRole } from "./auth/admin-bootstrap";
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

it("self-heals: resolveAdminRole promotes an allowlisted user in the real DB", async () => {
  const email = `me_heal_${Date.now()}@example.com`;
  await auth.api.signUpEmail({ body: { name: "Heal", email, password: "password-123" } });
  const [before] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.email, email));
  expect(before?.role).toBe("user");

  if (!before) throw new Error("expected user row after sign-up");

  const role = await resolveAdminRole(
    { id: before.id, email, role: before.role },
    { adminEmails: [email.toLowerCase()] },
  );
  expect(role).toBe("admin");

  const [after] = await db.select({ role: user.role }).from(user).where(eq(user.email, email));
  expect(after?.role).toBe("admin");

  await db.delete(user).where(eq(user.email, email));
});
