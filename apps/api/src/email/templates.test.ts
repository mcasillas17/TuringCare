import { describe, expect, it } from "vitest";
import { passwordResetEmail, verificationEmail } from "./templates";

const URL = "https://api.turingcare.dog/api/auth/verify?token=abc123";

function assertShape(out: { subject: string; html: string; text: string }) {
  expect(out.subject.trim().length).toBeGreaterThan(0);
  expect(out.html.trim().length).toBeGreaterThan(0);
  expect(out.text.trim().length).toBeGreaterThan(0);
  expect(out.html.split(URL).length - 1).toBe(1);
  expect(out.text.split(URL).length - 1).toBe(1);
  expect(out.html).not.toMatch(/\$\{|\{\{|TODO/);
  expect(out.text).not.toMatch(/\$\{|\{\{|TODO/);
}

describe("email templates", () => {
  it("verificationEmail has subject/html/text and embeds the url once", () => {
    assertShape(verificationEmail(URL));
  });
  it("passwordResetEmail has subject/html/text and embeds the url once", () => {
    assertShape(passwordResetEmail(URL));
  });
  it("the two templates have distinct subjects", () => {
    expect(verificationEmail(URL).subject).not.toBe(passwordResetEmail(URL).subject);
  });
});
