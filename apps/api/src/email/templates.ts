export interface EmailBody {
  subject: string;
  html: string;
  text: string;
}

function layout(heading: string, intro: string, cta: string, url: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f6f5f3;font-family:ui-sans-serif,system-ui,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">${heading}</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6">${intro}</p>
<p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#b45309;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600">${cta}</a></p>
<p style="margin:0;font-size:12px;color:#6b7280;word-break:break-all">If the button does not work, paste this link into your browser:<br>${url}</p>
</td></tr></table>
<p style="margin:16px 0 0;font-size:11px;color:#9ca3af">TuringCare · humane, reward-based dog training support</p>
</td></tr></table></body></html>`;
}

export function verificationEmail(url: string): EmailBody {
  return {
    subject: "Verify your TuringCare email",
    html: layout(
      "Confirm your email",
      "Welcome to TuringCare. Confirm this address to secure your account.",
      "Verify email",
      url,
    ),
    text: `Welcome to TuringCare.\n\nConfirm your email address:\n${url}\n\nIf you didn't create an account, you can ignore this message.`,
  };
}

export function passwordResetEmail(url: string): EmailBody {
  return {
    subject: "Reset your TuringCare password",
    html: layout(
      "Reset your password",
      "We received a request to reset your TuringCare password. This link expires soon.",
      "Reset password",
      url,
    ),
    text: `Reset your TuringCare password:\n${url}\n\nIf you didn't request this, you can safely ignore this message.`,
  };
}
