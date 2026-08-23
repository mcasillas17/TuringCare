import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  generate: vi.fn(),
  finalize: vi.fn(),
  share: vi.fn(),
  revoke: vi.fn(),
  celebrate: vi.fn(),
}));

vi.mock("./api", () => ({
  api: {
    api: {
      dogs: {
        ":id": {
          brief: {
            $get: mocks.get,
            $post: mocks.generate,
            $put: mocks.finalize,
            share: { $post: mocks.share, $delete: mocks.revoke },
          },
        },
      },
    },
  },
}));

vi.mock("@/components/turing/turing-context", () => ({
  useTuring: () => ({ celebrate: mocks.celebrate }),
}));

import {
  useBrief,
  useFinalizeBrief,
  useGenerateBrief,
  useRevokeShare,
  useShareBrief,
} from "./brief";
import type { BriefRequestError } from "./brief-errors";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const conflictResponse = () => ({
  ok: false,
  status: 409,
  json: async () => ({ error: "brief_version_conflict" }),
});

afterEach(() => vi.clearAllMocks());

describe("Brief hooks", () => {
  it("preserves a stable conflict code, status, and load context", async () => {
    mocks.get.mockResolvedValue(conflictResponse());
    const { result } = renderHook(() => useBrief("d1"), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({
      code: "brief_version_conflict",
      status: 409,
      context: "load",
    });
  });

  it.each([
    ["generate", mocks.generate, () => useGenerateBrief("d1"), "30d"],
    ["finalize", mocks.finalize, () => useFinalizeBrief("d1"), undefined],
    ["share", mocks.share, () => useShareBrief("d1"), undefined],
    ["revoke", mocks.revoke, () => useRevokeShare("d1"), undefined],
  ] as const)(
    "preserves a stable conflict through the %s mutation",
    async (context, request, hook, input) => {
      request.mockResolvedValue(conflictResponse());
      const { result } = renderHook(
        hook as unknown as () => { mutateAsync: (value?: unknown) => Promise<unknown> },
        { wrapper: makeWrapper() },
      );
      let error: BriefRequestError | undefined;

      await act(async () => {
        try {
          await result.current.mutateAsync(input);
        } catch (caught) {
          error = caught as BriefRequestError;
        }
      });

      expect(error).toMatchObject({ code: "brief_version_conflict", status: 409, context });
    },
  );

  it("returns successful query and mutation payloads without changing their contracts", async () => {
    const brief = { id: "b1", status: "draft", version: 1 };
    mocks.get.mockResolvedValue({ ok: true, json: async () => ({ brief }) });
    mocks.generate.mockResolvedValue({ ok: true, json: async () => ({ brief }) });
    mocks.finalize.mockResolvedValue({
      ok: true,
      json: async () => ({ brief: { ...brief, status: "finalized" } }),
    });
    mocks.share.mockResolvedValue({
      ok: true,
      json: async () => ({ token: "token", url: "/b/token" }),
    });
    mocks.revoke.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const wrapper = makeWrapper();
    const query = renderHook(() => useBrief("d1"), { wrapper });
    const generate = renderHook(() => useGenerateBrief("d1"), { wrapper });
    const finalize = renderHook(() => useFinalizeBrief("d1"), { wrapper });
    const share = renderHook(() => useShareBrief("d1"), { wrapper });
    const revoke = renderHook(() => useRevokeShare("d1"), { wrapper });

    await waitFor(() => expect(query.result.current.data).toEqual(brief));
    await act(async () => {
      await expect(generate.result.current.mutateAsync("30d")).resolves.toEqual(brief);
      await expect(finalize.result.current.mutateAsync()).resolves.toMatchObject({
        status: "finalized",
      });
      await expect(share.result.current.mutateAsync()).resolves.toEqual({
        token: "token",
        url: "/b/token",
      });
      await expect(revoke.result.current.mutateAsync()).resolves.toEqual({ ok: true });
    });
    expect(mocks.celebrate).toHaveBeenCalledWith(true, "turing.celebrateBrief");
  });
});
