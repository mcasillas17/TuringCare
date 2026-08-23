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
    useSessionMock.mockReturnValue({ data: { user: { id: "u1" } }, isPending: false });
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
});
