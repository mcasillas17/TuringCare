import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AdminShell } from "./AdminShell";

afterEach(() => {
  localStorage.clear();
});

function setup(path: string, locale: "en" | "es" = "en") {
  localStorage.setItem("tc-locale", locale);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LocaleProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AdminShell />}>
              <Route path="/admin" element={<div>DASH-CONTENT</div>} />
              <Route path="/admin/trainers" element={<div>TRAINERS-CONTENT</div>} />
              <Route path="/admin/other" element={<div>OTHER-CONTENT</div>} />
              <Route path="/admin/courses" element={<div>COURSES-CONTENT</div>} />
            </Route>
            <Route path="/my" element={<div>APP-HOME</div>} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
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

  it("shows the matched section as the header title, falling back to Admin", () => {
    const title = () => screen.getByRole("banner").querySelector("span.font-semibold");
    const { unmount } = setup("/admin/trainers");
    expect(title()).toHaveTextContent(/^Trainers$/);
    unmount();
    setup("/admin/other");
    expect(title()).toHaveTextContent(/^Admin$/);
  });

  it("renders the admin shell system copy in Spanish", () => {
    setup("/admin/courses", "es");
    expect(screen.getAllByText("Administración").length).toBeGreaterThan(0);
    expect(screen.getByRole("navigation", { name: "Menú de administración" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Panel" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "Adiestradores" })).toHaveAttribute(
      "href",
      "/admin/trainers",
    );
    expect(screen.getByRole("link", { name: "Cursos" })).toHaveAttribute("href", "/admin/courses");
    expect(screen.getByRole("link", { name: /volver a la app/i })).toHaveAttribute("href", "/my");
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });

  it("persists rail collapse under tc-admin-nav-expanded and restores it on remount", async () => {
    const user = userEvent.setup();
    const { unmount } = setup("/admin");
    await user.click(screen.getByRole("button", { name: "Collapse menu" }));
    expect(localStorage.getItem("tc-admin-nav-expanded")).toBe("false");
    unmount();
    setup("/admin");
    expect(screen.getByRole("button", { name: "Expand menu" })).toBeInTheDocument();
  });

  it("exposes the language control by accessible label and switches it entirely by keyboard", async () => {
    setup("/admin", "es");
    const user = userEvent.setup();
    const toggle = screen.getByRole("button", { name: "Cambiar a English" });

    toggle.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("button", { name: "Switch to Español" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/admin");
  });
});
