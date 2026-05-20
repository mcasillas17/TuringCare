import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

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
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/app" element={<div>OVERVIEW-CONTENT</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
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
});
