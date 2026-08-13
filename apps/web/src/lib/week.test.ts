import { describe, expect, it } from "vitest";
import {
  addDays,
  dayKey,
  mondayOf,
  sameWeek,
  shouldCelebrateWeek,
  weekBounds,
  weekDays,
  weekKeyOf,
} from "./week";

describe("week helpers", () => {
  it("mondayOf returns the Monday of that local week", () => {
    // 2026-06-04 is a Thursday (local) -> Monday is 2026-06-01
    const mon = mondayOf(new Date(2026, 5, 4));
    expect(dayKey(mon)).toBe("2026-06-01");
    // A Monday maps to itself
    expect(dayKey(mondayOf(new Date(2026, 5, 1)))).toBe("2026-06-01");
    // A Sunday maps back to the prior Monday
    expect(dayKey(mondayOf(new Date(2026, 5, 7)))).toBe("2026-06-01");
  });

  it("weekDays returns 7 consecutive local days starting Monday", () => {
    const days = weekDays(mondayOf(new Date(2026, 5, 4)));
    expect(days).toHaveLength(7);
    // biome-ignore lint/style/noNonNullAssertion: Array.from guarantees length
    expect(dayKey(days[0]!)).toBe("2026-06-01");
    // biome-ignore lint/style/noNonNullAssertion: Array.from guarantees length
    expect(dayKey(days[6]!)).toBe("2026-06-07");
  });

  it("weekBounds returns ISO instants for [Monday, next Monday)", () => {
    const { weekStart, weekEnd } = weekBounds(mondayOf(new Date(2026, 5, 4)));
    expect(new Date(weekStart).getTime()).toBeLessThan(new Date(weekEnd).getTime());
    // exactly 7 days apart
    expect(new Date(weekEnd).getTime() - new Date(weekStart).getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it("addDays adds calendar days", () => {
    expect(dayKey(addDays(new Date(2026, 5, 1), 3))).toBe("2026-06-04");
  });

  it("sameWeek compares by Monday", () => {
    expect(sameWeek(new Date(2026, 5, 1), new Date(2026, 5, 7))).toBe(true);
    expect(sameWeek(new Date(2026, 5, 1), new Date(2026, 5, 8))).toBe(false);
  });
});

describe("weekKeyOf", () => {
  it("returns the local Monday key", () => {
    expect(weekKeyOf(new Date(2026, 7, 13, 23, 30))).toBe("2026-08-10");
    expect(weekKeyOf(new Date(2026, 7, 10, 0, 0))).toBe("2026-08-10");
    expect(weekKeyOf(new Date(2026, 7, 9, 23, 59))).toBe("2026-08-03");
  });
});

describe("shouldCelebrateWeek", () => {
  it("fires only on an incomplete→complete transition for the current week", () => {
    expect(shouldCelebrateWeek({ prev: false, complete: true, isCurrentWeek: true })).toBe(true);
  });
  it("does not fire on baseline (prev undefined)", () => {
    expect(shouldCelebrateWeek({ prev: undefined, complete: true, isCurrentWeek: true })).toBe(
      false,
    );
  });
  it("does not fire for a past week", () => {
    expect(shouldCelebrateWeek({ prev: false, complete: true, isCurrentWeek: false })).toBe(false);
  });
  it("does not fire when staying complete", () => {
    expect(shouldCelebrateWeek({ prev: true, complete: true, isCurrentWeek: true })).toBe(false);
  });
});
