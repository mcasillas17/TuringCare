import { serve } from "@hono/node-server";
import { captureApiStartupFailure } from "./monitoring/sentry";

// `app` and `env` are imported dynamically inside `main()`, not at module top
// level, so that a failure while evaluating either module (e.g. `env.ts`'s
// fail-fast Zod parse) is thrown inside `main()` and reaches `fail()` below,
// rather than crashing before monitoring or the startup-failure handler
// exist.
async function main(): Promise<void> {
  const [{ app }, { env }] = await Promise.all([import("./app"), import("./env")]);

  const server = serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, (info) => {
    console.log(`api listening on http://0.0.0.0:${info.port}`);
  });

  // Covers failures that happen after `serve()` returns, e.g. the port is
  // already bound (EADDRINUSE), which `serve()` itself does not throw for.
  server.on("error", fail);
}

function fail(error: unknown): void {
  console.error("API failed to start:", error);
  captureApiStartupFailure(error)
    .catch((captureError: unknown) => {
      console.error("Failed to report the startup failure to monitoring:", captureError);
    })
    .finally(() => {
      process.exit(1);
    });
}

main().catch(fail);
