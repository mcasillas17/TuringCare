import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AdminShell } from "./AdminShell";

function setup(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AdminShell />}>
            <Route path="/admin" element={<div>DASH-CONTENT</div>} />
            <Route path="/admin/trainers" element={<div>TRAINERS-CONTENT</div>} />
            <Route path="/admin/courses" element={<div>COURSES-CONTENT</div>} />
          </Route>
          <Route path="/my" element={<div>APP-HOME</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminShell", () => {
  it("renders the admin badge, nav, back-to-app, sign out, and the routed outlet", () => {
    setup("/admin");
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("DASH-CONTENT")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /trainers/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /courses/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to app/i })).toHaveAttribute("href", "/my");
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("puts Back to app in the header, not inside the sidebar nav", () => {
    setup("/admin");
    const back = screen.getByRole("link", { name: /back to app/i });
    expect(back).toHaveAttribute("href", "/my");
    const nav = screen.getByRole("navigation", { name: /admin menu/i });
    expect(nav).not.toContainElement(back);
  });

  it("marks the active section with aria-current", () => {
    setup("/admin/trainers");
    expect(screen.getByRole("link", { name: /trainers/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /dashboard/i })).not.toHaveAttribute("aria-current");
  });
});
