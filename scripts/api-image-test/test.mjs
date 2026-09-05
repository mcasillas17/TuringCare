import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { gunzipSync } from "node:zlib";

const command = JSON.parse(process.env.TURINGCARE_IMAGE_COMMAND);
assert(Array.isArray(command) && command.every((arg) => typeof arg === "string"));
assert.match(process.version, /^v22\./, "production image must use the supported Node major");
assert(command.includes("--import") && command.includes("./src/instrument.ts"));
assert(command.includes("--unhandled-rejections=strict"));
assert.equal(command.at(-1), "src/index.ts");
const release = "image-smoke-synthetic-release";
const envelopes = [];
let responseMode = "accept";
const sink = createServer(
  {
    key: await readFile("/tls/key.pem"),
    cert: await readFile("/tls/cert.pem"),
  },
  (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const bytes = Buffer.concat(chunks);
      const body = (
        req.headers["content-encoding"] === "gzip" ? gunzipSync(bytes) : bytes
      ).toString();
      assert.match(req.url, /^\/api\/1\/envelope\//);
      envelopes.push(body);
      if (responseMode === "stall") return;
      if (responseMode === "disconnect") {
        req.socket.destroy();
        return;
      }
      res.writeHead(responseMode === "reject" ? 429 : 200);
      res.end("{}");
    });
  },
);
await new Promise((resolve) => sink.listen(0, "127.0.0.1", resolve));
const dsn = `https://synthetic@127.0.0.1:${sink.address().port}/1`;
const baseEnv = {
  ...process.env,
  SENTRY_DSN: "",
  SENTRY_ENVIRONMENT: "",
  SENTRY_RELEASE: "",
  NODE_EXTRA_CA_CERTS: "/tls/cert.pem",
  DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/unused",
  BETTER_AUTH_SECRET: "synthetic-image-only-secret-at-least-32-chars",
  BETTER_AUTH_URL: "http://localhost:3001",
  FRONTEND_URL: "http://localhost:3000",
  RESEND_API_KEY: "re_synthetic_health_only",
  PORT: "3001",
  // No inherited proxy or loader can change where this isolated sink receives.
  http_proxy: "",
  https_proxy: "",
  HTTP_PROXY: "",
  HTTPS_PROXY: "",
  NODE_OPTIONS: "",
};
const configured = { SENTRY_DSN: dsn, SENTRY_ENVIRONMENT: "production", SENTRY_RELEASE: release };
const poison = "/app/apps/api/image-tests/privacy-poison.mjs";
function diagnostic(mode, poisoned = false) {
  return [
    command[0],
    ...command.slice(1, -1),
    ...(poisoned ? ["--import", poison] : []),
    "src/monitoring/diagnostic.ts",
    mode,
  ];
}

function launch(args, env = {}) {
  const child = spawn(args[0], args.slice(1), { env: { ...baseEnv, ...env }, detached: true });
  let output = "";
  const collect = (chunk) => {
    output += chunk;
    assert(output.length < 100000, "unbounded process output");
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const kill = () => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  const deadline = setTimeout(kill, 60000);
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearTimeout(deadline);
      resolve({ code, signal, output });
    });
  });
  return { child, done, kill, output: () => output };
}

async function run(args, env, expectedCode) {
  const result = await launch(args, env).done;
  assert.equal(result.signal, null, result.output);
  assert.equal(result.code, expectedCode, result.output);
  assert(!result.output.includes("-sentinel"), "private data in process output");
  return result.output;
}

async function boot(env) {
  const process = launch(command, env);
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 500; attempt++) {
      if (process.child.exitCode !== null)
        throw new Error(`image exited during boot: ${process.output()}`);
      try {
        const response = await fetch("http://127.0.0.1:3001/health", {
          signal: AbortSignal.timeout(200),
        });
        if (response.ok) {
          healthy = true;
          break;
        }
      } catch {
        /* The listener is not ready yet; the loop is bounded. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(healthy, `image did not boot: ${process.output()}`);
  } finally {
    process.kill();
    await process.done;
  }
  return process.output();
}

function checkEvent(raw, route, method, fatal = false, extension = ".ts") {
  assert(!raw.includes("-sentinel"), "private sentinel escaped the sanitizer");
  const lines = raw.trim().split("\n");
  const header = JSON.parse(lines[0]);
  const item = JSON.parse(lines[1]);
  assert.equal(item.type, "event");
  assert.equal(lines.length, 3, "exactly one event per envelope");
  const event = JSON.parse(lines[2]);
  assert.equal(header.event_id, event.event_id);
  assert.match(event.event_id, /^[a-f0-9]{32}$/);
  assert.equal(event.release, release);
  assert.equal(event.environment, "production");
  assert.equal(event.tags.application, "api");
  assert.equal(event.tags.route, route);
  assert.equal(event.tags.method, method);
  assert.equal(String(event.tags.status), "500");
  assert(event.tags.request_id);
  for (const key of Object.keys(event.tags))
    assert(["application", "route", "method", "status", "request_id"].includes(key), key);
  for (const key of [
    "user",
    "extra",
    "contexts",
    "breadcrumbs",
    "message",
    "transaction",
    "logentry",
  ])
    assert.equal(event[key], undefined, key);
  if (event.request) assert.deepEqual(event.request, { method: "GET" });
  assert(event.exception.values.length > 0);
  const frames = event.exception.values.flatMap((error) => error.stacktrace?.frames ?? []);
  assert(
    extension === null ||
      frames.some((frame) => frame.filename?.endsWith(extension) && frame.lineno > 0),
    "diagnosable source stack survives",
  );
  for (const exception of event.exception.values) {
    assert.match(exception.value, /^Unexpected /);
    assert.equal(exception.mechanism?.data, undefined);
  }
  for (const frame of frames) {
    assert.equal(frame.vars, undefined);
    assert.equal(frame.context_line, undefined);
  }
  if (fatal) assert.equal(event.level, "fatal");
  return event;
}

try {
  await boot({});
  assert.equal(envelopes.length, 0);
  console.log("PASS ordinary image CMD boot; unconfigured sends nothing");
  assert.match(await run(diagnostic("status"), {}, 2), /"enabled":false/);
  assert.match(await boot({ ...configured, SENTRY_DSN: "invalid" }), /Monitoring disabled/);
  assert.match(
    await run(diagnostic("status"), { ...configured, SENTRY_DSN: "invalid" }, 2),
    /"enabled":false/,
  );
  await run(
    diagnostic("status"),
    { ...configured, SENTRY_DSN: "https://email%40sentinel@example.invalid/1" },
    2,
  );
  await boot(configured);
  assert.match(await run(diagnostic("status"), configured, 0), /"enabled":true/);
  assert.equal(envelopes.length, 0);
  await run(diagnostic("invalid"), configured, 2);
  console.log("PASS configured boot and initialization; invalid/disabled configuration fail open");

  const dropped = await run(
    [
      ...command.slice(0, -1),
      "--import",
      "/app/apps/api/image-tests/drop-event.mjs",
      "src/monitoring/diagnostic.ts",
      "request",
    ],
    configured,
    3,
  );
  assert.match(dropped, /no event acknowledged/);
  assert.equal(envelopes.length, 0);
  console.log("PASS SDK-dropped event cannot report successful flush/acknowledgement");

  for (const mode of ["request", "startup", "uncaught", "rejection"]) {
    const before = envelopes.length;
    const output = await run(diagnostic(mode, true), configured, mode === "request" ? 0 : 1);
    assert.equal(envelopes.length - before, 1, `one real event for ${mode}`);
    const route =
      mode === "request" ? "/operator-diagnostic" : mode === "startup" ? "startup" : "process";
    const method = mode === "request" ? "GET" : mode === "startup" ? "STARTUP" : "PROCESS";
    const event = checkEvent(envelopes[before], route, method, mode !== "request");
    if (mode === "request") {
      const result = output
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line))
        .at(-1);
      assert.equal(result.eventId, event.event_id);
      assert.equal(result.requestId, event.tags.request_id);
      assert.equal(result.flushSucceeded, true);
      assert.equal(result.delivery, "unconfirmed");
    }
    console.log(`PASS ${mode}: sanitized TLS envelope received, source stack, flush, exit`);
  }

  for (const mode of ["uncaught", "rejection"]) {
    const before = envelopes.length;
    await run(
      [...command.slice(0, -1), "/app/apps/api/image-tests/fatal-fixture.mjs", mode],
      configured,
      1,
    );
    assert.equal(envelopes.length - before, 1);
    const event = checkEvent(envelopes[before], "process", "PROCESS", true, null);
    assert.equal(event.exception.values.length, 2, "both raw error and linked cause sanitized");
    console.log(`PASS ${mode}: raw exception and cause excluded from transport and stderr`);
  }

  // Exercise index.ts's real dynamic-import startup failure, not just a CLI adapter.
  let before = envelopes.length;
  await run(command, { ...configured, RESEND_API_KEY: "" }, 1);
  assert.equal(envelopes.length - before, 1);
  checkEvent(envelopes[before], "startup", "STARTUP", true);
  await run(command, { RESEND_API_KEY: "" }, 1);
  assert.equal(envelopes.length - before, 1);
  console.log("PASS missing production Resend key stays fatal, captured only when configured");

  for (const failure of ["reject", "disconnect", "stall"]) {
    responseMode = failure;
    before = envelopes.length;
    const output = await run(diagnostic("request"), configured, 3);
    assert.match(output, /"flushSucceeded":false/);
    assert.match(output, /\[monitoring\] (transport|flush)/);
    assert.equal(envelopes.length - before, 1);
    // A fatal process must still exit 1 even when the SDK cannot deliver/drain.
    await run(diagnostic("uncaught"), configured, 1);
    sink.closeAllConnections();
    console.log(`PASS ${failure}: truthful diagnostic failure and bounded fatal exit`);
  }
  console.log(
    `PASS image monitoring gate: ${process.version}, ${envelopes.length} local envelopes; no production capture claimed`,
  );
} finally {
  sink.closeAllConnections();
  await new Promise((resolve) => sink.close(resolve));
}
