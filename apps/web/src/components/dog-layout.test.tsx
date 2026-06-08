import { LocaleProvider } from "@/i18n";
import * as dogsLib from "@/lib/dogs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DogLayout } from "./dog-layout";

vi.mock("@/lib/dogs", () => ({
  useDog: vi.fn(),
  useDeleteDog: vi.fn(),
}));

function setDog(
  data: {
    dog: { id: string; name: string; breed: string | null; size: string; sex: string };
  } | null,
  opts: { isLoading?: boolean; isError?: boolean } = {},
) {
  vi.mocked(dogsLib.useDog).mockReturnValue({
    data,
    isLoading: opts.isLoading ?? false,
    isError: opts.isError ?? false,
  } as unknown as ReturnType<typeof dogsLib.useDog>);
  vi.mocked(dogsLib.useDeleteDog).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  } as unknown as ReturnType<typeof dogsLib.useDeleteDog>);
}

function renderLayoutAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/my/dogs/:id" element={<DogLayout />}>
              <Route index element={<p>OVERVIEW</p>} />
              <Route path="journal" element={<p>JOURNAL</p>} />
              <Route path="training" element={<p>TRAINING</p>} />
              <Route path="brief" element={<p>BRIEF</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setDog({
    dog: { id: "d1", name: "Biscuit", breed: "Aussie", size: "medium", sex: "female" },
  } as never);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("DogLayout", () => {
  it("renders the dog banner + 4 tabs + child route content", () => {
    renderLayoutAt("/my/dogs/d1");
    expect(screen.getByText("Biscuit")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Overview/i })).toHaveAttribute("href", "/my/dogs/d1");
    expect(screen.getByRole("link", { name: /Journal/i })).toHaveAttribute(
      "href",
      "/my/dogs/d1/journal",
    );
    expect(screen.getByRole("link", { name: /Training/i })).toHaveAttribute(
      "href",
      "/my/dogs/d1/training",
    );
    expect(screen.getByRole("link", { name: /Brief/i })).toHaveAttribute(
      "href",
      "/my/dogs/d1/brief",
    );
    expect(screen.getByText("OVERVIEW")).toBeInTheDocument();
  });

  it("highlights the active tab based on the URL", () => {
    renderLayoutAt("/my/dogs/d1/training");
    const trainingLink = screen.getByRole("link", { name: /Training/i });
    expect(trainingLink).toHaveAttribute("aria-current", "page");
    const overviewLink = screen.getByRole("link", { name: /Overview/i });
    expect(overviewLink).not.toHaveAttribute("aria-current", "page");
  });

  it("renders a 'not found' message when useDog returns isError", () => {
    setDog(null, { isError: true });
    renderLayoutAt("/my/dogs/missing");
    expect(screen.getByText(/couldn't find this dog/i)).toBeInTheDocument();
    expect(screen.queryByText("OVERVIEW")).not.toBeInTheDocument();
  });

  it("renders nothing visible while useDog is loading (no banner content)", () => {
    setDog(null, { isLoading: true });
    renderLayoutAt("/my/dogs/d1");
    expect(screen.queryByText("Biscuit")).not.toBeInTheDocument();
  });
});
