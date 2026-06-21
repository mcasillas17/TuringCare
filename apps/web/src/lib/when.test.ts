import { describe, expect, it } from "vitest";
import {
  dateLabel,
  dayKindOf,
  groupByDay,
  humanTime,
  localDayKey,
  toLocalInputValue,
} from "./when";

const NOW = new Date(2026, 5, 21, 9, 0); // Jun 21 2026, 09:00 local

describe("when helpers", () => {
  it("localDayKey is local YYYY-MM-DD", () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("dayKindOf classifies today / yesterday / date", () => {
    expect(dayKindOf(new Date(2026, 5, 21, 4, 46), NOW)).toBe("today");
    expect(dayKindOf(new Date(2026, 5, 20, 23, 0), NOW)).toBe("yesterday");
    expect(dayKindOf(new Date(2026, 5, 1, 6, 30), NOW)).toBe("date");
  });

  it("dateLabel omits year in-year, includes it across years", () => {
    expect(dateLabel(new Date(2026, 5, 1), NOW, "en")).toBe("Jun 1");
    expect(dateLabel(new Date(2025, 11, 31), NOW, "en")).toBe("Dec 31, 2025");
  });

  it("humanTime formats a wall-clock time", () => {
    expect(humanTime(new Date(2026, 5, 21, 16, 5), "en")).toMatch(/4:05/);
  });

  it("toLocalInputValue round-trips local wall clock", () => {
    expect(toLocalInputValue(new Date(2026, 5, 21, 4, 46))).toBe("2026-06-21T04:46");
  });

  it("groupByDay buckets newest-first and preserves input order within a day", () => {
    const items = [
      { id: "a", at: new Date(2026, 5, 21, 4, 46) },
      { id: "b", at: new Date(2026, 5, 1, 6, 30) },
      { id: "c", at: new Date(2026, 5, 21, 1, 0) },
    ];
    const groups = groupByDay(items, (i) => i.at, NOW);
    expect(groups.map((g) => g.key)).toEqual(["2026-06-21", "2026-06-01"]);
    expect(groups[0]?.kind).toBe("today");
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["a", "c"]);
  });
});
