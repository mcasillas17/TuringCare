import { describe, expect, it, vi } from "vitest";
import { recordEvent } from "./record-event";

function fakeDb(insertImpl: () => Promise<unknown>) {
  return {
    insert: () => ({ values: insertImpl }),
  } as unknown as Parameters<typeof recordEvent>[2];
}

describe("recordEvent", () => {
  it("inserts a row with name, userId, sessionId, props", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const db = { insert: () => ({ values }) } as unknown as Parameters<typeof recordEvent>[2];
    await recordEvent("user.signed_in", { userId: "u1", sessionId: "s1", props: { a: 1 } }, db);
    expect(values).toHaveBeenCalledWith({
      name: "user.signed_in",
      userId: "u1",
      sessionId: "s1",
      props: { a: 1 },
    });
  });

  it("defaults userId/sessionId to null and props to {}", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const db = { insert: () => ({ values }) } as unknown as Parameters<typeof recordEvent>[2];
    await recordEvent("page.viewed", {}, db);
    expect(values).toHaveBeenCalledWith({
      name: "page.viewed",
      userId: null,
      sessionId: null,
      props: {},
    });
  });

  it("never throws when the DB write fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeDb(() => Promise.reject(new Error("db down")));
    await expect(recordEvent("user.signed_up", { userId: "u1" }, db)).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
