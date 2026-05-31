import { LocaleProvider } from "@/i18n";
import * as onboardingLib from "@/lib/onboarding";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingChecklist } from "./checklist";

vi.mock("@/lib/onboarding", () => ({
  useOnboardingStatus: vi.fn(),
}));

const fresh = {
  hasDog: false,
  momentsCount: 0,
  hasGoal: false,
  hasFinalizedBrief: false,
  hasSentBrief: false,
  mostRecentDogId: null,
} satisfies onboardingLib.OnboardingStatus;

const complete = {
  hasDog: true,
  momentsCount: 7,
  hasGoal: true,
  hasFinalizedBrief: true,
  hasSentBrief: true,
  mostRecentDogId: "d1",
} satisfies onboardingLib.OnboardingStatus;

function setStatus(data: onboardingLib.OnboardingStatus | null) {
  vi.mocked(onboardingLib.useOnboardingStatus).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof onboardingLib.useOnboardingStatus>);
}

function renderChecklist() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter>
          <OnboardingChecklist />
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("OnboardingChecklist", () => {
  it("renders five rows with open circles when nothing is done", () => {
    setStatus(fresh);
    renderChecklist();
    expect(screen.getByText(/Add your first dog/i)).toBeInTheDocument();
    expect(screen.getByText(/Log 3 moments/i)).toBeInTheDocument();
    expect(screen.getByText(/Set a training goal/i)).toBeInTheDocument();
    expect(screen.getByText(/Finalize a brief/i)).toBeInTheDocument();
    expect(screen.getByText(/Share with a trainer/i)).toBeInTheDocument();
    expect(screen.queryByText(/all set up/i)).not.toBeInTheDocument();
  });

  it("link for 'Log 3 moments' points to the most-recent dog's journal", () => {
    setStatus({ ...fresh, hasDog: true, mostRecentDogId: "d-abc" });
    renderChecklist();
    const link = screen.getByRole("link", { name: /Log 3 moments/i });
    expect(link).toHaveAttribute("href", "/my/journal?dogId=d-abc");
  });

  it("when all five complete and not dismissed, renders the celebration banner only", () => {
    setStatus(complete);
    renderChecklist();
    expect(screen.getByText(/all set up/i)).toBeInTheDocument();
    expect(screen.queryByText(/Log 3 moments/i)).not.toBeInTheDocument();
  });

  it("Dismiss button writes the localStorage flag and hides the banner", () => {
    setStatus(complete);
    renderChecklist();
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
    expect(window.localStorage.getItem("turingcare.onboarding.celebrationDismissed")).toBe("true");
    expect(screen.queryByText(/all set up/i)).not.toBeInTheDocument();
  });

  it("when complete + flag pre-set, renders nothing", () => {
    window.localStorage.setItem("turingcare.onboarding.celebrationDismissed", "true");
    setStatus(complete);
    const { container } = renderChecklist();
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing while the status is loading", () => {
    setStatus(null);
    const { container } = renderChecklist();
    expect(container.firstChild).toBeNull();
  });
});
