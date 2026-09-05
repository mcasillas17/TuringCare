import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

const useSessionMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
}));

const { RedirectIfAuthed } = await import("./redirect-if-authed");

afterEach(() => useSessionMock.mockReset());

function setup() {
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route
            path="/login"
            element={
              <RedirectIfAuthed>
                <div>login-form</div>
              </RedirectIfAuthed>
            }
          />
          <Route path="/my" element={<div>my-portal</div>} />
          <Route path="/verify-email" element={<div>verification</div>} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  );
}

it("redirects an authenticated user to /my", () => {
  useSessionMock.mockReturnValue({
    data: { user: { id: "u1", emailVerified: true } },
    isPending: false,
  });
  setup();
  expect(screen.getByText("my-portal")).toBeInTheDocument();
  expect(screen.queryByText("login-form")).toBeNull();
});

it("routes an unverified legacy session to verification, never the owner app", () => {
  useSessionMock.mockReturnValue({
    data: { user: { id: "u1", emailVerified: false } },
    isPending: false,
  });
  setup();
  expect(screen.getByText("verification")).toBeInTheDocument();
  expect(screen.queryByText("my-portal")).not.toBeInTheDocument();
});

it("shows a loading state while the session is pending", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: true });
  setup();
  expect(screen.queryByText("login-form")).toBeNull();
  expect(screen.queryByText("my-portal")).toBeNull();
});

it("renders children for an unauthenticated visitor", () => {
  useSessionMock.mockReturnValue({ data: null, isPending: false });
  setup();
  expect(screen.getByText("login-form")).toBeInTheDocument();
});

it.each(["", "   ", 42])(
  "renders children for the runtime-invalid session user id %j",
  (userId) => {
    useSessionMock.mockReturnValue({ data: { user: { id: userId } }, isPending: false });

    setup();

    expect(screen.getByText("login-form")).toBeInTheDocument();
    expect(screen.queryByText("my-portal")).not.toBeInTheDocument();
  },
);
