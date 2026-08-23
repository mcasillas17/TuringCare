import { LocaleProvider } from "@/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock auth-client before importing the component
const mockUseSession = vi.fn();
const mockSendVerificationEmail = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  useSession: mockUseSession,
  sendVerificationEmail: mockSendVerificationEmail,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks are set up
const { VerifyEmailBanner } = await import("./verify-email-banner");
const { toast } = await import("sonner");

function setup() {
  return render(
    <LocaleProvider>
      <VerifyEmailBanner />
    </LocaleProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("VerifyEmailBanner", () => {
  it("shows banner and Resend button when session is unverified", () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "u1", email: "test@example.com", emailVerified: false } },
      isPending: false,
    });
    setup();
    expect(screen.getByRole("button", { name: /resend/i })).toBeInTheDocument();
    // banner copy visible
    expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
  });

  it("renders nothing when session email is verified", () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "u1", email: "test@example.com", emailVerified: true } },
      isPending: false,
    });
    const { container } = setup();
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when there is no session", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });
    const { container } = setup();
    expect(container.firstChild).toBeNull();
  });

  it.each(["", "   ", 42])(
    "renders nothing for the runtime-invalid session user id %j",
    (userId) => {
      mockUseSession.mockReturnValue({
        data: { user: { id: userId, email: "test@example.com", emailVerified: false } },
        isPending: false,
      });

      const { container } = setup();

      expect(container.firstChild).toBeNull();
      expect(mockSendVerificationEmail).not.toHaveBeenCalled();
    },
  );

  it("calls sendVerificationEmail with the user email on Resend click", async () => {
    mockSendVerificationEmail.mockResolvedValue({ data: {}, error: null });
    mockUseSession.mockReturnValue({
      data: { user: { id: "u1", email: "user@test.com", emailVerified: false } },
      isPending: false,
    });
    setup();
    await userEvent.click(screen.getByRole("button", { name: /resend/i }));
    expect(mockSendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@test.com" }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("hides the banner when dismiss button is clicked", async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "u1", email: "test@example.com", emailVerified: false } },
      isPending: false,
    });
    setup();
    const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
    await userEvent.click(dismissBtn);
    expect(screen.queryByText(/verify your email/i)).not.toBeInTheDocument();
  });
});
