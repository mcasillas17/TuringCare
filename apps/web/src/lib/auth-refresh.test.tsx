import { DirectoryLayout } from "@/components/DirectoryLayout";
import { LocaleProvider } from "@/i18n";
import { LocaleAccountBoundary } from "@/i18n/locale-account-bridge";
import { RequireAuth } from "@/routes/require-auth";
import { TrainerDetail } from "@/routes/trainer-detail";
import { VerifyEmail } from "@/routes/verify-email";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SessionQueryBoundary } from "./session-query-boundary";

const { session } = vi.hoisted(() => ({
  session: {
    data: { user: { id: "u1", emailVerified: true } } as {
      user: { id: string; emailVerified: boolean };
    } | null,
    isPending: false,
    isRefetching: false,
    error: null as Error | null,
  },
}));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => session,
  signOut: vi.fn(),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/components/app-shell/AppShell", () => ({ AppShell: () => <Outlet /> }));

beforeEach(() => {
  session.data = { user: { id: "u1", emailVerified: true } };
  session.isPending = false;
  session.isRefetching = false;
  session.error = null;
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : String(input), "http://localhost")
        .pathname;
      if (path === "/api/profile")
        return Response.json({
          user: { id: "u1", name: "Synthetic", email: "synthetic@example.test", locale: "en" },
        });
      if (path === "/api/verification/status")
        return Response.json({ status: "none", next: "/my", locale: "en" });
      return Response.json({
        trainer: {
          id: "t1",
          name: "Public trainer",
          city: "Austin",
          state: "TX",
          email: "private@example.test",
          phone: "555-0100",
          specialties: [],
          methodologyTags: [],
          certifications: [],
        },
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function setup(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <SessionQueryBoundary>
          <LocaleAccountBoundary>
            <MemoryRouter initialEntries={[path]}>
              <Routes>
                <Route
                  path="/my/profile"
                  element={
                    <RequireAuth>
                      <input aria-label="Draft note" />
                    </RequireAuth>
                  }
                />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route element={<DirectoryLayout />}>
                  <Route path="/trainers/:id" element={<TrainerDetail />} />
                </Route>
              </Routes>
            </MemoryRouter>
          </LocaleAccountBoundary>
        </SessionQueryBoundary>
      </LocaleProvider>
    </QueryClientProvider>
  );
  return { queryClient, tree, ...render(tree()) };
}

it("keeps an unsaved owner form and private caches across an unchanged background refresh", async () => {
  const view = setup("/my/profile");
  const input = await screen.findByLabelText("Draft note");
  await userEvent.type(input, "unsaved owner draft");
  view.queryClient.setQueryData(["owner-private"], { marker: "keep" });
  const callsBefore = vi.mocked(fetch).mock.calls.length;
  session.isRefetching = true;
  view.rerender(view.tree());
  expect(screen.getByLabelText("Draft note")).toBe(input);
  expect(input).toHaveValue("unsaved owner draft");
  expect(view.queryClient.getQueryData(["owner-private"])).toEqual({ marker: "keep" });
  session.isRefetching = false;
  view.rerender(view.tree());
  expect(screen.getByLabelText("Draft note")).toBe(input);
  expect(vi.mocked(fetch).mock.calls).toHaveLength(callsBefore);
});

it("keeps a no-session resend form mounted through pending and refetching transitions", async () => {
  session.data = null;
  const view = setup("/verify-email");
  const email = await screen.findByLabelText("Email");
  const password = screen.getByLabelText("Password");
  await userEvent.type(email, "synthetic@example.test");
  await userEvent.type(password, "in-memory-only");
  session.isPending = true;
  session.isRefetching = true;
  view.rerender(view.tree());
  expect(screen.getByLabelText("Email")).toBe(email);
  expect(password).toHaveValue("in-memory-only");
  expect(screen.getByRole("button", { name: "Request a new link" })).toBeEnabled();
  session.isPending = false;
  session.isRefetching = false;
  view.rerender(view.tree());
  expect(screen.getByLabelText("Password")).toBe(password);
  expect(email).toHaveValue("synthetic@example.test");
});

it("renders public directory content after a session error while clearing and hiding private contact cache", async () => {
  const view = setup("/trainers/t1");
  await screen.findByText(/private@example.test/);
  session.error = new Error("session unavailable");
  view.rerender(view.tree());
  expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
  await screen.findByText("Public trainer");
  expect(screen.queryByText(/private@example.test/)).not.toBeInTheDocument();
  expect(screen.queryByText(/555-0100/)).not.toBeInTheDocument();
  await waitFor(() => expect(view.queryClient.getQueryData(["profile", "u1"])).toBeUndefined());
});
