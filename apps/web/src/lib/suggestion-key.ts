export function suggestionKey(dogId: string, weekKey: string) {
  return ["suggestion", dogId, weekKey] as const;
}
