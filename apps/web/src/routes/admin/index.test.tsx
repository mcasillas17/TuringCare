import { LocaleProvider } from "@/i18n";
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
  topPages: [{ path: "/my", count: 5 }],
  eventsByDay: [{ day: "2026-05-01", name: "page.viewed", count: 12 }],
};

function renderDashboard(client?: QueryClient, locale: "en" | "es" = "en") {
  localStorage.setItem("tc-locale", locale);
  const qc = client ?? new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

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

it("renders dashboard and panel system copy in Spanish", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(metrics), { status: 200 })),
      ),
  );
  renderDashboard(undefined, "es");

  expect(
    await screen.findByRole("heading", { name: "Panel de administración" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Rango de fechas")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Últimos 30 d" })).toBeInTheDocument();
  expect(await screen.findByText("Usuarios totales")).toBeInTheDocument();
  expect(screen.getByText("Usuarios activos")).toBeInTheDocument();
  expect(screen.getByText("Altas en el tiempo")).toBeInTheDocument();
  expect(screen.getByText("Embudo de activación")).toBeInTheDocument();
  expect(screen.getByText("Uso de funciones")).toBeInTheDocument();
  expect(screen.getByText("Sin eventos en el periodo.")).toBeInTheDocument();
  expect(screen.getByText("Páginas principales")).toBeInTheDocument();
  expect(screen.getByText("Eventos en el tiempo")).toBeInTheDocument();
});
