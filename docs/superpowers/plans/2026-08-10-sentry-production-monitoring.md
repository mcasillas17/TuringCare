# Sentry Production Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-safe production error monitoring for the API and web application, correlate failures with request IDs and releases, upload private web source maps, and route actionable Sentry alerts into deduplicated GitHub Issues.

**Architecture:** The API and web app use separate Sentry projects and separate SDK packages, but enforce the same allowlist policy: no user identity, content, request bodies, query strings, cookies, authorization data, or free-form context leaves the application. Pure sanitizers shape every event before transport; if shaping fails, `beforeSend` returns `null`. The API assigns a request ID to every response and reports unexpected server exceptions; the web app reports render failures plus network/5xx API failures and retains the API request ID for support correlation.

**Tech Stack:** Node 22, TypeScript, Hono, React 19, Vite 6, Vitest, `@sentry/node`, `@sentry/react`, `@sentry/vite-plugin`, Fly.io, Cloudflare Pages, GitHub Actions.

---

## File map

- Create `apps/api/src/monitoring/sanitize-event.ts`: allowlist-shaped Sentry event sanitizer.
- Create `apps/api/src/monitoring/sanitize-event.test.ts`: forbidden-data and failure-path tests.
- Create `apps/api/src/monitoring/sentry.ts`: production-only initialization and capture adapter.
- Create `apps/api/src/monitoring/request-id.ts`: request-ID generation, validation, and Hono middleware.
- Create `apps/api/src/monitoring/request-id.test.ts`: request-ID propagation and error-correlation tests.
- Create `apps/api/src/app.monitoring.test.ts`: global 500 response and CORS exposure tests.
- Modify `apps/api/src/env.ts`: explicit monitoring environment variables.
- Create `apps/api/src/env.test.ts`: monitoring configuration tests.
- Modify `apps/api/src/app.ts`: install request-ID middleware and global unexpected-error capture.
- Modify `apps/api/src/index.ts`: initialize monitoring before importing the application.
- Create `apps/web/src/monitoring/sanitize-event.ts`: browser event sanitizer.
- Create `apps/web/src/monitoring/sanitize-event.test.ts`: browser privacy regression tests.
- Create `apps/web/src/monitoring/sentry.ts`: production-only browser initialization and captures.
- Create `apps/web/src/monitoring/monitored-fetch.ts`: capture network/5xx failures without bodies or query strings.
- Create `apps/web/src/monitoring/monitored-fetch.test.ts`: request-ID and failure classification tests.
- Create `apps/web/src/components/app-error-boundary.tsx`: localized fatal-render recovery UI.
- Create `apps/web/src/components/app-error-boundary.test.tsx`: boundary capture and reset tests.
- Modify `apps/web/src/lib/api.ts`: use the monitored fetch implementation.
- Modify `apps/web/src/main.tsx`: initialize monitoring before render and install the boundary.
- Modify `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`: fatal-error copy.
- Modify `apps/web/vite.config.ts`: hidden source maps and Sentry upload plugin.
- Modify `apps/api/package.json`, `apps/web/package.json`, `pnpm-lock.yaml`: SDK dependencies.
- Modify `.github/workflows/deploy.yml`: one Git SHA release across API/web and blocking source-map upload.
- Create `.github/workflows/sentry-diagnostic.yml`: manually approved operator-only diagnostic events.
- Create `apps/api/src/monitoring/diagnostic.ts`: controlled API/web project test event.
- Create `docs/runbooks/production-monitoring.md`: setup, alerts, diagnosis, rollback, and privacy audit.
- Modify `DEPLOY.md`: required Sentry/Fly/GitHub configuration.

### Task 1: Add SDK dependencies and explicit production configuration

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/api/src/env.ts`

- [ ] **Step 1: Add the SDK packages with pnpm**

Run:

```bash
pnpm --filter @turingcare/api add @sentry/node
pnpm --filter @turingcare/web add @sentry/react
pnpm --filter @turingcare/web add -D @sentry/vite-plugin
```

Expected: package manifests and `pnpm-lock.yaml` contain the resolved versions; do not hand-edit versions.

- [ ] **Step 2: Write failing environment tests**

Create `apps/api/src/env.test.ts` cases that reload `./env` after resetting modules:

```ts
it("keeps monitoring disabled when no DSN is configured", async () => {
  delete process.env.SENTRY_DSN;
  delete process.env.SENTRY_ENVIRONMENT;
  vi.resetModules();
  const { env } = await import("./env");
  expect(env.SENTRY_DSN).toBeUndefined();
  expect(env.SENTRY_ENVIRONMENT).toBe("development");
});

it("requires production and a release when Sentry is enabled", async () => {
  process.env.SENTRY_DSN = "https://public@example.ingest.sentry.io/1";
  process.env.SENTRY_ENVIRONMENT = "production";
  delete process.env.SENTRY_RELEASE;
  vi.resetModules();
  await expect(import("./env")).rejects.toThrow("SENTRY_RELEASE");
});
```

Preserve the test file's existing valid defaults for `DATABASE_URL` and `BETTER_AUTH_SECRET`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @turingcare/api test -- src/env.test.ts`

Expected: FAIL because the Sentry fields do not exist.

- [ ] **Step 4: Add the environment fields and cross-field rule**

Extend the Zod object in `apps/api/src/env.ts`:

```ts
SENTRY_DSN: z.string().url().optional(),
SENTRY_ENVIRONMENT: z.enum(["development", "test", "production"]).default("development"),
SENTRY_RELEASE: z.string().min(7).optional(),
```

Then replace the direct parse with:

```ts
const parsed = schema.superRefine((value, ctx) => {
  if (value.SENTRY_DSN && value.SENTRY_ENVIRONMENT !== "production") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SENTRY_ENVIRONMENT"],
      message: "SENTRY_DSN may only be enabled for production",
    });
  }
  if (value.SENTRY_DSN && !value.SENTRY_RELEASE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SENTRY_RELEASE"],
      message: "SENTRY_RELEASE is required when SENTRY_DSN is configured",
    });
  }
}).parse(process.env);

export const env = parsed;
```

The web uses build-time variables `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, and `VITE_SENTRY_RELEASE`; do not add a committed `.env` file.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
pnpm --filter @turingcare/api test -- src/env.test.ts
pnpm --filter @turingcare/api typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/web/package.json apps/api/src/env.ts apps/api/src/env.test.ts pnpm-lock.yaml
git commit -m "build: add production monitoring dependencies"
```

### Task 2: Enforce the API event privacy allowlist

**Files:**
- Create: `apps/api/src/monitoring/sanitize-event.ts`
- Create: `apps/api/src/monitoring/sanitize-event.test.ts`

- [ ] **Step 1: Write the forbidden-data regression test**

Use a sentinel that must never appear in serialized output:

```ts
import type { Event } from "@sentry/node";
import { describe, expect, it } from "vitest";
import { sanitizeApiEvent } from "./sanitize-event";

const SECRET = "OWNER-CONTENT-DO-NOT-SEND";

it("keeps only approved operational fields", () => {
  const event = {
    event_id: "abc",
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
    contexts: { runtime: { name: "node", version: "22" }, owner: { note: SECRET } },
  } satisfies Event;

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
  expect(sanitized?.request).toEqual({ method: "POST" });
});
```

Also add:

```ts
it("returns null instead of sending when sanitization throws", () => {
  const event = {} as Event;
  Object.defineProperty(event, "tags", {
    get() {
      throw new Error("malformed event");
    },
  });
  expect(sanitizeApiEvent(event)).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/api test -- src/monitoring/sanitize-event.test.ts`

Expected: FAIL because `sanitizeApiEvent` is missing.

- [ ] **Step 3: Implement allowlist shaping**

Create `apps/api/src/monitoring/sanitize-event.ts`:

```ts
import type { Event, EventHint } from "@sentry/node";

const ALLOWED_TAGS = ["application", "route", "method", "status", "request_id"] as const;
function safeException(event: Event): Event["exception"] {
  const values = event.exception?.values?.map((value) => ({
    type: value.type,
    stacktrace: value.stacktrace
      ? {
          frames: value.stacktrace.frames?.map((frame) => ({
            filename: frame.filename,
            function: frame.function,
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
          })),
        }
      : undefined,
  }));
  return values ? { values } : undefined;
}

export function sanitizeApiEvent(event: Event, _hint?: EventHint): Event | null {
  try {
    const tags = Object.fromEntries(
      ALLOWED_TAGS.flatMap((key) => {
        const value = event.tags?.[key];
        return typeof value === "string" || typeof value === "number" ? [[key, value]] : [];
      }),
    );
    return {
      event_id: event.event_id,
      timestamp: event.timestamp,
      platform: event.platform,
      level: event.level,
      release: event.release,
      environment: event.environment,
      exception: safeException(event),
      request: event.request?.method ? { method: event.request.method } : undefined,
      tags,
      contexts: event.contexts?.runtime ? { runtime: event.contexts.runtime } : undefined,
    };
  } catch {
    return null;
  }
}

export function sanitizeApiBreadcrumb() {
  return null;
}
```

Exception values and breadcrumbs are intentionally dropped because both are
free-form and can contain owner-authored content. Exception type and stack
frame coordinates are sufficient for grouping and diagnosis.

- [ ] **Step 4: Run the privacy tests**

Run: `pnpm --filter @turingcare/api test -- src/monitoring/sanitize-event.test.ts`

Expected: PASS and the serialized event does not contain the sentinel.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/monitoring
git commit -m "feat(api): enforce monitoring privacy allowlist"
```

### Task 3: Add API request correlation and unexpected-error capture

**Files:**
- Create: `apps/api/src/monitoring/request-id.ts`
- Create: `apps/api/src/monitoring/request-id.test.ts`
- Create: `apps/api/src/monitoring/sentry.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write request-ID behavior tests**

In `request-id.test.ts`, build a small Hono app with the middleware:

```ts
it("preserves a valid inbound request ID", async () => {
  const res = await testApp.request("/", { headers: { "X-Request-ID": "req-123_abc" } });
  expect(res.headers.get("X-Request-ID")).toBe("req-123_abc");
});

it("replaces an invalid request ID", async () => {
  const res = await testApp.request("/", { headers: { "X-Request-ID": "email@example.com" } });
  expect(res.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
});
```

Create `apps/api/src/app.monitoring.test.ts`:

```ts
it("returns the request ID on unexpected failures without leaking the exception", async () => {
  const res = await app.request("/api/test/monitoring-failure");
  expect(res.status).toBe(500);
  expect(res.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
  expect(await res.json()).toEqual({ error: "internal_server_error" });
});

it("exposes the request ID to the production web origin", async () => {
  const res = await app.request("/health", {
    headers: { Origin: "https://turingcare.dog" },
  });
  expect(res.headers.get("Access-Control-Expose-Headers")).toContain("X-Request-ID");
});
```

Use a test-only route installed through an exported `createApp({ monitoringFailureRoute: true })`; never expose this route from the production singleton.

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @turingcare/api test -- src/monitoring/request-id.test.ts src/app.monitoring.test.ts
```

Expected: FAIL because middleware and the app factory do not exist.

- [ ] **Step 3: Implement request-ID middleware**

Create `request-id.ts`:

```ts
import { randomUUID } from "node:crypto";
import { createMiddleware } from "hono/factory";

export type ApiEnv = { Variables: { requestId: string } };
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

export const requestIdMiddleware = createMiddleware<ApiEnv>(async (c, next) => {
  const inbound = c.req.header("X-Request-ID");
  const requestId = inbound && REQUEST_ID.test(inbound) ? inbound : randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-ID", requestId);
  await next();
});
```

- [ ] **Step 4: Implement the API Sentry adapter**

Create `sentry.ts`:

```ts
import * as Sentry from "@sentry/node";
import { env } from "../env";
import { sanitizeApiBreadcrumb, sanitizeApiEvent } from "./sanitize-event";

export function initializeApiMonitoring(): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    release: env.SENTRY_RELEASE,
    tracesSampleRate: 0,
    enableLogs: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      stackFrameVariables: false,
    },
    beforeSend: sanitizeApiEvent,
    beforeBreadcrumb: sanitizeApiBreadcrumb,
  });
}

export function captureApiError(
  error: unknown,
  context: { route: string; method: string; status: number; requestId: string },
): string | undefined {
  if (!env.SENTRY_DSN || context.status < 500) return undefined;
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
```

If the installed SDK's `dataCollection` type differs, use the current documented deny-all shape; do not remove the explicit opt-outs.

- [ ] **Step 5: Convert app construction to a typed factory and install capture**

In `apps/api/src/app.ts`:

```ts
import { captureApiError } from "./monitoring/sentry";
import { type ApiEnv, requestIdMiddleware } from "./monitoring/request-id";

export function createApp(options: { monitoringFailureRoute?: boolean } = {}) {
  const app = new Hono<ApiEnv>()
    .use("*", requestIdMiddleware)
    // existing secure headers, CORS, rate limit, and routes
    ;

  if (options.monitoringFailureRoute) {
    app.get("/api/test/monitoring-failure", () => {
      throw new Error("synthetic monitoring failure");
    });
  }

  app.onError((error, c) => {
    const requestId = c.get("requestId");
    captureApiError(error, {
      route: c.req.routePath || "unmatched",
      method: c.req.method,
      status: 500,
      requestId,
    });
    return c.json({ error: "internal_server_error" } as const, 500);
  });
  return app;
}

export const app = createApp();
export type AppType = typeof app;
```

Keep all existing middleware and routes in their current order after request-ID
assignment. Add `exposeHeaders: ["X-Request-ID"]` to the existing CORS options
so the production web origin can read the response header. Expected 4xx
responses continue to return normally and never call `captureApiError`.

- [ ] **Step 6: Initialize before application import**

Create `apps/api/src/instrument.ts`:

```ts
import { initializeApiMonitoring } from "./monitoring/sentry";

initializeApiMonitoring();
```

Change the Docker command and API scripts to preload it with Node's supported import hook:

```json
"dev": "tsx watch --import ./src/instrument.ts src/index.ts"
```

In `Dockerfile.api`, change only the final command to:

```dockerfile
CMD ["pnpm", "--filter", "@turingcare/api", "exec", "tsx", "--import", "./src/instrument.ts", "src/index.ts"]
```

Do not dynamically import `app` from `index.ts`; preloading is required so the SDK initializes before application modules.

- [ ] **Step 7: Run targeted and API tests**

Run:

```bash
pnpm --filter @turingcare/api test -- src/monitoring/request-id.test.ts src/monitoring/sanitize-event.test.ts src/app.monitoring.test.ts
pnpm --filter @turingcare/api typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

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

- [ ] **Step 1: Write browser sanitizer tests**

Mirror the API sentinel test, but allow only these tags:

```ts
{
  application: "web",
  route: "/my/dogs/:id/journal",
  api_route: "/api/dogs/:id",
  status: "500",
  request_id: "req-123",
}
```

Assert `user`, `request.url`, `request.headers`, `request.data`, `extra`, breadcrumb messages/data, query strings, fragments, emails, and the sentinel are absent. Assert malformed event getters return `null`.

- [ ] **Step 2: Write monitored-fetch tests**

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
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm --filter @turingcare/web test -- src/monitoring/sanitize-event.test.ts src/monitoring/monitored-fetch.test.ts
```

Expected: FAIL because the modules are missing.

- [ ] **Step 4: Implement the browser sanitizer**

Create a browser equivalent of Task 2 using `Event` from `@sentry/react`.
Keep only event ID, timestamp, platform, level, release, environment, exception
type and frame coordinates, the five approved tags, and browser/OS contexts.
Drop the exception value because it is free-form. Return `null` on any
exception and return `null` for every breadcrumb.

- [ ] **Step 5: Implement browser initialization and capture**

Create `apps/web/src/monitoring/sentry.ts`:

```ts
import * as Sentry from "@sentry/react";
import { sanitizeWebBreadcrumb, sanitizeWebEvent } from "./sanitize-event";

const enabled =
  import.meta.env.PROD &&
  import.meta.env.VITE_SENTRY_ENVIRONMENT === "production" &&
  Boolean(import.meta.env.VITE_SENTRY_DSN) &&
  Boolean(import.meta.env.VITE_SENTRY_RELEASE);

export function initializeWebMonitoring(): void {
  if (!enabled) return;
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: [],
    beforeSend: sanitizeWebEvent,
    beforeBreadcrumb: sanitizeWebBreadcrumb,
  });
}

export function captureWebError(
  error: unknown,
  context: {
    route: string;
    apiRoute?: string;
    status?: number;
    requestId?: string;
  },
): string | undefined {
  if (!enabled) return undefined;
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
```

Do not add browser tracing, replay, user identity, or `setUser`.

- [ ] **Step 6: Implement monitored fetch**

Create `monitored-fetch.ts`:

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

export function createMonitoredFetch(deps = {
  fetch: window.fetch.bind(window),
  capture: captureWebError,
}): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const apiRoute = normalizeApiPath(url);
    try {
      const response = await deps.fetch(input, init);
      if (response.status >= 500) {
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

Adjust `normalizeApiPath` to accept pathname-only inputs in tests without ever retaining search/hash values.

- [ ] **Step 7: Wire Hono client fetch**

Modify `apps/web/src/lib/api.ts`:

```ts
import { createMonitoredFetch } from "@/monitoring/monitored-fetch";

const monitoredFetch = createMonitoredFetch();

export const api = hc<AppType>(import.meta.env.VITE_API_URL || "/", {
  init: { credentials: "include" },
  fetch: monitoredFetch,
});
```

Use the exact option location accepted by the installed Hono version; keep credentials unchanged.

- [ ] **Step 8: Run tests and typecheck**

Run:

```bash
pnpm --filter @turingcare/web test -- src/monitoring/sanitize-event.test.ts src/monitoring/monitored-fetch.test.ts
pnpm --filter @turingcare/web typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/monitoring apps/web/src/lib/api.ts
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
await user.click(screen.getByRole("button", { name: "Try again" }));
expect(resetSpy).toHaveBeenCalledOnce();
```

Mock `captureWebError` to return `event-123`. Add a Spanish catalog test for `"Algo salió mal"`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/web test -- src/components/app-error-boundary.test.tsx`

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

- [ ] **Step 4: Implement the boundary**

Use a class component for `getDerivedStateFromError`/`componentDidCatch` and a small functional fallback that calls `useI18n`. Capture with `window.location.pathname` only. The retry button must clear boundary state and call `window.location.reload()`; never display the raw exception. Show the Sentry event ID only when capture returns one.

- [ ] **Step 5: Initialize monitoring and install the boundary**

At the top of `main.tsx`, import and call:

```ts
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { initializeWebMonitoring } from "@/monitoring/sentry";

initializeWebMonitoring();
```

Wrap the existing provider tree inside `LocaleProvider`:

```tsx
<LocaleProvider>
  <AppErrorBoundary>
    <BrowserRouter>{/* existing routes and toaster */}</BrowserRouter>
  </AppErrorBoundary>
</LocaleProvider>
```

Keep `StrictMode` and `QueryClientProvider`.

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
pnpm --filter @turingcare/web test -- src/components/app-error-boundary.test.tsx
pnpm --filter @turingcare/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/app-error-boundary* apps/web/src/main.tsx apps/web/src/i18n
git commit -m "feat(web): add monitored error recovery boundary"
```

### Task 6: Upload private web source maps and align releases

**Files:**
- Modify: `apps/web/vite.config.ts`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.gitignore`

- [ ] **Step 1: Add a configuration test**

Create `apps/web/vite.config.test.ts` and export a small pure helper:

```ts
expect(createSentryPluginOptions({
  org: "turingcare",
  project: "turingcare-web",
  release: "720c524",
  authToken: "token",
})).toMatchObject({
  org: "turingcare",
  project: "turingcare-web",
  release: { name: "720c524" },
  sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
});
```

Also assert the plugin is omitted unless all four values are present.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @turingcare/web test -- vite.config.test.ts`

Expected: FAIL because the helper is missing.

- [ ] **Step 3: Configure hidden source maps**

Update `vite.config.ts` to:

```ts
import { sentryVitePlugin } from "@sentry/vite-plugin";

export function createSentryPluginOptions(input: {
  org?: string;
  project?: string;
  release?: string;
  authToken?: string;
}) {
  if (!input.org || !input.project || !input.release || !input.authToken) return undefined;
  return {
    org: input.org,
    project: input.project,
    authToken: input.authToken,
    release: { name: input.release },
    sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
  };
}
```

Build the plugins array with `sentryVitePlugin(options)` last when options exist, and set:

```ts
build: { sourcemap: "hidden" }
```

Call the helper from the Vite config with:

```ts
const sentryOptions = createSentryPluginOptions({
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  release: process.env.SENTRY_RELEASE,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
```

After upload, `.map` files must be deleted before the Cloudflare Pages step.

- [ ] **Step 4: Pass one release through deployment**

In `.github/workflows/deploy.yml`, set:

```yaml
env:
  SENTRY_RELEASE: ${{ github.sha }}
```

For `deploy-web` build:

```yaml
env:
  VITE_API_URL: https://api.turingcare.dog
  VITE_SENTRY_DSN: ${{ secrets.SENTRY_WEB_DSN }}
  VITE_SENTRY_ENVIRONMENT: production
  VITE_SENTRY_RELEASE: ${{ github.sha }}
  SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
  SENTRY_ORG: ${{ vars.SENTRY_ORG }}
  SENTRY_PROJECT: ${{ vars.SENTRY_WEB_PROJECT }}
```

For API deployment, pass the release as a Fly build argument and set the runtime secret in a preceding command:

```yaml
- name: Set API monitoring release
  run: flyctl secrets set --stage --app turingcare-api SENTRY_RELEASE="$SENTRY_RELEASE"
  env:
    FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
- name: Deploy to Fly
  run: flyctl deploy --remote-only --config apps/api/fly.toml
```

Set `SENTRY_DSN` and `SENTRY_ENVIRONMENT=production` once as Fly secrets outside the workflow. Never expose `SENTRY_AUTH_TOKEN` to Fly or Vite client code.

- [ ] **Step 5: Verify map removal and blocking upload**

Run locally with non-production dummy values but no auth token:

```bash
pnpm --filter @turingcare/web build
find apps/web/dist -name '*.map' -print
```

Expected: local build succeeds and maps exist because upload is disabled.

In a disposable branch or dry-run environment with valid Sentry credentials, run the same build and assert `find` prints nothing. Then use an invalid token and assert the build fails before Pages deployment.

- [ ] **Step 6: Commit**

```bash
git add apps/web/vite.config.ts apps/web/vite.config.test.ts .github/workflows/deploy.yml .gitignore
git commit -m "build: upload private web source maps"
```

### Task 7: Add operator diagnostics and alert setup

**Files:**
- Create: `.github/workflows/sentry-diagnostic.yml`
- Create: `apps/api/src/monitoring/diagnostic.ts`
- Modify: `apps/api/package.json`
- Create: `docs/runbooks/production-monitoring.md`
- Modify: `DEPLOY.md`

- [ ] **Step 1: Create an operator-only diagnostic script**

The script accepts `SENTRY_DSN`, `SENTRY_RELEASE`, and `SENTRY_APPLICATION` (`api` or `web`), initializes `@sentry/node` with the same sanitizer policy, captures:

```js
const eventId = Sentry.captureException(new Error("TuringCare controlled monitoring diagnostic"), {
  tags: {
    application: process.env.SENTRY_APPLICATION,
    route: "operator-diagnostic",
    method: "MANUAL",
    status: "500",
    request_id: crypto.randomUUID(),
  },
});
const flushed = await Sentry.flush(10_000);
if (!flushed) process.exitCode = 1;
console.log(`Diagnostic submitted: ${eventId}`);
```

Do not accept or print owner data. Place the script in the API workspace so
`@sentry/node` and the API sanitizer resolve from the package that owns them:

```json
"monitoring:diagnostic": "tsx src/monitoring/diagnostic.ts"
```

- [ ] **Step 2: Add a manual GitHub workflow**

Configure `workflow_dispatch` with a required `application` choice (`api`, `web`), use the protected `production` GitHub environment, map the selected DSN from `SENTRY_API_DSN` or `SENTRY_WEB_DSN`, and use `${{ github.sha }}` as release. The workflow must never run on push or pull request.

- [ ] **Step 3: Write the monitoring runbook**

Document exact Sentry setup:

1. Create projects `turingcare-api` and `turingcare-web`.
2. Disable inbound user IP storage and enforce server-side scrubbing for `email`, `name`, `authorization`, `cookie`, `token`, `password`, `note`, `summary`, `antecedent`, `behavior`, `consequence`, and `owner_response`.
3. Create GitHub labels `production` and `monitoring`.
4. Install Sentry's GitHub integration with issue create/read permission only for `mcasillas17/TuringCare`.
5. Create an alert per project for new issues, regressions, and events at `error`/`fatal`; exclude HTTP status below 500.
6. Configure GitHub issue creation with those labels and Sentry's issue URL/fingerprint so repeated events update the same issue.
7. Set initial noise policy: page/issue immediately for fatal, regression, or sustained 5xx; review isolated first-seen errors during business hours.
8. Run one diagnostic for each project, verify release, stack, request ID, alert issue, and absence of forbidden data, then resolve the diagnostic issues.
9. Disable monitoring by removing `SENTRY_DSN` from Fly and `SENTRY_WEB_DSN` from GitHub if privacy or noise is unacceptable.

Include diagnosis instructions: start from GitHub Issue, open Sentry, identify `application`, `release`, normalized route, status, and request ID, then search Fly logs by request ID. Never ask users to paste journal or Brief content into an issue.

- [ ] **Step 4: Update deployment documentation**

Add:

| Location | Name |
|---|---|
| Fly secret | `SENTRY_DSN` |
| Fly secret | `SENTRY_ENVIRONMENT=production` |
| GitHub secret | `SENTRY_WEB_DSN` |
| GitHub secret | `SENTRY_API_DSN` |
| GitHub secret | `SENTRY_AUTH_TOKEN` |
| GitHub variable | `SENTRY_ORG` |
| GitHub variable | `SENTRY_WEB_PROJECT=turingcare-web` |

Document that `SENTRY_RELEASE` is deployment-managed, not manually pinned.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/sentry-diagnostic.yml apps/api/src/monitoring/diagnostic.ts apps/api/package.json docs/runbooks/production-monitoring.md DEPLOY.md
git commit -m "docs: add production monitoring operations"
```

### Task 8: Run the complete monitoring gate

**Files:**
- Modify only if a monitoring regression is found.

- [ ] **Step 1: Run all targeted privacy tests**

Run:

```bash
pnpm --filter @turingcare/api test -- src/env.test.ts src/monitoring/sanitize-event.test.ts src/monitoring/request-id.test.ts src/app.monitoring.test.ts
pnpm --filter @turingcare/web test -- src/monitoring/sanitize-event.test.ts src/monitoring/monitored-fetch.test.ts src/components/app-error-boundary.test.tsx vite.config.test.ts
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

Expected: PASS. Run API tests with the repository's real Postgres test database as CI does.

- [ ] **Step 3: Inspect browser artifacts**

Run:

```bash
find apps/web/dist -name '*.map' -print
grep -R "SENTRY_AUTH_TOKEN" apps/web/dist || true
```

Expected: no auth token in output. Local maps may exist when no upload credentials are supplied; CI production artifacts must contain no `.map` files after upload.

- [ ] **Step 4: Review the privacy contract manually**

Serialize the synthetic API and web events from the tests and search for the sentinels, emails, query values, cookie names, bearer tokens, dog names, note fields, and Brief summaries. Expected: none are present.

- [ ] **Step 5: Commit any gate-only corrections**

```bash
git add -A
git commit -m "test: complete monitoring readiness gate"
```

Skip this commit if no files changed.
