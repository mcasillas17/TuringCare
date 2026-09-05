// Strict, allowlist-based Sentry event sanitizer for the API. Sentry event
// payloads can carry arbitrary application state (request bodies, headers,
// user records, exception messages, breadcrumbs, ...). Any of that may
// contain resident/owner data that must never leave the process boundary.
// Rather than trying to redact known-bad fields, this module builds a fresh
// event from scratch and copies over only the small, explicitly-approved set
// of fields below. Anything not copied here is dropped, including fields
// added to future Sentry SDK versions.

import { realpathSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ErrorEvent, EventHint, Exception, StackFrame } from "@sentry/node";
import { isApiMonitoringRelease } from "./config";

// Only shipped workspace source locations are diagnostic metadata. A custom
// Error.stack can forge arbitrary filenames; syntax/prefix checks alone are
// insufficient. Probe only these code directories, never application data.
const BUILTIN_MODULES = new Set(builtinModules.map((name) => `node:${name.replace(/^node:/, "")}`));
const SOURCE_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SOURCE_PATH =
  /^(?:apps\/api|packages\/(?:shared|i18n))\/src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.tsx?$/;
const DEBUG_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function safeSourceFilename(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 512) return undefined;
  if (BUILTIN_MODULES.has(value)) return value;
  if (value.startsWith("node:internal/")) return "node:internal";
  try {
    let path = value;
    if (path.startsWith("file:")) {
      const url = new URL(path);
      if (url.search || url.hash) return undefined;
      path = fileURLToPath(url);
    }
    const normalized = isAbsolute(path) ? relative(SOURCE_ROOT, path) : path;
    if (!SOURCE_PATH.test(normalized)) return undefined;
    const absolute = resolve(SOURCE_ROOT, normalized);
    if (realpathSync(absolute) !== absolute || !statSync(absolute).isFile()) return undefined;
    return normalized;
  } catch {
    return undefined;
  }
}

function isDebugId(value: unknown): value is string {
  return typeof value === "string" && DEBUG_ID.test(value);
}

function isLineNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

// Only routes obtained from Hono's registered templates may leave the process.
// This set grows only with code-defined routes encountered by the middleware,
// never with raw URLs, parameter values, or SDK event fields.
const MONITORING_ROUTES = new Set(["startup", "process", "unmatched"]);
export function registerApiMonitoringRoutes(routes: readonly { path: string }[]): void {
  for (const route of routes) MONITORING_ROUTES.add(route.path);
}

/**
 * Fixed HTTP methods and diagnostic categories. An uppercase identifier is
 * not inherently safe: arbitrary client methods can contain private content.
 */
const SAFE_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "CONNECT",
  "TRACE",
  "MANUAL",
  "STARTUP",
  "PROCESS",
]);

function isSafeMethod(value: unknown): value is string {
  return typeof value === "string" && SAFE_METHODS.has(value);
}

/** The only debug image fields ever forwarded: enough to symbolicate stack frames. */
interface SanitizedDebugImage {
  type?: string;
  code_file?: string;
  debug_id?: string;
}

/**
 * Rebuilds a single debug image from scratch, preserving only the
 * symbolication fields the approved plan allows. Malformed entries (not an
 * object, missing/non-string fields) are handled safely: unsafe fields are
 * simply omitted rather than thrown on.
 */
function sanitizeDebugImage(image: unknown): SanitizedDebugImage | null {
  if (typeof image !== "object" || image === null) return null;
  const raw = image as Record<string, unknown>;
  const sanitized: SanitizedDebugImage = {};
  if (raw.type === "sourcemap") sanitized.type = raw.type;
  const file = safeSourceFilename(raw.code_file);
  if (file) sanitized.code_file = file;
  if (isDebugId(raw.debug_id)) sanitized.debug_id = raw.debug_id;
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

/**
 * Rebuilds `debug_meta` from scratch, keeping only a fresh `images` array of
 * sanitized entries (never the original object/array by reference). Any
 * other `debug_meta` key, and any other per-image key, is dropped. Absent or
 * malformed `debug_meta`/`images` values are handled safely and simply
 * result in no `debug_meta` being forwarded.
 */
function sanitizeDebugMeta(
  debugMeta: ErrorEvent["debug_meta"],
): ErrorEvent["debug_meta"] | undefined {
  if (!debugMeta || !Array.isArray(debugMeta.images)) return undefined;
  const images = debugMeta.images
    .map(sanitizeDebugImage)
    .filter((image): image is SanitizedDebugImage => image !== null);
  // The sanitized image shape intentionally carries only a subset of the
  // Sentry SDK's `DebugImage` union fields, so it's cast back to the SDK
  // type here rather than trying to satisfy every union variant exactly.
  return images.length > 0 ? ({ images } as ErrorEvent["debug_meta"]) : undefined;
}

// Exception and mechanism names can be overwritten by application data.
// Only these fixed runtime/framework classifications carry diagnostic meaning.
const EXCEPTION_TYPES = new Set([
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
  "AggregateError",
  "HTTPException",
  "ZodError",
]);
const MECHANISM_TYPES = new Set([
  "generic",
  "chained",
  "onuncaughtexception",
  "onunhandledrejection",
  "auto.core.node.onuncaughtexception",
  "auto.core.node.onunhandledrejection",
]);

/**
 * Classifies a (possibly unsafe/attacker- or application-controlled)
 * exception type into a fixed, safe message. The raw exception message/value
 * is never forwarded: only a short, generic sentence is ever sent to Sentry.
 */
export function classifyExceptionValue(type: string | undefined): string {
  return type && EXCEPTION_TYPES.has(type) ? `Unexpected ${type}` : "Unexpected application error";
}

/** The sanitized exception `type` field itself must also be safe. */
function sanitizeExceptionType(type: string | undefined): string {
  return type && EXCEPTION_TYPES.has(type) ? type : "Error";
}

function sanitizeMechanism(mechanism: Exception["mechanism"]): Exception["mechanism"] | undefined {
  if (!mechanism) return undefined;
  const sanitized: NonNullable<Exception["mechanism"]> = {
    type: MECHANISM_TYPES.has(mechanism.type) ? mechanism.type : "generic",
  };
  if (typeof mechanism.handled === "boolean") sanitized.handled = mechanism.handled;
  if (typeof mechanism.synthetic === "boolean") sanitized.synthetic = mechanism.synthetic;
  return sanitized;
}

/** Preserves only the stack frame fields needed for triage/symbolication. */
function sanitizeStackFrame(frame: StackFrame): StackFrame {
  const sanitized: StackFrame = {};
  const file = safeSourceFilename(frame.filename) ?? safeSourceFilename(frame.abs_path);
  if (file) sanitized.filename = file;
  // Function/module names and absolute paths are forgeable strings; filename
  // plus position retains useful source diagnosis without forwarding them.
  if (isLineNumber(frame.lineno)) sanitized.lineno = frame.lineno;
  if (isLineNumber(frame.colno)) sanitized.colno = frame.colno;
  if (typeof frame.in_app === "boolean") sanitized.in_app = frame.in_app;
  if (isDebugId(frame.debug_id)) sanitized.debug_id = frame.debug_id;
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

/** Shared event/log metadata contract; approved keys alone do not make values safe. */
export function sanitizeApiErrorTags(tags: ErrorEvent["tags"]): ErrorEvent["tags"] | undefined {
  if (!tags) return undefined;
  const sanitized: NonNullable<ErrorEvent["tags"]> = {};
  if (tags.application === "api") sanitized.application = "api";
  if (typeof tags.route === "string" && MONITORING_ROUTES.has(tags.route)) {
    sanitized.route = tags.route;
  }
  if (isSafeMethod(tags.method)) sanitized.method = tags.method;
  const status = tags.status;
  if (
    (typeof status === "number" && Number.isInteger(status) && status >= 500 && status <= 599) ||
    (typeof status === "string" && /^5[0-9]{2}$/.test(status))
  )
    sanitized.status = status;
  const requestId = tags.request_id;
  if (
    typeof requestId === "string" &&
    (/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(requestId) ||
      ["startup", "process", "unknown"].includes(requestId))
  )
    sanitized.request_id = requestId;
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
    if (typeof event.event_id === "string" && /^[a-f0-9]{32}$/.test(event.event_id))
      sanitized.event_id = event.event_id;
    if (
      typeof event.timestamp === "number" &&
      Number.isFinite(event.timestamp) &&
      event.timestamp > 0
    )
      sanitized.timestamp = event.timestamp;
    if (event.platform === "node") sanitized.platform = "node";
    if (event.level === "error" || event.level === "fatal") sanitized.level = event.level;
    if (isApiMonitoringRelease(event.release)) sanitized.release = event.release;
    if (event.environment === "production") sanitized.environment = "production";

    const tags = sanitizeApiErrorTags(event.tags);
    if (tags) sanitized.tags = tags;

    if (event.exception?.values) {
      sanitized.exception = { values: event.exception.values.map(sanitizeException) };
    }

    // Source-map symbolication metadata only (image type/code_file/debug_id);
    // rebuilt from scratch so no other debug_meta/image key or object
    // reference ever passes through.
    const debugMeta = sanitizeDebugMeta(event.debug_meta);
    if (debugMeta) sanitized.debug_meta = debugMeta;

    const method = event.request?.method;
    if (isSafeMethod(method)) sanitized.request = { method };

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
