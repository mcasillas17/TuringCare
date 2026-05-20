import { describe, expect, it } from "vitest";
import { journalEntrySchema } from "./journal";

describe("journalEntrySchema", () => {
  const base = {
    occurredAt: "2026-05-19T10:00",
    antecedent: "Doorbell rang",
    behavior: "Barked and lunged",
    consequence: "Owner redirected with food",
    intensity: 3,
  };
  it("accepts a valid entry", () => {
    expect(journalEntrySchema.safeParse(base).success).toBe(true);
  });
  it("accepts optional location/notes", () => {
    expect(
      journalEntrySchema.safeParse({ ...base, location: "Front door", notes: "n" }).success,
    ).toBe(true);
  });
  it("rejects empty behavior", () => {
    expect(journalEntrySchema.safeParse({ ...base, behavior: "" }).success).toBe(false);
  });
  it("rejects intensity out of 1..5", () => {
    expect(journalEntrySchema.safeParse({ ...base, intensity: 6 }).success).toBe(false);
    expect(journalEntrySchema.safeParse({ ...base, intensity: 0 }).success).toBe(false);
  });
  it("rejects missing occurredAt", () => {
    const { occurredAt, ...rest } = base;
    expect(journalEntrySchema.safeParse(rest).success).toBe(false);
  });
});
