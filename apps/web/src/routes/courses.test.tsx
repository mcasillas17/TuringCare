import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Courses } from "./courses";

function mockFetchOnce(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const sampleCourse = {
  id: "c1",
  organizationName: "Seattle Humane Dog Training Center",
  city: "Bellevue",
  state: "WA",
  name: "Puppy Manners 1",
  description: null,
  format: "group",
  ageGroup: "puppy",
  ageRange: null,
  durationWeeks: null,
  sessionMinutes: null,
  prerequisites: null,
  skillsTaught: [],
  isOnline: false,
  coursePageUrl: null,
};

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/my/courses"]}>
          <Routes>
            <Route path="/my/courses" element={<Courses />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("Courses", () => {
  it("renders a table row with the course name and provider", async () => {
    mockFetchOnce({ courses: [sampleCourse] });
    renderList();
    await waitFor(() => expect(screen.getByText("Puppy Manners 1")).toBeInTheDocument());
    expect(screen.getByText(/Seattle Humane Dog Training Center/)).toBeInTheDocument();
  });

  it("links the course cell to the detail page", async () => {
    mockFetchOnce({ courses: [sampleCourse] });
    renderList();
    const link = await screen.findByRole("link", { name: "Puppy Manners 1" });
    expect(link).toHaveAttribute("href", "/my/courses/c1");
  });

  it("renders the filter controls", async () => {
    mockFetchOnce({ courses: [sampleCourse] });
    renderList();
    await screen.findByText("Puppy Manners 1");
    expect(screen.getByText(/online only/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });

  it("shows the empty state when no courses exist", async () => {
    mockFetchOnce({ courses: [] });
    renderList();
    await waitFor(() => expect(screen.getByText(/no courses yet/i)).toBeInTheDocument());
  });
});
