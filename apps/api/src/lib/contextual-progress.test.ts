import type {
  ExactPracticeContext,
  PracticeDimension,
  SkillDimensionMetadata,
} from "@turingcare/shared";
import { CONTEXTUAL_PROGRESS_WINDOW_DAYS } from "@turingcare/shared";
import { describe, expect, it } from "vitest";
import { skillDimensionMetadata } from "../data/training-curriculum";
import {
  CONTEXTUAL_PROGRESS_POLICY_VERSION,
  type ContextualProgressRow,
  applyContextualSafety,
  deriveContextualProgress,
} from "./contextual-progress";

const NOW = new Date("2026-08-20T12:00:00.000Z");
const CURRICULUM_VERSION = "2026-08-11";
const defaultMetadata = skillDimensionMetadata["basic-manners.sit"];

if (!defaultMetadata) {
  throw new Error("Expected basic-manners.sit metadata in test setup");
}
const DEFAULT_METADATA: SkillDimensionMetadata = defaultMetadata;

const baseContext: ExactPracticeContext = {
  cueSupport: "hand_signal",
  environment: "home_busy",
  distance: "across_room",
  durationBand: "about_30_seconds",
  distraction: "mild",
};

function context(overrides: Partial<ExactPracticeContext> = {}): ExactPracticeContext {
  return { ...baseContext, ...overrides };
}

function row(
  id: string,
  occurredAt: string,
  overrides: Partial<ContextualProgressRow> = {},
): ContextualProgressRow {
  return {
    id,
    outcome: "went_well",
    occurredAt: new Date(occurredAt),
    practiceDay: occurredAt.slice(0, 10),
    curriculumLevel: 3,
    curriculumVersion: CURRICULUM_VERSION,
    ...baseContext,
    ...overrides,
  };
}

function derive(
  rows: ContextualProgressRow[],
  overrides: {
    curriculumLevel?: number;
    curriculumVersion?: string;
    catalogSkillKey?: string | null;
    metadata?: SkillDimensionMetadata | null;
  } = {},
) {
  return deriveContextualProgress({
    now: NOW,
    curriculumLevel: overrides.curriculumLevel ?? 3,
    curriculumVersion: overrides.curriculumVersion ?? CURRICULUM_VERSION,
    catalogSkillKey:
      overrides.catalogSkillKey === undefined ? "basic-manners.sit" : overrides.catalogSkillKey,
    metadata: overrides.metadata === undefined ? DEFAULT_METADATA : overrides.metadata,
    rows,
  });
}

function expectActionContextChangedOnce(
  source: ExactPracticeContext,
  target: ExactPracticeContext,
  changedDimension: PracticeDimension | null | undefined,
) {
  const changedFields = (
    ["cueSupport", "environment", "distance", "durationBand", "distraction"] as const
  ).filter((field) => source[field] !== target[field]);
  expect(changedFields).toHaveLength(1);
  expect(changedDimension).toBeDefined();
  expect(changedDimension).not.toBeNull();
}

describe("deriveContextualProgress", () => {
  it("includes the exact cutoff and excludes rows one millisecond before it or in the future", () => {
    const cutoff = new Date(NOW.getTime() - CONTEXTUAL_PROGRESS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const result = derive([
      row("cutoff", cutoff.toISOString(), { practiceDay: "2026-07-30" }),
      row("old", new Date(cutoff.getTime() - 1).toISOString(), { practiceDay: "2026-07-29" }),
      row("future", "2026-08-20T12:00:00.001Z", { practiceDay: "2026-08-20" }),
    ]);

    expect(result.exactContexts).toHaveLength(1);
    expect(result.exactContexts[0]?.lastObservedAt).toBe(cutoff.toISOString());
    expect(result.window).toEqual({
      startsAt: cutoff.toISOString(),
      endsAt: NOW.toISOString(),
      days: 21,
    });
  });

  it("marks two successes on one practice day as Developing", () => {
    const result = derive([
      row("first", "2026-08-19T08:00:00.000Z", { practiceDay: "2026-08-19" }),
      row("second", "2026-08-19T09:00:00.000Z", { practiceDay: "2026-08-19" }),
    ]);

    expect(result.strongestContext?.status).toBe("developing");
    expect(result.strongestContext?.successfulDistinctDays).toBe(1);
    expect(result.strongestContext?.latestOutcome).toBe("went_well");
  });

  it("marks successes on two distinct practice days as Reliable", () => {
    const result = derive([
      row("first", "2026-08-18T08:00:00.000Z", { practiceDay: "2026-08-18" }),
      row("second", "2026-08-19T08:00:00.000Z", { practiceDay: "2026-08-19" }),
    ]);

    expect(result.strongestContext?.status).toBe("reliable");
    expect(result.strongestContext?.successfulDistinctDays).toBe(2);
    expect(result.strongestContext?.lastSuccessfulAt).toBe("2026-08-19T08:00:00.000Z");
  });

  it("blocks Reliable status when the exact context has any too_hard result", () => {
    const result = derive([
      row("success-one", "2026-08-18T08:00:00.000Z", { practiceDay: "2026-08-18" }),
      row("success-two", "2026-08-19T08:00:00.000Z", { practiceDay: "2026-08-19" }),
      row("hard", "2026-08-20T08:00:00.000Z", { outcome: "too_hard", practiceDay: "2026-08-20" }),
    ]);

    expect(result.strongestContext?.status).toBe("developing");
    expect(result.strongestContext?.latestOutcome).toBe("too_hard");
    expect(result.strongestContext?.lastSuccessfulAt).toBe("2026-08-19T08:00:00.000Z");
  });

  it("keeps contexts that differ in one field in separate groups", () => {
    const result = derive([
      row("base", "2026-08-19T08:00:00.000Z"),
      row("different", "2026-08-19T09:00:00.000Z", {
        environment: "yard",
      }),
    ]);

    expect(result.exactContexts).toHaveLength(2);
    expect(result.exactContexts.map((evidence) => evidence.context.environment)).toEqual([
      "yard",
      "home_busy",
    ]);
  });

  it("ignores missing practice days, wrong curriculum identity, null outcomes, and all-null contexts", () => {
    const result = derive([
      row("missing-day", "2026-08-19T08:00:00.000Z", { practiceDay: null }),
      row("wrong-level", "2026-08-19T09:00:00.000Z", { curriculumLevel: 2 }),
      row("wrong-version", "2026-08-19T10:00:00.000Z", {
        curriculumVersion: "older",
      }),
      row("null-outcome", "2026-08-19T11:00:00.000Z", { outcome: null }),
      row("all-null-context", "2026-08-19T12:00:00.000Z", {
        cueSupport: null,
        environment: null,
        distance: null,
        durationBand: null,
        distraction: null,
      }),
    ]);

    expect(result.strongestContext).toBeNull();
    expect(result.nextPracticeAction).toBeNull();
    expect(result.exactContexts).toEqual([]);
  });

  it("uses descending ID order to break group row ties", () => {
    const result = derive([
      row("a", "2026-08-19T08:00:00.000Z", { outcome: "went_well" }),
      row("z", "2026-08-19T08:00:00.000Z", { outcome: "too_hard" }),
    ]);

    expect(result.strongestContext?.latestOutcome).toBe("too_hard");
    expect(result.strongestContext?.lastObservedAt).toBe("2026-08-19T08:00:00.000Z");
  });

  it("ranks Reliable before Developing even when Developing has more successful days", () => {
    const developing = context({ cueSupport: "food_lure" });
    const result = derive([
      row("developing-1", "2026-08-20T11:00:00.000Z", {
        cueSupport: developing.cueSupport,
        outcome: "too_hard",
        practiceDay: "2026-08-20",
      }),
      row("developing-2", "2026-08-18T11:00:00.000Z", {
        cueSupport: developing.cueSupport,
        practiceDay: "2026-08-18",
      }),
      row("developing-3", "2026-08-17T11:00:00.000Z", {
        cueSupport: developing.cueSupport,
        practiceDay: "2026-08-17",
      }),
      row("developing-4", "2026-08-16T11:00:00.000Z", {
        cueSupport: developing.cueSupport,
        practiceDay: "2026-08-16",
      }),
      row("reliable-1", "2026-08-10T11:00:00.000Z", { practiceDay: "2026-08-10" }),
      row("reliable-2", "2026-08-11T11:00:00.000Z", { practiceDay: "2026-08-11" }),
    ]);

    expect(result.strongestContext?.context.cueSupport).toBe("hand_signal");
    expect(result.strongestContext?.status).toBe("reliable");
  });

  it("ranks more successful distinct days before a more recent Reliable group", () => {
    const result = derive([
      row("many-1", "2026-08-01T11:00:00.000Z", {
        cueSupport: "hand_signal",
        practiceDay: "2026-08-01",
      }),
      row("many-2", "2026-08-02T11:00:00.000Z", {
        cueSupport: "hand_signal",
        practiceDay: "2026-08-02",
      }),
      row("many-3", "2026-08-03T11:00:00.000Z", {
        cueSupport: "hand_signal",
        practiceDay: "2026-08-03",
      }),
      row("recent-1", "2026-08-18T11:00:00.000Z", {
        cueSupport: "verbal_cue",
        practiceDay: "2026-08-18",
      }),
      row("recent-2", "2026-08-19T11:00:00.000Z", {
        cueSupport: "verbal_cue",
        practiceDay: "2026-08-19",
      }),
    ]);

    expect(result.strongestContext?.context.cueSupport).toBe("hand_signal");
    expect(result.strongestContext?.successfulDistinctDays).toBe(3);
  });

  it("ranks a more recent group when status and successful days tie", () => {
    const result = derive([
      row("old-1", "2026-08-10T11:00:00.000Z", {
        cueSupport: "hand_signal",
        practiceDay: "2026-08-10",
      }),
      row("old-2", "2026-08-11T11:00:00.000Z", {
        cueSupport: "hand_signal",
        practiceDay: "2026-08-11",
      }),
      row("recent-1", "2026-08-18T11:00:00.000Z", {
        cueSupport: "verbal_cue",
        practiceDay: "2026-08-18",
      }),
      row("recent-2", "2026-08-19T11:00:00.000Z", {
        cueSupport: "verbal_cue",
        practiceDay: "2026-08-19",
      }),
    ]);

    expect(result.strongestContext?.context.cueSupport).toBe("verbal_cue");
  });

  it("breaks equal ranking scores by the stable serialized context key", () => {
    const result = derive([
      row("z", "2026-08-19T08:00:00.000Z", { cueSupport: "verbal_cue" }),
      row("a", "2026-08-19T08:00:00.000Z", { cueSupport: "hand_signal" }),
    ]);

    expect(result.strongestContext?.context.cueSupport).toBe("hand_signal");
  });

  it("lets the globally latest too_hard choose an easier adjacent context", () => {
    const result = derive([
      row("reliable-1", "2026-08-17T08:00:00.000Z", {
        cueSupport: "verbal_cue",
        practiceDay: "2026-08-17",
      }),
      row("reliable-2", "2026-08-18T08:00:00.000Z", {
        cueSupport: "verbal_cue",
        practiceDay: "2026-08-18",
      }),
      row("latest-hard", "2026-08-20T11:00:00.000Z", {
        outcome: "too_hard",
        distraction: "mild",
      }),
    ]);

    expect(result.strongestContext?.context.cueSupport).toBe("verbal_cue");
    expect(result.nextPracticeAction).toEqual({
      ruleId: "ease_after_too_hard",
      direction: "easier",
      context: context({ distraction: "none" }),
      changedDimension: "distraction",
    });
    expectActionContextChangedOnce(
      context(),
      result.nextPracticeAction?.context ?? context(),
      result.nextPracticeAction?.changedDimension,
    );
  });

  it("uses the level-one baseEase metadata for too_hard", () => {
    const result = derive(
      [
        row("hard", "2026-08-20T11:00:00.000Z", {
          outcome: "too_hard",
          curriculumLevel: 1,
        }),
      ],
      { curriculumLevel: 1 },
    );

    expect(result.nextPracticeAction).toEqual({
      ruleId: "ease_after_too_hard",
      direction: "easier",
      context: context({ cueSupport: "food_lure" }),
      changedDimension: "cue_support",
    });
  });

  it("advances a Reliable context using the step into the next level", () => {
    const result = derive([
      row("first", "2026-08-18T08:00:00.000Z", { practiceDay: "2026-08-18" }),
      row("second", "2026-08-19T08:00:00.000Z", { practiceDay: "2026-08-19" }),
    ]);

    expect(result.nextPracticeAction).toEqual({
      ruleId: "advance_reliable_context",
      direction: "harder",
      context: context({ environment: "yard" }),
      changedDimension: "environment",
    });
  });

  it("does not re-recommend an observed failed harder context", () => {
    const retreat = context({ environment: "home_quiet" });
    const result = derive([
      row("harder-failed", "2026-08-16T11:00:00.000Z", {
        environment: "yard",
        outcome: "too_hard",
        practiceDay: "2026-08-16",
      }),
      row("retreat", "2026-08-19T11:00:00.000Z", {
        environment: retreat.environment,
        outcome: "mixed",
        practiceDay: "2026-08-19",
      }),
      row("base-success-one", "2026-08-17T08:00:00.000Z", { practiceDay: "2026-08-17" }),
      row("base-success-two", "2026-08-18T08:00:00.000Z", { practiceDay: "2026-08-18" }),
    ]);

    expect(result.strongestContext).toMatchObject({
      context: baseContext,
      status: "reliable",
    });
    expect(result.nextPracticeAction).toEqual({
      ruleId: "repeat_developing_context",
      direction: "repeat",
      context: retreat,
      changedDimension: null,
    });
    expect(result.nextPracticeAction?.context.environment).not.toBe("yard");
  });

  it("does not advance a Reliable context at level five", () => {
    const result = derive(
      [
        row("first", "2026-08-18T08:00:00.000Z", {
          curriculumLevel: 5,
          practiceDay: "2026-08-18",
        }),
        row("second", "2026-08-19T08:00:00.000Z", {
          curriculumLevel: 5,
          practiceDay: "2026-08-19",
        }),
      ],
      { curriculumLevel: 5 },
    );

    expect(result.strongestContext?.status).toBe("reliable");
    expect(result.nextPracticeAction).toBeNull();
  });

  it("repeats the strongest Developing context when a Reliable context is maxed at level five", () => {
    const developing = context({ cueSupport: "food_lure" });
    const result = derive(
      [
        row("reliable-first", "2026-08-18T08:00:00.000Z", {
          curriculumLevel: 5,
          practiceDay: "2026-08-18",
        }),
        row("reliable-second", "2026-08-19T08:00:00.000Z", {
          curriculumLevel: 5,
          practiceDay: "2026-08-19",
        }),
        row("developing", "2026-08-20T08:00:00.000Z", {
          curriculumLevel: 5,
          cueSupport: developing.cueSupport,
          outcome: "mixed",
        }),
      ],
      { curriculumLevel: 5 },
    );

    expect(result.strongestContext?.status).toBe("reliable");
    expect(result.nextPracticeAction).toEqual({
      ruleId: "repeat_developing_context",
      direction: "repeat",
      context: developing,
      changedDimension: null,
    });
  });

  it("repeats Developing when a Reliable context has no adjacent harder value", () => {
    const maxedReliable = context({ environment: "busy_outdoor" });
    const developing = context({ cueSupport: "food_lure" });
    const result = derive([
      row("reliable-first", "2026-08-18T08:00:00.000Z", {
        environment: maxedReliable.environment,
        practiceDay: "2026-08-18",
      }),
      row("reliable-second", "2026-08-19T08:00:00.000Z", {
        environment: maxedReliable.environment,
        practiceDay: "2026-08-19",
      }),
      row("developing", "2026-08-20T08:00:00.000Z", {
        cueSupport: developing.cueSupport,
        outcome: "mixed",
      }),
    ]);

    expect(result.strongestContext?.status).toBe("reliable");
    expect(result.nextPracticeAction).toEqual({
      ruleId: "repeat_developing_context",
      direction: "repeat",
      context: developing,
      changedDimension: null,
    });
  });

  it("repeats a Developing strongest context", () => {
    const result = derive([row("mixed", "2026-08-20T08:00:00.000Z", { outcome: "mixed" })]);

    expect(result.nextPracticeAction).toEqual({
      ruleId: "repeat_developing_context",
      direction: "repeat",
      context: baseContext,
      changedDimension: null,
    });
  });

  it("returns no action for missing metadata or ambiguous adjacency", () => {
    const missingMetadata = derive(
      [row("hard", "2026-08-20T11:00:00.000Z", { outcome: "too_hard" })],
      { metadata: null, catalogSkillKey: null },
    );
    expect(missingMetadata.nextPracticeAction).toBeNull();

    const ambiguousMetadata: SkillDimensionMetadata = {
      ...DEFAULT_METADATA,
      baseEase: {
        dimension: "cue_support",
        strategy: "shorten_duration",
      },
    };
    const ambiguousAdjacency = derive(
      [
        row("hard", "2026-08-20T11:00:00.000Z", {
          outcome: "too_hard",
          curriculumLevel: 1,
        }),
      ],
      { metadata: ambiguousMetadata, curriculumLevel: 1 },
    );
    expect(ambiguousAdjacency.nextPracticeAction).toBeNull();
  });

  it("lets custom Developing skills repeat even when metadata is present", () => {
    const developing = derive([row("mixed", "2026-08-20T08:00:00.000Z", { outcome: "mixed" })], {
      catalogSkillKey: null,
      metadata: DEFAULT_METADATA,
    });
    expect(developing.nextPracticeAction?.direction).toBe("repeat");
    expect(developing.nextPracticeAction).toEqual({
      ruleId: "repeat_developing_context",
      direction: "repeat",
      context: baseContext,
      changedDimension: null,
    });
  });

  it("does not synthesize harder adjacency or Not observed for a custom Reliable context", () => {
    const reliable = derive(
      [
        row("first", "2026-08-18T08:00:00.000Z", { practiceDay: "2026-08-18" }),
        row("second", "2026-08-19T08:00:00.000Z", { practiceDay: "2026-08-19" }),
      ],
      { catalogSkillKey: null, metadata: DEFAULT_METADATA },
    );
    expect(reliable.strongestContext?.status).toBe("reliable");
    expect(reliable.nextPracticeAction).toBeNull();
    expect(reliable.exactContexts).toHaveLength(1);
  });

  it("does not synthesize an easier action for a custom latest too_hard result", () => {
    const developing = context({ cueSupport: "food_lure" });
    const result = derive(
      [
        row("reliable-first", "2026-08-18T08:00:00.000Z", {
          practiceDay: "2026-08-18",
        }),
        row("reliable-second", "2026-08-19T08:00:00.000Z", {
          practiceDay: "2026-08-19",
        }),
        row("developing", "2026-08-20T08:00:00.000Z", {
          cueSupport: developing.cueSupport,
          outcome: "mixed",
        }),
        row("latest-hard", "2026-08-20T11:00:00.000Z", {
          cueSupport: "verbal_cue",
          outcome: "too_hard",
        }),
      ],
      { catalogSkillKey: null, metadata: DEFAULT_METADATA },
    );

    expect(result.strongestContext?.status).toBe("reliable");
    expect(result.nextPracticeAction).toEqual({
      ruleId: "repeat_developing_context",
      direction: "repeat",
      context: developing,
      changedDimension: null,
    });
    expect(result.exactContexts).toHaveLength(3);
  });

  it("never progresses after an un-easable latest too_hard, but repeats a no-harder Developing context", () => {
    const fallback = context({ cueSupport: "food_lure", distraction: "none" });
    const result = derive([
      row("reliable-first", "2026-08-17T08:00:00.000Z", {
        cueSupport: "verbal_cue",
        practiceDay: "2026-08-17",
      }),
      row("reliable-second", "2026-08-18T08:00:00.000Z", {
        cueSupport: "verbal_cue",
        practiceDay: "2026-08-18",
      }),
      row("fallback", "2026-08-19T08:00:00.000Z", {
        ...fallback,
        outcome: "mixed",
      }),
      row("latest-hard", "2026-08-20T11:00:00.000Z", {
        distraction: "none",
        outcome: "too_hard",
      }),
    ]);

    expect(result.strongestContext?.status).toBe("reliable");
    expect(result.nextPracticeAction).toEqual({
      ruleId: "repeat_developing_context",
      direction: "repeat",
      context: fallback,
      changedDimension: null,
    });
  });

  it("skips Terra's higher-ranked mild/busy fallback after an un-easable latest too_hard", () => {
    const failed = context({ environment: "home_quiet", distraction: "none" });
    const unsafe = context({
      cueSupport: "verbal_cue",
      environment: "busy_outdoor",
      distraction: "mild",
    });
    const safe = context({
      cueSupport: "food_lure",
      environment: "home_quiet",
      distraction: "none",
    });
    const result = derive([
      row("unsafe-success", "2026-08-19T10:00:00.000Z", {
        ...unsafe,
        practiceDay: "2026-08-19",
      }),
      row("unsafe-hard", "2026-08-19T11:00:00.000Z", {
        ...unsafe,
        outcome: "too_hard",
        practiceDay: "2026-08-19",
      }),
      row("safe-lower-ranked", "2026-08-18T10:00:00.000Z", {
        ...safe,
        outcome: "mixed",
      }),
      row("latest-hard", "2026-08-20T11:00:00.000Z", {
        ...failed,
        outcome: "too_hard",
      }),
    ]);

    expect(result.nextPracticeAction).toEqual({
      ruleId: "repeat_developing_context",
      direction: "repeat",
      context: safe,
      changedDimension: null,
    });
    expect(result.nextPracticeAction?.context).not.toEqual(unsafe);
  });

  it("preserves ranking among multiple no-harder Developing fallbacks", () => {
    const failed = context({ environment: "home_quiet", distraction: "none" });
    const highestRankedSafe = context({
      cueSupport: "food_lure",
      environment: "home_quiet",
      distraction: "none",
    });
    const lowerRankedSafe = context({
      environment: "home_quiet",
      durationBand: "about_15_seconds",
      distraction: "none",
    });
    const result = derive([
      row("highest-safe-success", "2026-08-19T10:00:00.000Z", {
        ...highestRankedSafe,
        practiceDay: "2026-08-19",
      }),
      row("lower-safe-mixed", "2026-08-18T10:00:00.000Z", {
        ...lowerRankedSafe,
        outcome: "mixed",
      }),
      row("latest-hard", "2026-08-20T11:00:00.000Z", {
        ...failed,
        outcome: "too_hard",
      }),
    ]);

    expect(result.nextPracticeAction).toEqual({
      ruleId: "repeat_developing_context",
      direction: "repeat",
      context: highestRankedSafe,
      changedDimension: null,
    });
  });

  it("returns no action when an un-easable latest too_hard has no no-harder Developing fallback", () => {
    const failed = context({ environment: "home_quiet", distraction: "none" });
    const unsafe = context({
      cueSupport: "verbal_cue",
      environment: "busy_outdoor",
      distraction: "mild",
    });
    const result = derive([
      row("unsafe-success", "2026-08-19T10:00:00.000Z", {
        ...unsafe,
        practiceDay: "2026-08-19",
      }),
      row("unsafe-hard", "2026-08-19T11:00:00.000Z", {
        ...unsafe,
        outcome: "too_hard",
        practiceDay: "2026-08-19",
      }),
      row("latest-hard", "2026-08-20T11:00:00.000Z", {
        ...failed,
        outcome: "too_hard",
      }),
    ]);

    expect(result.nextPracticeAction).toBeNull();
  });

  it("adds one Not observed evidence row for an unobserved easier action target", () => {
    const result = derive([row("hard", "2026-08-20T11:00:00.000Z", { outcome: "too_hard" })]);

    expect(result.exactContexts).toHaveLength(2);
    expect(result.exactContexts[1]).toEqual({
      context: context({ distraction: "none" }),
      status: "not_observed",
      successfulDistinctDays: 0,
      latestOutcome: null,
      lastObservedAt: null,
      lastSuccessfulAt: null,
    });
  });

  it("removes only action-derived Not observed evidence under active safety", () => {
    const result = derive([
      row("reliable-one", "2026-08-17T08:00:00.000Z", {
        cueSupport: "verbal_cue",
        practiceDay: "2026-08-17",
      }),
      row("reliable-two", "2026-08-18T08:00:00.000Z", {
        cueSupport: "verbal_cue",
        practiceDay: "2026-08-18",
      }),
      row("latest-hard", "2026-08-20T11:00:00.000Z", { outcome: "too_hard" }),
    ]);
    const safety = {
      suppressed: true as const,
      ruleId: "reported_injury_or_pain" as const,
      referral: "veterinarian" as const,
    };

    expect(result.exactContexts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "reliable" }),
        expect.objectContaining({ status: "developing" }),
        expect.objectContaining({ status: "not_observed" }),
      ]),
    );

    const suppressed = applyContextualSafety(result, safety);

    expect(suppressed.nextPracticeAction).toBeNull();
    expect(suppressed.safety).toEqual(safety);
    expect(suppressed.exactContexts).toHaveLength(2);
    expect(suppressed.exactContexts.map(({ status }) => status)).toEqual(
      expect.arrayContaining(["reliable", "developing"]),
    );
    expect(suppressed.exactContexts.some(({ status }) => status === "not_observed")).toBe(false);
  });

  it("does not add Not observed evidence when the action target exists or when repeating", () => {
    const observedTarget = derive([
      row("hard", "2026-08-20T11:00:00.000Z", { outcome: "too_hard" }),
      row("easier", "2026-08-19T11:00:00.000Z", { distraction: "none" }),
    ]);
    expect(observedTarget.exactContexts).toHaveLength(2);
    expect(
      observedTarget.exactContexts.every((evidence) => evidence.status !== "not_observed"),
    ).toBe(true);

    const repeat = derive([row("mixed", "2026-08-20T11:00:00.000Z", { outcome: "mixed" })]);
    expect(repeat.exactContexts).toHaveLength(1);
    expect(repeat.exactContexts[0]?.status).toBe("developing");
  });

  it("returns the full window and does not mutate rows or context values", () => {
    const rows = [
      row("first", "2026-08-18T08:00:00.000Z", { practiceDay: "2026-08-18" }),
      row("second", "2026-08-19T08:00:00.000Z", { practiceDay: "2026-08-19" }),
    ];
    const snapshot = rows.map((original) => ({
      ...original,
      occurredAt: new Date(original.occurredAt),
    }));
    const result = derive(rows);

    expect(rows).toEqual(snapshot);
    expect(result.policyVersion).toBe(CONTEXTUAL_PROGRESS_POLICY_VERSION);
    expect(result.curriculumLevel).toBe(3);
    expect(result.curriculumVersion).toBe(CURRICULUM_VERSION);
    expect(result.window.days).toBe(21);
  });
});
