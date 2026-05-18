import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";
import { env } from "./env";
import { recordEvent } from "./telemetry/record-event";

// Fly terminates TLS and forwards the real client IP. Without this Better Auth
// cannot key the limiter on the client and logs "Rate limiting skipped: could
// not determine client IP address". Cross-subdomain cookie attrs are still only
// applied in production (when COOKIE_DOMAIN is set).
const advanced = {
  ipAddress: { ipAddressHeaders: ["fly-client-ip", "x-forwarded-for"] },
  ...(env.COOKIE_DOMAIN
    ? {
        crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN },
        defaultCookieAttributes: { sameSite: "none" as const, secure: true },
      }
    : {}),
};

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  trustedOrigins: [env.FRONTEND_URL],
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      // Surfaced on session.user so /me and the web admin guard can read it.
      // input:false → clients can't self-assign a role at sign-up.
      role: { type: "string", required: false, defaultValue: "user", input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          await recordEvent("user.signed_up", { userId: createdUser.id });
        },
      },
    },
    session: {
      create: {
        after: async (createdSession) => {
          await recordEvent("user.signed_in", {
            userId: createdSession.userId,
            sessionId: createdSession.id,
          });
        },
      },
    },
  },
  advanced,
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/forget-password": { window: 60, max: 3 },
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      rateLimit: schema.rateLimit,
    },
  }),
});

export type Auth = typeof auth;
