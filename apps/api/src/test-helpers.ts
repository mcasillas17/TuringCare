import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { app } from "./app";
import { db } from "./db";
import { user } from "./db/schema";

export type TestUser = {
  userId: string;
  /** Headers to spread into app.request() for authed calls (cookie + unique IP). */
  authHeaders: Record<string, string>;
  cleanup: () => Promise<void>;
};

/**
 * Sign a throwaway user up via Better Auth and return its session cookie.
 * Each user gets a unique Fly client IP so the global rate-limiter never
 * cross-talks between tests. cleanup() deletes the user (cascade removes
 * dogs/concerns/goals/session/account).
 */
export async function createTestUser(): Promise<TestUser> {
  const id = randomUUID();
  const ipOctet = (start: number) => (Number.parseInt(id.slice(start, start + 2), 16) % 254) + 1;
  const ip = `198.${ipOctet(0)}.${ipOctet(2)}.${ipOctet(4)}`;
  const email = `test-${id}@example.com`;
  const baseHeaders = { "Content-Type": "application/json", "fly-client-ip": ip };

  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({ name: "Test User", email, password: "test-password-123" }),
  });
  if (!res.ok) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);

  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("no session cookie returned from sign-up");
  const cookie = setCookie.split(";")[0] ?? setCookie;

  const me = await app.request("/me", { headers: { ...baseHeaders, cookie } });
  if (!me.ok) throw new Error(`/me check failed: ${me.status}`);
  const { user: u } = (await me.json()) as { user: { id: string } };

  return {
    userId: u.id,
    authHeaders: { ...baseHeaders, cookie },
    cleanup: async () => {
      await db.delete(user).where(eq(user.id, u.id));
    },
  };
}
