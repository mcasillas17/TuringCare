import { describe, expect, it, vi } from "vitest";
import { app } from "./app";
import { db } from "./db";
import { env } from "./env";

describe("api", () => {
  it("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("GET /ready verifies the migrated database schema", async () => {
    const res = await app.request("/ready");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready" });
  });

  it("GET /ready returns 503 when the database is unavailable", async () => {
    vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("database unavailable"));
    const res = await app.request("/ready");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "database_not_ready" });
  });

  it("GET /ready returns 503 when the final suggestion schema is missing", async () => {
    vi.spyOn(db, "execute").mockRejectedValueOnce(
      new Error('relation "training_suggestions" does not exist'),
    );
    const res = await app.request("/ready");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "database_not_ready" });
  });

  it("GET /ready returns 503 when focus compatibility tables are missing", async () => {
    vi.spyOn(db, "execute").mockRejectedValueOnce(
      new Error('relation "legacy_focus_claims" does not exist'),
    );
    const res = await app.request("/ready");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "database_not_ready" });
  });

  it("GET /health carries a correlation request ID", async () => {
    const res = await app.request("/health");
    expect(res.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("GET /me without a session returns 401", async () => {
    const res = await app.request("/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("GET /me without a session carries a correlation request ID", async () => {
    const res = await app.request("/me");
    expect(res.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("CORS exposes X-Request-ID to the configured frontend origin", async () => {
    const res = await app.request("/health", {
      headers: { Origin: env.FRONTEND_URL },
    });
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain("X-Request-ID");
  });

  it("GET /health defaults Content-Language to en", async () => {
    const res = await app.request("/health");
    expect(res.headers.get("Content-Language")).toBe("en");
  });

  it("CORS allows X-TuringCare-Locale on preflight requests", async () => {
    const res = await app.request("/health", {
      method: "OPTIONS",
      headers: {
        Origin: env.FRONTEND_URL,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Content-Type, X-TuringCare-Locale",
      },
    });

    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("X-TuringCare-Locale");
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
