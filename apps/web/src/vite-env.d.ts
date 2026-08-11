/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API. Unset in dev (Vite proxy); set at build for prod. */
  readonly VITE_API_URL?: string;
  /** Sentry DSN. Unset locally/CI -> monitoring stays disabled. See src/monitoring/config.ts. */
  readonly VITE_SENTRY_DSN?: string;
  /** Must be exactly "production" for monitoring to enable. */
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  /** Release identifier (e.g. git SHA), must be at least 7 characters. */
  readonly VITE_SENTRY_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
