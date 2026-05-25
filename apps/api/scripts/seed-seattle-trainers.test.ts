import { trainerInputSchema } from "@turingcare/shared";
import { describe, expect, it } from "vitest";
import { seattleTrainers } from "./seed-seattle-trainers";

describe("seattleTrainers", () => {
  it("has 4 trainers", () => {
    expect(seattleTrainers).toHaveLength(4);
  });
  it("every trainer passes trainerInputSchema", () => {
    for (const t of seattleTrainers) {
      expect(trainerInputSchema.safeParse(t).success).toBe(true);
    }
  });
  it("each has a name, city, state, and website", () => {
    for (const t of seattleTrainers) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.city.length).toBeGreaterThan(0);
      expect(t.state.length).toBeGreaterThan(0);
      expect(t.website).toBeTruthy();
    }
  });
});
