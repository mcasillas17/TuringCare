import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";
import { createMonitoringErrorHandler } from "./error-handler";
import { type ApiEnv, requestIdMiddleware } from "./request-id";

/**
 * Throwaway Hono application built inline for this test only — the
 * production `app` instance in src/app.ts is never given a synthetic
 * failure route (see design doc).
 */
function buildApp(capture: ReturnType<typeof vi.fn>) {
  const app = new Hono<ApiEnv>()
    .use("*", requestIdMiddleware)
    .get("/boom", () => {
      throw new Error("raw failure detail: password=hunter2");
    })
    .get("/upstream", () => {
      throw new HTTPException(502, { message: "bad gateway upstream detail" });
    })
    .get("/forbidden", () => {
      throw new HTTPException(403, { message: "forbidden" });
    })
    .get("/sentinel", () => {
      throw SENTINEL;
    });
  app.onError(createMonitoringErrorHandler(capture));
  return app;
}

const SENTINEL = "non-error-sentinel-value-do-not-leak";

describe("createMonitoringErrorHandler", () => {
  it("captures a generic exception once and returns only a generic 500 body", async () => {
    const capture = vi.fn();
    const res = await buildApp(capture).request("/boom");

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal_server_error" });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]?.[1]).toMatchObject({
      route: "/boom",
      method: "GET",
      status: 500,
    });
  });

  it("never leaks the raw error message in the response", async () => {
    const res = await buildApp(vi.fn()).request("/boom");
    const text = await res.text();

    expect(text).not.toContain("raw failure detail");
  });

  it("carries the request ID on the captured-error response", async () => {
    const res = await buildApp(vi.fn()).request("/boom");
    expect(res.headers.get("X-Request-ID")).toBeTruthy();
  });

  it("preserves an unmatched route's 404 exactly and never captures it", async () => {
    const capture = vi.fn();
    const res = await buildApp(capture).request("/missing");

    expect(res.status).toBe(404);
    expect(capture).not.toHaveBeenCalled();
    expect(res.headers.get("X-Request-ID")).toBeTruthy();
  });

  it("preserves a 5xx HTTPException response exactly, and captures it", async () => {
    const capture = vi.fn();
    const res = await buildApp(capture).request("/upstream");

    expect(res.status).toBe(502);
    expect(await res.text()).toBe("bad gateway upstream detail");
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]?.[1]).toMatchObject({ method: "GET", status: 502 });
  });

  it("preserves a 4xx HTTPException response exactly and never captures it", async () => {
    const capture = vi.fn();
    const res = await buildApp(capture).request("/forbidden");

    expect(res.status).toBe(403);
    expect(await res.text()).toBe("forbidden");
    expect(capture).not.toHaveBeenCalled();
  });

  it("normalizes a non-Error (string/sentinel) throw to a generic 500, still captures once, and never leaks the sentinel", async () => {
    const capture = vi.fn();
    const res = await buildApp(capture).request("/sentinel");
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(text).not.toContain(SENTINEL);
    expect(JSON.parse(text)).toEqual({ error: "internal_server_error" });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(capture.mock.calls[0]?.[0]).toMatchObject({ message: "Non-Error value thrown" });
    expect(res.headers.get("X-Request-ID")).toBeTruthy();
  });

  it("captures with route 'unmatched' and requestId 'unknown' when nothing set either", async () => {
    const capture = vi.fn();
    // No requestIdMiddleware and no wildcard route/middleware registered, so
    // nothing matches this request: routePath(c) returns "" and c.get(
    // "requestId") returns undefined, exercising both error-handler fallbacks.
    const app = new Hono<ApiEnv>().get("/known", (c) => c.text("ok"));
    app.notFound(() => {
      throw new Error("no route matched");
    });
    app.onError(createMonitoringErrorHandler(capture));

    const res = await app.request("/does-not-exist");

    expect(res.status).toBe(500);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]?.[1]).toMatchObject({
      route: "unmatched",
      requestId: "unknown",
      status: 500,
    });
  });
});

describe("createMonitoringErrorHandler console.error observability", () => {
  it("logs a generic exception exactly once with safe metadata and never the raw message", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await buildApp(vi.fn()).request("/boom");
    expect(res.status).toBe(500);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [line, meta] = errorSpy.mock.calls[0] ?? [];
    expect(line).toBe("[monitoring] unexpected server error");
    expect(meta).toMatchObject({ route: "/boom", method: "GET", status: 500 });
    expect(meta).toHaveProperty("requestId");
    expect(meta).toHaveProperty("errorType");

    const serialized = JSON.stringify(errorSpy.mock.calls[0]);
    expect(serialized).not.toContain("raw failure detail");
    errorSpy.mockRestore();
  });

  it("logs a 5xx HTTPException exactly once with safe metadata and never the response body", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await buildApp(vi.fn()).request("/upstream");
    expect(res.status).toBe(502);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [line, meta] = errorSpy.mock.calls[0] ?? [];
    expect(line).toBe("[monitoring] unexpected server error");
    expect(meta).toMatchObject({ route: "/upstream", method: "GET", status: 502 });

    const serialized = JSON.stringify(errorSpy.mock.calls[0]);
    expect(serialized).not.toContain("bad gateway upstream detail");
    errorSpy.mockRestore();
  });

  it("never logs for a preserved 4xx HTTPException response", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await buildApp(vi.fn()).request("/forbidden");
    expect(res.status).toBe(403);

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("never logs for a preserved 404 (unmatched route)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await buildApp(vi.fn()).request("/missing");
    expect(res.status).toBe(404);

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("logs a normalized non-Error (sentinel) throw exactly once and never leaks the sentinel", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await buildApp(vi.fn()).request("/sentinel");
    expect(res.status).toBe(500);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(errorSpy.mock.calls[0]);
    expect(serialized).not.toContain(SENTINEL);
    errorSpy.mockRestore();
  });

  it("logs exactly once per request even when capture also runs (no duplicate logging)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const capture = vi.fn();
    await buildApp(capture).request("/boom");

    expect(capture).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
