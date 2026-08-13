import { describe, expect, it } from "vitest";
import { EVIDENCE_WINDOW_DAYS, summarizeEvidence } from "./practice-evidence";

const NOW = new Date("2026-08-13T12:00:00.000Z");
const day = (iso: string) => new Date(iso);

describe("summarizeEvidence", () => {
  it("reports an empty summary with no rows", () => {
    expect(summarizeEvidence([], NOW)).toEqual({
      windowDays: EVIDENCE_WINDOW_DAYS,
      sessionCount: 0,
      wentWellCount: 0,
      mixedCount: 0,
      tooHardCount: 0,
      distinctDayCount: 0,
      lastPracticeAt: null,
      recentOutcomes: [],
    });
  });

  it("counts outcomes, distinct owner-local days and the latest practice", () => {
    const summary = summarizeEvidence(
      [
        {
          outcome: "went_well",
          occurredAt: day("2026-08-10T08:00:00.000Z"),
          practiceDay: "2026-08-10",
        },
        {
          outcome: "went_well",
          occurredAt: day("2026-08-10T18:00:00.000Z"),
          practiceDay: "2026-08-10",
        },
        {
          outcome: "mixed",
          occurredAt: day("2026-08-12T08:00:00.000Z"),
          practiceDay: "2026-08-12",
        },
        {
          outcome: "too_hard",
          occurredAt: day("2026-08-13T08:00:00.000Z"),
          practiceDay: "2026-08-13",
        },
      ],
      NOW,
    );
    expect(summary.sessionCount).toBe(4);
    expect(summary.wentWellCount).toBe(2);
    expect(summary.mixedCount).toBe(1);
    expect(summary.tooHardCount).toBe(1);
    expect(summary.distinctDayCount).toBe(3);
    expect(summary.lastPracticeAt).toBe("2026-08-13T08:00:00.000Z");
  });

  it("orders recentOutcomes newest first", () => {
    const summary = summarizeEvidence(
      [
        { outcome: "went_well", occurredAt: day("2026-08-10T08:00:00.000Z") },
        { outcome: "too_hard", occurredAt: day("2026-08-13T08:00:00.000Z") },
      ],
      NOW,
    );
    expect(summary.recentOutcomes).toEqual(["too_hard", "went_well"]);
  });

  it("uses the captured local date instead of applying one offset to the whole window", () => {
    const summary = summarizeEvidence(
      [
        {
          outcome: "went_well",
          occurredAt: day("2026-11-01T06:30:00.000Z"),
          practiceDay: "2026-11-01",
        },
        {
          outcome: "went_well",
          occurredAt: day("2026-11-02T06:30:00.000Z"),
          practiceDay: "2026-11-02",
        },
      ],
      new Date("2026-11-03T12:00:00.000Z"),
    );
    expect(summary.distinctDayCount).toBe(2);
  });

  it("ignores sessions without a recorded outcome", () => {
    const summary = summarizeEvidence(
      [
        { outcome: null, occurredAt: day("2026-08-12T08:00:00.000Z") },
        { outcome: "mixed", occurredAt: day("2026-08-12T09:00:00.000Z") },
      ],
      NOW,
    );
    expect(summary.sessionCount).toBe(1);
    expect(summary.recentOutcomes).toEqual(["mixed"]);
  });

  it("ignores future-dated evidence", () => {
    const summary = summarizeEvidence(
      [
        { outcome: "went_well", occurredAt: day("2026-08-13T08:00:00.000Z") },
        { outcome: "went_well", occurredAt: day("2026-08-14T08:00:00.000Z") },
      ],
      NOW,
    );
    expect(summary.sessionCount).toBe(1);
    expect(summary.lastPracticeAt).toBe("2026-08-13T08:00:00.000Z");
  });
});
