import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider, useI18n } from ".";
import { LocaleAccountBridge } from "./locale-account-bridge";

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock },
}));

function createStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function Probe() {
  const { locale, setLocale } = useI18n();

  return (
    <>
      <p data-testid="locale">{locale}</p>
      <button type="button" onClick={() => setLocale(locale === "en" ? "es" : "en")}>
        switch
      </button>
    </>
  );
}

function setup({
  accountLocale,
  patchSucceeds = true,
}: {
  accountLocale: "en" | "es" | null;
  patchSucceeds?: boolean;
}) {
  const patchLocales: string[] = [];
  let currentAccountLocale = accountLocale;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const path = new URL(url, "http://localhost").pathname;

    if (path === "/api/profile" && method === "GET") {
      return new Response(
        JSON.stringify({
          user: { id: "u1", name: "Miguel", email: "m@example.com", locale: currentAccountLocale },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (path === "/api/profile/locale" && method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { locale: "en" | "es" };
      patchLocales.push(body.locale);

      if (!patchSucceeds) {
        return new Response(JSON.stringify({ error: "save_failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      currentAccountLocale = body.locale;
      return new Response(JSON.stringify({ user: { locale: currentAccountLocale } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <LocaleAccountBridge />
        <Probe />
      </LocaleProvider>
    </QueryClientProvider>,
  );

  return { patchLocales };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorage());
  vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });
});

afterEach(() => {
  toastErrorMock.mockReset();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("LocaleAccountBridge", () => {
  it("adopts a saved account locale over the current local locale", async () => {
    localStorage.setItem("tc-locale", "en");
    const { patchLocales } = setup({ accountLocale: "es" });

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("es"));
    expect(localStorage.getItem("tc-locale")).toBe("es");
    expect(patchLocales).toEqual([]);
  });

  it("keeps the current local locale when the account has no locale preference", async () => {
    localStorage.setItem("tc-locale", "es");
    const { patchLocales } = setup({ accountLocale: null });

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("es"));
    expect(patchLocales).toEqual([]);
  });

  it("persists an explicit locale toggle to the account", async () => {
    const { patchLocales } = setup({ accountLocale: "en" });
    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("en"));

    await userEvent.click(screen.getByRole("button", { name: "switch" }));

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("es"));
    await waitFor(() => expect(patchLocales).toEqual(["es"]));
  });

  it("does not PATCH after adopting the account locale", async () => {
    localStorage.setItem("tc-locale", "en");
    const { patchLocales } = setup({ accountLocale: "es" });

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("es"));
    await waitFor(() => expect(patchLocales).toEqual([]));
  });

  it("keeps an explicit local toggle and shows localized feedback when account sync fails", async () => {
    const { patchLocales } = setup({ accountLocale: null, patchSucceeds: false });
    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("en"));

    await userEvent.click(screen.getByRole("button", { name: "switch" }));

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("es"));
    expect(localStorage.getItem("tc-locale")).toBe("es");
    await waitFor(() => expect(patchLocales).toEqual(["es"]));
    expect(toastErrorMock).toHaveBeenCalledWith("No se pudo guardar el idioma.");
  });
});
