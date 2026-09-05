import { env } from "../env";

export const VERIFICATION_RECEIPT_SECONDS = 600;

export function verificationReceiptCookieSettings(maxAge = VERIFICATION_RECEIPT_SECONDS) {
  const secure =
    env.NODE_ENV === "production" || new URL(env.BETTER_AUTH_URL).protocol === "https:";
  return {
    name: `${secure ? "__Secure-" : ""}tc_verification_receipt`,
    attributes: `Path=/api/verification; HttpOnly; SameSite=${secure ? "None; Secure" : "Lax"}; Max-Age=${maxAge}`,
  };
}

export function clearVerificationReceipt(response: Response): Response {
  const { name, attributes } = verificationReceiptCookieSettings(0);
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", `${name}=; ${attributes}`);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
