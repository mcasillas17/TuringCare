import type { EmailBody } from "./templates";

export interface BriefEmailInputs {
  dogName: string;
  ownerName: string;
  message: string | null;
  summary: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderBriefEmail(args: BriefEmailInputs): EmailBody {
  const safeDog = escapeHtml(args.dogName);
  const safeOwner = escapeHtml(args.ownerName);
  const safeMessage = args.message ? escapeHtml(args.message) : null;
  const safeSummary = escapeHtml(args.summary);

  const messageBlock = safeMessage
    ? `<blockquote style="margin:0 0 20px;padding:12px 16px;border-left:3px solid #b45309;background:#fef9f0;font-size:14px;line-height:1.6;color:#0f172a;white-space:pre-wrap">${safeMessage}</blockquote>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f6f5f3;font-family:ui-sans-serif,system-ui,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<h1 style="margin:0 0 4px;font-size:20px;color:#0f172a">Behavior Brief: ${safeDog}</h1>
<p style="margin:0 0 20px;font-size:13px;color:#6b7280">Shared by ${safeOwner}</p>
${messageBlock}
<div style="font-size:14px;line-height:1.6;white-space:pre-wrap;color:#0f172a">${safeSummary}</div>
</td></tr></table>
<p style="margin:16px 0 0;font-size:11px;color:#9ca3af">TuringCare · humane, reward-based dog training support</p>
</td></tr></table></body></html>`;

  const textParts = [
    `Behavior Brief: ${args.dogName}`,
    `Shared by ${args.ownerName}`,
    "",
  ];
  if (args.message) {
    textParts.push(args.message, "", "---", "");
  }
  textParts.push(args.summary, "", "--", "TuringCare · humane, reward-based dog training support");

  return {
    subject: `Behavior Brief: ${args.dogName}`,
    html,
    text: textParts.join("\n"),
  };
}
