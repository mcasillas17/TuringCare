import { LocaleProvider } from "@/i18n";
import { useBrief } from "@/lib/brief";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BriefShareSheet } from "./share-sheet";

const {
  getBrief,
  generateBrief,
  finalizeBrief,
  shareBrief,
  revokeShare,
  getBriefSends,
  sendBrief,
  celebrate,
} = vi.hoisted(() => ({
  getBrief: vi.fn(),
  generateBrief: vi.fn(),
  finalizeBrief: vi.fn(),
  shareBrief: vi.fn(),
  revokeShare: vi.fn(),
  getBriefSends: vi.fn(),
  sendBrief: vi.fn(),
  celebrate: vi.fn(),
}));

vi.mock("@/components/turing/turing-context", () => ({
  useTuring: () => ({ celebrate }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    api: {
      dogs: {
        ":id": {
          brief: {
            $get: getBrief,
            $post: generateBrief,
            $put: finalizeBrief,
            share: {
              $post: shareBrief,
              $delete: revokeShare,
            },
            sends: {
              $get: getBriefSends,
            },
            send: {
              $post: sendBrief,
            },
          },
        },
      },
    },
  },
}));

const privateBrief = {
  id: "brief-1",
  dogId: "dog-1",
  generatedAt: "2026-08-22T18:00:00.000Z",
  status: "finalized" as const,
  summary: "A private Brief.",
  version: 4,
  shareToken: null,
};

const sharedBrief = {
  ...privateBrief,
  shareToken: "tok123",
};

const send = {
  id: "send-1",
  briefId: "brief-1",
  recipient: "trainer@example.com",
  message: null,
  sentAt: "2026-08-22T18:05:00.000Z",
  sentByUserId: "user-1",
};

function ok<T>(body: T) {
  return { ok: true, json: async () => body };
}

function BriefShareSheetHarness() {
  const { data: brief } = useBrief("dog-1");

  if (!brief) return null;

  return <BriefShareSheet open onClose={() => {}} dogId="dog-1" dogName="Turing" brief={brief} />;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

afterEach(() => vi.clearAllMocks());

describe("BriefShareSheet cache-to-prop flow", () => {
  it("shows a newly shared URL from the Brief cache without a parent rerender", async () => {
    let resolveBriefFetch:
      | ((response: ReturnType<typeof ok<{ brief: typeof sharedBrief }>>) => void)
      | undefined;
    getBrief.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBriefFetch = resolve;
        }),
    );
    generateBrief.mockResolvedValue(ok({ brief: privateBrief }));
    finalizeBrief.mockResolvedValue(ok({ brief: privateBrief }));
    shareBrief.mockResolvedValue(
      ok({ token: "tok123", url: "https://turingcare.example/b/tok123" }),
    );
    revokeShare.mockResolvedValue(ok({ ok: true }));
    getBriefSends.mockResolvedValue(ok({ sends: [] }));
    sendBrief.mockResolvedValue(ok({ send }));

    const queryClient = makeQueryClient();
    queryClient.setQueryData(["brief", "dog-1"], privateBrief);
    render(
      <LocaleProvider>
        <QueryClientProvider client={queryClient}>
          <BriefShareSheetHarness />
        </QueryClientProvider>
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy a private link/i }));

    expect(await screen.findByDisplayValue(/\/b\/tok123$/)).toBeInTheDocument();

    resolveBriefFetch?.(ok({ brief: sharedBrief }));
  });
});
