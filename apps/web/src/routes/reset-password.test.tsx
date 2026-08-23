import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const resetPasswordMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  resetPassword: (...a: unknown[]) => resetPasswordMock(...a),
}));
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
}));

const { ResetPassword } = await import("./reset-password");

beforeEach(() => {
  resetPasswordMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

function setup(initialPath: string) {
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/login" element={<div>login-page</div>} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  );
}

it("with no token: shows invalid-link state + link to /forgot-password; no API call", () => {
  setup("/reset-password");
  expect(screen.getByText(/this reset link is missing or invalid/i)).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /forgot password\?|reset your password/i }),
  ).toHaveAttribute("href", "/forgot-password");
  expect(screen.queryByLabelText(/new password/i)).toBeNull();
  expect(resetPasswordMock).not.toHaveBeenCalled();
});

it("with token: form renders", () => {
  setup("/reset-password?token=abc");
  expect(screen.getByRole("heading", { name: /set a new password/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
});

it("short password: inline error, no API call", async () => {
  setup("/reset-password?token=abc");
  await userEvent.type(screen.getByLabelText(/new password/i), "short");
  await userEvent.type(screen.getByLabelText(/confirm password/i), "short");
  await userEvent.click(screen.getByRole("button", { name: /update password/i }));
  expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
  expect(resetPasswordMock).not.toHaveBeenCalled();
});

it("mismatched confirm: inline error, no API call", async () => {
  setup("/reset-password?token=abc");
  await userEvent.type(screen.getByLabelText(/new password/i), "password-123");
  await userEvent.type(screen.getByLabelText(/confirm password/i), "different-456");
  await userEvent.click(screen.getByRole("button", { name: /update password/i }));
  expect(screen.getByText(/passwords don't match/i)).toBeInTheDocument();
  expect(resetPasswordMock).not.toHaveBeenCalled();
});

it("valid submit: calls resetPassword and navigates to /login on success", async () => {
  resetPasswordMock.mockResolvedValue({ data: { status: true }, error: null });
  setup("/reset-password?token=abc");
  await userEvent.type(screen.getByLabelText(/new password/i), "password-123");
  await userEvent.type(screen.getByLabelText(/confirm password/i), "password-123");
  await userEvent.click(screen.getByRole("button", { name: /update password/i }));
  expect(resetPasswordMock).toHaveBeenCalledWith({ newPassword: "password-123", token: "abc" });
  expect(await screen.findByText("login-page")).toBeInTheDocument();
  expect(toastSuccessMock).toHaveBeenCalled();
});

it("API error: surfaces a toast and stays on the page", async () => {
  resetPasswordMock.mockResolvedValue({
    data: null,
    error: { message: "sensitive upstream detail" },
  });
  setup("/reset-password?token=abc");
  await userEvent.type(screen.getByLabelText(/new password/i), "password-123");
  await userEvent.type(screen.getByLabelText(/confirm password/i), "password-123");
  await userEvent.click(screen.getByRole("button", { name: /update password/i }));
  expect(toastErrorMock).toHaveBeenCalledWith("Could not reset the password.");
  expect(toastErrorMock).not.toHaveBeenCalledWith(expect.stringContaining("sensitive"));
  expect(screen.queryByText("login-page")).toBeNull();
});
