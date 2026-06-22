import { describe, expect, it } from "vitest";
import { timeAgo } from "./time-ago";

// fake translate: echoes key + n
const t = ((key: string, vars?: { n?: number }) =>
  vars?.n != null ? `${key}:${vars.n}` : key) as never;
const now = new Date("2026-06-21T12:00:00Z").getTime();

describe("timeAgo", () => {
  it("returns null for nullish input", () => {
    expect(timeAgo(t, null, now)).toBeNull();
  });
  it("today for <1 day", () => {
    expect(timeAgo(t, "2026-06-21T08:00:00Z", now)).toBe("dogHub.today");
  });
  it("days, weeks, months buckets", () => {
    expect(timeAgo(t, "2026-06-18T12:00:00Z", now)).toBe("dogHub.daysAgo:3");
    expect(timeAgo(t, "2026-06-01T12:00:00Z", now)).toBe("dogHub.weeksAgo:2");
    expect(timeAgo(t, "2026-04-01T12:00:00Z", now)).toBe("dogHub.monthsAgo:2");
  });
});
