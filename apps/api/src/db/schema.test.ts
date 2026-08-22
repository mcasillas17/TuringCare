import { readFileSync } from "node:fs";
import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  advancementProposals,
  advancementStatusEnum,
  briefs,
  dogSafetySignals,
  dogs,
  guidedSetups,
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

type SqlChunkSummary = { kind: "string"; value: string } | { kind: "column"; name: string };

function summarizeSql(sqlValue: unknown): SqlChunkSummary[] {
  if (
    !sqlValue ||
    typeof sqlValue !== "object" ||
    !("queryChunks" in sqlValue) ||
    !Array.isArray(sqlValue.queryChunks)
  ) {
    return [];
  }

  return sqlValue.queryChunks.map((chunk): SqlChunkSummary => {
    if (chunk && typeof chunk === "object") {
      if ("name" in chunk && typeof chunk.name === "string") {
        return { kind: "column", name: chunk.name };
      }

      if ("value" in chunk && Array.isArray(chunk.value)) {
        return {
          kind: "string",
          value: chunk.value.join(""),
        };
      }
    }

    return { kind: "string", value: String(chunk) };
  });
}

describe("training progress tables", () => {
  it("exports the expected table names", () => {
    expect(getTableName(trainingSkills)).toBe("training_skills");
    expect(getTableName(practiceSessions)).toBe("practice_sessions");
  });
});

describe("dogs schema", () => {
  it("indexes owner-scoped existence reads", () => {
    const index = getTableConfig(dogs).indexes.find(
      ({ config }) => config.name === "dogs_owner_idx",
    );

    expect(index).toBeDefined();
    expect(index?.config.columns.map((column) => ("name" in column ? column.name : null))).toEqual([
      "owner_id",
    ]);
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

describe("briefs schema", () => {
  it("declares one active share index per dog for non-private briefs", () => {
    const index = getTableConfig(briefs).indexes.find(
      ({ config }) => config.name === "briefs_one_active_share_per_dog_idx",
    );

    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns.map((column) => ("name" in column ? column.name : null))).toEqual([
      "dog_id",
    ]);
    expect(summarizeSql(index?.config.where)).toEqual([
      { kind: "string", value: "" },
      { kind: "column", name: "share_token" },
      { kind: "string", value: " IS NOT NULL" },
    ]);
  });

  it("keeps the committed brief share privacy cleanup migration", () => {
    const migrationSql = readFileSync(
      new URL("../../drizzle/0020_brief_share_privacy.sql", import.meta.url),
      "utf8",
    );
    const rowNumberIndex = migrationSql.indexOf("row_number() OVER");
    const partitionByDogIndex = migrationSql.indexOf('PARTITION BY "dog_id"', rowNumberIndex);
    const orderByRecencyIndex = migrationSql.indexOf(
      'ORDER BY "version" DESC, "generated_at" DESC, "id" DESC',
      partitionByDogIndex,
    );
    const updateBriefsIndex = migrationSql.indexOf('UPDATE "briefs"');
    const setShareTokenNullIndex = migrationSql.indexOf(
      'SET "share_token" = NULL',
      updateBriefsIndex,
    );
    const briefRankGuardIndex = migrationSql.indexOf(
      "AND ranked_briefs.brief_rank > 1",
      setShareTokenNullIndex,
    );
    const nonNullShareTokenGuardIndex = migrationSql.indexOf(
      'AND "briefs"."share_token" IS NOT NULL;',
      briefRankGuardIndex,
    );
    const statementBreakpointIndex = migrationSql.indexOf(
      "--> statement-breakpoint",
      nonNullShareTokenGuardIndex,
    );
    const createUniqueIndex = migrationSql.indexOf(
      'CREATE UNIQUE INDEX "briefs_one_active_share_per_dog_idx"',
      statementBreakpointIndex,
    );
    const partialUniqueIndexPredicateIndex = migrationSql.indexOf(
      'WHERE "briefs"."share_token" IS NOT NULL;',
      createUniqueIndex,
    );

    expect(rowNumberIndex).toBeGreaterThanOrEqual(0);
    expect(partitionByDogIndex).toBeGreaterThan(rowNumberIndex);
    expect(orderByRecencyIndex).toBeGreaterThan(partitionByDogIndex);
    expect(updateBriefsIndex).toBeGreaterThanOrEqual(0);
    expect(setShareTokenNullIndex).toBeGreaterThan(updateBriefsIndex);
    expect(briefRankGuardIndex).toBeGreaterThan(setShareTokenNullIndex);
    expect(nonNullShareTokenGuardIndex).toBeGreaterThan(briefRankGuardIndex);
    expect(statementBreakpointIndex).toBeGreaterThan(nonNullShareTokenGuardIndex);
    expect(createUniqueIndex).toBeGreaterThan(statementBreakpointIndex);
    expect(partialUniqueIndexPredicateIndex).toBeGreaterThan(createUniqueIndex);
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

  it("declares a unique partial index for open proposals", () => {
    const index = getTableConfig(advancementProposals).indexes.find(
      ({ config }) => config.name === "advancement_proposals_open_skill_idx",
    );

    expect(index?.config.unique).toBe(true);
    expect(index?.config.where).toBeDefined();
  });
});

describe("guided setup schema", () => {
  it("declares the guided setup guardrails with exact names and predicates", () => {
    const config = getTableConfig(guidedSetups);
    const index = config.indexes.find(
      ({ config }) => config.name === "guided_setups_one_active_owner",
    );
    const dogUnique = config.uniqueConstraints.find(
      ({ name }) => name === "guided_setups_dog_unique",
    );

    expect(index?.config.unique).toBe(true);
    expect(summarizeSql(index?.config.where)).toEqual([
      { kind: "string", value: "" },
      { kind: "column", name: "completed_at" },
      { kind: "string", value: " IS NULL" },
    ]);
    expect(dogUnique).toBeDefined();
    expect(
      Object.fromEntries(config.checks.map(({ name, value }) => [name, summarizeSql(value)])),
    ).toEqual({
      guided_setups_completion_consistent: [
        { kind: "string", value: "(" },
        { kind: "column", name: "completed_at" },
        { kind: "string", value: " IS NULL AND " },
        { kind: "column", name: "completion_reason" },
        { kind: "string", value: " IS NULL) OR (" },
        { kind: "column", name: "completed_at" },
        { kind: "string", value: " IS NOT NULL AND " },
        { kind: "column", name: "completion_reason" },
        { kind: "string", value: " IS NOT NULL)" },
      ],
      guided_setups_active_dog_required: [
        { kind: "string", value: "" },
        { kind: "column", name: "completed_at" },
        { kind: "string", value: " IS NOT NULL OR " },
        { kind: "column", name: "dog_id" },
        { kind: "string", value: " IS NOT NULL" },
      ],
      guided_setups_step_intent_consistent: [
        { kind: "string", value: "(" },
        { kind: "column", name: "current_step" },
        { kind: "string", value: " = 'intent' AND " },
        { kind: "column", name: "intent" },
        { kind: "string", value: " IS NULL) OR (" },
        { kind: "column", name: "current_step" },
        { kind: "string", value: " = 'action' AND " },
        { kind: "column", name: "intent" },
        { kind: "string", value: " IS NOT NULL)" },
      ],
      guided_setups_action_matches_intent: [
        { kind: "string", value: "" },
        { kind: "column", name: "first_action_type" },
        { kind: "string", value: " IS NULL OR (" },
        { kind: "column", name: "intent" },
        { kind: "string", value: " = 'understand_behavior' AND " },
        { kind: "column", name: "first_action_type" },
        { kind: "string", value: " = 'behavior') OR (" },
        { kind: "column", name: "intent" },
        { kind: "string", value: " = 'train_skill' AND " },
        { kind: "column", name: "first_action_type" },
        { kind: "string", value: " = 'training') OR (" },
        { kind: "column", name: "intent" },
        { kind: "string", value: " = 'track_progress' AND " },
        { kind: "column", name: "first_action_type" },
        { kind: "string", value: " = 'progress')" },
      ],
      guided_setups_action_completion_consistent: [
        { kind: "string", value: "(" },
        { kind: "column", name: "completed_at" },
        { kind: "string", value: " IS NULL AND " },
        { kind: "column", name: "first_action_type" },
        { kind: "string", value: " IS NULL AND " },
        { kind: "column", name: "first_action_id" },
        { kind: "string", value: " IS NULL) OR (" },
        { kind: "column", name: "completed_at" },
        { kind: "string", value: " IS NOT NULL AND " },
        { kind: "column", name: "completion_reason" },
        { kind: "string", value: " = 'first_action_completed' AND " },
        { kind: "column", name: "current_step" },
        { kind: "string", value: " = 'action' AND " },
        { kind: "column", name: "intent" },
        { kind: "string", value: " IS NOT NULL AND " },
        { kind: "column", name: "first_action_type" },
        { kind: "string", value: " IS NOT NULL AND " },
        { kind: "column", name: "first_action_id" },
        { kind: "string", value: " IS NOT NULL) OR (" },
        { kind: "column", name: "completed_at" },
        { kind: "string", value: " IS NOT NULL AND " },
        { kind: "column", name: "completion_reason" },
        { kind: "string", value: " = 'skipped' AND " },
        { kind: "column", name: "current_step" },
        { kind: "string", value: " = 'action' AND " },
        { kind: "column", name: "intent" },
        { kind: "string", value: " IS NOT NULL AND " },
        { kind: "column", name: "first_action_type" },
        { kind: "string", value: " IS NULL AND " },
        { kind: "column", name: "first_action_id" },
        { kind: "string", value: " IS NULL) OR (" },
        { kind: "column", name: "completed_at" },
        { kind: "string", value: " IS NOT NULL AND " },
        { kind: "column", name: "completion_reason" },
        { kind: "string", value: " = 'abandoned' AND " },
        { kind: "column", name: "first_action_type" },
        { kind: "string", value: " IS NULL AND " },
        { kind: "column", name: "first_action_id" },
        { kind: "string", value: " IS NULL)" },
      ],
    });
  });

  it("keeps the committed guided setup migration custom protections", () => {
    const migrationSql = readFileSync(
      new URL("../../drizzle/0018_guided_setup.sql", import.meta.url),
      "utf8",
    );

    expect(migrationSql).toMatch(/CREATE FUNCTION "enforce_guided_setup_dog_owner"\(\)/);
    expect(migrationSql).toMatch(/CREATE TRIGGER "guided_setups_dog_owner_match_guard"/);
    expect(migrationSql).toMatch(/ALTER TABLE "guided_setups" ENABLE ROW LEVEL SECURITY;/);
    expect(migrationSql).toMatch(/ARRAY\['anon', 'authenticated'\]/);
    expect(migrationSql).toMatch(/ARRAY\['guided_setups'\]/);
    expect(migrationSql).toMatch(/REVOKE ALL ON TABLE public\.%I FROM %I/);
  });
});
