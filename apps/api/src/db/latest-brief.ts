/**
 * Resolve a query containing at most the two greatest Brief versions.
 * During the pre-0023 rollout window an old writer can leave two equal maxima;
 * no timestamp or status can prove which artifact was intended to be latest.
 */
export type LatestBriefResolution<T> =
  | { kind: "missing" }
  | { kind: "conflict" }
  | { kind: "found"; brief: T };

export function resolveLatestBriefRows<T extends { version: number }>(
  rows: readonly T[],
): LatestBriefResolution<T> {
  const latest = rows[0];
  if (!latest) return { kind: "missing" } as const;
  if (rows[1]?.version === latest.version) return { kind: "conflict" } as const;
  return { kind: "found", brief: latest } as const;
}

/**
 * Resolve independently keyed histories without choosing a duplicate maximum.
 * Callers do not need to rely on database row order: each group is sorted by
 * version before it is passed through the single-history resolver above.
 */
export function resolveLatestBriefRowsByKey<T extends { version: number }, K>(
  rows: readonly T[],
  keyOf: (row: T) => K,
): Map<K, LatestBriefResolution<T>> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }

  return new Map(
    [...grouped].map(([key, group]) => [
      key,
      resolveLatestBriefRows(group.toSorted((a, b) => b.version - a.version)),
    ]),
  );
}
