import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AuthRequestHandler } from "./auth-handler";
import { createMonitoringAuthHandler } from "./auth-handler";
import { type ApiEnv, requestIdMiddleware } from "./request-id";

const SENTINEL = "auth-response-body-sentinel-do-not-leak";

/**
 * Throwaway Hono application built inline for this test only, mirroring the
 * single mount point wired in src/app.ts (`.on(["POST", "GET"],
 * "/api/auth/*", createMonitoringAuthHandler(...))`), but with a fake auth
 * handler so no real Better Auth instance or network call is involved.
 */
function buildApp(handler: AuthRequestHandler, capture: ReturnType<typeof vi.fn>) {
  return new Hono<ApiEnv>()
    .use("*", requestIdMiddleware)
    .on(["POST", "GET"], "/api/auth/*", createMonitoringAuthHandler(handler, capture));
}

describe("createMonitoringAuthHandler", () => {
  it("returns a >=500 Better Auth response completely unchanged (status, headers, body)", async () => {
    const handler = vi.fn(
      async () => new Response(SENTINEL, { status: 500, headers: { "X-Test": "1" } }),
    );
    const res = await buildApp(handler, vi.fn()).request("/api/auth/sign-in", { method: "POST" });

    expect(res.status).toBe(500);
    expect(res.headers.get("X-Test")).toBe("1");
    expect(await res.text()).toBe(SENTINEL);
  });

  it("returns a 200 response's body/headers exactly and never captures or logs", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Set-Cookie": "session=abc" },
        }),
    );
    const capture = vi.fn();
    const res = await buildApp(handler, capture).request("/api/auth/get-session");

    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBe("session=abc");
    expect(await res.json()).toEqual({ ok: true });
    expect(capture).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("never captures or logs an expected 401 response, and returns it unchanged", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = vi.fn(
      async () => new Response(JSON.stringify({ error: "invalid credentials" }), { status: 401 }),
    );
    const capture = vi.fn();
    const res = await buildApp(handler, capture).request("/api/auth/sign-in", { method: "POST" });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid credentials" });
    expect(capture).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("captures a >=500 response exactly once with a fixed-message Error and correlation metadata", async () => {
    const handler = vi.fn(async () => new Response(SENTINEL, { status: 500 }));
    const capture = vi.fn();
    await buildApp(handler, capture).request("/api/auth/sign-in", { method: "POST" });

    expect(capture).toHaveBeenCalledTimes(1);
    const [error, meta] = capture.mock.calls[0] ?? [];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(SENTINEL);
    expect(meta).toMatchObject({ route: "/api/auth/*", method: "POST", status: 500 });
    expect((meta as { requestId?: string })?.requestId).toBeTruthy();
  });

  it("never includes the response body/message in the captured error or its metadata", async () => {
    const handler = vi.fn(async () => new Response(SENTINEL, { status: 502 }));
    const capture = vi.fn();
    await buildApp(handler, capture).request("/api/auth/callback/google");

    expect(capture).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(capture.mock.calls[0]);
    expect(serialized).not.toContain(SENTINEL);
  });

  it("logs exactly one privacy-safe console.error for a >=500 response, independent of capture", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = vi.fn(async () => new Response(SENTINEL, { status: 500 }));
    // capture is a no-op here (simulating monitoring disabled), yet the log must still fire.
    const noopCapture = vi.fn(() => undefined);
    const res = await buildApp(handler, noopCapture).request("/api/auth/sign-in", {
      method: "POST",
    });

    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [line, meta] = errorSpy.mock.calls[0] ?? [];
    expect(line).toBe("[monitoring] unexpected server error");
    expect(meta).toMatchObject({ route: "/api/auth/*", method: "POST", status: 500 });
    const serialized = JSON.stringify(errorSpy.mock.calls);
    expect(serialized).not.toContain(SENTINEL);
    errorSpy.mockRestore();
  });

  it("logs and captures exactly once each per request (no duplicates)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = vi.fn(async () => new Response(SENTINEL, { status: 503 }));
    const capture = vi.fn();
    await buildApp(handler, capture).request("/api/auth/sign-in", { method: "POST" });

    expect(capture).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("carries the current request's correlation ID into the captured metadata", async () => {
    const handler = vi.fn(async () => new Response(SENTINEL, { status: 500 }));
    const capture = vi.fn();
    await buildApp(handler, capture).request("/api/auth/sign-in", {
      method: "POST",
      headers: { "X-Request-ID": "test-request-id-12345678" },
    });

    expect(capture.mock.calls[0]?.[1]).toMatchObject({ requestId: "test-request-id-12345678" });
  });

  it("invokes the underlying handler with the original request and never reads its body itself", async () => {
    const handler = vi.fn(async (req: Request) => {
      // Prove the adapter has not already consumed the body: it must still be readable here.
      const body = await req.text();
      expect(body).toBe("original-request-body");
      return new Response("ok", { status: 200 });
    });
    const res = await buildApp(handler, vi.fn()).request("/api/auth/sign-in", {
      method: "POST",
      body: "original-request-body",
    });

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
