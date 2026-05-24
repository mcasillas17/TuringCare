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

it("shows only the current language (flag + code) and labels the switch action", () => {
  const { container } = setup();
  // jsdom navigator.language is en-US, so the default locale is English.
  const chip = screen.getByRole("button", { name: /switch to español/i });
  expect(chip).toHaveTextContent("EN");
  expect(container.textContent).toContain("🇺🇸");
  expect(container.textContent).not.toContain("🇲🇽");
});

it("switches locale on click and updates flag, code, and label", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: /switch to español/i }));
  const chip = screen.getByRole("button", { name: /cambiar a english/i });
  expect(chip).toHaveTextContent("ES");
  expect(chip.textContent).toContain("🇲🇽");
});

it("passes className through to the button", () => {
  render(
    <LocaleProvider>
      <LanguageToggle className="absolute right-4 top-4" />
    </LocaleProvider>,
  );
  const chip = screen.getByRole("button", { name: /switch to/i });
  expect(chip).toHaveClass("absolute", "right-4", "top-4");
});
