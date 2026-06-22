import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DogForm } from "./dog-form";
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
        <MemoryRouter initialEntries={["/my/dogs"]}>
          <Routes>
            <Route path="/my/dogs" element={<DogsList />} />
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
    mockFetchOnce({
      dogs: [
        {
          id: "d1",
          name: "Biscuit",
          breed: "Aussie",
          summary: {
            journalCount: 0,
            lastActivityAt: null,
            goalCount: 0,
            skillCount: 0,
            avgLevel: null,
            briefStatus: null,
            briefVersion: null,
          },
        },
      ],
    });
    renderList();
    await waitFor(() => expect(screen.getByText("Biscuit")).toBeInTheDocument());
  });
});

describe("DogForm edit mode", () => {
  it("prefills the form with the existing dog", async () => {
    mockFetchOnce({
      dog: {
        id: "d1",
        name: "Biscuit",
        breed: "Aussie",
        size: "medium",
        sex: "female",
        source: "rescue",
        vaccineStage: "complete",
        spayedNeutered: true,
        notes: "Good boy",
      },
      concerns: [],
      goals: [],
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LocaleProvider>
          <MemoryRouter initialEntries={["/my/dogs/d1/edit"]}>
            <Routes>
              <Route path="/my/dogs/:id/edit" element={<DogForm mode="edit" />} />
            </Routes>
          </MemoryRouter>
        </LocaleProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByDisplayValue("Biscuit")).toBeInTheDocument());
  });
});
