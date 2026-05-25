import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { LanguageToggle } from "./LanguageToggle";

afterEach(() => localStorage.clear());

function setup(className?: string) {
  return render(
    <LocaleProvider>
      <LanguageToggle className={className} />
    </LocaleProvider>,
  );
}

// jsdom navigator.language is en-US, so the default locale is English.

it("shows a flag-only trigger labelled 'Language' and hides the other language until opened", () => {
  const { container } = setup();
  expect(screen.getByRole("button", { name: "Language" })).toBeInTheDocument();
  expect(container.textContent).toContain("🇺🇸");
  expect(screen.queryByRole("button", { name: /español/i })).not.toBeInTheDocument();
});

it("opens via keyboard and switches locale when the other language is picked", async () => {
  setup();
  screen.getByRole("button", { name: "Language" }).focus();
  await userEvent.keyboard("{Enter}");
  await userEvent.click(await screen.findByRole("button", { name: /español/i }));
  // After switching, the trigger's accessible name localizes to "Idioma".
  expect(screen.getByRole("button", { name: "Idioma" }).textContent).toContain("🇲🇽");
  expect(screen.queryByRole("button", { name: /español/i })).not.toBeInTheDocument();
});

it("closes on Escape", async () => {
  setup();
  screen.getByRole("button", { name: "Language" }).focus();
  await userEvent.keyboard("{Enter}");
  expect(await screen.findByRole("button", { name: /español/i })).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("button", { name: /español/i })).not.toBeInTheDocument();
});

it("opens on desktop mouse hover", async () => {
  setup();
  await userEvent.hover(screen.getByRole("button", { name: "Language" }));
  expect(await screen.findByRole("button", { name: /español/i })).toBeInTheDocument();
});

it("passes className through to the trigger button", () => {
  setup("absolute right-4 top-4");
  expect(screen.getByRole("button", { name: "Language" })).toHaveClass(
    "absolute",
    "right-4",
    "top-4",
  );
});
