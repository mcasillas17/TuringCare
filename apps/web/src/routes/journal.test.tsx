import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Journal } from "./journal";

afterEach(() => vi.unstubAllGlobals());

function stub(dogs: unknown, entries: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const p = new URL(url, "http://x").pathname;
      const body = p.includes("/journal") ? { entries } : p.includes("/api/dogs") ? { dogs } : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter>
          <Journal />
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("Journal", () => {
  it("renders existing entries and the add-entry form", async () => {
    stub(
      [{ id: "d1", name: "Biscuit" }],
      [
        {
          id: "e1",
          occurredAt: "2026-05-19T10:00:00.000Z",
          antecedent: "Doorbell rang",
          behavior: "Lunged at door",
          consequence: "Treat redirect",
          intensity: 4,
          location: "Front door",
          notes: null,
        },
      ],
    );
    setup();
    await waitFor(() => expect(screen.getByText(/Lunged at door/)).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Add entry" })).toBeInTheDocument();
  });
});
