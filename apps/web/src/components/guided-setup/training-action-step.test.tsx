import { LocaleProvider } from "@/i18n";
import * as guidedSetupLib from "@/lib/guided-setup";
import * as catalogLib from "@/lib/training-catalog";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CatalogTemplate, GuidedSetupRecord } from "@turingcare/shared";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrainingActionStep } from "./training-action-step";

vi.mock("@/lib/training-catalog", () => ({
  useTrainingCatalog: vi.fn(),
}));

vi.mock("@/lib/guided-setup", () => ({
  guidedSetupErrorMessageKey: (error: unknown) =>
    error instanceof Error && error.message === "invalid_template"
      ? "guidedSetup.trainingInvalidTemplate"
      : error instanceof Error && error.message === "historical_suggestion_unavailable"
        ? "guidedSetup.trainingHistoricalUnavailable"
        : error instanceof Error && error.message === "setup_already_completed"
          ? "guidedSetup.setupAlreadyCompleted"
          : "guidedSetup.genericError",
  isGuidedSetupReconciliationConflict: vi.fn(() => false),
  useCompleteTrainingSetup: vi.fn(),
  useAbandonGuidedSetup: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useGuidedSetup: vi.fn(() => ({ refetch: vi.fn() })),
}));

const templates = ["basic-manners", "puppy-fundamentals", "recall-reliability", "nonstarter"].map(
  (key) => ({
    key,
    name: key,
    description: `${key} description`,
    skills: [],
  }),
) as CatalogTemplate[];

const setup: Pick<GuidedSetupRecord, "id" | "dogName"> = {
  id: "00000000-0000-4000-8000-000000000001",
  dogName: "Biscuit",
};

function renderStep({
  catalog = templates,
  isLoading = false,
  isError = false,
  mutateAsync = vi.fn().mockResolvedValue({}),
  isPending = false,
  onReconcile = vi.fn(async () => false),
  abandonPending = false,
  skipPending = false,
}: {
  catalog?: CatalogTemplate[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  mutateAsync?: ReturnType<typeof vi.fn>;
  isPending?: boolean;
  onReconcile?: ReturnType<typeof vi.fn>;
  abandonPending?: boolean;
  skipPending?: boolean;
} = {}) {
  vi.mocked(catalogLib.useTrainingCatalog).mockReturnValue({
    data: catalog,
    isLoading,
    isError,
  } as ReturnType<typeof catalogLib.useTrainingCatalog>);
  vi.mocked(guidedSetupLib.useCompleteTrainingSetup).mockReturnValue({
    mutateAsync,
    isPending,
  } as unknown as ReturnType<typeof guidedSetupLib.useCompleteTrainingSetup>);

  return render(
    <MemoryRouter>
      <LocaleProvider>
        <TrainingActionStep
          setup={setup}
          onCompleted={vi.fn()}
          onReconcile={onReconcile}
          onBack={vi.fn()}
          onSkip={vi.fn()}
          skipPending={skipPending}
          skipError={null}
          abandonPending={abandonPending}
          onAbandonPendingChange={vi.fn()}
          canNavigateAfterAbandon={() => true}
        />
      </LocaleProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("TrainingActionStep", () => {
  it("shows only the allowlisted catalog templates", () => {
    renderStep();

    expect(screen.getByText("basic-manners")).toBeInTheDocument();
    expect(screen.getByText("puppy-fundamentals")).toBeInTheDocument();
    expect(screen.getByText("recall-reliability")).toBeInTheDocument();
    expect(screen.queryByText("nonstarter")).not.toBeInTheDocument();
  });

  it("shows explicit catalog loading, error, and empty states", () => {
    const { unmount } = renderStep({ catalog: undefined, isLoading: true });
    expect(screen.getByRole("status")).toHaveTextContent("Loading training options");
    unmount();

    const { unmount: unmountError } = renderStep({ catalog: undefined, isError: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load training options");
    screen.getByRole("button", { name: "Exit setup" });
    unmountError();

    renderStep({ catalog: [] });
    expect(screen.getByText("No training options are available right now.")).toBeInTheDocument();
  });

  it("submits the current local week and timezone offset exactly", async () => {
    vi.setSystemTime(new Date("2026-08-16T23:30:00.000Z"));
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(420);
    const mutateAsync = vi.fn().mockResolvedValue({});
    renderStep({ mutateAsync });

    fireEvent.click(screen.getByRole("radio", { name: /puppy-fundamentals/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        setupId: setup.id,
        templateKey: "puppy-fundamentals",
        weekKey: "2026-08-10",
        timezoneOffsetMinutes: 420,
      }),
    );
  });

  it("retains the selected template after an ordinary or structured error", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("invalid_template"));
    renderStep({ mutateAsync });

    const selected = screen.getByRole("radio", { name: /basic-manners/ });
    fireEvent.click(selected);
    fireEvent.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "That training option is no longer available",
      ),
    );
    expect(selected).toBeChecked();
  });

  it("maps a historical suggestion conflict to localized safe copy without a preview fallback", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("historical_suggestion_unavailable"));
    renderStep({ mutateAsync });

    const selected = screen.getByRole("radio", { name: /recall-reliability/ });
    fireEvent.click(selected);
    fireEvent.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This training week has changed. Please choose an option again for the current week.",
      ),
    );
    expect(selected).toBeChecked();
    expect(screen.queryByText("Try this")).not.toBeInTheDocument();
  });

  it("prevents rapid duplicate submissions and serializes navigation while pending", async () => {
    let resolveMutation!: () => void;
    const mutateAsync = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );
    renderStep({ mutateAsync, abandonPending: false, skipPending: false });

    fireEvent.click(screen.getByRole("radio", { name: /basic-manners/ }));
    const save = screen.getByRole("button", { name: "Save first step" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(mutateAsync).toHaveBeenCalledTimes(1);

    resolveMutation();
    await waitFor(() => expect(save).not.toBeDisabled());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Exit setup" }));
    expect(screen.getByRole("button", { name: "Confirm exit" })).toBeInTheDocument();
  });

  it("reconciles stale conflicts and shows a safe localized error when status cannot reconcile", async () => {
    vi.mocked(guidedSetupLib.isGuidedSetupReconciliationConflict).mockReturnValue(true);
    const onReconcile = vi.fn().mockResolvedValue(false);
    const mutateAsync = vi.fn().mockRejectedValue(new Error("setup_already_completed"));
    renderStep({ mutateAsync, onReconcile });

    fireEvent.click(screen.getByRole("radio", { name: /basic-manners/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() => expect(onReconcile).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This guided setup is already complete. We refreshed its status.",
    );
    expect(screen.getByRole("radio", { name: /basic-manners/ })).toBeChecked();
  });

  it("disables back, skip, and abandon in both directions while an action is pending", () => {
    const { unmount } = renderStep({ isPending: true });
    fireEvent.click(screen.getByRole("radio", { name: /basic-manners/ }));

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip this step" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exit setup" })).toBeDisabled();

    unmount();
    renderStep({ abandonPending: true });
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip this step" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exit setup" })).toBeDisabled();
  });
});
