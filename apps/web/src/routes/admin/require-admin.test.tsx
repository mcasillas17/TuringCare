import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RequireAdmin } from "./require-admin";

function mockMe(role: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      role === null
        ? new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
        : new Response(JSON.stringify({ user: { id: "u1", email: "a@b.c", role } }), {
            status: 200,
          }),
    ),
  );
}
afterEach(() => vi.unstubAllGlobals());

function setup() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
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
          <Route path="/app" element={<div>app home</div>} />
        </Routes>
      </MemoryRouter>
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
