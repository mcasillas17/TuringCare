import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({ useSession: vi.fn() }));
vi.mock("@/components/app-shell/AppShell", () => ({
  AppShell: () => <div data-testid="app-shell" />,
}));
vi.mock("@/components/PublicLayout", () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="public-layout">{children}</div>
  ),
}));

import { useSession } from "@/lib/auth-client";
import { DirectoryLayout } from "./DirectoryLayout";

const mockUseSession = vi.mocked(useSession);

function setup() {
  return render(
    <MemoryRouter initialEntries={["/trainers"]}>
      <Routes>
        <Route element={<DirectoryLayout />}>
          <Route path="/trainers" element={<div data-testid="page">page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("DirectoryLayout", () => {
  it("renders the app shell when signed in", () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, isPending: false } as never);
    setup();
    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("public-layout")).not.toBeInTheDocument();
  });

  it("renders the public layout (with the page) when anonymous", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false } as never);
    setup();
    expect(screen.getByTestId("public-layout")).toBeInTheDocument();
    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
  });

  it("renders neither while the session is pending", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true } as never);
    setup();
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
    expect(screen.queryByTestId("public-layout")).not.toBeInTheDocument();
  });
});
