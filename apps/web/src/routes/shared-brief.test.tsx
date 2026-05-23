import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}
beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

const { SharedBrief } = await import("./shared-brief");

function setup() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/b/tok123"]}>
          <Routes>
            <Route path="/b/:token" element={<SharedBrief />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

it("renders the shared brief from the public endpoint", async () => {
  mockFetch(200, {
    brief: {
      dogName: "Rex",
      summary: "Behavior Brief — Rex\n...",
      status: "finalized",
      version: 2,
      generatedAt: "2026-05-22T00:00:00Z",
    },
  });
  setup();
  await waitFor(() => expect(screen.getByText(/Behavior Brief — Rex/)).toBeInTheDocument());
});

it("prefers the narrative over the structured summary when present", async () => {
  mockFetch(200, {
    brief: {
      dogName: "Rex",
      summary: "Structured text",
      narrative: "Warm prose for the trainer.",
      status: "finalized",
      version: 2,
      generatedAt: "2026-05-22T00:00:00Z",
    },
  });
  setup();
  await waitFor(() => expect(screen.getByText("Warm prose for the trainer.")).toBeInTheDocument());
  expect(screen.queryByText("Structured text")).not.toBeInTheDocument();
});

it("shows a not-available view on 404", async () => {
  mockFetch(404, { error: "not_found" });
  setup();
  await waitFor(() =>
    expect(screen.getByText(/isn't available|no está disponible/i)).toBeInTheDocument(),
  );
});
