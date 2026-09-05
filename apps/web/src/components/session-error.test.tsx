import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
const { refetch } = vi.hoisted(() => ({ refetch: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ useSession: () => ({ refetch }) }));
import { SessionError } from "./session-error";

it("retries an authoritative session check and keeps the retry button usable after a rejection", async () => {
  refetch.mockRejectedValue(new Error("offline"));
  render(<SessionError />);
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(refetch).toHaveBeenCalledWith({ query: { disableCookieCache: true } });
  expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
});
