import type { VerificationResendInput } from "@turingcare/shared";
import { api } from "./api";

export class VerificationRequestError extends Error {
  constructor(
    readonly code: string,
    readonly retryAfter = 0,
  ) {
    super(code);
  }
}

export async function resendVerification(input: VerificationResendInput) {
  const response = await api.api.verification.resend.$post({ json: input });
  const body: unknown = await response.json();
  const data = body && typeof body === "object" ? body : {};
  if (response.ok && "status" in data) {
    if (data.status === "accepted" || data.status === "already_verified") return data.status;
  }
  const retryAfter =
    "retryAfter" in data && typeof data.retryAfter === "number" && Number.isFinite(data.retryAfter)
      ? Math.min(3600, Math.max(1, Math.ceil(data.retryAfter)))
      : 60;
  throw new VerificationRequestError(
    "error" in data && typeof data.error === "string" ? data.error : "verification_send_failed",
    response.status === 429 ? retryAfter : 0,
  );
}
