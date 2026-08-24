import { type Locale, type MessageKey, createI18n, translate } from "@turingcare/i18n";

export interface EmailBody {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type EmailTranslator = (key: MessageKey, vars?: Record<string, string | number>) => string;

function createEmailTranslator(locale: Locale): EmailTranslator {
  const i18n = createI18n(locale);
  return (key, vars) => translate(i18n, key, vars);
}

function layout(
  heading: string,
  intro: string,
  cta: string,
  url: string,
  locale: Locale,
  t: EmailTranslator,
): string {
  const safeUrl = escapeHtml(url);
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"></head><body style="margin:0;background:#f6f5f3;font-family:ui-sans-serif,system-ui,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">${heading}</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6">${intro}</p>
<p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:#b45309;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600">${cta}</a></p>
<p style="margin:0;font-size:12px;color:#6b7280;word-break:break-all">${t("authEmail.fallbackLink")}<br>${safeUrl}</p>
</td></tr></table>
<p style="margin:16px 0 0;font-size:11px;color:#9ca3af">${t("authEmail.footer")}</p>
</td></tr></table></body></html>`;
}

export function verificationEmail(url: string, locale: Locale = "en"): EmailBody {
  const t = createEmailTranslator(locale);
  return {
    subject: t("authEmail.verification.subject"),
    html: layout(
      t("authEmail.verification.heading"),
      t("authEmail.verification.intro"),
      t("authEmail.verification.cta"),
      url,
      locale,
      t,
    ),
    text: t("authEmail.verification.text", { url }),
  };
}

export function passwordResetEmail(url: string, locale: Locale = "en"): EmailBody {
  const t = createEmailTranslator(locale);
  return {
    subject: t("authEmail.reset.subject"),
    html: layout(
      t("authEmail.reset.heading"),
      t("authEmail.reset.intro"),
      t("authEmail.reset.cta"),
      url,
      locale,
      t,
    ),
    text: t("authEmail.reset.text", { url }),
  };
}
