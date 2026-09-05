import { createEmailVerificationToken } from "better-auth/api";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { auth } from "../auth";
import { db } from "../db";
import { user } from "../db/schema";
import { findLatestTestEmail } from "../email/test-outbox";
import { env } from "../env";
import {
  type TestUser,
  createLegacySessionUser,
  createUnverifiedTestUser,
  nextTestIp,
} from "../test-helpers";
import * as limits from "./verification-rate-limit";

const cleanup: TestUser[] = [];
afterEach(async () => {
  for (const fixture of cleanup.splice(0)) await fixture.cleanup();
  vi.restoreAllMocks();
});

async function account() {
  const fixture = await createUnverifiedTestUser();
  cleanup.push(fixture);
  return fixture;
}

function link(email: string) {
  const url = findLatestTestEmail(email)?.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error("Missing synthetic email");
  return url;
}

function cookie(response: Response) {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function confirm(receipt: string, headers: Record<string, string> = {}) {
  return app.request("/api/verification/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: env.FRONTEND_URL,
      "fly-client-ip": nextTestIp(),
      cookie: receipt,
      ...headers,
    },
    body: "{}",
  });
}

describe("explicit email ownership proof", () => {
  it("confirms A while preserving an actual unverified legacy session B and signaling recovery", async () => {
    const target = await account();
    const active = await createLegacySessionUser();
    cleanup.push(active);
    const staged = await app.request(link(target.email), { headers: active.authHeaders });
    const headers = {
      ...active.authHeaders,
      cookie: `${active.authHeaders.cookie}; ${cookie(staged)}`,
    };
    const confirmed = await app.request("/api/verification/confirm", {
      method: "POST",
      headers,
      body: "{}",
    });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({
      status: "verified",
      next: "/my",
      locale: "en",
      requiresSignOut: true,
    });
    const [a] = await db.select().from(user).where(eq(user.id, target.userId));
    const [b] = await db.select().from(user).where(eq(user.id, active.userId));
    expect(a?.emailVerified).toBe(true);
    expect(b?.emailVerified).toBe(false);
    const me = await app.request("/me", { headers: active.authHeaders });
    expect(await me.json()).toMatchObject({ user: { id: active.userId, emailVerified: false } });
    expect((await app.request("/api/dogs", { headers: active.authHeaders })).status).toBe(403);
    expect(confirmed.headers.get("set-cookie")).not.toContain("session_token");
  });
  it("never invokes the native state-changing handler on a verification GET", async () => {
    const handler = vi.spyOn(auth, "handler").mockResolvedValue(Response.json({ status: true }));
    const verify = vi.spyOn(auth.api, "verifyEmail");
    // The scanner and then the human can each open the same link safely.
    for (let visit = 0; visit < 2; visit++) {
      const res = await app.request("/api/auth/verify-email?token=synthetic-token");
      expect(res.status).toBe(302);
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    }
    expect(handler).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects signed requestType tokens before the native verifier", async () => {
    vi.spyOn(limits, "consumeVerificationLimit").mockResolvedValue(0);
    const token = await createEmailVerificationToken(
      env.BETTER_AUTH_SECRET,
      "scope@example.com",
      undefined,
      3600,
      { requestType: "change-email-confirmation" },
    );
    const verify = vi.spyOn(auth.api, "verifyEmail");
    const staged = await app.request(`/api/auth/verify-email?token=${token}`);
    const result = await confirm(cookie(staged));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ status: "invalid" });
    expect(verify).not.toHaveBeenCalled();
  });

  it.each(["invalid", "expired"])(
    "maps native %s JWT errors without database-dependent validation",
    async (kind) => {
      vi.spyOn(limits, "consumeVerificationLimit").mockResolvedValue(0);
      const token =
        kind === "invalid"
          ? "invalid-jwt"
          : await createEmailVerificationToken(
              env.BETTER_AUTH_SECRET,
              "synthetic@example.com",
              undefined,
              -1,
            );
      const staged = await app.request(`/api/auth/verify-email?token=${token}`);
      const result = await confirm(cookie(staged));
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ status: kind, next: "/my", locale: "en" });
    },
  );

  it("signs successful confirmation state and verifies its expiry without trusting query strings", async () => {
    vi.spyOn(limits, "consumeVerificationLimit").mockResolvedValue(0);
    vi.spyOn((await auth.$context).internalAdapter, "findUserByEmail").mockResolvedValue({
      user: {
        id: "synthetic-proof-user",
        email: "proof@example.com",
        name: "Proof fixture",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      accounts: [],
    });
    const verify = vi.spyOn(auth.api, "verifyEmail");
    const token = await createEmailVerificationToken(env.BETTER_AUTH_SECRET, "proof@example.com");
    const staged = await app.request(`/api/auth/verify-email?token=${token}`);
    const result = await confirm(cookie(staged));
    expect(result.status).toBe(200);
    expect(verify).toHaveBeenCalledWith({ query: { token: expect.any(String) }, asResponse: true });
    expect(await result.json()).toEqual({ status: "verified", next: "/my", locale: "en" });
    const success = await app.request("/api/verification/status", {
      headers: { cookie: cookie(result) },
    });
    expect(await success.json()).toMatchObject({ status: "verified" });
    const none = await app.request("/api/verification/status?status=verified");
    expect(await none.json()).toMatchObject({ status: "none" });
    const tampered = await app.request("/api/verification/status", {
      headers: { cookie: `${cookie(result).slice(0, -12)}aaaaaaaaaaaa` },
    });
    expect(await tampered.json()).toMatchObject({ status: "invalid" });
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 601_000);
    const expired = await app.request("/api/verification/status", {
      headers: { cookie: cookie(result) },
    });
    expect(await expired.json()).toMatchObject({ status: "expired" });
  });

  it("stages old status-bearing links without trusting their status or exposing token data", async () => {
    const callback = new URL("/verify-email", env.FRONTEND_URL);
    callback.search = new URLSearchParams({
      status: "verified",
      next: "/admin",
      lang: "es",
    }).toString();
    const query = new URLSearchParams({
      token: "synthetic-token",
      callbackURL: callback.toString(),
    });
    const staged = await app.request(`/api/auth/verify-email?${query}`);
    const target = new URL(staged.headers.get("location") ?? "");
    expect(Object.fromEntries(target.searchParams)).toEqual({ next: "/admin", lang: "es" });
    const status = await app.request("/api/verification/status", {
      headers: { cookie: cookie(staged) },
    });
    expect(await status.json()).toEqual({ status: "pending", next: "/admin", locale: "es" });
  });

  it("uses bounded host-only Secure HttpOnly cookies for separate production origins", async () => {
    const previous = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      const res = await app.request("/api/auth/verify-email?token=synthetic-token", {
        headers: { "fly-client-ip": nextTestIp() },
      });
      const header = res.headers.get("set-cookie") ?? "";
      expect(header).toContain("__Secure-tc_verification_receipt=");
      expect(header).toContain("Secure");
      expect(header).toContain("HttpOnly");
      expect(header).toContain("SameSite=None");
      expect(header).toContain("Path=/api/verification");
      expect(header).toContain("Max-Age=600");
      expect(header).not.toContain("Domain=");
      expect(header.length).toBeLessThan(4096);
    } finally {
      env.NODE_ENV = previous;
    }
  });
  it("scanner GETs stage proof without verifying, issuing sessions, or promoting admins", async () => {
    const fixture = await createLegacySessionUser();
    cleanup.push(fixture);
    const previous = env.ADMIN_EMAILS;
    env.ADMIN_EMAILS = [fixture.email];
    try {
      const staged = await app.request(link(fixture.email), { headers: fixture.authHeaders });
      expect(staged.status).toBe(302);
      const [stored] = await db.select().from(user).where(eq(user.id, fixture.userId));
      expect(stored?.emailVerified).toBe(false);
      expect(stored?.role).toBe("user");
      const destination = new URL(staged.headers.get("location") ?? "");
      expect([...destination.searchParams.keys()].sort()).toEqual(["lang", "next"]);
      expect(cookie(staged)).not.toContain("session_token");
      expect(staged.headers.get("set-cookie")).toContain("HttpOnly");
      expect(staged.headers.get("set-cookie")).toContain("Path=/api/verification");
      expect(
        (await app.request("/api/admin/metrics", { headers: fixture.authHeaders })).status,
      ).toBe(403);
      const status = await app.request("/api/verification/status", {
        headers: { cookie: cookie(staged) },
      });
      expect(status.status).toBe(200);
      expect(await status.json()).toEqual({ status: "pending", next: "/my", locale: "en" });
      expect(status.headers.get("cache-control")).toBe("no-store");
    } finally {
      env.ADMIN_EMAILS = previous;
    }
  });

  it("only explicit trusted POST confirms, then returns authenticated success without a session", async () => {
    const fixture = await account();
    const token = new URL(link(fixture.email)).searchParams.get("token") ?? "";
    const staged = await app.request(link(fixture.email));
    expect(cookie(staged)).not.toContain(token);
    const confirmed = await confirm(cookie(staged));
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({ status: "verified", next: "/my", locale: "en" });
    expect(confirmed.headers.get("cache-control")).toBe("no-store");
    expect(cookie(confirmed)).not.toContain("session_token");
    const status = await app.request("/api/verification/status", {
      headers: { cookie: cookie(confirmed) },
    });
    expect(await status.json()).toEqual({ status: "verified", next: "/my", locale: "en" });
    expect((await app.request("/me", { headers: { cookie: cookie(confirmed) } })).status).toBe(401);
    expect(await (await confirm(cookie(staged))).json()).toMatchObject({ status: "verified" });
    expect(await (await confirm(cookie(confirmed))).json()).toMatchObject({ status: "verified" });
  });

  it("never trusts query flags, forged cookies, or tampered receipts", async () => {
    const noReceipt = await app.request("/api/verification/status?status=verified&next=/admin");
    expect(await noReceipt.json()).toEqual({ status: "none", next: "/my", locale: "en" });
    const fixture = await account();
    const staged = await app.request(link(fixture.email));
    const tampered = `${cookie(staged).slice(0, -8)}aaaaaaaa`;
    const status = await app.request("/api/verification/status", { headers: { cookie: tampered } });
    expect(await status.json()).toMatchObject({ status: "invalid" });
    expect(await (await confirm(tampered)).json()).toMatchObject({ status: "invalid" });
    const [stored] = await db.select().from(user).where(eq(user.id, fixture.userId));
    expect(stored?.emailVerified).toBe(false);
  });

  it("requires a trusted Origin even for anonymous confirmation and rejects other methods", async () => {
    const fixture = await account();
    const staged = await app.request(link(fixture.email));
    for (const origin of ["", "null", "https://evil.example"]) {
      expect((await confirm(cookie(staged), { Origin: origin })).status).toBe(403);
    }
    const get = await app.request("/api/verification/confirm", {
      headers: { cookie: cookie(staged) },
    });
    expect(get.status).toBe(404);
    const [stored] = await db.select().from(user).where(eq(user.id, fixture.userId));
    expect(stored?.emailVerified).toBe(false);
  });

  it("expires pending and successful receipts server-side after ten minutes", async () => {
    const fixture = await account();
    const staged = await app.request(link(fixture.email));
    const confirmed = await confirm(cookie(staged));
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 601_000);
    for (const receipt of [cookie(staged), cookie(confirmed)]) {
      const status = await app.request("/api/verification/status", {
        headers: { cookie: receipt },
      });
      expect(await status.json()).toMatchObject({ status: "expired" });
      expect(await (await confirm(receipt)).json()).toMatchObject({ status: "expired" });
    }
  });

  it.each(["invalid", "expired"])(
    "confirmation reports %s tokens without changing ownership",
    async (kind) => {
      const fixture = await account();
      const url = new URL(link(fixture.email));
      url.searchParams.set(
        "token",
        kind === "invalid"
          ? "not-a-jwt"
          : await createEmailVerificationToken(
              env.BETTER_AUTH_SECRET,
              fixture.email,
              undefined,
              -1,
            ),
      );
      const staged = await app.request(url.toString());
      const res = await confirm(cookie(staged));
      expect(await res.json()).toMatchObject({ status: kind });
      const [stored] = await db.select().from(user).where(eq(user.id, fixture.userId));
      expect(stored?.emailVerified).toBe(false);
    },
  );

  it("does not turn database/native verification failures into invalid proof", async () => {
    const fixture = await account();
    const staged = await app.request(link(fixture.email));
    vi.spyOn(auth.api, "verifyEmail").mockRejectedValue(new Error("synthetic service failure"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await confirm(cookie(staged));
    expect(res.status).toBe(500);
    const status = await app.request("/api/verification/status", {
      headers: { cookie: cookie(staged) },
    });
    expect(await status.json()).toMatchObject({ status: "pending" });
  });

  it("rejects oversized input and email-change tokens without entering BA's session-producing branch", async () => {
    const fixture = await account();
    for (const token of [
      "a".repeat(8192),
      await createEmailVerificationToken(
        env.BETTER_AUTH_SECRET,
        fixture.email,
        "other@example.com",
      ),
    ]) {
      const url = new URL(link(fixture.email));
      url.searchParams.set("token", token);
      const staged = await app.request(url.toString());
      expect((staged.headers.get("set-cookie") ?? "").length).toBeLessThan(4096);
      const res = await confirm(cookie(staged));
      expect(await res.json()).toMatchObject({ status: "invalid" });
      expect(cookie(res)).not.toContain("session_token");
    }
  });
});
