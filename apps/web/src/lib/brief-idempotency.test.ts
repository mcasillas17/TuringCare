import { describe, expect, it } from "vitest";
import { createBriefSendIdempotencyKey } from "./brief-idempotency";

describe("createBriefSendIdempotencyKey", () => {
  it("uses randomUUID when the browser provides it", () => {
    const key = "95acbb6a-9189-4614-9a6e-c732efcc5d1d";
    expect(
      createBriefSendIdempotencyKey({
        randomUUID: () => key,
        getRandomValues: () => {
          throw new Error("fallback must not run");
        },
      }),
    ).toBe(key);
  });

  it("builds an RFC 4122 UUID from getRandomValues when randomUUID is unavailable", () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, index) => index);
    const key = createBriefSendIdempotencyKey({
      getRandomValues: <T extends ArrayBufferView>(target: T) => {
        if (!(target instanceof Uint8Array)) throw new Error("expected byte array");
        target.set(bytes);
        return target;
      },
    });

    expect(key).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });

  it("fails loudly when no cryptographically secure browser generator exists", () => {
    expect(() => createBriefSendIdempotencyKey(null)).toThrow("secure_random_unavailable");
  });
});
