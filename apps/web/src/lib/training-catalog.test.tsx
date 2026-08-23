import { LocaleProvider, useI18n } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useApplyTemplate, useTrainingCatalog } from "./training-catalog";

function localizedCatalog(locale: "en" | "es") {
  return {
    templates: [
      {
        key: "basic-manners",
        name: locale === "es" ? "Modales básicos" : "Basic Manners",
        description: locale === "es" ? "Conductas fundamentales" : "Foundational behaviors",
        skills: [],
      },
    ],
  };
}

function requestHeaders(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}

function CatalogProbe() {
  const { locale, selectLocale } = useI18n();
  const { data } = useTrainingCatalog();

  return (
    <>
      <p>{data?.[0]?.name ?? "loading"}</p>
      <button type="button" onClick={() => selectLocale(locale === "en" ? "es" : "en")}>
        switch
      </button>
    </>
  );
}

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>{children}</LocaleProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.setItem("tc-locale", "en");
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("localized training requests", () => {
  it("refetches the training catalog under the opposite locale after a locale switch", async () => {
    const requestedLocales: Array<string | null> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const locale = requestHeaders(input, init).get("X-TuringCare-Locale");
        requestedLocales.push(locale);
        return new Response(JSON.stringify(localizedCatalog(locale === "es" ? "es" : "en")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <CatalogProbe />
        </LocaleProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Basic Manners")).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "switch" }).click());

    expect(await screen.findByText("Modales básicos")).toBeInTheDocument();
    expect(requestedLocales).toEqual(["en", "es"]);
  });

  it("applies a template with the selected locale header and receives localized persisted fields", async () => {
    localStorage.setItem("tc-locale", "es");
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const locale = requestHeaders(input, init).get("X-TuringCare-Locale");
      return new Response(
        JSON.stringify({
          goal: { goal: locale === "es" ? "Modales básicos" : "Basic Manners" },
          skills: [{ name: locale === "es" ? "Sentado" : "Sit" }],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useApplyTemplate("dog-1"), {
      wrapper: wrapper(queryClient),
    });

    let response: { goal: { goal: string }; skills: Array<{ name: string }> } | undefined;
    await act(async () => {
      response = await result.current.mutateAsync("basic-manners");
    });

    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error("expected the apply request");
    const [input, init] = call;
    expect(requestHeaders(input, init).get("X-TuringCare-Locale")).toBe("es");
    expect(response).toEqual({
      goal: { goal: "Modales básicos" },
      skills: [{ name: "Sentado" }],
    });
  });
});
