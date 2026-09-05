import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { root, session, refetch, signOut } = vi.hoisted(() => ({
  root: { node: null as unknown },
  session: {
    user: null as null | { id: string; emailVerified: boolean },
    error: null as Error | null,
  },
  refetch: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("react-dom/client", () => ({
  createRoot: () => ({
    render: (node: unknown) => {
      root.node = node;
    },
  }),
}));
vi.mock("@/lib/track", () => ({ PageViewTracker: () => null, track: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: session.user ? { user: session.user } : null,
    isPending: false,
    error: session.error,
    refetch,
  }),
  signOut,
}));

let response: { status: number; body: object };
let requests: Array<{ path: string; body: unknown }>;
beforeEach(() => {
  session.user = null;
  session.error = null;
  refetch.mockResolvedValue(undefined);
  signOut.mockResolvedValue({ error: null });
  response = { status: 200, body: { status: "accepted" } };
  requests = [];
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input instanceof Request ? input.url : String(input), "http://localhost")
        .pathname;
      requests.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (path === "/api/verification/resend")
        return Response.json(response.body, { status: response.status });
      if (path === "/api/profile")
        return Response.json({
          user: { id: "u1", name: "Synthetic", email: "synthetic@example.test", locale: "en" },
        });
      return Response.json({ error: "not_found" }, { status: 404 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function setup(path = "/verify-email?next=%2Fmy%2Fdogs&lang=en") {
  window.history.replaceState({}, "", path);
  await import("../main");
  return render(root.node as ReactElement);
}

async function resend() {
  await userEvent.type(screen.getByLabelText(/^email$/i), "synthetic@example.test");
  await userEvent.type(screen.getByLabelText(/^password$/i), "synthetic-password");
  await userEvent.click(screen.getByRole("button", { name: "Request a new link" }));
}

it("is a public no-session recovery route with password explanation and no profile request", async () => {
  await setup();
  expect(await screen.findByRole("heading", { name: "Verify your email" })).toHaveFocus();
  expect(screen.getByText(/password is only used to request a new link/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
  expect(requests.some((r) => r.path === "/api/profile")).toBe(false);
});

it("resends through the typed credential endpoint, clears the password, and promises acceptance not delivery", async () => {
  await setup();
  await resend();
  expect(await screen.findByRole("status")).toHaveTextContent("Request accepted");
  expect(requests.find((r) => r.path === "/api/verification/resend")?.body).toEqual({
    email: "synthetic@example.test",
    password: "synthetic-password",
    returnTo: "/my/dogs",
  });
  expect(screen.getByLabelText(/^password$/i)).toHaveValue("");
  expect(window.location.href).not.toMatch(/synthetic|password/);
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toMatch(/synthetic|password/);
});

it.each([
  [401, "invalid_credentials", "The email and password could not be confirmed."],
  [
    401,
    "verification_credentials_required",
    "Enter your email and password to request a new link.",
  ],
  [503, "verification_send_failed", "We couldn't send a verification link. Please try again."],
  [429, "rate_limited", "Too many requests."],
])("shows actionable localized resend failure %s/%s", async (status, error, message) => {
  response = { status: Number(status), body: { error, retryAfter: 30 } };
  await setup();
  await resend();
  expect(await screen.findByRole("alert")).toHaveTextContent(String(message));
  expect(screen.queryByText(/Request accepted/)).not.toBeInTheDocument();
  if (status === 429)
    expect(screen.getByRole("button", { name: "Request a new link" })).toBeDisabled();
});

it("renders Spanish in a fresh browser from the exact callback language", async () => {
  await setup("/verify-email?lang=es");
  expect(await screen.findByRole("heading", { name: "Verifica tu correo" })).toBeInTheDocument();
  expect(
    screen.getByText(/contraseña solo se usa para solicitar un nuevo enlace/),
  ).toBeInTheDocument();
  expect(document.documentElement.lang).toBe("es");
});

it("presents actionable resend failures in Spanish", async () => {
  response = { status: 503, body: { error: "verification_send_failed" } };
  await setup("/verify-email?lang=es");
  await userEvent.type(screen.getByLabelText("Correo electrónico"), "synthetic@example.test");
  await userEvent.type(screen.getByLabelText("Contraseña"), "synthetic-password");
  await userEvent.click(screen.getByRole("button", { name: "Solicitar un nuevo enlace" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No pudimos enviar un enlace de verificación.",
  );
});

it("keeps manual verification refresh failures recoverable without unhandled promises", async () => {
  session.user = { id: "u1", emailVerified: false };
  refetch.mockRejectedValue(new Error("network"));
  await setup();
  await userEvent.click(screen.getByRole("button", { name: "I've verified — check again" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't check your session");
});

it("does not lose an explicitly selected local language on refresh of an older callback", async () => {
  localStorage.setItem("tc-locale", "es");
  await setup("/verify-email?lang=en");
  expect(await screen.findByRole("heading", { name: "Verifica tu correo" })).toBeInTheDocument();
  expect(localStorage.getItem("tc-locale")).toBe("es");
});

it.each(["TOKEN_EXPIRED", "INVALID_TOKEN", "invalid_token", ""])(
  "gives callback error %j precedence over a success status",
  async (error) => {
    await setup(`/verify-email?status=verified&error=${error}&lang=en`);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This verification link is invalid or expired.",
    );
    expect(screen.getByRole("button", { name: "Request a new link" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Email verified" })).not.toBeInTheDocument();
  },
);

it("callback success or reused success without a session offers only sign in, not owner access", async () => {
  await setup("/verify-email?status=verified&next=%2Fadmin&lang=en");
  expect(await screen.findByRole("heading", { name: "Email verified" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sign in to continue" })).toHaveAttribute(
    "href",
    "/login?next=%2Fadmin&lang=en",
  );
  expect(screen.queryByRole("link", { name: "Continue to the app" })).not.toBeInTheDocument();
  expect(requests.some((r) => r.path === "/api/profile")).toBe(false);
});

it("already_verified credential response offers sign-in continuation without silently signing in", async () => {
  response = { status: 200, body: { status: "already_verified" } };
  await setup();
  await resend();
  expect(await screen.findByRole("link", { name: "Sign in to continue" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Request a new link" })).not.toBeInTheDocument();
});

it("an already-verified account can sign in after opening an expired or reused link", async () => {
  response = { status: 200, body: { status: "already_verified" } };
  await setup("/verify-email?status=verified&error=TOKEN_EXPIRED");
  await resend();
  expect(await screen.findByRole("link", { name: "Sign in to continue" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("invalid or expired");
});

it("shows sign-out failure even after a verified callback", async () => {
  session.user = { id: "u1", emailVerified: true };
  signOut.mockResolvedValue({ error: { message: "upstream private data" } });
  await setup("/verify-email?status=verified");
  await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't complete sign out");
  expect(screen.queryByText(/upstream private data/)).not.toBeInTheDocument();
});

it("turns a network resend failure into retryable feedback without preserving the password", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unreachable")));
  await setup();
  await resend();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "We couldn't send a verification link.",
  );
  expect(screen.getByLabelText(/^password$/i)).toHaveValue("");
  expect(screen.getByRole("button", { name: "Request a new link" })).toBeEnabled();
});

it("fresh recovery after a session switch cannot retain anonymous form credentials", async () => {
  const view = await setup();
  await userEvent.type(screen.getByLabelText(/^password$/i), "synthetic-password");
  session.user = { id: "u1", emailVerified: false };
  view.rerender(root.node as ReactElement);
  // A real session atom update renders its subscribers, so remount a fresh root
  // to also exercise the new-tab contract with no transient state.
  view.unmount();
  session.user = null;
  await setup();
  expect(screen.getByLabelText(/^password$/i)).toHaveValue("");
});

it("an old verified tab rejected by profile recovers once, without profile retries or redirect loops", async () => {
  session.user = { id: "u1", emailVerified: true };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : String(input), "http://localhost")
        .pathname;
      requests.push({ path, body: null });
      return Response.json({ error: "email_unverified" }, { status: 403 });
    }),
  );
  await setup("/my/dogs");
  expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/verify-email");
  expect(new URLSearchParams(window.location.search).get("next")).toBe("/my/dogs");
  expect(requests.filter((r) => r.path === "/api/profile")).toHaveLength(1);
});

it("legacy unverified sessions can resend without submitting someone else's identity", async () => {
  session.user = { id: "u1", emailVerified: false };
  await setup();
  expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
  expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Request a new link" }));
  await screen.findByRole("status");
  expect(requests.find((r) => r.path === "/api/verification/resend")?.body).toEqual({
    returnTo: "/my/dogs",
  });
  expect(requests.some((r) => r.path === "/api/profile")).toBe(false);
});

it("a refreshed verified legacy session can explicitly continue to the safe destination", async () => {
  session.user = { id: "u1", emailVerified: true };
  await setup("/verify-email?status=verified&next=%2Fmy%2Fdogs&lang=en");
  expect(await screen.findByRole("link", { name: "Continue to the app" })).toHaveAttribute(
    "href",
    "/my/dogs",
  );
});

it("a spoofed callback status never grants an unverified legacy session app access", async () => {
  session.user = { id: "u1", emailVerified: false };
  await setup("/verify-email?status=verified");
  expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Continue to the app" })).not.toBeInTheDocument();
});

it("sign out from legacy recovery reaches login and clears recovery credentials", async () => {
  session.user = { id: "u1", emailVerified: false };
  signOut.mockImplementation(async () => {
    session.user = null;
    return { error: null };
  });
  await setup();
  await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(window.location.pathname).toBe("/login"));
  expect(signOut).toHaveBeenCalledOnce();
});
