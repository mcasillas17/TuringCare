import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider, useI18n } from ".";
import { LocaleAccountBridge } from "./locale-account-bridge";

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
}));

const { useSessionMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: useSessionMock,
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
  const { locale, selectLocale } = useI18n();

  return (
    <>
      <p data-testid="locale">{locale}</p>
      <button type="button" onClick={() => selectLocale(locale === "en" ? "es" : "en")}>
        switch
      </button>
    </>
  );
}

type TestProfile = {
  id: string;
  name: string;
  email: string;
  locale: "en" | "es" | null;
};

type PatchRequest = {
  userId: string;
  locale: "en" | "es";
  resolve: () => void;
  reject: () => void;
};

type ProfileRequest = {
  userId: string;
  resolve: () => void;
};

function setup({
  accountLocale,
  patchSucceeds = true,
  profiles,
  initialUserId = "u1",
  profileResponse = "immediate",
}: {
  accountLocale: "en" | "es" | null;
  patchSucceeds?: boolean | "defer" | "malformed-once";
  profiles?: Record<string, TestProfile>;
  initialUserId?: string;
  profileResponse?: "immediate" | "defer" | "malformed";
}) {
  const patchLocales: string[] = [];
  const patchRequests: PatchRequest[] = [];
  const profileRequests: ProfileRequest[] = [];
  const requestedPaths: string[] = [];
  let currentUserId = initialUserId;
  let sentMalformedPatch = false;
  const profileByUserId: Record<string, TestProfile> = profiles ?? {
    [initialUserId]: {
      id: initialUserId,
      name: "Miguel",
      email: "m@example.com",
      locale: accountLocale,
    },
  };

  useSessionMock.mockImplementation(() => ({
    data: { user: { id: currentUserId, emailVerified: true } },
    isPending: false,
  }));

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const path = new URL(url, "http://localhost").pathname;
    requestedPaths.push(path);
    const currentProfile = profileByUserId[currentUserId];

    if (!currentProfile) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (path === "/me" && method === "GET") {
      return new Response(
        JSON.stringify({
          user: {
            id: currentProfile.id,
            name: currentProfile.name,
            email: currentProfile.email,
            role: "user",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (path === "/api/profile" && method === "GET") {
      const requestUserId = currentUserId;
      const requestProfile = profileByUserId[requestUserId];
      if (!requestProfile) throw new Error(`missing test profile ${requestUserId}`);

      if (profileResponse === "defer") {
        return new Promise<Response>((resolve) => {
          profileRequests.push({
            userId: requestUserId,
            resolve: () =>
              resolve(
                new Response(JSON.stringify({ user: requestProfile }), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }),
              ),
          });
        });
      }

      if (profileResponse === "malformed") {
        return new Response(JSON.stringify({ user: { ...requestProfile, locale: "fr" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ user: currentProfile }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (path === "/api/profile/locale" && method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { locale: "en" | "es" };
      patchLocales.push(body.locale);

      if (patchSucceeds === "malformed-once" && !sentMalformedPatch) {
        sentMalformedPatch = true;
        return new Response(JSON.stringify({ user: { locale: "fr" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (patchSucceeds === "defer") {
        const requestUserId = currentUserId;
        const requestProfile = profileByUserId[requestUserId];
        if (!requestProfile) throw new Error(`missing test profile ${requestUserId}`);

        return new Promise<Response>((resolve, reject) => {
          patchRequests.push({
            userId: requestUserId,
            locale: body.locale,
            resolve: () => {
              requestProfile.locale = body.locale;
              resolve(
                new Response(JSON.stringify({ user: { locale: body.locale } }), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }),
              );
            },
            reject: () => {
              reject(new Error("save_failed"));
            },
          });
        });
      }

      if (!patchSucceeds || patchSucceeds === "malformed-once") {
        return new Response(JSON.stringify({ error: "save_failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      currentProfile.locale = body.locale;
      return new Response(JSON.stringify({ user: { locale: currentProfile.locale } }), {
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

  const tree = () => (
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <LocaleAccountBridge />
        <Probe />
      </LocaleProvider>
    </QueryClientProvider>
  );
  const view = render(tree());

  return {
    patchLocales,
    patchRequests,
    profileRequests,
    profiles: profileByUserId,
    qc,
    requestedPaths,
    switchUser(userId: string) {
      currentUserId = userId;
      view.rerender(tree());
    },
  };
}

beforeEach(() => {
  useSessionMock.mockReturnValue({
    data: { user: { id: "u1", emailVerified: true } },
    isPending: false,
  });
  vi.stubGlobal("localStorage", createStorage());
  vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });
});

afterEach(() => {
  toastErrorMock.mockReset();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("LocaleAccountBridge", () => {
  it("does not start profile requests for an unauthenticated public route", async () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }));
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

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("en"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["", "   ", 42])(
    "does not start profile requests for the runtime-invalid session user id %j",
    async (userId) => {
      useSessionMock.mockReturnValue({ data: { user: { id: userId } }, isPending: false });
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        <QueryClientProvider client={queryClient}>
          <LocaleProvider>
            <LocaleAccountBridge />
            <Probe />
          </LocaleProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("en"));
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("adopts a saved account locale over the current local locale", async () => {
    localStorage.setItem("tc-locale", "en");
    const { patchLocales } = setup({ accountLocale: "es" });

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("es"));
    expect(localStorage.getItem("tc-locale")).toBe("es");
    expect(patchLocales).toEqual([]);
  });

  it("persists the current local locale when the account has no locale preference", async () => {
    localStorage.setItem("tc-locale", "es");
    const { patchLocales } = setup({ accountLocale: null });

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("es"));
    await waitFor(() => expect(patchLocales).toEqual(["es"]));
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
    const { patchLocales } = setup({ accountLocale: "en", patchSucceeds: false });
    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("en"));

    await userEvent.click(screen.getByRole("button", { name: "switch" }));

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("es"));
    expect(localStorage.getItem("tc-locale")).toBe("es");
    await waitFor(() => expect(patchLocales).toEqual(["es"]));
    expect(toastErrorMock).toHaveBeenCalledWith("No se pudo guardar el idioma.");
  });

  it("adopts the new user's locale instead of reusing a previous profile cache entry", async () => {
    localStorage.setItem("tc-locale", "en");
    const { patchLocales, requestedPaths, switchUser } = setup({
      accountLocale: "es",
      profiles: {
        u1: { id: "u1", name: "Miguel", email: "m@example.com", locale: "es" },
        u2: { id: "u2", name: "Ana", email: "a@example.com", locale: "en" },
      },
    });

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("es"));
    expect(patchLocales).toEqual([]);

    switchUser("u2");

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("en"));
    expect(localStorage.getItem("tc-locale")).toBe("en");
    expect(patchLocales).toEqual([]);
    expect(requestedPaths).not.toContain("/me");
  });

  it("keeps an explicit toggle made while profile loading and persists it after resolution", async () => {
    const { patchLocales, profileRequests } = setup({
      accountLocale: "en",
      profileResponse: "defer",
    });

    await waitFor(() => expect(profileRequests).toHaveLength(1));
    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.getByTestId("locale")).toHaveTextContent("es");

    profileRequests[0]?.resolve();

    await waitFor(() => expect(patchLocales).toEqual(["es"]));
    expect(screen.getByTestId("locale")).toHaveTextContent("es");
    expect(localStorage.getItem("tc-locale")).toBe("es");
  });

  it("rejects a malformed profile locale without contaminating locale state", async () => {
    localStorage.setItem("tc-locale", "en");
    const { patchLocales, qc } = setup({ accountLocale: "en", profileResponse: "malformed" });

    await waitFor(() => expect(qc.getQueryState(["profile", "u1"])?.status).toBe("error"));
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("tc-locale")).toBe("en");
    expect(patchLocales).toEqual([]);
  });

  it("treats a malformed mutation locale as one failed save without contaminating UI state", async () => {
    const { patchLocales } = setup({ accountLocale: "en", patchSucceeds: "malformed-once" });
    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("en"));

    await userEvent.click(screen.getByRole("button", { name: "switch" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    expect(patchLocales).toEqual(["es"]);
    expect(screen.getByTestId("locale")).toHaveTextContent("es");
    expect(document.documentElement.lang).toBe("es");
    expect(localStorage.getItem("tc-locale")).toBe("es");
  });

  it("keeps the final rapid toggle as the final account value when PATCH responses resolve out of order", async () => {
    const { patchRequests, profiles } = setup({ accountLocale: "en", patchSucceeds: "defer" });
    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("en"));

    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("es"));
    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("en"));
    await waitFor(() =>
      expect(patchRequests.map((request) => request.locale)).toEqual(["es", "en"]),
    );

    const profile = profiles.u1;
    if (!profile) throw new Error("missing u1 test profile");
    patchRequests[1]?.resolve();
    await waitFor(() => expect(profile.locale).toBe("en"));

    patchRequests[0]?.resolve();

    await waitFor(() => {
      const latestRequest = patchRequests.at(-1);
      expect(latestRequest?.locale).toBe("en");
      expect(patchRequests.length).toBeGreaterThanOrEqual(3);
    });
    patchRequests.at(-1)?.resolve();

    await waitFor(() => expect(profile.locale).toBe("en"));
  });

  it("ignores an old user's mutation resolution after an actual session user switch", async () => {
    const { patchRequests, profiles, switchUser } = setup({
      accountLocale: "en",
      patchSucceeds: "defer",
      profiles: {
        u1: { id: "u1", name: "Miguel", email: "m@example.com", locale: "en" },
        u2: { id: "u2", name: "Ana", email: "a@example.com", locale: "es" },
      },
    });
    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("en"));

    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    await waitFor(() => expect(patchRequests).toHaveLength(1));

    switchUser("u2");
    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("es"));
    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    await waitFor(() => expect(patchRequests).toHaveLength(2));

    patchRequests[1]?.resolve();
    await waitFor(() => expect(profiles.u2?.locale).toBe("en"));
    patchRequests[0]?.resolve();

    await waitFor(() => expect(patchRequests).toHaveLength(2));
    expect(profiles.u2?.locale).toBe("en");
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("ignores an old user's mutation rejection instead of toasting in the new session", async () => {
    const { patchRequests, switchUser } = setup({
      accountLocale: "en",
      patchSucceeds: "defer",
      profiles: {
        u1: { id: "u1", name: "Miguel", email: "m@example.com", locale: "en" },
        u2: { id: "u2", name: "Ana", email: "a@example.com", locale: "en" },
      },
    });
    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("en"));

    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    await waitFor(() => expect(patchRequests).toHaveLength(1));
    switchUser("u2");
    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("en"));
    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    await waitFor(() => expect(patchRequests).toHaveLength(2));

    patchRequests[0]?.reject();

    await waitFor(() => expect(toastErrorMock).not.toHaveBeenCalled());
    patchRequests[1]?.resolve();
    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("es"));
  });
});
