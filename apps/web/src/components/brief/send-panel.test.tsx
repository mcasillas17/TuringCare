import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BriefSendInput } from "@turingcare/shared";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SendPanel } from "./send-panel";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(
  briefStatus: "draft" | "finalized" | null,
  initialRecipient?: string,
  locale: "en" | "es" = "en",
  queryClient?: QueryClient,
) {
  localStorage.setItem("tc-locale", locale);
  const qc = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <SendPanel
          dogId="d1"
          briefId="brief-current"
          briefStatus={briefStatus}
          initialRecipient={initialRecipient}
        />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(handler));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function clickReadySend(name: RegExp = /^Send$/i) {
  const button = screen.getByRole("button", { name });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

describe("SendPanel", () => {
  it("renders nothing when briefStatus is null", () => {
    const { container } = setup(null);
    expect(container.firstChild).toBeNull();
  });

  it("renders the form with an enabled Send button regardless of brief status", async () => {
    // The finalize gate now lives in the share sheet (finalize-on-share), so
    // the panel always shows the Send button when mounted with a non-null status.
    stubFetch(async () => new Response(JSON.stringify({ sends: [] }), { status: 200 }));
    setup("draft");
    expect(await screen.findByLabelText(/Recipient email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Send$/i })).toBeInTheDocument();
  });

  it("renders Send button when briefStatus is finalized", async () => {
    stubFetch(async () => new Response(JSON.stringify({ sends: [] }), { status: 200 }));
    setup("finalized");
    expect(await screen.findByRole("button", { name: /^Send$/i })).toBeInTheDocument();
  });

  it("validates email format", async () => {
    stubFetch(async () => new Response(JSON.stringify({ sends: [] }), { status: 200 }));
    setup("finalized");
    fireEvent.change(screen.getByLabelText(/Recipient email/i), {
      target: { value: "not-an-email" },
    });
    await clickReadySend();
    await waitFor(() => expect(screen.getByText(/valid email/i)).toBeInTheDocument());
  });

  it("renders an allowlisted validation code in Spanish", async () => {
    stubFetch(async () => new Response(JSON.stringify({ sends: [] }), { status: 200 }));
    setup("finalized", undefined, "es");
    fireEvent.change(screen.getByLabelText(/Email del destinatario/i), {
      target: { value: "not-an-email" },
    });
    await clickReadySend(/^Enviar$/i);

    await waitFor(() =>
      expect(screen.getByText("Ingresa un correo electrónico válido")).toBeInTheDocument(),
    );
    expect(screen.queryByText("validation.emailInvalid")).not.toBeInTheDocument();
  });

  it.each([
    [
      "brief_version_conflict",
      "Hay más de una versión reciente del resumen. Genera una nueva versión.",
    ],
    [
      "idempotency_conflict",
      "Este intento de envío ya se usó con otros datos. Revisa e inténtalo de nuevo.",
    ],
    ["send_rate_limited", "Alcanzaste el límite diario de envíos. Inténtalo más tarde."],
  ])("renders the Spanish message for stable send code %s", async (code, message) => {
    const errorToast = vi.spyOn(toast, "error");
    stubFetch(async (_url, init) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ error: code }), {
            status: code === "send_rate_limited" ? 429 : 409,
          })
        : new Response(JSON.stringify({ sends: [] }), { status: 200 }),
    );
    setup("finalized", undefined, "es");
    fireEvent.change(await screen.findByLabelText(/Email del destinatario/i), {
      target: { value: "trainer@example.com" },
    });
    await clickReadySend(/^Enviar$/i);

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith(message));
  });

  it("submits a valid send and clears the form", async () => {
    const calls: Array<{ method?: string }> = [];
    stubFetch(async (url, init) => {
      calls.push({ method: init?.method });
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({
            send: {
              id: "s1",
              recipient: "sarah@example.com",
              message: null,
              sentAt: new Date().toISOString(),
            },
          }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({ sends: [] }), { status: 200 });
    });
    setup("finalized");
    const input = (await screen.findByLabelText(/Recipient email/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sarah@example.com" } });
    await clickReadySend();
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("reuses one idempotency key when an unchanged submission is retried after an ambiguous error", async () => {
    const posted: BriefSendInput[] = [];
    stubFetch(async (_url, init) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)) as BriefSendInput);
        if (posted.length === 1) {
          return new Response(JSON.stringify({ error: "send_failed" }), { status: 502 });
        }
        return new Response(JSON.stringify({ send: { id: posted[0]?.idempotencyKey } }), {
          status: 201,
        });
      }
      return new Response(JSON.stringify({ sends: [] }), { status: 200 });
    });
    setup("finalized");
    fireEvent.change(await screen.findByLabelText(/Recipient email/i), {
      target: { value: "retry@example.com" },
    });

    await clickReadySend();
    await waitFor(() => expect(posted).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Send$/i })).toBeEnabled());
    await clickReadySend();
    await waitFor(() => expect(posted).toHaveLength(2));

    expect(posted[0]?.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(posted[1]?.idempotencyKey).toBe(posted[0]?.idempotencyKey);
  });

  it("recovers and retries a durable pending send after the panel remounts", async () => {
    const posted: BriefSendInput[] = [];
    const pending = {
      id: "95acbb6a-9189-4614-9a6e-c732efcc5d1d",
      briefId: "brief-current",
      recipient: "recover@example.com",
      message: "Please review",
      sentAt: "2026-05-20T10:00:00Z",
      status: "pending",
    };
    stubFetch(async (_url, init) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)) as BriefSendInput);
        return new Response(JSON.stringify({ send: { ...pending, status: "delivered" } }), {
          status: 201,
        });
      }
      return new Response(JSON.stringify({ sends: [pending] }), { status: 200 });
    });

    const firstMount = setup("finalized");
    expect(await screen.findByText(/Delivery pending/i)).toBeInTheDocument();
    firstMount.unmount();

    setup("finalized");
    fireEvent.click(await screen.findByRole("button", { name: /^Retry$/i }));
    await waitFor(() => expect(posted).toHaveLength(1));

    expect(posted[0]).toEqual({
      briefId: pending.briefId,
      recipient: pending.recipient,
      message: pending.message,
      idempotencyKey: pending.id,
    });
  });

  it("blocks a new send until delayed history can recover its pending key", async () => {
    const history = deferred<Response>();
    const posted: BriefSendInput[] = [];
    const pending = {
      id: "85acbb6a-9189-4614-9a6e-c732efcc5d1d",
      briefId: "brief-current",
      recipient: "recover@example.com",
      message: null,
      sentAt: "2026-05-20T10:00:00Z",
      status: "pending",
    };
    stubFetch(async (_url, init) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)) as BriefSendInput);
        return new Response(JSON.stringify({ send: { ...pending, status: "delivered" } }), {
          status: 201,
        });
      }
      return history.promise;
    });
    setup("finalized", pending.recipient);

    const sendButton = screen.getByRole("button", { name: /^Send$/i });
    expect(sendButton).toBeDisabled();
    fireEvent.click(sendButton);
    expect(posted).toHaveLength(0);

    history.resolve(new Response(JSON.stringify({ sends: [pending] }), { status: 200 }));
    await waitFor(() => expect(sendButton).toBeEnabled());
    fireEvent.click(sendButton);
    await waitFor(() => expect(posted).toHaveLength(1));

    expect(posted[0]?.idempotencyKey).toBe(pending.id);
  });

  it("blocks while stale cached history refreshes and discovers a pending key", async () => {
    const history = deferred<Response>();
    const posted: BriefSendInput[] = [];
    const pending = {
      id: "75acbb6a-9189-4614-9a6e-c732efcc5d1d",
      briefId: "brief-current",
      recipient: "cached@example.com",
      message: null,
      sentAt: "2026-05-20T10:00:00Z",
      status: "pending",
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["brief-sends", "d1"], []);
    stubFetch(async (_url, init) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)) as BriefSendInput);
        return new Response(JSON.stringify({ send: { ...pending, status: "delivered" } }), {
          status: 201,
        });
      }
      return history.promise;
    });
    setup("finalized", pending.recipient, "en", queryClient);

    const sendButton = screen.getByRole("button", { name: /^Send$/i });
    await waitFor(() => expect(screen.getByText(/Checking send history/i)).toBeInTheDocument());
    expect(sendButton).toBeDisabled();

    history.resolve(new Response(JSON.stringify({ sends: [pending] }), { status: 200 }));
    await waitFor(() => expect(sendButton).toBeEnabled());
    fireEvent.click(sendButton);
    await waitFor(() => expect(posted).toHaveLength(1));

    expect(posted[0]?.idempotencyKey).toBe(pending.id);
  });

  it("does not recover a pending key from an earlier Brief version", async () => {
    const posted: BriefSendInput[] = [];
    const oldPending = {
      id: "65acbb6a-9189-4614-9a6e-c732efcc5d1d",
      briefId: "brief-old",
      recipient: "versioned@example.com",
      message: null,
      sentAt: "2026-05-20T10:00:00Z",
      status: "pending",
    };
    stubFetch(async (_url, init) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)) as BriefSendInput);
        return new Response(JSON.stringify({ send: { id: posted[0]?.idempotencyKey } }), {
          status: 201,
        });
      }
      return new Response(JSON.stringify({ sends: [oldPending] }), { status: 200 });
    });
    setup("finalized", oldPending.recipient);

    await clickReadySend();
    await waitFor(() => expect(posted).toHaveLength(1));

    expect(posted[0]?.briefId).toBe("brief-current");
    expect(posted[0]?.idempotencyKey).not.toBe(oldPending.id);
  });

  it("stays fail-closed after a history error and recovers the pending key on retry", async () => {
    const posted: BriefSendInput[] = [];
    const pending = {
      id: "55acbb6a-9189-4614-9a6e-c732efcc5d1d",
      briefId: "brief-current",
      recipient: "history-error@example.com",
      message: null,
      sentAt: "2026-05-20T10:00:00Z",
      status: "pending",
    };
    let historyReads = 0;
    stubFetch(async (_url, init) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)) as BriefSendInput);
        return new Response(JSON.stringify({ send: { ...pending, status: "delivered" } }), {
          status: 201,
        });
      }
      historyReads += 1;
      return historyReads === 1
        ? new Response(JSON.stringify({ error: "load_failed" }), { status: 500 })
        : new Response(JSON.stringify({ sends: [pending] }), { status: 200 });
    });
    setup("finalized", pending.recipient);

    expect(await screen.findByRole("alert")).toHaveTextContent(/Retry before sending/i);
    expect(screen.getByRole("button", { name: /^Send$/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^Retry$/i }));

    await clickReadySend();
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]?.idempotencyKey).toBe(pending.id);
  });

  it("creates a new idempotency key when the submission intent changes after an error", async () => {
    const posted: BriefSendInput[] = [];
    stubFetch(async (_url, init) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)) as BriefSendInput);
        return new Response(JSON.stringify({ error: "send_failed" }), { status: 502 });
      }
      return new Response(JSON.stringify({ sends: [] }), { status: 200 });
    });
    setup("finalized");
    const recipient = await screen.findByLabelText(/Recipient email/i);
    fireEvent.change(recipient, { target: { value: "first@example.com" } });
    await clickReadySend();
    await waitFor(() => expect(posted).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Send$/i })).toBeEnabled());

    fireEvent.change(recipient, { target: { value: "second@example.com" } });
    await clickReadySend();
    await waitFor(() => expect(posted).toHaveLength(2));

    expect(posted[1]?.idempotencyKey).not.toBe(posted[0]?.idempotencyKey);
  });

  it("creates a new idempotency key after a definitive idempotency conflict", async () => {
    const posted: BriefSendInput[] = [];
    stubFetch(async (_url, init) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)) as BriefSendInput);
        return new Response(JSON.stringify({ error: "idempotency_conflict" }), { status: 409 });
      }
      return new Response(JSON.stringify({ sends: [] }), { status: 200 });
    });
    setup("finalized");
    fireEvent.change(await screen.findByLabelText(/Recipient email/i), {
      target: { value: "retry@example.com" },
    });

    await clickReadySend();
    await waitFor(() => expect(posted).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Send$/i })).toBeEnabled());
    await clickReadySend();
    await waitFor(() => expect(posted).toHaveLength(2));

    expect(posted[1]?.idempotencyKey).not.toBe(posted[0]?.idempotencyKey);
  });

  it("renders history list when sends exist", async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({
            sends: [
              {
                id: "s1",
                recipient: "sarah@example.com",
                message: null,
                sentAt: "2026-05-20T10:00:00Z",
              },
              {
                id: "s2",
                recipient: "mark@trainer.dog",
                message: null,
                sentAt: "2026-05-15T10:00:00Z",
              },
            ],
          }),
          { status: 200 },
        ),
    );
    setup("finalized");
    expect(await screen.findByText(/sarah@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/mark@trainer.dog/)).toBeInTheDocument();
  });

  it("renders empty state when no sends", async () => {
    stubFetch(async () => new Response(JSON.stringify({ sends: [] }), { status: 200 }));
    setup("finalized");
    expect(await screen.findByText(/No sends yet/i)).toBeInTheDocument();
  });

  it("pre-fills recipient from initialRecipient prop", async () => {
    stubFetch(async () => new Response(JSON.stringify({ sends: [] }), { status: 200 }));
    setup("finalized", "sarah@example.com");
    const input = (await screen.findByLabelText(/Recipient email/i)) as HTMLInputElement;
    expect(input.value).toBe("sarah@example.com");
  });
});
