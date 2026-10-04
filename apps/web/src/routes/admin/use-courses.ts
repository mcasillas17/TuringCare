import { api } from "@/lib/api";
import type { Course } from "@/lib/courses";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CourseInput } from "@turingcare/shared";

// List (["courses", filters]) and detail (["course", id]) caches in lib/courses.
function invalidateCourses(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["courses"] });
  qc.invalidateQueries({ queryKey: ["course"] });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CourseInput) => {
      const res = await api.api.admin.courses.$post({ json: input });
      if (!res.ok) throw new Error("failed to create course");
      return ((await res.json()) as { course: Course }).course;
    },
    onSuccess: () => invalidateCourses(qc),
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
    onSuccess: () => invalidateCourses(qc),
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
    onSuccess: () => invalidateCourses(qc),
  });
}
