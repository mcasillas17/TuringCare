import { LocaleProvider } from "@/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const changePasswordMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  changePassword: (...a: unknown[]) => changePasswordMock(...a),
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

const { ChangePasswordForm } = await import("./change-password-form");

beforeEach(() => {
  changePasswordMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

function setup() {
  return render(
    <LocaleProvider>
      <ChangePasswordForm />
    </LocaleProvider>,
  );
}

it("renders three password fields and a Save button", () => {
  setup();
  expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /save password/i })).toBeInTheDocument();
});

it("shows inline errors when fields are too short and does not call the API", async () => {
  setup();
  await userEvent.type(screen.getByLabelText(/current password/i), "short");
  await userEvent.type(screen.getByLabelText(/^new password$/i), "tiny");
  await userEvent.type(screen.getByLabelText(/confirm new password/i), "tiny");
  await userEvent.click(screen.getByRole("button", { name: /save password/i }));
  // At least one length error surfaces. (Zod fires on the first short field.)
  expect(await screen.findAllByText(/at least 8 characters/i)).not.toHaveLength(0);
  expect(changePasswordMock).not.toHaveBeenCalled();
});

it("rejects when confirm doesn't match new", async () => {
  setup();
  await userEvent.type(screen.getByLabelText(/current password/i), "current-pw-123");
  await userEvent.type(screen.getByLabelText(/^new password$/i), "new-password-1");
  await userEvent.type(screen.getByLabelText(/confirm new password/i), "new-password-2");
  await userEvent.click(screen.getByRole("button", { name: /save password/i }));
  expect(await screen.findByText(/passwords don't match/i)).toBeInTheDocument();
  expect(changePasswordMock).not.toHaveBeenCalled();
});

it("rejects when new password equals current", async () => {
  setup();
  await userEvent.type(screen.getByLabelText(/current password/i), "same-password-1");
  await userEvent.type(screen.getByLabelText(/^new password$/i), "same-password-1");
  await userEvent.type(screen.getByLabelText(/confirm new password/i), "same-password-1");
  await userEvent.click(screen.getByRole("button", { name: /save password/i }));
  expect(await screen.findByText(/must differ from current/i)).toBeInTheDocument();
  expect(changePasswordMock).not.toHaveBeenCalled();
});

it("submits and shows a success toast on a valid form", async () => {
  changePasswordMock.mockResolvedValue({ data: { token: "abc" }, error: null });
  setup();
  await userEvent.type(screen.getByLabelText(/current password/i), "current-pw-123");
  await userEvent.type(screen.getByLabelText(/^new password$/i), "fresh-password-1");
  await userEvent.type(screen.getByLabelText(/confirm new password/i), "fresh-password-1");
  await userEvent.click(screen.getByRole("button", { name: /save password/i }));

  await waitFor(() => expect(changePasswordMock).toHaveBeenCalledOnce());
  expect(changePasswordMock).toHaveBeenCalledWith({
    currentPassword: "current-pw-123",
    newPassword: "fresh-password-1",
    revokeOtherSessions: false,
  });
  await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  // Form resets — current password input is empty again.
  expect((screen.getByLabelText(/current password/i) as HTMLInputElement).value).toBe("");
});

it("shows an error toast when the API returns an error (wrong current password)", async () => {
  changePasswordMock.mockResolvedValue({
    data: null,
    error: { message: "Invalid password", status: 400 },
  });
  setup();
  await userEvent.type(screen.getByLabelText(/current password/i), "wrong-current-1");
  await userEvent.type(screen.getByLabelText(/^new password$/i), "fresh-password-1");
  await userEvent.type(screen.getByLabelText(/confirm new password/i), "fresh-password-1");
  await userEvent.click(screen.getByRole("button", { name: /save password/i }));

  await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  expect(toastSuccessMock).not.toHaveBeenCalled();
});
