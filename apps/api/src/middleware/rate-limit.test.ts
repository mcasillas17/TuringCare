import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createRateLimiter, globalRateLimit } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to max within the window, then limits", () => {
    const check = createRateLimiter({ windowMs: 1000, max: 2 });
    expect(check("a", 0).limited).toBe(false);
    expect(check("a", 100).limited).toBe(false);
    const third = check("a", 200);
    expect(third.limited).toBe(true);
    expect(third.retryAfter).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const check = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(check("b", 0).limited).toBe(false);
    expect(check("b", 500).limited).toBe(true);
    expect(check("b", 1000).limited).toBe(false);
  });

  it("tracks keys independently", () => {
    const check = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(check("x", 0).limited).toBe(false);
    expect(check("y", 0).limited).toBe(false);
    expect(check("x", 0).limited).toBe(true);
  });
});

describe("globalRateLimit middleware", () => {
  function app(max: number) {
    return new Hono()
      .use("*", globalRateLimit({ windowMs: 60_000, max }))
      .get("/health", (c) => c.json({ status: "ok" }))
      .get("/thing", (c) => c.json({ ok: true }))
      .on(["POST", "GET"], "/api/auth/*", (c) => c.json({ auth: true }));
  }

  it("429s a normal route past the limit with X-Retry-After", async () => {
    const a = app(1);
    expect((await a.request("/thing")).status).toBe(200);
    const res = await a.request("/thing");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("X-Retry-After"))).toBeGreaterThan(0);
    expect(await res.json()).toEqual({
      error: "rate_limited",
      retryAfter: expect.any(Number),
    });
  });

  it("never throttles /health", async () => {
    const a = app(1);
    for (let i = 0; i < 5; i++) {
      expect((await a.request("/health")).status).toBe(200);
    }
  });

  it("does not touch /api/auth/* (Better Auth owns those)", async () => {
    const a = app(1);
    expect((await a.request("/api/auth/x")).status).toBe(200);
    expect((await a.request("/api/auth/x")).status).toBe(200);
  });
});
