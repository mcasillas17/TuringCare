import { describe, expect, it } from "vitest";
import {
  DIMENSION_CONFIG,
  EASING_STRATEGY_KEYS,
  OUTCOME_KEYS,
  REFERRAL_DIRECTORIES,
  REFERRAL_KEYS,
  RULE_REASON_KEYS,
  SAFETY_BODY_KEYS,
  SAFETY_SIGNAL_KEYS,
} from "./practice-options";

describe("practice option maps", () => {
  it("covers every launch contract value", () => {
    expect(Object.keys(OUTCOME_KEYS)).toHaveLength(3);
    expect(Object.keys(EASING_STRATEGY_KEYS)).toHaveLength(6);
    expect(Object.keys(DIMENSION_CONFIG)).toHaveLength(5);
    expect(Object.keys(SAFETY_SIGNAL_KEYS)).toHaveLength(3);
    expect(Object.keys(RULE_REASON_KEYS)).toHaveLength(8);
    expect(Object.keys(SAFETY_BODY_KEYS)).toHaveLength(5);
    expect(Object.keys(REFERRAL_KEYS)).toHaveLength(3);
  });

  it("uses secure referral-directory links", () => {
    expect(REFERRAL_DIRECTORIES).toHaveLength(4);
    for (const directory of REFERRAL_DIRECTORIES) {
      expect(directory.href).toMatch(/^https:\/\//);
      expect(directory.referrals.length).toBeGreaterThan(0);
    }
  });
});
