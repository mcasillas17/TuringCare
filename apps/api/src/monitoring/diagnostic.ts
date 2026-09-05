// Operator-only CLI. Nothing in the serving app imports this module. Its
// Hono app exists only in memory; it opens no listener, database, or email client.
import { Hono } from "hono";
import { createMonitoringErrorHandler } from "./error-handler";
import { type ApiEnv, requestIdMiddleware } from "./request-id";
import {
  captureApiError,
  captureApiStartupFailure,
  flushApiMonitoring,
  isApiMonitoringEnabled,
} from "./sentry";

const mode = process.argv[2];
if (
  process.argv.length !== 3 ||
  !["status", "request", "startup", "uncaught", "rejection"].includes(mode ?? "")
) {
  console.error("Usage: monitoring:diagnostic status|request|startup|uncaught|rejection");
  process.exit(2);
}

console.log(
  JSON.stringify({ diagnostic: mode, node: process.version, enabled: isApiMonitoringEnabled() }),
);
if (!isApiMonitoringEnabled()) {
  console.error("[monitoring] diagnostic unavailable; check runtime and monitoring configuration");
  process.exit(2);
}
if (mode === "status") process.exit(0);

// Backup bound for the entire diagnostic, including process-level handling.
setTimeout(() => {
  console.error("[monitoring] diagnostic deadline exceeded; delivery unconfirmed");
  process.exit(3);
}, 12000).unref();

const syntheticError = () => new Error("TuringCare controlled monitoring diagnostic");

async function main(): Promise<void> {
  if (mode === "uncaught") {
    setImmediate(() => {
      throw syntheticError();
    });
    return;
  }
  if (mode === "rejection") {
    void Promise.reject(syntheticError());
    return;
  }
  if (mode === "startup") {
    const drained = await captureApiStartupFailure(syntheticError());
    console.log(
      JSON.stringify({ diagnostic: mode, flushSucceeded: drained, delivery: "unconfirmed" }),
    );
    process.exit(drained ? 1 : 3);
  }

  let eventId: string | undefined;
  const app = new Hono<ApiEnv>().use("*", requestIdMiddleware);
  app.onError(
    createMonitoringErrorHandler((error, meta) => {
      eventId = captureApiError(error, meta);
      return eventId;
    }),
  );
  app.get("/operator-diagnostic", () => {
    throw syntheticError();
  });
  const response = await app.request("/operator-diagnostic");
  const body: unknown = await response.json();
  const drained = await flushApiMonitoring();
  console.log(
    JSON.stringify({
      diagnostic: mode,
      status: response.status,
      requestId: response.headers.get("X-Request-ID"),
      eventId,
      flushSucceeded: drained,
      delivery: "unconfirmed",
    }),
  );
  const expectedResponse =
    response.status === 500 &&
    JSON.stringify(body) === JSON.stringify({ error: "internal_server_error" });
  process.exit(expectedResponse && eventId && drained ? 0 : 3);
}

void main().catch(() => {
  console.error("[monitoring] diagnostic failed; delivery unconfirmed");
  process.exit(3);
});
