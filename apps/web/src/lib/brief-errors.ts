export const BRIEF_ERROR_CODES = [
  "not_found",
  "not_finalized",
  "send_failed",
  "brief_version_conflict",
  "idempotency_conflict",
  "send_rate_limited",
] as const;

export type BriefErrorCode = (typeof BRIEF_ERROR_CODES)[number];
export type BriefRequestContext = "load" | "generate" | "finalize" | "share" | "revoke" | "send";
export type BriefFallbackCode =
  | "load_failed"
  | "gen_failed"
  | "save_failed"
  | "share_failed"
  | "revoke_failed"
  | "send_failed";

const briefErrorCodes = new Set<string>(BRIEF_ERROR_CODES);

export function isBriefErrorCode(value: unknown): value is BriefErrorCode {
  return typeof value === "string" && briefErrorCodes.has(value);
}

export class BriefRequestError extends Error {
  constructor(
    public readonly code: BriefErrorCode | BriefFallbackCode,
    public readonly status: number,
    public readonly context: BriefRequestContext,
  ) {
    super(code);
    this.name = "BriefRequestError";
  }
}

type ErrorResponse = Pick<Response, "status" | "json">;

export async function readBriefRequestError(
  response: ErrorResponse,
  context: BriefRequestContext,
  fallback: BriefFallbackCode,
): Promise<BriefRequestError> {
  let code: BriefErrorCode | BriefFallbackCode = fallback;
  try {
    const payload: unknown = await response.json();
    if (
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      isBriefErrorCode(payload.error)
    ) {
      code = payload.error;
    }
  } catch {
    // A malformed or non-JSON response is an untrusted transport failure. The
    // stable operation fallback is intentionally used instead of response text.
  }
  return new BriefRequestError(code, response.status, context);
}

export type BriefSendMessageKey =
  | "briefSend.needsFinalized"
  | "briefSend.notFound"
  | "briefSend.versionConflict"
  | "briefSend.idempotencyConflict"
  | "briefSend.rateLimited"
  | "briefSend.sendFailed";

export function briefSendErrorMessageKey(error: unknown): BriefSendMessageKey {
  if (!(error instanceof BriefRequestError)) return "briefSend.sendFailed";
  switch (error.code) {
    case "not_finalized":
      return "briefSend.needsFinalized";
    case "not_found":
      return "briefSend.notFound";
    case "brief_version_conflict":
      return "briefSend.versionConflict";
    case "idempotency_conflict":
      return "briefSend.idempotencyConflict";
    case "send_rate_limited":
      return "briefSend.rateLimited";
    default:
      return "briefSend.sendFailed";
  }
}
