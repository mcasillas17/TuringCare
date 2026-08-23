import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

function setup(locale: "en" | "es" = "en") {
  localStorage.setItem("tc-locale", locale);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/my"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/my" element={<div>OVERVIEW-CONTENT</div>} />
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
  it("places the language chip after Sign out (literal top-right corner)", () => {
    mockMe("user");
    setup();
    const signOut = screen.getByRole("button", { name: /sign out/i });
    const chip = screen.getByRole("button", { name: "Language" });
    // The chip must come AFTER the Sign out button in document order.
    expect(signOut.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("localizes the mobile drawer close label", async () => {
    const user = userEvent.setup();
    mockMe("user");
    setup("es");
    await user.click(screen.getByRole("button", { name: "Menú" }));
    expect(screen.getByRole("button", { name: "Cerrar menú" })).toBeInTheDocument();
  });
});
