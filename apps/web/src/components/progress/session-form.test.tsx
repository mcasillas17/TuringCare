import { LocaleProvider } from "@/i18n";
import * as progressLib from "@/lib/progress";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionForm } from "./session-form";

vi.mock("@/lib/progress", () => ({ useLogSession: vi.fn() }));

function setup(dimensions: Parameters<typeof SessionForm>[0]["dimensions"], currentLevel = 3) {
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
        currentLevel={currentLevel}
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
    expect(body.confirmCurrentLevel).toBeUndefined();
    expect(body.practicedTarget).toBeUndefined();
    expect(new Date(String(body.occurredAt)).toISOString()).toBe(body.occurredAt);
  });

  it("only renders the dimensions the suggestion asked about", () => {
    setup(["distraction"]);
    expect(screen.getByText("What else was going on?")).toBeInTheDocument();
    expect(screen.queryByText("How much help did you give?")).not.toBeInTheDocument();
  });

  it("submits the chosen outcome, context and safety signal without safety attestation", async () => {
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
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const body = mutateAsync.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(body.outcome).toBe("too_hard");
    expect(body.distraction).toBe("strong");
    expect(body.safetySignal).toBe("injury_or_pain");
    expect(body.confirmCurrentLevel).toBeUndefined();
  });

  it("submits current-level confirmation only when checked", async () => {
    const { mutateAsync } = setup(["distraction"], 3);
    fireEvent.change(screen.getByLabelText("How did it go?"), {
      target: { value: "went_well" },
    });
    fireEvent.change(screen.getByLabelText("What else was going on?"), {
      target: { value: "mild" },
    });

    const confirmation = screen.getByRole("checkbox", {
      name: "I practiced this at the current Level 3.",
    });
    expect(confirmation).not.toBeChecked();
    submitSession();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0]?.[0]?.body.confirmCurrentLevel).toBeUndefined();

    mutateAsync.mockClear();
    fireEvent.click(confirmation);
    submitSession();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const body = mutateAsync.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(body.confirmCurrentLevel).toBe(true);
    expect(body.currentLevel).toBeUndefined();
    expect(body.curriculumVersion).toBeUndefined();
  });

  it("omits a stale confirmation after all structured evidence is cleared", async () => {
    const { mutateAsync } = setup(["distraction"]);
    fireEvent.change(screen.getByLabelText("What else was going on?"), {
      target: { value: "mild" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I practiced this at the current Level 3.",
      }),
    );
    fireEvent.change(screen.getByLabelText("What else was going on?"), {
      target: { value: "" },
    });

    submitSession();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const body = mutateAsync.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(body.distraction).toBeUndefined();
    expect(body.confirmCurrentLevel).toBeUndefined();
  });

  it("associates confirmation help with an accessible checkbox name", () => {
    setup(["distraction"]);
    fireEvent.change(screen.getByLabelText("What else was going on?"), {
      target: { value: "mild" },
    });

    const confirmation = screen.getByRole("checkbox", {
      name: "I practiced this at the current Level 3.",
    });
    const help = screen.getByText(
      "This lets TuringCare compare this practice with other work at the same level.",
    );
    expect(confirmation).not.toHaveAttribute("aria-label");
    expect(confirmation).toHaveAttribute("aria-describedby", help.id);
    expect(help.closest("label")).toBeNull();
  });
});
