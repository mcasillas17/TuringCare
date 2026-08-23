import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { CURRICULUM_VERSION } from "../data/training-curriculum";
import { db } from "../db";
import {
  advancementProposals,
  dogSafetySignals,
  trainingGoals,
  trainingSkills,
  trainingSuggestionActions,
  trainingSuggestions,
  weeklyFocus,
} from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";
import { currentWeekKey, loadSuggestion, recordSuggestionAction } from "./suggestion";

const NOW = new Date("2026-08-13T12:00:00.000Z");
const WEEK_KEY = currentWeekKey(NOW, 0);
const users: TestUser[] = [];

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

async function setup({ focused = false }: { focused?: boolean } = {}) {
  const user = await createTestUser();
  users.push(user);
  const dogResponse = await app.request("/api/dogs", {
    method: "POST",
    headers: user.authHeaders,
    body: JSON.stringify(validDog),
  });
  const { dog } = (await dogResponse.json()) as { dog: { id: string } };
  const [goal] = await db
    .insert(trainingGoals)
    .values({ dogId: dog.id, goal: "Reliable sit", catalogGoalKey: "basic-manners" })
    .returning();
  if (!goal) throw new Error("failed to create goal");
  const [skill] = await db
    .insert(trainingSkills)
    .values({
      goalId: goal.id,
      name: "Sit",
      confidence: 2,
      catalogSkillKey: "basic-manners.sit",
    })
    .returning();
  if (!skill) throw new Error("failed to create skill");
  if (focused) {
    await db.insert(weeklyFocus).values({
      dogId: dog.id,
      skillId: skill.id,
      weekStart: WEEK_KEY,
      position: 0,
    });
  }
  return { user, dogId: dog.id, skillId: skill.id };
}

afterEach(async () => {
  for (let user = users.pop(); user; user = users.pop()) await user.cleanup();
});

describe("suggestion orchestration", () => {
  it("uses the owner's local Monday as the week key", () => {
    expect(currentWeekKey(new Date("2026-08-10T00:30:00.000Z"), 420)).toBe("2026-08-03");
    expect(currentWeekKey(new Date("2026-08-10T00:30:00.000Z"), -120)).toBe("2026-08-10");
  });

  it("audits and dedupes a no-focus suggestion", async () => {
    const ctx = await setup();

    const first = await loadSuggestion({
      userId: ctx.user.userId,
      dogId: ctx.dogId,
      weekKey: WEEK_KEY,
      timezoneOffsetMinutes: 0,
      now: NOW,
    });
    const second = await loadSuggestion({
      userId: ctx.user.userId,
      dogId: ctx.dogId,
      weekKey: WEEK_KEY,
      timezoneOffsetMinutes: 0,
      now: NOW,
    });

    expect(first).toMatchObject({ type: "needs_focus_skill", suggestionId: expect.any(String) });
    expect(second.suggestionId).toBe(first.suggestionId);
    expect(
      await db.select().from(trainingSuggestions).where(eq(trainingSuggestions.dogId, ctx.dogId)),
    ).toHaveLength(1);
  });

  it("audits a focused reviewed exercise with its fallback", async () => {
    const ctx = await setup({ focused: true });

    const suggestion = await loadSuggestion({
      userId: ctx.user.userId,
      dogId: ctx.dogId,
      weekKey: WEEK_KEY,
      timezoneOffsetMinutes: 0,
      now: NOW,
    });

    expect(suggestion).toMatchObject({
      type: "exercise",
      primary: { level: 2 },
      fallback: { level: 2, sameLevelEasing: true },
      suggestionId: expect.any(String),
    });
    expect(
      await db
        .select()
        .from(trainingSuggestions)
        .where(eq(trainingSuggestions.id, suggestion.suggestionId ?? "")),
    ).toMatchObject([
      {
        suggestionType: "exercise",
        level: 2,
        fallbackLevel: 2,
        suppressed: false,
      },
    ]);
  });

  it("suppresses and withdraws an open proposal when a safety signal persists", async () => {
    const ctx = await setup({ focused: true });
    await db.insert(advancementProposals).values({
      skillId: ctx.skillId,
      fromLevel: 2,
      toLevel: 3,
      ruleId: "recent_success_at_level",
      evidenceSessionCount: 3,
      evidenceDayCount: 2,
      evidenceWindowDays: 21,
      evidenceSessionIds: [],
      evidenceOccurredAt: [],
      evidencePracticeDays: [],
      evidenceOutcomes: [],
      evidenceLastSessionAt: NOW,
    });
    await db.insert(dogSafetySignals).values({
      dogId: ctx.dogId,
      type: "injury_or_pain",
      source: "practice_session",
      reportedAt: NOW,
    });

    const suggestion = await loadSuggestion({
      userId: ctx.user.userId,
      dogId: ctx.dogId,
      weekKey: WEEK_KEY,
      timezoneOffsetMinutes: 0,
      now: NOW,
    });

    expect(suggestion).toMatchObject({
      type: "safety_suppressed",
      safety: { ruleId: "reported_injury_or_pain" },
      primary: null,
    });
    expect(
      await db
        .select({ status: advancementProposals.status })
        .from(advancementProposals)
        .where(eq(advancementProposals.skillId, ctx.skillId)),
    ).toEqual([{ status: "withdrawn" }]);
  });

  it("records skipped once under the suggestion lock and dismisses later actions", async () => {
    const ctx = await setup({ focused: true });
    const suggestion = await loadSuggestion({
      userId: ctx.user.userId,
      dogId: ctx.dogId,
      weekKey: WEEK_KEY,
      timezoneOffsetMinutes: 0,
      now: NOW,
    });
    if (!suggestion.suggestionId) throw new Error("expected persisted suggestion");

    await Promise.all([
      recordSuggestionAction({
        userId: ctx.user.userId,
        dogId: ctx.dogId,
        suggestionId: suggestion.suggestionId,
        action: "skipped",
      }),
      recordSuggestionAction({
        userId: ctx.user.userId,
        dogId: ctx.dogId,
        suggestionId: suggestion.suggestionId,
        action: "skipped",
      }),
    ]);

    expect(
      await recordSuggestionAction({
        userId: ctx.user.userId,
        dogId: ctx.dogId,
        suggestionId: suggestion.suggestionId,
        action: "started",
      }),
    ).toBe("dismissed");
    expect(
      await db
        .select()
        .from(trainingSuggestionActions)
        .where(
          and(
            eq(trainingSuggestionActions.suggestionId, suggestion.suggestionId),
            eq(trainingSuggestionActions.action, "skipped"),
          ),
        ),
    ).toHaveLength(1);
  });

  it("does not record an action for another owner's dog", async () => {
    const owner = await setup({ focused: true });
    const other = await createTestUser();
    users.push(other);
    const suggestion = await loadSuggestion({
      userId: owner.user.userId,
      dogId: owner.dogId,
      weekKey: WEEK_KEY,
      timezoneOffsetMinutes: 0,
      now: NOW,
    });
    if (!suggestion.suggestionId) throw new Error("expected persisted suggestion");

    await expect(
      recordSuggestionAction({
        userId: other.userId,
        dogId: owner.dogId,
        suggestionId: suggestion.suggestionId,
        action: "started",
      }),
    ).resolves.toBe("not_found");
  });

  it("fails open when an audit insert fails after the safety decision", async () => {
    const user = await createTestUser();
    users.push(user);
    const dogId = randomUUID();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(
        loadSuggestion({
          userId: user.userId,
          dogId,
          weekKey: WEEK_KEY,
          timezoneOffsetMinutes: 0,
          now: NOW,
        }),
      ).resolves.toMatchObject({ type: "needs_focus_skill", suggestionId: null });
      expect(error).toHaveBeenCalledWith(
        "[suggestion] audit_write_failed",
        expect.objectContaining({ dogId, suggestionType: "needs_focus_skill" }),
      );
    } finally {
      error.mockRestore();
    }
  });
});
