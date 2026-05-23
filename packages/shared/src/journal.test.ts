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
  it("accepts the four optional capture fields", () => {
    expect(
      journalEntrySchema.safeParse({
        ...base,
        durationSeconds: 12,
        recoverySeconds: 30,
        peoplePresent: "Owner + walker",
        ownerResponse: "Asked for sit",
      }).success,
    ).toBe(true);
  });
  it("treats the four capture fields as fully optional", () => {
    expect(
      journalEntrySchema.safeParse({ ...base, durationSeconds: null, recoverySeconds: null })
        .success,
    ).toBe(true);
    expect(
      journalEntrySchema.safeParse({ ...base, peoplePresent: null, ownerResponse: null }).success,
    ).toBe(true);
  });
  it("rejects negative durationSeconds / recoverySeconds", () => {
    expect(journalEntrySchema.safeParse({ ...base, durationSeconds: -5 }).success).toBe(false);
    expect(journalEntrySchema.safeParse({ ...base, recoverySeconds: -1 }).success).toBe(false);
  });
  it("rejects non-string peoplePresent / ownerResponse", () => {
    expect(journalEntrySchema.safeParse({ ...base, peoplePresent: 123 }).success).toBe(false);
    expect(journalEntrySchema.safeParse({ ...base, ownerResponse: 7 }).success).toBe(false);
  });
});
