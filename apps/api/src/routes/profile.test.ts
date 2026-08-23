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

  it("returns a null locale before the user chooses an account locale", async () => {
    const u = await createTestUser();
    users.push(u);

    const get = await app.request("/api/profile", { headers: u.authHeaders });

    expect(get.status).toBe(200);
    expect(((await get.json()) as { user: { locale: string | null } }).user.locale).toBeNull();
  });

  it("updates the authenticated user's locale", async () => {
    const u = await createTestUser();
    users.push(u);

    const patch = await app.request("/api/profile/locale", {
      method: "PATCH",
      headers: u.authHeaders,
      body: JSON.stringify({ locale: "es" }),
    });

    expect(patch.status).toBe(200);
    expect(((await patch.json()) as { user: { locale: string | null } }).user.locale).toBe("es");

    const get = await app.request("/api/profile", { headers: u.authHeaders });
    expect(((await get.json()) as { user: { locale: string | null } }).user.locale).toBe("es");
  });

  it("rejects invalid locale updates", async () => {
    const u = await createTestUser();
    users.push(u);

    const patch = await app.request("/api/profile/locale", {
      method: "PATCH",
      headers: u.authHeaders,
      body: JSON.stringify({ locale: "fr" }),
    });

    expect(patch.status).toBe(400);
  });

  it("requires auth to update locale", async () => {
    const patch = await app.request("/api/profile/locale", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "es" }),
    });

    expect(patch.status).toBe(401);
  });

  it("ignores request user ids when updating locale", async () => {
    const u1 = await createTestUser();
    const u2 = await createTestUser();
    users.push(u1, u2);

    const patch = await app.request("/api/profile/locale", {
      method: "PATCH",
      headers: u1.authHeaders,
      body: JSON.stringify({ locale: "es", userId: u2.userId }),
    });

    expect(patch.status).toBe(200);

    const u1Profile = await app.request("/api/profile", { headers: u1.authHeaders });
    const u2Profile = await app.request("/api/profile", { headers: u2.authHeaders });
    expect(((await u1Profile.json()) as { user: { locale: string | null } }).user.locale).toBe(
      "es",
    );
    expect(
      ((await u2Profile.json()) as { user: { locale: string | null } }).user.locale,
    ).toBeNull();
  });
});
