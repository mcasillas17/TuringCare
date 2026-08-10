import { beforeEach, describe, expect, it } from "vitest";
import { resetTestOutbox, captureTestEmail } from "../email/test-outbox";
import { createTestEmailApp } from "./test-email";

describe("createTestEmailApp", () => {
  beforeEach(() => {
    resetTestOutbox();
  });

  describe("disabled mode", () => {
    const app = createTestEmailApp({ enabled: false });

    it("returns 404 for GET /emails/latest", async () => {
      const res = await app.request("/emails/latest?to=owner@example.com");
      expect(res.status).toBe(404);
    });
  });

  describe("enabled mode", () => {
    const app = createTestEmailApp({ enabled: true });

    it("returns 400 when `to` query param is missing", async () => {
      const res = await app.request("/emails/latest");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({ error: "recipient_required" });
    });

    it("returns 400 when `to` is empty string", async () => {
      const res = await app.request("/emails/latest?to=");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({ error: "recipient_required" });
    });

    it("returns 404 when no email has been captured for the recipient", async () => {
      const res = await app.request("/emails/latest?to=nobody@example.com");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: "not_found" });
    });

    it("returns 200 with the captured email when found", async () => {
      captureTestEmail({
        to: "owner@example.com",
        subject: "Verify your email",
        html: "<p>Click the link</p>",
        text: "Click the link",
      });

      const res = await app.request("/emails/latest?to=owner@example.com");
      expect(res.status).toBe(200);
      const body = await res.json() as { email: { to: string; subject: string; html: string; capturedAt: string } };
      expect(body).toHaveProperty("email");
      expect(body.email.to).toBe("owner@example.com");
      expect(body.email.subject).toBe("Verify your email");
      expect(body.email.html).toBe("<p>Click the link</p>");
      expect(body.email.capturedAt).toBeDefined();
    });

    it("matches recipient case-insensitively and trims whitespace", async () => {
      captureTestEmail({
        to: "Owner@Example.com",
        subject: "Welcome",
        html: "<p>Hi</p>",
        text: "Hi",
      });

      const res = await app.request("/emails/latest?to=  owner@example.com  ");
      expect(res.status).toBe(200);
      const body = await res.json() as { email: { to: string } };
      expect(body.email.to).toBe("Owner@Example.com");
    });
  });
});
