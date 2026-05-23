import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Trainers } from "./trainers";

function mockFetchOnce(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/my/trainers"]}>
          <Routes>
            <Route path="/my/trainers" element={<Trainers />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("Trainers", () => {
  it("lists trainers from the API", async () => {
    mockFetchOnce({ trainers: [{ id: "t1", name: "Pat R+", city: "Austin", state: "TX" }] });
    renderList();
    await waitFor(() => expect(screen.getByText("Pat R+")).toBeInTheDocument());
  });

  it("shows the empty state when no trainers match", async () => {
    mockFetchOnce({ trainers: [] });
    renderList();
    await waitFor(() => expect(screen.getByText(/no trainers match/i)).toBeInTheDocument());
  });
});
