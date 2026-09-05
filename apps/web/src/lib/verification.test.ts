import { beforeEach, describe, expect, it, vi } from "vitest";

const { confirmPost, resendPost } = vi.hoisted(() => ({
  confirmPost: vi.fn(),
  resendPost: vi.fn(),
}));
vi.mock("./api", () => ({
  api: {
    api: {
      verification: {
        confirm: { $post: confirmPost },
        resend: { $post: resendPost },
      },
    },
  },
}));
vi.mock("./session-query-boundary", () => ({ useSessionQueriesReady: () => true }));

import { VerificationRequestError, confirmVerification, resendVerification } from "./verification";

beforeEach(() => {
  confirmPost.mockReset();
  resendPost.mockReset();
});

describe("verification response errors", () => {
  it("preserves confirmation rate limits and the server-provided delay", async () => {
    confirmPost.mockResolvedValue(
      Response.json({ error: "rate_limited", retryAfter: 17 }, { status: 429 }),
    );
    await expect(confirmVerification()).rejects.toMatchObject({
      code: "rate_limited",
      retryAfter: 17,
    });
  });

  it("does not invent a resend cooldown for missing trusted-proxy metadata", async () => {
    resendPost.mockResolvedValue(Response.json({ error: "trusted_ip_required" }, { status: 503 }));
    await expect(resendVerification({})).rejects.toMatchObject({
      code: "trusted_ip_required",
      retryAfter: 0,
    });
  });

  it("accepts a bounded confirmation delay from a response header", async () => {
    confirmPost.mockResolvedValue(
      Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "12" } }),
    );
    await expect(confirmVerification()).rejects.toMatchObject({
      code: "rate_limited",
      retryAfter: 12,
    });
  });

  it("never echoes non-JSON upstream content as a verification error", async () => {
    confirmPost.mockResolvedValue(new Response("private upstream detail", { status: 503 }));
    await expect(confirmVerification()).rejects.toBeInstanceOf(VerificationRequestError);
    confirmPost.mockResolvedValue(new Response("private upstream detail", { status: 503 }));
    await expect(confirmVerification()).rejects.toMatchObject({
      code: "verification_service_failed",
      retryAfter: 0,
    });
  });
});
