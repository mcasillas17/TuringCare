import { describe, expect, it } from "vitest";
import { eventIngestSchema, isKnownEvent } from "./events";

describe("event catalog", () => {
  it("accepts a valid client page.viewed payload", () => {
    const parsed = eventIngestSchema.parse({ name: "page.viewed", props: { path: "/app" } });
    expect(parsed.name).toBe("page.viewed");
    expect(parsed.props).toEqual({ path: "/app" });
  });

  it("defaults props to an empty object", () => {
    const parsed = eventIngestSchema.parse({ name: "page.viewed" });
    expect(parsed.props).toEqual({});
  });

  it("rejects an event name not on the client allowlist", () => {
    expect(() => eventIngestSchema.parse({ name: "user.signed_in", props: {} })).toThrow();
  });

  it("rejects oversized props", () => {
    const big = { path: "x".repeat(2000) };
    expect(() => eventIngestSchema.parse({ name: "page.viewed", props: big })).toThrow();
  });

  it("rejects non-scalar prop values", () => {
    expect(() =>
      eventIngestSchema.parse({ name: "page.viewed", props: { nested: { a: 1 } } }),
    ).toThrow();
  });

  it("isKnownEvent recognizes server event names", () => {
    expect(isKnownEvent("user.signed_up")).toBe(true);
    expect(isKnownEvent("page.viewed")).toBe(true);
    expect(isKnownEvent("nope.fake")).toBe(false);
    expect(isKnownEvent("")).toBe(false);
    expect(isKnownEvent("user.signed_up ")).toBe(false);
  });
});
