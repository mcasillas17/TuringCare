import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { type TestUser, createTestUser } from "../test-helpers";

describe("profile", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });
  it("requires auth", async () => {
    expect((await app.request("/api/profile")).status).toBe(401);
  });
  it("gets and updates the session user's name", async () => {
    const u = await createTestUser();
    users.push(u);
    const get = await app.request("/api/profile", { headers: u.authHeaders });
    expect(get.status).toBe(200);
    const body = (await get.json()) as { user: { id: string; name: string; email: string } };
    expect(body.user.id).toBe(u.userId);
    const put = await app.request("/api/profile", {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(put.status).toBe(200);
    expect(((await put.json()) as { user: { name: string } }).user.name).toBe("Renamed");
    expect(
      (
        await app.request("/api/profile", {
          method: "PUT",
          headers: u.authHeaders,
          body: JSON.stringify({ name: "" }),
        })
      ).status,
    ).toBe(400);
  });
});
