import { describe, expect, it } from "vitest";
import {
  journalDailyCheckInCreateSchema,
  journalEntryCreateSchema,
  journalEntryUpdateSchema,
  journalMomentCreateSchema,
} from "./journal";

describe("journalMomentCreateSchema", () => {
  it("accepts a note-only moment with optional intensity", () => {
    expect(
      journalMomentCreateSchema.safeParse({
        kind: "moment",
        note: "Barked at the delivery truck",
        intensity: 3,
      }).success,
    ).toBe(true);
  });

  it("accepts optional ABC and context details without requiring them", () => {
    expect(
      journalMomentCreateSchema.safeParse({
        kind: "moment",
        note: "Jumped at the window",
        occurredAt: "2026-05-22T10:00",
        antecedent: "Truck drove by",
        behavior: "Barked twice",
        consequence: "Owner redirected to mat",
        location: "Living room",
        durationSeconds: 12,
        recoverySeconds: 45,
        peoplePresent: "Owner",
        ownerResponse: "Scattered kibble",
        notes: "Recovered quickly",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty note and out-of-range intensity", () => {
    expect(journalMomentCreateSchema.safeParse({ kind: "moment", note: "   " }).success).toBe(
      false,
    );
    expect(
      journalMomentCreateSchema.safeParse({
        kind: "moment",
        note: "Too high",
        intensity: 6,
      }).success,
    ).toBe(false);
    expect(
      journalMomentCreateSchema.safeParse({
        kind: "moment",
        note: "Too low",
        intensity: 0,
      }).success,
    ).toBe(false);
  });
});

describe("journalDailyCheckInCreateSchema", () => {
  it("accepts a daily check-in with trend and note", () => {
    expect(
      journalDailyCheckInCreateSchema.safeParse({
        kind: "daily_checkin",
        trend: "better",
        note: "Settled faster during dinner.",
      }).success,
    ).toBe(true);
  });

  it("rejects a daily check-in without a trend", () => {
    expect(
      journalDailyCheckInCreateSchema.safeParse({
        kind: "daily_checkin",
        note: "Quiet afternoon",
      }).success,
    ).toBe(false);
  });
});

describe("journalEntryCreateSchema", () => {
  it("discriminates moments from daily check-ins", () => {
    expect(
      journalEntryCreateSchema.safeParse({ kind: "moment", note: "Growled once" }).success,
    ).toBe(true);
    expect(
      journalEntryCreateSchema.safeParse({
        kind: "daily_checkin",
        trend: "same",
        note: "About the same today",
      }).success,
    ).toBe(true);
    expect(
      journalEntryCreateSchema.safeParse({ kind: "daily_checkin", note: "Missing trend" }).success,
    ).toBe(false);
  });
});

describe("journalEntryUpdateSchema", () => {
  it("accepts partial follow-up and structured detail updates", () => {
    expect(journalEntryUpdateSchema.safeParse({ antecedent: "Doorbell rang" }).success).toBe(true);
    expect(
      journalEntryUpdateSchema.safeParse({
        note: "Updated note",
        intensity: null,
        durationSeconds: 20,
        recoverySeconds: null,
        peoplePresent: "Owner + walker",
        ownerResponse: "Asked for sit",
      }).success,
    ).toBe(true);
  });

  it("validates note, intensity, trend, and numeric detail fields when present", () => {
    expect(journalEntryUpdateSchema.safeParse({ note: "" }).success).toBe(false);
    expect(journalEntryUpdateSchema.safeParse({ intensity: 9 }).success).toBe(false);
    expect(journalEntryUpdateSchema.safeParse({ trend: "easier" }).success).toBe(false);
    expect(journalEntryUpdateSchema.safeParse({ kind: "moment", trend: "better" }).success).toBe(
      false,
    );
    expect(journalEntryUpdateSchema.safeParse({ kind: "moment", trend: null }).success).toBe(true);
    expect(journalEntryUpdateSchema.safeParse({ durationSeconds: -1 }).success).toBe(false);
    expect(journalEntryUpdateSchema.safeParse({ recoverySeconds: -1 }).success).toBe(false);
  });
});
