import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3001),
  // Public origin of the frontend. Drives CORS allow-list and Better Auth
  // trusted origins. Local: http://localhost:3000. Prod: https://turingcare.dog
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(16),
  // Public base URL of the auth server (the API itself).
  // Local: http://localhost:3001. Prod: https://api.turingcare.dog
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3001"),
  // Parent cookie domain for cross-subdomain auth in production
  // (e.g. ".turingcare.dog"). Leave UNSET for local dev (same-origin via the
  // Vite proxy). When set, Better Auth issues cross-subdomain,
  // SameSite=None; Secure cookies so the frontend and API subdomain share a session.
  COOKIE_DOMAIN: z.string().optional(),
  // Comma-separated admin email allowlist. Any matching authenticated user is
  // treated as admin and lazily promoted (user.role -> 'admin') so the operator
  // is never locked out. Empty/unset = no bootstrap admins.
  ADMIN_EMAILS: z
    .string()
    .optional()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  // Events older than this many days are purged by the scheduled retention job.
  EVENT_RETENTION_DAYS: z.coerce.number().int().positive().default(180),
});

export const env = schema.parse(process.env);
