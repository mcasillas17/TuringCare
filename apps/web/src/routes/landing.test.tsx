import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { Landing } from "./landing";

function setup() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

it("renders the key landing sections", () => {
  setup();
  expect(screen.getByRole("heading", { name: /train without force/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /three steps/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /the behavior brief/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /questions, answered/i })).toBeInTheDocument();
  expect(
    screen.getAllByRole("link", { name: /get started|create your free account/i }).length,
  ).toBeGreaterThan(0);
});

it("expands an FAQ item on click", async () => {
  setup();
  const trigger = screen.getByRole("button", {
    name: /is it really force-free/i,
  });
  await userEvent.click(trigger);
  expect(screen.getByText(/reward-based, science-supported/i)).toBeVisible();
});
