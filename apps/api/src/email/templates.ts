import type { Locale } from "@turingcare/i18n";

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

const templateCatalog = {
  en: {
    fallbackLink: "If the button does not work, paste this link into your browser:",
    footer: "TuringCare · humane, reward-based dog training support",
    verification: {
      subject: "Verify your TuringCare email",
      heading: "Confirm your email",
      intro: "Welcome to TuringCare. Confirm this address to secure your account.",
      cta: "Verify email",
      text: (url: string) =>
        `Welcome to TuringCare.\n\nConfirm your email address:\n${url}\n\nIf you didn't create an account, you can ignore this message.`,
    },
    reset: {
      subject: "Reset your TuringCare password",
      heading: "Reset your password",
      intro: "We received a request to reset your TuringCare password. This link expires soon.",
      cta: "Reset password",
      text: (url: string) =>
        `Reset your TuringCare password:\n${url}\n\nIf you didn't request this, you can safely ignore this message.`,
    },
  },
  es: {
    fallbackLink: "Si el botón no funciona, pega este enlace en tu navegador:",
    footer: "TuringCare · apoyo humano y basado en recompensas para el adiestramiento canino",
    verification: {
      subject: "Verifica tu correo de TuringCare",
      heading: "Confirma tu correo",
      intro: "Bienvenido/a a TuringCare. Confirma esta dirección para proteger tu cuenta.",
      cta: "Verificar correo",
      text: (url: string) =>
        `Bienvenido/a a TuringCare.\n\nConfirma tu dirección de correo:\n${url}\n\nSi no creaste una cuenta, puedes ignorar este mensaje.`,
    },
    reset: {
      subject: "Restablece tu contraseña de TuringCare",
      heading: "Restablece tu contraseña",
      intro:
        "Recibimos una solicitud para restablecer tu contraseña de TuringCare. Este enlace vence pronto.",
      cta: "Restablecer contraseña",
      text: (url: string) =>
        `Restablece tu contraseña de TuringCare:\n${url}\n\nSi no solicitaste esto, puedes ignorar este mensaje.`,
    },
  },
} as const;

function layout(heading: string, intro: string, cta: string, url: string, locale: Locale): string {
  const safeUrl = escapeHtml(url);
  const t = templateCatalog[locale];
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f6f5f3;font-family:ui-sans-serif,system-ui,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">${heading}</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6">${intro}</p>
<p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:#b45309;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600">${cta}</a></p>
<p style="margin:0;font-size:12px;color:#6b7280;word-break:break-all">${t.fallbackLink}<br>${safeUrl}</p>
</td></tr></table>
<p style="margin:16px 0 0;font-size:11px;color:#9ca3af">${t.footer}</p>
</td></tr></table></body></html>`;
}

export function verificationEmail(url: string, locale: Locale = "en"): EmailBody {
  const t = templateCatalog[locale].verification;
  return {
    subject: t.subject,
    html: layout(t.heading, t.intro, t.cta, url, locale),
    text: t.text(url),
  };
}

export function passwordResetEmail(url: string, locale: Locale = "en"): EmailBody {
  const t = templateCatalog[locale].reset;
  return {
    subject: t.subject,
    html: layout(t.heading, t.intro, t.cta, url, locale),
    text: t.text(url),
  };
}
