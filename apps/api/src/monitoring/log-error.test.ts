import { afterEach, describe, expect, it, vi } from "vitest";
import { logApiError } from "./log-error";

const META = { requestId: "req-1", route: "/api/dogs/:id", method: "GET", status: 500 };

describe("logApiError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits exactly one console.error call with the fixed line and structured metadata", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logApiError(new Error("raw failure detail"), META);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("[monitoring] unexpected server error", {
      requestId: META.requestId,
      route: META.route,
      method: META.method,
      status: META.status,
      errorType: "Unexpected Error",
    });
  });

  it("never logs the raw error message, even embedded inside the call arguments", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sentinel = "raw-message-sentinel-do-not-leak";

    logApiError(new Error(sentinel), META);

    const serialized = JSON.stringify(errorSpy.mock.calls);
    expect(serialized).not.toContain(sentinel);
  });

  it("classifies a recognizable Error subclass by its constructor name", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logApiError(new TypeError("boom"), META);

    expect(errorSpy.mock.calls[0]?.[1]).toMatchObject({ errorType: "Unexpected TypeError" });
  });

  it("falls back to a generic classification for a non-Error thrown value, without leaking it", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sentinel = "non-error-sentinel-do-not-leak";

    logApiError(sentinel, META);

    expect(errorSpy.mock.calls[0]?.[1]).toMatchObject({
      errorType: "Unexpected application error",
    });
    const serialized = JSON.stringify(errorSpy.mock.calls);
    expect(serialized).not.toContain(sentinel);
  });
});
