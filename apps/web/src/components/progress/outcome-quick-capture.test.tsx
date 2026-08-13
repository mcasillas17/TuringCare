import { LocaleProvider } from "@/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OutcomeQuickCapture } from "./outcome-quick-capture";

function setup() {
  const onSave = vi.fn();
  render(
    <LocaleProvider>
      <OutcomeQuickCapture
        dimensions={["distraction"]}
        hasFallback
        onSave={onSave}
        onSkip={vi.fn()}
      />
    </LocaleProvider>,
  );
  return { onSave };
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

  it("requires confirmation before saving a safety-only report", () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText("Did anything unsafe happen?"), {
      target: { value: "injury_or_pain" },
    });
    expect(screen.getByRole("button", { name: "Save response" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /confirm/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    expect(onSave).toHaveBeenCalledWith({
      outcome: undefined,
      safetySignal: "injury_or_pain",
      variant: "primary",
    });
  });
});
