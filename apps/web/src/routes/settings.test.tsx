import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
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
    <LocaleProvider>
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    </LocaleProvider>,
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
