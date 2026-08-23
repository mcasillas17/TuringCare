import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Profile } from "./profile";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
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
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter>
          <Profile />
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
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
});
