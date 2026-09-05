import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { auth } from "../auth";
import { db } from "../db";
import { rateLimit } from "../db/schema";
import { sendEmail } from "../email/send-email";
import { captureTestEmail, findLatestTestEmail } from "../email/test-outbox";
import { env, readEnv } from "../env";
import { createTestEmailApp } from "../routes/test-email";
import { type TestUser, createUnverifiedTestUser, nextTestIp } from "../test-helpers";
import { resendVerification } from "./resend-verification";
import { confirmVerification } from "./verification-proof";
import * as limits from "./verification-rate-limit";
import { verificationLimitKey } from "./verification-rate-limit";

const fixtures: TestUser[] = [];
const originalMode = env.NODE_ENV;
afterEach(async () => {
  env.NODE_ENV = originalMode;
  vi.restoreAllMocks();
  for (const fixture of fixtures.splice(0)) await fixture.cleanup();
});

describe("review regression boundaries", () => {
  it("JSON-encodes the email/IP pair and performs zero password work when it is saturated", async () => {
    const consume = vi
      .spyOn(limits, "consumeVerificationLimit")
      .mockImplementation(async (kind) => (kind === "credential" ? 60 : 0));
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);
    const context = await auth.$context;
    const hash = vi.spyOn(context.password, "hash");
    const verify = vi.spyOn(context.password, "verify");
    const lookup = vi.spyOn(context.internalAdapter, "findUserByEmail");
    const ip = "2001:db8::1";
    const result = await resendVerification(
      new Request("http://localhost/api/verification/resend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: env.FRONTEND_URL,
          "fly-client-ip": ip,
        },
      }),
      { email: "Owner@example.com", password: "synthetic-password" },
    );
    expect(result).toEqual({ status: 429, body: { error: "rate_limited", retryAfter: 60 } });
    expect(consume).toHaveBeenNthCalledWith(1, "ip", ip);
    expect(consume).toHaveBeenNthCalledWith(
      2,
      "credential",
      JSON.stringify(["owner@example.com", ip]),
    );
    expect(hash).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });
  it("requires JSON confirmation input before any password/token/database work", async () => {
    const consume = vi.spyOn(limits, "consumeVerificationLimit").mockResolvedValue(0);
    const result = await confirmVerification(
      new Request("http://localhost/api/verification/confirm", {
        method: "POST",
        headers: {
          Origin: env.FRONTEND_URL,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "",
      }),
    );
    expect(result).toEqual({ status: 400, body: { error: "invalid_input" } });
    expect(consume).not.toHaveBeenCalled();
  });
  it("rejects production test mode even with a configured provider", () => {
    expect(() =>
      readEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://localhost/test",
        BETTER_AUTH_SECRET: "synthetic-secret-at-least-thirty-two-characters",
        RESEND_API_KEY: "synthetic-provider-key",
        E2E_TEST_MODE: "true",
      }),
    ).toThrow(/E2E_TEST_MODE/);
  });

  it("independently blocks the outbox and automatic capture in production", async () => {
    const email = `production-gate-${randomUUID()}@example.com`;
    const outbox = createTestEmailApp({ enabled: true });
    captureTestEmail({ to: email, subject: "Synthetic", html: "<p>fixture</p>", text: "fixture" });
    env.NODE_ENV = "production";
    const res = await outbox.request(`/emails/latest?to=${email}`);
    expect(res.status).toBe(404);
    const send = vi.fn().mockResolvedValue({ data: {}, error: null });
    const capture = vi.fn();
    const fresh = `no-capture-${randomUUID()}@example.com`;
    await sendEmail(
      { to: fresh, subject: "Synthetic", html: "<p>fixture</p>", text: "fixture" },
      { client: { emails: { send } }, apiKey: "synthetic-key", capture },
    );
    expect(send).toHaveBeenCalledOnce();
    expect(capture).not.toHaveBeenCalled();
    expect(findLatestTestEmail(fresh)).toBeNull();
  });

  it("keeps denial responses intact when native sign-in returns non-JSON 403", async () => {
    const response = new Response("Denied", {
      status: 403,
      headers: { "Content-Type": "text/plain" },
    });
    vi.spyOn(auth, "handler").mockResolvedValue(response);
    const result = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(result.status).toBe(403);
    expect(await result.text()).toBe("Denied");
  });

  it("fails closed for missing/invalid trusted proxy IP on production auth writes only", async () => {
    env.NODE_ENV = "production";
    for (const ip of ["", "invalid"]) {
      for (const path of [
        "/api/auth/sign-in/email",
        "/api/auth/sign-up/email",
        "/api/verification/resend",
        "/api/verification/confirm",
      ]) {
        const res = await app.request(path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: env.FRONTEND_URL,
            "fly-client-ip": ip,
            "x-forwarded-for": nextTestIp(),
          },
          body: "{}",
        });
        expect([path, res.status]).toEqual([path, 503]);
        expect(await res.json()).toEqual({ error: "trusted_ip_required" });
      }
    }
    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/api/verification/status")).status).toBe(200);
    expect((await app.request("/api/auth/get-session")).status).toBe(200);
  });

  it("keeps public directory browsing available without trusted-IP metadata", async () => {
    env.NODE_ENV = "production";
    expect((await app.request("/api/courses")).status).toBe(200);
  });

  it("blocks an exhausted email/IP pair before hashing but does not lock out another IP", async () => {
    const fixture = await createUnverifiedTestUser();
    fixtures.push(fixture);
    await db
      .update(rateLimit)
      .set({ lastRequest: Date.now() - 61_000 })
      .where(eq(rateLimit.id, verificationLimitKey("send", fixture.email)));
    const verify = vi.spyOn((await auth.$context).password, "verify");
    for (let i = 0; i < 6; i++) {
      const res = await app.request("/api/verification/resend", {
        method: "POST",
        headers: fixture.authHeaders,
        body: JSON.stringify({ email: fixture.email, password: "wrong" }),
      });
      expect(res.status).toBe(i < 5 ? 401 : 429);
    }
    expect(verify).toHaveBeenCalledTimes(5);
    const victim = await app.request("/api/verification/resend", {
      method: "POST",
      headers: { ...fixture.authHeaders, "fly-client-ip": nextTestIp() },
      body: JSON.stringify({ email: fixture.email, password: fixture.password }),
    });
    expect(victim.status).toBe(200);
    const body = (await victim.json()) as { status: string; retryAfter: number };
    expect(body.status).toBe("accepted");
    expect(body.retryAfter).toBeGreaterThanOrEqual(1);
    expect(body.retryAfter).toBeLessThanOrEqual(60);
    expect(victim.headers.get("retry-after")).toBe(String(body.retryAfter));
  });
});
