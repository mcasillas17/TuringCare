import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Profile } from "./profile";

const { sessionState, useSessionMock } = vi.hoisted(() => ({
  sessionState: { isPending: false, userId: "u1" as unknown },
  useSessionMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: useSessionMock,
}));

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  sessionState.isPending = false;
  sessionState.userId = "u1";
  useSessionMock.mockReset();
});

function stubProfile(user: {
  id: string;
  name: string;
  email: string;
  locale: "en" | "es" | null;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const p = new URL(url, "http://x").pathname;
      const body = p.includes("/api/profile") ? { user } : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSessionMock.mockImplementation(() => ({
    data: sessionState.userId === null ? null : { user: { id: sessionState.userId } },
    isPending: sessionState.isPending,
  }));
  const view = render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter>
          <Profile />
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { qc, view };
}

describe("Profile", () => {
  it("prefills the name input and renders a read-only email", async () => {
    stubProfile({ id: "u1", name: "Miguel", email: "m@example.com", locale: null });
    setup();
    await waitFor(() => expect(screen.getByDisplayValue("Miguel")).toBeInTheDocument());
    const email = screen.getByDisplayValue("m@example.com") as HTMLInputElement;
    expect(email).toBeInTheDocument();
    expect(email.readOnly).toBe(true);
    expect(email.disabled).toBe(true);
  });

  it("uses a localized generic fallback for a non-allowlisted default Zod message", async () => {
    localStorage.setItem("tc-locale", "es");
    stubProfile({ id: "u1", name: "Miguel", email: "m@example.com", locale: null });
    setup();
    const name = await screen.findByDisplayValue("Miguel");

    fireEvent.change(name, { target: { value: "x".repeat(101) } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Revisa este campo.")).toBeInTheDocument();
    expect(screen.queryByText(/String must contain/i)).not.toBeInTheDocument();
  });

  it("rejects a profile response for a different authenticated user without caching or rendering it", async () => {
    sessionState.userId = "u1";
    stubProfile({ id: "u2", name: "Other User", email: "other@example.com", locale: "es" });
    const { qc } = setup();

    expect(await screen.findByText(/couldn't load your profile/i)).toBeInTheDocument();
    expect(screen.queryByText("Other User")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("other@example.com")).not.toBeInTheDocument();
    expect(qc.getQueryData(["profile", "u1"])).toBeUndefined();
    expect(qc.getQueryData(["profile"])).toBeUndefined();
  });

  it.each(["", "   ", 42])(
    "does not request profile data for the runtime-invalid session user id %j",
    async (userId) => {
      sessionState.userId = userId;
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      setup();

      expect(await screen.findByText(/couldn't load your profile/i)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
