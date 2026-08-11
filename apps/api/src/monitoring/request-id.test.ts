import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { type ApiEnv, requestIdMiddleware } from "./request-id";

function buildApp() {
  return new Hono<ApiEnv>()
    .use("*", requestIdMiddleware)
    .get("/x", (c) => c.json({ requestId: c.get("requestId") }));
}

describe("requestIdMiddleware", () => {
  it("preserves a well-formed inbound X-Request-ID", async () => {
    const app = buildApp();
    const res = await app.request("/x", { headers: { "X-Request-ID": "abcd1234-valid-req-id" } });

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Request-ID")).toBe("abcd1234-valid-req-id");
    expect(await res.json()).toEqual({ requestId: "abcd1234-valid-req-id" });
  });

  it("replaces an invalid, email-like inbound ID with a generated one", async () => {
    const app = buildApp();
    const res = await app.request("/x", {
      headers: { "X-Request-ID": "not-an-id@example.com" },
    });
    const header = res.headers.get("X-Request-ID");

    expect(header).not.toBe("not-an-id@example.com");
    expect(header).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("generates an ID when none is supplied", async () => {
    const app = buildApp();
    const res = await app.request("/x");

    expect(res.headers.get("X-Request-ID")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("generates a different ID on each request with no inbound header", async () => {
    const app = buildApp();
    const first = await app.request("/x");
    const second = await app.request("/x");

    expect(first.headers.get("X-Request-ID")).not.toBe(second.headers.get("X-Request-ID"));
  });

  it("rejects an inbound ID that is too short", async () => {
    const app = buildApp();
    const res = await app.request("/x", { headers: { "X-Request-ID": "short1" } });

    expect(res.headers.get("X-Request-ID")).not.toBe("short1");
  });

  it("the handler sees the same request ID that is echoed on the response", async () => {
    const app = buildApp();
    const res = await app.request("/x", {
      headers: { "X-Request-ID": "matches-in-handler-1" },
    });
    const body = (await res.json()) as { requestId: string };

    expect(body.requestId).toBe(res.headers.get("X-Request-ID"));
    expect(body.requestId).toBe("matches-in-handler-1");
  });
});
