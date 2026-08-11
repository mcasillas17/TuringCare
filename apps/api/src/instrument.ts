// Must be imported (via --import) before any other application module, so
// that Sentry's process-level uncaught-exception/unhandled-rejection
// handlers are installed before the rest of the app — including the
// database pool and Better Auth — has a chance to fail. See src/index.ts and
// the API dev/Docker start commands.
import { initializeApiMonitoring } from "./monitoring/sentry";

initializeApiMonitoring();
