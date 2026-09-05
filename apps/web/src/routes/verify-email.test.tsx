import { LocaleProvider } from "@/i18n";
import { LocaleAccountBoundary } from "@/i18n/locale-account-bridge";
import { SessionQueryBoundary } from "@/lib/session-query-boundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Login } from "./login";
import { RequireAuth } from "./require-auth";
import { VerifyEmail } from "./verify-email";

const { session, refetch, signOut } = vi.hoisted(() => ({
  session: {
    user: null as null | { id: string; emailVerified: boolean },
    error: null as Error | null,
  },
  refetch: vi.fn(),
  signOut: vi.fn(),
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
let receipt: { status: string; next: string; locale: "en" | "es"; requiresSignOut?: true };
let receiptStatus: number;
let confirmation: { status: number; body: object };
let receiptReply: Promise<Response> | undefined;
let resendThrows: boolean;
let requests: Array<{ path: string; body: unknown; method: string }>;
beforeEach(() => {
  session.user = null;
  session.error = null;
  refetch.mockResolvedValue(undefined);
  signOut.mockResolvedValue({ error: null });
  response = { status: 200, body: { status: "accepted", retryAfter: 60 } };
  receipt = { status: "none", next: "/my/dogs", locale: "en" };
  receiptStatus = 200;
  confirmation = { status: 200, body: { status: "verified", next: "/my/dogs", locale: "en" } };
  receiptReply = undefined;
  resendThrows = false;
  requests = [];
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input instanceof Request ? input.url : String(input), "http://localhost")
        .pathname;
      requests.push({
        path,
        body: init?.body ? JSON.parse(String(init.body)) : null,
        method: init?.method ?? "GET",
      });
      if (path === "/api/verification/status")
        return receiptReply ?? Response.json(receipt, { status: receiptStatus });
      if (path === "/api/verification/confirm")
        return Response.json(confirmation.body, { status: confirmation.status });
      if (path === "/api/verification/resend" && resendThrows)
        throw new Error("network unreachable");
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function setup(path = "/verify-email?next=%2Fmy%2Fdogs&lang=en") {
  window.history.replaceState({}, "", path);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <SessionQueryBoundary>
          <LocaleAccountBoundary>
            <BrowserRouter>
              <Routes>
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/login" element={<Login />} />
                <Route
                  path="/my/dogs"
                  element={
                    <RequireAuth>
                      <div>Owner content</div>
                    </RequireAuth>
                  }
                />
              </Routes>
            </BrowserRouter>
          </LocaleAccountBoundary>
        </SessionQueryBoundary>
      </LocaleProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  await waitFor(() =>
    expect(requests.some((r) => r.path === "/api/verification/status")).toBe(true),
  );
  if (!receiptReply) {
    await waitFor(() => {
      expect(queryClient.getQueryState(["verification-status"])?.fetchStatus).toBe("idle");
      expect(
        screen.queryByText(/^(Checking verification link|Comprobando enlace de verificación)/),
      ).not.toBeInTheDocument();
    });
  }
  return { ...view, tree };
}

async function resend() {
  await userEvent.type(screen.getByLabelText(/^email$/i), "synthetic@example.test");
  await userEvent.type(screen.getByLabelText(/^password$/i), "synthetic-password");
  await userEvent.click(screen.getByRole("button", { name: "Request a new link" }));
}

it("is a public no-session recovery route with password explanation and no profile request", async () => {
  await setup();
  expect(await screen.findByRole("heading", { name: "Verify your email" })).toHaveFocus();
  expect(screen.getByRole("heading", { name: "Verify your email" })).toHaveClass("outline-none");
  expect(screen.getByText(/password is only used to request a new link/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
  expect(requests.some((r) => r.path === "/api/profile")).toBe(false);
});

it("does not show resend credentials before the first receipt lookup resolves", async () => {
  let finish: (response: Response) => void = () => {};
  receiptReply = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await setup();
  try {
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request a new link" })).not.toBeInTheDocument();
  } finally {
    await act(async () => {
      finish(Response.json({ status: "pending", next: "/my/dogs", locale: "en" }));
    });
  }
  expect(await screen.findByRole("button", { name: "Verify email" })).toBeInTheDocument();
});

it("allows credential recovery without a session when the unrelated session endpoint fails", async () => {
  session.error = new Error("session endpoint unavailable");
  await setup();
  await resend();
  expect(await screen.findByText(/Request accepted/)).toBeInTheDocument();
});

it("uses the advertised confirmation cooldown and localized rate-limit feedback", async () => {
  receipt.status = "pending";
  confirmation = { status: 429, body: { error: "rate_limited", retryAfter: 17 } };
  await setup();
  await userEvent.click(await screen.findByRole("button", { name: "Verify email" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
  expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
  expect(screen.getByText(/17/)).toBeInTheDocument();
});

it.each([
  [503, "trusted_ip_required", "verification service is temporarily unavailable"],
  [403, "forbidden", "Reload the page and try again"],
])(
  "keeps confirmation %s/%s distinct from a link or provider failure",
  async (status, error, text) => {
    receipt.status = "pending";
    confirmation = { status: Number(status), body: { error } };
    await setup();
    await userEvent.click(screen.getByRole("button", { name: "Verify email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(String(text));
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.queryByText(/Time until another request/)).not.toBeInTheDocument();
  },
);

it("does not add a cooldown or claim provider failure during a trusted-proxy outage", async () => {
  response = { status: 503, body: { error: "trusted_ip_required" } };
  await setup();
  await resend();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "verification service is temporarily unavailable",
  );
  expect(screen.getByRole("button", { name: "Request a new link" })).toBeEnabled();
  expect(screen.queryByText(/Time until another request/)).not.toBeInTheDocument();
});

it("resends through the typed credential endpoint, clears the password, and promises acceptance not delivery", async () => {
  await setup();
  await resend();
  expect(await screen.findByText(/Request accepted/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Request a new link" })).toBeDisabled();
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
  if (status === 429 || status === 503)
    expect(screen.getByRole("button", { name: "Request a new link" })).toBeDisabled();
  const alert = screen.getByRole("alert");
  const signIn = screen.getByRole("link", { name: "Back to log in" });
  expect(alert.compareDocumentPosition(signIn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

it("only a verified server receipt offers no-session success and sign-in continuation", async () => {
  receipt = { status: "verified", next: "/admin", locale: "en" };
  await setup("/verify-email?status=verified&next=%2Fadmin&lang=en");
  expect(await screen.findByRole("heading", { name: "Email verified" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sign in to continue" })).toHaveAttribute(
    "href",
    "/login?next=%2Fadmin&lang=en",
  );
  expect(screen.queryByRole("link", { name: "Continue to the app" })).not.toBeInTheDocument();
  expect(requests.some((r) => r.path === "/api/profile")).toBe(false);
  const statusCall = vi
    .mocked(fetch)
    .mock.calls.find(([input]) => String(input).endsWith("/api/verification/status"));
  expect(statusCall?.[1]).toEqual(
    expect.objectContaining({ credentials: "include", cache: "no-store" }),
  );
});

it("never treats a spoofed status query as no-session proof", async () => {
  await setup("/verify-email?status=verified");
  expect(screen.getByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Email verified" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Sign in to continue" })).not.toBeInTheDocument();
});

it.each([false, true])(
  "keeps different-account resend recovery reachable with an older verified receipt (legacy session: %s)",
  async (legacy) => {
    receipt = { status: "verified", next: "/my/dogs", locale: "en" };
    if (legacy) session.user = { id: "u1", emailVerified: false };
    await setup("/verify-email?next=%2Fmy%2Fprofile");
    await userEvent.click(
      await screen.findByRole("button", { name: "Request a different verification link" }),
    );
    expect(screen.getByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    if (legacy) {
      expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Request a new link" }));
    } else {
      await resend();
    }
    expect(requests.find((r) => r.path === "/api/verification/resend")?.body).toEqual(
      legacy
        ? { returnTo: "/my/profile" }
        : {
            email: "synthetic@example.test",
            password: "synthetic-password",
            returnTo: "/my/profile",
          },
    );
  },
);

it.each([
  ["en", "Verify email", "Email verified"],
  ["es", "Verificar correo", "Correo verificado"],
] as const)(
  "requires an explicit %s confirmation and sends only an empty JSON body",
  async (locale, label, successTitle) => {
    receipt = { status: "pending", next: "/my/profile", locale };
    confirmation.body = { status: "verified", next: "/my/profile", locale };
    await setup(`/verify-email?next=%2Fmy%2Fprofile&lang=${locale}`);
    expect(requests.some((r) => r.path === "/api/verification/confirm")).toBe(false);
    const button = await screen.findByRole("button", { name: label });
    await userEvent.click(button);
    expect(await screen.findByRole("heading", { name: successTitle })).toBeInTheDocument();
    expect(requests.filter((r) => r.path === "/api/verification/confirm")).toEqual([
      { path: "/api/verification/confirm", body: {}, method: "POST" },
    ]);
    const confirmCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).endsWith("/api/verification/confirm"));
    expect(confirmCall?.[1]).toEqual(
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
    expect(window.location.search).not.toMatch(/email=|token=/);
  },
);

it.each(["invalid", "expired"])("renders recoverable server receipt state %s", async (status) => {
  receipt.status = status;
  await setup();
  expect(await screen.findByRole("alert")).toHaveTextContent("invalid or expired");
  expect(screen.getByRole("button", { name: "Request a new link" })).toBeInTheDocument();
});

it("shows a retryable status error, never invalid or success, when the receipt lookup fails", async () => {
  receiptStatus = 503;
  await setup("/verify-email?status=verified&error=TOKEN_EXPIRED");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "We couldn't check your verification link",
  );
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  expect(screen.queryByText(/invalid or expired/)).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Email verified" })).not.toBeInTheDocument();
});

it("shows a retryable confirmation failure without claiming success", async () => {
  receipt.status = "pending";
  confirmation = { status: 503, body: { error: "unavailable" } };
  await setup();
  await userEvent.click(await screen.findByRole("button", { name: "Verify email" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't confirm your email");
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Email verified" })).not.toBeInTheDocument();
});

it.each(["accepted", "provider failure"])(
  "announces %s cooldown start and completion, not every countdown second",
  async (outcome) => {
    response =
      outcome === "accepted"
        ? { status: 200, body: { status: "accepted", retryAfter: 2 } }
        : { status: 503, body: { error: "verification_send_failed", retryAfter: 2 } };
    await setup();
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    await resend();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Wait before trying again.");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(status).toHaveTextContent("Wait before trying again.");
    expect(screen.getByText("Time until another request: 1 s.")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(status).toHaveTextContent("You can try again now.");
    expect(screen.getByRole("button", { name: "Request a new link" })).toBeEnabled();
  },
);

it("explains duplicate signup and typo recovery without exposing account existence", async () => {
  await setup("/verify-email?next=%2Fmy%2Fprofile");
  expect(screen.getByText(/signing up again may not send another email/i)).toBeInTheDocument();
  expect(screen.getByText(/original password/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Register with the correct email" })).toHaveAttribute(
    "href",
    "/register?next=%2Fmy%2Fprofile&lang=en",
  );
});

it("expires cooldown on the next tick after a background-style wall-clock jump", async () => {
  response = { status: 200, body: { status: "accepted", retryAfter: 60 } };
  await setup();
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  await resend();
  expect(screen.getByRole("button", { name: "Request a new link" })).toBeDisabled();
  vi.setSystemTime(Date.now() + 61_000);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(screen.getByRole("button", { name: "Request a new link" })).toBeEnabled();
  expect(screen.getByRole("status")).toHaveTextContent("You can try again now.");
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
  resendThrows = true;
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
  view.rerender(view.tree());
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
      requests.push({ path, body: null, method: "GET" });
      if (path === "/api/verification/status") return Response.json(receipt);
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
  await screen.findByText(/Request accepted/);
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

it("preserves the language hint on app continuation when browser storage is unavailable", async () => {
  session.user = { id: "u1", emailVerified: true };
  const view = await setup();
  await screen.findByRole("link", { name: "Continue to the app" });
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Storage unavailable");
  });
  view.rerender(view.tree());
  expect(screen.getByRole("link", { name: "Continue to the app" })).toHaveAttribute(
    "href",
    "/my/dogs?lang=en",
  );
  vi.restoreAllMocks();
});
it("confirmation refreshes an existing same-account session without signing in or navigating", async () => {
  session.user = { id: "u1", emailVerified: false };
  receipt.status = "pending";
  refetch.mockImplementation(async () => {
    session.user = { id: "u1", emailVerified: true };
  });
  await setup();
  await userEvent.click(await screen.findByRole("button", { name: "Verify email" }));
  expect(await screen.findByRole("link", { name: "Continue to the app" })).toHaveAttribute(
    "href",
    "/my/dogs",
  );
  expect(refetch).toHaveBeenCalledTimes(1);
  expect(refetch).toHaveBeenCalledWith({ query: { disableCookieCache: true } });
  expect(window.location.pathname).toBe("/verify-email");
  expect(screen.queryByRole("link", { name: "Sign in to continue" })).not.toBeInTheDocument();
});

it("keeps manual refresh available for a stale legacy session after another tab confirmed", async () => {
  session.user = { id: "u1", emailVerified: false };
  receipt.status = "verified";
  await setup();
  await screen.findByRole("heading", { name: "Email verified" });
  expect(refetch).not.toHaveBeenCalled();
  expect(screen.queryByRole("link", { name: "Sign in to continue" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "I've verified — check again" }));
  expect(refetch).toHaveBeenCalledTimes(1);
  expect(refetch).toHaveBeenCalledWith({ query: { disableCookieCache: true } });
  expect(window.location.pathname).toBe("/verify-email");
});

it.each([
  ["verified", "en", "Sign out to use this link", "Sign out to sign in with that account"],
  [
    "verified",
    "es",
    "Cierra sesión para usar este enlace",
    "Cierra sesión para iniciar sesión con esa cuenta",
  ],
] as const)(
  "requires explicit sign-out for a different account's %s receipt in %s",
  async (status, locale, title, instruction) => {
    session.user = { id: "u1", emailVerified: false };
    receipt = { status, next: "/my/profile", locale, requiresSignOut: true };
    await setup(`/verify-email?next=%2Fmy%2Fprofile&lang=${locale}`);
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(instruction))).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: locale === "es" ? "Verificar correo" : "Verify email" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: locale === "es" ? "Iniciar sesión para continuar" : "Sign in to continue",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: locale === "es" ? "Continuar a la aplicación" : "Continue to the app",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: locale === "es" ? "Cerrar sesión" : "Sign out" }),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path === "/api/verification/confirm")).toBe(false);
  },
);

it("honors requiresSignOut returned by confirmation without refreshing or switching the other account", async () => {
  session.user = { id: "u1", emailVerified: false };
  receipt.status = "pending";
  confirmation.body = {
    status: "verified",
    next: "/my/profile",
    locale: "en",
    requiresSignOut: true,
  };
  await setup();
  await userEvent.click(await screen.findByRole("button", { name: "Verify email" }));
  expect(
    await screen.findByRole("heading", { name: "Sign out to use this link" }),
  ).toBeInTheDocument();
  expect(refetch).not.toHaveBeenCalled();
  expect(signOut).not.toHaveBeenCalled();
  expect(screen.queryByRole("link", { name: "Sign in to continue" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Continue to the app" })).not.toBeInTheDocument();
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
