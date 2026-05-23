import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const requestPasswordResetMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  requestPasswordReset: (...a: unknown[]) => requestPasswordResetMock(...a),
}));

const { ForgotPassword } = await import("./forgot-password");

beforeEach(() => requestPasswordResetMock.mockReset());
afterEach(() => vi.restoreAllMocks());

function setup() {
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

it("renders the form with a back-to-login link", () => {
  setup();
  expect(screen.getByRole("heading", { name: /reset your password/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /send reset link/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /back to log in/i })).toHaveAttribute("href", "/login");
});

it("submits with email + redirectTo, then shows the success view (resolved)", async () => {
  requestPasswordResetMock.mockResolvedValue({ data: null, error: null });
  setup();
  await userEvent.type(screen.getByLabelText(/email/i), "u@example.com");
  await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

  expect(requestPasswordResetMock).toHaveBeenCalledOnce();
  const arg = requestPasswordResetMock.mock.calls[0]?.[0] as { email: string; redirectTo: string };
  expect(arg.email).toBe("u@example.com");
  expect(arg.redirectTo).toMatch(/\/reset-password$/);

  expect(await screen.findByRole("heading", { name: /check your inbox/i })).toBeInTheDocument();
});

it("shows the same success view even if the API rejects (anti-enumeration)", async () => {
  requestPasswordResetMock.mockRejectedValue(new Error("not found"));
  setup();
  await userEvent.type(screen.getByLabelText(/email/i), "u@example.com");
  await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));
  expect(await screen.findByRole("heading", { name: /check your inbox/i })).toBeInTheDocument();
});
