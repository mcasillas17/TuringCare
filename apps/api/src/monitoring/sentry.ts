// Sentry adapter for the API. This is the only application module that
// imports `@sentry/node` directly: everything else depends on the small
// functions exported here, so sanitization and disabled-mode (fail-open)
// behavior stay centralized. See
// docs/superpowers/specs/2026-08-10-production-operational-readiness-design.md
// for the full design this implements.

import {
  captureException,
  dedupeIntegration,
  eventFiltersIntegration,
  flush,
  functionToStringIntegration,
  init,
  onUncaughtExceptionIntegration,
  onUnhandledRejectionIntegration,
} from "@sentry/node";
import { readApiMonitoringConfig } from "./config";
import { sanitizeApiBreadcrumb, sanitizeApiEvent } from "./sanitize-event";

let enabled = false;

/** Whether API error capture is active. False in local dev, tests, and CI, and whenever monitoring is disabled or misconfigured. */
export function isApiMonitoringEnabled(): boolean {
  return enabled;
}

/**
 * Initializes (or leaves disabled) API monitoring. Must run before the Hono
 * application is constructed (see `src/instrument.ts`). Never throws: per the
 * fail-open design, a missing or malformed configuration logs at most one
 * warning and leaves monitoring off rather than preventing the API from
 * booting.
 */
export function initializeApiMonitoring(): void {
  const config = readApiMonitoringConfig();
  if (!config.enabled) {
    if (config.warning) console.warn(config.warning);
    enabled = false;
    return;
  }

  init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,

    // This project does not use performance tracing or SDK-side log capture.
    tracesSampleRate: 0,
    enableLogs: false,

    // Explicit deny-all: every data-collection category defaults off. Only
    // the small, sanitized tag set this adapter sets is ever attached to an
    // event (see sanitizeApiEvent's allowlist).
    dataCollection: {
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
    },

    // Only the small, explicit integration set this project needs — no
    // auto-instrumentation of HTTP, database, or other libraries.
    defaultIntegrations: false,
    integrations: [
      dedupeIntegration(),
      eventFiltersIntegration(),
      functionToStringIntegration(),
      // The only capture path for a process-level crash (see design doc);
      // preserves Node's existing non-zero-exit behavior.
      onUncaughtExceptionIntegration(),
      // 'strict' mirrors node's --unhandled-rejection=strict: an unhandled
      // rejection still crashes the process rather than being swallowed.
      onUnhandledRejectionIntegration({ mode: "strict" }),
    ],

    beforeSend: sanitizeApiEvent,
    beforeBreadcrumb: sanitizeApiBreadcrumb,
  });

  enabled = true;
}

/** Sanitized, allowlisted metadata attached to every captured API error. */
export interface ApiErrorMeta {
  /** Normalized route template (e.g. `/api/dogs/:id`), never a raw URL. */
  route: string;
  method: string;
  status: number;
  requestId: string;
}

/**
 * Captures an API error, but only when monitoring is enabled AND the
 * response is an unexpected server error (status >= 500). Expected 4xx
 * responses — validation, auth, not-found, rate-limit, ... — are never sent
 * to Sentry, including when raised as a framework `HTTPException`.
 */
export function captureApiError(error: unknown, meta: ApiErrorMeta): void {
  if (!enabled || meta.status < 500) return;
  captureException(error, {
    tags: {
      application: "api",
      route: meta.route,
      method: meta.method,
      status: meta.status,
      request_id: meta.requestId,
    },
  });
}

/**
 * Captures a fatal failure during API startup (environment validation,
 * database pool construction, port binding, ...), then flushes with a
 * bounded timeout so the event has a chance to reach Sentry before the
 * process exits. No-op when monitoring is disabled.
 */
export async function captureApiStartupFailure(error: unknown): Promise<void> {
  if (!enabled) return;
  captureException(error, {
    level: "fatal",
    tags: { application: "api" },
  });
  await flush(5000);
}
