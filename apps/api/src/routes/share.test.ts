import { randomUUID } from "node:crypto";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { auth } from "../auth";
import { db } from "../db";
import { briefs, user } from "../db/schema";
import { withBriefLifecycleLock } from "../lib/brief-lifecycle";

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

async function createDog(cookie: string, name: string) {
  const dogRes = await app.request("/api/dogs", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      name,
      size: "medium",
      sex: "male",
      source: "shelter",
      vaccineStage: "unknown",
    }),
  });
  return ((await dogRes.json()) as { dog: { id: string } }).dog.id;
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

  it("remains idempotent when sharing the latest of multiple Brief versions", async () => {
    const email = `latest_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDogWithBrief(cookie);
    const generated = await app.request(`/api/dogs/${dogId}/brief`, {
      method: "POST",
      headers: { cookie },
    });
    expect(generated.status).toBe(201);

    const first = await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "POST",
      headers: { cookie },
    });
    const second = await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "POST",
      headers: { cookie },
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = (await first.json()) as { token: string };
    expect(((await second.json()) as { token: string }).token).toBe(firstBody.token);
    const rows = await db
      .select({ version: briefs.version, shareToken: briefs.shareToken })
      .from(briefs)
      .where(eq(briefs.dogId, dogId))
      .orderBy(asc(briefs.version));
    expect(rows).toEqual([
      { version: 1, shareToken: null },
      { version: 2, shareToken: firstBody.token },
    ]);
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

  it("returns 404 for another user's share and revoke requests", async () => {
    const ownerEmail = `share-owner_${Date.now()}@example.com`;
    const otherEmail = `share-other_${Date.now()}@example.com`;
    emails.push(ownerEmail, otherEmail);
    const ownerCookie = await signedUpCookie(ownerEmail);
    const otherCookie = await signedUpCookie(otherEmail);
    const dogId = await createDogWithBrief(ownerCookie);

    const share = await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "POST",
      headers: { cookie: otherCookie },
    });
    const revoke = await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "DELETE",
      headers: { cookie: otherCookie },
    });

    expect(share.status).toBe(404);
    expect(await share.json()).toEqual({ error: "not_found" });
    expect(revoke.status).toBe(404);
    expect(await revoke.json()).toEqual({ error: "not_found" });
  });

  it("rejects a second active token for one dog while allowing one per dog", async () => {
    const email = `share-index_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const firstDogId = await createDog(cookie, "First");
    const secondDogId = await createDog(cookie, "Second");
    const firstToken = `first-${randomUUID()}`;
    const secondToken = `second-${randomUUID()}`;
    const thirdToken = `third-${randomUUID()}`;

    await db.insert(briefs).values([
      { dogId: firstDogId, summary: "First shared Brief", version: 1, shareToken: firstToken },
      {
        dogId: secondDogId,
        summary: "Second shared Brief",
        version: 1,
        shareToken: secondToken,
      },
    ]);

    await expect(
      db.insert(briefs).values({
        dogId: firstDogId,
        summary: "Invalid second active Brief",
        version: 2,
        shareToken: thirdToken,
      }),
    ).rejects.toThrow();
  });

  it("rolls back a token clear when Brief insertion violates the summary constraint", async () => {
    const email = `share-rollback_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDogWithBrief(cookie);
    const mint = await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "POST",
      headers: { cookie },
    });
    const { token } = (await mint.json()) as { token: string };

    await expect(
      withBriefLifecycleLock(dogId, async (tx) => {
        await tx
          .update(briefs)
          .set({ shareToken: null })
          .where(and(eq(briefs.dogId, dogId), isNotNull(briefs.shareToken)));
        await tx.insert(briefs).values({
          dogId,
          summary: null as never,
          version: 2,
          status: "draft",
        });
      }),
    ).rejects.toThrow();

    expect((await app.request(`/api/share/brief/${token}`)).status).toBe(200);
  });

  it("clears every historical token when revoking a newer private Brief", async () => {
    const email = `revoke-history_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDogWithBrief(cookie);
    const mint = await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "POST",
      headers: { cookie },
    });
    const { token } = (await mint.json()) as { token: string };
    await db.insert(briefs).values({
      dogId,
      summary: "Newer private Brief",
      version: 2,
      status: "draft",
    });

    const revoke = await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(revoke.status).toBe(200);
    const rows = await db
      .select({ shareToken: briefs.shareToken })
      .from(briefs)
      .where(eq(briefs.dogId, dogId));
    expect(rows.map((row) => row.shareToken)).toEqual([null, null]);
    expect((await app.request(`/api/share/brief/${token}`)).status).toBe(404);
  });
});

describe("public GET /api/share/brief/:token", () => {
  it("returns whitelisted fields for a valid token and 404 after revoke/for unknown", async () => {
    const email = `pub_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDogWithBrief(cookie);
    const mint = await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "POST",
      headers: { cookie },
    });
    const { token } = (await mint.json()) as { token: string };

    const pub = await app.request(`/api/share/brief/${token}`);
    expect(pub.status).toBe(200);
    const body = (await pub.json()) as { brief: Record<string, unknown> };
    expect(Object.keys(body.brief).sort()).toEqual([
      "dogName",
      "generatedAt",
      "status",
      "summary",
      "version",
    ]);
    expect(body.brief.dogName).toBe("Rex");
    expect(typeof body.brief.summary).toBe("string");

    const unknown = await app.request("/api/share/brief/does-not-exist");
    expect(unknown.status).toBe(404);
    const unknownBody = await unknown.json();

    await app.request(`/api/dogs/${dogId}/brief/share`, { method: "DELETE", headers: { cookie } });
    const revoked = await app.request(`/api/share/brief/${token}`);
    expect(revoked.status).toBe(404);
    expect(await revoked.json()).toEqual(unknownBody);
  });

  it("revokes an old public token when an explicit new version is generated", async () => {
    const email = `new-version_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDogWithBrief(cookie);
    const shared = await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "POST",
      headers: { cookie },
    });
    const { token } = (await shared.json()) as { token: string };

    const generated = await app.request(`/api/dogs/${dogId}/brief`, {
      method: "POST",
      headers: { cookie },
    });
    expect(generated.status).toBe(201);
    expect(
      ((await generated.json()) as { brief: { version: number; shareToken: string | null } }).brief,
    ).toMatchObject({
      version: 2,
      shareToken: null,
    });

    const unknown = await app.request("/api/share/brief/does-not-exist");
    const old = await app.request(`/api/share/brief/${token}`);
    expect(old.status).toBe(404);
    expect(await old.json()).toEqual(await unknown.json());
    const rows = await db
      .select({ shareToken: briefs.shareToken })
      .from(briefs)
      .where(eq(briefs.dogId, dogId));
    expect(rows.map((row) => row.shareToken)).toEqual([null, null]);
  });
});
