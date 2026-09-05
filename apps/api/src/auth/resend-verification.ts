import {
  VERIFICATION_RESEND_WINDOW_SECONDS,
  type VerificationResendInput,
} from "@turingcare/shared";
import { createEmailVerificationToken } from "better-auth/api";
import { auth } from "../auth";
import { sendEmail } from "../email/send-email";
import { verificationEmail } from "../email/templates";
import { env } from "../env";
import { resolveRequestLocale } from "../middleware/locale";
import { getAuthoritativeSession } from "./session";
import { verificationCallback } from "./verification-callback";
import { consumeVerificationLimit, trustedVerificationIp } from "./verification-rate-limit";

export type VerificationResendResult =
  | {
      status: 200;
      body: { status: "accepted"; retryAfter: number } | { status: "already_verified" };
    }
  | {
      status: 401;
      body: { error: "invalid_credentials" | "verification_credentials_required" };
    }
  | { status: 403; body: { error: "forbidden" } }
  | { status: 429; body: { error: "rate_limited"; retryAfter: number } }
  | {
      status: 503;
      body:
        | { error: "verification_send_failed"; retryAfter: number }
        | { error: "trusted_ip_required" };
    };

export function verificationResendHeaders(result: VerificationResendResult) {
  return "retryAfter" in result.body
    ? {
        "Retry-After": String(result.body.retryAfter),
        "X-Retry-After": String(result.body.retryAfter),
      }
    : undefined;
}

export function isTrustedVerificationRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(env.FRONTEND_URL).origin) return false;
  if (request.headers.get("sec-fetch-site") === "cross-site" && !origin) return false;
  // Credentialed browser writes require an explicit trusted origin.
  return !request.headers.has("cookie") || origin === new URL(env.FRONTEND_URL).origin;
}

export async function resendVerification(
  request: Request,
  input: VerificationResendInput,
  native = false,
): Promise<VerificationResendResult> {
  const ip = trustedVerificationIp(request.headers);
  if (ip === null) return { status: 503, body: { error: "trusted_ip_required" } };
  if (!isTrustedVerificationRequest(request)) {
    return { status: 403, body: { error: "forbidden" } };
  }
  const ipWait = await consumeVerificationLimit("ip", ip);
  if (ipWait) return { status: 429, body: { error: "rate_limited", retryAfter: ipWait } };
  const session = await getAuthoritativeSession(request.headers);
  let identity: { id: string; email: string; emailVerified: boolean } | undefined = session?.user;
  const email = input.email?.toLowerCase();
  if (identity) {
    if (email && email !== identity.email.toLowerCase()) {
      return { status: 401, body: { error: "invalid_credentials" } };
    }
  } else {
    if (native || !email || !input.password) {
      return { status: 401, body: { error: "verification_credentials_required" } };
    }
    // Pair quota bounds password work without letting another IP lock a victim
    // out globally. The independent IP quota also limits guesses across emails.
    const credentialWait = await consumeVerificationLimit(
      "credential",
      JSON.stringify([email, ip]),
    );
    if (credentialWait) {
      return { status: 429, body: { error: "rate_limited", retryAfter: credentialWait } };
    }
    const context = await auth.$context;
    const found = await context.internalAdapter.findUserByEmail(email, { includeAccounts: true });
    const credential = found?.accounts.find((account) => account.providerId === "credential");
    // Match BA's constant-work credential check: one bounded password hash or
    // verification on every attempt. Never call signInEmail to prove identity.
    let valid = false;
    if (credential?.password) {
      valid = await context.password.verify({
        hash: credential.password,
        password: input.password,
      });
    } else {
      await context.password.hash(input.password);
    }
    if (!valid || !found) {
      return { status: 401, body: { error: "invalid_credentials" } };
    }
    identity = found.user;
  }
  if (identity.emailVerified === true) {
    return { status: 200, body: { status: "already_verified" } };
  }
  const sendWait = await consumeVerificationLimit("send", identity.email);
  if (sendWait) return { status: 429, body: { error: "rate_limited", retryAfter: sendWait } };
  const claimedAt = performance.now();
  const remaining = () =>
    Math.max(
      1,
      Math.ceil(VERIFICATION_RESEND_WINDOW_SECONDS - (performance.now() - claimedAt) / 1000),
    );
  const locale = resolveRequestLocale(request);
  const url = new URL("/api/auth/verify-email", env.BETTER_AUTH_URL);
  url.searchParams.set(
    "token",
    await createEmailVerificationToken(env.BETTER_AUTH_SECRET, identity.email),
  );
  url.searchParams.set("callbackURL", verificationCallback(input.returnTo, locale));
  try {
    // Local no-provider logging is not send acceptance. Capture mode is the
    // explicit no-network acceptance boundary used by integration/E2E tests.
    if (!env.RESEND_API_KEY && !env.E2E_TEST_MODE) throw new Error("Provider unavailable");
    await sendEmail({ to: identity.email, ...verificationEmail(url.toString(), locale) });
  } catch {
    console.error("[auth] verification_send_failed");
    return { status: 503, body: { error: "verification_send_failed", retryAfter: remaining() } };
  }
  return { status: 200, body: { status: "accepted", retryAfter: remaining() } };
}
