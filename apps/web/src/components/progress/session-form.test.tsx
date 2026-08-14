import { LocaleProvider } from "@/i18n";
import * as progressLib from "@/lib/progress";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionForm } from "./session-form";

vi.mock("@/lib/progress", () => ({ useLogSession: vi.fn() }));

function setup(dimensions: Parameters<typeof SessionForm>[0]["dimensions"]) {
  const mutateAsync = vi.fn().mockResolvedValue({});
  vi.mocked(progressLib.useLogSession).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof progressLib.useLogSession>);
  render(
    <LocaleProvider>
      <SessionForm
        dogId="d1"
        skillId="s1"
        dimensions={dimensions}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
      />
    </LocaleProvider>,
  );
  return { mutateAsync };
}

function submitSession() {
  const form = screen.getByText("Save session").closest("form");
  if (!form) throw new Error("missing session form");
  fireEvent.submit(form);
}

describe("SessionForm evidence capture", () => {
  it("saves with no evidence answered at all", async () => {
    const { mutateAsync } = setup(["cue_support"]);
    submitSession();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const body = mutateAsync.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(screen.getByLabelText("When")).toHaveAttribute("max");
    expect(body.outcome).toBeUndefined();
    expect(body.cueSupport).toBeUndefined();
    expect(body.practicedTarget).toBeUndefined();
    expect(new Date(String(body.occurredAt)).toISOString()).toBe(body.occurredAt);
  });

  it("only renders the dimensions the suggestion asked about", () => {
    setup(["distraction"]);
    expect(screen.getByText("What else was going on?")).toBeInTheDocument();
    expect(screen.queryByText("How much help did you give?")).not.toBeInTheDocument();
  });

  it("submits the chosen outcome, context and safety signal", async () => {
    const { mutateAsync } = setup(["distraction"]);
    fireEvent.change(screen.getByLabelText("How did it go?"), {
      target: { value: "too_hard" },
    });
    fireEvent.change(screen.getByLabelText("What else was going on?"), {
      target: { value: "strong" },
    });
    fireEvent.change(screen.getByLabelText("Did anything unsafe happen?"), {
      target: { value: "injury_or_pain" },
    });
    submitSession();
    await waitFor(() => expect(screen.getByText("Save session")).toBeEnabled());
    expect(mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /confirm/i }));
    submitSession();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const body = mutateAsync.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(body.outcome).toBe("too_hard");
    expect(body.distraction).toBe("strong");
    expect(body.safetySignal).toBe("injury_or_pain");
  });
});
