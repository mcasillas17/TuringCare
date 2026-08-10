import type { SendEmailArgs } from "./send-email";

export interface CapturedTestEmail extends SendEmailArgs {
  capturedAt: string;
}

const MAX_EMAILS = 50;
const messages: CapturedTestEmail[] = [];

export function captureTestEmail(args: SendEmailArgs): void {
  const captured: CapturedTestEmail = { ...args, capturedAt: new Date().toISOString() };
  messages.push(captured);
  if (messages.length > MAX_EMAILS) {
    messages.splice(0, messages.length - MAX_EMAILS);
  }
}

export function findLatestTestEmail(to: string): CapturedTestEmail | null {
  const needle = to.trim().toLowerCase();
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && msg.to.trim().toLowerCase() === needle) {
      return msg;
    }
  }
  return null;
}

export function resetTestOutbox(): void {
  messages.splice(0, messages.length);
}
