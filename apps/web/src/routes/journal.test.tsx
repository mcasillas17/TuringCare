import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Journal } from "./journal";

const dog = { id: "d1", name: "Biscuit" };

const momentEntry = {
  id: "e1",
  dogId: "d1",
  kind: "moment",
  occurredAt: "2026-05-19T10:00:00.000Z",
  note: "Barked at delivery truck",
  trend: null,
  antecedent: null,
  behavior: null,
  consequence: null,
  intensity: null,
  location: null,
  notes: null,
  durationSeconds: null,
  recoverySeconds: null,
  peoplePresent: null,
  ownerResponse: null,
  dog,
};

afterEach(() => vi.unstubAllGlobals());

function renderJournal(initialEntry = "/my/journal") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/my/journal" element={<Journal />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

function pathOf(input: RequestInfo | URL) {
  const raw = typeof input === "string" ? input : input.toString();
  return new URL(raw, "http://x").pathname;
}

describe("Journal", () => {
  it("renders note-first entries and opens the moment composer from the tile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = pathOf(input);
        const body = path === "/api/journal" ? { entries: [momentEntry] } : { dogs: [dog] };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const user = userEvent.setup();
    renderJournal();

    expect(await screen.findByText("Barked at delivery truck")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /log moment/i }));
    expect(screen.getByRole("dialog", { name: /log moment/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Quick note")).toBeInTheDocument();
  });

  it("saves a note-only moment from the moment sheet", async () => {
    const calls: Array<{ path: string; method?: string; body?: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = pathOf(input);
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ path, method: init?.method, body });
        if (init?.method === "POST" && path.includes("/journal")) {
          return new Response(JSON.stringify({ entry: momentEntry }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        const responseBody = path === "/api/journal" ? { entries: [] } : { dogs: [dog] };
        return new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const user = userEvent.setup();
    renderJournal();

    await user.click(await screen.findByRole("button", { name: /log moment/i }));
    await user.type(screen.getByLabelText("Quick note"), "Barked at delivery truck");
    await user.click(screen.getByRole("button", { name: "Save moment" }));

    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.method === "POST" &&
            expect
              .objectContaining({ kind: "moment", note: "Barked at delivery truck" })
              .asymmetricMatch(call.body),
        ),
      ).toBe(true),
    );
  });

  it("saves a daily check-in", async () => {
    const calls: Array<{ path: string; method?: string; body?: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = pathOf(input);
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ path, method: init?.method, body });
        if (init?.method === "POST" && path.includes("/journal")) {
          return new Response(
            JSON.stringify({ entry: { ...momentEntry, kind: "daily_checkin", trend: "better" } }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        const responseBody = path === "/api/journal" ? { entries: [] } : { dogs: [dog] };
        return new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const user = userEvent.setup();
    renderJournal();

    await user.click(await screen.findByRole("button", { name: /daily check-in/i }));
    expect(screen.getByRole("group", { name: "Trend" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Better" }));
    await user.type(screen.getByPlaceholderText(/a line about today/i), "Settled faster today");
    await user.click(screen.getByRole("button", { name: "Save check-in" }));

    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.method === "POST" &&
            expect
              .objectContaining({
                kind: "daily_checkin",
                trend: "better",
                note: "Settled faster today",
              })
              .asymmetricMatch(call.body),
        ),
      ).toBe(true),
    );
  });

  it("shows a no-dog state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const body = pathOf(input) === "/api/dogs" ? { dogs: [] } : { entries: [] };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    renderJournal();

    expect(await screen.findByText(/Add a dog first/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a dog" })).toHaveAttribute("href", "/my/dogs/new");
  });
});
