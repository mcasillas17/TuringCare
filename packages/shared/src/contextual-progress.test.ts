import { describe, expect, it } from "vitest";
import {
  CONTEXTUAL_PROGRESS_WINDOW_DAYS,
  contextualProgressEventSchema,
  contextualProgressSchema,
  contextualProgressSurfaceValues,
  contextualStatusValues,
  exactContextEvidenceSchema,
  nextPracticeActionSchema,
  nextPracticeDirectionValues,
  nextPracticeRuleValues,
} from "./contextual-progress";

const fixture = {
  window: {
    startsAt: "2026-07-30T12:00:00.000Z",
    endsAt: "2026-08-20T12:00:00.000Z",
    days: CONTEXTUAL_PROGRESS_WINDOW_DAYS,
  },
  curriculumLevel: 2,
  curriculumVersion: "2026-08-11",
  policyVersion: "2026-08-20",
  strongestContext: null,
  nextPracticeAction: null,
  safety: null,
  exactContexts: [],
};

const exactContextEvidence = {
  context: {
    cueSupport: "verbal_cue",
    environment: "home_quiet",
    distance: "at_side",
    durationBand: "about_30_seconds",
    distraction: null,
  },
  status: "reliable",
  successfulDistinctDays: 2,
  latestOutcome: "went_well",
  lastObservedAt: "2026-08-20T11:00:00.000Z",
  lastSuccessfulAt: "2026-08-20T11:00:00.000Z",
};

describe("contextual progress vocabularies", () => {
  it("keeps controlled contextual values stable", () => {
    expect(contextualStatusValues).toEqual(["reliable", "developing", "not_observed"]);
    expect(nextPracticeDirectionValues).toEqual(["easier", "harder", "repeat"]);
    expect(contextualProgressSurfaceValues).toEqual(["week", "skill_detail"]);
    expect(nextPracticeRuleValues).toEqual([
      "ease_after_too_hard",
      "advance_reliable_context",
      "repeat_developing_context",
    ]);
  });
});

describe("contextualProgressSchema", () => {
  it("accepts the neutral empty response", () => {
    expect(contextualProgressSchema.parse(fixture)).toEqual(fixture);
  });

  it("accepts exact-context evidence with nullable context fields", () => {
    expect(exactContextEvidenceSchema.parse(exactContextEvidence)).toEqual(exactContextEvidence);
  });

  it("distinguishes safety suppression from a genuine empty response", () => {
    const safety = {
      suppressed: true as const,
      ruleId: "reported_aggression_or_bite_risk" as const,
      referral: "veterinary_behaviorist" as const,
    };
    expect(
      contextualProgressSchema.parse({
        ...fixture,
        safety,
      }),
    ).toMatchObject({ safety });
  });

  it("rejects an unknown contextual status", () => {
    expect(
      contextualProgressSchema.safeParse({
        ...fixture,
        strongestContext: {
          ...exactContextEvidence,
          status: "mastered",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects Not observed as the summary strongest context", () => {
    expect(
      contextualProgressSchema.safeParse({
        ...fixture,
        strongestContext: {
          ...exactContextEvidence,
          status: "not_observed",
        },
      }).success,
    ).toBe(false);

    expect(
      contextualProgressSchema.safeParse({
        ...fixture,
        exactContexts: [{ ...exactContextEvidence, status: "not_observed" }],
      }).success,
    ).toBe(true);
  });

  it("accepts a complete next-practice action", () => {
    expect(
      nextPracticeActionSchema.parse({
        ruleId: "advance_reliable_context",
        direction: "harder",
        context: exactContextEvidence.context,
        changedDimension: "duration",
      }),
    ).toEqual({
      ruleId: "advance_reliable_context",
      direction: "harder",
      context: exactContextEvidence.context,
      changedDimension: "duration",
    });
  });
});

describe("contextualProgressEventSchema", () => {
  it("accepts both telemetry union variants", () => {
    expect(
      contextualProgressEventSchema.parse({
        name: "training.context_insight_viewed",
        surface: "week",
        strongestStatus: "developing",
        hasNextAction: true,
      }),
    ).toEqual({
      name: "training.context_insight_viewed",
      surface: "week",
      strongestStatus: "developing",
      hasNextAction: true,
    });

    expect(
      contextualProgressEventSchema.parse({
        name: "training.context_next_action_used",
        surface: "skill_detail",
        ruleId: "repeat_developing_context",
        direction: "repeat",
      }),
    ).toEqual({
      name: "training.context_next_action_used",
      surface: "skill_detail",
      ruleId: "repeat_developing_context",
      direction: "repeat",
    });
  });

  it("rejects malformed or unknown telemetry values", () => {
    expect(
      contextualProgressEventSchema.safeParse({
        name: "training.context_insight_viewed",
        surface: "overview",
        strongestStatus: "developing",
        hasNextAction: true,
      }).success,
    ).toBe(false);
    expect(
      contextualProgressEventSchema.safeParse({
        name: "training.context_next_action_used",
        surface: "skill_detail",
        ruleId: "not_real",
        direction: "left",
      }).success,
    ).toBe(false);
  });

  it("rejects Not observed as an insight-view strongest status", () => {
    expect(
      contextualProgressEventSchema.safeParse({
        name: "training.context_insight_viewed",
        surface: "week",
        strongestStatus: "not_observed",
        hasNextAction: false,
      }).success,
    ).toBe(false);
  });
});
