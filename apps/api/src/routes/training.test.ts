import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { trainingCatalog } from "../data/training-catalog";
import { type TestUser, createTestUser } from "../test-helpers";

describe("training: GET /api/training/templates", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  it("returns 401 without auth", async () => {
    const r = await app.request("/api/training/templates", {});
    expect(r.status).toBe(401);
  });

  it("returns the full catalog when authed", async () => {
    const u = await createTestUser();
    users.push(u);
    const r = await app.request("/api/training/templates", { headers: u.authHeaders });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { templates: typeof trainingCatalog };
    expect(body.templates).toHaveLength(trainingCatalog.length);
    expect(body.templates[0]?.key).toBe(trainingCatalog[0]?.key);
    expect(body.templates[0]?.skills.length).toBe(trainingCatalog[0]?.skills.length);
  });
});
