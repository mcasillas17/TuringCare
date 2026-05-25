import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuickMomentComposer } from "./quick-moment-composer";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <QuickMomentComposer
          dogs={[{ id: "d1", name: "Biscuit" }]}
          selectedDogId="d1"
          onDogChange={() => {}}
          onSaved={() => {}}
        />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("QuickMomentComposer intensity", () => {
  it("hides the slider by default and shows an Add intensity affordance", () => {
    setup();
    expect(screen.getByRole("button", { name: /Add intensity/i })).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("reveals a 1–5 snapping slider (default 3) when Add intensity is clicked", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Add intensity/i }));
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider).toBeInTheDocument();
    expect(slider.min).toBe("1");
    expect(slider.max).toBe("5");
    expect(slider.step).toBe("1");
    expect(slider.value).toBe("3");
  });

  it("clears back to no intensity", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Add intensity/i }));
    fireEvent.click(screen.getByRole("button", { name: /Clear intensity/i }));
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add intensity/i })).toBeInTheDocument();
  });
});
