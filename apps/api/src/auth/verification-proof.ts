import { createHmac } from "node:crypto";
import {
  type VerificationStatus,
  safeAuthReturnPath,
  verificationStatusSchema,
} from "@turingcare/shared";
import { symmetricDecrypt, symmetricEncrypt, verifyJWT } from "better-auth/crypto";
import { z } from "zod";
import { auth } from "../auth";
import { env } from "../env";
import { resolveRequestLocale } from "../middleware/locale";
import { getAuthoritativeSession } from "./session";
import { verificationCallback, verificationCallbackLocale } from "./verification-callback";
import {
  VERIFICATION_RECEIPT_SECONDS,
  verificationReceiptCookieSettings,
} from "./verification-cookie";
import { consumeVerificationLimit, trustedVerificationIp } from "./verification-rate-limit";

const MAX_RECEIPT_LENGTH = 3500;
const MAX_TOKEN_LENGTH = 1024;
const receiptFields = {
  expiresAt: z.number().finite(),
  token: z.string().max(MAX_TOKEN_LENGTH).optional(),
  emailFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
};
const receiptSchema = z.discriminatedUnion("status", [
  verificationStatusSchema.options[0].omit({ requiresSignOut: true }).extend(receiptFields),
  verificationStatusSchema.options[1].omit({ requiresSignOut: true }).extend(receiptFields),
]);
type Receipt = z.infer<typeof receiptSchema>;

function receiptKey() {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update("verification-receipt-v1")
    .digest("hex");
}

function emailFingerprint(email: string) {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`verification-receipt-subject:${email.trim().toLowerCase()}`)
    .digest("hex");
}

function publicState(receipt: VerificationStatus): VerificationStatus {
  return proofState(receipt.status, receipt.next, receipt.locale);
}

function proofState(
  status: VerificationStatus["status"],
  next: string,
  locale: VerificationStatus["locale"],
): VerificationStatus {
  if (status === "verified") return { status: "verified", next, locale };
  return { status, next, locale };
}

function emptyState(request: Request, status: VerificationStatus["status"]): VerificationStatus {
  return proofState(status, "/my", resolveRequestLocale(request));
}

async function receiptCookie(
  state: VerificationStatus,
  proof: { token?: string; emailFingerprint?: string } = {},
) {
  const receipt: Receipt = {
    ...publicState(state),
    expiresAt: Date.now() + VERIFICATION_RECEIPT_SECONDS * 1000,
    ...proof,
  };
  // Installed Better Auth authenticated encryption; a purpose-specific key
  // isolates these receipts from auth cookies. Compact hex to bounded base64url.
  const encrypted = await symmetricEncrypt({ key: receiptKey(), data: JSON.stringify(receipt) });
  const value = Buffer.from(encrypted, "hex").toString("base64url");
  if (value.length > MAX_RECEIPT_LENGTH) throw new Error("Verification receipt exceeded bound");
  const { name, attributes } = verificationReceiptCookieSettings();
  // Host-only: frontend JS and sibling subdomains do not need receipt access.
  return `${name}=${value}; ${attributes}`;
}

async function readReceipt(request: Request): Promise<Receipt | VerificationStatus> {
  const header = request.headers.get("cookie");
  if (!header) return emptyState(request, "none");
  if (header.length > 16_384) return emptyState(request, "invalid");
  const { name } = verificationReceiptCookieSettings();
  const matches = header
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${name}=`));
  if (!matches.length) return emptyState(request, "none");
  if (matches.length !== 1) return emptyState(request, "invalid");
  const value = matches[0]?.slice(name.length + 1) ?? "";
  if (!value || value.length > MAX_RECEIPT_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return emptyState(request, "invalid");
  }
  let receipt: Receipt;
  try {
    const encrypted = Buffer.from(value, "base64url").toString("hex");
    const plaintext = await symmetricDecrypt({ key: receiptKey(), data: encrypted });
    receipt = receiptSchema.parse(JSON.parse(plaintext));
  } catch {
    // Only decoding/authentication/parsing occurs here; database/provider errors
    // must not be recast as an invalid user link.
    return emptyState(request, "invalid");
  }
  if (receipt.expiresAt <= Date.now()) return proofState("expired", receipt.next, receipt.locale);
  if (receipt.status === "pending" && !receipt.token) return emptyState(request, "invalid");
  if (receipt.status === "verified" && !receipt.emailFingerprint) {
    return emptyState(request, "invalid");
  }
  return receipt;
}

async function stateForSession(
  request: Request,
  receipt: Receipt | VerificationStatus,
): Promise<VerificationStatus> {
  const state = publicState(receipt);
  if (state.status === "verified" && "emailFingerprint" in receipt && receipt.emailFingerprint) {
    const session = await getAuthoritativeSession(request.headers);
    if (session && emailFingerprint(session.user.email) !== receipt.emailFingerprint) {
      return { ...state, requiresSignOut: true };
    }
  }
  return state;
}

export async function verificationStatus(request: Request): Promise<VerificationStatus> {
  return stateForSession(request, await readReceipt(request));
}

/** Passive navigation: no user/session reads or writes, even for scanner GETs. */
export async function stageVerification(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const callback = url.searchParams.get("callbackURL");
  const locale = verificationCallbackLocale(callback, resolveRequestLocale(request));
  const target = new URL(verificationCallback(callback, locale));
  const next = safeAuthReturnPath(target.searchParams.get("next"));
  const token = url.searchParams.get("token") ?? "";
  const validShape = request.url.length <= 8192 && /^[A-Za-z0-9_.-]{1,1024}$/.test(token);
  const state: VerificationStatus = {
    status: validShape ? "pending" : "invalid",
    next: next.length <= 1024 ? next : "/my",
    locale,
  };
  target.searchParams.set("next", state.next);
  const headers = new Headers({
    Location: target.toString(),
    "Cache-Control": "no-store",
  });
  const destination = request.headers.get("sec-fetch-dest");
  if (request.method === "GET" && (destination === null || destination === "document")) {
    headers.set("Set-Cookie", await receiptCookie(state, validShape ? { token } : {}));
  }
  return new Response(null, { status: 302, headers });
}

type ConfirmationResult =
  | { status: 200; body: VerificationStatus; cookie?: string }
  | { status: 400; body: { error: "invalid_input" } }
  | { status: 403; body: { error: "forbidden" } }
  | { status: 503; body: { error: "trusted_ip_required" } }
  | { status: 429; body: { error: "rate_limited"; retryAfter: number } };

/** Only an explicit same-origin UI action may consume a staged verification token. */
export async function confirmVerification(request: Request): Promise<ConfirmationResult> {
  const ip = trustedVerificationIp(request.headers);
  if (ip === null) return { status: 503, body: { error: "trusted_ip_required" } };
  if (request.headers.get("origin") !== new URL(env.FRONTEND_URL).origin) {
    return { status: 403, body: { error: "forbidden" } };
  }
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  ) {
    return { status: 400, body: { error: "invalid_input" } };
  }
  const retryAfter = await consumeVerificationLimit("ip", ip);
  if (retryAfter) return { status: 429, body: { error: "rate_limited", retryAfter } };
  const receipt = await readReceipt(request);
  if (receipt.status !== "pending" || !("token" in receipt) || !receipt.token) {
    return { status: 200, body: await stateForSession(request, receipt) };
  }
  let state = publicState(receipt);
  // A valid email-change JWT enters a different BA branch which can create
  // sessions. These receipts accept ONLY initial ownership-verification tokens.
  const payload = await verifyJWT(receipt.token, env.BETTER_AUTH_SECRET);
  if (
    payload &&
    ("updateTo" in payload ||
      "requestType" in payload ||
      !z.email().safeParse(payload.email).success)
  ) {
    state = proofState("invalid", state.next, state.locale);
  } else {
    // No browser cookie/redirect passed internally. BA performs token validation
    // and the authoritative write; autoSignInAfterVerification remains false.
    const response = await auth.api.verifyEmail({
      query: { token: receipt.token },
      asResponse: true,
    });
    if (response.status >= 500) throw new Error("Verification service unavailable");
    const body: unknown = await response.json();
    if (
      response.ok &&
      body &&
      typeof body === "object" &&
      "status" in body &&
      body.status === true
    ) {
      state = proofState("verified", state.next, state.locale);
    } else if (
      body &&
      typeof body === "object" &&
      "code" in body &&
      body.code === "TOKEN_EXPIRED"
    ) {
      state = proofState("expired", state.next, state.locale);
    } else if (
      body &&
      typeof body === "object" &&
      "code" in body &&
      ["INVALID_TOKEN", "USER_NOT_FOUND", "INVALID_USER"].includes(String(body.code))
    ) {
      state = proofState("invalid", state.next, state.locale);
    } else {
      throw new Error("Unexpected verification service response");
    }
  }
  const proof: { emailFingerprint?: string } = {};
  if (state.status === "verified") {
    if (!payload || typeof payload.email !== "string") {
      throw new Error("Verified receipt subject unavailable");
    }
    proof.emailFingerprint = emailFingerprint(payload.email);
  }
  return {
    status: 200,
    body: await stateForSession(request, {
      ...state,
      ...proof,
      expiresAt: Date.now() + VERIFICATION_RECEIPT_SECONDS * 1000,
    }),
    cookie: await receiptCookie(state, proof),
  };
}
