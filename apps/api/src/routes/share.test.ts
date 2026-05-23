import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { auth } from "../auth";
import { db } from "../db";
import { user } from "../db/schema";

async function signedUpCookie(email: string) {
  await auth.api.signUpEmail({ body: { name: "Sh", email, password: "password-123" } });
  const res = await auth.api.signInEmail({
    body: { email, password: "password-123" },
    asResponse: true,
  });
  return res.headers.get("set-cookie") ?? "";
}

async function createDogWithBrief(cookie: string) {
  const dogRes = await app.request("/api/dogs", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      name: "Rex",
      size: "medium",
      sex: "male",
      source: "shelter",
      vaccineStage: "unknown",
    }),
  });
  const { dog } = (await dogRes.json()) as { dog: { id: string } };
  await app.request(`/api/dogs/${dog.id}/brief`, { method: "POST", headers: { cookie } });
  return dog.id as string;
}

const emails: string[] = [];
afterEach(async () => {
  for (const e of emails.splice(0)) await db.delete(user).where(eq(user.email, e));
});

describe("brief share mint/revoke", () => {
  it("requires a session (401)", async () => {
    const res = await app.request("/api/dogs/whatever/brief/share", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("mints a token + url, is idempotent, and revoke clears it", async () => {
    const email = `share_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDogWithBrief(cookie);

    const r1 = await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "POST",
      headers: { cookie },
    });
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { token: string; url: string };
    expect(b1.token.length).toBeGreaterThan(10);
    expect(b1.url).toMatch(/\/b\/.+$/);

    const r2 = await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "POST",
      headers: { cookie },
    });
    const b2 = (await r2.json()) as { token: string };
    expect(b2.token).toBe(b1.token);

    const del = await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(del.status).toBe(200);
  });

  it("404 when minting for a dog with no brief", async () => {
    const email = `nobrief_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogRes = await app.request("/api/dogs", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        name: "NoBrief",
        size: "small",
        sex: "female",
        source: "breeder",
        vaccineStage: "unknown",
      }),
    });
    const { dog } = (await dogRes.json()) as { dog: { id: string } };
    const res = await app.request(`/api/dogs/${dog.id}/brief/share`, {
      method: "POST",
      headers: { cookie },
    });
    expect(res.status).toBe(404);
  });
});
