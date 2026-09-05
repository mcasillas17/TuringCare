import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { verificationLink } from "./auth/verification-callback";
import { consumeVerificationLimit } from "./auth/verification-rate-limit";
import { db } from "./db";
import * as schema from "./db/schema";
import { sendEmail } from "./email/send-email";
import { passwordResetEmail, verificationEmail } from "./email/templates";
import { env } from "./env";
import { resolveRequestLocale } from "./middleware/locale";
import { recordEvent } from "./telemetry/record-event";

function authRequestLocale(request: Request | undefined) {
  return request ? resolveRequestLocale(request) : "en";
}

// Fly terminates TLS and forwards the real client IP. Without this Better Auth
// cannot key the limiter on the client and logs "Rate limiting skipped: could
// not determine client IP address". Cross-subdomain cookie attrs are still only
// applied in production (when COOKIE_DOMAIN is set).
const advanced = {
  disableOriginCheck: false,
  disableCSRFCheck: false,
  ipAddress: { ipAddressHeaders: ["fly-client-ip"] },
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
  // Route unexpected failures through Hono's privacy-safe error handler instead
  // of Better Call's raw exception logger (database errors can contain tokens).
  onAPIError: { throw: true },
  logger: {
    log: (level) => {
      if (level === "error") console.error("[auth] request_failed");
      else if (level === "warn") console.warn("[auth] request_warning");
    },
  },
  session: { cookieCache: { enabled: false } },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }, request) => {
      try {
        await sendEmail({ to: user.email, ...passwordResetEmail(url, authRequestLocale(request)) });
      } catch {
        console.error("[auth] password_reset_send_failed");
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: false,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }, request) => {
      try {
        if (await consumeVerificationLimit("send", user.email)) return;
        const locale = authRequestLocale(request);
        await sendEmail({
          to: user.email,
          ...verificationEmail(verificationLink(url, locale), locale),
        });
      } catch {
        // Signup remains privacy-neutral; credential-proven resend reports real
        // provider acceptance/failure. Never log identities or provider content.
        console.error("[auth] verification_send_failed");
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
    },
    // Verification-required signup creates no session. This event is emitted
    // only when a session is actually issued (normally explicit verified login).
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
      "/request-password-reset": { window: 60, max: 3 },
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
