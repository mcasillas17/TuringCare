type BriefInput = {
  dog: { name: string; breed?: string | null; size: string; sex: string };
  concerns: { concern: string; severity: string }[];
  goals: { goal: string }[];
  entries: { behavior: string; intensity: number; occurredAt: string }[];
};

export function composeBrief(i: BriefInput): string {
  const { dog, concerns, goals, entries } = i;
  const lines: string[] = [];
  lines.push(`Behavior Brief — ${dog.name}`);
  lines.push(`${dog.name} is a ${dog.size} ${dog.sex}${dog.breed ? ` ${dog.breed}` : ""}.`);
  lines.push("");
  lines.push("Concerns:");
  lines.push(
    concerns.length
      ? concerns.map((c) => `- ${c.concern} (${c.severity})`).join("\n")
      : "- none recorded",
  );
  lines.push("");
  lines.push("Goals:");
  lines.push(goals.length ? goals.map((g) => `- ${g.goal}`).join("\n") : "- none recorded");
  lines.push("");
  const sorted = [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const avg = entries.length
    ? (entries.reduce((s, e) => s + e.intensity, 0) / entries.length).toFixed(1)
    : "0.0";
  lines.push(
    `Journal: ${entries.length} journal ${entries.length === 1 ? "entry" : "entries"}, average intensity ${avg}.`,
  );
  for (const e of sorted.slice(0, 5)) {
    lines.push(`- ${e.occurredAt.slice(0, 10)}: ${e.behavior} (intensity ${e.intensity})`);
  }
  return lines.join("\n");
}
