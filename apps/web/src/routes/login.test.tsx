import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
  signIn: { email: vi.fn() },
}));

const { Login } = await import("./login");

it("renders a Forgot password? link pointing at /forgot-password", () => {
  render(
    <LocaleProvider>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </LocaleProvider>,
  );
  expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
});
