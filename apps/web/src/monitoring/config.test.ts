import { afterEach, describe, expect, it, vi } from "vitest";
import { type MonitoringSource, readWebMonitoringConfig, resolveMonitoringConfig } from "./config";

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
    const short = { ...complete, release: "v1.0" };
    expect(() => resolveMonitoringConfig(short)).not.toThrow();
    const result = resolveMonitoringConfig(short);
    expect(result.enabled).toBe(false);
    if (!result.enabled) {
      expect(result.warning).toContain("VITE_SENTRY_RELEASE");
    }
  });

  it("warns without throwing when the DSN is malformed", () => {
    const malformed = { ...complete, dsn: "not-a-valid-url" };
    expect(() => resolveMonitoringConfig(malformed)).not.toThrow();
    const result = resolveMonitoringConfig(malformed);
    expect(result.enabled).toBe(false);
    if (!result.enabled) {
      expect(result.warning).toContain("VITE_SENTRY_DSN");
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
});

describe("readWebMonitoringConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled despite complete vars when the bundle is not production (dev)", () => {
    vi.stubEnv("PROD", false);
    vi.stubEnv("VITE_SENTRY_DSN", complete.dsn);
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", complete.environment);
    vi.stubEnv("VITE_SENTRY_RELEASE", complete.release);
    expect(readWebMonitoringConfig()).toEqual({ enabled: false });
  });

  it("is enabled when the bundle is production with a complete, valid configuration", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_SENTRY_DSN", complete.dsn);
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", complete.environment);
    vi.stubEnv("VITE_SENTRY_RELEASE", complete.release);
    expect(readWebMonitoringConfig()).toEqual({
      enabled: true,
      dsn: complete.dsn,
      environment: "production",
      release: complete.release,
    });
  });
});
