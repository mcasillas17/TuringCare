import { useBrief } from "@/lib/brief";
import { useTrainingCatalog } from "@/lib/training-catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider, useI18n } from ".";
import { LocaleAccountBoundary, useLocaleAccountReadiness } from "./locale-account-bridge";

const { identityReadyState, useSessionMock } = vi.hoisted(() => ({
  identityReadyState: { value: true },
  useSessionMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({ useSession: useSessionMock }));
vi.mock("@/lib/session-query-boundary", () => ({
  useSessionQueryReady: () => identityReadyState.value,
}));

function SensitiveRequestsProbe() {
  const { locale } = useI18n();
  const readiness = useLocaleAccountReadiness();
  useBrief("d1");
  useTrainingCatalog();

  return <p data-testid="sensitive-readiness">{`${readiness.status}:${locale}`}</p>;
}

function PublicProbe() {
  const readiness = useLocaleAccountReadiness();
  return <p>{`public:${readiness.status}`}</p>;
}

it.each([false, undefined])(
  "keeps local Spanish without forbidden profile requests when verification is %j",
  async (emailVerified) => {
    localStorage.setItem("tc-locale", "es");
    useSessionMock.mockReturnValue({
      data: { user: { id: "u1", emailVerified } },
      isPending: false,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"error":"email_unverified"}', { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LocaleProvider>
          <LocaleAccountBoundary>
            <PublicProbe />
          </LocaleAccountBoundary>
        </LocaleProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("public:signed-out")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("es");
    expect(localStorage.getItem("tc-locale")).toBe("es");
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

type RequestRecord = { locale: string | null; path: string };

function setupSignedIn(profileResponse: "defer" | "empty-account" | "error") {
  useSessionMock.mockReturnValue({
    data: { user: { id: "u1", emailVerified: true } },
    isPending: false,
  });
  const requests: RequestRecord[] = [];
  let resolveLocalePatch: (() => void) | undefined;
  let resolveProfile: (() => void) | undefined;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : null;
      const url = request?.url ?? String(input);
      const headers = new Headers(request?.headers);
      new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
      const path = new URL(url, "http://localhost").pathname;
      requests.push({ locale: headers.get("X-TuringCare-Locale"), path });

      if (path === "/api/profile") {
        if (profileResponse === "error") {
          return new Response(JSON.stringify({ error: "load_failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (profileResponse === "empty-account") {
          return new Response(
            JSON.stringify({
              user: {
                id: "u1",
                name: "Miguel",
                email: "m@example.com",
                locale: null,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Promise<Response>((resolve) => {
          resolveProfile = () =>
            resolve(
              new Response(
                JSON.stringify({
                  user: {
                    id: "u1",
                    name: "Miguel",
                    email: "m@example.com",
                    locale: "es",
                  },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
        });
      }

      if (path === "/api/profile/locale") {
        return new Promise<Response>((resolve) => {
          resolveLocalePatch = () =>
            resolve(
              new Response(JSON.stringify({ user: { locale: "en" } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }),
            );
        });
      }

      if (path === "/api/dogs/d1/brief") {
        return new Response(JSON.stringify({ brief: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (path === "/api/training/templates") {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <LocaleAccountBoundary>
          <SensitiveRequestsProbe />
        </LocaleAccountBoundary>
      </LocaleProvider>
    </QueryClientProvider>,
  );

  return {
    requests,
    resolveLocalePatch: () => resolveLocalePatch?.(),
    resolveProfile: () => resolveProfile?.(),
  };
}

beforeEach(() => {
  identityReadyState.value = true;
  localStorage.setItem("tc-locale", "en");
});

afterEach(() => {
  localStorage.clear();
  useSessionMock.mockReset();
  vi.unstubAllGlobals();
});

describe("LocaleAccountBoundary readiness", () => {
  it("defers Brief and template requests until account Spanish replaces local English", async () => {
    const { requests, resolveProfile } = setupSignedIn("defer");

    await waitFor(() =>
      expect(requests.filter((request) => request.path === "/api/profile")).toHaveLength(1),
    );
    expect(requests.filter((request) => request.path === "/api/dogs/d1/brief")).toEqual([]);
    expect(requests.filter((request) => request.path === "/api/training/templates")).toEqual([]);

    resolveProfile();

    await waitFor(() => {
      expect(requests.some((request) => request.path === "/api/dogs/d1/brief")).toBe(true);
      expect(requests.some((request) => request.path === "/api/training/templates")).toBe(true);
    });
    expect(screen.getByTestId("sensitive-readiness")).toHaveTextContent("account:es");
    expect(
      requests
        .filter(
          (request) =>
            request.path === "/api/dogs/d1/brief" || request.path === "/api/training/templates",
        )
        .map((request) => request.locale),
    ).toEqual(["es", "es"]);
  });

  it("falls back explicitly to the current valid locale when profile loading fails", async () => {
    localStorage.setItem("tc-locale", "es");
    const { requests } = setupSignedIn("error");

    expect(await screen.findByTestId("sensitive-readiness")).toHaveTextContent("local-fallback:es");
    await waitFor(() =>
      expect(
        requests
          .filter(
            (request) =>
              request.path === "/api/dogs/d1/brief" || request.path === "/api/training/templates",
          )
          .map((request) => request.locale),
      ).toEqual(["es", "es"]),
    );
  });

  it("waits for the local preference to reconcile with an empty account profile", async () => {
    const { requests, resolveLocalePatch } = setupSignedIn("empty-account");

    await waitFor(() =>
      expect(requests.filter((request) => request.path === "/api/profile/locale")).toHaveLength(1),
    );
    expect(requests.filter((request) => request.path === "/api/dogs/d1/brief")).toEqual([]);
    expect(requests.filter((request) => request.path === "/api/training/templates")).toEqual([]);

    resolveLocalePatch();

    expect(await screen.findByTestId("sensitive-readiness")).toHaveTextContent("account:en");
    await waitFor(() =>
      expect(
        requests
          .filter(
            (request) =>
              request.path === "/api/dogs/d1/brief" || request.path === "/api/training/templates",
          )
          .map((request) => request.locale),
      ).toEqual(["en", "en"]),
    );
  });

  it("renders signed-out public children without requesting a profile", () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <LocaleProvider>
          <LocaleAccountBoundary>
            <PublicProbe />
          </LocaleAccountBoundary>
        </LocaleProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("public:signed-out")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps resolved signed-out public content available while private cache cleanup runs", () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false });
    identityReadyState.value = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <LocaleProvider>
          <LocaleAccountBoundary>
            <PublicProbe />
          </LocaleAccountBoundary>
        </LocaleProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("public:signed-out")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
