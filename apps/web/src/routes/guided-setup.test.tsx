import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuidedSetupRecord, GuidedSetupStatus } from "@turingcare/shared";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useGuidedSetup: vi.fn(),
  start: vi.fn(),
  saveIntent: vi.fn(),
  abandon: vi.fn(),
  signOut: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("@/lib/guided-setup", () => ({
  useGuidedSetup: mocks.useGuidedSetup,
  useStartGuidedSetup: () => ({ mutateAsync: mocks.start, isPending: false }),
  useSaveGuidedSetupIntent: () => ({ mutateAsync: mocks.saveIntent, isPending: false }),
  useAbandonGuidedSetup: () => ({ mutateAsync: mocks.abandon, isPending: false }),
}));

vi.mock("@/lib/auth-client", () => ({
  signOut: mocks.signOut,
  useSession: mocks.useSession,
}));

import { GuidedSetupLayout } from "@/components/guided-setup/guided-setup-layout";
import { GuidedSetup } from "./guided-setup";

const setupId = "00000000-0000-4000-8000-000000000001";

function record(overrides: Partial<GuidedSetupRecord> = {}): GuidedSetupRecord {
  return {
    id: setupId,
    dogId: "dog-1",
    dogName: "Biscuit",
    currentStep: "intent",
    intent: null,
    startedAt: "2026-08-16T00:00:00.000Z",
    completedAt: null,
    completionReason: null,
    firstActionType: null,
    firstActionId: null,
    ...overrides,
  };
}

function status(overrides: Partial<GuidedSetupStatus> = {}): GuidedSetupStatus {
  return { active: null, latest: null, autoStartEligible: true, ...overrides };
}

function renderRoute(initialEntry: string, setupStatus: GuidedSetupStatus, allowNewDog = false) {
  mocks.useGuidedSetup.mockReturnValue({
    data: setupStatus,
    isLoading: false,
    isError: false,
  });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LocaleProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/my/setup" element={<GuidedSetup allowNewDog={allowNewDog} />} />
            <Route path="/my/setup/new" element={<GuidedSetup allowNewDog />} />
            <Route path="/my" element={<p>overview destination</p>} />
            <Route path="/my/dogs/:id" element={<p>dog destination</p>} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GuidedSetup", () => {
  it("shows dog basics for an eligible owner", () => {
    renderRoute("/my/setup", status());

    expect(screen.getByRole("heading", { name: /Tell us about your dog/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: /Tell us about your dog/i }),
    );
  });

  it("starts basics with the exact profile and advances without recreating the setup", async () => {
    const user = userEvent.setup();
    const active = record();
    mocks.start.mockResolvedValue({ setup: active });
    renderRoute("/my/setup", status());

    await user.type(screen.getByLabelText("Name"), "Biscuit");
    await user.selectOptions(screen.getByLabelText("Size"), "medium");
    await user.selectOptions(screen.getByLabelText("Sex"), "female");
    await user.selectOptions(screen.getByLabelText("Source"), "rescue");
    await user.selectOptions(screen.getByLabelText("Vaccination"), "in_progress");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => expect(screen.getByRole("radiogroup")).toBeInTheDocument());
    expect(mocks.start).toHaveBeenCalledWith({
      name: "Biscuit",
      size: "medium",
      sex: "female",
      spayedNeutered: false,
      source: "rescue",
      vaccineStage: "in_progress",
    });
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/What would help most with Biscuit/i)).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  });

  it("resumes an active intent step and saves a keyboard-selected intent", async () => {
    const user = userEvent.setup();
    mocks.saveIntent.mockResolvedValue({
      setup: record({ currentStep: "action", intent: "train_skill" }),
    });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "intent" }),
        autoStartEligible: false,
      }),
    );

    const radio = screen.getByRole("radio", { name: /Train a skill/i });
    radio.focus();
    fireEvent.keyDown(radio, { key: " " });
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() =>
      expect(mocks.saveIntent).toHaveBeenCalledWith({
        setupId,
        intent: "train_skill",
      }),
    );
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
  });

  it("retains basics values and shows a localized error when start is rejected", async () => {
    const user = userEvent.setup();
    mocks.start.mockRejectedValue(new Error("start_failed"));
    renderRoute("/my/setup", status());

    const name = screen.getByLabelText("Name");
    await user.type(name, "Biscuit");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't start/i));
    expect(name).toHaveValue("Biscuit");
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it("retains intent selection and shows an error when intent save is rejected", async () => {
    const user = userEvent.setup();
    mocks.saveIntent.mockRejectedValue(new Error("intent_failed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "intent" }),
        autoStartEligible: false,
      }),
    );

    const radio = screen.getByRole("radio", { name: /Track progress/i });
    await user.click(radio);
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't save/i));
    expect(radio).toBeChecked();
    expect(mocks.saveIntent).toHaveBeenCalledTimes(1);
  });

  it("allows an explicit new dog setup when there is no active setup", () => {
    renderRoute(
      "/my/setup/new",
      status({ autoStartEligible: false, latest: record({ completedAt: "2026-08-16T01:00:00Z" }) }),
      true,
    );

    expect(screen.getByRole("heading", { name: /Tell us about your dog/i })).toBeInTheDocument();
  });

  it("redirects the normal setup route when no setup is eligible", async () => {
    renderRoute("/my/setup", status({ autoStartEligible: false }));

    await waitFor(() => expect(screen.getByText("overview destination")).toBeInTheDocument());
  });

  it("shows a localized loading and load-failure state", () => {
    mocks.useGuidedSetup.mockReturnValue({ isLoading: true, isError: false });
    render(
      <LocaleProvider>
        <MemoryRouter>
          <GuidedSetup />
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    mocks.useGuidedSetup.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    render(
      <LocaleProvider>
        <MemoryRouter>
          <GuidedSetup />
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(screen.getByText(/Couldn't load guided setup/i)).toBeInTheDocument();
  });

  it("renders Spanish guided setup copy", () => {
    const languages = navigator.languages;
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: ["es-MX"],
    });
    renderRoute("/my/setup", status());

    expect(screen.getByRole("heading", { name: /Cuéntanos sobre tu perro/i })).toBeInTheDocument();
    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: languages,
    });
  });

  it("resumes action at step 3 and offers a two-step abandon flow", async () => {
    const user = userEvent.setup();
    mocks.abandon.mockResolvedValue({ setup: record({ completedAt: "2026-08-16T01:00:00Z" }) });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "track_progress" }),
        autoStartEligible: false,
      }),
    );

    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Exit setup/i }));
    expect(screen.getByRole("button", { name: /Confirm exit/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Confirm exit/i }));

    await waitFor(() => expect(mocks.abandon).toHaveBeenCalledWith({ setupId }));
    expect(screen.getByText("dog destination")).toBeInTheDocument();
  });

  it("abandons from intent and stays on step 2 when abandon fails", async () => {
    const user = userEvent.setup();
    mocks.abandon.mockRejectedValue(new Error("abandon_failed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "intent" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: /Exit setup/i }));
    await user.click(screen.getByRole("button", { name: /Confirm exit/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't exit/i));
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(mocks.abandon).toHaveBeenCalledWith({ setupId });
  });

  it("keeps the action handoff on failure to abandon", async () => {
    const user = userEvent.setup();
    mocks.abandon.mockRejectedValue(new Error("abandon_failed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: /Exit setup/i }));
    await user.click(screen.getByRole("button", { name: /Confirm exit/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't exit/i));
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
  });

  it("keeps the minimal setup layout free of the main nav and companion", () => {
    mocks.useSession.mockReturnValue({
      data: { user: { email: "owner@example.com", emailVerified: true } },
      isPending: false,
    });
    render(
      <LocaleProvider>
        <MemoryRouter>
          <GuidedSetupLayout />
        </MemoryRouter>
      </LocaleProvider>,
    );

    expect(screen.getByText("TuringCare")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Turing — tap/i)).not.toBeInTheDocument();
  });
});
