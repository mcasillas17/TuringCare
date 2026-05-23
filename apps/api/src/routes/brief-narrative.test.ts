import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LLMError } from "../llm/anthropic";

// Mock the wrapper so tests don't hit Anthropic; LLMError stays real (separate module).
vi.mock("../llm/polish-brief");
import { polishBrief } from "../llm/polish-brief";

import { app } from "../app";
import { auth } from "../auth";
import { db } from "../db";
import { user } from "../db/schema";

async function signedUpCookie(email: string) {
  await auth.api.signUpEmail({ body: { name: "N", email, password: "password-123" } });
  const res = await auth.api.signInEmail({
    body: { email, password: "password-123" },
    asResponse: true,
  });
  return res.headers.get("set-cookie") ?? "";
}

async function createDog(cookie: string) {
  const r = await app.request("/api/dogs", {
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
  return ((await r.json()) as { dog: { id: string } }).dog.id;
}

const emails: string[] = [];
beforeEach(() => {
  vi.mocked(polishBrief).mockReset();
});
afterEach(async () => {
  for (const e of emails.splice(0)) await db.delete(user).where(eq(user.email, e));
});

describe("POST /api/dogs/:id/brief/narrative", () => {
  it("401 for anon", async () => {
    const res = await app.request("/api/dogs/x/brief/narrative", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("404 no_brief when the dog has no brief", async () => {
    const email = `nb-${Date.now()}@x.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDog(cookie);
    const res = await app.request(`/api/dogs/${dogId}/brief/narrative`, {
      method: "POST",
      headers: { cookie },
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("no_brief");
  });

  it("200 stores narrative + model + timestamp, and GET brief returns it", async () => {
    vi.mocked(polishBrief).mockResolvedValue("Rex is doing great on loose-leash walking.");
    const email = `ok-${Date.now()}@x.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDog(cookie);
    await app.request(`/api/dogs/${dogId}/brief`, { method: "POST", headers: { cookie } });

    const res = await app.request(`/api/dogs/${dogId}/brief/narrative`, {
      method: "POST",
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const { brief } = (await res.json()) as {
      brief: { narrative: string; narrativeModel: string; narrativeGeneratedAt: string };
    };
    expect(brief.narrative).toBe("Rex is doing great on loose-leash walking.");
    expect(brief.narrativeModel).toBeTruthy();
    expect(brief.narrativeGeneratedAt).toBeTruthy();

    const get = await app.request(`/api/dogs/${dogId}/brief`, { headers: { cookie } });
    const got = (await get.json()) as { brief: { narrative: string } };
    expect(got.brief.narrative).toBe("Rex is doing great on loose-leash walking.");
  });

  it("502 when the provider fails", async () => {
    vi.mocked(polishBrief).mockRejectedValue(new LLMError("boom", "failed"));
    const email = `f-${Date.now()}@x.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDog(cookie);
    await app.request(`/api/dogs/${dogId}/brief`, { method: "POST", headers: { cookie } });
    const res = await app.request(`/api/dogs/${dogId}/brief/narrative`, {
      method: "POST",
      headers: { cookie },
    });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBe("llm_failed");
  });

  it("503 when not configured", async () => {
    vi.mocked(polishBrief).mockRejectedValue(new LLMError("no key", "not_configured"));
    const email = `nc-${Date.now()}@x.com`;
    emails.push(email);
    const cookie = await signedUpCookie(email);
    const dogId = await createDog(cookie);
    await app.request(`/api/dogs/${dogId}/brief`, { method: "POST", headers: { cookie } });
    const res = await app.request(`/api/dogs/${dogId}/brief/narrative`, {
      method: "POST",
      headers: { cookie },
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("llm_not_configured");
  });
});
