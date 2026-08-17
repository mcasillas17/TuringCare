import { LocaleProvider } from "@/i18n";
import * as guidedSetupLib from "@/lib/guided-setup";
import * as onboardingLib from "@/lib/onboarding";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { GuidedSetupStatus } from "@turingcare/shared";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingChecklist } from "./checklist";

vi.mock("@/lib/onboarding", () => ({
  useOnboardingStatus: vi.fn(),
}));
vi.mock("@/lib/guided-setup", () => ({
  useGuidedSetup: vi.fn(),
}));

// celebrate spy — used in the Turing hop tests below
const celebrate = vi.fn();
vi.mock("@/components/turing/turing-context", () => ({
  useTuring: () => ({ celebrate, eventPose: null, asleep: false }),
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

function setGuidedSetup(
  data: GuidedSetupStatus | undefined,
  opts: { isLoading?: boolean; isError?: boolean } = {},
) {
  vi.mocked(guidedSetupLib.useGuidedSetup).mockReturnValue({
    data,
    isLoading: opts.isLoading ?? false,
    isError: opts.isError ?? false,
  } as unknown as ReturnType<typeof guidedSetupLib.useGuidedSetup>);
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
  if (!window.localStorage) {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  }
  window.localStorage.clear();
  setGuidedSetup({ active: null, latest: null, autoStartEligible: true });
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

  it("hides while guided setup is active", () => {
    setStatus(fresh);
    setGuidedSetup({
      active: {
        id: "setup-1",
        dogId: "dog-1",
        dogName: "Biscuit",
        currentStep: "action",
        intent: "understand_behavior",
        startedAt: "2026-08-16T00:00:00Z",
        completedAt: null,
        completionReason: null,
        firstActionType: null,
        firstActionId: null,
      },
      latest: null,
      autoStartEligible: false,
    });
    const { container } = renderChecklist();
    expect(container.firstChild).toBeNull();
  });

  it("restores the completed checklist when guided setup has no active setup", () => {
    setStatus(complete);
    setGuidedSetup({
      active: null,
      latest: {
        id: "setup-1",
        dogId: "d1",
        dogName: "Biscuit",
        currentStep: "action",
        intent: "understand_behavior",
        startedAt: "2026-08-16T00:00:00Z",
        completedAt: "2026-08-16T01:00:00Z",
        completionReason: "first_action_completed",
        firstActionType: "behavior",
        firstActionId: "concern-1",
      },
      autoStartEligible: false,
    });
    renderChecklist();
    expect(screen.getByText(/all set up/i)).toBeInTheDocument();
  });

  it.each([
    ["loading", { data: undefined, isLoading: true, isError: false }],
    ["error", { data: undefined, isLoading: false, isError: true }],
  ])("does not break the dashboard when guided setup is %s", (_state, query) => {
    setStatus(fresh);
    vi.mocked(guidedSetupLib.useGuidedSetup).mockReturnValue(
      query as unknown as ReturnType<typeof guidedSetupLib.useGuidedSetup>,
    );
    renderChecklist();
    expect(screen.getByText(/Add your first dog/i)).toBeInTheDocument();
  });
});

describe("OnboardingChecklist — Turing hop", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage?.clear();
  });

  it("hops once when onboarding flips incomplete→complete", () => {
    setStatus({ ...complete, hasSentBrief: false });
    const { rerender } = renderChecklist();
    expect(celebrate).not.toHaveBeenCalled();

    setStatus(complete);
    rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <LocaleProvider>
          <MemoryRouter>
            <OnboardingChecklist />
          </MemoryRouter>
        </LocaleProvider>
      </QueryClientProvider>,
    );
    expect(celebrate).toHaveBeenCalledTimes(1);
    expect(celebrate).toHaveBeenCalledWith(true, "turing.celebrateOnboarding");
  });

  it("does not hop when already complete on mount", () => {
    setStatus(complete);
    renderChecklist();
    expect(celebrate).not.toHaveBeenCalled();
  });

  it("does not re-hop when complete stays complete across a rerender", () => {
    setStatus(complete);
    const { rerender } = renderChecklist();
    celebrate.mockClear();

    rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <LocaleProvider>
          <MemoryRouter>
            <OnboardingChecklist />
          </MemoryRouter>
        </LocaleProvider>
      </QueryClientProvider>,
    );
    expect(celebrate).not.toHaveBeenCalled();
  });
});
