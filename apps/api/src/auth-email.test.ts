import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.fn();
vi.mock("./email/send-email", () => ({
  EmailSendError: class EmailSendError extends Error {},
  sendEmail: (...a: unknown[]) => sendEmailMock(...a),
}));

// Imported AFTER the mock is registered.
const { app } = await import("./app");
const { db } = await import("./db");
const { user } = await import("./db/schema");

const email = `mail_${Date.now()}@example.com`;

afterEach(() => sendEmailMock.mockReset());
afterAll(async () => {
  await db.delete(user).where(eq(user.email, email));
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
    expect(sendEmailMock).toHaveBeenCalled();
    const firstArg = sendEmailMock.mock.calls[0]?.[0] as { to: string; subject: string };
    expect(firstArg.to).toBe(email);
    expect(firstArg.subject.length).toBeGreaterThan(0);
  });

  it("a failing sendEmail does NOT break sign-up", async () => {
    const email2 = `mail2_${Date.now()}@example.com`;
    sendEmailMock.mockRejectedValue(new Error("provider down"));
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Mail2", email: email2, password: "password-123" }),
    });
    expect(res.status).toBeLessThan(400);
    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email2));
    expect(u).toBeTruthy();
    await db.delete(user).where(eq(user.email, email2));
  });
});
