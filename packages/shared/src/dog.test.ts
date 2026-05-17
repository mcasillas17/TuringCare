import { describe, expect, it } from "vitest";
import { dogProfileSchema } from "./dog";

describe("dogProfileSchema", () => {
  it("accepts a valid profile", () => {
    const r = dogProfileSchema.safeParse({
      name: "Biscuit",
      size: "medium",
      sex: "female",
      source: "rescue",
      vaccineStage: "in_progress",
      spayedNeutered: true,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid size enum", () => {
    const r = dogProfileSchema.safeParse({
      name: "Biscuit",
      size: "enormous",
      sex: "female",
      source: "rescue",
      vaccineStage: "in_progress",
    });
    expect(r.success).toBe(false);
  });

  it("requires a name", () => {
    const r = dogProfileSchema.safeParse({
      size: "small",
      sex: "male",
      source: "breeder",
      vaccineStage: "unknown",
    });
    expect(r.success).toBe(false);
  });
});
