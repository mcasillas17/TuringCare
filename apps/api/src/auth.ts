import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";
import { sendEmail } from "./email/send-email";
import { passwordResetEmail, verificationEmail } from "./email/templates";
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
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      try {
        await sendEmail({ to: user.email, ...passwordResetEmail(url) });
      } catch (err) {
        console.error("[auth] sendResetPassword failed", {
          userId: user.id,
          err: err instanceof Error ? err.message : "unknown",
        });
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      try {
        await sendEmail({ to: user.email, ...verificationEmail(url) });
      } catch (err) {
        console.error("[auth] sendVerificationEmail failed", {
          userId: user.id,
          err: err instanceof Error ? err.message : "unknown",
        });
      }
    },
  },
  user: {
    additionalFields: {
      // Surfaced on session.user so /me and the web admin guard can read it.
      // input:false → clients can't self-assign a role at sign-up.
      role: { type: "string", required: false, defaultValue: "user", input: false },
    },
    // Enables POST /api/auth/delete-user. Wired up for the Settings page
    // "Danger zone" double-confirm flow. No verification email round-trip
    // (the client gates the call with an in-app "type delete to confirm");
    // FK cascades on dogs/journal/briefs/etc. clean up the user's data.
    deleteUser: { enabled: true },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          await recordEvent("user.signed_up", { userId: createdUser.id });
        },
      },
      delete: {
        after: async (deletedUser) => {
          await recordEvent("user.deleted", { props: { role: deletedUser.role } });
        },
      },
    },
    // Sign-up also creates a session, so registration legitimately emits both
    // signed_up and signed_in. Aggregations use first-occurrence/distinct-user,
    // so the double-emit is harmless.
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
