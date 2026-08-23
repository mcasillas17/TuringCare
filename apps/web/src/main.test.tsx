import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, expect, it, vi } from "vitest";

const { renderedRoot, useSessionMock } = vi.hoisted(() => ({
  renderedRoot: { node: null as unknown },
  useSessionMock: vi.fn(),
}));

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
