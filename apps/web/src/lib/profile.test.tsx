import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAccountDeletionReadiness, useProfile, useUpdateProfileLocale } from "./profile";

function wrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("profile response decoding", () => {
  it("accepts allowlisted account-deletion readiness and rejects malformed payloads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: "brief_delivery_recovery_required", dogId: "dog-1" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "brief_delivery_recovery_required" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAccountDeletionReadiness()).resolves.toEqual({
      status: "brief_delivery_recovery_required",
      dogId: "dog-1",
    });
    await expect(getAccountDeletionReadiness()).rejects.toThrow(
      "invalid_account_deletion_readiness",
    );
  });

  it("allows account deletion when the legacy API has no readiness route", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(getAccountDeletionReadiness()).resolves.toEqual({ status: "ready" });
  });

  it("does not fetch or create an unscoped query when the session user id is null", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useProfile(null), { wrapper: wrapper(queryClient) });

    await act(async () => {});
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryCache().find({ exact: true, queryKey: ["profile"] }),
    ).toBeUndefined();
  });

  it.each(["", "   ", undefined, 42])(
    "fails closed without fetching for the runtime-invalid user id %j",
    async (runtimeUserId) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      const { result } = renderHook(() => useProfile(runtimeUserId as unknown as string | null), {
        wrapper: wrapper(queryClient),
      });

      await act(async () => {});
      expect(result.current.fetchStatus).toBe("idle");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(
        queryClient.getQueryCache().find({ exact: true, queryKey: ["profile"] }),
      ).toBeUndefined();
    },
  );

  it("fails distinctly when a profile response contains a non-allowlisted locale", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            user: { id: "u1", name: "Miguel", email: "m@example.com", locale: "fr" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useProfile("u1"), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: "invalid_profile_response" });
    expect(queryClient.getQueryData(["profile", "u1"])).toBeUndefined();
  });

  it("rejects a profile whose payload identity differs from the requested session user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            user: { id: "u-old", name: "Old", email: "old@example.com", locale: "es" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useProfile("u-new"), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: "invalid_profile_response" });
  });

  it("rejects a malformed locale mutation response without writing it into cache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ user: { locale: "fr" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["profile", "u1"], {
      id: "u1",
      name: "Miguel",
      email: "m@example.com",
      locale: "en",
    });
    const { result } = renderHook(() => useUpdateProfileLocale(), {
      wrapper: wrapper(queryClient),
    });

    let mutation: Promise<unknown> | undefined;
    act(() => {
      mutation = result.current.mutateAsync({ locale: "es" });
    });

    await expect(mutation).rejects.toMatchObject({ code: "invalid_profile_locale_response" });
    expect(queryClient.getQueryData(["profile", "u1"])).toMatchObject({ locale: "en" });
  });
});
