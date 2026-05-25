import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export type Course = {
  id: string;
  organizationName: string;
  city: string;
  state: string;
  name: string;
  description: string | null;
  format: string;
  ageGroup: string;
  ageRange: string | null;
  durationWeeks: number | null;
  sessionMinutes: number | null;
  prerequisites: string | null;
  skillsTaught: string[];
  isOnline: boolean;
  coursePageUrl: string | null;
};

export type CourseFilters = {
  ageGroup?: string;
  format?: string;
  state?: string;
  online?: boolean;
};

export function useCourses(filters: CourseFilters) {
  return useQuery({
    queryKey: ["courses", filters],
    queryFn: async () => {
      const res = await api.api.courses.$get({
        query: {
          ageGroup: filters.ageGroup || undefined,
          format: filters.format || undefined,
          state: filters.state || undefined,
          online: filters.online ? "true" : undefined,
        },
      });
      if (!res.ok) throw new Error("load_failed");
      return ((await res.json()) as { courses: Course[] }).courses;
    },
  });
}

export function useCourse(id: string) {
  return useQuery({
    queryKey: ["course", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await api.api.courses[":id"].$get({ param: { id } });
      if (!res.ok) throw new Error("load_failed");
      return ((await res.json()) as { course: Course }).course;
    },
  });
}
