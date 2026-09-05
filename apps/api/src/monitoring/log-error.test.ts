import { afterEach, describe, expect, it, vi } from "vitest";
import { logApiError } from "./log-error";
import { registerApiMonitoringRoutes } from "./sanitize-event";
registerApiMonitoringRoutes([{ path: "/api/dogs/:id" }]);

const META = {
  requestId: "e5d938bf-65c0-4a79-b19e-e3c46091fead",
  route: "/api/dogs/:id",
  method: "GET",
  status: 500,
};

describe("logApiError", () => {
  it("does not log identifier-shaped private metadata or custom exception names", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    class OwnerPrivateToken123 extends Error {}
    logApiError(new OwnerPrivateToken123(), {
      requestId: "OwnerPrivateToken123",
      route: "/OwnerPrivateToken123",
      method: "OWNERSECRET",
      status: 500,
    });
    const serialized = JSON.stringify(errorSpy.mock.calls);
    expect(serialized).not.toContain("OwnerPrivateToken123");
    expect(serialized).not.toContain("OWNERSECRET");
  });

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
