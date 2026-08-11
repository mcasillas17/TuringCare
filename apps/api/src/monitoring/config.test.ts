import { afterEach, describe, expect, it, vi } from "vitest";
import { type MonitoringSource, readApiMonitoringConfig, resolveMonitoringConfig } from "./config";

const complete: MonitoringSource = {
  dsn: "https://publickey123@o12345.ingest.sentry.io/6789",
  environment: "production",
  release: "v1.2.3-abcdef0",
};

describe("resolveMonitoringConfig", () => {
  it("is disabled and silent when all fields are blank", () => {
    expect(resolveMonitoringConfig({})).toEqual({ enabled: false });
    expect(resolveMonitoringConfig({ dsn: "", environment: "", release: "" })).toEqual({
      enabled: false,
    });
  });

  it("is enabled for a complete, valid production configuration", () => {
    expect(resolveMonitoringConfig(complete)).toEqual({
      enabled: true,
      dsn: complete.dsn,
      environment: "production",
      release: complete.release,
    });
  });

  it("warns without throwing when the release is too short", () => {
    const result = resolveMonitoringConfig({ ...complete, release: "v1.0" });
    expect(result.enabled).toBe(false);
    expect(() => resolveMonitoringConfig({ ...complete, release: "v1.0" })).not.toThrow();
    if (!result.enabled) {
      expect(result.warning).toContain("SENTRY_RELEASE");
    }
  });

  it("warns without throwing when the DSN is malformed", () => {
    const malformed = { ...complete, dsn: "not-a-valid-url" };
    const result = resolveMonitoringConfig(malformed);
    expect(result.enabled).toBe(false);
    expect(() => resolveMonitoringConfig(malformed)).not.toThrow();
    if (!result.enabled) {
      expect(result.warning).toContain("SENTRY_DSN");
    }
  });

  it("is disabled for a non-production environment", () => {
    const result = resolveMonitoringConfig({ ...complete, environment: "staging" });
    expect(result.enabled).toBe(false);
  });

  it("never includes the configured values in the warning", () => {
    const malformed = {
      dsn: "ftp://secret-token-should-not-leak@example.com/1",
      environment: "not-production-either",
      release: "short",
    };
    const result = resolveMonitoringConfig(malformed);
    expect(result.enabled).toBe(false);
    if (!result.enabled && result.warning) {
      expect(result.warning).not.toContain(malformed.dsn);
      expect(result.warning).not.toContain(malformed.environment);
      expect(result.warning).not.toContain(malformed.release);
      expect(result.warning).not.toContain("secret-token-should-not-leak");
    }
  });

  it("requires a non-empty username in the DSN", () => {
    const result = resolveMonitoringConfig({
      ...complete,
      dsn: "https://o12345.ingest.sentry.io/6789",
    });
    expect(result.enabled).toBe(false);
  });
});

describe("readApiMonitoringConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled and silent when process.env has nothing set", () => {
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("SENTRY_ENVIRONMENT", "");
    vi.stubEnv("SENTRY_RELEASE", "");
    expect(readApiMonitoringConfig()).toEqual({ enabled: false });
  });

  it("is enabled when process.env has a complete, valid configuration", () => {
    vi.stubEnv("SENTRY_DSN", complete.dsn);
    vi.stubEnv("SENTRY_ENVIRONMENT", complete.environment);
    vi.stubEnv("SENTRY_RELEASE", complete.release);
    expect(readApiMonitoringConfig()).toEqual({
      enabled: true,
      dsn: complete.dsn,
      environment: "production",
      release: complete.release,
    });
  });

  it("warns without throwing on garbage process.env values", () => {
    vi.stubEnv("SENTRY_DSN", "🔥not a url🔥");
    vi.stubEnv("SENTRY_ENVIRONMENT", "prod");
    vi.stubEnv("SENTRY_RELEASE", "x");
    expect(() => readApiMonitoringConfig()).not.toThrow();
    const result = readApiMonitoringConfig();
    expect(result.enabled).toBe(false);
    if (!result.enabled) {
      expect(result.warning).toBeDefined();
      expect(result.warning).not.toContain("🔥not a url🔥");
    }
  });
});
