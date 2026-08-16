import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { AdminDashboard } from "./index";

const metrics = {
  rangeDays: 30,
  kpis: {
    totalUsers: 7,
    newUsers: 2,
    dau: 1,
    wau: 3,
    mau: 5,
    activationRate: 0.43,
    returningRate: 0.6,
    churnedUsers: 1,
  },
  signups: [{ day: "2026-05-01", count: 2 }],
  active: [{ day: "2026-05-01", count: 1 }],
  funnel: [{ step: "signup", users: 7 }],
  journeyTimes: [
    {
      step: "signup_to_dog",
      completed: 3,
      medianMinutes: 12,
      p90Minutes: 45,
      within7DaysPct: 100,
    },
  ],
  featureAdoption: [{ feature: "training", users: 3, events: 12 }],
  topPages: [{ path: "/my", views: 5, users: 3 }],
  activityByDay: [{ day: "2026-05-01", category: "training", count: 12 }],
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
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(metrics), { status: 200 })),
      ),
  );
  renderDashboard();
  await waitFor(() =>
    expect(screen.getByText("Total owners").nextElementSibling).toHaveTextContent("7"),
  );
  expect(screen.getByText(/new owners over time/i)).toBeInTheDocument();
  expect(screen.getByText(/owner activation funnel/i)).toBeInTheDocument();
  expect(screen.getByText(/happy-path completion time/i)).toBeInTheDocument();
});

it("shows loading state while metrics fetch is pending", async () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  renderDashboard();
  expect(await screen.findByText(/loading insights/i)).toBeInTheDocument();
});

it("shows error state when metrics fetch fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("err", { status: 500 })));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderDashboard(qc);
  await waitFor(() => expect(screen.getByText(/failed to load insights/i)).toBeInTheDocument());
});
