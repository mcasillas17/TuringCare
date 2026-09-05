import { randomUUID } from "node:crypto";
import { format } from "node:util";
import { createEmailVerificationToken } from "better-auth/api";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "./app";
import { auth } from "./auth";
import { verificationLimitKey } from "./auth/verification-rate-limit";
import { db } from "./db";
import { rateLimit, session, trainers, user } from "./db/schema";
import * as emailSender from "./email/send-email";
import { findLatestTestEmail } from "./email/test-outbox";
import { env } from "./env";
import {
  type TestUser,
  createLegacySessionUser,
  createTestUser,
  createUnverifiedTestUser,
  nextTestIp,
  verifyTestEmail,
} from "./test-helpers";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.restoreAllMocks();
});

async function signup(extra: Record<string, unknown> = {}) {
  const email = `verification-${randomUUID()}@example.com`;
  const headers = {
    "Content-Type": "application/json",
    Origin: env.FRONTEND_URL,
    "fly-client-ip": nextTestIp(),
  };
  cleanups.push(async () => {
    await db.delete(user).where(eq(user.email, email));
  });
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      name: "Verification fixture",
      password: "password-123",
      ...extra,
    }),
  });
  return { email, headers, res };
}

async function legacy(): Promise<TestUser> {
  const u = await createLegacySessionUser();
  cleanups.push(u.cleanup);
  await db.update(user).set({ role: "admin" }).where(eq(user.id, u.userId));
  return u;
}

function capturedLink(email: string) {
  const link = findLatestTestEmail(email)?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error("Missing captured test link");
  return link;
}

async function expireSendCooldown(email: string) {
  await db
    .update(rateLimit)
    .set({ lastRequest: Date.now() - 61_000 })
    .where(eq(rateLimit.id, verificationLimitKey("send", email)));
}

function resend(fixture: TestUser, input: Record<string, unknown> = {}) {
  return app.request("/api/verification/resend", {
    method: "POST",
    headers: fixture.authHeaders,
    body: JSON.stringify(input),
  });
}

function confirmStaged(staged: Response, headers: Record<string, string> = {}) {
  const receipt = staged.headers.get("set-cookie")?.split(";")[0];
  if (!receipt) throw new Error("Missing staged receipt");
  return app.request("/api/verification/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: env.FRONTEND_URL,
      "fly-client-ip": nextTestIp(),
      ...headers,
      cookie: [headers.cookie, receipt].filter(Boolean).join("; "),
    },
    body: "{}",
  });
}

describe("verified email ownership enforcement", () => {
  it("signup has no session; unverified sign-in is rejected without automatic resend", async () => {
    const { res, email, headers } = await signup();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ token: null });
    expect(res.headers.get("set-cookie")).not.toContain("session_token");
    const initial = findLatestTestEmail(email);
    expect(initial).toBeTruthy();
    const signIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password: "password-123" }),
    });
    expect(signIn.status).toBe(403);
    expect(await signIn.json()).toMatchObject({ code: "email_unverified" });
    expect(signIn.headers.get("set-cookie")).not.toContain("session_token");
    expect(findLatestTestEmail(email)).toBe(initial);
  });

  it("legacy sessions retain status but cannot reach any owner or admin group", async () => {
    const u = await legacy();
    for (const [method, path] of [
      ["GET", "/api/dogs"],
      ["POST", "/api/dogs"],
      ["GET", "/api/dogs/not-owned/brief"],
      ["GET", "/api/journal"],
      ["GET", "/api/training/skills"],
      ["GET", "/api/onboarding"],
      ["GET", "/api/guided-setup"],
      ["GET", "/api/overview"],
      ["GET", "/api/profile"],
      ["PATCH", "/api/profile/locale"],
      ["GET", "/api/admin/metrics"],
      ["GET", "/api/admin/trainers"],
      ["GET", "/api/admin/courses"],
    ]) {
      const res = await app.request(path as string, { method, headers: u.authHeaders });
      expect([method, path, res.status]).toEqual([method, path, 403]);
      expect(await res.json()).toEqual({ error: "email_unverified" });
    }
    const me = await app.request("/me", { headers: u.authHeaders });
    expect(await me.json()).toMatchObject({ user: { emailVerified: false, role: "user" } });
    expect(me.headers.get("cache-control")).toBe("no-store");
  });

  it("raw Better Auth mutations are not a legacy-session bypass", async () => {
    const u = await legacy();
    for (const path of ["update-user", "delete-user", "change-password", "revoke-sessions"]) {
      const res = await app.request(`/api/auth/${path}`, {
        method: "POST",
        headers: u.authHeaders,
        body: JSON.stringify({ name: "changed", emailVerified: true }),
      });
      expect([path, res.status]).toEqual([path, 403]);
      expect(await res.json()).toEqual({ error: "email_unverified" });
    }
  });

  it("native resend requires credentials when anonymous", async () => {
    const { email, headers } = await signup();
    const res = await app.request("/api/auth/send-verification-email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "verification_credentials_required" });
  });

  it("typed resend rejects wrong credentials without disclosing existence", async () => {
    const { email, headers } = await signup();
    for (const candidate of [email, `unknown-${randomUUID()}@example.com`]) {
      const res = await app.request("/api/verification/resend", {
        method: "POST",
        headers,
        body: JSON.stringify({ email: candidate, password: "wrong-password" }),
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "invalid_credentials" });
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("verification emails default to a canonical frontend callback", async () => {
    const { email } = await signup();
    const message = findLatestTestEmail(email);
    const link = message?.text.match(/https?:\/\/\S+/)?.[0];
    expect(link).toBeTruthy();
    const callback = new URL(new URL(link as string).searchParams.get("callbackURL") as string);
    expect(callback.origin).toBe(new URL(env.FRONTEND_URL).origin);
    expect(callback.pathname).toBe("/verify-email");
    expect(Object.fromEntries(callback.searchParams)).toEqual({
      next: "/my",
      lang: "en",
    });
  });

  it("actual links support another browser, replay safely, and require explicit sign-in", async () => {
    const fixture = await createUnverifiedTestUser();
    cleanups.push(fixture.cleanup);
    const link = capturedLink(fixture.email);
    for (let i = 0; i < 2; i++) {
      const verified = await app.request(link, { headers: { "fly-client-ip": nextTestIp() } });
      expect(verified.status).toBe(302);
      expect(verified.headers.get("set-cookie")).toContain("tc_verification_receipt=");
      expect(verified.headers.get("location")).not.toContain("error=");
      const [before] = await db.select().from(user).where(eq(user.id, fixture.userId));
      if (i === 0) expect(before?.emailVerified).toBe(false);
      expect(await (await confirmStaged(verified)).json()).toMatchObject({ status: "verified" });
    }
    expect((await app.request("/api/dogs")).status).toBe(401);
    const signIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: fixture.authHeaders,
      body: JSON.stringify({ email: fixture.email, password: fixture.password }),
    });
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.get("set-cookie")?.split(";")[0] ?? "";
    const headers = { ...fixture.authHeaders, cookie };
    expect((await app.request("/api/dogs", { headers })).status).toBe(200);
    const me = await app.request("/me", { headers });
    const body = await me.json();
    expect(body).toMatchObject({ user: { emailVerified: true, role: "user" } });
    expect(body).not.toHaveProperty("session");
    expect(body).not.toHaveProperty("token");
  });

  it("verification in a different account's browser never switches that account", async () => {
    const owner = await createTestUser();
    const pending = await createUnverifiedTestUser();
    cleanups.push(owner.cleanup, pending.cleanup);
    const res = await app.request(capturedLink(pending.email), { headers: owner.authHeaders });
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie")).toContain("tc_verification_receipt=");
    const confirmation = await confirmStaged(res, owner.authHeaders);
    expect(await confirmation.json()).toMatchObject({ status: "verified" });
    expect(confirmation.headers.get("set-cookie")).not.toContain("session_token");
    const me = await app.request("/me", { headers: owner.authHeaders });
    expect(await me.json()).toMatchObject({ user: { id: owner.userId } });
  });

  it("a legacy session gains access only after its actual link is consumed", async () => {
    const fixture = await legacy();
    const first = await app.request("/api/dogs", { headers: fixture.authHeaders });
    expect(first.status).toBe(403);
    await verifyTestEmail(fixture.email);
    const after = await app.request("/api/dogs", { headers: fixture.authHeaders });
    expect(after.status).toBe(200);
    await db.update(user).set({ emailVerified: false }).where(eq(user.id, fixture.userId));
    expect((await app.request("/api/dogs", { headers: fixture.authHeaders })).status).toBe(403);
  });

  it("allowlisted unverified and persisted admins never promote or authorize through /me", async () => {
    const fixture = await legacy();
    const previous = env.ADMIN_EMAILS;
    env.ADMIN_EMAILS = [fixture.email];
    try {
      for (const role of ["user", "admin"] as const) {
        await db.update(user).set({ role }).where(eq(user.id, fixture.userId));
        const me = await app.request("/me", { headers: fixture.authHeaders });
        expect(await me.json()).toMatchObject({ user: { role: "user", emailVerified: false } });
        const [stored] = await db.select().from(user).where(eq(user.id, fixture.userId));
        expect(stored?.role).toBe(role);
        const admin = await app.request("/api/admin/metrics", { headers: fixture.authHeaders });
        expect(admin.status).toBe(403);
      }
      await db.update(user).set({ role: "user" }).where(eq(user.id, fixture.userId));
      await verifyTestEmail(fixture.email);
      expect(
        (await app.request("/api/admin/metrics", { headers: fixture.authHeaders })).status,
      ).toBe(200);
    } finally {
      env.ADMIN_EMAILS = previous;
    }
  });

  it("optional authentication does not reveal trainer contacts to legacy sessions", async () => {
    const fixture = await legacy();
    const id = randomUUID();
    await db.insert(trainers).values({
      id,
      name: "Synthetic trainer",
      city: "Test city",
      state: "CA",
      email: "synthetic-trainer@example.com",
      phone: "555-0100",
    });
    cleanups.push(async () => {
      await db.delete(trainers).where(eq(trainers.id, id));
    });
    for (const headers of [undefined, fixture.authHeaders]) {
      expect((await app.request("/api/trainers", { headers })).status).toBe(200);
      expect((await app.request("/api/courses", { headers })).status).toBe(200);
      const detail = await app.request(`/api/trainers/${id}`, { headers });
      expect(await detail.json()).toMatchObject({ trainer: { email: null, phone: null } });
      expect((await app.request("/api/share/not-a-real-token", { headers })).status).toBe(404);
    }
    await verifyTestEmail(fixture.email);
    const verified = await app.request(`/api/trainers/${id}`, { headers: fixture.authHeaders });
    expect(await verified.json()).toMatchObject({
      trainer: { email: "synthetic-trainer@example.com", phone: "555-0100" },
    });
  });

  it("rejects client-supplied verification at signup and account update", async () => {
    const { res, email } = await signup({ emailVerified: true });
    expect(res.status).toBe(400);
    expect(findLatestTestEmail(email)).toBeNull();
    const fixture = await createTestUser();
    cleanups.push(fixture.cleanup);
    const updated = await app.request("/api/auth/update-user", {
      method: "POST",
      headers: fixture.authHeaders,
      body: JSON.stringify({ emailVerified: false }),
    });
    expect(updated.status).toBe(400);
    const [stored] = await db.select().from(user).where(eq(user.id, fixture.userId));
    expect(stored?.emailVerified).toBe(true);
  });

  it("credential proof resends without a session and reports provider acceptance, not delivery", async () => {
    const fixture = await createUnverifiedTestUser();
    cleanups.push(fixture.cleanup);
    await expireSendCooldown(fixture.email);
    const response = await resend(fixture, {
      email: fixture.email.toUpperCase(),
      password: fixture.password,
      returnTo: "/my/dogs",
    });
    expect(response.status).toBe(200);
    const accepted = (await response.json()) as { status: string; retryAfter: number };
    expect(accepted.status).toBe("accepted");
    expect(accepted.retryAfter).toBeGreaterThanOrEqual(1);
    expect(accepted.retryAfter).toBeLessThanOrEqual(60);
    expect(response.headers.get("retry-after")).toBe(String(accepted.retryAfter));
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await db.select().from(session).where(eq(session.userId, fixture.userId))).toHaveLength(
      0,
    );
    const callback = new URL(
      new URL(capturedLink(fixture.email)).searchParams.get("callbackURL") ?? "",
    );
    expect(callback.searchParams.get("next")).toBe("/my/dogs");
  });

  it("verified status requires credential proof and does not mint a session", async () => {
    const fixture = await createUnverifiedTestUser();
    cleanups.push(fixture.cleanup);
    await verifyTestEmail(fixture.email);
    const res = await resend(fixture, { email: fixture.email, password: fixture.password });
    expect(await res.json()).toEqual({ status: "already_verified" });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect((await resend(fixture, { email: fixture.email })).status).toBe(401);
  });

  it("performs bounded password work for both missing and wrong credentials", async () => {
    const fixture = await createUnverifiedTestUser();
    cleanups.push(fixture.cleanup);
    const context = await auth.$context;
    const hash = vi.spyOn(context.password, "hash");
    const verify = vi.spyOn(context.password, "verify");
    expect(
      (await resend(fixture, { email: `missing-${randomUUID()}@example.com`, password: "wrong" }))
        .status,
    ).toBe(401);
    expect(hash).toHaveBeenCalledOnce();
    expect((await resend(fixture, { email: fixture.email, password: "wrong" })).status).toBe(401);
    expect(verify).toHaveBeenCalledOnce();
    expect(
      (await resend(fixture, { email: fixture.email, password: "x".repeat(129) })).status,
    ).toBe(400);
    expect(verify).toHaveBeenCalledOnce();
  });

  it("legacy resend can send only to its own account and requires trusted origin", async () => {
    const fixture = await legacy();
    await expireSendCooldown(fixture.email);
    const otherEmail = `unrelated-${randomUUID()}@example.com`;
    const mismatch = await resend(fixture, { email: otherEmail });
    expect(mismatch.status).toBe(401);
    expect(findLatestTestEmail(otherEmail)).toBeNull();
    const crossSite = await app.request("/api/verification/resend", {
      method: "POST",
      headers: { ...fixture.authHeaders, Origin: "https://evil.example" },
      body: "{}",
    });
    expect(crossSite.status).toBe(403);
    expect((await resend(fixture)).status).toBe(200);
  });

  it("throttles signup and both resend routes atomically without persisting emails in keys", async () => {
    const fixture = await legacy();
    const immediately = await resend(fixture);
    expect(immediately.status).toBe(429);
    await expireSendCooldown(fixture.email);
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        i % 2
          ? app.request("/api/auth/send-verification-email", {
              method: "POST",
              headers: fixture.authHeaders,
              body: JSON.stringify({ email: fixture.email }),
            })
          : resend(fixture),
      ),
    );
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(7);
    for (const r of responses.filter((r) => r.status === 429)) {
      const body = (await r.json()) as { error: string; retryAfter: number };
      expect(body.error).toBe("rate_limited");
      expect(body.retryAfter).toBeGreaterThanOrEqual(1);
      expect(body.retryAfter).toBeLessThanOrEqual(60);
      expect(r.headers.get("retry-after")).toBe(String(body.retryAfter));
    }
    const [row] = await db
      .select()
      .from(rateLimit)
      .where(eq(rateLimit.id, verificationLimitKey("send", fixture.email)));
    expect(row?.key).not.toContain(fixture.email);
    expect(row?.key).toMatch(/^verification:send:[a-f0-9]{64}$/);
  });

  it("durable trusted-IP throttling spans routes and ignores forged X-Forwarded-For", async () => {
    const headers = {
      "Content-Type": "application/json",
      Origin: env.FRONTEND_URL,
      "fly-client-ip": nextTestIp(),
    };
    const results = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        app.request(i % 2 ? "/api/auth/send-verification-email" : "/api/verification/resend", {
          method: "POST",
          headers: { ...headers, "x-forwarded-for": nextTestIp() },
          body: JSON.stringify({ email: `unknown-${i}@example.com` }),
        }),
      ),
    );
    expect(results.filter((r) => r.status === 401)).toHaveLength(20);
    expect(results.filter((r) => r.status === 429)).toHaveLength(4);
  });

  it("provider failures return actionable sanitized errors without leaking diagnostics", async () => {
    const fixture = await createUnverifiedTestUser();
    cleanups.push(fixture.cleanup);
    await expireSendCooldown(fixture.email);
    const diagnostic = `private-provider-payload ${fixture.email} token-secret`;
    vi.spyOn(emailSender, "sendEmail").mockRejectedValue(new Error(diagnostic));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await resend(fixture, { email: fixture.email, password: fixture.password });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; retryAfter: number };
    expect(body.error).toBe("verification_send_failed");
    expect(body.retryAfter).toBeGreaterThanOrEqual(1);
    expect(body.retryAfter).toBeLessThanOrEqual(60);
    expect(res.headers.get("retry-after")).toBe(String(body.retryAfter));
    expect(
      (await resend(fixture, { email: fixture.email, password: fixture.password })).status,
    ).toBe(429);
    expect(log.mock.calls).toEqual([["[auth] verification_send_failed"]]);
    expect(JSON.stringify(log.mock.calls)).not.toContain(diagnostic);
  });

  it.each(["invalid", "expired"])(
    "handles %s verification tokens with a safe recovery callback",
    async (kind) => {
      const fixture = await createUnverifiedTestUser();
      cleanups.push(fixture.cleanup);
      const link = new URL(capturedLink(fixture.email));
      link.searchParams.set(
        "token",
        kind === "invalid"
          ? "not-a-token"
          : await createEmailVerificationToken(
              env.BETTER_AUTH_SECRET,
              fixture.email,
              undefined,
              -1,
            ),
      );
      const result = await app.request(link.toString(), { headers: fixture.authHeaders });
      expect(result.status).toBe(302);
      const location = new URL(result.headers.get("location") ?? "");
      expect(location.pathname).toBe("/verify-email");
      expect(location.searchParams.has("error")).toBe(false);
      expect(location.searchParams.has("token")).toBe(false);
      expect(location.searchParams.has("email")).toBe(false);
      const confirmation = await confirmStaged(result, fixture.authHeaders);
      expect(await confirmation.json()).toMatchObject({ status: kind });
      const [stored] = await db.select().from(user).where(eq(user.id, fixture.userId));
      expect(stored?.emailVerified).toBe(false);
    },
  );

  it.each([
    ["https://evil.example/verify-email?next=/admin", "/my"],
    [`${env.FRONTEND_URL}/verify-email?next=%2Fmy%2Fdogs&lang=es`, "/my/dogs"],
    [`${env.FRONTEND_URL}/verify-email?next=%2Fb%2Fprivate-token`, "/my"],
    [`${env.FRONTEND_URL}/my/%2e%2e/admin`, "/my"],
  ])("sanitizes supplied verification callbacks %s", async (callbackURL, next) => {
    const { email, res, headers } = await signup({ callbackURL });
    expect(res.status).toBe(200);
    const link = new URL(capturedLink(email));
    const callback = new URL(link.searchParams.get("callbackURL") ?? "");
    expect(callback.origin).toBe(new URL(env.FRONTEND_URL).origin);
    expect(callback.pathname).toBe("/verify-email");
    expect(callback.searchParams.get("next")).toBe(next);
    // Links can be tampered with after delivery too; never redirect externally.
    link.searchParams.set("callbackURL", "https://evil.example/?token=private");
    const click = await app.request(link.toString(), { headers });
    const location = new URL(click.headers.get("location") ?? "");
    expect(location.origin).toBe(new URL(env.FRONTEND_URL).origin);
    expect(location.pathname).toBe("/verify-email");
    expect(location.searchParams.get("next")).toBe("/my");
  });

  it("password reset remains usable but does not verify email or issue a privileged session", async () => {
    const fixture = await createUnverifiedTestUser();
    cleanups.push(fixture.cleanup);
    const request = await app.request("/api/auth/request-password-reset", {
      method: "POST",
      headers: fixture.authHeaders,
      body: JSON.stringify({
        email: fixture.email,
        redirectTo: `${env.FRONTEND_URL}/reset-password`,
      }),
    });
    expect(request.status).toBe(200);
    const resetUrl = new URL(capturedLink(fixture.email));
    const token = resetUrl.pathname.split("/").at(-1);
    const reset = await app.request("/api/auth/reset-password", {
      method: "POST",
      headers: fixture.authHeaders,
      body: JSON.stringify({ token, newPassword: "new-test-password-123" }),
    });
    expect(reset.status).toBe(200);
    const [stored] = await db.select().from(user).where(eq(user.id, fixture.userId));
    expect(stored?.emailVerified).toBe(false);
    const signIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: fixture.authHeaders,
      body: JSON.stringify({ email: fixture.email, password: "new-test-password-123" }),
    });
    expect(signIn.status).toBe(403);
    expect(await signIn.json()).toMatchObject({ code: "email_unverified" });
  });

  it("legacy sign-out remains available", async () => {
    const fixture = await legacy();
    const res = await app.request("/api/auth/sign-out", {
      method: "POST",
      headers: fixture.authHeaders,
    });
    expect(res.status).toBe(200);
    expect((await app.request("/me", { headers: fixture.authHeaders })).status).toBe(401);
  });

  it("registration retries do not send another automatic verification message", async () => {
    const fixture = await createUnverifiedTestUser();
    cleanups.push(fixture.cleanup);
    const original = findLatestTestEmail(fixture.email);
    await expireSendCooldown(fixture.email);
    const retry = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: fixture.authHeaders,
      body: JSON.stringify({ email: fixture.email, password: "different-password", name: "Retry" }),
    });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ token: null });
    expect(findLatestTestEmail(fixture.email)).toBe(original);
  });

  it("credential throttling does not combine independent client IPs into an account lockout", async () => {
    const fixture = await createUnverifiedTestUser();
    cleanups.push(fixture.cleanup);
    const results = await Promise.all(
      Array.from({ length: 7 }, () =>
        app.request("/api/verification/resend", {
          method: "POST",
          headers: { ...fixture.authHeaders, "fly-client-ip": nextTestIp() },
          body: JSON.stringify({ email: fixture.email, password: "wrong" }),
        }),
      ),
    );
    expect(results.filter((r) => r.status === 401)).toHaveLength(7);
    expect(results.filter((r) => r.status === 429)).toHaveLength(0);
  });

  it("signup and reset provider failures keep privacy-neutral responses and fixed diagnostics", async () => {
    const fixture = await createUnverifiedTestUser();
    cleanups.push(fixture.cleanup);
    vi.spyOn(emailSender, "sendEmail").mockRejectedValue(
      new Error(`private-provider ${fixture.email} private-token`),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const registration = await signup();
    expect(registration.res.status).toBe(200);
    expect(await registration.res.json()).toMatchObject({ token: null });
    const reset = await app.request("/api/auth/request-password-reset", {
      method: "POST",
      headers: fixture.authHeaders,
      body: JSON.stringify({
        email: fixture.email,
        redirectTo: `${env.FRONTEND_URL}/reset-password`,
      }),
    });
    expect(reset.status).toBe(200);
    expect(log.mock.calls).toEqual([
      ["[auth] verification_send_failed"],
      ["[auth] password_reset_send_failed"],
    ]);
  });

  it("local no-provider mode does not claim resend acceptance outside capture mode", async () => {
    const fixture = await legacy();
    await expireSendCooldown(fixture.email);
    const previous = env.E2E_TEST_MODE;
    const key = env.RESEND_API_KEY;
    env.E2E_TEST_MODE = false;
    env.RESEND_API_KEY = undefined;
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await resend(fixture);
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: string; retryAfter: number };
      expect(body.error).toBe("verification_send_failed");
      expect(body.retryAfter).toBeGreaterThanOrEqual(1);
      expect(body.retryAfter).toBeLessThanOrEqual(60);
      expect(res.headers.get("retry-after")).toBe(String(body.retryAfter));
    } finally {
      env.E2E_TEST_MODE = previous;
      env.RESEND_API_KEY = key;
    }
  });

  it("unexpected native auth failures never log raw credentials or database parameters", async () => {
    const fixture = await createTestUser();
    cleanups.push(fixture.cleanup);
    const context = await auth.$context;
    const sentinel = `private-auth-params ${fixture.email} session-token-secret`;
    vi.spyOn(context.internalAdapter, "createSession").mockRejectedValue(new Error(sentinel));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: fixture.authHeaders,
      body: JSON.stringify({ email: fixture.email, password: fixture.password }),
    });
    expect(result.status).toBe(500);
    expect(context.internalAdapter.createSession).toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => format(...args)).join("\n")).not.toContain(sentinel);
    expect(await result.text()).not.toContain(sentinel);
  });

  it("the actual password-reset endpoint retains its server-side rate limit", async () => {
    const fixture = await createUnverifiedTestUser();
    cleanups.push(fixture.cleanup);
    const results: Response[] = [];
    for (let i = 0; i < 4; i++) {
      results.push(
        await app.request("/api/auth/request-password-reset", {
          method: "POST",
          headers: fixture.authHeaders,
          body: JSON.stringify({
            email: fixture.email,
            redirectTo: `${env.FRONTEND_URL}/reset-password`,
          }),
        }),
      );
    }
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 429]);
    expect(await results[3]?.json()).toMatchObject({ error: "rate_limited" });
  });

  it("missing verification tokens redirect to the recoverable invalid-link state", async () => {
    const res = await app.request("/api/auth/verify-email", {
      headers: { "fly-client-ip": nextTestIp(), "X-TuringCare-Locale": "es" },
    });
    expect(res.status).toBe(302);
    const target = new URL(res.headers.get("location") ?? "");
    expect(target.pathname).toBe("/verify-email");
    expect(target.searchParams.has("error")).toBe(false);
    expect(target.searchParams.get("lang")).toBe("es");
    const status = await app.request("/api/verification/status", {
      headers: { cookie: res.headers.get("set-cookie")?.split(";")[0] ?? "" },
    });
    expect(await status.json()).toMatchObject({ status: "invalid", locale: "es" });
  });

  it("email locale survives opening a verification link in a new browser", async () => {
    const fixture = await legacy();
    await expireSendCooldown(fixture.email);
    const result = await app.request("/api/verification/resend", {
      method: "POST",
      headers: { ...fixture.authHeaders, "X-TuringCare-Locale": "es" },
      body: JSON.stringify({ returnTo: "/my/dogs" }),
    });
    expect(result.status).toBe(200);
    expect(findLatestTestEmail(fixture.email)?.html).toContain('<html lang="es">');
    const click = await app.request(capturedLink(fixture.email), {
      headers: { "fly-client-ip": nextTestIp(), "Accept-Language": "en" },
    });
    const destination = new URL(click.headers.get("location") ?? "");
    expect(destination.searchParams.get("lang")).toBe("es");
    expect(destination.searchParams.get("next")).toBe("/my/dogs");
  });
});
