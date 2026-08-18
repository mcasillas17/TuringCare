import { describe, expect, it } from "vitest";
import { buildGuidedSetupStatusQueries } from "./guided-setup";

describe("buildGuidedSetupStatusQueries", () => {
  it("bounds active, latest, and dog-existence reads to one row", () => {
    const queries = buildGuidedSetupStatusQueries("owner-1");

    for (const query of [queries.activeSetup, queries.latestSetup, queries.existingDog]) {
      const generated = query.toSQL();
      expect(generated.sql).toContain("limit");
      expect(generated.params).toContain(1);
    }

    expect(queries.activeSetup.toSQL().sql).toContain('"completed_at" is null');
    expect(queries.latestSetup.toSQL().sql).toContain('order by "guided_setups"."started_at" desc');
    expect(queries.existingDog.toSQL().sql).not.toContain("count(");
  });
});
