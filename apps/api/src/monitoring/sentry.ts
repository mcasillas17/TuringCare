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
  getClient,
  init,
  isEnabled as isSentryEnabled,
  linkedErrorsIntegration,
  makeNodeTransport,
  onUncaughtExceptionIntegration,
} from "@sentry/node";
import { readApiMonitoringConfig } from "./config";
import { sanitizeApiBreadcrumb, sanitizeApiEvent } from "./sanitize-event";

let enabled = false;
let transportFailed = false;
let transportAcknowledged = false;
let fatalShutdownStarted = false;
const FLUSH_TIMEOUT_MS = 5000;

/**
 * True only after a bounded drain, an HTTP acknowledgement since initialization,
 * and no observed transport/sanitizer failure. Still not proof of Sentry indexing.
 */
export async function flushApiMonitoring(): Promise<boolean> {
  if (!enabled) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const drained = await Promise.race([
      flush(FLUSH_TIMEOUT_MS),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), FLUSH_TIMEOUT_MS);
      }),
    ]);
    if (!drained) console.warn("[monitoring] flush timed out or did not drain");
    if (drained && !transportFailed && !transportAcknowledged) {
      console.warn("[monitoring] no event acknowledged; delivery unconfirmed");
    }
    return drained && !transportFailed && transportAcknowledged;
  } catch {
    console.warn("[monitoring] flush failed");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** The SDK has already captured the fatal error; never log its raw value. */
function exitAfterFatalCapture(): void {
  if (fatalShutdownStarted) return;
  fatalShutdownStarted = true;
  console.error("[monitoring] fatal process failure; exiting with status 1");
  void flushApiMonitoring().finally(() => process.exit(1));
}

/** Whether API error capture is active. False when unconfigured, unsupported, or initialization failed; not proof of delivery. */
export function isApiMonitoringEnabled(): boolean {
  return enabled;
}

/**
 * Only Node 22 is supported for Sentry init under this project's `tsx`
 * runtime (Dockerfile.api, .nvmrc, CI, and package.json engines). A previous
 * Sentry + tsx startup failure on newer Node versions motivated this guard.
 * Keep it until the monitoring-enabled image gate proves any new major. Pure and side-effect-free so tests can
 * exercise both branches without spawning a real process.
 */
export function isSupportedMonitoringNodeMajor(nodeVersion: string): boolean {
  return nodeMajorVersion(nodeVersion) === 22;
}

/** Parses the major version out of a `process.version`-style string, e.g. `"v22.4.0"` -> `22`. */
function nodeMajorVersion(nodeVersion: string): number {
  return Number.parseInt(nodeVersion.replace(/^v/, "").split(".")[0] ?? "", 10);
}

/**
 * Initializes (or leaves disabled) API monitoring. Must run before the Hono
 * application is constructed (see `src/instrument.ts`). Never throws: per the
 * fail-open design, a missing or malformed configuration logs at most one
 * warning and leaves monitoring off rather than preventing the API from
 * booting. `nodeVersion` defaults to the running process's version but is
 * injectable so tests can prove the Node 22/>=24 behavior without actually
 * running under a different Node binary.
 */
export function initializeApiMonitoring(nodeVersion: string = process.version): void {
  const config = readApiMonitoringConfig();
  if (!config.enabled) {
    if (config.warning) console.warn(`[monitoring] ${config.warning}`);
    enabled = false;
    return;
  }

  // A runtime bump must update the support contract and pass the real-SDK
  // image gate; removing this guard alone is not compatibility evidence.
  if (!isSupportedMonitoringNodeMajor(nodeVersion)) {
    console.warn("[monitoring] monitoring disabled: Sentry with the tsx runtime requires Node 22");
    enabled = false;
    return;
  }

  transportFailed = false;
  transportAcknowledged = false;
  try {
    const client = init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,

      // This project does not use performance tracing or SDK-side log capture.
      tracesSampleRate: 0,
      enableLogs: false,
      sendClientReports: false,
      initialScope: {
        tags: {
          application: "api",
          route: "process",
          method: "PROCESS",
          status: "500",
          request_id: "process",
        },
      },
      // Observe the actual transport response: SDK flush can return true after
      // HTTP rejection, rate-limit drops, or a settled network failure.
      transport(options) {
        const transport = makeNodeTransport(options);
        return {
          flush: (timeout) => transport.flush(timeout),
          send: (envelope) =>
            transport.send(envelope).then(
              (response) => {
                if (
                  !response.statusCode ||
                  response.statusCode < 200 ||
                  response.statusCode >= 300
                ) {
                  transportFailed = true;
                  console.warn("[monitoring] transport did not acknowledge event");
                } else {
                  transportAcknowledged = true;
                }
                return response;
              },
              () => {
                transportFailed = true;
                console.warn("[monitoring] transport failed");
                throw new Error("Monitoring transport failed");
              },
            ),
        };
      },

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
        // Links an `Error#cause` chain (e.g. `sendFailedException`'s stored
        // provider error) into `event.exception.values` as additional entries,
        // capped at Sentry's default depth of 5 causes. This never bypasses
        // the sanitizer: `sanitizeApiEvent` already maps every entry in
        // `event.exception.values` through the same allowlist independently
        // (see sanitize-event.ts), so each linked cause is normalized on its
        // own — no raw message/stack var ever reaches Sentry, for the wrapper
        // exception or any of its causes.
        linkedErrorsIntegration(),
        // The only capture path for a process-level crash (see design doc);
        // preserves Node's existing non-zero-exit behavior.
        onUncaughtExceptionIntegration({
          exitEvenIfOtherHandlersAreRegistered: true,
          onFatalError: exitAfterFatalCapture,
        }),
        {
          name: "ApiUnhandledRejection",
          setup() {
            process.on("unhandledRejection", (error: unknown) => {
              // In strict mode Node already invoked the uncaught handler.
              // Handling this second notification prevents Node printing the
              // raw rejection. The fallback also stays fatal if a caller
              // launches without the documented strict flag.
              if (fatalShutdownStarted) return;
              try {
                captureException(error, { level: "fatal" });
              } catch {
                console.warn("[monitoring] capture failed");
              }
              exitAfterFatalCapture();
            });
          },
        },
      ],

      beforeSend(event, hint) {
        const sanitized = sanitizeApiEvent(event, hint);
        if (!sanitized) {
          transportFailed = true;
          console.warn("[monitoring] sanitization failed; event dropped");
        }
        return sanitized;
      },
      beforeBreadcrumb: sanitizeApiBreadcrumb,
    });

    enabled = Boolean(client) && isSentryEnabled();
    if (!enabled) console.warn("[monitoring] initialization failed; monitoring disabled");
  } catch {
    enabled = false;
    const client = getClient();
    if (client) client.getOptions().enabled = false;
    console.warn("[monitoring] initialization failed; monitoring disabled");
  }
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
 * to Sentry, including when raised as a framework `HTTPException`. Returns
 * the queued Sentry event ID (not delivery confirmation), or `undefined` when
 * monitoring is disabled or the status doesn't qualify.
 */
export function captureApiError(error: unknown, meta: ApiErrorMeta): string | undefined {
  if (!enabled || meta.status < 500) return undefined;
  try {
    return captureException(error, {
      tags: {
        application: "api",
        route: meta.route,
        method: meta.method,
        status: meta.status,
        request_id: meta.requestId,
      },
    });
  } catch {
    console.warn("[monitoring] capture failed");
    return undefined;
  }
}

/**
 * Captures a fatal failure during API startup (environment validation,
 * database pool construction, port binding, ...), then flushes with a
 * bounded timeout so the event has a chance to reach Sentry before the
 * process exits. No-op when monitoring is disabled.
 */
export async function captureApiStartupFailure(error: unknown): Promise<boolean> {
  if (!enabled) return false;
  try {
    captureException(error, {
      level: "fatal",
      tags: {
        application: "api",
        route: "startup",
        method: "STARTUP",
        status: "500",
        request_id: "startup",
      },
    });
  } catch {
    console.warn("[monitoring] capture failed");
    return false;
  }
  return flushApiMonitoring();
}
