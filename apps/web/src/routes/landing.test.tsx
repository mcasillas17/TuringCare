import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it } from "vitest";
import { Landing } from "./landing";

afterEach(() => {
  localStorage.clear();
});

function setup() {
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

it("renders the key landing sections", () => {
  setup();
  expect(
    screen.getByRole("heading", { name: /train with positive reinforcement/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /three steps/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /the behavior brief/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /questions, answered/i })).toBeInTheDocument();
  expect(
    screen.getAllByRole("link", { name: /get started|create your free account/i }).length,
  ).toBeGreaterThan(0);
  expect(screen.queryByRole("heading", { name: /start understanding your dog today/i })).toBeNull();
  expect(screen.getAllByRole("img", { name: /turing/i }).length).toBeGreaterThan(0);
});

it("switches the landing copy to Spanish via the toggle", async () => {
  setup();
  expect(
    screen.getByRole("heading", { name: /train with positive reinforcement/i }),
  ).toBeInTheDocument();
  const chip = screen.getAllByRole("button", { name: /switch to español/i })[0];
  if (!chip) throw new Error("language chip not found");
  await userEvent.click(chip);
  expect(
    screen.getByRole("heading", { name: /ad[ií]éstralo con refuerzo positivo/i }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /train with positive reinforcement/i })).toBeNull();
});

it("expands an FAQ item on click", async () => {
  setup();
  const trigger = screen.getByRole("button", {
    name: /is it really positive reinforcement/i,
  });
  await userEvent.click(trigger);
  expect(screen.getByText(/reward-based, science-supported/i)).toBeVisible();
});
