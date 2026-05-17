import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";
import { env } from "./env";

// In production the frontend (turingcare.dog) and API (api.turingcare.dog) are
// different subdomains, so the session cookie must be scoped to the parent
// domain and sent on cross-site requests. Driven entirely by COOKIE_DOMAIN —
// when it is unset (local dev, same-origin via the Vite proxy) Better Auth
// keeps its default first-party, SameSite=Lax cookie behavior.
const advanced = env.COOKIE_DOMAIN
  ? {
      crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN },
      defaultCookieAttributes: { sameSite: "none" as const, secure: true },
    }
  : undefined;

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  trustedOrigins: [env.FRONTEND_URL],
  emailAndPassword: { enabled: true },
  advanced,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
});

export type Auth = typeof auth;
