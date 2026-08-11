// Must be imported (via --import) before any other application module, so
// that Sentry's process-level uncaught-exception/unhandled-rejection
// handlers are installed before the rest of the app — including the
// database pool and Better Auth — has a chance to fail. See src/index.ts and
// the API dev/Docker start commands. `initializeApiMonitoring` self-guards to
// Node 22 (this project's pinned runtime, see Dockerfile.api) and disables
// itself instead of calling Sentry's `init` on any other Node major, since
// Sentry + tsx has been verified to exit the process silently on Node >=24.
import { initializeApiMonitoring } from "./monitoring/sentry";

initializeApiMonitoring();
