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
});
