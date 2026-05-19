import type { AppType } from "@turingcare/api";
import { hc } from "hono/client";

// Dev: VITE_API_URL is unset → "/" so the Vite proxy forwards /health, /me,
// /api/* to the local API. Prod: VITE_API_URL=https://api.turingcare.dog
// (inlined at build time) so the deployed frontend calls the API subdomain.
export const api = hc<AppType>(import.meta.env.VITE_API_URL || "/", {
  init: { credentials: "include" },
});
