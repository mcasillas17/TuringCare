import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { EventsOverTime } from "./events-over-time";

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
