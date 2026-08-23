import { describe, expect, it } from "vitest";
import { passwordResetEmail, verificationEmail } from "./templates";

const VERIFY_URL = "https://api.turingcare.dog/api/auth/verify?token=abc123";

function assertShape(out: { subject: string; html: string; text: string }) {
  expect(out.subject.trim().length).toBeGreaterThan(0);
  expect(out.html.trim().length).toBeGreaterThan(0);
  expect(out.text.trim().length).toBeGreaterThan(0);
  expect(out.html.split(VERIFY_URL).length - 1).toBe(2);
  expect(out.text.split(VERIFY_URL).length - 1).toBe(1);
  expect(out.html).not.toMatch(/\$\{|\{\{|TODO/);
  expect(out.text).not.toMatch(/\$\{|\{\{|TODO/);
}

describe("email templates", () => {
  it("verificationEmail has subject/html/text and embeds the url once", () => {
    assertShape(verificationEmail(VERIFY_URL));
  });
  it("passwordResetEmail has subject/html/text and embeds the url once", () => {
    assertShape(passwordResetEmail(VERIFY_URL));
  });
  it("the two templates have distinct subjects", () => {
    expect(verificationEmail(VERIFY_URL).subject).not.toBe(passwordResetEmail(VERIFY_URL).subject);
  });

  it("renders the verification email in Spanish", () => {
    const out = verificationEmail(VERIFY_URL, "es");

    expect(out.subject).toBe("Verifica tu correo de TuringCare");
    expect(out.html).toContain("Confirma tu correo");
    expect(out.html).toContain("Verificar correo");
    expect(out.text).toContain("Confirma tu dirección de correo:");
    expect(out.html).not.toContain("Confirm your email");
  });

  it("renders the password reset email in Spanish", () => {
    const out = passwordResetEmail(VERIFY_URL, "es");

    expect(out.subject).toBe("Restablece tu contraseña de TuringCare");
    expect(out.html).toContain("Restablece tu contraseña");
    expect(out.html).toContain("Restablecer contraseña");
    expect(out.text).toContain("Restablece tu contraseña de TuringCare:");
    expect(out.html).not.toContain("Reset your password");
  });

  it("escapes localized template URLs in HTML attributes and body text", () => {
    const out = verificationEmail('https://example.com/verify?next="><script>x</script>', "es");

    expect(out.html).not.toContain('"><script>x</script>');
    expect(out.html).toContain("&quot;&gt;&lt;script&gt;x&lt;/script&gt;");
    expect(out.text).toContain('https://example.com/verify?next="><script>x</script>');
  });
});
