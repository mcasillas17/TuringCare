import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ useSession }));
import { VerifyEmailBanner } from "./verify-email-banner";

afterEach(() => vi.clearAllMocks());
function Destination() {
  return <p>{useLocation().pathname + useLocation().search}</p>;
}
function setup() {
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={["/my/dogs"]}>
        <Routes>
          <Route path="/my/dogs" element={<VerifyEmailBanner />} />
          <Route path="/verify-email" element={<Destination />} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  );
}
it("replaces the dismissible banner with the same public verification recovery route", () => {
  useSession.mockReturnValue({
    data: { user: { id: "u1", emailVerified: false } },
    isPending: false,
  });
  setup();
  expect(screen.getByText("/verify-email?next=%2Fmy%2Fdogs&lang=en")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
});
it.each([null, { user: { id: "u1", emailVerified: true } }, { user: { id: "" } }])(
  "does not interrupt an anonymous or verified view",
  (data) => {
    useSession.mockReturnValue({ data, isPending: false });
    const { container } = setup();
    expect(container.firstChild).toBeNull();
  },
);
