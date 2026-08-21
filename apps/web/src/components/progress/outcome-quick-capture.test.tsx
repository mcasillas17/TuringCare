import { LocaleProvider } from "@/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OutcomeQuickCapture } from "./outcome-quick-capture";

function setup({
  saving = false,
  hasFallback = true,
  currentLevel = 3,
  usesAuditedSuggestion = true,
}: {
  saving?: boolean;
  hasFallback?: boolean;
  currentLevel?: number;
  usesAuditedSuggestion?: boolean;
} = {}) {
  const onSave = vi.fn();
  const onSkip = vi.fn();
  render(
    <LocaleProvider>
      <OutcomeQuickCapture
        dimensions={["distraction"]}
        hasFallback={hasFallback}
        currentLevel={currentLevel}
        usesAuditedSuggestion={usesAuditedSuggestion}
        onSave={onSave}
        onSkip={onSkip}
        saving={saving}
      />
    </LocaleProvider>,
  );
  return { onSave, onSkip };
}

describe("OutcomeQuickCapture", () => {
  it("submits selected outcome, context, and fallback variant", () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Too hard" }));
    fireEvent.click(screen.getByRole("radio", { name: "Easier fallback" }));
    fireEvent.change(screen.getByLabelText("What else was going on?"), {
      target: { value: "strong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    expect(onSave).toHaveBeenCalledWith({
      outcome: "too_hard",
      distraction: "strong",
      safetySignal: undefined,
      variant: "fallback",
    });
  });

  it("saves a safety-only report without requiring an attestation", () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText("Did anything unsafe happen?"), {
      target: { value: "injury_or_pain" },
    });
    expect(screen.getByRole("button", { name: "Save response" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    expect(onSave).toHaveBeenCalledWith({
      outcome: undefined,
      safetySignal: "injury_or_pain",
      variant: "primary",
    });
  });

  it("saves structured evidence with safety when current-level confirmation is unchecked", () => {
    const { onSave } = setup({ hasFallback: false, usesAuditedSuggestion: false });
    fireEvent.click(screen.getByRole("button", { name: "Went well" }));
    fireEvent.change(screen.getByLabelText("Did anything unsafe happen?"), {
      target: { value: "injury_or_pain" },
    });

    const confirmation = screen.getByRole("checkbox", {
      name: "I practiced this at the current Level 3.",
    });
    expect(confirmation).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save response" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    expect(onSave).toHaveBeenCalledWith({
      outcome: "went_well",
      distraction: undefined,
      safetySignal: "injury_or_pain",
      variant: "primary",
    });
  });

  it("disables saving while evidence is being persisted", () => {
    setup({ saving: true });
    fireEvent.click(screen.getByRole("button", { name: "Too hard" }));
    expect(screen.getByRole("button", { name: "Save response" })).toBeDisabled();
  });

  it("submits current-level confirmation when checked for manual structured evidence", () => {
    const { onSave } = setup({ hasFallback: false, usesAuditedSuggestion: false });
    fireEvent.click(screen.getByRole("button", { name: "Went well" }));
    fireEvent.change(screen.getByLabelText("What else was going on?"), {
      target: { value: "mild" },
    });

    const confirmation = screen.getByRole("checkbox", {
      name: "I practiced this at the current Level 3.",
    });
    expect(confirmation).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save response" })).toBeEnabled();

    fireEvent.click(confirmation);
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    expect(onSave).toHaveBeenCalledWith({
      outcome: "went_well",
      distraction: "mild",
      safetySignal: undefined,
      confirmCurrentLevel: true,
      variant: "primary",
    });
  });

  it("associates confirmation help with an accessible checkbox name", () => {
    setup({ hasFallback: false, usesAuditedSuggestion: false });
    fireEvent.click(screen.getByRole("button", { name: "Went well" }));

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

  it("omits a stale confirmation after structured evidence is cleared", () => {
    const { onSave } = setup({ hasFallback: false, usesAuditedSuggestion: false });
    fireEvent.change(screen.getByLabelText("What else was going on?"), {
      target: { value: "mild" },
    });
    const confirmation = screen.getByRole("checkbox", {
      name: "I practiced this at the current Level 3.",
    });
    fireEvent.click(confirmation);
    fireEvent.change(screen.getByLabelText("What else was going on?"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Did anything unsafe happen?"), {
      target: { value: "injury_or_pain" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    expect(onSave).toHaveBeenCalledWith({
      outcome: undefined,
      distraction: undefined,
      safetySignal: "injury_or_pain",
      variant: "primary",
    });
  });

  it("does not render manual confirmation for audited suggestion evidence", () => {
    setup({ usesAuditedSuggestion: true });
    expect(
      screen.queryByRole("checkbox", {
        name: "I practiced this at the current Level 3.",
      }),
    ).not.toBeInTheDocument();
  });

  it("resets manual confirmation when the quick capture is cancelled", () => {
    const { onSkip } = setup({ hasFallback: false, usesAuditedSuggestion: false });
    fireEvent.click(screen.getByRole("button", { name: "Went well" }));
    const confirmation = screen.getByRole("checkbox", {
      name: "I practiced this at the current Level 3.",
    });
    fireEvent.click(confirmation);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(onSkip).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Went well" }));
    expect(
      screen.getByRole("checkbox", {
        name: "I practiced this at the current Level 3.",
      }),
    ).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save response" })).toBeEnabled();
  });
});
