import { describe, expect, it } from "vitest";
import { timeAgo } from "./time-ago";

const now = new Date("2026-06-21T12:00:00Z").getTime();

describe("timeAgo", () => {
  it("returns null for nullish input", () => {
    expect(timeAgo("en", null, now)).toBeNull();
  });
  it("returns null for a malformed date", () => {
    expect(timeAgo("en", "not-a-date", now)).toBeNull();
  });
  it("today for <1 day", () => {
    expect(timeAgo("en", "2026-06-21T08:00:00Z", now)).toBe("today");
    expect(timeAgo("es", "2026-06-21T08:00:00Z", now)).toBe("hoy");
  });
  it("days, weeks, months buckets", () => {
    expect(timeAgo("en", "2026-06-18T12:00:00Z", now)).toBe("3 days ago");
    expect(timeAgo("en", "2026-06-01T12:00:00Z", now)).toBe("2 weeks ago");
    expect(timeAgo("en", "2026-04-01T12:00:00Z", now)).toBe("2 months ago");
    expect(timeAgo("es", "2026-06-18T12:00:00Z", now)).toBe("hace 3 días");
  });
});
