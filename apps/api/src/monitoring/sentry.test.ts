import { afterEach, describe, expect, it, vi } from "vitest";

// `@sentry/node` is never allowed to touch the network in tests: every
// export `src/monitoring/sentry.ts` imports is replaced with a spy so these
// tests exercise only this adapter's own logic (enabled/disabled gating,
// status filtering, tag shape, warning prefix) with no real Sentry client.
// Each integration factory returns a distinct, identifiable sentinel object
// so the `init()` call's `integrations` array can be asserted by identity
// and order, not just by length.
const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(() => "mock-event-id"),
  init: vi.fn(),
  flush: vi.fn(async () => true),
  dedupeIntegration: vi.fn(() => ({ name: "Dedupe" }) as const),
  eventFiltersIntegration: vi.fn(() => ({ name: "EventFilters" }) as const),
  functionToStringIntegration: vi.fn(() => ({ name: "FunctionToString" }) as const),
  onUncaughtExceptionIntegration: vi.fn(() => ({ name: "OnUncaughtException" }) as const),
  onUnhandledRejectionIntegration: vi.fn(
    (options?: { mode: string }) => ({ name: "OnUnhandledRejection", options }) as const,
  ),
}));

vi.mock("@sentry/node", () => ({
  captureException: sentryMocks.captureException,
  init: sentryMocks.init,
  flush: sentryMocks.flush,
  dedupeIntegration: sentryMocks.dedupeIntegration,
  eventFiltersIntegration: sentryMocks.eventFiltersIntegration,
  functionToStringIntegration: sentryMocks.functionToStringIntegration,
  onUncaughtExceptionIntegration: sentryMocks.onUncaughtExceptionIntegration,
  onUnhandledRejectionIntegration: sentryMocks.onUnhandledRejectionIntegration,
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
    initializeApiMonitoring("v22.4.0");
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
    initializeApiMonitoring("v22.4.0");

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
    initializeApiMonitoring("v22.4.0");

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

    initializeApiMonitoring("v22.4.0");

    expect(isApiMonitoringEnabled()).toBe(true);
    expect(sentryMocks.init).toHaveBeenCalledTimes(1);

    const initArg = sentryMocks.init.mock.calls[0]?.[0];
    expect(initArg).toMatchObject({
      dsn: VALID.SENTRY_DSN,
      environment: "production",
      release: VALID.SENTRY_RELEASE,
      tracesSampleRate: 0,
      enableLogs: false,
      defaultIntegrations: false,
    });

    // Every data-collection category is an explicit, individually-checked
    // deny: a privacy regression that flips a single flag (e.g.
    // `databaseQueryData` or `frameContextLines`) must fail this test.
    expect(initArg?.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    });

    // The exact sanitizer functions must be wired in, not lookalikes. Import
    // after `loadSentryModule`'s `vi.resetModules()` so this resolves to the
    // same cached `sanitize-event` module instance `sentry.ts` imported.
    const { sanitizeApiBreadcrumb, sanitizeApiEvent } = await import("./sanitize-event");
    expect(initArg?.beforeSend).toBe(sanitizeApiEvent);
    expect(initArg?.beforeBreadcrumb).toBe(sanitizeApiBreadcrumb);

    // Each integration factory is called exactly once, with the correct
    // arguments, and its (identifiable) return value is present in `init`'s
    // `integrations` array in the documented order — no default/auto
    // instrumentation integration sneaks in alongside them.
    expect(sentryMocks.dedupeIntegration).toHaveBeenCalledTimes(1);
    expect(sentryMocks.eventFiltersIntegration).toHaveBeenCalledTimes(1);
    expect(sentryMocks.functionToStringIntegration).toHaveBeenCalledTimes(1);
    expect(sentryMocks.onUncaughtExceptionIntegration).toHaveBeenCalledTimes(1);
    expect(sentryMocks.onUnhandledRejectionIntegration).toHaveBeenCalledTimes(1);
    expect(sentryMocks.onUnhandledRejectionIntegration).toHaveBeenCalledWith({
      mode: "strict",
    });
    expect(initArg?.integrations).toEqual([
      { name: "Dedupe" },
      { name: "EventFilters" },
      { name: "FunctionToString" },
      { name: "OnUncaughtException" },
      { name: "OnUnhandledRejection", options: { mode: "strict" } },
    ]);
  });
});

describe("initializeApiMonitoring Node major guard", () => {
  it("initializes Sentry on Node 22", async () => {
    stubEnabledEnv();
    const { initializeApiMonitoring, isApiMonitoringEnabled } = await loadSentryModule();

    initializeApiMonitoring("v22.4.0");

    expect(isApiMonitoringEnabled()).toBe(true);
    expect(sentryMocks.init).toHaveBeenCalledTimes(1);
  });

  it("disables monitoring without calling Sentry's init on Node 24, and warns without the config value", async () => {
    stubEnabledEnv();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { initializeApiMonitoring, isApiMonitoringEnabled } = await loadSentryModule();

    initializeApiMonitoring("v24.0.0");

    expect(isApiMonitoringEnabled()).toBe(false);
    expect(sentryMocks.init).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[monitoring] monitoring disabled: Sentry with the tsx runtime requires Node 22",
    );
    warnSpy.mockRestore();
  });

  it("disables monitoring on Node 20 (below the pinned major) without calling init", async () => {
    stubEnabledEnv();
    const { initializeApiMonitoring, isApiMonitoringEnabled } = await loadSentryModule();

    initializeApiMonitoring("v20.11.0");

    expect(isApiMonitoringEnabled()).toBe(false);
    expect(sentryMocks.init).not.toHaveBeenCalled();
  });
});

describe("isSupportedMonitoringNodeMajor", () => {
  it("is a pure predicate: true only for Node 22, false for every other major", async () => {
    const { isSupportedMonitoringNodeMajor } = await loadSentryModule();

    expect(isSupportedMonitoringNodeMajor("v22.4.0")).toBe(true);
    expect(isSupportedMonitoringNodeMajor("22.4.0")).toBe(true);
    expect(isSupportedMonitoringNodeMajor("v24.0.0")).toBe(false);
    expect(isSupportedMonitoringNodeMajor("v20.11.0")).toBe(false);
    expect(sentryMocks.init).not.toHaveBeenCalled();
  });
});
