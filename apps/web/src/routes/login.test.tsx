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

it("carries only a validated locale to the safe app path when browser storage is denied", async () => {
  vi.stubGlobal("navigator", { language: "es", languages: ["es"] });
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("storage denied");
    },
    setItem: () => {
      throw new Error("storage denied");
    },
  });
  signInEmailMock.mockResolvedValue({ data: { user: {} }, error: null });
  setup("/login?next=%2Fmy%2Fprofile");
  await userEvent.type(screen.getByLabelText("Correo electrónico"), "synthetic@example.test");
  await userEvent.type(screen.getByLabelText("Contraseña"), "synthetic-password");
  await userEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  expect(assignMock).toHaveBeenCalledWith("/my/profile?lang=es");
  expect(signInEmailMock).toHaveBeenCalledWith({
    email: "synthetic@example.test",
    password: "synthetic-password",
  });
});

function setup(entry = "/login") {
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={[entry]}>
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

it.each(["EMAIL_NOT_VERIFIED", "email_unverified"])(
  "recovers %s without exposing credentials in navigation",
  async (code) => {
    signInEmailMock.mockResolvedValue({ data: null, error: { code } });
    setup("/login?next=%2Fmy%2Fdogs");
    await userEvent.type(screen.getByLabelText(/email/i), "synthetic@example.test");
    await userEvent.type(screen.getByLabelText(/password/i), "synthetic-password");
    await userEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    expect(assignMock).toHaveBeenCalledWith("/verify-email?next=%2Fmy%2Fdogs&lang=en");
    expect(localStorage.getItem("email")).toBeNull();
    expect(sessionStorage.length).toBe(0);
  },
);

it.each([
  ["/admin/trainers", "/admin/trainers"],
  ["/trainers/t1", "/trainers/t1"],
  ["https://attacker.test", "/my"],
  ["/b/private-bearer", "/my"],
  ["/my?email=private", "/my"],
  ["/verify-email", "/my"],
])("full-loads only the canonical safe return for %s", async (next, expected) => {
  signInEmailMock.mockResolvedValue({ data: {}, error: null });
  setup(`/login?next=${encodeURIComponent(next)}`);
  await userEvent.type(screen.getByLabelText(/email/i), "synthetic@example.test");
  await userEvent.type(screen.getByLabelText(/password/i), "synthetic-password");
  await userEvent.click(screen.getByRole("button", { name: /^log in$/i }));
  expect(assignMock).toHaveBeenCalledWith(expected);
});

it("on successful login, does a full-load navigation to /my", async () => {
  signInEmailMock.mockResolvedValue({ data: { user: {} }, error: null });
  setup();
  await userEvent.type(screen.getByLabelText(/email/i), "u@example.com");
  await userEvent.type(screen.getByLabelText(/password/i), "password-123");
  await userEvent.click(screen.getByRole("button", { name: /^log in$/i }));
  expect(signInEmailMock).toHaveBeenCalledOnce();
  expect(signInEmailMock).toHaveBeenCalledWith({
    email: "u@example.com",
    password: "password-123",
  });
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
