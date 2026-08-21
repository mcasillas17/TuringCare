import type { QueryClient } from "@tanstack/react-query";

export function invalidateTrainingSafetyData(queryClient: QueryClient, dogId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["suggestion", dogId] }),
    queryClient.invalidateQueries({ queryKey: ["focus", dogId] }),
    queryClient.invalidateQueries({ queryKey: ["contextual-progress", dogId] }),
  ]);
}
