import { eq, like } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.fn();
vi.mock("./email/send-email", () => ({
  EmailSendError: class EmailSendError extends Error {},
  sendEmail: (...a: unknown[]) => sendEmailMock(...a),
}));

// Imported AFTER the mock is registered.
const { app } = await import("./app");
const { db } = await import("./db");
const { user, rateLimit } = await import("./db/schema");

const email = `mail_${Date.now()}@example.com`;
const email2 = `mail2_${Date.now()}@example.com`;
const resetEmail = `reset_${Date.now()}@example.com`;
const spanishEmail = `mail_es_${Date.now()}@example.com`;
const spanishFallbackEmail = `mail_es_fallback_${Date.now()}@example.com`;
const spanishResetEmail = `reset_es_${Date.now()}@example.com`;

beforeAll(async () => {
  // Better Auth uses 127.0.0.1 as the client IP in test/dev environments.
  // Clear any stale rate-limit entries so repeated test runs don't hit the cap.
  await db.delete(rateLimit).where(like(rateLimit.key, "127.0.0.1%"));
});

afterEach(async () => {
  sendEmailMock.mockReset();
  await db.delete(rateLimit);
});
afterAll(async () => {
  await db.delete(user).where(eq(user.email, email));
  await db.delete(user).where(eq(user.email, email2));
  await db.delete(user).where(eq(user.email, resetEmail));
  await db.delete(user).where(eq(user.email, spanishEmail));
  await db.delete(user).where(eq(user.email, spanishFallbackEmail));
  await db.delete(user).where(eq(user.email, spanishResetEmail));
});

describe("auth email wiring", () => {
  it("sends a verification email to the new user on sign-up", async () => {
    sendEmailMock.mockResolvedValue(undefined);
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Mail", email, password: "password-123" }),
    });
    expect(res.status).toBeLessThan(400);
    expect(sendEmailMock).toHaveBeenCalledOnce();
    const firstArg = sendEmailMock.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      html: string;
    };
    expect(firstArg.to).toBe(email);
    expect(firstArg.subject.length).toBeGreaterThan(0);
    expect(firstArg.html).toContain('<html lang="en">');
  });

  it("localizes verification email from the validated Better Auth request locale", async () => {
    sendEmailMock.mockResolvedValue(undefined);
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TuringCare-Locale": "es",
        "Accept-Language": "en-US,en;q=0.8",
      },
      body: JSON.stringify({ name: "Mail ES", email: spanishEmail, password: "password-123" }),
    });

    expect(res.status).toBeLessThan(400);
    const firstArg = sendEmailMock.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      html: string;
    };
    expect(firstArg.to).toBe(spanishEmail);
    expect(firstArg.subject).toBe("Verifica tu correo de TuringCare");
    expect(firstArg.html).toContain('<html lang="es">');
  });

  it("does not trust an invalid raw locale header in Better Auth callbacks", async () => {
    sendEmailMock.mockResolvedValue(undefined);
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TuringCare-Locale": "fr",
        "Accept-Language": "es-MX,es;q=0.8",
      },
      body: JSON.stringify({
        name: "Mail ES Fallback",
        email: spanishFallbackEmail,
        password: "password-123",
      }),
    });

    expect(res.status).toBeLessThan(400);
    const firstArg = sendEmailMock.mock.calls[0]?.[0] as { to: string; subject: string };
    expect(firstArg.to).toBe(spanishFallbackEmail);
    expect(firstArg.subject).toBe("Verifica tu correo de TuringCare");
  });

  it("a failing sendEmail does NOT break sign-up", async () => {
    sendEmailMock.mockRejectedValue(new Error("provider down"));
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Mail2", email: email2, password: "password-123" }),
    });
    expect(res.status).toBeLessThan(400);
    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email2));
    expect(u).toBeTruthy();
  });

  it("sends a password-reset email when /request-password-reset is requested", async () => {
    sendEmailMock.mockResolvedValue(undefined);
    // create the account first (sign-up also sends verification → reset that call)
    await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Reset", email: resetEmail, password: "password-123" }),
    });
    sendEmailMock.mockClear();

    const res = await app.request("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: resetEmail, redirectTo: "https://turingcare.dog/reset" }),
    });
    expect(res.status).toBeLessThan(400);
    expect(sendEmailMock).toHaveBeenCalledOnce();
    const arg = sendEmailMock.mock.calls[0]?.[0] as { to: string; subject: string; html: string };
    expect(arg.to).toBe(resetEmail);
    expect(arg.subject.toLowerCase()).toContain("reset");
    expect(arg.html).toContain('<html lang="en">');
  });

  it("localizes password-reset email from the validated Better Auth request locale", async () => {
    sendEmailMock.mockResolvedValue(undefined);
    await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Reset ES",
        email: spanishResetEmail,
        password: "password-123",
      }),
    });
    sendEmailMock.mockClear();

    const res = await app.request("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": "es-MX,es;q=0.8" },
      body: JSON.stringify({
        email: spanishResetEmail,
        redirectTo: "https://turingcare.dog/reset",
      }),
    });

    expect(res.status).toBeLessThan(400);
    const arg = sendEmailMock.mock.calls[0]?.[0] as { to: string; subject: string; html: string };
    expect(arg.to).toBe(spanishResetEmail);
    expect(arg.subject).toBe("Restablece tu contraseña de TuringCare");
    expect(arg.html).toContain('<html lang="es">');
  });

  it("a failing sendResetPassword does NOT break /request-password-reset", async () => {
    sendEmailMock.mockResolvedValue(undefined);
    await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Reset2", email: resetEmail, password: "password-123" }),
    }); // user already exists from prior test in this file run; ignore result
    sendEmailMock.mockReset();
    sendEmailMock.mockRejectedValue(new Error("provider down"));
    const res = await app.request("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: resetEmail, redirectTo: "https://turingcare.dog/reset" }),
    });
    expect(res.status).toBeLessThan(400);
  });
});
