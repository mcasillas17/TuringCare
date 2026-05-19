import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailSendError, type ResendLike, sendEmail } from "./send-email";

const ARGS = { to: "u@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" };

afterEach(() => vi.restoreAllMocks());

describe("sendEmail", () => {
  it("logs and does NOT call a client when no api key", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const client: ResendLike = { emails: { send: vi.fn() } };
    await sendEmail(ARGS, { client, apiKey: undefined, from: "F <f@x.com>" });
    expect(client.emails.send).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("[email:dev]", { to: ARGS.to, subject: ARGS.subject });
  });

  it("sends via the client when an api key is present", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null });
    await sendEmail(ARGS, { client: { emails: { send } }, apiKey: "re_x", from: "F <f@x.com>" });
    expect(send).toHaveBeenCalledWith({
      from: "F <f@x.com>",
      to: ARGS.to,
      subject: ARGS.subject,
      html: ARGS.html,
      text: ARGS.text,
    });
  });

  it("throws EmailSendError when the provider returns an error", async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "bad", statusCode: 422 } });
    await expect(
      sendEmail(ARGS, { client: { emails: { send } }, apiKey: "re_x", from: "F <f@x.com>" }),
    ).rejects.toBeInstanceOf(EmailSendError);
  });

  it("throws EmailSendError when the client rejects", async () => {
    const send = vi.fn().mockRejectedValue(new Error("network"));
    await expect(
      sendEmail(ARGS, { client: { emails: { send } }, apiKey: "re_x", from: "F <f@x.com>" }),
    ).rejects.toBeInstanceOf(EmailSendError);
  });

  it("throws EmailSendError on empty to/subject and never calls the client", async () => {
    const send = vi.fn();
    await expect(
      sendEmail({ ...ARGS, to: "" }, { client: { emails: { send } }, apiKey: "re_x", from: "f" }),
    ).rejects.toBeInstanceOf(EmailSendError);
    expect(send).not.toHaveBeenCalled();
  });
});
