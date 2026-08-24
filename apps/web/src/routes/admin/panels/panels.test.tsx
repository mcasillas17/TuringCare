import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { Metrics } from "../use-metrics";
import { ActiveUsage } from "./active-usage";
import { FeatureUsage } from "./feature-usage";
import { Funnel } from "./funnel";
import { Growth } from "./growth";
import { KpiStrip } from "./kpi-strip";
import { TopPages } from "./top-pages";

vi.mock("recharts", () => {
  function ChartContainer({ children }: { children?: ReactNode }) {
    return <div data-testid="chart-container">{children}</div>;
  }

  function SilentPart() {
    return null;
  }

  function Series({
    dataKey,
    name,
  }: {
    dataKey: string;
    name?: string;
  }) {
    return <div data-testid={`series-${dataKey}`} data-series-name={name ?? dataKey} />;
  }

  function DateAxis({
    dataKey,
    tickFormatter,
  }: {
    dataKey: string;
    tickFormatter?: (value: string) => string;
  }) {
    const dateBucket = "2026-05-19";
    return (
      <div data-testid={`axis-${dataKey}`}>
        {tickFormatter ? tickFormatter(dateBucket) : dateBucket}
      </div>
    );
  }

  function DateTooltip({ labelFormatter }: { labelFormatter?: (value: string) => ReactNode }) {
    const dateBucket = "2026-05-19";
    return (
      <div data-testid="tooltip-date-label">
        {labelFormatter ? labelFormatter(dateBucket) : dateBucket}
      </div>
    );
  }

  return {
    Bar: Series,
    BarChart: ChartContainer,
    CartesianGrid: SilentPart,
    Legend: SilentPart,
    Line: Series,
    LineChart: ChartContainer,
    ResponsiveContainer: ChartContainer,
    Tooltip: DateTooltip,
    XAxis: DateAxis,
    YAxis: SilentPart,
  };
});

const metrics: Metrics = {
  rangeDays: 30,
  kpis: {
    totalUsers: 128,
    newUsers: 14,
    dau: 9,
    wau: 41,
    mau: 60,
    stickiness: 0.15,
    eventCount: 2100,
  },
  signups: [{ day: "2026-05-01", count: 3 }],
  active: [{ day: "2026-05-01", count: 5 }],
  eventVolume: [{ name: "page.viewed", count: 1900 }],
  funnel: [
    { step: "signup", users: 128 },
    { step: "first_dog", users: 64 },
    { step: "first_journal", users: 24 },
    { step: "first_brief", users: 8 },
  ],
  topPages: [{ path: "/my", count: 90 }],
  eventsByDay: [{ day: "2026-05-01", name: "page.viewed", count: 90 }],
};

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function renderSpanish(ui: ReactNode) {
  localStorage.setItem("tc-locale", "es");
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

it("KpiStrip shows the headline numbers", () => {
  render(<KpiStrip kpis={metrics.kpis} />);
  expect(screen.getByText("128")).toBeInTheDocument();
  expect(screen.getByText(/total users/i)).toBeInTheDocument();
  expect(screen.getByText("15%")).toBeInTheDocument();
});

it("KpiStrip localizes weekly active and stickiness labels in Spanish", () => {
  renderSpanish(<KpiStrip kpis={metrics.kpis} />);

  expect(screen.getByText("Usuarios activos semanales")).toBeInTheDocument();
  expect(screen.getByText("Relación diaria/mensual")).toBeInTheDocument();
  expect(screen.queryByText("WAU")).not.toBeInTheDocument();
  expect(screen.queryByText("DAU/MAU")).not.toBeInTheDocument();
});

it("Funnel renders with empty data without throwing", () => {
  expect(() => render(<Funnel funnel={[]} />)).not.toThrow();
});

it("Funnel localizes known activation steps in Spanish without exposing raw step keys", () => {
  renderSpanish(<Funnel funnel={metrics.funnel} />);

  expect(screen.getByText("Registro")).toBeInTheDocument();
  expect(screen.getByText("Primer perro")).toBeInTheDocument();
  expect(screen.getByText("Primer diario")).toBeInTheDocument();
  expect(screen.getByText("Primer resumen")).toBeInTheDocument();
  expect(screen.queryByText("signup")).not.toBeInTheDocument();
  expect(screen.queryByText("first_dog")).not.toBeInTheDocument();
  expect(screen.queryByText("first_journal")).not.toBeInTheDocument();
  expect(screen.queryByText("first_brief")).not.toBeInTheDocument();
});

it("Growth gives the count series a localized Spanish chart name", () => {
  renderSpanish(<Growth signups={metrics.signups} />);

  expect(screen.getByTestId("series-count")).toHaveAttribute("data-series-name", "Altas");
  expect(screen.getByTestId("axis-day")).toHaveTextContent("19 may");
  expect(screen.getByTestId("tooltip-date-label")).toHaveTextContent("19 may");
  expect(screen.queryByText("2026-05-19")).not.toBeInTheDocument();
});

it("ActiveUsage gives the count series a localized Spanish chart name and summary labels", () => {
  renderSpanish(<ActiveUsage active={metrics.active} kpis={metrics.kpis} />);

  expect(screen.getByTestId("series-count")).toHaveAttribute(
    "data-series-name",
    "Usuarios activos",
  );
  expect(screen.getByText(/Usuarios activos diarios 9/)).toBeInTheDocument();
  expect(screen.getByText(/Usuarios activos semanales 41/)).toBeInTheDocument();
  expect(screen.getByText(/Usuarios activos mensuales 60/)).toBeInTheDocument();
  expect(screen.getByTestId("axis-day")).toHaveTextContent("19 may");
  expect(screen.getByTestId("tooltip-date-label")).toHaveTextContent("19 may");
  expect(screen.queryByText("2026-05-19")).not.toBeInTheDocument();
});

it("FeatureUsage lists events and excludes page.viewed", () => {
  render(
    <FeatureUsage
      eventVolume={[
        { name: "page.viewed", count: 1900 },
        { name: "dog.created", count: 12 },
      ]}
    />,
  );
  expect(screen.getByText("dog.created")).toBeInTheDocument();
  expect(screen.queryByText("page.viewed")).toBeNull();
});

it("TopPages lists paths and counts", () => {
  render(<TopPages topPages={[{ path: "/my", count: 90 }]} />);
  expect(screen.getByText("/my")).toBeInTheDocument();
  expect(screen.getByText("90")).toBeInTheDocument();
});
