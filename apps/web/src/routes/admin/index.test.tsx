import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminDashboard } from "./index";

const metrics = {
  rangeDays: 30,
  kpis: { totalUsers: 7, newUsers: 2, dau: 1, wau: 3, mau: 5, stickiness: 0.2, eventCount: 12 },
  signups: [{ day: "2026-05-01", count: 2 }],
  active: [{ day: "2026-05-01", count: 1 }],
  eventVolume: [{ name: "page.viewed", count: 12 }],
  funnel: [{ step: "signup", users: 7 }],
};

beforeEach(() => {
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
});
afterEach(() => vi.unstubAllGlobals());

it("renders the dashboard with KPI numbers", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByText("Total users").nextElementSibling).toHaveTextContent("7"),
  );
  expect(screen.getByText(/signups over time/i)).toBeInTheDocument();
  expect(screen.getByText(/activation funnel/i)).toBeInTheDocument();
});
