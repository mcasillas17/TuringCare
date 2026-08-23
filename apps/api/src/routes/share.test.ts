import { desc, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { auth } from "../auth";
import { db, pool } from "../db";
import { briefs, user } from "../db/schema";
import { waitForBlockingChain } from "../test-pg-concurrency";

async function signedUpCookie(email: string) {
  await auth.api.signUpEmail({ body: { name: "Sh", email, password: "password-123" } });
  const res = await auth.api.signInEmail({
    body: { email, password: "password-123" },
    asResponse: true,
  });
  return res.headers.get("set-cookie") ?? "";
}

async function createDogWithBrief(cookie: string, briefHeaders: Record<string, string> = {}) {
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
});

describe("public GET /api/share/brief/:token", () => {
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
    expect(body.brief.dogName).toBe("Rex");
    expect(typeof body.brief.summary).toBe("string");
    expect(body.brief).toHaveProperty("version");
    expect(body.brief.locale).toBe("es");
    expect(body.brief).not.toHaveProperty("userId");
    expect(body.brief).not.toHaveProperty("dogId");
    expect(body.brief).not.toHaveProperty("shareToken");

    expect((await app.request("/api/share/brief/does-not-exist")).status).toBe(404);

    await app.request(`/api/dogs/${dogId}/brief/share`, { method: "DELETE", headers: { cookie } });
    expect((await app.request(`/api/share/brief/${token}`)).status).toBe(404);
  });
});
