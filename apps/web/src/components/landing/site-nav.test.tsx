import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "Miguel", email: "m@example.com" } },
    isPending: false,
  }),
  signOut: vi.fn(),
}));

import { SiteNav } from "./site-nav";

describe("SiteNav (logged in)", () => {
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

  it("places the language chip after the primary action (literal corner)", () => {
    render(
      <LocaleProvider>
        <MemoryRouter>
          <SiteNav />
        </MemoryRouter>
      </LocaleProvider>,
    );
    const openApp = screen.getByRole("link", { name: /open app/i });
    const chip = screen.getByRole("button", { name: /switch to/i });
    expect(openApp.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
