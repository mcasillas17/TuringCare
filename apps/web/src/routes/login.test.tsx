import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { signInEmailMock, toastErrorMock } = vi.hoisted(() => ({
  signInEmailMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  signIn: { email: (...a: unknown[]) => signInEmailMock(...a) },
}));
vi.mock("sonner", () => ({ toast: { error: toastErrorMock } }));

const { Login } = await import("./login");

let assignMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  signInEmailMock.mockReset();
  toastErrorMock.mockReset();
  assignMock = vi.fn();
  vi.stubGlobal("location", {
    assign: assignMock,
    origin: "http://localhost",
    href: "http://localhost/login",
  });
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

it("renders a Forgot password? link pointing at /forgot-password", () => {
  setup();
  expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
});

it("on successful login, does a full-load navigation to /my", async () => {
  signInEmailMock.mockResolvedValue({ data: { user: {} }, error: null });
  setup();
  await userEvent.type(screen.getByLabelText(/email/i), "u@example.com");
  await userEvent.type(screen.getByLabelText(/password/i), "password-123");
  await userEvent.click(screen.getByRole("button", { name: /^log in$/i }));
  expect(signInEmailMock).toHaveBeenCalledOnce();
  expect(assignMock).toHaveBeenCalledWith("/my");
});

it("on login error, does not navigate", async () => {
  signInEmailMock.mockResolvedValue({
    data: null,
    error: { message: "sensitive upstream login detail" },
  });
  setup();
  await userEvent.type(screen.getByLabelText(/email/i), "u@example.com");
  await userEvent.type(screen.getByLabelText(/password/i), "wrong");
  await userEvent.click(screen.getByRole("button", { name: /^log in$/i }));
  expect(signInEmailMock).toHaveBeenCalledOnce();
  expect(assignMock).not.toHaveBeenCalled();
  expect(toastErrorMock).toHaveBeenCalledWith("Login failed");
  expect(toastErrorMock).not.toHaveBeenCalledWith(expect.stringContaining("sensitive"));
});
