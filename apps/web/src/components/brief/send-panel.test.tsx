import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SendPanel } from "./send-panel";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

function setup(
  briefStatus: "draft" | "finalized" | null,
  initialRecipient?: string,
  locale: "en" | "es" = "en",
) {
  localStorage.setItem("tc-locale", locale);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <SendPanel dogId="d1" briefStatus={briefStatus} initialRecipient={initialRecipient} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(handler));
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
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));
    await waitFor(() => expect(screen.getByText(/valid email/i)).toBeInTheDocument());
  });

  it("renders an allowlisted validation code in Spanish", async () => {
    stubFetch(async () => new Response(JSON.stringify({ sends: [] }), { status: 200 }));
    setup("finalized", undefined, "es");
    fireEvent.change(screen.getByLabelText(/Email del destinatario/i), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Enviar$/i }));

    await waitFor(() =>
      expect(screen.getByText("Ingresa un correo electrónico válido")).toBeInTheDocument(),
    );
    expect(screen.queryByText("validation.emailInvalid")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    await waitFor(() => expect(input.value).toBe(""));
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
