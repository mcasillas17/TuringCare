import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const deleteUserMock = vi.fn();
const signOutMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  deleteUser: (...a: unknown[]) => deleteUserMock(...a),
  signOut: (...a: unknown[]) => signOutMock(...a),
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

const { DeleteAccountButton } = await import("./delete-account-button");

beforeEach(() => {
  deleteUserMock.mockReset();
  signOutMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

function setup() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/my/settings"]}>
          <Routes>
            <Route path="/my/settings" element={<DeleteAccountButton />} />
            <Route path="/" element={<div>landing-page</div>} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

it("starts collapsed with only the Delete account button", () => {
  setup();
  expect(screen.getByRole("button", { name: /delete account/i })).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: /i understand/i })).toBeNull();
});

it("expands to show the confirm panel when the Delete button is clicked", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
  expect(screen.getByText(/type "delete" to confirm/i)).toBeInTheDocument();
  expect(screen.getByRole("textbox")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /i understand/i })).toBeInTheDocument();
});

it("keeps Confirm disabled until the user types 'delete'", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
  const confirm = screen.getByRole("button", { name: /i understand/i });
  expect(confirm).toBeDisabled();

  const input = screen.getByRole("textbox");
  await userEvent.type(input, "wrong");
  expect(confirm).toBeDisabled();

  await userEvent.clear(input);
  await userEvent.type(input, "delete");
  expect(confirm).not.toBeDisabled();
});

it("Cancel collapses back to the initial state", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
  expect(screen.getByRole("textbox")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByRole("button", { name: /delete account/i })).toBeInTheDocument();
});

it("Confirm calls deleteUser, signs out, toasts success, and navigates to /", async () => {
  deleteUserMock.mockResolvedValue({ data: { success: true }, error: null });
  signOutMock.mockResolvedValue({ data: { success: true }, error: null });
  setup();
  await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
  await userEvent.type(screen.getByRole("textbox"), "delete");
  await userEvent.click(screen.getByRole("button", { name: /i understand/i }));

  await waitFor(() => expect(deleteUserMock).toHaveBeenCalledOnce());
  await waitFor(() => expect(signOutMock).toHaveBeenCalled());
  expect(toastSuccessMock).toHaveBeenCalled();
  expect(await screen.findByText("landing-page")).toBeInTheDocument();
});

it("On API failure stays expanded and toasts the error", async () => {
  deleteUserMock.mockResolvedValue({ data: null, error: { message: "nope" } });
  setup();
  await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
  await userEvent.type(screen.getByRole("textbox"), "delete");
  await userEvent.click(screen.getByRole("button", { name: /i understand/i }));

  await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  expect(signOutMock).not.toHaveBeenCalled();
  // Still expanded.
  expect(screen.getByRole("textbox")).toBeInTheDocument();
});
