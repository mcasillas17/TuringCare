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
    activationRate: number;
    returningRate: number;
  };
  signups: { day: string; count: number }[];
  active: { day: string; count: number }[];
  funnel: { step: string; users: number }[];
  journeyTimes: {
    step: string;
    completed: number;
    medianMinutes: number | null;
    p90Minutes: number | null;
    within7DaysPct: number;
  }[];
  featureAdoption: { feature: string; users: number; events: number }[];
  topPages: { path: string; views: number; users: number }[];
  activityByDay: { day: string; category: string; count: number }[];
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
