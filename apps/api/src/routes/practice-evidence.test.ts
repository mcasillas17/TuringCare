import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { CURRICULUM_VERSION } from "../data/training-curriculum";
import { db } from "../db";
import {
  advancementProposals,
  dogSafetySignals,
  practiceSessions,
  trainingSuggestionActions,
  trainingSuggestions,
} from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";

const practiceAnchorMock = vi.hoisted(() => ({ unavailable: false }));
vi.mock("../lib/practice-anchor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/practice-anchor")>();
  return {
    ...actual,
    resolvePracticeTargetAudit: (...args: Parameters<typeof actual.resolvePracticeTargetAudit>) =>
      practiceAnchorMock.unavailable
        ? Promise.resolve("unavailable" as const)
        : actual.resolvePracticeTargetAudit(...args),
  };
});

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

type Setup = { user: TestUser; dogId: string; skillId: string };

async function setup(users: TestUser[], confidence = 2): Promise<Setup> {
  const user = await createTestUser();
  users.push(user);
  const dogResponse = await app.request("/api/dogs", {
    method: "POST",
    headers: user.authHeaders,
    body: JSON.stringify(validDog),
  });
  const { dog } = (await dogResponse.json()) as { dog: { id: string } };
  const goalResponse = await app.request(`/api/dogs/${dog.id}/goals`, {
    method: "POST",
    headers: user.authHeaders,
    body: JSON.stringify({ goal: "Reliable sit" }),
  });
  const { goal } = (await goalResponse.json()) as { goal: { id: string } };
  const skillResponse = await app.request(`/api/dogs/${dog.id}/goals/${goal.id}/skills`, {
    method: "POST",
    headers: user.authHeaders,
    body: JSON.stringify({ name: "Sit", confidence }),
  });
  const { skill } = (await skillResponse.json()) as { skill: { id: string } };
  return { user, dogId: dog.id, skillId: skill.id };
}

async function suggestion(
  dogId: string,
  skillId: string,
  values: Partial<typeof trainingSuggestions.$inferInsert> = {},
) {
  const [row] = await db
    .insert(trainingSuggestions)
    .values({
      dogId,
      skillId,
      catalogSkillKey: "basic-manners.sit",
      weekStart: "2026-08-10",
      curriculumVersion: CURRICULUM_VERSION,
      suggestionType: "exercise",
      ruleId: "test",
      level: 2,
      fallbackLevel: 1,
      dedupeKey: randomUUID(),
      ...values,
    })
    .returning();
  if (!row) throw new Error("failed to create suggestion");
  return row;
}

function postSession(s: Setup, body: Record<string, unknown>) {
  return app.request(`/api/dogs/${s.dogId}/skills/${s.skillId}/sessions`, {
    method: "POST",
    headers: s.user.authHeaders,
    body: JSON.stringify({ occurredAt: new Date(Date.now() - 60_000).toISOString(), ...body }),
  });
}

async function loadSession(id: string) {
  const [row] = await db.select().from(practiceSessions).where(eq(practiceSessions.id, id));
  if (!row) throw new Error("failed to load practice session");
  return row;
}

describe("practice evidence", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    practiceAnchorMock.unavailable = false;
    for (let user = users.pop(); user; user = users.pop()) await user.cleanup();
  });

  it("1. saves a session with no evidence", async () => {
    const s = await setup(users);
    const response = await postSession(s, {});
    expect(response.status).toBe(201);
    expect((await response.json()) as object).toMatchObject({
      session: { outcome: null, curriculumLevel: null },
      anchorRejected: null,
    });
  });

  it("2. stores structured outcome and context", async () => {
    const s = await setup(users);
    const response = await postSession(s, {
      outcome: "went_well",
      cueSupport: "verbal_cue",
      environment: "home_quiet",
      distance: "few_steps",
      durationBand: "about_15_seconds",
      distraction: "mild",
    });
    expect(response.status).toBe(201);
    expect((await response.json()) as object).toMatchObject({
      session: {
        outcome: "went_well",
        cueSupport: "verbal_cue",
        environment: "home_quiet",
        distance: "few_steps",
        durationBand: "about_15_seconds",
        distraction: "mild",
        curriculumLevel: null,
        curriculumVersion: null,
        practiceVariant: null,
        suggestionId: null,
      },
    });
  });

  it("3. stamps a valid practiced suggestion anchor", async () => {
    const s = await setup(users);
    const target = await suggestion(s.dogId, s.skillId);
    const occurredAt = new Date(Date.now() - 60_000).toISOString();
    const timezoneOffsetMinutes = 480;
    const expectedPracticeDay = new Date(
      new Date(occurredAt).getTime() - timezoneOffsetMinutes * 60_000,
    )
      .toISOString()
      .slice(0, 10);
    const response = await postSession(s, {
      occurredAt,
      timezoneOffsetMinutes,
      practicedTarget: { suggestionId: target.id, variant: "primary" },
    });
    expect(response.status).toBe(201);
    expect((await response.json()) as object).toMatchObject({
      session: {
        curriculumLevel: 2,
        curriculumVersion: CURRICULUM_VERSION,
        practiceVariant: "primary",
        suggestionId: target.id,
        practiceDay: expectedPracticeDay,
      },
      anchorRejected: null,
    });
  });

  it("4. persists a practice safety signal", async () => {
    const s = await setup(users);
    const response = await postSession(s, { safetySignal: "injury_or_pain" });
    expect(response.status).toBe(201);
    expect(
      await db.select().from(dogSafetySignals).where(eq(dogSafetySignals.dogId, s.dogId)),
    ).toMatchObject([{ type: "injury_or_pain", source: "practice_session" }]);
  });

  it("5. retains explicit concern safety after deletion", async () => {
    const s = await setup(users);
    const created = await app.request(`/api/dogs/${s.dogId}/concerns`, {
      method: "POST",
      headers: s.user.authHeaders,
      body: JSON.stringify({
        concern: "Growls near food",
        severity: "moderate",
        safetySignal: "aggression_or_bite_risk",
      }),
    });
    const { concern } = (await created.json()) as { concern: { id: string } };
    await app.request(`/api/dogs/${s.dogId}/concerns/${concern.id}`, {
      method: "DELETE",
      headers: s.user.authHeaders,
    });
    expect(
      await db.select().from(dogSafetySignals).where(eq(dogSafetySignals.dogId, s.dogId)),
    ).toMatchObject([{ type: "aggression_or_bite_risk", source: "behavior_concern" }]);
  });

  it("6. persists an internal signal for a severe concern", async () => {
    const s = await setup(users);
    await app.request(`/api/dogs/${s.dogId}/concerns`, {
      method: "POST",
      headers: s.user.authHeaders,
      body: JSON.stringify({ concern: "Panics alone", severity: "severe" }),
    });
    expect(
      await db.select().from(dogSafetySignals).where(eq(dogSafetySignals.dogId, s.dogId)),
    ).toMatchObject([{ type: "severe_behavior_concern", source: "behavior_concern" }]);
  });

  it("7. persists internal and explicit severe concern signals", async () => {
    const s = await setup(users);
    await app.request(`/api/dogs/${s.dogId}/concerns`, {
      method: "POST",
      headers: s.user.authHeaders,
      body: JSON.stringify({
        concern: "Panics around visitors",
        severity: "severe",
        safetySignal: "severe_fear_or_panic",
      }),
    });
    const rows = await db
      .select()
      .from(dogSafetySignals)
      .where(eq(dogSafetySignals.dogId, s.dogId));
    expect(rows.map((row) => row.type).sort()).toEqual([
      "severe_behavior_concern",
      "severe_fear_or_panic",
    ]);
  });

  it("8. PATCH adds outcome without replacing an anchor", async () => {
    const s = await setup(users);
    const target = await suggestion(s.dogId, s.skillId);
    const created = await postSession(s, {
      timezoneOffsetMinutes: 0,
      practicedTarget: { suggestionId: target.id, variant: "primary" },
    });
    const { session } = (await created.json()) as { session: { id: string } };
    const response = await app.request(
      `/api/dogs/${s.dogId}/skills/${s.skillId}/sessions/${session.id}/evidence`,
      {
        method: "PATCH",
        headers: s.user.authHeaders,
        body: JSON.stringify({ outcome: "mixed" }),
      },
    );
    expect(response.status).toBe(200);
    expect((await response.json()) as object).toMatchObject({
      session: { outcome: "mixed", suggestionId: target.id, curriculumLevel: 2 },
    });
  });

  it("9. PATCH preserves omitted context", async () => {
    const s = await setup(users);
    const created = await postSession(s, { environment: "yard", distraction: "mild" });
    const { session } = (await created.json()) as { session: { id: string } };
    const response = await app.request(
      `/api/dogs/${s.dogId}/skills/${s.skillId}/sessions/${session.id}/evidence`,
      {
        method: "PATCH",
        headers: s.user.authHeaders,
        body: JSON.stringify({ outcome: "went_well" }),
      },
    );
    expect((await response.json()) as object).toMatchObject({
      session: { outcome: "went_well", environment: "yard", distraction: "mild" },
    });
  });

  it("10. does not reanchor an old session after advancement", async () => {
    const s = await setup(users);
    const original = await suggestion(s.dogId, s.skillId);
    const created = await postSession(s, {
      timezoneOffsetMinutes: 0,
      practicedTarget: { suggestionId: original.id, variant: "primary" },
    });
    const { session } = (await created.json()) as { session: { id: string } };
    await app.request(`/api/dogs/${s.dogId}/skills/${s.skillId}/level`, {
      method: "PUT",
      headers: s.user.authHeaders,
      body: JSON.stringify({ level: 3 }),
    });
    const target = await suggestion(s.dogId, s.skillId, { level: 3 });
    const response = await app.request(
      `/api/dogs/${s.dogId}/skills/${s.skillId}/sessions/${session.id}/evidence`,
      {
        method: "PATCH",
        headers: s.user.authHeaders,
        body: JSON.stringify({
          timezoneOffsetMinutes: 0,
          practicedTarget: { suggestionId: target.id, variant: "primary" },
        }),
      },
    );
    expect(response.status).toBe(200);
    expect((await response.json()) as object).toMatchObject({
      session: { curriculumLevel: 2, suggestionId: original.id },
      anchorRejected: "target_locked",
    });
  });

  it("11. locks an unanchored session after its first target", async () => {
    const s = await setup(users);
    const created = await postSession(s, { timezoneOffsetMinutes: 0 });
    const { session } = (await created.json()) as { session: { id: string } };
    const first = await suggestion(s.dogId, s.skillId);
    const second = await suggestion(s.dogId, s.skillId);
    const path = `/api/dogs/${s.dogId}/skills/${s.skillId}/sessions/${session.id}/evidence`;
    await app.request(path, {
      method: "PATCH",
      headers: s.user.authHeaders,
      body: JSON.stringify({
        timezoneOffsetMinutes: 0,
        practicedTarget: { suggestionId: first.id, variant: "primary" },
      }),
    });
    const response = await app.request(path, {
      method: "PATCH",
      headers: s.user.authHeaders,
      body: JSON.stringify({
        timezoneOffsetMinutes: 0,
        practicedTarget: { suggestionId: second.id, variant: "primary" },
      }),
    });
    expect((await response.json()) as { anchorRejected: string }).toMatchObject({
      anchorRejected: "target_locked",
    });
  });

  it("12. rejects a target without a practice day", async () => {
    const s = await setup(users);
    const target = await suggestion(s.dogId, s.skillId);
    const response = await postSession(s, {
      practicedTarget: { suggestionId: target.id, variant: "primary" },
    });
    expect((await response.json()) as { anchorRejected: string }).toMatchObject({
      anchorRejected: "practice_day_required",
    });
  });

  it("13. rejects ISO timestamps over five minutes in the future", async () => {
    const s = await setup(users);
    const response = await postSession(s, {
      occurredAt: new Date(Date.now() + 6 * 60_000).toISOString(),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "future_practice_session" });
  });

  it("14. accepts legacy datetime-local values within fifteen future hours", async () => {
    const s = await setup(users);
    const date = new Date(Date.now() + 14 * 60 * 60_000);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    expect((await postSession(s, { occurredAt: local })).status).toBe(201);
  });

  it("15. rejects legacy datetime-local values with invalid calendar dates", async () => {
    const s = await setup(users);
    const response = await postSession(s, { occurredAt: "2026-02-30T10:00" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_practice_session" });
  });

  it("16. rejects legacy datetime-local values over fifteen future hours", async () => {
    const s = await setup(users);
    const date = new Date(Date.now() + 16 * 60 * 60_000);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    const response = await postSession(s, { occurredAt: local });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "future_practice_session" });
  });

  it("17. accepts a stepped-back primary target", async () => {
    const s = await setup(users);
    const target = await suggestion(s.dogId, s.skillId, { level: 1 });
    const response = await postSession(s, {
      timezoneOffsetMinutes: 0,
      practicedTarget: { suggestionId: target.id, variant: "primary" },
    });
    expect((await response.json()) as object).toMatchObject({ session: { curriculumLevel: 1 } });
  });

  it("18. saves unlinked evidence for a target above confidence", async () => {
    const s = await setup(users);
    const target = await suggestion(s.dogId, s.skillId, { level: 3 });
    const response = await postSession(s, {
      outcome: "mixed",
      timezoneOffsetMinutes: 0,
      practicedTarget: { suggestionId: target.id, variant: "primary" },
    });
    expect((await response.json()) as object).toMatchObject({
      session: { outcome: "mixed", curriculumLevel: null },
      anchorRejected: "invalid_target",
    });
  });

  it("19. rejects null selected anchor levels while saving POST and PATCH evidence", async () => {
    const s = await setup(users);
    const target = await suggestion(s.dogId, s.skillId, { fallbackLevel: null });
    const post = await postSession(s, {
      outcome: "mixed",
      safetySignal: "injury_or_pain",
      timezoneOffsetMinutes: 0,
      practicedTarget: { suggestionId: target.id, variant: "fallback" },
    });
    expect(post.status).toBe(201);
    expect((await post.json()) as object).toMatchObject({
      session: {
        outcome: "mixed",
        curriculumLevel: null,
        curriculumVersion: null,
        practiceVariant: null,
        suggestionId: null,
      },
      anchorRejected: "invalid_anchor",
    });

    const created = await postSession(s, { timezoneOffsetMinutes: 0 });
    const { session } = (await created.json()) as { session: { id: string } };
    const patch = await app.request(
      `/api/dogs/${s.dogId}/skills/${s.skillId}/sessions/${session.id}/evidence`,
      {
        method: "PATCH",
        headers: s.user.authHeaders,
        body: JSON.stringify({
          outcome: "went_well",
          safetySignal: "injury_or_pain",
          practicedTarget: { suggestionId: target.id, variant: "fallback" },
        }),
      },
    );
    expect(patch.status).toBe(200);
    expect((await patch.json()) as object).toMatchObject({
      session: {
        outcome: "went_well",
        curriculumLevel: null,
        curriculumVersion: null,
        practiceVariant: null,
        suggestionId: null,
      },
      anchorRejected: "invalid_anchor",
    });
    expect(
      await db.select().from(dogSafetySignals).where(eq(dogSafetySignals.dogId, s.dogId)),
    ).toHaveLength(2);
  });

  it("20. persists safety when another dog's suggestion is invalid", async () => {
    const s = await setup(users);
    const other = await setup(users);
    const target = await suggestion(other.dogId, other.skillId);
    const response = await postSession(s, {
      safetySignal: "injury_or_pain",
      timezoneOffsetMinutes: 0,
      practicedTarget: { suggestionId: target.id, variant: "primary" },
    });
    expect((await response.json()) as object).toMatchObject({ anchorRejected: "invalid_anchor" });
    expect(
      await db.select().from(dogSafetySignals).where(eq(dogSafetySignals.dogId, s.dogId)),
    ).toHaveLength(1);
  });

  it("21. saves outcome and safety when audit lookup is unavailable", async () => {
    const s = await setup(users);
    const target = await suggestion(s.dogId, s.skillId);
    practiceAnchorMock.unavailable = true;
    const response = await postSession(s, {
      outcome: "mixed",
      safetySignal: "injury_or_pain",
      timezoneOffsetMinutes: 0,
      practicedTarget: { suggestionId: target.id, variant: "primary" },
    });
    expect((await response.json()) as object).toMatchObject({
      session: { outcome: "mixed", curriculumLevel: null },
      anchorRejected: "audit_unavailable",
    });
    expect(
      await db.select().from(dogSafetySignals).where(eq(dogSafetySignals.dogId, s.dogId)),
    ).toHaveLength(1);
  });

  it("22. serializes concurrent first anchors on one session", async () => {
    const s = await setup(users);
    const created = await postSession(s, { timezoneOffsetMinutes: 0 });
    const { session } = (await created.json()) as { session: { id: string } };
    const first = await suggestion(s.dogId, s.skillId);
    const second = await suggestion(s.dogId, s.skillId);
    const path = `/api/dogs/${s.dogId}/skills/${s.skillId}/sessions/${session.id}/evidence`;
    const results = await Promise.all(
      [first, second].map((target) =>
        app.request(path, {
          method: "PATCH",
          headers: s.user.authHeaders,
          body: JSON.stringify({
            practicedTarget: { suggestionId: target.id, variant: "primary" },
          }),
        }),
      ),
    );
    const bodies = await Promise.all(results.map((result) => result.json()));
    expect(
      bodies.map((body) => (body as { anchorRejected: string | null }).anchorRejected).sort(),
    ).toEqual([null, "target_locked"]);
  });

  it("23. returns 404 when another owner patches a session", async () => {
    const s = await setup(users);
    const other = await setup(users);
    const created = await postSession(s, {});
    const { session } = (await created.json()) as { session: { id: string } };
    const response = await app.request(
      `/api/dogs/${s.dogId}/skills/${s.skillId}/sessions/${session.id}/evidence`,
      {
        method: "PATCH",
        headers: other.user.authHeaders,
        body: JSON.stringify({ outcome: "mixed" }),
      },
    );
    expect(response.status).toBe(404);
  });

  it("24. withdraws open advancement proposals when a session is deleted", async () => {
    const s = await setup(users);
    const created = await postSession(s, {});
    const { session } = (await created.json()) as { session: { id: string } };
    const [proposal] = await db
      .insert(advancementProposals)
      .values({
        skillId: s.skillId,
        fromLevel: 2,
        toLevel: 3,
        ruleId: "test",
        evidenceSessionCount: 1,
        evidenceDayCount: 1,
        evidenceWindowDays: 7,
        evidenceSessionIds: [session.id],
        evidenceOccurredAt: [new Date()],
        evidencePracticeDays: ["2026-08-12"],
        evidenceOutcomes: ["went_well"],
        evidenceLastSessionAt: new Date(),
      })
      .returning();
    const response = await app.request(
      `/api/dogs/${s.dogId}/skills/${s.skillId}/sessions/${session.id}`,
      { method: "DELETE", headers: s.user.authHeaders },
    );
    expect(response.status).toBe(200);
    expect(
      await db
        .select()
        .from(advancementProposals)
        .where(eq(advancementProposals.id, proposal?.id ?? "")),
    ).toMatchObject([{ status: "withdrawn", decidedAt: expect.any(Date) }]);
  });

  it("25. permits historical proposals but rejects a duplicate open proposal", async () => {
    const s = await setup(users);
    const values: Omit<typeof advancementProposals.$inferInsert, "status"> = {
      skillId: s.skillId,
      fromLevel: 2,
      toLevel: 3,
      ruleId: "test",
      evidenceSessionCount: 1,
      evidenceDayCount: 1,
      evidenceWindowDays: 7,
      evidenceSessionIds: [randomUUID()],
      evidenceOccurredAt: [new Date()],
      evidencePracticeDays: ["2026-08-12"],
      evidenceOutcomes: ["went_well"],
      evidenceLastSessionAt: new Date(),
    };

    const proposals: (typeof advancementProposals.$inferInsert)[] = [
      { ...values, status: "confirmed" },
      { ...values, status: "rejected" },
      { ...values, status: "proposed" },
    ];
    await db.insert(advancementProposals).values(proposals);

    await expect(
      db.insert(advancementProposals).values({ ...values, status: "proposed" }),
    ).rejects.toThrow();
  });

  it("26. stamps the locked skill level for confirmed manual POST evidence", async () => {
    const s = await setup(users, 3);
    const response = await postSession(s, {
      timezoneOffsetMinutes: 0,
      outcome: "went_well",
      confirmCurrentLevel: true,
    });
    expect(response.status).toBe(201);
    expect((await response.json()) as object).toMatchObject({
      session: {
        outcome: "went_well",
        curriculumLevel: 3,
        curriculumVersion: CURRICULUM_VERSION,
        practiceVariant: null,
        suggestionId: null,
      },
      anchorRejected: null,
    });
  });

  it("27. returns practice_day_required while saving unanchored confirmed POST evidence", async () => {
    const s = await setup(users, 3);
    const response = await postSession(s, {
      outcome: "mixed",
      confirmCurrentLevel: true,
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      session: { id: string };
      anchorRejected: string | null;
    };
    expect(body).toMatchObject({
      session: {
        outcome: "mixed",
        curriculumLevel: null,
        curriculumVersion: null,
        practiceVariant: null,
        suggestionId: null,
        practiceDay: null,
      },
      anchorRejected: "practice_day_required",
    });
    expect(await loadSession(body.session.id)).toMatchObject({
      outcome: "mixed",
      curriculumLevel: null,
      curriculumVersion: null,
      practiceVariant: null,
      suggestionId: null,
      practiceDay: null,
    });
  });

  it("28. PATCH anchors an unanchored quick log only from the saved practice day", async () => {
    const s = await setup(users, 3);
    const created = await postSession(s, { timezoneOffsetMinutes: 0 });
    const { session } = (await created.json()) as { session: { id: string } };
    const response = await app.request(
      `/api/dogs/${s.dogId}/skills/${s.skillId}/sessions/${session.id}/evidence`,
      {
        method: "PATCH",
        headers: s.user.authHeaders,
        body: JSON.stringify({ outcome: "went_well", confirmCurrentLevel: true }),
      },
    );
    expect(response.status).toBe(200);
    expect((await response.json()) as object).toMatchObject({
      session: {
        outcome: "went_well",
        curriculumLevel: 3,
        curriculumVersion: CURRICULUM_VERSION,
        practiceVariant: null,
        suggestionId: null,
      },
      anchorRejected: null,
    });
  });

  it("29. PATCH keeps the original anchor when manual confirmation is target_locked", async () => {
    const s = await setup(users, 3);
    const target = await suggestion(s.dogId, s.skillId);
    const created = await postSession(s, {
      timezoneOffsetMinutes: 0,
      practicedTarget: { suggestionId: target.id, variant: "primary" },
    });
    const { session } = (await created.json()) as { session: { id: string } };
    const response = await app.request(
      `/api/dogs/${s.dogId}/skills/${s.skillId}/sessions/${session.id}/evidence`,
      {
        method: "PATCH",
        headers: s.user.authHeaders,
        body: JSON.stringify({
          outcome: "mixed",
          cueSupport: "verbal_cue",
          confirmCurrentLevel: true,
        }),
      },
    );
    expect(response.status).toBe(200);
    expect((await response.json()) as object).toMatchObject({
      session: {
        outcome: "mixed",
        cueSupport: "verbal_cue",
        curriculumLevel: 2,
        curriculumVersion: CURRICULUM_VERSION,
        practiceVariant: "primary",
        suggestionId: target.id,
      },
      anchorRejected: "target_locked",
    });
    expect(await loadSession(session.id)).toMatchObject({
      outcome: "mixed",
      cueSupport: "verbal_cue",
      curriculumLevel: 2,
      curriculumVersion: CURRICULUM_VERSION,
      practiceVariant: "primary",
      suggestionId: target.id,
    });
  });

  it("30. races manual anchoring with a level change without mixing server-owned anchors", async () => {
    const s = await setup(users, 2);
    const created = await postSession(s, { timezoneOffsetMinutes: 0 });
    const { session } = (await created.json()) as { session: { id: string } };
    const [response, levelResponse] = await Promise.all([
      app.request(`/api/dogs/${s.dogId}/skills/${s.skillId}/sessions/${session.id}/evidence`, {
        method: "PATCH",
        headers: s.user.authHeaders,
        body: JSON.stringify({ outcome: "went_well", confirmCurrentLevel: true }),
      }),
      app.request(`/api/dogs/${s.dogId}/skills/${s.skillId}/level`, {
        method: "PUT",
        headers: s.user.authHeaders,
        body: JSON.stringify({ level: 3 }),
      }),
    ]);
    expect(levelResponse.status).toBe(200);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: {
        curriculumLevel: number | null;
        curriculumVersion: string | null;
        practiceVariant: string | null;
        suggestionId: string | null;
      };
      anchorRejected: string | null;
    };
    expect(body.anchorRejected).toBeNull();
    expect([2, 3]).toContain(body.session.curriculumLevel);
    expect(body.session.curriculumVersion).toBe(CURRICULUM_VERSION);
    expect(body.session.practiceVariant).toBeNull();
    expect(body.session.suggestionId).toBeNull();
    expect(await loadSession(session.id)).toMatchObject({
      curriculumLevel: body.session.curriculumLevel,
      curriculumVersion: CURRICULUM_VERSION,
      practiceVariant: null,
      suggestionId: null,
    });
  });
});
