import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export type Metrics = {
  rangeDays: number;
  kpis: {
    totalUsers: number;
    newUsers: number;
    dau: number;
    wau: number;
    mau: number;
    stickiness: number;
    eventCount: number;
  };
  signups: { day: string; count: number }[];
  active: { day: string; count: number }[];
  eventVolume: { name: string; count: number }[];
  funnel: { step: string; users: number }[];
  topPages: { path: string; count: number }[];
  eventsByDay: { day: string; name: string; count: number }[];
};

export type Activity = {
  items: { id: string; name: string; userId: string | null; createdAt: string; props: unknown }[];
};

export function useMetrics(days: number) {
  return useQuery({
    queryKey: ["admin", "metrics", days],
    queryFn: async () => {
      const res = await api.api.admin.metrics.$get({ query: { days: String(days) } });
      if (!res.ok) throw new Error("metrics failed");
      return (await res.json()) as Metrics;
    },
  });
}

export function useActivity() {
  return useQuery({
    queryKey: ["admin", "activity"],
    queryFn: async () => {
      const res = await api.api.admin.activity.$get();
      if (!res.ok) throw new Error("activity failed");
      return (await res.json()) as Activity;
    },
  });
}
