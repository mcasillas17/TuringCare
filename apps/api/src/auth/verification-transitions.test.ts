import { createEmailVerificationToken } from "better-auth/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { auth } from "../auth";
import { env } from "../env";
import { nextTestIp } from "../test-helpers";
import * as limits from "./verification-rate-limit";

afterEach(() => vi.restoreAllMocks());

function requestHeaders(cookie = "") {
  return {
    "Content-Type": "application/json",
    Origin: env.FRONTEND_URL,
    "fly-client-ip": nextTestIp(),
    cookie,
  };
}

function proofCookie(response: Response) {
  return (
    response.headers
      .getSetCookie()
      .find((value) => value.includes("tc_verification_receipt="))
      ?.split(";")[0] ?? ""
  );
}

async function verifiedReceipt() {
  vi.spyOn(limits, "consumeVerificationLimit").mockResolvedValue(0);
  vi.spyOn((await auth.$context).internalAdapter, "findUserByEmail").mockResolvedValue({
    user: {
      id: "account-a",
      email: "account-a@example.com",
      name: "Synthetic A",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    accounts: [],
  });
  const token = await createEmailVerificationToken(env.BETTER_AUTH_SECRET, "account-a@example.com");
  const staged = await app.request(`/api/auth/verify-email?token=${token}`);
  const response = await app.request("/api/verification/confirm", {
    method: "POST",
    headers: requestHeaders(proofCookie(staged)),
    body: "{}",
  });
  expect(response.status).toBe(200);
  return { response, token, staged };
}

describe("verification receipt account transitions", () => {
  it.each([
    ["sign-up/email", 200, { token: null }],
    ["sign-in/email", 403, { code: "EMAIL_NOT_VERIFIED" }],
    ["sign-in/email", 200, { token: "synthetic-session" }],
    ["sign-out", 200, { success: true }],
  ] as const)(
    "clears an earlier success receipt on %s (%i), preserving native cookies",
    async (path, status, body) => {
      const { response } = await verifiedReceipt();
      const native = Response.json(body, { status });
      native.headers.append("Set-Cookie", "native-fixture=preserved; HttpOnly; Path=/");
      vi.spyOn(auth, "handler").mockResolvedValue(native);
      const res = await app.request(`/api/auth/${path}`, {
        method: "POST",
        headers: requestHeaders(proofCookie(response)),
        body: "{}",
      });
      expect(res.status).toBe(status);
      const clearing = res.headers
        .getSetCookie()
        .find((value) => value.includes("tc_verification_receipt="));
      expect(clearing).toContain("Max-Age=0");
      expect(clearing).toContain("Path=/api/verification");
      expect(clearing).toContain("HttpOnly");
      if (status !== 403)
        expect(res.headers.getSetCookie()).toContain("native-fixture=preserved; HttpOnly; Path=/");
      // Browser applies Max-Age=0 and then sends no receipt to the status endpoint.
      const statusRes = await app.request("/api/verification/status");
      expect(await statusRes.json()).toMatchObject({ status: "none" });
    },
  );

  it("preserves pending receipts across password recovery and ordinary status reads", async () => {
    const staged = await app.request("/api/auth/verify-email?token=synthetic-pending");
    vi.spyOn(auth, "handler").mockImplementation(async () => Response.json({ status: true }));
    for (const path of ["request-password-reset", "reset-password"]) {
      const res = await app.request(`/api/auth/${path}`, {
        method: "POST",
        headers: requestHeaders(proofCookie(staged)),
        body: "{}",
      });
      expect(
        res.headers.getSetCookie().some((value) => value.includes("tc_verification_receipt=")),
      ).toBe(false);
      const status = await app.request("/api/verification/status", {
        headers: requestHeaders(proofCookie(staged)),
      });
      expect(await status.json()).toMatchObject({ status: "pending" });
      expect(status.headers.getSetCookie()).toEqual([]);
    }
  });

  it("replaces an earlier success receipt when another mail link is opened", async () => {
    const { response } = await verifiedReceipt();
    const replacement = await app.request("/api/auth/verify-email?token=another-pending-token", {
      headers: requestHeaders(proofCookie(response)),
    });
    const status = await app.request("/api/verification/status", {
      headers: requestHeaders(proofCookie(replacement)),
    });
    expect(await status.json()).toMatchObject({ status: "pending" });
  });

  it("signals sign-out recovery for proof A with an unverified session B without exposing identity", async () => {
    const { token } = await verifiedReceipt();
    const now = new Date();
    const sessionB = {
      session: {
        id: "session-b",
        userId: "account-b",
        token: "session-b-fixture",
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 3600_000),
        ipAddress: null,
        userAgent: null,
      },
      user: {
        id: "account-b",
        email: "account-b@example.com",
        name: "Synthetic B",
        emailVerified: false,
        role: "user",
        createdAt: now,
        updatedAt: now,
        image: null,
      },
    };
    const sessionLookup = vi.spyOn(auth.api, "getSession").mockResolvedValue(sessionB);
    const native = vi.spyOn(auth.api, "verifyEmail");
    const staged = await app.request(`/api/auth/verify-email?token=${token}`);
    const confirmed = await app.request("/api/verification/confirm", {
      method: "POST",
      headers: requestHeaders(proofCookie(staged)),
      body: "{}",
    });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({
      status: "verified",
      next: "/my",
      locale: "en",
      requiresSignOut: true,
    });
    expect(native).toHaveBeenCalledWith({ query: { token: expect.any(String) }, asResponse: true });
    expect(sessionB.user.emailVerified).toBe(false);
    expect(confirmed.headers.getSetCookie().some((value) => value.includes("session_token"))).toBe(
      false,
    );
    const status = await app.request("/api/verification/status", {
      headers: requestHeaders(proofCookie(confirmed)),
    });
    expect(await status.json()).toEqual({
      status: "verified",
      next: "/my",
      locale: "en",
      requiresSignOut: true,
    });
    const owner = await app.request("/api/dogs", {
      headers: requestHeaders(proofCookie(confirmed)),
    });
    expect(owner.status).toBe(403);
    sessionLookup.mockResolvedValue({
      session: { ...sessionB.session, userId: "account-a" },
      user: {
        ...sessionB.user,
        id: "account-a",
        email: "account-a@example.com",
        emailVerified: true,
      },
    });
    const sameAccount = await app.request("/api/verification/status", {
      headers: requestHeaders(proofCookie(confirmed)),
    });
    expect(await sameAccount.json()).toEqual({ status: "verified", next: "/my", locale: "en" });
  });
});
