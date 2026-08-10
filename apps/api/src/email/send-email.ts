import { Resend } from "resend";
import { env } from "../env";
import { captureTestEmail } from "./test-outbox";

export class EmailSendError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmailSendError";
  }
}

/** Minimal seam over the Resend SDK so the provider is swappable + testable. */
export interface ResendLike {
  emails: {
    send(args: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
      reply_to?: string;
    }): Promise<{ data: unknown; error: unknown }>;
  };
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface SendEmailDeps {
  client?: ResendLike;
  apiKey?: string;
  from?: string;
  /** Optional capture callback. When provided, the email is recorded here
   *  instead of being sent via Resend (useful for tests / E2E mode). */
  capture?: ((args: SendEmailArgs) => void) | undefined;
}

/**
 * Deliver one transactional email. Provider-isolated. With no API key
 * (local/CI) it logs and resolves — no network, never throws. With a key it
 * sends via Resend and throws EmailSendError on any provider/transport failure.
 */
export async function sendEmail(args: SendEmailArgs, deps: SendEmailDeps = {}): Promise<void> {
  if (!args.to.trim() || !args.subject.trim()) {
    throw new EmailSendError("sendEmail: 'to' and 'subject' are required");
  }
  if (!args.html.trim() && !args.text.trim()) {
    throw new EmailSendError("sendEmail: email must have html or text body");
  }

  // `in` check (not `?? env`): tests force log-mode via { apiKey: undefined }
  // without touching env; production callers omit deps → env.RESEND_API_KEY.
  //
  // Capture resolution: explicit `capture` key in deps takes priority; then
  // E2E_TEST_MODE auto-captures; otherwise undefined (normal send path).
  const capture: ((args: SendEmailArgs) => void) | undefined =
    "capture" in deps ? deps.capture : env.E2E_TEST_MODE ? captureTestEmail : undefined;

  if (capture) {
    capture(args);
    return;
  }

  const apiKey = "apiKey" in deps ? deps.apiKey : env.RESEND_API_KEY;
  const from = deps.from ?? env.EMAIL_FROM;

  if (!apiKey) {
    console.info("[email:dev]", { to: args.to, subject: args.subject });
    return;
  }

  // Narrow seam: the real Resend SDK's emails.send has a wider signature/return
  // than ResendLike; the cast is deliberate so callers depend only on ResendLike.
  const client: ResendLike = deps.client ?? (new Resend(apiKey) as unknown as ResendLike);

  let result: { data: unknown; error: unknown };
  try {
    const sendArgs: Parameters<ResendLike["emails"]["send"]>[0] = {
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    };
    if (args.replyTo) sendArgs.reply_to = args.replyTo;
    result = await client.emails.send(sendArgs);
  } catch (cause) {
    throw new EmailSendError(
      `sendEmail: transport failure: ${cause instanceof Error ? cause.message : "unknown"}`,
      { cause },
    );
  }
  if (result.error) {
    const e = result.error as { message?: string; statusCode?: number };
    throw new EmailSendError(
      `sendEmail: provider error ${e.statusCode ?? "?"}: ${e.message ?? "unknown"}`,
    );
  }
}
