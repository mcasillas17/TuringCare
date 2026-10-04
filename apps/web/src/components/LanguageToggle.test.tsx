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

it("is one button named for the language it switches to", () => {
  setup();
  expect(screen.getByRole("button", { name: "Switch to Español" })).toBeInTheDocument();
  expect(screen.getAllByRole("button")).toHaveLength(1);
});

it("switches locale by keyboard and keeps focus on the toggle", async () => {
  setup();
  screen.getByRole("button", { name: "Switch to Español" }).focus();
  await userEvent.keyboard("{Enter}");
  const back = screen.getByRole("button", { name: "Cambiar a English" });
  expect(back).toHaveFocus();
  expect(localStorage.getItem("tc-locale")).toBe("es");
  await userEvent.click(back);
  expect(screen.getByRole("button", { name: "Switch to Español" })).toBeInTheDocument();
});

it("passes className through to the button", () => {
  setup("absolute right-4 top-4");
  expect(screen.getByRole("button", { name: "Switch to Español" })).toHaveClass(
    "absolute",
    "right-4",
    "top-4",
  );
});
