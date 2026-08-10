import { beforeEach, describe, expect, it } from "vitest";
import { captureTestEmail, findLatestTestEmail, resetTestOutbox } from "./test-outbox";

const BASE = { subject: "S", html: "<p>h</p>", text: "t" };

beforeEach(() => resetTestOutbox());

describe("findLatestTestEmail", () => {
  it("returns null when outbox is empty", () => {
    expect(findLatestTestEmail("a@example.com")).toBeNull();
  });

  it("returns the captured email for a matching recipient", () => {
    captureTestEmail({ to: "a@example.com", ...BASE });
    const result = findLatestTestEmail("a@example.com");
    expect(result).not.toBeNull();
    expect(result?.to).toBe("a@example.com");
  });

  it("matches case-insensitively", () => {
    captureTestEmail({ to: "A@Example.COM", ...BASE });
    expect(findLatestTestEmail("a@example.com")).not.toBeNull();
    expect(findLatestTestEmail("A@EXAMPLE.COM")).not.toBeNull();
  });

  it("matches with leading/trailing whitespace on the query", () => {
    captureTestEmail({ to: "a@example.com", ...BASE });
    expect(findLatestTestEmail("  a@example.com  ")).not.toBeNull();
  });

  it("latest (newest) email wins when multiple emails sent to same recipient", () => {
    captureTestEmail({ to: "a@example.com", subject: "first", html: "<p>1</p>", text: "1" });
    captureTestEmail({ to: "a@example.com", subject: "second", html: "<p>2</p>", text: "2" });
    const result = findLatestTestEmail("a@example.com");
    expect(result?.subject).toBe("second");
  });

  it("returns null for an unrecognised recipient", () => {
    captureTestEmail({ to: "a@example.com", ...BASE });
    expect(findLatestTestEmail("b@example.com")).toBeNull();
  });
});

describe("captureTestEmail – capacity limit", () => {
  it("retains only the last 50 emails when over capacity", () => {
    for (let i = 0; i < 60; i++) {
      captureTestEmail({ to: `user${i}@example.com`, ...BASE });
    }
    // The first 10 (user0–user9) should have been evicted
    for (let i = 0; i < 10; i++) {
      expect(findLatestTestEmail(`user${i}@example.com`)).toBeNull();
    }
    // The last 50 (user10–user59) should be present
    for (let i = 10; i < 60; i++) {
      expect(findLatestTestEmail(`user${i}@example.com`)).not.toBeNull();
    }
  });
});
