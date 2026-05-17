import { describe, expect, it } from "vitest";
import { app } from "./app";

describe("api", () => {
  it("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("GET /me without a session returns 401", async () => {
    const res = await app.request("/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("GET /health is never rate-limited", async () => {
    for (let i = 0; i < 50; i++) {
      const res = await app.request("/health");
      expect(res.status).toBe(200);
    }
  });

  it("rate-limits repeated /api/auth/sign-in/email from one IP", async () => {
    const body = JSON.stringify({ email: "rl@example.com", password: "wrongpass-123" });
    const headers = { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7" };
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await app.request("/api/auth/sign-in/email", { method: "POST", body, headers });
    }
    expect(last?.status).toBe(429);
    // Better Auth 1.6.11 sends X-Retry-After (not the standard Retry-After header).
    expect(Number(last?.headers.get("X-Retry-After"))).toBeGreaterThan(0);
  });
});
