import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DogsList } from "./dogs-list";

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
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route path="/app" element={<DogsList />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("DogsList", () => {
  it("shows the empty state when there are no dogs", async () => {
    mockFetchOnce({ dogs: [] });
    renderList();
    await waitFor(() => expect(screen.getByText(/no dogs yet/i)).toBeInTheDocument());
  });

  it("lists the user's dogs", async () => {
    mockFetchOnce({ dogs: [{ id: "d1", name: "Biscuit", breed: "Aussie" }] });
    renderList();
    await waitFor(() => expect(screen.getByText("Biscuit")).toBeInTheDocument());
  });
});
