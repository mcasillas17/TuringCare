import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DogDetail } from "./dog-detail";
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

describe("DogDetail", () => {
  it("renders profile + concerns + goals", async () => {
    mockFetchOnce({
      dog: { id: "d1", name: "Biscuit", breed: "Aussie", size: "medium", sex: "female" },
      concerns: [{ id: "c1", concern: "Leash reactivity", severity: "moderate" }],
      goals: [{ id: "g1", goal: "Calm greetings" }],
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LocaleProvider>
          <MemoryRouter initialEntries={["/app/dogs/d1"]}>
            <Routes>
              <Route path="/app/dogs/:id" element={<DogDetail />} />
            </Routes>
          </MemoryRouter>
        </LocaleProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Biscuit")).toBeInTheDocument());
    expect(screen.getByText(/Leash reactivity/)).toBeInTheDocument();
    expect(screen.getByText("Calm greetings")).toBeInTheDocument();
  });
});
