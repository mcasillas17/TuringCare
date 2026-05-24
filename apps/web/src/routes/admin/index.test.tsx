import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { AdminDashboard } from "./index";

const metrics = {
  rangeDays: 30,
  kpis: { totalUsers: 7, newUsers: 2, dau: 1, wau: 3, mau: 5, stickiness: 0.2, eventCount: 12 },
  signups: [{ day: "2026-05-01", count: 2 }],
  active: [{ day: "2026-05-01", count: 1 }],
  eventVolume: [{ name: "page.viewed", count: 12 }],
  funnel: [{ step: "signup", users: 7 }],
};

function renderDashboard(client?: QueryClient) {
  const qc = client ?? new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

it("renders the dashboard with KPI numbers", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(String(url).includes("/activity") ? { items: [] } : metrics),
            { status: 200 },
          ),
        ),
      ),
  );
  renderDashboard();
  await waitFor(() =>
    expect(screen.getByText("Total users").nextElementSibling).toHaveTextContent("7"),
  );
  expect(screen.getByText(/signups over time/i)).toBeInTheDocument();
  expect(screen.getByText(/activation funnel/i)).toBeInTheDocument();
});

it("shows loading state while metrics fetch is pending", async () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  renderDashboard();
  expect(await screen.findByText(/loading metrics/i)).toBeInTheDocument();
});

it("shows error state when metrics fetch fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("err", { status: 500 })));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderDashboard(qc);
  await waitFor(() => expect(screen.getByText(/failed to load metrics/i)).toBeInTheDocument());
});

it("renders the language chip in the header", () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  renderDashboard();
  expect(screen.getByRole("button", { name: /switch to/i })).toBeInTheDocument();
});
