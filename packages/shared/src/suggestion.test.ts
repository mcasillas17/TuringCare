import { describe, expect, it } from "vitest";
import {
  advancementDecisionSchema,
  advancementStatusValues,
  evidenceCategoryValues,
  referralCategoryValues,
  safetyRuleValues,
  suggestionActionSchema,
  suggestionActionValues,
  suggestionQuerySchema,
  suggestionRuleValues,
  suggestionTypeValues,
} from "./suggestion";

describe("suggestion vocabularies", () => {
  it("keeps stable identifiers for audit records", () => {
    expect(suggestionTypeValues).toEqual([
      "exercise",
      "safety_suppressed",
      "needs_focus_skill",
      "custom_skill_unsupported",
    ]);
    expect(suggestionRuleValues).toEqual([
      "needs_focus_skill",
      "custom_skill_unsupported",
      "cold_start_curriculum_level",
      "step_back_after_too_hard",
      "ease_after_harder_checkin",
      "ease_after_hard_context",
      "hold_after_mixed",
      "maintain_current_level",
    ]);
    expect(evidenceCategoryValues).toEqual([
      "curriculum_only",
      "recent_practice",
      "recent_observation",
    ]);
    expect(safetyRuleValues).toEqual([
      "reported_injury_or_pain",
      "reported_aggression_or_bite_risk",
      "reported_severe_fear",
      "severe_recorded_concern",
      "sustained_worsening_intensity",
    ]);
    expect(referralCategoryValues).toEqual([
      "veterinarian",
      "veterinary_behaviorist",
      "credentialed_trainer",
    ]);
    expect(suggestionActionValues).toEqual([
      "started",
      "skipped",
      "rated_useful",
      "rated_not_useful",
    ]);
    expect(advancementStatusValues).toEqual([
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

describe("suggestion request schemas", () => {
  it("suggestionQuerySchema requires a Monday week key and timezone offset", () => {
    expect(
      suggestionQuerySchema.parse({
        weekKey: "2026-08-10",
        timezoneOffsetMinutes: "420",
      }).timezoneOffsetMinutes,
    ).toBe(420);
    expect(suggestionQuerySchema.safeParse({ weekKey: "2026-08-11" }).success).toBe(false);
  });

  it("suggestionActionSchema accepts owner actions only", () => {
    expect(suggestionActionSchema.parse({ action: "started" }).action).toBe("started");
    expect(suggestionActionSchema.safeParse({ action: "shown" }).success).toBe(false);
  });

  it("advancementDecisionSchema accepts the five owner decisions and rejects system statuses", () => {
    for (const decision of [
      "confirmed",
      "stayed",
      "rejected",
      "regressed",
      "insufficient_evidence",
    ]) {
      expect(advancementDecisionSchema.parse({ decision }).decision).toBe(decision);
    }
    expect(advancementDecisionSchema.safeParse({ decision: "proposed" }).success).toBe(false);
    expect(advancementDecisionSchema.safeParse({ decision: "withdrawn" }).success).toBe(false);
  });
});
