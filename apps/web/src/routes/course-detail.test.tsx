import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseDetail } from "./course-detail";

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

const fullCourse = {
  id: "c1",
  organizationName: "Seattle Humane Dog Training Center",
  city: "Bellevue",
  state: "WA",
  name: "Puppy Manners 1",
  description: "A 6-week class for young puppies.",
  format: "group",
  ageGroup: "puppy",
  ageRange: "15-20 weeks",
  durationWeeks: 6,
  sessionMinutes: 60,
  prerequisites: "Dog Training Basics",
  skillsTaught: ["polite greetings", "basic skills"],
  isOnline: false,
  coursePageUrl: "https://example.com/course",
};

function renderDetail(course: unknown) {
  mockFetchOnce({ course });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/my/courses/c1"]}>
          <Routes>
            <Route path="/my/courses/:id" element={<CourseDetail />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("CourseDetail", () => {
  it("renders the overview, a skill, and prerequisites", async () => {
    renderDetail(fullCourse);
    await waitFor(() => expect(screen.getByText("Puppy Manners 1")).toBeInTheDocument());
    expect(screen.getByText("polite greetings")).toBeInTheDocument();
    expect(screen.getByText(/Dog Training Basics/)).toBeInTheDocument();
  });

  it("renders the course-page link with the url and target=_blank", async () => {
    renderDetail(fullCourse);
    const link = await screen.findByRole("link", { name: /view full details & register/i });
    expect(link).toHaveAttribute("href", "https://example.com/course");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("omits the course-page link when coursePageUrl is null", async () => {
    renderDetail({ ...fullCourse, coursePageUrl: null });
    await screen.findByText("Puppy Manners 1");
    expect(screen.queryByRole("link", { name: /view full details & register/i })).toBeNull();
  });

  it("has no contact/email action and no trainer link", async () => {
    renderDetail(fullCourse);
    await screen.findByText("Puppy Manners 1");
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(document.querySelector('a[href^="/my/trainers"]')).toBeNull();
  });
});
