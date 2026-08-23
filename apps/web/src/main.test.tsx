import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, expect, it, vi } from "vitest";

const { capturedQueryClient, renderedRoot, useSessionMock } = vi.hoisted(() => ({
  capturedQueryClient: { current: null as import("@tanstack/react-query").QueryClient | null },
  renderedRoot: { node: null as unknown },
  useSessionMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();

  class CapturingQueryClient extends actual.QueryClient {
    constructor(...args: ConstructorParameters<typeof actual.QueryClient>) {
      super(...args);
      capturedQueryClient.current = this;
    }
  }

  return { ...actual, QueryClient: CapturingQueryClient };
});

vi.mock("react-dom/client", () => ({
  createRoot: () => ({
    render: (node: unknown) => {
      renderedRoot.node = node;
    },
  }),
}));

vi.mock("@/lib/auth-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-client")>()),
  useSession: useSessionMock,
}));

vi.mock("@/lib/track", () => ({
  PageViewTracker: () => null,
}));

afterEach(() => {
  capturedQueryClient.current?.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("adopts a signed-in account locale while rendering the public landing route", async () => {
  window.history.replaceState({}, "", "/");
  localStorage.setItem("tc-locale", "en");
  useSessionMock.mockReturnValue({ data: { user: { id: "u1" } }, isPending: false });
  const requestedPaths: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : String(input), "http://localhost")
        .pathname;
      requestedPaths.push(path);

      if (path === "/me") {
        return new Response(
          JSON.stringify({
            user: { id: "u1", name: "Miguel", email: "m@example.com", role: "user" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (path === "/api/profile") {
        return new Response(
          JSON.stringify({
            user: { id: "u1", name: "Miguel", email: "m@example.com", locale: "es" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );

  await import("./main");
  render(renderedRoot.node as ReactElement);

  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: /adiéstralo con refuerzo positivo/i }),
    ).toBeInTheDocument(),
  );
  expect(requestedPaths).toContain("/api/profile");
});

it("clears private cache before rendering a signed-in public landing route", async () => {
  window.history.replaceState({}, "", "/");
  useSessionMock.mockReturnValue({ data: { user: { id: "u1" } }, isPending: false });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : String(input), "http://localhost")
        .pathname;
      if (path === "/me") {
        return new Response(
          JSON.stringify({
            user: { id: "u1", name: "User", email: "u1@example.com" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (path === "/api/profile") {
        return new Response(
          JSON.stringify({
            user: {
              id: "u1",
              name: "User",
              email: "u1@example.com",
              locale: "en",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    }),
  );

  await import("./main");
  const queryClient = capturedQueryClient.current;
  if (!queryClient) throw new Error("main did not create its QueryClient");
  queryClient.setQueryData(["profile", "stale"], { id: "private-profile" });
  queryClient.setQueryData(["dogs-overview"], [{ id: "private-dog" }]);
  queryClient.setQueryData(["overview"], { marker: "private-overview" });
  queryClient.setQueryData(["training-catalog", "en"], { marker: "public-catalog" });
  render(renderedRoot.node as ReactElement);

  await waitFor(() => {
    expect(queryClient.getQueryData(["profile", "stale"])).toBeUndefined();
    expect(queryClient.getQueryData(["dogs-overview"])).toBeUndefined();
    expect(queryClient.getQueryData(["overview"])).toBeUndefined();
  });
  expect(queryClient.getQueryData(["training-catalog", "en"])).toEqual({
    marker: "public-catalog",
  });
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: /train with positive reinforcement/i }),
    ).toBeInTheDocument(),
  );
});
