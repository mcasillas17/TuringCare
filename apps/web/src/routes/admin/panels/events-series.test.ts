import { describe, expect, it } from "vitest";
import { buildSeries } from "./events-series";

// 2026-05-04 = Mon, 2026-05-05 = Tue (same week), 2026-05-11 = next Mon.
const data = [
  { day: "2026-05-04", name: "page.viewed", count: 10 },
  { day: "2026-05-05", name: "page.viewed", count: 5 },
  { day: "2026-05-05", name: "dog.created", count: 2 },
  { day: "2026-05-11", name: "page.viewed", count: 7 },
];

describe("buildSeries", () => {
  it("buckets by day with per-category counts and a total", () => {
    const rows = buildSeries(data, "day", new Set());
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ bucket: "2026-05-04", pageViews: 10, total: 10 });
    expect(rows[1]).toMatchObject({ bucket: "2026-05-05", pageViews: 5, journalDogs: 2, total: 7 });
    expect(rows[2]).toMatchObject({ bucket: "2026-05-11", pageViews: 7, total: 7 });
  });

  it("collapses days into Monday-keyed weeks", () => {
    const rows = buildSeries(data, "week", new Set());
    expect(rows.map((r) => r.bucket)).toEqual(["2026-05-04", "2026-05-11"]);
    expect(rows[0]).toMatchObject({
      bucket: "2026-05-04",
      pageViews: 15,
      journalDogs: 2,
      total: 17,
    });
    expect(rows[1]).toMatchObject({ bucket: "2026-05-11", pageViews: 7, total: 7 });
  });

  it("excludes hidden categories", () => {
    const rows = buildSeries(data, "day", new Set(["pageViews"]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ bucket: "2026-05-05", journalDogs: 2, total: 2 });
  });
});
