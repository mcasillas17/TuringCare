import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { auth } from "../auth";
import { db, pool } from "../db";
import { briefs, user } from "../db/schema";
import { withBriefLifecycleLock } from "../lib/brief-lifecycle";
import { waitForBlockingChain } from "../test-pg-concurrency";

async function signedUpCookie(email: string) {
  await auth.api.signUpEmail({ body: { name: "Sh", email, password: "password-123" } });
  const res = await auth.api.signInEmail({
    body: { email, password: "password-123" },
    asResponse: true,
  });
  return res.headers.get("set-cookie") ?? "";
}

async function createDogWithBrief(
  cookie: string,
  briefHeaders: Record<string, string> = {},
  finalize = true,
) {
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
  await app.request(`/api/dogs/${dog.id}/brief`, {
    method: "POST",
    headers: { cookie, ...briefHeaders },
  });
  if (finalize) {
    await app.request(`/api/dogs/${dog.id}/brief`, { method: "PUT", headers: { cookie } });
  }
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

  it("serializes simultaneous mints so every successful response returns the live token", async () => {
    const email = `share_concurrent_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDogWithBrief(cookie);
    const [brief] = await db
      .select({ id: briefs.id })
      .from(briefs)
      .where(eq(briefs.dogId, dogId))
      .orderBy(desc(briefs.version))
      .limit(1);
    if (!brief) throw new Error("expected generated brief");

    const blocker = await pool.connect();
    let blockerOpen = false;
    try {
      await blocker.query("BEGIN");
      blockerOpen = true;
      await blocker.query(`SELECT "id" FROM "briefs" WHERE "id" = $1 FOR UPDATE`, [brief.id]);
      const pidResult = await blocker.query<{ pid: number }>(
        "SELECT pg_backend_pid()::integer AS pid",
      );
      const blockerPid = Number(pidResult.rows[0]?.pid);

      const requests = Array.from({ length: 2 }, () =>
        app.request(`/api/dogs/${dogId}/brief/share`, {
          method: "POST",
          headers: { cookie },
        }),
      );
      await waitForBlockingChain(pool, blockerPid, 2);
      await blocker.query("COMMIT");
      blockerOpen = false;

      const responses = await Promise.all(requests);
      expect(responses.map(({ status }) => status)).toEqual([200, 200]);
      const payloads = await Promise.all(
        responses.map((response) => response.json() as Promise<{ token: string }>),
      );
      expect(new Set(payloads.map(({ token }) => token))).toHaveLength(1);
      expect((await app.request(`/api/share/brief/${payloads[0]?.token}`)).status).toBe(200);
    } finally {
      if (blockerOpen) await blocker.query("ROLLBACK");
      blocker.release();
    }
  });

  it("linearizes a queued revoke before mint without resurrecting the revoked token", async () => {
    const email = `share_revoke_mint_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDogWithBrief(cookie);
    const initialMint = await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "POST",
      headers: { cookie },
    });
    const { token: revokedToken } = (await initialMint.json()) as { token: string };
    const [brief] = await db
      .select({ id: briefs.id })
      .from(briefs)
      .where(eq(briefs.dogId, dogId))
      .orderBy(desc(briefs.version))
      .limit(1);
    if (!brief) throw new Error("expected generated brief");

    const blocker = await pool.connect();
    let blockerOpen = false;
    try {
      await blocker.query("BEGIN");
      blockerOpen = true;
      await blocker.query(`SELECT "id" FROM "briefs" WHERE "id" = $1 FOR UPDATE`, [brief.id]);
      const pidResult = await blocker.query<{ pid: number }>(
        "SELECT pg_backend_pid()::integer AS pid",
      );
      const blockerPid = Number(pidResult.rows[0]?.pid);

      const revoke = app.request(`/api/dogs/${dogId}/brief/share`, {
        method: "DELETE",
        headers: { cookie },
      });
      await waitForBlockingChain(pool, blockerPid, 1);
      let mintSettled = false;
      const mint = Promise.resolve(
        app.request(`/api/dogs/${dogId}/brief/share`, { method: "POST", headers: { cookie } }),
      ).then((response) => {
        mintSettled = true;
        return response;
      });
      const serialization = await Promise.race([
        mint.then(() => "mint_completed" as const),
        waitForBlockingChain(pool, blockerPid, 2).then(() => "mint_queued" as const),
      ]);
      const mintCompletedBeforeRelease = mintSettled;

      await blocker.query("COMMIT");
      blockerOpen = false;
      const [revokeResponse, mintResponse] = await Promise.all([revoke, mint]);
      expect(serialization).toBe("mint_queued");
      expect(mintCompletedBeforeRelease).toBe(false);
      expect(revokeResponse.status).toBe(200);
      expect(mintResponse.status).toBe(200);
      const { token: liveToken } = (await mintResponse.json()) as { token: string };
      expect(liveToken).not.toBe(revokedToken);
      expect((await app.request(`/api/share/brief/${revokedToken}`)).status).toBe(404);
      expect((await app.request(`/api/share/brief/${liveToken}`)).status).toBe(200);
    } finally {
      if (blockerOpen) await blocker.query("ROLLBACK");
      blocker.release();
    }
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

  it("rejects direct publication of a draft Brief", async () => {
    const email = `share_draft_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDogWithBrief(cookie, {}, false);

    const response = await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "POST",
      headers: { cookie },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "not_finalized" });
  });

  it("does not publish a newer draft generated before queued share minting", async () => {
    const email = `share_generate_race_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDogWithBrief(cookie);
    const blocker = await pool.connect();
    let blockerOpen = false;

    try {
      await blocker.query("BEGIN");
      blockerOpen = true;
      await blocker.query(`SELECT "id" FROM "dogs" WHERE "id" = $1 FOR UPDATE`, [dogId]);
      const pidResult = await blocker.query<{ pid: number }>(
        "SELECT pg_backend_pid()::integer AS pid",
      );
      const blockerPid = Number(pidResult.rows[0]?.pid);

      const generation = app.request(`/api/dogs/${dogId}/brief`, {
        method: "POST",
        headers: { cookie },
      });
      await waitForBlockingChain(pool, blockerPid, 1);
      const mint = app.request(`/api/dogs/${dogId}/brief/share`, {
        method: "POST",
        headers: { cookie },
      });
      await waitForBlockingChain(pool, blockerPid, 2);
      await blocker.query("COMMIT");
      blockerOpen = false;

      expect((await generation).status).toBe(201);
      const mintResponse = await mint;
      expect(mintResponse.status).toBe(409);
      expect(await mintResponse.json()).toEqual({ error: "not_finalized" });
      const latest = await db
        .select({ status: briefs.status, shareToken: briefs.shareToken })
        .from(briefs)
        .where(eq(briefs.dogId, dogId))
        .orderBy(desc(briefs.version))
        .limit(1);
      expect(latest).toEqual([{ status: "draft", shareToken: null }]);
    } finally {
      if (blockerOpen) await blocker.query("ROLLBACK");
      blocker.release();
    }
  });

  it("publishes the draft when finalization queued before share minting", async () => {
    const email = `share_finalize_race_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDogWithBrief(cookie, {}, false);
    const blocker = await pool.connect();
    let blockerOpen = false;

    try {
      await blocker.query("BEGIN");
      blockerOpen = true;
      await blocker.query(`SELECT "id" FROM "dogs" WHERE "id" = $1 FOR UPDATE`, [dogId]);
      const pidResult = await blocker.query<{ pid: number }>(
        "SELECT pg_backend_pid()::integer AS pid",
      );
      const blockerPid = Number(pidResult.rows[0]?.pid);

      const finalization = app.request(`/api/dogs/${dogId}/brief`, {
        method: "PUT",
        headers: { cookie },
      });
      await waitForBlockingChain(pool, blockerPid, 1);
      const mint = app.request(`/api/dogs/${dogId}/brief/share`, {
        method: "POST",
        headers: { cookie },
      });
      await waitForBlockingChain(pool, blockerPid, 2);
      await blocker.query("COMMIT");
      blockerOpen = false;

      expect((await finalization).status).toBe(200);
      const mintResponse = await mint;
      expect(mintResponse.status).toBe(200);
      const { token } = (await mintResponse.json()) as { token: string };
      expect((await app.request(`/api/share/brief/${token}`)).status).toBe(200);
    } finally {
      if (blockerOpen) await blocker.query("ROLLBACK");
      blocker.release();
    }
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
  it("returns the same 404 for a legacy draft token as for an unknown token", async () => {
    const email = `pub_legacy_draft_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDogWithBrief(cookie, {}, false);
    const legacyToken = `legacy-draft-${crypto.randomUUID()}`;
    await db.update(briefs).set({ shareToken: legacyToken }).where(eq(briefs.dogId, dogId));

    const legacyDraft = await app.request(`/api/share/brief/${legacyToken}`);
    const unknown = await app.request(`/api/share/brief/unknown-${crypto.randomUUID()}`);

    expect(legacyDraft.status).toBe(404);
    expect(await legacyDraft.json()).toEqual({ error: "not_found" });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "not_found" });

    const finalize = await app.request(`/api/dogs/${dogId}/brief`, {
      method: "PUT",
      headers: { cookie },
    });
    expect(finalize.status).toBe(200);
    expect((await app.request(`/api/share/brief/${legacyToken}`)).status).toBe(200);
  });

  it("returns whitelisted fields for a valid token and 404 after revoke/for unknown", async () => {
    const email = `pub_${Date.now()}@example.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDogWithBrief(cookie, { "X-TuringCare-Locale": "es" });
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
      "locale",
      "status",
      "summary",
      "version",
    ]);
    expect(body.brief.dogName).toBe("Rex");
    expect(typeof body.brief.summary).toBe("string");
    expect(body.brief).toHaveProperty("version");
    expect(body.brief.locale).toBe("es");
    expect(body.brief).not.toHaveProperty("userId");
    expect(body.brief).not.toHaveProperty("dogId");
    expect(body.brief).not.toHaveProperty("shareToken");

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
