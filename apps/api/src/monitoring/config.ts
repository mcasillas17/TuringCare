// Monitoring (Sentry) configuration resolution. This module is a pure,
// side-effect-free translation from raw env-style strings to a typed config.
// It never throws: any malformed or incomplete input resolves to a disabled
// config (optionally with a warning) so that monitoring can never prevent the
// API from booting or change its behavior. See apps/api/src/env.ts for why
// these variables are deliberately kept out of the fail-fast Zod schema.

export type MonitoringConfig =
  | { enabled: false; warning?: string }
  | { enabled: true; dsn: string; environment: "production"; release: string };

export type MonitoringSource = {
  dsn?: string;
  environment?: string;
  release?: string;
};

const MIN_RELEASE_LENGTH = 7;

/** A Sentry DSN's trailing path segment is always its numeric project ID. */
const NUMERIC_PROJECT_ID = /^[0-9]+$/;

/**
 * True only for a well-formed Sentry-style DSN: HTTPS (never plain HTTP —
 * this is production-only monitoring transport, not a general URL check), a
 * non-empty username (the DSN's public key), a non-empty hostname, and a
 * non-empty, purely numeric final path segment (the Sentry project ID).
 */
function isValidDsn(value: string): boolean {
  // Match the pinned SDK's public-key/host grammar before calling init: its
  // parser prints the raw DSN on a mismatch. Never accept passwords, query
  // strings, fragments, or encoded credentials in this configuration.
  if (!/^https:\/\/\w+@(?:[\w.-]+|\[[\da-fA-F:]+\])(?::\d+)?\/(?:[\w.~-]+\/)*\d+$/.test(value)) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username.length === 0) return false;
  if (url.hostname.length === 0) return false;

  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  const projectId = segments.at(-1);
  return projectId !== undefined && NUMERIC_PROJECT_ID.test(projectId);
}

/**
 * Resolve a monitoring configuration from raw source strings. Pure function:
 * no env/global access, no throwing. `varNames` lets callers (API vs. web)
 * name the underlying variables so warnings can point at the right ones
 * without ever including the (potentially sensitive) configured values.
 */
export function resolveMonitoringConfig(
  source: MonitoringSource,
  varNames: { dsn: string; environment: string; release: string } = {
    dsn: "SENTRY_DSN",
    environment: "SENTRY_ENVIRONMENT",
    release: "SENTRY_RELEASE",
  },
): MonitoringConfig {
  const dsn = (source.dsn ?? "").trim();
  const environment = (source.environment ?? "").trim();
  const release = (source.release ?? "").trim();

  if (!dsn && !environment && !release) {
    return { enabled: false };
  }

  const invalid: string[] = [];
  if (!dsn || !isValidDsn(dsn)) invalid.push(varNames.dsn);
  if (environment !== "production") invalid.push(varNames.environment);
  if (!release || release.length < MIN_RELEASE_LENGTH) invalid.push(varNames.release);

  if (invalid.length === 0) {
    return { enabled: true, dsn, environment: "production", release };
  }

  return {
    enabled: false,
    warning: `Monitoring disabled: invalid or missing ${invalid.join(", ")}`,
  };
}

/** Reads the API's monitoring env vars from process.env. Never throws. */
export function readApiMonitoringConfig(): MonitoringConfig {
  return resolveMonitoringConfig({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT,
    release: process.env.SENTRY_RELEASE,
  });
}
