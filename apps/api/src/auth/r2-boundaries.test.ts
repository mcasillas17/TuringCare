import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { auth } from "../auth";
import { env } from "../env";
import { globalRateLimit } from "../middleware/rate-limit";
import { type TestUser, createLegacySessionUser, nextTestIp } from "../test-helpers";
import { handleAuthRequest } from "./request-handler";

const fixtures: TestUser[] = [];
const originalEnvironment = env.NODE_ENV;
afterEach(async () => {
  env.NODE_ENV = originalEnvironment;
  vi.restoreAllMocks();
  for (const fixture of fixtures.splice(0)) await fixture.cleanup();
});

describe("R2 auth request boundaries", () => {
  it("shares the staging rate limit across canonical and trailing-slash GETs", async () => {
    const handler = vi.spyOn(auth, "handler");
    const probe = new Hono()
      .use("*", globalRateLimit({ windowMs: 60_000, max: 2 }))
      .get("/api/auth/*", (c) => handleAuthRequest(c.req.raw));
    const headers = { "fly-client-ip": nextTestIp(), "Sec-Fetch-Dest": "empty" };
    const one = await probe.request("/api/auth/verify-email?token=fixture", { headers });
    const two = await probe.request("/api/auth/verify-email/?token=fixture", { headers });
    const three = await probe.request("/api/auth/verify-email?token=fixture", { headers });
    expect([one.status, two.status, three.status]).toEqual([302, 302, 429]);
    expect(await three.json()).toMatchObject({ error: "rate_limited" });
    expect(three.headers.get("retry-after")).toBe("60");
    expect(three.headers.get("set-cookie")).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  it("redirects throttled email navigations away from the bearer URL into localized recovery", async () => {
    const probe = new Hono()
      .use("*", globalRateLimit({ windowMs: 60_000, max: 1 }))
      .get("/api/auth/*", (c) => handleAuthRequest(c.req.raw));
    const headers = { "fly-client-ip": nextTestIp(), "Sec-Fetch-Dest": "document" };
    const callback = encodeURIComponent(`${env.FRONTEND_URL}/verify-email?next=/my/dogs&lang=es`);
    const path = `/api/auth/verify-email?token=private-fixture-token&callbackURL=${callback}`;
    expect((await probe.request(path, { headers })).status).toBe(302);
    const limited = await probe.request(path, { headers });
    expect(limited.status).toBe(303);
    const target = new URL(limited.headers.get("location") ?? "");
    expect(target.origin).toBe(new URL(env.FRONTEND_URL).origin);
    expect(target.pathname).toBe("/verify-email");
    expect(Object.fromEntries(target.searchParams)).toEqual({
      next: "/my/dogs",
      lang: "es",
      error: "rate_limited",
      retryAfter: "60",
    });
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(limited.headers.get("location")).not.toContain("private-fixture-token");
    expect(limited.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("keeps passive production email navigation token-free during a proxy metadata outage", async () => {
    env.NODE_ENV = "production";
    const handler = vi.spyOn(auth, "handler");
    const result = await app.request("/api/auth/verify-email?token=fixture", {
      headers: { "Sec-Fetch-Dest": "document" },
    });
    expect(result.status).toBe(302);
    expect(new URL(result.headers.get("location") ?? "").pathname).toBe("/verify-email");
    expect(result.headers.get("location")).not.toContain("token=");
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    "/api/auth/%76erify-email",
    "/api/auth/verify%2demail",
    "/api/auth/verify-email%2f",
    "/api/auth/verify-email//",
    "/api/auth//verify-email",
    "/api/auth/VERIFY-EMAIL",
  ])("rejects native pathname aliases before any dispatch: %s", async (path) => {
    const session = await createLegacySessionUser();
    fixtures.push(session);
    // A verified session must not turn an encoded alias into a native verifier.
    const current = await auth.api.getSession({ headers: new Headers(session.authHeaders) });
    if (!current) throw new Error("Missing fixture session");
    vi.spyOn(auth.api, "getSession").mockResolvedValue({
      ...current,
      user: { ...current.user, emailVerified: true },
    });
    const handler = vi.spyOn(auth, "handler").mockResolvedValue(Response.json({ status: true }));
    const response = await app.request(`${path}?token=fixture`, { headers: session.authHeaders });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_auth_path" });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(["image", "empty", "iframe", "script"])(
    "does not replace receipts for sec-fetch-dest=%s",
    async (destination) => {
      const response = await app.request("/api/auth/verify-email?token=fixture", {
        headers: { "Sec-Fetch-Dest": destination, "fly-client-ip": nextTestIp() },
      });
      expect(response.status).toBe(302);
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it.each([undefined, "document"])(
    "stages top-level and legacy requests (%s)",
    async (destination) => {
      const headers: Record<string, string> = { "fly-client-ip": nextTestIp() };
      if (destination) headers["Sec-Fetch-Dest"] = destination;
      const response = await app.request("/api/auth/verify-email?token=fixture", { headers });
      expect(response.status).toBe(302);
      expect(response.headers.get("set-cookie")).toContain("tc_verification_receipt=");
    },
  );

  it("keeps native reset token paths usable without allowing encoded route aliases", async () => {
    const handler = vi.spyOn(auth, "handler").mockResolvedValue(Response.json({ status: true }));
    const response = await app.request("/api/auth/reset-password/Abc_123-def/");
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("never delegates HEAD or POST verification entry requests to the native verifier", async () => {
    const handler = vi.spyOn(auth, "handler");
    const head = await app.request("/api/auth/verify-email?token=fixture", {
      method: "HEAD",
      headers: { "fly-client-ip": nextTestIp() },
    });
    expect(head.status).toBe(302);
    expect(head.headers.get("set-cookie")).toBeNull();
    const post = await app.request("/api/auth/verify-email?token=fixture", {
      method: "POST",
      headers: { "fly-client-ip": nextTestIp() },
    });
    expect(post.status).toBe(405);
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows production session status and signout without trusted-IP metadata", async () => {
    const fixture = await createLegacySessionUser();
    fixtures.push(fixture);
    env.NODE_ENV = "production";
    const headers = { cookie: fixture.authHeaders.cookie ?? "", Origin: env.FRONTEND_URL };
    const session = await app.request("/api/auth/get-session", { headers });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({
      user: { id: fixture.userId, emailVerified: false },
    });
    const signout = await app.request("/api/auth/sign-out", { method: "POST", headers });
    expect(signout.status).toBe(200);
    expect((await app.request("/me", { headers })).status).toBe(401);
  });
});
