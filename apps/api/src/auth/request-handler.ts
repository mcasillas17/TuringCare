import { verificationResendSchema } from "@turingcare/shared";
import { auth } from "../auth";
import { resolveRequestLocale } from "../middleware/locale";
import { canonicalAuthPath } from "./request-path";
import { resendVerification, verificationResendHeaders } from "./resend-verification";
import { getAuthoritativeSession } from "./session";
import { verificationCallback } from "./verification-callback";
import { clearVerificationReceipt, stageVerification } from "./verification-proof";
import { trustedVerificationIp, verificationRateLimited } from "./verification-rate-limit";

const recoveryPaths = new Set([
  "/get-session",
  "/sign-up/email",
  "/sign-in/email",
  "/sign-out",
  "/verify-email",
  "/send-verification-email",
  "/request-password-reset",
  "/reset-password",
]);

/** Gate native account endpoints independently of domain middleware. */
export async function handleAuthRequest(inputRequest: Request): Promise<Response> {
  const response = await dispatchAuthRequest(inputRequest);
  const path = canonicalAuthPath(new URL(inputRequest.url).pathname);
  if (
    inputRequest.method === "POST" &&
    (path === "/sign-up/email" ||
      path === "/sign-out" ||
      (path === "/sign-in/email" && response.ok))
  ) {
    return clearVerificationReceipt(response);
  }
  return response;
}

async function dispatchAuthRequest(inputRequest: Request): Promise<Response> {
  let request = inputRequest;
  const url = new URL(request.url);
  const path = canonicalAuthPath(url.pathname);
  if (!path) return Response.json({ error: "invalid_auth_path" }, { status: 400 });
  // Native routing and native rate-limit rules see the same canonical path.
  if (url.pathname !== `/api/auth${path}`) {
    url.pathname = `/api/auth${path}`;
    request = new Request(url, request);
  }
  const recoveryWithoutIp =
    (path === "/sign-out" && request.method === "POST") ||
    (path === "/get-session" && (request.method === "GET" || request.method === "HEAD"));
  if (!recoveryWithoutIp && trustedVerificationIp(request.headers) === null) {
    return Response.json({ error: "trusted_ip_required" }, { status: 503 });
  }
  if (path === "/verify-email") {
    if (request.method === "GET" || request.method === "HEAD") return stageVerification(request);
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }
  if (!recoveryPaths.has(path) && !/^\/reset-password\/[^/]+$/.test(path)) {
    const session = await getAuthoritativeSession(request.headers);
    if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (session.user.emailVerified !== true) {
      return Response.json({ error: "email_unverified" }, { status: 403 });
    }
  }
  if (request.method === "POST" && (path === "/sign-up/email" || path === "/update-user")) {
    const body: unknown = await request
      .clone()
      .json()
      .catch(() => null);
    if (body && typeof body === "object" && !Array.isArray(body)) {
      if ("emailVerified" in body || "email_verified" in body) {
        return Response.json({ error: "invalid_input" }, { status: 400 });
      }
      if (path === "/sign-up/email") {
        const callback = "callbackURL" in body ? body.callbackURL : undefined;
        request = new Request(request, {
          body: JSON.stringify({
            ...body,
            callbackURL: verificationCallback(callback, resolveRequestLocale(request)),
          }),
        });
      }
    }
  }
  if (path === "/send-verification-email" && request.method === "POST") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid_input" }, { status: 400 });
    }
    const parsed = verificationResendSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "invalid_input" }, { status: 400 });
    const callback = (body as Record<string, unknown>).callbackURL;
    const result = await resendVerification(
      request,
      {
        ...parsed.data,
        returnTo: verificationCallback(callback, resolveRequestLocale(request)),
      },
      true,
    );
    return Response.json(result.body, {
      status: result.status,
      headers: verificationResendHeaders(result),
    });
  }
  const response = await auth.handler(request);
  if (response.status === 429) {
    const raw = Number(response.headers.get("x-retry-after") ?? 60);
    return verificationRateLimited(Number.isFinite(raw) ? Math.max(1, Math.min(60, raw)) : 60);
  }
  if (path === "/sign-in/email" && response.status === 403) {
    let body: unknown;
    try {
      body = await response.clone().json();
    } catch (error) {
      if (error instanceof SyntaxError) return response;
      throw error;
    }
    if (body && typeof body === "object" && "code" in body && body.code === "EMAIL_NOT_VERIFIED") {
      return clearVerificationReceipt(
        Response.json(
          { code: "email_unverified", error: "email_unverified", message: "email_unverified" },
          { status: 403 },
        ),
      );
    }
  }
  return response;
}
