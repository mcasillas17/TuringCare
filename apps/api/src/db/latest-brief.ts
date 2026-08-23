/**
 * Resolve a query containing at most the two greatest Brief versions.
 * During the pre-0014 rollout window an old writer can leave two equal maxima;
 * no timestamp or status can prove which artifact was intended to be latest.
 */
export function resolveLatestBriefRows<T extends { version: number }>(rows: readonly T[]) {
  const latest = rows[0];
  if (!latest) return { kind: "missing" } as const;
  if (rows[1]?.version === latest.version) return { kind: "conflict" } as const;
  return { kind: "found", brief: latest } as const;
}
