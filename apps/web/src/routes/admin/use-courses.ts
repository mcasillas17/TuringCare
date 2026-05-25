import { api } from "@/lib/api";
import type { Course } from "@/lib/courses";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CourseInput } from "@turingcare/shared";

export type { Course };

const COURSES_KEY = ["admin", "courses"] as const;

export function useAdminCourses() {
  return useQuery({
    queryKey: COURSES_KEY,
    queryFn: async () => {
      const res = await api.api.courses.$get();
      if (!res.ok) throw new Error("failed to load courses");
      return ((await res.json()) as { courses: Course[] }).courses;
    },
  });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CourseInput) => {
      const res = await api.api.admin.courses.$post({ json: input });
      if (!res.ok) throw new Error("failed to create course");
      return ((await res.json()) as { course: Course }).course;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COURSES_KEY }),
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: CourseInput }) => {
      const res = await api.api.admin.courses[":id"].$put({ param: { id }, json: input });
      if (!res.ok) throw new Error("failed to update course");
      return ((await res.json()) as { course: Course }).course;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COURSES_KEY }),
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.admin.courses[":id"].$delete({ param: { id } });
      if (!res.ok) throw new Error("failed to delete course");
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COURSES_KEY }),
  });
}
