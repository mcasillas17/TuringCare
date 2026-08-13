import { describe, expect, it } from "vitest";
import {
  ADVANCEMENT_MIN_DAYS,
  ADVANCEMENT_MIN_SESSIONS,
  type AdvancementInputs,
  evaluateAdvancement,
} from "./advancement";

const day = (iso: string) => new Date(iso);

const base: AdvancementInputs = {
  ruleId: "maintain_current_level",
  level: 3,
  outcomes: [],
};

describe("evaluateAdvancement", () => {
  it("requires three consecutive good sessions across two days", () => {
    expect(ADVANCEMENT_MIN_SESSIONS).toBe(3);
    expect(ADVANCEMENT_MIN_DAYS).toBe(2);

    expect(
      evaluateAdvancement({
        ...base,
        outcomes: [
          { id: "newest", outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
          { id: "middle", outcome: "went_well", occurredAt: day("2026-08-12T09:00:00.000Z") },
          { id: "oldest", outcome: "went_well", occurredAt: day("2026-08-11T09:00:00.000Z") },
        ],
      }),
    ).toEqual({
      fromLevel: 3,
      toLevel: 4,
      sessionCount: 3,
      dayCount: 3,
      lastSessionAt: day("2026-08-13T09:00:00.000Z"),
      lastSessionId: "newest",
    });
  });

  it("uses practice days or UTC dates to count distinct days", () => {
    const result = evaluateAdvancement({
      ...base,
      outcomes: [
        {
          outcome: "went_well",
          occurredAt: day("2026-08-13T01:00:00.000Z"),
          practiceDay: "2026-08-12",
        },
        {
          outcome: "went_well",
          occurredAt: day("2026-08-13T02:00:00.000Z"),
          practiceDay: "2026-08-13",
        },
        { outcome: "went_well", occurredAt: day("2026-08-11T23:00:00.000Z") },
      ],
    });

    expect(result?.dayCount).toBe(3);
  });

  it("does not propose when the good sessions all happened on one day", () => {
    expect(
      evaluateAdvancement({
        ...base,
        outcomes: [
          { outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-13T12:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-13T18:00:00.000Z") },
        ],
      }),
    ).toBeNull();
  });

  it("does not propose when a newest session was not a success", () => {
    expect(
      evaluateAdvancement({
        ...base,
        outcomes: [
          { outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
          { outcome: "mixed", occurredAt: day("2026-08-12T09:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-11T09:00:00.000Z") },
        ],
      }),
    ).toBeNull();
  });

  it("does not propose with fewer than three sessions", () => {
    expect(
      evaluateAdvancement({
        ...base,
        outcomes: [
          { outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-12T09:00:00.000Z") },
        ],
      }),
    ).toBeNull();
  });

  it("only proposes from maintain-current and never past level five", () => {
    const outcomes = [
      { outcome: "went_well" as const, occurredAt: day("2026-08-13T09:00:00.000Z") },
      { outcome: "went_well" as const, occurredAt: day("2026-08-12T09:00:00.000Z") },
      { outcome: "went_well" as const, occurredAt: day("2026-08-11T09:00:00.000Z") },
    ];
    expect(evaluateAdvancement({ ...base, ruleId: "hold_after_mixed", outcomes })).toBeNull();
    expect(evaluateAdvancement({ ...base, level: 5, outcomes })).toBeNull();
    expect(evaluateAdvancement({ ...base, level: 99, outcomes })).toBeNull();
  });

  it("reports only the three newest qualifying successes as proposal evidence", () => {
    const result = evaluateAdvancement({
      ...base,
      outcomes: [
        { id: "newest", outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
        { id: "middle", outcome: "went_well", occurredAt: day("2026-08-12T09:00:00.000Z") },
        { id: "oldest", outcome: "went_well", occurredAt: day("2026-08-11T09:00:00.000Z") },
        { id: "ignored", outcome: "mixed", occurredAt: day("2026-08-10T09:00:00.000Z") },
      ],
    });

    expect(result).toMatchObject({
      sessionCount: 3,
      dayCount: 3,
      lastSessionId: "newest",
    });
  });
});
