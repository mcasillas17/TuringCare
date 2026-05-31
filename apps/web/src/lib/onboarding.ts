import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

const o = api.api.onboarding;

export type OnboardingStatus = {
  hasDog: boolean;
  momentsCount: number;
  hasGoal: boolean;
  hasFinalizedBrief: boolean;
  hasSentBrief: boolean;
  mostRecentDogId: string | null;
};

export function useOnboardingStatus() {
  return useQuery({
    queryKey: ["onboarding"],
    staleTime: 10_000,
    queryFn: async (): Promise<OnboardingStatus> => {
      const res = await o.$get();
      if (!res.ok) throw new Error("load_failed");
      return await res.json();
    },
  });
}
