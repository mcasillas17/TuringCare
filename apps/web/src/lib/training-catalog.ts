import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CatalogSkill, CatalogTemplate } from "@turingcare/shared";
import { api } from "./api";

const training = api.api.training;

export function useTrainingCatalog() {
  return useQuery({
    queryKey: ["training-catalog"],
    staleTime: 60 * 60 * 1000, // catalog rarely changes
    queryFn: async (): Promise<CatalogTemplate[]> => {
      const res = await training.templates.$get();
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).templates;
    },
  });
}

export function findCatalogTemplate(
  catalog: CatalogTemplate[] | undefined,
  templateKey: string | null,
): CatalogTemplate | null {
  if (!catalog || !templateKey) return null;
  return catalog.find((t) => t.key === templateKey) ?? null;
}

export function findCatalogSkill(
  catalog: CatalogTemplate[] | undefined,
  skillKey: string | null,
): CatalogSkill | null {
  if (!catalog || !skillKey) return null;
  for (const template of catalog) {
    const found = template.skills.find((s) => s.key === skillKey);
    if (found) return found;
  }
  return null;
}

export function useApplyTemplate(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateKey: string) => {
      // POST /:id/goals/from-template parses its body manually (no zValidator)
      // so the typed hc client doesn't expose a `json:` input. Raw fetch is
      // the intentional fallback; the route's manual parse preserves the
      // 404-before-400 ownership-check ordering established in PR #38.
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ""}/api/dogs/${dogId}/goals/from-template`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateKey }),
        },
      );
      if (!res.ok) throw new Error("apply_failed");
      return await res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dogs", dogId] });
      qc.invalidateQueries({ queryKey: ["progress", dogId] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });
}
