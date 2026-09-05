import { createHmac, randomUUID } from "node:crypto";
import { getCookies } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { app } from "./app";
import { auth } from "./auth";
import { db } from "./db";
import { user } from "./db/schema";
import { findLatestTestEmail } from "./email/test-outbox";
import { env } from "./env";

export type TestUser = {
  userId: string;
  email: string;
  password: string;
  /** Headers to spread into app.request() for authed calls (cookie + unique IP). */
  authHeaders: Record<string, string>;
  cleanup: () => Promise<void>;
};

export function nextTestIp() {
  const hex = randomUUID().replaceAll("-", "");
  return `10.${Number.parseInt(hex.slice(0, 2), 16)}.${Number.parseInt(hex.slice(2, 4), 16)}.${Number.parseInt(hex.slice(4, 6), 16)}`;
}

/**
 * Sign up a throwaway account without proving email ownership.
 * Each user gets a fresh valid IP for Better Auth's proxy-aware limiter and
 * the app's trusted Fly-IP limiter, preventing cross-test rate-limit state.
 * cleanup() deletes the user (cascade removes dogs/concerns/goals/session/account).
 */
export async function createUnverifiedTestUser(
  options: { email?: string; password?: string } = {},
): Promise<TestUser> {
  const id = randomUUID();
  const ip = nextTestIp();
  const email = options.email ?? `test-${id}@example.com`;
  const password = options.password ?? "test-password-123";
  const baseHeaders = {
    "Content-Type": "application/json",
    "fly-client-ip": ip,
    "x-forwarded-for": ip,
    Origin: env.FRONTEND_URL,
  };

  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({ name: "Test User", email, password }),
  });
  if (!res.ok) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);

  const { user: u } = (await res.json()) as { user: { id: string } };

  return {
    userId: u.id,
    email,
    password,
    authHeaders: baseHeaders,
    cleanup: async () => {
      await db.delete(user).where(eq(user.id, u.id));
    },
  };
}

/** Follow the actual captured link rather than updating verification flags. */
export async function verifyTestEmail(email: string): Promise<void> {
  const message = findLatestTestEmail(email);
  const link = message?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error("No captured verification link for test fixture");
  const response = await app.request(link, { headers: { "fly-client-ip": nextTestIp() } });
  if (response.status !== 302 || response.headers.get("location")?.includes("error=")) {
    throw new Error(`Test fixture verification failed: ${response.status}`);
  }
}

/** Ordinary domain fixtures prove email ownership and then explicitly sign in. */
export async function createTestUser(
  options: { email?: string; password?: string } = {},
): Promise<TestUser> {
  const account = await createUnverifiedTestUser(options);
  try {
    await verifyTestEmail(account.email);
    const response = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: account.authHeaders,
      body: JSON.stringify({ email: account.email, password: account.password }),
    });
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!response.ok || !cookie) throw new Error(`Test fixture sign-in failed: ${response.status}`);
    return { ...account, authHeaders: { ...account.authHeaders, cookie } };
  } catch (error) {
    await account.cleanup();
    throw error;
  }
}

/**
 * Explicit rollout fixture: create an unverified account and a pre-cutover
 * server-side session. The application configuration remains fully enforced.
 */
export async function createLegacySessionUser(): Promise<TestUser> {
  const account = await createUnverifiedTestUser();
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(account.userId);
  if (!session) throw new Error("Legacy fixture session creation failed");
  const signature = createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(session.token)
    .digest("base64");
  const cookie = `${getCookies(auth.options).sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`;
  return { ...account, authHeaders: { ...account.authHeaders, cookie } };
}
