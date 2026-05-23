import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { LanguageToggle } from "./LanguageToggle";

afterEach(() => localStorage.clear());

function setup() {
  return render(
    <LocaleProvider>
      <LanguageToggle />
    </LocaleProvider>,
  );
}

it("exposes EN and ES buttons by accessible name (flag is decorative)", () => {
  setup();
  expect(screen.getByRole("button", { name: "EN" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "ES" })).toBeInTheDocument();
});

it("renders the country flag glyphs in the DOM", () => {
  const { container } = setup();
  expect(container.textContent).toContain("🇺🇸");
  expect(container.textContent).toContain("🇲🇽");
});

it("reflects the active locale via aria-pressed and switches on click", async () => {
  setup();
  const en = screen.getByRole("button", { name: "EN" });
  const es = screen.getByRole("button", { name: "ES" });
  expect(en).toHaveAttribute("aria-pressed", "true");
  expect(es).toHaveAttribute("aria-pressed", "false");

  await userEvent.click(es);
  expect(screen.getByRole("button", { name: "ES" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "false");
});
