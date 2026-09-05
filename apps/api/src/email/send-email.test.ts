import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailSendError, type ResendLike, sendEmail as deliverEmail } from "./send-email";

// These unit tests exercise the provider seam, not the integration outbox.
// Explicit injection takes precedence over global test capture configuration.
const sendEmail: typeof deliverEmail = (args, deps) =>
  deliverEmail(args, { capture: undefined, ...deps });

const ARGS = { to: "u@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" };

afterEach(() => vi.restoreAllMocks());

describe("sendEmail", () => {
  it("logs and does NOT call a client when no api key", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const client: ResendLike = { emails: { send: vi.fn() } };
    await sendEmail(ARGS, { client, apiKey: undefined, from: "F <f@x.com>" });
    expect(client.emails.send).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("[email:dev] delivery skipped: provider not configured");
    expect(info.mock.calls.flat().join(" ")).not.toContain(ARGS.to);
    expect(info.mock.calls.flat().join(" ")).not.toContain(ARGS.subject);
  });

  it("sends via the client when an api key is present", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null });
    await sendEmail(ARGS, { client: { emails: { send } }, apiKey: "re_x", from: "F <f@x.com>" });
    expect(send).toHaveBeenCalledWith(
      {
        from: "F <f@x.com>",
        to: ARGS.to,
        subject: ARGS.subject,
        html: ARGS.html,
        text: ARGS.text,
      },
      { signal: expect.any(AbortSignal) },
    );
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

  it("aborts a provider request at the configured delivery deadline", async () => {
    const send = vi.fn(
      (_args: unknown, options?: { signal?: AbortSignal }) =>
        new Promise<{ data: unknown; error: unknown }>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
            once: true,
          });
        }),
    );

    await expect(
      sendEmail(ARGS, {
        client: { emails: { send } },
        apiKey: "re_x",
        from: "F <f@x.com>",
        timeoutMs: 5,
      }),
    ).rejects.toBeInstanceOf(EmailSendError);
    expect(send.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("throws EmailSendError on empty to/subject and never calls the client", async () => {
    const send = vi.fn();
    await expect(
      sendEmail({ ...ARGS, to: "" }, { client: { emails: { send } }, apiKey: "re_x", from: "f" }),
    ).rejects.toBeInstanceOf(EmailSendError);
    expect(send).not.toHaveBeenCalled();
  });

  it("throws EmailSendError when both html and text are empty (client not called)", async () => {
    const send = vi.fn();
    await expect(
      sendEmail(
        { to: "u@example.com", subject: "Hi", html: "", text: "" },
        { client: { emails: { send } }, apiKey: "re_x", from: "f" },
      ),
    ).rejects.toBeInstanceOf(EmailSendError);
    expect(send).not.toHaveBeenCalled();
  });

  it("falls back to env EMAIL_FROM when deps.from is omitted (logs in dev mode)", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendEmail(
      { to: "u@example.com", subject: "Hi", html: "<p>x</p>", text: "x" },
      { apiKey: undefined },
    );
    expect(info).toHaveBeenCalledWith("[email:dev] delivery skipped: provider not configured");
    expect(info.mock.calls.flat().join(" ")).not.toContain("u@example.com");
  });
});

describe("sendEmail replyTo", () => {
  it("passes replyTo as reply_to to the Resend client", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const stubClient: ResendLike = {
      emails: {
        send: async (args) => {
          calls.push(args as Record<string, unknown>);
          return { data: {}, error: null };
        },
      },
    };
    await sendEmail(
      {
        to: "x@y.co",
        subject: "s",
        html: "<p>h</p>",
        text: "t",
        replyTo: "owner@example.com",
      },
      { client: stubClient, apiKey: "k", from: "noreply@x.co" },
    );
    expect(calls).toHaveLength(1);
    const [first] = calls;
    if (!first) throw new Error("expected one call");
    expect(first.reply_to).toBe("owner@example.com");
  });

  it("omits reply_to when replyTo is not supplied", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const stubClient: ResendLike = {
      emails: {
        send: async (args) => {
          calls.push(args as Record<string, unknown>);
          return { data: {}, error: null };
        },
      },
    };
    await sendEmail(
      { to: "x@y.co", subject: "s", html: "<p>h</p>", text: "t" },
      { client: stubClient, apiKey: "k", from: "noreply@x.co" },
    );
    const [first] = calls;
    if (!first) throw new Error("expected one call");
    expect(first.reply_to).toBeUndefined();
  });
});

describe("sendEmail capture injection", () => {
  it("calls injected capture with exact args and never calls client.emails.send", async () => {
    const captured: unknown[] = [];
    const capture = vi.fn((args: unknown) => captured.push(args));
    const send = vi.fn();
    const client: ResendLike = { emails: { send } };

    await sendEmail(ARGS, { client, apiKey: "re_x", from: "F <f@x.com>", capture });

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith(ARGS);
    expect(send).not.toHaveBeenCalled();
  });
});
