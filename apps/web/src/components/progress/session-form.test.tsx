import { LocaleProvider } from "@/i18n";
import * as progressLib from "@/lib/progress";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PracticeEvidenceInput } from "@turingcare/shared";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import { SessionForm } from "./session-form";

vi.mock("@/lib/progress", () => ({ useLogSession: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function setup(
  dimensions: Parameters<typeof SessionForm>[0]["dimensions"],
  currentLevel = 3,
  initialEvidence?: Pick<
    PracticeEvidenceInput,
    "cueSupport" | "environment" | "distance" | "durationBand" | "distraction"
  >,
) {
  const mutateAsync = vi.fn().mockResolvedValue({});
  vi.mocked(progressLib.useLogSession).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof progressLib.useLogSession>);
  const rendered = render(
    <LocaleProvider>
      <SessionForm
        dogId="d1"
        skillId="s1"
        dimensions={dimensions}
        currentLevel={currentLevel}
        initialEvidence={initialEvidence}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
      />
    </LocaleProvider>,
  );
  return { mutateAsync, rendered };
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

  it("requires safety attestation before submitting outcome and safety evidence", async () => {
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
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "I confirm this safety event happened and understand training suggestions may pause.",
      ),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I confirm this safety event happened and understand training suggestions may pause.",
      }),
    );
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

  it("updates visible fields when a recommendation changes while the form is mounted", async () => {
    const { rendered } = setup(["distraction"], 3);
    expect(screen.getByLabelText("What else was going on?")).toHaveValue("");

    rendered.rerender(
      <LocaleProvider>
        <SessionForm
          dogId="d1"
          skillId="s1"
          dimensions={["distraction"]}
          currentLevel={3}
          initialEvidence={{ distraction: "mild" }}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
        />
      </LocaleProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("What else was going on?")).toHaveValue("mild"),
    );
  });

  it("prefills only rendered recommended context without implying current-level confirmation", async () => {
    const { mutateAsync } = setup(["distraction"], 3, {
      distraction: "mild",
      environment: "busy_outdoor",
    });

    expect(screen.getByLabelText("What else was going on?")).toHaveValue("mild");
    expect(
      screen.getByRole("checkbox", {
        name: "I practiced this at the current Level 3.",
      }),
    ).not.toBeChecked();

    submitSession();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0]?.[0]?.body.confirmCurrentLevel).toBeUndefined();
    expect(mutateAsync.mock.calls[0]?.[0]?.body.outcome).toBeUndefined();
    expect(mutateAsync.mock.calls[0]?.[0]?.body.safetySignal).toBeUndefined();
    expect(mutateAsync.mock.calls[0]?.[0]?.body.environment).toBeUndefined();
  });

  it("keeps initial context hidden when no dimensions are requested", () => {
    setup([], 3, { distraction: "mild" });

    expect(screen.queryByLabelText("What else was going on?")).not.toBeInTheDocument();
  });
});
