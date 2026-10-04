/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API. Unset in dev (Vite proxy); set at build for prod. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
