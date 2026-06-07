import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { Privacy } from "./privacy";

it("renders the privacy title heading", () => {
  render(
    <LocaleProvider>
      <MemoryRouter>
        <Privacy />
      </MemoryRouter>
    </LocaleProvider>,
  );
  expect(screen.getByRole("heading", { level: 1, name: /privacy notice/i })).toBeInTheDocument();
});
