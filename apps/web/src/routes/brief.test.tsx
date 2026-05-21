import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Brief } from "./brief";

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = url.includes("/brief")
        ? {
            brief: {
              id: "b1",
              dogId: "d1",
              generatedAt: "2026-05-19T10:00:00.000Z",
              status: "draft",
              summary: "Behavior Brief — Biscuit\nConcerns: ...",
              version: 1,
            },
          }
        : { dogs: [{ id: "d1", name: "Biscuit" }] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Brief", () => {
  it("renders the summary, version line, and a regenerate action for an existing brief", async () => {
    stubFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LocaleProvider>
          <MemoryRouter initialEntries={["/app/dogs/d1/brief"]}>
            <Routes>
              <Route path="/app/dogs/:id/brief" element={<Brief />} />
            </Routes>
          </MemoryRouter>
        </LocaleProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText(/Behavior Brief — Biscuit/)).toBeInTheDocument());
    expect(screen.getByText(/Version 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regenerate/i })).toBeInTheDocument();
  });
});
