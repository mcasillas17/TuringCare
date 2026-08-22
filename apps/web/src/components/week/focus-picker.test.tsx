import { LocaleProvider } from "@/i18n";
import type { FocusSkill } from "@/lib/weekly-focus";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  addMutate,
  removeMutate,
  toastError,
  toastSuccess,
  useAddFocus,
  useRemoveFocus,
  useProgress,
} = vi.hoisted(() => ({
  addMutate: vi.fn(),
  removeMutate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  useAddFocus: vi.fn(),
  useRemoveFocus: vi.fn(),
  useProgress: vi.fn(),
}));

vi.mock("@/lib/weekly-focus", () => ({
  useAddFocus,
  useRemoveFocus,
}));
vi.mock("@/lib/progress", () => ({ useProgress }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));

import { FocusPicker } from "./focus-picker";

const focusSkills: FocusSkill[] = [
  {
    skillId: "sit",
    name: "Sit",
    goalId: "goal-1",
    goalName: "Manners",
    position: 0,
    sessions: [],
    currentLevel: 1,
    dimensions: [],
    contextualProgress: {
      status: "ready",
      summary: { strongestContext: null, nextPracticeAction: null, safety: null },
    },
  },
];

function renderPicker({ pending = false } = {}) {
  const onClose = vi.fn();
  useProgress.mockReturnValue({
    data: [
      {
        id: "goal-1",
        goal: "Manners",
        skills: [
          { id: "sit", name: "Sit" },
          { id: "down", name: "Down" },
        ],
      },
    ],
  });
  useAddFocus.mockReturnValue({ mutate: addMutate, isPending: pending });
  useRemoveFocus.mockReturnValue({ mutate: removeMutate, isPending: pending });

  render(
    <LocaleProvider>
      <FocusPicker dogId="dog-1" weekKey="2026-08-10" focusSkills={focusSkills} onClose={onClose} />
    </LocaleProvider>,
  );
  return { onClose };
}

afterEach(() => vi.clearAllMocks());

describe("FocusPicker", () => {
  it("replaces the selected focus from the radio group", () => {
    renderPicker();

    expect(screen.getAllByRole("radiogroup", { name: "Focus skill" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("radio", { name: "Down" }));

    expect(addMutate).toHaveBeenCalledWith(
      "down",
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    const options = addMutate.mock.calls[0]?.[1];
    options?.onSuccess?.();
    expect(toastSuccess).toHaveBeenCalledWith("Focus updated.");
  });

  it("clears the selected focus", () => {
    renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Clear focus" }));

    expect(removeMutate).toHaveBeenCalledWith(
      "sit",
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("shows an error when replacing the focus fails", () => {
    renderPicker();

    fireEvent.click(screen.getByRole("radio", { name: "Down" }));

    const options = addMutate.mock.calls[0]?.[1];
    options?.onError?.();

    expect(toastError).toHaveBeenCalledWith("Couldn't update focus.");
  });

  it("shows an error when clearing the focus fails", () => {
    renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Clear focus" }));

    const options = removeMutate.mock.calls[0]?.[1];
    options?.onError?.();

    expect(toastError).toHaveBeenCalledWith("Couldn't update focus.");
  });

  it("disables the radio group controls while a mutation is pending", () => {
    renderPicker({ pending: true });

    expect(screen.getByRole("radio", { name: "Sit" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear focus" })).toBeDisabled();
  });

  it("does not resubmit the selected focus", () => {
    renderPicker();

    fireEvent.click(screen.getByRole("radio", { name: "Sit" }));

    expect(addMutate).not.toHaveBeenCalled();
    expect(removeMutate).not.toHaveBeenCalled();
  });
});
