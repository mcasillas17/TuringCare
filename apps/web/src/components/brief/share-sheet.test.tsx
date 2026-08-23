import { LocaleProvider } from "@/i18n";
import * as briefLib from "@/lib/brief";
import { BriefRequestError } from "@/lib/brief-errors";
import * as sendLib from "@/lib/brief-send";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BriefShareSheet } from "./share-sheet";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

vi.mock("@/lib/brief-send", () => ({ useBriefSends: vi.fn(), useSendBrief: vi.fn() }));
vi.mock("@/lib/brief", () => ({
  useFinalizeBrief: vi.fn(),
  useShareBrief: vi.fn(),
  useRevokeShare: vi.fn(),
}));
// PDF button is lazy + heavy; stub it.
vi.mock("@/components/brief-download-button", () => ({
  default: () => <button type="button">Download PDF</button>,
}));

const brief = {
  status: "draft",
  version: 2,
  summary: "x",
  generatedAt: new Date().toISOString(),
  shareToken: null,
} as const;

type BriefOverride = Partial<{
  status: "draft" | "finalized";
  version: number;
  summary: string;
  generatedAt: string;
  shareToken: string | null;
}>;

type SetupOptions = {
  locale?: "en" | "es";
  finalizeError?: unknown;
  shareError?: unknown;
  revokeError?: unknown;
};

beforeEach(() => {
  toastError.mockReset();
});

afterEach(() => {
  localStorage.clear();
});

function setup(over: BriefOverride = {}, options: SetupOptions = {}) {
  localStorage.setItem("tc-locale", options.locale ?? "en");
  const finalize = options.finalizeError
    ? vi.fn().mockRejectedValue(options.finalizeError)
    : vi.fn().mockResolvedValue({});
  vi.mocked(briefLib.useFinalizeBrief).mockReturnValue({
    mutateAsync: finalize,
    isPending: false,
  } as unknown as ReturnType<typeof briefLib.useFinalizeBrief>);
  const createShare = options.shareError
    ? vi.fn().mockRejectedValue(options.shareError)
    : vi.fn().mockResolvedValue({ token: "tok123", url: "/b/tok123" });
  vi.mocked(briefLib.useShareBrief).mockReturnValue({
    mutateAsync: createShare,
    isPending: false,
  } as unknown as ReturnType<typeof briefLib.useShareBrief>);
  const revokeShare = options.revokeError
    ? vi.fn().mockRejectedValue(options.revokeError)
    : vi.fn().mockResolvedValue({ ok: true });
  vi.mocked(briefLib.useRevokeShare).mockReturnValue({
    mutateAsync: revokeShare,
    isPending: false,
  } as unknown as ReturnType<typeof briefLib.useRevokeShare>);
  vi.mocked(sendLib.useBriefSends).mockReturnValue({ data: [] } as unknown as ReturnType<
    typeof sendLib.useBriefSends
  >);
  vi.mocked(sendLib.useSendBrief).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof sendLib.useSendBrief>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <BriefShareSheet
          open
          onClose={() => {}}
          dogId="d1"
          dogName="Turing"
          dog={undefined}
          brief={{ ...brief, ...over }}
        />
      </QueryClientProvider>
    </LocaleProvider>,
  );
  return { finalize, createShare, revokeShare };
}

describe("BriefShareSheet", () => {
  it.each([
    ["en", "There is more than one latest Brief version. Generate a new version."],
    ["es", "Hay más de una versión reciente del resumen. Genera una nueva versión."],
  ] as const)(
    "renders localized recovery for a %s finalization conflict",
    async (locale, expected) => {
      setup(
        { status: "draft" },
        {
          locale,
          finalizeError: new BriefRequestError("brief_version_conflict", 409, "finalize"),
        },
      );

      fireEvent.click(
        screen.getByRole("button", { name: locale === "en" ? /send to/i : /enviar a/i }),
      );

      await waitFor(() => expect(toastError).toHaveBeenCalledWith(expected));
    },
  );

  it.each([
    ["en", "There is more than one latest Brief version. Generate a new version."],
    ["es", "Hay más de una versión reciente del resumen. Genera una nueva versión."],
  ] as const)(
    "renders localized recovery for a %s share-mint conflict",
    async (locale, expected) => {
      setup(
        { status: "finalized", shareToken: null },
        {
          locale,
          shareError: new BriefRequestError("brief_version_conflict", 409, "share"),
        },
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: locale === "en" ? /copy a private link/i : /enlace privado/i,
        }),
      );

      await waitFor(() => expect(toastError).toHaveBeenCalledWith(expected));
    },
  );

  it.each([
    ["en", "There is more than one latest Brief version. Generate a new version."],
    ["es", "Hay más de una versión reciente del resumen. Genera una nueva versión."],
  ] as const)(
    "renders localized recovery for a %s share-revoke conflict",
    async (locale, expected) => {
      setup(
        { status: "finalized", shareToken: "existing-token" },
        {
          locale,
          revokeError: new BriefRequestError("brief_version_conflict", 409, "revoke"),
        },
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: locale === "en" ? /copy a private link/i : /enlace privado/i,
        }),
      );
      fireEvent.click(
        await screen.findByRole("button", {
          name: locale === "en" ? /stop sharing/i : /dejar de compartir/i,
        }),
      );

      await waitFor(() => expect(toastError).toHaveBeenCalledWith(expected));
    },
  );

  it("does not promote a generic error carrying conflict text to conflict recovery", async () => {
    setup(
      { status: "finalized", shareToken: null },
      { shareError: new Error("brief_version_conflict") },
    );

    fireEvent.click(screen.getByRole("button", { name: /copy a private link/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't update sharing"));
    expect(toastError).not.toHaveBeenCalledWith(expect.stringMatching(/more than one latest/i));
  });

  it("lists the three share options with explanations", () => {
    setup();
    expect(screen.getByRole("button", { name: /send to your trainer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy a private link/i })).toBeInTheDocument();
  });

  it("finalizes a draft when opening the email option", async () => {
    const { finalize } = setup({ status: "draft" });
    fireEvent.click(screen.getByRole("button", { name: /send to your trainer/i }));
    await waitFor(() => expect(finalize).toHaveBeenCalled());
  });

  it("creates a link and shows the URL immediately from the mutation result", async () => {
    const { createShare } = setup({ status: "finalized", shareToken: null });
    fireEvent.click(screen.getByRole("button", { name: /copy a private link/i }));
    await waitFor(() => expect(createShare).toHaveBeenCalled());
    // URL is shown from the returned token, not waiting for a brief refetch.
    expect(await screen.findByDisplayValue(/\/b\/tok123$/)).toBeInTheDocument();
  });
});
