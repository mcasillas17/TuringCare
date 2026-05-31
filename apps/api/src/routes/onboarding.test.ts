import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { type TestUser, createTestUser } from "../test-helpers";

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

type OnboardingBody = {
  hasDog: boolean;
  momentsCount: number;
  hasGoal: boolean;
  hasFinalizedBrief: boolean;
  hasSentBrief: boolean;
  mostRecentDogId: string | null;
};

describe("onboarding: GET /api/onboarding", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  it("returns 401 without auth", async () => {
    const r = await app.request("/api/onboarding", {});
    expect(r.status).toBe(401);
  });

  it("returns all-false + null for a fresh user with no dogs", async () => {
    const u = await createTestUser();
    users.push(u);
    const r = await app.request("/api/onboarding", { headers: u.authHeaders });
    expect(r.status).toBe(200);
    const body = (await r.json()) as OnboardingBody;
    expect(body).toEqual({
      hasDog: false,
      momentsCount: 0,
      hasGoal: false,
      hasFinalizedBrief: false,
      hasSentBrief: false,
      mostRecentDogId: null,
    });
  });

  it("flips hasDog and returns mostRecentDogId once a dog exists", async () => {
    const u = await createTestUser();
    users.push(u);
    const created = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    const { dog } = (await created.json()) as { dog: { id: string } };
    const r = await app.request("/api/onboarding", { headers: u.authHeaders });
    const body = (await r.json()) as OnboardingBody;
    expect(body.hasDog).toBe(true);
    expect(body.mostRecentDogId).toBe(dog.id);
    expect(body.momentsCount).toBe(0);
    expect(body.hasGoal).toBe(false);
    expect(body.hasFinalizedBrief).toBe(false);
    expect(body.hasSentBrief).toBe(false);
  });

  it("counts only kind='moment' entries, ignoring daily_checkin", async () => {
    const u = await createTestUser();
    users.push(u);
    const created = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    const { dog } = (await created.json()) as { dog: { id: string } };
    for (let i = 0; i < 3; i++) {
      await app.request(`/api/dogs/${dog.id}/journal`, {
        method: "POST",
        headers: u.authHeaders,
        body: JSON.stringify({ kind: "moment", note: `m${i}` }),
      });
    }
    await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ kind: "daily_checkin", note: "good", trend: "better" }),
    });
    const r = await app.request("/api/onboarding", { headers: u.authHeaders });
    const body = (await r.json()) as OnboardingBody;
    expect(body.momentsCount).toBe(3);
  });

  it("flips hasGoal / hasFinalizedBrief / hasSentBrief as those actions happen", async () => {
    const u = await createTestUser();
    users.push(u);
    const created = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    const { dog } = (await created.json()) as { dog: { id: string } };

    await app.request(`/api/dogs/${dog.id}/goals`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ goal: "Calm greetings" }),
    });

    await app.request(`/api/dogs/${dog.id}/brief?window=all`, {
      method: "POST",
      headers: u.authHeaders,
    });
    await app.request(`/api/dogs/${dog.id}/brief`, {
      method: "PUT",
      headers: u.authHeaders,
    });

    await app.request(`/api/dogs/${dog.id}/brief/send`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ recipient: "trainer@example.com" }),
    });

    const r = await app.request("/api/onboarding", { headers: u.authHeaders });
    const body = (await r.json()) as OnboardingBody;
    expect(body.hasGoal).toBe(true);
    expect(body.hasFinalizedBrief).toBe(true);
    expect(body.hasSentBrief).toBe(true);
  });

  it("owner isolation: another user's data doesn't leak", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    await app.request("/api/dogs", {
      method: "POST",
      headers: a.authHeaders,
      body: JSON.stringify(validDog),
    });
    const r = await app.request("/api/onboarding", { headers: b.authHeaders });
    const body = (await r.json()) as OnboardingBody;
    expect(body.hasDog).toBe(false);
    expect(body.mostRecentDogId).toBeNull();
  });
});
