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
const STATUS_TIMEOUT_MS = 8000;

async function decodeStatus(response: Response): Promise<VerificationStatus> {
  const body = await readResponseBody(response);
  if (!response.ok) throw requestError(response, body);
  return verificationStatusSchema.parse(body);
}

export function useVerificationStatus() {
  const cacheReady = useSessionQueriesReady();
  return useQuery({
    queryKey: verificationStatusKey,
    enabled: cacheReady,
    retry: false,
    queryFn: async ({ signal }) => {
      const controller = new AbortController();
      const cancel = () => controller.abort(signal.reason);
      if (signal.aborted) cancel();
      else signal.addEventListener("abort", cancel, { once: true });
      const timeout = window.setTimeout(
        () => controller.abort(new DOMException("Verification status timed out", "TimeoutError")),
        STATUS_TIMEOUT_MS,
      );
      try {
        return await decodeStatus(
          await api.api.verification.status.$get(undefined, {
            init: { signal: controller.signal, cache: "no-store" },
          }),
        );
      } finally {
        window.clearTimeout(timeout);
        signal.removeEventListener("abort", cancel);
      }
    },
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

async function readResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
}

function retryDelay(response: Response, body: unknown): number {
  const data = body && typeof body === "object" ? body : {};
  const headerWait = response.headers.get("Retry-After") ?? response.headers.get("X-Retry-After");
  const rawWait = "retryAfter" in data ? data.retryAfter : headerWait ? Number(headerWait) : null;
  return typeof rawWait === "number" && Number.isFinite(rawWait) && rawWait > 0
    ? Math.min(VERIFICATION_RESEND_WINDOW_SECONDS, Math.ceil(rawWait))
    : 0;
}

function requestError(response: Response, body: unknown): VerificationRequestError {
  const codes = [
    "invalid_credentials",
    "verification_credentials_required",
    "verification_send_failed",
    "rate_limited",
    "trusted_ip_required",
    "forbidden",
    "invalid_input",
  ];
  const data = body && typeof body === "object" ? body : {};
  const code =
    "error" in data && typeof data.error === "string" && codes.includes(data.error)
      ? data.error
      : "verification_service_failed";
  return new VerificationRequestError(
    code,
    response.status === 429 || response.status === 503 ? retryDelay(response, body) : 0,
  );
}

export async function resendVerification(input: VerificationResendInput) {
  const response = await api.api.verification.resend.$post({ json: input });
  const body = await readResponseBody(response);
  const data = body && typeof body === "object" ? body : {};
  const retryAfter = retryDelay(response, body);
  if (response.ok && "status" in data) {
    if (data.status === "accepted" && retryAfter > 0)
      return { status: "accepted", retryAfter } as const;
    if (data.status === "already_verified") return { status: "already_verified" } as const;
  }
  throw requestError(response, body);
}
