// Strict, allowlist-based Sentry event sanitizer for the API. Sentry event
// payloads can carry arbitrary application state (request bodies, headers,
// user records, exception messages, breadcrumbs, ...). Any of that may
// contain resident/owner data that must never leave the process boundary.
// Rather than trying to redact known-bad fields, this module builds a fresh
// event from scratch and copies over only the small, explicitly-approved set
// of fields below. Anything not copied here is dropped, including fields
// added to future Sentry SDK versions.

import type { ErrorEvent, EventHint, Exception, StackFrame } from "@sentry/node";

/** The only tag keys ever forwarded to Sentry. */
const ALLOWED_TAGS = ["application", "route", "method", "status", "request_id"] as const;

/**
 * Matches short, code-identifier-shaped strings (e.g. exception/mechanism
 * type names like `TypeError` or `onunhandledrejection`). Used to allow a
 * small amount of structural information through while rejecting anything
 * that could be (or contain) free-form application/owner content.
 */
const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_$.]{0,63}$/;

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value);
}

/**
 * Classifies a (possibly unsafe/attacker- or application-controlled)
 * exception type into a fixed, safe message. The raw exception message/value
 * is never forwarded: only a short, generic sentence is ever sent to Sentry.
 */
export function classifyExceptionValue(type: string | undefined): string {
  return isSafeIdentifier(type) ? `Unexpected ${type}` : "Unexpected application error";
}

/** The sanitized exception `type` field itself must also be safe. */
function sanitizeExceptionType(type: string | undefined): string {
  return isSafeIdentifier(type) ? type : "Error";
}

function sanitizeMechanism(mechanism: Exception["mechanism"]): Exception["mechanism"] | undefined {
  if (!mechanism) return undefined;
  const sanitized: NonNullable<Exception["mechanism"]> = {
    type: isSafeIdentifier(mechanism.type) ? mechanism.type : "generic",
  };
  if (mechanism.handled !== undefined) sanitized.handled = mechanism.handled;
  if (mechanism.synthetic !== undefined) sanitized.synthetic = mechanism.synthetic;
  return sanitized;
}

/** Preserves only the stack frame fields needed for triage/symbolication. */
function sanitizeStackFrame(frame: StackFrame): StackFrame {
  const sanitized: StackFrame = {};
  if (frame.filename !== undefined) sanitized.filename = frame.filename;
  if (frame.abs_path !== undefined) sanitized.abs_path = frame.abs_path;
  if (frame.module !== undefined) sanitized.module = frame.module;
  if (frame.function !== undefined) sanitized.function = frame.function;
  if (frame.lineno !== undefined) sanitized.lineno = frame.lineno;
  if (frame.colno !== undefined) sanitized.colno = frame.colno;
  if (frame.in_app !== undefined) sanitized.in_app = frame.in_app;
  if (frame.debug_id !== undefined) sanitized.debug_id = frame.debug_id;
  return sanitized;
}

function sanitizeException(exception: Exception): Exception {
  const sanitized: Exception = {
    type: sanitizeExceptionType(exception.type),
    value: classifyExceptionValue(exception.type),
  };

  const mechanism = sanitizeMechanism(exception.mechanism);
  if (mechanism) sanitized.mechanism = mechanism;

  if (exception.stacktrace?.frames) {
    sanitized.stacktrace = { frames: exception.stacktrace.frames.map(sanitizeStackFrame) };
  }

  return sanitized;
}

/** A tag value is only ever forwarded when it is a plain string or number. */
function isSafeTagValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function sanitizeTags(tags: ErrorEvent["tags"]): ErrorEvent["tags"] | undefined {
  if (!tags) return undefined;
  const sanitized: NonNullable<ErrorEvent["tags"]> = {};
  for (const key of ALLOWED_TAGS) {
    const value = tags[key];
    if (key in tags && isSafeTagValue(value)) sanitized[key] = value;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

/**
 * Sentry `beforeSend` hook. Builds and returns a brand-new `ErrorEvent`
 * containing only allowlisted fields, or `null` if sanitization itself
 * throws (fail closed: never forward an event we couldn't sanitize).
 */
export function sanitizeApiEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  try {
    const sanitized: ErrorEvent = { type: undefined };

    // Operational metadata: identifies/dates/environments the event without
    // carrying any application or owner content.
    if (event.event_id !== undefined) sanitized.event_id = event.event_id;
    if (event.timestamp !== undefined) sanitized.timestamp = event.timestamp;
    if (event.platform !== undefined) sanitized.platform = event.platform;
    if (event.level !== undefined) sanitized.level = event.level;
    if (event.release !== undefined) sanitized.release = event.release;
    if (event.environment !== undefined) sanitized.environment = event.environment;

    const tags = sanitizeTags(event.tags);
    if (tags) sanitized.tags = tags;

    if (event.exception?.values) {
      sanitized.exception = { values: event.exception.values.map(sanitizeException) };
    }

    // Source-map symbolication metadata only (image paths/debug ids); no
    // application content lives here.
    if (event.debug_meta) sanitized.debug_meta = event.debug_meta;

    if (event.request?.method) sanitized.request = { method: event.request.method };

    return sanitized;
  } catch {
    return null;
  }
}

/**
 * Sentry `beforeBreadcrumb` hook. Breadcrumbs routinely capture request/response
 * bodies, console output, and other free-form application data, so none of
 * that risk is worth the diagnostic value: every breadcrumb is dropped.
 */
export function sanitizeApiBreadcrumb(_breadcrumb?: unknown, _hint?: unknown): null {
  return null;
}
