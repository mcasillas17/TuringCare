import { describe, expect, it } from "vitest";
import { CLIENT_EVENTS, eventIngestSchema, isKnownEvent } from "./events";

describe("telemetry events allowlist", () => {
  it("recognizes the new server + client event names", () => {
    expect(isKnownEvent("brief.emailed")).toBe(true);
    expect(isKnownEvent("training.practice_logged")).toBe(true);
    expect(isKnownEvent("focus.week_set")).toBe(true);
    expect(isKnownEvent("training.practice_outcome_recorded")).toBe(true);
    expect(isKnownEvent("training.suggestion_shown")).toBe(true);
    expect(isKnownEvent("training.suggestion_action")).toBe(true);
    expect(isKnownEvent("training.advancement_proposed")).toBe(true);
    expect(isKnownEvent("training.advancement_decided")).toBe(true);
    expect(isKnownEvent("safety.signal_reported")).toBe(true);
    expect(isKnownEvent("safety.suppression_shown")).toBe(true);
    expect(isKnownEvent("training.level_set")).toBe(true);
    expect(isKnownEvent("trainer.viewed")).toBe(true);
    expect(isKnownEvent("course.viewed")).toBe(true);
  });

  it("accepts the two client view events through the ingest schema", () => {
    expect(
      eventIngestSchema.safeParse({ name: "trainer.viewed", props: { id: "abc" } }).success,
    ).toBe(true);
    expect(
      eventIngestSchema.safeParse({ name: "course.viewed", props: { id: "abc" } }).success,
    ).toBe(true);
  });

  it("still rejects server-only events from the client ingest", () => {
    expect(eventIngestSchema.safeParse({ name: "dog.created", props: {} }).success).toBe(false);
    expect(eventIngestSchema.safeParse({ name: "safety.signal_reported", props: {} }).success).toBe(
      false,
    );
  });

  it("exposes the two new client events", () => {
    expect(CLIENT_EVENTS).toContain("trainer.viewed");
    expect(CLIENT_EVENTS).toContain("course.viewed");
  });
});
