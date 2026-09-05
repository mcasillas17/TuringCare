// Privacy-safe structured stderr logging for unexpected (>=500) API
// failures. Sentry capture (see sentry.ts) is fail-open: it is silently a
// no-op whenever monitoring is disabled, misconfigured, or guarded off by
// the Node major-version check. Without an independent log line, a
// production 5xx would then leave no operational signal at all. This module
// is that independent signal: it never depends on whether Sentry capture
// ran, and it is reused by both the thrown-error path (error-handler.ts) and
// the Better Auth response path (auth-handler.ts) so the two cannot drift.
//
// Only fixed, allowlisted fields are ever logged: requestId, normalized
// route, method, status, and a safe exception-type classification derived
// the same way Sentry's own sanitizer classifies it (see
// sanitize-event.ts#classifyExceptionValue). The raw error message, stack
// trace, thrown value, and any request/response body are never logged.

import { classifyExceptionValue, sanitizeApiErrorTags } from "./sanitize-event";

export interface ApiErrorLogMeta {
  requestId: string;
  route: string;
  method: string;
  status: number;
}

/**
 * Safely derives an `Error`'s constructor name for classification, without
 * ever reading `.message` or `.stack`. `undefined` for a non-`Error` throw
 * (e.g. a Better Auth response, which has no thrown value at all).
 */
function errorTypeOf(error: unknown): string | undefined {
  return error instanceof Error ? error.constructor.name : undefined;
}

/**
 * Emits exactly one structured `console.error` line for an unexpected server
 * error. Callers must invoke this at most once per request/response so a
 * single failure is never logged twice.
 */
export function logApiError(error: unknown, meta: ApiErrorLogMeta): void {
  const tags = sanitizeApiErrorTags({
    request_id: meta.requestId,
    route: meta.route,
    method: meta.method,
    status: meta.status,
  });
  console.error("[monitoring] unexpected server error", {
    requestId: tags?.request_id,
    route: tags?.route,
    method: tags?.method,
    status: tags?.status,
    errorType: classifyExceptionValue(errorTypeOf(error)),
  });
}
