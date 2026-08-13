import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { type SafetyInputs, decideSafety, evaluateSafetyWithLock } from "./safety-policy";

const NOW = new Date("2026-08-13T12:00:00.000Z");

const empty: SafetyInputs = {
  now: NOW,
  signals: [],
  highIntensityEntryCount: 0,
  harderCheckinCount: 0,
};

describe("decideSafety", () => {
  it("returns null when nothing structured indicates risk", () => {
    expect(decideSafety(empty)).toBeNull();
  });

  it("refers injury or pain to a veterinarian first", () => {
    const decision = decideSafety({
      ...empty,
      signals: [
        { type: "injury_or_pain", reportedAt: new Date("2026-08-12T09:00:00.000Z") },
        { type: "aggression_or_bite_risk", reportedAt: new Date("2026-08-12T09:00:00.000Z") },
      ],
    });
    expect(decision).toEqual({
      suppressed: true,
      ruleId: "reported_injury_or_pain",
      referral: "veterinarian",
    });
  });

  it("refers aggression or bite risk to a veterinary behaviorist", () => {
    expect(
      decideSafety({
        ...empty,
        signals: [
          { type: "aggression_or_bite_risk", reportedAt: new Date("2026-07-01T09:00:00.000Z") },
        ],
      })?.referral,
    ).toBe("veterinary_behaviorist");
  });

  it("refers severe fear or panic to a veterinary behaviorist", () => {
    expect(
      decideSafety({
        ...empty,
        signals: [
          { type: "severe_fear_or_panic", reportedAt: new Date("2026-08-10T09:00:00.000Z") },
        ],
      })?.ruleId,
    ).toBe("reported_severe_fear");
  });

  it("ignores signals older than the 90-day window", () => {
    expect(
      decideSafety({
        ...empty,
        signals: [{ type: "injury_or_pain", reportedAt: new Date("2026-01-01T09:00:00.000Z") }],
      }),
    ).toBeNull();
  });

  it("includes injury reports at exactly 90 days and expires them immediately after", () => {
    const atBoundary = new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000);
    expect(
      decideSafety({
        ...empty,
        signals: [{ type: "injury_or_pain", reportedAt: atBoundary }],
      }),
    ).not.toBeNull();
    expect(
      decideSafety({
        ...empty,
        signals: [
          {
            type: "injury_or_pain",
            reportedAt: new Date(atBoundary.getTime() - 1),
          },
        ],
      }),
    ).toBeNull();
  });

  it("keeps a deleted severe concern active through its persisted safety rule", () => {
    expect(
      decideSafety({
        ...empty,
        signals: [{ type: "severe_behavior_concern", reportedAt: NOW }],
      })?.ruleId,
    ).toBe("severe_recorded_concern");
  });

  it("does not age out a persisted severe concern", () => {
    expect(
      decideSafety({
        ...empty,
        signals: [
          { type: "severe_behavior_concern", reportedAt: new Date("2025-01-01T09:00:00.000Z") },
        ],
      })?.ruleId,
    ).toBe("severe_recorded_concern");
  });

  it("does not age out aggression or severe-fear reports", () => {
    for (const type of ["aggression_or_bite_risk", "severe_fear_or_panic"] as const) {
      expect(
        decideSafety({
          ...empty,
          signals: [{ type, reportedAt: new Date("2025-01-01T09:00:00.000Z") }],
        }),
      ).not.toBeNull();
    }
  });

  it("suppresses on sustained worsening and refers to a credentialed trainer", () => {
    expect(decideSafety({ ...empty, highIntensityEntryCount: 2, harderCheckinCount: 2 })).toEqual({
      suppressed: true,
      ruleId: "sustained_worsening_intensity",
      referral: "credentialed_trainer",
    });
  });

  describe("evaluateSafetyWithLock", () => {
    it("runs the guarded callback with an empty decision and propagates its value", async () => {
      const result = await evaluateSafetyWithLock(
        crypto.randomUUID(),
        NOW,
        async (decision, tx) => {
          expect(decision).toBeNull();
          await tx.execute(sql`select 1`);
          return "guarded-write-complete";
        },
      );

      expect(result).toBe("guarded-write-complete");
    });
  });

  it("does not suppress on partial worsening evidence", () => {
    expect(
      decideSafety({ ...empty, highIntensityEntryCount: 2, harderCheckinCount: 1 }),
    ).toBeNull();
    expect(
      decideSafety({ ...empty, highIntensityEntryCount: 1, harderCheckinCount: 3 }),
    ).toBeNull();
  });
});
