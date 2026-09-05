import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sessionState } = vi.hoisted(() => ({
  sessionState: { userId: "u1" as unknown, emailVerified: true, isRefetching: false },
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: {
      user: {
        id: sessionState.userId,
        name: "Miguel",
        email: "m@example.com",
        emailVerified: sessionState.emailVerified,
      },
    },
    isPending: false,
    isRefetching: sessionState.isRefetching,
  }),
  signOut: vi.fn(),
}));

import { SiteNav } from "./site-nav";

beforeEach(() => {
  sessionState.userId = "u1";
  sessionState.emailVerified = true;
  sessionState.isRefetching = false;
});

afterEach(() => {
  localStorage.clear();
});

describe("SiteNav (logged in)", () => {
  it("does not replace verified navigation with anonymous links during a background refresh", () => {
    sessionState.isRefetching = true;
    render(
      <LocaleProvider>
        <MemoryRouter>
          <SiteNav />
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(screen.getByRole("link", { name: "Open app" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
  });
  it("offers verification, not owner navigation, for a legacy unverified session", () => {
    sessionState.emailVerified = false;
    render(
      <LocaleProvider>
        <MemoryRouter>
          <SiteNav />
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(screen.getByRole("link", { name: "Verify your email" })).toHaveAttribute(
      "href",
      "/verify-email?next=%2F&lang=en",
    );
    expect(screen.queryByRole("link", { name: /open app/i })).not.toBeInTheDocument();
  });
  it("renders 'Open app' and hides Log in / Get started when a session exists", () => {
    render(
      <LocaleProvider>
        <MemoryRouter>
          <SiteNav />
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(screen.getByRole("link", { name: /open app/i })).toHaveAttribute("href", "/my");
    expect(screen.queryByRole("link", { name: /log in/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /get started/i })).toBeNull();
  });

  it.each(["", "   ", 42])(
    "renders signed-out actions for the runtime-invalid session user id %j",
    (userId) => {
      sessionState.userId = userId;

      render(
        <LocaleProvider>
          <MemoryRouter>
            <SiteNav />
          </MemoryRouter>
        </LocaleProvider>,
      );

      expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
      expect(screen.getByRole("link", { name: /get started/i })).toHaveAttribute(
        "href",
        "/register",
      );
      expect(screen.queryByRole("link", { name: /open app/i })).not.toBeInTheDocument();
    },
  );

  it("renders Trainers and Courses directory links", () => {
    render(
      <LocaleProvider>
        <MemoryRouter>
          <SiteNav />
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(screen.getByRole("link", { name: /trainers/i })).toHaveAttribute("href", "/trainers");
    expect(screen.getByRole("link", { name: /courses/i })).toHaveAttribute("href", "/courses");
  });

  it("places the language chip after the primary action (literal corner)", () => {
    render(
      <LocaleProvider>
        <MemoryRouter>
          <SiteNav />
        </MemoryRouter>
      </LocaleProvider>,
    );
    const openApp = screen.getByRole("link", { name: /open app/i });
    const chip = screen.getByRole("button", { name: "Language" });
    expect(openApp.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("localizes the public navigation landmark label", () => {
    localStorage.setItem("tc-locale", "es");
    render(
      <LocaleProvider>
        <MemoryRouter>
          <SiteNav />
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
  });
});
