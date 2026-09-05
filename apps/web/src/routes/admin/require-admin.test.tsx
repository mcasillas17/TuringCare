import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RequireAdmin } from "./require-admin";

const { session } = vi.hoisted(() => ({
  session: { verified: true as unknown, anonymous: false },
}));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: session.anonymous ? null : { user: { id: "u1", emailVerified: session.verified } },
    isPending: false,
  }),
}));
beforeEach(() => {
  session.verified = true;
  session.anonymous = false;
});

function mockMe(role: string | null, emailVerified: unknown = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      role === null
        ? new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
        : new Response(
            JSON.stringify({ user: { id: "u1", email: "a@b.c", role, emailVerified } }),
            {
              status: 200,
            },
          ),
    ),
  );
}
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

function setup(locale: "en" | "es" = "en") {
  localStorage.setItem("tc-locale", locale);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <div>secret dashboard</div>
                </RequireAdmin>
              }
            />
            <Route path="/my" element={<div>app home</div>} />
            <Route path="/login" element={<div>login</div>} />
            <Route path="/verify-email" element={<div>verification</div>} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

it("renders children for an admin", async () => {
  mockMe("admin");
  setup();
  await waitFor(() => expect(screen.getByText("secret dashboard")).toBeInTheDocument());
});

it("redirects a non-admin to /app", async () => {
  mockMe("user");
  setup();
  await waitFor(() => expect(screen.getByText("app home")).toBeInTheDocument());
});

it("redirects an unauthenticated visitor to login", async () => {
  session.anonymous = true;
  mockMe(null);
  setup();
  await waitFor(() => expect(screen.getByText("login")).toBeInTheDocument());
  expect(fetch).not.toHaveBeenCalled();
});

it.each([false, undefined, null, "true"])(
  "denies an existing admin session with verification %j before loading /me",
  async (verified) => {
    session.verified = verified;
    mockMe("admin");
    setup();
    expect(await screen.findByText("verification")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("does not trust admin role without authoritative /me verification", async () => {
  mockMe("admin", false);
  setup();
  expect(await screen.findByText("verification")).toBeInTheDocument();
  expect(screen.queryByText("secret dashboard")).not.toBeInTheDocument();
});

it("presents a retryable server error instead of denying access as a non-admin", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ error: "server_error" }, { status: 500 })),
  );
  setup();
  expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  expect(screen.queryByText("app home")).not.toBeInTheDocument();
});

it("renders the loading state in Spanish", () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  setup("es");
  expect(screen.getByText("Cargando…")).toBeInTheDocument();
});
