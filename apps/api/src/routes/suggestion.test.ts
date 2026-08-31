import type { TrainingSuggestion } from "@turingcare/shared";
import { and, eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db, pool } from "../db";
import {
  dogSafetySignals,
  trainingSuggestionActions,
  trainingSuggestions,
  weeklyFocus,
} from "../db/schema";
import { lockSuggestionAnchor } from "../lib/practice-anchor";
import { lockDogSafety } from "../lib/safety-lock";
import { currentWeekKey } from "../lib/suggestion";
import { type TestUser, createTestUser } from "../test-helpers";

const users: TestUser[] = [];
const WEEK_KEY = currentWeekKey(new Date(), 0);
const validDog = {
  name: "Rex",
  size: "medium",
  sex: "male",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

async function setup() {
  const testUser = await createTestUser();
  users.push(testUser);
  const headers = testUser.authHeaders;

  const dogRes = await app.request("/api/dogs", {
    method: "POST",
    headers,
    body: JSON.stringify(validDog),
  });
  const { dog } = (await dogRes.json()) as { dog: { id: string } };

  async function addCatalogSkill(catalogSkillKey: string) {
    const res = await app.request(`/api/dogs/${dog.id}/goals/from-template`, {
      method: "POST",
      headers,
      body: JSON.stringify({ templateKey: catalogSkillKey.split(".")[0] }),
    });
    const { skills } = (await res.json()) as {
      skills: Array<{ id: string; catalogSkillKey: string | null }>;
    };
    const skill = skills.find((row) => row.catalogSkillKey === catalogSkillKey);
    if (!skill) throw new Error(`expected ${catalogSkillKey}`);
    return skill.id;
  }

  async function addCustomSkill(name: string) {
    const goalRes = await app.request(`/api/dogs/${dog.id}/goals`, {
      method: "POST",
      headers,
      body: JSON.stringify({ goal: "Custom goal" }),
    });
    const { goal } = (await goalRes.json()) as { goal: { id: string } };
    const skillRes = await app.request(`/api/dogs/${dog.id}/goals/${goal.id}/skills`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, confidence: 1 }),
    });
    const { skill } = (await skillRes.json()) as { skill: { id: string } };
    return skill.id;
  }

  async function focus(skillId: string) {
    await app.request(`/api/dogs/${dog.id}/focus`, {
      method: "POST",
      headers,
      body: JSON.stringify({ skillId, weekKey: WEEK_KEY }),
    });
  }

  async function logSession(skillId: string, occurredAt: string, body: Record<string, unknown>) {
    const variant = body.variant === "fallback" ? "fallback" : "primary";
    const evidence = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "variant"));
    const shown = await getSuggestion();
    const practicedTarget =
      shown.suggestionId &&
      (variant === "fallback" ? shown.fallback !== null : shown.primary !== null)
        ? { suggestionId: shown.suggestionId, variant }
        : undefined;
    const res = await app.request(`/api/dogs/${dog.id}/skills/${skillId}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        occurredAt,
        timezoneOffsetMinutes: 0,
        ...evidence,
        practicedTarget,
      }),
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { session: { id: string } };
  }

  async function getSuggestion(locale?: "en" | "es") {
    const res = await app.request(
      `/api/dogs/${dog.id}/suggestion?weekKey=${WEEK_KEY}&timezoneOffsetMinutes=0`,
      {
        headers: locale ? { ...headers, "X-TuringCare-Locale": locale } : headers,
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suggestion: TrainingSuggestion };
    return body.suggestion;
  }

  return {
    headers,
    dogId: dog.id,
    addCatalogSkill,
    addCustomSkill,
    focus,
    logSession,
    getSuggestion,
  };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

async function waitForAdvisoryLockWaiter() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ waiting: boolean }>(
      "select exists (select 1 from pg_locks where locktype = 'advisory' and not granted and database = (select oid from pg_database where datname = current_database())) as waiting",
    );
    if (result.rows[0]?.waiting) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for an advisory lock waiter");
}

afterEach(async () => {
  for (let user = users.pop(); user; user = users.pop()) await user.cleanup();
});

describe("GET /api/dogs/:id/suggestion", () => {
  it("asks the owner to pick a focus skill when the week is empty", async () => {
    const ctx = await setup();
    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("needs_focus_skill");
    expect(suggestion.primary).toBeNull();
  });

  it("claims legacy focus before concurrent first suggestion and focus reads", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await db.insert(weeklyFocus).values({
      dogId: ctx.dogId,
      skillId,
      weekStart: null,
      position: 0,
    });
    const [suggestion, focusResponse] = await Promise.all([
      ctx.getSuggestion(),
      app.request(
        `/api/dogs/${ctx.dogId}/focus?weekKey=${WEEK_KEY}&timezoneOffsetMinutes=0&weekEndTimezoneOffsetMinutes=0`,
        { headers: ctx.headers },
      ),
    ]);
    expect(suggestion.type).toBe("exercise");
    expect(focusResponse.status).toBe(200);
  });

  it("suggests the curriculum level at cold start with an easier fallback", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("exercise");
    expect(suggestion.ruleId).toBe("cold_start_curriculum_level");
    expect(suggestion.evidenceCategory).toBe("curriculum_only");
    expect(suggestion.primary?.level).toBe(1);
    expect(suggestion.primary?.exercise.length).toBeGreaterThan(20);
    expect(suggestion.fallback?.sameLevelEasing).toBe(true);
    expect(suggestion.fallback?.reducedDimension).toBe("cue_support");
    expect(suggestion.requestedDimensions).toContain("environment");
    expect(suggestion.suggestionId).not.toBeNull();
  });

  it("localizes curriculum exercise prose for a Spanish request", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);

    const suggestion = await ctx.getSuggestion("es");

    expect(suggestion.primary?.exercise).toBe(
      "Se guía hasta sentarse con comida en una habitación tranquila",
    );
    expect(suggestion.fallback?.exercise).toBe(
      "Se guía hasta sentarse con comida en una habitación tranquila",
    );
    expect(suggestion.skill?.name).toBe("Sentado");
  });

  it("marks a custom skill as unsupported", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCustomSkill("Skateboarding");
    await ctx.focus(skillId);

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("custom_skill_unsupported");
    expect(suggestion.primary).toBeNull();
    expect(suggestion.skill?.name).toBe("Skateboarding");
  });

  it("steps back after repeated too-hard outcomes", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.stay");
    await ctx.focus(skillId);
    await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/level`, {
      method: "PUT",
      headers: ctx.headers,
      body: JSON.stringify({ level: 3 }),
    });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "too_hard" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "too_hard" });

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.ruleId).toBe("step_back_after_too_hard");
    expect(suggestion.primary?.level).toBe(2);
    expect(suggestion.fallback?.level).toBe(2);
    expect(suggestion.fallback?.easingStrategy).toBe("decrease_owner_distance");
    expect(suggestion.evidence.tooHardCount).toBe(2);
  });

  it("uses fallback outcomes for difficulty but not advancement", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.stay");
    await ctx.focus(skillId);
    await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/level`, {
      method: "PUT",
      headers: ctx.headers,
      body: JSON.stringify({ level: 3 }),
    });
    await ctx.logSession(skillId, daysAgo(2), {
      outcome: "too_hard",
      variant: "fallback",
    });
    await ctx.logSession(skillId, daysAgo(1), {
      outcome: "too_hard",
      variant: "fallback",
    });
    const suggestion = await ctx.getSuggestion();
    expect(suggestion.ruleId).toBe("step_back_after_too_hard");
    expect(suggestion.primary?.level).toBe(2);
    expect(suggestion.advancementProposal).toBeNull();
  });

  it("returns to the confirmed level after successful eased practice", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.stay");
    await ctx.focus(skillId);
    await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/level`, {
      method: "PUT",
      headers: ctx.headers,
      body: JSON.stringify({ level: 3 }),
    });
    await ctx.logSession(skillId, daysAgo(4), { outcome: "too_hard" });
    await ctx.logSession(skillId, daysAgo(3), { outcome: "too_hard" });
    expect((await ctx.getSuggestion()).primary?.level).toBe(2);

    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });

    const recovered = await ctx.getSuggestion();
    expect(recovered.ruleId).toBe("maintain_current_level");
    expect(recovered.primary?.level).toBe(3);
    expect(recovered.evidence.sessionCount).toBe(4);
  });

  it("eases after mixed practice in a challenging recorded context", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.stay");
    await ctx.focus(skillId);
    await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/level`, {
      method: "PUT",
      headers: ctx.headers,
      body: JSON.stringify({ level: 3 }),
    });
    await ctx.logSession(skillId, daysAgo(1), {
      outcome: "mixed",
      distraction: "strong",
    });

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.ruleId).toBe("ease_after_hard_context");
    expect(suggestion.primary?.level).toBe(2);
  });

  it("does not reuse an older challenging context after newer success", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.stay");
    await ctx.focus(skillId);
    await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/level`, {
      method: "PUT",
      headers: ctx.headers,
      body: JSON.stringify({ level: 3 }),
    });
    await ctx.logSession(skillId, daysAgo(2), {
      outcome: "mixed",
      distraction: "strong",
    });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.ruleId).toBe("maintain_current_level");
    expect(suggestion.primary?.level).toBe(3);
  });

  it("does not advance from three successful fallback sessions", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), {
      outcome: "went_well",
      variant: "fallback",
    });
    await ctx.logSession(skillId, daysAgo(2), {
      outcome: "went_well",
      variant: "fallback",
    });
    await ctx.logSession(skillId, daysAgo(1), {
      outcome: "went_well",
      variant: "fallback",
    });

    expect((await ctx.getSuggestion()).advancementProposal).toBeNull();
  });

  it("proposes advancement after three good sessions across two days", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.ruleId).toBe("maintain_current_level");
    expect(suggestion.advancementProposal?.status).toBe("proposed");
    expect(suggestion.advancementProposal?.fromLevel).toBe(1);
    expect(suggestion.advancementProposal?.toLevel).toBe(2);
  });

  it("suppresses everything after an explicit safety signal and refers out", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.recall");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(1), {
      outcome: "too_hard",
      safetySignal: "aggression_or_bite_risk",
    });

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("safety_suppressed");
    expect(suggestion.primary).toBeNull();
    expect(suggestion.fallback).toBeNull();
    expect(suggestion.safety).toEqual({
      suppressed: true,
      ruleId: "reported_aggression_or_bite_risk",
      referral: "veterinary_behaviorist",
    });
  });

  it("still accepts practice and journal records while suggestions are suppressed", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.recall");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(1), {
      safetySignal: "aggression_or_bite_risk",
    });
    expect((await ctx.getSuggestion()).type).toBe("safety_suppressed");

    const practice = await ctx.logSession(skillId, daysAgo(0), {
      outcome: "mixed",
    });
    expect(practice.session.id).toBeTruthy();
    const journal = await app.request(`/api/dogs/${ctx.dogId}/journal`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ kind: "moment", note: "Observed calmly after the event." }),
    });
    expect(journal.status).toBe(201);
  });

  it("rechecks safety under the writer lock before returning an exercise", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.recall");
    await ctx.focus(skillId);
    let markReady: (() => void) | undefined;
    let release: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const safetyWrite = db.transaction(async (tx) => {
      await lockDogSafety(tx, ctx.dogId);
      await tx.insert(dogSafetySignals).values({
        dogId: ctx.dogId,
        type: "aggression_or_bite_risk",
        source: "practice_session",
        reportedAt: new Date(),
      });
      markReady?.();
      await hold;
    });
    await ready;
    let completed = false;
    const suggestionPromise = ctx.getSuggestion().then((suggestion) => {
      completed = true;
      return suggestion;
    });
    await waitForAdvisoryLockWaiter();
    expect(completed).toBe(false);
    release?.();
    await safetyWrite;

    const suggestion = await suggestionPromise;
    expect(suggestion.type).toBe("safety_suppressed");
    expect(suggestion.primary).toBeNull();
  });

  it("suppresses before the first exercise when a behavior concern reports risk", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await app.request(`/api/dogs/${ctx.dogId}/concerns`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        concern: "Snapped near the food bowl",
        severity: "moderate",
        safetySignal: "aggression_or_bite_risk",
      }),
    });

    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("safety_suppressed");
    expect(suggestion.primary).toBeNull();
    expect(suggestion.safety?.ruleId).toBe("reported_aggression_or_bite_risk");
  });

  it("suppresses from a severe concern without a selected specific signal", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await app.request(`/api/dogs/${ctx.dogId}/concerns`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ concern: "Severe behavior change", severity: "severe" }),
    });
    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("safety_suppressed");
    expect(suggestion.safety?.ruleId).toBe("severe_recorded_concern");
    expect(suggestion.primary).toBeNull();
  });

  it("suppresses from sustained high-intensity worsening observations", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    for (const occurredAt of [daysAgo(3), daysAgo(2)]) {
      const res = await app.request(`/api/dogs/${ctx.dogId}/journal`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          kind: "moment",
          note: "Structured high-intensity fixture",
          occurredAt,
          intensity: 4,
        }),
      });
      expect(res.status).toBe(201);
    }
    for (const occurredAt of [daysAgo(2), daysAgo(1)]) {
      const res = await app.request(`/api/dogs/${ctx.dogId}/journal`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          kind: "daily_checkin",
          note: "Structured worsening fixture",
          occurredAt,
          trend: "harder",
        }),
      });
      expect(res.status).toBe(201);
    }
    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("safety_suppressed");
    expect(suggestion.safety?.ruleId).toBe("sustained_worsening_intensity");
    expect(suggestion.safety?.referral).toBe("credentialed_trainer");
  });

  it("ignores future journal entries in safety and suggestion rules", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    for (let index = 0; index < 2; index += 1) {
      const occurredAt = new Date(Date.now() + (index + 1) * 24 * 60 * 60_000).toISOString();
      await app.request(`/api/dogs/${ctx.dogId}/journal`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          kind: "moment",
          note: "Future intensity fixture",
          occurredAt,
          intensity: 5,
        }),
      });
      await app.request(`/api/dogs/${ctx.dogId}/journal`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          kind: "daily_checkin",
          note: "Future trend fixture",
          occurredAt,
          trend: "harder",
        }),
      });
    }
    const suggestion = await ctx.getSuggestion();
    expect(suggestion.type).toBe("exercise");
    expect(suggestion.ruleId).toBe("cold_start_curriculum_level");
  });

  it("returns 400 for a week key that is not a Monday", async () => {
    const ctx = await setup();
    const res = await app.request(
      `/api/dogs/${ctx.dogId}/suggestion?weekKey=2026-08-11&timezoneOffsetMinutes=0`,
      {
        headers: ctx.headers,
      },
    );
    expect(res.status).toBe(400);
  });

  it("does not recalculate a historical week with current evidence", async () => {
    const ctx = await setup();
    const current = currentWeekKey(new Date(), 0);
    const previous = new Date(`${current}T00:00:00.000Z`);
    previous.setUTCDate(previous.getUTCDate() - 7);
    const previousWeekKey = previous.toISOString().slice(0, 10);
    const res = await app.request(
      `/api/dogs/${ctx.dogId}/suggestion?weekKey=${previousWeekKey}&timezoneOffsetMinutes=0`,
      { headers: ctx.headers },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "historical_suggestion_unavailable" });
  });

  it("returns 404 for another owner's dog", async () => {
    const mine = await setup();
    const theirs = await setup();
    const res = await app.request(
      `/api/dogs/${theirs.dogId}/suggestion?weekKey=${WEEK_KEY}&timezoneOffsetMinutes=0`,
      { headers: mine.headers },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for malformed dog IDs on suggestion routes", async () => {
    const ctx = await setup();
    const suggestion = await app.request(
      `/api/dogs/not-a-uuid/suggestion?weekKey=${WEEK_KEY}&timezoneOffsetMinutes=0`,
      { headers: ctx.headers },
    );
    expect(suggestion.status).toBe(404);

    const action = await app.request("/api/dogs/not-a-uuid/suggestions/not-a-uuid/actions", {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ action: "started" }),
    });
    expect(action.status).toBe(404);

    const decision = await app.request(
      "/api/dogs/not-a-uuid/advancement-proposals/not-a-uuid/decision",
      { method: "POST", headers: ctx.headers, body: JSON.stringify({ decision: "confirmed" }) },
    );
    expect(decision.status).toBe(404);
  });

  it("does not create a second audit row for concurrent identical views", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const [first, second] = await Promise.all([ctx.getSuggestion(), ctx.getSuggestion()]);
    expect(second.suggestionId).toBe(first.suggestionId);
    const rows = await db
      .select({ id: trainingSuggestions.id })
      .from(trainingSuggestions)
      .where(eq(trainingSuggestions.dogId, ctx.dogId));
    expect(rows).toHaveLength(1);
  });

  it("retains enough controlled fields to reconstruct a fallback after skill deletion", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const suggestion = await ctx.getSuggestion();
    await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}`, {
      method: "DELETE",
      headers: ctx.headers,
    });
    const [audit] = await db
      .select({
        skillId: trainingSuggestions.skillId,
        catalogSkillKey: trainingSuggestions.catalogSkillKey,
        fallbackDimension: trainingSuggestions.fallbackDimension,
        fallbackStrategy: trainingSuggestions.fallbackStrategy,
      })
      .from(trainingSuggestions)
      .where(eq(trainingSuggestions.id, suggestion.suggestionId ?? ""));
    expect(audit).toEqual({
      skillId: null,
      catalogSkillKey: "basic-manners.sit",
      fallbackDimension: "cue_support",
      fallbackStrategy: "add_cue_help",
    });
  });

  it("keeps distinct same-day audit rows when the safety rule changes", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(0), {
      outcome: "too_hard",
      safetySignal: "aggression_or_bite_risk",
    });
    expect((await ctx.getSuggestion()).safety?.ruleId).toBe("reported_aggression_or_bite_risk");
    await ctx.logSession(skillId, daysAgo(0), {
      outcome: "too_hard",
      safetySignal: "injury_or_pain",
    });
    expect((await ctx.getSuggestion()).safety?.ruleId).toBe("reported_injury_or_pain");
    const rows = await db
      .select({ id: trainingSuggestions.id })
      .from(trainingSuggestions)
      .where(
        and(eq(trainingSuggestions.dogId, ctx.dogId), eq(trainingSuggestions.suppressed, true)),
      );
    expect(rows).toHaveLength(2);
  });

  it("serializes concurrent advancement proposal creation", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });

    const [first, second] = await Promise.all([ctx.getSuggestion(), ctx.getSuggestion()]);
    expect(first.advancementProposal?.id).toBe(second.advancementProposal?.id);
    expect(first.advancementProposal?.status).toBe("proposed");
  });

  it("withdraws an open proposal when its qualifying evidence changes", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    const latest = await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    expect((await ctx.getSuggestion()).advancementProposal).not.toBeNull();
    await app.request(
      `/api/dogs/${ctx.dogId}/skills/${skillId}/sessions/${latest.session.id}/evidence`,
      {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ outcome: "mixed" }),
      },
    );
    expect((await ctx.getSuggestion()).advancementProposal).toBeNull();
  });
});

describe("suggestion actions and advancement decisions", () => {
  it("records an owner action on a suggestion", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const suggestion = await ctx.getSuggestion();

    const res = await app.request(
      `/api/dogs/${ctx.dogId}/suggestions/${suggestion.suggestionId}/actions`,
      { method: "POST", headers: ctx.headers, body: JSON.stringify({ action: "started" }) },
    );
    expect(res.status).toBe(201);
  });

  it("records the same action idempotently", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const suggestion = await ctx.getSuggestion();
    if (!suggestion.suggestionId) throw new Error("expected audited suggestion");
    const url = `/api/dogs/${ctx.dogId}/suggestions/${suggestion.suggestionId}/actions`;
    for (let index = 0; index < 2; index += 1) {
      const res = await app.request(url, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ action: "started" }),
      });
      expect(res.status).toBe(201);
    }
    const rows = await db
      .select({ id: trainingSuggestionActions.id })
      .from(trainingSuggestionActions)
      .where(eq(trainingSuggestionActions.suggestionId, suggestion.suggestionId));
    expect(rows).toHaveLength(1);
  });

  it("keeps a skipped suggestion hidden on reload", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const suggestion = await ctx.getSuggestion();
    if (!suggestion.suggestionId) throw new Error("expected audited suggestion");
    await app.request(`/api/dogs/${ctx.dogId}/suggestions/${suggestion.suggestionId}/actions`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ action: "skipped" }),
    });
    expect((await ctx.getSuggestion()).dismissed).toBe(true);
  });

  it("rejects later actions after a suggestion is skipped", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const suggestion = await ctx.getSuggestion();
    const suggestionId = suggestion.suggestionId;
    if (!suggestionId) throw new Error("expected audited suggestion");
    const url = `/api/dogs/${ctx.dogId}/suggestions/${suggestionId}/actions`;
    await app.request(url, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ action: "skipped" }),
    });

    for (const action of ["started", "rated_useful", "rated_not_useful"] as const) {
      const res = await app.request(url, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ action }),
      });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "suggestion_dismissed" });
    }
  });

  it("rejects a skipped suggestion as a practice anchor", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const suggestion = await ctx.getSuggestion();
    if (!suggestion.suggestionId) throw new Error("expected audited suggestion");
    await app.request(`/api/dogs/${ctx.dogId}/suggestions/${suggestion.suggestionId}/actions`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ action: "skipped" }),
    });
    const res = await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/sessions`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        occurredAt: new Date().toISOString(),
        timezoneOffsetMinutes: 0,
        outcome: "went_well",
        practicedTarget: {
          suggestionId: suggestion.suggestionId,
          variant: "primary",
        },
      }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(expect.objectContaining({ anchorRejected: "invalid_anchor" }));
  });

  it("rejects an anchor that waits behind a concurrent skip", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    const suggestion = await ctx.getSuggestion();
    const suggestionId = suggestion.suggestionId;
    if (!suggestionId) throw new Error("expected audited suggestion");

    let releaseSkip: () => void = () => {};
    const release = new Promise<void>((resolve) => {
      releaseSkip = resolve;
    });
    let markSkipLocked: () => void = () => {};
    const skipLocked = new Promise<void>((resolve) => {
      markSkipLocked = resolve;
    });
    const skipTx = db.transaction(async (tx) => {
      await lockSuggestionAnchor(tx, suggestionId);
      await tx.insert(trainingSuggestionActions).values({
        suggestionId,
        action: "skipped",
      });
      markSkipLocked();
      await release;
    });
    await skipLocked;

    const practice = app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/sessions`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        occurredAt: new Date().toISOString(),
        timezoneOffsetMinutes: 0,
        outcome: "went_well",
        practicedTarget: { suggestionId, variant: "primary" },
      }),
    });
    releaseSkip();
    await skipTx;

    expect(await (await practice).json()).toEqual(
      expect.objectContaining({ anchorRejected: "invalid_anchor" }),
    );
  });

  it("rejects an action on another owner's suggestion", async () => {
    const mine = await setup();
    const theirs = await setup();
    const skillId = await theirs.addCatalogSkill("basic-manners.sit");
    await theirs.focus(skillId);
    const suggestion = await theirs.getSuggestion();

    const res = await app.request(
      `/api/dogs/${mine.dogId}/suggestions/${suggestion.suggestionId}/actions`,
      { method: "POST", headers: mine.headers, body: JSON.stringify({ action: "started" }) },
    );
    expect(res.status).toBe(404);
  });

  it("rejects an advancement decision through another owner's dog", async () => {
    const mine = await setup();
    const theirs = await setup();
    const skillId = await theirs.addCatalogSkill("basic-manners.sit");
    await theirs.focus(skillId);
    await theirs.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await theirs.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await theirs.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const suggestion = await theirs.getSuggestion();
    const proposalId = suggestion.advancementProposal?.id;
    expect(proposalId).toBeDefined();
    const res = await app.request(
      `/api/dogs/${mine.dogId}/advancement-proposals/${proposalId}/decision`,
      {
        method: "POST",
        headers: mine.headers,
        body: JSON.stringify({ decision: "confirmed" }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns not found for malformed suggestion and proposal IDs", async () => {
    const ctx = await setup();
    const action = await app.request(`/api/dogs/${ctx.dogId}/suggestions/not-a-uuid/actions`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ action: "started" }),
    });
    expect(action.status).toBe(404);

    const decision = await app.request(
      `/api/dogs/${ctx.dogId}/advancement-proposals/not-a-uuid/decision`,
      { method: "POST", headers: ctx.headers, body: JSON.stringify({ decision: "confirmed" }) },
    );
    expect(decision.status).toBe(404);
  });

  it("raises the level only when the owner confirms the proposal", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const suggestion = await ctx.getSuggestion();
    const proposalId = suggestion.advancementProposal?.id;
    expect(proposalId).toBeDefined();

    const before = await ctx.getSuggestion();
    expect(before.skill?.level).toBe(1);

    const res = await app.request(
      `/api/dogs/${ctx.dogId}/advancement-proposals/${proposalId}/decision`,
      { method: "POST", headers: ctx.headers, body: JSON.stringify({ decision: "confirmed" }) },
    );
    expect(res.status).toBe(200);
    const { proposal } = (await res.json()) as { proposal: { status: string } };
    expect(proposal.status).toBe("confirmed");

    const after = await ctx.getSuggestion();
    expect(after.skill?.level).toBe(2);
  });

  it("does not recreate an old-level proposal during a concurrent confirmation", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const suggestion = await ctx.getSuggestion();
    const proposalId = suggestion.advancementProposal?.id;
    expect(proposalId).toBeDefined();

    const [, decision] = await Promise.all([
      ctx.getSuggestion(),
      app.request(`/api/dogs/${ctx.dogId}/advancement-proposals/${proposalId}/decision`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ decision: "confirmed" }),
      }),
    ]);
    expect(decision.status).toBe(200);
    const after = await ctx.getSuggestion();
    expect(after.skill?.level).toBe(2);
    expect(after.advancementProposal).toBeNull();
  });

  it("keeps the level when the owner says they stayed", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const suggestion = await ctx.getSuggestion();

    const res = await app.request(
      `/api/dogs/${ctx.dogId}/advancement-proposals/${suggestion.advancementProposal?.id}/decision`,
      { method: "POST", headers: ctx.headers, body: JSON.stringify({ decision: "stayed" }) },
    );
    expect(res.status).toBe(200);
    const after = await ctx.getSuggestion();
    expect(after.skill?.level).toBe(1);
    expect(after.advancementProposal).toBeNull();

    // The same evidence must not immediately recreate a dismissed proposal.
    // New supporting evidence permits the system to ask again.
    await ctx.logSession(skillId, daysAgo(0), { outcome: "went_well" });
    const afterNewEvidence = await ctx.getSuggestion();
    expect(afterNewEvidence.advancementProposal?.status).toBe("proposed");
  });

  it("returns 404 when deciding a proposal twice", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const suggestion = await ctx.getSuggestion();
    const url = `/api/dogs/${ctx.dogId}/advancement-proposals/${suggestion.advancementProposal?.id}/decision`;

    const first = await app.request(url, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ decision: "rejected" }),
    });
    expect(first.status).toBe(200);
    const second = await app.request(url, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ decision: "confirmed" }),
    });
    expect(second.status).toBe(404);
  });

  it("returns 409 instead of applying a stale proposal over a manual level change", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const suggestion = await ctx.getSuggestion();
    await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/level`, {
      method: "PUT",
      headers: ctx.headers,
      body: JSON.stringify({ level: 3 }),
    });

    const res = await app.request(
      `/api/dogs/${ctx.dogId}/advancement-proposals/${suggestion.advancementProposal?.id}/decision`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ decision: "confirmed" }),
      },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "stale_proposal" });
    const after = await ctx.getSuggestion();
    expect(after.skill?.level).toBe(3);
  });

  it("serializes a manual level write behind the skill decision lock", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    let releaseLock: () => void = () => {};
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let markLocked: () => void = () => {};
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${skillId}))`);
      markLocked();
      await release;
    });
    await locked;

    let completed = false;
    const manualWrite = Promise.resolve(
      app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/level`, {
        method: "PUT",
        headers: ctx.headers,
        body: JSON.stringify({ level: 3 }),
      }),
    ).then((response) => {
      completed = true;
      return response;
    });
    await waitForAdvisoryLockWaiter();
    expect(completed).toBe(false);
    releaseLock();
    await holder;
    expect((await manualWrite).status).toBe(200);
  });

  it("returns 409 when supporting practice was deleted before confirmation", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    const latest = await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const suggestion = await ctx.getSuggestion();
    await app.request(`/api/dogs/${ctx.dogId}/skills/${skillId}/sessions/${latest.session.id}`, {
      method: "DELETE",
      headers: ctx.headers,
    });
    const res = await app.request(
      `/api/dogs/${ctx.dogId}/advancement-proposals/${suggestion.advancementProposal?.id}/decision`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ decision: "confirmed" }),
      },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "stale_proposal" });
  });

  it("cannot confirm advancement while safety suppression is active", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const proposal = (await ctx.getSuggestion()).advancementProposal;
    await ctx.logSession(skillId, daysAgo(0), {
      safetySignal: "aggression_or_bite_risk",
    });

    const res = await app.request(
      `/api/dogs/${ctx.dogId}/advancement-proposals/${proposal?.id}/decision`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ decision: "confirmed" }),
      },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "safety_suppressed" });
    expect((await ctx.getSuggestion()).advancementProposal).toBeNull();
  });

  it("waits for a concurrent safety report before deciding advancement", async () => {
    const ctx = await setup();
    const skillId = await ctx.addCatalogSkill("basic-manners.sit");
    await ctx.focus(skillId);
    await ctx.logSession(skillId, daysAgo(3), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(2), { outcome: "went_well" });
    await ctx.logSession(skillId, daysAgo(1), { outcome: "went_well" });
    const proposal = (await ctx.getSuggestion()).advancementProposal;
    if (!proposal) throw new Error("expected proposal");

    let markReady: (() => void) | undefined;
    let release: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const safetyWrite = db.transaction(async (tx) => {
      await lockDogSafety(tx, ctx.dogId);
      await tx.insert(dogSafetySignals).values({
        dogId: ctx.dogId,
        type: "aggression_or_bite_risk",
        source: "practice_session",
        reportedAt: new Date(),
      });
      markReady?.();
      await hold;
    });
    await ready;
    let completed = false;
    const decision = Promise.resolve(
      app.request(`/api/dogs/${ctx.dogId}/advancement-proposals/${proposal.id}/decision`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({ decision: "confirmed" }),
      }),
    );
    const decisionResult = decision.then((response) => {
      completed = true;
      return response;
    });
    await waitForAdvisoryLockWaiter();
    expect(completed).toBe(false);
    release?.();
    await safetyWrite;

    const res = await decisionResult;
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "safety_suppressed" });
  });
});
