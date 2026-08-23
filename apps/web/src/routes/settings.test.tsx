import * as turingCtx from "@/components/turing/turing-context";
import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
  signOut: vi.fn(),
  changePassword: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { Settings } = await import("./settings");

afterEach(() => vi.restoreAllMocks());

function setup() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LocaleProvider>
        <MemoryRouter>
          <Settings />
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

it("renders the page title and all four section headings", () => {
  setup();
  expect(screen.getByRole("heading", { level: 1, name: /settings/i })).toBeInTheDocument();
  // Sections.
  expect(screen.getByRole("heading", { level: 2, name: /language/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: /account/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: /change password/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: /danger zone/i })).toBeInTheDocument();
});

it("mounts the ChangePasswordForm (current/new/confirm inputs visible)", () => {
  setup();
  expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
});

it("mounts the DeleteAccountButton (initially collapsed)", () => {
  setup();
  // The danger-zone button. Both Sign out and Delete account are present;
  // assert specifically on "Delete account".
  expect(screen.getByRole("button", { name: /delete account/i })).toBeInTheDocument();
});

it("keeps the existing edit-profile link and sign-out button in the Account section", () => {
  setup();
  expect(screen.getByRole("link", { name: /edit profile/i })).toHaveAttribute(
    "href",
    "/my/profile",
  );
  expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
});

it("renders a Send feedback mailto link in the Account section", () => {
  setup();
  expect(screen.getByRole("link", { name: /send feedback/i })).toHaveAttribute(
    "href",
    "mailto:feedback@turingcare.dog?subject=TuringCare%20feedback",
  );
});

it("toggles Turing visibility", () => {
  const setHidden = vi.fn();
  vi.spyOn(turingCtx, "useTuring").mockReturnValue({
    eventPose: null,
    eventMessage: null,
    asleep: false,
    hidden: false,
    celebrate: vi.fn(),
    setHidden,
  });
  setup();
  fireEvent.click(screen.getByLabelText(/show turing/i));
  expect(setHidden).toHaveBeenCalledWith(true);
});
