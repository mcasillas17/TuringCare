// Web (Vite) monitoring configuration resolution. Deliberately a small
// duplicate of apps/api/src/monitoring/config.ts's resolver: the API reads
// process.env at runtime while the web app reads import.meta.env at build
// time, and those two env sources are not interchangeable, so sharing a
// resolver across the two runtimes would require an awkward abstraction for
// very little benefit. Both resolvers stay pure and never throw so that
// monitoring can never break a build or change app behavior.

export type MonitoringConfig =
  | { enabled: false; warning?: string }
  | { enabled: true; dsn: string; environment: "production"; release: string };

export type MonitoringSource = {
  dsn?: string;
  environment?: string;
  release?: string;
};

const MIN_RELEASE_LENGTH = 7;

/** True only for a well-formed http(s) URL with a non-empty username, i.e. a Sentry-style DSN. */
function isValidDsn(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.username.length > 0;
}

/**
 * Resolve a monitoring configuration from raw source strings. Pure function:
 * no env/global access, no throwing. `varNames` lets callers name the
 * underlying variables so warnings can point at the right ones without ever
 * including the (potentially sensitive) configured values.
 */
export function resolveMonitoringConfig(
  source: MonitoringSource,
  varNames: { dsn: string; environment: string; release: string } = {
    dsn: "VITE_SENTRY_DSN",
    environment: "VITE_SENTRY_ENVIRONMENT",
    release: "VITE_SENTRY_RELEASE",
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

/**
 * Reads the web app's monitoring env vars from import.meta.env. Disabled
 * (silently) for any non-production bundle, since VITE_* vars are inlined at
 * build time and dev/test builds must never ship or report to Sentry.
 */
export function readWebMonitoringConfig(): MonitoringConfig {
  if (!import.meta.env.PROD) {
    return { enabled: false };
  }
  return resolveMonitoringConfig({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT,
    release: import.meta.env.VITE_SENTRY_RELEASE,
  });
}
