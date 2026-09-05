import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const { identityReadyState, useSessionMock } = vi.hoisted(() => ({
  identityReadyState: { value: true },
  useSessionMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: useSessionMock,
}));

vi.mock("@/lib/session-query-boundary", () => ({
  useSessionQueryReady: () => identityReadyState.value,
}));

import { RequireAuth } from "./require-auth";

function setup() {
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={["/private"]}>
        <Routes>
          <Route
            path="/private"
            element={
              <RequireAuth>
                <div>private content</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/verify-email" element={<div>verification page</div>} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  );
}

afterEach(() => {
  identityReadyState.value = true;
  useSessionMock.mockReset();
  localStorage.clear();
});

describe("RequireAuth", () => {
  it("renders private children only after the session cache boundary is ready", () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: "u1", emailVerified: true } },
      isPending: false,
    });
    identityReadyState.value = false;

    const view = setup();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("private content")).not.toBeInTheDocument();

    identityReadyState.value = true;
    view.rerender(
      <LocaleProvider>
        <MemoryRouter initialEntries={["/private"]}>
          <Routes>
            <Route
              path="/private"
              element={
                <RequireAuth>
                  <div>private content</div>
                </RequireAuth>
              }
            />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(screen.getByText("private content")).toBeInTheDocument();
  });

  it("redirects a resolved anonymous visitor to login", () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false });

    setup();

    expect(screen.getByText("login page")).toBeInTheDocument();
    expect(screen.queryByText("private content")).not.toBeInTheDocument();
  });

  it.each([false, undefined, null, "true"])(
    "requires explicit verified ownership for %j",
    (emailVerified) => {
      useSessionMock.mockReturnValue({
        data: { user: { id: "u1", emailVerified } },
        isPending: false,
      });
      setup();
      expect(screen.getByText("verification page")).toBeInTheDocument();
      expect(screen.queryByText("private content")).not.toBeInTheDocument();
    },
  );

  it("shows a retryable session error instead of treating it as anonymous", () => {
    useSessionMock.mockReturnValue({
      data: null,
      isPending: false,
      error: new Error("offline"),
      refetch: vi.fn(),
    });
    setup();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
  });

  it.each(["", "   ", 42])("fails closed for the runtime-invalid session user id %j", (userId) => {
    useSessionMock.mockReturnValue({ data: { user: { id: userId } }, isPending: false });

    setup();

    expect(screen.getByText("login page")).toBeInTheDocument();
    expect(screen.queryByText("private content")).not.toBeInTheDocument();
  });
});
