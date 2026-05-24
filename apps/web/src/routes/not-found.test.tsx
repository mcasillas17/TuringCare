import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { NotFound } from "./not-found";

function setup() {
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

it("renders the 404 title heading", () => {
  setup();
  expect(screen.getByRole("heading", { name: /page not found/i })).toBeInTheDocument();
});

it("renders a link back to /", () => {
  setup();
  const link = screen.getByRole("link", { name: /home|back/i });
  expect(link).toHaveAttribute("href", "/");
});
