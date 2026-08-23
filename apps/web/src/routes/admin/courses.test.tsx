import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

// Mock the typed hc<AppType> client. Each call returns an ok Response-like
// object with a json() resolving to the relevant payload.
const listCourses = vi.fn();
const createCourse = vi.fn();
const updateCourse = vi.fn();
const deleteCourse = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    api: {
      courses: {
        $get: (...args: unknown[]) => listCourses(...args),
      },
      admin: {
        courses: {
          $post: (...args: unknown[]) => createCourse(...args),
          ":id": {
            $put: (...args: unknown[]) => updateCourse(...args),
            $delete: (...args: unknown[]) => deleteCourse(...args),
          },
        },
      },
    },
  },
}));

import { AdminCourses } from "./courses";

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function setup(locale: "en" | "es" = "en") {
  localStorage.setItem("tc-locale", locale);
  listCourses.mockResolvedValue({ ok: true, json: async () => ({ courses: [] }) });
  createCourse.mockResolvedValue({
    ok: true,
    json: async () => ({ course: { id: "c1", name: "New Course" } }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter>
          <AdminCourses />
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

it("renders the course form fields", async () => {
  setup();
  expect(await screen.findByLabelText(/^organization$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/^format$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/^age group$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/skills taught/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /add course/i })).toBeInTheDocument();
});

it("submitting the form calls the create endpoint", async () => {
  const user = userEvent.setup();
  setup();
  await screen.findByLabelText(/^organization$/i);

  await user.type(screen.getByLabelText(/^organization$/i), "Seattle Humane");
  await user.type(screen.getByLabelText(/^city$/i), "Bellevue");
  await user.type(screen.getByLabelText(/^state$/i), "WA");
  await user.type(screen.getByLabelText(/^name$/i), "New Course");
  await user.click(screen.getByRole("button", { name: /add course/i }));

  await waitFor(() => expect(createCourse).toHaveBeenCalledTimes(1));
  const call = createCourse.mock.calls[0]?.[0] as { json: { name: string } };
  expect(call.json.name).toBe("New Course");
});

it("renders courses as a table", async () => {
  listCourses.mockResolvedValue({
    ok: true,
    json: async () => ({
      courses: [
        {
          id: "c1",
          organizationName: "Seattle Humane",
          city: "Bellevue",
          state: "WA",
          name: "Puppy Start Right",
          description: null,
          format: "group",
          ageGroup: "any",
          ageRange: null,
          durationWeeks: null,
          sessionMinutes: null,
          prerequisites: null,
          skillsTaught: [],
          isOnline: false,
          coursePageUrl: null,
        },
      ],
    }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter>
          <AdminCourses />
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("table")).toBeInTheDocument();
  expect(await screen.findByRole("cell", { name: "Puppy Start Right" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Seattle Humane" })).toBeInTheDocument();
});

it("renders course system copy in Spanish while preserving option values and records", async () => {
  listCourses.mockResolvedValue({
    ok: true,
    json: async () => ({
      courses: [
        {
          id: "c1",
          organizationName: "Seattle Humane",
          city: "Bellevue",
          state: "WA",
          name: "Puppy Start Right",
          description: null,
          format: "group",
          ageGroup: "any",
          ageRange: null,
          durationWeeks: null,
          sessionMinutes: null,
          prerequisites: null,
          skillsTaught: [],
          isOnline: false,
          coursePageUrl: null,
        },
      ],
    }),
  });
  createCourse.mockResolvedValue({
    ok: true,
    json: async () => ({ course: { id: "c2", name: "Nuevo" } }),
  });
  localStorage.setItem("tc-locale", "es");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter>
          <AdminCourses />
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole("heading", { level: 1, name: "Cursos" })).toBeInTheDocument();
  expect(screen.getByLabelText(/^organización$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/^formato$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/^edad$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/habilidades enseñadas/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Agregar curso" })).toBeInTheDocument();
  const groupOption = screen.getByRole("option", { name: "Clase grupal" });
  expect(groupOption).toHaveAttribute("value", "group");
  expect(await screen.findByRole("cell", { name: "Puppy Start Right" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Seattle Humane" })).toBeInTheDocument();
});
