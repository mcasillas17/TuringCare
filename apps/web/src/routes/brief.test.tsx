import { LocaleProvider } from "@/i18n";
import * as briefLib from "@/lib/brief";
import { BriefRequestError } from "@/lib/brief-errors";
import * as sendLib from "@/lib/brief-send";
import * as dogsLib from "@/lib/dogs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BriefWindow } from "@turingcare/shared";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Brief } from "./brief";

vi.mock("@/lib/dogs", () => ({ useDogs: vi.fn() }));
vi.mock("@/lib/brief-send", () => ({ useBriefSends: vi.fn(), useSendBrief: vi.fn() }));
vi.mock("@/lib/brief", () => ({
  useBrief: vi.fn(),
  useGenerateBrief: vi.fn(),
  useFinalizeBrief: vi.fn(),
  useShareBrief: vi.fn(),
  useRevokeShare: vi.fn(),
}));
vi.mock("@/components/brief-download-button", () => ({
  default: ({ brief }: { brief: { locale?: string } }) => (
    <button type="button" data-testid="owned-download-locale">
      {brief.locale ?? "missing"} Download PDF
    </button>
  ),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

type BriefData = {
  id: string;
  dogId: string;
  status: "draft" | "finalized";
  version: number;
  summary: string;
  generatedAt: string;
  locale?: "en" | "es";
  shareToken: string | null;
};

const privateBrief: BriefData = {
  id: "brief-1",
  dogId: "d1",
  status: "draft",
  version: 2,
  summary: "Turing summary text",
  generatedAt: "2026-06-21T00:00:00.000Z",
  shareToken: null,
};

const sharedBrief: BriefData = {
  ...privateBrief,
  shareToken: "active-token",
};

type DogData = {
  id: string;
  name: string;
};

type SetupOptions = {
  route?: string;
  dogs?: DogData[];
  briefsByDogId?: Record<string, BriefData | undefined>;
  generateImpl?: (dogId: string, window: BriefWindow) => Promise<unknown>;
  uiLocale?: "en" | "es";
};

function renderBrief(route = "/my/dogs/d1/brief") {
  return (
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/my/dogs/:id/brief" element={<Brief />} />
            <Route path="/my/brief" element={<Brief />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>
  );
}

function setup({
  route = "/my/dogs/d1/brief",
  dogs = [{ id: "d1", name: "Turing" }],
  briefsByDogId = { d1: privateBrief },
  generateImpl = async () => privateBrief,
  uiLocale = "en",
}: SetupOptions = {}) {
  localStorage.setItem("tc-locale", uiLocale);
  let pendingDogId: string | null = null;
  const gen = vi.fn((dogId: string, window: BriefWindow) => generateImpl(dogId, window));
  vi.mocked(dogsLib.useDogs).mockReturnValue({
    data: dogs,
  } as unknown as ReturnType<typeof dogsLib.useDogs>);
  vi.mocked(briefLib.useBrief).mockImplementation(
    ((dogId: string) =>
      ({
        data: dogId ? briefsByDogId[dogId] : undefined,
        isError: false,
      }) as unknown as ReturnType<typeof briefLib.useBrief>) as typeof briefLib.useBrief,
  );
  vi.mocked(briefLib.useGenerateBrief).mockImplementation(
    ((dogId: string) =>
      ({
        mutateAsync: (window: BriefWindow) => {
          pendingDogId = dogId;
          rendered?.rerender(renderBrief(route));
          return Promise.resolve(gen(dogId, window)).finally(() => {
            if (pendingDogId === dogId) {
              pendingDogId = null;
            }
            rendered?.rerender(renderBrief(route));
          });
        },
        isPending: pendingDogId === dogId,
      }) as unknown as ReturnType<
        typeof briefLib.useGenerateBrief
      >) as typeof briefLib.useGenerateBrief,
  );
  vi.mocked(briefLib.useFinalizeBrief).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof briefLib.useFinalizeBrief>);
  vi.mocked(briefLib.useShareBrief).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof briefLib.useShareBrief>);
  vi.mocked(briefLib.useRevokeShare).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof briefLib.useRevokeShare>);
  vi.mocked(sendLib.useBriefSends).mockReturnValue({ data: [] } as unknown as ReturnType<
    typeof sendLib.useBriefSends
  >);
  vi.mocked(sendLib.useSendBrief).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof sendLib.useSendBrief>);

  const rendered = render(renderBrief(route));

  return {
    user: userEvent.setup(),
    gen,
  };
}

function setupLoadError(error: unknown, uiLocale: "en" | "es") {
  localStorage.setItem("tc-locale", uiLocale);
  vi.mocked(dogsLib.useDogs).mockReturnValue({
    data: [{ id: "d1", name: "Turing" }],
  } as unknown as ReturnType<typeof dogsLib.useDogs>);
  vi.mocked(briefLib.useBrief).mockReturnValue({
    data: undefined,
    error,
    isError: true,
  } as unknown as ReturnType<typeof briefLib.useBrief>);
  vi.mocked(briefLib.useGenerateBrief).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  } as unknown as ReturnType<typeof briefLib.useGenerateBrief>);

  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/my/dogs/d1/brief"]}>
          <Routes>
            <Route path="/my/dogs/:id/brief" element={<Brief />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
describe("Brief review", () => {
  it.each([
    ["en", "There is more than one latest Brief version. Generate a new version."],
    ["es", "Hay más de una versión reciente del resumen. Genera una nueva versión."],
  ] as const)("renders localized recovery for a %s load conflict", (locale, expected) => {
    setupLoadError(new BriefRequestError("brief_version_conflict", 409, "load"), locale);

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("keeps a wrong-context load failure on generic recovery copy", () => {
    setupLoadError(new BriefRequestError("brief_version_conflict", 409, "share"), "en");

    expect(screen.getByText("Couldn't load the Brief.")).toBeInTheDocument();
    expect(screen.queryByText(/more than one latest Brief version/i)).not.toBeInTheDocument();
  });

  it("renders the document preview with status and a Share action", () => {
    setup();
    expect(screen.getByText("Turing summary text")).toBeInTheDocument();
    expect(screen.getByText(/draft · v2/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /share this brief/i })).toBeInTheDocument();
  });

  it("opens the share sheet", async () => {
    setup({
      briefsByDogId: {
        d1: { ...privateBrief, status: "finalized" },
      },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /share this brief/i }));
      await vi.dynamicImportSettled();
    });

    expect(screen.getByRole("dialog", { name: /share/i })).toBeInTheDocument();
  });

  it("passes the stored locale into the owned PDF download handoff", async () => {
    setup({
      briefsByDogId: {
        d1: {
          ...privateBrief,
          status: "finalized",
          summary: "Resumen para PDF",
          generatedAt: "2026-05-22T12:00:00Z",
          locale: "es",
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /share this brief/i }));

    expect(await screen.findByTestId("owned-download-locale")).toHaveTextContent("es Download PDF");
  });

  it("uses the selected window only when regenerating an existing Brief", () => {
    const { gen } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^7 days$/i }));
    expect(gen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));
    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen).toHaveBeenCalledWith("d1", "7d");
  });

  it("uses the selected window only when generating an empty Brief", () => {
    const { gen } = setup({
      briefsByDogId: {
        d1: undefined,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /^all time$/i }));
    expect(gen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^generate brief$/i }));
    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen).toHaveBeenCalledWith("d1", "all");
  });

  it("regenerates a private Brief without confirmation", () => {
    const { gen } = setup();

    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));

    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen).toHaveBeenCalledWith("d1", "30d");
    expect(
      screen.queryByRole("dialog", { name: /stop sharing this brief/i }),
    ).not.toBeInTheDocument();
  });

  it("asks before regenerating a shared Brief", () => {
    const { gen } = setup({
      briefsByDogId: {
        d1: sharedBrief,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));

    expect(screen.getByRole("dialog", { name: /stop sharing this brief/i })).toBeInTheDocument();
    expect(gen).not.toHaveBeenCalled();
  });

  it("cancels shared Brief regeneration without making a request", () => {
    const { gen } = setup({
      briefsByDogId: {
        d1: sharedBrief,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(
      screen.queryByRole("dialog", { name: /stop sharing this brief/i }),
    ).not.toBeInTheDocument();
    expect(gen).not.toHaveBeenCalled();
  });

  it("keeps shared Brief confirmation locked open while regeneration is pending", async () => {
    const pendingGeneration = deferred();
    const { gen, user } = setup({
      briefsByDogId: {
        d1: sharedBrief,
      },
      generateImpl: () => pendingGeneration.promise,
    });

    fireEvent.click(screen.getByRole("button", { name: /^90 days$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));
    await user.click(screen.getByRole("button", { name: /stop sharing and regenerate/i }));

    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen).toHaveBeenCalledWith("d1", "90d");

    const dialog = screen.getByRole("dialog", { name: /stop sharing this brief/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /generating/i })).toBeDisabled();

    fireEvent.click(screen.getByTestId("sheet-backdrop"));
    expect(screen.getByRole("dialog", { name: /stop sharing this brief/i })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: /stop sharing this brief/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^close$/i }));
    expect(screen.getByRole("dialog", { name: /stop sharing this brief/i })).toBeInTheDocument();
    expect(gen).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingGeneration.resolve();
      await pendingGeneration.promise;
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /stop sharing this brief/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("disables the global dog picker while shared Brief regeneration is pending", async () => {
    const pendingGeneration = deferred();
    const { gen, user } = setup({
      route: "/my/brief",
      dogs: [
        { id: "d1", name: "Turing" },
        { id: "d2", name: "Nova" },
      ],
      briefsByDogId: {
        d1: sharedBrief,
        d2: { ...sharedBrief, id: "brief-2", dogId: "d2", summary: "Nova summary text" },
      },
      generateImpl: () => pendingGeneration.promise,
    });

    await waitFor(() => expect(screen.getByText("Turing summary text")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^regenerate$/i }));
    await user.click(screen.getByRole("button", { name: /stop sharing and regenerate/i }));

    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen).toHaveBeenCalledWith("d1", "30d");
    expect(screen.getByRole("dialog", { name: /stop sharing this brief/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();

    await act(async () => {
      pendingGeneration.resolve();
      await pendingGeneration.promise;
    });

    await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled());
  });

  it("keeps shared Brief confirmation open after a failed regeneration", async () => {
    const gen = vi.fn().mockRejectedValue(new Error("generation failed"));
    setup({
      briefsByDogId: {
        d1: sharedBrief,
      },
      generateImpl: (_, window) => gen(window),
    });

    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));
    fireEvent.click(screen.getByRole("button", { name: /stop sharing and regenerate/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Generation failed"));
    expect(gen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: /stop sharing this brief/i })).toBeInTheDocument();
  });

  it("closes stale shared regeneration confirmation when the selected dog changes", async () => {
    const { gen, user } = setup({
      route: "/my/brief",
      dogs: [
        { id: "d1", name: "Turing" },
        { id: "d2", name: "Nova" },
      ],
      briefsByDogId: {
        d1: sharedBrief,
        d2: { ...sharedBrief, id: "brief-2", dogId: "d2", summary: "Nova summary text" },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));
    expect(screen.getByRole("dialog", { name: /stop sharing this brief/i })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox"), "d2");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /stop sharing this brief/i }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Nova summary text")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /stop sharing and regenerate/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^regenerate$/i }));

    expect(screen.getByRole("dialog", { name: /stop sharing this brief/i })).toBeInTheDocument();
    expect(gen).not.toHaveBeenCalled();
  });

  it("renders owned brief chrome from the stored Spanish locale even when the UI is English", () => {
    setup({
      briefsByDogId: {
        d1: {
          ...privateBrief,
          status: "finalized",
          version: 3,
          summary: "Resumen escrito por el usuario",
          generatedAt: "2026-05-22T12:00:00Z",
          locale: "es",
        },
      },
      uiLocale: "en",
    });

    expect(screen.getByText("Resumen de conducta")).toBeInTheDocument();
    expect(screen.getByText("Definitivo · v3")).toBeInTheDocument();
    expect(screen.getByText("Generado 22 de mayo de 2026")).toBeInTheDocument();
    expect(screen.queryByText("Behavior Brief")).not.toBeInTheDocument();
    expect(screen.queryByText("Final · v3")).not.toBeInTheDocument();
    expect(screen.queryByText("Generated May 22, 2026")).not.toBeInTheDocument();
    expect(screen.getByText("Resumen escrito por el usuario").closest("article")).toHaveAttribute(
      "lang",
      "es",
    );
  });

  it("keeps owned brief chrome English from the stored locale even when the UI is Spanish", () => {
    setup({
      briefsByDogId: {
        d1: {
          ...privateBrief,
          status: "draft",
          version: 2,
          summary: "English stored brief",
          generatedAt: "2026-05-22T12:00:00Z",
          locale: "en",
        },
      },
      uiLocale: "es",
    });

    expect(screen.getByText("Behavior Brief")).toBeInTheDocument();
    expect(screen.getByText("Draft · v2")).toBeInTheDocument();
    expect(screen.getByText("Generated May 22, 2026")).toBeInTheDocument();
    expect(screen.queryByText("Resumen de conducta")).not.toBeInTheDocument();
    expect(screen.queryByText("Borrador · v2")).not.toBeInTheDocument();
    expect(screen.queryByText("Generado 22 de mayo de 2026")).not.toBeInTheDocument();
    expect(screen.getByText("English stored brief").closest("article")).toHaveAttribute(
      "lang",
      "en",
    );
  });
});
