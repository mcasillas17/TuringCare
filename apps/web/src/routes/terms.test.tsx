import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { Terms } from "./terms";

it("renders the terms title heading", () => {
  render(
    <LocaleProvider>
      <MemoryRouter>
        <Terms />
      </MemoryRouter>
    </LocaleProvider>,
  );
  expect(screen.getByRole("heading", { level: 1, name: /terms of use/i })).toBeInTheDocument();
});
