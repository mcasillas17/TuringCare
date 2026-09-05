import { verificationResendSchema } from "@turingcare/shared";
import { auth } from "../auth";
import { resolveRequestLocale } from "../middleware/locale";
import { resendVerification, verificationResendHeaders } from "./resend-verification";
import { getAuthoritativeSession } from "./session";
import { verificationCallback, verificationCallbackLocale } from "./verification-callback";
import { verificationRateLimited } from "./verification-rate-limit";

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
  let request = inputRequest;
  const url = new URL(request.url);
  const path = url.pathname.slice("/api/auth".length).replace(/\/+$/, "");
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
  if (path === "/verify-email") {
    const callback = url.searchParams.get("callbackURL");
    url.searchParams.set(
      "callbackURL",
      verificationCallback(
        callback,
        verificationCallbackLocale(callback, resolveRequestLocale(request)),
      ),
    );
    // Let Better Auth retain its native limiter and invalid-token handling even
    // for truncated links, rather than returning a raw validation error page.
    if (!url.searchParams.has("token")) url.searchParams.set("token", "invalid");
    request = new Request(url, request);
  }
  const response = await auth.handler(request);
  if (response.status === 429) {
    const raw = Number(response.headers.get("x-retry-after") ?? 60);
    return verificationRateLimited(Number.isFinite(raw) ? Math.max(1, Math.min(60, raw)) : 60);
  }
  if (path === "/sign-in/email" && response.status === 403) {
    const body = (await response.clone().json()) as { code?: string };
    if (body.code === "EMAIL_NOT_VERIFIED") {
      return Response.json(
        { code: "email_unverified", error: "email_unverified", message: "email_unverified" },
        { status: 403 },
      );
    }
  }
  return response;
}
