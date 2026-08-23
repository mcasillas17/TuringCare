import { describe, expect, it } from "vitest";
import { resolveLatestBriefRows } from "./latest-brief";

describe("resolveLatestBriefRows", () => {
  it("rejects equal maximum versions even when timestamps and statuses differ", () => {
    const rows = [
      {
        id: "newer-draft",
        version: 4,
        status: "draft",
        generatedAt: new Date("2026-08-23T12:00:00Z"),
      },
      {
        id: "older-finalized",
        version: 4,
        status: "finalized",
        generatedAt: new Date("2026-08-22T12:00:00Z"),
      },
    ];

    expect(resolveLatestBriefRows(rows)).toEqual({ kind: "conflict" });
  });

  it("returns the sole maximum-version row and ignores lower versions", () => {
    const latest = { id: "latest", version: 4 };
    expect(resolveLatestBriefRows([latest, { id: "old", version: 3 }])).toEqual({
      kind: "found",
      brief: latest,
    });
  });

  it("distinguishes an empty history from an ambiguous one", () => {
    expect(resolveLatestBriefRows([])).toEqual({ kind: "missing" });
  });
});
