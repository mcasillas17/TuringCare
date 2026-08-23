import { describe, expect, it } from "vitest";
import { CLIENT_EVENTS, eventIngestSchema, isKnownEvent } from "./events";

describe("telemetry events allowlist", () => {
  it("recognizes the new server + client event names", () => {
    expect(isKnownEvent("brief.emailed")).toBe(true);
    expect(isKnownEvent("training.practice_logged")).toBe(true);
    expect(isKnownEvent("focus.week_set")).toBe(true);
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

  it.each([
    "/b/fixture-share-segment",
    "/B/fixture-share-segment",
    "/%62/fixture-share-segment",
    "/%42/fixture-share-segment",
    "/b/fixture-share-segment/",
    "/B/fixture-share-segment///",
    "/%62/fixture-share-segment///",
    "/b/fixture%2Fencoded-segment",
    "/%42/fixture%2Fencoded-segment",
    "/%62/fixture%",
    "/%42/%ZZ",
    "/b/fixture-share-segment?source=fixture",
    "/B/fixture-share-segment///#fixture",
  ])("normalizes a public Brief path from an untrusted client for %s", (path) => {
    expect(
      eventIngestSchema.parse({
        name: "page.viewed",
        props: { path, source: "fixture" },
      }),
    ).toEqual({
      name: "page.viewed",
      props: { path: "/b/:token", source: "fixture" },
    });
  });

  it.each([
    "/b",
    "/b/",
    "/b//",
    "/b/fixture/child",
    "/b/fixture/child?source=fixture",
    "/billing",
    "//b/fixture",
    "/%62",
    "/%62/",
    "/%62//",
    "/%62/fixture/child",
    "/%2562/fixture",
    "/%61/fixture",
    "/%6Z/fixture",
    "/%2F%62/fixture",
    "/%62%2Ffixture",
    "//%62/fixture",
  ])("preserves unrelated path %s", (path) => {
    expect(
      eventIngestSchema.parse({
        name: "page.viewed",
        props: { path, source: "fixture" },
      }),
    ).toEqual({
      name: "page.viewed",
      props: { path, source: "fixture" },
    });
  });

  it("normalizes a public Brief path even when a malicious client relabels the event", () => {
    expect(
      eventIngestSchema.parse({
        name: "trainer.viewed",
        props: { path: "/%62/fixture-share-segment" },
      }),
    ).toEqual({
      name: "trainer.viewed",
      props: { path: "/b/:token" },
    });
  });

  it("still rejects server-only events from the client ingest", () => {
    expect(eventIngestSchema.safeParse({ name: "dog.created", props: {} }).success).toBe(false);
  });

  it("exposes the two new client events", () => {
    expect(CLIENT_EVENTS).toContain("trainer.viewed");
    expect(CLIENT_EVENTS).toContain("course.viewed");
  });
});
