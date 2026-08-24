import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { signUpEmailMock, toastErrorMock } = vi.hoisted(() => ({
  signUpEmailMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  signUp: { email: (...a: unknown[]) => signUpEmailMock(...a) },
}));
vi.mock("sonner", () => ({ toast: { error: toastErrorMock, success: vi.fn() } }));

const { Register } = await import("./register");

let assignMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  signUpEmailMock.mockReset();
  toastErrorMock.mockReset();
  assignMock = vi.fn();
  vi.stubGlobal("location", {
    assign: assignMock,
    origin: "http://localhost",
    href: "http://localhost/register",
  });
});
afterEach(() => vi.unstubAllGlobals());

it("on successful registration, does a full-load navigation to /my", async () => {
  signUpEmailMock.mockResolvedValue({ data: { user: {} }, error: null });
  render(
    <LocaleProvider>
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    </LocaleProvider>,
  );
  await userEvent.type(screen.getByLabelText(/name/i), "Mae");
  await userEvent.type(screen.getByLabelText(/email/i), "u@example.com");
  await userEvent.type(screen.getByLabelText(/password/i), "password-123");
  await userEvent.click(screen.getByRole("button", { name: /create account/i }));
  expect(signUpEmailMock).toHaveBeenCalledOnce();
  expect(assignMock).toHaveBeenCalledWith("/my");
});

it("shows Terms and Privacy links in the agreement copy", () => {
  render(
    <LocaleProvider>
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    </LocaleProvider>,
  );
  expect(screen.getByRole("link", { name: /terms/i })).toHaveAttribute("href", "/terms");
  expect(screen.getByRole("link", { name: /privacy/i })).toHaveAttribute("href", "/privacy");
});

it("uses the localized fallback instead of presenting an upstream registration message", async () => {
  signUpEmailMock.mockResolvedValue({
    data: null,
    error: { message: "sensitive upstream registration detail" },
  });
  render(
    <LocaleProvider>
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    </LocaleProvider>,
  );
  await userEvent.type(screen.getByLabelText(/name/i), "Mae");
  await userEvent.type(screen.getByLabelText(/email/i), "u@example.com");
  await userEvent.type(screen.getByLabelText(/password/i), "password-123");
  await userEvent.click(screen.getByRole("button", { name: /create account/i }));

  expect(assignMock).not.toHaveBeenCalled();
  expect(toastErrorMock).toHaveBeenCalledWith("Registration failed");
  expect(toastErrorMock).not.toHaveBeenCalledWith(expect.stringContaining("sensitive"));
});
