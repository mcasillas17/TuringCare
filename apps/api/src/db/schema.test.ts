import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  advancementProposals,
  advancementStatusEnum,
  dogSafetySignals,
  journalEntries,
  journalEntryKindEnum,
  journalTrendEnum,
  practiceCueSupportEnum,
  practiceDimensionEnum,
  practiceDistanceEnum,
  practiceDistractionEnum,
  practiceDurationBandEnum,
  practiceEnvironmentEnum,
  practiceOutcomeEnum,
  practiceSessions,
  practiceVariantEnum,
  safetySignalSourceEnum,
  safetySignalTypeEnum,
  suggestionActionEnum,
  suggestionEvidenceCategoryEnum,
  suggestionTypeEnum,
  trainingSkills,
  trainingSuggestionActions,
  trainingSuggestions,
} from "./schema";

describe("training progress tables", () => {
  it("exports the expected table names", () => {
    expect(getTableName(trainingSkills)).toBe("training_skills");
    expect(getTableName(practiceSessions)).toBe("practice_sessions");
  });
});

describe("journal schema", () => {
  it("exports journal entry kinds and trends", () => {
    expect(getTableName(journalEntries)).toBe("journal_entries");
    expect(journalEntryKindEnum.enumValues).toEqual(["moment", "daily_checkin"]);
    expect(journalTrendEnum.enumValues).toEqual(["better", "same", "harder"]);
  });

  it("indexes recent daily-checkin lookups in descending recency order", () => {
    const index = getTableConfig(journalEntries).indexes.find(
      ({ config }) => config.name === "journal_entries_dog_kind_occurred_idx",
    );

    expect(index).toBeDefined();
    expect(index?.config.columns.map((column) => ("name" in column ? column.name : null))).toEqual([
      "dog_id",
      "kind",
      "occurred_at",
      "id",
    ]);
  });
});

describe("structured practice evidence schema", () => {
  it("exports the expected evidence vocabularies and safety table", () => {
    expect(practiceOutcomeEnum.enumValues).toEqual(["went_well", "mixed", "too_hard"]);
    expect(practiceCueSupportEnum.enumValues).toEqual([
      "food_lure",
      "hand_signal",
      "verbal_cue",
      "no_extra_help",
    ]);
    expect(practiceEnvironmentEnum.enumValues).toEqual([
      "home_quiet",
      "home_busy",
      "yard",
      "quiet_outdoor",
      "busy_outdoor",
    ]);
    expect(practiceDistanceEnum.enumValues).toEqual([
      "at_side",
      "few_steps",
      "across_room",
      "across_yard",
      "far_away",
    ]);
    expect(practiceDurationBandEnum.enumValues).toEqual([
      "under_5_seconds",
      "about_15_seconds",
      "about_30_seconds",
      "one_to_two_minutes",
      "five_to_fifteen_minutes",
      "about_30_minutes",
      "one_to_two_hours",
      "half_day_or_more",
    ]);
    expect(practiceVariantEnum.enumValues).toEqual(["primary", "fallback"]);
    expect(practiceDistractionEnum.enumValues).toEqual(["none", "mild", "moderate", "strong"]);
    expect(practiceDimensionEnum.enumValues).toEqual([
      "cue_support",
      "environment",
      "distance",
      "duration",
      "distraction",
    ]);
    expect(safetySignalTypeEnum.enumValues).toEqual([
      "aggression_or_bite_risk",
      "injury_or_pain",
      "severe_fear_or_panic",
      "severe_behavior_concern",
    ]);
    expect(safetySignalSourceEnum.enumValues).toEqual(["practice_session", "behavior_concern"]);
    expect(getTableName(dogSafetySignals)).toBe("dog_safety_signals");
  });
});

describe("suggestion and advancement audit schema", () => {
  it("exports the expected audit table names and controlled vocabularies", () => {
    expect(getTableName(trainingSuggestions)).toBe("training_suggestions");
    expect(getTableName(trainingSuggestionActions)).toBe("training_suggestion_actions");
    expect(getTableName(advancementProposals)).toBe("advancement_proposals");
    expect(suggestionTypeEnum.enumValues).toEqual([
      "exercise",
      "safety_suppressed",
      "needs_focus_skill",
      "custom_skill_unsupported",
    ]);
    expect(suggestionEvidenceCategoryEnum.enumValues).toEqual([
      "curriculum_only",
      "recent_practice",
      "recent_observation",
    ]);
    expect(suggestionActionEnum.enumValues).toEqual([
      "started",
      "skipped",
      "rated_useful",
      "rated_not_useful",
    ]);
    expect(advancementStatusEnum.enumValues).toEqual([
      "proposed",
      "confirmed",
      "stayed",
      "rejected",
      "regressed",
      "insufficient_evidence",
      "withdrawn",
    ]);
  });
});
