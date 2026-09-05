import { useQuery } from "@tanstack/react-query";
import {
  VERIFICATION_RESEND_WINDOW_SECONDS,
  type VerificationResendInput,
  type VerificationStatus,
  verificationStatusSchema,
} from "@turingcare/shared";
import { api } from "./api";
import { useSessionQueriesReady } from "./session-query-boundary";

export const verificationStatusKey = ["verification-status"] as const;

async function decodeStatus(response: Response): Promise<VerificationStatus> {
  if (!response.ok) throw new Error("verification_status_failed");
  return verificationStatusSchema.parse(await response.json());
}

export function useVerificationStatus() {
  const cacheReady = useSessionQueriesReady();
  return useQuery({
    queryKey: verificationStatusKey,
    enabled: cacheReady,
    retry: false,
    queryFn: async ({ signal }) =>
      decodeStatus(
        await api.api.verification.status.$get(undefined, {
          init: { signal, cache: "no-store" },
        }),
      ),
  });
}

export async function confirmVerification(): Promise<VerificationStatus> {
  return decodeStatus(
    await api.api.verification.confirm.$post(
      { json: {} },
      {
        init: { cache: "no-store" },
      },
    ),
  );
}

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
  const headerWait = response.headers.get("Retry-After") ?? response.headers.get("X-Retry-After");
  const rawWait = "retryAfter" in data ? data.retryAfter : headerWait ? Number(headerWait) : null;
  const retryAfter =
    typeof rawWait === "number" && Number.isFinite(rawWait)
      ? Math.min(3600, Math.max(1, Math.ceil(rawWait)))
      : VERIFICATION_RESEND_WINDOW_SECONDS;
  if (response.ok && "status" in data) {
    if (data.status === "accepted") return { status: "accepted", retryAfter } as const;
    if (data.status === "already_verified") return { status: "already_verified" } as const;
  }
  throw new VerificationRequestError(
    "error" in data && typeof data.error === "string" ? data.error : "verification_send_failed",
    response.status === 429 || response.status === 503 ? retryAfter : 0,
  );
}
