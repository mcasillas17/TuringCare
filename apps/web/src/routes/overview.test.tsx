import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Overview } from "./overview";

afterEach(() => vi.unstubAllGlobals());

function stub(over: unknown, dogs: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const p = new URL(url, "http://x").pathname;
      const body = p.includes("/api/overview") ? over : p.includes("/api/dogs") ? { dogs } : {};
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
          <Overview />
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("Overview", () => {
  it("renders stats, dogs, and recent activity", async () => {
    stub(
      {
        dogCount: 1,
        journalEntryCount: 2,
        latestBrief: null,
        recentActivity: [
          {
            dogName: "Biscuit",
            behavior: "Barked at delivery truck",
            occurredAt: "2026-05-19T10:00:00.000Z",
          },
        ],
      },
      [{ id: "d1", name: "Biscuit" }],
    );
    setup();
    await waitFor(() => expect(screen.getAllByText("Biscuit").length).toBeGreaterThanOrEqual(1));
    const dogsHeading = screen.getByRole("heading", { name: "Your dogs" });
    const dogsSection = dogsHeading.closest("section");
    expect(dogsSection).not.toBeNull();
    if (dogsSection) {
      expect(within(dogsSection).getByText("Biscuit")).toBeInTheDocument();
    }
    expect(screen.getByText(/Barked at delivery truck/)).toBeInTheDocument();
  });
});
