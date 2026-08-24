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

function nextTestIp() {
  const hex = randomUUID().replaceAll("-", "");
  return `10.${Number.parseInt(hex.slice(0, 2), 16)}.${Number.parseInt(hex.slice(2, 4), 16)}.${Number.parseInt(hex.slice(4, 6), 16)}`;
}

/**
 * Sign a throwaway user up via Better Auth and return its session cookie.
 * Each user gets a fresh valid IP for Better Auth's proxy-aware limiter and
 * the app's trusted Fly-IP limiter, preventing cross-test rate-limit state.
 * cleanup() deletes the user (cascade removes dogs/concerns/goals/session/account).
 */
export async function createTestUser(): Promise<TestUser> {
  const id = randomUUID();
  const ip = nextTestIp();
  const email = `test-${id}@example.com`;
  const baseHeaders = {
    "Content-Type": "application/json",
    "fly-client-ip": ip,
    "x-forwarded-for": ip,
  };

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
