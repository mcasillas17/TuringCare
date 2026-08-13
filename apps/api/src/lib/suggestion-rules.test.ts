import { describe, expect, it } from "vitest";
import { EVIDENCE_WINDOW_DAYS } from "./practice-evidence";
import { type RuleInputs, selectSuggestionRule } from "./suggestion-rules";

const NOW = new Date("2026-08-13T12:00:00.000Z");

const base: RuleInputs = {
  now: NOW,
  hasFocusSkill: true,
  catalogSkillKey: "basic-manners.sit",
  level: 3,
  recentOutcomes: [],
  latestMixedHadChallengingContext: false,
  lastWentWellAt: null,
  observation: null,
};

describe("selectSuggestionRule", () => {
  it("asks for a focus skill first", () => {
    expect(selectSuggestionRule({ ...base, hasFocusSkill: false })).toEqual({
      ruleId: "needs_focus_skill",
      type: "needs_focus_skill",
      effectiveLevel: null,
      evidenceCategory: null,
    });
  });

  it("marks a custom skill as unsupported", () => {
    expect(selectSuggestionRule({ ...base, catalogSkillKey: null })).toEqual({
      ruleId: "custom_skill_unsupported",
      type: "custom_skill_unsupported",
      effectiveLevel: null,
      evidenceCategory: null,
    });
  });

  it("works at cold start from the curriculum level alone", () => {
    expect(selectSuggestionRule(base)).toEqual({
      ruleId: "cold_start_curriculum_level",
      type: "exercise",
      effectiveLevel: 3,
      evidenceCategory: "curriculum_only",
    });
  });

  it("steps back after two of the last three outcomes were too hard", () => {
    const result = selectSuggestionRule({
      ...base,
      recentOutcomes: ["too_hard", "went_well", "too_hard", "went_well"],
    });
    expect(result.ruleId).toBe("step_back_after_too_hard");
    expect(result.effectiveLevel).toBe(2);
    expect(result.evidenceCategory).toBe("recent_practice");
  });

  it("never steps below level 1", () => {
    expect(
      selectSuggestionRule({ ...base, level: 1, recentOutcomes: ["too_hard", "too_hard"] })
        .effectiveLevel,
    ).toBe(1);
  });

  it("eases after a harder check-in with no success since", () => {
    const result = selectSuggestionRule({
      ...base,
      recentOutcomes: ["mixed"],
      lastWentWellAt: new Date("2026-08-01T12:00:00.000Z"),
      observation: { trend: "harder", occurredAt: new Date("2026-08-12T12:00:00.000Z") },
    });
    expect(result.ruleId).toBe("ease_after_harder_checkin");
    expect(result.effectiveLevel).toBe(2);
    expect(result.evidenceCategory).toBe("recent_observation");
  });

  it("ignores a harder check-in once practice has gone well since", () => {
    const result = selectSuggestionRule({
      ...base,
      recentOutcomes: ["went_well"],
      lastWentWellAt: new Date("2026-08-13T09:00:00.000Z"),
      observation: { trend: "harder", occurredAt: new Date("2026-08-12T12:00:00.000Z") },
    });
    expect(result.ruleId).toBe("maintain_current_level");
    expect(result.effectiveLevel).toBe(3);
  });

  it("eases one level after mixed practice in a challenging context", () => {
    const result = selectSuggestionRule({
      ...base,
      recentOutcomes: ["mixed"],
      latestMixedHadChallengingContext: true,
    });
    expect(result.ruleId).toBe("ease_after_hard_context");
    expect(result.effectiveLevel).toBe(2);
    expect(result.evidenceCategory).toBe("recent_practice");
  });

  it("holds the level after two of the last three were mixed", () => {
    const result = selectSuggestionRule({
      ...base,
      recentOutcomes: ["mixed", "went_well", "mixed"],
    });
    expect(result.ruleId).toBe("hold_after_mixed");
    expect(result.effectiveLevel).toBe(3);
  });

  it("maintains the level when practice is going well", () => {
    const result = selectSuggestionRule({
      ...base,
      recentOutcomes: ["went_well", "went_well", "went_well"],
    });
    expect(result.ruleId).toBe("maintain_current_level");
    expect(result.effectiveLevel).toBe(3);
  });

  it("is deterministic for identical inputs", () => {
    const inputs = { ...base, recentOutcomes: ["mixed", "too_hard", "too_hard"] } as RuleInputs;
    expect(selectSuggestionRule(inputs)).toEqual(selectSuggestionRule(inputs));
  });

  it("exposes the evidence window used by the loader", () => {
    expect(EVIDENCE_WINDOW_DAYS).toBe(21);
  });
});
