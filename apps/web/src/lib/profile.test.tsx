import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProfile, useUpdateProfileLocale } from "./profile";

function wrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("profile response decoding", () => {
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
