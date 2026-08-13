import { LocaleProvider } from "@/i18n";
import * as progressLib from "@/lib/progress";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionForm } from "./session-form";

vi.mock("@/lib/progress", () => ({ useLogSession: vi.fn() }));

describe("SessionForm", () => {
  it("submits an ISO instant and numeric timezone offset", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(progressLib.useLogSession).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof progressLib.useLogSession>);
    render(
      <LocaleProvider>
        <SessionForm dogId="dog-1" skillId="skill-1" onCancel={vi.fn()} />
      </LocaleProvider>,
    );

    const occurredAt = document.querySelector<HTMLInputElement>('input[type="datetime-local"]');
    if (!occurredAt) throw new Error("missing datetime-local input");
    fireEvent.change(occurredAt, { target: { value: "2026-08-12T10:30" } });
    fireEvent.submit(occurredAt.closest("form") as HTMLFormElement);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
    const args = mutateAsync.mock.calls[0]?.[0] as { body: Record<string, unknown> };
    expect(args.body.occurredAt).toEqual(expect.any(String));
    expect(new Date(args.body.occurredAt as string).toISOString()).toBe(args.body.occurredAt);
    expect(args.body.timezoneOffsetMinutes).toEqual(expect.any(Number));
  });
});
