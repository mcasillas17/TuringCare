import { describe, expect, it } from "vitest";
import { BriefRequestError, readBriefRequestError } from "./brief-errors";

describe("readBriefRequestError", () => {
  it.each([
    ["brief_version_conflict", 409],
    ["idempotency_conflict", 409],
    ["send_rate_limited", 429],
    ["not_finalized", 409],
    ["send_failed", 502],
  ] as const)(
    "preserves allowlisted stable code %s, HTTP status, and operation context",
    async (code, status) => {
      const error = await readBriefRequestError(
        new Response(JSON.stringify({ error: code }), { status }),
        "send",
        "send_failed",
      );

      expect(error).toBeInstanceOf(BriefRequestError);
      expect(error).toMatchObject({ code, status, context: "send" });
    },
  );

  it.each([
    { error: "server says the user's private summary is broken" },
    { error: { nested: "send_rate_limited" } },
    { message: "brief_version_conflict" },
  ])("does not trust a non-allowlisted response payload", async (payload) => {
    const error = await readBriefRequestError(
      new Response(JSON.stringify(payload), { status: 409 }),
      "send",
      "send_failed",
    );

    expect(error).toMatchObject({ code: "send_failed", status: 409, context: "send" });
    expect(error.message).toBe("send_failed");
  });

  it("uses the stable fallback for malformed JSON", async () => {
    const error = await readBriefRequestError(
      new Response("not-json", { status: 502 }),
      "send",
      "send_failed",
    );

    expect(error).toMatchObject({ code: "send_failed", status: 502, context: "send" });
  });
});
