# Sentry Production Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-safe production error monitoring for the API and web application, correlate failures with request IDs and releases, upload private web source maps, and route actionable Sentry alerts into deduplicated GitHub Issues.

**Architecture:** The API and web app use separate Sentry projects and separate SDK packages, but enforce the same allowlist policy: no user identity, content, request bodies, query strings, cookies, authorization data, or free-form context leaves the application. Pure sanitizers shape every event before transport; if shaping fails, `beforeSend` returns `null`. Sanitized events keep exactly the metadata symbolication and triage need — stack-frame paths/modules, `debug_meta` build identifiers, and a safe exception `mechanism` — while the exception *value* is normalized to a fixed classification string so no arbitrary error text is transmitted. The API assigns a request ID to every response, reports unexpected server exceptions, and keeps the Node crash handlers so an uncaught exception or unhandled rejection is reported before the process exits non-zero; the browser deliberately runs without global handlers so the error boundary and monitored fetch are the only capture paths and no failure is reported twice. The web app reports render failures plus network/5xx API failures and retains the API request ID for support correlation. Monitoring configuration is resolved fail-open: a missing or malformed Sentry variable disables capture with a warning and never crashes an application, and a build without upload credentials emits no source map at all.

**Tech Stack:** Node 22, TypeScript, Hono, React 19, Vite 6, Vitest, `@sentry/node`, `@sentry/react`, `@sentry/vite-plugin`, Fly.io, Cloudflare Pages, GitHub Actions.

---

## Execution order

This plan ships **first**. `docs/superpowers/plans/2026-08-10-backup-restore-readiness.md`
ships **second**. The two are separately shippable — neither imports code from
the other — but monitoring lands first so a restore drill that goes wrong is
already observable, and so the `DEPLOY.md` section numbering below is
deterministic.

This plan appends exactly one new `DEPLOY.md` section: **`## 9. Production error
monitoring (Sentry)`**, inserted after `## 8. Rollback` and before
`## Quick reference`. The recovery plan appends `## 10. Database recovery
readiness`. Do not renumber or edit the other plan's section.

## File map

- Create `apps/api/src/monitoring/config.ts`: pure, fail-open monitoring configuration resolver.
- Create `apps/api/src/monitoring/config.test.ts`: enable/disable/warn and no-throw tests.
- Create `apps/api/src/monitoring/sanitize-event.ts`: allowlist-shaped Sentry event sanitizer.
- Create `apps/api/src/monitoring/sanitize-event.test.ts`: forbidden-data, symbolication, and failure-path tests.
- Create `apps/api/src/monitoring/sentry.ts`: production-only initialization and capture adapter.
- Create `apps/api/src/monitoring/request-id.ts`: request-ID generation, validation, and Hono middleware.
- Create `apps/api/src/monitoring/request-id.test.ts`: request-ID propagation tests.
- Create `apps/api/src/monitoring/error-handler.ts`: reusable Hono `onError` handler that preserves `HTTPException` responses.
- Create `apps/api/src/monitoring/error-handler.test.ts`: 4xx/5xx classification tests against a throwaway Hono app.
- Create `apps/api/src/monitoring/diagnostic.ts`: operator-only API test event (API project only).
- Create `apps/api/src/instrument.ts`: preload that initializes the SDK before application modules.
- Modify `apps/api/src/env.ts`: comment only — point at `monitoring/config.ts` and record why Sentry vars are not in the fail-fast schema.
- Modify `apps/api/src/app.ts`: install request-ID middleware, CORS header exposure, and the shared error handler.
- Modify `apps/api/src/app.test.ts`: add request-ID header and CORS exposure assertions to the existing suite.
- Modify `apps/api/src/index.ts`: startup-failure capture, flush, and non-zero exit.
- Modify `apps/api/package.json`, `apps/web/package.json`, `pnpm-lock.yaml`: SDK dependencies and the diagnostic script.
- Modify `Dockerfile.api`: preload `src/instrument.ts`.
- Create `apps/web/src/monitoring/config.ts`: browser fail-open monitoring configuration resolver.
- Create `apps/web/src/monitoring/config.test.ts`: `vi.stubEnv`-based enable/disable/warn tests.
- Create `apps/web/src/monitoring/sanitize-event.ts`: browser event sanitizer.
- Create `apps/web/src/monitoring/sanitize-event.test.ts`: browser privacy and symbolication regression tests.
- Create `apps/web/src/monitoring/sentry.ts`: production-only browser initialization, capture, and flush.
- Create `apps/web/src/monitoring/monitored-fetch.ts`: capture network/5xx failures without bodies or query strings.
- Create `apps/web/src/monitoring/monitored-fetch.test.ts`: request-ID and failure classification tests.
- Create `apps/web/src/monitoring/diagnostic-bridge.ts`: admin-only DevTools diagnostic bridge.
- Create `apps/web/src/monitoring/diagnostic-bridge.test.ts`: register/unregister and capture tests.
- Create `apps/web/src/monitoring/sentry-build-options.ts`: pure source-map upload option resolver used by `vite.config.ts`.
- Create `apps/web/src/monitoring/sentry-build-options.test.ts`: enabled/disabled/incomplete-upload tests.
- Create `apps/web/src/components/app-error-boundary.tsx`: localized fatal-render recovery UI.
- Create `apps/web/src/components/app-error-boundary.test.tsx`: boundary capture and retry tests.
- Modify `apps/web/src/lib/api.ts`: use the monitored fetch implementation.
- Modify `apps/web/src/lib/auth-client.ts`: route Better Auth traffic through the monitored fetch.
- Modify `apps/web/src/components/admin-shell/AdminShell.tsx`: register the diagnostic bridge while an admin is on `/admin`.
- Modify `apps/web/src/main.tsx`: initialize monitoring before render and install the boundary (Toaster placement unchanged).
- Modify `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`: fatal-error copy.
- Modify `apps/web/vite.config.ts`: conditional hidden source maps and the Sentry upload plugin.
- Modify `apps/web/tsconfig.node.json`: include the build-option helper so `tsc -b` sees it.
- Modify `.env.example`: document the optional, locally disabled monitoring variables.
- Modify `.github/workflows/deploy.yml`: one Git SHA release across API/web, blocking source-map upload, and a no-`.map` guard before Pages upload.
- Create `.github/workflows/sentry-diagnostic.yml`: manually approved operator-only API diagnostic.
- Create `docs/runbooks/production-monitoring.md`: setup, alerts, diagnosis, rollback, and privacy audit.
- Modify `DEPLOY.md`: new `## 9. Production error monitoring (Sentry)` section.
- Modify `README.md`: local disabled-mode behavior.
- Modify `docs/SECURITY-BACKLOG.md`: monitoring status.
- Modify `docs/PROJECT-LOG.md`: phase entry after the rollout is verified.

### Task 1: Add SDK dependencies and fail-open monitoring configuration

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/api/src/monitoring/config.ts`
- Create: `apps/api/src/monitoring/config.test.ts`
- Create: `apps/web/src/monitoring/config.ts`
- Create: `apps/web/src/monitoring/config.test.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add the SDK packages with pnpm**

Run:

```bash
pnpm --filter @turingcare/api add @sentry/node
pnpm --filter @turingcare/web add @sentry/react
pnpm --filter @turingcare/web add -D @sentry/vite-plugin
```

Expected: package manifests and `pnpm-lock.yaml` contain the resolved versions; do not hand-edit versions.

- [ ] **Step 2: Write failing API configuration tests**

Create `apps/api/src/monitoring/config.test.ts`. The resolver is pure, so most
cases pass a literal source; the `process.env` reader is exercised with
`vi.stubEnv` and cleaned up in `afterEach`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { readApiMonitoringConfig, resolveMonitoringConfig } from "./config";

const DSN = "https://public@example.ingest.sentry.io/1";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveMonitoringConfig", () => {
  it("is disabled and silent when nothing is configured", () => {
    expect(resolveMonitoringConfig({})).toEqual({ enabled: false });
  });

  it("is enabled when DSN, production, and release are all valid", () => {
    expect(
      resolveMonitoringConfig({ dsn: DSN, environment: "production", release: "720c524" }),
    ).toEqual({ enabled: true, dsn: DSN, environment: "production", release: "720c524" });
  });

  it("warns without throwing when the configuration is incomplete", () => {
    const config = resolveMonitoringConfig({ dsn: DSN, environment: "production" });
    expect(config.enabled).toBe(false);
    expect(config.enabled === false && config.warning).toContain("SENTRY_RELEASE");
  });

  it("warns without throwing when the DSN is malformed", () => {
    const config = resolveMonitoringConfig({
      dsn: "not-a-dsn",
      environment: "production",
      release: "720c524",
    });
    expect(config.enabled).toBe(false);
    expect(config.enabled === false && config.warning).toContain("SENTRY_DSN");
  });

  it("never enables capture outside production", () => {
    expect(
      resolveMonitoringConfig({ dsn: DSN, environment: "development", release: "720c524" }).enabled,
    ).toBe(false);
  });

  it("never leaks the configured DSN into the warning", () => {
    const config = resolveMonitoringConfig({ dsn: DSN, environment: "staging" });
    expect(config.enabled === false && config.warning).not.toContain(DSN);
  });
});

describe("readApiMonitoringConfig", () => {
  it("reads process.env without throwing on garbage", () => {
    vi.stubEnv("SENTRY_DSN", "}}}not a url{{{");
    vi.stubEnv("SENTRY_ENVIRONMENT", "production");
    vi.stubEnv("SENTRY_RELEASE", "720c524");
    expect(readApiMonitoringConfig().enabled).toBe(false);
  });
});
```

- [ ] **Step 3: Write failing web configuration tests**

Create `apps/web/src/monitoring/config.test.ts` with the same resolver cases plus
the browser-only production gate. `import.meta.env` is stubbed with `vi.stubEnv`
and cleaned up:

```ts
import { afterEach, expect, it, vi } from "vitest";
import { readWebMonitoringConfig } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

it("stays disabled in a development bundle even with a valid DSN", () => {
  vi.stubEnv("PROD", false);
  vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/2");
  vi.stubEnv("VITE_SENTRY_ENVIRONMENT", "production");
  vi.stubEnv("VITE_SENTRY_RELEASE", "720c524");
  expect(readWebMonitoringConfig().enabled).toBe(false);
});

it("is enabled for a production bundle with complete configuration", () => {
  vi.stubEnv("PROD", true);
  vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/2");
  vi.stubEnv("VITE_SENTRY_ENVIRONMENT", "production");
  vi.stubEnv("VITE_SENTRY_RELEASE", "720c524");
  expect(readWebMonitoringConfig().enabled).toBe(true);
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/monitoring/config.test.ts
pnpm --filter @turingcare/web exec vitest run src/monitoring/config.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 5: Implement the API resolver**

Create `apps/api/src/monitoring/config.ts`:

```ts
export type MonitoringConfig =
  | { enabled: false; warning?: string }
  | { enabled: true; dsn: string; environment: "production"; release: string };

export type MonitoringConfigSource = {
  dsn?: string | undefined;
  environment?: string | undefined;
  release?: string | undefined;
};

function isSentryDsn(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.username.length > 0;
  } catch {
    return false;
  }
}

/**
 * Fail-open by design: monitoring is a diagnostic side channel, so a missing or
 * malformed value disables capture with a warning instead of throwing. This is
 * why the Sentry variables are NOT part of the fail-fast schema in `src/env.ts`.
 */
export function resolveMonitoringConfig(source: MonitoringConfigSource): MonitoringConfig {
  const dsn = source.dsn?.trim() ?? "";
  const environment = source.environment?.trim() ?? "";
  const release = source.release?.trim() ?? "";
  if (!dsn && !environment && !release) return { enabled: false };

  const problems: string[] = [];
  if (!dsn || !isSentryDsn(dsn)) problems.push("SENTRY_DSN is missing or not a valid DSN URL");
  if (environment !== "production") problems.push('SENTRY_ENVIRONMENT must be "production"');
  if (release.length < 7) problems.push("SENTRY_RELEASE must be at least 7 characters");
  if (problems.length > 0) {
    // Never interpolate the configured values — only their variable names.
    return { enabled: false, warning: `monitoring disabled: ${problems.join("; ")}` };
  }
  return { enabled: true, dsn, environment: "production", release };
}

export function readApiMonitoringConfig(): MonitoringConfig {
  return resolveMonitoringConfig({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT,
    release: process.env.SENTRY_RELEASE,
  });
}
```

- [ ] **Step 6: Implement the web resolver**

Create `apps/web/src/monitoring/config.ts` with the same
`resolveMonitoringConfig` body (the two apps read different, incompatible env
sources — `process.env` at runtime versus `import.meta.env` inlined at build
time — so a small duplicated pure function is preferred over a shared-package
dependency for a non-DTO concern). Add the bundle gate:

```ts
export function readWebMonitoringConfig(): MonitoringConfig {
  if (!import.meta.env.PROD) return { enabled: false };
  return resolveMonitoringConfig({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT,
    release: import.meta.env.VITE_SENTRY_RELEASE,
  });
}
```

Declare the three `VITE_*` variables in `apps/web/src/vite-env.d.ts` if that file
exists, otherwise read them through `import.meta.env` with `string | undefined`
typing. Do not add a committed web `.env` file.

- [ ] **Step 7: Document the variables without making them fail-fast**

In `apps/api/src/env.ts`, add a comment above `export const env` (no schema
change):

```ts
// Monitoring (SENTRY_DSN / SENTRY_ENVIRONMENT / SENTRY_RELEASE) is deliberately
// NOT validated here. Error monitoring must fail open: a typo in a Sentry value
// must never stop the API from booting. See src/monitoring/config.ts.
```

In `.env.example`, add a commented block after the Resend section:

```bash
# ---- Error monitoring (Sentry) ----
# Unset locally/CI → monitoring is disabled (no SDK init, no network). In prod
# these are Fly secrets/deploy values (see DEPLOY.md). Capture only turns on
# when all three are valid AND SENTRY_ENVIRONMENT=production.
# SENTRY_DSN=
# SENTRY_ENVIRONMENT=production
# SENTRY_RELEASE=<deploy git sha>
```

- [ ] **Step 8: Run tests and typecheck**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/monitoring/config.test.ts
pnpm --filter @turingcare/web exec vitest run src/monitoring/config.test.ts
pnpm --filter @turingcare/api typecheck
pnpm --filter @turingcare/web typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/package.json apps/web/package.json pnpm-lock.yaml \
  apps/api/src/monitoring/config.ts apps/api/src/monitoring/config.test.ts \
  apps/web/src/monitoring/config.ts apps/web/src/monitoring/config.test.ts \
  apps/api/src/env.ts .env.example
git commit -m "build: add fail-open production monitoring configuration"
```

### Task 2: Enforce the API event privacy allowlist

**Files:**
- Create: `apps/api/src/monitoring/sanitize-event.ts`
- Create: `apps/api/src/monitoring/sanitize-event.test.ts`

- [ ] **Step 1: Write the forbidden-data regression test**

Use a sentinel that must never appear in serialized output, and assert that the
metadata symbolication and triage need **does** survive:

```ts
import type { ErrorEvent } from "@sentry/node";
import { expect, it } from "vitest";
import { sanitizeApiBreadcrumb, sanitizeApiEvent } from "./sanitize-event";

const SECRET = "OWNER-CONTENT-DO-NOT-SEND";

it("keeps only approved operational fields", () => {
  const event = {
    event_id: "abc",
    // `beforeSend` receives `ErrorEvent`, which is `Event & { type: undefined }`.
    // The property is required even though its only legal value is `undefined`,
    // so every fixture must declare it or `satisfies ErrorEvent` fails.
    type: undefined,
    level: "error",
    release: "720c524",
    environment: "production",
    message: `failure ${SECRET}`,
    user: { id: "owner-1", email: `owner+${SECRET}@example.com` },
    request: {
      url: `https://api.turingcare.dog/api/dogs?note=${SECRET}`,
      headers: { authorization: `Bearer ${SECRET}`, cookie: SECRET },
      data: { note: SECRET },
      method: "POST",
    },
    tags: {
      application: "api",
      route: "/api/dogs/:id",
      method: "POST",
      status: "500",
      request_id: "req-123",
      owner_name: SECRET,
    },
    extra: { journal: SECRET },
    breadcrumbs: [{ message: SECRET, category: "console" }],
    contexts: { runtime: { name: "node", version: "22" }, owner: { note: SECRET } },
    exception: {
      values: [
        {
          type: "TypeError",
          value: `Cannot read note "${SECRET}"`,
          mechanism: { type: "generic", handled: false, data: { note: SECRET } },
          stacktrace: {
            frames: [
              {
                filename: "/app/apps/api/src/routes/dogs.ts",
                abs_path: "/app/apps/api/src/routes/dogs.ts",
                module: "routes/dogs",
                function: "createDog",
                lineno: 42,
                colno: 7,
                in_app: true,
                context_line: `const note = "${SECRET}";`,
                pre_context: [SECRET],
                post_context: [SECRET],
                vars: { note: SECRET },
              },
            ],
          },
        },
      ],
    },
  } satisfies ErrorEvent;

  const sanitized = sanitizeApiEvent(event);

  expect(JSON.stringify(sanitized)).not.toContain(SECRET);
  expect(sanitized?.tags).toEqual({
    application: "api",
    route: "/api/dogs/:id",
    method: "POST",
    status: "500",
    request_id: "req-123",
  });
  expect(sanitized?.user).toBeUndefined();
  expect(sanitized?.extra).toBeUndefined();
  expect(sanitized?.breadcrumbs).toBeUndefined();
  expect(sanitized?.message).toBeUndefined();
  expect(sanitized?.request).toEqual({ method: "POST" });
});
```

Add the classification and symbolication assertions:

```ts
it("normalizes the exception value to a fixed classification", () => {
  const sanitized = sanitizeApiEvent({
    type: undefined,
    exception: { values: [{ type: "TypeError", value: `boom ${SECRET}` }] },
  } as ErrorEvent);
  expect(sanitized?.exception?.values?.[0]?.value).toBe("Unexpected TypeError");
  expect(JSON.stringify(sanitized)).not.toContain(SECRET);
});

it("falls back to a generic classification for an untrusted exception type", () => {
  const sanitized = sanitizeApiEvent({
    type: undefined,
    exception: { values: [{ type: `Error ${SECRET}`, value: SECRET }] },
  } as ErrorEvent);
  expect(sanitized?.exception?.values?.[0]?.value).toBe("Unexpected application error");
  expect(JSON.stringify(sanitized)).not.toContain(SECRET);
});

it("keeps handled/unhandled classification but drops mechanism data", () => {
  const sanitized = sanitizeApiEvent({
    type: undefined,
    exception: {
      values: [
        {
          type: "Error",
          mechanism: { type: "generic", handled: false, synthetic: true, data: { note: SECRET } },
        },
      ],
    },
  } as ErrorEvent);
  expect(sanitized?.exception?.values?.[0]?.mechanism).toEqual({
    type: "generic",
    handled: false,
    synthetic: true,
  });
});

it("keeps stack frame paths, modules, and debug metadata for symbolication", () => {
  const sanitized = sanitizeApiEvent({
    type: undefined,
    debug_meta: {
      images: [
        {
          type: "sourcemap",
          code_file: "https://turingcare.dog/assets/index-abc123.js",
          debug_id: "8f3a2c14-0f0e-4d5e-9b1a-000000000001",
        },
      ],
    },
    exception: {
      values: [
        {
          type: "Error",
          stacktrace: {
            frames: [
              {
                filename: "/app/apps/api/src/app.ts",
                abs_path: "/app/apps/api/src/app.ts",
                module: "app",
                function: "handler",
                lineno: 10,
                colno: 3,
                in_app: true,
                debug_id: "8f3a2c14-0f0e-4d5e-9b1a-000000000001",
              },
            ],
          },
        },
      ],
    },
  } as ErrorEvent);

  const frame = sanitized?.exception?.values?.[0]?.stacktrace?.frames?.[0];
  expect(frame?.abs_path).toBe("/app/apps/api/src/app.ts");
  expect(frame?.module).toBe("app");
  expect(frame?.debug_id).toBe("8f3a2c14-0f0e-4d5e-9b1a-000000000001");
  expect(frame?.context_line).toBeUndefined();
  expect(frame?.vars).toBeUndefined();
  expect(sanitized?.debug_meta?.images?.[0]).toMatchObject({
    type: "sourcemap",
    code_file: "https://turingcare.dog/assets/index-abc123.js",
  });
});
```

Also add:

```ts
it("returns null instead of sending when sanitization throws", () => {
  const event = { type: undefined } as ErrorEvent;
  Object.defineProperty(event, "tags", {
    get() {
      throw new Error("malformed event");
    },
  });
  expect(sanitizeApiEvent(event)).toBeNull();
});

it("drops every breadcrumb", () => {
  expect(sanitizeApiBreadcrumb()).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/api exec vitest run src/monitoring/sanitize-event.test.ts`

Expected: FAIL because `sanitizeApiEvent` is missing.

- [ ] **Step 3: Implement allowlist shaping**

Create `apps/api/src/monitoring/sanitize-event.ts`:

```ts
import type { ErrorEvent, EventHint, Exception, StackFrame } from "@sentry/node";

const ALLOWED_TAGS = ["application", "route", "method", "status", "request_id"] as const;
// Class names and mechanism types are code identifiers, never owner content.
const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_$.]{0,63}$/;

/**
 * Exception messages are free-form and routinely embed owner content
 * ("dog Luna not found"), so the value is replaced with a fixed classification
 * derived only from the exception type. Grouping still works because Sentry
 * groups on type + stack trace.
 */
export function classifyExceptionValue(type: string | undefined): string {
  return type && SAFE_IDENTIFIER.test(type) ? `Unexpected ${type}` : "Unexpected application error";
}

function safeFrame(frame: StackFrame): StackFrame {
  // abs_path/module/debug_id are required for symbolication and module grouping;
  // context_line/pre_context/post_context/vars can contain source values.
  return {
    filename: frame.filename,
    abs_path: frame.abs_path,
    module: frame.module,
    function: frame.function,
    lineno: frame.lineno,
    colno: frame.colno,
    in_app: frame.in_app,
    ...(frame.debug_id ? { debug_id: frame.debug_id } : {}),
  };
}

function safeMechanism(mechanism: Exception["mechanism"]): Exception["mechanism"] {
  if (!mechanism) return undefined;
  // `data` is arbitrary; only the handled/unhandled classification is kept.
  return {
    type: SAFE_IDENTIFIER.test(mechanism.type ?? "") ? mechanism.type : "generic",
    ...(mechanism.handled === undefined ? {} : { handled: mechanism.handled }),
    ...(mechanism.synthetic === undefined ? {} : { synthetic: mechanism.synthetic }),
  };
}

function safeException(event: ErrorEvent): ErrorEvent["exception"] {
  const values = event.exception?.values?.map(
    (value): Exception => ({
      type: SAFE_IDENTIFIER.test(value.type ?? "") ? value.type : "Error",
      value: classifyExceptionValue(value.type),
      ...(value.mechanism ? { mechanism: safeMechanism(value.mechanism) } : {}),
      stacktrace: value.stacktrace ? { frames: value.stacktrace.frames?.map(safeFrame) } : undefined,
    }),
  );
  return values ? { values } : undefined;
}

/**
 * Typed as `ErrorEvent -> ErrorEvent | null` so it is directly assignable to
 * `beforeSend`, whose signature is
 * `(event: ErrorEvent, hint: EventHint) => ErrorEvent | null`. `ErrorEvent` is
 * `Event & { type: undefined }`, and that property is required, so the returned
 * object literal must declare `type: undefined` explicitly.
 */
export function sanitizeApiEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  try {
    const tags = Object.fromEntries(
      ALLOWED_TAGS.flatMap((key) => {
        const value = event.tags?.[key];
        return typeof value === "string" || typeof value === "number" ? [[key, value]] : [];
      }),
    );
    return {
      type: undefined,
      event_id: event.event_id,
      timestamp: event.timestamp,
      platform: event.platform,
      level: event.level,
      release: event.release,
      environment: event.environment,
      exception: safeException(event),
      // Build-artifact identifiers only (type/code_file/debug_id). Required for
      // source-map resolution; contains no runtime or owner data.
      debug_meta: event.debug_meta,
      request: event.request?.method ? { method: event.request.method } : undefined,
      tags,
    };
  } catch {
    return null;
  }
}

export function sanitizeApiBreadcrumb() {
  return null;
}
```

Everything not listed above is dropped: `message`, `user`, `extra`, `breadcrumbs`,
`transaction`, request URL/headers/data/query, and every context.

- [ ] **Step 4: Run the privacy tests**

Run: `pnpm --filter @turingcare/api exec vitest run src/monitoring/sanitize-event.test.ts`

Expected: PASS and the serialized event does not contain the sentinel.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/monitoring/sanitize-event.ts apps/api/src/monitoring/sanitize-event.test.ts
git commit -m "feat(api): enforce monitoring privacy allowlist"
```

### Task 3: Add API request correlation, error capture, and startup reporting

**Files:**
- Create: `apps/api/src/monitoring/request-id.ts`
- Create: `apps/api/src/monitoring/request-id.test.ts`
- Create: `apps/api/src/monitoring/sentry.ts`
- Create: `apps/api/src/monitoring/error-handler.ts`
- Create: `apps/api/src/monitoring/error-handler.test.ts`
- Create: `apps/api/src/instrument.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/package.json`
- Modify: `Dockerfile.api`

- [ ] **Step 1: Write request-ID behavior tests**

In `apps/api/src/monitoring/request-id.test.ts`, build a small throwaway Hono app
with only the middleware — never mutate the production singleton:

```ts
import { Hono } from "hono";
import { expect, it } from "vitest";
import { type ApiEnv, requestIdMiddleware } from "./request-id";

const testApp = new Hono<ApiEnv>()
  .use("*", requestIdMiddleware)
  .get("/", (c) => c.json({ requestId: c.get("requestId") }));

it("preserves a valid inbound request ID", async () => {
  const res = await testApp.request("/", { headers: { "X-Request-ID": "req-123_abc" } });
  expect(res.headers.get("X-Request-ID")).toBe("req-123_abc");
});

it("replaces an invalid request ID", async () => {
  const res = await testApp.request("/", { headers: { "X-Request-ID": "email@example.com" } });
  expect(res.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
});

it("exposes the same ID to handlers and to the response", async () => {
  const res = await testApp.request("/");
  expect((await res.json()).requestId).toBe(res.headers.get("X-Request-ID"));
});
```

- [ ] **Step 2: Write error-handler tests against a throwaway Hono app**

Create `apps/api/src/monitoring/error-handler.test.ts`. The handler is exercised
on a disposable app so the real `app.ts` never gains a synthetic failure route
and `AppType` inference is untouched:

```ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, expect, it, vi } from "vitest";
import { createMonitoringErrorHandler } from "./error-handler";
import { type ApiEnv, requestIdMiddleware } from "./request-id";

const capture = vi.fn();

function buildApp() {
  return new Hono<ApiEnv>()
    .use("*", requestIdMiddleware)
    .get("/boom", () => {
      throw new Error("synthetic failure");
    })
    .get("/missing", () => {
      throw new HTTPException(404, { message: "not found" });
    })
    .get("/upstream", () => {
      throw new HTTPException(502, { message: "bad gateway" });
    })
    .onError(createMonitoringErrorHandler(capture));
}

beforeEach(() => {
  capture.mockReset();
});

it("returns a generic 500 body and captures unexpected errors once", async () => {
  const res = await buildApp().request("/boom");
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "internal_server_error" });
  expect(res.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
  expect(capture).toHaveBeenCalledTimes(1);
  expect(capture.mock.calls[0]?.[1]).toMatchObject({ route: "/boom", status: 500, method: "GET" });
});

it("preserves HTTPException 4xx responses and does not capture them", async () => {
  const res = await buildApp().request("/missing");
  expect(res.status).toBe(404);
  expect(res.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
  expect(capture).not.toHaveBeenCalled();
});

it("preserves HTTPException 5xx responses and captures them", async () => {
  const res = await buildApp().request("/upstream");
  expect(res.status).toBe(502);
  expect(capture).toHaveBeenCalledTimes(1);
  expect(capture.mock.calls[0]?.[1]).toMatchObject({ status: 502 });
});

it("never sends the exception message to the client", async () => {
  const res = await buildApp().request("/boom");
  expect(await res.text()).not.toContain("synthetic failure");
});
```

- [ ] **Step 3: Extend the existing API app tests**

In `apps/api/src/app.test.ts` — which already exists and covers `/health`,
`/me`, and rate limiting — add these cases inside the existing
`describe("api", …)` block. Assert against the real app; no synthetic route, no
factory:

```ts
it("returns a request ID on every response", async () => {
  const res = await app.request("/health");
  expect(res.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
});

it("returns a request ID on expected 4xx responses", async () => {
  const res = await app.request("/me");
  expect(res.status).toBe(401);
  expect(res.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
});

it("exposes the request ID to the configured frontend origin", async () => {
  const res = await app.request("/health", { headers: { Origin: env.FRONTEND_URL } });
  expect(res.headers.get("Access-Control-Expose-Headers")).toContain("X-Request-ID");
});
```

Import `env` from `./env` in that file; the existing suite imports only
`{ app }` from `./app`. Keep the existing cases unchanged.

- [ ] **Step 4: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/monitoring/request-id.test.ts src/monitoring/error-handler.test.ts src/app.test.ts
```

Expected: FAIL because the middleware and handler do not exist.

- [ ] **Step 5: Implement request-ID middleware**

Create `apps/api/src/monitoring/request-id.ts`:

```ts
import { randomUUID } from "node:crypto";
import { createMiddleware } from "hono/factory";

export type ApiEnv = { Variables: { requestId: string } };
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

export const requestIdMiddleware = createMiddleware<ApiEnv>(async (c, next) => {
  const inbound = c.req.header("X-Request-ID");
  const requestId = inbound && REQUEST_ID.test(inbound) ? inbound : randomUUID();
  c.set("requestId", requestId);
  await next();
  // Set after the chain: prepared headers are only merged into responses Hono
  // builds itself, so this also covers Responses returned directly by onError
  // and by HTTPException.getResponse().
  c.header("X-Request-ID", requestId);
});
```

- [ ] **Step 6: Implement the API Sentry adapter**

Create `apps/api/src/monitoring/sentry.ts`:

```ts
import * as Sentry from "@sentry/node";
import { type MonitoringConfig, readApiMonitoringConfig } from "./config";
import { sanitizeApiBreadcrumb, sanitizeApiEvent } from "./sanitize-event";

let config: MonitoringConfig = { enabled: false };

export function initializeApiMonitoring(): void {
  config = readApiMonitoringConfig();
  if (!config.enabled) {
    if (config.warning) console.warn(`[monitoring] ${config.warning}`);
    return;
  }
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: 0,
    enableLogs: false,
    // Deny-all data collection. Every field is explicit so an SDK default flip
    // cannot start collecting owner data.
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
    // Keep grouping-level dedupe and inbound filtering, plus the two process
    // crash handlers — an uncaught exception or unhandled rejection never
    // reaches the Hono error boundary, so these are its only capture path.
    // Crash semantics are unchanged: `onUncaughtException` still exits the
    // process (we register no competing `uncaughtException` handler), and
    // `mode: "strict"` reproduces Node's `--unhandled-rejections=strict`, i.e.
    // flush then exit non-zero. Every other auto-capture integration stays off
    // because it would duplicate our explicit boundary/fetch captures.
    defaultIntegrations: false,
    integrations: [
      Sentry.dedupeIntegration(),
      Sentry.eventFiltersIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration({ mode: "strict" }),
    ],
    beforeSend: sanitizeApiEvent,
    beforeBreadcrumb: sanitizeApiBreadcrumb,
  });
}

export function isApiMonitoringEnabled(): boolean {
  return config.enabled;
}

export function captureApiError(
  error: unknown,
  context: { route: string; method: string; status: number; requestId: string },
): string | undefined {
  if (!config.enabled || context.status < 500) return undefined;
  return Sentry.withScope((scope) => {
    scope.setTags({
      application: "api",
      route: context.route,
      method: context.method,
      status: String(context.status),
      request_id: context.requestId,
    });
    return Sentry.captureException(error);
  });
}

export async function captureApiStartupFailure(error: unknown): Promise<void> {
  if (!config.enabled) return;
  Sentry.withScope((scope) => {
    scope.setLevel("fatal");
    scope.setTags({
      application: "api",
      route: "startup",
      method: "STARTUP",
      status: "500",
      request_id: "startup",
    });
    Sentry.captureException(error);
  });
  await Sentry.flush(5_000);
}
```

Verify the option and integration names against the installed SDK
(`@sentry/node` 10.x exports `dedupeIntegration`, `eventFiltersIntegration`,
`functionToStringIntegration`, `onUncaughtExceptionIntegration`, and
`onUnhandledRejectionIntegration`; `dataCollection.databaseQueryData` and
`dataCollection.frameContextLines` are in `DataCollection`). If a name differs in
the installed version, use the current documented deny-all shape — never remove
an explicit opt-out to make types compile.

Both crash handlers are safe under this sanitizer: the unhandled-rejection
integration attaches `extra: { unhandledPromiseRejection: true }`, and `extra` is
dropped wholesale by `sanitizeApiEvent`. Keep
`onUncaughtExceptionIntegration()`'s default
`exitEvenIfOtherHandlersAreRegistered: false`; because the API registers no other
`uncaughtException` listener, the process still exits, and the default avoids
pre-empting a future handler. `mode: "strict"` matches what the API already does
today: Node 22 terminates on an unhandled rejection by default, so the only
change is that the failure is reported and flushed before the same non-zero exit.
With monitoring disabled (no DSN) neither handler is registered at all, so local
and CI crash behavior is untouched.

- [ ] **Step 7: Implement the shared error handler**

Create `apps/api/src/monitoring/error-handler.ts`:

```ts
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { routePath } from "hono/route";
import { captureApiError } from "./sentry";
import type { ApiEnv } from "./request-id";

export function createMonitoringErrorHandler(
  capture: typeof captureApiError = captureApiError,
): ErrorHandler<ApiEnv> {
  return (error, c) => {
    const requestId = c.get("requestId") ?? "unknown";
    // `routePath(c)` from `hono/route` replaces the deprecated `c.req.routePath`
    // and returns "" when nothing matched.
    const route = routePath(c) || "unmatched";

    if (error instanceof HTTPException) {
      const response = error.getResponse();
      // Expected 4xx (validation, auth, not-found, rate limit) keep their exact
      // contract and are never Sentry errors.
      if (response.status >= 500) {
        capture(error, { route, method: c.req.method, status: response.status, requestId });
      }
      return response;
    }

    capture(error, { route, method: c.req.method, status: 500, requestId });
    return c.json({ error: "internal_server_error" } as const, 500);
  };
}
```

- [ ] **Step 8: Install middleware and the handler on the existing app**

In `apps/api/src/app.ts`, keep the single chained `new Hono()` expression and its
route order — do **not** convert the module to a factory, because `AppType` is
inferred from this chained expression and the web RPC client depends on it. Make
three edits:

```ts
import { createMonitoringErrorHandler } from "./monitoring/error-handler";
import { type ApiEnv, requestIdMiddleware } from "./monitoring/request-id";

const app = new Hono<ApiEnv>()
  .use("*", requestIdMiddleware)
  .use(
    "*",
    secureHeaders({
      // unchanged
    }),
  )
  // ...every existing middleware and route in its current order...
  .on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.onError(createMonitoringErrorHandler());

export { app };
export type AppType = typeof app;
```

Add `exposeHeaders: ["X-Request-ID"]` to the existing `cors({...})` options.
`app.onError(...)` is a statement after the chain so the inferred `AppType` stays
identical in shape. Run `pnpm --filter @turingcare/web typecheck` in Step 11 to
prove the RPC client still resolves every route.

- [ ] **Step 9: Initialize before application import and capture startup failures**

Create `apps/api/src/instrument.ts`:

```ts
import { initializeApiMonitoring } from "./monitoring/sentry";

initializeApiMonitoring();
```

Rewrite `apps/api/src/index.ts` so anything that fails while booting (env
validation, database pool construction, port binding) is reported before exit:

```ts
import { serve } from "@hono/node-server";
import { captureApiStartupFailure } from "./monitoring/sentry";

async function fail(error: unknown): Promise<never> {
  console.error("api failed to start", error);
  await captureApiStartupFailure(error);
  process.exit(1);
}

async function main() {
  const [{ app }, { env }] = await Promise.all([import("./app"), import("./env")]);
  const server = serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, (info) => {
    console.log(`api listening on http://0.0.0.0:${info.port}`);
  });
  server.on("error", (error) => {
    void fail(error);
  });
}

main().catch(fail);
```

The dynamic imports are required: a top-level `import { app }` would throw during
module evaluation, before `main()` can catch it. The `server.on("error", …)`
listener covers a failed port bind, which is reported asynchronously rather than
as a rejected promise. `monitoring/sentry.ts` reads `process.env` through
`monitoring/config.ts` and never imports `./env`, so a malformed application env
is still reportable.

Add the preload to the API scripts in `apps/api/package.json`:

```json
"dev": "tsx watch --import ./src/instrument.ts src/index.ts",
"monitoring:diagnostic": "tsx src/monitoring/diagnostic.ts"
```

In `Dockerfile.api`, change only the final command from
`CMD ["pnpm", "exec", "tsx", "src/index.ts"]` to:

```dockerfile
CMD ["pnpm", "exec", "tsx", "--import", "./src/instrument.ts", "src/index.ts"]
```

The working directory is already `/app/apps/api`, so the relative preload path
resolves.

- [ ] **Step 10: Run targeted and API tests**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/monitoring/request-id.test.ts src/monitoring/error-handler.test.ts src/monitoring/sanitize-event.test.ts src/app.test.ts
```

Expected: PASS. These tests need the migrated local Postgres database because
`src/app.test.ts` imports the real application.

- [ ] **Step 11: Prove the typed RPC boundary is unchanged**

Run:

```bash
pnpm --filter @turingcare/api typecheck
pnpm --filter @turingcare/web typecheck
```

Expected: PASS. A web typecheck failure means `AppType` inference regressed —
fix the app typing rather than weakening the client.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src apps/api/package.json Dockerfile.api
git commit -m "feat(api): capture correlated production failures"
```

### Task 4: Add privacy-safe browser capture and monitored API fetch

**Files:**
- Create: `apps/web/src/monitoring/sanitize-event.ts`
- Create: `apps/web/src/monitoring/sanitize-event.test.ts`
- Create: `apps/web/src/monitoring/sentry.ts`
- Create: `apps/web/src/monitoring/monitored-fetch.ts`
- Create: `apps/web/src/monitoring/monitored-fetch.test.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/auth-client.ts`

- [ ] **Step 1: Write browser sanitizer tests**

Mirror every API sentinel case from Task 2, but allow only these tags:

```ts
{
  application: "web",
  route: "/my/dogs/:id/journal",
  api_route: "/api/dogs/:id",
  status: "500",
  request_id: "req-123",
}
```

Assert that `user`, `request.url`, `request.headers`, `request.data`, `extra`,
breadcrumbs, query strings, fragments, emails, and the sentinel are absent; that
the exception value is normalized to `Unexpected TypeError` /
`Unexpected application error`; that `mechanism` keeps only
`type`/`handled`/`synthetic`; that frame `abs_path`, `module`, and `debug_id`
plus `debug_meta.images` survive (web symbolication depends on them); and that a
malformed event getter returns `null`. Drop all contexts because the deliberately
minimal browser integrations do not populate a trustworthy browser/OS context.
Type the fixtures with Sentry's `ErrorEvent` imported from
`@sentry/react` — not the DOM global of the same name — and give every fixture
the required `type: undefined` property, exactly as in Task 2.

- [ ] **Step 2: Write monitored-fetch tests**

Import both `createMonitoredFetch` and `normalizeApiPath` from
`./monitored-fetch`:

```ts
it("captures a 5xx response with only normalized path and request ID", async () => {
  const capture = vi.fn();
  const fetcher = createMonitoredFetch({
    fetch: vi.fn().mockResolvedValue(
      new Response("private body", {
        status: 503,
        headers: { "X-Request-ID": "req-123" },
      }),
    ),
    capture,
  });
  await fetcher("https://api.turingcare.dog/api/dogs/8e66f420-a1d2-4fc7-b0d1-111111111111?note=secret");
  expect(capture).toHaveBeenCalledWith(expect.any(Error), {
    route: "/",
    apiRoute: "/api/dogs/:id",
    status: 503,
    requestId: "req-123",
  });
  expect(JSON.stringify(capture.mock.calls)).not.toContain("private body");
  expect(JSON.stringify(capture.mock.calls)).not.toContain("note=secret");
});

it("does not capture expected 4xx responses", async () => {
  // Return 401 and assert capture was not called.
});

it("captures network failures and rethrows the original error", async () => {
  // Reject fetch, assert status is 0, requestId is undefined, and rejection is preserved.
});

it("never reads the response body", async () => {
  // Assert response.bodyUsed === false after a captured 5xx so the caller can still parse it.
});

it("normalizes share tokens and resource ids in route templates", () => {
  expect(normalizeApiPath("/b/N3hK7pQ2sVxT9bYw4mZr1cLd")).toBe("/b/:token");
  expect(normalizeApiPath("/my/dogs/8e66f420-a1d2-4fc7-b0d1-111111111111")).toBe("/my/dogs/:id");
  expect(normalizeApiPath("/my/dogs/8e66f420-a1d2-4fc7-b0d1-111111111111?note=secret")).toBe(
    "/my/dogs/:id",
  );
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm --filter @turingcare/web exec vitest run src/monitoring/sanitize-event.test.ts src/monitoring/monitored-fetch.test.ts
```

Expected: FAIL because the modules are missing.

- [ ] **Step 4: Implement the browser sanitizer**

Create `apps/web/src/monitoring/sanitize-event.ts` as the browser equivalent of
Task 2 using `ErrorEvent`, `Exception`, and `StackFrame` from `@sentry/react`.
`sanitizeWebEvent` is typed `(event: ErrorEvent, hint?: EventHint) => ErrorEvent
| null` so it is assignable to `beforeSend`, and its returned object literal
declares the required `type: undefined`. Import Sentry's `ErrorEvent` type
explicitly — the identifier also exists as a DOM global, and the imported type
must shadow it in both the module and its test. Apply the same rules with a
local copy of the helpers (the web app must not import from the API workspace's
runtime source): allowlist top-level fields, normalize the exception value to
`Unexpected <Type>` / `Unexpected application error`, keep `debug_meta` and
frame `abs_path`/`module`/`debug_id`, keep only safe `mechanism` fields, drop
all contexts, return `null` on any thrown error,
and return `null` for every breadcrumb.

- [ ] **Step 5: Implement browser initialization and capture**

Create `apps/web/src/monitoring/sentry.ts`:

```ts
import * as Sentry from "@sentry/react";
import { type MonitoringConfig, readWebMonitoringConfig } from "./config";
import { sanitizeWebBreadcrumb, sanitizeWebEvent } from "./sanitize-event";

let config: MonitoringConfig = { enabled: false };

export function initializeWebMonitoring(): void {
  config = readWebMonitoringConfig();
  if (!config.enabled) {
    if (config.warning) console.warn(`[monitoring] ${config.warning}`);
    return;
  }
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
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
    // Dedupe + inbound event filtering stay on. Global handlers, browser API
    // wrapping, breadcrumbs, HTTP context, tracing, and replay stay off: the
    // error boundary and monitored fetch are the only capture paths, and
    // auto-capture would duplicate them.
    //
    // Accepted limitation: an async browser error outside those two paths — a
    // rejection inside a `setTimeout` callback, or a throw from a non-React
    // event listener — is not captured. Enabling
    // `Sentry.globalHandlersIntegration()` would close that gap but re-report
    // every boundary and fetch failure as a second issue, which is worse for a
    // 10–20 owner beta. Documented in docs/runbooks/production-monitoring.md.
    defaultIntegrations: false,
    integrations: [
      Sentry.dedupeIntegration(),
      Sentry.eventFiltersIntegration(),
      Sentry.functionToStringIntegration(),
    ],
    beforeSend: sanitizeWebEvent,
    beforeBreadcrumb: sanitizeWebBreadcrumb,
  });
}

export function isWebMonitoringEnabled(): boolean {
  return config.enabled;
}

export function captureWebError(
  error: unknown,
  context: { route: string; apiRoute?: string; status?: number; requestId?: string },
): string | undefined {
  if (!config.enabled) return undefined;
  return Sentry.withScope((scope) => {
    scope.setTags({
      application: "web",
      route: context.route,
      ...(context.apiRoute ? { api_route: context.apiRoute } : {}),
      ...(context.status === undefined ? {} : { status: String(context.status) }),
      ...(context.requestId ? { request_id: context.requestId } : {}),
    });
    return Sentry.captureException(error);
  });
}

export async function flushWebMonitoring(timeoutMs = 5_000): Promise<boolean> {
  if (!config.enabled) return true;
  return Sentry.flush(timeoutMs);
}
```

Do not add browser tracing, replay, user identity, or `setUser`. Do not add
`globalHandlersIntegration()`; the resulting blind spot is deliberate and is
written up in the runbook (Task 8, Step 1) rather than closed with a
duplicate-prone integration.

- [ ] **Step 6: Implement monitored fetch**

Create `apps/web/src/monitoring/monitored-fetch.ts`:

```ts
import { captureWebError } from "./sentry";

const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const SHARE_TOKEN = /^[A-Za-z0-9_-]{20,}$/;

export function normalizeApiPath(input: string): string {
  return new URL(input, window.location.origin).pathname
    .split("/")
    .map((segment) => (UUID.test(segment) ? ":id" : SHARE_TOKEN.test(segment) ? ":token" : segment))
    .join("/");
}

export function createMonitoredFetch(
  deps: { fetch: typeof fetch; capture: typeof captureWebError } = {
    fetch: window.fetch.bind(window),
    capture: captureWebError,
  },
): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const apiRoute = normalizeApiPath(url);
    try {
      const response = await deps.fetch(input, init);
      if (response.status >= 500) {
        // Status only — the body is never read, so the caller can still parse it.
        deps.capture(new Error(`API request failed with status ${response.status}`), {
          route: normalizeApiPath(window.location.pathname),
          apiRoute,
          status: response.status,
          requestId: response.headers.get("X-Request-ID") ?? undefined,
        });
      }
      return response;
    } catch (error) {
      deps.capture(error, {
        route: normalizeApiPath(window.location.pathname),
        apiRoute,
        status: 0,
      });
      throw error;
    }
  };
}
```

`normalizeApiPath` accepts pathname-only inputs in tests and never retains
search or hash values. It is the single route-normalization helper for the whole
web app: the monitored fetch uses it for both the API path and the browser
route, and the error boundary added in Task 5 imports it to normalize
`window.location.pathname` before capture.

- [ ] **Step 7: Wire the Hono RPC client**

Modify `apps/web/src/lib/api.ts`:

```ts
import { createMonitoredFetch } from "@/monitoring/monitored-fetch";

export const api = hc<AppType>(import.meta.env.VITE_API_URL || "/", {
  init: { credentials: "include" },
  fetch: createMonitoredFetch(),
});
```

`ClientRequestOptions` in the installed Hono version accepts `fetch`; keep the
existing `init.credentials` value and the surrounding comment unchanged.

- [ ] **Step 8: Cover Better Auth failures**

Better Auth calls (`signIn`, `signUp`, `useSession`, password reset, …) do not go
through `api.ts`, so an auth 5xx would otherwise be invisible. Route them through
the same monitored fetch in `apps/web/src/lib/auth-client.ts`:

```ts
import { createMonitoredFetch } from "@/monitoring/monitored-fetch";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || undefined,
  basePath: "/api/auth",
  // better-fetch accepts a custom fetch implementation; this covers both
  // network failures and 5xx responses using the tested monitored fetch and
  // never touches the response body.
  fetchOptions: { customFetchImpl: createMonitoredFetch() },
});
```

At implementation time, verify the option against the installed types:
`BetterAuthClientOptions.fetchOptions` is `ClientFetchOption`, which extends
`BetterFetchOption` and exposes `customFetchImpl?: FetchEsque` where
`FetchEsque = (input: string | URL | Request, init?: RequestInit) => Promise<Response>`.
If that option is unavailable in the installed version, fall back to the
`fetchOptions.onError` hook and read **only** `context.response.status` and the
`X-Request-ID` header — never `context.responseText`, `context.error`, or the
request body — and note that the hook does not fire for network failures.

- [ ] **Step 9: Run tests and typecheck**

Run:

```bash
pnpm --filter @turingcare/web exec vitest run src/monitoring/sanitize-event.test.ts src/monitoring/monitored-fetch.test.ts
pnpm --filter @turingcare/web typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/monitoring apps/web/src/lib/api.ts apps/web/src/lib/auth-client.ts
git commit -m "feat(web): capture sanitized API failures"
```

### Task 5: Add the localized React error boundary

**Files:**
- Create: `apps/web/src/components/app-error-boundary.tsx`
- Create: `apps/web/src/components/app-error-boundary.test.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Write the boundary test**

Render a component that throws and assert:

```ts
expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
expect(screen.getByText("Reference: event-123")).toBeVisible();
expect(screen.queryByText(/OWNER-CONTENT-DO-NOT-SEND/)).not.toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "Try again" }));
expect(reloadSpy).toHaveBeenCalledOnce();
```

Mock `captureWebError` to return `event-123` and assert it is called exactly
once. Add a case where capture returns `undefined` (monitoring disabled) and the
reference line is not rendered. Add a Spanish catalog test for `"Algo salió mal"`.

Add the route-normalization case. The boundary must never send a raw share
token, so it normalizes the browser location with the same helper the monitored
fetch uses:

```ts
const SHARE_TOKEN = "N3hK7pQ2sVxT9bYw4mZr1cLd";

afterEach(() => {
  window.history.pushState({}, "", "/");
});

it("captures the normalized route template, not the raw share token", () => {
  window.history.pushState({}, "", `/b/${SHARE_TOKEN}`);
  render(
    <AppErrorBoundary>
      <Boom />
    </AppErrorBoundary>,
  );
  expect(captureWebError).toHaveBeenCalledWith(expect.any(Error), { route: "/b/:token" });
  expect(JSON.stringify(vi.mocked(captureWebError).mock.calls)).not.toContain(SHARE_TOKEN);
});

it("captures an owner route as its template", () => {
  window.history.pushState({}, "", "/my/dogs/8e66f420-a1d2-4fc7-b0d1-111111111111");
  render(
    <AppErrorBoundary>
      <Boom />
    </AppErrorBoundary>,
  );
  expect(captureWebError).toHaveBeenCalledWith(expect.any(Error), { route: "/my/dogs/:id" });
});
```

`jsdom` implements `history.pushState`, so this changes `window.location.pathname`
without stubbing the location object. `Boom` is the local component that throws.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/components/app-error-boundary.test.tsx`

Expected: FAIL because the boundary and message keys do not exist.

- [ ] **Step 3: Add localized strings**

Add to both catalogs:

```ts
fatalError: {
  title: "Something went wrong",
  body: "Your data is still safe. Try loading TuringCare again.",
  retry: "Try again",
  reference: "Reference: {eventId}",
},
```

Spanish:

```ts
fatalError: {
  title: "Algo salió mal",
  body: "Tus datos siguen seguros. Intenta cargar TuringCare de nuevo.",
  retry: "Intentar de nuevo",
  reference: "Referencia: {eventId}",
},
```

English is the literal source for `MessageKey`; catalog shape parity is
compile-time checked, so both files must land in the same commit.

- [ ] **Step 4: Implement the boundary**

Use a class component for `getDerivedStateFromError`/`componentDidCatch` and a
small functional fallback that calls `useI18n`. Capture with the current route
only, normalized through the shared helper so no share token or resource ID is
transmitted:

```ts
import { normalizeApiPath } from "@/monitoring/monitored-fetch";
import { captureWebError } from "@/monitoring/sentry";

// componentDidCatch
const eventId = captureWebError(error, { route: normalizeApiPath(window.location.pathname) });
```

Never pass `window.location.pathname` raw, and never pass `window.location.href`,
`search`, or `hash`. The retry button must clear boundary state and call
`window.location.reload()`; never display the raw exception. Show the Sentry
event ID only when capture returns one.

- [ ] **Step 5: Initialize monitoring and install the boundary**

At the top of `apps/web/src/main.tsx`, import and call the initializer before
`createRoot(...)`:

```ts
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { initializeWebMonitoring } from "@/monitoring/sentry";

initializeWebMonitoring();
```

Wrap only the router, leaving `<Toaster />` exactly where it is today — a sibling
of `<BrowserRouter>` inside `<LocaleProvider>` — so toasts still render when the
boundary is showing:

```tsx
<LocaleProvider>
  <AppErrorBoundary>
    <BrowserRouter>{/* existing PageViewTracker and Routes, unchanged */}</BrowserRouter>
  </AppErrorBoundary>
  <Toaster />
</LocaleProvider>
```

Keep `StrictMode` and `QueryClientProvider` in place and unchanged.

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
pnpm --filter @turingcare/web exec vitest run src/components/app-error-boundary.test.tsx
pnpm --filter @turingcare/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/app-error-boundary.tsx \
  apps/web/src/components/app-error-boundary.test.tsx \
  apps/web/src/main.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): add monitored error recovery boundary"
```

### Task 6: Upload private web source maps and align releases

**Files:**
- Create: `apps/web/src/monitoring/sentry-build-options.ts`
- Create: `apps/web/src/monitoring/sentry-build-options.test.ts`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/tsconfig.node.json`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Add the build-option tests**

The helper lives under `src/` — **not** in `vite.config.test.ts`. Vitest's
default `exclude` contains `**/{…,vite,…}.config.*`, which matches
`vite.config.test.ts`, so such a file would silently never run; and importing the
Vite config from a jsdom test fails. Create
`apps/web/src/monitoring/sentry-build-options.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveSentryBuildOptions } from "./sentry-build-options";

const COMPLETE = {
  dsn: "https://public@example.ingest.sentry.io/2",
  environment: "production",
  org: "turingcare",
  project: "turingcare-web",
  release: "720c524",
  authToken: "sntrys_dummy_token",
};

it("returns upload options when monitoring and upload inputs are complete", () => {
  expect(resolveSentryBuildOptions(COMPLETE)).toMatchObject({
    org: "turingcare",
    project: "turingcare-web",
    release: { name: "720c524" },
    sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
  });
});

it("skips upload for a local build with no DSN", () => {
  expect(resolveSentryBuildOptions({ org: "turingcare" })).toBeUndefined();
});

it("skips upload when the DSN is not a production monitoring build", () => {
  expect(resolveSentryBuildOptions({ ...COMPLETE, environment: "development" })).toBeUndefined();
});

it("fails the build when monitoring is enabled but upload inputs are incomplete", () => {
  expect(() => resolveSentryBuildOptions({ ...COMPLETE, authToken: undefined })).toThrow(
    /SENTRY_AUTH_TOKEN/,
  );
  expect(() => resolveSentryBuildOptions({ ...COMPLETE, org: undefined })).toThrow(/SENTRY_ORG/);
});

it("never includes secret values in the failure message", () => {
  try {
    resolveSentryBuildOptions({ ...COMPLETE, org: undefined });
  } catch (error) {
    expect((error as Error).message).not.toContain(COMPLETE.authToken);
    expect((error as Error).message).not.toContain(COMPLETE.dsn);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/monitoring/sentry-build-options.test.ts`

Expected: FAIL because the helper is missing.

- [ ] **Step 3: Implement the pure helper**

Create `apps/web/src/monitoring/sentry-build-options.ts`. The helper takes plain
inputs and reads no globals, so it typechecks in both the app project and the
Vite-config project:

```ts
export type SentryBuildInput = {
  dsn?: string | undefined;
  environment?: string | undefined;
  org?: string | undefined;
  project?: string | undefined;
  release?: string | undefined;
  authToken?: string | undefined;
};

export type SentrySourceMapOptions = {
  org: string;
  project: string;
  authToken: string;
  release: { name: string };
  sourcemaps: { filesToDeleteAfterUpload: string[] };
};

const REQUIRED_INPUTS = [
  ["org", "SENTRY_ORG"],
  ["project", "SENTRY_PROJECT"],
  ["release", "SENTRY_RELEASE"],
  ["authToken", "SENTRY_AUTH_TOKEN"],
] as const;

/**
 * Returns undefined for local/dev builds (no upload, and the caller then also
 * disables source-map emission) and throws for a production monitoring build
 * with incomplete upload inputs — an unsymbolicated production rollout is not an
 * acceptable outcome.
 */
export function resolveSentryBuildOptions(
  input: SentryBuildInput,
): SentrySourceMapOptions | undefined {
  const monitoringEnabled =
    Boolean(input.dsn?.trim()) && input.environment?.trim() === "production";
  if (!monitoringEnabled) return undefined;

  // Narrowed local strings instead of non-null assertions: Biome's recommended
  // ruleset rejects `!`, and these are the values the return value is built from.
  const resolved = {
    org: input.org?.trim() ?? "",
    project: input.project?.trim() ?? "",
    release: input.release?.trim() ?? "",
    authToken: input.authToken?.trim() ?? "",
  };

  const missing = REQUIRED_INPUTS.filter(([key]) => resolved[key].length === 0).map(
    ([, name]) => name,
  );
  if (missing.length > 0) {
    throw new Error(
      `Sentry source-map upload is enabled but incomplete. Missing: ${missing.join(", ")}.`,
    );
  }

  return {
    org: resolved.org,
    project: resolved.project,
    authToken: resolved.authToken,
    release: { name: resolved.release },
    sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
  };
}
```

Keep the return type structural. If `sentryVitePlugin`'s parameter type in the
installed `@sentry/vite-plugin` rejects it, widen the local type to match the
plugin's documented options rather than casting to `any`.

- [ ] **Step 4: Configure conditional hidden source maps in the Vite config**

Update `apps/web/vite.config.ts`:

```ts
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { resolveSentryBuildOptions } from "./src/monitoring/sentry-build-options";

const sentry = resolveSentryBuildOptions({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: process.env.VITE_SENTRY_ENVIRONMENT,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  release: process.env.SENTRY_RELEASE,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(sentry ? [sentryVitePlugin(sentry)] : [])],
  // Maps are emitted only when they will be uploaded to Sentry and deleted
  // again. A build without upload credentials writes no `.map` file at all,
  // so an unuploaded map can never reach the Pages artifact.
  build: { sourcemap: sentry ? "hidden" : false },
  // existing resolve/server options unchanged
});
```

The Sentry plugin must be last in the array. `sourcemap: "hidden"` emits maps
without a `//# sourceMappingURL` comment; the plugin uploads them and then
deletes them via `filesToDeleteAfterUpload`. `sourcemap: false` is the local and
kill-switch state: no maps, no upload, and a smaller build.

`apps/web/tsconfig.node.json` is a `composite` project that currently includes
only `vite.config.ts`, so it must list the new import explicitly:

```json
"include": ["vite.config.ts", "src/monitoring/sentry-build-options.ts"]
```

- [ ] **Step 5: Pass one release through deployment and guard the artifact**

In `.github/workflows/deploy.yml`, build the web app with the monitoring values
and fail before the Pages step if any map survives:

```yaml
      - name: Build frontend (prod API URL)
        run: pnpm --filter @turingcare/web build
        env:
          VITE_API_URL: https://api.turingcare.dog
          VITE_SENTRY_DSN: ${{ secrets.SENTRY_WEB_DSN }}
          VITE_SENTRY_ENVIRONMENT: production
          VITE_SENTRY_RELEASE: ${{ github.sha }}
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: ${{ vars.SENTRY_ORG }}
          SENTRY_PROJECT: ${{ vars.SENTRY_WEB_PROJECT }}
          SENTRY_RELEASE: ${{ github.sha }}
      - name: Fail if source maps would be published
        run: |
          if [ -n "$(find apps/web/dist -name '*.map' -print -quit)" ]; then
            echo "::error::Source maps remain in apps/web/dist; they must be uploaded to Sentry and deleted before the Pages upload." >&2
            find apps/web/dist -name '*.map' -print >&2
            exit 1
          fi
```

Place the guard between the build step and the `cloudflare/wrangler-action@v3`
step in `deploy-web`. The guard is unconditional: it runs whether or not
monitoring was configured for the build, so a future plugin or option change
that re-enables map emission cannot silently publish maps.

For API deployment, set the release as a Fly secret before deploying:

```yaml
      - name: Set API monitoring release
        run: flyctl secrets set --stage --app turingcare-api SENTRY_RELEASE="${{ github.sha }}"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
      - name: Deploy to Fly
        run: flyctl deploy --remote-only --config apps/api/fly.toml
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

`--stage` writes the secret without triggering its own restart; the following
`flyctl deploy` releases it with the new image. Set `SENTRY_DSN` and
`SENTRY_ENVIRONMENT=production` once as Fly secrets outside the workflow. Never
expose `SENTRY_AUTH_TOKEN` to Fly or to Vite client code (only `VITE_*` values
are inlined into the bundle).

- [ ] **Step 6: Verify build behavior locally**

Run:

```bash
pnpm --filter @turingcare/web exec vitest run src/monitoring/sentry-build-options.test.ts
pnpm --filter @turingcare/web build
find apps/web/dist -name '*.map' -print
```

Expected: tests PASS; the local build succeeds and emits **no** `.map` file,
because no DSN is configured, so `resolveSentryBuildOptions` returns `undefined`
and `build.sourcemap` is `false`. `find` prints nothing.

Then prove the guard fires:

```bash
VITE_SENTRY_DSN=https://public@example.ingest.sentry.io/2 \
VITE_SENTRY_ENVIRONMENT=production \
pnpm --filter @turingcare/web build
```

Expected: FAIL with `Sentry source-map upload is enabled but incomplete.
Missing: SENTRY_ORG, SENTRY_PROJECT, SENTRY_RELEASE, SENTRY_AUTH_TOKEN.` Do not
run a real upload from a workstation; the CI run in Task 9 is the upload proof.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/monitoring/sentry-build-options.ts \
  apps/web/src/monitoring/sentry-build-options.test.ts \
  apps/web/vite.config.ts apps/web/tsconfig.node.json .github/workflows/deploy.yml
git commit -m "build: upload private web source maps"
```

### Task 7: Add operator diagnostics for both projects

**Files:**
- Create: `apps/api/src/monitoring/diagnostic.ts`
- Create: `.github/workflows/sentry-diagnostic.yml`
- Create: `apps/web/src/monitoring/diagnostic-bridge.ts`
- Create: `apps/web/src/monitoring/diagnostic-bridge.test.ts`
- Modify: `apps/web/src/components/admin-shell/AdminShell.tsx`

- [ ] **Step 1: Write the web diagnostic bridge test**

The web diagnostic must be a real browser SDK event, so it cannot be produced by
a Node script. Create `apps/web/src/monitoring/diagnostic-bridge.test.ts`:

```ts
import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  DIAGNOSTIC_KEY,
  registerMonitoringDiagnostic,
  useMonitoringDiagnosticBridge,
} from "./diagnostic-bridge";

it("registers a callable diagnostic and captures a fixed synthetic error", async () => {
  const target: Record<string, unknown> = {};
  const capture = vi.fn().mockReturnValue("event-123");
  const unregister = registerMonitoringDiagnostic({ target, capture });

  const run = target[DIAGNOSTIC_KEY] as () => Promise<string | undefined>;
  await expect(run()).resolves.toBe("event-123");
  expect(capture).toHaveBeenCalledWith(expect.any(Error), { route: "/admin", status: 500 });
  expect(capture.mock.calls[0]?.[0]).toMatchObject({
    message: "TuringCare controlled monitoring diagnostic",
  });

  unregister();
  expect(DIAGNOSTIC_KEY in target).toBe(false);
});

it("is removed when the admin view unmounts", () => {
  const target: Record<string, unknown> = {};
  const { unmount } = renderHook(() => useMonitoringDiagnosticBridge({ target }));
  expect(DIAGNOSTIC_KEY in target).toBe(true);
  unmount();
  expect(DIAGNOSTIC_KEY in target).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/monitoring/diagnostic-bridge.test.ts`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the admin-only diagnostic bridge**

Create `apps/web/src/monitoring/diagnostic-bridge.ts`:

```ts
import { useEffect } from "react";
import { captureWebError, flushWebMonitoring } from "./sentry";

export const DIAGNOSTIC_KEY = "__turingcareMonitoringDiagnostic";

type BridgeDeps = {
  target?: Record<string, unknown>;
  capture?: typeof captureWebError;
};

export function registerMonitoringDiagnostic(deps: BridgeDeps = {}): () => void {
  const target = deps.target ?? (window as unknown as Record<string, unknown>);
  const capture = deps.capture ?? captureWebError;
  target[DIAGNOSTIC_KEY] = async () => {
    const eventId = capture(new Error("TuringCare controlled monitoring diagnostic"), {
      route: "/admin",
      status: 500,
    });
    await flushWebMonitoring(10_000);
    return eventId;
  };
  return () => {
    delete target[DIAGNOSTIC_KEY];
  };
}

export function useMonitoringDiagnosticBridge(deps: BridgeDeps = {}): void {
  const { target, capture } = deps;
  useEffect(
    () => registerMonitoringDiagnostic({ target, capture }),
    [target, capture],
  );
}
```

Call the hook once in `apps/web/src/components/admin-shell/AdminShell.tsx`:

```ts
useMonitoringDiagnosticBridge();
```

`AdminShell` renders only inside `RequireAdmin`, which resolves `/me` server-side
and redirects any non-admin to `/my`, so the bridge exists only while an
authenticated admin is on `/admin*` and is removed on navigation away. It is a
`window` function invoked from DevTools — never a route, never a button, and it
carries no operator input.

- [ ] **Step 4: Create the operator-only API diagnostic script**

Create `apps/api/src/monitoring/diagnostic.ts`. It targets the **API project
only**, reuses the API initialization and capture policy, and never imports
`./env`, so a diagnostic can run without a database or any application secret:

```ts
import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/node";
import { captureApiError, initializeApiMonitoring, isApiMonitoringEnabled } from "./sentry";

async function main() {
  initializeApiMonitoring();
  if (!isApiMonitoringEnabled()) {
    console.error("monitoring is not configured: set SENTRY_DSN, SENTRY_ENVIRONMENT, SENTRY_RELEASE");
    process.exitCode = 1;
    return;
  }
  const eventId = captureApiError(new Error("TuringCare controlled monitoring diagnostic"), {
    route: "operator-diagnostic",
    method: "MANUAL",
    status: 500,
    requestId: randomUUID(),
  });
  const flushed = await Sentry.flush(10_000);
  if (!flushed) process.exitCode = 1;
  console.log(`Diagnostic submitted: ${eventId ?? "not sent"}`);
}

void main();
```

The script accepts no owner data and prints only the event ID. It lives in the
API workspace so `@sentry/node` and the API sanitizer resolve from the package
that owns them; `apps/api/package.json` already gained
`"monitoring:diagnostic": "tsx src/monitoring/diagnostic.ts"` in Task 3.

- [ ] **Step 5: Add a manual GitHub workflow**

Create `.github/workflows/sentry-diagnostic.yml` with `workflow_dispatch` only —
never `push` or `pull_request`. Use the protected `production` GitHub
environment, set `SENTRY_DSN: ${{ secrets.SENTRY_API_DSN }}`,
`SENTRY_ENVIRONMENT: production`, `SENTRY_RELEASE: ${{ github.sha }}`, and run
`pnpm --filter @turingcare/api monitoring:diagnostic`. There is no `application`
input: the workflow covers the API project only, because the web project's
diagnostic must originate from a real browser session (Step 3).

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
pnpm --filter @turingcare/web exec vitest run src/monitoring/diagnostic-bridge.test.ts
pnpm --filter @turingcare/web typecheck
pnpm --filter @turingcare/api typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/monitoring/diagnostic.ts .github/workflows/sentry-diagnostic.yml \
  apps/web/src/monitoring/diagnostic-bridge.ts apps/web/src/monitoring/diagnostic-bridge.test.ts \
  apps/web/src/components/admin-shell/AdminShell.tsx
git commit -m "feat: add operator-only monitoring diagnostics"
```

### Task 8: Configure alerts and document operations

**Files:**
- Create: `docs/runbooks/production-monitoring.md`
- Modify: `DEPLOY.md`
- Modify: `README.md`
- Modify: `docs/SECURITY-BACKLOG.md`

- [ ] **Step 1: Write the monitoring runbook**

Create `docs/runbooks/production-monitoring.md` documenting exact Sentry setup:

1. Create projects `turingcare-api` and `turingcare-web`.
2. Disable inbound user IP storage and enforce server-side scrubbing for
   `email`, `name`, `authorization`, `cookie`, `token`, `password`, `note`,
   `summary`, `antecedent`, `behavior`, `consequence`, and `owner_response`.
3. Create GitHub labels `production` and `monitoring`.
4. Install Sentry's GitHub integration with issue create/read permission only
   for `mcasillas17/TuringCare`.
5. Create the alert rules below.
6. Configure GitHub issue creation with those labels and Sentry's issue
   URL/fingerprint so repeated events update the same issue.
7. Set the initial noise policy: page immediately for fatal, regression, startup
   failure, or a sustained 5xx spike; review isolated first-seen errors during
   business hours.
8. Run one diagnostic per project (Task 9), verify release, stack, request ID,
   alert issue, and the absence of forbidden data, then resolve the diagnostic
   issues.
9. Disable monitoring by removing `SENTRY_DSN` from Fly and `SENTRY_WEB_DSN`
   from GitHub if privacy or noise becomes unacceptable; both applications
   fail open to disabled, and the next web build stops emitting source maps.
10. Record the known capture coverage so an on-call operator does not assume
    total coverage:

| Runtime | Captured | Not captured |
|---|---|---|
| API | unexpected 5xx and `HTTPException` 5xx via the Hono handler, startup failures, uncaught exceptions, unhandled promise rejections | expected 4xx |
| Web | React render failures via the error boundary, network failures and 5xx from the monitored fetch (including Better Auth) | async errors outside those paths, such as a rejection in a `setTimeout` callback or a throw from a non-React event listener |

    The browser gap is deliberate: `defaultIntegrations: false` keeps
    `globalHandlersIntegration` off so boundary and fetch failures are not
    reported twice. Revisit only if a real production incident is missed, and
    then verify duplicate suppression before enabling it.

- [ ] **Step 2: Specify the required alert rules**

Document these five rules with their exact conditions:

| Alert | Project | Condition | Action |
|---|---|---|---|
| New unhandled issue | api, web | a new issue is created at `error`/`fatal` | create GitHub Issue, notify |
| Regression | api, web | a resolved issue reappears | create GitHub Issue, notify |
| API startup failure | api | any event tagged `route:startup` | notify immediately, page |
| 5xx spike | api | number of events tagged `status:5*` exceeds the beta baseline in 5 minutes | notify immediately |
| Repeated web crashes | web | one issue tagged `application:web` seen by more than 3 users, or more than 10 events, in 1 hour | notify immediately |

Set the initial 5xx-spike threshold from the first week of production data and
record the chosen number in the runbook. Do not alert on expected 4xx responses,
rate limiting (`status:429`), failed first-party telemetry delivery, or a single
transient network request.

Include diagnosis instructions: start from the GitHub Issue, open Sentry,
identify `application`, `release`, normalized route, status, and `request_id`,
then search Fly logs by request ID. Never ask an owner to paste journal or Brief
content into an issue.

- [ ] **Step 3: Update deployment documentation**

Append `## 9. Production error monitoring (Sentry)` to `DEPLOY.md`, after
`## 8. Rollback` and before `## Quick reference`:

| Location | Name |
|---|---|
| Fly secret | `SENTRY_DSN` |
| Fly secret | `SENTRY_ENVIRONMENT=production` |
| Fly secret | `SENTRY_RELEASE` (set by `deploy.yml`, never pinned by hand) |
| GitHub secret | `SENTRY_WEB_DSN` |
| GitHub secret | `SENTRY_API_DSN` |
| GitHub secret | `SENTRY_AUTH_TOKEN` |
| GitHub variable | `SENTRY_ORG` |
| GitHub variable | `SENTRY_WEB_PROJECT=turingcare-web` |
| GitHub variable | `SENTRY_API_PROJECT=turingcare-api` (reference only — the API ships TypeScript source with `tsx`, so it has no source-map upload) |

Document that the web build fails when `VITE_SENTRY_DSN` is set for production
but any upload input is missing, that a build with no `VITE_SENTRY_DSN` emits no
source map at all (`build.sourcemap` is `false`, so there is nothing to upload
and nothing to leak), that `deploy-web` refuses to publish an artifact containing
`.map` files regardless of monitoring state, and that removing
`SENTRY_DSN`/`SENTRY_WEB_DSN` is the supported kill switch. State the kill
switch's two consequences explicitly: capture stops immediately for the API on
the next Fly release, and the next web build stops emitting and uploading source
maps, so restoring the DSN requires a redeploy before new releases are
symbolicated again. Extend the existing `Quick reference` secrets table rows for
GitHub Actions and Fly with the new Sentry names. Link
`docs/runbooks/production-monitoring.md`.

- [ ] **Step 4: Update README and the security backlog**

In `README.md`, add a short **Error monitoring** subsection after
`## Browser tests` stating that Sentry is disabled locally and in CI (no DSN →
no SDK init, no network, and no source maps emitted by `pnpm build`), that
capture requires all three variables plus `SENTRY_ENVIRONMENT=production`, that
events are allowlist-sanitized with no owner content, and that production
configuration lives in `DEPLOY.md`. Add a `What's next` bullet only if an item is
still outstanding after rollout.

In `docs/SECURITY-BACKLOG.md`, add a `## Shipped — Production error monitoring
(2026-08-10)` section recording: allowlist sanitization with normalized exception
values, no default PII, deny-all `dataCollection`, private source maps (emitted
only for a production monitoring build, hidden, deleted after upload),
request-ID correlation, alerting into GitHub Issues without event payloads, the
documented browser capture gap, and the operator kill switch.

- [ ] **Step 5: Commit**

```bash
git add docs/runbooks/production-monitoring.md DEPLOY.md README.md docs/SECURITY-BACKLOG.md
git commit -m "docs: add production monitoring operations"
```

### Task 9: Run the complete monitoring gate and validate the rollout

**Files:**
- Modify only if a monitoring regression is found.
- Modify: `docs/PROJECT-LOG.md` (after the rollout is verified)

- [ ] **Step 1: Run all targeted monitoring tests**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/monitoring src/app.test.ts
pnpm --filter @turingcare/web exec vitest run src/monitoring src/components/app-error-boundary.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run repository validation**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: PASS. Run API tests against the repository's real Postgres test
database, as CI does.

- [ ] **Step 3: Inspect browser artifacts**

Run:

```bash
find apps/web/dist -name '*.map' -print
grep -R "SENTRY_AUTH_TOKEN" apps/web/dist || true
grep -R "sntrys_" apps/web/dist || true
```

Expected: no token material in the bundle and no `.map` file, because a local
build resolves no Sentry upload options and therefore sets
`build.sourcemap: false`. The CI production artifact must likewise contain no
`.map` files after upload, which the unconditional `deploy-web` guard enforces.

- [ ] **Step 4: Review the privacy contract manually**

Serialize the synthetic API and web events from the tests and search for the
sentinels, emails, query values, cookie names, bearer tokens, dog names, note
fields, and Brief summaries. Expected: none present, and the only exception text
present is `Unexpected <Type>` or `Unexpected application error`.

- [ ] **Step 5: Validate the production rollout**

In order:

1. Deploy with capture still disabled (no `SENTRY_DSN`) and confirm the API logs
   no monitoring warning and serves normally.
2. Set the Fly secrets and GitHub secrets/variables from `DEPLOY.md`.
3. Redeploy; confirm the web build uploaded source maps and published no `.map`
   files.
4. Run the API diagnostic through `.github/workflows/sentry-diagnostic.yml`.
5. Sign in as an admin on `https://turingcare.dog/admin`, open DevTools, and run
   `await window.__turingcareMonitoringDiagnostic()`.
6. Verify one symbolicated event per project with the correct `release`,
   normalized route, and request ID, and confirm no owner data is present.
7. Verify exactly one deduplicated GitHub Issue per diagnostic, labeled
   `production` and `monitoring`, containing no event payload.
8. Resolve both diagnostic issues in Sentry and close the GitHub Issues with a
   note.

- [ ] **Step 6: Record the phase**

Append a `## 2026-08-10 — Production error monitoring (Sentry) — SHIPPED` entry
to `docs/PROJECT-LOG.md` following the existing entry format: what changed,
gates run, spec/plan links
(`docs/superpowers/specs/2026-08-10-production-operational-readiness-design.md`,
`docs/superpowers/plans/2026-08-10-sentry-production-monitoring.md`), and the
commit range. Record the measured rollout results from Step 5. Include no event
payloads, DSNs, or tokens.

- [ ] **Step 7: Commit**

```bash
git add docs/PROJECT-LOG.md
git commit -m "docs: log production monitoring rollout"
```

If Steps 1–5 required source corrections, commit those separately with an
explicit file list first (never `git add -A`), for example:

```bash
git add apps/api/src/monitoring apps/web/src/monitoring
git commit -m "fix: correct monitoring gate findings"
```
