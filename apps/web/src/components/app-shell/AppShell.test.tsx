import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  useSession: vi.fn(() => ({ data: null, isPending: false })),
}));

vi.mock("@/lib/auth-client", () => ({
  signOut: mocks.signOut,
  useSession: mocks.useSession,
}));
vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

function mockMe(role: string | undefined) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ user: { id: "u1", name: "A", email: "a@b.c", role } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
}
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function setup(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <MemoryRouter initialEntries={["/my"]}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/my" element={<div>OVERVIEW-CONTENT</div>} />
                <Route path="/login" element={<div>LOGIN-CONTENT</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </LocaleProvider>
      </QueryClientProvider>,
    ),
  };
}

describe("AppShell", () => {
  it("renders brand, nav items, and the routed outlet", async () => {
    mockMe("user");
    setup();
    expect(screen.getByText("TuringCare")).toBeInTheDocument();
    expect(screen.getByText("OVERVIEW-CONTENT")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dogs/i })).toBeInTheDocument();
  });
  it("hides Admin for non-admins, shows it for admins", async () => {
    mockMe("user");
    const { unmount } = setup();
    await waitFor(() => expect(screen.queryByRole("link", { name: /admin/i })).toBeNull());
    unmount();
    mockMe("admin");
    setup();
    await waitFor(() => expect(screen.getByRole("link", { name: /admin/i })).toBeInTheDocument());
  });
  it("places the language chip after Sign out (literal top-right corner)", () => {
    mockMe("user");
    setup();
    const signOut = screen.getByRole("button", { name: /sign out/i });
    const chip = screen.getByRole("button", { name: "Language" });
    // The chip must come AFTER the Sign out button in document order.
    expect(signOut.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("clears owner caches before navigating after a successful sign out", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    queryClient.setQueryData(["guided-setup"], { active: { id: "setup-1" } });
    queryClient.setQueryData(["dogs"], [{ id: "dog-1", name: "Biscuit" }]);
    mocks.signOut.mockImplementation(async () => {
      expect(queryClient.getQueryData(["guided-setup"])).toBeDefined();
      expect(queryClient.getQueryData(["dogs"])).toBeDefined();
      return { data: { success: true }, error: null };
    });
    mockMe("user");
    setup(queryClient);

    await user.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(screen.getByText("LOGIN-CONTENT")).toBeInTheDocument());
    expect(queryClient.getQueryData(["guided-setup"])).toBeUndefined();
    expect(queryClient.getQueryData(["dogs"])).toBeUndefined();
  });

  it("clears owner caches, stays in place, and shows a localized error when sign-out returns an error", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    queryClient.setQueryData(["dogs"], [{ id: "dog-1" }]);
    mocks.signOut.mockResolvedValue({ data: null, error: { message: "server rejected" } });
    mockMe("user");
    setup(queryClient);

    await user.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
    expect(screen.getByText("OVERVIEW-CONTENT")).toBeInTheDocument();
    expect(screen.queryByText("LOGIN-CONTENT")).toBeNull();
    expect(queryClient.getQueryData(["dogs"])).toBeUndefined();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Couldn't complete sign out. Your local data was cleared.",
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /sign out/i })).not.toBeDisabled();
  });

  it("clears owner caches, stays in place, and shows a localized error when sign-out throws", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    queryClient.setQueryData(["dogs"], [{ id: "dog-1" }]);
    mocks.signOut.mockRejectedValue(new Error("network down"));
    mockMe("user");
    setup(queryClient);

    await user.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
    expect(screen.getByText("OVERVIEW-CONTENT")).toBeInTheDocument();
    expect(screen.queryByText("LOGIN-CONTENT")).toBeNull();
    expect(queryClient.getQueryData(["dogs"])).toBeUndefined();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Couldn't complete sign out. Your local data was cleared.",
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /sign out/i })).not.toBeDisabled();
  });
});
