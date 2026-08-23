import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { EventsOverTime } from "./events-over-time";

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
    const tooltipName = name ?? dataKey;

    return (
      <div data-testid={`series-${dataKey}`} data-series-name={tooltipName}>
        tooltip series: {tooltipName}
      </div>
    );
  }

  return {
    Area: Series,
    AreaChart: ChartContainer,
    Bar: Series,
    BarChart: ChartContainer,
    CartesianGrid: SilentPart,
    Legend: SilentPart,
    ResponsiveContainer: ChartContainer,
    Tooltip: SilentPart,
    XAxis: SilentPart,
    YAxis: SilentPart,
  };
});

const eventsByDay = [
  { day: "2026-05-04", name: "page.viewed", count: 10 },
  { day: "2026-05-05", name: "dog.created", count: 2 },
];

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

it("renders the heading and the three controls", () => {
  render(<EventsOverTime eventsByDay={eventsByDay} />);
  expect(screen.getByText(/events over time/i)).toBeInTheDocument();
  // breakdown + granularity segmented controls
  expect(screen.getByRole("button", { name: "Total" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "By type" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Day" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "false");
  // a category filter chip
  expect(screen.getByRole("button", { name: "Page views" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("toggles breakdown to By type", async () => {
  const user = userEvent.setup();
  render(<EventsOverTime eventsByDay={eventsByDay} />);
  await user.click(screen.getByRole("button", { name: "By type" }));
  expect(screen.getByRole("button", { name: "By type" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Total" })).toHaveAttribute("aria-pressed", "false");
});

it("toggles a category chip off", async () => {
  const user = userEvent.setup();
  render(<EventsOverTime eventsByDay={eventsByDay} />);
  const chip = screen.getByRole("button", { name: "Page views" });
  await user.click(chip);
  expect(chip).toHaveAttribute("aria-pressed", "false");
});

it("renders controls and category labels in Spanish", () => {
  localStorage.setItem("tc-locale", "es");
  render(
    <LocaleProvider>
      <EventsOverTime eventsByDay={eventsByDay} />
    </LocaleProvider>,
  );

  expect(screen.getByText("Eventos en el tiempo")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Por tipo" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Día" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Vistas de página" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("localizes Spanish series names used by tooltips while keeping data keys stable", async () => {
  const user = userEvent.setup();
  localStorage.setItem("tc-locale", "es");
  render(
    <LocaleProvider>
      <EventsOverTime eventsByDay={eventsByDay} />
    </LocaleProvider>,
  );

  expect(screen.getByTestId("series-total")).toHaveAttribute("data-series-name", "Eventos totales");
  expect(screen.queryByText("tooltip series: total")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Por tipo" }));

  expect(screen.getByTestId("series-pageViews")).toHaveAttribute(
    "data-series-name",
    "Vistas de página",
  );
});
