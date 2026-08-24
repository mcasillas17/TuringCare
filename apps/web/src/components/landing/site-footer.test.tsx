import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it } from "vitest";
import { SiteFooter } from "./site-footer";

afterEach(() => {
  localStorage.clear();
});

function setup(locale: "en" | "es" = "en") {
  localStorage.setItem("tc-locale", locale);
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

it("renders Privacy and Terms links pointing to /privacy and /terms", () => {
  setup();
  const privacy = screen.getByRole("link", { name: /privacy/i });
  const terms = screen.getByRole("link", { name: /terms/i });
  expect(privacy).toHaveAttribute("href", "/privacy");
  expect(terms).toHaveAttribute("href", "/terms");
});

it("renders a Send feedback mailto link with the TuringCare subject", () => {
  setup();
  const feedback = screen.getByRole("link", { name: /send feedback/i });
  expect(feedback).toHaveAttribute(
    "href",
    "mailto:feedback@turingcare.dog?subject=TuringCare%20feedback",
  );
});

it("localizes footer navigation and image alt labels", () => {
  setup("es");
  expect(screen.getByRole("navigation", { name: "Navegación del pie" })).toBeInTheDocument();
  expect(
    screen.getByRole("img", { name: "Turing, un Mini American Shepherd azul mirlo" }),
  ).toBeInTheDocument();
});
