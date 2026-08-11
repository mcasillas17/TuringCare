import type { ErrorEvent, EventHint } from "@sentry/node";
import { describe, expect, it } from "vitest";
import { classifyExceptionValue, sanitizeApiBreadcrumb, sanitizeApiEvent } from "./sanitize-event";

const SENTINEL = "OWNER-CONTENT-DO-NOT-SEND";
const hint: EventHint = {};

/** Minimal, otherwise-empty ErrorEvent to extend in individual tests. */
function baseEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return { type: undefined, ...overrides };
}

/** Recursively asserts that the sentinel never appears anywhere in a value. */
function assertNoSentinel(value: unknown): void {
  expect(JSON.stringify(value)).not.toContain(SENTINEL);
}

describe("sanitizeApiEvent", () => {
  it("drops every field not on the explicit allowlist", () => {
    const event = baseEvent({
      event_id: "3c1b8f2a4d5e4c6f9a0b1c2d3e4f5061",
      timestamp: 1_700_000_000,
      level: "error",
      platform: "node",
      release: "api@1.4.2",
      environment: "production",
      message: SENTINEL,
      logentry: { message: SENTINEL },
      transaction: SENTINEL,
      user: { id: SENTINEL, email: `${SENTINEL}@example.com` },
      extra: { note: SENTINEL },
      breadcrumbs: [{ message: SENTINEL }],
      contexts: { custom: { note: SENTINEL } },
      request: {
        url: `https://example.com/${SENTINEL}`,
        method: "POST",
        headers: { Authorization: SENTINEL },
        data: { secret: SENTINEL },
        query_string: `token=${SENTINEL}`,
        cookies: { session: SENTINEL },
      },
      tags: {
        application: "api",
        route: "/patients/:id",
        method: "POST",
        status: "500",
        request_id: "req-123",
        unapproved: SENTINEL,
        another_bad_tag: SENTINEL,
      },
      server_name: SENTINEL,
      dist: SENTINEL,
      sdk: { name: SENTINEL, version: "1.0.0" },
      fingerprint: [SENTINEL],
      modules: { foo: SENTINEL },
    });

    const result = sanitizeApiEvent(event, hint);

    expect(result).toEqual({
      type: undefined,
      event_id: "3c1b8f2a4d5e4c6f9a0b1c2d3e4f5061",
      timestamp: 1_700_000_000,
      level: "error",
      platform: "node",
      release: "api@1.4.2",
      environment: "production",
      tags: {
        application: "api",
        route: "/patients/:id",
        method: "POST",
        status: "500",
        request_id: "req-123",
      },
      request: { method: "POST" },
    });
    assertNoSentinel(result);
  });

  it("drops non-string/number tag values even under an approved tag key", () => {
    const event = baseEvent({
      tags: {
        application: { nested: SENTINEL } as unknown as string,
        route: true as unknown as string,
        method: null as unknown as string,
        status: [SENTINEL] as unknown as string,
        request_id: "req-123",
      },
    });

    const result = sanitizeApiEvent(event, hint);

    expect(result).toEqual({
      type: undefined,
      tags: { request_id: "req-123" },
    });
    assertNoSentinel(result);
  });

  it("normalizes a TypeError, classifying its message without leaking raw content", () => {
    const event = baseEvent({
      exception: {
        values: [
          {
            type: "TypeError",
            value: `Cannot read property 'x' of ${SENTINEL}`,
            stacktrace: { frames: [] },
          },
        ],
      },
    });

    const result = sanitizeApiEvent(event, hint);

    expect(result?.exception?.values).toEqual([
      {
        type: "TypeError",
        value: "Unexpected TypeError",
        stacktrace: { frames: [] },
      },
    ]);
    assertNoSentinel(result);
  });

  it("falls back to a safe generic type and value when the exception type is unsafe", () => {
    const event = baseEvent({
      exception: {
        values: [
          {
            type: `Custom Error <${SENTINEL}>`,
            value: SENTINEL,
          },
        ],
      },
    });

    const result = sanitizeApiEvent(event, hint);

    expect(result?.exception?.values).toEqual([
      {
        type: "Error",
        value: "Unexpected application error",
      },
    ]);
    assertNoSentinel(result);
  });

  it("falls back to a safe generic type and value when the exception type is missing", () => {
    const event = baseEvent({
      exception: { values: [{ value: SENTINEL }] },
    });

    const result = sanitizeApiEvent(event, hint);

    expect(result?.exception?.values).toEqual([
      { type: "Error", value: "Unexpected application error" },
    ]);
    assertNoSentinel(result);
  });

  it("classifies mechanism type but always drops mechanism data", () => {
    const event = baseEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: SENTINEL,
            mechanism: {
              type: "onunhandledrejection",
              handled: false,
              synthetic: true,
              data: { handler: SENTINEL },
            },
          },
        ],
      },
    });

    const result = sanitizeApiEvent(event, hint);

    expect(result?.exception?.values?.[0]?.mechanism).toEqual({
      type: "onunhandledrejection",
      handled: false,
      synthetic: true,
    });
    assertNoSentinel(result);
  });

  it("falls back to a generic mechanism type when the mechanism type is unsafe", () => {
    const event = baseEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: "irrelevant",
            mechanism: {
              type: `weird ${SENTINEL} type`,
              handled: true,
              data: { note: SENTINEL },
            },
          },
        ],
      },
    });

    const result = sanitizeApiEvent(event, hint);

    expect(result?.exception?.values?.[0]?.mechanism).toEqual({
      type: "generic",
      handled: true,
    });
    assertNoSentinel(result);
  });

  it("preserves debug_meta symbolication data and safe stack frame fields, dropping source content", () => {
    const event = baseEvent({
      debug_meta: {
        images: [{ type: "sourcemap", code_file: "app.js", debug_id: "abc-123" }],
      },
      exception: {
        values: [
          {
            type: "Error",
            value: SENTINEL,
            stacktrace: {
              frames: [
                {
                  filename: "app.js",
                  abs_path: "/srv/app.js",
                  module: "app",
                  function: "handler",
                  lineno: 42,
                  colno: 7,
                  in_app: true,
                  debug_id: "abc-123",
                  context_line: SENTINEL,
                  pre_context: [SENTINEL],
                  post_context: [SENTINEL],
                  vars: { secret: SENTINEL },
                },
              ],
            },
          },
        ],
      },
    });

    const result = sanitizeApiEvent(event, hint);

    expect(result?.debug_meta).toEqual({
      images: [{ type: "sourcemap", code_file: "app.js", debug_id: "abc-123" }],
    });
    expect(result?.exception?.values?.[0]?.stacktrace?.frames).toEqual([
      {
        filename: "app.js",
        abs_path: "/srv/app.js",
        module: "app",
        function: "handler",
        lineno: 42,
        colno: 7,
        in_app: true,
        debug_id: "abc-123",
      },
    ]);
    assertNoSentinel(result);
  });

  it("returns null when reading the event throws", () => {
    const event = baseEvent();
    Object.defineProperty(event, "tags", {
      get() {
        throw new Error(SENTINEL);
      },
    });

    expect(sanitizeApiEvent(event, hint)).toBeNull();
  });
});

describe("classifyExceptionValue", () => {
  it("returns Unexpected <Type> for safe identifier-shaped types", () => {
    expect(classifyExceptionValue("TypeError")).toBe("Unexpected TypeError");
    expect(classifyExceptionValue("Custom_Error$1")).toBe("Unexpected Custom_Error$1");
  });

  it("returns a generic message for unsafe or missing types", () => {
    expect(classifyExceptionValue(`Bad ${SENTINEL}`)).toBe("Unexpected application error");
    expect(classifyExceptionValue(undefined)).toBe("Unexpected application error");
    expect(classifyExceptionValue("")).toBe("Unexpected application error");
  });
});

describe("sanitizeApiBreadcrumb", () => {
  it("always drops every breadcrumb", () => {
    expect(sanitizeApiBreadcrumb({ message: SENTINEL }, {})).toBeNull();
    expect(sanitizeApiBreadcrumb({ category: "http", data: { url: SENTINEL } }, {})).toBeNull();
    expect(sanitizeApiBreadcrumb({}, {})).toBeNull();
  });

  it("compiles and returns null when called with no arguments", () => {
    expect(sanitizeApiBreadcrumb()).toBeNull();
  });
});
