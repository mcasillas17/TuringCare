import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DogForm } from "./dog-form";

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
