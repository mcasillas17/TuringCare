import { afterEach, describe, expect, it, vi } from "vitest";

// `@sentry/node` is never allowed to touch the network in tests: every
// export `src/monitoring/sentry.ts` imports is replaced with a spy so these
// tests exercise only this adapter's own logic (enabled/disabled gating,
// status filtering, tag shape, warning prefix) with no real Sentry client.
const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(() => "mock-event-id"),
  init: vi.fn(),
  flush: vi.fn(async () => true),
}));

vi.mock("@sentry/node", () => ({
  captureException: sentryMocks.captureException,
  init: sentryMocks.init,
  flush: sentryMocks.flush,
  dedupeIntegration: vi.fn(() => ({})),
  eventFiltersIntegration: vi.fn(() => ({})),
  functionToStringIntegration: vi.fn(() => ({})),
  onUncaughtExceptionIntegration: vi.fn(() => ({})),
  onUnhandledRejectionIntegration: vi.fn(() => ({})),
}));

const VALID: Record<string, string> = {
  SENTRY_DSN: "https://publickey123@o12345.ingest.sentry.io/6789",
  SENTRY_ENVIRONMENT: "production",
  SENTRY_RELEASE: "v1.2.3-abcdef0",
};

function stubEnabledEnv(): void {
  for (const [key, value] of Object.entries(VALID)) vi.stubEnv(key, value);
}

function stubDisabledEnv(): void {
  vi.stubEnv("SENTRY_DSN", "");
  vi.stubEnv("SENTRY_ENVIRONMENT", "");
  vi.stubEnv("SENTRY_RELEASE", "");
}

/** Every test needs a fresh module instance: `enabled` is private module state. */
async function loadSentryModule() {
  vi.resetModules();
  return import("./sentry");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("captureApiError", () => {
  it("returns undefined and never calls Sentry when monitoring is disabled", async () => {
    stubDisabledEnv();
    const { initializeApiMonitoring, captureApiError, isApiMonitoringEnabled } =
      await loadSentryModule();
    initializeApiMonitoring();
    expect(isApiMonitoringEnabled()).toBe(false);

    const result = captureApiError(new Error("boom"), {
      route: "/x",
      method: "GET",
      status: 500,
      requestId: "abc",
    });

    expect(result).toBeUndefined();
    expect(sentryMocks.captureException).not.toHaveBeenCalled();
  });

  it("returns undefined and never calls Sentry for a status below 500, even when enabled", async () => {
    stubEnabledEnv();
    const { initializeApiMonitoring, captureApiError, isApiMonitoringEnabled } =
      await loadSentryModule();
    initializeApiMonitoring();
    expect(isApiMonitoringEnabled()).toBe(true);

    const result = captureApiError(new Error("not found"), {
      route: "/x",
      method: "GET",
      status: 404,
      requestId: "abc",
    });

    expect(result).toBeUndefined();
    expect(sentryMocks.captureException).not.toHaveBeenCalled();
  });

  it("captures and returns the Sentry event ID for a 5xx error when enabled", async () => {
    stubEnabledEnv();
    const { initializeApiMonitoring, captureApiError } = await loadSentryModule();
    initializeApiMonitoring();

    const error = new Error("boom");
    const result = captureApiError(error, {
      route: "/api/dogs/:id",
      method: "GET",
      status: 500,
      requestId: "req-1",
    });

    expect(result).toBe("mock-event-id");
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error, {
      tags: {
        application: "api",
        route: "/api/dogs/:id",
        method: "GET",
        status: 500,
        request_id: "req-1",
      },
    });
  });
});

describe("captureApiStartupFailure", () => {
  it("is a no-op when monitoring is disabled", async () => {
    stubDisabledEnv();
    const { initializeApiMonitoring, captureApiStartupFailure } = await loadSentryModule();
    initializeApiMonitoring();

    await captureApiStartupFailure(new Error("boom"));

    expect(sentryMocks.captureException).not.toHaveBeenCalled();
    expect(sentryMocks.flush).not.toHaveBeenCalled();
  });

  it("captures with the fixed startup tag set and flushes when enabled", async () => {
    stubEnabledEnv();
    const { initializeApiMonitoring, captureApiStartupFailure } = await loadSentryModule();
    initializeApiMonitoring();

    const error = new Error("boom");
    await captureApiStartupFailure(error);

    expect(sentryMocks.captureException).toHaveBeenCalledWith(error, {
      level: "fatal",
      tags: {
        application: "api",
        route: "startup",
        method: "STARTUP",
        status: "500",
        request_id: "startup",
      },
    });
    expect(sentryMocks.flush).toHaveBeenCalledWith(5000);
  });
});

describe("initializeApiMonitoring", () => {
  it("logs a '[monitoring] '-prefixed warning and stays disabled on a malformed configuration", async () => {
    vi.stubEnv("SENTRY_DSN", "not-a-valid-dsn");
    vi.stubEnv("SENTRY_ENVIRONMENT", "production");
    vi.stubEnv("SENTRY_RELEASE", "v1.2.3-abcdef0");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { initializeApiMonitoring, isApiMonitoringEnabled } = await loadSentryModule();

    initializeApiMonitoring();

    expect(isApiMonitoringEnabled()).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/^\[monitoring\] /);
    warnSpy.mockRestore();
  });

  it("initializes the Sentry client and enables capture for a complete, valid configuration", async () => {
    stubEnabledEnv();
    const { initializeApiMonitoring, isApiMonitoringEnabled } = await loadSentryModule();

    initializeApiMonitoring();

    expect(isApiMonitoringEnabled()).toBe(true);
    expect(sentryMocks.init).toHaveBeenCalledTimes(1);
  });
});
